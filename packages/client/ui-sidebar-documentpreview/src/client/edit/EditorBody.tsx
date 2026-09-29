/**
 * The preview's edit surface: a full-buffer textarea over the viewer's own
 * highlighted backdrop, plus the conflict resolver a refused guarded write
 * arms.
 *
 * In code mode the underlay is the shared CodeBlock rendering the current
 * draft — the textarea's glyphs are transparent, its caret and selection are
 * not, so the reader types on colored text. Plain mode drops the underlay and
 * the textarea draws its own text. Both share one font metric, set here,
 * because the overlay only aligns while every box around the text agrees.
 */
import type { ReactNode, SyntheticEvent, UIEvent } from 'react'
import { useLayoutEffect, useMemo, useRef } from 'react'
import clsx from 'clsx'
import { CodeBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { EditConflict, EditState } from '../store.ts'
import { failureLine } from '../failure-line.ts'
import { conflictRows } from './diff.ts'
import css from './EditorBody.module.css'

/** What the editor needs from its owner. */
export interface EditorBodyProps {
  /** The tab's edit session. */
  readonly edit: EditState
  /** Whether the highlighted underlay rides under the textarea (code viewer). */
  readonly highlighted: boolean
  /** Grammar hint for the underlay; undefined stays plain. */
  readonly lang: string | undefined
  /** Bound namespace translator. */
  readonly t: TranslateNS<'sidebarDocumentPreview'>
  /** Whether long lines wrap instead of scrolling horizontally. */
  readonly wrapped: boolean
  /** The navigation's target line, when one was requested; scrolled to once per revision. */
  readonly line: number | undefined
  /** The navigation's revision — repeats of the same line re-scroll. */
  readonly navRevision: number
  /** The revision this surface already answered; a remount restores the reader's place instead of jumping again. */
  readonly answeredRevision: number | undefined
  /** Report the navigation revision this surface just performed. */
  readonly onNavigated: (revision: number) => void
  /** The scroll offset the reader left the document at — the editor starts there. */
  readonly scrollTop: number
  /** Report the editor's scroll offset so leaving and returning lands where the reader was. */
  readonly onScroll: (scrollTop: number) => void
  /** Track the buffer one keystroke produces. */
  readonly onDraft: (text: string) => void
  /** Save the draft guarded by its base version. */
  readonly onSave: () => void
  /** Discard the edit session. */
  readonly onCancel: () => void
  /** Record one hunk's conflict choice. */
  readonly onChoice: (hunk: number, side: 'mine' | 'theirs') => void
  /** Save the merged conflict result. */
  readonly onMergeSave: () => void
  /** Leave the conflict view, keeping the draft for further edits. */
  readonly onConflictBack: () => void
}

/**
 * The edit surface for one tab.
 * @param props - edit session, callbacks, and copy.
 * @returns the editor, or the conflict resolver while a write was refused.
 */
export function EditorBody({
  edit, highlighted, lang, t, wrapped, line, navRevision, answeredRevision, onNavigated, scrollTop, onScroll,
  onDraft, onSave, onCancel, onChoice, onMergeSave, onConflictBack,
}: EditorBodyProps): ReactNode {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const innerRef = useRef<HTMLDivElement | null>(null)
  const bufferRef = useRef<HTMLTextAreaElement | null>(null)
  // The caret is the reader's own state; a draft replaced from outside — the
  // disk adopting fresh text — restores it where it was, clamped to the new end.
  const selectionRef = useRef<readonly [number, number] | null>(null)
  useLayoutEffect(() => {
    const buffer = bufferRef.current
    const selection = selectionRef.current
    if (buffer === null || selection === null) return
    const start = Math.min(selection[0], edit.draft.length)
    const end = Math.min(selection[1], edit.draft.length)
    const outOfPlace = buffer.selectionStart !== start
      /* v8 ignore next -- jsdom collapses the caret on value assignment, so
         the buffer's ends always match or miss together; a real browser can
         hold the same start against a different end. */
      || buffer.selectionEnd !== end
    if (outOfPlace) buffer.setSelectionRange(start, end)
  }, [edit.draft])
  // A navigation asks for a line once per revision; the offset is the line's
  // height times its number, measured on the shared metric of `.inner`. An
  // already-answered revision — a remount — restores the reader's own scroll
  // instead, and a surface that cannot scroll yet (the conflict view is up)
  // leaves the navigation unanswered so its return performs the deferred jump.
  const conflictOpen = edit.conflict !== undefined
  useLayoutEffect(() => {
    if (navRevision === answeredRevision) return
    // A navigation without a target line still gets answered — the paged
    // body does the same, so the recorded revision never lags behind.
    if (line === undefined) {
      onNavigated(navRevision)
      return
    }
    const scroll = scrollRef.current
    const inner = innerRef.current
    if (scroll === null || inner === null) return
    const height = parseFloat(getComputedStyle(inner).lineHeight)
    scroll.scrollTop = Math.max(0, (line - 1) * (Number.isFinite(height) ? height : 20))
    onScroll(scroll.scrollTop)
    onNavigated(navRevision)
  }, [navRevision, answeredRevision, line, conflictOpen])

  if (edit.conflict !== undefined) {
    return <ConflictView
      conflict={edit.conflict} saving={edit.saving} failure={edit.failure} t={t}
      onChoice={onChoice} onMergeSave={onMergeSave} onBack={onConflictBack}
    />
  }
  return (
    <div className={css.editor} data-textpreview-editing>
      <div className={css.toolbar}>
        <span className={css.dirty} data-textpreview-dirty={edit.draft !== edit.base || undefined}>
          {edit.draft === edit.base ? t('edit.clean') : t('edit.dirty')}
        </span>
        {edit.externalVersion !== undefined && (
          <span className={css.remote} data-textpreview-remote-changed>{t('edit.remoteChanged')}</span>
        )}
        <button type="button" className={css.tool} disabled={edit.saving} data-textpreview-save onClick={onSave}>
          {t(edit.saving ? 'edit.saving' : 'edit.save')}
        </button>
        <button type="button" className={css.tool} disabled={edit.saving} data-textpreview-cancel onClick={onCancel}>
          {t('edit.cancel')}
        </button>
      </div>
      {edit.failure !== undefined && (
        <p className={css.failure} data-textpreview-edit-failed={edit.failure.code}>{failureLine(t, edit.failure, 'write')}</p>
      )}
      <div
        className={css.scroll}
        data-textpreview-edit-scroll
        ref={(el) => {
          scrollRef.current = el
          if (el !== null && el.scrollTop === 0) el.scrollTop = scrollTop
        }}
        onScroll={(event: UIEvent<HTMLDivElement>) => { onScroll(event.currentTarget.scrollTop) }}
      >
        <div ref={innerRef} className={clsx(css.inner, wrapped && css.wrapped)}>
          {highlighted
            ? (
              <div className={css.underlay} aria-hidden>
                <CodeBlock code={edit.draft} lang={lang} copyLabel="" copiedLabel="" />
              </div>
            )
            : (
              // The invisible sizer is the in-flow box that gives the surface
              // the buffer's size; the absolute textarea alone would collapse it.
              // A trailing newline ends a pre early, so one space keeps the last
              // line's height.
              <pre className={css.sizer} aria-hidden>{edit.draft.endsWith('\n') || edit.draft === '' ? `${edit.draft} ` : edit.draft}</pre>
            )}
          <textarea
            ref={bufferRef}
            className={clsx(css.buffer, highlighted && css.bufferOverlay)}
            data-textpreview-buffer
            value={edit.draft}
            spellCheck={false}
            wrap={wrapped ? 'soft' : 'off'}
            disabled={edit.saving}
            aria-label={t('edit.buffer')}
            onChange={(event) => { onDraft(event.target.value) }}
            onSelect={(event: SyntheticEvent<HTMLTextAreaElement>) => {
              selectionRef.current = [event.currentTarget.selectionStart, event.currentTarget.selectionEnd]
            }}
          />
        </div>
      </div>
    </div>
  )
}

/** Per-hunk pick bar and footer for one armed conflict. */
function ConflictView({
  conflict, saving, failure, t, onChoice, onMergeSave, onBack,
}: {
  conflict: EditConflict
  saving: boolean
  failure: EditState['failure']
  t: TranslateNS<'sidebarDocumentPreview'>
  onChoice: (hunk: number, side: 'mine' | 'theirs') => void
  onMergeSave: () => void
  onBack: () => void
}): ReactNode {
  const rows = useMemo(() => conflictRows(conflict.theirs, conflict.mine), [conflict.theirs, conflict.mine])
  const hunks = useMemo(() => rows.flatMap(row => row.kind === 'hunk' ? [row.hunk] : []), [rows])
  return (
    <div className={css.editor} data-textpreview-conflict>
      <div className={css.toolbar}>
        <span className={css.conflictTitle}>{t('conflict.title')}</span>
        <button type="button" className={css.tool} disabled={saving} data-textpreview-merge-save onClick={onMergeSave}>
          {t(saving ? 'edit.saving' : 'conflict.saveMerged')}
        </button>
        <button type="button" className={css.tool} disabled={saving} data-textpreview-conflict-back onClick={onBack}>
          {t('conflict.back')}
        </button>
      </div>
      <p className={css.conflictHint}>{t('conflict.hint')}</p>
      {failure !== undefined && (
        <p className={css.failure} data-textpreview-edit-failed={failure.code}>{failureLine(t, failure, 'write')}</p>
      )}
      <div className={css.scroll} data-textpreview-conflict-rows>
        {rows.map((row, rowIndex) => row.kind === 'same'
          ? <pre key={rowIndex} className={css.same}>{row.lines.join('\n')}</pre>
          : (
            <div key={rowIndex} className={css.hunk} data-textpreview-hunk={row.hunk.index}>
              <div className={css.hunkPick}>
                <button
                  type="button"
                  className={clsx(css.pick, (conflict.choices[row.hunk.index] ?? 'mine') === 'mine' && css.picked)}
                  data-textpreview-pick="mine"
                  disabled={saving}
                  onClick={() => { onChoice(row.hunk.index, 'mine') }}
                >
                  {t('conflict.keepMine')}
                </button>
                <button
                  type="button"
                  className={clsx(css.pick, conflict.choices[row.hunk.index] === 'theirs' && css.picked)}
                  data-textpreview-pick="theirs"
                  disabled={saving}
                  onClick={() => { onChoice(row.hunk.index, 'theirs') }}
                >
                  {t('conflict.takeTheirs')}
                </button>
              </div>
              {row.hunk.theirs.length > 0 && (
                <pre className={css.theirs}>{row.hunk.theirs.join('\n')}</pre>
              )}
              {row.hunk.mine.length > 0 && (
                <pre className={css.mine}>{row.hunk.mine.join('\n')}</pre>
              )}
            </div>
          ))}
        {hunks.length === 0 && <p className={css.failure}>{t('conflict.identical')}</p>}
      </div>
    </div>
  )
}
