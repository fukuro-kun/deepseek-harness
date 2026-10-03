---
description: "Die typert-Gruppenkarte: der Build-Time-Typgraph-Generator, die Runtime-Registry, die Loader-Integration und das gemeinsame Remote-Protokoll, die typisierte Host-zu-Client-Aufrufe ermöglichen."
kind: "package-group"
---

# packages/typert

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Mit der typert-Gruppe können Client-Umgebungen Host-Capabilities als typisierte Methoden aufrufen und generierte Schemas und Reflection teilen, ohne handgeschriebenen Wire-Code. Ein Build-Time-Generator wandelt Quell-Typdeklarationen in compiler-unabhängige Modelle und Runtime-Artefakte um, eine Runtime-Registry speichert diese Artefakte, und eine Loader-Integration registriert sie in Loader-Kompositionen automatisch. Ein gemeinsames Protokoll-Paket liefert die Remote-Call-Deklarationen — Decorators, Wire-Descriptoren, Codecs und Provider-Contracts — die Business-Pakete, generierte Artefakte, das Host-Gateway und die Client-API gemeinsam konsumieren. Diese Seite kartiert die vier Pakete; jedes Paket-README besitzt seine Konfiguration, Verwendung und Grenzen.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`generator/`](generator/README.de.md) | Analysiert Quell-Typen zur Build-Zeit und generiert die Reflection, Schemas und Remote-Descriptoren, die Runtimes laden | — |
| [`loader/`](loader/README.de.md) | Registriert generierte Typert-Artefakte aus Loader-Kompositionen automatisch in der Runtime-Registry | konsumiert `ctx.loader` und `ctx.typert` |
| [`protocol/`](protocol/README.de.md) | Deklariert die Remote-Decorators, Wire-Descriptoren, Codecs und Provider-Contracts, die Host und Client teilen | — |
| [`registry/`](registry/README.de.md) | Speichert zur Laufzeit generierte Package-Reflection und Live-Zod-Schemas sowie Lookup- und Context-Provider-Registries | `ctx.typert` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Typert-Subsystem-Referenz](../../docs/subsystems/typert.de.md) — die wörtlichen öffentlichen Contracts, aufgezeichnet aus Protocol- und Registry-Typen.
- [API-Gateway-Referenz](../../docs/api-gateway.de.md) — wie die generierten Remote-Descriptoren zu laufenden Host-zu-Client-Aufrufen werden.
- [Agent Note zu Remote-Calls](../../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.de.md) — die Architektur- und Transportentscheidungen hinter Remote-Calls.
- [Paket-Workspace-Karte](../README.de.md) — jede Gruppe im Workspace und was sie besitzt.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
