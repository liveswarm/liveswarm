---
description: See Liveswarm in under a minute: a replay of a real 12-agent Claude Code build, on your own screen.
argument-hint: "[--port N] [--no-open]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Run this with the Bash tool, in the background (run_in_background: true), so the session is not blocked:

`node "${CLAUDE_PLUGIN_ROOT}/cli/liveswarm.mjs" demo $ARGUMENTS`

Then read its first lines of output and tell the user the URL in one line. Say nothing else.
