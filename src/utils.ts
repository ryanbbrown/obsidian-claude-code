/** Utility functions. */
import { ChainType } from "@/chainFactory";
import { MarkdownView, TFile, App } from "obsidian";

export const err2String = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  return String(err);
};

export function isPlusChain(chainType: ChainType): boolean {
  return chainType === ChainType.COPILOT_PLUS_CHAIN;
}

export function isAllowedFileForNoteContext(file: TFile | null): boolean {
  if (!file) return false;
  const ext = file.extension.toLowerCase();
  return ["md", "pdf", "canvas"].includes(ext);
}

export function getTagsFromNote(_file: TFile, _frontmatterOnly = true): string[] {
  return [];
}

export function cleanMessageForCopy(message: string): string {
  return message.trim();
}

export function insertIntoEditor(app: App, text: string): void {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (view) {
    view.editor.replaceSelection(text);
  }
}

export function openFileInWorkspace(app: App, filePath: string): void {
  const file = app.vault.getAbstractFileByPath(filePath);
  if (file instanceof TFile) {
    app.workspace.getLeaf().openFile(file);
  }
}

/** Makes an absolute path relative to a base directory */
export function makeRelativePath(absolutePath: string, baseDir: string): string {
  return absolutePath.startsWith(baseDir)
    ? absolutePath.slice(baseDir.length).replace(/^\//, '')
    : absolutePath;
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
