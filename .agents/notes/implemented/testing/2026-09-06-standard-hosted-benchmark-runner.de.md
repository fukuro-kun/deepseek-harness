# Agent Note: Standard-gehosteter Runner für Pflicht-Benchmarks

Status: implemented

[English](2026-09-06-standard-hosted-benchmark-runner.md) | [中文](2026-09-06-standard-hosted-benchmark-runner.zh.md) | Deutsch

## Problem

Wall-Clock-Performance-Prüfungen brauchen eine isolierte Ausführungs-Lane und eine konsistente Runner-Klasse. Werden sie über den Enterprise-Linux-Failover-Schalter geroutet, hängen ihre Messungen entweder von größerer gehosteter Kapazität oder einer geteilten selbst gehosteten VM ab und verbrauchen zugleich Kapazität, die parallele Korrektheitsprüfungen benötigen.

## Entscheidung

Der Pflicht-Benchmark-Job in [ci.yml](../../../../.github/workflows/ci.yml) nutzt den Standard-Runner `ubuntu-24.04` von GitHub, unabhängig vom Linux-Failover. Er versucht immer, den pnpm-Store-Cache wiederherzustellen, und behält eine eigenständige Benchmark-Lane. Der gesamte Job hat ein 15-minütiges Timeout, das Setup, Installation, Builds und Messungen abdeckt. Dies begrenzt die Infrastruktur-Ausführung, nicht eine einzelne Performance-Assertion.

Die [Session-Performance-Entscheidung](2026-09-04-session-open-performance-gate.de.md) besitzt weiterhin Workloads, Zeit- und Speicherbudgets, Worker-Isolation und Kalibrierung. Nur das aktuelle Generation-`open` verwendet eine endpunktspezifische 50-ms-Erwartung für Standard-Runner mit dem bestehenden 1,25-fachen Headroom, was ein Limit von 63 ms ergibt. Alle anderen Performance-Budgets sowie die Worker-, Test- und Hook-Deadlines bleiben unverändert. Erfolgreiche Rohmessungen bleiben über das schrittweise `DSH_GATE_VERBOSE=1` im Actions-Log sichtbar. Die Hardware-Vergleichs-Workflows behalten ihre bewusst abweichenden Runner-Größen.

## Erwogene Alternativen

- Enterprise- oder geteiltes Self-Hosted-Routing behält mehr Build-Kapazität, bindet die Messumgebung aber an unbeteiligte Failover-Vorgänge.
- Performance-Schwellen ohne Endpunkt-Messungen zu erhöhen vermischt eine begrenzte CI-Ausführung mit einem Regressions-Spielraum. Schwellenänderungen erfordern gemessene Kalibrierung sowie positive und negative Kontrollen.

## Konsequenzen

Ein Standard-Runner tauscht parallele Build-Kapazität gegen eine feste Messklasse, ohne das Pflicht-Verdikt zu entfernen. Cache-Misses und Runner-Schwankungen können die Gesamtdauer weiterhin beeinflussen. Jede Runner-Änderung braucht einen tatsächlichen gehosteten Benchmark-Lauf, bevor ihr Job-Timeout als validiert gilt; lokale Workflow-Assertions allein können die Ausführungsdauer nicht belegen.

Die zugehörigen [Workflow-Tests](../../../../scripts/ci-workflow.spec.ts) pinnen das Runner-Routing, die unbedingte Cache-Wiederherstellung, den Required-Status und das Job-Timeout. Negative Kontrollen lehnen Failover-Routing, eine Cache-Bedingung und die frühere 30-Minuten-Job-Grenze ab.
