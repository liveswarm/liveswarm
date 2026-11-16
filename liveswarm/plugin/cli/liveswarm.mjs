#!/usr/bin/env node
// Liveswarm CLI. Zero npm dependencies (record resolves playwright-core lazily).
//   liveswarm demo | watch | record | setup | doctor | help
// Exit codes: 0 ok, 1 error, 2 bad usage.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import http from 'node:http';
import readline from 'node:readline';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startProxy } from './proxy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..');
const HOME = process.env.LIVESWARM_HOME || path.join(os.homedir(), '.liveswarm');
const CPORT = Number(process.env.LIVESWARM_PORT) || 7777;
const CONDUCTOR = `http://127.0.0.1:${CPORT}`;
const STATE = path.join(HOME, `proxy-${process.pid}.json`);
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin/plugin.json'), 'utf8')).version; } catch { return 'unknown'; } })();

const out = (...a) => console.log(...a);
const err = (...a) => console.error(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wantsHelp = (argv) => argv.includes('--help') || argv.includes('-h');
const cmdHelp = (name) => {
  const lines = HELP.split('\n'), i = lines.findIndex((l) => l.startsWith(`  ${name} `));
  let j = i + 1; while (j < lines.length && /^ {10,}/.test(lines[j])) j++;
  out(`liveswarm ${name}\n\n${lines.slice(i, j).join('\n')}`); return 0;
};
class Usage extends Error {}
const usage = (m) => { throw new Usage(m); };

// ---------------------------------------------------------------- args
// spec: { name: 'str' | 'int' | 'bool' }. With rest:true unknown flags are returned in `extra` (for record -> film).
function parse(argv, spec, { rest = false } = {}) {
  const o = {}, extra = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) usage(`unexpected argument "${a}"`);
    const [k, inline] = a.slice(2).split(/=(.*)/s);
    const t = spec[k];
    if (!t) { if (rest) { extra.push(a); if (argv[i + 1] && !argv[i + 1].startsWith('--')) extra.push(argv[++i]); continue; } usage(`unknown option ${a}`); }
    if (t === 'bool') { o[k] = true; continue; }
    const v = inline ?? argv[++i];
    if (v === undefined || v === '' || (v.startsWith('--') && inline === undefined)) usage(`--${k} needs a value`);
    if (t === 'int') { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 65535) usage(`--${k} must be a port number (1-65535), got "${v}"`); o[k] = n; } else o[k] = v;
  }
  return { o, extra };
}

// ---------------------------------------------------------------- helpers
function portTaken(port) {
  return new Promise((resolve) => { const s = net.connect({ host: '127.0.0.1', port }); s.once('connect', () => { s.destroy(); resolve(true); }); s.once('error', () => resolve(false)); s.setTimeout(800, () => { s.destroy(); resolve(false); }); });
}
function portOwner(port) {
  const r = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fc'], { encoding: 'utf8' });
  const m = r.status === 0 && /\nc(.+)/.exec('\n' + r.stdout);
  return m ? ` (${m[1]})` : '';
}
async function healthy(port = CPORT) {
  try { const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(800) }); return r.ok && (await r.json()).ok === true; } catch { return false; }
}

// Start the conductor if /health is down (same as hooks' ensure.sh), wait up to 3 s.
async function ensureConductor() {
  if (await healthy()) return true;
  const ensure = path.join(PLUGIN, 'scripts/ensure.sh'), cond = path.join(PLUGIN, 'conductor/conductor.mjs');
  if (process.platform !== 'win32' && fs.existsSync(ensure)) {
    spawnSync('sh', [ensure], { stdio: 'ignore', env: process.env, timeout: 5000 });
  } else if (fs.existsSync(cond)) {
    fs.mkdirSync(HOME, { recursive: true, mode: 0o700 });
    const log = fs.openSync(path.join(HOME, 'conductor.log'), 'a');
    spawn(process.execPath, [cond], { detached: true, stdio: ['ignore', log, log], env: process.env }).unref();
  }
  for (let i = 0; i < 30; i++) { if (await healthy()) return true; await sleep(100); }
  return false;
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try { const c = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' }); c.on('error', () => out(`(could not open a browser; open ${url} yourself)`)); c.unref(); } catch { out(`(open ${url} in your browser)`); }
}

const cmdOk = (cmd, args = ['--version']) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); return r.error || r.status !== 0 ? null : (r.stdout || r.stderr || '').split('\n')[0].split(' ').slice(0, 3).join(' '); };
function findChrome() {
  const c = process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : process.platform === 'win32' ? [process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe', process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe', process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/google/chrome/chrome'];
  const hit = c.find((p) => p && fs.existsSync(p));
  if (hit || process.platform !== 'linux') return hit || null;
  c.push('/snap/bin/chromium', '/usr/bin/chrome');
  for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const r = spawnSync('which', [n], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) c.push(r.stdout.trim());
  }
  return c.find((p) => p && fs.existsSync(p)) || null;
}
const ffmpegHint = () => (process.platform === 'darwin' ? 'brew install ffmpeg' : process.platform === 'win32' ? 'winget install ffmpeg' : 'sudo apt install ffmpeg (or your package manager)');

async function ask(q) {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = await new Promise((r) => rl.question(q, r));
  rl.close();
  return /^y(es)?$/i.test(a.trim());
}

function waitForExit(cleanup) {
  return new Promise((resolve) => {
    let n = 0;
    const stop = async () => { if (n++) process.exit(130); setTimeout(() => process.exit(0), 1500).unref(); await cleanup(); resolve(); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  });
}

// ---------------------------------------------------------------- doctor
async function doctor() {
  let bad = false;
  const row = (ok, name, detail, hint) => { out(`  ${ok === true ? '[ok]  ' : ok === 'warn' ? '[warn]' : '[FAIL]'} ${name.padEnd(10)} ${detail}`); if (hint) out(`         -> ${hint}`); };
  out(`Liveswarm ${VERSION}  (plugin: ${PLUGIN})\n`);
  const major = Number(process.versions.node.split('.')[0]);
  row(major >= 20, 'node', `v${process.versions.node}`, major >= 20 ? null : 'Node 20+ required (22 recommended)'); if (major < 20) bad = true;
  const curl = cmdOk('curl');
  row(!!curl, 'curl', curl || 'not found', curl ? null : 'hooks send events with curl; install it'); if (!curl) bad = true;
  const up = await healthy();
  const taken = !up && (await portTaken(CPORT));
  if (taken) bad = true;
  row(up ? true : taken ? false : 'warn', 'conductor', up ? `running on ${CONDUCTOR}` : taken ? `port ${CPORT} is used by another program${portOwner(CPORT)}` : `not running on port ${CPORT} (starts automatically with watch, or with your next Claude Code session)`,
    taken ? `Liveswarm needs that port. Quit that program, or pick a free port for both Claude Code and Liveswarm: export LIVESWARM_PORT=7787 in your shell profile, then restart Claude Code.` : null);
  const chrome = findChrome();
  row(chrome ? true : 'warn', 'chrome', chrome || 'not found (only `record` needs it)', chrome ? null : 'install Google Chrome to use `record`');
  const ff = cmdOk('ffmpeg', ['-version']);
  row(ff ? true : 'warn', 'ffmpeg', ff || 'not found (only `record` needs it)', ff ? null : ffmpegHint());
  out(`  [ok]   ${'plugin'.padEnd(10)} version ${VERSION}`);
  out(bad ? '\nSomething required is missing (see above).' : '\nReady. Try: /liveswarm:demo');
  return bad ? 1 : 0;
}

// ---------------------------------------------------------------- demo
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json', '.wasm': 'application/wasm' };

function listenFrom(server, port, strict) {
  return new Promise((resolve, reject) => {
    const go = (p) => {
      const bad = (e) => { server.off('listening', ok); if (e.code === 'EADDRINUSE' && !strict && p < port + 100) go(p + 1); else reject(e); };
      const ok = () => { server.off('error', bad); resolve(server.address().port); };
      server.once('error', bad); server.once('listening', ok); server.listen(p, '127.0.0.1');
    };
    go(port);
  });
}

async function demo(argv) {
  if (wantsHelp(argv)) return cmdHelp('demo');
  const { o } = parse(argv, { port: 'int', 'no-open': 'bool', dir: 'str' });
  const dir = path.resolve(o.dir || path.join(PLUGIN, 'demo'));
  const overlay = path.join(PLUGIN, 'overlay/overlay.js');
  if (!fs.existsSync(path.join(dir, 'index.html'))) { err(`demo bundle not found at ${dir} (no index.html).`); return 1; }
  if (!fs.existsSync(overlay)) { err(`overlay not found at ${overlay}.`); return 1; }
  const server = http.createServer((req, res) => {
    let p; try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    if (p.includes('\0')) { res.writeHead(400).end('bad request'); return; }
    let file = p === '/overlay.js' ? overlay : path.join(dir, p.endsWith('/') ? p + 'index.html' : p);
    if (file !== overlay && path.relative(dir, file).startsWith('..')) { res.writeHead(403).end('forbidden'); return; }
    try { fs.statSync(file); } catch { /* handled below */ }
    fs.stat(file, (e, st) => {
      if (!e && st.isDirectory()) { file = path.join(file, 'index.html'); }
      fs.readFile(file, (e2, buf) => {
        if (e2) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
        res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache', 'content-length': buf.length });
        res.end(req.method === 'HEAD' ? undefined : buf);
      });
    });
  });
  server.on('clientError', (_e, sock) => { try { sock.destroy(); } catch {} });
  let port;
  try { port = await listenFrom(server, o.port || 7790, !!o.port); } catch (e) { err(e.code === 'EADDRINUSE' ? `port ${o.port} is already in use.` : `cannot start the demo server: ${e.message}`); return 1; }
  const url = `http://127.0.0.1:${port}/`;
  out(`Liveswarm demo: ${url}`);
  out('Replay of a real Claude Code session. No setup, nothing leaves your machine. Ctrl-C to stop.');
  if (!o['no-open']) openBrowser(url);
  await waitForExit(() => new Promise((r) => { server.close(() => r()); server.closeAllConnections?.(); }));
  return 0;
}

// ---------------------------------------------------------------- watch
const DEV_PORTS = [3000, 3001, 3002, 3003, 3004, 3005, 4200, 4321, 5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180, 8000, 8080, 8888];
const MARKERS = [[/\/@vite\/client/, 'Vite', 100], [/\/_next\//, 'Next.js', 100], [/astro-dev-toolbar|\/@id\/astro|data-astro-cid/i, 'Astro', 100], [/webpack-dev-server|__webpack_hmr|sockjs-node/, 'webpack', 90], [/livereload|browser-sync/i, 'live-reload server', 50]];

async function probePort(port) {
  for (const host of ['127.0.0.1', 'localhost']) {
    const alive = await new Promise((r) => { const s = net.connect({ port, host, timeout: 400 }); s.once('connect', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); s.once('timeout', () => { s.destroy(); r(false); }); });
    if (!alive) continue;
    try {
      const r = await fetch(`http://${host}:${port}/`, { headers: { accept: 'text/html' }, redirect: 'manual', signal: AbortSignal.timeout(5000) });
      const body = (await r.text()).slice(0, 300000);
      const html = /text\/html/i.test(r.headers.get('content-type') || '');
      const ok = r.status === 200 && html, soft = (r.status >= 300 && r.status < 500) || (r.status === 200 && !html);   // redirects (i18n, auth), 404 at /
      if (ok || soft) {
        const m = ok || html ? MARKERS.find(([re]) => re.test(body)) : null;
        const hdr = [...r.headers.keys()].join(' ');
        const m2 = m || (/x-powered-by/.test(hdr) && /next\.js/i.test(r.headers.get('x-powered-by') || '') ? [0, 'Next.js', 80] : null);
        return { port, host, url: `http://${host}:${port}`, kind: m2 ? m2[1] : 'static / other', score: (m2 ? m2[2] : 0) - (ok ? 0 : 20) };
      }
    } catch { /* try next host */ }
  }
  return null;
}

async function findDevServer() {
  const skip = new Set([CPORT, ...(process.env.LIVESWARM_SKIP_PORTS || '').split(',').map(Number).filter(Boolean)]);
  const ports = DEV_PORTS.filter((p) => !skip.has(p));   // 7777, the 7780+ proxy range and the 7790 demo are not in the list
  const found = (await Promise.all(ports.map(probePort))).filter(Boolean);
  found.forEach((f) => { f.rank = ports.indexOf(f.port); });
  found.sort((a, b) => b.score - a.score || a.rank - b.rank);
  return found;
}

async function watch(argv) {
  if (wantsHelp(argv)) return cmdHelp('watch');
  const { o } = parse(argv, { url: 'str', port: 'int', 'no-open': 'bool' });
  if (!(await ensureConductor())) { err((await portTaken(CPORT)) ? `port ${CPORT} is used by another program${portOwner(CPORT)}, so Liveswarm cannot start. Run /liveswarm:doctor for the fix.` : `could not start the conductor on port ${CPORT} (see ${path.join(HOME, 'conductor.log')}). Run /liveswarm:doctor for details.`); return 1; }
  let upstream = o.url;
  if (upstream) {
    if (!/^https?:\/\//i.test(upstream)) upstream = 'http://' + upstream;
    try { new URL(upstream); } catch { usage(`--url is not a valid URL: ${o.url}`); }
  } else {
    const found = await findDevServer();
    if (!found.length) { err('No dev server found on 127.0.0.1/localhost (tried ports 3000-3005, 4200, 4321, 5173-5180, 8000, 8080, 8888).\nStart your app, or pass its address: /liveswarm:watch --url http://localhost:PORT'); return 1; }
    if (found.length > 1) { out('Found:'); found.forEach((f, i) => out(`  ${i === 0 ? '*' : ' '} ${f.url}  ${f.kind}`)); }
    upstream = found[0].url;
    if (found.length > 1) out(`Using ${upstream} (override with --url).`);
  }
  const startPath = (() => { try { const u = new URL(upstream); const p = u.pathname + u.search + u.hash; return p === '/' ? '' : p; } catch { return ''; } })();
  let proxy;
  try { proxy = await startProxy({ upstream, conductor: CONDUCTOR, port: o.port, onNotice: (m) => out(`note: ${m}`) }); }
  catch (e) { err(e.code === 'EADDRINUSE' ? `port ${o.port} is already in use.` : `cannot start the proxy: ${e.message}`); return 1; }
  try { fs.mkdirSync(HOME, { recursive: true, mode: 0o700 }); fs.writeFileSync(STATE, JSON.stringify({ pid: process.pid, url: proxy.url, upstream, port: proxy.port })); } catch { /* record falls back to --url */ }
  out(`Watching ${upstream} at ${proxy.url}`);
  out('Run Claude Code in your project: every agent shows up as a cursor on this page. Ctrl-C to stop.');
  if (!o['no-open']) openBrowser(proxy.url.replace(/\/$/, '') + (startPath || '/'));
  await waitForExit(async () => {
    try { fs.writeFileSync(STATE, '{}'); } catch {}
    await proxy.close();
  });
  return 0;
}

function runningProxyUrl() {
  let best = null;
  try {
    for (const f of fs.readdirSync(HOME)) {
      if (!/^proxy(-\d+)?\.json$/.test(f)) continue;
      try { const st = fs.statSync(path.join(HOME, f)); const s = JSON.parse(fs.readFileSync(path.join(HOME, f), 'utf8')); if (s.pid) { process.kill(s.pid, 0); if (!best || st.mtimeMs > best.t) best = { t: st.mtimeMs, url: s.url }; } } catch { /* stale */ }
    }
  } catch { /* none */ }
  return best && best.url;
}

// ---------------------------------------------------------------- setup
function lineDiff(a, b) {   // small LCS diff, files are tiny
  const n = a.length, m = b.length, t = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const d = []; let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { i++; j++; }
    else if (j < m && (i >= n || t[i][j + 1] > t[i + 1][j])) d.push(`+ ${b[j++]}`);
    else d.push(`- ${a[i++]}`);
  }
  return d;
}


// Blank out comments (and optionally string contents) so we can scan structure safely. Same length as input.
function mask(src, strings) {
  let o = '', i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') { o += ' '; i++; } continue; }
    if (c === '/' && d === '*') { while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { o += src[i] === '\n' ? '\n' : ' '; i++; } o += '  '; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      o += c; i++;
      while (i < src.length && src[i] !== c) { if (src[i] === '\\') { o += strings ? ' ' : src[i]; i++; } o += strings ? (src[i] === '\n' ? '\n' : ' ') : src[i]; i++; }
      o += c; i++; continue;
    }
    o += c; i++;
  }
  return o;
}

// Returns new source with liveswarm() in the config's top-level plugins array and an import, or null when ambiguous.
function addPlugin(src, spec) {
  const m = mask(src, true);
  const hits = [];
  for (const x of m.matchAll(/\bplugins\s*:\s*\[/g)) {
    // find the object that directly contains this key
    let depth = 0, k = x.index - 1;
    for (; k >= 0; k--) { if (m[k] === '}') depth++; else if (m[k] === '{') { if (depth === 0) break; depth--; } }
    if (k < 0) continue;
    const before = m.slice(0, k).trimEnd();
    if (before.endsWith(':')) continue;   // nested under another key (build.rollupOptions, worker, ...)
    hits.push(x.index + x[0].length);
  }
  if (hits.length !== 1) return null;
  let out = src.slice(0, hits[0]) + (/^\s*\]/.test(src.slice(hits[0])) ? 'liveswarm()' : 'liveswarm(), ') + src.slice(hits[0]);
  const nc = mask(out, false);
  let end = 0;
  for (const x of nc.matchAll(/^[ \t]*import\b[\s\S]*?(?:from\s*)?['"][^'"\n]+['"][ \t]*;?/gm)) {
    end = x.index + x[0].length;
  }
  const imp = `import liveswarm from "${spec}";`;
  out = end ? out.slice(0, end) + '\n' + imp + out.slice(end) : imp + '\n' + out;
  return out;
}

async function setup(argv) {
  if (wantsHelp(argv)) return cmdHelp('setup');
  const { o } = parse(argv, { yes: 'bool' });
  const cwd = process.cwd();
  const cfgName = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs', 'vite.config.cts'].find((f) => fs.existsSync(path.join(cwd, f)));
  let pkg = {}; try { pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')); } catch {}
  const hasVite = { ...pkg.dependencies, ...pkg.devDependencies }.vite;
  if (!cfgName && !hasVite) {
    out('This does not look like a Vite project, and that is fine: `/liveswarm:watch` works without any setup.\nIt uses the DOM-mutation fallback to place cursors. (Vite projects can run `/liveswarm:setup` for exact landings.)');
    return 0;
  }
  if (!cfgName) { out('Vite found in package.json but no vite.config.* file. Create one with a plugins array, then run setup again.'); return 1; }
  if (/\.c(j|t)s$/.test(cfgName)) { out(`${cfgName} is CommonJS; the Liveswarm Vite plugin is ESM. Rename it to .mjs/.mts (or "type": "module"), then run setup again.`); return 1; }
  const cfg = path.join(cwd, cfgName), src = fs.readFileSync(cfg, 'utf8');
  if (/liveswarm/i.test(src)) { out(`${cfgName} already mentions Liveswarm. Nothing to do.`); return 0; }
  // The tagger ships inside the plugin as one self-contained file (no npm install). It is copied into the
  // project so vite.config keeps working when the plugin updates or moves.
  const bundled = path.join(PLUGIN, 'vite', 'liveswarm-vite.mjs');
  const copyTo = path.join(cwd, '.liveswarm', 'vite.mjs');
  const spec = './.liveswarm/vite.mjs';
  if (!fs.existsSync(bundled)) { err(`The bundled Vite tagger is missing (${bundled}). Reinstall the plugin.`); return 1; }
  out(`Setup copies the Liveswarm Vite tagger (one file, no dependencies) to .liveswarm/vite.mjs and adds it to ${cfgName}.`);
  const next = addPlugin(src, spec);
  if (!next) { out(`Could not safely find the top-level plugins array in ${cfgName} (it may be nested, computed or ambiguous). Do it by hand:\n  mkdir -p .liveswarm && cp "${bundled}" .liveswarm/vite.mjs\n  then in ${cfgName}: import liveswarm from "${spec}";  and  plugins: [liveswarm(), ...]`); return 1; }
  out(`\nChange to ${cfgName}:`);
  lineDiff(src.split('\n'), next.split('\n')).forEach((l) => out('  ' + l));
  if (!o.yes && !(await ask('\nApply? [y/N] '))) { out(process.stdin.isTTY ? 'No changes made.' : 'Not a terminal and no --yes: no changes made.'); return process.stdin.isTTY ? 0 : 1; }
  fs.mkdirSync(path.dirname(copyTo), { recursive: true });
  fs.copyFileSync(bundled, copyTo);
  fs.writeFileSync(cfg, next);
  if (!/liveswarm\(\)/.test(fs.readFileSync(cfg, 'utf8'))) { err(`Edit of ${cfgName} did not stick; add the plugin yourself.`); return 1; }
  out(`Updated ${cfgName} and added .liveswarm/vite.mjs. Restart your dev server. Dev only: nothing is added to production builds.`);
  return 0;
}

// ---------------------------------------------------------------- record
function resolvePlaywright() {
  const deps = process.env.LIVESWARM_DEPS || path.join(HOME, 'deps');
  for (const base of [path.join(process.cwd(), 'noop.js'), path.join(deps, 'noop.js')]) {
    try { return createRequire(base).resolve('playwright-core'); } catch { /* next */ }
  }
  return null;
}

// Playwright records video through its own small ffmpeg build (separate from system ffmpeg). Install it once.
function ensurePlaywrightFfmpeg(pw) {
  const cli = path.join(path.dirname(pw), 'cli.js');
  if (!fs.existsSync(cli)) return true;   // unknown layout: let film.mjs report it
  const r = spawnSync(process.execPath, [cli, 'install', 'ffmpeg'], { encoding: 'utf8' });
  if (r.status === 0) return true;
  err(`Could not install Playwright's ffmpeg (needed to capture video). Run this, then retry:\n  node "${cli}" install ffmpeg`);
  if (r.stderr) err(r.stderr.trim().split('\n').slice(-3).join('\n'));
  return false;
}

function recorders() {
  const live = [];
  try {
    for (const f of fs.readdirSync(HOME)) {
      if (!/^record-\d+\.json$/.test(f)) continue;
      try { const s = JSON.parse(fs.readFileSync(path.join(HOME, f), 'utf8')); process.kill(s.pid, 0); live.push({ ...s, file: path.join(HOME, f) }); }
      catch { try { fs.unlinkSync(path.join(HOME, f)); } catch {} }
    }
  } catch { /* none */ }
  return live;
}

async function record(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return cmdHelp('record');
  const { o, extra } = parse(argv, { url: 'str', name: 'str', out: 'str', now: 'bool', next: 'bool', stop: 'bool', yes: 'bool' }, { rest: true });
  if (o.stop) {
    const live = recorders();
    if (!live.length) { out('No recording is running.'); return 0; }
    for (const r of live) { try { process.kill(r.pid, 'SIGTERM'); } catch {} out(`Stopping the recording of ${r.url}. Videos are being finished in ${r.out} (about a minute).`); }
    return 0;
  }
  if (!cmdOk('ffmpeg', ['-version'])) { err(`record needs ffmpeg. Install it: ${ffmpegHint()}`); return 1; }
  if (!findChrome()) { err('record needs Google Chrome (it is used as the recording browser; no browser is downloaded). Install Chrome and retry.'); return 1; }
  let pw = resolvePlaywright();
  if (!pw) {
    const deps = process.env.LIVESWARM_DEPS || path.join(HOME, 'deps');
    const cmd = `npm i playwright-core --prefix "${deps}"`;
    // From a slash command there is no terminal to ask: running /liveswarm:record is the request, so install.
    const go = o.yes || !process.stdin.isTTY || (await ask(`record needs playwright-core (about 8 MB, no browser download), installed once into ${deps}.\n${cmd}  [y/N] `));
    if (!go) { err(`Not installed. Run this yourself, then retry:\n  ${cmd}`); return 1; }
    out(`First run: installing playwright-core into ${deps} (about 8 MB, once)...`);
    fs.mkdirSync(deps, { recursive: true });
    const r = spawnSync('npm', ['i', 'playwright-core', '--prefix', deps, '--no-audit', '--no-fund', '--loglevel=error'], { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32', env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' } });
    if (r.status !== 0) { err(`npm install failed. Run this yourself, then retry:\n  ${cmd}`); return 1; }
    pw = resolvePlaywright();
    if (!pw) { err('playwright-core still not resolvable after install.'); return 1; }
  }
  if (!ensurePlaywrightFfmpeg(pw)) return 1;
  if (recorders().length) { err('A recording is already running. Stop it first with /liveswarm:record --stop'); return 1; }
  const url = o.url || runningProxyUrl();
  if (!url) { err('No page to record. Run /liveswarm:watch first (record films that page), or pass --url http://...'); return 1; }
  if (!(await ensureConductor())) { err(`could not start the conductor on port ${CPORT}. Run /liveswarm:doctor for details.`); return 1; }
  // Inside Claude Code (a slash command) the session is already running, so film from now on.
  // From a terminal, wait for the next session to start, as before.
  const attach = o.now || (!o.next && !!process.env.CLAUDECODE);
  const outDir = path.resolve(o.out || 'liveswarm-videos');
  const args = ['--url', url, '--name', o.name || 'liveswarm', '--out-dir', outDir, ...(attach ? ['--attach'] : []), ...(attach && !extra.includes('--idle') ? ['--idle', '90'] : []), ...extra];
  out(`Recording ${url}`);
  out(attach
    ? 'Filming starts now. Ask Claude to build something; the film ends by itself 90 s after the agents go quiet, or run /liveswarm:record --stop.'
    : 'Start your Claude Code session now; the film starts at its first event and ends with it (or press Ctrl-C to finish early).');
  out(`Output: ${outDir}  (vertical 1080x1920 + widescreen 1920x1080)`);
  const child = spawn(process.execPath, [path.join(HERE, 'film.mjs'), ...args], { stdio: 'inherit', env: { ...process.env, LIVESWARM_PW: pw, LIVESWARM_PORT: String(CPORT) } });
  const pidFile = path.join(HOME, `record-${child.pid}.json`);
  try { fs.mkdirSync(HOME, { recursive: true, mode: 0o700 }); fs.writeFileSync(pidFile, JSON.stringify({ pid: child.pid, url, out: outDir })); } catch { /* --stop then cannot find it */ }
  // With a terminal, Ctrl-C reaches film.mjs directly (same process group); otherwise forward it.
  process.on('SIGINT', () => { if (!process.stdin.isTTY) child.kill('SIGTERM'); });
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  return new Promise((r) => child.on('exit', (c) => { try { fs.unlinkSync(pidFile); } catch {} r(c ?? 1); }));
}

// ---------------------------------------------------------------- help
const HELP = `Liveswarm ${VERSION}: every agent is a cursor on your live app.

Usage: liveswarm <command> [options]

  demo     [--port N] [--no-open]            Replay a real Claude Code build (12 subagents) in your browser. No setup.
  watch    [--url URL] [--port N] [--no-open] Show live Claude Code sessions as cursors on your running dev server
                                             (any framework). Finds the server itself, or pass --url.
  record   [--url URL] [--out DIR] [--stop]    Film the build: vertical + widescreen MP4 with end card.
                                             Films the running \`watch\` page; output in ./liveswarm-videos/.
                                             Inside Claude Code it films from now until the agents go quiet
                                             (90 s) or --stop; from a terminal it films the next session
                                             (--now / --next to choose). Other options (--max, --idle, ...) go
                                             to the recorder.
  setup    [--yes]                           Vite projects: add the @liveswarm/vite tagger for exact landings.
  doctor                                     Check Node, curl, conductor, Chrome, ffmpeg.
  help                                       This text.

Environment: LIVESWARM_PORT (conductor, default 7777), LIVESWARM_HOME (default ~/.liveswarm), LIVESWARM=off.
Exit codes: 0 ok, 1 error, 2 bad usage.`;

// ---------------------------------------------------------------- main
process.on('uncaughtException', (e) => { err(`liveswarm: unexpected error: ${e && e.message ? e.message : e}`); process.exit(1); });
const [cmd, ...rest] = process.argv.slice(2);
const cmds = { demo, watch, record, setup, doctor: () => (rest.length ? usage('doctor takes no options') : doctor()), help: async () => { out(HELP); return 0; } };
try {
  if (!cmd || cmd === '--help' || cmd === '-h') { out(HELP); process.exit(cmd ? 0 : 2); }
  if (!cmds[cmd]) usage(`unknown command "${cmd}"`);
  process.exit((await cmds[cmd](rest)) ?? 0);
} catch (e) {
  if (e instanceof Usage) { err(`liveswarm: ${e.message}\nRun "liveswarm help" for usage.`); process.exit(2); }
  err(`liveswarm: ${e && e.message ? e.message : e}`); process.exit(1);
}
