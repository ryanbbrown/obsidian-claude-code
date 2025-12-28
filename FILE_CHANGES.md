# File Changes: obsidian-claude-code vs obsidian-copilot

This document tracks which files were modified, newly created, or unchanged copies from the original obsidian-copilot repo.

## New Files (Created for Claude Code)

| File | Description |
|------|-------------|
| `src/claude.ts` | Claude CLI process spawning, streaming JSON parsing, tool call tracking, session management |
| `src/settings.ts` | Simple settings interface with just `claudePath` |
| `src/global.d.ts` | Global React JSX type declarations |

## Modified Files

### Major Rewrites

| File | Change | Notes |
|------|--------|-------|
| `src/main.ts` | 657→160 lines | Complete rewrite. Removed ProjectManager, BrevilabsClient, vector store, chat history. Now just settings + chat view. |
| `src/components/Chat.tsx` | 863→174 lines | Removed LangChain integration. Now directly uses `runClaudeChat()` with simple state. |
| `src/components/CopilotView.tsx` | 112→68 lines | Simplified wrapper. Removed ChatManager, FileParserManager. |
| `src/chainFactory.ts` | 213→8 lines | Gutted - all chain implementations removed. |

### Minor Changes

| File | Notes |
|------|-------|
| `src/components/chat-components/ChatSingleMessage.tsx` | Fixed messageId to use `timestamp.epoch` instead of UUID (bug fix for stale cleanup) |
| `src/components/chat-components/toolCallRootManager.tsx` | Added debug logging (now removed) |
| `src/LLMProviders/chainRunner/utils/toolCallParser.ts` | Added debug logging (now removed) |

## Unchanged Files (Copied from obsidian-copilot)

~107 files copied as-is, including:

- **UI Components**: All chat-components (pills, modals, badges, etc.)
- **UI Primitives**: button, card, checkbox, dialog, input, etc.
- **LLM Utilities**: citationUtils.ts, toolCallParser.ts, context processing
- **Core**: constants.ts, types, settings model, vault data atoms
- **Styling**: All CSS/Tailwind utilities

## Key Architectural Differences

| Aspect | obsidian-copilot | obsidian-claude-code |
|--------|------------------|----------------------|
| LLM Integration | LangChain chains | Direct Claude CLI spawning |
| Complexity | Full-featured (projects, semantic search, commands) | Simplified chat interface |
| Settings | Complex model/provider management | Just Claude path |
| Chat State | MessageRepository + ChatManager | Simple React useState |
| Session | Custom persistence | Claude CLI `--resume` flag |
