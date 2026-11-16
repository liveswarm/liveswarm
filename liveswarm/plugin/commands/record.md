---
description: Film this Claude Code session building your app, as vertical and widescreen videos with a smart timelapse and end card.
argument-hint: "[--out DIR] [--stop]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Run this with the Bash tool, in the background (run_in_background: true), so the session is not blocked:

`node "${CLAUDE_PLUGIN_ROOT}/cli/liveswarm.mjs" record $ARGUMENTS`

Then read its first lines of output and tell the user, in one or two lines: that filming has started (or the error it printed), where the videos will be saved, and that it stops by itself about 90 seconds after the agents go quiet, or with `/liveswarm:record --stop`. If it says no page to record, tell the user to run `/liveswarm:watch` first. If the arguments were `--stop`, run it in the foreground instead and show its output. Say nothing else.
