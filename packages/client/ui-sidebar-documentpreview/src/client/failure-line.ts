/**
 * The failure line one Remote code deserves.
 *
 * Kept apart from the component so the mapping is testable on its own. Codes
 * this reader does not name fall to the generic line carrying the carrier's
 * message.
 */
import type { RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'

/** Render a byte count the way a person reads one. */
function humanBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

/**
 * Say what went wrong, in terms of the file rather than of the transport.
 * @param t - namespace-bound translate.
 * @param failure - the settled Remote failure.
 * @param operation - which operation failed; `'write'` words unmapped codes
 *   as a save failure instead of the default read wording.
 * @returns the line to show for the failure — in place of the file, or beside the editor's own controls.
 */
export function failureLine(t: TranslateNS<'sidebarDocumentPreview'>, failure: RemoteFailure, operation?: 'write'): string {
  switch (failure.code) {
    case 'workspace-file/not-found': return t('error.notFound')
    case 'workspace-file/too-large':
      return operation === 'write'
        ? t('error.tooLargeWrite', { limit: humanBytes(failure.details.limit) })
        : t('error.tooLarge', { limit: humanBytes(failure.details.limit) })
    case 'workspace-file/not-text': return t('error.notText')
    case 'workspace-file/not-regular-file': return t('error.notRegularFile')
    case 'workspace-file/write-failed': return t('error.writeFailed', { message: failure.message })
    case 'workspace-file/stale-version': return t('error.staleVersion')
    // Carrier and unclassified host failures reach the reader as themselves:
    // this panel knows nothing useful to add to a transport-level message.
    default:
      return operation === 'write'
        ? t('error.writeFailed', { message: failure.message })
        : t('error.unavailable', { message: failure.message })
  }
}
