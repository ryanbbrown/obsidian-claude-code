/** Types for pending edit state tracking. */

/** A line in a computed diff. */
export interface DiffLine {
  type: 'context' | 'added' | 'removed';
  content: string;
  oldLine?: number;
  newLine?: number;
}

/** A hunk is a contiguous group of changes. */
export interface Hunk {
  id: string;
  startLineOld: number;          // Starting line in original file
  startLineNew: number;          // Starting line in new file
  lines: DiffLine[];             // Lines in this hunk (may include context)
  preview: string;               // First ~30 chars of changes for UI
  status: 'pending' | 'accepted' | 'rejected';
}

/** Pending file state with hunks for accept/reject. */
export interface PendingFile {
  filePath: string;              // Absolute path
  vaultPath: string;             // Relative to vault
  originalContent: string;       // Content before any edits
  currentContent: string;        // Current content on disk
  hunks: Hunk[];                 // Computed hunks
  timestamp: number;
}

/** A pending edit awaiting user accept/reject decision. */
export interface PendingEdit {
  id: string;                    // tool_use_id from Claude
  filePath: string;              // Absolute path
  vaultPath: string;             // Relative to vault
  beforeContent: string;         // Original content before edit
  afterContent: string;          // Content after edit was applied
  timestamp: number;
  diffLines: DiffLine[];
  toolName: string;              // 'Edit', 'Write', or 'MultiEdit'
}

/** State for an edit being captured (before tool result arrives). */
export interface PendingEditCapture {
  id: string;
  filePath: string;
  beforeContent: string;
  timestamp: number;
  toolName: string;
}
