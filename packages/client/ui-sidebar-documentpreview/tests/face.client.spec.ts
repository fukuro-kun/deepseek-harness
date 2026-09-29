/**
 * The face's contract with the store: a read in flight is visible, its outcome
 * lands as a page or a failure, a read outlived by its tab writes nothing, a
 * reload starts over from the first line and retires the reads still out, and
 * a newer file version arriving past the first line restarts the walk. The read
 * runs under the session the file names, not the one the face was injected for.
 */
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import type { WorkspaceFileBytes, WorkspaceFileText, WorkspaceFileWriteResult } from '@deepseek-ai/dsh-api-workspace-files/types'
import { textFace } from '../src/client/face.ts'
import type { DocumentFileBytes, ReadDocumentBytes, ReadWorkspaceFilePage, WriteWorkspaceFile } from '../src/client/rpc.ts'
import { hostFileOf } from '../src/client/rpc.ts'
import { createTextStore } from '../src/client/store.ts'
import { ABSOLUTE_PATH, FILE, PATH, SESSION, failure, page } from './fixtures.client.ts'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'

const TAB_1 = 'tab-1' as TabId

/** One read awaiting the spec's answer. */
interface PendingRead {
  readonly offset: number
  readonly promise: Promise<RemoteResult<WorkspaceFileText>>
  resolve(result: RemoteResult<WorkspaceFileText>): void
}

function complete(version = 'v1', data = new Uint8Array([0, 1, 255])) {
  return {
    ok: true as const,
    value: { absolutePath: ABSOLUTE_PATH, version, offset: 0, data, eof: true, bytes: data.byteLength },
  }
}

function bytesFailure(): RemoteResult<never> {
  return {
    ok: false,
    error: {
      name: 'RemoteError',
      isDSHRemoteError: true,
      code: 'workspace-file/outside-workspace',
      message: 'The file is outside the caller workspace',
      details: { path: ABSOLUTE_PATH },
    },
  }
}

/** Deferred results keyed by page offset or complete-read sequence number. */
function readQueue<T>() {
  const pending: Array<PromiseWithResolvers<RemoteResult<T>> & { key: number }> = []
  return {
    request(key: number): Promise<RemoteResult<T>> {
      const deferred = Promise.withResolvers<RemoteResult<T>>()
      pending.push({ ...deferred, key })
      return deferred.promise
    },
    settle: async (result: RemoteResult<T>, key?: number): Promise<void> => {
      const at = key === undefined ? 0 : pending.findIndex(call => call.key === key)
      const call = pending[at]
      if (call === undefined) throw new Error('no outstanding read to settle')
      pending.splice(at, 1)
      call.resolve(result)
      // The face registered its synchronous store-writing reaction before this await.
      await call.promise
    },
    outstanding: () => pending.map(call => call.key),
    async close(): Promise<void> {
      const remaining = pending.splice(0)
      for (const call of remaining) call.resolve(bytesFailure())
      await Promise.all(remaining.map(call => call.promise))
    },
  }
}

function bench(sessionId = 'other-session' as SessionId) {
  const instance = createTextStore().create()
  const pending: PendingRead[] = []
  const read = vi.fn<ReadWorkspaceFilePage>((_session, _path, offset) => {
    const deferred = Promise.withResolvers<RemoteResult<WorkspaceFileText>>()
    pending.push({ offset, ...deferred })
    return deferred.promise
  })
  const whole = readQueue<WorkspaceFileBytes>()
  const writes = readQueue<WorkspaceFileWriteResult>()
  let sequence = 0
  const bytes = vi.fn<ReadDocumentBytes>(() => whole.request(++sequence))
  const write = vi.fn<WriteWorkspaceFile>(() => writes.request(++sequence))
  const controller = new AbortController()
  onTestFinished(async () => {
    controller.abort()
    const remaining = pending.splice(0)
    for (const call of remaining) call.resolve(failure('workspace-file/outside-workspace', { path: PATH }))
    await Promise.all([...remaining.map(call => call.promise), whole.close(), writes.close()])
  })
  // The store's own `forget`, counted: the record's end must forget a tab exactly once.
  const forget = vi.fn(instance.actions.forget)
  // Injected for another session on purpose: the address's session must win.
  const face = textFace(read, bytes, write)(sessionId, { ...instance.actions, forget })
  /** Settle the oldest outstanding read, or the oldest one for `offset`. */
  const settle = async (result: RemoteResult<WorkspaceFileText>, offset?: number): Promise<void> => {
    const at = offset === undefined ? 0 : pending.findIndex(call => call.offset === offset)
    const [call] = pending.splice(at, 1)
    if (call === undefined) throw new Error('no outstanding read to settle')
    call.resolve(result)
    await call.promise
  }
  return {
    instance, read, face, forget, settle, bytes, write, controller,
    settleAll: (result: RemoteResult<DocumentFileBytes>, key?: number) => whole.settle(result.ok
      ? { ok: true, value: { ...result.value, data: btoa(String.fromCharCode(...result.value.data)) } }
      : result, key),
    settleAllWire: whole.settle,
    outstandingAll: whole.outstanding,
    settleWrite: writes.settle,
    outstandingWrites: writes.outstanding,
    outstanding: () => pending.map(call => call.offset),
    tab: () => instance.getSnapshot().byTab[TAB_1],
  }
}

const settlements = [
  { outcome: 'success', order: 'retired-first' },
  { outcome: 'failure', order: 'retired-first' },
  { outcome: 'success', order: 'current-first' },
  { outcome: 'failure', order: 'current-first' },
] as const

describe('textFace', () => {
  it('marks the read in flight, then keeps the page', async () => {
    const { read, face, settle, tab } = bench()
    const controller = new AbortController()
    face.loadPage(TAB_1, FILE, 1, controller.signal)
    expect(read).toHaveBeenCalledWith(SESSION, PATH, 1, controller.signal)
    expect(tab()?.loading).toBe(true)
    await settle(page(1, ['a', 'b'], false))
    expect(tab()).toMatchObject({ loading: false, pages: { 1: { text: 'a\nb', lines: 2 } }, eof: false })
  })

  it('records a failed read', async () => {
    const { face, settle, tab } = bench()
    face.loadPage(TAB_1, FILE, 1, new AbortController().signal)
    await settle(failure('workspace-file/outside-workspace', { path: PATH }))
    expect(tab()?.failure?.code).toBe('workspace-file/outside-workspace')
    expect(tab()?.loading).toBe(false)
  })

  it('forgets the tab when its record ends, once, however many reads armed it, and writes nothing afterwards', async () => {
    const { read, face, forget, settle, tab } = bench()
    const controller = new AbortController()
    const armed = vi.spyOn(controller.signal, 'addEventListener')
    onTestFinished(() => { armed.mockRestore() })
    face.loadPage(TAB_1, FILE, 1, controller.signal)
    await settle(page(1, ['a'], false))
    face.loadPage(TAB_1, FILE, 2, controller.signal)
    face.reloadPages(TAB_1, FILE, controller.signal)
    expect(armed.mock.calls.filter(([type]) => type === 'abort')).toHaveLength(1)
    expect(tab()).toBeDefined()
    controller.abort()
    expect(forget).toHaveBeenCalledExactlyOnceWith(TAB_1)
    expect(tab()).toBeUndefined()
    // The reads still out settle into nothing, and no request is made for the ended record.
    await settle(page(1, ['A'], true))
    expect(tab()).toBeUndefined()
    face.loadPage(TAB_1, FILE, 1, controller.signal)
    face.reloadPages(TAB_1, FILE, controller.signal)
    expect(read).toHaveBeenCalledTimes(3)
    expect(tab()).toBeUndefined()
  })

  it('reloads from the first line, dropping the pages and keeping the view', async () => {
    const { instance, read, face, settle, tab } = bench()
    const controller = new AbortController()
    face.loadPage(TAB_1, FILE, 1, controller.signal)
    await settle(page(1, ['a'], false))
    instance.actions.scrolled(TAB_1, 77)
    face.reloadPages(TAB_1, FILE, controller.signal)
    expect(tab()).toMatchObject({ pages: {}, eof: false, version: undefined, loading: true, scrollTop: 77 })
    expect(read).toHaveBeenLastCalledWith(SESSION, PATH, 1, controller.signal)
  })

  it('drops a page that settles after a reload retired it, whichever lands first', async () => {
    const { face, settle, outstanding, tab } = bench()
    const signal = new AbortController().signal
    face.loadPage(TAB_1, FILE, 1, signal)
    await settle(page(1, ['a', 'b', 'c'], false))
    // Load-more is out when the reader reloads: the new first page lands first.
    face.loadPage(TAB_1, FILE, 4, signal)
    face.reloadPages(TAB_1, FILE, signal)
    expect(outstanding()).toEqual([4, 1])
    await settle(page(1, ['A'], false, 'v2'), 1)
    expect(tab()).toMatchObject({ pages: { 1: { text: 'A', lines: 1 } }, version: 'v2', eof: false, loading: false })
    // The retired page lands afterwards and changes nothing, not even the end flag.
    await settle(page(4, ['d'], true), 4)
    expect(tab()).toMatchObject({ pages: { 1: { text: 'A', lines: 1 } }, version: 'v2', eof: false, loading: false })
  })

  it('starts the walk over when a page of a newer version arrives past the first line', async () => {
    const { read, face, settle, outstanding, tab } = bench()
    const signal = new AbortController().signal
    face.loadPage(TAB_1, FILE, 1, signal)
    await settle(page(1, ['a', 'b', 'c'], false))
    face.loadPage(TAB_1, FILE, 4, signal)
    // The file changed between the two reads: the page is not kept beside the older ones.
    await settle(page(4, ['D'], true, 'v2'))
    expect(tab()).toMatchObject({ pages: {}, version: undefined, eof: false, loading: true })
    expect(read).toHaveBeenCalledTimes(3)
    expect(outstanding()).toEqual([1])
    await settle(page(1, ['A', 'B'], true, 'v2'))
    expect(tab()).toMatchObject({ pages: { 1: { text: 'A\nB', lines: 2 } }, version: 'v2', eof: true, loading: false })
  })

  it('keeps a first page of a newer version, since the store drops the older pages for it', async () => {
    const { face, settle, tab } = bench()
    const signal = new AbortController().signal
    face.loadPage(TAB_1, FILE, 1, signal)
    await settle(page(1, ['a'], false))
    // A retry of the first page after the file changed lands as the new version.
    face.loadPage(TAB_1, FILE, 1, signal)
    await settle(page(1, ['A'], true, 'v2'))
    expect(tab()).toMatchObject({ pages: { 1: { text: 'A', lines: 1 } }, version: 'v2', eof: true })
  })
  it('loads native complete bytes with only the tab signal', async () => {
    const { face, read, bytes, settleAll, tab, controller } = bench()
    const result = complete()
    face.loadAll(TAB_1, FILE, controller.signal)
    expect(bytes).toHaveBeenCalledExactlyOnceWith(FILE, controller.signal)
    expect(read).not.toHaveBeenCalled()
    expect(tab()).toMatchObject({ mode: 'bytes-complete', loading: true, pages: {}, failure: undefined })
    expect(tab()?.complete).toBeUndefined()
    await settleAll(result)
    expect(tab()).toMatchObject({ mode: 'bytes-complete', loading: false, complete: result.value, version: 'v1', eof: true, pages: {} })
  })

  it('records a complete-read failure and clears it when the read is retried', async () => {
    const { face, settleAll, tab, controller } = bench()
    face.loadAll(TAB_1, FILE, controller.signal)
    await settleAll(bytesFailure())
    expect(tab()).toMatchObject({ mode: 'bytes-complete', loading: false, failure: { code: 'workspace-file/outside-workspace' } })
    expect(tab()?.complete).toBeUndefined()
    face.loadAll(TAB_1, FILE, controller.signal)
    expect(tab()).toMatchObject({ loading: true, failure: undefined })
    await settleAll(complete())
    expect(tab()).toMatchObject({ loading: false, failure: undefined, complete: complete().value })
  })

  it('records malformed complete-byte wire data as a failed read', async () => {
    const { face, settleAllWire, tab, controller } = bench()
    face.loadAll(TAB_1, FILE, controller.signal)
    await settleAllWire({
      ok: true,
      value: { absolutePath: ABSOLUTE_PATH, version: 'v1', offset: 0, data: '!!!', eof: true, bytes: 3 },
    })
    expect(tab()).toMatchObject({
      mode: 'bytes-complete', loading: false, version: undefined,
      failure: { code: 'gateway/internal', message: 'document file byte response has malformed base64 data' },
    })
    expect(tab()?.complete).toBeUndefined()
  })

  it('reloads complete bytes, discarding the old result and preserving the view', async () => {
    const { instance, face, bytes, settleAll, tab, controller } = bench()
    face.loadAll(TAB_1, FILE, controller.signal)
    await settleAll(complete())
    instance.actions.selected(TAB_1, 'test/whole-file')
    instance.actions.scrolled(TAB_1, 77)
    instance.actions.toggledWrap(TAB_1)
    instance.actions.navigated(TAB_1, 3)
    face.reloadAll(TAB_1, FILE, controller.signal)
    expect(bytes).toHaveBeenCalledTimes(2)
    expect(bytes).toHaveBeenLastCalledWith(FILE, controller.signal)
    expect(tab()).toMatchObject({ mode: 'bytes-complete', loading: true, version: undefined, eof: false, pages: {} })
    expect(tab()?.complete).toBeUndefined()
    const result = complete('v2', new Uint8Array([2, 3, 255]))
    await settleAll(result)
    expect(tab()).toMatchObject({
      complete: result.value, version: 'v2', loading: false, eof: true,
      rendererId: 'test/whole-file', scrollTop: 77, wrap: false, revision: 3,
    })
  })

  it('reports a failed complete reload without restoring the discarded bytes', async () => {
    const { face, settleAll, tab, controller } = bench()
    face.loadAll(TAB_1, FILE, controller.signal)
    await settleAll(complete())
    face.reloadAll(TAB_1, FILE, controller.signal)
    await settleAll(bytesFailure())
    expect(tab()).toMatchObject({
      mode: 'bytes-complete', loading: false, version: undefined, eof: false,
      failure: { code: 'workspace-file/outside-workspace' },
    })
    expect(tab()?.complete).toBeUndefined()
  })

  it.each(['loadAll', 'reloadAll'] as const)('%s does not request or create state for an ended tab', (method) => {
    const { face, bytes, forget, tab, controller } = bench()
    controller.abort()
    face[method](TAB_1, FILE, controller.signal)
    expect(bytes).not.toHaveBeenCalled()
    expect(forget).not.toHaveBeenCalled()
    expect(tab()).toBeUndefined()
  })

  it.each(['success', 'failure'] as const)('ignores complete-read %s after tab abort', async (outcome) => {
    const { instance, face, bytes, forget, settleAll, tab, controller } = bench()
    face.loadAll(TAB_1, FILE, controller.signal)
    face.reloadAll(TAB_1, FILE, controller.signal)
    controller.abort()
    expect(forget).toHaveBeenCalledExactlyOnceWith(TAB_1)
    expect(tab()).toBeUndefined()
    const snapshot = instance.getSnapshot()
    await settleAll(outcome === 'success' ? complete() : bytesFailure(), 1)
    await settleAll(outcome === 'success' ? complete('v2') : bytesFailure(), 2)
    expect(instance.getSnapshot()).toBe(snapshot)
    face.loadAll(TAB_1, FILE, controller.signal)
    face.reloadAll(TAB_1, FILE, controller.signal)
    expect(bytes).toHaveBeenCalledTimes(2)
    expect(instance.getSnapshot()).toBe(snapshot)
  })

  it.each(settlements)('ignores retired complete-read $outcome after reload ($order)', async ({ outcome, order }) => {
    const { instance, face, settleAll, outstandingAll, tab, controller } = bench()
    face.loadAll(TAB_1, FILE, controller.signal)
    face.reloadAll(TAB_1, FILE, controller.signal)
    expect(outstandingAll()).toEqual([1, 2])
    const current = complete('v2', new Uint8Array([2, 3, 255]))
    const settleRetired = async (): Promise<void> => {
      const snapshot = instance.getSnapshot()
      await settleAll(outcome === 'success' ? complete() : bytesFailure(), 1)
      expect(instance.getSnapshot()).toBe(snapshot)
    }
    if (order === 'retired-first') {
      await settleRetired()
      await settleAll(current, 2)
    } else {
      await settleAll(current, 2)
      await settleRetired()
    }
    expect(tab()).toMatchObject({ complete: current.value, version: 'v2', loading: false, failure: undefined })
  })

  describe.each(['text-pages', 'bytes-complete'] as const)('switching away from %s', (mode) => {
    it.each(settlements)('ignores the previous mode\'s $outcome ($order)', async ({ outcome, order }) => {
      const { instance, face, settle, settleAll, outstanding, outstandingAll, tab, controller } = bench()
      const { signal } = controller
      if (mode === 'text-pages') {
        face.loadPage(TAB_1, FILE, 1, signal)
        face.loadAll(TAB_1, FILE, signal)
      } else {
        face.loadAll(TAB_1, FILE, signal)
        face.loadPage(TAB_1, FILE, 1, signal)
      }
      expect(outstanding()).toEqual([1])
      expect(outstandingAll()).toEqual([1])
      const settleRetired = async (): Promise<void> => {
        const snapshot = instance.getSnapshot()
        if (mode === 'text-pages') await settle(outcome === 'success' ? page(1, ['old'], true) : bytesFailure())
        else await settleAll(outcome === 'success' ? complete() : bytesFailure())
        expect(instance.getSnapshot()).toBe(snapshot)
      }
      const settleCurrent = async (): Promise<void> => {
        if (mode === 'text-pages') await settleAll(complete('v2', new Uint8Array([2, 3, 255])))
        else await settle(page(1, ['current'], true, 'v2'))
      }
      if (order === 'retired-first') {
        await settleRetired()
        await settleCurrent()
      } else {
        await settleCurrent()
        await settleRetired()
      }
      expect(tab()).toMatchObject({ version: 'v2', loading: false, failure: undefined, eof: true })
      if (mode === 'text-pages') {
        expect(tab()).toMatchObject({ mode: 'bytes-complete', pages: {}, complete: complete('v2', new Uint8Array([2, 3, 255])).value })
      } else {
        expect(tab()).toMatchObject({ mode: 'text-pages', pages: { 1: { text: 'current', lines: 1 } } })
        expect(tab()?.complete).toBeUndefined()
      }
    })
  })

  it('keeps earlier generations retired after returning to complete-byte mode', async () => {
    const { instance, face, settle, settleAll, tab, controller } = bench()
    face.loadAll(TAB_1, FILE, controller.signal)
    face.loadPage(TAB_1, FILE, 1, controller.signal)
    face.loadAll(TAB_1, FILE, controller.signal)
    await settleAll(complete('v2', new Uint8Array([2, 3, 255])), 2)
    const snapshot = instance.getSnapshot()
    await settleAll(complete(), 1)
    await settle(bytesFailure())
    expect(instance.getSnapshot()).toBe(snapshot)
    expect(tab()).toMatchObject({ mode: 'bytes-complete', complete: complete('v2', new Uint8Array([2, 3, 255])).value, pages: {} })
  })


  it.each([PATH, ABSOLUTE_PATH, 'C:/w/notes.md', '//host/share/notes.md'])('uses the addressed Session for %s in both reading modes', async (path) => {
    const first = bench()
    const secondSession = 'second-caller-session' as SessionId
    const second = bench(secondSession)
    const address = sessionFileAddress(SESSION, path)
    const firstFile = hostFileOf(address)
    const secondFile = hostFileOf(address)
    expect(firstFile).toEqual({ sessionId: SESSION, path })
    expect(secondFile).toEqual(firstFile)
    first.face.loadPage(TAB_1, firstFile, 1, first.controller.signal)
    second.face.reloadPages(TAB_1, secondFile, second.controller.signal)
    expect(first.read).toHaveBeenCalledExactlyOnceWith(firstFile.sessionId, firstFile.path, 1, first.controller.signal)
    expect(second.read).toHaveBeenCalledExactlyOnceWith(secondFile.sessionId, secondFile.path, 1, second.controller.signal)
    await first.settle(page(1, ['first'], true))
    await second.settle(page(1, ['second'], true))
    first.face.loadAll(TAB_1, firstFile, first.controller.signal)
    second.face.reloadAll(TAB_1, secondFile, second.controller.signal)
    expect(first.bytes).toHaveBeenCalledExactlyOnceWith(firstFile, first.controller.signal)
    expect(second.bytes).toHaveBeenCalledExactlyOnceWith(secondFile, second.controller.signal)
    await first.settleAll(complete('v1'))
    await second.settleAll(complete('v2'))
    expect(first.tab()?.version).toBe('v1')
    expect(second.tab()?.version).toBe('v2')
  })
})

describe('textFace — editing', () => {
  /** A complete read carrying UTF-8 text the way `readAll` wires it. */
  const completeText = (version: string, text: string): RemoteResult<DocumentFileBytes> =>
    complete(version, new TextEncoder().encode(text))
  const writeOk = (version: string): RemoteResult<WorkspaceFileWriteResult> =>
    ({ ok: true, value: { absolutePath: ABSOLUTE_PATH, version, operation: 'update' } })
  const stale: RemoteResult<WorkspaceFileWriteResult> = {
    ok: false,
    error: {
      name: 'RemoteError', isDSHRemoteError: true,
      code: 'workspace-file/stale-version', message: 'changed since the loaded version', details: { path: PATH },
    },
  }

  it('arms a draft from the complete file text and its version', async () => {
    const { face, bytes, settleAll, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    expect(bytes).toHaveBeenCalledExactlyOnceWith(FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    expect(tab()?.edit).toMatchObject({ base: 'a\nb\n', baseVersion: 'v7', draft: 'a\nb\n', saving: false })
  })

  it('marks the tab edit-unavailable when the open read fails, without a session or a page failure', async () => {
    const { face, settleAllWire, tab } = bench()
    face.startEdit(TAB_1, FILE, new AbortController().signal)
    await settleAllWire(bytesFailure())
    expect(tab()?.edit).toBeUndefined()
    expect(tab()?.editUnavailable).toBe(true)
    expect(tab()?.failure).toBeUndefined()
  })

  it('refuses to edit a file whose bytes are not UTF-8 text', async () => {
    const { face, settleAll, tab } = bench()
    face.startEdit(TAB_1, FILE, new AbortController().signal)
    await settleAll(complete('v1', new Uint8Array([0xff, 0xfe])))
    expect(tab()?.edit).toBeUndefined()
    expect(tab()?.editUnavailable).toBe(true)
    expect(tab()?.failure).toBeUndefined()
  })

  it('refuses to edit text that decodes but carries NUL bytes', async () => {
    const { face, settleAll, tab } = bench()
    face.startEdit(TAB_1, FILE, new AbortController().signal)
    await settleAll(complete('v1', new TextEncoder().encode('a\0b\n')))
    expect(tab()?.edit).toBeUndefined()
    expect(tab()?.editUnavailable).toBe(true)
  })

  it('reads once while an edit open is already in flight', async () => {
    const { face, bytes, settleAll, outstandingAll, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    face.startEdit(TAB_1, FILE, controller.signal)
    expect(bytes).toHaveBeenCalledTimes(1)
    expect(outstandingAll()).toEqual([1])
    await settleAll(completeText('v7', 'a\n'))
    expect(tab()?.edit).toMatchObject({ base: 'a\n', baseVersion: 'v7' })
    // A later open reads again: the in-flight guard only covers the request out.
    face.startEdit(TAB_1, FILE, controller.signal)
    expect(bytes).toHaveBeenCalledTimes(2)
    await settleAll(completeText('v8', 'b\n'))
    expect(tab()?.edit).toMatchObject({ base: 'b\n', baseVersion: 'v8' })
  })

  it('adopts a refreshed read into a clean buffer, and only marks a dirty one', async () => {
    const { face, instance, settleAll, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\n'))
    face.refreshEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v8', 'disk\n'))
    expect(tab()?.edit).toMatchObject({ base: 'disk\n', baseVersion: 'v8', draft: 'disk\n', externalVersion: undefined })
    // A dirty draft keeps its text; the refresh only records the newer version.
    instance.actions.editDraft(TAB_1, 'mine\n')
    face.refreshEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v9', 'newer\n'))
    expect(tab()?.edit).toMatchObject({ base: 'disk\n', draft: 'mine\n', externalVersion: 'v9' })
  })

  it('leaves a refresh alone while the session saves or resolves a conflict', async () => {
    const { face, settleAll, settleWrite, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\n'))
    face.saveEdit(TAB_1, FILE, 'mine\n', 'v7', controller.signal)
    face.refreshEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v8', 'disk\n'))
    expect(tab()?.edit).toMatchObject({ base: 'a\n', baseVersion: 'v7', saving: true })
    await settleWrite(stale)
    await settleAll(completeText('v9', 'theirs\n'))
    expect(tab()?.edit?.conflict).toBeDefined()
    face.refreshEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v10', 'even newer\n'))
    expect(tab()?.edit).toMatchObject({ base: 'a\n', baseVersion: 'v7' })
    expect(tab()?.edit?.conflict?.version).toBe('v9')
  })

  it('ignores a refresh failure without an observed version: the open session keeps its base', async () => {
    const { face, settleAll, settleAllWire, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\n'))
    face.refreshEdit(TAB_1, FILE, controller.signal)
    await settleAllWire(bytesFailure())
    expect(tab()?.edit).toMatchObject({ base: 'a\n', baseVersion: 'v7', externalVersion: undefined })
  })

  it('flags the reported version when its refresh read fails', async () => {
    const { face, settleAll, settleAllWire, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\n'))
    face.refreshEdit(TAB_1, FILE, controller.signal, 'v8')
    await settleAllWire(bytesFailure())
    expect(tab()?.edit).toMatchObject({ base: 'a\n', baseVersion: 'v7', externalVersion: 'v8' })
  })

  it('flags the reported version when its refresh read rejects', async () => {
    const { face, settleAll, bytes, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\n'))
    bytes.mockRejectedValueOnce(new Error('connection lost'))
    face.refreshEdit(TAB_1, FILE, controller.signal, 'v8')
    await vi.waitFor(() => { expect(tab()?.edit?.externalVersion).toBe('v8') })
    expect(tab()?.edit).toMatchObject({ base: 'a\n', baseVersion: 'v7' })
  })

  it('drops a superseded refresh failure without flagging its version', async () => {
    const { face, settleAll, settleAllWire, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\n'))
    // The newer report retires the older read; its failure must not flag v8
    // when v9 is what the buffer will track.
    face.refreshEdit(TAB_1, FILE, controller.signal, 'v8')
    face.refreshEdit(TAB_1, FILE, controller.signal, 'v9')
    await settleAllWire(bytesFailure(), 2)
    expect(tab()?.edit).toMatchObject({ base: 'a\n', baseVersion: 'v7', externalVersion: undefined })
    await settleAll(completeText('v9', 'new\n'), 3)
    expect(tab()?.edit).toMatchObject({ base: 'new\n', baseVersion: 'v9' })
  })

  it('flags the version a save-retired refresh carried, but skips a versionless one', async () => {
    const { face, settleAll, settleWrite, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\n'))
    // The save's epoch retires the in-flight refresh: no successor owns its
    // frame, so the settlement flags the version it was issued for.
    face.refreshEdit(TAB_1, FILE, controller.signal, 'v8')
    face.saveEdit(TAB_1, FILE, 'mine\n', 'v7', controller.signal)
    await settleWrite(writeOk('v9'))
    await settleAll(completeText('v8', 'stale\n'), 2)
    expect(tab()?.edit).toMatchObject({ base: 'mine\n', baseVersion: 'v9', externalVersion: 'v8' })
    // A refresh issued without a version has nothing to flag.
    face.refreshEdit(TAB_1, FILE, controller.signal)
    face.saveEdit(TAB_1, FILE, 'mine again\n', 'v9', controller.signal)
    await settleWrite(writeOk('v10'))
    await settleAll(completeText('v10', 'later\n'), 4)
    expect(tab()?.edit).toMatchObject({ baseVersion: 'v10', externalVersion: 'v8' })
  })

  it('never opens a read for an edit whose record already ended', () => {
    const { face, bytes } = bench()
    const controller = new AbortController()
    controller.abort()
    face.startEdit(TAB_1, FILE, controller.signal)
    expect(bytes).not.toHaveBeenCalled()
  })

  it('drops an older refresh that settles after a newer one', async () => {
    const { face, settleAll, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\n'))
    // Two reported changes overlap their reads; the newer one lands first.
    // Read keys count calls across the whole bench: startEdit took key 1.
    face.refreshEdit(TAB_1, FILE, controller.signal)
    face.refreshEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v9', 'newest\n'), 3)
    expect(tab()?.edit).toMatchObject({ base: 'newest\n', baseVersion: 'v9' })
    await settleAll(completeText('v8', 'stale\n'), 2)
    expect(tab()?.edit).toMatchObject({ base: 'newest\n', baseVersion: 'v9' })
  })

  it('drops a refresh issued before the session was reopened', async () => {
    const { face, instance, settleAll, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\n'))
    // The refresh read is still out when the reader cancels and the body
    // re-opens the session — its settlement must not adopt older content.
    face.refreshEdit(TAB_1, FILE, controller.signal)
    instance.actions.editCancelled(TAB_1)
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v9', 'reopened\n'), 3)
    expect(tab()?.edit).toMatchObject({ base: 'reopened\n', baseVersion: 'v9' })
    await settleAll(completeText('v8', 'stale\n'), 2)
    expect(tab()?.edit).toMatchObject({ base: 'reopened\n', baseVersion: 'v9' })
  })

  it('flags a refresh the reopen epoch retired after the new session opened', async () => {
    const { face, instance, settleAll, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\n'))
    face.refreshEdit(TAB_1, FILE, controller.signal, 'v8')
    instance.actions.editCancelled(TAB_1)
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v9', 'reopened\n'), 3)
    // The retired refresh's version never entered the reopened buffer — the
    // flag stays conservative: the disk may still sit ahead of the new base.
    await settleAll(completeText('v8', 'stale\n'), 2)
    expect(tab()?.edit).toMatchObject({ base: 'reopened\n', baseVersion: 'v9', externalVersion: 'v8' })
  })

  it('never opens a refresh read for an edit whose record already ended', () => {
    const { face, bytes } = bench()
    const controller = new AbortController()
    controller.abort()
    face.refreshEdit(TAB_1, FILE, controller.signal)
    expect(bytes).not.toHaveBeenCalled()
  })

  it('drops a refresh read that settles after its record ended', async () => {
    const { face, settleAll, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\n'))
    face.refreshEdit(TAB_1, FILE, controller.signal)
    controller.abort()
    await settleAll(completeText('v8', 'b\n'))
    expect(tab()).toBeUndefined()
  })

  it('ignores a refresh read whose bytes cannot decode as edit text', async () => {
    const { face, settleAll, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\n'))
    face.refreshEdit(TAB_1, FILE, controller.signal)
    await settleAll(complete('v8', new Uint8Array([0xff, 0xfe])))
    expect(tab()?.edit).toMatchObject({ base: 'a\n', baseVersion: 'v7', externalVersion: undefined })
  })

  it('flags the reported version when its refresh read cannot decode as text', async () => {
    const { face, settleAll, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\n'))
    face.refreshEdit(TAB_1, FILE, controller.signal, 'v8')
    await settleAll(complete('v8', new Uint8Array([0xff, 0xfe])))
    expect(tab()?.edit).toMatchObject({ base: 'a\n', baseVersion: 'v7', externalVersion: 'v8' })
  })

  it('flags the reported version when its refresh read turns binary', async () => {
    const { face, settleAll, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\n'))
    face.refreshEdit(TAB_1, FILE, controller.signal, 'v8')
    await settleAll(complete('v8', new TextEncoder().encode('a\0b\n')))
    expect(tab()?.edit).toMatchObject({ base: 'a\n', baseVersion: 'v7', externalVersion: 'v8' })
  })

  it('ignores a binary refresh read whose settlement carried no version', async () => {
    const { face, settleAll, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\n'))
    face.refreshEdit(TAB_1, FILE, controller.signal)
    await settleAll(complete('v8', new TextEncoder().encode('a\0b\n')))
    expect(tab()?.edit).toMatchObject({ base: 'a\n', baseVersion: 'v7', externalVersion: undefined })
  })

  it('drops an edit-open read that settles after its record ended', async () => {
    const { face, settleAll, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    controller.abort()
    await settleAll(completeText('v7', 'a\nb\n'))
    expect(tab()).toBeUndefined()
  })

  it('never writes for a save whose record already ended', async () => {
    const { face, write, settleAll } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    const ended = new AbortController()
    ended.abort()
    face.saveEdit(TAB_1, FILE, 'mine\n', 'v7', ended.signal)
    expect(write).not.toHaveBeenCalled()
  })

  it('drops a write that settles after its record ended', async () => {
    const { face, settleAll, settleWrite, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    face.saveEdit(TAB_1, FILE, 'mine\n', 'v7', controller.signal)
    controller.abort()
    await settleWrite(writeOk('v8'))
    expect(tab()).toBeUndefined()
  })

  it('drops a write settling onto a session that no longer owns it', async () => {
    const { face, instance, settleAll, settleWrite, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    face.saveEdit(TAB_1, FILE, 'mine\n', 'v7', controller.signal)
    // The write is still out when the reader cancels and the body re-opens:
    // the settle belongs to the discarded session and must not rebase this one.
    instance.actions.editCancelled(TAB_1)
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v9', 'fresh\n'), 3)
    await settleWrite(writeOk('v8'))
    expect(tab()?.edit).toMatchObject({ base: 'fresh\n', baseVersion: 'v9', saving: false })
  })

  it('saves the draft under its base version and rebases the session on what landed', async () => {
    const { face, read, write, settleAll, settleWrite, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    face.saveEdit(TAB_1, FILE, 'a\nchanged\n', 'v7', controller.signal)
    expect(write).toHaveBeenCalledExactlyOnceWith(FILE.sessionId, FILE.path,
      { text: 'a\nchanged\n', expectedVersion: 'v7' }, controller.signal)
    expect(tab()?.edit?.saving).toBe(true)
    await settleWrite(writeOk('v8'))
    // The session stays open, rebased on the post-write version — the editable
    // surface is the file's presentation, not a mode the write exits.
    expect(tab()?.edit).toMatchObject({ base: 'a\nchanged\n', baseVersion: 'v8', saving: false })
    // The write's version stays out of the paged trackers: no page holds it,
    // so the version the pages were read at must keep standing.
    expect(tab()?.version).toBeUndefined()
    expect(read).not.toHaveBeenCalled()
  })

  it('arms the conflict with the fresh disk content when the write meets a changed file', async () => {
    const { face, instance, settleAll, settleWrite, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    instance.actions.editDraft(TAB_1, 'mine\n')
    face.saveEdit(TAB_1, FILE, 'mine\n', 'v7', controller.signal)
    await settleWrite(stale)
    // The refused write triggers a fresh complete read for the conflict view.
    await settleAll(completeText('v9', 'theirs\n'))
    expect(tab()?.edit?.saving).toBe(false)
    expect(tab()?.edit?.conflict).toMatchObject({ mine: 'mine\n', theirs: 'theirs\n', version: 'v9' })
    expect(tab()?.edit?.draft).toBe('mine\n')
  })

  it('re-arms the conflict when the merge save meets another disk change', async () => {
    const { face, instance, settleAll, settleWrite, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    instance.actions.editDraft(TAB_1, 'mine\n')
    face.saveEdit(TAB_1, FILE, 'mine\n', 'v7', controller.signal)
    await settleWrite(stale)
    await settleAll(completeText('v9', 'theirs\n'))
    // The merged buffer is guarded by the conflict's fresh version; a second
    // stale refusal re-reads and re-arms against the newest disk content.
    face.saveEdit(TAB_1, FILE, 'merged\n', 'v9', controller.signal)
    await settleWrite(stale)
    await settleAll(completeText('v10', 'newer\n'))
    expect(tab()?.edit?.saving).toBe(false)
    expect(tab()?.edit?.conflict).toMatchObject({ mine: 'merged\n', theirs: 'newer\n', version: 'v10' })
    expect(tab()?.edit?.draft).toBe('mine\n')
  })

  it('drops a conflict re-read that settles after its record ended', async () => {
    const { face, settleAll, settleWrite, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    face.saveEdit(TAB_1, FILE, 'mine\n', 'v7', controller.signal)
    await settleWrite(stale)
    controller.abort()
    await settleAll(completeText('v9', 'theirs\n'))
    expect(tab()).toBeUndefined()
  })

  it('reports a failed conflict re-read on the open edit session', async () => {
    const { face, settleAll, settleAllWire, settleWrite, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    face.saveEdit(TAB_1, FILE, 'mine\n', 'v7', controller.signal)
    await settleWrite(stale)
    await settleAllWire(bytesFailure())
    expect(tab()?.edit?.saving).toBe(false)
    expect(tab()?.edit?.conflict).toBeUndefined()
    expect(tab()?.edit?.failure?.code).toBe('workspace-file/outside-workspace')
  })

  it('reports an undecodable conflict re-read on the open edit session', async () => {
    const { face, settleAll, settleWrite, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    face.saveEdit(TAB_1, FILE, 'mine\n', 'v7', controller.signal)
    await settleWrite(stale)
    await settleAll(complete('v9', new Uint8Array([0xff, 0xfe])))
    expect(tab()?.edit?.saving).toBe(false)
    expect(tab()?.edit?.failure?.code).toBe('workspace-file/not-text')
  })

  it('reports a conflict re-read that turns binary on the open edit session', async () => {
    const { face, settleAll, settleWrite, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    face.saveEdit(TAB_1, FILE, 'mine\n', 'v7', controller.signal)
    await settleWrite(stale)
    await settleAll(complete('v9', new TextEncoder().encode('a\0b\n')))
    expect(tab()?.edit?.saving).toBe(false)
    expect(tab()?.edit?.conflict).toBeUndefined()
    expect(tab()?.edit?.failure?.code).toBe('workspace-file/not-text')
  })

  it('records a non-conflict write failure on the open edit session', async () => {
    const { face, settleAll, settleWrite, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    face.saveEdit(TAB_1, FILE, 'mine\n', 'v7', controller.signal)
    await settleWrite({
      ok: false,
      error: {
        name: 'RemoteError', isDSHRemoteError: true,
        code: 'workspace-file/write-failed', message: 'denied', details: { path: PATH },
      },
    })
    expect(tab()?.edit?.saving).toBe(false)
    expect(tab()?.edit?.conflict).toBeUndefined()
    expect(tab()?.edit?.failure?.code).toBe('workspace-file/write-failed')
  })

  it('reports a write whose call rejects instead of settling', async () => {
    const { face, settleAll, write, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    write.mockRejectedValueOnce('connection lost')
    face.saveEdit(TAB_1, FILE, 'mine\n', 'v7', controller.signal)
    await vi.waitFor(() => { expect(tab()?.edit?.saving).toBe(false) })
    expect(tab()?.edit?.conflict).toBeUndefined()
    expect(tab()?.edit?.failure?.code).toBe('gateway/internal')
    expect(tab()?.edit?.failure?.message).toBe('connection lost')
  })

  it('reports a write whose call throws before answering', async () => {
    const { face, settleAll, write, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    write.mockImplementationOnce(() => { throw new TypeError('remote.workspaceFiles.write is not a function') })
    face.saveEdit(TAB_1, FILE, 'mine\n', 'v7', controller.signal)
    await vi.waitFor(() => { expect(tab()?.edit?.saving).toBe(false) })
    expect(tab()?.edit?.failure?.code).toBe('gateway/internal')
    expect(tab()?.edit?.failure?.message).toContain('write is not a function')
  })

  it('reports a write whose rejection value resists stringification', async () => {
    const { face, settleAll, write, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    write.mockRejectedValueOnce(Object.create(null) as Error)
    face.saveEdit(TAB_1, FILE, 'mine\n', 'v7', controller.signal)
    await vi.waitFor(() => { expect(tab()?.edit?.saving).toBe(false) })
    expect(tab()?.edit?.failure?.code).toBe('gateway/internal')
    expect(tab()?.edit?.failure?.message).toBe('remote call failed')
  })

  it('reports a conflict re-read that rejects on the open edit session', async () => {
    const { face, settleAll, settleWrite, bytes, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    face.saveEdit(TAB_1, FILE, 'mine\n', 'v7', controller.signal)
    // The stale write's settlement issues the re-read; it must already reject
    // when the write resolves, so arm it first.
    bytes.mockRejectedValueOnce(new Error('connection lost'))
    await settleWrite({
      ok: false,
      error: {
        name: 'RemoteError', isDSHRemoteError: true,
        code: 'workspace-file/stale-version', message: 'changed', details: { path: PATH },
      },
    })
    await vi.waitFor(() => { expect(tab()?.edit?.failure?.code).toBe('gateway/internal') })
    expect(tab()?.edit?.saving).toBe(false)
  })

  it('records a rejected page read as a failure instead of loading forever', async () => {
    const { face, read, tab } = bench()
    read.mockRejectedValueOnce(new Error('offline'))
    face.loadPage(TAB_1, FILE, 1, new AbortController().signal)
    await vi.waitFor(() => { expect(tab()?.failure?.code).toBe('gateway/internal') })
    expect(tab()?.loading).toBe(false)
  })

  it('records a rejected complete read as a failure instead of loading forever', async () => {
    const { face, bytes, tab } = bench()
    bytes.mockRejectedValueOnce(new Error('offline'))
    face.loadAll(TAB_1, FILE, new AbortController().signal)
    await vi.waitFor(() => { expect(tab()?.failure?.code).toBe('gateway/internal') })
    expect(tab()?.loading).toBe(false)
  })

  it('drops a rejected page read that a reload retired', async () => {
    const { face, read, settle, tab } = bench()
    const controller = new AbortController()
    read.mockImplementationOnce(() => Promise.reject(new Error('stale carrier')))
    face.loadPage(TAB_1, FILE, 1, controller.signal)
    face.reloadPages(TAB_1, FILE, controller.signal)
    await settle(page(1, ['fresh'], false))
    await Promise.resolve().then(() => Promise.resolve())
    expect(tab()?.failure).toBeUndefined()
    expect(tab()?.pages[1]?.text).toBe('fresh')
  })

  it('records a rejected edit open as unavailable and frees the in-flight guard', async () => {
    const { face, bytes, settleAll, tab } = bench()
    const controller = new AbortController()
    bytes.mockRejectedValueOnce(new Error('offline'))
    face.startEdit(TAB_1, FILE, controller.signal)
    await vi.waitFor(() => { expect(tab()?.editUnavailable).toBe(true) })
    expect(bytes).toHaveBeenCalledTimes(1)
    face.startEdit(TAB_1, FILE, controller.signal)
    expect(bytes).toHaveBeenCalledTimes(2)
    await settleAll(completeText('v7', 'a\nb\n'))
    expect(tab()?.edit?.draft).toBe('a\nb\n')
  })

  it('drops read rejections arriving after the record ended', async () => {
    const { face, read, bytes, tab } = bench()
    const controller = new AbortController()
    read.mockImplementationOnce(() => Promise.reject(new Error('gone')))
    bytes.mockImplementationOnce(() => Promise.reject(new Error('gone')))
    bytes.mockImplementationOnce(() => Promise.reject(new Error('gone')))
    face.loadPage(TAB_1, FILE, 1, controller.signal)
    face.loadAll(TAB_1, FILE, controller.signal)
    face.startEdit(TAB_1, FILE, controller.signal)
    controller.abort()
    await Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve())
    expect(tab()).toBeUndefined()
  })

  it('drops save and refresh rejections arriving after the record ended', async () => {
    const { face, bytes, write, settleAll, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    write.mockImplementationOnce(() => Promise.reject(new Error('gone')))
    bytes.mockImplementationOnce(() => Promise.reject(new Error('gone')))
    face.saveEdit(TAB_1, FILE, 'mine\n', 'v7', controller.signal)
    face.refreshEdit(TAB_1, FILE, controller.signal, 'v2')
    controller.abort()
    await Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve())
    expect(tab()).toBeUndefined()
  })

  it('forgets the edit session with the tab when its record ends mid-edit', async () => {
    const { face, settleAll, tab } = bench()
    const controller = new AbortController()
    face.startEdit(TAB_1, FILE, controller.signal)
    await settleAll(completeText('v7', 'a\nb\n'))
    controller.abort()
    expect(tab()).toBeUndefined()
  })
})
