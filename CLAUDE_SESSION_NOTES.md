# Claude Code Obsidian Plugin - Session Notes

## What We're Building
Integrating Claude CLI (`claude` command) streaming into an Obsidian chat UI, replacing a dummy response with real Claude responses including tool call display.

## Files Changed

### `src/claude.ts`
- Added `runClaudeChat()` function that spawns Claude CLI with `--output-format stream-json`
- Added `stopClaudeChat()` to kill the process
- Added `formatToolCallComplete()` to create tool call markers
- Parses streaming JSON and emits content via `onContentUpdate` callback
- Handles tool_use blocks (stored until result arrives) and tool_result blocks (triggers marker emission)

### `src/components/Chat.tsx`
- Replaced dummy streaming with `runClaudeChat()` call
- Uses `onContentUpdate` to set `currentAiMessage` during streaming
- On `onComplete`, saves `finalContent` to `chatHistory` and clears `currentAiMessage`

### `src/components/CopilotView.tsx`
- Updated to pass `claudePath` from plugin settings to Chat component

### `tsconfig.json`
- Fixed to exclude `claude-code-chat/` and `obsidian-copilot/` directories
- Added node types

## Current Problem
**Tool calls show during streaming but disappear when the final message is saved to history.**

## What We Verified
1. `fullContent` in claude.ts grows correctly and contains tool markers (verified via console logs)
2. `finalContent` in Chat.tsx has correct length (19472 chars) and contains `TOOL_CALL_START` markers when saved
3. The content being passed to the history message IS correct

## The Issue Is in the UI Layer
The same content renders tool calls correctly during streaming (`isStreaming={true}`) but NOT when saved to history (`isStreaming={false}`).

Both use `ChatSingleMessage` component. The flow is:
1. **Streaming**: `currentAiMessage` → `ChatSingleMessage` with `isStreaming={true}` → tools SHOW
2. **Complete**: `chatHistory[n].message` → `ChatSingleMessage` with `isStreaming={false}` → tools DISAPPEAR

## Key Files to Investigate

### `src/components/chat-components/ChatSingleMessage.tsx`
- Line 170-175: `messageId` is set via `useRef` - streaming gets `temp-...`, history gets `uuid`
- Line 400-573: Main `useEffect` that parses and renders tool calls
- Line 413-417: Calls `preprocess()` then `parseToolCallMarkers()`
- Line 454-485: Creates tool call containers and renders `ToolCallBanner`
- Line 603-608: Cleanup only runs for `temp-` messageIds

### `src/components/chat-components/toolCallRootManager.tsx`
- Manages React roots for tool call banners in a global `window.__copilotToolCallRoots` registry
- Roots are keyed by messageId → toolCallId

### `src/LLMProviders/chainRunner/utils/toolCallParser.ts`
- Line 170-291: `parseToolCallMarkers()` function
- Regex at line 173-174 parses `<!--TOOL_CALL_START:...-->...<!--TOOL_CALL_END:...-->`

## Next Steps to Investigate

1. **Check if `preprocess()` modifies content differently based on `isStreaming`**
   - The `preprocess` function at line 215-398 has `isStreaming` in its dependency array
   - Look for any code that might strip or modify tool call markers when `isStreaming=false`

2. **Check if `parseToolCallMarkers()` returns different results**
   - Add logging to see if it finds matches for both streaming and history messages
   - The regex should work the same either way

3. **Check if the DOM manipulation is failing**
   - Line 431-485 creates containers and renders ToolCallBanner
   - Maybe `contentRef.current` is null or different for history messages?

4. **Check the `useEffect` dependencies**
   - Line 573: `[message, app, componentRef, isStreaming, preprocess]`
   - Verify the effect actually runs for the history message

## Tool Call Marker Format
```
<!--TOOL_CALL_START:id:toolName:displayName:emoji:confirmationMessage:isExecuting--><!--TOOL_CALL_END:id:ENC:encodedResult-->
```

Example from logs:
```
<!--TOOL_CALL_START:toolu_01RUMzpXdUdmus5kA3gMCvoo:Glob:Glob:🔧::false--><!--TOOL_CALL_END:toolu_01RUMzpXdUdmus5kA3gMCvoo:ENC:No%20files%20found-->
```

## Build & Deploy Command
```bash
node esbuild.config.mjs production && cp main.js manifest.json ~/vault/.obsidian/plugins/obsidian-claude-code/
```

## Logging Currently Added
- `src/claude.ts`: `[MSG]`, `[EMIT]`, `[COMPLETE]` logs
- `src/components/Chat.tsx`: `[CHAT] onComplete` logs
- `src/LLMProviders/chainRunner/utils/toolCallParser.ts`: `[PARSE]` logs (partially added)
- `src/components/chat-components/ChatSingleMessage.tsx`: `[SINGLE_MSG]` logs (partially added)

Remove these before final commit.
