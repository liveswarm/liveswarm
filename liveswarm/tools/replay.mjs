#!/usr/bin/env node
// Replay a raw hook .jsonl into the Liveswarm conductor socket.
// node tools/replay.mjs <raw.jsonl> [--map FROM=TO ...] [--speed N] [--gap MS] [--session ID]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const argv = process.argv.slice(2);
let file, speed = 1, gap = 450, session = null;
const maps = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--map') { const [f, ...t] = (argv[++i] || '').split('='); maps.push([f, t.join('=')]); }
  else if (a === '--speed') speed = Number(argv[++i]) || 1;
  else if (a === '--gap') gap = Number(argv[++i]);
  else if (a === '--session') session = argv[++i];
  else if (!file) file = a;
}
if (!file) { console.error('usage: replay.mjs <raw.jsonl> [--map FROM=TO ...] [--speed N] [--gap MS] [--session ID]'); process.exit(2); }

const HOME = process.env.LIVESWARM_HOME || path.join(os.homedir(), '.liveswarm');
const SOCK = path.join(HOME, 'hook.sock');
const rewrite = (v) => {
  if (typeof v !== 'string') return v;
  for (const [f, t] of maps) if (v === f || v.startsWith(f + '/')) return t + v.slice(f.length);
  return v;
};
const post = (obj) => new Promise((resolve, reject) => {
  const body = JSON.stringify(obj);
  const req = http.request({ socketPath: SOCK, path: '/v1/hook', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => { res.resume(); res.on('end', resolve); });
  req.on('error', reject); req.end(body);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
let prev = null, sent = 0;
for (const line of lines) {
  const p = JSON.parse(line);
  const at = p.receivedAt; delete p.receivedAt;
  if (session) p.session_id = session;
  if (maps.length) {
    p.cwd = rewrite(p.cwd);
    if (p.tool_input) { p.tool_input.file_path = rewrite(p.tool_input.file_path); p.tool_input.notebook_path = rewrite(p.tool_input.notebook_path); }
    if (p.tool_response && typeof p.tool_response === 'object') p.tool_response.filePath = rewrite(p.tool_response.filePath);
  }
  const delay = at != null && prev != null ? Math.max(0, (at - prev) / speed) : (prev === null ? 0 : gap / speed);
  if (at != null) prev = at; else if (prev === null) prev = 0;
  if (sent) await sleep(delay);
  try { await post(p); } catch (e) { console.error(`replay: cannot reach conductor at ${SOCK}: ${e.message}`); process.exit(1); }
  sent++;
  console.log(`${String(sent).padStart(3)} ${p.hook_event_name}${p.tool_name ? ' ' + p.tool_name : ''}${p.agent_id ? ' [' + p.agent_id.slice(0, 6) + ']' : ''}`);
}
console.log(`replayed ${sent} payloads`);
