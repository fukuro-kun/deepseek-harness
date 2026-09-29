/**
 * The preview's asynchronous half: reading pages into the store.
 *
 * The component never awaits anything. It asks for a page and this face performs
 * the read and writes the outcome through the store's own actions — the
 * Slot-standard `inject` form, so the write set stays the store's. The session
 * the read runs under comes from the file's address, not from the slot's
 * session: the address is the read's whole authority.
 *
 * A tab's pages are one file version walked from the first line. Dropping them
 * — a reload, or a page of a newer version arriving past the first line, which
 * restarts the walk — retires every read still in flight for the tab: a
 * settlement from before the drop writes nothing. Cleanup rides the owner's
 * `signal`, armed once per tab by its first read: the abort forgets the tab's
 * bucket and this bookkeeping, a request is not made for a record that already
 * ended, and a settlement arriving after the record is gone has nothing left to
 * write to. A tab that never read has no bucket to forget.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-store'
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ReadDocumentBytes, ReadWorkspaceFilePage, SessionFile, WriteWorkspaceFile } from './rpc.ts'
import { documentFileBytes, documentFileText } from './rpc.ts'
import type { TextStore } from './store.ts'
import type { DocumentLoadMode } from './document/registry.ts'

/** The preview's injected business face, as the body receives it. */
export interface TextInjected {
  /**
   * Read one page into the store. A page of a newer file version than the pages
   * held, arriving past the first line, is not kept: the tab's pages are dropped
   * and the first page read again. The tab's first read arms the abort listener
   * that forgets its bucket when the record ends.
   * @param tabId - the tab being drawn.
   * @param file - the session and workspace path the tab's address names.
   * @param offset - 1-based line the page starts at.
   * @param signal - the tab record's lifetime.
   * @param observedVersion - metadata version observed at read start.
   */
  readonly loadPage: (tabId: TabId, file: SessionFile, offset: number, signal: AbortSignal, observedVersion?: string) => void
  /**
   * Drop every page and read the first one again, for a file the Host reports
   * changed. The view is kept, so the reader stays where they were; a page read
   * still in flight writes nothing when it settles.
   * @param tabId - the tab being drawn.
   * @param file - the session and workspace path the tab's address names.
   * @param signal - the tab record's lifetime.
   * @param observedVersion - metadata version observed at read start.
   */
  readonly reloadPages: (tabId: TabId, file: SessionFile, signal: AbortSignal, observedVersion?: string) => void
  /**
   * Read the complete file for a whole-file renderer.
   * @param tabId - owning tab.
   * @param file - the session and workspace path the tab's address names.
   * @param signal - tab lifetime.
   * @param observedVersion - metadata version observed at read start.
   */
  readonly loadAll: (tabId: TabId, file: SessionFile, signal: AbortSignal, observedVersion?: string) => void
  /**
   * Discard the old complete result and read again.
   * @param tabId - owning tab.
   * @param file - the session and workspace path the tab's address names.
   * @param signal - tab lifetime.
   * @param observedVersion - metadata version observed at read start.
   */
  readonly reloadAll: (tabId: TabId, file: SessionFile, signal: AbortSignal, observedVersion?: string) => void
  /**
   * Open an edit session on the file: reads it whole, decodes UTF-8, and arms
   * the draft. Non-text or oversized files fail instead of editing.
   * @param tabId - the tab starting to edit.
   * @param file - the session and workspace path the tab's address names.
   * @param signal - the tab record's lifetime.
   */
  readonly startEdit: (tabId: TabId, file: SessionFile, signal: AbortSignal) => void
  /**
   * Re-read the file an open edit session sits on, after the Host reported it
   * changed. A clean buffer adopts the fresh text; a dirty one keeps editing
   * and only records the newer version — the guarded write resolves it.
   * @param tabId - the tab whose edit session refreshes.
   * @param file - the session and workspace path the tab's address names.
   * @param signal - the tab record's lifetime.
   * @param observedVersion - the metadata version that reported the change; a
   *   failed, rejected, undecodable, or epoch-retired read still flags it, so
   *   the buffer tells the reader it no longer holds the file's current text.
   */
  readonly refreshEdit: (tabId: TabId, file: SessionFile, signal: AbortSignal, observedVersion?: string) => void
  /**
   * Write the draft back, guarded by the version it was read at. A refused
   * write arms the conflict state with the fresh disk content; any other
   * failure lands on the edit session.
   * @param tabId - the tab being saved.
   * @param file - the session and workspace path the tab's address names.
   * @param text - the buffer to write — the draft, or the merged conflict result.
   * @param expectedVersion - the freshness token the write guards on.
   * @param signal - the tab record's lifetime.
   */
  readonly saveEdit: (tabId: TabId, file: SessionFile, text: string, expectedVersion: string, signal: AbortSignal) => void
}

/**
 * What the face remembers of one tab: the read generation a settlement must
 * match, and the version of the pages held. Created by the tab's first read,
 * which also arms the one abort listener that forgets the tab.
 */
interface TabReads {
  generation: number
  version: string | undefined
  mode: DocumentLoadMode
  /** An edit-session read is out; a second request returns without reading again. */
  editInFlight: boolean
  /**
   * The refresh epoch: `refreshEdit` issues under the next value, and
   * `saveEdit`/`startEdit` bump it to retire reads they supersede. Only a
   * settlement matching the current value may adopt its result.
   */
  refreshSeq: number
  /**
   * The seq of the latest issued refresh read, or `0` after its settlement
   * ran. A dropped settlement whose seq still matches was retired by an epoch
   * bump, not by a successor — the frame it answered was never processed.
   */
  refreshPending: number
}

/**
 * Bind the preview's face to one paged read and one complete-byte read.
 * @param read - the bound `workspaceFiles.read` call.
 * @param readAll - ordinary complete-byte Remote read.
 * @param write - the bound `workspaceFiles.write` call the human edit flow guards with the loaded version.
 * @returns the Slot `inject` factory: bound actions in, face out. The slot's session id is unused because the address carries its own.
 */
export function textFace(
  read: ReadWorkspaceFilePage,
  readAll: ReadDocumentBytes,
  write: WriteWorkspaceFile,
): (sessionId: SessionId, actions: BoundActions<TextStore>) => TextInjected {
  return (_sessionId: SessionId, actions: BoundActions<TextStore>): TextInjected => {
    const tabs = new Map<TabId, TabReads>()
    // Reached with a live signal only: the record's end forgets the tab's
    // bucket and this bookkeeping in one listener, however often its body mounts.
    const readsOf = (tabId: TabId, signal: AbortSignal): TabReads => {
      const held = tabs.get(tabId)
      if (held !== undefined) return held
      const created: TabReads = { generation: 0, version: undefined, mode: 'text-pages', editInFlight: false, refreshSeq: 0, refreshPending: 0 }
      tabs.set(tabId, created)
      signal.addEventListener('abort', () => {
        tabs.delete(tabId)
        actions.forget(tabId)
      }, { once: true })
      return created
    }
    const modeOf = (tabId: TabId, signal: AbortSignal, mode: DocumentLoadMode): TabReads => {
      const reads = readsOf(tabId, signal)
      if (reads.mode !== mode) {
        reads.mode = mode
        reads.generation++
        reads.version = undefined
        actions.reset(tabId)
      }
      return reads
    }
    const loadPage = (tabId: TabId, file: SessionFile, offset: number, signal: AbortSignal, observedVersion?: string): void => {
      if (signal.aborted) return
      const reads = modeOf(tabId, signal, 'text-pages')
      const { generation } = reads
      actions.loading(tabId, 'text-pages', observedVersion)
      void calling(() => read(file.sessionId, file.path, offset, signal)).then((result) => {
        if (signal.aborted || reads.generation !== generation) return
        if (!result.ok) {
          actions.failed(tabId, result.error)
          return
        }
        // Pages of two versions never meet: a newer file past the first line
        // restarts the walk from line 1, where the store adopts the new version.
        if (offset !== 1 && reads.version !== undefined && result.value.version !== reads.version) {
          restart(tabId, file, signal, observedVersion)
          return
        }
        reads.version = result.value.version
        actions.page(tabId, result.value)
      }, (error: unknown) => {
        if (signal.aborted || reads.generation !== generation) return
        actions.failed(tabId, carrierFailure(error))
      })
    }
    const loadAll = (tabId: TabId, file: SessionFile, signal: AbortSignal, observedVersion?: string): void => {
      if (signal.aborted) return
      const reads = modeOf(tabId, signal, 'bytes-complete')
      const { generation } = reads
      actions.loading(tabId, 'bytes-complete', observedVersion)
      void calling(() => readAll(file, signal)).then((result) => {
        if (signal.aborted || reads.generation !== generation) return
        if (!result.ok) {
          actions.failed(tabId, result.error)
          return
        }
        let file
        try {
          file = documentFileBytes(result.value)
        } catch (error) {
          actions.failed(tabId, Object.assign(
            new Error('document file byte response has malformed base64 data', { cause: error }),
            { name: 'RemoteError', isDSHRemoteError: true as const, code: 'gateway/internal' as const, details: {} },
          ))
          return
        }
        reads.version = file.version
        actions.complete(tabId, file)
      }, (error: unknown) => {
        if (signal.aborted || reads.generation !== generation) return
        actions.failed(tabId, carrierFailure(error))
      })
    }
    const restart = (
      tabId: TabId, file: SessionFile, signal: AbortSignal, observedVersion?: string, mode: DocumentLoadMode = 'text-pages',
    ): void => {
      if (signal.aborted) return
      const reads = readsOf(tabId, signal)
      reads.generation += 1
      reads.version = undefined
      actions.reset(tabId)
      if (mode === 'text-pages') loadPage(tabId, file, 1, signal, observedVersion)
      else loadAll(tabId, file, signal, observedVersion)
    }
    const startEdit = (tabId: TabId, file: SessionFile, signal: AbortSignal): void => {
      if (signal.aborted) return
      const reads = readsOf(tabId, signal)
      if (reads.editInFlight) return
      reads.editInFlight = true
      // Reopening epochs refreshes the same way a write does: a refresh issued
      // before this open must not adopt older content into the fresh session.
      ++reads.refreshSeq
      void calling(() => readAll(file, signal)).then((result) => {
        reads.editInFlight = false
        if (signal.aborted) return
        if (!result.ok) {
          actions.editFailed(tabId)
          return
        }
        let text: string
        try {
          text = documentFileText(result.value)
        } catch {
          actions.editFailed(tabId)
          return
        }
        if (text.includes('\0')) {
          actions.editFailed(tabId)
          return
        }
        actions.editStarted(tabId, text, result.value.version)
      }, () => {
        reads.editInFlight = false
        if (signal.aborted) return
        actions.editFailed(tabId)
      })
    }
    const refreshEdit = (tabId: TabId, file: SessionFile, signal: AbortSignal, observedVersion?: string): void => {
      if (signal.aborted) return
      const reads = readsOf(tabId, signal)
      // Two reported changes can overlap reads; only the last issued refresh
      // may adopt — an earlier settlement landing later would regress the file.
      const seq = ++reads.refreshSeq
      reads.refreshPending = seq
      const missed = (): void => {
        if (signal.aborted) return
        if (reads.refreshSeq !== seq) {
          // A save or reopen epoch retired this read with no successor: the
          // frame it answered was consumed but never processed — flag it.
          if (reads.refreshPending === seq) {
            reads.refreshPending = 0
            if (observedVersion !== undefined) actions.editRefreshMissed(tabId, observedVersion)
          }
          return
        }
        reads.refreshPending = 0
        if (observedVersion !== undefined) actions.editRefreshMissed(tabId, observedVersion)
      }
      void calling(() => readAll(file, signal)).then((result) => {
        if (!result.ok || signal.aborted || reads.refreshSeq !== seq) {
          missed()
          return
        }
        reads.refreshPending = 0
        let text: string
        try {
          text = documentFileText(result.value)
        } catch {
          if (observedVersion !== undefined) actions.editRefreshMissed(tabId, observedVersion)
          return
        }
        if (text.includes('\0')) {
          if (observedVersion !== undefined) actions.editRefreshMissed(tabId, observedVersion)
          return
        }
        actions.editRefreshed(tabId, text, result.value.version)
      }, missed)
    }
    const saveEdit = (tabId: TabId, file: SessionFile, text: string, expectedVersion: string, signal: AbortSignal): void => {
      if (signal.aborted) return
      const reads = readsOf(tabId, signal)
      // A write epochs refreshes: a read issued before the save must not adopt
      // pre-write content over what the write just landed.
      ++reads.refreshSeq
      actions.saveStarted(tabId)
      const saveRejected = (error: unknown): void => {
        if (signal.aborted) return
        actions.saveFailed(tabId, carrierFailure(error))
      }
      void calling(() => write(file.sessionId, file.path, { text, expectedVersion }, signal)).then((result) => {
        if (signal.aborted) return
        if (result.ok) {
          actions.saved(tabId, result.value.version, text)
          return
        }
        if (result.error.code !== 'workspace-file/stale-version') {
          actions.saveFailed(tabId, result.error)
          return
        }
        void calling(() => readAll(file, signal)).then((fresh) => {
          if (signal.aborted) return
          if (!fresh.ok) {
            actions.saveFailed(tabId, fresh.error)
            return
          }
          try {
            const freshText = documentFileText(fresh.value)
            if (freshText.includes('\0')) {
              actions.saveFailed(tabId, notTextFailure(file.path))
              return
            }
            actions.saveConflicted(tabId, text, freshText, fresh.value.version)
          } catch {
            actions.saveFailed(tabId, notTextFailure(file.path))
          }
        }, saveRejected)
      }, saveRejected)
    }
    return {
      loadPage, reloadPages: restart, loadAll,
      reloadAll: (tabId, file, signal, observedVersion) => { restart(tabId, file, signal, observedVersion, 'bytes-complete') },
      startEdit, refreshEdit, saveEdit,
    }
  }
}

/**
 * Run one Remote call so a throw inside its binding — an unmounted or
 * mistyped method — reaches the caller as the failure result it would
 * have shown anyway, instead of escaping the fire-and-forget call site.
 */
function calling<T>(call: () => Promise<RemoteResult<T>>): Promise<RemoteResult<T>> {
  try {
    return call()
  } catch (error) {
    return Promise.resolve({ ok: false, error: carrierFailure(error) })
  }
}

/**
 * Turn a thrown or rejected call into the failure its settlement reports.
 * Remote calls answer failures as results, so carrier-level faults — the
 * connection is gone, the method is not mounted — would otherwise leave a
 * `saving`/`loading`/`editInFlight` flag wedged forever.
 */
function carrierFailure(error: unknown): RemoteFailure {
  let message: string
  try {
    message = error instanceof Error ? error.message : String(error)
  } catch {
    message = 'remote call failed'
  }
  return Object.assign(
    new Error(message),
    {
      name: 'RemoteError', isDSHRemoteError: true as const,
      code: 'gateway/internal' as const, details: {},
    },
  )
}

/**
 * The file on disk turned out not to be text — the guarded-write flow reports
 * it through the same code the Host would have used, so the failure line
 * resolves localized instead of carrying a locally authored English message.
 */
function notTextFailure(path: string): RemoteFailure {
  return Object.assign(
    new Error('document file is not editable text'),
    {
      name: 'RemoteError', isDSHRemoteError: true as const,
      code: 'workspace-file/not-text' as const, details: { path },
    },
  )
}
