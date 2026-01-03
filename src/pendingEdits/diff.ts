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
export function computeHunks(oldContent: string, newContent: string, contextLines: number = 3): Hunk[] {
  const diffLines = computeLineDiff(oldContent, newContent);
  if (diffLines.length === 0) return [];

  const hunks: Hunk[] = [];
  let currentHunk: DiffLine[] = [];
  let hunkStartOld = 0;
  let hunkStartNew = 0;
  let lastChangeIndex = -1;
  let hunkId = 0;

  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i];
    const isChange = line.type !== 'context';

    if (isChange) {
      // If this is a new hunk or we're within context distance of last change
      if (currentHunk.length === 0) {
        // Start new hunk - include up to contextLines of preceding context
        const contextStart = Math.max(0, i - contextLines);
        for (let j = contextStart; j < i; j++) {
          if (currentHunk.length === 0) {
            hunkStartOld = diffLines[j].oldLine ?? 0;
            hunkStartNew = diffLines[j].newLine ?? 0;
          }
          currentHunk.push(diffLines[j]);
        }
        if (currentHunk.length === 0) {
          hunkStartOld = line.oldLine ?? 0;
          hunkStartNew = line.newLine ?? 0;
        }
      } else if (i - lastChangeIndex > contextLines * 2) {
        // Too far from last change - finish current hunk and start new one
        // Add trailing context to current hunk
        for (let j = lastChangeIndex + 1; j <= Math.min(lastChangeIndex + contextLines, i - 1); j++) {
          if (diffLines[j].type === 'context') {
            currentHunk.push(diffLines[j]);
          }
        }

        // Save current hunk
        hunks.push(createHunk(hunkId++, hunkStartOld, hunkStartNew, currentHunk));

        // Start new hunk with leading context
        currentHunk = [];
        const contextStart = Math.max(lastChangeIndex + contextLines + 1, i - contextLines);
        for (let j = contextStart; j < i; j++) {
          if (currentHunk.length === 0) {
            hunkStartOld = diffLines[j].oldLine ?? 0;
            hunkStartNew = diffLines[j].newLine ?? 0;
          }
          currentHunk.push(diffLines[j]);
        }
        if (currentHunk.length === 0) {
          hunkStartOld = line.oldLine ?? 0;
          hunkStartNew = line.newLine ?? 0;
        }
      }

      currentHunk.push(line);
      lastChangeIndex = i;
    } else if (currentHunk.length > 0 && i - lastChangeIndex <= contextLines) {
      // Add context within range after a change
      currentHunk.push(line);
    }
  }

  // Finish last hunk
  if (currentHunk.length > 0) {
    // Add any remaining trailing context
    for (let j = lastChangeIndex + 1; j < diffLines.length && j <= lastChangeIndex + contextLines; j++) {
      if (diffLines[j].type === 'context' && !currentHunk.includes(diffLines[j])) {
        currentHunk.push(diffLines[j]);
      }
    }
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
