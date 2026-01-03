/** Utilities for reading Claude conversation history from ~/.claude/projects/ */
import { readdir, readFile, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ChatMessage, MessageSegment, TextSegment, ToolCallSegment } from '@/types/message';
import { formatDateTime } from '@/utils';
import { AI_SENDER, USER_SENDER } from '@/constants';
import { v4 as uuidv4 } from 'uuid';

/** Conversation metadata for display in history list */
export interface ConversationInfo {
  sessionId: string;
  title: string;
  timestamp: Date;
  messageCount: number;
}

/** Content block in Claude's storage format */
interface ClaudeContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

/** Raw JSONL message from Claude's storage */
interface ClaudeStoredMessage {
  type: 'user' | 'assistant' | 'system' | 'queue-operation';
  sessionId?: string;
  timestamp?: string;
  message?: {
    content?: string | ClaudeContentBlock[];
  };
}

/** Extracts text from message content (handles both string and array formats) */
function extractTextContent(content: string | ClaudeContentBlock[] | undefined): string | null {
  if (!content) return null;
  if (typeof content === 'string') return content;
  const textBlock = content.find(c => c.type === 'text' && c.text);
  return textBlock?.text || null;
}

/** Extracts content blocks array (returns empty array for string content) */
function getContentBlocks(content: string | ClaudeContentBlock[] | undefined): ClaudeContentBlock[] {
  if (!content || typeof content === 'string') return [];
  return content;
}

/** Encodes a vault path to Claude's project directory name format */
export function encodeProjectPath(vaultPath: string): string {
  return vaultPath.replace(/\//g, '-');
}

/** Gets the Claude projects directory path for a vault */
export function getClaudeProjectPath(vaultPath: string): string {
  const encodedPath = encodeProjectPath(vaultPath);
  return join(homedir(), '.claude', 'projects', encodedPath);
}

/** Lists all conversations for a project, sorted by most recent first */
export async function listConversations(projectPath: string): Promise<ConversationInfo[]> {
  const conversations: ConversationInfo[] = [];

  try {
    const files = await readdir(projectPath);

    for (const file of files) {
      // Skip agent subconversations and non-JSONL files
      if (!file.endsWith('.jsonl') || file.startsWith('agent-')) continue;

      const sessionId = file.replace('.jsonl', '');
      const filePath = join(projectPath, file);

      try {
        const content = await readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);

        let title = 'Untitled conversation';
        let timestamp: Date | null = null;
        let messageCount = 0;

        for (const line of lines) {
          try {
            const msg: ClaudeStoredMessage = JSON.parse(line);

            // Get title from first user message with text content
            if (msg.type === 'user' && title === 'Untitled conversation') {
              const text = extractTextContent(msg.message?.content);
              if (text) {
                title = text.slice(0, 200);
                if (text.length > 200) title += '...';
              }
            }

            // Get timestamp from first message
            if (!timestamp && msg.timestamp) {
              timestamp = new Date(msg.timestamp);
            }

            // Count user and assistant messages
            if (msg.type === 'user' || msg.type === 'assistant') {
              messageCount++;
            }
          } catch {
            // Skip malformed lines
          }
        }

        // Fallback to file modification time if no timestamp in content
        if (!timestamp) {
          const stats = await stat(filePath);
          timestamp = stats.mtime;
        }

        conversations.push({
          sessionId,
          title,
          timestamp,
          messageCount,
        });
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    // Project directory doesn't exist yet
    return [];
  }

  // Filter out empty conversations and sort by most recent first
  return conversations
    .filter(c => c.messageCount > 0)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 50); // Limit to 50 most recent
}

/** Loads conversation messages from a session file and converts to ChatMessage[] */
export async function loadConversationMessages(
  projectPath: string,
  sessionId: string
): Promise<ChatMessage[]> {
  const filePath = join(projectPath, `${sessionId}.jsonl`);
  const content = await readFile(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  const messages: ChatMessage[] = [];
  const pendingToolCalls = new Map<string, ToolCallSegment>();

  // Accumulator for grouping adjacent assistant content
  let currentAssistantSegments: MessageSegment[] = [];
  let currentAssistantTimestamp: string | undefined;

  /** Finalizes the current assistant message if there are accumulated segments */
  const finalizeAssistantMessage = () => {
    if (currentAssistantSegments.length > 0) {
      messages.push({
        id: uuidv4(),
        message: segmentsToString(currentAssistantSegments),
        sender: AI_SENDER,
        timestamp: currentAssistantTimestamp ? formatDateTime(new Date(currentAssistantTimestamp)) : null,
        isVisible: true,
        segments: currentAssistantSegments,
      });
      currentAssistantSegments = [];
      currentAssistantTimestamp = undefined;
    }
  };

  for (const line of lines) {
    try {
      const msg: ClaudeStoredMessage = JSON.parse(line);

      if (msg.type === 'user') {
        const text = extractTextContent(msg.message?.content);
        const blocks = getContentBlocks(msg.message?.content);
        const toolResults = blocks.filter(c => c.type === 'tool_result');

        // Handle tool results - update pending tool calls (stays in current assistant block)
        for (const result of toolResults) {
          if (result.tool_use_id && pendingToolCalls.has(result.tool_use_id)) {
            const toolCall = pendingToolCalls.get(result.tool_use_id)!;
            toolCall.isExecuting = false;
            toolCall.result = typeof result.content === 'string'
              ? result.content.slice(0, 100) + (result.content.length > 100 ? '...' : '')
              : 'Completed';
            pendingToolCalls.delete(result.tool_use_id);
          }
        }

        // User message with actual text content - finalize assistant and add user message
        if (text) {
          finalizeAssistantMessage();
          messages.push({
            id: uuidv4(),
            message: text,
            sender: USER_SENDER,
            timestamp: msg.timestamp ? formatDateTime(new Date(msg.timestamp)) : null,
            isVisible: true,
          });
        }
      } else if (msg.type === 'assistant') {
        const blocks = getContentBlocks(msg.message?.content);

        // Set timestamp from first assistant message in this group
        if (!currentAssistantTimestamp && msg.timestamp) {
          currentAssistantTimestamp = msg.timestamp;
        }

        for (const block of blocks) {
          if (block.type === 'text' && block.text) {
            currentAssistantSegments.push({ type: 'text', content: block.text } as TextSegment);
          } else if (block.type === 'tool_use' && block.id && block.name) {
            const toolSegment: ToolCallSegment = {
              type: 'toolCall',
              id: block.id,
              name: block.name,
              input: block.input || {},
              isExecuting: true,
            };
            currentAssistantSegments.push(toolSegment);
            pendingToolCalls.set(block.id, toolSegment);
          }
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  // Finalize any remaining assistant message
  finalizeAssistantMessage();

  return messages;
}

/** Converts segments to plain text for message display */
function segmentsToString(segments: MessageSegment[]): string {
  return segments
    .map((seg) => {
      if (seg.type === 'text') return seg.content;
      return `[${seg.name}: ${seg.result || 'completed'}]`;
    })
    .join('');
}

/** Deletes a conversation file */
export async function deleteConversation(projectPath: string, sessionId: string): Promise<void> {
  await unlink(join(projectPath, `${sessionId}.jsonl`));
}
