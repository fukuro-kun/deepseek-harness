/**
 * The text preview's body: a file's content, or the reason it is not showing.
 *
 * Two sources meet here. The standard `useResource` hook gives the file's
 * metadata — its version — and this type's own store holds the content it read
 * through its face. A Host-reported change applies at once: the preview
 * re-reads, an open clean edit buffer adopts the fresh text, and a dirty one
 * keeps its draft and records the newer version for the guarded write to
 * resolve. A failed metadata frame — the file gone, its workspace unknown —
 * takes the bar's place over the pages already loaded, with the same reload.
 * Renderers that opt into editing replace the read-only body with the file's
 * buffer outright: text opens editable, there is no edit mode to enter or
 * leave. The type's controls, viewer choice, wrap and reload, sit at the end of
 * the path row; the Sidebar's strip carries none of them.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import clsx from 'clsx'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { FileTypeIcon, IconRefreshOutline16, Menu, Tooltip, classifyFileType } from '@deepseek-ai/dsh-client-ui-primitives'
import { pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path'
import type { TextInjected } from './face.ts'
import { failureLine } from './failure-line.ts'
import { IconNowrapFill16, IconWrapFill16 } from './icons.tsx'
import { LoadingIndicator } from './LoadingIndicator.tsx'
import { hostFileOf } from './rpc.ts'
import type { TextStore } from './store.ts'
import type { DocumentContent } from './document/contract.ts'
import { matchingDocumentPreviews } from './document/registry.ts'
import type { DocumentPreviewDefinition } from './document/registry.ts'
import { PLAIN_BODY_ID } from './text/index.ts'
import { loadedPages, lastLineLoaded, scrollToLine } from './text/lines.ts'
import { EditorBody } from './edit/EditorBody.tsx'
import { mergeConflicts } from './edit/diff.ts'
import { languageForPath } from './code/languages.ts'
import css from './TextPreview.module.css'

export { linesOf, loadedPages, lastLineLoaded, scrollToLine } from './text/lines.ts'
export type { LoadedPage } from './text/lines.ts'

/** Keep the path fade in sync with whether its full text fits the header row. */
function usePathClipped(
  box: RefObject<HTMLDivElement | null>,
  text: RefObject<HTMLSpanElement | null>,
  path: string,
  shown: boolean,
): void {
  useLayoutEffect(() => {
    const outer = box.current
    const inner = text.current
    if (outer === null || inner === null) return undefined
    const apply = (): void => {
      if (inner.offsetWidth > outer.clientWidth) outer.dataset.textpreviewPathClipped = ''
      else delete outer.dataset.textpreviewPathClipped
    }
    apply()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(apply)
    observer?.observe(outer)
    observer?.observe(inner)
    return () => { observer?.disconnect() }
  }, [box, text, path, shown])
}

/** Private registration inputs; the framework binds the registry source to useDocumentPreviews. */
export interface TextPreviewInjected extends TextInjected {
  readonly hooks: { readonly documentPreviews: ObservableSnapshot<readonly DocumentPreviewDefinition[]> }
}

/** The body's composed props: the tab, its navigation, the shared store and face, and copy. */
export type TextPreviewProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsRenderSlots<'sidebar.right.tab.document'>
  & PropsStore<TextStore>
  & InjectFace<TextPreviewInjected>
  & PropsLocale<'sidebarDocumentPreview'>

/**
 * The text type's body, registered under `sidebar.right.pane.tab` as `text`.
 * @param props - composed slot props.
 * @returns the content read so far with its controls, or a progress line.
 */
export function TextPreview({
  useTabInfo, useResource, useStore, actions, loadPage, reloadPages,
  loadAll, reloadAll, startEdit, refreshEdit, saveEdit, useDocumentPreviews, renderSlot, t,
}: TextPreviewProps): ReactNode {
  const { tab } = useTabInfo()
  const { navigation, signal } = tab
  const meta = useResource<'file'>(tab.contentId)
  const canRead = meta.status !== 'none'
  const file = useMemo(() => hostFileOf(tab.contentId), [tab.contentId])
  const state = useStore(s => s.byTab[tab.id])
  const definitions = useDocumentPreviews(value => value)
  const candidates = useMemo(() => {
    const matched = matchingDocumentPreviews(definitions, file.path)
    const fallback = definitions.find(definition => definition.id === PLAIN_BODY_ID)
    return fallback === undefined ? matched : [...matched, fallback]
  }, [definitions, file.path])
  const selected = candidates.find(candidate => candidate.id === state?.rendererId) ?? candidates[0]
  const mode = selected?.loading
  const current = (state?.mode ?? 'text-pages') === mode ? state : undefined
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const scrollportRef = useRef<HTMLElement | null>(null)
  const storedScrollTopRef = useRef(0)
  const pathRef = useRef<HTMLDivElement | null>(null)
  const pathTextRef = useRef<HTMLSpanElement | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const displayPath = meta.value?.absolutePath ?? current?.complete?.absolutePath ?? file.path
  usePathClipped(pathRef, pathTextRef, displayPath, state !== undefined)
  // Every tab of this type is a `file` resource address, so its params are the
  // `file` type's; the union is narrowed on the one field read, not validated.
  const line = navigation.params !== undefined && 'line' in navigation.params ? navigation.params.line : undefined
  const pages = current?.pages
  const loaded = useMemo(() => loadedPages(pages ?? {}), [pages])
  const loadedThrough = lastLineLoaded(loaded)
  const hasContent = loaded.length > 0 || current?.complete !== undefined
  storedScrollTopRef.current = state?.scrollTop ?? 0
  const bindBody = useCallback((body: HTMLDivElement | null): void => {
    const previous = bodyRef.current
    bodyRef.current = body
    if (scrollportRef.current === null || scrollportRef.current === previous) scrollportRef.current = body
    if (body === null) scrollportRef.current = null
  }, [])
  const bindScrollport = useCallback((scrollport: HTMLElement | null): void => {
    const next = scrollport ?? bodyRef.current
    scrollportRef.current = next
    if (next !== null) next.scrollTop = storedScrollTopRef.current
  }, [])

  const edit = state?.edit
  const editable = selected?.editable === true && canRead
  const editing = edit !== undefined && editable
  const editCapable = selected?.editable === true

  // An editable renderer's file opens as an edit session instead of pages: the
  // buffer is the file's presentation. A file that cannot open for editing
  // falls back to the paged preview below; a reload retries the session.
  useEffect(() => {
    if (!editCapable || !canRead || state?.editUnavailable === true || state?.edit !== undefined) return
    startEdit(tab.id, file, signal)
  }, [editCapable, canRead, state?.editUnavailable, edit !== undefined, tab.id, file, signal, startEdit])

  // First mount reads the first page; a body coming back to a tab whose reads
  // already began asks for nothing, because the store outlives the body. A
  // bucket the edit-open failure minted carries no read yet (`mode` is unset),
  // so it does not count as started.
  const started = editing || current?.mode !== undefined
  useEffect(() => {
    if (started || !canRead || mode === undefined) return
    if (editCapable && state?.editUnavailable !== true) return
    if (mode === 'text-pages') loadPage(tab.id, file, 1, signal, meta.value?.version)
    else loadAll(tab.id, file, signal, meta.value?.version)
  }, [started, tab.id, file, signal, loadPage, loadAll, canRead, mode, editCapable, state?.editUnavailable, meta.value?.version])

  // Come back where the reader was once there is content to scroll: on a remount,
  // after a reload rebuilt the content, or after the selected renderer changed.
  // Scroll writes preserve both identities, so they never re-land.
  useEffect(() => {
    const body = scrollportRef.current
    if (hasContent && body !== null && state !== undefined) body.scrollTop = state.scrollTop
  }, [hasContent, selected?.id])

  // Answer a navigation once: a line the pages do not reach yet loads the next
  // page (again, until the pages cover it or the file ends); a line they hold
  // is scrolled to and marked. An open edit session scrolls its own surface —
  // the editor receives the line and revision and positions its scrollport.
  // The store remembers the answer, so a remount
  // restores the reader's place instead.
  useEffect(() => {
    const body = scrollportRef.current
    if (editing) return
    if (current === undefined || body === null || current.revision === navigation.revision) return
    if (line === undefined || mode !== 'text-pages') {
      actions.navigated(tab.id, navigation.revision)
      return
    }
    if (line > loadedThrough && !current.eof) {
      if (!current.loading && current.failure === undefined && canRead) {
        loadPage(tab.id, file, loadedThrough + 1, signal, meta.value?.version)
      }
      return
    }
    const landed = scrollToLine(body, line)
    if (!landed && line <= loadedThrough) return
    actions.navigated(tab.id, navigation.revision)
    // Recorded here as well as by the scroll event, so the store holds the
    // landing before any later navigation reads it.
    actions.scrolled(tab.id, body.scrollTop)
  }, [
    navigation.revision, line, loadedThrough, current?.eof, current?.loading, current?.failure, started,
    selected?.id, mode, file, canRead, meta.value?.version, editing, state?.revision,
  ])

  // A newer version the Host reported applies without a click — but only a
  // metadata *transition* counts: frames replay versions the writes here moved
  // past, and a stale frame must not read as a disk change. An open clean
  // buffer adopts the fresh read (a dirty one only records the version for the
  // guarded write), and the paged preview re-reads. The injected methods are
  // used directly — the view's own `reload`/`cancelEdit` live past the early
  // return and must not be captured here.
  const observedVersion = meta.value?.version
  // Each surface consumes the metadata stream on its own: a bump the paged
  // body already re-read must still reach a dormant edit session when its
  // editable viewer comes back — it decides from baseVersion/externalVersion.
  const lastObservedPagedRef = useRef<string | undefined>(undefined)
  const lastObservedEditRef = useRef<string | undefined>(undefined)
  const changed = current !== undefined && observedVersion !== undefined && (
    (current.version !== undefined && observedVersion !== current.version && observedVersion !== current.observedVersion)
    || (current.version === undefined && current.loading && observedVersion !== current.observedVersion)
  )
  useEffect(() => {
    if (editing) {
      if (observedVersion === lastObservedEditRef.current) return
      // A change arriving while a write or its conflict owns the session is not
      // decidable yet — leave it unconsumed so the settle that lifts the hold
      // re-evaluates the same frame here.
      if (edit.saving || edit.conflict !== undefined) return
      if (observedVersion === undefined || observedVersion === edit.baseVersion || observedVersion === edit.externalVersion) {
        lastObservedEditRef.current = observedVersion
        return
      }
      lastObservedEditRef.current = observedVersion
      refreshEdit(tab.id, file, signal, observedVersion)
      return
    }
    if (observedVersion === lastObservedPagedRef.current) return
    // An undecidable frame — nothing read yet or no read authority — stays
    // unconsumed; the state change that makes it decidable refires this.
    if (!changed || !canRead) return
    lastObservedPagedRef.current = observedVersion
    if (mode === 'text-pages') reloadPages(tab.id, file, signal, observedVersion)
    else reloadAll(tab.id, file, signal, observedVersion)
  }, [
    observedVersion, editing, changed, canRead, mode, tab.id, file, signal,
    edit?.saving, edit?.conflict !== undefined, edit?.baseVersion, edit?.externalVersion,
    refreshEdit, reloadPages, reloadAll,
  ])

  const content = useMemo((): DocumentContent | undefined => {
    if (mode === 'bytes-complete') {
      return current?.complete === undefined ? undefined : { kind: 'bytes', data: current.complete.data }
    }
    if (current === undefined || loaded.length === 0) return undefined
    return { kind: 'text', pages: loaded, text: loaded.filter(page => page.lines > 0).map(page => page.text).join('\n'), eof: current.eof }
  }, [mode, loaded, current?.complete, current?.eof])

  if (state === undefined || selected === undefined) {
    return (
      <div className={css.status} data-textpreview-state="loading">
        {meta.status === 'none'
          ? <p className={css.statusLine}>{t('resourceUnavailable')}</p>
          : <LoadingIndicator className={css.statusLine} label={t('loading')} />}
      </div>
    )
  }
  const highlighted = editing && selected.id !== PLAIN_BODY_ID
  const cancelEdit = (): void => {
    if (edit !== undefined && edit.draft !== edit.base && !window.confirm(t('edit.discardConfirm'))) return
    actions.editCancelled(tab.id)
  }
  const saveDraft = (): void => {
    /* v8 ignore else -- the save control renders only while an edit session is open. */
    if (edit !== undefined) saveEdit(tab.id, file, edit.draft, edit.baseVersion, signal)
  }
  const saveMerged = (): void => {
    const conflict = edit?.conflict
    /* v8 ignore if -- the merge control renders only while a conflict is armed. */
    if (conflict === undefined) return
    const merged = mergeConflicts(conflict.theirs, conflict.mine, hunk => conflict.choices[hunk] ?? 'mine')
    saveEdit(tab.id, file, merged, conflict.version, signal)
  }
  const next = loadedThrough + 1
  const { directory, name } = pathPartsOf(displayPath)
  const loadNext = (): void => {
    if (!canRead || current?.loading || current?.eof) return
    loadPage(tab.id, file, next, signal, meta.value?.version)
  }
  // While an edit session is open, re-reading means discarding the buffer and
  // opening it on the fresh file — which is exactly what cancel does, since
  // the session re-opens itself afterwards.
  const reload = (): void => {
    if (!canRead) return
    if (editing) {
      cancelEdit()
      return
    }
    // A manual reload retries a refused edit open alongside the paged read;
    // the automatic re-read on a reported change leaves the flag alone.
    if (state.editUnavailable === true) actions.editUnavailableCleared(tab.id)
    if (mode === 'text-pages') reloadPages(tab.id, file, signal, meta.value?.version)
    else reloadAll(tab.id, file, signal, meta.value?.version)
  }
  return (
    <div className={css.preview} data-textpreview-state="text" data-textpreview-url={tab.contentId} data-document-preview={selected.id}>
      {meta.failure !== undefined && (hasContent || editing || edit !== undefined) && (
        // The file's metadata failed — gone, or its workspace unknown. With
        // nothing read and no buffer the body's own failure already says it,
        // so the bar would only repeat the same line. An open edit session
        // counts as content too: a non-editable viewer selected mid-edit
        // unsets `editing`, and without this bar the failure would vanish.
        <p className={css.changed} data-textpreview-meta-failed={meta.failure.code}>
          <span>{failureLine(t, meta.failure)}</span>
          <button
            type="button"
            className={css.action}
            data-textpreview-reload-now
            onClick={reload}
          >
            {t('reloadNow')}
          </button>
        </p>
      )}
      <div className={css.header}>
        <div ref={pathRef} className={css.path} title={displayPath} data-textpreview-path>
          <span ref={pathTextRef} className={css.pathText}>
            {directory !== '' && <span className={css.pathDirectory}>{directory}</span>}
            <span className={css.pathName}>{name}</span>
          </span>
        </div>
        {(
          <Menu
            open={menuOpen}
            anchor={(
              <button type="button" className={clsx(css.tool, css.viewerTool)} aria-label={t('openWith')} title={selected.title()} data-document-viewer-menu onClick={() => { setMenuOpen(value => !value) }}>
                {selected.title()}
              </button>
            )}
            items={candidates.map(candidate => ({ id: candidate.id, label: candidate.title() }))}
            selectedId={selected.id}
            onSelect={(id) => { actions.selected(tab.id, id); setMenuOpen(false) }}
            onClose={() => { setMenuOpen(false) }}
            align="end"
            portal
            dense
          />
        )}
        {selected.wrap === true && (
          // The tooltip names the action while the stable aria name and
          // `aria-pressed` expose the control and its current state.
          <Tooltip label={t(state.wrap ? 'wrap.disable' : 'wrap.enable')} side="bottom" delayMs={500}>
            <button
              type="button"
              className={css.tool}
              aria-pressed={state.wrap}
              aria-label={t('wrap.aria')}
              data-textpreview-tool="wrap"
              onClick={() => { actions.toggledWrap(tab.id) }}
            >
              {state.wrap ? <IconNowrapFill16 /> : <IconWrapFill16 />}
            </button>
          </Tooltip>
        )}
        {(
          <Tooltip label={t('reload')} side="bottom" delayMs={500}>
            <button
              type="button"
              className={css.tool}
              aria-label={t('reload')}
              data-textpreview-tool="reload"
              onClick={reload}
            >
              <IconRefreshOutline16 />
            </button>
          </Tooltip>
        )}
      </div>
      {editing && (
        <EditorBody
          edit={edit}
          highlighted={highlighted}
          lang={highlighted ? languageForPath(file.path) : undefined}
          t={t}
          wrapped={state.wrap}
          line={line}
          navRevision={navigation.revision}
          answeredRevision={state.revision}
          onNavigated={(revision) => { actions.navigated(tab.id, revision) }}
          scrollTop={state.scrollTop}
          onScroll={(scrollTop) => { actions.scrolled(tab.id, scrollTop) }}
          onDraft={(text) => { actions.editDraft(tab.id, text) }}
          onSave={saveDraft}
          onCancel={cancelEdit}
          onChoice={(hunk, side) => { actions.conflictChoice(tab.id, hunk, side) }}
          onMergeSave={saveMerged}
          onConflictBack={() => { actions.conflictClosed(tab.id) }}
        />
      )}
      {editing || (
        <div
          ref={bindBody}
          className={clsx(css.body, state.wrap && css.wrap)}
          data-textpreview-body
          data-textpreview-wrap={state.wrap ? '' : undefined}
          onScrollCapture={(event) => {
            const body = scrollportRef.current
            /* v8 ignore next -- callback refs bind the scrollport during commit, before user input. */
            if (body === null) return
            if (event.target !== body) return
            actions.scrolled(tab.id, body.scrollTop)
            if (mode === 'text-pages' && current?.failure === undefined && body.clientHeight > 0
              && body.scrollTop + body.clientHeight >= body.scrollHeight - 1) loadNext()
          }}
        >
          {!hasContent && current?.failure === undefined && (
            meta.status === 'none'
              // The provider is gone (detached or never mounted): nothing is
              // loading, so an endless spinner would claim otherwise. An open
              // edit session survives in the store and remounts on return.
              ? <p className={css.statusLine}>{t('resourceUnavailable')}</p>
              : <LoadingIndicator className={css.statusLine} label={t('loading')} />
          )}
          {content !== undefined && renderSlot('sidebar.right.tab.document', {
            resourceAddress: tab.contentId, content, wrap: state.wrap, scrollportRef: bindScrollport,
          }, {
            entryKey: selected.id, hookContext: useTabInfo,
            fallback: <p className={css.statusLine}>{t('rendererUnavailable', { name: selected.title() })}</p>,
          })}
          {current?.failure !== undefined && (hasContent
            ? (
              <p className={css.statusLine} data-textpreview-failed={current.failure.code}>
                <span>{failureLine(t, current.failure)}</span>
                <button
                  type="button"
                  className={css.action}
                  data-textpreview-retry
                  onClick={loadNext}
                >
                  {t('retry')}
                </button>
              </p>
            )
            : (
              // With no content, retry the selected renderer's read; metadata
              // observation remains owned by the resource provider.
              <div className={css.empty} data-textpreview-failed={current.failure.code}>
                <FileTypeIcon kind={classifyFileType(name)} size={36} className={css.emptyIcon} />
                <p className={css.emptyLine}>{failureLine(t, current.failure)}</p>
                <button
                  type="button"
                  className={css.retry}
                  data-textpreview-retry
                  onClick={reload}
                >
                  <IconRefreshOutline16 size={14} />
                  {t('retry')}
                </button>
              </div>
            ))}
          {mode === 'text-pages' && current !== undefined && loaded.length > 0 && !current.eof && current.failure === undefined && (
            <button
              type="button"
              className={css.more}
              disabled={current.loading}
              data-textpreview-more
              onClick={loadNext}
            >
              {current.loading ? <LoadingIndicator label={t('loading')} /> : t('loadMore')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
