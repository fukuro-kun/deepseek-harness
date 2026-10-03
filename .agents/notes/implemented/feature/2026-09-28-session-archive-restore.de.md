# Agent Note: Session-Archivwiederherstellung und der Archivbereich

Status: implemented

[English](2026-09-28-session-archive-restore.md) | [中文](2026-09-28-session-archive-restore.zh.md) | Deutsch

## Problem

Das Archivieren einer Session verbarg sie vor jeder Gruppierungsoberfläche ohne Weg zurück: Das Zeilenmenü bot **Archive session**, die Registry hielt die ID in `archivedSessionIds`, und weder Host noch Browser legten einen Entarchivierungsweg offen. Wiederherstellung hieß, `workspace.json` von Hand zu editieren und neu zu starten.

## Entscheidung

**Entarchivieren ist eine reine Archiv-Mengen-Bearbeitung.** [`WorkspaceRegistry.unarchiveSession`](../../../../packages/workspace/workspace/src/index.ts) entfernt die ID aus der dauerhaften globalen Menge und sonst nichts: Die Session behält ihr Log, ihre Workspace-Zugehörigkeit und ihren `sessionIds`-Ordnungsslot, sodass ein Wiederherstellen nie eine Umordnung schreibt. Die Methode ist idempotent — eine nicht archivierte ID wird ohne Schreiben aufgelöst, und der Aufruf verlangt nie, dass die Session selbst existiert. Die Übertragungsform nutzt den Archivvertrag symmetrisch wieder: `workspace/unarchiveSession` liefert die vollständige resultierende `archivedSessionIds`-Menge, und Follower erfahren die Änderung über den bestehenden `archived`-Frame — kein neuer Stream-Frame-Typ.

**Archivierte Sessions leben in einem eingefalteten Archivbereich am Fuß der Session-Liste.** [`WorkspaceBrowser`](../../../../packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.tsx) rendert den Bereich in gruppiertem und flachem Browsen, sobald die Archivmenge nicht leer ist, und zeigt die Anzahl im Header. Zeilen darin sind gedimmt, inert gegen Öffnen und Ziehen, und ihr Menü bietet nur **Restore**; der Bereich löst sich auf, wenn die letzte ID die Menge verlässt. Suchergebnisse verbergen archivierte Sessions weiter — Suchen ist für arbeitende Sessions, und der Archivbereich ist einen Klick entfernt. Der Ausklappzustand des Bereichs ist komponentenlokal und setzt sich beim Neuladen zurück.

## Erwogene Alternativen

**Eine Verwaltungsseite in den Einstellungen.** Sie würde die Archivpflege von der Session-Liste entkoppeln, in der das Archivieren geschieht, während der Bereich die bestehende Gruppiert/Flach-Zeilenmaschinerie umsonst wiederverwendet.

**Ein eigener `unarchived`-Stream-Frame.** Der Follow-Feed trägt schon `archived` mit der vollständigen Menge; ein zweiter Frame würde die Buchhaltung verdoppeln ohne Consumer-Nutzen.

**Vor dem Entarchivieren zu verlangen, dass die Session existiert.** Archivierte IDs können ihre Logs nur durch externes Löschen überleben; das Verweigern des Aufräumens einer hängenden ID würde sie für immer in der Archivmenge gefangen halten, sodass die Bearbeitung freigebig bleibt — wie `archiveSession` umgekehrt strikt ist: Der Host lehnt das Archivieren einer unbekannten Session ab.

## Folgen

`IWorkspaces`, `WorkspaceRemote` und `UiWorkspace` erhielten `unarchiveSession` als pre-stable API; jede Fixture, jedes Fake und jeder injizierte Slot wurde aktualisiert. Das dauerhafte Löschen von Sessions bleibt absichtlich abwesend: Es muss Session-Dateien, Indizes, Projektions-Caches und Workspace-Verweise koordinieren, und keine destruktive Aktion fährt auf der Archivfläche mit.
