# Agent Note: Session archive restore and the archive section
English | [中文](.agents/notes/implemented/feature/2026-09-28-session-archive-restore.zh.md) | [Deutsch](.agents/notes/implemented/feature/2026-09-28-session-archive-restore.de.md)

Status: implemented

English | [中文](2026-09-28-session-archive-restore.zh.md)

## Problem

Archiving a Session hid it from every grouping surface with no way back: the row menu offered **Archive session**, the registry kept the id in `archivedSessionIds`, and neither the Host nor the browser exposed an unarchive path. Recovery meant editing `workspace.json` by hand and restarting.

## Decision

**Unarchive is a pure archive-set edit.** [`WorkspaceRegistry.unarchiveSession`](../../../../packages/workspace/workspace/src/index.ts) removes the id from the durable global set and nothing else: the Session keeps its log, its Workspace membership, and its `sessionIds` ordering slot, so restoring never writes a reorder. The method is idempotent — an id that is not archived resolves without writing, and the call never requires the Session itself to exist. The wire shape reuses the archive contract symmetrically: `workspace/unarchiveSession` returns the complete resulting `archivedSessionIds` set, and followers learn the change through the existing `archived` frame — no new stream frame type.

**Archived Sessions live in a folded Archive section at the foot of the Session list.** [`WorkspaceBrowser`](../../../../packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.tsx) renders the section in both grouped and flat browsing whenever the archive set is non-empty, showing the count in its header. Rows inside are dimmed, inert to open and drag, and their menu offers only **Restore**; the section dissolves when the last id leaves the set. Search results keep hiding archived Sessions — searching is for working Sessions, and the Archive section is one click away. The section's expansion state is component-local and resets on reload.

## Alternatives considered

**A management page in Settings.** It would decouple archive maintenance from the Session list where archiving happens, and the section reuses the existing grouped/flat row machinery for free.

**A distinct `unarchived` stream frame.** The follow feed already carries `archived` with the complete set; a second frame would double the bookkeeping for no consumer benefit.

**Requiring the Session to exist before unarchiving.** Archived ids can outlive their logs only through external deletion; refusing to clear a dangling id would trap it in the archive set forever, so the edit stays permissive like `archiveSession` is strict the other way — the Host rejects archiving an unknown Session.

## Consequences

`IWorkspaces`, `WorkspaceRemote`, and `UiWorkspace` gained `unarchiveSession` as pre-stable API; every fixture, fake, and injected slot was updated. Permanent Session deletion stays absent deliberately: it must coordinate session files, indexes, projection caches, and Workspace references, and no destructive action rides on the archive surface.
