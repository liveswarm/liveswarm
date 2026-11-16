# Liveswarm plugin

Liveswarm shows Claude Code building your app as a swarm of named cursors on your live app preview. Every cursor is a real agent (the main agent plus each subagent) and every move comes from a real hook event. It makes no model calls and Claude never waits on it.

## Install

```sh
claude plugin install liveswarm --marketplace liveswarm/liveswarm
```

On an older Claude Code without `--marketplace`, use two steps: `claude plugin marketplace add liveswarm/liveswarm`, then `claude plugin install liveswarm@liveswarm`.

## Commands

- `/liveswarm:demo`: replay of a real Claude Code session (12 agents), served locally and opened in your browser.
- `/liveswarm:watch [--url URL]`: put agent cursors on your running dev server (any framework), through a local proxy.
- `/liveswarm:record`: film the next session, vertical and widescreen, with timelapse and end card.
- `/liveswarm:setup`: add the dev-only Vite tagger for exact element landings.
- `/liveswarm:doctor`: check that everything works.

## Notes

All processes bind 127.0.0.1 only. Nothing is sent off your machine. Set `LIVESWARM=off` to disable the hooks. See the [project README](https://github.com/liveswarm/liveswarm#readme) for details, costs and support status. MIT licensed. Not affiliated with Anthropic.
