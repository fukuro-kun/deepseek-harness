# Agent Note: Windows-native durable JSONL-Publikation

Status: implemented

[English](2026-07-05-windows-jsonl-durable-publish.md) | [中文](2026-07-05-windows-jsonl-durable-publish.zh.md) | Deutsch

## Problem

`dsh-session-persistence-jsonl` publiziert ein Session-Log lazy beim ersten Append. Das POSIX-Protokoll schreibt eine Temp-Datei, fsync-t sie, linkt sie auf den finalen Namen, fsync-t das Elternverzeichnis und entfernt dann den Temp-Link. Das Elternverzeichnis-fsync ist Teil des Durability-Contracts: Ein Crash nach der Namespace-Änderung darf den committeten finalen Namen nicht verlieren, während Caller glauben, das Session-Log sei materialisiert.

Windows hat atomare Namespace-Operationen, aber Node exponiert dort keinen POSIX-äquivalenten Elternverzeichnis-fsync-Contract. Windows-Directory-Sync-Fehler als Erfolg zu behandeln würde ein durable Backend still schwächen. Der Windows-Pfad braucht daher ein eigenes Publikationsprimitiv statt eines Conditionals im POSIX-`syncDir`-Helper.

## Entscheidung

Das JSONL-Backend forkt innerhalb von `materialize()`, bevor irgendeine Namespace-Mutation stattfindet. Geteilter Code berechnet das Session-Verzeichnis, den finalen Log-Pfad und den enkodierten Header plus den initialen Event-Batch; POSIX und Windows laufen dann separate Publikationsprotokolle.

POSIX behält das bestehende Protokoll: Root-, Projekt- und Session-Verzeichnis mit Elternverzeichnis-fsyncs anlegen, eine Temp-Datei schreiben und fsync-en, mit `link()` publizieren, sodass ein vorhandenes finales Log nie überschrieben wird, das Session-Verzeichnis fsync-en, dann den redundanten Temp-Hardlink entfernen.

Windows legt fehlende Verzeichnisse über eine durable Staging-Publikation an: ein zufälliges Geschwisterverzeichnis unter dem konstanten `.dsh-mkdir-`-Prefix erstellen, unabhängig vom Ziel-Basename, dann mit `MoveFileExW(..., MOVEFILE_WRITE_THROUGH)` auf den finalen Verzeichnisnamen publizieren — ohne `MOVEFILE_REPLACE_EXISTING` oder `MOVEFILE_COPY_ALLOWED`. Die Datei-Materialisierung schreibt und fsync-t das Temp-Log, publiziert diese Temp-Datei dann mit demselben Write-Through-`MoveFileExW`-Call auf den finalen Pfad, ohne Ersetzung. `koffi` ist die minimale Win32-Bridge für diese API; ihr Install-Script ist in `pnpm-workspace.yaml` erlaubt, weil das Paket den nativen Loader und vorgebaute Plattform-Module ausliefert.

## Erwogene Alternativen

**Windows-Directory-Sync-Fehler ignorieren.** Verworfen, weil es einen ersten Append als durable meldet, ohne den publizierten Namespace-Eintrag auf stabilen Storage zu zwingen.

**`CreateHardLinkW` verwenden.** Verworfen, weil Hardlinks dateisystemabhängig sind, keine Verzeichnisse publizieren und keine Write-Through-Option exponieren.

**Replacement- oder transaktionale APIs verwenden.** `ReplaceFileW` hat Replacement-Semantik, die mit der Same-ID-Collision-Rejection kollidiert, und Transactional NTFS wird für neue Anwendungsdesigns nicht empfohlen.

## Konsequenzen

Das Backend behält einen externen Contract über Plattformen hinweg: Der erste Append publiziert entweder ein vollständiges Log unter dem finalen Namen oder schlägt fehl, ohne ein vorhandenes Log zu überschreiben. Der Plattform-Split ist ein Implementierungsdetail; `SessionPersistence`-APIs und das logische JSONL-Record-Format ändern sich nicht. Die spätere [Zstandard-Encoding-Entscheidung](2026-07-19-zstandard-jsonl-session-logs.md) greift, bevor eine der Plattformen die opaken Bytes publiziert.

Windows-Tests prüfen den echten Win32-Publish-Pfad auf nativem Windows. Power-Loss-Verhalten bleibt eine API-Contract-Eigenschaft statt etwas, das Unit-Tests beweisen können; die testbaren Invarianten sind, dass beim Windows-materialize kein Directory-fsync aufgerufen wird, Final-Path-Kollisionen fehlschlagen, Zielkomponenten maximaler Länge materialisierbar bleiben, Temp-Logs vor der Publikation gefsync-t werden und das resultierende Log normal lädt.

Append und Repair nutzen weiterhin gewöhnliche File-Handle-fsyncs auf beiden Plattformen. Ein fehlgeschlagener Append schließt seinen Append-only-Handle, öffnet das Log read/write erneut, trunkiert es auf die Pre-Append-Größe und fsync-t den Rollback, weil Windows `ftruncate` auf Append-only-Handles ablehnt.
