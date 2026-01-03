/** Pending edits module exports. */
export { PendingEditsManager } from './PendingEditsManager';
export {
  pendingEditsAtom,
  usePendingEdits,
  getPendingEdits,
  setPendingEdits,
  subscribeToPendingEditsChange,
  pendingFilesAtom,
  usePendingFiles,
  getPendingFiles,
  setPendingFiles,
  subscribeToPendingFilesChange,
} from './pendingEditsAtom';
export { computeLineDiff, computeHunks, applyHunkDecisions } from './diff';
export type { PendingEdit, PendingEditCapture, DiffLine, Hunk, PendingFile } from './types';
