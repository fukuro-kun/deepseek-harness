# Agent Note: Projekt-gruppierte Session-Verzeichnisse

Status: implemented

[English](2026-07-24-project-session-directories.md) | [中文](2026-07-24-project-session-directories.zh.md) | Deutsch

## Problem

Eine Persistence-Root kann lokal zu einem Projekt gehören, von mehreren Projekten geteilt, temporär oder zentralisiert sein. Die gehashten cwd-Buckets hielten alle Deployments funktional, machten aber eine geteilte Root schwer navigierbar, weil ein Entwickler ein Projekt nicht an seinem Verzeichnisnamen erkennen konnte.

Jede JSONL-Session belegte außerdem eine Datei direkt im Projekt-Bucket. Diese Form hatte kein Ownership-Verzeichnis für zusätzliche Session-Artefakte wie Metadaten, Attachments, spill-Dateien oder Koordinations-State.

## Entscheidung

Das JSONL-Backend speichert Sessions unter einem lesbaren Projekt-Key und gibt jeder Session ein eigenes Verzeichnis:

```text
<configured-root>/
  --<normalized-cwd>--/
    <encoded-session-id>/
      session.jsonl.zstd
```

Der Raw-Modus verwendet `session.jsonl`, und Sessions ohne cwd verwenden `_no-cwd`. Dateisystem- und Laufwerks-Trenner werden zu `-`, unsichere Code-Units zu `~XXXX`, und der lesbare Name ist begrenzt, damit die Komponente innerhalb der Dateisystem-Limits bleibt.

Der Projekt-Key hat absichtlich kein Hash-Suffix. Das folgt der bei Coding Agents üblichen menschenlesbaren Konvention und hält den normalisierten Projektpfad als vollständigen Verzeichnisnamen. Die Normalisierung ist verlustbehaftet: Pfade wie `/a/b-c` und `/a-b/c` oder lange Pfade mit demselben behaltenen Präfix teilen sich ein Projektverzeichnis. Ihre unterschiedlichen Session-Ids wählen weiterhin getrennte Session-Verzeichnisse; die Wiederverwendung derselben Session-Id bleibt eine Storage-Kollision und wird abgelehnt.

Case-insensitive Dateisysteme können außerdem bewirken, dass unterschiedlich geschriebene Projekt-Keys auf ein physisches Verzeichnis zeigen. Die Identitätsvalidierung akzeptiert eine solche alternative Schreibweise nur, wenn die Dateisystem-Kanonisierung den gefundenen und den erwarteten Pfad auf denselben Transcript auflöst. Ein abweichender kanonischer Pfad bleibt Korruption, sodass Case-Aliase die Same-Id-Kollisionsprüfung auf case-sensitiven Stores nicht abschwächen.

Die konfigurierte Root bleibt eine Deployment-Entscheidung. Das Layout wählt weder eine globale Root noch verlangt es, dass Projekte eine teilen. Wenn ein Deployment den Storage zentralisiert, bleiben Projektpfade erkennbar; eine projektlokale Root nutzt dieselbe deterministische Struktur.

Die kodierte Session-Id benennt ein Ownership-Verzeichnis, nicht den Transcript selbst. Der nur für Diagnostik bestimmte `locate`-Hook des Backends löst darin den festen Transcript-Pfad für Format-Refusal-Meldungen auf ([Export- und Pre-Release-Trims](../../archived/simplification/2026-08-27-persistence-export-and-pre-release-trims.md) besitzt die Entfernung der Consumer-facing-Pfadabfrage). Discovery ignoriert andere Einträge im Session-Verzeichnis, sodass das Backend Session-eigene Artefakte ohne eine weitere Layout-Änderung hinzufügen kann.

Lazy-Materialisierung bleibt an den Transcript gebunden: `create()` führt kein Dateisystem-I/O aus, und das erste Append legt die Projekt-/Session-Verzeichnisse vor der kollisionssicheren Transcript-Publikation an. Leere Verzeichnisse werden nicht als Sessions gelistet. Das Backend lehnt flache `<project>/<id>.jsonl*`-Artefakte mit einem expliziten Layout-Fehler ab; das Pre-Release-Format bietet keine automatische Datenmigration.

## Erwogene Alternativen

**Opake cwd-Hashes behalten.** Das bewahrte kurze Namen, vereitelte aber die angefragte Navigation per Projektpfad, wenn mehrere Projekte eine Persistence-Root teilen.

**Session-Dateien direkt in jedes Projektverzeichnis legen.** Das entsprach der Basis-Dateiorganisation von Claude Code und pi, ließ aber keine Session-ebene-Ownership-Grenze für künftige Artefakte.

**Ein kollisionsresistentes Hash-Suffix anhängen.** Das unterscheidet Pfade, deren normalisierte Formen kollidieren, macht den Verzeichnisnamen aber mehr als den normalisierten Projektpfad. Die gewählte Konvention akzeptiert eine verlustbehaftete Projektgruppierung im Tausch gegen den einfacheren, erkennbaren Namen.

**Eine zentralisierte Root vorschreiben.** Abgelehnt, weil die Storage-Platzierung zur Deployment-Konfiguration gehört. Projektgruppierung ist nützlich, wenn Roots geteilt werden, und harmlos, wenn nicht.

**Sowohl flaches als auch Verzeichnis-Layout laden.** Abgelehnt unter der Pre-Release-No-Compatibility-Haltung. Ein akzeptiertes Layout hält Identitätsprüfungen und Discovery deterministisch.

## Konsequenzen

Geteilte Stores lassen sich über erkennbare Projektnamen navigieren, während lokale und benutzerdefinierte Roots ihre bestehende Konfigurationsfreiheit behalten. Jede Session hat ein Verzeichnis für künftige Backend-eigene Artefakte verfügbar, und bestehende Transcript-Consumer erhalten weiterhin einen Dateipfad.

Projektverzeichnisnamen sind länger als die früheren 12-Hex-cwd-Hashes. Sehr lange Pfade zeigen nur ein begrenztes Präfix. Das Verschieben eines Projekts wählt üblicherweise ein anderes Verzeichnis, aber unterschiedliche cwd-Strings, die zum selben Namen normalisieren, teilen by design ein Projektverzeichnis.
