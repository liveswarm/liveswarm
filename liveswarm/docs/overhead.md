# What Liveswarm costs you

Short version: **no model calls, no tokens spent, and Claude never waits on it.** Liveswarm only listens to
events Claude Code already emits. It never calls a model, its hooks add nothing to Claude's context, and they
run in the background. The one thing that can touch context is the five slash-command entries (see below).

All numbers below were measured on 2026-11-12 on an Apple Silicon Mac with Claude Code 2.1.314.

## Tokens and usage

| Check | Result |
|---|---|
| Claude Code's own plugin report (`claude plugin details`) | 8 hooks, "harness-only, no model context cost". Projected always-on cost for 0.2.0 is ~211 tokens, all from the 5 command entries |
| Same prompt with and without Liveswarm 0.1.0 (hooks only; input context, tokens) | 38,519 with, 38,556 without: identical within prompt-caching noise. Measured before the slash commands were added. |
| Hook output added to the conversation | None: every hook prints nothing and exits 0 |

Since 0.2.0 the plugin ships five slash commands (`demo`, `watch`, `record`, `setup`, `doctor`). Each is marked
`disable-model-invocation: true`, which per Claude Code's docs keeps it out of Claude's context: only you can run
it. Claude Code's own estimate (`claude plugin details liveswarm`) is about 210 tokens "always-on" for them, and
that estimate is the same (206 tokens) when the flag is removed, so it ignores the flag. We have not confirmed
the real effect with a live token count on 0.2.0. Worst case, it is about 210 tokens once per session. The plugin
has no agents, MCP servers or skills beyond those commands.

## Speed

| Check | Result |
|---|---|
| Time per hook event (200 runs) | median 11.7 ms, 95th percentile 13.1 ms, max 40 ms |
| Does Claude wait for it? | No. Hooks are registered as async, so Claude moves on immediately |
| Conductor not running | The hook exits in about 7 ms and does nothing |

## Your machine

| Check | Result |
|---|---|
| Conductor memory | about 66 MB after 200 events (57.7 MB median in the 12-agent run below) |
| Conductor CPU | brief blips during bursts, idle otherwise |
| Disk | about 0.5 KB per event in `~/.liveswarm/sessions/`, kept 7 days |
| Network | none beyond 127.0.0.1; nothing leaves your machine |

## Under load: the 12-agent demo session

The filmed session in the demo video: Claude Code built a 12-section landing page with 12 subagents working
in parallel (Fable 5.2 as main, Sonnet 5.5 subagents), 117 edits in 4 min 38 s, with Liveswarm running the
whole time. An earlier take of the same build gave nearly identical numbers.

| Check | Result |
|---|---|
| Hook events Liveswarm handled | 615 hooks, 615 cursor events (about 130 events a minute) |
| Conductor memory | median 57.7 MB, peak 61.8 MB |
| Conductor CPU (sampled every second) | median 0.0%, 95th percentile 0.6%, peak 1.3% |
| Disk for the whole session | 584 KB of logs |
| Tokens Liveswarm added to the session | 0 from hooks (the session's own cost was $3.57 for 5.3 M input and 94 K output tokens, all from the build itself) |

The build itself is what costs tokens; watching it costs nothing. (That session ran on 0.1.0, before the commands existed.)

## Privacy

Hook events reach the conductor over a unix socket in `~/.liveswarm` (mode 0700). The browser stream binds
127.0.0.1 only. File contents are never forwarded, and Bash commands are redacted before they are shown or
logged.
