/** LCS-based diff algorithm for computing line-by-line diffs. */
import { DiffLine, Hunk } from './types';

/** Computes a line-by-line diff between old and new content using LCS. */
export function computeLineDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  // Compute longest common subsequence
  const m = oldLines.length;
  const n = newLines.length;
  const lcs: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const diff: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.unshift({
        type: 'context',
        oldLine: i - 1,
        newLine: j - 1,
        content: oldLines[i - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      diff.unshift({
        type: 'added',
        newLine: j - 1,
        content: newLines[j - 1],
      });
      j--;
    } else if (i > 0) {
      diff.unshift({
        type: 'removed',
        oldLine: i - 1,
        content: oldLines[i - 1],
      });
      i--;
    }
  }

  return diff;
}

/** Groups diff lines into hunks (contiguous groups of changes with context). */
export function computeHunks(oldContent: string, newContent: string): Hunk[] {
  const diffLines = computeLineDiff(oldContent, newContent);
  if (diffLines.length === 0) return [];

  const hunks: Hunk[] = [];
  let currentHunk: DiffLine[] = [];
  let hunkStartOld = 0;
  let hunkStartNew = 0;
  let hunkId = 0;
  let inChangeBlock = false;
  let hasSeenAdd = false; // Track if we've seen an 'added' line in current hunk

  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i];
    const isChange = line.type !== 'context';
    const isBlankContext = !isChange && line.content.trim() === '';

    if (isChange) {
      // Check for removed→added→removed pattern (split before this removed)
      if (line.type === 'removed' && hasSeenAdd && inChangeBlock) {
        // Split: save current hunk, start new one
        if (currentHunk.some(l => l.type !== 'context')) {
          hunks.push(createHunk(hunkId++, hunkStartOld, hunkStartNew, currentHunk));
        }
        // Keep last blank context line as leading context for new hunk
        const lastLine = currentHunk[currentHunk.length - 1];
        if (lastLine?.type === 'context' && lastLine.content.trim() === '') {
          currentHunk = [lastLine];
          hunkStartOld = lastLine.oldLine ?? 0;
          hunkStartNew = lastLine.newLine ?? 0;
        } else {
          currentHunk = [];
        }
        hasSeenAdd = false;
      }

      if (!inChangeBlock && currentHunk.length > 0) {
        // We had context-only lines, keep only last 1 as leading context
        const leadingContext = currentHunk.slice(-1);
        currentHunk = leadingContext;
        if (leadingContext.length > 0) {
          hunkStartOld = leadingContext[0].oldLine ?? 0;
          hunkStartNew = leadingContext[0].newLine ?? 0;
        }
      }

      if (currentHunk.length === 0) {
        hunkStartOld = line.oldLine ?? 0;
        hunkStartNew = line.newLine ?? 0;
      }

      currentHunk.push(line);
      inChangeBlock = true;
      if (line.type === 'added') hasSeenAdd = true;
    } else if (isBlankContext) {
      // Blank context line - never splits, just add to current hunk
      currentHunk.push(line);
    } else {
      // Non-blank context line - always splits if we're in a change block
      if (inChangeBlock) {
        // Add this line as trailing context, then split
        currentHunk.push(line);

        if (currentHunk.some(l => l.type !== 'context')) {
          hunks.push(createHunk(hunkId++, hunkStartOld, hunkStartNew, currentHunk));
        }

        currentHunk = [];
        inChangeBlock = false;
        hasSeenAdd = false;
      } else {
        // Not in a change block, just accumulate context
        currentHunk.push(line);
      }
    }
  }

  // Finish last hunk
  if (currentHunk.length > 0 && currentHunk.some(l => l.type !== 'context')) {
    hunks.push(createHunk(hunkId++, hunkStartOld, hunkStartNew, currentHunk));
  }

  return hunks;
}

/** Creates a hunk object with preview text. */
function createHunk(id: number, startLineOld: number, startLineNew: number, lines: DiffLine[]): Hunk {
  // Generate preview from first changed line(s)
  const changedLines = lines.filter(l => l.type !== 'context');
  const previewLines = changedLines.slice(0, 2).map(l => {
    const prefix = l.type === 'added' ? '+' : '-';
    const text = l.content.slice(0, 25);
    return `${prefix}${text}${l.content.length > 25 ? '...' : ''}`;
  });
  const preview = previewLines.join(' ');

  return {
    id: `hunk-${id}`,
    startLineOld,
    startLineNew,
    lines: [...lines],
    preview: preview || '(empty change)',
    status: 'pending',
  };
}

/** Reconstructs file content by applying only accepted hunks. */
export function applyHunkDecisions(originalContent: string, currentContent: string, hunks: Hunk[]): string {
  const originalLines = originalContent.split('\n');
  const currentLines = currentContent.split('\n');

  // If all hunks accepted, return current content
  if (hunks.every(h => h.status === 'accepted')) {
    return currentContent;
  }

  // If all hunks rejected, return original content
  if (hunks.every(h => h.status === 'rejected')) {
    return originalContent;
  }

  // Mixed decisions - need to reconstruct
  // Strategy: Start with original, apply accepted changes
  const result: string[] = [...originalLines];

  // Sort hunks by their position in the new file (descending) to avoid index shifting issues
  const sortedHunks = [...hunks]
    .filter(h => h.status === 'accepted')
    .sort((a, b) => b.startLineNew - a.startLineNew);

  // Compute the full diff to understand the mapping
  const fullDiff = computeLineDiff(originalContent, currentContent);

  // Build a map of what changed
  // For each accepted hunk, we need to apply those specific changes
  // This is complex because hunks interact...

  // Simpler approach: rebuild line by line
  // Walk through the diff and for each change, check if its hunk is accepted
  const resultLines: string[] = [];
  let oldIdx = 0;

  for (const line of fullDiff) {
    // Find which hunk this line belongs to
    const hunk = hunks.find(h => h.lines.some(hl =>
      hl.type === line.type &&
      hl.content === line.content &&
      hl.oldLine === line.oldLine &&
      hl.newLine === line.newLine
    ));

    const isAccepted = hunk?.status === 'accepted';
    const isRejected = hunk?.status === 'rejected';
    const isPending = hunk?.status === 'pending';

    if (line.type === 'context') {
      resultLines.push(line.content);
    } else if (line.type === 'added') {
      // Include added line only if hunk is accepted (or pending - treat as accepted for now)
      if (isAccepted || isPending) {
        resultLines.push(line.content);
      }
    } else if (line.type === 'removed') {
      // Include removed line (from original) only if hunk is rejected
      if (isRejected) {
        resultLines.push(line.content);
      }
    }
  }

  return resultLines.join('\n');
}
