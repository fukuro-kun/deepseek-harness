/**
 * The conflict machinery's contract: `conflictRows` cuts one `diffLines`
 * result into unchanged rows and hunks, and `mergeConflicts` resolves the same
 * change list under the same hunk indexing, so a pick made on screen means the
 * same hunk in the merge.
 */
import { describe, expect, it } from 'vitest'
import { conflictRows, mergeConflicts } from '../src/client/edit/diff.ts'

describe('conflictRows', () => {
  it('returns only unchanged context and no hunk when both texts are identical', () => {
    const rows = conflictRows('a\nb\n', 'a\nb\n')
    expect(rows).toEqual([{ kind: 'same', lines: ['a', 'b'] }])
    expect(rows.some(row => row.kind === 'hunk')).toBe(false)
  })

  it('reports one hunk for a single changed line', () => {
    const rows = conflictRows('a\nold\nc\n', 'a\nnew\nc\n')
    expect(rows).toEqual([
      { kind: 'same', lines: ['a'] },
      { kind: 'hunk', hunk: { index: 0, theirs: ['old'], mine: ['new'] } },
      { kind: 'same', lines: ['c'] },
    ])
  })

  it('groups a run of removals and additions into one hunk', () => {
    const rows = conflictRows('x1\nx2\nkeep\n', 'y1\ny2\ny3\nkeep\n')
    expect(rows).toEqual([
      { kind: 'hunk', hunk: { index: 0, theirs: ['x1', 'x2'], mine: ['y1', 'y2', 'y3'] } },
      { kind: 'same', lines: ['keep'] },
    ])
  })

  it('numbers separated hunks in file order', () => {
    const rows = conflictRows('t1\nsame\nt2\n', 'm1\nsame\nm2\n')
    const hunks = rows.flatMap(row => row.kind === 'hunk' ? [row.hunk] : [])
    expect(hunks.map(hunk => hunk.index)).toEqual([0, 1])
    expect(hunks[0]).toMatchObject({ theirs: ['t1'], mine: ['m1'] })
    expect(hunks[1]).toMatchObject({ theirs: ['t2'], mine: ['m2'] })
  })

  it('reports a pure insertion with an empty theirs side', () => {
    const rows = conflictRows('a\nc\n', 'a\nb\nc\n')
    expect(rows).toEqual([
      { kind: 'same', lines: ['a'] },
      { kind: 'hunk', hunk: { index: 0, theirs: [], mine: ['b'] } },
      { kind: 'same', lines: ['c'] },
    ])
  })
})

describe('mergeConflicts', () => {
  const theirs = 'a\nold\nc\n'
  const mine = 'a\nnew\nc\n'

  it('produces mine when every hunk picks mine', () => {
    expect(mergeConflicts(theirs, mine, () => 'mine')).toBe(mine)
  })

  it('produces theirs when every hunk picks theirs', () => {
    expect(mergeConflicts(theirs, mine, () => 'theirs')).toBe(theirs)
  })

  it('merges per-hunk choices over the same indexing the rows show', () => {
    const text = mergeConflicts('t1\nsame\nt2\n', 'm1\nsame\nm2\n', index => index === 0 ? 'mine' : 'theirs')
    expect(text).toBe('m1\nsame\nt2\n')
  })

  it('keeps insertions and drops deletions independently per hunk', () => {
    const text = mergeConflicts('gone\nkeep\n', 'keep\nadded\n', index => index === 0 ? 'theirs' : 'mine')
    expect(text).toBe('gone\nkeep\nadded\n')
  })
})
