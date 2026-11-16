// Review screenshots, taken in real time with a locally installed Chrome (no dependencies).
// Usage: start the site, then `node tools/shots.mjs [http://127.0.0.1:4321]`. Writes PNGs to review/.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:4321';
const only = process.argv[3] || '';
const chromePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!chromePath) throw new Error('No Chrome found. Set CHROME_PATH.');

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'liveswarm-shots-'));
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('review', { recursive: true });

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = pages.find((p) => p.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw new Error('Chrome did not start');
}

const ws = new WebSocket(await connect());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const waiting = new Map();
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) {
    waiting.get(msg.id)(msg);
    waiting.delete(msg.id);
  }
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    waiting.set(id, (msg) => (msg.error ? rej(new Error(method + ': ' + msg.error.message)) : res(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
const js = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
async function shot(name, full = false) {
  const params = { format: 'png' };
  if (full) {
    const { cssContentSize } = await send('Page.getLayoutMetrics');
    params.captureBeyondViewport = true;
    params.clip = { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 };
  }
  const { data } = await send('Page.captureScreenshot', params);
  writeFileSync(join('review', name + '.png'), Buffer.from(data, 'base64'));
  console.log('  review/' + name + '.png');
}
async function open(path, { width, height, mobile = false, dpr = 1, dark = false, calm = false }) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' },
      { name: 'prefers-reduced-motion', value: calm ? 'reduce' : 'no-preference' },
    ],
  });
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(100);
  await send('Page.navigate', { url: base + path });
  return Date.now();
}
/** Take shots at given times (ms after navigation). A step may run some JS first. */
async function timeline(prefix, t0, steps) {
  for (const [at, name, run] of steps) {
    const wait = t0 + at - Date.now();
    if (wait > 0) await sleep(wait);
    if (run) await js(run);
    await shot(prefix + '-' + name);
  }
}
const state = `JSON.stringify({ build: document.documentElement.classList.contains('build'), hidden: document.querySelectorAll('[data-b]:not([data-b-on])').length, hud: document.querySelector('.lsw-ui .lsw-hud')?.textContent || null, cursors: [...document.querySelectorAll('.lsw-root .lsw-cur')].map(c => c.querySelector('.nm').textContent), replay: document.querySelector('[data-replay]')?.hidden ? null : document.querySelector('[data-replay]')?.textContent, overflowX: document.documentElement.scrollWidth - innerWidth })`;

const runs = {
  async desktop() {
    console.log('desktop 1440x900, build');
    let t0 = await open('/', { width: 1440, height: 900 });
    await timeline('desktop', t0, [
      [450, '0-first-frame'],
      [2700, '1-split'],
      [5600, '2-building'],
      [9200, '2b-paint'],
      [12600, '2c-command'],
      [17000, '3-first-screen-done'],
    ]);
    console.log('  state:', await js(state));
    await js(`document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 660)`);
    t0 = Date.now();
    await timeline('desktop', t0, [
      [900, '4-scroll-section-building'],
      [3600, '5-scroll-section-built'],
    ]);
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await sleep(200);
    console.log('  after Escape:', await js(state));
  },
  async phone() {
    console.log('phone 390x844, build (short version)');
    const t0 = await open('/', { width: 390, height: 844, mobile: true, dpr: 2 });
    await timeline('phone', t0, [
      [450, '0-first-frame'],
      [2400, '1-split'],
      [6200, '2-building'],
      [16500, '3-first-screen-built'],
    ]);
    console.log('  state:', await js(state));
  },
  async finished() {
    for (const [name, opts] of [
      ['finished-desktop-light', { width: 1440, height: 900 }],
      ['finished-desktop-dark', { width: 1440, height: 900, dark: true }],
      ['finished-phone', { width: 390, height: 844, mobile: true, dpr: 2 }],
    ]) {
      console.log(name);
      await open('/?nobuild', opts);
      await sleep(900);
      /* Walk the page once so lazy posters load, then capture all of it. */
      await js(`(async () => { document.documentElement.style.scrollBehavior = 'auto'; for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); await new Promise(r => setTimeout(r, 400)); })()`);
      await shot(name, true);
      console.log('  state:', await js(state));
    }
  },
  async calm() {
    console.log('reduced motion, desktop and phone');
    await open('/', { width: 1440, height: 900, calm: true });
    await sleep(1500);
    await shot('reduced-motion-desktop');
    console.log('  state:', await js(state));
    await open('/', { width: 390, height: 844, mobile: true, dpr: 2, calm: true });
    await sleep(1500);
    await shot('reduced-motion-phone');
    console.log('  state:', await js(state));
  },
};

try {
  for (const [name, run] of Object.entries(runs)) if (!only || only === name) await run();
} finally {
  ws.close();
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
