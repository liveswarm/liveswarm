#!/usr/bin/env node
// Liveswarm rehearsal: plays a synthetic 12-agent Claude Code hook stream into the conductor.
// It only emits events (HTTP over $LIVESWARM_HOME/hook.sock). It never writes any file.
//
// usage: node liveswarm/tools/rehearse.mjs --root <stage project abs path> [--speed 1] [--seconds 40] [--seed 7]
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
let root = null, speed = 1, seconds = 40, seed = 7, quiet = false;
const die = (msg) => { console.error(`rehearse: ${msg}`); process.exit(2); };
const numArg = (flag, v, { min, max, int: isInt }) => {
  if (v === undefined || v.startsWith('--')) die(`${flag} needs a value`);
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max || (isInt && !Number.isInteger(n))) die(`${flag} must be ${isInt ? 'an integer' : 'a number'} between ${min} and ${max}, got "${v}"`);
  return n;
};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--root') { root = argv[++i]; if (!root || root.startsWith('--')) die('--root needs a value'); }
  else if (a === '--speed') speed = numArg(a, argv[++i], { min: 0.01, max: 1000 });
  else if (a === '--seconds') seconds = numArg(a, argv[++i], { min: 1, max: 3600 });
  else if (a === '--seed') seed = numArg(a, argv[++i], { min: 0, max: 4294967295, int: true });
  else if (a === '--quiet') quiet = true;
  else die(`unknown argument ${a}`);
}
if (!root) {
  console.error('usage: rehearse.mjs --root <stage project abs path> [--speed 1] [--seconds 40] [--seed 7] [--quiet]');
  process.exit(2);
}
root = path.resolve(root);
const HOME = process.env.LIVESWARM_HOME || path.join(os.homedir(), '.liveswarm');
const SOCK = path.join(HOME, 'hook.sock');
const TOTAL_MS = (seconds * 1000) / speed;

// ---- deterministic randomness -------------------------------------------------------------
let rs = seed >>> 0 || 1;
const rnd = () => { rs = (rs + 0x6d2b79f5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const between = (a, b) => a + rnd() * (b - a);
const int = (a, b) => Math.floor(between(a, b + 1));
const hex = (n) => crypto.randomBytes(n).toString('hex').slice(0, n);

// ---- the 12 slots: [stem, label, component, jsx lines, css lines, finish time (0..1)] ------
const SLOTS = [
  ['01-Nav', 'Nav', 'Nav', 46, 30, 0.36],
  ['02-HeroSky', 'Night sky', 'HeroSky', 92, 52, 0.9],
  ['03-HeroTitle', 'Hero', 'HeroTitle', 52, 40, 0.62],
  ['04-Arrival', 'Arrival', 'Arrival', 64, 44, 0.7],
  ['05-Rooms', 'Rooms', 'Rooms', 88, 58, 0.84],
  ['06-StarProgram', 'Star program', 'StarProgram', 84, 50, 0.8],
  ['07-Dining', 'Dining', 'Dining', 66, 46, 0.68],
  ['08-Rituals', 'Rituals', 'Rituals', 58, 42, 0.58],
  ['09-TheDrive', 'The drive', 'TheDrive', 78, 46, 0.76],
  ['10-FieldNotes', 'Field notes', 'FieldNotes', 60, 38, 0.64],
  ['11-Booking', 'Booking', 'Booking', 56, 44, 0.46],
  ['12-Footer', 'Footer', 'Footer', 40, 28, 0.4],
].map(([stem, label, comp, jsxLines, cssLines, endAt]) => ({
  stem, label, comp, jsxLines, cssLines, endAt,
  jsx: path.join(root, 'src/sections', `${stem}.jsx`),
  css: path.join(root, 'src/sections', `${stem}.css`),
}));

// ---- plausible file text (never written to disk, only carried in Write tool_input) ---------
function genJsx(s) {
  const k = s.stem.slice(3).toLowerCase();
  const L = [`import './${s.stem}.css';`, '', `export default function ${s.comp}() {`, '  return (', `    <section className="${k}" id="${k}">`];
  let n = 0;
  while (L.length < s.jsxLines - 3) {
    if (s.jsxLines - 3 - L.length < 4) { L.push(`      <p className="${k}__text">${s.label} ${++n}</p>`); continue; }
    n++;
    L.push(`      <div className="${k}__block">`, `        <h3 className="${k}__title">${s.label} ${n}</h3>`,
      `        <p className="${k}__text">Under a sky with no light but its own, ${s.label.toLowerCase()} unfolds slowly.</p>`, '      </div>');
  }
  L.push('    </section>', '  );', '}');
  return L;
}
function genCss(s) {
  const k = s.stem.slice(3).toLowerCase();
  const L = [];
  let n = 0;
  while (L.length < s.cssLines) {
    if (s.cssLines - L.length < 5) { L.push(`/* ${k} ${++n} */`); continue; }
    n++;
    L.push(`.${k}__block--${n} {`, `  padding: ${int(2, 9)}rem clamp(1.2rem, 5vw, 6rem);`, '  color: #e9dfcf;', '}', '');
  }
  return L;
}

// A realistic Edit: replace 1-3 lines at 1-based position p with 1-4 new ones. Mutates `lines`.
function makeEdit(lines) {
  const n = lines.length;
  const oldCount = int(1, 3), newCount = int(1, 4);
  const p = int(7, Math.max(8, n - oldCount - 5));
  const ctxB = 3;
  const afterIdx = p - 1 + oldCount;
  const ctxA = Math.min(3, n - afterIdx);
  const before = lines.slice(p - 1 - ctxB, p - 1);
  const old = lines.slice(p - 1, afterIdx);
  const after = lines.slice(afterIdx, afterIdx + ctxA);
  const tails = ['at dusk', 'in silence', 'by firelight', 'under stars', 'after rain'];
  const neu = [];
  for (let i = 0; i < newCount; i++) neu.push(`        <p className="note">${tails[int(0, 4)]}, ${tails[int(0, 4)]}</p>`);
  lines.splice(p - 1, oldCount, ...neu);
  const patchLines = [...before.map((l) => ' ' + l), ...old.map((l) => '-' + l), ...neu.map((l) => '+' + l), ...after.map((l) => ' ' + l)];
  return { old, neu, patch: [{ oldStart: p - ctxB, oldLines: ctxB + oldCount + ctxA, newStart: p - ctxB, newLines: ctxB + newCount + ctxA, lines: patchLines }] };
}

// ---- event builders ------------------------------------------------------------------------
const SESSION = crypto.randomUUID();
const PROMPT = crypto.randomUUID();
const base = (name, extra = {}) => ({ session_id: SESSION, cwd: root, hook_event_name: name, ...extra });
const tooluse = () => 'toolu_01' + hex(22);
const ev = []; // {t (nominal), seq, p}
let seq = 0;
const add = (t, p) => ev.push({ t, seq: seq++, p });

function toolPair(t0, dur, who, tool, input, response) {
  const id = tooluse();
  const a = who ? { agent_id: who.id, agent_type: 'general-purpose' } : {};
  const common = { prompt_id: PROMPT, permission_mode: 'acceptEdits', ...a, effort: { level: 'medium' } };
  add(t0, base('PreToolUse', { ...common, tool_name: tool, tool_input: input, tool_use_id: id }));
  add(t0 + dur, base('PostToolUse', { ...common, tool_name: tool, tool_input: input, tool_response: response, tool_use_id: id, duration_ms: Math.max(5, Math.round(dur * TOTAL_MS)) }));
  return t0 + dur;
}
const appJsx = path.join(root, 'src/App.jsx');
const readResp = { type: 'text', file: { filePath: appJsx, numLines: 24, startLine: 1, totalLines: 24 } };

// main
add(0, base('SessionStart', { source: 'startup' }));
add(0.01, base('UserPromptSubmit', { prompt_id: PROMPT, permission_mode: 'acceptEdits', prompt: 'rehearsal' }));
toolPair(0.02, 0.02, null, 'Read', { file_path: appJsx }, readResp);

const agents = SLOTS.map((s, i) => ({ ...s, i, id: 'a' + hex(16) }));
// spawn burst: 12 Pre(Agent), then Post(Agent) right after; SubagentStart lands before Post (even) or after (odd)
agents.forEach((a, i) => {
  const t = 0.07 + i * 0.0035 + between(0, 0.001);
  const id = tooluse();
  const input = { description: a.label, prompt: `Build src/sections/${a.stem}.jsx and ${a.stem}.css: ${a.label}.`, subagent_type: 'general-purpose' };
  const common = { prompt_id: PROMPT, permission_mode: 'acceptEdits', effort: { level: 'medium' } };
  add(t, base('PreToolUse', { ...common, tool_name: 'Agent', tool_input: input, tool_use_id: id }));
  const tPost = t + 0.0015, tStart = i % 2 === 0 ? t + 0.0008 : t + 0.0032;
  add(tPost, base('PostToolUse', { ...common, tool_name: 'Agent', tool_input: input, tool_use_id: id, duration_ms: 12 + i,
    tool_response: { isAsync: true, status: 'async_launched', agentId: a.id, description: a.label, prompt: input.prompt, canReadOutputFile: true, canContinueAgent: true } }));
  add(tStart, base('SubagentStart', { prompt_id: PROMPT, agent_id: a.id, agent_type: 'general-purpose' }));
  a.t0 = tStart + between(0.012, 0.035);
});

// per-agent work
let lastStop = 0;
for (const a of agents) {
  const who = { id: a.id };
  const jsxLines = genJsx(a);
  const cssLines = genCss(a);
  const nEdits = a.i === 1 ? 3 : a.endAt < 0.5 ? 1 : int(1, 3);
  const steps = 3 + nEdits + (a.i === 1 ? 1 : 0);
  const gap = (a.endAt - a.t0) / (steps + 1);
  let t = a.t0;
  const next = (w = 1) => { t += gap * w * between(0.5, 1.35); };
  t = toolPair(t, 0.004, who, 'Read', { file_path: appJsx }, readResp);
  next(1.2);
  t = toolPair(t, Math.min(gap * 0.5, 0.05), who, 'Write', { file_path: a.jsx, content: jsxLines.join('\n') + '\n' }, { type: 'create', filePath: a.jsx });
  next(1.0);
  t = toolPair(t, Math.min(gap * 0.4, 0.04), who, 'Write', { file_path: a.css, content: cssLines.join('\n') + '\n' }, { type: 'create', filePath: a.css });
  for (let e = 0; e < nEdits; e++) {
    next(0.9);
    const ed = makeEdit(jsxLines);
    t = toolPair(t, 0.005, who, 'Edit', { file_path: a.jsx, old_string: ed.old.join('\n'), new_string: ed.neu.join('\n'), replace_all: false },
      { filePath: a.jsx, oldString: ed.old.join('\n'), newString: ed.neu.join('\n'), structuredPatch: ed.patch, userModified: false, replaceAll: false });
    if (a.i === 1 && e === nEdits - 2) {
      next(0.6);
      t = toolPair(t, Math.min(gap * 0.7, 0.06), who, 'Bash', { command: 'npm run build', description: 'Build to verify the shader component' },
        { stdout: 'vite v6 building for production...\n✓ 32 modules transformed.\n✓ built in 1.2s', stderr: '', interrupted: false, isImage: false, noOutputExpected: false });
    }
  }
  const tStop = Math.max(t + 0.012, a.endAt);
  add(tStop, base('SubagentStop', { prompt_id: PROMPT, permission_mode: 'acceptEdits', agent_id: a.id, agent_type: 'general-purpose', effort: { level: 'medium' }, stop_hook_active: false }));
  lastStop = Math.max(lastStop, tStop);
}

// main wraps up
const tEnd = toolPair(lastStop + 0.015, 0.05, null, 'Bash', { command: 'npm run build', description: 'Production build' },
  { stdout: 'vite v6 building for production...\n✓ 148 modules transformed.\n✓ built in 2.4s', stderr: '', interrupted: false, isImage: false, noOutputExpected: false });
add(tEnd + 0.015, base('Stop', { prompt_id: PROMPT, permission_mode: 'acceptEdits', effort: { level: 'medium' }, stop_hook_active: false, background_tasks: [], session_crons: [] }));
add(tEnd + 0.03, base('SessionEnd', { prompt_id: PROMPT, reason: 'other' }));

// scale the whole timeline to --seconds / --speed, then play
ev.sort((x, y) => x.t - y.t || x.seq - y.seq);
const tMax = ev[ev.length - 1].t;
for (const e of ev) e.t /= tMax;

const post = (obj) => new Promise((resolve, reject) => {
  const body = JSON.stringify(obj);
  const req = http.request({ socketPath: SOCK, path: '/v1/hook', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => { res.resume(); res.on('end', resolve); });
  req.on('error', reject); req.end(body);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const counts = {};
const started = Date.now();
for (const e of ev) {
  const wait = e.t * TOTAL_MS - (Date.now() - started);
  if (wait > 0) await sleep(wait);
  try { await post(e.p); } catch (err) { console.error(`rehearse: cannot reach conductor socket ${SOCK}: ${err.message}`); process.exit(1); }
  const k = e.p.hook_event_name + (e.p.tool_name ? ':' + e.p.tool_name : '');
  counts[k] = (counts[k] || 0) + 1;
  if (!quiet) console.log(`${((Date.now() - started) / 1000).toFixed(1).padStart(5)}s ${e.p.hook_event_name}${e.p.tool_name ? ' ' + e.p.tool_name : ''}${e.p.agent_id ? ' [' + (agents.find((a) => a.id === e.p.agent_id)?.label || e.p.agent_id.slice(0, 6)) + ']' : ''}`);
}
console.log(`rehearsal done: ${ev.length} payloads in ${((Date.now() - started) / 1000).toFixed(1)}s, session ${SESSION}`);
console.log(JSON.stringify(counts));
