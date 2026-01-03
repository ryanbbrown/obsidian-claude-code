/** Simplified ChatControls with hunk-level pending edits UI. */
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChatHistoryPopover } from "@/components/chat-components/ChatHistoryPopover";
import { usePendingFiles, PendingEditsManager, Hunk } from "@/pendingEdits";
import { MessageCirclePlus, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface ChatControlsProps {
  onNewChat?: () => void;
  vaultPath?: string;
  onLoadConversation?: (sessionId: string) => void;
}

/** Renders a single hunk with accept/reject controls. */
function HunkRow({ filePath, hunk }: { filePath: string; hunk: Hunk }) {
  const handleAccept = () => {
    PendingEditsManager.getInstance().acceptHunk(filePath, hunk.id);
  };

  const handleReject = () => {
    PendingEditsManager.getInstance().rejectHunk(filePath, hunk.id);
  };

  const statusColors = {
    pending: "tw-bg-orange-500/10 tw-border-orange-500/30",
    accepted: "tw-bg-green-500/10 tw-border-green-500/30",
    rejected: "tw-bg-red-500/10 tw-border-red-500/30",
  };

  return (
    <div className={cn(
      "tw-flex tw-items-center tw-gap-2 tw-px-2 tw-py-1 tw-rounded tw-border tw-text-xs",
      statusColors[hunk.status]
    )}>
      <span className="tw-flex-1 tw-font-mono tw-truncate" title={hunk.preview}>
        {hunk.preview}
      </span>
      {hunk.status === 'pending' && (
        <>
          <button
            onClick={handleAccept}
            className="tw-rounded tw-p-0.5 hover:tw-bg-green-500/20"
            title="Accept hunk"
          >
            <Check className="tw-size-3 tw-text-green-500" />
          </button>
          <button
            onClick={handleReject}
            className="tw-rounded tw-p-0.5 hover:tw-bg-red-500/20"
            title="Reject hunk"
          >
            <X className="tw-size-3 tw-text-red-500" />
          </button>
        </>
      )}
      {hunk.status === 'accepted' && (
        <span className="tw-text-green-500 tw-text-[10px]">accepted</span>
      )}
      {hunk.status === 'rejected' && (
        <span className="tw-text-red-500 tw-text-[10px]">rejected</span>
      )}
    </div>
  );
}

export const ChatControls: React.FC<ChatControlsProps> = ({
  onNewChat,
  vaultPath,
  onLoadConversation,
}) => {
  const pendingFiles = usePendingFiles();
  const [isExpanded, setIsExpanded] = useState(true);

  const hasPendingFiles = pendingFiles.length > 0;
  const totalHunks = pendingFiles.reduce((sum, f) => sum + f.hunks.length, 0);
  const pendingHunks = pendingFiles.reduce(
    (sum, f) => sum + f.hunks.filter(h => h.status === 'pending').length,
    0
  );
  const allDecided = pendingHunks === 0 && totalHunks > 0;

  const handleAcceptAll = async () => {
    await PendingEditsManager.getInstance().acceptAllHunks();
  };

  const handleRejectAll = async () => {
    await PendingEditsManager.getInstance().rejectAllHunks();
  };

  const handleApplyDecisions = async () => {
    await PendingEditsManager.getInstance().applyAllHunkDecisions();
  };

  return (
    <div className="tw-flex tw-flex-col tw-gap-2">
      {hasPendingFiles && (
        <div className="tw-flex tw-flex-col tw-gap-1 tw-p-2 tw-rounded tw-bg-orange-500/5 tw-border tw-border-orange-500/20">
          <div className="tw-flex tw-items-center tw-justify-between">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="tw-flex tw-items-center tw-gap-1 tw-text-xs tw-font-medium tw-text-orange-600"
            >
              {isExpanded ? <ChevronUp className="tw-size-3" /> : <ChevronDown className="tw-size-3" />}
              {pendingFiles.length} file(s), {totalHunks} hunk(s) ({pendingHunks} pending)
            </button>
            <div className="tw-flex tw-items-center tw-gap-1">
              {allDecided ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="tw-h-6 tw-text-xs"
                      onClick={handleApplyDecisions}
                    >
                      Apply
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Apply all hunk decisions</TooltipContent>
                </Tooltip>
              ) : (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="tw-size-6"
                        onClick={handleAcceptAll}
                      >
                        <Check className="tw-size-3.5 tw-text-green-500" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Accept All Hunks</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="tw-size-6"
                        onClick={handleRejectAll}
                      >
                        <X className="tw-size-3.5 tw-text-red-500" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Reject All Hunks</TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>
          </div>

          {isExpanded && (
            <div className="tw-flex tw-flex-col tw-gap-2 tw-mt-1">
              {pendingFiles.map(file => (
                <div key={file.filePath} className="tw-flex tw-flex-col tw-gap-1">
                  <div className="tw-text-xs tw-font-medium tw-text-muted-foreground tw-truncate" title={file.vaultPath}>
                    {file.vaultPath}
                  </div>
                  {file.hunks.map(hunk => (
                    <HunkRow key={hunk.id} filePath={file.filePath} hunk={hunk} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="tw-flex tw-items-center tw-justify-end tw-gap-2">
        {vaultPath && onLoadConversation && (
          <ChatHistoryPopover
            vaultPath={vaultPath}
            onLoadConversation={onLoadConversation}
          />
        )}
        {onNewChat && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onNewChat}>
                <MessageCirclePlus className="tw-size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New Chat</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default ChatControls;
