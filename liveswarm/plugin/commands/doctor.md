---
description: Check that Liveswarm is installed and working: conductor, hooks, ports, browser.
argument-hint: ""
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Run this with the Bash tool (foreground):

`node "${CLAUDE_PLUGIN_ROOT}/cli/liveswarm.mjs" doctor $ARGUMENTS`

Then show the user the output as is. Say nothing else.
