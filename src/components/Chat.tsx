/** Chat component with Claude CLI streaming integration */
import ChatInput from "@/components/chat-components/ChatInput";
import ChatMessages from "@/components/chat-components/ChatMessages";
import { runClaudeChat, stopClaudeChat } from "@/claude";
import { AI_SENDER, USER_SENDER } from "@/constants";
import { AppContext } from "@/context";
import { ChatInputProvider, useChatInput } from "@/context/ChatInputContext";
import { ChatMessage } from "@/types/message";
import { formatDateTime } from "@/utils";
import { TFile, App } from "obsidian";
import React, { useCallback, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

interface ChatProps {
  app: App;
  claudePath: string;
}

/** Internal component that has access to the ChatInput context */
const ChatInternal: React.FC<ChatProps & { chatInput: ReturnType<typeof useChatInput> }> = ({
  app,
  claudePath,
  chatInput,
}) => {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [currentAiMessage, setCurrentAiMessage] = useState("");
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextNotes, setContextNotes] = useState<TFile[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const isMountedRef = useRef(true);

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

      let finalContent = "";

      try {
        await runClaudeChat(messageWithContext, {
          claudePath,
          workingDir: vaultPath,
          sessionId,
        }, {
          onContentUpdate: (content) => {
            if (!isMountedRef.current) return;
            finalContent = content;
            setCurrentAiMessage(content);
          },
          onComplete: () => {
            if (!isMountedRef.current) return;
            const aiMessage: ChatMessage = {
              id: uuidv4(),
              message: finalContent,
              sender: AI_SENDER,
              timestamp: formatDateTime(new Date()),
              isVisible: true,
            };
            addMessage(aiMessage);
            setCurrentAiMessage("");
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
    [inputMessage, addMessage, app, claudePath, contextNotes, sessionId]
  );

  const handleStopGenerating = useCallback(() => {
    stopClaudeChat();
    setLoading(false);
    if (currentAiMessage) {
      const aiMessage: ChatMessage = {
        id: uuidv4(),
        message: currentAiMessage,
        sender: AI_SENDER,
        timestamp: formatDateTime(new Date()),
        isVisible: true,
      };
      addMessage(aiMessage);
      setCurrentAiMessage("");
    }
  }, [currentAiMessage, addMessage]);

  return (
    <div className="tw-flex tw-size-full tw-flex-col tw-overflow-hidden">
      <div className="tw-flex tw-size-full tw-flex-col tw-overflow-hidden">
        <ChatMessages
          chatHistory={chatHistory}
          currentAiMessage={currentAiMessage}
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
