# Implement Claude CLI Integration for Obsidian Plugin

## Context

This is an Obsidian plugin that provides Claude Code integration. We're switching from the Agent SDK approach to spawning the Claude CLI directly, which provides streaming, tool use, session management, and the full Claude Code experience.

## Current State

- **SDK version preserved**: The Agent SDK implementation has been renamed with `-sdk` suffix:
  - `src/claude-sdk.ts` - SDK-based runClaude function
  - `claude-worker-sdk.mjs` / `claude-worker-bundle-sdk.mjs` - Worker files for SDK
  - `src/main.ts` currently imports from `./claude-sdk` to keep things working

- **Reference implementation**: `claude-code-chat/src/extension.ts` is a VS Code extension that spawns the Claude CLI. Key sections:
  - Lines 458-600: `_sendMessageToClaude()` shows how to spawn the CLI
  - Uses `--output-format stream-json --input-format stream-json` for bidirectional communication
  - Session management via `--resume <sessionId>` flag

## Goal

Create `src/claude.ts` that spawns the Claude CLI instead of using the Agent SDK. The Ctrl+K edit feature in `editModal.ts` should work the same from the user's perspective, but use CLI under the hood.

## Implementation Tasks

1. **Create `src/claude.ts`** with a `runClaude(prompt: string): Promise<string>` function that:
   - Spawns the `claude` CLI as a child process
   - Uses `--output-format stream-json` to get structured responses
   - Parses the streaming JSON output to extract the assistant's text response
   - Returns the final text result

2. **Export `setPluginDir`** (can be a no-op for CLI version, or remove from main.ts if not needed)

3. **Update `src/main.ts`** to import from `./claude` instead of `./claude-sdk`

## Key Reference Code

From `claude-code-chat/src/extension.ts` lines 520-600, the CLI is spawned like:

```typescript
const args = [
  '--output-format', 'stream-json',
  '--input-format', 'stream-json',
  '--verbose'
];

// For simple single-shot, you might just use:
// '--output-format', 'stream-json', '-p', prompt

const claudeProcess = cp.spawn('claude', args, {
  cwd: cwd,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
});
```

The streaming JSON output contains message objects. For a simple text response, look for messages with `type: 'assistant'` and extract the text content.

## Simplest Approach for Ctrl+K

For a single-shot edit (no conversation), you can use:

```bash
claude -p "your prompt here" --output-format stream-json
```

Parse stdout for JSON lines, find the assistant message content, and return it.

## Files to Reference

- `claude-code-chat/src/extension.ts` - Full CLI integration with streaming
- `src/claude-sdk.ts` - Current SDK approach (for API reference)
- `src/main.ts` - Where runClaude is called
- `src/editModal.ts` - The Ctrl+K modal UI

## Testing

After implementation, test with Cmd+K on selected text in Obsidian to verify the CLI integration works.
