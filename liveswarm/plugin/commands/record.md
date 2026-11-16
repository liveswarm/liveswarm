---
description: Film the next Claude Code session as vertical and widescreen videos with a smart timelapse and end card.
argument-hint: "[--out DIR]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Run this with the Bash tool, in the background (run_in_background: true), so the session is not blocked:

`node "${CLAUDE_PLUGIN_ROOT}/cli/liveswarm.mjs" record $ARGUMENTS`

Then read its first lines of output and tell the user in one line that recording has started and where the files will be saved. Say nothing else.
