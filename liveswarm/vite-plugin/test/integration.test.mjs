import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, build } from 'vite';
import { chromium } from 'playwright';

const appDir = fileURLToPath(new URL('./app/', import.meta.url));
const appFile = path.join(appDir, 'src/App.jsx');
const original = fs.readFileSync(appFile, 'utf8');
const URL_ = 'http://127.0.0.1:5181';
const IGNORED = /overlay\.js|ERR_CONNECTION_REFUSED|Failed to load resource/;
let server, browser, page;
const logs = [];
const badLogs = () => logs.filter((l) => ['error', 'warning', 'pageerror'].includes(l.type) && !IGNORED.test(l.text));

before(async () => {
  server = await createServer({ configFile: path.join(appDir, 'vite.config.js'), logLevel: 'error' });
  await server.listen();
  // Playwright's bundled chromium may not be installed for this exact version; fall back to system Chrome.
  browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  page = await browser.newPage();
  page.on('console', (m) => logs.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', (e) => logs.push({ type: 'pageerror', text: String(e) }));
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForSelector('#title');
});

after(async () => {
  fs.writeFileSync(appFile, original);
  await browser?.close();
  await server?.close();
});

test('(a) transformed module contains data-swarm', async () => {
  const body = await (await fetch(`${URL_}/src/App.jsx`)).text();
  assert.match(body, /data-swarm/);
  assert.match(body, /src\/App\.jsx:\d+-\d+/);
});

test('(b) index.html has injected config + overlay tag, in order', async () => {
  const html = await (await fetch(`${URL_}/`)).text();
  const root = fs.realpathSync.native(appDir).replace(/\/$/, '');
  const cfg = `<script>window.__LIVESWARM__={root:${JSON.stringify(root)},conductor:"http://127.0.0.1:7777"}</script>`;
  const ov = '<script src="http://127.0.0.1:7777/overlay.js" defer></script>';
  assert.ok(html.includes(cfg), 'config script');
  assert.ok(html.includes(ov), 'overlay script');
  assert.ok(html.indexOf(cfg) < html.indexOf(ov));
  assert.ok(html.indexOf(ov) < html.indexOf('</head>'));
});

test('(c) rendered DOM has correct data-swarm values and no React warnings', async () => {
  const attr = (sel, a) => page.getAttribute(sel, a);
  const lines = original.split('\n');
  const L = (needle) => lines.findIndex((l) => l.includes(needle)) + 1;
  const span = (a, b) => `src/App.jsx:${L(a)}-${L(b)}`;
  assert.equal(await attr('#app', 'data-swarm'), span('<main', '</main>'));
  assert.equal(await attr('#title', 'data-swarm'), span('<h1', '<h1'));
  assert.equal(await attr('#inc', 'data-swarm'), span('<button', '</button>'));
  assert.equal(await attr('#list', 'data-swarm'), span('<ul', '</ul>'));
  assert.equal(await attr('#small', 'data-swarm'), span('id="small"', 'id="small"'));
  assert.equal(await attr('#frag', 'data-swarm'), span('id="frag"', 'id="frag"'));
  assert.equal(await attr('#card', 'data-swarm-site'), span('<Card', '</Card>'));
  assert.equal(await attr('#card', 'data-swarm'), 'src/Card.jsx:3-6');
  assert.equal(await attr('#panel', 'data-swarm-site'), span('<ui.Panel', '<ui.Panel'));
  assert.equal(await attr('#panel', 'data-swarm'), span('<section {...props}', '<section {...props}'));
  assert.equal(await page.locator('[data-swarm*="Fragment"]').count(), 0);
  assert.deepEqual(badLogs(), []);
});

test('(d) HMR works after editing a file', async () => {
  await page.evaluate(() => (window.__marker = 'alive'));
  await page.click('#inc');
  assert.equal(await page.textContent('#inc'), 'count 1');
  fs.writeFileSync(appFile, original.replace('Hello liveswarm', 'Hello HMR'));
  await page.waitForFunction(() => document.querySelector('#title')?.textContent === 'Hello HMR', null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => window.__marker), 'alive', 'no full reload');
  assert.equal(await page.textContent('#inc'), 'count 1', 'state preserved');
  assert.match(await page.getAttribute('#title', 'data-swarm'), /^src\/App\.jsx:\d+-\d+$/);
  assert.deepEqual(badLogs(), []);
});

test('(e) vite build output has no data-swarm and no liveswarm script', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-build-'));
  try {
    await build({ configFile: path.join(appDir, 'vite.config.js'), logLevel: 'error', mode: 'production', build: { outDir, emptyOutDir: true } });
    let all = '';
    for (const f of fs.readdirSync(outDir, { recursive: true })) {
      const p = path.join(outDir, f);
      if (fs.statSync(p).isFile()) all += fs.readFileSync(p, 'utf8');
    }
    assert.ok(all.length > 1000);
    assert.ok(!/data-swarm/.test(all), 'no data-swarm');
    assert.ok(!/__LIVESWARM__|overlay\.js|127\.0\.0\.1:7777/.test(all), 'no liveswarm script');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
