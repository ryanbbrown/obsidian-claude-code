/** Stub aiParams - LangChain types removed, only exports needed by UI */
import { ChainType } from "@/chainFactory";
import { ModelCapability } from "@/constants";
import { settingsAtom, settingsStore } from "@/settings/model";
import { SelectedTextContext } from "@/types/message";
import { atom, useAtom } from "jotai";

const userModelKeyAtom = atom<string | null>(null);
const modelKeyAtom = atom(
  (get) => {
    const userValue = get(userModelKeyAtom);
    if (userValue !== null) {
      return userValue;
    }
    return get(settingsAtom).defaultModelKey;
  },
  (get, set, newValue) => {
    set(userModelKeyAtom, newValue);
  }
);

const userChainTypeAtom = atom<ChainType | null>(null);
const chainTypeAtom = atom(
  (get) => {
    const userValue = get(userChainTypeAtom);
    if (userValue !== null) {
      return userValue;
    }
    return get(settingsAtom).defaultChainType;
  },
  (get, set, newValue) => {
    set(userChainTypeAtom, newValue);
  }
);

const currentProjectAtom = atom<ProjectConfig | null>(null);
const projectLoadingAtom = atom<boolean>(false);

export interface FailedItem {
  path: string;
  type: "md" | "web" | "youtube" | "nonMd";
  error?: string;
  timestamp?: number;
}

interface ProjectContextLoadState {
  success: Array<string>;
  failed: Array<FailedItem>;
  processingFiles: Array<string>;
  total: Array<string>;
}

export const projectContextLoadAtom = atom<ProjectContextLoadState>({
  success: [],
  failed: [],
  processingFiles: [],
  total: [],
});

const selectedTextContextsAtom = atom<SelectedTextContext[]>([]);

export interface ProjectConfig {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  projectModelKey: string;
  modelConfigs: {
    temperature?: number;
    maxTokens?: number;
  };
  contextSource: {
    inclusions?: string;
    exclusions?: string;
    webUrls?: string;
    youtubeUrls?: string;
  };
  created: number;
  UsageTimestamps: number;
}

export interface ModelConfig {
  modelName: string;
  temperature?: number;
  streaming: boolean;
  maxRetries: number;
  maxConcurrency: number;
  maxTokens?: number;
}

export interface SetChainOptions {
  prompt?: unknown;
  chatModel?: unknown;
  noteFile?: unknown;
  abortController?: AbortController;
  refreshIndex?: boolean;
}

export interface CustomModel {
  name: string;
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  enabled: boolean;
  isEmbeddingModel?: boolean;
  isBuiltIn?: boolean;
  enableCors?: boolean;
  capabilities?: ModelCapability[];
  displayName?: string;
}

export function setModelKey(modelKey: string) {
  settingsStore.set(modelKeyAtom, modelKey);
}

export function getModelKey(): string {
  return settingsStore.get(modelKeyAtom);
}

export function subscribeToModelKeyChange(callback: () => void): () => void {
  return settingsStore.sub(modelKeyAtom, callback);
}

export function useModelKey() {
  return useAtom(modelKeyAtom, { store: settingsStore });
}

export function getChainType(): ChainType {
  return settingsStore.get(chainTypeAtom);
}

export function setChainType(chainType: ChainType) {
  settingsStore.set(chainTypeAtom, chainType);
}

export function subscribeToChainTypeChange(callback: () => void): () => void {
  return settingsStore.sub(chainTypeAtom, callback);
}

export function useChainType() {
  return useAtom(chainTypeAtom, { store: settingsStore });
}

export function setCurrentProject(project: ProjectConfig | null) {
  settingsStore.set(currentProjectAtom, project);
}

export function getCurrentProject(): ProjectConfig | null {
  return settingsStore.get(currentProjectAtom);
}

export function subscribeToProjectChange(
  callback: (project: ProjectConfig | null) => void
): () => void {
  return settingsStore.sub(currentProjectAtom, () => {
    callback(settingsStore.get(currentProjectAtom));
  });
}

export function useCurrentProject() {
  return useAtom(currentProjectAtom, { store: settingsStore });
}

export function setProjectLoading(loading: boolean) {
  settingsStore.set(projectLoadingAtom, loading);
}

export function isProjectLoading(): boolean {
  return settingsStore.get(projectLoadingAtom);
}

export function useProjectLoading() {
  return useAtom(projectLoadingAtom, { store: settingsStore });
}

export function isProjectMode() {
  return getChainType() === ChainType.PROJECT_CHAIN;
}

export function setSelectedTextContexts(contexts: SelectedTextContext[]) {
  settingsStore.set(selectedTextContextsAtom, contexts);
}

export function getSelectedTextContexts(): SelectedTextContext[] {
  return settingsStore.get(selectedTextContextsAtom);
}

export function addSelectedTextContext(context: SelectedTextContext) {
  const current = getSelectedTextContexts();
  setSelectedTextContexts([...current, context]);
}

export function removeSelectedTextContext(id: string) {
  const current = getSelectedTextContexts();
  setSelectedTextContexts(current.filter((context) => context.id !== id));
}

export function clearSelectedTextContexts() {
  setSelectedTextContexts([]);
}

export function useSelectedTextContexts() {
  return useAtom(selectedTextContextsAtom, { store: settingsStore });
}

export function getProjectContextLoadState(): Readonly<ProjectContextLoadState> {
  return settingsStore.get(projectContextLoadAtom);
}

export function setProjectContextLoadState(state: ProjectContextLoadState) {
  settingsStore.set(projectContextLoadAtom, state);
}

export function useProjectContextLoad() {
  return useAtom(projectContextLoadAtom, { store: settingsStore });
}
