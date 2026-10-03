# Agent Note: Parallele Pre-Push-Gates
[English](2026-07-06-parallel-pre-push-gates.md) | [中文](2026-07-06-parallel-pre-push-gates.zh.md) | Deutsch

Status: implemented


Der Local-Hook-Teil dieses Eintrags wurde durch [Fast local Git hooks](../../archived/process/2026-07-22-fast-local-git-hooks.md) ersetzt. Der begrenzte Gate-Scheduler und die `publint`-Parallelität auf Package-Ebene gelten weiterhin für CI, `doc-sync` und explizite lokale Befehle. Die Fail-Fast-Option des Schedulers ist in [Gate-runner fail-fast](../../archived/process/2026-08-27-gate-runner-fail-fast.md) dokumentiert.

## Problem

Aggregat-Jobs wie die Dokumentationssynchronisation verbergen lange sequentielle Ketten, deren Mitglieder read-only und unabhängig sind. Die Duplikation ihres Blatt-Inventars in Workflow-YAML gibt künftigen Skriptänderungen mehrere Stellen zum Auseinanderdriften, während serielle Package-Publikations-Checks ein Gate zeitlich proportional zur Package-Anzahl verbrauchen lassen.

## Entscheidung

[scripts/run-gates.ts](../../../../scripts/run-gates.ts) besitzt den begrenzten Scheduler, den CI, `doc-sync` und der Opt-in-Befehl `check:all` verwenden. Er expandiert benannte Modi zu Blatt-Gates, lehnt leere oder mehrdeutige Abhängigkeitsgraphen vor dem Start eines Childs ab, respektiert Artifact-Abhängigkeiten, puffert zuordenbare Ausgabe standardmäßig, meldet Exit- und Signal-Ergebnisse unabhängig und akzeptiert `DSH_GATE_CONCURRENCY`, wenn ein Aufrufer eine andere Worker-Grenze braucht. Eine `needs`-Kante verlangt, dass der Vorgänger besteht, und überspringt den Abhängigen andernfalls; eine `after`-Kante wartet auf ein beliebiges terminales Ergebnis und erlaubt dem Nachfolger dann zu laufen. Ein mit `allowFailure` markiertes Gate meldet sein Ergebnis weiterhin, lässt das Aggregat aber nicht fehlschlagen.

Lange Koordinator-Gates, deren eigene Subprozesse brauchbare Attribution bewahren, können `streamOutput` aktivieren. Ihre stdout- und stderr-Ausgabe erreicht den Parent sofort, ohne gepuffert oder bei Abschluss erneut gedruckt zu werden. Partitionierte Coverage und parallele Web-Snapshots verwenden diesen Modus, damit ein Fehler mitten im Lauf sichtbar ist, ohne auf Geschwister-Arbeit zu warten.

Der Node-24-Consumer-Job ist ein Zehn-Gate-Modus statt eines Shell-verwalteten Prozess-Pools. Seine Default-Worker-Zahl entspricht seiner Gate-Anzahl, während die Pull-Request-CI aktive Gates auf acht begrenzt und Abhängigkeiten die Bereitschaft steuern. Build und Source-Kompatibilität starten sofort; nach dem Build laufen `publint` und die Built-Package-Invarianten-Validierung parallel. Lint, beide Snapshot-Suiten, Dokumentations-Typechecking, NodeNext-Typechecks und Built-Bin-Smokes warten darauf, dass der Invarianten-Validator seine temporären Package-Ansichten entfernt.

[scripts/publint-all.ts](../../../../scripts/publint-all.ts) entdeckt Packages aus `packages/<group>/<pkg>` und führt `publint` mit einem Worker-Pool aus, dessen Größe aus `availableParallelism()` bestimmt wird. `DSH_PUBLINT_CONCURRENCY` kann die Worker-Zahl für lokale Maschinen und CI-Runner mit unterschiedlichen Ressourcenprofilen begrenzen oder erhöhen. Ergebnisse werden pro Package gepuffert und in deterministischer Package-Reihenfolge gedruckt, sodass parallele Ausführung den Log-Block jedes Packages nicht durcheinanderbringt.

Die Per-Gate-Package-Skripte bleiben das Vokabular für ad-hoc lokale Läufe. `hygiene` ruft einen Scheduler-Modus auf, der dieselben dreizehn Checks mit der lokalen Vier-Worker-Grenze enthält, während `doc-sync` seine Member-Liste im Scheduler besitzt ([doc-sync über den Gate-Scheduler](../../archived/process/2026-07-21-doc-sync-through-gate-scheduler.md)).

## Verifikation

[scripts/run-gates.spec.ts](../../../../scripts/run-gates.spec.ts) lehnt ungültige Graphen ab, bevor der Executor läuft, pinnt pass-required- und settle-only-Reihenfolgen, pinnt die hygiene-, consumer- und nativen Windows-Inventare samt ihrer Fehlersemantik, übt Signal-Termination über einen realen Child-Prozess aus und beweist, dass gestreamte Ausgabe sofort und ungepuffert ist. [scripts/publint-all.spec.ts](../../../../scripts/publint-all.spec.ts) lehnt einen fehlenden öffentlichen Export ab, bevor downstream Artifact-Consumers laufen.

## Erwogene Alternativen

- **Aggregat-Jobs seriell halten** — einfachere Ausführung, macht die Wanduhr aber zur Summe unabhängiger Checks und wiederholt den Kommando-Wrapper-Start.
- **Ein CI-Job pro Blatt-Gate deklarieren** — maximiert Workflow-Parallelität, wiederholt aber Checkout-, Setup- und Install-Overhead und dupliziert das Scheduler-Inventar in YAML.
- **Hintergrund-Unterbefehle in Shell-Skripten** — parallelisiert Arbeit, verliert aber Per-Gate-Timing, deterministische Fehlergruppierung und geradlinige Signalbehandlung.
- **Stdio für jedes Gate erben** — macht Fortschritt sofort sichtbar, verschachtelt aber gewöhnliche unabhängige Gates und verwirft den zuordenbaren Ausgabe-Datensatz des Schedulers. Streaming bleibt eine explizite Gate-Eigenschaft.
- **Ein `publint`-Job pro Package deklarieren** — maximiert Package-Parallelität, erzeugt aber ein handgepflegtes Package-Inventar, das bei Package-Änderungen driftet.
- **`publint` mit unbegrenzter Parallelität ausführen** — minimiert die Laufzeit auf kleinen Repositories nur durch ein Glücksspiel mit Prozesszahl, Speicherdruck, Package-Tarball-Erzeugung und lesbaren Logs.

## Konsequenzen

Scheduler-gestützte Befehle nehmen die langsamste Abhängigkeitskette statt der Summe unabhängiger Gates und melden das dominierende Gate. Ungültige Graphen scheitern vor Teilausführung. Der Preis ist ein maßgeschneiderter Scheduler mit explizitem Modus-Inventar.

Die Consumer-Validierungskette verzögert validierte-Artifact-Consumers und Lint, bis die geteilte Artifact-Ansicht als bekannt-gut gilt und das transiente Staging weg ist; diese Downstream-Gates können sich weiterhin untereinander überlappen. `publint` braucht den Build, nicht aber die gestagete Validierungsansicht, sodass es den Validator überlappt statt die Kette zu verlängern.

Die meisten Gates behalten deterministische Ausgabe-Blöcke. Ausgewählte lange Koordinatoren tauschen Gate-übergreifende Reihenfolge und gepufferte Logs gegen sofortige Diagnostik, während ihr Endstatus der Aggregat-Zusammenfassung verfügbar bleibt.

`publint-all.ts` ist asynchron und puffert Kommando-Ausgabe, statt stdio live zu erben. Der Gewinn ist Package-Parallelität mit stabiler Ausgabereihenfolge und einer Umgebungsvariable zur Ressourcensteuerung.
