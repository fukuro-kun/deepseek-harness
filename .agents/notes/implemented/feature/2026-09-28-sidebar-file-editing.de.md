# Agent Note: Sidebar-Dateibearbeitung mit abgesichertem Schreib-Endpunkt

Status: implemented

[English](2026-09-28-sidebar-file-editing.md) | [中文](2026-09-28-sidebar-file-editing.zh.md) | Deutsch

## Problem

Die rechte Sidebar zeigte Dateien schreibgeschützt an: `workspaceFiles` bot keine Änderungsoperation, sodass ein Leser, der einen kleinen Fehler in vom Agent erzeugtem Text entdeckte, die Vorschau verlassen oder den Agent für eine Korrektur in der Größe einer Zeile anweisen musste.

## Entscheidung

**`workspaceFiles.write` ersetzt den vollständigen Text einer Datei unter der Policy des menschlichen Prinzipals.** [`WorkspaceFiles.write`](../../../../packages/api/workspace-files/src/index.ts) nutzt die Lese-Prüfungen wieder (`lstat`-Artprüfungen, `maxFileBytes`, kein Symlink, erstellt nie) und löst seine Sandbox-Policy als `danger-full-access` auf, weil die Bedienperson an der UI der Prinzipal ist — die Schreibgrenze ist die Lesegrenze, nicht die `workspace-write`-Einzäunung des Agents. `edit.expectedVersion` speist die `replaceIfVersion`-Absicht des Backends, sodass eine konkurrierende Änderung mit `workspace-file/stale-version` fehlschlägt und nichts schreibt.

**Die Bearbeitung lebt auf `text-pages`-Renderern, die sich anmelden.** `DocumentPreviewDefinition.editable` macht den Buffer zur Darstellung der Datei — ein editierbarer Renderer öffnet die Sitzung beim Mount, es gibt kein Bearbeiten-Steuerelement, das zuerst gedrückt würde; die eingebauten Plain-Text- und Code-Viewer setzen es, Markdown und jeder `bytes-complete`-Renderer bleiben schreibgeschützt. Eine Datei, die sich nicht öffnen lässt (Lesen fehlgeschlagen, kein UTF-8, NULs), markiert den Tab als `editUnavailable` und fällt auf die seitenweise Vorschau zurück, bis ein Neuladen es erneut versucht. Der Entwurf, seine Basisversion und der Konfliktzustand eines abgelehnten Schreibens sind pro-Tab-Buckets im gemeinsamen Store der Vorschau und überleben damit das Unmount des Inhalts. Der Editor legt eine transparente Textarea über das `CodeBlock`-Unterlay des Code-Viewers — Glyphen kommen vom Highlighter, das Caret von der Textarea — während Plain Text seine Fläche mit einem unsichtbaren in-flow-Sizer bemisst.

**Der Buffer verfolgt Festplattenänderungen, die der Ressourcenstrom meldet.** Ein Metadaten-Frame, dessen Version der Tab noch nicht übernommen hat, greift sofort: Ein sauberer Buffer übernimmt den frischen Text über `refreshEdit`; ein veränderter behält den Text des Nutzers und verzeichnet die Version als `externalVersion`, die der abgesicherte Schreibvorgang auflöst. Ein Refresh-Lesevorgang, der fehlschlägt, Nicht-Text liefert oder vor dem Ankommen von einer Speicher- oder Wiedereröffnungs-Epoche überholt wird, verzeichnet die gemeldete Version dennoch — der Buffer sagt dem Leser damit, dass er nicht mehr den aktuellen Dateitext hält, und ein Schreiben auf einer anderen Version erhält diese Markierung. Nur Versions*übergänge* lösen aus — Frames, die eine bereits konsumierte Version des Tabs erneut abspielen (einschließlich des Echos des eigenen Schreibens), gelten nicht als Änderung, und Bearbeitungsfläche und seitenweiser Inhalt konsumieren den Strom auf getrennten Baselines, sodass eine ruhende Bearbeitungssitzung einen Bump trotzdem sieht, den die seitenweise Vorschau bereits neu gelesen hat. Die seitenweise Vorschau liest unter derselben Regel neu.

**Ein abgelehntes Schreiben löst sich über eine Zeilen-Diff-Konfliktansicht, nicht über einen Retry.** Die Oberfläche liest die Datei neu, [`diff.ts`](../../../../packages/client/ui-sidebar-documentpreview/src/client/edit/diff.ts) schneidet `diffLines` in Hunk-Zeilen, jeder Hunk behält `mine` oder `theirs`, und das zusammengeführte Ergebnis wiederholt das Schreiben abgesichert durch das frische Versions-Token. `conflictRows` und `mergeConflicts` gehen dieselbe Änderungsliste, sodass ein Bildschirmindex und ein Merge-Index denselben Hunk meinen. Ein erfolgreiches Schreiben rebasiert die Sitzung auf den geschriebenen Text unter der Version nach dem Schreiben — die Fläche ist die Datei, kein Modus, den ein Speichern verlässt.

## Erwogene Alternativen

**Schreiben auf `workspace-write` beschränken wie die Tools des Agents.** Das würde die UI auf die Workspace-Wurzel einzäunen, während die Vorschau überall liest — eine stillschweigend engere Schreibgrenze als die angezeigte Datei, und die Sidebar ist die Fläche des Menschen, kein Tool-Aufruf.

**Ein Diff/Patch-Übertragungsformat.** `write` sendet den vollständigen Text, weil der Editor den ganzen Buffer bereits hält und `maxFileBytes` ihn wie `readAll` begrenzt; ein Patch-Format würde nichts kaufen, was ein abgesicherter Vollabtausch nicht bereits liefert.

**Eine eingebettete Editor-Komponente (CodeMirror/Monaco).** Es gibt keine solche Abhängigkeit im Client-Graph; das Textarea-über-Highlight-Overlay nutzt das eigene `CodeBlock` des Renderers wieder und hält das Feature im Umfang einer schnellen Sidebar-Korrektur statt im IDE-Umfang.

## Folgen

Die Remote-Oberfläche erhielt `write` und zwei Fehlercodes (`stale-version`, `write-failed`); schreibgeschützte Consumer bleiben unberührt. Schreibvorgänge aus der UI umgehen die Agent-Sandbox absichtlich und erzeugen keine unterscheidbare `fs/observed`-Frame-Unterscheidung — der Änderungsfeed meldet sie wie jedes andere Schreiben, sodass andere geöffnete Oberflächen auf derselben Datei die neue Version übernehmen, während die eigene Sitzung des Schreibers das Echo als bereits konsumiert überspringt.
