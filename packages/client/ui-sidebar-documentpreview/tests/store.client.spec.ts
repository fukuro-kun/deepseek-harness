/**
 * The store's write set: pages keyed by their first line, invalidated by a newer
 * file version; a view that survives a reset; one bucket per tab, dropped on
 * `forget` so a closed tab leaves nothing behind.
 */
import { describe, expect, it } from 'vitest'
import type { RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client'
import { createTextStore, fresh } from '../src/client/store.ts'
import { page } from './fixtures.client.ts'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'

const TAB_1 = 'tab-1' as TabId
const TAB_2 = 'tab-2' as TabId
const TAB_9 = 'tab-9' as TabId

function pageValue(offset: number, lines: readonly string[], eof: boolean, version = 'v1') {
  const result = page(offset, lines, eof, version)
  if (!result.ok) throw new Error('fixture')
  return result.value
}

describe('text store', () => {
  it('clears an explicit implementation choice to resume automatic selection', () => {
    const instance = createTextStore().create()
    instance.actions.selected(TAB_1, 'custom')
    expect(instance.getSnapshot().byTab[TAB_1]?.rendererId).toBe('custom')
    instance.actions.selected(TAB_1, undefined)
    expect(instance.getSnapshot().byTab[TAB_1]?.rendererId).toBeUndefined()
  })

  it('starts empty and mints a bucket on the first write', () => {
    const instance = createTextStore().create()
    expect(instance.getSnapshot().byTab).toEqual({})
    instance.actions.loading(TAB_1)
    expect(instance.getSnapshot().byTab[TAB_1]).toEqual({ ...fresh(), loading: true })
  })

  it('keeps pages by their first line and reports the end of the file', () => {
    const instance = createTextStore().create()
    instance.actions.loading(TAB_1)
    instance.actions.page(TAB_1, pageValue(1, ['a', 'b'], false))
    instance.actions.page(TAB_1, pageValue(3, ['c'], true))
    const state = instance.getSnapshot().byTab[TAB_1]
    expect(state?.pages).toEqual({ 1: { text: 'a\nb', lines: 2 }, 3: { text: 'c', lines: 1 } })
    expect(state?.version).toBe('v1')
    expect(state?.eof).toBe(true)
    expect(state?.loading).toBe(false)
  })

  it('drops the pages of an older version when a newer page arrives', () => {
    const instance = createTextStore().create()
    instance.actions.page(TAB_1, pageValue(1, ['a'], false))
    instance.actions.page(TAB_1, pageValue(2, ['B'], true, 'v2'))
    expect(instance.getSnapshot().byTab[TAB_1]?.pages).toEqual({ 2: { text: 'B', lines: 1 } })
    expect(instance.getSnapshot().byTab[TAB_1]?.version).toBe('v2')
  })

  it('records a failure beside the pages already held, and the next page clears it', () => {
    const instance = createTextStore().create()
    instance.actions.page(TAB_1, pageValue(1, ['a'], false))
    const failure = { code: 'workspace-file/too-large', message: 'x', details: {} } as unknown as RemoteFailure
    instance.actions.failed(TAB_1, failure)
    expect(instance.getSnapshot().byTab[TAB_1]?.failure).toBe(failure)
    expect(instance.getSnapshot().byTab[TAB_1]?.pages).toEqual({ 1: { text: 'a', lines: 1 } })
    instance.actions.page(TAB_1, pageValue(2, ['b'], true))
    expect(instance.getSnapshot().byTab[TAB_1]?.failure).toBeUndefined()
  })

  it('resets the pages but keeps the view', () => {
    const instance = createTextStore().create()
    instance.actions.page(TAB_1, pageValue(1, ['a'], true))
    instance.actions.scrolled(TAB_1, 120)
    instance.actions.toggledWrap(TAB_1)
    instance.actions.navigated(TAB_1, 3)
    instance.actions.reset(TAB_1)
    expect(instance.getSnapshot().byTab[TAB_1]).toEqual({
      ...fresh(), scrollTop: 120, wrap: false, revision: 3,
    })
  })

  it('forgets one tab and keeps the rest', () => {
    const instance = createTextStore().create()
    instance.actions.toggledWrap(TAB_1)
    instance.actions.toggledWrap(TAB_2)
    instance.actions.forget(TAB_1)
    expect(Object.keys(instance.getSnapshot().byTab)).toEqual([TAB_2])
    // Forgetting an unknown tab is a no-op, not a fault: the abort listener may
    // fire for a tab that never wrote anything.
    instance.actions.forget(TAB_9)
    expect(Object.keys(instance.getSnapshot().byTab)).toEqual([TAB_2])
  })
})
describe('read observation baseline', () => {
  it('retains the first observation across overlapping reads and resets it only for a new generation', () => {
    const instance = createTextStore().create()
    instance.actions.loading(TAB_1, 'text-pages', 'observed-1')
    instance.actions.loading(TAB_1, 'text-pages', 'observed-2')
    expect(instance.getSnapshot().byTab[TAB_1]?.observedVersion).toBe('observed-1')
    instance.actions.page(TAB_1, pageValue(1, ['first'], false))
    instance.actions.loading(TAB_1, 'text-pages', 'observed-3')
    expect(instance.getSnapshot().byTab[TAB_1]?.observedVersion).toBe('observed-1')
    instance.actions.reset(TAB_1)
    instance.actions.loading(TAB_1, 'text-pages', 'observed-3')
    expect(instance.getSnapshot().byTab[TAB_1]?.observedVersion).toBe('observed-3')
  })
})
describe('edit actions without an open session', () => {
  const failure = { code: 'workspace-file/write-failed', message: 'x', details: {} } as unknown as RemoteFailure

  it('ignores draft, refresh, save, and conflict actions on a tab that never opened the editor', () => {
    const instance = createTextStore().create()
    instance.actions.loading(TAB_1)
    instance.actions.editDraft(TAB_1, 'x')
    instance.actions.editCancelled(TAB_1)
    instance.actions.editRefreshed(TAB_1, 'disk\n', 'v2')
    instance.actions.editRefreshMissed(TAB_1, 'v2')
    instance.actions.saveStarted(TAB_1)
    instance.actions.saveConflicted(TAB_1, 'mine', 'theirs', 'v2')
    instance.actions.saveFailed(TAB_1, failure)
    instance.actions.saved(TAB_1, 'v2', 'disk\n')
    instance.actions.editUnavailableCleared(TAB_1)
    instance.actions.conflictChoice(TAB_1, 0, 'theirs')
    instance.actions.conflictClosed(TAB_1)
    expect(instance.getSnapshot().byTab[TAB_1]?.edit).toBeUndefined()
  })

  it('ignores a write settlement on a session with no write in flight', () => {
    const instance = createTextStore().create()
    // A cancelled-and-reopened session holds no pending write; a settle from
    // the discarded write must not rebase it.
    instance.actions.editStarted(TAB_1, 'a\n', 'v1')
    instance.actions.saved(TAB_1, 'v2', 'stale\n')
    instance.actions.saveConflicted(TAB_1, 'mine\n', 'theirs\n', 'v2')
    instance.actions.saveFailed(TAB_1, failure)
    expect(instance.getSnapshot().byTab[TAB_1]?.edit).toMatchObject({
      base: 'a\n', baseVersion: 'v1', draft: 'a\n', saving: false, conflict: undefined, failure: undefined,
    })
  })

  it('ignores a conflict pick and close on an edit session that has no conflict armed', () => {
    const instance = createTextStore().create()
    instance.actions.loading(TAB_1)
    instance.actions.editStarted(TAB_1, 'a\n', 'v1')
    instance.actions.conflictChoice(TAB_1, 0, 'theirs')
    instance.actions.conflictClosed(TAB_1)
    expect(instance.getSnapshot().byTab[TAB_1]?.edit?.conflict).toBeUndefined()
    expect(instance.getSnapshot().byTab[TAB_1]?.edit?.draft).toBe('a\n')
  })
})
describe('edit session refresh and save lifecycle', () => {
  it('marks a file that cannot open for editing; reset keeps it, an explicit retry clears it', () => {
    const instance = createTextStore().create()
    instance.actions.editFailed(TAB_1)
    expect(instance.getSnapshot().byTab[TAB_1]?.editUnavailable).toBe(true)
    expect(instance.getSnapshot().byTab[TAB_1]?.edit).toBeUndefined()
    // A re-read cannot turn a binary file into text; only a manual reload retries.
    instance.actions.reset(TAB_1)
    expect(instance.getSnapshot().byTab[TAB_1]?.editUnavailable).toBe(true)
    instance.actions.editUnavailableCleared(TAB_1)
    expect(instance.getSnapshot().byTab[TAB_1]?.editUnavailable).toBeUndefined()
  })

  it('adopts fresh disk content into a clean buffer', () => {
    const instance = createTextStore().create()
    instance.actions.editStarted(TAB_1, 'a\n', 'v1')
    instance.actions.editRefreshed(TAB_1, 'b\n', 'v2')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit).toMatchObject({
      base: 'b\n', baseVersion: 'v2', draft: 'b\n', externalVersion: undefined,
    })
  })

  it('only records the newer version while the buffer is dirty, and resolves it on save', () => {
    const instance = createTextStore().create()
    instance.actions.editStarted(TAB_1, 'a\n', 'v1')
    instance.actions.editDraft(TAB_1, 'mine\n')
    instance.actions.editRefreshed(TAB_1, 'theirs\n', 'v2')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit).toMatchObject({
      base: 'a\n', baseVersion: 'v1', draft: 'mine\n', externalVersion: 'v2',
    })
    // Back on the base text the next refresh adopts the disk state outright.
    instance.actions.editDraft(TAB_1, 'a\n')
    instance.actions.editRefreshed(TAB_1, 'theirs\n', 'v2')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit).toMatchObject({ base: 'theirs\n', externalVersion: undefined })
  })

  it('leaves a saving or conflicted session alone on refresh', () => {
    const instance = createTextStore().create()
    instance.actions.editStarted(TAB_1, 'a\n', 'v1')
    instance.actions.saveStarted(TAB_1)
    instance.actions.editRefreshed(TAB_1, 'disk\n', 'v2')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit).toMatchObject({ base: 'a\n', baseVersion: 'v1', saving: true })
    instance.actions.saveConflicted(TAB_1, 'mine\n', 'theirs\n', 'v3')
    instance.actions.editRefreshed(TAB_1, 'newer\n', 'v4')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit?.conflict?.version).toBe('v3')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit?.base).toBe('a\n')
  })

  it('rebases the session on a successful write instead of closing it', () => {
    const instance = createTextStore().create()
    instance.actions.editStarted(TAB_1, 'a\n', 'v1')
    instance.actions.editDraft(TAB_1, 'changed\n')
    instance.actions.saveStarted(TAB_1)
    instance.actions.saved(TAB_1, 'v2', 'changed\n')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit).toMatchObject({
      base: 'changed\n', baseVersion: 'v2', draft: 'changed\n', saving: false,
    })
    // The paged trackers keep the version of the pages held — the written
    // version was never read into pages, so recording it would mask them.
    expect(instance.getSnapshot().byTab[TAB_1]).toMatchObject({ version: undefined, observedVersion: undefined })
  })

  it('adopts the merged text as the draft after a conflict save', () => {
    const instance = createTextStore().create()
    instance.actions.editStarted(TAB_1, 'a\n', 'v1')
    instance.actions.editDraft(TAB_1, 'mine\n')
    instance.actions.saveStarted(TAB_1)
    instance.actions.saveConflicted(TAB_1, 'mine\n', 'theirs\n', 'v2')
    instance.actions.saveStarted(TAB_1)
    instance.actions.saved(TAB_1, 'v3', 'theirs\n')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit).toMatchObject({
      base: 'theirs\n', baseVersion: 'v3', draft: 'theirs\n', saving: false, conflict: undefined,
    })
  })

  it('keeps a draft typed past a plain save in flight', () => {
    const instance = createTextStore().create()
    instance.actions.editStarted(TAB_1, 'a\n', 'v1')
    instance.actions.editDraft(TAB_1, 'changed\n')
    instance.actions.saveStarted(TAB_1)
    instance.actions.editDraft(TAB_1, 'changed more\n')
    instance.actions.saved(TAB_1, 'v2', 'changed\n')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit).toMatchObject({
      base: 'changed\n', baseVersion: 'v2', draft: 'changed more\n',
    })
  })

  it('clears a recorded external version when the conflict flow takes over', () => {
    const instance = createTextStore().create()
    instance.actions.editStarted(TAB_1, 'a\n', 'v1')
    instance.actions.editDraft(TAB_1, 'mine\n')
    instance.actions.editRefreshed(TAB_1, 'theirs\n', 'v2')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit?.externalVersion).toBe('v2')
    instance.actions.saveStarted(TAB_1)
    instance.actions.saveConflicted(TAB_1, 'mine\n', 'theirs\n', 'v2')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit?.externalVersion).toBeUndefined()
    expect(instance.getSnapshot().byTab[TAB_1]?.edit?.conflict).toBeDefined()
  })

  it('clears a recorded external version when the refresh lands back on the base version', () => {
    const instance = createTextStore().create()
    instance.actions.editStarted(TAB_1, 'a\n', 'v1')
    instance.actions.editDraft(TAB_1, 'mine\n')
    instance.actions.editRefreshed(TAB_1, 'theirs\n', 'v2')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit?.externalVersion).toBe('v2')
    // A stale replay at the base version means the disk is back at what the
    // draft was cut from — there is no external change to flag.
    instance.actions.editRefreshed(TAB_1, 'a\n', 'v1')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit?.externalVersion).toBeUndefined()
    expect(instance.getSnapshot().byTab[TAB_1]?.edit?.draft).toBe('mine\n')
  })

  it('flags a missed refresh read on an idle session and leaves a conflicted one alone', () => {
    const instance = createTextStore().create()
    instance.actions.editStarted(TAB_1, 'a\n', 'v1')
    instance.actions.editRefreshMissed(TAB_1, 'v2')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit?.externalVersion).toBe('v2')
    // A miss reporting the base version adds nothing.
    instance.actions.editStarted(TAB_2, 'a\n', 'v1')
    instance.actions.editRefreshMissed(TAB_2, 'v1')
    expect(instance.getSnapshot().byTab[TAB_2]?.edit?.externalVersion).toBeUndefined()
    // A miss mid-flight still lands; a save that lands another version keeps it.
    instance.actions.saveStarted(TAB_1)
    instance.actions.editRefreshMissed(TAB_1, 'v3')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit?.externalVersion).toBe('v3')
    instance.actions.saved(TAB_1, 'v4', 'mine\n')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit?.externalVersion).toBe('v3')
    // A conflict already holds the disk state to resolve; a miss adds nothing.
    instance.actions.saveStarted(TAB_1)
    instance.actions.saveConflicted(TAB_1, 'mine\n', 'theirs\n', 'v5')
    instance.actions.editRefreshMissed(TAB_1, 'v6')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit?.externalVersion).toBeUndefined()
    expect(instance.getSnapshot().byTab[TAB_1]?.edit?.conflict?.version).toBe('v5')
  })

  it('clears a mid-flight miss flag when the write lands that very version', () => {
    const instance = createTextStore().create()
    instance.actions.editStarted(TAB_1, 'a\n', 'v1')
    instance.actions.saveStarted(TAB_1)
    instance.actions.editRefreshMissed(TAB_1, 'v2')
    instance.actions.saved(TAB_1, 'v2', 'mine\n')
    expect(instance.getSnapshot().byTab[TAB_1]?.edit?.externalVersion).toBeUndefined()
  })
})
