---
description: Add the Liveswarm Vite tagger to this project so cursors land on exact elements.
argument-hint: "[--yes]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Run this with the Bash tool (foreground):

`node "${CLAUDE_PLUGIN_ROOT}/cli/liveswarm.mjs" setup $ARGUMENTS`

Without --yes it changes nothing when run from here: it only reports what it would do. Show the user that plan in one or two lines and ask whether to apply it. Run it again with --yes only after the user says yes (or if they passed --yes). Say nothing else.
