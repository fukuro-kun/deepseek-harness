# Backend-Continuation-Benchmarks
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Misst die Verarbeitung langer Request-Historys, die kalte, tool-lastige Continuation und das wiederholte Auffinden inaktiver Fork-Kinder — ohne Netzwerkdienste oder aufgezeichnete Nutzerdaten. Die SDK-Variante treibt 100 Turns und 800 echte Dateilesezugriffe über das ausgelieferte sdk-minimal-Profil mit einem expliziten Editor-Patch; die übrigen Fälle isolieren die Backend-Service-Kosten. Kein Fall rendert einen Browser.

## Inhaltsverzeichnis

- [Ausführen](#run)
- [Messungen](#measurements)
- [Dev Note](#dev-note)

<a id="run"></a>

## Ausführen

Baue vom Repository-Stamm aus die Libraries und Worker mit `pnpm run build:bench` und führe dann `pnpm exec vitest run --config vitest.bench.config.ts benchmarks/agent-continuation/agent-continuation.bench.ts` aus. Überlappe Timing-Läufe nicht mit Builds oder anderen Benchmarks.

Der Test berichtet alle fünf Fresh-Process-Samples, CPU-Modelle, verfügbare Parallelität, Plattform/Architektur und Node/V8-Versionen und erzwingt gereviewte Median-Budgets. Catalog- und Tool-Continuation verwenden jeweils eine 900-ms-Standarderwartung für gehostete CI mit 1,25×-Headroom (1.125 ms); die Request-History verwendet ein separat gereviewtes 297-ms-Hosted-Limit ([Kalibrierung](../../.agents/notes/implemented/simplification/2026-09-06-agent-request-freeze-provenance.de.md)), und die SDK-Continuation verwendet Referenzmaschinen-Skalierung. Ein fehlschlagender Worker berichtet Exit, Signal, Timeout und stderr; temporäre Roots werden auch im Fehlerfall entfernt. Die erforderliche Benchmark-Lane findet diese Datei automatisch.

<a id="measurements"></a>

## Messungen

[workload.ts](workload.ts) besitzt die synthetischen Dimensionen. Seine History der aktuellen Generation reserviert im ersten Step einen leeren System-Head vor der User-Eingabe, sodass fortgesetzte Prompts diesen Head ersetzen, ohne historische Nachrichten zu verschieben. Der [Agent Note](../../.agents/notes/implemented/testing/2026-09-06-backend-continuation-performance.de.md) besitzt Timing-Endpunkte, Kalibrierungsnachweise, Speicherinterpretation und Ausschlüsse. Der Modelladapter führt weder Provider-Serialisierung noch Netzwerkaufrufe aus; integrierte Fälle fahren synthetische Tool-Bodies durch die echte Tool-Execution-Pipeline, während die SDK-Profilvariante echte Dateilesezugriffe ausführt.

## Dev Note

Keine.
