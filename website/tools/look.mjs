// Look at exact moments in a real Chrome with the GPU on: screenshots, input, frame time.
// Usage: node tools/look.mjs <base-url> '<json list of shots>'
//   shot: { name, path, w, h, mobile, dpr, wait, calm, actions: [["move",x,y],["down",x,y],["up",x,y],["scroll",y],["key","Escape"],["wait",ms],["shot","suffix"]] }
// Writes review/v2-<name>.png and prints the renderer and the swarm's frame time.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:4321';
const shots = JSON.parse(process.argv[3] || '[]');
const chromePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].filter(Boolean).find((p) => existsSync(p));
if (!chromePath) throw new Error('No Chrome found. Set CHROME_PATH.');
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'liveswarm-look-'));
const chrome = spawn(
  chromePath,
  ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-webgl', '--window-size=1920,1080', 'about:blank'],
  { stdio: 'ignore' },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('review', { recursive: true });
let url;
for (let i = 0; i < 80 && !url; i++) {
  try {
    url = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((p) => p.type === 'page')?.webSocketDebuggerUrl;
  } catch {}
  await sleep(150);
}
const ws = new WebSocket(url);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const waiting = new Map();
const errors = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) {
    waiting.get(msg.id)(msg);
    waiting.delete(msg.id);
  } else if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  else if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) errors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    waiting.set(id, (msg) => (msg.error ? rej(new Error(method + ': ' + msg.error.message)) : res(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
const js = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
await send('Runtime.enable');
await send('Page.enable');
const save = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join('review', 'v2-' + name + '.png'), Buffer.from(data, 'base64'));
};
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'none', pointerType: 'mouse', ...extra });

try {
  for (const s of shots) {
    const w = s.w || 1920;
    const h = s.h || 1080;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: s.dpr || 1, mobile: !!s.mobile });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: s.calm ? 'reduce' : 'no-preference' }] });
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(80);
    errors.length = 0;
    await send('Page.navigate', { url: base + s.path });
    await sleep(s.wait ?? 1500);
    for (const a of s.actions || []) {
      if (a[0] === 'move') {
        /* glide, so the flock feels a moving falcon */
        const [x0, y0] = s._at || [a[1] - 200, a[2] - 120];
        for (let i = 1; i <= 16; i++) {
          await mouse('mouseMoved', x0 + ((a[1] - x0) * i) / 16, y0 + ((a[2] - y0) * i) / 16);
          await sleep(16);
        }
        s._at = [a[1], a[2]];
      } else if (a[0] === 'down') await mouse('mousePressed', a[1], a[2], { button: 'left', clickCount: 1 });
      else if (a[0] === 'up') await mouse('mouseReleased', a[1], a[2], { button: 'left', clickCount: 1 });
      else if (a[0] === 'scroll') await js(`document.documentElement.style.scrollBehavior='auto'; scrollTo(0, ${a[1]} <= 1 ? ${a[1]} * (document.documentElement.scrollHeight - innerHeight) : ${a[1]})`);
      else if (a[0] === 'key') await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(a[1])} }))`);
      else if (a[0] === 'wait') await sleep(a[1]);
      else if (a[0] === 'js') console.log('  js:', await js(a[1]));
      else if (a[0] === 'ft') console.log('  frame time over 3 s:', await js(`new Promise(res => { const d = []; let last = performance.now(); const t0 = last; (function f(n) { d.push(n - last); last = n; if (n - t0 < 3000) requestAnimationFrame(f); else { d.shift(); d.sort((a, b) => a - b); res('avg ' + (d.reduce((a, b) => a + b, 0) / d.length).toFixed(2) + ' ms, p95 ' + d[Math.floor(d.length * 0.95)].toFixed(1) + ' ms, ' + d.length + ' frames'); } })(last); })`));
      else if (a[0] === 'shot') await save(s.name + '-' + a[1]);
    }
    await save(s.name);
    const info = await js(`JSON.stringify(window.__swarm ? { ms: +window.__swarm.stat.ms.toFixed(1), n: window.__swarm.count, t: +window.__swarm.time.toFixed(2), gpu: window.__swarm.renderer() } : { swarm: null })`);
    console.log(`v2-${s.name}.png  ${w}x${h}  ${info}${errors.length ? '  ERRORS: ' + [...new Set(errors)].join(' | ').slice(0, 600) : ''}`);
  }
} finally {
  ws.close();
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
