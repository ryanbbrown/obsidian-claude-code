/** Popover for browsing and resuming past Claude conversations */
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConversationInfo, deleteConversation, getClaudeProjectPath, listConversations } from "@/utils/claudeConversations";
import { makeRelativePath } from "@/utils";
import { History, Loader2, Trash2 } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ChatHistoryPopoverProps {
  vaultPath: string;
  onLoadConversation: (sessionId: string) => void;
}

/** Cleans up conversation title by making paths relative to vault */
function cleanTitle(title: string, vaultPath: string): string {
  // Handle @path references at the start
  if (title.startsWith('@')) {
    return makeRelativePath(title.slice(1), vaultPath);
  }
  return title;
}

/** Formats a date as relative time (e.g., "2 hours ago") */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 7) {
    return date.toLocaleDateString();
  } else if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else if (diffMins > 0) {
    return `${diffMins}m ago`;
  } else {
    return 'Just now';
  }
}

export const ChatHistoryPopover: React.FC<ChatHistoryPopoverProps> = ({
  vaultPath,
  onLoadConversation,
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<ConversationInfo[]>([]);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const projectPath = getClaudeProjectPath(vaultPath);
      const convs = await listConversations(projectPath);
      setConversations(convs);
    } catch (err) {
      console.error('Failed to load conversations:', err);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [vaultPath]);

  useEffect(() => {
    if (open) {
      loadConversations();
    }
  }, [open, loadConversations]);

  const handleSelect = (sessionId: string) => {
    setOpen(false);
    onLoadConversation(sessionId);
  };

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    try {
      const projectPath = getClaudeProjectPath(vaultPath);
      await deleteConversation(projectPath, sessionId);
      loadConversations();
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon">
              <History className="tw-size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Chat History</TooltipContent>
      </Tooltip>
      <PopoverContent className="tw-p-0" align="end" style={{ width: 420 }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--background-modifier-border)' }}>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Recent Conversations</h4>
        </div>
        <div style={{ height: 400, overflowY: 'auto' }}>
          {loading ? (
            <div className="tw-flex tw-items-center tw-justify-center tw-py-8">
              <Loader2 className="tw-size-6 tw-animate-spin tw-text-muted" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="tw-py-8 tw-text-center tw-text-muted tw-text-sm">
              No conversations found
            </div>
          ) : (
            <div style={{ padding: '4px 0' }}>
              {conversations.map((conv) => (
                <div
                  key={conv.sessionId}
                  onClick={() => handleSelect(conv.sessionId)}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--background-modifier-border)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14,
                      marginBottom: 6,
                      lineHeight: 1.4,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {cleanTitle(conv.title, vaultPath)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {formatRelativeTime(conv.timestamp)} · {conv.messageCount} messages
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, conv.sessionId)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 4,
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      borderRadius: 4,
                    }}
                    title="Delete conversation"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ChatHistoryPopover;
