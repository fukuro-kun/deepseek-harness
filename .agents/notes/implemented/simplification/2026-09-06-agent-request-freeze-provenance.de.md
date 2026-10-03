# Agent Note: Nur loop-bewiesene Message-Freezes wiederverwenden

Status: implemented

[English](2026-09-06-agent-request-freeze-provenance.md) | [中文](2026-09-06-agent-request-freeze-provenance.zh.md) | Deutsch

## Problem

Lange Tool-Konversationen traversieren beim Request-Bau wiederholt die immutable History. Die [Backend-Continuation-Baseline](../testing/2026-09-06-backend-continuation-performance.md) attribuiert 132,876 ms gesampelte CPU-Self-Time auf `buildRequest`s `deepFreeze` während einer 211,300-ms-Request-History-Operation. Alle frozen Roots zu überspringen ist unsicher: Restore übernimmt unabhängig besessene Graphen, ohne sie zu freezen, und eine shallow-gefrozene Message kann noch mutable Content enthalten.

## Entscheidung

Jeder `ReactLoopAgent` besitzt ein privates WeakSet<Message>, das nur Identitäten enthält, deren vollständiger `deepFreeze`-Aufruf in dieser Instanz erfolgreich war. Jede ungesehene Message wird in-place deep-gefroren und dann hinzugefügt. Spätere Requests verwenden diesen Beweis wieder. Ein frischer Loop beweist jede Identität erneut; gleiche Message-IDs begründen keine Objektidentität. Schwache Referenzen fügen kein Ownership von compacter History hinzu.

Der Loop deep-friert den kleinen lokalen canonical Header bei jedem Request. `canonicalHeader` teilt geschachtelte Werte, und `Session.append` friert einen separaten Snapshot: Keine der beiden Operationen beweist die lokalen Tools oder das Stop-Array eines `NO_ADAPTER`-Fallbacks als immutable. Der Loop friert separat sein frisches Messages-Array und den Request-Envelope, behält `markAgentLoopRequest` und lässt das live `AbortSignal` mutable. Restored-Message-Identität und die Mutabilität der enthaltenden Event-Wrapper bleiben unverändert.

Dies spezialisiert den Request-Bau, nicht das Session-Ownership oder das allgemeine `deepFreeze`-Verhalten. `Session.deriveMessages` und `fromRestore` bleiben unverändert. LLM-File-, Image- und Replay-Projektionen behalten ihre eigenen Freezes, weil ihre neu erzeugten Werte keinen loop-lokalen Beweis haben. Die [Reconstructable-Request-Entscheidung](../architecture/2026-07-05-reconstructable-requests.md) bleibt weiterhin Owner der beobachtbaren Immutabilität und der geloggten Request-Rekonstruktion.

## Messbelege

Apple M4 Pro, macOS arm64, Node 24.19.0; unabhängige Worktree-Dependencies und gebaute Artefakte. Die exakte Parent-Agent-Quelle bei 1dc3296eba wird für die Negativkontrolle neu gebaut, dann wird die optimierte Quelle wiederhergestellt und neu gebaut. Jede Zeile behält alle fünf Fresh-Process-Summen in Sampling-Reihenfolge; alle Zeitangaben sind Millisekunden. Exklusive Slots überlappen weder Repository-Builds noch Geschwister-Benchmarks.

| Implementierung und UTC-Intervall (2026-09-06) | Request-History-Rohsummen | Median | 175-ms-Urteil |
|---|---|---:|---|
| Optimiert, 07:15:40–07:15:51 | 65.737375, 67.292833, 68.035208, 65.380417, 67.919167 | 67.292833 | Pass |
| Original, 07:17:06–07:17:10 | 249.050708, 238.275291, 242.172084, 250.093166, 246.130875 | 246.130875 | Fail |
| Optimierte Wiederholung, 07:18:17–07:18:20 | 66.693500, 67.402083, 68.665000, 66.642083, 66.609125 | 66.693500 | Pass |

Dieselbe History aus 800 Turns mit vier Tools pro historischem Turn und 40 Live-Requests schließt in jeder Stichprobe ab: 13.923 Events, keine Live-Tool-Calls. Der Wiederholungsmedian liegt 72,9 % unter dem isolierten Original. Die historische 70-ms-M4-Erwartung rundet über beide optimierten Mediane; die Anwendung des geteilten 2×-CI-Faktors und des 1,25×-Headrooms ergab das in der Tabelle verwendete 175-ms-Budget. Diese bleiben lokale Referenzmessungen, keine Hosted-Runner-Erwartungen. Die explizite Hosted-Calibration unten besitzt das durchgesetzte Request-History-Budget; kein anderer Fall und kein Memory-Budget ändert sich hier.

Der erste optimierte Slot misst außerdem kalte Tool-Continuation: Summen 185.839958, 185.235583, 185.865917, 189.213459, 185.279417; Median 185.839958 ms. Jede Stichprobe schließt 40 Requests und 160 Tool-Calls mit 14.143 Events ab. Retained-Heap-Samples sind 22.591591, 22.590355, 22.594795, 22.591743, 22.594681 MiB, unter dem unveränderten 28,75-MiB-Budget. Die frühere Baseline von ungefähr 22,295 MiB zeigt die kleinen Kosten der Provenance-Tabelle; schwache Keys verhindern, dass die Tabelle selbst ersetzte Messages zurückhält.

Das Shipped-SDK-Profile desselben Slots schließt pro Stichprobe 100 Turns, 200 Requests und 800 echte Reads ab. Summen sind 1428.555292, 1160.396333, 1139.843500, 1135.834750, 1155.890334 ms; Median 1155.890334 ms. Die erste Stichprobe enthält 461.829250 ms Boot-Zeit gegenüber 164–169 ms bei den anderen und wird behalten, nicht verworfen. Provider-Serialisierung, Netzwerkzeit und Browser-Rendering bleiben wie vom Baseline-Owner spezifiziert ausgeschlossen.

Ein früherer Original-Code-Lauf um 06:58:28 UTC überlappt wegen Scheduling-Message-Latenz einen Geschwister-Build: Summen 264.269792, 282.442000, 365.836334, 293.172791, 288.719500 ms; Median 288.719500 ms. Er scheitert ebenfalls an 175 ms, ist aber kein Calibration-Beleg. Die isolierte Original-Zeile ersetzt diesen Vergleich, ohne die kontaminierten Samples zu entfernen oder wegzumitteln.

### Standard-Hosted-CI-Calibration

Die Standard-Lane mit zwei CPUs `ubuntu-24.04` läuft Node 24.20.0. [Run 34033336380, Job 101487280801](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34033336380/job/101487280801) misst den optimierten Request-Pfad am Merge-Commit `8fba64d9ae06d1a9a778a95487bb915d24cb0644` in Azure eastus: 183.355397, 184.468253, 185.042397, 182.160790, 182.924728 ms; Median 183.355397 ms. Jede Stichprobe schließt dieselben 40 Requests und 13.923 Events ab. Alle fünf überschreiten das historische 175-ms-Budget, ohne die WeakSet-Implementierung oder die Workload zu ändern.

Ein zweiter Hosted-Lauf derselben Request-Implementierung, [Run 34033336246, Job 101487216170](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34033336246/job/101487216170), zeichnet 145.644577, 144.204300, 143.072572, 145.985903, 146.834474 ms auf; Median 145.644577 ms. Er nutzt dasselbe Ubuntu-Image und dieselbe Node-Version, aber einen anderen Worker in Azure westus3 am Merge-Commit `c366e49`. Dieser schnellere Lauf ersetzt weder den eastus-Beleg noch begründet er, warum die Worker differieren. Der ältere Self-Hosted-Lauf `VM-7-113-ubuntu-ci-9` mit Node 24.18.1 ([Run 34021903421, Job 101456015028](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34021903421/job/101456015028)) zeichnet 110.025154, 119.958978, 108.266860, 107.557950, 108.538902 ms auf; Median 108.538902 ms. Sein Runner und seine Node-Version kalibrieren die Standard-Hosted-Lane nicht.

Das aktuelle Request-History-Median-Limit ist 297 ms. Es ist die größte Ganzzahl innerhalb einer 25%-Erhöhung gegenüber dem initialen 238-ms-Limit: `floor(238 × 1.25) = 297`, eine Erhöhung um 24,79 %. Diese Zulage gehört nur `agent-continuation/request-history`; der geteilte Zeitfaktor, der Varianz-Headroom, andere Zeitlimits, Memory-Limits, die Stichprobenzahl und die Workload bleiben unverändert.

Die Standard-GitHub-Actions-`ubuntu-24.04`-Runner-Gruppe meldet für die beiden Release-Messungen unten dasselbe Image `20260831.293.1` und Node 24.20.0. Die Worker unterscheiden sich (`1000050430` und `1000050689`), aber ihre Hardware- und Ressourcenbedingungen sind durch die Logs nicht belegt. Request-History-Runtime und Workload sind zwischen den beiden Heads identisch: 800 historische Turns, vier Tools pro historischem Turn, 40 Live-Requests und 13.925 finale Events. Der frühere Referenzlauf liefert eine weitere langsame Beobachtung.

| Hosted-Messung | Request-History-Rohsummen (ms) | Median (ms) |
|---|---|---:|
| [Release `f778396b2e`](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34233932940/job/102086694864) | 152.649609, 154.616595, 144.588531, 144.261013, 154.017377 | 152.649609 |
| [Release `a0a61a8237`](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34235890227/job/102095345914) | 246.876615, 246.881047, 272.370218, 265.796833, 272.507507 | 265.796833 |
| [Referenz `35fcb95275`](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34232504298/job/102084171717) | 279.689489, 297.792849, 263.178391, 252.660292, 251.267361 | 263.178391 |

Die ersten beiden Jobs unterscheiden sich außerdem in Tool-Continuation (483.877/698.657 ms), Catalog (612.127/1009.367 ms) und Profile-Continuation (2438.362/3854.950 ms). Diese Beobachtungen belegen breite Hosted-Execution-Time-Variation; sie identifizieren weder einen Hardware-Fehler noch eine Runtime-Regression. Von diesen vier Continuation-Szenarien überschreitet nur Request-History sein Limit im langsameren Release-Lauf.

Ein begrenztes Profil von `a0a61a8237` auf Apple M4 Pro / Node 24.19.0 behält fünf Fresh-Process-Summen: 70.198916, 67.432250, 65.151208, 66.473292, 71.049667 ms; Median 67.432250 ms. Jede Stichprobe schließt dieselben 40 Requests und 13.925 Events ab. Das Sampling attribuiert 38,082 ms Inclusive-Time auf Adapter-Dispatch, darunter 10,878 ms erforderliche File-Content-Traversierung; das System-Node-Scanning nimmt 4,127 ms, während die einmalige Restored-Event-Umkehrung 0,291 ms außerhalb der getimeten Turns nimmt. Letztere zu entfernen kann die beobachteten Turn-Kosten nicht erklären. Projektierten Content oder System-Nodes zu cachen fügt Immutabilitäts- oder Invalidierungsverpflichtungen jenseits dieser begrenzten Zulage hinzu. Der Runtime-Code ist unverändert.

Deterministische Kontrollen rufen das `assertRequestHistoryBudget` des getimeten Falls. Sie akzeptieren das aufgezeichnete Maximum von 185.042397 ms und die beiden langsameren Hosted-Mediane, während sie einen synthetischen 310-ms-Median aus 308, 310, 312, 311, 309 ms Inputs ablehnen. Die Slower-Host-Akzeptanzkontrolle reproduziert `265.796833 > 238` vor der Zulage; die vollständige Owner-Datei besteht 11 Tests bei 297 ms. Das Replay aufgezeichneter Werte validiert die Assertion, nicht einen neuen Hosted-Lauf. Der historische synthetische 250-ms-Fall und die 246.130875-ms-Original-M4-Messung passen in diese Zulage und sind keine Rejection-Kontrollen mehr; die Original-/optimierten M4-Messungen bleiben Beleg für den Gewinn der Freeze-Implementierung.

## Erwogene Alternativen

**Sofortige Rückkehr bei `Object.isFrozen`.** Ein gefrorener Root beweist nicht, dass seine Descendants gefroren sind. Diese Abkürzung auf den Shared-Helper anzuwenden würde jeden Caller schwächen, einschließlich Restore- und Projektionspfade.

**Jeder Session-Message vertrauen oder Message-IDs cachen.** Restore erlaubt explizit besessene ungefrorene Daten; Ersetzungen können eine ID bewahren, während sie Identität und Inhalt ändern. Nur die vollständige Traversierung genau dieses Objekts beweist die Anforderung des Requests.

**Ein starkes Set behalten oder einen globalen Proof-Cache teilen.** Starke Referenzen verlängern die Lebensdauer alter History. Globales Caching erweitert das Ownership über den Agent hinaus und ist für wiederholte Requests aus einem Loop unnötig.

**Downstream-Projektions-Freezes entfernen.** Projektierte File-/Image-/Replay-Messages sind eigene Werte mit separatem Ownership. Sie zu optimieren erfordert eigene Belege und folgt nicht aus dem Freezen der canonical History.

## Konsequenzen

Der Request-Bau scannt weiterhin Message-Identitäten und allokiert ein frisches Array; er vermeidet das rekursive Traversieren bereits bewiesener History. Jeder Loop zahlt eine vollständige Traversierung für restored History. Lokale Header bleiben eine Per-Request-Kostenstelle. Message-Werte, Request-Marker, frühere Request-Snapshots, Cancellation und serialisierte SDK-Outputs behalten ihr bestehendes Verhalten.

Die [fokussierten Tests](../../../../packages/core/agent-loop/tests/request-freeze.spec.ts) üben shallow-gefrozene restored Roots mit mutablen Descendants, Wrapper-Identität und -Mutabilität, nur-bei-Erfolg-Provenance, wiederholte Requests, Same-ID-Compaction-Ersetzungen, einen frischen Loop, geschachtelte Tool-Schemas, Adapter- und `NO_ADAPTER`-Stop-Arrays, gehaltene Requests und Live-Cancellation. Reconstruction- und Cancellation-Suiten decken benachbarte Loop-Semantik ab. Performance-Messungen nutzen die unveränderte [Continuation-Workload](../../../../benchmarks/agent-continuation/workload.ts), nicht einen kleineren synthetischen Microbenchmark.

Die Validation führt 646 Agent-Loop- und LLM-Tests mit 100 % Statement-, Branch-, Function- und Line-Coverage von agent.ts aus. Keyless-TypeScript-SDK-Bash-Tool- und Multi-Turn-Snapshots bestehen gegen neu gebaute Libraries. Python-sdk-minimal- und sdk-snapshot-Checks bestehen gegen ein unabhängig gepacktes node24-macos-arm64-Executable. Keines der SDKs erfordert eine Expected-Output-Änderung. Das Packaging-Deploy entfernt temporär Workspace-Dependency-Links; eine Frozen-Lockfile-Installation stellt sie vor den Source-Checks wieder her, ohne eine getrackte Dependency-Änderung.

Die aktiven Immutabilitäts-, Message-Identity-, Observable-State-Machine- und Backend-Baseline-Notes bleiben unabhängig nützlich; keine ist vollständig superseded oder archiviert. Diese Note spezialisiert den Request-Freezing-Mechanismus und cross-linkt seinen Reconstructability-Owner.
