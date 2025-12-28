/** Simplified utils - LangChain removed */
import { ChainType } from "@/chainFactory";
import {
  ChatModelProviders,
  EmbeddingModelProviders,
  Provider,
  ProviderInfo,
  ProviderSettingsKeyMap,
  SettingKeyProviders,
} from "@/constants";
import { CopilotSettings } from "@/settings/model";
import { CustomModel } from "./aiParams";
import { MarkdownView, Notice, TFile, Vault, App } from "obsidian";

export const err2String = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  return String(err);
};

export const getModelNameFromKey = (modelKey: string): string => {
  return modelKey.split("|")[0];
};

export const getProviderFromModelKey = (modelKey: string): string => {
  return modelKey.split("|")[1] || "";
};

export function getProviderLabel(provider: Provider): string {
  return ProviderInfo[provider]?.label || provider;
}

export function isPlusChain(chainType: ChainType): boolean {
  return chainType === ChainType.COPILOT_PLUS_CHAIN;
}

export function isAllowedFileForNoteContext(file: TFile | null): boolean {
  if (!file) return false;
  const ext = file.extension.toLowerCase();
  return ["md", "pdf", "canvas"].includes(ext);
}

export function getTagsFromNote(file: TFile, frontmatterOnly = true): string[] {
  // Simplified - just return empty array
  return [];
}

export function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = current.split(".").map(Number);
  const latestParts = latest.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((latestParts[i] || 0) > (currentParts[i] || 0)) return true;
    if ((latestParts[i] || 0) < (currentParts[i] || 0)) return false;
  }
  return false;
}

export function cleanMessageForCopy(message: string): string {
  return message.trim();
}

export function findCustomModel(
  modelKey: string,
  activeModels: CustomModel[]
): CustomModel | undefined {
  const modelName = getModelNameFromKey(modelKey);
  return activeModels.find((m) => m.name === modelName);
}

export function insertIntoEditor(app: App, text: string): void {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (view) {
    const editor = view.editor;
    editor.replaceSelection(text);
  }
}

export function openFileInWorkspace(app: App, filePath: string): void {
  const file = app.vault.getAbstractFileByPath(filePath);
  if (file instanceof TFile) {
    app.workspace.getLeaf().openFile(file);
  }
}

export function checkModelApiKey(
  settings: CopilotSettings,
  provider: string
): { hasKey: boolean; keyName: string } {
  const providerKey = provider as SettingKeyProviders;
  const settingsKey = ProviderSettingsKeyMap[providerKey];
  if (!settingsKey) return { hasKey: true, keyName: "" };
  const hasKey = Boolean(settings[settingsKey]);
  return { hasKey, keyName: settingsKey };
}

export interface FormattedDateTime {
  fileName: string;
  display: string;
  epoch: number;
}

export const formatDateTime = (
  now: Date,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): FormattedDateTime => {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: timezone,
  };
  const formatter = new Intl.DateTimeFormat("en-CA", options);
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");

  return {
    fileName: `${year}${month}${day}-${hour}${minute}${second}`,
    display: `${year}-${month}-${day} ${hour}:${minute}:${second}`,
    epoch: now.getTime(),
  };
};
