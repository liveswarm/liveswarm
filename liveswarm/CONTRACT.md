# Liveswarm prototype contract (v1)

Liveswarm shows Claude Code building an app as a swarm of multiplayer-style cursors on the
live app preview. One cursor per real agent (main agent + each subagent). Every cursor move is
caused by a real hook event. This file is the single source of truth that every component codes
against. If something here is ambiguous, pick the simplest reading and note it in your report.

## Repo layout and ownership

```
liveswarm/
  CONTRACT.md                 this file (do not edit)
  fixtures/                   real captured hook payloads (read-only for builders)
    claude-2.1.314-two-subagents.raw.jsonl   26 real hook payloads, one JSON per line
    capture-proj-after/       the tiny project those payloads edited (state AFTER edits)
  plugin/                     OWNER: capture builder. A Claude Code plugin, self-contained.
    .claude-plugin/plugin.json
    hooks/hooks.json
    scripts/emit.sh           forwards one hook payload (stdin) to the conductor socket
    scripts/ensure.sh         SessionStart: starts the conductor if it is not running
    conductor/conductor.mjs   zero-dependency Node 22 server
    overlay/overlay.js        OWNER: overlay builder. Served by the conductor at /overlay.js
  tools/replay.mjs            OWNER: capture builder. Replays a raw hook .jsonl into the conductor
  vite-plugin/                OWNER: tagger builder. package "@liveswarm/vite", index.mjs
  demo-app/                   OWNER: demo builder. Vite + React app used for the demo
```

Builders only write inside the directories they own. Node is v22, macOS, `/usr/bin/curl` 8.7
(supports `--unix-socket`). Playwright 1.65 browsers are installed in `~/Library/Caches/ms-playwright`
and Google Chrome is in /Applications.

## Real hook facts (verified 2026-11-06 on Claude Code 2.1.314, see fixtures/)

- Every payload has `session_id`, `cwd`, `hook_event_name`. Tool events have `tool_name`,
  `tool_input`, `tool_use_id`; Post also has `tool_response`, `duration_ms`.
- Tool calls made INSIDE a subagent carry `agent_id` and `agent_type`. Main-agent calls have no `agent_id`.
- The spawn tool is `Agent`. `tool_input` = `{description, prompt, subagent_type}`.
  `PostToolUse(Agent).tool_response` = `{isAsync, status:"async_launched", agentId, description, ...}`
  and usually arrives immediately (subagents run in the background).
- `SubagentStart` = `{agent_id, agent_type}`. It can arrive BEFORE or AFTER the matching
  `PostToolUse(Agent)` (both orders occur in the fixture). `SubagentStop` = `{agent_id, agent_type}`.
- `PostToolUse(Edit).tool_response` has `structuredPatch: [{oldStart, oldLines, newStart, newLines, lines[]}]`
  where `lines` are unified-diff lines prefixed with " ", "-", "+". It also has `originalFile`
  (FULL FILE CONTENTS: never forward or store it).
- Write `tool_input` = `{file_path, content}`; `tool_response` has `type: "create"|"update"` and may
  have `structuredPatch` for updates.
- PostToolUse `tool_input.command` for Bash may be rewritten by the user's other hooks
  (e.g. prefixed with `rtk `). Use the PreToolUse command for display, or strip a leading `rtk `.
- Other events seen: SessionStart{source}, UserPromptSubmit{prompt}, Stop, SessionEnd{reason}.

## Process model and endpoints

Environment: `LIVESWARM_HOME` (default `~/.liveswarm`, created mode 0700),
`LIVESWARM_PORT` (default `7777`), `LIVESWARM=off` disables emit/ensure entirely.

Conductor (`node plugin/conductor/conductor.mjs`):
- Unix socket `$LIVESWARM_HOME/hook.sock`, HTTP: `POST /v1/hook` body = one raw hook payload JSON.
  Respond `204` immediately, process after. Remove a stale socket file on start; remove on exit.
- TCP `127.0.0.1:$LIVESWARM_PORT` (never 0.0.0.0), HTTP:
  - `GET /overlay.js` serves `plugin/overlay/overlay.js` (`content-type: text/javascript`, no-cache, CORS `*`).
  - `GET /stream` Server-Sent Events, CORS `*`. Each message: `event: swarm` + `data: <Event JSON>`.
    On connect, first send an Event with `kind:"hello"` and `agents: [Agent...]` (current known agents).
    Send a `: ping` comment every 15 s.
  - `GET /health` JSON `{ok:true, version:"0.1.0", clients:<n>, agents:<n>, events:<n>}`.
- Single instance: if the socket already accepts connections, exit 0 quietly.
- Writes every normalized Event to `$LIVESWARM_HOME/sessions/<session_id>.events.jsonl` and every raw
  payload (minus `tool_response.originalFile`, `transcript_path`, `agent_transcript_path`,
  `last_assistant_message`, and UserPromptSubmit `prompt`) plus a `receivedAt` ms field to
  `$LIVESWARM_HOME/sessions/<session_id>.raw.jsonl` (for fixtures and replay).

Hooks (`plugin/hooks/hooks.json`): async command hooks for SessionStart (ensure.sh, then emit.sh),
PreToolUse, PostToolUse, PostToolUseFailure, SubagentStart, SubagentStop, Stop, SessionEnd (emit.sh).
Paths contain spaces: always quote `"${CLAUDE_PLUGIN_ROOT}/scripts/emit.sh"`. Hooks print nothing
and always exit 0. `emit.sh`: if the socket is missing, drain stdin and exit 0; otherwise
`curl -s -m 1 --unix-socket "$SOCK" --data-binary @- -H 'content-type: application/json' http://liveswarm/v1/hook`.

## Normalized Event (conductor -> overlay, SSE `data:`)

```js
{
  v: 1,
  seq: 17,                    // increasing integer per conductor process
  ts: 1762400000000,          // ms epoch, stamped by the conductor on receipt
  session: "uuid",
  kind: "hello" | "session.start" | "session.end" | "turn.end"
      | "agent.start" | "agent.update" | "agent.stop"
      | "tool.pre" | "tool.post" | "tool.fail",
  agent: { id: "main" | "<agent_id>", type: "main" | "<agent_type>",
           label: "main" | "<Agent description, else agent_type>", parent: null | "<agent id>" },
  agents: [Agent],            // only on kind "hello"
  tool: "Edit",               // Edit | MultiEdit | Write | NotebookEdit | Bash | Read | Grep | Glob | Agent | WebFetch | ...
  toolUseId: "toolu_...",
  file: "/abs/realpath/src/components/Hero.jsx",   // when the tool input has file_path (or notebook_path)
  range: [12, 14],            // tool.post of Edit/MultiEdit/Write only: 1-based inclusive changed lines in the NEW file
  added: 3, removed: 1,       // tool.post of edits: count of "+" and "-" lines
  summary: "Hero.jsx",        // short, redacted display text: basename, "$ npm run build", "reading App.jsx", "Hero copy"
  ok: true                    // tool.post true, tool.fail false
}
```

Rules:
- `agent` is the actor: `agent_id` present -> that subagent, else `main`.
- Labels: when `PostToolUse(Agent)` arrives with `tool_response.agentId`, map that id to
  `label = tool_input.description` and `parent = <actor of that Agent call>`. If `SubagentStart` came
  first, emit `agent.start` with `label = agent_type` immediately and later an `agent.update` with the
  real label/parent. If the mapping is already known when `SubagentStart` arrives, emit `agent.start`
  with the real label. Fallback when no Post(Agent) ever arrives: oldest pending `PreToolUse(Agent)` with
  the same `subagent_type`.
- `range` from `structuredPatch`: walk each hunk's `lines`, new-line counter starts at `newStart`, " " and
  "+" advance it, "-" does not; collect line numbers of "+" lines; range = [min, max] over all hunks.
  Pure deletion (no "+"): range = [n, n] where n is the new-line position of the first "-".
  No structuredPatch on Write: range = [1, lineCount(content)].
  No structuredPatch on Edit: read the file (post-image) and locate `new_string`.
- `file` is `fs.realpathSync.native(file_path)` (fallback `path.resolve`).
- Redaction: `summary` never contains file contents. Bash summary = `$ ` + first 48 chars of the command
  with a leading `rtk ` stripped and anything matching common secret patterns (sk-..., ghp_..., AKIA...,
  xox., long hex/base64 >= 32 chars, `KEY=value` where KEY looks like a secret) replaced by `•••`.
- Pre and Post for the same `toolUseId` may arrive in either order (hooks are async). The conductor
  forwards both as they arrive; the overlay must tolerate Post before Pre (ignore a late Pre).

## Source tags (vite-plugin -> DOM -> overlay)

The Vite plugin (dev server only) rewrites `.jsx`/`.tsx` outside `node_modules`:
- Intrinsic elements (lowercase name, e.g. `<section>`): add `data-swarm="<rel>:<start>-<end>"`.
- Component elements (uppercase or member name, e.g. `<Button>`, `<motion.div>`): add
  `data-swarm-site="<rel>:<start>-<end>"` (lands on the DOM node only if the component forwards props).
- Skip fragments (`<>`, `Fragment`, `React.Fragment`) and elements that already have the attribute.
- `<rel>` = POSIX path relative to the Vite root, e.g. `src/components/Hero.jsx`.
  `<start>` = line of the element's opening `<`, `<end>` = line of its closing tag end (1-based).
- The plugin injects into index.html `<head>` (dev only), in this order:
  `<script>window.__LIVESWARM__={root:"<abs realpath of vite root>",conductor:"http://127.0.0.1:7777"}</script>`
  `<script src="http://127.0.0.1:7777/overlay.js" defer></script>`
- API: `import liveswarm from '@liveswarm/vite'` (or a relative import of `vite-plugin/index.mjs`);
  `plugins: [liveswarm(), react()]`. Options `{conductor?, include?, exclude?}`.

## Overlay behaviour (plugin/overlay/overlay.js)

- One zero-dependency script. Mounts `<liveswarm-overlay>` with a closed shadow root, fixed full-viewport,
  `pointer-events: none` always, very high z-index. Never changes the app's layout or styles.
- Connects `EventSource(conductor + "/stream")`, reconnects automatically. Also exposes
  `window.Liveswarm = { ingest(event), reset(), get state() }` so tests can drive it without a server.
- Matches an event file to tags: an element matches when `event.file === root + "/" + rel`, or (fallback)
  `event.file.endsWith("/" + rel)`.
- Landing resolver for `tool.post` edits, after the DOM settles (MutationObserver quiet for ~150 ms,
  max ~1200 ms after the event): (1) smallest visible element whose tag file matches and whose
  [start,end] overlaps `range` (consider both `data-swarm` and `data-swarm-site`); (2) the largest visible
  element tagged with that file (component root); (3) bounding box of nodes mutated in that window;
  (4) the edge dock (a file chip at the screen edge). Off-screen targets: show a pointer at the viewport
  edge rather than scrolling the user's page.
- `tool.pre` for an edit tool: the cursor starts travelling toward the best guess for that file
  (component root) so movement starts early; `tool.post` lands it precisely and plays the verb.
- One cursor per agent: distinct color, name pill (`label`), smooth eased travel. `agent.start`: the new
  cursor splits off from its parent's cursor with a short tether line. `agent.stop`: it flies back to the
  parent and merges (fades). `agent.update` relabels.
- Verbs: Edit = selection sweep over the target + `+N −M basename` chip; Write = bloom/outline pulse
  (dashed ghost box in the dock if nothing is mounted yet); CSS file edits = paint sweep;
  Bash = small terminal pill near the cursor that pulses green on post / red on fail;
  Read/Grep/Glob = subtle "glance" (dim chip, no landing).
- Pacing: per-agent queue of beats (travel + verb, each ~600-900 ms on screen). When a queue exceeds
  5 beats, compress durations 2-4x and merge consecutive edits to the same target. The display may lag
  the agent; it must never block anything.
- HUD: small, tasteful corner panel: connection dot, agent count, edit count, elapsed time.
