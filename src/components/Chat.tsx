/** Chat component with Claude CLI streaming integration */
import ChatControls from "@/components/chat-components/ChatControls";
import ChatInput from "@/components/chat-components/ChatInput";
import ChatMessages from "@/components/chat-components/ChatMessages";
import { runClaudeChat, stopClaudeChat } from "@/claude";
import { AI_SENDER, USER_SENDER } from "@/constants";
import { ChatInputProvider, useChatInput } from "@/context/ChatInputContext";
import { ChatMessage, MessageSegment } from "@/types/message";
import { formatDateTime } from "@/utils";
import { getClaudeProjectPath, loadConversationMessages } from "@/utils/claudeConversations";
import { TFile, App } from "obsidian";
import React, { useCallback, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

/** Converts segments to a plain text string for storage. */
function segmentsToString(segments: MessageSegment[]): string {
  return segments
    .map((seg) => {
      if (seg.type === "text") return seg.content;
      return `[${seg.name}: ${seg.result || "executing..."}]`;
    })
    .join("");
}

interface ChatProps {
  app: App;
  claudePath: string;
  envVars: Record<string, string>;
}

/** Internal component that has access to the ChatInput context */
const ChatInternal: React.FC<ChatProps & { chatInput: ReturnType<typeof useChatInput> }> = ({
  app,
  claudePath,
  envVars,
  chatInput,
}) => {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [currentSegments, setCurrentSegments] = useState<MessageSegment[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextNotes, setContextNotes] = useState<TFile[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const isMountedRef = useRef(true);
  const finalSegmentsRef = useRef<MessageSegment[]>([]);

  const addMessage = useCallback((message: ChatMessage) => {
    setChatHistory((prev) => [...prev, message]);
  }, []);

  const handleSendMessage = useCallback(
    async ({ contextNotes: passedContextNotes }: { contextNotes?: TFile[] } = {}) => {
      if (!inputMessage.trim()) return;

      // Build message with @filepath prefixes for context files
      const filesToInclude = passedContextNotes ?? contextNotes;
      const vaultPath = (app.vault.adapter as any).basePath;
      const fileRefs = filesToInclude.map(f => `@${vaultPath}/${f.path}`).join(' ');
      const messageWithContext = fileRefs ? `${fileRefs} ${inputMessage}` : inputMessage;

      const userMessage: ChatMessage = {
        id: uuidv4(),
        message: inputMessage, // Show original message to user (without full paths)
        sender: USER_SENDER,
        timestamp: formatDateTime(new Date()),
        isVisible: true,
      };
      addMessage(userMessage);

      setInputMessage("");
      setContextNotes([]); // Clear context after sending
      setLoading(true);
      finalSegmentsRef.current = [];

      try {
        await runClaudeChat(messageWithContext, {
          claudePath,
          workingDir: vaultPath,
          sessionId,
          envVars,
        }, {
          onSegmentsUpdate: (segments) => {
            if (!isMountedRef.current) return;
            finalSegmentsRef.current = segments;
            setCurrentSegments(segments);
          },
          onComplete: () => {
            if (!isMountedRef.current) return;
            const aiMessage: ChatMessage = {
              id: uuidv4(),
              message: segmentsToString(finalSegmentsRef.current),
              sender: AI_SENDER,
              timestamp: formatDateTime(new Date()),
              isVisible: true,
              segments: finalSegmentsRef.current,
            };
            addMessage(aiMessage);
            setCurrentSegments([]);
            setLoading(false);
          },
          onError: (error) => {
            if (!isMountedRef.current) return;
            console.error('[Claude error]', error);
            setLoading(false);
          },
          onSessionId: (id) => {
            if (!isMountedRef.current) return;
            setSessionId(id);
          },
        });
      } catch (error) {
        console.error('[Claude error]', error);
        setLoading(false);
      }
    },
    [inputMessage, addMessage, app, claudePath, envVars, contextNotes, sessionId]
  );

  const handleStopGenerating = useCallback(() => {
    stopClaudeChat();
    setLoading(false);
    if (currentSegments.length > 0) {
      const aiMessage: ChatMessage = {
        id: uuidv4(),
        message: segmentsToString(currentSegments),
        sender: AI_SENDER,
        timestamp: formatDateTime(new Date()),
        isVisible: true,
        segments: currentSegments,
      };
      addMessage(aiMessage);
      setCurrentSegments([]);
    }
  }, [currentSegments, addMessage]);

  /** Resets chat state to start a fresh conversation. */
  const handleNewChat = useCallback(() => {
    stopClaudeChat();
    setChatHistory([]);
    setSessionId(undefined);
    setCurrentSegments([]);
    setContextNotes([]);
    setLoading(false);
  }, []);

  /** Loads a past conversation by sessionId. */
  const handleLoadConversation = useCallback(async (targetSessionId: string) => {
    stopClaudeChat();
    setLoading(true);
    setCurrentSegments([]);
    setContextNotes([]);

    try {
      const vaultPath = (app.vault.adapter as any).basePath;
      const projectPath = getClaudeProjectPath(vaultPath);
      const messages = await loadConversationMessages(projectPath, targetSessionId);
      setChatHistory(messages);
      setSessionId(targetSessionId);
    } catch (err) {
      console.error('Failed to load conversation:', err);
      setChatHistory([]);
    } finally {
      setLoading(false);
    }
  }, [app]);

  const vaultPath = (app.vault.adapter as any).basePath;

  return (
    <div className="tw-flex tw-size-full tw-flex-col tw-overflow-hidden">
      <div className="tw-flex tw-items-center tw-justify-end tw-px-2 tw-py-1 tw-border-b tw-border-border">
        <ChatControls
          onNewChat={handleNewChat}
          vaultPath={vaultPath}
          onLoadConversation={handleLoadConversation}
        />
      </div>
      <div className="tw-flex tw-size-full tw-flex-col tw-overflow-hidden">
        <ChatMessages
          chatHistory={chatHistory}
          currentSegments={currentSegments}
          loading={loading}
          loadingMessage="Thinking..."
          app={app}
          onRegenerate={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          onReplaceChat={setInputMessage}
          showHelperComponents={true}
        />
        <ChatInput
          inputMessage={inputMessage}
          setInputMessage={setInputMessage}
          handleSendMessage={handleSendMessage}
          isGenerating={loading}
          onStopGenerating={handleStopGenerating}
          app={app}
          contextNotes={contextNotes}
          setContextNotes={setContextNotes}
          includeActiveNote={false}
          setIncludeActiveNote={() => {}}
          selectedImages={[]}
          onAddImage={() => {}}
          setSelectedImages={() => {}}
          disableModelSwitch={true}
          selectedTextContexts={[]}
          onRemoveSelectedText={() => {}}
          showProgressCard={() => {}}
        />
      </div>
    </div>
  );
};

/** Main Chat component with context provider */
const Chat: React.FC<ChatProps> = (props) => {
  return (
    <ChatInputProvider>
      <ChatWithContext {...props} />
    </ChatInputProvider>
  );
};

/** Chat component that uses context */
const ChatWithContext: React.FC<ChatProps> = (props) => {
  const chatInput = useChatInput();
  return <ChatInternal {...props} chatInput={chatInput} />;
};

export default Chat;
