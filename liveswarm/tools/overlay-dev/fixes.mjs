// Regression checks for the fixer pass: one check per fixed bug.  Usage: node fixes.mjs  (serves on 127.0.0.1:5191)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x').pathname;
  const f = u === '/' ? path.join(here, 'index.html') : u === '/overlay.js' ? path.join(here, '..', '..', 'plugin', 'overlay', 'overlay.js') : path.join(here, u);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404).end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(d); });
});
await new Promise((r) => server.listen(5191, '127.0.0.1', r));
function pickChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try { const p = chromium.executablePath(); if (fs.existsSync(p)) return undefined; } catch {}
  const cache = path.join(process.env.HOME, 'Library/Caches/ms-playwright');
  const dirs = fs.readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
  for (const d of dirs) { const p = path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); if (fs.existsSync(p)) return p; }
}
let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
const browser = await chromium.launch({ executablePath: pickChromium() });
const MAIN = { id: 'main', type: 'main', label: 'main', parent: null };
let seq = 0;

async function open(viewport = { width: 1280, height: 800 }, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: opts.rm ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/:7799/.test(m.location().url || '') && !/:7799/.test(m.text())) page.errs.push(m.text()); });
  // test hook only: expose the closed shadow root so the checks can look inside it
  await page.addInitScript(() => { const o = Element.prototype.attachShadow; Element.prototype.attachShadow = function (i) { const r = o.call(this, { ...i, mode: 'open' }); if (this.localName === 'liveswarm-overlay') window.__sr = r; return r; }; });
  await page.goto('http://127.0.0.1:5191/');
  await page.waitForFunction(() => window.Liveswarm && window.__sr);
  page.ev = (o) => page.evaluate((o) => window.Liveswarm.ingest({ v: 1, seq: 0, ts: Date.now(), session: 's', ...o }), o);
  page.st = () => page.evaluate(() => JSON.parse(JSON.stringify(window.Liveswarm.state)));
  page.close2 = () => ctx.close();
  return page;
}
const R = '/demo/src/components/';
const pre = (p, id, file, agent = MAIN, tool = 'Edit') => p.ev({ kind: 'tool.pre', agent, tool, toolUseId: id, file: file && R + file, summary: file || '' });
const post = (p, id, file, agent = MAIN, extra = {}) => p.ev({ kind: 'tool.post', agent, tool: 'Edit', toolUseId: id, file: R + file, range: [8, 9], added: 2, removed: 1, ok: true, ...extra });
const idle = (p, ms = 30000) => p.waitForFunction(() => window.Liveswarm.state.idle, null, { timeout: ms });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 1. late Post (> 20 s after Pre) still lands
async function t1() {
  const p = await open(); await p.ev({ kind: 'session.start', agent: MAIN });
  await pre(p, 'slow', 'Hero.jsx'); await sleep(23000); await post(p, 'slow', 'Hero.jsx');
  await idle(p); const s = await p.st();
  ok(s.edits === 1 && s.landings.length === 1 && /Hero/.test(s.landings[0].file), `[1] Post 23 s after Pre lands (edits=${s.edits} landings=${s.landings.length})`);
  ok(p.errs.length === 0 && s.errors.length === 0, '[1] no errors'); await p.close2();
}
// ---- 2. head-of-line blocking
async function t2() {
  const p = await open(); await p.ev({ kind: 'session.start', agent: MAIN });
  await pre(p, 'orphan', 'Pricing.jsx'); await sleep(300);
  await pre(p, 'h1', 'Hero.jsx'); await post(p, 'h1', 'Hero.jsx');
  await sleep(3500); let s = await p.st();
  ok(s.landings.length === 1 && /Hero/.test(s.landings[0].file), `[2a] Hero lands while Pricing Pre is still open (landings=${s.landings.length}, parked=${s.parked})`);
  await post(p, 'orphan', 'Pricing.jsx'); await idle(p); s = await p.st();
  ok(s.landings.length === 2 && /Pricing/.test(s.landings[1].file), '[2a] the orphan lands as soon as its Post arrives');
  // bash with no post must not stall an edit
  await p.ev({ kind: 'tool.pre', agent: MAIN, tool: 'Bash', toolUseId: 'bx', summary: '$ npm run build' }); await sleep(300);
  await pre(p, 'n1', 'Nav.jsx'); await post(p, 'n1', 'Nav.jsx'); await sleep(3500); s = await p.st();
  ok(s.landings.length === 3 && s.agents[0].queue === 0, `[2b] Nav edit lands within 3.5 s of an unfinished Bash (landings=${s.landings.length}, queue=${s.agents[0].queue})`);
  const pillBefore = await p.evaluate(() => window.__sr.querySelectorAll('.term').length);
  await p.ev({ kind: 'tool.post', agent: MAIN, tool: 'Bash', toolUseId: 'bx', summary: '$ npm run build', ok: true }); await sleep(600);
  const okTerm = await p.evaluate(() => [...window.__sr.querySelectorAll('.term')].some((t) => t.classList.contains('ok')));
  ok(pillBefore === 1 && okTerm, '[2b] the detached Bash pill kept running and turned green on its late Post');
  ok(p.errs.length === 0 && s.errors.length === 0, '[2] no errors'); await p.close2();
}
// ---- 3. bounded lag
async function t3() {
  const p = await open(); await p.ev({ kind: 'session.start', agent: MAIN });
  const t0 = Date.now(); let maxQ = 0;
  for (let i = 0; i < 100; i++) {
    const f = i % 2 ? 'Pricing.jsx' : 'Hero.jsx';
    await pre(p, 'b' + i, f); await post(p, 'b' + i, f, MAIN, { range: [3 + (i % 20), 5 + (i % 20)] });
    if (i % 10 === 0) { const s = await p.st(); maxQ = Math.max(maxQ, s.agents[0].queue); }
    await sleep(22);
  }
  await idle(p, 40000); const el = (Date.now() - t0) / 1000; const s = await p.st();
  ok(maxQ <= 10, `[3] queue stays bounded (max sampled queue=${maxQ}; was 95)`);
  ok(el < 14, `[3] 100 alternating-file edits drained in ${el.toFixed(1)} s (was ~38 s); dropped=${s.dropped}, landings=${s.landings.length}`);
  ok(s.edits === 100 && s.landings.reduce((n, l) => n + l.merged, 0) + s.dropped >= 90, `[3] HUD count exact (edits=${s.edits}); merged+dropped accounts for the rest`);
  // many agents
  const q = await open(); await q.ev({ kind: 'session.start', agent: MAIN });
  const t1_ = Date.now();
  for (let i = 0; i < 40; i++) for (let a = 1; a <= 6; a++) { const ag = { id: 'a' + a, type: 'x', label: 'Agent ' + a, parent: 'main' }; const f = (i + a) % 2 ? 'Hero.jsx' : 'Features.jsx'; const id = `m${a}_${i}`; await pre(q, id, f, ag); await post(q, id, f, ag); }
  await idle(q, 40000); const e2 = (Date.now() - t1_) / 1000; ok(e2 < 16, `[3] 6 agents x 40 edits drained in ${e2.toFixed(1)} s (was ~18 s + spawn)`);
  await p.close2(); await q.close2();
}
// ---- 4. html transform / filter
async function t4() {
  const p = await open(); await p.ev({ kind: 'session.start', agent: MAIN });
  await p.evaluate(() => { document.documentElement.style.transform = 'translateZ(0)'; document.documentElement.style.filter = 'saturate(1)'; window.scrollTo(0, 500); });
  await sleep(200);
  const r = await p.evaluate(() => { const h = document.querySelector('liveswarm-overlay').getBoundingClientRect(); const hud = window.__sr.querySelector('.hud').getBoundingClientRect(); return { h: [h.x, h.y, h.width, h.height], hud: [hud.y, hud.bottom], vh: innerHeight, pop: document.querySelector('liveswarm-overlay').matches(':popover-open') }; });
  ok(r.h[1] === 0 && r.h[3] === r.vh && r.hud[1] <= r.vh, `[4] overlay stays viewport-sized under html transform+filter+scroll (host=${r.h}, hud bottom=${r.hud[1]}/${r.vh}, topLayer=${r.pop})`); await p.close2();
}
// ---- 5/6/10. clipped target, tiny target, hidden target
async function t5() {
  const p = await open({ width: 1000, height: 700 }); await p.ev({ kind: 'session.start', agent: MAIN });
  await p.evaluate(() => {
    const add = (html) => document.body.insertAdjacentHTML('afterbegin', html);
    add('<div style="position:fixed;left:700px;top:100px;width:200px;height:40px;overflow:hidden;z-index:1"><div data-swarm="src/components/Clip.jsx:1-9" style="margin-top:300px;height:80px;background:#ddd">clipped</div></div>');
    add('<div data-swarm="src/components/Tiny.jsx:1-2" style="position:fixed;left:600px;top:300px;width:12px;height:10px;background:red;z-index:1"></div>');
    add('<div data-swarm="src/components/Hid.jsx:1-9" style="display:none">hidden</div>');
    add('<div style="position:fixed;left:700px;top:200px;width:200px;height:60px;overflow:hidden;z-index:1"><div data-swarm="src/components/Part.jsx:1-9" style="position:relative;top:-20px;height:200px;width:400px;background:#cde">part</div></div>');
  });
  await sleep(200);
  for (const [id, f] of [['c', 'Clip.jsx'], ['t', 'Tiny.jsx'], ['hd', 'Hid.jsx'], ['pt', 'Part.jsx']]) { await pre(p, id, f); await post(p, id, f, MAIN, { range: [1, 2] }); await sleep(200); }
  await idle(p); const s = await p.st(); const L = (n) => s.landings.find((l) => l.file.endsWith(n));
  ok(L('Clip.jsx').resolver === 'dock', `[5] fully overflow-clipped target is not treated as on-screen (resolver=${L('Clip.jsx').resolver}; was tag-range)`);
  ok(/^tag/.test(L('Tiny.jsx').resolver) && !L('Tiny.jsx').offscreen, `[6] tiny 12x10 on-screen target gets a real landing, not an edge pointer (resolver=${L('Tiny.jsx').resolver}, off=${L('Tiny.jsx').offscreen})`);
  const hidChip = await p.evaluate(() => [...window.__sr.querySelectorAll('.dock .chip')].map((c) => c.textContent).join('|'));
  ok(L('Hid.jsx').resolver === 'dock' && /Hid\.jsx.*hidden/.test(hidChip), `[10] display:none target goes to the dock labelled hidden ("${hidChip}")`);
  const pt = L('Part.jsx'); ok(pt.rect && pt.rect.y >= 200 - 1 && pt.rect.y + pt.rect.h <= 260 + 1 && pt.rect.x >= 700 - 1 && pt.rect.x + pt.rect.w <= 900 + 1, `[5] partially clipped target uses only its visible part (rect=${pt.rect && [pt.rect.x, pt.rect.y, pt.rect.w, pt.rect.h].map(Math.round)})`);
  ok(p.errs.length === 0 && s.errors.length === 0, '[5] no errors'); await p.close2();
}
// ---- 7/9/11/13. labels edge-aware, non-string input, many agents, dock z-order
async function t7() {
  const p = await open({ width: 430, height: 932 }); await p.ev({ kind: 'session.start', agent: MAIN });
  const rect = (sel) => p.evaluate((sel) => [...window.__sr.querySelectorAll(sel)].map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom }; }), sel);
  // 12 agents all busy on the same section, plus long terminal pills
  for (let a = 1; a <= 13; a++) await p.ev({ kind: 'agent.start', agent: { id: 'a' + a, type: 'x', label: a % 2 ? 'Reviewing accessibility of the pricing section ' + a : 'Agent ' + a, parent: 'main' } });
  await sleep(2500);
  for (let a = 1; a <= 13; a++) { const ag = { id: 'a' + a, type: 'x', label: 'Agent ' + a, parent: 'main' }; await pre(p, 'e' + a, 'Pricing.jsx', ag); await p.ev({ kind: 'tool.pre', agent: ag, tool: 'Bash', toolUseId: 'bs' + a, summary: '$ pnpm --filter @lumen/web exec playwright test --project=chromium tests/pricing.spec.ts' }); }
  await sleep(2500);
  const pills = await rect('.cur .pill'), terms = await rect('.cur .term');
  const ov = (A) => { let n = 0; for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) if (A[i].x < A[j].r && A[j].x < A[i].r && A[i].y < A[j].b && A[j].y < A[i].b) { n++; if (process.env.DBG) console.log('   overlap', JSON.stringify(A[i]), JSON.stringify(A[j])); } return n; };
  ok(pills.length >= 13 && ov(pills) === 0, `[11] 13 name pills on a 430px screen do not overlap each other (overlapping pairs=${ov(pills)}, pills=${pills.length})`);
  const all = [...pills, ...terms];
  ok(ov(all) === 0, `[11] name+terminal pills overlap-free as a set (pairs=${ov(all)}, terms=${terms.length})`);
  const outside = terms.filter((t) => t.x < -1 || t.r > 431).length;
  ok(terms.length > 0 && outside === 0, `[7] every terminal pill is inside the viewport horizontally (${outside}/${terms.length} outside)`);
  await p.screenshot({ path: path.join(here, 'shots', 'fix-crowd-mobile.png') });
  // non-string inputs
  await p.ev({ kind: 'tool.post', agent: MAIN, tool: 'Edit', toolUseId: 'bad1', file: 12345, range: 'zzz', added: 'x' });
  await p.ev({ kind: 'tool.pre', agent: MAIN, tool: 'Edit', toolUseId: 'bad2', file: { a: 1 }, range: [null, {}] });
  await p.ev({ kind: 'tool.post', agent: MAIN, tool: 'Edit', toolUseId: 'bad2', file: ['x'], range: { a: 1 }, summary: 77 });
  await p.ev({ kind: 'tool.post', agent: MAIN, tool: 'Edit', toolUseId: 12, file: R + 'Hero.jsx', range: [1, 'a'] });
  await sleep(4000); const s = await p.st();
  ok(s.errors.length === 0 && p.errs.length === 0, `[9] non-string file/range recorded no errors (state.errors=${s.errors.length})`);
  const order = await p.evaluate(() => [...window.__sr.querySelector('.root').children].map((c) => c.className.baseVal ?? c.className));
  ok(order.indexOf('dock') < order.indexOf('curs'), `[13] dock layer sits below the cursor layer (${order.join(',')})`);
  await p.close2();
}
// ---- 8. viewport shrink re-clamps cursors
async function t8() {
  const p = await open({ width: 1280, height: 800 }); await p.ev({ kind: 'session.start', agent: MAIN });
  await pre(p, 'x', 'Pricing.jsx'); await post(p, 'x', 'Pricing.jsx'); await idle(p);
  await p.ev({ kind: 'agent.start', agent: { id: 'k', type: 'x', label: 'K', parent: 'main' } }); await sleep(1800);
  const before = (await p.st()).agents.map((a) => [Math.round(a.x), Math.round(a.y)]);
  await p.setViewportSize({ width: 360, height: 500 }); await sleep(400);
  const after = (await p.st()).agents;
  ok(after.every((a) => a.x <= 360 && a.y <= 500), `[8] cursors pulled back inside a shrunk viewport (before=${JSON.stringify(before)} after=${JSON.stringify(after.map((a) => [Math.round(a.x), Math.round(a.y)]))})`);
  await p.close2();
}
// ---- 12. scroll during an effect
async function t12() {
  const p = await open(); await p.ev({ kind: 'session.start', agent: MAIN });
  await p.evaluate(() => { document.body.style.minHeight = '4000px'; });
  await pre(p, 's', 'Hero.jsx'); await post(p, 's', 'Hero.jsx', MAIN, { range: [8, 12] });
  let found = null; for (let i = 0; i < 40 && !found; i++) { await sleep(60); found = await p.evaluate(() => { const e = window.__sr.querySelector('.sel'); return e ? e.getBoundingClientRect().y : null; }); }
  await p.evaluate(() => window.scrollBy(0, 120)); await sleep(80);
  const y2 = await p.evaluate(() => { const e = window.__sr.querySelector('.sel'); return e ? e.getBoundingClientRect().y : null; });
  ok(found != null && y2 != null && Math.abs((found - y2) - 120) < 3, `[12] selection band follows a 120 px page scroll (y ${found} -> ${y2})`);
  await idle(p); await p.close2();
}
// ---- reduced motion still fine with the new paths
async function t14() {
  const p = await open({ width: 1280, height: 800 }, { rm: true }); await p.ev({ kind: 'session.start', agent: MAIN });
  await pre(p, 'o', 'Pricing.jsx'); await pre(p, 'h', 'Hero.jsx'); await post(p, 'h', 'Hero.jsx'); await sleep(1500); await post(p, 'o', 'Pricing.jsx');
  await idle(p, 8000); const s = await p.st();
  ok(s.landings.length === 2 && s.errors.length === 0, `[14] reduced-motion: parked + late edits both land (landings=${s.landings.length})`); await p.close2();
}
try {
  await Promise.all([t1(), t2(), t3(), t4(), t5(), t7(), t8(), t12(), t14()].map((x) => x.catch((e) => { console.log('  FAIL exception ' + e.message); failures++; })));
} finally { await browser.close(); server.close(); }
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL FIX CHECKS PASSED');
process.exit(failures ? 1 : 0);
