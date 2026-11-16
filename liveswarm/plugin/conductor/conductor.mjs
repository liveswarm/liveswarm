#!/usr/bin/env node
// Liveswarm conductor: zero-dependency Node 22 server. See CONTRACT.md.
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(HERE, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch { return 'unknown'; } })();
const HOME = process.env.LIVESWARM_HOME || path.join(os.homedir(), '.liveswarm');
const PORT = Number(process.env.LIVESWARM_PORT || 7777);
const SOCK = path.join(HOME, 'hook.sock');
const SESSIONS = path.join(HOME, 'sessions');
const OVERLAY = path.join(HERE, '..', 'overlay', 'overlay.js');

if (process.env.LIVESWARM === 'off') process.exit(0);

fs.mkdirSync(HOME, { recursive: true, mode: 0o700 });
try { fs.chmodSync(HOME, 0o700); } catch {}
fs.mkdirSync(SESSIONS, { recursive: true, mode: 0o700 });

const log = (...a) => console.error(new Date().toISOString(), ...a);

// ---------------------------------------------------------------- state
let seq = 0;
let eventCount = 0;
let lastActivity = Date.now();   // last hook event or viewer; see the idle exit below
let lastSession = '';
const clients = new Set();
const sessions = new Map(); // id -> { agents: Map, pending: [], mapped: Map(agentId->{label,parent}), preCmd: Map }

function sess(id) {
  let s = sessions.get(id);
  if (!s) {
    s = { agents: new Map(), pending: [], mapped: new Map(), preCmd: new Map(), stopped: new Set() };
    s.agents.set('main', { id: 'main', type: 'main', label: 'main', parent: null });
    sessions.set(id, s);
    if (sessions.size > 50) sessions.delete(sessions.keys().next().value);
  }
  return s;
}

// ---------------------------------------------------------------- helpers
const SECRET_RES = [
  [/\b(Bearer|Basic|Token)\s+[^\s"']+/gi, '$1 •••'],
  [/(:\/\/[^\s:@\/]*):[^\s@\/]+@/g, '$1:•••@'],
  [/(--?(?:password|passwd|pass|pwd|token|secret|api-?key|access-?key|auth|credentials?)(?:[=\s]+))("[^"]*"|'[^']*'|\S+)/gi, '$1•••'],
  [/(\s-p)(?=[^\s-])\S+/g, '$1•••'],
  [/\b([A-Za-z0-9_.-]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL|AUTH)[A-Za-z0-9_.-]*)\s*[=:]\s*("[^"]*"|'[^']*'|\S+)/gi, '$1=•••'],
  [/sk-[A-Za-z0-9_-]{8,}/g, '•••'],
  [/gh[pousr]_[A-Za-z0-9]{8,}/g, '•••'],
  [/github_pat_[A-Za-z0-9_]{10,}/g, '•••'],
  [/\bAKIA[0-9A-Z]{8,}/g, '•••'],
  [/xox[a-z]?-[A-Za-z0-9-]{6,}/g, '•••'],
  [/\b[0-9a-fA-F]{32,}\b/g, '•••'],
  // long base64-ish tokens: must contain a digit and a letter, and must not be part of a path
  [/(?<![\w/.-])(?=[A-Za-z0-9+_-]*\d)(?=[A-Za-z0-9+_-]*[A-Za-z])[A-Za-z0-9+_-]{32,}={0,2}(?![\w/])/g, '•••'],
];
function redact(s) {
  let out = String(s);
  for (const [re, to] of SECRET_RES) out = out.replace(re, to);
  return out;
}
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();

function realFile(p, cwd) {
  if (!p || typeof p !== 'string') return undefined;
  const abs = path.resolve(cwd || process.cwd(), p);
  try { return fs.realpathSync.native(abs); } catch {}
  try { return path.join(fs.realpathSync.native(path.dirname(abs)), path.basename(abs)); } catch {}
  return abs;
}

function rangeFromPatch(patch) {
  if (!Array.isArray(patch) || !patch.length) return null;
  let min = Infinity, max = -Infinity, added = 0, removed = 0, firstMinus = null;
  for (const h of patch) {
    let n = Number(h.newStart) || 1;
    if (max >= 0 || firstMinus !== null) { // later hunks: count only
      for (const line of h.lines || []) { if (line[0] === '+') added++; else if (line[0] === '-') removed++; }
      continue;
    }
    for (const line of h.lines || []) {
      const c = line[0];
      if (c === '+') { added++; if (n < min) min = n; if (n > max) max = n; n++; }
      else if (c === '-') { removed++; if (firstMinus === null) firstMinus = n; }
      else n++;
    }
  }
  let range;
  if (max >= 0) range = [min, max];
  else if (firstMinus !== null) range = [Math.max(1, firstMinus), Math.max(1, firstMinus)];
  else return null;
  return { range, added, removed };
}

function lineOf(text, idx) { let n = 1; for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) n++; return n; }
const countLines = (s) => (s ? String(s).split('\n').length - (String(s).endsWith('\n') ? 1 : 0) : 0) || 1;

function editInfo(p, file) {
  const ti = p.tool_input || {}, tr = p.tool_response || {};
  const tool = p.tool_name;
  const fromPatch = rangeFromPatch(tr.structuredPatch);
  if (fromPatch) return fromPatch;
  if (tool === 'Write') {
    if (typeof ti.content !== 'string') return {};
    const n = countLines(ti.content);
    return { range: [1, n], added: n, removed: 0 };
  }
  if (tool === 'Edit' || tool === 'MultiEdit') {
    const news = tool === 'Edit' ? [ti.new_string] : (ti.edits || []).map((e) => e.new_string);
    const olds = tool === 'Edit' ? [ti.old_string] : (ti.edits || []).map((e) => e.old_string);
    let text = ''; try { text = fs.readFileSync(file, 'utf8'); } catch {}
    let min = Infinity, max = -Infinity;
    for (const ns of news) {
      if (!ns || !text) continue;
      const i = text.indexOf(ns);
      if (i < 0) continue;
      min = Math.min(min, lineOf(text, i));
      max = Math.max(max, lineOf(text, i) + ns.split('\n').length - 1);
    }
    const added = news.reduce((a, s) => a + (s ? s.split('\n').length : 0), 0);
    const removed = olds.reduce((a, s) => a + (s ? s.split('\n').length : 0), 0);
    return { range: max >= 0 ? [min, max] : undefined, added, removed };
  }
  return {};
}

function summarize(p, file, preCmd) {
  const ti = p.tool_input || {};
  const base = (f) => path.basename(f);
  switch (p.tool_name) {
    case 'Bash': {
      let c = preCmd ?? ti.command ?? '';
      c = oneLine(c).replace(/^rtk\s+/, '');
      // agents often prefix commands with `cd "<project path>" &&`: show the command that matters
      c = c.replace(/^cd\s+("[^"]*"|'[^']*'|\S+)\s*(&&|;)\s*/, '').replace(/^rtk\s+/, '');
      return '$ ' + redact(c).slice(0, 48);
    }
    case 'Edit': case 'MultiEdit': case 'Write': case 'NotebookEdit':
      return file ? base(file) : p.tool_name;
    case 'Read': return file ? 'reading ' + base(file) : 'reading';
    case 'Grep': return 'grep ' + redact(oneLine(ti.pattern || '')).slice(0, 32);
    case 'Glob': return 'glob ' + redact(oneLine(ti.pattern || '')).slice(0, 32);
    case 'Agent': return redact(oneLine(ti.description || ti.subagent_type || 'agent')).slice(0, 48);
    case 'WebFetch': try { return 'fetch ' + new URL(ti.url).hostname; } catch { return 'fetch'; }
    default: return p.tool_name || '';
  }
}

// ---------------------------------------------------------------- output
const BULKY = new Set(['content', 'new_source', 'new_string', 'old_string', 'edits', 'prompt']);
function deepRedact(v, key) {
  if (typeof v === 'string') return BULKY.has(key) ? `[${v.length} chars]` : redact(v);
  if (Array.isArray(v)) return BULKY.has(key) ? `[${v.length} items]` : v.map((x) => deepRedact(x));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = deepRedact(v[k], k); return o; }
  return v;
}
function sanitizeRaw(p) {
  const c = JSON.parse(JSON.stringify(p));
  delete c.transcript_path; delete c.agent_transcript_path; delete c.last_assistant_message;
  delete c.prompt;
  if (c.tool_response && typeof c.tool_response === 'object') {
    const t = c.tool_response; // keep only non-content metadata, never bodies
    c.tool_response = {};
    for (const k of ['agentId', 'filePath', 'interrupted', 'is_error', 'isImage']) if (t[k] !== undefined) c.tool_response[k] = t[k];
  } else if (c.tool_response !== undefined) c.tool_response = '[omitted]';
  if (c.tool_input) c.tool_input = deepRedact(c.tool_input);
  for (const k of ['error', 'message', 'reason']) if (typeof c[k] === 'string') c[k] = redact(c[k]);
  return c;
}
function appendLog(session, kind, obj) {
  const safe = String(session).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100) || 'unknown';
  fs.appendFile(path.join(SESSIONS, `${safe}.${kind}.jsonl`), JSON.stringify(obj) + '\n', (e) => e && log('log write', e.message));
}
function broadcast(ev) {
  const data = `event: swarm\ndata: ${JSON.stringify(ev)}\n\n`;
  for (const res of clients) { try { res.write(data); } catch { clients.delete(res); } }
}
function emit(session, kind, agent, extra = {}) {
  const ev = { v: 1, seq: ++seq, ts: Date.now(), session, kind, agent: { ...agent }, ...extra };
  eventCount++; lastActivity = Date.now();
  appendLog(session, 'events', ev);
  broadcast(ev);
}

// ---------------------------------------------------------------- agents
function actorOf(s, p) {
  const id = p.agent_id;
  if (!id) return s.agents.get('main');
  let a = s.agents.get(id);
  if (!a) {
    const m = s.mapped.get(id);
    a = { id, type: p.agent_type || 'agent', label: m?.label || p.agent_type || 'agent', parent: m ? m.parent : 'main', _new: true };
    if (s.stopped.has(id)) return a; // late event from a finished agent: do not resurrect
    s.agents.set(id, a);
  }
  a.seen = Date.now();
  return a;
}
const pub = (a) => ({ id: a.id, type: a.type, label: a.label, parent: a.parent });

function handleSubagentStart(session, s, p) {
  const id = p.agent_id; if (!id) return;
  const existing = s.agents.get(id);
  const m = s.mapped.get(id);
  const a = existing || { id, type: p.agent_type || 'agent', label: p.agent_type || id, parent: 'main' };
  a.type = p.agent_type || a.type;
  if (m) { a.label = m.label; a.parent = m.parent; }
  a.seen = Date.now();
  s.stopped.delete(id);
  s.agents.set(id, a);
  delete a._new;
  if (!m && !existing) {
    // Agent calls launched one after another (and blocking ones) only report their agentId in
    // PostToolUse(Agent) when they FINISH, so match now, in order, to the oldest pending Agent call
    // of the same type; a later PostToolUse(Agent) still corrects it if the order was different.
    const i = s.pending.findIndex((x) => x.subagentType === a.type);
    if (i >= 0) {
      const [pend] = s.pending.splice(i, 1);
      s.mapped.set(id, { label: pend.description, parent: pend.actor, provisional: true });
      a.label = pend.description; a.parent = pend.actor;
      emit(session, 'agent.start', pub(a), { summary: a.label });
      return;
    }
    // PostToolUse(Agent) (which carries the real label) usually lands within ~100 ms of SubagentStart.
    // Hold the start briefly so the cursor is born with its real name instead of flashing the agent type.
    a._held = true;
    setTimeout(() => {
      if (a._held && !s.stopped.has(id) && !s.mapped.has(id)) {
        const j = s.pending.findIndex((x) => x.subagentType === a.type);
        if (j >= 0) { const [pd] = s.pending.splice(j, 1); s.mapped.set(id, { label: pd.description, parent: pd.actor, provisional: true }); a.label = pd.description; a.parent = pd.actor; }
      }
      if (a._held && !s.stopped.has(id)) { delete a._held; emit(session, 'agent.start', pub(a), { summary: a.label }); } }, 400).unref();
  } else {
    emit(session, 'agent.start', pub(a), { summary: a.label });
  }
  if (!m) {
    // Fallback: if no PostToolUse(Agent) shows up, use the oldest pending PreToolUse(Agent) with the same type.
    setTimeout(() => {
      if (s.mapped.has(id)) return;
      const i = s.pending.findIndex((x) => x.subagentType === a.type);
      if (i < 0) return;
      const [pend] = s.pending.splice(i, 1);
      applyMapping(session, s, id, pend.description, pend.actor);
    }, 2000).unref();
  }
}

function applyMapping(session, s, agentId, description, parent) {
  s.mapped.set(agentId, { label: description, parent });
  const a = s.agents.get(agentId);
  if (a && a._held) { // start was being held for exactly this: emit it once, with the real label
    delete a._held; a.label = description; a.parent = parent;
    emit(session, 'agent.start', pub(a), { summary: a.label });
    return;
  }
  if (a && a.label !== description || (a && a.parent !== parent)) {
    a.label = description; a.parent = parent;
    emit(session, 'agent.update', pub(a), { summary: description });
  }
}

// ---------------------------------------------------------------- hook processing
function process_(p) {
  const session = p.session_id || 'unknown';
  lastSession = session;
  const s = sess(session);
  const ev = p.hook_event_name;
  appendLog(session, 'raw', { ...sanitizeRaw(p), receivedAt: Date.now() });

  switch (ev) {
    case 'SessionStart':
      return emit(session, 'session.start', s.agents.get('main'), { summary: p.source || 'start' });
    case 'SessionEnd':
      return emit(session, 'session.end', s.agents.get('main'), { summary: p.reason || 'end' });
    case 'Stop':
      return emit(session, 'turn.end', actorOf(s, p));
    case 'SubagentStart':
      return handleSubagentStart(session, s, p);
    case 'SubagentStop': {
      const a = s.agents.get(p.agent_id);
      if (!a) return;
      emit(session, 'agent.stop', pub(a), { summary: a.label });
      s.agents.delete(p.agent_id);
      s.stopped.add(p.agent_id);
      if (s.stopped.size > 500) s.stopped.delete(s.stopped.values().next().value);
      return;
    }
    case 'PreToolUse': case 'PostToolUse': case 'PostToolUseFailure': break;
    default: return;
  }

  const post = ev === 'PostToolUse', fail = ev === 'PostToolUseFailure';
  const actor = actorOf(s, p);
  const ti = p.tool_input || {};
  const tool = p.tool_name;
  const toolUseId = p.tool_use_id;
  const rawFile = [ti.file_path, ti.notebook_path, p.tool_response && p.tool_response.filePath].find((x) => typeof x === 'string' && x);
  const file = rawFile ? realFile(rawFile, p.cwd) : undefined;

  if (ev === 'PreToolUse') {
    if (tool === 'Bash' && toolUseId) {
      s.preCmd.set(toolUseId, ti.command || '');
      if (s.preCmd.size > 200) s.preCmd.delete(s.preCmd.keys().next().value);
    }
    if (tool === 'Agent' && toolUseId) {
      s.pending.push({ toolUseId, subagentType: ti.subagent_type, description: ti.description || ti.subagent_type || 'agent', actor: actor.id });
      if (s.pending.length > 50) s.pending.shift();
    }
  }
  if (post && tool === 'Agent') {
    const aid = p.tool_response && p.tool_response.agentId;
    const i = s.pending.findIndex((x) => x.toolUseId === toolUseId);
    if (i >= 0) s.pending.splice(i, 1);
    if (aid) applyMapping(session, s, aid, ti.description || ti.subagent_type || 'agent', actor.id);
  }

  const out = { tool, toolUseId, summary: summarize(p, file, s.preCmd.get(toolUseId)) };
  if (file) out.file = file;
  if (post || fail) s.preCmd.delete(toolUseId);
  if (post) {
    out.ok = true;
    if (['Edit', 'MultiEdit', 'Write'].includes(tool) && file) {
      const info = editInfo(p, file);
      if (info.range) out.range = info.range;
      if (info.added !== undefined) out.added = info.added;
      if (info.removed !== undefined) out.removed = info.removed;
    }
  }
  if (fail) out.ok = false;
  emit(session, post ? 'tool.post' : fail ? 'tool.fail' : 'tool.pre', pub(actor), out);
}

// ---------------------------------------------------------------- servers
function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const health = () => ({ ok: true, version: VERSION, pid: process.pid, clients: clients.size, agents: [...sessions.values()].reduce((n, s) => n + s.agents.size - 1, 0), events: eventCount });
const STALE_MS = 30 * 60 * 1000;
function allAgents() {
  const out = [{ id: 'main', type: 'main', label: 'main', parent: null }];
  for (const s of sessions.values()) for (const a of s.agents.values()) if (a.id !== 'main' && Date.now() - (a.seen || 0) < STALE_MS) out.push(pub(a));
  return out;
}
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': '*' };

function sockHandler(req, res) {
  const url = (req.url || '').split('?')[0];
  if (req.method === 'POST' && url === '/v1/hook') {
    readBody(req).then((body) => {
      res.writeHead(204); res.end();
      setImmediate(() => { try { process_(JSON.parse(body)); } catch (e) { log('bad payload', e.message); } });
    }).catch(() => { try { res.writeHead(413); res.end(); } catch {} });
    return;
  }
  if (req.method === 'GET' && url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(health()));
  }
  res.writeHead(404); res.end();
}

function tcpHandler(req, res) {
  const host = (req.headers.host || '').toLowerCase();
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) { res.writeHead(403); return res.end(); }
  const url = (req.url || '').split('?')[0];
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'GET') { res.writeHead(405, CORS); return res.end(); }
  if (url === '/health') {
    res.writeHead(200, { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-cache' });
    return res.end(JSON.stringify(health()));
  }
  if (url === '/overlay.js') {
    fs.readFile(OVERLAY, (err, buf) => {
      if (err) { res.writeHead(404, CORS); return res.end('overlay.js not found'); }
      res.writeHead(200, { ...CORS, 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(buf);
    });
    return;
  }
  if (url === '/stream') {
    res.writeHead(200, { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write('retry: 1500\n\n');
    const hello = { v: 1, seq, ts: Date.now(), session: lastSession, kind: 'hello', agent: { id: 'main', type: 'main', label: 'main', parent: null }, agents: allAgents() };
    res.write(`event: swarm\ndata: ${JSON.stringify(hello)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  res.writeHead(404, CORS); res.end();
}

setInterval(() => { for (const r of clients) { try { r.write(': ping\n\n'); } catch { clients.delete(r); } } }, 15000).unref?.();

// Exit on its own when nobody needs it: 2 hours with no hook events and no open viewer, or the plugin was
// uninstalled or updated (its files are gone). The next Claude Code session starts a fresh one.
const IDLE_MS = Number(process.env.LIVESWARM_IDLE_MIN || 120) * 60000;
setInterval(() => {
  if (clients.size) lastActivity = Date.now();
  // Claude Code keeps an uninstalled plugin's folder but marks it with .orphaned_at.
  if (!fs.existsSync(OVERLAY) || fs.existsSync(path.join(HERE, '..', '.orphaned_at'))) { log('plugin was uninstalled or updated: exiting'); process.exit(0); }
  if (Date.now() - lastActivity > IDLE_MS) { log(`idle for ${IDLE_MS / 60000} min: exiting`); process.exit(0); }
}, 60000).unref?.();

function probeSocket() {
  return new Promise((resolve) => {
    if (!fs.existsSync(SOCK)) return resolve(false);
    const c = net.connect(SOCK);
    const t = setTimeout(() => { c.destroy(); resolve(false); }, 500);
    c.on('connect', () => { clearTimeout(t); c.destroy(); resolve(true); });
    c.on('error', () => { clearTimeout(t); resolve(false); });
  });
}

let ownSocket = false;
let unix = null;
function cleanup() { if (ownSocket) { try { fs.unlinkSync(SOCK); } catch {} } }
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(0));
process.on('uncaughtException', (e) => { log('uncaught', e.stack || e.message); });

async function listenSocket() {
  if (unix) { try { unix.close(); } catch {} unix = null; }
  try { fs.unlinkSync(SOCK); } catch {}
  const srv = http.createServer(sockHandler);
  await new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(SOCK, resolve); });
  unix = srv; ownSocket = true;
  try { fs.chmodSync(SOCK, 0o600); } catch {}
}
let healing = false;
async function healSocket() {
  if (healing || !ownSocket || fs.existsSync(SOCK)) return;
  healing = true;
  try { await listenSocket(); log('hook.sock recreated'); } catch (e) { log('hook.sock recreate failed', e.message); }
  healing = false;
}
process.on('SIGUSR2', () => { healSocket(); });
setInterval(healSocket, 3000).unref();

function probeHealth() {
  return new Promise((resolve) => {
    const rq = http.get({ host: '127.0.0.1', port: PORT, path: '/health', timeout: 800 }, (res) => {
      let b = ''; res.on('data', (d) => (b += d));
      res.on('end', () => { try { const j = JSON.parse(b); resolve(j && j.ok && j.version ? j : null); } catch { resolve(null); } });
    });
    rq.on('error', () => resolve(null));
    rq.on('timeout', () => { rq.destroy(); resolve(null); });
  });
}

async function main() {
  if (await probeSocket()) process.exit(0);

  const tcp = http.createServer(tcpHandler);
  await new Promise((resolve) => {
    tcp.once('error', async (e) => {
      if (e.code === 'EADDRINUSE') {
        const h = await probeHealth();
        if (!h) { log(`port ${PORT} is held by another program (not a liveswarm conductor); hooks are inactive. Set LIVESWARM_PORT to a free port.`); process.exit(0); }
        if (!fs.existsSync(SOCK) && h.pid) { try { process.kill(h.pid, 'SIGUSR2'); } catch {} } // ask incumbent to recreate its socket
        process.exit(0);
      }
      log('tcp error', e.message); process.exit(1);
    });
    tcp.listen(PORT, '127.0.0.1', resolve);
  });

  if (await probeSocket()) process.exit(0); // another instance won the race on another port
  await listenSocket();
  log(`liveswarm conductor ${VERSION} pid ${process.pid} sock ${SOCK} tcp 127.0.0.1:${PORT}`);
}
main().catch((e) => { log('fatal', e.stack || e.message); process.exit(1); });
