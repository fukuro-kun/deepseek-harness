---
description: "The test-support group map: keyless test harnesses, LLM mock and replay servers, and Loader smoke helpers for developers writing repository tests."
kind: "package-group"
---

# packages/test-support
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die test-support-Gruppe gibt Repository-Tests deterministische, schlüssellose Wege, das echte Produkt auszuüben. Sie umfasst Loader-Anwendungsharnesses, Session-Log-Snapshot-Adapter, ein Replay-LLM-Plugin und einen skriptbaren OpenAI-kompatiblen Fehlerserver. Jedes Paket ist Support-Ebenen-Infrastruktur; ein Paket verlässt diese Gruppe, sobald es einen Produktvertrag und Produkt-Consumer erhält.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle |
|---|---|
| [`session-snapshot`](session-snapshot/README.de.md) | Stellt Session-Log-Snapshot-Unterstützung und Protokolladapter für profilgesteuerte Tests bereit |
| [`agent-loop-testkit`](agent-loop-testkit/README.de.md) | Stellt die gemeinsamen Voraussetzungsservices für Tests bereit, die den konkreten AgentLoop ausüben |
| [`client-runtime`](client-runtime/README.de.md) | Stellt die jsdom-slot-Testbank für Browser-Feature-Specs bereit |
| [`loader-smoke`](loader-smoke/README.de.md) | Startet Loader-komponierte Anwendungen und treibt fixture-Turns für Smoke-Tests |
| [`llm-mock-server`](llm-mock-server/README.de.md) | Stellt einen skriptbaren OpenAI-kompatiblen Fehlerserver für Recovery-Tests bereit |
| [`llm-replay`](llm-replay/README.de.md) | Spielt aufgezeichnete Modellstreams für schlüssellose Tests und Demos ab |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Testpolicy](../../docs/testing.de.md) — die schlüssellose Snapshot-Ebene, der diese Harnesses dienen, und wann sie erforderlich ist.
- [Runtime-Invarianten-Subsystem](../../docs/subsystems/invariants.de.md) — die paket-eigenen Runtime-Checks, die jedes test-support-Paket als `./invariant` ausliefert.
- [Paketgruppen](../README.de.md) — wie Support-Gruppen zu den Produktgruppen stehen.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
