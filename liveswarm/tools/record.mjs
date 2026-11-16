#!/usr/bin/env node
// Records a live Liveswarm session in a vertical browser window and exports an MP4.
//
//   node tools/record.mjs [--url http://127.0.0.1:5173/] [--out media/run.mp4]
//                         [--size 540x960] [--max 300] [--tail 5] [--no-follow]
//
// Start this BEFORE the Claude Code session. It records until the conductor reports
// session.end (plus --tail seconds) or until --max seconds pass, then converts the
// WebM to H.264 MP4 with the system ffmpeg. The "follow camera" scrolls the page to
// the section an agent is about to edit so the landing is on screen. It only scrolls
// the recording browser, never the user's own tab.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../demo-app/package.json'));
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const flag = (name) => argv.includes('--' + name);
const url = opt('url', 'http://127.0.0.1:5173/');
const out = path.resolve(opt('out', path.join(here, '../media/run.mp4')));
const [W, H] = opt('size', '540x960').split('x').map(Number);
const maxS = Number(opt('max', '300'));
const tailS = Number(opt('tail', '5'));
const follow = !flag('no-follow');
const conductor = process.env.LIVESWARM_CONDUCTOR || `http://127.0.0.1:${process.env.LIVESWARM_PORT || 7777}`;

fs.mkdirSync(path.dirname(out), { recursive: true });
const videoDir = fs.mkdtempSync(path.join(path.dirname(out), '.rec-'));

const browser = await chromium.launch({ channel: 'chrome' });
// Playwright records video in CSS pixels, so record at 1x and upscale 2x with ffmpeg below
// (a 2x deviceScaleFactor would only fill the top-left quarter of a 2x-sized video).
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: videoDir, size: { width: W, height: H } } });
const page = await ctx.newPage();

if (follow) {
  // In-page camera: listens to the same conductor stream as the overlay and scrolls the
  // target component into view when an edit starts (Pre) or lands (Post).
  await page.addInitScript((conductor) => {
    const base = (f) => String(f || '').split('/').pop();
    let lastScroll = 0;
    function tagsFor(file) {
      const out = [];
      document.querySelectorAll('[data-swarm],[data-swarm-site]').forEach((el) => {
        for (const attr of ['data-swarm', 'data-swarm-site']) {
          const v = el.getAttribute(attr); if (!v) continue;
          const m = v.match(/^(.*):(\d+)-(\d+)$/); if (!m) continue;
          if (file === m[1] || file.endsWith('/' + m[1])) out.push({ el, s: +m[2], e: +m[3] });
        }
      });
      return out;
    }
    function frame(file, range) {
      const tags = tagsFor(file).filter((t) => t.el.getClientRects().length);
      if (!tags.length) return;
      let pick = null;
      if (range) {
        const hit = tags.filter((t) => t.e >= range[0] && t.s <= range[1]);
        hit.sort((a, b) => (a.e - a.s) - (b.e - b.s));
        pick = hit[0];
      }
      if (!pick) { tags.sort((a, b) => (b.e - b.s) - (a.e - a.s)); pick = tags[0]; }
      const r = pick.el.getBoundingClientRect();
      const vh = innerHeight;
      if (r.top >= vh * 0.12 && r.bottom <= vh * 0.88) return; // already comfortably visible
      const now = Date.now(); if (now - lastScroll < 900) return; lastScroll = now;
      const y = scrollY + r.top - Math.max(80, (vh - Math.min(r.height, vh * 0.7)) / 2);
      scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
    function connect() {
      const es = new EventSource(conductor + '/stream');
      es.addEventListener('swarm', (m) => {
        let ev; try { ev = JSON.parse(m.data); } catch { return; }
        if (!ev.file || !/^(Edit|MultiEdit|Write)$/.test(ev.tool || '')) return;
        if (/\.(css|scss|less)$/i.test(ev.file)) return; // styles: keep the camera still
        if (ev.kind === 'tool.pre') frame(ev.file, null);
        else if (ev.kind === 'tool.post') setTimeout(() => frame(ev.file, ev.range), 350);
        console.log('[camera]', ev.kind, base(ev.file));
      });
      es.onerror = () => {};
    }
    addEventListener('DOMContentLoaded', connect);
  }, conductor);
}

await page.goto(url, { waitUntil: 'load' });
console.log(`[record] recording ${url} at ${W}x${H} -> ${out}`);

// Watch the conductor stream from Node to know when the session ends.
let ended = false, sawSession = false;
const ac = new AbortController();
(async () => {
  try {
    const res = await fetch(conductor + '/stream', { signal: ac.signal });
    const dec = new TextDecoder(); let buf = '';
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const line = block.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        let ev; try { ev = JSON.parse(line.slice(6)); } catch { continue; }
        if (ev.kind === 'session.start') { sawSession = true; console.log('[record] session started'); }
        if (ev.kind === 'session.end' && sawSession) { ended = true; console.log('[record] session ended'); }
      }
    }
  } catch { /* aborted */ }
})();

const t0 = Date.now();
while (!ended && Date.now() - t0 < maxS * 1000) await new Promise((r) => setTimeout(r, 250));
await new Promise((r) => setTimeout(r, tailS * 1000));
ac.abort();

const video = page.video();
await ctx.close();
await browser.close();
const webm = await video.path();
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', `scale=${W * 2}:${H * 2}:flags=lanczos`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', out], { stdio: 'inherit' });
if (r.status === 0) { fs.rmSync(videoDir, { recursive: true, force: true }); console.log('[record] wrote', out); }
else console.log('[record] ffmpeg failed; raw WebM kept at', webm);
