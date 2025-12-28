import React from "react";

import { SelectedTextContext } from "@/types/message";
import { TFile } from "obsidian";

interface ChatControlsProps {
  contextNotes: TFile[];
  includeActiveNote: boolean;
  activeNote: TFile | null;
  contextUrls: string[];
  contextFolders: string[];
  selectedTextContexts?: SelectedTextContext[];
  showProgressCard: () => void;
  lexicalEditorRef?: React.RefObject<unknown>;
  onAddToContext: (category: string, data: unknown) => void;
  onRemoveFromContext: (category: string, data: unknown) => void;
}

/** Stub component for context controls (to be implemented). */
export const ContextControl: React.FC<ChatControlsProps> = () => {
  return null;
};
