/** CodeMirror 6 extension for showing pending edit diffs inline in the editor. */
import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { PendingFile, Hunk } from './types';
import { subscribeToPendingFilesChange, getPendingFiles } from './pendingEditsAtom';
import { PendingEditsManager } from './PendingEditsManager';

/** Decoration mark for added lines (green background). */
const addedLineDeco = Decoration.line({ class: 'pending-edit-added' });

/** Widget that renders a group of consecutive removed lines as a single block. */
class RemovedLinesGroupWidget extends WidgetType {
  constructor(readonly lines: string[]) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'pending-edit-removed-group';

    for (const content of this.lines) {
      const line = document.createElement('div');
      line.className = 'pending-edit-removed-line';
      line.textContent = content || '\u00A0'; // nbsp for empty lines
      container.appendChild(line);
    }

    return container;
  }

  eq(other: RemovedLinesGroupWidget): boolean {
    if (this.lines.length !== other.lines.length) return false;
    return this.lines.every((line, i) => line === other.lines[i]);
  }
}

/** Widget that renders accept/reject buttons for a hunk. */
class HunkActionsWidget extends WidgetType {
  constructor(
    readonly filePath: string,
    readonly hunk: Hunk,
    readonly position: 'above' | 'below' = 'above'
  ) {
    super();
  }

  toDOM(): HTMLElement {
    // Zero-height wrapper provides positioning context without taking space
    const wrapper = document.createElement('div');
    wrapper.className = this.position === 'above'
      ? 'pending-edit-hunk-actions-wrapper'
      : 'pending-edit-hunk-actions-wrapper-below';

    const container = document.createElement('div');
    container.className = 'pending-edit-hunk-actions';

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'pending-edit-btn pending-edit-accept';
    acceptBtn.textContent = '✓ Accept';
    acceptBtn.title = 'Accept this change';
    acceptBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      PendingEditsManager.getInstance().acceptHunkImmediate(this.filePath, this.hunk.id);
    };

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'pending-edit-btn pending-edit-reject';
    rejectBtn.textContent = '✗ Reject';
    rejectBtn.title = 'Reject this change';
    rejectBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      PendingEditsManager.getInstance().rejectHunkImmediate(this.filePath, this.hunk.id);
    };

    container.appendChild(acceptBtn);
    container.appendChild(rejectBtn);
    wrapper.appendChild(container);

    return wrapper;
  }

  eq(other: HunkActionsWidget): boolean {
    return other.filePath === this.filePath && other.hunk.id === this.hunk.id && other.position === this.position;
  }
}

/** Gets the file path for an editor view from Obsidian. */
function getFilePathForEditor(view: EditorView): string | null {
  const app = (window as any).app;
  if (!app?.workspace) return null;

  // Try to find the MarkdownView that contains this editor
  const leaves = app.workspace.getLeavesOfType('markdown');
  for (const leaf of leaves) {
    const markdownView = leaf.view;
    if (markdownView?.editor?.cm === view) {
      const file = markdownView.file;
      if (file) {
        const vaultPath = (app.vault.adapter as any).basePath;
        return `${vaultPath}/${file.path}`;
      }
    }
  }

  // Fallback: use active file (works for single-editor use case)
  const activeFile = app.workspace.getActiveFile();
  if (!activeFile) return null;

  const vaultPath = (app.vault.adapter as any).basePath;
  return `${vaultPath}/${activeFile.path}`;
}

/** Builds decorations for a pending file's hunks. */
function buildDecorations(view: EditorView, pendingFile: PendingFile | null): DecorationSet {
  if (!pendingFile || pendingFile.hunks.length === 0) {
    return Decoration.none;
  }

  // Only show pending hunks
  const pendingHunks = pendingFile.hunks.filter(h => h.status === 'pending');
  if (pendingHunks.length === 0) {
    return Decoration.none;
  }

  const doc = view.state.doc;
  const lineDecorations: Array<{ pos: number; deco: Decoration }> = [];
  const widgetDecorations: Array<{ pos: number; side: number; deco: Decoration }> = [];

  for (const hunk of pendingHunks) {
    let firstAddedLineStart: number | null = null;
    let deleteOnlyButtonPos: number | null = null; // Fallback position for delete-only hunks
    let deleteOnlyButtonSide: number = 2; // Side value for delete-only buttons (after deleted content)
    const lines = hunk.lines;

    // Collect removed lines into groups using same logic as hunk splitting:
    // - Split on 2+ consecutive context lines
    // - Split on any added line
    // - Single context line stays in group
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      if (line.type === 'added' && line.newLine !== undefined) {
        // Added line - use actual newLine value (0-indexed, so +1 for doc.line)
        const lineNum = line.newLine + 1;
        if (lineNum >= 1 && lineNum <= doc.lines) {
          const lineInfo = doc.line(lineNum);
          if (firstAddedLineStart === null) firstAddedLineStart = lineInfo.from;
          lineDecorations.push({ pos: lineInfo.from, deco: addedLineDeco });
        }
        i++;
      } else if (line.type === 'removed') {
        // Collect removed lines, allowing single context lines in between
        const removedLines: string[] = [];
        while (i < lines.length) {
          if (lines[i].type === 'removed') {
            removedLines.push(lines[i].content);
            i++;
          } else if (lines[i].type === 'context') {
            // Check if this is a single context line (not 2+ consecutive)
            const nextIdx = i + 1;
            if (nextIdx < lines.length && lines[nextIdx].type === 'removed') {
              // Single context followed by more removed - include and continue
              removedLines.push(lines[i].content);
              i++;
            } else {
              // 2+ context lines or end of removed section - stop
              break;
            }
          } else {
            // Added line - stop
            break;
          }
        }

        // Find next line with a newLine value to position the widget
        let targetLineNum: number | null = null;
        for (let j = i; j < lines.length; j++) {
          const nextLine = lines[j];
          if (nextLine.newLine !== undefined) {
            targetLineNum = nextLine.newLine + 1;
            break;
          }
        }
        // If no next line found, place at end of file
        if (targetLineNum === null) {
          targetLineNum = doc.lines;
        }

        // Create widget for all removed lines - position at end of previous line
        if (targetLineNum >= 1 && targetLineNum <= doc.lines) {
          const lineInfo = doc.line(targetLineNum);

          // Position at end of previous line if possible, otherwise at start of target
          let widgetPos: number;
          let widgetSide: number;
          if (targetLineNum > 1) {
            const prevLine = doc.line(targetLineNum - 1);
            widgetPos = prevLine.to;
            widgetSide = 1; // After the previous line's content
          } else {
            widgetPos = lineInfo.from;
            widgetSide = -1;
          }

          const widget = Decoration.widget({
            widget: new RemovedLinesGroupWidget(removedLines),
            side: widgetSide,
          });
          widgetDecorations.push({ pos: widgetPos, side: widgetSide, deco: widget });

          // Track position for delete-only hunk buttons (same position as deleted content, but after it)
          if (deleteOnlyButtonPos === null) {
            deleteOnlyButtonPos = widgetPos;
            deleteOnlyButtonSide = widgetSide + 1; // Render after the deleted content widget
          }
        } else if (doc.lines > 0) {
          const lastLine = doc.line(doc.lines);
          const widget = Decoration.widget({
            widget: new RemovedLinesGroupWidget(removedLines),
            side: 1,
          });
          widgetDecorations.push({ pos: lastLine.to, side: 1, deco: widget });

          // For end-of-file deletions, put buttons at same position
          if (deleteOnlyButtonPos === null) {
            deleteOnlyButtonPos = lastLine.to;
            deleteOnlyButtonSide = 2;
          }
        }
      } else {
        // Context line - skip
        i++;
      }
    }

    // Add action buttons:
    // - If hunk has added lines: above first added line (position: 'above')
    // - If delete-only: below the deleted content (position: 'below')
    const isDeleteOnly = firstAddedLineStart === null;
    const buttonPos = firstAddedLineStart ?? deleteOnlyButtonPos;
    const buttonSide = isDeleteOnly ? deleteOnlyButtonSide : -1;
    if (buttonPos !== null) {
      const actionsWidget = Decoration.widget({
        widget: new HunkActionsWidget(pendingFile.filePath, hunk, isDeleteOnly ? 'below' : 'above'),
        side: buttonSide,
      });
      widgetDecorations.push({ pos: buttonPos, side: buttonSide, deco: actionsWidget });
    }
  }

  // Build decoration set using Decoration.set which handles sorting
  const allDecorations: Array<{ from: number; value: Decoration }> = [];

  // Add line decorations
  for (const { pos, deco } of lineDecorations) {
    allDecorations.push({ from: pos, value: deco });
  }

  // Add widget decorations
  for (const { pos, deco } of widgetDecorations) {
    allDecorations.push({ from: pos, value: deco });
  }

  if (allDecorations.length === 0) {
    return Decoration.none;
  }

  // Use Decoration.set with sort: true to handle ordering
  return Decoration.set(
    allDecorations.map(d => d.value.range(d.from)),
    true // sort
  );
}

/** ViewPlugin that manages pending edit decorations. */
const pendingEditsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private unsubscribe: (() => void) | null = null;

    constructor(readonly view: EditorView) {
      this.decorations = Decoration.none;
      try {
        this.decorations = this.buildDecorations();
      } catch (e) {
        console.warn('[PendingEdits] Error in constructor:', e);
      }

      // Subscribe to pending files changes
      this.unsubscribe = subscribeToPendingFilesChange(() => {
        try {
          this.decorations = this.buildDecorations();
          // Force a view update by dispatching an empty transaction
          this.view.dispatch({});
        } catch (e) {
          console.warn('[PendingEdits] Error updating decorations:', e);
        }
      });
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        try {
          this.decorations = this.buildDecorations();
        } catch (e) {
          console.warn('[PendingEdits] Error in update:', e);
        }
      }
    }

    buildDecorations(): DecorationSet {
      try {
        const filePath = getFilePathForEditor(this.view);
        if (!filePath) return Decoration.none;

        const files = getPendingFiles();
        const pendingFile = files.find(f => f.filePath === filePath);
        return buildDecorations(this.view, pendingFile || null);
      } catch (e) {
        console.warn('[PendingEdits] Error building decorations:', e);
        return Decoration.none;
      }
    }

    destroy() {
      if (this.unsubscribe) {
        this.unsubscribe();
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

/** Theme styles for pending edit decorations. */
const pendingEditsTheme = EditorView.baseTheme({
  '.pending-edit-added': {
    backgroundColor: 'rgba(76, 175, 80, 0.15) !important',
  },
  '.pending-edit-removed-group': {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  },
  '.pending-edit-removed-line': {
    backgroundColor: 'rgba(244, 67, 54, 0.15)',
    fontSize: 'var(--font-text-size)',
    lineHeight: 'var(--line-height-normal)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  '.pending-edit-hunk-actions-wrapper': {
    position: 'relative',
    height: '0',
    width: '100%',
    overflow: 'visible',
  },
  '.pending-edit-hunk-actions-wrapper-below': {
    position: 'relative',
    height: '0',
    width: '100%',
    overflow: 'visible',
  },
  '.pending-edit-hunk-actions-wrapper-below .pending-edit-hunk-actions': {
    top: '0', // Position right at the deleted content
  },
  '.pending-edit-hunk-actions': {
    position: 'absolute',
    right: '8px',
    top: '-1.2em', // Position above by default
    display: 'inline-flex',
    gap: '4px',
    backgroundColor: 'var(--background-primary)',
    borderRadius: '3px',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.12)',
    zIndex: 10,
  },
  '.pending-edit-btn': {
    height: '18px !important',
    padding: '0 6px !important',
    margin: '0 !important',
    borderRadius: '2px',
    border: 'none !important',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '500',
    lineHeight: '18px !important',
    boxSizing: 'border-box',
    appearance: 'none',
    WebkitAppearance: 'none',
    transition: 'all 0.15s ease',
  },
  '.pending-edit-accept': {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    color: 'rgb(60, 160, 60)',
  },
  '.pending-edit-accept:hover': {
    backgroundColor: 'rgba(76, 175, 80, 0.25)',
  },
  '.pending-edit-reject': {
    backgroundColor: 'rgba(244, 67, 54, 0.15)',
    color: 'rgb(220, 60, 50)',
  },
  '.pending-edit-reject:hover': {
    backgroundColor: 'rgba(244, 67, 54, 0.25)',
  },
});

/** Creates the pending edits CodeMirror extension. */
export function createPendingEditsExtension() {
  return [
    pendingEditsPlugin,
    pendingEditsTheme,
  ];
}
