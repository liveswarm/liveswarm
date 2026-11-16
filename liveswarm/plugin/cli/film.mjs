#!/usr/bin/env node
// Liveswarm film recorder. START THIS BEFORE THE CLAUDE SESSION: the conductor does not replay
// history on /stream, so a SessionStart posted before the stream connects is never seen.
// Normally run through `liveswarm record` (which resolves playwright-core and passes it in LIVESWARM_PW).
// Usage: node film.mjs --url http://127.0.0.1:7780/ --name liveswarm [--max 2400] [--tail 6]
//   [--wait-start 600] [--idle 300] [--out-dir DIR] [--target 58] [--keep-raw] [--no-follow]
// Ctrl-C / SIGTERM finalises whatever was captured (if a session started); a second one aborts.
// Liveswarm film recorder: dual capture (vertical + wide), smart timelapse, end card.
//
//   node film.mjs --url http://127.0.0.1:7780/ --name liveswarm
//        [--max 2400] [--tail 6] [--out-dir ./liveswarm-videos] [--target 58] [--keep-raw] [--no-follow]
//
// Start this BEFORE the Claude Code session. It records both formats at once until the conductor
// reports session.end (plus --tail seconds) or --max seconds pass. Every conductor event is logged
// with its wall-clock offset; the log drives a time map (1x first agent split, ~4x dense edits,
// ~24x quiet stretches, 1x finished page) that ffmpeg applies identically to both formats.
// Outputs: <name>-vertical.mp4 (1080x1920), <name>-wide.mp4 (1920x1080), <name>-timeline.json.
// Both videos carry a small "Made with Liveswarm" corner mark (a transparent PNG rendered with Chrome).
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const loadPlaywright = () => {
  const tries = [process.env.LIVESWARM_PW, createRequire(path.join(process.cwd(), 'noop.js')).resolve.bind(null, 'playwright-core')];
  for (const t of tries) {
    try { return createRequire(import.meta.url)(typeof t === 'function' ? t() : t); } catch {}
  }
  console.error('[film] ERROR: playwright-core not found. Run `liveswarm record` (it offers to install it) or set LIVESWARM_PW.');
  process.exit(1);
};
const { chromium } = loadPlaywright();
if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
  console.error('[film] ERROR: ffmpeg not found.' + (process.platform === 'darwin' ? ' Install it with: brew install ffmpeg' : ' Install ffmpeg and put it on PATH.'));
  process.exit(1);
}

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const url = opt('url', 'http://127.0.0.1:7780/');
const name = opt('name', 'liveswarm');
const maxS = Number(opt('max', '2400'));
const tailS = Number(opt('tail', '6'));
const targetS = Number(opt('target', '58'));
const outDir = path.resolve(opt('out-dir', 'liveswarm-videos'));
const waitStartS = Number(opt('wait-start', '600'));   // abort if no session.start within this many seconds
const idleS = Number(opt('idle', '300'));              // finalise if no events for this long after session.start
const follow = !flag('no-follow');
const heroLockS = Number(opt('hero-lock', '75'));   // seconds the camera holds on the hero after the first agent starts
const dwellS = Number(opt('dwell', '12'));          // minimum seconds on a section before the camera moves
const finaleS = Number(opt('finale', '14'));        // length of the closing pan over the finished page (0 = none)
const conductor = process.env.LIVESWARM_CONDUCTOR || `http://127.0.0.1:${process.env.LIVESWARM_PORT || 7777}`;
const FPS = 30;

const FORMATS = [
  { id: 'vertical', vw: 540, vh: 960, outW: 1080, outH: 1920 },   // record 540x960, upscale 2x lanczos
  { id: 'wide', vw: 1920, vh: 1080, outW: 1920, outH: 1080 },     // native
];

let work = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[film]', ...a);

// ---------------------------------------------------------------- director camera (in page)
// Opening: hold on the hero while the first agents work (heroLockMs after the first agent.start).
// Middle: follow the newest edit, but stay at least dwellMs on a section so the sped-up film never
// flickers between sections. Stylesheets count for the component next to them (Rooms.css -> Rooms.jsx).
// Finale: window.__filmFinale(ms) jumps to the top, holds, then pans slowly to the bottom of the page.
function cameraScript(cfg) {
  const { conductor, heroLockMs, dwellMs } = cfg;
  const base = (f) => String(f || '').split('/').pop();
  const CSS = /\.(css|scss|sass|less|styl|pcss)$/i, CODE = /\.(jsx|tsx|js|ts)$/;
  let lastMove = 0, lockUntil = 0, finale = false;
  const recent = [];               // recent edits: { file, range, t }
  const visited = new Map();       // section element -> last time the camera showed it
  function sectionFor(file) {
    // the largest tagged element of the edited file (a stylesheet counts for the component beside it)
    const stem = file.replace(/(\.module)?\.(css|scss|sass|less|styl|pcss)$/i, '');
    let best = null, bestSpan = -1;
    document.querySelectorAll('[data-swarm]').forEach((el) => {
      const m = el.getAttribute('data-swarm').match(/^(.*):(\d+)-(\d+)$/); if (!m) return;
      const rel = m[1];
      const hit = CSS.test(file) ? CODE.test(rel) && (stem === rel.replace(CODE, '') || stem.endsWith('/' + rel.replace(CODE, '')))
                                 : (file === rel || file.endsWith('/' + rel));
      if (!hit || !el.getClientRects().length) return;
      const span = +m[3] - +m[2];
      if (span > bestSpan) { best = el; bestSpan = span; }
    });
    return best;
  }
  function framed(el) { const r = el.getBoundingClientRect(), vh = innerHeight; return r.top >= -vh * 0.15 && r.top <= vh * 0.45; }
  function decide() {
    if (finale) return;
    const now = Date.now();
    if (!lockUntil) return;                                          // nothing has started yet
    if (now < lockUntil) { if (scrollY > 2) scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (now - lastMove < dwellMs) return;
    while (recent.length && now - recent[0].t > 12000) recent.shift();
    const cands = [];
    for (const e of recent) { const el = sectionFor(e.file); if (el && !cands.includes(el)) cands.push(el); }
    if (!cands.length) return;
    cands.sort((a, b) => (visited.get(a) || 0) - (visited.get(b) || 0));  // least recently shown first
    const el = cands[0];
    visited.set(el, now);
    if (framed(el)) return;
    lastMove = now;
    const r = el.getBoundingClientRect();
    scrollTo({ top: Math.max(0, scrollY + r.top - Math.max(56, innerHeight * 0.08)), behavior: 'smooth' });
  }
  setInterval(decide, 700);
  window.__filmFinale = (ms) => new Promise((resolve) => {
    finale = true;
    document.documentElement.style.scrollBehavior = 'auto';
    scrollTo({ top: 0, behavior: 'instant' });
    setTimeout(() => {
      const to = Math.max(0, document.documentElement.scrollHeight - innerHeight), t0 = performance.now();
      const ease = (x) => 0.5 - Math.cos(Math.PI * x) / 2;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        scrollTo({ top: to * ease(k), behavior: 'instant' });
        if (k < 1) requestAnimationFrame(step); else setTimeout(resolve, 1600);
      };
      requestAnimationFrame(step);
    }, 1800);
  });
  function connect() {
    const es = new EventSource(conductor + '/stream');
    es.addEventListener('swarm', (m) => {
      let ev; try { ev = JSON.parse(m.data); } catch { return; }
      if (ev.kind === 'agent.start' && !lockUntil) lockUntil = Date.now() + heroLockMs;
      if (ev.kind !== 'tool.post' || !ev.file || !/^(Edit|MultiEdit|Write)$/.test(ev.tool || '')) return;
      recent.push({ file: ev.file, range: ev.range, t: Date.now() });
      if (recent.length > 40) recent.shift();
      console.log('[camera]', ev.kind, base(ev.file));
    });
    es.onerror = () => {};
  }
  addEventListener('DOMContentLoaded', connect);
}

// ---------------------------------------------------------------- capture
// ---- pre-flight: conductor must be reachable ----
try {
  const r = await fetch(conductor + '/health', { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
} catch (e) {
  console.error(`[film] ERROR: conductor not reachable at ${conductor}/health (${e.message}). Start it, or set LIVESWARM_PORT / LIVESWARM_CONDUCTOR.`);
  process.exit(1);
}

const T0 = Date.now();
const events = [];
let ended = false, sawSession = false, sessionStartTs = null, sessionEndTs = null, lastEventAt = Date.now();
const ac = new AbortController();
let stopReq = false, sigCount = 0, browser = null, failed = false;
const rec = [];

// stream starts BEFORE Chrome launches so an early SessionStart is not missed
const streamDone = (async () => {
  while (!ac.signal.aborted) {
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
          if (ev.kind === 'hello') continue;
          const t = (Date.now() - T0) / 1000;
          lastEventAt = Date.now();
          if (ev.kind === 'session.start' && !sawSession) { sawSession = true; sessionStartTs = ev.ts; log(`session started at +${t.toFixed(1)}s`); }
          events.push({
            t: Math.round(t * 1000) / 1000, seq: ev.seq, ts: ev.ts, kind: ev.kind,
            agent: ev.agent ? { id: ev.agent.id, label: ev.agent.label, parent: ev.agent.parent ?? null } : undefined,
            tool: ev.tool, file: ev.file ? String(ev.file).split('/').pop() : undefined,
            range: ev.range, added: ev.added, removed: ev.removed, summary: ev.summary,
          });
          if (ev.kind === 'session.end' && sawSession) { ended = true; sessionEndTs = ev.ts; log(`session ended at +${t.toFixed(1)}s`); }
        }
      }
    } catch (e) { if (ac.signal.aborted) break; }
    if (!ac.signal.aborted) await sleep(500);
  }
})();

const onSig = (sig) => {
  sigCount++;
  if (sigCount === 1) { log(`${sig} received: finalising what was captured (send again to abort)`); stopReq = true; }
  else { console.error('[film] aborting'); ac.abort(); process.exit(130); }
};
process.on('SIGINT', () => onSig('SIGINT'));
process.on('SIGTERM', () => onSig('SIGTERM'));

const closeAll = async () => {
  for (const r of rec) { try { await r.ctx.close(); } catch {} }
  if (browser) { try { await browser.close(); } catch {} browser = null; }
};

let closeWall = 0, finaleAt = null;
try {
  log('*** START THIS BEFORE THE CLAUDE SESSION: no history is replayed. Waiting for session.start... ***');
  fs.mkdirSync(outDir, { recursive: true });
  work = fs.mkdtempSync(path.join(outDir, '.film-'));
  browser = await chromium.launch({ channel: 'chrome' });
  for (const f of FORMATS) {
    const dir = path.join(work, f.id);
    const ctx = await browser.newContext({
      viewport: { width: f.vw, height: f.vh }, deviceScaleFactor: 1,   // CSS px == video px; never DSF 2
      recordVideo: { dir, size: { width: f.vw, height: f.vh } },
    });
    if (follow) await ctx.addInitScript(cameraScript, { conductor, heroLockMs: heroLockS * 1000, dwellMs: dwellS * 1000 });
    const startWall = Date.now();
    const page = await ctx.newPage();
    rec.push({ f, ctx, page, startWall });
  }
  try {
    await Promise.all(rec.map(({ page }) => page.goto(url, { waitUntil: 'load', timeout: 30000 })));
  } catch (e) {
    throw Object.assign(new Error(`cannot load ${url}: ${String(e.message).split('\n')[0]}. Is the app running?`), { fatal: true });
  }
  log(`recording ${url}: vertical 540x960 (->1080x1920) + wide 1920x1080`);

  let warned = false;
  const tStart = Date.now();
  while (!stopReq && !ended) {
    const el = (Date.now() - tStart) / 1000;
    if (el >= maxS) { log(`--max ${maxS}s reached`); break; }
    if (!sawSession) {
      if (!warned && el > 60) { warned = true; console.error('[film] WARNING: no session.start after 60 s. Was the Claude session started before film.mjs? SessionStart events are not replayed.'); }
      if (el > waitStartS) throw Object.assign(new Error(`no session.start within ${waitStartS}s`), { fatal: true });
    } else if ((Date.now() - lastEventAt) / 1000 > idleS) { log(`no events for ${idleS}s: finalising`); break; }
    await sleep(250);
  }
  if (!sawSession) throw Object.assign(new Error('stopped before any session.start was seen; nothing worth filming'), { fatal: true });
  if (!stopReq && follow && finaleS > 0) {
    finaleAt = (Date.now() - T0) / 1000;
    log(`finale: ${finaleS}s pan over the finished page`);
    await Promise.all(rec.map(({ page }) => page.evaluate((ms) => window.__filmFinale ? window.__filmFinale(ms) : null, finaleS * 1000).catch(() => {})));
  }
  if (!stopReq) await sleep(tailS * 1000);
  closeWall = Date.now();
  for (const r of rec) r.video = r.page.video();
  for (const r of rec) await r.ctx.close();
  await browser.close(); browser = null;
} catch (e) {
  failed = true;
  console.error(`[film] ERROR: ${e.message}`);
  await closeAll();
  ac.abort();
  await streamDone.catch(() => {});
  if (work) {
    const empty = e.fatal && !fs.readdirSync(work).some((n) => fs.existsSync(path.join(work, n)) && fs.readdirSync(path.join(work, n)).length);
    if (e.fatal && (empty || !sawSession)) { fs.rmSync(work, { recursive: true, force: true }); }
    else console.error(`[film] raw files kept in ${work}`);
  }
  process.exit(1);
}
ac.abort();
await streamDone.catch(() => {});
for (const r of rec) r.webm = await r.video.path();
const run = (cmd, args, label) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) { console.error(`[film] ${label || cmd} failed:\n${(r.stderr || '').split('\n').slice(-25).join('\n')}`); throw new Error(label || cmd); }
  return r.stdout;
};
const probeDur = (file) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], 'ffprobe').trim());

// ---------------------------------------------------------------- stats (real numbers only)
const agentIds = new Set(events.filter((e) => e.kind === 'agent.start' && e.agent && e.agent.id !== 'main').map((e) => e.agent.id));
const stats = {};
if (agentIds.size > 0) stats.agents = agentIds.size + 1;   // omit a lone main agent ("1 agent" is not a flex)
const nEdits = events.filter((e) => e.kind === 'tool.post' && /^(Edit|MultiEdit|Write)$/.test(e.tool || '')).length;
if (nEdits > 0) stats.edits = nEdits;
if (sessionStartTs != null && sessionEndTs != null && sessionEndTs > sessionStartTs) stats.seconds = Math.round((sessionEndTs - sessionStartTs) / 1000);
log('stats', JSON.stringify(stats));

// ---------------------------------------------------------------- time map (common clock = seconds since T0)
const D = (closeWall - T0) / 1000;           // common-clock end
const BIN = 0.5;
const evT = events.map((e) => e.t).sort((a, b) => a - b);
const heavy = events.filter((e) => e.kind.startsWith('agent.') || (/^tool\./.test(e.kind) && /^(Edit|MultiEdit|Write)$/.test(e.tool || ''))).map((e) => e.t);

const protectedRanges = [];
const starts = events.filter((e) => e.kind === 'agent.start' && e.agent && e.agent.id !== 'main').map((e) => e.t).sort((a, b) => a - b);
if (starts.length) {
  let last = starts[0];
  for (const s of starts) { if (s - last <= 5 && s - starts[0] <= 15) last = s; else if (s - last > 5) break; }
  protectedRanges.push([Math.max(0, starts[0] - 1), Math.min(D, last + 3)]);
}
const tailStart = Math.max(0, D - tailS);
protectedRanges.push([tailStart, D]);
if (finaleAt != null) protectedRanges.push([Math.max(0, finaleAt - 0.3), D]);   // the closing pan plays at 1x

// quiet intervals: >4 s with no events (kept 0.75 s away from events on each side)
const quiet = [];
{
  const pts = [0, ...evT, D];
  for (let i = 0; i + 1 < pts.length; i++) {
    if (pts[i + 1] - pts[i] > 4) quiet.push([pts[i] + (i === 0 ? 0 : 0.75), pts[i + 1] - (i + 2 === pts.length ? 0 : 0.75)]);
  }
}
const inR = (t, rs) => rs.some(([a, b]) => t >= a && t < b);
const BASE = { dense: 4, sparse: 8, quiet: 24, one: 1 };
const nb = Math.ceil(D / BIN);
let bins = [];
for (let i = 0; i < nb; i++) {
  const c = i * BIN + BIN / 2;
  let cls;
  if (inR(c, protectedRanges)) cls = 'one';
  else if (inR(c, quiet)) cls = 'quiet';
  else cls = heavy.filter((t) => t >= c - 1 && t < c + 2).length >= 3 ? 'dense' : 'sparse';
  bins.push(cls);
}
let runs = [];
for (let i = 0; i < nb; i++) {
  const a = i * BIN, b = Math.min(D, (i + 1) * BIN);
  if (runs.length && runs[runs.length - 1].cls === bins[i]) runs[runs.length - 1].b = b;
  else runs.push({ cls: bins[i], a, b });
}
// absorb short non-protected runs (< 2 s): they take the most active class among themselves and their
// neighbours (so a blip of edits is never squashed at quiet speed), then equal neighbours merge
const RANK = { quiet: 0, sparse: 1, dense: 2, one: 3 };
const mergeSame = () => { for (let j = runs.length - 1; j > 0; j--) if (runs[j].cls === runs[j - 1].cls) { runs[j - 1].b = runs[j].b; runs[j - 1].fixed = false; runs.splice(j, 1); } };
for (let go = true; go;) {
  go = false;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    if (r.cls === 'one' || r.fixed || r.b - r.a >= 2) continue;
    let cls = r.cls;
    for (const n of [runs[i - 1], runs[i + 1]]) if (n && n.cls !== 'one' && RANK[n.cls] > RANK[cls]) cls = n.cls;
    r.cls = cls; r.fixed = true; mergeSame(); go = true; break;
  }
}
const clampF = (x) => Math.min(300, Math.max(1, x));
const totalAt = (k) => runs.reduce((s, r) => s + (r.b - r.a) / (r.cls === 'one' ? 1 : clampF(BASE[r.cls] * k)), 0);
let lo = 0.01, hi = 1000;
for (let i = 0; i < 60; i++) { const mid = Math.sqrt(lo * hi); if (totalAt(mid) > targetS) lo = mid; else hi = mid; }
const k = Math.sqrt(lo * hi);
for (const r of runs) { r.factor = r.cls === 'one' ? 1 : Math.round(clampF(BASE[r.cls] * k) * 100) / 100; r.frames = Math.max(1, Math.round(((r.b - r.a) / r.factor) * FPS)); r.outDur = r.frames / FPS; }
const bodyDur = runs.reduce((s, r) => s + r.outDur, 0);
if (D < targetS + 5) log(`note: recording (${D.toFixed(0)}s) is close to the ${targetS}s target, so little or no speed-up is applied (factors never go below 1x)`);
log(`session ${D.toFixed(1)}s -> timelapse ${bodyDur.toFixed(1)}s (+3s end card), ${runs.length} segments`);
for (const r of runs) log(`  ${r.a.toFixed(1).padStart(7)}-${r.b.toFixed(1).padStart(7)}s  ${r.cls.padEnd(6)} x${r.factor}  -> ${r.outDur.toFixed(2)}s`);

// ---------------------------------------------------------------- end card still
const mkEndcard = async (f, outPng) => {
  const b = await chromium.launch({ channel: 'chrome' });
  const pg = await b.newPage({ viewport: { width: f.outW, height: f.outH }, deviceScaleFactor: 1 });
  const q = new URLSearchParams();
  for (const [kk, v] of Object.entries(stats)) q.set(kk, String(v));
  await pg.goto(pathToFileURL(path.join(here, 'endcard.html')).href + '?' + q.toString());
  await pg.evaluate(() => document.fonts && document.fonts.ready);
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: outPng });
  await b.close();
};

// ---------------------------------------------------------------- corner mark (transparent PNG)
const mkMark = async (f, outPng) => {
  const u = Math.min(f.outW, f.outH) / 1080;   // 1 on both formats
  const b = await chromium.launch({ channel: 'chrome' });
  const pg = await b.newPage({ viewport: { width: Math.ceil(330 * u), height: Math.ceil(56 * u) }, deviceScaleFactor: 1 });
  await pg.setContent(`<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;background:transparent}
    .m{display:inline-flex;align-items:center;gap:${10 * u}px;height:${44 * u}px;padding:0 ${18 * u}px;margin:${6 * u}px;border-radius:${22 * u}px;
       background:rgba(10,10,14,.55);color:rgba(255,255,255,.92);font:500 ${21 * u}px/1 "SF Pro Display",-apple-system,"Inter","Helvetica Neue",system-ui,sans-serif;letter-spacing:.02em;white-space:nowrap}
    svg{width:${18 * u}px;height:${18 * u}px}
  </style><div class="m"><svg viewBox="0 0 64 64"><path d="M8 6 L8 46 L19 36 L27 54 L35 50.5 L27 33 L42 33 Z" fill="#fff"/></svg>Made with Liveswarm</div>`);
  const box = await pg.locator('.m').boundingBox();
  await pg.screenshot({ path: outPng, omitBackground: true, clip: { x: 0, y: 0, width: Math.ceil(box.width + 12 * u), height: Math.ceil(box.height + 12 * u) } });
  await b.close();
};

// ---------------------------------------------------------------- build both formats
const result = {};
for (const r of rec) {
  const f = r.f;
  const inter = path.join(work, `${f.id}-inter.mp4`);
  const scale = f.outW !== f.vw ? `,scale=${f.outW}:${f.outH}:flags=lanczos` : '';
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', r.webm, '-vf', `fps=${FPS}${scale},format=yuv420p`, '-c:v', 'libx264', '-crf', '12', '-preset', 'veryfast', '-g', String(FPS), inter], `intermediate ${f.id}`);
  const vdur = probeDur(inter);
  const wallLen = (closeWall - r.startWall) / 1000;
  const scaleT = vdur / wallLen;                                 // linear wall->video mapping
  const offs = (r.startWall - T0) / 1000;
  const toVid = (tc) => Math.max(0, Math.min(vdur, (tc - offs) * scaleT));
  log(`${f.id}: video ${vdur.toFixed(2)}s vs wall ${wallLen.toFixed(2)}s (scale ${scaleT.toFixed(4)}, start offset ${offs.toFixed(2)}s)`);

  const png = path.join(work, `${f.id}-endcard.png`);
  await mkEndcard(f, png);
  const markPng = path.join(work, `${f.id}-mark.png`);
  await mkMark(f, markPng);

  const inputs = [], chains = [];
  runs.forEach((s, i) => {
    const a = toVid(s.a), b = toVid(s.b);
    const inLen = Math.max(0.05, b - a);
    inputs.push('-ss', a.toFixed(3), '-t', inLen.toFixed(3), '-i', inter);
    // stretch/compress so every format gets the identical, frame-exact output length for this segment
    chains.push(`[${i}:v]setpts=(PTS-STARTPTS)*${(s.outDur / inLen).toFixed(6)},fps=${FPS},trim=end_frame=${s.frames},setpts=PTS-STARTPTS,setsar=1[s${i}]`);
  });
  const XF = 0.6, CARD = 3.0;
  // per-segment frame counts are rounded by fps; measure body from the segments we asked for
  const body = runs.reduce((acc, s) => acc + s.frames, 0) / FPS;
  const cardIdx = runs.length;
  inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(CARD + XF), '-i', png);
  const markIdx = runs.length + 1;
  inputs.push('-loop', '1', '-framerate', String(FPS), '-t', (body + 2).toFixed(2), '-i', markPng);
  const mM = Math.round(36 * Math.min(f.outW, f.outH) / 1080);                 // margin
  const concatIn = runs.map((_, i) => `[s${i}]`).join('');
  const fc = [
    ...chains,
    `${concatIn}concat=n=${runs.length}:v=1:a=0,format=yuv420p,fps=${FPS},settb=AVTB[body0]`,
    `[${markIdx}:v]format=rgba,fps=${FPS}[mk]`,
    `[body0][mk]overlay=x=W-w-${mM}:y=H-h-${mM}:shortest=1:format=auto,format=yuv420p,settb=AVTB[body]`,
    `[${cardIdx}:v]fps=${FPS},format=yuv420p,setsar=1,settb=AVTB[card]`,
    `[body][card]xfade=transition=fade:duration=${XF}:offset=${(body - XF).toFixed(3)},format=yuv420p[v]`,
  ].join(';\n');
  const script = path.join(work, `${f.id}.filter`);
  fs.writeFileSync(script, fc);
  const outMp4 = path.join(outDir, `${name}-${f.id}.mp4`);
  run('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex_script', script, '-map', '[v]', '-r', String(FPS), '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outMp4], `build ${f.id}`);
  result[f.id] = { file: outMp4, duration: probeDur(outMp4), sourceSeconds: vdur };
  log(`wrote ${outMp4} (${result[f.id].duration.toFixed(2)}s)`);
}

// ---------------------------------------------------------------- timeline.json + cleanup
const timelinePath = path.join(outDir, `${name}-timeline.json`);
fs.writeFileSync(timelinePath, JSON.stringify({
  url, conductor, recordedSeconds: D, stats,
  protectedRanges, quietIntervals: quiet,
  timeMap: runs.map((r) => ({ from: +r.a.toFixed(3), to: +r.b.toFixed(3), class: r.cls, factor: r.factor, outSeconds: +r.outDur.toFixed(3) })),
  timelapseSeconds: +bodyDur.toFixed(3), endCardSeconds: 3, outputs: result, events,
}, null, 1));
log('wrote', timelinePath);
if (flag('keep-raw')) log('raw files kept in', work);
else { fs.rmSync(work, { recursive: true, force: true }); log('raw WebMs removed after success'); }
