/** Singleton manager for pending edit state and operations. */
import { promises as fs } from 'fs';
import { PendingEdit, PendingEditCapture, PendingFile, Hunk } from './types';
import { computeLineDiff, computeHunks, applyHunkDecisions } from './diff';
import { setPendingEdits, getPendingEdits, setPendingFiles, getPendingFiles } from './pendingEditsAtom';

export class PendingEditsManager {
  private static instance: PendingEditsManager | null = null;
  private captures: Map<string, PendingEditCapture> = new Map();
  private originalFileStates: Map<string, string> = new Map(); // Track original state per file
  private vaultPath: string = '';

  private constructor() {}

  /** Gets the singleton instance. */
  public static getInstance(): PendingEditsManager {
    if (!PendingEditsManager.instance) {
      PendingEditsManager.instance = new PendingEditsManager();
    }
    return PendingEditsManager.instance;
  }

  /** Initializes the manager with the vault path. */
  public initialize(vaultPath: string): void {
    this.vaultPath = vaultPath;
  }

  /** Captures file content before an edit is applied. */
  public async captureBeforeState(toolUseId: string, filePath: string, toolName: string): Promise<void> {
    try {
      let beforeContent = '';
      try {
        beforeContent = await fs.readFile(filePath, 'utf-8');
      } catch {
        // File doesn't exist yet (Write to new file) - use empty string
        beforeContent = '';
      }

      // Track the original file state (before any edits in this session)
      if (!this.originalFileStates.has(filePath)) {
        this.originalFileStates.set(filePath, beforeContent);
      }

      this.captures.set(toolUseId, {
        id: toolUseId,
        filePath,
        beforeContent,
        timestamp: Date.now(),
        toolName,
      });
    } catch (error) {
      console.error('[PendingEditsManager] Failed to capture before state:', error);
    }
  }

  /** Completes a pending edit after the tool result arrives. */
  public async completePendingEdit(toolUseId: string): Promise<void> {
    const capture = this.captures.get(toolUseId);
    if (!capture) {
      return;
    }

    try {
      // Read the current file content (after edit was applied)
      let afterContent: string;
      try {
        afterContent = await fs.readFile(capture.filePath, 'utf-8');
      } catch {
        // File was deleted or doesn't exist - skip this edit
        this.captures.delete(toolUseId);
        return;
      }

      // Skip if content didn't actually change
      if (capture.beforeContent === afterContent) {
        this.captures.delete(toolUseId);
        return;
      }

      // Compute diff
      const diffLines = computeLineDiff(capture.beforeContent, afterContent);

      // Create pending edit
      const pendingEdit: PendingEdit = {
        id: toolUseId,
        filePath: capture.filePath,
        vaultPath: this.makeRelativePath(capture.filePath),
        beforeContent: capture.beforeContent,
        afterContent,
        timestamp: capture.timestamp,
        diffLines,
        toolName: capture.toolName,
      };

      // Add to reactive state
      const current = getPendingEdits();
      setPendingEdits([...current, pendingEdit]);

      // Refresh pending files with computed hunks
      await this.refreshPendingFiles();

      // Clean up capture
      this.captures.delete(toolUseId);
    } catch (error) {
      console.error('[PendingEditsManager] Failed to complete pending edit:', error);
      this.captures.delete(toolUseId);
    }
  }

  /** Accepts a pending edit (file already has the new content). */
  public acceptEdit(editId: string): void {
    const current = getPendingEdits();
    setPendingEdits(current.filter(edit => edit.id !== editId));
  }

  /** Accepts all pending edits. */
  public acceptAllEdits(): void {
    this.originalFileStates.clear();
    setPendingEdits([]);
  }

  /** Rejects a pending edit, restoring original content. */
  public async rejectEdit(editId: string): Promise<void> {
    const current = getPendingEdits();
    const edit = current.find(e => e.id === editId);
    if (!edit) return;

    try {
      // Restore original content
      await fs.writeFile(edit.filePath, edit.beforeContent, 'utf-8');
      // Remove from pending state
      setPendingEdits(current.filter(e => e.id !== editId));
    } catch (error) {
      console.error('[PendingEditsManager] Failed to reject edit:', error);
    }
  }

  /** Rejects all pending edits, restoring original content for each file. */
  public async rejectAllEdits(): Promise<void> {
    // Restore each file to its original state (before any edits)
    for (const [filePath, originalContent] of this.originalFileStates) {
      try {
        await fs.writeFile(filePath, originalContent, 'utf-8');
      } catch (error) {
        console.error('[PendingEditsManager] Failed to restore file:', filePath, error);
      }
    }

    // Clear all state
    this.originalFileStates.clear();
    setPendingEdits([]);
    setPendingFiles([]);
  }

  // ========== Hunk-level operations ==========

  /** Refreshes pending files by recomputing hunks from original vs current state. */
  public async refreshPendingFiles(): Promise<void> {
    const pendingFiles: PendingFile[] = [];

    for (const [filePath, originalContent] of this.originalFileStates) {
      try {
        const currentContent = await fs.readFile(filePath, 'utf-8');
        if (originalContent === currentContent) continue;

        const hunks = computeHunks(originalContent, currentContent);
        if (hunks.length === 0) continue;

        pendingFiles.push({
          filePath,
          vaultPath: this.makeRelativePath(filePath),
          originalContent,
          currentContent,
          hunks,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error('[PendingEditsManager] Failed to read file for hunks:', filePath, error);
      }
    }

    setPendingFiles(pendingFiles);
  }

  /** Updates a hunk's status (pending/accepted/rejected). */
  public updateHunkStatus(filePath: string, hunkId: string, status: 'pending' | 'accepted' | 'rejected'): void {
    const files = getPendingFiles();
    const updatedFiles = files.map(file => {
      if (file.filePath !== filePath) return file;
      return {
        ...file,
        hunks: file.hunks.map(hunk =>
          hunk.id === hunkId ? { ...hunk, status } : hunk
        ),
      };
    });
    setPendingFiles(updatedFiles);
  }

  /** Accepts a specific hunk. */
  public acceptHunk(filePath: string, hunkId: string): void {
    this.updateHunkStatus(filePath, hunkId, 'accepted');
  }

  /** Rejects a specific hunk. */
  public rejectHunk(filePath: string, hunkId: string): void {
    this.updateHunkStatus(filePath, hunkId, 'rejected');
  }

  /** Accepts all hunks for a file. */
  public acceptAllHunksForFile(filePath: string): void {
    const files = getPendingFiles();
    const updatedFiles = files.map(file => {
      if (file.filePath !== filePath) return file;
      return {
        ...file,
        hunks: file.hunks.map(hunk => ({ ...hunk, status: 'accepted' as const })),
      };
    });
    setPendingFiles(updatedFiles);
  }

  /** Rejects all hunks for a file. */
  public rejectAllHunksForFile(filePath: string): void {
    const files = getPendingFiles();
    const updatedFiles = files.map(file => {
      if (file.filePath !== filePath) return file;
      return {
        ...file,
        hunks: file.hunks.map(hunk => ({ ...hunk, status: 'rejected' as const })),
      };
    });
    setPendingFiles(updatedFiles);
  }

  /** Applies hunk decisions and writes the result to disk. */
  public async applyHunkDecisionsForFile(filePath: string): Promise<void> {
    const files = getPendingFiles();
    const file = files.find(f => f.filePath === filePath);
    if (!file) return;

    // Check if all hunks have been decided
    const hasPending = file.hunks.some(h => h.status === 'pending');
    if (hasPending) {
      console.warn('[PendingEditsManager] Cannot apply - some hunks are still pending');
      return;
    }

    // Compute the final content
    const finalContent = applyHunkDecisions(file.originalContent, file.currentContent, file.hunks);

    try {
      await fs.writeFile(filePath, finalContent, 'utf-8');

      // Remove this file from pending state
      this.originalFileStates.delete(filePath);
      setPendingFiles(files.filter(f => f.filePath !== filePath));

      // Also clean up legacy pending edits for this file
      const edits = getPendingEdits();
      setPendingEdits(edits.filter(e => e.filePath !== filePath));
    } catch (error) {
      console.error('[PendingEditsManager] Failed to apply hunk decisions:', error);
    }
  }

  /** Applies all hunk decisions across all files. */
  public async applyAllHunkDecisions(): Promise<void> {
    const files = getPendingFiles();
    for (const file of files) {
      await this.applyHunkDecisionsForFile(file.filePath);
    }
  }

  /** Accepts all hunks across all files and applies. */
  public async acceptAllHunks(): Promise<void> {
    const files = getPendingFiles();
    const updatedFiles = files.map(file => ({
      ...file,
      hunks: file.hunks.map(hunk => ({ ...hunk, status: 'accepted' as const })),
    }));
    setPendingFiles(updatedFiles);

    // Apply all (since all are accepted, files stay as current content)
    this.originalFileStates.clear();
    setPendingFiles([]);
    setPendingEdits([]);
  }

  /** Rejects all hunks across all files and applies. */
  public async rejectAllHunks(): Promise<void> {
    // Restore each file to original
    for (const [filePath, originalContent] of this.originalFileStates) {
      try {
        await fs.writeFile(filePath, originalContent, 'utf-8');
      } catch (error) {
        console.error('[PendingEditsManager] Failed to restore file:', filePath, error);
      }
    }

    this.originalFileStates.clear();
    setPendingFiles([]);
    setPendingEdits([]);
  }

  /** Makes a path relative to the vault. */
  private makeRelativePath(absolutePath: string): string {
    if (this.vaultPath && absolutePath.startsWith(this.vaultPath)) {
      return absolutePath.slice(this.vaultPath.length + 1);
    }
    return absolutePath;
  }

  /** Clears all state on cleanup. */
  public cleanup(): void {
    this.captures.clear();
    this.originalFileStates.clear();
    setPendingEdits([]);
    setPendingFiles([]);
  }
}
