# Agent Note: Agent Notes ohne generierten Index auffindbar halten

Status: implemented

[English](2026-07-19-remove-generated-agent-note-index.md) | [中文](2026-07-19-remove-generated-agent-note-index.zh.md) | Deutsch

## Problem

Ein committeter Agent-Note-Index dupliziert Fakten, die bereits durch Lebenszyklus-/Klassenpfad, Datumspräfix im Dateinamen und H1 jeder Datei kodiert sind. Jeder Branch, der eine ansonsten unabhängige Agent Note hinzufügt, verschiebt oder umbenennt, schreibt dieselbe generierte Datei neu und macht dieses Artefakt zu einem vorhersehbaren Merge-Hotspot.

Die zentralisierte chronologische Liste bietet gegenüber dem Durchsehen des Lebenszyklus-/Klassenbaums oder der Repository-Suche wenig zusätzlichen Auffindbarkeitswert, während ihr Generator, Renderer, Befehl und Freshness-Check weiter Wartungslast bleiben.

## Entscheidung

Der Dateisystembaum nach Lebenszyklus und Klasse ist das Agent-Note-Inventar. [README.md](../../README.de.md) bleibt der kuratierte Einstiegspunkt und Vertrag, während gewöhnliche Baumnavigation und Repository-Suche die Auffindbarkeit liefern.

`scripts/agent-note-tree.ts` besitzt die geschlossenen Lebenszyklus-/Klassenmengen und den Struktur-Walker. `verify-agent-note-classification` validiert diesen Baum und weist die alten Ablagen sowie eine Root-`INDEX.md` zurück; es rendert oder freshness-prüft keine zentralisierte Liste.

## Betrachtete Alternativen

**Den committeten generierten Index behalten und Konflikte durch Neugenerieren lösen.** Neugenerieren macht die Konfliktlösung mechanisch, verhindert aber nicht, dass unabhängige Branches dasselbe Artefakt ändern, und reduziert nicht das Review-Rauschen, das es erzeugt.

**Einen nicht committeten On-Demand-Indexbefehl anbieten.** Er vermeidet committete Konflikte, behält aber einen Renderer und einen Befehl für einen Auffindbarkeitspfad, den Baumnavigation und Repository-Suche bereits abdecken.

**Einen handgepflegten Index wiederherstellen.** Er hat dieselbe Shared-File-Konkurrenz und fügt Vollständigkeits- und Reihenfolgefehler hinzu, die die Generierung vermied.

## Konsequenzen

- Hinzufügen, Verschieben oder Umbenennen einer Agent Note ändert keine korpusweite generierte Datei mehr.
- Das Klassifikations-Gate leistet weniger Arbeit, und die Dokumentations-Gate-Topologie gewinnt keinen Prozess oder Stufe hinzu.
- Leser geben eine einzelne chronologische Seite auf und nutzen stattdessen den Lebenszyklus-/Klassenbaum oder die Repository-Suche.
