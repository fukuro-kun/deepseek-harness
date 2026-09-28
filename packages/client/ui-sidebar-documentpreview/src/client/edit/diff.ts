/**
 * Line-granularity conflict machinery for the document editor.
 *
 * When a guarded write meets a changed file, the reader resolves hunks — each
 * hunk keeps either their buffer's lines ('mine') or the fresh disk content's
 * ('theirs'). One hunk is a maximal run of added/removed `diffLines` changes;
 * `conflictRows` and `mergeConflicts` walk the same change list so a hunk's
 * index means the same thing on screen and in the merge.
 */

import { diffLines } from 'diff'

/** One conflict hunk: the disk text it replaces, and the buffer text it may keep. */
export interface ConflictHunk {
  /** The hunk's index in diff order — the key the store's choices record under. */
  readonly index: number
  /** Lines the disk version has here; empty when the buffer only inserted. */
  readonly theirs: readonly string[]
  /** Lines the reader's buffer has here; empty when the edit only deleted. */
  readonly mine: readonly string[]
}

/** A file's diff as display rows: unchanged stretches and conflict hunks interleaved. */
export type ConflictRow =
  | { readonly kind: 'same'; readonly lines: readonly string[] }
  | { readonly kind: 'hunk'; readonly hunk: ConflictHunk }

/** Split one `diffLines` change value into display lines. */
function linesOf(value: string): string[] {
  return value.replace(/\n$/u, '').split('\n')
}

/**
 * Cut one `diffLines` change list into hunks and unchanged rows.
 * @param theirs - the fresh disk content.
 * @param mine - the reader's buffer.
 * @returns display rows in file order; empty when both texts are identical.
 */
export function conflictRows(theirs: string, mine: string): readonly ConflictRow[] {
  const rows: ConflictRow[] = []
  let theirsPending: string[] = []
  let minePending: string[] = []
  const flush = (): void => {
    if (theirsPending.length === 0 && minePending.length === 0) return
    rows.push({ kind: 'hunk', hunk: { index: hunkCount(rows), theirs: theirsPending, mine: minePending } })
    theirsPending = []
    minePending = []
  }
  for (const change of diffLines(theirs, mine)) {
    if (change.removed === true) { theirsPending = [...theirsPending, ...linesOf(change.value)]; continue }
    if (change.added === true) { minePending = [...minePending, ...linesOf(change.value)]; continue }
    flush()
    rows.push({ kind: 'same', lines: linesOf(change.value) })
  }
  flush()
  return rows
}

/** The count of hunk rows produced so far — the next hunk's index. */
function hunkCount(rows: readonly ConflictRow[]): number {
  let count = 0
  for (const row of rows) if (row.kind === 'hunk') count += 1
  return count
}

/**
 * Apply the per-hunk choices and produce the text to write.
 * @param theirs - the fresh disk content.
 * @param mine - the reader's buffer.
 * @param pick - hunk index → side kept.
 * @returns the merged content.
 */
export function mergeConflicts(
  theirs: string,
  mine: string,
  pick: (hunkIndex: number) => 'mine' | 'theirs',
): string {
  let out = ''
  let theirsPending = ''
  let minePending = ''
  let index = 0
  const flush = (): void => {
    if (theirsPending === '' && minePending === '') return
    out += pick(index) === 'mine' ? minePending : theirsPending
    theirsPending = ''
    minePending = ''
    index += 1
  }
  for (const change of diffLines(theirs, mine)) {
    if (change.removed === true) { theirsPending += change.value; continue }
    if (change.added === true) { minePending += change.value; continue }
    flush()
    out += change.value
  }
  flush()
  return out
}
