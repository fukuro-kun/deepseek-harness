# Agent Note: Sidebar file editing with a guarded write endpoint

Status: implemented

English | [中文](2026-09-28-sidebar-file-editing.zh.md)

## Problem

The right Sidebar previewed files read-only: `workspaceFiles` carried no mutation, so a reader who spotted a small error in agent-produced text had to leave the preview or instruct the agent for a fix the size of one line.

## Decision

**`workspaceFiles.write` replaces a file's complete text under the human principal's policy.** [`WorkspaceFiles.write`](../../../../packages/api/workspace-files/src/index.ts) reuses the read gates (`lstat` kind checks, `maxFileBytes`, no symlink, never creates) and resolves its sandbox policy as `danger-full-access`, because the operator at the UI is the principal — the write boundary is the read boundary, not the agent's `workspace-write` fencing. `edit.expectedVersion` feeds the backend's `replaceIfVersion` intent, so a concurrent change fails with `workspace-file/stale-version` and writes nothing.

**Editing lives on `text-pages` renderers that opt in.** `DocumentPreviewDefinition.editable` gates the header's edit control; the builtin plain-text and code viewers set it, Markdown and every `bytes-complete` renderer stay read-only. The draft, its base version, and a refused write's conflict state are per-tab buckets in the preview's shared store, so they survive body unmounts. The editor overlays a transparent textarea on the code viewer's `CodeBlock` underlay — glyphs come from the highlighter, the caret from the textarea — while plain text sizes its surface with an invisible in-flow sizer.

**A refused write resolves through a line-diff conflict view, not a retry.** The face re-reads the file, [`diff.ts`](../../../../packages/client/ui-sidebar-documentpreview/src/client/edit/diff.ts) cuts `diffLines` into per-hunk rows, each hunk keeps `mine` or `theirs`, and the merged result retries the write guarded by the fresh version token. `conflictRows` and `mergeConflicts` walk the same change list, so a screen index and a merge index are the same hunk.

## Alternatives considered

**Scoping writes to `workspace-write` like the agent's tools.** It would fence the UI to the workspace root while the preview reads anywhere — a silently narrower write boundary than the displayed file, and the sidebar is the human's surface, not a tool call.

**A diff/patch wire format.** `write` sends the complete text because the editor already holds the whole buffer and `maxFileBytes` caps it like `readAll`; a patch format would buy nothing a guarded full replace doesn't already give.

**An embedded editor component (CodeMirror/Monaco).** No such dependency exists in the client graph; the textarea-over-highlight overlay reuses the renderer's own `CodeBlock` and keeps the feature at sidebar-quick-fix scope rather than IDE scope.

## Consequences

The Remote surface gained `write` and two error codes (`stale-version`, `write-failed`); read-only consumers are unaffected. Writes from the UI bypass the agent sandbox deliberately and produce no `fs/observed` frame distinction — the change feed reports them like any other write, so an open preview of the same file announces a change after save.
