/** Singleton manager for pending edit state and operations. */
import { promises as fs } from 'fs';
import * as path from 'path';
import { PendingEdit, PendingEditCapture, PendingFile, Hunk } from './types';
import { computeLineDiff, computeHunks, applyHunkDecisions } from './diff';
import { setPendingEdits, getPendingEdits, setPendingFiles, getPendingFiles } from './pendingEditsAtom';

/** Saves debug data to a JSON file in the repo for debugging. */
async function saveDebugData(filename: string, data: any): Promise<void> {
  try {
    const debugPath = '/Users/ryanbrown/code/obsidian-claude-code/.pending-edits-debug';
    await fs.mkdir(debugPath, { recursive: true });
    const filePath = path.join(debugPath, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log('[PendingEdits] Debug data saved to:', filePath);
  } catch (e) {
    console.warn('[PendingEdits] Failed to save debug data:', e);
  }
}

export class PendingEditsManager {
  private static instance: PendingEditsManager | null = null;
  private captures: Map<string, PendingEditCapture> = new Map();
  private originalFileStates: Map<string, string> = new Map(); // Track original state per file
  private vaultPath: string = '';
  private enabled: boolean = true;

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

  /** Sets whether pending edits are enabled. */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Returns whether pending edits are enabled. */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /** Captures file content before an edit is applied. */
  public async captureBeforeState(toolUseId: string, filePath: string, toolName: string): Promise<void> {
    if (!this.enabled) return;
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
    if (!this.enabled) return;
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
      // Restore original content using Obsidian API for instant sync
      const usedObsidian = await this.modifyFileViaObsidian(edit.filePath, edit.beforeContent);
      if (!usedObsidian) {
        await fs.writeFile(edit.filePath, edit.beforeContent, 'utf-8');
      }
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
        const usedObsidian = await this.modifyFileViaObsidian(filePath, originalContent);
        if (!usedObsidian) {
          await fs.writeFile(filePath, originalContent, 'utf-8');
        }
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

        // Compute raw diff lines first for debugging
        const diffLines = computeLineDiff(originalContent, currentContent);
        const hunks = computeHunks(originalContent, currentContent);

        // Save debug data
        const debugData = {
          filePath,
          vaultPath: this.makeRelativePath(filePath),
          timestamp: new Date().toISOString(),
          originalLineCount: originalContent.split('\n').length,
          currentLineCount: currentContent.split('\n').length,
          diffLines,
          hunks,
        };
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeFileName = this.makeRelativePath(filePath).replace(/[/\\]/g, '_') + '_' + timestamp + '.json';
        await saveDebugData(safeFileName, debugData);

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

  /** Accepts a hunk immediately (file already has the content, update baseline). */
  public async acceptHunkImmediate(filePath: string, hunkId: string): Promise<void> {
    const files = getPendingFiles();
    const file = files.find(f => f.filePath === filePath);
    if (!file) return;

    const hunk = file.hunks.find(h => h.id === hunkId);
    if (!hunk) return;

    // Mark this hunk as accepted, others as rejected (for baseline computation)
    const hunksWithDecision = file.hunks.map(h =>
      h.id === hunkId
        ? { ...h, status: 'accepted' as const }
        : { ...h, status: 'rejected' as const }
    );

    // Compute the new "original" content that includes accepted changes
    const newOriginal = applyHunkDecisions(file.originalContent, file.currentContent, hunksWithDecision);

    // Update original state to include the accepted change
    this.originalFileStates.set(filePath, newOriginal);

    // Recompute remaining hunks from new original vs current file
    try {
      const currentContent = await fs.readFile(filePath, 'utf-8');
      const remainingHunks = computeHunks(newOriginal, currentContent);

      if (remainingHunks.length === 0) {
        // No more differences
        this.originalFileStates.delete(filePath);
        setPendingFiles(files.filter(f => f.filePath !== filePath));
        const edits = getPendingEdits();
        setPendingEdits(edits.filter(e => e.filePath !== filePath));
      } else {
        // Update with recomputed hunks
        const updatedFiles = files.map(f => {
          if (f.filePath !== filePath) return f;
          return { ...f, originalContent: newOriginal, currentContent, hunks: remainingHunks };
        });
        setPendingFiles(updatedFiles);
      }
    } catch (error) {
      console.error('[PendingEditsManager] Failed to recompute hunks after accept:', error);
    }
  }

  /** Rejects a hunk immediately (restore original lines and recompute). */
  public async rejectHunkImmediate(filePath: string, hunkId: string): Promise<void> {
    const files = getPendingFiles();
    const file = files.find(f => f.filePath === filePath);
    if (!file) return;

    const hunk = file.hunks.find(h => h.id === hunkId);
    if (!hunk) return;

    // Mark as rejected and compute new content
    const hunksWithDecision = file.hunks.map(h =>
      h.id === hunkId ? { ...h, status: 'rejected' as const } : h
    );

    // Apply just this rejection
    const newContent = applyHunkDecisions(file.originalContent, file.currentContent, hunksWithDecision);

    try {
      // Use Obsidian's API for instant editor sync, fall back to fs.writeFile
      const usedObsidian = await this.modifyFileViaObsidian(filePath, newContent);
      if (!usedObsidian) {
        await fs.writeFile(filePath, newContent, 'utf-8');
      }

      // Recompute remaining hunks from original vs new content
      const remainingHunks = computeHunks(file.originalContent, newContent);

      if (remainingHunks.length === 0) {
        // No more differences
        this.originalFileStates.delete(filePath);
        setPendingFiles(files.filter(f => f.filePath !== filePath));
        const edits = getPendingEdits();
        setPendingEdits(edits.filter(e => e.filePath !== filePath));
      } else {
        // Update with recomputed hunks
        const updatedFiles = files.map(f => {
          if (f.filePath !== filePath) return f;
          return { ...f, currentContent: newContent, hunks: remainingHunks };
        });
        setPendingFiles(updatedFiles);
      }
    } catch (error) {
      console.error('[PendingEditsManager] Failed to reject hunk:', error);
    }
  }

  /** Accepts all hunks for a file immediately (keeps current content as new baseline). */
  public acceptAllHunksForFile(filePath: string): void {
    const files = getPendingFiles();
    const file = files.find(f => f.filePath === filePath);
    if (!file) return;

    // File already has the content we want, just clear pending state
    this.originalFileStates.delete(filePath);
    setPendingFiles(files.filter(f => f.filePath !== filePath));

    const edits = getPendingEdits();
    setPendingEdits(edits.filter(e => e.filePath !== filePath));
  }

  /** Rejects all hunks for a file immediately (restores original content). */
  public async rejectAllHunksForFile(filePath: string): Promise<void> {
    const files = getPendingFiles();
    const file = files.find(f => f.filePath === filePath);
    if (!file) return;

    try {
      // Restore original content
      const usedObsidian = await this.modifyFileViaObsidian(filePath, file.originalContent);
      if (!usedObsidian) {
        await fs.writeFile(filePath, file.originalContent, 'utf-8');
      }

      // Clear pending state
      this.originalFileStates.delete(filePath);
      setPendingFiles(files.filter(f => f.filePath !== filePath));

      const edits = getPendingEdits();
      setPendingEdits(edits.filter(e => e.filePath !== filePath));
    } catch (error) {
      console.error('[PendingEditsManager] Failed to reject file:', error);
    }
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
      const usedObsidian = await this.modifyFileViaObsidian(filePath, finalContent);
      if (!usedObsidian) {
        await fs.writeFile(filePath, finalContent, 'utf-8');
      }

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
        const usedObsidian = await this.modifyFileViaObsidian(filePath, originalContent);
        if (!usedObsidian) {
          await fs.writeFile(filePath, originalContent, 'utf-8');
        }
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

  /** Modifies a file using Obsidian's Vault API for instant editor sync. */
  private async modifyFileViaObsidian(absolutePath: string, content: string): Promise<boolean> {
    const app = (window as any).app;
    if (!app?.vault) return false;

    const relativePath = this.makeRelativePath(absolutePath);
    const file = app.vault.getAbstractFileByPath(relativePath);
    if (!file) return false;

    await app.vault.modify(file, content);
    return true;
  }

  /** Clears all state on cleanup. */
  public cleanup(): void {
    this.captures.clear();
    this.originalFileStates.clear();
    setPendingEdits([]);
    setPendingFiles([]);
  }
}
