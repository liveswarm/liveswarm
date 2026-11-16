# Liveswarm

[![Liveswarm: 12 Claude Code agents building a page as live cursors](liveswarm/media/nocturne-wide.gif)](liveswarm/media/nocturne-wide.mp4)

<sub>A real session: 12 Claude Code agents building one page. Click for the full 69-second video.</sub>

**Watch Claude Code build your app as a swarm of live cursors.**
Every cursor is a real agent. Every move is a real edit.

Free and open source. No model calls. Nothing leaves your machine.

## Install

```sh
claude plugin install liveswarm --marketplace liveswarm/liveswarm
```

On an older Claude Code without `--marketplace`, use two steps: `claude plugin marketplace add liveswarm/liveswarm`, then `claude plugin install liveswarm@liveswarm`.

Or inside Claude Code: `/plugin marketplace add liveswarm/liveswarm`, then `/plugin install liveswarm@liveswarm`.

Then run these inside Claude Code:

| Command | What you get |
|---|---|
| `/liveswarm:demo` | See it in under a minute. A replay of a real 12-agent build plays on your own screen. |
| `/liveswarm:watch` | Your own app, zero setup. Finds your dev server and shows agent cursors on it. |
| `/liveswarm:record` | Share it. Films your next session in vertical and widescreen, with a smart timelapse and end card. |
| `/liveswarm:setup` | Exact landings. Adds a dev-only Vite tagger so cursors land on the precise element. |
| `/liveswarm:doctor` | Checks that everything is working. |

The demo is labelled "Replay of a real Claude Code session". It is a recording, not a simulation.

## What it costs you

No model calls and no tokens spent. Liveswarm only listens to events Claude Code already emits, and its hooks run in the background and print nothing. The five slash commands are user-only (`disable-model-invocation`), so Claude does not pick them up on its own; Claude Code's own estimate for their menu entries is about 200 tokens, and that is the worst case. Measured: about 12 ms per event, 58 to 66 MB of memory, no change in input tokens from the hooks. Full numbers in [liveswarm/docs/overhead.md](liveswarm/docs/overhead.md).

## Privacy

Everything stays on 127.0.0.1. Hook events travel over a local unix socket. File contents are never forwarded and shell commands are redacted before display or logging. No accounts, no telemetry, no network calls.

## How it works

```
Claude Code hooks -> conductor (local) -> overlay on your app preview
```

1. The plugin registers async hooks. Each tool call by the main agent or a subagent is sent to a small local server (the conductor).
2. `watch` starts a local proxy in front of your dev server and injects the overlay into the page. It passes websockets and hot reload straight through.
3. The overlay draws one named cursor per agent. A cursor moves only when a real hook event says so. With `setup`, cursors land on the exact JSX element that changed; without it they use a DOM-change fallback.

Event format and endpoints: [liveswarm/CONTRACT.md](liveswarm/CONTRACT.md).

## Support

| Platform | Status |
|---|---|
| macOS | Built and tested here. |
| Linux | Expected to work (Node 22, curl, bash). Not yet tested. |
| Windows | Not supported yet. Hooks need bash and curl; use WSL at your own risk. |

Needs Node 22+ and `curl`. `record` also needs Chrome or Playwright browsers and ffmpeg. Works with any web framework through `watch`; exact landings need Vite.

## Credits

Inspired by Joel Califa's Swarm and Dhvanil Patel's Swarm Rebuild, which made the swarm-cursor look famous.
Their cursors are a beautiful animation; Liveswarm's are real agents doing real work.

Liveswarm is an independent project and is not affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.

## License

[MIT](LICENSE)
