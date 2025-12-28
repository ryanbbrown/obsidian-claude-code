/** Simplified ChatControls */
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MessageCirclePlus } from "lucide-react";
import React from "react";

interface ChatControlsProps {
  onNewChat?: () => void;
}

export const ChatControls: React.FC<ChatControlsProps> = ({ onNewChat }) => {
  return (
    <div className="tw-flex tw-items-center tw-gap-2">
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
  );
};

export default ChatControls;
