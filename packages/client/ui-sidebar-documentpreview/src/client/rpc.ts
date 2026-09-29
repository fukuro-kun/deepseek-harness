/**
 * The paged read this type performs, bound to the Client Remote.
 *
 * Content is the consumer's business: the `file` resource carries metadata only,
 * and the text arrives here one page of lines at a time. The endpoint takes a
 * session and a workspace path while a tab carries a `dsh-resource://file/`
 * session address, so this module also owns that translation.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  WorkspaceFileBytes,
  WorkspaceFileRange,
  WorkspaceFileText,
  WorkspaceFileWrite,
  WorkspaceFileWriteResult,
} from '@deepseek-ai/dsh-api-workspace-files/types'
import { parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path'

/** The slice of the Client Remote this package calls. */
export interface WorkspaceFilesReadRemote {
  readonly workspaceFiles: {
    /**
     * Read one page of lines.
     * @param sessionId - the session whose workspace resolves `path`.
     * @param path - workspace path, absolute or relative to the workspace root.
     * @param range - 1-based start line; the Host's page cap applies when `limit` is absent.
     * @param signal - cancels the call.
     * @returns the page, or the failure the Host declares.
     */
    read(
      sessionId: SessionId,
      path: string,
      range: WorkspaceFileRange,
      signal?: AbortSignal,
    ): Promise<RemoteResult<WorkspaceFileText>>
    /**
     * Read the complete file as bytes.
     * @param sessionId - the session whose workspace resolves `path`.
     * @param path - workspace path, absolute or relative to the workspace root.
     * @param signal - cancels the call.
     * @returns the whole file, or the failure the Host declares.
     */
    readAll(
      sessionId: SessionId,
      path: string,
      signal?: AbortSignal,
    ): Promise<RemoteResult<WorkspaceFileBytes>>
    /**
     * Replace the file's complete text, optionally guarded by a version token.
     * @param sessionId - the session whose workspace resolves `path`.
     * @param path - workspace path, absolute or relative to the workspace root.
     * @param edit - the new text and the optional freshness guard.
     * @param signal - cancels the call.
     * @returns the post-write identity, or the failure the Host declares.
     */
    write(
      sessionId: SessionId,
      path: string,
      edit: WorkspaceFileWrite,
      signal?: AbortSignal,
    ): Promise<RemoteResult<WorkspaceFileWriteResult>>
  }
}

/**
 * The read one page performs, injected so the face stays host-free.
 *
 * The session travels with the call because the endpoint resolves the workspace
 * root from it: the same path means different files in different sessions.
 * Endpoint failures arrive inside the result; only assembly faults (an
 * unmounted method, arity, a missing Context adapter) and a lost carrier
 * reject, so callers still settle a rejection.
 */
export type ReadWorkspaceFilePage = (
  sessionId: SessionId,
  path: string,
  offset: number,
  signal: AbortSignal,
) => Promise<RemoteResult<WorkspaceFileText>>

/** The file one tab reads: the session the read runs under and the path handed to the Host. */
export interface SessionFile {
  /** The Session whose workspace resolves relative paths. */
  readonly sessionId: SessionId
  /** The path the Host receives, absolute or relative to the addressed Session's workspace. */
  readonly path: string
}

/**
 * The session and path one `dsh-resource://file/…` address names.
 *
 * A `session` address names its own session and a relative or absolute path, so
 * a tab addressed into another session reads from that session. An `absolute`
 * address carries no session and cannot be read here. The registry routes only
 * session-scoped `file` addresses to this type, so an address `parseFileAddress`
 * rejects or that carries no session is a programming error and throws.
 * @param address - a tab's `dsh-resource://file/…` address.
 * @returns the session and the path to hand the endpoint.
 */
export function hostFileOf(address: string): SessionFile {
  const parsed = parseFileAddress(address)
  if (parsed?.scope !== 'session') throw new Error(`ui-sidebar-documentpreview: not a session file address "${address}"`)
  // The address is a string boundary: its id segment is the Session id it names.
  return { sessionId: parsed.sessionId as SessionId, path: parsed.path }
}

/**
 * Bind the paged read to one Remote face. The page length is the Host's
 * configured cap, so no `limit` travels.
 * @param remote - the Client Remote carrying the `workspaceFiles` namespace.
 * @returns the read the face performs.
 */
export function createReadPage(remote: WorkspaceFilesReadRemote): ReadWorkspaceFilePage {
  return (sessionId, path, offset, signal) => remote.workspaceFiles.read(sessionId, path, { offset }, signal)
}

/**
 * The guarded write one save performs, injected so the face stays host-free.
 * Endpoint failures arrive inside the result; only assembly faults (an
 * unmounted method, arity, a missing Context adapter) and a lost carrier
 * reject, so callers still settle a rejection.
 */
export type WriteWorkspaceFile = (
  sessionId: SessionId,
  path: string,
  edit: WorkspaceFileWrite,
  signal: AbortSignal,
) => Promise<RemoteResult<WorkspaceFileWriteResult>>

/**
 * Bind the guarded write to one Remote face.
 * @param remote - the Client Remote carrying the `workspaceFiles` namespace.
 * @returns the write the face performs.
 */
export function createWriteFile(remote: WorkspaceFilesReadRemote): WriteWorkspaceFile {
  return (sessionId, path, edit, signal) => remote.workspaceFiles.write(sessionId, path, edit, signal)
}

/**
 * Decode a complete-file byte result into UTF-8 text; malformed input throws.
 * @param file - the complete-file read result carrying wire base64.
 * @returns the decoded text.
 */
export function documentFileText(file: WorkspaceFileBytes): string {
  const bytes = Uint8Array.from(atob(file.data), character => character.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

/** Complete document bytes borrowed read-only by renderers; copy before transferring to a Worker. */
export type DocumentFileBytes = Omit<WorkspaceFileBytes, 'data'> & { readonly data: Uint8Array<ArrayBuffer> }

/**
 * Read a complete file through the Host endpoint.
 * @param file - Session and path decoded from the tab address.
 * @param signal - owning tab lifetime.
 * @returns complete wire bytes, including declared failures.
 */
export type ReadDocumentBytes = (file: SessionFile, signal: AbortSignal) => Promise<RemoteResult<WorkspaceFileBytes>>

/**
 * Decode one successful Remote byte result for document renderers.
 * @param file - Host byte result with base64 data.
 * @returns the same metadata with native bytes; malformed base64 throws.
 */
export function documentFileBytes(file: WorkspaceFileBytes): DocumentFileBytes {
  return { ...file, data: Uint8Array.from(atob(file.data), character => character.charCodeAt(0)) }
}
