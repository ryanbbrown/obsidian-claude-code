# Obsidian Claude Code Plugin

## Build & Deploy

After making changes, build and deploy (skips TypeScript type checking due to pre-existing errors):

```bash
node esbuild.config.mjs production && cp main.js manifest.json ~/vault/.obsidian/plugins/obsidian-claude-code/
```

Then reload Obsidian or disable/enable the plugin.
