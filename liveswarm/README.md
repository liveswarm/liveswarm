# Liveswarm

**Every cursor is a real agent. Every move is a real edit.**

See the [repository README](../README.md) for install and usage:
`claude plugin install liveswarm --marketplace liveswarm/liveswarm`, then `/liveswarm:demo`.

This folder is the source: `plugin/` (the Claude Code plugin, the only part that gets installed), `vite-plugin/` (`@liveswarm/vite` tagger), `tools/` (recorder and replay), `fixtures/` (real recordings), `docs/`, and [CONTRACT.md](CONTRACT.md) (event format and endpoints).

## Develop on it (about 2 minutes)

Users never need this: they install the plugin and run `/liveswarm:demo`. To work on the source:

```sh
# 1. Install the packages that need dependencies
npm --prefix vite-plugin install
npm --prefix demo-app install

# 2. Start the conductor (the plugin also auto-starts it on SessionStart)
node plugin/conductor/conductor.mjs &

# 3. Start the demo app and open http://127.0.0.1:5173
npm --prefix demo-app run dev

# 4. Run Claude Code inside demo-app with the plugin loaded, and paste a prompt from demo-app/DEMO.md
cd demo-app && claude --plugin-dir ../plugin
```

Dev tools (not shipped in the plugin):

- `node tools/replay.mjs <session.raw.jsonl> --map FROM=TO` replays a recorded hook stream.
  Sessions are logged to `~/.liveswarm/sessions/`.
- `node tools/film.mjs` and `node tools/record.mjs` are the recorders behind `/liveswarm:record`.
- `tools/reset-demo.sh` restores the demo app so a prompt can be re-run.
- `tools/overlay-dev/` is the overlay test harness (Playwright screenshots).

Versions: the plugin is 0.2.0. The conductor reports `0.1.0` on `/health`; that is the conductor
protocol version in [CONTRACT.md](CONTRACT.md), and it only changes when the protocol does.

## How it works

```
Claude Code ── async hooks ──▶ emit.sh ── unix socket ──▶ conductor ── SSE ──▶ overlay.js (in your app)
  (main + subagents)          (never blocks)             (labels, line ranges,     (one cursor per agent,
                                                          redaction, logs)          lands on tagged DOM)
                                   @liveswarm/vite tags every JSX element with data-swarm="file:start-end"
```

- `plugin/`: the Claude Code plugin. `hooks/hooks.json` registers async command hooks;
  `conductor/conductor.mjs` is a zero-dependency Node server; `overlay/overlay.js` is the cursor
  overlay (closed shadow root, `pointer-events: none`, zero dependencies).
- `vite-plugin/`: dev-only Vite plugin that tags JSX elements with their source file and line range
  and injects the overlay. Nothing is added to production builds.
- `demo-app/`: "Oriel", a demo landing page built for parallel agent edits.
- `CONTRACT.md`: the event format and behaviour every component implements.
- `fixtures/`: real hook payloads captured from Claude Code 2.1.314.

Privacy: everything is local. Hooks go over a unix socket in `~/.liveswarm` (mode 0700), the
browser stream binds 127.0.0.1 only, file contents are never forwarded, and Bash commands are
redacted before display or logging.

## Known gaps

- Exact element landings need the Vite tagger (`/liveswarm:setup`). Other frameworks work through `/liveswarm:watch` with a DOM-change fallback; Next.js, Vue and Svelte tagging are designed but not built.
- Files changed by Bash commands (instead of Edit/Write) show only as a terminal pill.
- Pacing compresses bursts, so the display can trail the agent by a few seconds.
- Tested on macOS only. Linux should work (unix socket, `curl --unix-socket`, bash) but is untested; Windows is not supported (hooks need bash and curl).
