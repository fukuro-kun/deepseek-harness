# Agent Note: Datei-Content-Scan ohne Per-Array-Callbacks
[English](2026-09-07-file-content-scan.md) | [中文](2026-09-07-file-content-scan.zh.md) | Deutsch

Status: implemented


## Problem

Jeder Model-Dispatch prüft den vollständigen Message-Content auf Dateien, einschließlich verschachtelter Tool-Results. Ein Request-History-CPU-Profil misst `contentHasFile` 23.540 ms Self-Time und seinem Callback 5.584 ms zu. Diese Traversierung bleibt auch nötig, nachdem die [loop-eigene Freeze-Provenance](2026-09-06-agent-request-freeze-provenance.de.md) wiederholtes Request-Freezing entfernt. Die heiße LLM-Quelle ist auf master `bd5917`, master `112a5` und dem gemessenen `f834b002826453e7918eeb558d052b2c24c56a76` identisch; diese Beobachtungen begründen keine PR-Kausalität.

## Decision

[`contentHasFile`](../../../../packages/llm/llm/src/content.ts) nutzt direkte Iteration statt rekursiver `Array.some`-Callbacks. Es bewahrt Early-Exit, verschachtelte Tool-Result-Traversierung und false-Ergebnisse für andere Block-Arten. Es speichert keine Identitäten, Validierungsergebnisse oder Freeze-Beweise. Image-Detection, File-Projektion und Request-Konstruktion behalten ihr bestehendes Verhalten. Die [Request-Freeze-Kalibrierung](2026-09-06-agent-request-freeze-provenance.de.md) besitzt das Request-History-Budget.

## Measurement evidence

Apple M4 Pro, Node 24.19.0: Neun alternierende Original/Kandidat-Paare führen den unveränderten [Request-History-Worker](../../../../benchmarks/agent-continuation/agent-continuation.worker.ts) in frischen Plain-Node-Prozessen aus. Jeder Prozess erhält eine Kopie eines Native-V3-Seeds. Nur der gebaute LLM-Entry ändert sich; jede Stichprobe vollendet 40 Requests, null Live-Tools und 13,925 Events. Alle Summen unten sind Millisekunden, in Paar-Reihenfolge.

| Variante | Rohe Summen | Median |
|---|---|---:|
| Original | 61.772167, 66.480917, 63.590042, 62.250333, 63.804875, 62.504208, 61.887958, 61.062959, 67.120125 | 62.504208 |
| Direkte Iteration | 53.655375, 56.223416, 57.078125, 54.559250, 54.271459, 55.288917, 55.400416, 56.191916, 54.877041 | 55.288917 |

Der Median verbessert sich um 11.54 %; alle neun Paare verbessern sich um 4.871–12.243 ms. Die User-CPU-Mediane sind 82.019/76.150 ms. Eine separate Fünf-Paar-Scan-Sonde nutzt dieselbe synthetische Historie: 5,601 gefrorene Messages, 13,600 Blocks und 8,801 Content-Arrays, 40-mal gescannt. Die Original-Summen sind 17.188584, 17.944000, 16.869458, 17.437750, 17.459708; die Summen der direkten Iteration sind 8.726333, 8.373000, 8.851750, 8.479167, 9.074083. Diese lokalen Messungen belegen einen Implementierungsgewinn, kein Hosted-CI-Ergebnis und keine neue Kalibrierung.

## Alternatives considered

Ein schwacher Negativ-Ergebnis-Cache bräuchte den Beweis, dass jeder relevante Nachfahre unveränderlich ist; eine shallow-gefrorene Wurzel genügt nicht. Direkte Iteration liefert gemessene Einsparungen, ohne dieses Ownership- oder Invalidierungsproblem einzuführen. Image-Traversierung oder System-Prompt-Projektion zu optimieren fehlt die Evidenz aus diesem Experiment und liegt außerhalb dieser Änderung.

## Consequences

Der Scan bleibt linear in besuchten Blocks und liest mutablen verschachtelten Content bei jedem Aufruf erneut. Die [Content-Tests](../../../../packages/llm/llm/tests/content.spec.ts) decken leere, gefrorene, verschachtelte und nachträglich mutierte Arrays ab; Service-Tests bewahren die File-Handle-Projektion, und Request-Freeze-, Reconstruction- und Resume-Tests bewahren die Native-History-Semantik. Kein model-sichtbarer Text und kein Session-Format ändern sich. Die Freeze-Provenance- und [Backend-Baseline](../testing/2026-09-06-backend-continuation-performance.de.md)-Notes behalten ihre unabhängige Ownership; keine wird ersetzt.
