#!/usr/bin/env node
// Liveswarm demo exporter. Builds demos/nocturne (source tags kept) and turns the real recorded
// session (fixtures/nocturne-take2.events.jsonl) into a static, offline replay bundle:
//
//   node liveswarm/tools/export-demo.mjs [--out liveswarm/plugin/demo] [--keep-tmp]
//
// Output (plugin/demo/): index.html + assets/ + fonts/ (the built site, data-swarm tags kept),
// events.json (sanitized normalized events, `dt` = real ms since start) and replay.js (the player).
// overlay.js is NOT copied: the demo server serves plugin/overlay/overlay.js at /overlay.js.
// Files are overwritten in place with stable names (no hashes), nothing is deleted from the repo.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lsRoot = path.resolve(here, '..');
const repoRoot = path.resolve(lsRoot, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const NOCTURNE = path.join(repoRoot, 'demos/nocturne');
const FIXTURE = path.join(lsRoot, 'fixtures/nocturne-take2.events.jsonl');
const OUT = path.resolve(opt('out', path.join(lsRoot, 'plugin/demo')));
const MAX_BYTES = 1.5 * 1024 * 1024;
const log = (...a) => console.log('[export-demo]', ...a);
const fail = (m) => { console.error('[export-demo] ERROR: ' + m); process.exit(1); };

for (const p of [NOCTURNE, FIXTURE]) if (!fs.existsSync(p)) fail('missing ' + p);
const viteBin = path.join(NOCTURNE, 'node_modules/.bin/vite');
if (!fs.existsSync(viteBin)) fail('run `npm install` in demos/nocturne first (vite not found)');

// ------------------------------------------------------------------ 1. build with tags kept
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'liveswarm-demo-'));
const buildOut = path.join(tmp, 'out');
const cfgPath = path.join(tmp, 'vite.config.mjs');
const url = (p) => JSON.stringify(pathToFileURL(p).href);
fs.writeFileSync(cfgPath, [
  'import react from ' + url(path.join(NOCTURNE, 'node_modules/@vitejs/plugin-react/dist/index.js')) + ';',
  'import liveswarm from ' + url(path.join(lsRoot, 'vite-plugin/index.mjs')) + ';',
  'export default {',
  '  root: ' + JSON.stringify(NOCTURNE) + ',',
  '  base: "./",',
  '  logLevel: "warn",',
  '  plugins: [liveswarm({ keepInBuild: true }), react()],',
  '  build: {',
  '    outDir: ' + JSON.stringify(buildOut) + ',',
  '    emptyOutDir: true,',
  '    sourcemap: false,',
  '    rollupOptions: { output: { entryFileNames: "assets/app.js", chunkFileNames: "assets/[name].js", assetFileNames: "assets/[name][extname]" } },',
  '  },',
  '};',
  '',
].join('\n'));
log('building demos/nocturne with keepInBuild ...');
const b = spawnSync(viteBin, ['build', '--config', cfgPath], { cwd: NOCTURNE, encoding: 'utf8', env: { ...process.env, LIVESWARM: 'on' } });
if (b.status !== 0) fail('vite build failed\n' + (b.stdout || '') + (b.stderr || ''));

// ------------------------------------------------------------------ 2. copy into plugin/demo
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(buildOut, OUT, { recursive: true, force: true });

// index.html: replay.js (sync, sets the replay config) must run before overlay.js (deferred).
const htmlPath = path.join(OUT, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/<script src="\.\/replay\.js"><\/script>\s*<script src="\.\/overlay\.js" defer><\/script>\s*/g, '');
html = html.replace(/<title>[^<]*<\/title>/, '<title>Liveswarm demo · Nocturne</title>');
if (!html.includes('</head>')) fail('built index.html has no </head>');
html = html.replace('</head>', '    <link rel="icon" href="data:," />\n    <script src="./replay.js"></script>\n    <script src="./overlay.js" defer></script>\n  </head>');
fs.writeFileSync(htmlPath, html);

// ------------------------------------------------------------------ 3. events.json
const SRC_PREFIX = NOCTURNE.split(path.sep).join('/') + '/';
const raw = fs.readFileSync(FIXTURE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const t0 = raw[0].ts;
const clean = (s) => String(s)
  .replace(/\/(?:Users|home)\/[^\s"';:|&)]*/g, '…')
  .replace(/[A-Za-z]:\\Users\\[^\s"']*/g, '…');
function mapFile(f) {
  let rel;
  if (f.startsWith(SRC_PREFIX)) rel = f.slice(SRC_PREFIX.length);
  else rel = path.posix.basename(f); // outside the project: keep the bare name only
  return '/demo/' + rel;
}
const events = raw.map((e) => {
  const o = { v: 1, dt: Math.max(0, e.ts - t0), kind: e.kind };
  o.agent = { id: e.agent.id, type: e.agent.type, label: clean(e.agent.label ?? e.agent.type), parent: e.agent.parent ?? null };
  if (e.tool) o.tool = e.tool;
  if (e.toolUseId) o.toolUseId = e.toolUseId;
  if (e.file) o.file = mapFile(e.file);
  if (e.range) o.range = e.range;
  if (e.added != null) o.added = e.added;
  if (e.removed != null) o.removed = e.removed;
  if (e.summary != null) o.summary = clean(e.summary);
  if (e.ok != null) o.ok = e.ok;
  return o;
});
const eventsJson = JSON.stringify(events);
if (/\/Users\//.test(eventsJson) || /\/home\//.test(eventsJson)) fail('events.json still contains an absolute path');
const who = os.userInfo().username;
if (who && who.length > 2 && eventsJson.includes(who)) fail('events.json contains the local username');
fs.writeFileSync(path.join(OUT, 'events.json'), eventsJson);

// ------------------------------------------------------------------ 4. replay.js
fs.writeFileSync(path.join(OUT, 'replay.js'), REPLAY_SRC());

// ------------------------------------------------------------------ 5. report
function dirSize(d) { let n = 0; for (const f of fs.readdirSync(d, { withFileTypes: true })) n += f.isDirectory() ? dirSize(path.join(d, f.name)) : fs.statSync(path.join(d, f.name)).size; return n; }
const total = dirSize(OUT);
log(`events: ${events.length}, real span ${((events.at(-1).dt) / 1000).toFixed(1)} s`);
log(`bundle: ${OUT} (${(total / 1024).toFixed(0)} KB)`);
if (total > MAX_BYTES) console.warn('[export-demo] WARNING: bundle is over 1.5 MB');
if (!argv.includes('--keep-tmp')) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } }

// ====================================================================================== player
// Plain ES2017, no template literals / no backticks inside (this is embedded via String.raw).
function REPLAY_SRC() {
  return String.raw`/* Liveswarm demo player. Generated by tools/export-demo.mjs, do not edit by hand.
   Replays a real recorded Claude Code session (events.json) through window.Liveswarm.ingest.
   Offline: no network requests except same-origin events.json. */
(function () {
  'use strict';
  window.__LIVESWARM__ = { conductor: null, mode: 'replay' };

  var TARGET_MS = 75000;     // compressed length of the whole replay
  var OPEN_REAL_MS = 29000;  // the opening (agents splitting off) plays near real speed
  var OPEN_GAP_CAP = 1300;   // but a quiet gap there never exceeds this
  var LATE_GAP_CAP = 700;    // quiet gaps after the opening are squeezed hard
  var LEAD_IN_MS = 1400;     // calm blueprint before the first event
  var DWELL_MS = 2300;       // minimum time the camera stays on a section
  var LABEL = 'Replay of a real Claude Code session · 12 agents · sped up';

  var SECTIONS = [
    { no: '01', sel: '#nav', label: '01 · Nav' },
    { no: '02', sel: '#sky', label: null },
    { no: '03', sel: '#hero-title', label: '02 · Night sky   ·   03 · Hero', center: true },
    { no: '04', sel: '#arrival', label: '04 · Arrival' },
    { no: '05', sel: '#rooms', label: '05 · Rooms' },
    { no: '06', sel: '#stars', label: '06 · Star program' },
    { no: '07', sel: '#dining', label: '07 · Dining' },
    { no: '08', sel: '#rituals', label: '08 · Rituals' },
    { no: '09', sel: '#drive', label: '09 · The drive' },
    { no: '10', sel: '#notes', label: '10 · Field notes' },
    { no: '11', sel: '#booking', label: '11 · Booking' },
    { no: '12', sel: '#footer', label: '12 · Footer' }
  ];
  var byNo = {};
  SECTIONS.forEach(function (s) { byNo[s.no] = s; });

  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var css = [
    '[data-ls-hidden]{opacity:0 !important;pointer-events:none}',
    '#ls-blueprint{position:absolute;left:0;top:0;width:100%;height:0;z-index:2;pointer-events:none;overflow:visible}',
    '.ls-ghost{position:absolute;left:var(--gutter,4rem);right:var(--gutter,4rem);border-top:1px solid var(--line,rgba(232,221,200,.14));transition:opacity .9s ease}',
    '.ls-ghost.ls-center{border-top:0;display:grid;place-items:center;left:0;right:0}',
    '.ls-ghost span{display:block;padding-top:var(--space-4,1rem);font:500 var(--text-xs,.75rem)/1 var(--font-body,system-ui,sans-serif);letter-spacing:var(--track-eyebrow,.28em);text-transform:uppercase;color:var(--sand-faint,#6b6558);opacity:.55;white-space:nowrap}',
    '.ls-ghost.ls-center span{padding:0;opacity:.4}',
    '.ls-ghost.ls-gone{opacity:0}',
    '#ls-demo-bar{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 24px);padding:8px 14px;border-radius:999px;background:rgba(7,6,15,.78);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border:1px solid rgba(232,221,200,.16);color:#d9d2c3;font:500 11px/1.2 var(--font-body,system-ui,sans-serif);letter-spacing:.06em;text-align:center;pointer-events:none}',
    '#ls-demo-bar .ls-dot{width:6px;height:6px;border-radius:50%;background:#7ee0a1;flex:none;animation:ls-pulse 1.6s ease-in-out infinite}',
    '#ls-demo-bar.ls-idle .ls-dot{animation:none;background:#8a8478}',
    '#ls-demo-bar button{pointer-events:auto;cursor:pointer;font:600 11px/1 var(--font-body,system-ui,sans-serif);letter-spacing:.08em;text-transform:uppercase;color:#07060f;background:#e8ddc8;border:0;border-radius:999px;padding:7px 12px}',
    '#ls-demo-bar button:hover{background:#fff}',
    '#ls-demo-bar button:focus-visible{outline:2px solid #fff;outline-offset:2px}',
    '#ls-demo-bar[hidden],#ls-demo-bar button[hidden]{display:none}',
    '@media (max-width:600px){#ls-demo-bar{bottom:52px;border-radius:14px;padding:7px 12px;font-size:10px;gap:8px}}',
    '@keyframes ls-pulse{0%,100%{opacity:1}50%{opacity:.35}}',
    '@media (prefers-reduced-motion:reduce){#ls-demo-bar .ls-dot{animation:none}}'
  ].join('\n');

  var events = null, ct = [];
  var els = {};            // no -> element
  var ghosts = {};         // no -> ghost element
  var layer = null, bar = null, btn = null, barText = null;
  var state = 'boot';      // boot | playing | done | ready
  var clock = 0, last = 0, idx = 0, raf = 0;
  var following = true, lastMove = -1e9, curSection = null, camPending = null, camAnim = 0;
  var endTimer = 0, revealed = {}, endedAt = 0;

  /* ---------------------------------------------------------------- time map */
  function buildMap(evs) {
    function total(k) {
      var t = 0;
      for (var i = 1; i < evs.length; i++) {
        var g = evs[i].dt - evs[i - 1].dt;
        t += evs[i].dt <= OPEN_REAL_MS ? Math.min(g, OPEN_GAP_CAP) : Math.min(g * k, LATE_GAP_CAP);
      }
      return t;
    }
    var lo = 0.0005, hi = 1;
    if (total(hi) <= TARGET_MS) { lo = hi; } else { for (var n = 0; n < 40; n++) { var mid = (lo + hi) / 2; if (total(mid) > TARGET_MS) hi = mid; else lo = mid; } }
    var k = lo, out = [0];
    for (var i = 1; i < evs.length; i++) {
      var g = evs[i].dt - evs[i - 1].dt;
      out.push(out[i - 1] + (evs[i].dt <= OPEN_REAL_MS ? Math.min(g, OPEN_GAP_CAP) : Math.min(g * k, LATE_GAP_CAP)));
    }
    return out;
  }

  /* ---------------------------------------------------------------- stage */
  function sectionOfFile(f) {
    var m = /\/sections\/(\d\d)-[^\/]*\.(jsx|css)$/.exec(f || '');
    return m ? m[1] : null;
  }
  function findEls() {
    var ok = true;
    SECTIONS.forEach(function (s) { var e = document.querySelector(s.sel); if (e) els[s.no] = e; else ok = false; });
    return ok;
  }
  function layout() {
    if (!layer) return;
    var sy = window.pageYOffset || 0;
    SECTIONS.forEach(function (s) {
      var g = ghosts[s.no], e = els[s.no];
      if (!g || !e) return;
      var r = e.getBoundingClientRect();
      var top = s.no === '01' ? 0 : r.top + sy;
      g.style.top = top + 'px';
      if (s.center) { g.style.height = r.height + 'px'; }
    });
  }
  function buildGhosts() {
    layer = document.createElement('div');
    layer.id = 'ls-blueprint';
    layer.setAttribute('aria-hidden', 'true');
    SECTIONS.forEach(function (s) {
      if (!s.label) return;
      var g = document.createElement('div');
      g.className = 'ls-ghost' + (s.center ? ' ls-center' : '');
      var sp = document.createElement('span');
      sp.textContent = s.label;
      g.appendChild(sp);
      layer.appendChild(g);
      ghosts[s.no] = g;
    });
    document.body.appendChild(layer);
    layout();
    window.addEventListener('resize', layout);
    if (window.ResizeObserver) { try { new ResizeObserver(layout).observe(document.body); } catch (e) {} }
  }
  function hideAll() {
    revealed = {};
    SECTIONS.forEach(function (s) {
      var e = els[s.no];
      if (e) e.setAttribute('data-ls-hidden','');
      var g = ghosts[s.no];
      if (g) g.classList.remove('ls-gone');
    });
    layout();
  }
  function showAllInstant() {
    SECTIONS.forEach(function (s) {
      var e = els[s.no];
      if (e) e.removeAttribute('data-ls-hidden');
      var g = ghosts[s.no];
      if (g) g.classList.add('ls-gone');
    });
  }
  function reveal(no) {
    if (revealed[no]) return;
    revealed[no] = true;
    var e = els[no], g = ghosts[no];
    if (!e) return;
    if (g) g.classList.add('ls-gone');
    e.removeAttribute('data-ls-hidden');
    if (e.animate && !reduced) {
      try {
        e.animate(
          [{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'none' }],
          { duration: 1200, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' }
        );
      } catch (err) {}
    } else if (e.animate) {
      try { e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: 'backwards' }); } catch (err) {}
    }
  }

  /* ---------------------------------------------------------------- camera */
  function maxScroll() { return Math.max(0, document.documentElement.scrollHeight - window.innerHeight); }
  function glideTo(y, dur) {
    cancelAnimationFrame(camAnim);
    y = Math.max(0, Math.min(maxScroll(), y));
    var y0 = window.pageYOffset, t0 = performance.now();
    if (reduced || dur <= 0 || Math.abs(y - y0) < 2) { window.scrollTo(0, y); return; }
    (function step(now) {
      var p = Math.min(1, (now - t0) / dur), e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      window.scrollTo(0, y0 + (y - y0) * e);
      if (p < 1 && following) camAnim = requestAnimationFrame(step);
    })(t0);
  }
  function goSection(no, why) {
    var e = els[no];
    if (!e || !following) return;
    var r = e.getBoundingClientRect();
    var y = no === '01' || no === '02' || no === '03' ? 0 : r.top + (window.pageYOffset || 0) - Math.min(40, window.innerHeight * 0.06);
    curSection = no === '01' || no === '02' || no === '03' ? '03' : no;
    lastMove = clock;
    glideTo(y, 1500);
  }
  function camHint(no) {
    if (!no || !following) return;
    var tgt = (no === '01' || no === '02') ? '03' : no;
    if (revealed[tgt]) camPending = tgt; // only follow what is already on screen, never a blank slot
  }
  function camTick() {
    if (!following || !camPending || firstWriteSeen === false) return;
    if (camPending !== curSection && clock - lastMove >= DWELL_MS) { var t = camPending; camPending = null; goSection(t); }
  }
  var firstWriteSeen = false;

  /* ---------------------------------------------------------------- playback */
  function ingest(ev) {
    var L = window.Liveswarm;
    if (L && typeof L.ingest === 'function') { try { L.ingest(ev); } catch (e) {} }
  }
  function dispatch(i) {
    var src = events[i], ev = {};
    for (var k in src) ev[k] = src[k];
    ev.ts = Date.now(); ev.seq = i + 1; ev.session = 'liveswarm-demo';
    delete ev.dt;
    ingest(ev);
    if (src.kind === 'tool.post' && src.tool === 'Write' && /\.jsx$/.test(src.file || '')) {
      var no = sectionOfFile(src.file);
      if (no) { reveal(no); if (no === '03') reveal('02'); firstWriteSeen = true; }
    }
    if ((src.kind === 'tool.pre' || src.kind === 'tool.post') && (src.tool === 'Write' || src.tool === 'Edit' || src.tool === 'MultiEdit')) {
      if (firstWriteSeen) camHint(sectionOfFile(src.file));
    }
    if (src.kind === 'session.end') onEnd();
  }
  function frame(now) {
    raf = 0;
    if (state !== 'playing') return;
    var dtm = Math.min(1000, now - last); // slow frames still keep real time; hidden tabs are handled by visibilitychange
    last = now;
    if (!document.hidden) {
      clock += dtm;
      while (idx < events.length && ct[idx] <= clock) { dispatch(idx); idx++; }
      camTick();
    }
    if (state === 'playing') raf = requestAnimationFrame(frame);
  }
  function onEnd() {
    state = 'done';
    endedAt = performance.now();
    setBar('done');
    clearTimeout(endTimer);
    endTimer = setTimeout(function () {
      // the finished page: glide back to the top unless the visitor took over
      if (following) { following = true; glideTo(0, 2600); }
    }, 400);
  }
  function start() {
    clearTimeout(endTimer);
    cancelAnimationFrame(raf);
    var L = window.Liveswarm;
    if (L && typeof L.reset === 'function') { try { L.reset(); } catch (e) {} }
    hideAll();
    following = true; firstWriteSeen = false; camPending = null; curSection = null; lastMove = -1e9;
    window.scrollTo(0, 0);
    idx = 0; clock = -LEAD_IN_MS; state = 'playing';
    setBar('playing');
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------- bar */
  function buildBar() {
    bar = document.createElement('div');
    bar.id = 'ls-demo-bar';
    bar.setAttribute('role', 'status');
    var dot = document.createElement('span'); dot.className = 'ls-dot';
    barText = document.createElement('span'); barText.textContent = LABEL;
    btn = document.createElement('button'); btn.type = 'button'; btn.hidden = true; btn.textContent = 'Replay';
    btn.addEventListener('click', function () { start(); });
    bar.appendChild(dot); bar.appendChild(barText); bar.appendChild(btn);
    document.body.appendChild(bar);
  }
  function setBar(s) {
    if (!bar) return;
    bar.classList.toggle('ls-idle', s !== 'playing');
    btn.hidden = s === 'playing';
    btn.textContent = s === 'ready' ? 'Play' : 'Replay';
  }

  /* ---------------------------------------------------------------- boot */
  document.addEventListener('visibilitychange', function () { last = performance.now(); });
  function stopFollow() { if (following) { following = false; cancelAnimationFrame(camAnim); } }
  ['wheel', 'touchstart', 'keydown'].forEach(function (n) { window.addEventListener(n, stopFollow, { passive: true }); });
  window.addEventListener('pointerdown', function (e) { if (e.target === document.documentElement) stopFollow(); }, { passive: true });

  function boot() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var tries = 0;
    (function wait() {
      if (findEls() || tries++ > 200) {
        buildGhosts(); buildBar();
        if (reduced) { showAllInstant(); state = 'ready'; setBar('ready'); return; }
        hideAll();
        // let overlay.js (deferred) mount before the first event
        var n = 0;
        (function ov() { if (window.Liveswarm || n++ > 100) start(); else setTimeout(ov, 50); })();
        return;
      }
      setTimeout(wait, 50);
    })();
  }

  function init() {
    fetch('./events.json').then(function (r) { return r.json(); }).then(function (evs) {
      events = evs; ct = buildMap(evs);
      window.__LIVESWARM_REPLAY__ = { events: events.length, compressedMs: ct[ct.length - 1], realMs: events[events.length - 1].dt };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
    }).catch(function () { /* no events: show the plain finished page */ });
  }
  init();
})();
`;
}
