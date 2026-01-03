/** Jotai atom for reactive pending edits state. */
import { atom, useAtomValue } from 'jotai';
import { settingsStore } from '@/settings/model';
import { PendingEdit, PendingFile } from './types';

/** Atom containing the list of pending edits (legacy, per tool call). */
export const pendingEditsAtom = atom<PendingEdit[]>([]);

/** Atom containing pending files with hunks. */
export const pendingFilesAtom = atom<PendingFile[]>([]);

/** Sets the pending edits in the atom. */
export function setPendingEdits(edits: PendingEdit[]): void {
  settingsStore.set(pendingEditsAtom, edits);
}

/** Gets the pending edits from the atom (non-reactive). */
export function getPendingEdits(): PendingEdit[] {
  return settingsStore.get(pendingEditsAtom);
}

/** Hook to get pending edits reactively. */
export function usePendingEdits(): PendingEdit[] {
  return useAtomValue(pendingEditsAtom, { store: settingsStore });
}

/** Sets the pending files in the atom. */
export function setPendingFiles(files: PendingFile[]): void {
  settingsStore.set(pendingFilesAtom, files);
}

/** Gets the pending files from the atom (non-reactive). */
export function getPendingFiles(): PendingFile[] {
  return settingsStore.get(pendingFilesAtom);
}

/** Hook to get pending files reactively. */
export function usePendingFiles(): PendingFile[] {
  return useAtomValue(pendingFilesAtom, { store: settingsStore });
}

/** Subscribes to pending edits changes. */
export function subscribeToPendingEditsChange(callback: (edits: PendingEdit[]) => void): () => void {
  return settingsStore.sub(pendingEditsAtom, () => {
    callback(settingsStore.get(pendingEditsAtom));
  });
}

/** Subscribes to pending files changes. */
export function subscribeToPendingFilesChange(callback: (files: PendingFile[]) => void): () => void {
  return settingsStore.sub(pendingFilesAtom, () => {
    callback(settingsStore.get(pendingFilesAtom));
  });
}
