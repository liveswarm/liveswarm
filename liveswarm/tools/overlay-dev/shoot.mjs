// Verification: serves dev/ + ../overlay.js on 127.0.0.1:5191, plays ?scenario in Chromium at two sizes,
// screenshots every ~2s, asserts console cleanliness, click-through, landing geometry.  Usage: node shoot.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'shots');
fs.mkdirSync(shots, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x').pathname;
  const f = u === '/' ? path.join(here, 'index.html') : u === '/overlay.js' ? path.join(here, '..', '..', 'plugin', 'overlay', 'overlay.js') : path.join(here, u);
  if (!f.startsWith(here) && f !== path.join(here, '..', '..', 'plugin', 'overlay', 'overlay.js')) { res.writeHead(403).end(); return; }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404).end('nf'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(d);
  });
});
await new Promise((r) => server.listen(5191, '127.0.0.1', r));

// Playwright 1.65 expects a newer browser build than the cache holds; fall back to any cached headless shell.
function pickChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try { const p = chromium.executablePath(); if (fs.existsSync(p)) return undefined; } catch {}
  const cache = path.join(process.env.HOME, 'Library/Caches/ms-playwright');
  const dirs = fs.readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
  for (const d of dirs) { const p = path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); if (fs.existsSync(p)) return p; }
  return undefined;
}
let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };

async function run(name, viewport, record) {
  console.log(`\n== ${name} ${viewport.width}x${viewport.height}`);
  const browser = await chromium.launch({ executablePath: pickChromium() });
  const vdir = path.join(shots, '_vid');
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...(record ? { recordVideo: { dir: vdir, size: viewport } } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location().url || '';
    if (/:7799/.test(loc) || /:7799/.test(m.text())) return; // expected: nothing listens on the fake conductor
    errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('http://127.0.0.1:5191/?scenario');
  await page.waitForFunction(() => window.Liveswarm);
  let n = 0, clicked = false;
  const t0 = Date.now();
  while (true) {
    const done = await page.evaluate(() => window.__scenarioDone === true);
    const el = Date.now() - t0;
    if (el > 12500 && !clicked) {
      clicked = true;
      const hit = await page.evaluate(() => { const b = document.getElementById('cta-main'); const r = b.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === b; });
      ok(hit, 'elementFromPoint at the CTA returns the real button (overlay is click-through)');
      await page.click('#cta-main', { timeout: 3000 });
      const c = await page.evaluate(() => window.__clicks);
      ok(c === 1, 'real button under the overlay received a Playwright click (clicks=' + c + ')');
    }
    if (el > n * 2000) { await page.screenshot({ path: path.join(shots, `${name}-${String(n).padStart(2, '0')}.png`) }); n++; }
    if (done || el > 45000) break;
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shots, `${name}-final.png`) });
  const st = await page.evaluate(() => JSON.parse(JSON.stringify({
    s: window.Liveswarm.state, ex: window.__scenarioExpect, vp: [document.documentElement.clientWidth, innerHeight],
    host: getComputedStyle(document.querySelector('liveswarm-overlay')).pointerEvents,
    shadowOpen: !!document.querySelector('liveswarm-overlay').shadowRoot
  })));
  const s = st.s;
  ok(errors.length === 0, 'zero console/page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  ok(s.errors.length === 0, 'overlay recorded zero internal errors' + (s.errors.length ? ': ' + s.errors[0] : ''));
  ok(st.host === 'none' && !st.shadowOpen, 'host pointer-events:none and shadow root is closed');
  ok(s.hud && s.hud.state === 'offline', 'HUD shows offline with no conductor (' + JSON.stringify(s.hud) + ')');
  ok(s.idle, 'overlay idle at end');
  console.log(`  landings=${s.landings.length} edits=${s.edits} events=${s.events} agents=${s.agents.map((a) => a.label).join(', ')}`);
  const [vw, vh] = st.vp;
  const inside = (c, r, tol = 2) => c.x >= r.x - tol && c.x <= r.x + r.w + tol && c.y >= r.y - tol && c.y <= r.y + r.h + tol;
  for (const l of s.landings) {
    let good = false;
    if (l.resolver === 'paint') good = inside(l.cursor, { x: 0, y: 0, w: vw, h: vh });
    else if (l.resolver === 'dock') good = inside(l.cursor, l.rect, 3);
    else if (l.offscreen) good = l.cursor.x >= 0 && l.cursor.x <= vw && l.cursor.y >= 0 && l.cursor.y <= vh && Math.min(l.cursor.x, vw - l.cursor.x, l.cursor.y, vh - l.cursor.y) <= 30;
    else good = inside(l.cursor, l.rect) && (!l.band || inside(l.cursor, l.band, 4));
    ok(good, `landing ${String(l.label).padEnd(22)} ${String(l.file).split('/').slice(-2).join('/').padEnd(30)} ${l.resolver}${l.offscreen ? '(edge:' + l.edge + ')' : ''}${l.merged > 1 ? ' x' + l.merged : ''} cursor=(${l.cursor.x.toFixed(0)},${l.cursor.y.toFixed(0)}) rect=${l.rect ? [l.rect.x, l.rect.y, l.rect.w, l.rect.h].map((v) => Math.round(v)).join(',') : '-'}`);
  }
  for (const e of st.ex) {
    if (e.kind === 'burst') { ok(s.landings.some((l) => l.merged > 1), 'burst produced at least one merged landing'); continue; }
    if (e.kind === 'dock') { ok(s.landings.some((l) => l.resolver === 'dock' && /Testimonial/.test(l.file)), 'ghost Write of unmounted file landed in the dock'); continue; }
    if (e.key) ok(s.landings.some((l) => l.elKey && l.elKey.endsWith(e.key) && l.agent === e.agent), `expected landing on ${e.key} by ${e.agent}`);
  }
  ok(s.landings.some((l) => l.tool === 'Write' && l.kind === 'write' && l.resolver.startsWith('tag')), 'Write on a mounted file bloomed on its element');
  ok(s.landings.some((l) => l.resolver === 'paint'), 'CSS edit played the paint sweep');
  ok(s.landings.some((l) => l.offscreen), 'off-screen target produced an edge pointer');
  ok(s.edits >= 20, 'HUD edit counter counted the edits (' + s.edits + ')');
  await ctx.close();
  if (record) {
    const f = fs.readdirSync(vdir).find((x) => x.endsWith('.webm'));
    if (f) { fs.renameSync(path.join(vdir, f), path.join(shots, 'scenario.webm')); fs.rmSync(vdir, { recursive: true, force: true }); }
  }
  await browser.close();
}

try {
  await run('desktop', { width: 1280, height: 800 }, true);
  await run('mobile', { width: 430, height: 932 }, false);
} finally { server.close(); }
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
