# Agent Note: Verbindliches CI-Performance-Gate für das Öffnen großer Sessions
[English](2026-09-04-session-open-performance-gate.md) | [中文](2026-09-04-session-open-performance-gate.zh.md) | Deutsch

Status: implemented


## Problem

Der Rollout des Session-Formats v2 hat zwei Pfade verändert, deren Kosten mit der Modellausgabe wachsen: Das JSONL backend migriert und veröffentlicht ein released-v0 log, und der Client foldet den in jeder abgerechneten Antwort eingebetteten kompakten Stream. Für keinen der beiden Pfade existierte eine ausführbare Performance-Prüfung; das erste Öffnen wuchs deshalb auf einem synthetischen Log mit 127,400 Events von etwa 35 ms auf etwa 5 s (und auf einem realen Log mit 575,000 Chunks von etwa 0,3 s auf 26 s, bei 2,7 GB Peak-RSS und Heap-Erschöpfung unter einem 512-MB-Limit), während das Client fold linear mit den gestreamten Deltas statt mit den kompakten Records wuchs. Diese Regressionen erreichten master unbemerkt.

Allein `SessionPersistence.open()` zu messen beschreibt nicht stabil das Ergebnis, auf das ein Benutzer oder Host wartet. Arbeit kann zwischen `open()`, `SessionHandle.read()`, Session restore und projection wandern, während die erste History-Seite und das kalte Agent resume über diesen Operationen eine eigene Orchestrierung hinzufügen. Eine einzelne `heapUsed`-Stichprobe ohne vorherige GC kann zudem nicht unterscheiden, ob Daten noch von der Session gehalten werden oder ob es sich um rückgewinnbare temporäre Migrationsdaten handelt.

## Entscheidung

Linux-Pull-Requests führen einen verbindlichen `node 24 / benchmarks` job aus, der `pnpm run check:ci:bench` → `pnpm run test:bench` ausführt. Der private `@deepseek-ai/dsh-benchmarks` workspace besitzt die benchmark-exklusiven Abhängigkeiten. Der Befehl baut zunächst die workspace-Bibliotheken und dedizierte Worker unter `benchmarks/.dsh-build/` und ruft anschließend `vitest.bench.config.ts` auf. Die [Entscheidung zum Standard-Hosted-Runner](2026-09-06-standard-hosted-benchmark-runner.de.md) besitzt die Runner-Auswahl und das äußere Job-Timeout. Der Job führt die benchmark lane allein aus; Vitest führt jeweils eine Datei aus und bereitet nur die Eingabe vor, startet Mess-Kindprozesse, aggregiert Ergebnisse und setzt Budgets durch. Jeder getimte Node-CPU-Pfad führt kompiliertes JavaScript unter plain Node aus, mit entferntem `NODE_OPTIONS` und ohne TypeScript-loader; bare workspace imports lösen deshalb von `benchmarks/node_modules` über die package exports zu den gebauten `lib/`-Einträgen auf.

Verbindliche Performance-Gates liegen im Top-Level-`benchmarks/`, gruppiert nach gemessenem Benutzerpfad statt nach package-Zugehörigkeit. Host-Dateien verwenden `*.bench.ts`, Client-seitige Dateien `*.bench.client.ts`; szenariospezifische Worker und fixtures bleiben ohne benchmark-Suffix neben ihrem benchmark. Paketlokale `.perf.ts`-Dateien bleiben nicht gating Diagnosen; `scripts/` besitzt Orchestrierung, nicht benchmark cases.

Die Session benchmarks synthetisieren eine released-v0-Eingabe aus festen Parametern: 200 turns mit je 500 text deltas und 125 reasoning deltas, also 127,400 logische Events. Die Eingabe nutzt Zstandard mit fester Gruppierung logischer Zeilen und fester frame-Aufteilung, sodass jeder Lauf dieselben Events, Bytes und dieselbe frame-Verteilung verarbeitet. Jeder synthetische turn startet seinen step, bevor er user-surface-Eingabe anhängt; so kann die V2-to-V3-Migration einen geschützten system head reservieren, ohne die Historie umzuordnen. Das fixture konstruiert die released-v0 physical rows direkt, statt sich auf einen historischen Encoder der aktuellen Runtime zu verlassen; Kompression und jeder gemessene Lese- oder Migrations-Einstiegspunkt verwenden weiterhin Produktionscode. Das Setup schreibt die Eingabe vor dem Timing in ein privates temporäres Verzeichnis pro Sample; benchmarks verwenden niemals aufgezeichnete Sessions.

Jeder Session-Endpoint läuft an zwei Punkten des Benutzer-Lebenszyklus. `first-open` startet nur mit der released-V0-generation und enthält die Migration; reine Lese-Consumer veröffentlichen keinen Nachfolger, während das beschreibbare Agent resume dies tut. Das Setup erzeugt `post-upgrade-reopen` einmal über dieselbe Produktionsmigration außerhalb der Messung und kopiert anschließend sowohl den unveränderten V0-Vorgänger als auch den veröffentlichten Nachfolger der aktuellen generation in jedes Sample-Root. Reopen-Samples nutzen einen frischen Prozess und messen daher das spätere Disk-Öffnen eines aktualisierten Benutzers ohne Migration oder prozesslokale Caches.

Jedes access-kind- und Endpoint-Sample läuft in einem frischen kompilierten Node-Kindprozess. Modul-Imports, Host-Service-Initialisierung und fixture-Vorbereitung sind vor der Messung abgeschlossen; der gemessene Prozess führt kein zusätzliches Parse-Warm-up durch. Der Normal-Heap-Modus führt fünf unabhängige Samples aus, meldet jedes Sample plus Minimum, Median und Maximum und setzt zugangsarten-spezifische feste Budgets gegen den Median durch. Ein weiterer Kindprozess führt denselben Pfad unter einem festen 128-MB-old-space-Limit aus und prüft nur, dass er abschließt; die durch den eingeschränkten Heap verursachte zusätzliche GC geht nicht in die normale Timing-Basislinie ein.

Die lane enthält drei unabhängige Session-Öffnungs-benchmarks und behält den Client-fold-benchmark:

| Benchmark | Gemessener Pfad | Timing-Metriken |
|---|---|---|
| Phase profile | Führt das echte persistence open, handle read, Session restore und projection sowohl für first open als auch für post-upgrade reopen aus | `openMs`, `readMs`, `sessionRestoreMs` und `projectionMs` haben je ein festes Budget; die Read-only-Migration gehört zu first-open `openMs`; Nachfolger-Encoding, Verifikation und Publikation gehören zum beschreibbaren Agent resume |
| First history | Liest jede access kind über den Host Session history controller, bis dieser den ersten paginierten snapshot liefert | Getrennte first-open- und reopen-End-to-End-Budgets; beide enthalten source stat, Lesen, Restoration, projection, Pagination und snapshot-Konstruktion, first open zusätzlich die Migration; beide schließen Gateway-Netzwerktransport, Client fold und Browser-Paint aus |
| Agent resume | Ruft `ctx.agents.resume()` für jede access kind auf, bis Agent-Erzeugung, Setup, Publikation und loop-Start abgeschlossen sind | Getrennte first-open- und reopen-End-to-End-Budgets; kein Pfad läuft nach first-history oder nutzt dessen Cache wieder |
| Client fold | Foldet kleine und große v2-History-Fenster über den echten `ConversationNodeAssembler` und jede Chat Definition | Die absolute Zeit des großen Fensters und seine Skalierung relativ zum kleinen Fenster haben je ein festes Budget |

Das phase profile ruft den Produktions-Einstiegspunkt jeder Schicht explizit auf und kopiert keinen decode-, Migrations-, restore- oder projection-Algorithmus. First-history und Agent-resume führen ihren jeweils echten übergeordneten Einstiegspunkt gegen frische first-open- und reopen-Roots aus; Komponentenmessungen stehen daher nicht für End-to-End-Ergebnisse, und ein Szenario kann weder den Prozess noch den Session-Cache eines anderen vorwärmen. Die Summe der vier Phasen ist nur diagnostisch; eine äußere Uhr misst jedes End-to-End-Ergebnis unabhängig.

Der Normal-Heap-Modus führt nach der Host-Initialisierung und bevor die kalte Session berührt wird ein festes Paar expliziter Garbage Collections aus und zeichnet dann den Start-Speicher auf. Er stoppt das Operation-Timing, bevor er dieselbe GC-Sequenz ausführt, während die vom Szenario vorgesehenen langlebigen Objekte explizit erreichbar bleiben, und zeichnet dann den End-Speicher auf. Der Agent-resume-Endpoint hält Agent, Session, vollständige Events und normale Service-Caches; sein `heapUsed`-Delta ist das primäre Resident-Session-Speicherbudget. Jedes Szenario meldet zusätzlich `external`, `arrayBuffers`, Post-GC-RSS und `process.resourceUsage().maxRSS`; der 128-MB-Modus verhindert, dass transiente Allokationsspitzen durch die Endpoint-Collection verborgen werden. Explizite GC-Zeit fließt nicht in das Operation-Timing ein.

Ein kleines ungetimtes fixture-Vorbedingung verifiziert die aktuelle Migration, die Nachrichtenerhaltung, die unveränderten V0-Bytes und das Wiederöffnen des Nachfolgers. Worker-Fehler behalten die ersten und letzten zehn stderr-Zeilen oder fatale Heap-Diagnosen, sodass eine Setup-Ablehnung von einem Budget-Bruch unterscheidbar bleibt. Die getimten Performance-Fälle duplizieren nicht die semantischen Assertions funktionaler Tests; sie verlangen nur, dass der Zielaufruf abschließt und seinen gemessenen Endpoint erreicht. Der Client-fold-benchmark nutzt weiterhin den echten `ConversationNodeAssembler` und jede Chat Definition und verlangt, dass sowohl die absolute Zeit des großen Fensters als auch seine Skalierung relativ zum kleinen Fenster unter festen Budgets bleiben.

Budgets werden pro gemessenem Endpoint kalibriert. Zwei wiederholte Node-24.19-x64-CI-Läufe weichen in ihren Medianen um höchstens 5,2% voneinander ab; ihre CPU-lastigen Wall-Times betragen das 1,95–2,06-Fache des Node-24.18-arm64-Referenzlaufs. Mit Ausnahme des Current-generation `open` und des first-open Agent resume zeichnen Source-Konstanten die erwarteten Referenzmaschinen-Dauern auf; `ciTimeBudget()` multipliziert sie mit dem gemessenen 2×-CI-Zeitfaktor und der 1,25×-Varianzreserve. Das Current-generation `open` nutzt eine direkt gemessene Standard-Runner-Erwartung von 50 ms mit nur der 1,25×-Reserve, aufgerundet auf ein 63-ms-Budget. First-open Agent resume nutzt ein geprüftes 562-ms-Hosted-Limit. Die Budgets für retained heap und Client-fold-Skalierung nutzen nur die 1,25×-Reserve, da keines eine Wall-Clock-Dauer ist. Die 128-MB-Abschlussprüfung bleibt ein unabhängiges Transient-Allokations-Limit. Die resultierenden first-open-Zeitlimits, Constrained-Heap-Prüfungen und Client-fold-Limits lehnen die bekannten Regressionen allesamt ab. Der Pre-stack-Commit `0d7ea53743e273930a31e9e2b6ca682f21dd4ca5` ist die feste Kalibrierungs- und Review-Referenz; die CI checkt das historische Repository nicht aus und führt es nicht aus. Budgets sind geprüfte Source-Konstanten ohne Environment-Variablen-Override.

## Kalibrierungsnachweise

Der Vergleich ist entlang des Benutzer-Lebenszyklus orthogonal, nicht entlang der Artefakt-Repräsentation. Beide Implementierungen erhalten für first open dieselben festen V0-Bytes. Beim reopen liest jede Implementierung in einem frischen Prozess das Format, das sie als aktuell ansieht: Die Pre-stack-Referenz bleibt bei V0, während die V2-Implementierung ihren veröffentlichten V2-Nachfolger liest. Dies vergleicht bewusst das spätere Öffnen desselben Benutzers, nicht zwei Codecs über einer Datenstruktur.

Fünf-Sample-Mediane auf derselben Node-24-Referenzmaschine etablieren die positiven und negativen Kontrollen:

| Access kind | Implementierung | Vier-Phasen-Summe | First history | Agent resume | Agent retained heap | 128 MB old space |
|---|---|---:|---:|---:|---:|---|
| First open | Pre-stack-Referenz | 249.0 ms | 253.8 ms | 100.7 ms | 26.1 MB | Schließt ab |
| First open | Repeated-snapshot-Regression | 4,197.5 ms | 4,284.8 ms | 4,197.9 ms | 4.4 MB | Erschöpft Heap |
| Post-upgrade reopen | Pre-stack-Referenz | 251.1 ms | 253.8 ms | 100.7 ms | 26.1 MB | Schließt ab |
| Post-upgrade reopen | Repeated-snapshot-Regression | 49.2 ms | 50.4 ms | 43.8 ms | 4.5 MB | Schließt ab |

Die Pre-stack-Implementierung behält V0 als ihr aktuelles Format, sodass first open ihre On-Disk-Repräsentation nicht verändert; ihre nativen V0-first-history- und Agent-resume-Messungen gelten daher für beide Lebenszyklus-Zeilen.

Der [Standard-Zwei-CPU-Lauf](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34023970384/job/101461539961) auf `ca3ffe95dac2c55eefeb16ed9b61067bbd19ee90` nutzt Node 24.20.0 x64 und das Ubuntu-Image `20260831.293.1`. Seine fünf Current-generation-`open`-Samples sind 49.2, 47.4, 49.1, 48.6 und 48.1 ms: Median 48.6 ms, Maximum 49.2 ms. Die gerundete 50-ms-CI-Erwartung ergibt ein 63-ms-Limit ohne erneute Anwendung des 2×-Maschinenfaktors. Das Log nennt zwei verfügbare CPUs, aber nicht ihr Modell; es isoliert Hardware- nicht von Node-Versionsänderungen. Dies ist eine endpoint-spezifische Runner-Kalibrierung, kein Nachweis einer Anwendungsoptimierung oder einer neuen Referenzmaschinen-Messung. Jeder andere benchmark besteht sein bestehendes Budget. Deterministische Kontrollen lehnen den beobachteten Median am historischen 30-ms-Limit ab, akzeptieren ihn bei 63 ms, lehnen einen synthetischen 75-ms-reopen-Median ab und lehnen eine synthetische 4,000-ms-first-open-Dauer am unveränderten 550-ms-Limit ab. Diese Kontrollen verifizieren die Budget-Durchsetzung, nicht eine gemessene neue Regression.

Eine Packaging-Änderung des cold verifier entfernt das Laden von workspace-Modulen zur Laufzeit, ohne diese Budgets oder den gemessenen Endpoint zu ändern. Auf macOS arm64 mit Node 24.18.0 dauert dasselbe 127,400-Event-fixture auf `ac48359b195558806ee5a2286697074fd1a52815` für das erste beschreibbare resume 164.2, 162.4, 159.7, 149.3 und 167.7 ms (Median 162.4 ms). Das Bundling des verifier über den workspace build ergibt 119.8, 120.9, 121.9, 122.3 und 121.8 ms (Median 121.8 ms, 25% niedriger). Retained heap bleibt bei 5.4 MB; der Median des peak RSS ändert sich von 144.9 auf 143.7 MB. Reopen-Mediane sind 27.5 und 27.1 ms, und alle 16 Session-Fälle einschließlich der 128-MB-Abschlussprüfungen bestehen. Ein CPU-Profil führt einen Teil der Kosten des alten verifier auf Modulauflösung und -kompilierung zurück. Der Isolated-package-Built-worker-Test scheitert auf dem ursprünglichen worker, weil dessen workspace imports nicht auflösen, und besteht mit dem gebündelten worker einschließlich der Ablehnung einer falschen Event-Anzahl. Diese lokalen Ergebnisse begründen kein Linux-Runner-Timing; diese Fälle nutzen das 450-ms-CI-Limit.

Der [Hosted-Lauf auf `a7884138be`](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34265057987/job/102192211510) enthält den gebündelten verifier und meldet first-open-Agent-resume-Samples von 454.2, 454.8, 455.4, 457.8 und 459.8 ms: Median 455.4 ms gegenüber 450 ms. Der code-äquivalente [vorhergehende Lauf](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34263062688/job/102185561214) meldet einen 436.2-ms-Median; nur die zweisprachige Request-History-README und ihr Pairing-Record unterscheiden sich zwischen diesen Heads. Die geprüfte Obergrenze ist 562 ms, `floor(450 × 1.25)`, ein Anstieg um 24.89%, der 23.4% über dem beobachteten 455.4-ms-Median liegt. Fünf frische M4-Pro-/Node-24.19-Samples liegen bei 150.07–158.22 ms mit einem 152.57-ms-Median. Ein begrenztes Main-Thread-Profil findet keine offensichtliche kleine Optimierung; es schließt verifier-Thread-CPU aus und belegt nicht die Ursache der Hosted-Varianz. Kontrollen lehnen den aufgezeichneten Median bei 450 ms ab, akzeptieren ihn bei 562 ms und lehnen 600 ms ab. Die Bundled-verifier-Verbesserung, Workload, übrige Zeitbudgets, geteilte Skalierung und Speicherlimits bleiben intakt.

Die kalibrierten Source-Budgets sind:

| Messung | Referenz-Erwartung | CI-Budget |
|---|---:|---:|
| First-open `open` | 220 ms | 550 ms |
| Current-generation `open` | 12 ms (historische Referenz; CI-Erwartung: 50 ms) | 63 ms |
| Complete read | 8 ms | 20 ms |
| Session restore | 24 ms | 60 ms |
| Projection | 14 ms | 35 ms |
| First-open first history | 220 ms | 550 ms |
| Current-generation first history | 48 ms | 120 ms |
| First-open Agent resume | 180 ms (historische Referenz) | 562 ms |
| Current-generation Agent resume | 40 ms | 100 ms |
| Agent retained heap | 26.1 MB | 33 MB |
| Client-fold absolute Zeit | 16 ms | 40 ms |
| Client-fold Delta-Skalierung | 2.5× | 3.125× |
| Constrained old space | — | 128 MB |

## Erwogene Alternativen

**Den historischen Commit auschecken und bei jedem CI-Lauf vergleichen.** Abgelehnt, weil ein historischer Checkout ein separates install erfordert und alte und aktuelle Revisionen Arbeit unterschiedlichen API-Phasen zuordnen können, was Laufzeit-, Abhängigkeits- und Interface-Drift hinzufügt. Ein fester Workload mit statischen, gegen positive und negative Kontrollen kalibrierten Budgets ist leichter zu reproduzieren und zu prüfen.

**Nur first open ab V0 messen.** Abgelehnt, weil Migration ein einmaliger Upgrade-Kostenpunkt ist und spätere Öffnungen der abgerechneten aktuellen generation nicht vor Regressionen schützen kann. Die beiden access kinds brauchen getrennte Messungen und Budgets.

**Nur die vier Komponentenphasen messen.** Abgelehnt, weil Komponentenmessungen Kosten lokalisieren, aber source stat, Orchestrierung, Pagination und snapshot-Konstruktion auslassen und nicht beweisen können, dass der vollständige first-history-Pfad nutzbar und schnell genug bleibt.

**Nur die Gesamtzeit von first-history oder Agent-resume messen.** Abgelehnt, weil eine End-to-End-Zahl das Ergebnis schützt, aber nicht erkennen lässt, ob storage, Lesen, Session restoration oder projection regressiert sind; vier Phasenbudgets behalten die zuordenbare Attribution.

**Feingranulare Timing-Instrumentierung in Produktionsimplementierungen einbauen.** Abgelehnt, weil diese Probes Produktions-APIs aufblähen und den benchmark an Implementierungsdetails koppeln würden. Tests nutzen bestehende Service- und Objektgrenzen; Kosten, die diese Grenzen nicht zuordnen können, bleiben Teil des End-to-End-Ergebnisses.

**Gemessene worker aus TypeScript-Quelle ausführen.** Abgelehnt, weil ein Source-loader die Modulauflösung und das Startverhalten ändert und verschachtelte worker reine Source-Bootstrap-Pfade wählen lässt. Vitest bleibt ein ungemessener Orchestrator; jeder getimte worker führt das Build-Output exakt so aus wie plain-Node-Consumer.

**Nur Zeitbudgets oder nur Post-GC-Speicher verwenden.** Abgelehnt, weil Zeit keine Speicherregressionen offenbart und Endpunkt-Live-Speicher keine transienten Migrationsspitzen zeigt. Normal-Heap-Post-GC-Deltas und Constrained-Heap-Abschluss decken die beiden Risiken getrennt ab.

**Den realen aufgezeichneten Korpus benchmarken.** Abgelehnt, weil Korpus-fixtures per Policy klein bleiben, aufgezeichnetes Material nicht zur benchmark-Eingabe werden darf und ein Re-Recording den Workload still verschieben würde.

**Benchmarks in einem bestehenden Gate-Aggregat ausführen.** Abgelehnt, weil Aggregat-Gates auf einem Runner nebenläufig laufen und Wall-Clock-Messungen dadurch die CPU-Last der Nachbarn erben.

**Jedes cross-package-Gate unter einem beteiligten Produkt-package halten.** Abgelehnt, weil das Session-Öffnen persistence, migration, projection, Host history und Agent resume überspannt; die Wahl eines Beteiligten erzeugt irreführende Ownership und reine benchmark-Package-Abhängigkeiten. Der Repository-Level-Tree besitzt den integrierten Benutzerpfad, während paketlokale Diagnosen bei ihrer Implementierung bleiben.

**Benchmark cases unter `scripts/` legen.** Abgelehnt, weil scripts Befehle, Generatoren und Orchestrierung besitzen, während ein benchmark case typisierte Testdateien, worker, fixtures, Budgets und Lifecycle-Cleanup besitzt. Ein künftiger Reporting- oder Kalibrierungsbefehl kann `benchmarks/` konsumieren, ohne die cases dorthin zu verschieben.

## Konsequenzen

Jeder Pull Request bezahlt einen verbindlichen Linux-Job; dessen Session-Anteil führt mehrere kurzlebige Kindprozesse aus und erhält dafür kalte Caches, isolierte V8-Heaps, expliziten GC-Zustand und zuordenbare Fehler. Der Repository-Level-benchmark-Tree akzeptiert bewusste Cross-package-Test-Abhängigkeiten, ohne Produkt-package-Manifeste zu ändern. Der feste Zstandard-Workload deckt sowohl Event-Volumen als auch frame-Topologie ab; first-open-Messungen schützen das einmalige Upgrade-Erlebnis, reopen-Messungen verhindern Regressionen späterer Öffnungen, Phasenbudgets lokalisieren Kosten, first-history-Budgets schützen das benutzer-sichtbare Warten, Agent-resume-Budgets und Post-GC-Deltas schützen die vollständige kalte Aktivierung und den Resident-Speicher, und der 128-MB-Modus schützt das transiente Allokations-Limit.

Die Session- und Node-fold-Szenarien messen weder Netzwerktransfer, Browser-Rendering noch aufgezeichnete Sessions und sind kein kontinuierliches Performance-Trend-System. [Frontend-Performance-Budgets](2026-09-06-frontend-performance-budgets.de.md) besitzen die Browser-Workflow-Messungen. Eine Node- oder Runner-Änderung erfordert ein erneutes Samplen desselben Workloads und eine Prüfung der Budgets; eine Änderung der Geschäftsimplementierung darf ein Budget nicht ohne neue positive und negative Kontrolldaten lockern.
