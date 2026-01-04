/** Pending edits UI shown at top of chat. */
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePendingFiles, PendingEditsManager, PendingFile } from "@/pendingEdits";
import { Check, X } from "lucide-react";
import React from "react";

/** Renders a file row with accept/reject controls for all changes in that file. */
function FileRow({ file }: { file: PendingFile }) {
  const handleAccept = () => {
    PendingEditsManager.getInstance().acceptAllHunksForFile(file.filePath);
  };

  const handleReject = async () => {
    await PendingEditsManager.getInstance().rejectAllHunksForFile(file.filePath);
  };

  const changeCount = file.hunks.length;

  return (
    <div className="tw-flex tw-items-center tw-gap-1 tw-text-xs">
      <span className="tw-flex-1 tw-truncate tw-text-muted-foreground" title={file.vaultPath}>
        {file.vaultPath}
        <span className="tw-text-orange-600 tw-ml-1">({changeCount})</span>
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="tw-size-6" onClick={handleAccept}>
            <Check className="tw-size-3.5 tw-text-green-500" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Accept changes in this file</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="tw-size-6" onClick={handleReject}>
            <X className="tw-size-3.5 tw-text-red-500" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reject changes in this file</TooltipContent>
      </Tooltip>
    </div>
  );
}

/** Displays pending edits with accept/reject controls. */
export function PendingEditsBar() {
  const pendingFiles = usePendingFiles();
  const hasPendingFiles = pendingFiles.length > 0;
  const totalChanges = pendingFiles.reduce((sum, f) => sum + f.hunks.length, 0);

  const handleAcceptAll = async () => {
    await PendingEditsManager.getInstance().acceptAllHunks();
  };

  const handleRejectAll = async () => {
    await PendingEditsManager.getInstance().rejectAllHunks();
  };

  if (!hasPendingFiles) return null;

  return (
    <div className="tw-flex tw-flex-col tw-gap-1 tw-p-2 tw-border-b tw-border-border tw-bg-orange-500/5">
      <div className="tw-flex tw-items-center tw-gap-1 tw-text-xs">
        <span className="tw-flex-1 tw-font-medium tw-text-orange-600">
          {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''} with {totalChanges} pending change{totalChanges !== 1 ? 's' : ''}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="tw-size-6" onClick={handleAcceptAll}>
              <Check className="tw-size-3.5 tw-text-green-500" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Accept All Changes</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="tw-size-6" onClick={handleRejectAll}>
              <X className="tw-size-3.5 tw-text-red-500" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reject All Changes</TooltipContent>
        </Tooltip>
      </div>
      <div className="tw-flex tw-flex-col tw-gap-1">
        {pendingFiles.map(file => (
          <FileRow key={file.filePath} file={file} />
        ))}
      </div>
    </div>
  );
}
