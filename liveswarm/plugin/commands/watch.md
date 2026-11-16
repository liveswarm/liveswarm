---
description: Show Claude Code agents as live cursors on your own running dev server, with zero project setup.
argument-hint: "[--url http://localhost:5173]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Run this with the Bash tool, in the background (run_in_background: true), so the session is not blocked:

`node "${CLAUDE_PLUGIN_ROOT}/cli/liveswarm.mjs" watch $ARGUMENTS`

Then read its first lines of output and tell the user the proxied URL in one line. If it says no dev server was found, tell the user to start theirs or pass --url. Say nothing else.
