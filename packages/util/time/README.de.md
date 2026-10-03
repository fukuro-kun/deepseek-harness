---
description: "IANA-Zeitzonen-Validierung und -Kanonisierung für Maintainer, die eine caller-gemeldete Zone an einer Wire-Grenze akzeptieren."
kind: "package-library"
---

# dsh-util-time
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Zero-Dependency-Zonenvokabular für die Wire-Grenzen, die die Zeitzone eines Callers akzeptieren. `canonicalClientTimeZone` lässt `UTC` oder einen IANA-`Area/Location`-Namen zu und antwortet mit dessen plattformkanonischer Schreibweise, sodass ein Alias nie einen durable Record erreicht: Eine Zonen-Identität wird auf Messages gespeichert und später von einem anderen Prozess neu abgeleitet, wo ein Alias nicht gleich verglichen würde. Die Bibliothek validiert und kanonisiert nur — sie formatiert keine Zeit und besitzt kein Failure-Vokabular, weil jede Grenze ihren eigenen Domain-Code wirft.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [API](#api)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Hinweis für Entwickler](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Es ist eine **Bibliothek, kein Service und kein Plugin**: kein `ctx`, registriert nichts, hält keinen State.

Es wird kein Runtime-Invariant-Companion publiziert, weil diese pure Utility weder einen Event-Stream noch mutable Laufzeitdaten besitzt; Unit-Tests verifizieren die Zonen-Kanonisierung.

Rufe es an der Grenze auf, die die Zone empfängt, bevor der Wert irgendetwas Durables erreicht. Ein unbrauchbarer Name antwortet `undefined`, und der Caller erhebt seine eigene Ablehnung — `session/invalid-time-zone` für den Session-Prompt, `subagent/invalid-time-zone` für eine Subagent-Fortsetzung.

-----

<a id="api"></a>
## API

```ts
import { canonicalClientTimeZone } from '@deepseek-ai/dsh-util-time'
```

| Export | Rolle |
|---|---|
| `canonicalClientTimeZone(value)` | Kanonischer `UTC`- oder IANA-`Area/Location`-Name für eine akzeptierte Zone, `undefined` für eine leere, gepaddete, abgekürzte, einsegmentige oder plattform-nicht-unterstützte. |

<a id="model-experience"></a>
## Model Experience

Indirekt, über den Consumer, der eine kanonische Zone auf einer durable Message aufzeichnet, aus der `dsh-time-context` die modell-sichtbare Zonen-Anweisung und den Zeitstempel des Turns rendert.

#### KV-Cache-Effekt

Keinen eigenen. Der Consumer, der eine zonenabgeleitete Zeile in einen Request injiziert, besitzt das Cache-Verhalten dieses Requests.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Alias-Auflösung folgt den ICU-Daten der Runtime** — auf welchen Namen eine Alias-Gruppe kanonisiert, ist die Antwort der Plattform, sodass zwei Prozesse auf verschiedenen Node-Builds darüber uneinig sein können.
- **Nur Validierung** — kein Formatieren, keine Offset-Arithmetik, kein DST-Reasoning, keine Instant-Konversion; Consumer, die das brauchen, nutzen `Intl` direkt.

<a id="dev-note"></a>
### Hinweis für Entwickler

<details>
<summary>Arbeitskontext für Maintainer — zum Ausklappen klicken</summary>

Keiner.

</details>
