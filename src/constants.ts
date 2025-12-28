/** Core constants for the plugin. */
import { v4 as uuidv4 } from "uuid";
import { ChainType } from "./chainFactory";
import { type CopilotSettings } from "@/settings/model";

export const CHAT_VIEWTYPE = "copilot-chat-view";
export const USER_SENDER = "user";
export const AI_SENDER = "ai";

export const COPILOT_FOLDER_ROOT = "copilot";
export const DEFAULT_CHAT_HISTORY_FOLDER = `${COPILOT_FOLDER_ROOT}/copilot-conversations`;

export enum VAULT_VECTOR_STORE_STRATEGY {
  NEVER = "NEVER",
  ON_STARTUP = "ON STARTUP",
  ON_MODE_SWITCH = "ON MODE SWITCH",
}

export enum DEFAULT_OPEN_AREA {
  EDITOR = "editor",
  VIEW = "view",
}

export enum SEND_SHORTCUT {
  ENTER = "enter",
  SHIFT_ENTER = "shift+enter",
}

export const DEFAULT_SETTINGS: CopilotSettings = {
  userId: uuidv4(),
  defaultChainType: ChainType.LLM_CHAIN,
  temperature: 0.1,
  maxTokens: 6000,
  contextTurns: 15,
  userSystemPrompt: "",
  stream: true,
  defaultSaveFolder: DEFAULT_CHAT_HISTORY_FOLDER,
  defaultConversationTag: "copilot-conversation",
  autosaveChat: true,
  includeActiveNoteAsContext: true,
  defaultOpenArea: DEFAULT_OPEN_AREA.VIEW,
  defaultSendShortcut: SEND_SHORTCUT.ENTER,
  indexVaultToVectorStore: VAULT_VECTOR_STORE_STRATEGY.ON_MODE_SWITCH,
  qaExclusions: COPILOT_FOLDER_ROOT,
  qaInclusions: "",
  chatNoteContextPath: "",
  chatNoteContextTags: [],
  debug: false,
  maxSourceChunks: 15,
  enableInlineCitations: true,
  disableIndexOnMobile: true,
  numPartitions: 1,
  defaultConversationNoteName: "{$topic}@{$date}_{$time}",
  projectList: [],
  passMarkdownImages: true,
  enableRecentConversations: true,
  maxRecentConversations: 30,
  enableAutonomousAgent: true,
};

export const EVENT_NAMES = {
  CHAT_IS_VISIBLE: "chat-is-visible",
  ACTIVE_LEAF_CHANGE: "active-leaf-change",
  ABORT_STREAM: "abort-stream",
};
