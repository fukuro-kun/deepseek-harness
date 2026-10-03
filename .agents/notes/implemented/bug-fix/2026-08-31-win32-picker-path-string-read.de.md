# Agent Note: Win32-Picker-Pfad ohne unmanaged Sicht fester Größe lesen

Status: implemented

[English](2026-08-31-win32-picker-path-string-read.md) | [中文](2026-08-31-win32-picker-path-string-read.zh.md) | Deutsch

## Problem

Der Win32-Picker muss einen NUL-terminierten UTF-16-String dekodieren, der von `IShellItem::GetDisplayName` alloziert wurde, und ihn über `CoTaskMemFree` freigeben. Ein externer ArrayBuffer fester Länge fügt eine Laufzeitvoraussetzung und manuelles Terminator-Scannen hinzu, ohne die Allokationsgröße zu liefern.

## Entscheidung

`readUtf16` speichert die native Adresse in einem Puffer von Zeigerbreite und übergibt ihn an das generische `koffi.decode(buffer, 'str16')`. Die generische Dekodierung erwartet eine Zeigervariable, nicht die Stringadresse direkt. Das Slice folgt `koffi.sizeof('void *')`; Koffi 3 stellt native Adressen als BigInt dar. Die Allokation muss während der Dekodierung gültig und NUL-terminiert bleiben. Bei erfolgreicher Umwandlung bleibt die ursprüngliche Adresse für `CoTaskMemFree` verfügbar; wirft die Dekodierung, wird der String nicht freigegeben.

## Erwogene Alternativen

**Externe Sicht und manuelles Scannen.** Das erfordert External-Buffer-Unterstützung und dupliziert Koffis Stringkonvertierung. Weder eine feste Sicht noch wachsende Chunks ermitteln die native Allokationsgröße.

**String-typisierter Out-Parameter.** `_Out_ str16 *` liefert Text, verwirft aber den für die explizite COM-Freigabe nötigen Zeiger. Die eingebaute `str16!`-Freigabe nutzt den CRT-Allokator statt des COM-Allokators.

**Eigener disposable Typ.** Ein Koffi-Disposable kann `CoTaskMemFree` aufrufen, doch die explizite Umwandlung hält Adresse und Freigabe an einer Aufrufstelle, ohne einen nativen Typ zu registrieren.

## Konsequenzen

Tests mit echtem Koffi üben die produktive Ergebnispfad-Umwandlung über lebende UTF-16-Puffer, einschließlich U+5F00, Surrogatpaaren, NUL-Terminierung und Strings über 32 KiB. Getrennte Vier- und Acht-Byte-BigInt-Fälle verifizieren Zeigererhalt und Freigabe der ursprünglichen Adresse. Testeigene Puffer bleiben während des synchronen Lesens am Leben; die Zeigerbytes werden vor nativer Dereferenzierung geprüft. Die frühere Scanning-Entscheidung bleibt in der [archivierten Notiz](../../archived/bug-fix/2026-08-23-win32-utf16-nul-truncation.md).
