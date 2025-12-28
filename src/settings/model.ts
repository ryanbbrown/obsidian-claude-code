/** Settings management for the plugin. */
import { ProjectConfig } from "@/aiParams";
import { atom, createStore, useAtomValue } from "jotai";
import { v4 as uuidv4 } from "uuid";
import { type ChainType } from "@/chainFactory";
import {
  COPILOT_FOLDER_ROOT,
  DEFAULT_OPEN_AREA,
  DEFAULT_SETTINGS,
  SEND_SHORTCUT,
} from "@/constants";

export interface CopilotSettings {
  userId: string;
  defaultChainType: ChainType;
  temperature: number;
  maxTokens: number;
  contextTurns: number;
  userSystemPrompt: string;
  stream: boolean;
  defaultSaveFolder: string;
  defaultConversationTag: string;
  autosaveChat: boolean;
  includeActiveNoteAsContext: boolean;
  defaultOpenArea: DEFAULT_OPEN_AREA;
  defaultSendShortcut: SEND_SHORTCUT;
  indexVaultToVectorStore: string;
  qaExclusions: string;
  qaInclusions: string;
  chatNoteContextPath: string;
  chatNoteContextTags: string[];
  debug: boolean;
  maxSourceChunks: number;
  enableInlineCitations: boolean;
  disableIndexOnMobile: boolean;
  numPartitions: number;
  defaultConversationNoteName: string;
  projectList: Array<ProjectConfig>;
  passMarkdownImages: boolean;
  enableRecentConversations: boolean;
  maxRecentConversations: number;
  enableAutonomousAgent: boolean;
}

export const settingsStore = createStore();
export const settingsAtom = atom<CopilotSettings>(DEFAULT_SETTINGS);

/** Sets the settings in the atom. */
export function setSettings(settings: Partial<CopilotSettings>) {
  settingsStore.set(settingsAtom, { ...getSettings(), ...settings });
}

/** Normalize QA exclusion patterns and guarantee the Copilot folder root is excluded. */
export function sanitizeQaExclusions(rawValue: unknown): string {
  const rawValueString = typeof rawValue === "string" ? rawValue : COPILOT_FOLDER_ROOT;

  const decodedPatterns: string[] = rawValueString
    .split(",")
    .map((pattern: string) => decodeURIComponent(pattern.trim()))
    .filter((pattern: string) => pattern.length > 0);

  const canonicalToOriginalPattern = new Map<string, string>();

  decodedPatterns.forEach((pattern) => {
    const canonical = pattern.replace(/\/+$/, "");
    const canonicalKey = canonical.length > 0 ? canonical : pattern;
    if (canonicalKey === COPILOT_FOLDER_ROOT) {
      canonicalToOriginalPattern.set(COPILOT_FOLDER_ROOT, COPILOT_FOLDER_ROOT);
      return;
    }
    if (!canonicalToOriginalPattern.has(canonicalKey)) {
      const normalizedValue =
        canonical.length > 0 && pattern.endsWith("/") ? `${canonical}/` : pattern;
      canonicalToOriginalPattern.set(canonicalKey, normalizedValue);
    }
  });

  canonicalToOriginalPattern.set(COPILOT_FOLDER_ROOT, COPILOT_FOLDER_ROOT);

  return Array.from(canonicalToOriginalPattern.values())
    .map((pattern) => encodeURIComponent(pattern))
    .join(",");
}

/** Sets a single setting in the atom. */
export function updateSetting<K extends keyof CopilotSettings>(key: K, value: CopilotSettings[K]) {
  setSettings({ [key]: value });
}

/** Gets the settings from the atom. */
export function getSettings(): Readonly<CopilotSettings> {
  return settingsStore.get(settingsAtom);
}

/** Resets the settings to the default values. */
export function resetSettings(): void {
  setSettings(DEFAULT_SETTINGS);
}

/** Subscribes to changes in the settings atom. */
export function subscribeToSettingsChange(
  callback: (prev: CopilotSettings, next: CopilotSettings) => void
): () => void {
  let previousValue = getSettings();

  return settingsStore.sub(settingsAtom, () => {
    const currentValue = getSettings();
    callback(previousValue, currentValue);
    previousValue = currentValue;
  });
}

/** Hook to get the settings value from the atom. */
export function useSettingsValue(): Readonly<CopilotSettings> {
  return useAtomValue(settingsAtom, { store: settingsStore });
}

/** Sanitizes the settings to ensure they are valid. */
export function sanitizeSettings(settings: CopilotSettings): CopilotSettings {
  const settingsToSanitize = settings || DEFAULT_SETTINGS;

  if (!settingsToSanitize.userId) {
    settingsToSanitize.userId = uuidv4();
  }

  const sanitizedSettings: CopilotSettings = { ...settingsToSanitize };

  const temperature = Number(settingsToSanitize.temperature);
  sanitizedSettings.temperature = isNaN(temperature) ? DEFAULT_SETTINGS.temperature : temperature;

  const maxTokens = Number(settingsToSanitize.maxTokens);
  sanitizedSettings.maxTokens = isNaN(maxTokens) ? DEFAULT_SETTINGS.maxTokens : maxTokens;

  const contextTurns = Number(settingsToSanitize.contextTurns);
  sanitizedSettings.contextTurns = isNaN(contextTurns)
    ? DEFAULT_SETTINGS.contextTurns
    : contextTurns;

  if (typeof sanitizedSettings.includeActiveNoteAsContext !== "boolean") {
    sanitizedSettings.includeActiveNoteAsContext = DEFAULT_SETTINGS.includeActiveNoteAsContext;
  }

  if (typeof sanitizedSettings.passMarkdownImages !== "boolean") {
    sanitizedSettings.passMarkdownImages = DEFAULT_SETTINGS.passMarkdownImages;
  }

  if (typeof sanitizedSettings.enableInlineCitations !== "boolean") {
    sanitizedSettings.enableInlineCitations = DEFAULT_SETTINGS.enableInlineCitations;
  }

  if (typeof sanitizedSettings.autosaveChat !== "boolean") {
    sanitizedSettings.autosaveChat = DEFAULT_SETTINGS.autosaveChat;
  }

  const maxRecentConversations = Number(settingsToSanitize.maxRecentConversations);
  if (isNaN(maxRecentConversations) || maxRecentConversations < 10 || maxRecentConversations > 50) {
    sanitizedSettings.maxRecentConversations = DEFAULT_SETTINGS.maxRecentConversations;
  } else {
    sanitizedSettings.maxRecentConversations = maxRecentConversations;
  }

  if (!Object.values(SEND_SHORTCUT).includes(sanitizedSettings.defaultSendShortcut)) {
    sanitizedSettings.defaultSendShortcut = DEFAULT_SETTINGS.defaultSendShortcut;
  }

  const saveFolder = (settingsToSanitize.defaultSaveFolder || "").trim();
  sanitizedSettings.defaultSaveFolder =
    saveFolder.length > 0 ? saveFolder : DEFAULT_SETTINGS.defaultSaveFolder;

  sanitizedSettings.qaExclusions = sanitizeQaExclusions(settingsToSanitize.qaExclusions);

  return sanitizedSettings;
}

/** Returns the user's custom system prompt addition, if any. */
export function getSystemPrompt(): string {
  return getSettings().userSystemPrompt || "";
}
