import { ChatButtons } from "@/components/chat-components/ChatButtons";
import { SourcesModal } from "@/components/modals/SourcesModal";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextFolderBadge,
  ContextNoteBadge,
  ContextSelectedTextBadge,
  ContextTagBadge,
  ContextUrlBadge,
} from "@/components/chat-components/ContextBadges";
import { InlineMessageEditor } from "@/components/chat-components/InlineMessageEditor";
import { USER_SENDER } from "@/constants";
import { cn } from "@/lib/utils";
import { ChatMessage, MessageSegment, ToolCallSegment } from "@/types/message";
import { cleanMessageForCopy, insertIntoEditor } from "@/utils";
import { App, Component, MarkdownRenderer, TFile } from "obsidian";
import React, { useCallback, useEffect, useRef, useState } from "react";

const FOOTNOTE_SUFFIX_PATTERN = /^\d+-\d+$/;

/** Renders a tool call as a simple inline badge. */
function ToolCallBadge({ toolCall }: { toolCall: ToolCallSegment }) {
  const statusIcon = toolCall.isExecuting ? "⏳" : "✓";
  const statusClass = toolCall.isExecuting ? "tw-text-yellow-500" : "tw-text-green-500";

  return (
    <div className="tw-my-1 tw-flex tw-items-start tw-gap-2 tw-rounded tw-bg-[var(--background-secondary)] tw-px-2 tw-py-1 tw-text-xs">
      <span className={cn(statusClass, "tw-shrink-0")}>{statusIcon}</span>
      <span className="tw-font-medium tw-shrink-0 tw-whitespace-nowrap">{toolCall.name}</span>
      {toolCall.result && (
        <span className="tw-text-[var(--text-muted)] tw-break-all tw-line-clamp-3">
          {toolCall.result}
        </span>
      )}
    </div>
  );
}

/**
 * Normalizes rendered markdown footnotes to align with inline citation UX.
 * Removes separators/backrefs and fixes numbering artifacts (e.g., "2-1").
 */
export const normalizeFootnoteRendering = (root: HTMLElement): void => {
  const footnoteSection = root.querySelector(".footnotes");

  if (footnoteSection) {
    footnoteSection.querySelectorAll("hr, hr.footnotes-sep").forEach((el) => el.remove());
    footnoteSection
      .querySelectorAll("a.footnote-backref, a.footnote-link.footnote-backref")
      .forEach((el) => el.remove());
  } else {
    root
      .querySelectorAll("a.footnote-backref, a.footnote-link.footnote-backref")
      .forEach((el) => el.remove());
  }

  root
    .querySelectorAll(
      'a.footnote-ref, sup a[href^="#fn"], sup a[href^="#fn-"], a[href^="#fn"], a[href^="#fn-"]'
    )
    .forEach((anchor) => {
      const text = anchor.textContent?.trim() ?? "";
      if (!text || !FOOTNOTE_SUFFIX_PATTERN.test(text)) {
        return;
      }

      const [primary] = text.split("-");
      if (primary && primary !== text) {
        anchor.textContent = primary;
      }
    });
};

function MessageContext({ context }: { context: ChatMessage["context"] }) {
  if (
    !context ||
    (!context.notes?.length &&
      !context.urls?.length &&
      !context.tags?.length &&
      !context.folders?.length &&
      !context.selectedTextContexts?.length)
  ) {
    return null;
  }

  return (
    <div className="tw-flex tw-flex-wrap tw-gap-2">
      {context.notes.map((note, index) => (
        <Tooltip key={`note-${index}-${note.path}`}>
          <TooltipTrigger asChild>
            <div>
              <ContextNoteBadge note={note} />
            </div>
          </TooltipTrigger>
          <TooltipContent className="tw-max-w-sm tw-break-words">{note.path}</TooltipContent>
        </Tooltip>
      ))}
      {context.urls.map((url, index) => (
        <Tooltip key={`url-${index}-${url}`}>
          <TooltipTrigger asChild>
            <div>
              <ContextUrlBadge url={url} />
            </div>
          </TooltipTrigger>
          <TooltipContent className="tw-max-w-sm tw-break-words">{url}</TooltipContent>
        </Tooltip>
      ))}
      {context.tags?.map((tag, index) => (
        <Tooltip key={`tag-${index}-${tag}`}>
          <TooltipTrigger asChild>
            <div>
              <ContextTagBadge tag={tag} />
            </div>
          </TooltipTrigger>
          <TooltipContent className="tw-max-w-sm tw-break-words">{tag}</TooltipContent>
        </Tooltip>
      ))}
      {context.folders?.map((folder, index) => (
        <Tooltip key={`folder-${index}-${folder}`}>
          <TooltipTrigger asChild>
            <div>
              <ContextFolderBadge folder={folder} />
            </div>
          </TooltipTrigger>
          <TooltipContent className="tw-max-w-sm tw-break-words">{folder}</TooltipContent>
        </Tooltip>
      ))}
      {context.selectedTextContexts?.map((selectedText, index) => (
        <Tooltip key={`selectedText-${index}-${selectedText.id}`}>
          <TooltipTrigger asChild>
            <div>
              <ContextSelectedTextBadge selectedText={selectedText} />
            </div>
          </TooltipTrigger>
          <TooltipContent className="tw-max-w-sm tw-break-words">
            {selectedText.notePath}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

interface ChatSingleMessageProps {
  message: ChatMessage;
  app: App;
  isStreaming: boolean;
  onRegenerate?: () => void;
  onEdit?: (newMessage: string) => void;
  onDelete: () => void;
}

const ChatSingleMessage: React.FC<ChatSingleMessageProps> = ({
  message,
  app,
  isStreaming,
  onRegenerate,
  onEdit,
  onDelete,
}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const textSegmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const componentRef = useRef<Component | null>(null);

  const copyToClipboard = () => {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      return;
    }

    const cleanedContent = cleanMessageForCopy(message.message);
    navigator.clipboard.writeText(cleanedContent).then(() => {
      setIsCopied(true);

      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    });
  };

  /** Preprocesses text content for markdown rendering. */
  const preprocess = useCallback(
    (content: string): string => {
      const activeFile = app.workspace.getActiveFile();
      const sourcePath = activeFile ? activeFile.path : "";

      // Escape dataview/tasks code blocks
      let text = content
        .replace(/```dataview(\s*(?:\n|$))/g, "```text$1")
        .replace(/```dataviewjs(\s*(?:\n|$))/g, "```javascript$1")
        .replace(/```tasks(\s*(?:\n|$))/g, "```text$1");

      // Process LaTeX
      text = text
        .replace(/\\\[\s*/g, "$$")
        .replace(/\s*\\\]/g, "$$")
        .replace(/\\\(\s*/g, "$")
        .replace(/\s*\\\)/g, "$");

      // Process Obsidian internal images
      const parts = text.split(/(```[\s\S]*?```|`[^`]*`)/g);
      text = parts
        .map((part, index) => {
          if (index % 2 === 0) {
            return part.replace(/!\[\[(.*?)]]/g, (match, selection) => {
              const file = app.metadataCache.getFirstLinkpathDest(selection, sourcePath);
              return file ? `![](${app.vault.getResourcePath(file)})` : match;
            });
          }
          return part;
        })
        .join("");

      // Process [[links]]
      const linkParts = text.split(/(```[\s\S]*?```|`[^`]*`)/g);
      text = linkParts
        .map((part, index) => {
          if (index % 2 === 0) {
            return part.replace(/(?<!!)\[\[([^\]]+)]]/g, (match, selection) => {
              const file = app.metadataCache.getFirstLinkpathDest(selection, sourcePath);
              return file
                ? `<a href="obsidian://open?file=${encodeURIComponent(file.path)}">${file.basename}</a>`
                : match;
            });
          }
          return part;
        })
        .join("");

      return text;
    },
    [app]
  );

  /** Renders text segments with Obsidian's markdown renderer. */
  useEffect(() => {
    if (!componentRef.current) {
      componentRef.current = new Component();
    }

    // Only render text segments that have refs
    const segments = message.segments || [];
    segments.forEach((segment, index) => {
      if (segment.type === "text") {
        const ref = textSegmentRefs.current.get(index);
        if (ref) {
          ref.innerHTML = "";
          const processed = preprocess(segment.content);
          MarkdownRenderer.renderMarkdown(processed, ref, "", componentRef.current!);
          normalizeFootnoteRendering(ref);
        }
      }
    });

    return () => {
      if (componentRef.current) {
        componentRef.current.unload();
        componentRef.current = null;
      }
    };
  }, [message.segments, preprocess]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSaveEdit = (newText: string) => {
    setIsEditing(false);
    if (onEdit) {
      onEdit(newText);
    }
  };

  const handleShowSources = () => {
    if (message.sources && message.sources.length > 0) {
      new SourcesModal(app, message.sources).open();
    }
  };

  /** Inserts message content into the active editor. */
  const handleInsertIntoEditor = () => {
    const cleanedContent = cleanMessageForCopy(message.message);
    insertIntoEditor(app, cleanedContent);
  };

  const renderMessageContent = () => {
    // User messages - just render as plain text
    if (message.sender === USER_SENDER) {
      return (
        <div className="tw-whitespace-pre-wrap tw-break-words tw-text-[calc(var(--font-text-size)_-_2px)] tw-font-normal">
          {message.message}
        </div>
      );
    }

    // AI messages with segments - render each segment
    if (message.segments && message.segments.length > 0) {
      return (
        <div className={message.isErrorMessage ? "tw-text-error" : ""}>
          {message.segments.map((segment, index) => {
            if (segment.type === "text") {
              return (
                <div
                  key={`text-${index}`}
                  ref={(el) => {
                    if (el) textSegmentRefs.current.set(index, el);
                  }}
                  className="message-segment"
                />
              );
            } else if (segment.type === "toolCall") {
              return <ToolCallBadge key={`tool-${segment.id}`} toolCall={segment} />;
            }
            return null;
          })}
        </div>
      );
    }

    // Fallback for AI messages without segments (legacy)
    return (
      <div className={message.isErrorMessage ? "tw-text-error" : ""}>
        {message.message}
      </div>
    );
  };

  // If editing a user message, replace the entire message container with the inline editor
  if (isEditing && message.sender === USER_SENDER) {
    return (
      <div className="tw-my-1 tw-flex tw-w-full tw-flex-col">
        <InlineMessageEditor
          initialValue={message.message}
          initialContext={message.context}
          onSave={handleSaveEdit}
          onCancel={handleCancelEdit}
          app={app}
        />
      </div>
    );
  }

  return (
    <div className="tw-my-1 tw-flex tw-w-full tw-flex-col">
      <div
        className={cn(
          "tw-group tw-mx-2 tw-rounded-md tw-p-2",
          message.sender === USER_SENDER && "tw-border tw-border-solid tw-border-border"
        )}
        style={
          message.sender === USER_SENDER
            ? { backgroundColor: "var(--background-modifier-hover)" }
            : undefined
        }
      >
        <div className="tw-flex tw-max-w-full tw-flex-col tw-gap-2 tw-overflow-hidden">
          {!isEditing && <MessageContext context={message.context} />}
          <div className="message-content">{renderMessageContent()}</div>


          {!isStreaming && (
            <div className="tw-flex tw-items-center tw-justify-between">
              <div className="tw-text-xs tw-text-faint">{message.timestamp?.display}</div>
              <ChatButtons
                message={message}
                onCopy={copyToClipboard}
                isCopied={isCopied}
                onInsertIntoEditor={handleInsertIntoEditor}
                onRegenerate={onRegenerate}
                onEdit={handleEdit}
                onDelete={onDelete}
                onShowSources={handleShowSources}
                hasSources={message.sources && message.sources.length > 0 ? true : false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatSingleMessage;
