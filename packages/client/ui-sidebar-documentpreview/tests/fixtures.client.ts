/**
 * Shared harness for the body specs: a real store instance, a real face over a
 * scripted paged read, a scripted `useResource`, and the owner props a tab
 * record carries.
 *
 * The framework's standard kit is replaced by the few members these components
 * read, behind one documented cast, so the specs exercise the components and
 * not the slot runtime.
 */
import { onTestFinished, vi } from 'vitest'
import type { Mock } from 'vitest'
import { act } from '@testing-library/react'
import { createElement, useSyncExternalStore } from 'react'
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { ResourceSnapshot } from '@deepseek-ai/dsh-client-resources/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceFileStat, WorkspaceFileText, WorkspaceFileWriteResult } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { TextPreviewProps } from '../src/client/TextPreview.tsx'
import { textFace } from '../src/client/face.ts'
import type { TextInjected } from '../src/client/face.ts'
import type { ReadDocumentBytes, ReadWorkspaceFilePage, SessionFile, WriteWorkspaceFile } from '../src/client/rpc.ts'
import { createTextStore } from '../src/client/store.ts'
import type { TextStore } from '../src/client/store.ts'
import type { DocumentPreviewProps } from '../src/client/document/contract.ts'
import { TextBody } from '../src/client/text/TextBody.tsx'
import { textBodyDefinition } from '../src/client/text/index.ts'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'

export const TAB_ID = 'tab-1' as TabId
export const SESSION = 's-1' as SessionId
/** The path relative to the session's workspace root, as the Host receives it. */
export const PATH = 'work/notes.md'
export const ABSOLUTE_PATH = '/host/project/work/notes.md'
/** The tab's address: the file under this session's scope. */
export const ADDRESS = 'dsh-resource://file/session/s-1/work/notes.md'
/** What the address names, as the face receives it. */
export const FILE: SessionFile = { sessionId: SESSION, path: PATH }

/** One page the Host would return: the lines joined without a terminator, and their count. */
export function page(offset: number, lines: readonly string[], eof: boolean, version = 'v1'): RemoteResult<WorkspaceFileText> {
  return { ok: true, value: { absolutePath: ABSOLUTE_PATH, version, offset, text: lines.join('\n'), lines: lines.length, eof, bytes: 100 } }
}

/** One failed page read. */
export function failure(code: string, details: Record<string, unknown> = {}): RemoteResult<WorkspaceFileText> {
  return { ok: false, error: { code, message: 'boom', details } as unknown as RemoteFailure }
}

/** A complete read's wire result carrying UTF-8 text. */
export function completeTextWire(version: string, text: string) {
  const bytes = new TextEncoder().encode(text)
  return {
    ok: true as const,
    value: {
      absolutePath: ABSOLUTE_PATH, version, offset: 0, eof: true,
      data: btoa(String.fromCharCode(...bytes)), bytes: bytes.byteLength,
    },
  }
}

/** One failed complete read. */
export function bytesFailure(code = 'workspace-file/outside-workspace'): RemoteResult<never> {
  return {
    ok: false,
    error: {
      name: 'RemoteError', isDSHRemoteError: true, code, message: 'boom', details: { path: ABSOLUTE_PATH },
    } as unknown as RemoteFailure,
  }
}

/** A guarded write's success. */
export function writeOk(version: string): RemoteResult<WorkspaceFileWriteResult> {
  return { ok: true, value: { absolutePath: ABSOLUTE_PATH, version, operation: 'update' } }
}

/** A guarded write refused for a concurrent change. */
export const staleWrite: RemoteResult<WorkspaceFileWriteResult> = {
  ok: false,
  error: {
    name: 'RemoteError', isDSHRemoteError: true,
    code: 'workspace-file/stale-version', message: 'changed since the loaded version', details: { path: PATH },
  },
}

/** The `file` resource's metadata: live, or failed beside the last live value. */
function meta(
  version: string | undefined, failure: RemoteFailure | undefined,
): ResourceSnapshot<WorkspaceFileStat> {
  const value = version === undefined ? undefined : { absolutePath: ABSOLUTE_PATH, version, bytes: 100 }
  return failure === undefined
    ? { status: version === undefined ? 'loading' : 'live', value, failure: undefined }
    : { status: 'failed', value, failure }
}

/** Test-local selector hook over a framework-neutral store instance. */
function hookOf<T>(inst: { subscribe: (fn: () => void) => () => void; getSnapshot: () => T }) {
  return function useSelector<S>(sel: (s: T) => S): S {
    return sel(useSyncExternalStore(inst.subscribe, inst.getSnapshot))
  }
}

/** Key-echoing translate that also shows its parameters. */
export function t(key: string, params?: Record<string, unknown>): string {
  return params === undefined ? key : `${key}(${Object.entries(params).map(([k, v]) => `${k}=${String(v)}`).join(',')})`
}

/** Flush page reads that resolved since the last render, then React's work. */
export async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** What one tab record's harness hands a spec. Named so the helper's declaration stays portable. */
export interface Harness {
  /** The live store instance both components read. */
  instance: ReturnType<TextStore['create']>
  /** The face bound to the scripted read. */
  face: TextInjected
  /** The scripted paged read. */
  read: Mock<ReadWorkspaceFilePage>
  /** The complete byte reader. */
  bytes: Mock<ReadDocumentBytes>
  /** The guarded write. */
  write: Mock<WriteWorkspaceFile>
  /** The tab record's lifetime. */
  controller: AbortController
  /** Current file metadata. */
  readonly file: WorkspaceFileStat | undefined
  /** The scripted `useResource`. */
  useResource: Mock<() => ResourceSnapshot<WorkspaceFileStat>>
  /** Composed props for one navigation state. */
  props: (navigation?: { params?: unknown; revision: number }) => TextPreviewProps
  /** Script what one offset resolves to from now on. */
  script(offset: number, result: RemoteResult<WorkspaceFileText>): void
  /** Publish another metadata version without acknowledging any tab's content. */
  setVersion(version: string | undefined): void
  /** Script the next render's `useResource` as failed with `failure`, or live again with `undefined`. */
  setFailure(failure: RemoteFailure | undefined): void
}

/**
 * One tab record's harness.
 * @param script - the page each offset resolves to; an unscripted offset fails `not-found`.
 * @param tabId - owning tab record.
 * @param editable - whether the supplied viewer opts into editing; `false` the read-only preview, `true` the edit surface.
 * @returns the store, the scripted faces, and a props builder.
 */
export function harness(
  script: Record<number, RemoteResult<WorkspaceFileText>> = {}, tabId = TAB_ID, editable = false,
): Harness {
  const instance = createTextStore().create()
  const pages: Record<number, RemoteResult<WorkspaceFileText>> = { ...script }
  const read = vi.fn<ReadWorkspaceFilePage>((_session, _path, offset) =>
    Promise.resolve(pages[offset] ?? failure('workspace-file/not-found', { path: PATH })))
  const bytes = vi.fn<ReadDocumentBytes>()
  const write = vi.fn<WriteWorkspaceFile>()
  const face = textFace(read, bytes, write)(SESSION, instance.actions)
  const current = { version: 'v1' as string | undefined, failure: undefined as RemoteFailure | undefined, snapshot: meta('v1', undefined) }
  const refresh = (): void => { current.snapshot = meta(current.version, current.failure) }
  const useResource = vi.fn<() => ResourceSnapshot<WorkspaceFileStat>>(() => current.snapshot)
  const controller = new AbortController()
  onTestFinished(() => { controller.abort() })
  const tabActions = { openResource: vi.fn(), openTab: vi.fn(), close: vi.fn(), replace: vi.fn() }
  const definitions = [{ ...textBodyDefinition(() => t('viewer.text')), editable }]
  const renderSlot: TextPreviewProps['renderSlot'] = (_key, owner, opts) => createElement(TextBody, {
    ...owner, useTabInfo: opts.hookContext, sessionId: SESSION, useResource,
  } as unknown as DocumentPreviewProps)
  const props = (navigation: { params?: unknown; revision: number } = { revision: 1 }) => ({
    useTabInfo: () => ({
      sidebar: { expanded: true, fullscreen: false },
      panel: { id: 'pane-1' },
      tab: {
        id: tabId, kind: 'text', contentId: ADDRESS, title: 'notes.md', visible: true,
        navigation: { address: ADDRESS, params: navigation.params, revision: navigation.revision },
        signal: controller.signal,
        actions: tabActions,
      },
    }),
    sessionId: SESSION,
    useResource,
    useStore: hookOf(instance),
    actions: instance.actions,
    loadPage: face.loadPage,
    reloadPages: face.reloadPages,
    loadAll: face.loadAll,
    reloadAll: face.reloadAll,
    startEdit: face.startEdit,
    refreshEdit: face.refreshEdit,
    saveEdit: face.saveEdit,
    useDocumentPreviews: () => definitions,
    renderSlot,
    t,
  }) as unknown as TextPreviewProps
  return {
    instance,
    face,
    read,
    bytes,
    write,
    controller,
    get file() { return current.snapshot.value },
    useResource,
    props,
    script(offset, result) { pages[offset] = result },
    setVersion(version) { current.version = version; refresh() },
    setFailure(failure) { current.failure = failure; refresh() },
  }
}
