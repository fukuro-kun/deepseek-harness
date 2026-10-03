# Agent Note: Evidenzgetriebener Performance-Optimierungs-Workflow
[English](2026-09-06-evidence-driven-performance-skill.md) | [中文](2026-09-06-evidence-driven-performance-skill.zh.md) | Deutsch

Status: implemented


## Problem

Performance-Arbeit kann eine isolierte Phase verbessern, während sie Kosten in eine andere Phase verschiebt, mehr Daten zurückhält oder erforderliches Verhalten überspringt. Historische PR-Beschreibungen behalten zudem verworfene Implementierungen und Schätzungen, sodass das Kopieren ihrer scheinbaren Lösung ein abgelehntes Design wiederherstellen kann, statt einen aktuellen Engpass zu beheben.

## Entscheidung

Der [dsh-speed-up-perf skill](../../../skills/dsh-speed-up-perf/SKILL.md) führt breite Untersuchungen hin zu begrenzten, gemessenen Benutzerpfaden. Er kombiniert fokussierte Attribution mit unabhängig getakteten Backend- und Browser-Endpunkten, synthetischen Lastverteilungen, vergleichbaren Kalt-/Warm- und Retained-Memory-Bedingungen sowie Negativkontrollen für verschärfte Budgets. Die historische Evidenz unten unterscheidet gemergte Implementierungen, ersetzte Vorschläge, autorberichtete Messungen und Schätzungen.

Der Workflow verlangt Verhaltensevidenz unabhängig vom Timing: Modell-sichtbare Logs, dauerhafte Generierungs- und Publikationsregeln, Stream-Reihenfolge, Abbruch und dispose bleiben Verpflichtungen. Autorisierte Inspektion des privaten Korpus liefert nur aggregierte Lastinspiration; committete Eingaben und veröffentlichte Artefakte enthalten synthetisches Material. Optimierungs-PRs tragen ihre verschärften Budgets, während eine vorausgehende Benchmark-Schicht die gemessene Baseline schützen und unabhängig mergebar bleiben kann.

Die [Session-Opening-Performance-Gate-Entscheidung](../testing/2026-09-04-session-open-performance-gate.de.md) behält die Zuständigkeit für Lane-Mechanik und Kalibrierung. Der [Simplification-Skill](../../../skills/dsh-find-simplifications/SKILL.md) behält die Zuständigkeit für löschungsorientierte Untersuchungen. Keiner wird ersetzt: Dieser Workflow ergänzt performance-spezifische Kandidatenauswahl, Messvergleichbarkeit und Abbruchkriterien, statt deren Entscheidungen zu ersetzen.

## Historische Evidenz

Dies sind autorberichtete historische Messungen, keine für diesen Workflow erneut durchgeführten Benchmarks. Final gemergte Diffs und der zuständige Quellcode haben Vorrang vor ursprünglichen PR-Beschreibungen. Der abgelehnte Zwischenvorschlag bleibt nur erhalten, um zu erklären, warum Identitäts-Registries keine allgemeine Vorschrift sind.

| Evidenz | Gemessener Pfad und Ergebnis | Wiederverwendbare Lehre |
|---|---|---|
| [#3535](https://github.com/deepseek-harness/deepseek-harness/pull/3535), gemergt | Das [finale Benchmark-Design](https://github.com/deepseek-harness/deepseek-harness/pull/3535#issuecomment-5552779119) berichtet eine First-Open-Negativkontrolle von 4.394 ms gegenüber 550 ms, First-History 4.452 gegenüber 550, Resume 4.333 gegenüber 450 und 128-MB-Heap-Fehlschläge. Client fold: 123,9 ms / 10,84× gegenüber 40 ms / 3,125×. | Built-JS-User-Path-Gates und Positiv-/Negativkontrollen sind wichtiger als ein früheres PR-Body-Design. |
| [#3536](https://github.com/deepseek-harness/deepseek-harness/pull/3536), ungemergt geschlossen | Wiederholte Snapshot-/Freeze-Arbeit belegte etwa 70 % der profilierten CPU; synthetisches Open verbesserte sich von 4.734–4.921 auf 707–823 ms. | Die Streaming-Migration ersetzte diesen Identity-Registry-Vorschlag. Nicht ohne aktuelle Ownership-Evidenz wiederbeleben. |
| [#3585](https://github.com/deepseek-harness/deepseek-harness/pull/3585), gemergt | Historisches physisches Decode: 7,527 s / 7.219 MB Peak-RSS auf 1,467 s / 908 MB; Streaming-Migration mit serieller Publikation: 6,241 s, 2,107 GB Peak, 477 MB retained. Abgerechneter 500.000-Delta-Client-fold: 3,2 ms. | Repräsentationen über Consumers hinweg kompakt halten; Zwischenzustand begrenzen. Attributionsschätzungen überlappen und können nicht addiert werden. |
| [#3586](https://github.com/deepseek-harness/deepseek-harness/pull/3586), gemergt | Aktueller v2-Öffnungs-Snapshot: 2.011,4→1.027,9 ms; Restore: 598,5→16 ms; Retained Heap: 1.025,3→478,7 MB. | Read-only-Vorbereitung von erwarteter Schreib-Publikation trennen; immutable Ownership über revisionsabhängige Vorbereitung und caller-lokale Abbruchlogik teilen. |
| [#3537](https://github.com/deepseek-harness/deepseek-harness/pull/3537), gemergt | Synthetische 200-Turn-Projektion: 28→5,4 ms; Gesamt: 76,9→50 ms; Peak-RSS: 137,2→94,9 MB. | Stats, Usage, Text- und Bild-Referenzen pro kompaktem Record lesen. Expanded-Stream-Caching behält unnötige Repräsentationskosten. Chat/Trajectory gehören zur vorausgehenden Migrationsänderung. |
| [#2587](https://github.com/deepseek-harness/deepseek-harness/pull/2587), gemergt | Historische 416.756 Events, repräsentiert durch 696 Records: Client-History 4.682→276 ms; gesampelter zusätzlicher V8-Peak 612,5→199,4 MB. | Kompaktheit durch Validierung und Folding bewahren; das [Baseline-Review](https://github.com/deepseek-harness/deepseek-harness/pull/2587#discussion_r3803082730) verlangt gleiche Validierung und beibehaltene Ausgabe, nicht Parse-and-Discard. |
| [#3331](https://github.com/deepseek-harness/deepseek-harness/pull/3331), gemergt | 10.000 kollabierte Tool-Zeilen: 22,5→7,5 ms, retained 12,2→1,6 MiB; inaktive Trajectory-Flushes: 4.082→15,5 ms. | Ungenutztes Parsen und Materialisieren aufschieben; erste Aktivierung und retained Context kosten weiterhin Arbeit. |
| [#3391](https://github.com/deepseek-harness/deepseek-harness/pull/3391) und [#3383](https://github.com/deepseek-harness/deepseek-harness/pull/3383), gemergt | Eingeengte Subscriptions, stabile Identitäten, gebatchte Publikation und viewport-getriggertes Highlighting. Die 10.000-Knoten-Timing-Tabelle ist geschätzt, keine Browser-Messung. | Aufschub ist keine Virtualisierung: Besuchtes Token-DOM bleibt retained. |
| [#3292](https://github.com/deepseek-harness/deepseek-harness/pull/3292), gemergt | Zwei-Millionen-Elemente-FIFO-Drain: 9,656 ms Median, Enqueue ausgenommen. | Eine Deque entfernt Shift-Kopieren, nicht Queue-Zulassung oder Backpressure-Verpflichtungen. |
| [#1161](https://github.com/deepseek-harness/deepseek-harness/pull/1161), gemergt | Keyless 100.000-Chunk-Browser-Stress bei 128 Chunks pro 16 ms. | [Producer-Catch-up](https://github.com/deepseek-harness/deepseek-harness/pull/1161#discussion_r3699970161) und [finale Heartbeat-Stalls](https://github.com/deepseek-harness/deepseek-harness/pull/1161#discussion_r3699970162) können Messungen verzerren; geplante Events sind kein vertrauenswürdiges Tastatur-/Zeiger-Input. |

Das [Cancellation-Review](https://github.com/deepseek-harness/deepseek-harness/pull/3586#discussion_r3940578092), das [Source-Revision-Review](https://github.com/deepseek-harness/deepseek-harness/pull/3586#discussion_r3940569241) und das [Typed-Reader-Review](https://github.com/deepseek-harness/deepseek-harness/pull/3537#discussion_r3942974015) veranschaulichen, warum das Entfernen wiederholter Arbeit nicht zum Löschen von Validierungs- oder Publikationspflichten berechtigt. Ein [Standby-Runner-Review](https://github.com/deepseek-harness/deepseek-harness/pull/3535#discussion_r3927945561) unterscheidet einen dedizierten Job von einem isolierten physischen Host.

## Erwogene Alternativen

**Verdächtigen Code vor dem Messen optimieren.** Abgelehnt, weil lokale Komplexität die dominierenden Benutzerkosten nicht identifiziert und weder Verbesserung noch Regressionsschutz belegen kann.

**Historische Beschleunigungen als wiederverwendbare Vorschriften behandeln.** Abgelehnt, weil sich Repräsentations-, Ownership- und Lifecycle-Anforderungen ändern. Historische Evidenz erzeugt Hypothesen; aktuelle Produktionspfade und frische Messungen entscheiden, ob eine Änderung zutrifft.

**Nur Microbenchmarks oder nur End-to-End-Timing verwenden.** Abgelehnt, weil isolierte Phasen verschobene Arbeit auslassen können, während aggregiertes Timing allein deren Ursache nicht lokalisieren kann. Beide sind im zum gewählten Problem passenden Umfang erforderlich.

## Konsequenzen

Der Skill fügt kein Runtime-Verhalten, keine Benchmark-Implementierung und keine neue CI-Policy hinzu. Seine Validierung umfasst Dokument-/Link-Konsistenz und Skill-Metadaten; jede künftige Optimierung liefert ausführbare Messungen und funktionale Evidenz bei ihrem Eigentümer. Der endliche Szenario-/Fix-Umfang verhindert, dass eine breite Performance-Anfrage zu einem unverbundenen Architektur-Rewrite wird.
