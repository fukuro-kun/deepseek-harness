# Agent Note: Root marker metadata failures

Status: implemented

[English](2026-09-03-root-marker-metadata-failures.md) | [中文](2026-09-03-root-marker-metadata-failures.zh.md) | Deutsch

## Problem

Die Project-Root-Discovery probiert jeden konfigurierten Marker, während sie vom Session-Arbeitsverzeichnis nach oben läuft. Jeden Resolve- oder Stat-Fehler als fehlenden Marker zu behandeln lässt einen Permission-, I/O- oder Provider-Fehler in ein Ancestor-Projekt weiterlaufen und unbeteiligte Workspace-Instruktionen laden. Das Discovery-Ergebnis muss bestätigte Abwesenheit von nicht verfügbaren Metadaten unterscheiden.

## Decision

Die Root-Marker-Discovery läuft nur dann weiter nach oben, wenn Host-Stat `ENOENT` oder `ENOTDIR` meldet oder ein Filesystem-Provider keine Stat-Information zurückgibt beziehungsweise `FS_NOT_FOUND` aus Resolution oder Stat meldet. Sie rewirft jeden anderen Marker-Fehler unverändert, nachdem sie Cancellation geprüft hat. Instruction-File-Kandidaten behalten ihre separate Verfügbarkeits-Policy: Resolution-, Stat- und Read-Fehler überspringen nur diesen Kandidaten, weil Dateien mit der Discovery racen können, ohne die Projektidentität zu ändern.

## Alternatives considered

**Jeden Marker-Fehler als Abwesenheit behandeln und weiter nach oben laufen.** Verworfen, weil ein unzugängliches Child-Verzeichnis Instruktionen eines unbeteiligten Ancestor-Projekts erben könnte, während die Discovery Erfolg meldet.

**Beim ersten nicht verfügbaren Marker stoppen und das Session-Arbeitsverzeichnis als Root verwenden.** Verworfen, weil es einen unbekannten Project-Root in eine andere Projektidentität verwandelt und gültige breitere Instruktionen still auslassen kann.

## Consequences

Die Project-Root-Discovery bevorzugt korrekte Projektidentität gegenüber Verfügbarkeit: Ein einziger Nicht-Missing-Metadatenfehler irgendwo im Ancestor-Walk lässt das Baseline-Loading mit dem ursprünglichen Fehler ablehnen. Instruction-File-Kandidatenfehler behalten ihr bestehendes Skip-Verhalten. Eine fehlgeschlagene Baseline erzeugt kein Workspace-Context-Session-Event, sodass der schlüssellose Recorded-Session-Harness für diesen Pfad keinen durable Output hat.

## Verification

Fokussierte Unit-Tests decken bestätigte Provider-Abwesenheit sowie nicht verfügbare Host- und Provider-Marker-Metadaten ab. Die Unavailable-Fälle beweisen zudem, dass Ancestor-Instruktionen nicht in die abgeleitete Modellhistorie gelangen.
