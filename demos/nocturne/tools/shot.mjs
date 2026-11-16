#!/usr/bin/env node
// Screenshots for the Nocturne agents.
//   node tools/shot.mjs <slot>     e.g. 05-Rooms (or 05, rooms): that section at 1440 and 390 px wide
//   node tools/shot.mjs page       the whole page as 1440x900 and 390x844 slices (max 8 each)
// Shots run one at a time across all agents (a lock file); if another shot is running this prints
// "waiting" and waits. The Liveswarm overlay is hidden, and WebGL is switched off for every slot
// except the sky and the hero, so twelve agents do not start twelve GPU scenes.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire(path.resolve(root, '../../liveswarm/demo-app/package.json'));
const { chromium } = require('playwright');

const URL_ = process.env.NOCTURNE_URL || 'http://127.0.0.1:5175/';
const SLOTS = {
  '01-nav': 'nav#nav', '02-herosky': 'header.hero', '03-herotitle': 'header.hero', '04-arrival': '#arrival',
  '05-rooms': '#rooms', '06-starprogram': '#stars', '07-dining': '#dining', '08-rituals': '#rituals',
  '09-thedrive': '#drive', '10-fieldnotes': '#notes', '11-booking': '#booking', '12-footer': 'footer#footer',
};
const arg = String(process.argv[2] || '').toLowerCase();
if (!arg) { console.error('usage: node tools/shot.mjs <slot id, e.g. 05-Rooms> | page'); process.exit(2); }
let key = null;
if (arg !== 'page') {
  key = Object.keys(SLOTS).find((k) => k === arg || k.startsWith(arg + '-') || k.slice(3) === arg || k.slice(0, 2) === arg);
  if (!key) { console.error(`unknown slot "${process.argv[2]}". Known: ${Object.keys(SLOTS).join(', ')}, page`); process.exit(2); }
}

const outDir = path.join(root, 'shots');
fs.mkdirSync(outDir, { recursive: true });
const lock = path.join(outDir, '.lock');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function acquire() {
  const t0 = Date.now(); let told = false;
  for (;;) {
    try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx' }); return; } catch {}
    const holder = Number(fs.readFileSync(lock, 'utf8') || 0);
    if (!holder || !alive(holder)) { try { fs.unlinkSync(lock); } catch {} continue; }
    if (!told) { console.log('waiting: another screenshot is running; this one is queued'); told = true; }
    if (Date.now() - t0 > 240000) { console.error('gave up after 4 minutes in the queue'); process.exit(1); }
    await new Promise((r) => setTimeout(r, 700));
  }
}
const release = () => { try { if (fs.readFileSync(lock, 'utf8') === String(process.pid)) fs.unlinkSync(lock); } catch {} };
process.on('exit', release);
process.on('SIGINT', () => process.exit(130));

await acquire();
const keepGL = arg === 'page' || key === '02-herosky' || key === '03-herotitle';
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'] });
const written = [];
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    // Agents judge their section, not the cursors: never load the Liveswarm overlay in these shots.
    await page.route(/\/overlay\.js(\?|$)/, (r) => r.abort());
    await page.addInitScript((keepGL) => {
      if (!keepGL) {
        const orig = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
          return /webgl/i.test(String(type)) ? null : orig.call(this, type, ...rest);
        };
      }
      const hide = () => { const s = document.createElement('style'); s.textContent = 'liveswarm-overlay{display:none!important}'; document.documentElement.appendChild(s); };
      if (document.documentElement) hide(); else addEventListener('DOMContentLoaded', hide);
    }, keepGL);
    await page.goto(URL_, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(900);
    const tag = String(w);
    if (arg === 'page') {
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      const n = Math.min(8, Math.ceil(total / h));
      for (let i = 0; i < n; i++) {
        await page.evaluate((y) => window.scrollTo(0, y), Math.round((i * (total - h)) / Math.max(1, n - 1)));
        await page.waitForTimeout(1100);
        const p = path.join(outDir, `page-${tag}-${String(i + 1).padStart(2, '0')}.png`);
        await page.screenshot({ path: p });
        written.push(p);
      }
    } else {
      const loc = page.locator(SLOTS[key]).first();
      await loc.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1300); // let scroll-in reveals finish
      const p = path.join(outDir, `${key}-${tag}.png`);
      const box = await loc.boundingBox();
      if (!box || box.height < 2) { console.log(`note: ${SLOTS[key]} is empty or not rendered at ${w}px`); }
      await loc.screenshot({ path: p });
      written.push(p);
    }
    await page.close();
  }
} finally {
  await browser.close();
  release();
}
console.log(written.map((p) => path.relative(root, p)).join('\n'));
