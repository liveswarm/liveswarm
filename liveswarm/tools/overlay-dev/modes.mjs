// Mode checks: replay mode, untagged (proxy) pages, reload persistence.
// Usage: node modes.mjs   (serves on an ephemeral 127.0.0.1 port, mock conductor on another; screenshots to dev/shots/modes-*.png)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'shots');
fs.mkdirSync(shots, { recursive: true });
const OVERLAY = path.join(here, '..', '..', 'plugin', 'overlay', 'overlay.js');
let PORT = 0, CPORT = 0; // ephemeral ports, filled in below

// A plain page with no source tags at all (what a Next.js / Astro / static site looks like through the proxy).
const PAGE = (cfg, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><title>Plain site</title>
<style>
 body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#f6f4ee;color:#1d1b26}
 .wrap{max-width:1000px;margin:0 auto;padding:0 28px}
 nav{display:flex;justify-content:space-between;padding:22px 0;font-weight:700}
 .hero{padding:50px 0 40px}.hero h1{font:700 52px/1.05 Georgia,serif;margin:0 0 14px}
 .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:20px 0}
 .card{background:#fff;border-radius:18px;padding:22px;box-shadow:0 0 0 1px #e4e0d6;min-height:120px}
 #slot{padding:30px 0}
 footer{padding:40px 0;color:#777}
</style>
<script>window.__LIVESWARM__=${JSON.stringify(cfg)};</script>
<script src="${cfg.src || '/overlay.js'}" defer></script></head>
<body><div class="wrap">
 <nav><span>Plainsite</span><span>Docs &middot; Pricing</span></nav>
 <section class="hero"><h1 id="h1">A site with no tags</h1><p id="lede">Nothing here was instrumented.</p></section>
 <section class="grid"><div class="card"><h3>One</h3><p>First card</p></div><div class="card" id="c2"><h3>Two</h3><p id="p2">Second card</p></div><div class="card"><h3>Three</h3><p>Third card</p></div></section>
 <section id="slot"></section>
 <footer>Plainsite 2026</footer>
</div>${extra}</body></html>`;

let conductorHits = [];
let helloAgents = [];
let helloSession = 'S1';
const conductor = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x').pathname;
  conductorHits.push(u);
  const cors = { 'access-control-allow-origin': '*' };
  if (u === '/overlay.js') { res.writeHead(200, { ...cors, 'content-type': 'text/javascript', 'cache-control': 'no-store' }).end(fs.readFileSync(OVERLAY)); return; }
  if (u === '/stream') {
    res.writeHead(200, { ...cors, 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
    res.write('event: swarm\ndata: ' + JSON.stringify({ v: 1, seq: 0, ts: Date.now(), session: helloSession, kind: 'hello', agents: helloAgents }) + '\n\n');
    return;
  }
  res.writeHead(404, cors).end('nf');
});
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x').pathname;
  const q = new URL(req.url, 'http://x').searchParams;
  const send = (body, type = 'text/html') => res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
  if (u === '/overlay.js') return send(fs.readFileSync(OVERLAY), 'text/javascript');
  // replay: conductor null; replay-c: a conductor URL is present but mode says replay
  if (u === '/replay') return send(PAGE({ conductor: null, mode: 'replay' }));
  if (u === '/replay-c') return send(PAGE({ conductor: `http://127.0.0.1:${CPORT}`, mode: 'replay' }));
  // proxy mode against the mock conductor (overlay itself comes from the conductor, like the real proxy)
  if (u === '/proxy') return send(PAGE({ conductor: `http://127.0.0.1:${CPORT}`, mode: 'proxy', src: `http://127.0.0.1:${CPORT}/overlay.js` }));
  // proxy mode, conductor down (nothing listens on 5199): restore must work from sessionStorage alone
  if (u === '/proxy-down') return send(PAGE({ conductor: 'http://127.0.0.1:5199', mode: 'proxy' }));
  res.writeHead(404).end('nf');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
await new Promise((r) => conductor.listen(0, '127.0.0.1', r));
PORT = server.address().port; CPORT = conductor.address().port;
const O = `http://127.0.0.1:${PORT}`;

function pickChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try { const p = chromium.executablePath(); if (fs.existsSync(p)) return undefined; } catch {}
  const cache = path.join(process.env.HOME, 'Library/Caches/ms-playwright');
  const dirs = fs.readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
  for (const d of dirs) { const p = path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'); if (fs.existsSync(p)) return p; }
}
let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: pickChromium() });
const MAIN = { id: 'main', type: 'main', label: 'main', parent: null };
const SUB = { id: 'sub1', type: 'general-purpose', label: 'Build pricing', parent: 'main' };

async function open(urlPath, ctxOpts = {}) {
  const ctx = ctxOpts.ctx || await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.ctx = ctx; page.errs = []; page.reqs = [];
  page.on('pageerror', (e) => page.errs.push(e.message));
  page.on('request', (r) => page.reqs.push(r.url()));
  page.on('console', (m) => { if (m.type() === 'error' && !/:5199/.test(m.location().url || '') && !/:5199/.test(m.text()) && !/ERR_CONNECTION_REFUSED/.test(m.text())) page.errs.push(m.text()); });
  await page.addInitScript(() => { const o = Element.prototype.attachShadow; Element.prototype.attachShadow = function (i) { const r = o.call(this, { ...i, mode: 'open' }); if (this.localName === 'liveswarm-overlay') window.__sr = r; return r; }; });
  await page.goto(O + urlPath);
  await page.waitForFunction(() => window.Liveswarm && window.__sr, null, { timeout: 8000 });
  page.ev = (o) => page.evaluate((o) => window.Liveswarm.ingest({ v: 1, seq: 0, ts: Date.now(), session: 'S1', ...o }), o);
  page.st = () => page.evaluate(() => JSON.parse(JSON.stringify(window.Liveswarm.state)));
  page.idle = (ms = 30000) => page.waitForFunction(() => window.Liveswarm.state.idle, null, { timeout: ms });
  return page;
}
const F = '/proj/src/App.jsx';
const pre = (p, id, file = F, agent = MAIN, tool = 'Edit') => p.ev({ kind: 'tool.pre', agent, tool, toolUseId: id, file, summary: path.basename(file) });
const post = (p, id, file = F, agent = MAIN, extra = {}) => p.ev({ kind: 'tool.post', agent, tool: 'Edit', toolUseId: id, file, range: [8, 9], added: 2, removed: 1, ok: true, ...extra });

// ---------------------------------------------------------------- 1. replay mode
async function replay(urlPath) {
  conductorHits = [];
  const p = await open(urlPath);
  await sleep(600);
  const s0 = await p.st();
  const external = p.reqs.filter((u) => !u.startsWith(O) && !u.startsWith('data:'));
  ok(conductorHits.length === 0 && external.length === 0, `[replay ${urlPath}] no request reached any conductor (conductor hits=${conductorHits.length}, external=${external.length})`);
  ok(!p.reqs.some((u) => /\/stream/.test(u)), `[replay ${urlPath}] no /stream request from the page`);
  ok(s0.hud && s0.hud.state === 'replay' && !s0.connected && !s0.connecting, `[replay ${urlPath}] HUD status reads replay (${JSON.stringify(s0.hud)})`);
  await p.ev({ kind: 'session.start', agent: MAIN });
  await p.ev({ kind: 'agent.start', agent: SUB });
  await pre(p, 'r1'); await post(p, 'r1');
  await p.evaluate(() => { document.getElementById('h1').textContent = 'Replayed headline'; });
  await p.idle();
  const s = await p.st();
  ok(s.agents.length === 2 && s.edits === 1 && s.landings.length === 1, `[replay ${urlPath}] ingest still drives everything (agents=${s.agents.length} edits=${s.edits} landings=${s.landings.length})`);
  ok(s.hud.state === 'replay', `[replay ${urlPath}] HUD still replay after events`);
  if (urlPath === '/replay') await p.screenshot({ path: path.join(shots, 'modes-replay-hud.png') });
  ok(p.errs.length === 0 && s.errors.length === 0, `[replay ${urlPath}] no errors ${p.errs.join('|')}${s.errors[0] || ''}`);
  await p.ctx.close();
}

// ---------------------------------------------------------------- 2. untagged landings
async function untagged() {
  helloAgents = [];
  const p = await open('/proxy');
  await p.ev({ kind: 'session.start', agent: MAIN });
  // a. mutation landing: the DOM changes shortly after the Post (HMR-like, ~400 ms later)
  await pre(p, 'u1');
  await post(p, 'u1');
  await sleep(400);
  await p.evaluate(() => { document.getElementById('p2').textContent = 'Second card, now with a longer sentence that was just edited by an agent'; document.getElementById('c2').style.background = '#fff6d8'; });
  await p.idle();
  let s = await p.st();
  const l1 = s.landings[s.landings.length - 1];
  ok(l1 && l1.resolver === 'mutation', `[untagged] edit followed by a DOM change lands via the mutation fallback (resolver=${l1 && l1.resolver})`);
  const c2 = await p.evaluate(() => { const r = document.getElementById('c2').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
  ok(l1 && l1.rect && l1.rect.x < c2.r && l1.rect.x + l1.rect.w > c2.l && l1.rect.y < c2.b && l1.rect.y + l1.rect.h > c2.t, `[untagged] mutation landing rect overlaps the changed card (rect=${JSON.stringify(l1 && l1.rect)})`);
  await pre(p, 'u1b'); await post(p, 'u1b');
  await sleep(500);
  await p.evaluate(() => { document.getElementById('c2').querySelector('h3').textContent = 'Two (edited)'; });
  await sleep(450);
  await p.screenshot({ path: path.join(shots, 'modes-untagged-landing.png') });
  await p.idle();
  // b. slow HMR: DOM changes ~1.6 s after the Post, still found with the widened window
  await pre(p, 'u2'); await post(p, 'u2');
  await sleep(1600);
  await p.evaluate(() => { const d = document.createElement('div'); d.className = 'card'; d.id = 'late'; d.textContent = 'Late card from a slow rebuild'; document.getElementById('slot').appendChild(d); });
  await p.idle();
  s = await p.st();
  const l2 = s.landings[s.landings.length - 1];
  ok(l2 && l2.resolver === 'mutation', `[untagged] a slow rebuild (DOM change 1.6 s after Post) still lands on the change (resolver=${l2 && l2.resolver})`);
  // c. nothing mutates: dock, no guessing
  await pre(p, 'u3', '/proj/server/db.js'); await post(p, 'u3', '/proj/server/db.js');
  await p.idle();
  s = await p.st();
  const l3 = s.landings[s.landings.length - 1];
  ok(l3 && l3.resolver === 'dock', `[untagged] a backend edit with no DOM change uses the edge dock (resolver=${l3 && l3.resolver}, dock=${JSON.stringify(s.dock)})`);
  await p.screenshot({ path: path.join(shots, 'modes-untagged-dock.png') });
  // d. a CSS-only edit with no visible DOM change docks too
  await pre(p, 'u4', '/proj/src/app.css'); await post(p, 'u4', '/proj/src/app.css');
  await p.idle();
  s = await p.st();
  const l4 = s.landings[s.landings.length - 1];
  ok(l4 && l4.resolver === 'dock', `[untagged] a stylesheet edit with no DOM change docks (resolver=${l4 && l4.resolver})`);
  // e. constant background mutation (a clock) must not be mistaken for the edit
  await p.evaluate(() => { window.__tick = setInterval(() => { document.getElementById('lede').textContent = 'tick ' + Date.now(); }, 60); });
  await sleep(1200);
  await pre(p, 'u5', '/proj/server/api.js'); await post(p, 'u5', '/proj/server/api.js');
  await p.idle();
  await p.evaluate(() => clearInterval(window.__tick));
  s = await p.st();
  const l5 = s.landings[s.landings.length - 1];
  ok(l5 && l5.resolver === 'dock', `[untagged] constantly-mutating elements are ignored, backend edit still docks (resolver=${l5 && l5.resolver})`);
  ok(p.errs.length === 0 && s.errors.length === 0, `[untagged] no errors ${p.errs.join('|')}${s.errors[0] || ''}`);
  await p.ctx.close();
}

// ---------------------------------------------------------------- 3. reload persistence
async function persistence(urlPath, withHello) {
  helloAgents = withHello ? [MAIN, SUB] : [];
  const tag = `[reload ${withHello ? 'hello' : 'storage-only'}]`;
  const p = await open(urlPath);
  await p.ev({ kind: 'session.start', agent: MAIN });
  await p.ev({ kind: 'agent.start', agent: SUB });
  await pre(p, 'p1', F, SUB); await post(p, 'p1', F, SUB);
  await p.evaluate(() => { document.getElementById('p2').textContent = 'changed for persistence'; });
  await pre(p, 'p2', F, MAIN); await post(p, 'p2', F, MAIN);
  await p.evaluate(() => { document.getElementById('h1').textContent = 'changed again'; });
  await p.idle();
  await sleep(500);
  const a = await p.st();
  ok(a.agents.length === 2 && a.edits === 2, `${tag} before reload: 2 agents, 2 edits`);
  const subBefore = a.agents.find((g) => g.id === 'sub1'), mainBefore = a.agents.find((g) => g.id === 'main');
  await p.reload();
  await p.waitForFunction(() => window.Liveswarm && window.__sr, null, { timeout: 8000 });
  await sleep(withHello ? 900 : 500);
  const b = await p.st();
  const sub = b.agents.find((g) => g.id === 'sub1'), main = b.agents.find((g) => g.id === 'main');
  ok(b.agents.length === 2 && sub && main, `${tag} both agents are back after a full page reload (agents=${b.agents.map((g) => g.id)})`);
  ok(sub && sub.label === 'Build pricing' && sub.parent === 'main', `${tag} subagent label and parent restored (${sub && sub.label}/${sub && sub.parent})`);
  ok(sub && sub.color === subBefore.color && main.color === mainBefore.color, `${tag} agent colours are stable across the reload`);
  ok(b.edits === 2, `${tag} edit counter restored (edits=${b.edits})`);
  ok(sub && Math.hypot(sub.x - subBefore.x, sub.y - subBefore.y) < 40, `${tag} cursor position restored (dx=${sub && Math.round(sub.x - subBefore.x)} dy=${sub && Math.round(sub.y - subBefore.y)})`);
  ok(b.elapsed >= a.elapsed, `${tag} HUD clock keeps running from before the reload (${Math.round(a.elapsed)} -> ${Math.round(b.elapsed)} ms)`);
  await p.screenshot({ path: path.join(shots, withHello ? 'modes-reload-hello.png' : 'modes-reload-storage.png') });
  // a restored session keeps working: a new event lands on the restored cursor
  await pre(p, 'p3', F, SUB); await post(p, 'p3', F, SUB);
  await p.evaluate(() => { document.getElementById('lede').textContent = 'after the reload'; });
  await p.idle();
  const c = await p.st();
  ok(c.agents.length === 2 && c.edits === 3 && c.landings.length === 1, `${tag} new events work after restore (agents=${c.agents.length} edits=${c.edits} landings=${c.landings.length})`);
  ok(p.errs.length === 0 && c.errors.length === 0, `${tag} no errors ${p.errs.join('|')}${c.errors[0] || ''}`);
  if (withHello) {
    // hello is the authority on who is alive: a restored agent the conductor no longer lists goes away
    helloAgents = [MAIN];
    await p.reload();
    await p.waitForFunction(() => window.Liveswarm && window.__sr, null, { timeout: 8000 });
    await sleep(1500);
    const d = await p.st();
    ok(d.agents.length === 1 && d.agents[0].id === 'main', `${tag} agent missing from the conductor hello is dropped (agents=${d.agents.map((g) => g.id)})`);
    // a different Claude session id in the hello starts clean
    helloSession = 'S2'; helloAgents = [{ id: 'main', type: 'main', label: 'main', parent: null }];
    await p.reload();
    await p.waitForFunction(() => window.Liveswarm && window.__sr, null, { timeout: 8000 });
    await sleep(900);
    const e = await p.st();
    ok(e.edits === 0 && e.agents.length === 1, `${tag} a hello from a different session does not inherit old counters (edits=${e.edits} agents=${e.agents.length})`);
    helloSession = 'S1';
  }
  await p.ctx.close();
}

// ---------------------------------------------------------------- 4. live session switch + early edit
async function sessionsAndEarly() {
  helloAgents = []; helloSession = 'S1';
  const p = await open('/proxy');
  await p.ev({ kind: 'session.start', agent: MAIN });
  await p.ev({ kind: 'agent.start', agent: { id: 'zz', type: 'general-purpose', label: 'zz', parent: 'main' } });
  await pre(p, 's1'); await post(p, 's1'); await p.idle();
  let s = await p.st();
  ok(s.agents.length === 2 && s.edits === 1, '[session] S1 has 2 agents and 1 edit');
  await p.evaluate(() => window.Liveswarm.ingest({ v: 1, seq: 0, ts: Date.now(), session: 'S3', kind: 'hello', agents: [{ id: 'main', type: 'main', label: 'main', parent: null }, { id: 'q', type: 'general-purpose', label: 'q', parent: 'main' }] }));
  s = await p.st();
  ok(s.agents.map((g) => g.id).sort().join() === 'main,q' && s.edits === 0, `[session] live hello with a new session id resets (agents=${s.agents.map((g) => g.id)} edits=${s.edits})`);
  await p.evaluate(() => window.Liveswarm.ingest({ v: 1, seq: 0, ts: Date.now(), session: 'S1', kind: 'agent.start', agent: { id: 'ghost', type: 'x', label: 'ghost', parent: 'main' } }));
  s = await p.st();
  ok(!s.agents.some((g) => g.id === 'ghost'), '[session] a stray event from another session is ignored');
  await p.evaluate(() => window.Liveswarm.ingest({ v: 1, seq: 0, ts: Date.now(), session: 'S4', kind: 'session.start', agent: { id: 'main', type: 'main', label: 'main', parent: null } }));
  s = await p.st();
  ok(s.agents.length === 1 && s.edits === 0, '[session] session.start from a new session resets');
  ok(p.errs.length === 0 && s.errors.length === 0, '[session] no errors');
  await p.ctx.close();

  // an edit landing right after page load (reload caused by the edit) must still resolve on the changed card
  helloSession = 'S1';
  const q = await open('/proxy');
  await q.reload();
  await q.waitForFunction(() => window.Liveswarm && window.__sr, null, { timeout: 8000 });
  await q.ev({ kind: 'session.start', agent: MAIN });
  await pre(q, 'e1'); await post(q, 'e1');
  await sleep(400);
  await q.evaluate(() => { document.getElementById('p2').textContent = 'Second card, rewritten right after the page loaded'; });
  await q.idle();
  const t = await q.st();
  const l = t.landings[t.landings.length - 1];
  const c2 = await q.evaluate(() => { const r = document.getElementById('c2').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
  ok(l && l.resolver === 'mutation' && l.rect && l.rect.x < c2.r && l.rect.x + l.rect.w > c2.l && l.rect.y < c2.b && l.rect.y + l.rect.h > c2.t && l.rect.h < 400, `[early] edit 400 ms after load lands on the changed card (resolver=${l && l.resolver} rect=${JSON.stringify(l && l.rect)})`);
  await q.ctx.close();
}

try {
  console.log('== replay mode');
  await replay('/replay'); await replay('/replay-c');
  console.log('== untagged page');
  await untagged();
  console.log('== reload persistence');
  await persistence('/proxy-down', false);
  await persistence('/proxy', true);
  console.log('== session switch + early edit');
  await sessionsAndEarly();
} catch (e) { console.log('  FAIL exception: ' + (e && e.stack || e)); failures++; }
await browser.close(); server.close(); conductor.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
