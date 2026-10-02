---
description: "Der Agent-Plane-Präsentationsselektor für Benutzer und Maintainer, die wählen, konfigurieren oder debuggen, welche Form ihrer Tools die Modelle eines Agent Presets sehen."
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-tool-presentation

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Verwende `dsh-agent-tool-presentation` in einem [Agent Preset](../../preset/agent-presets/README.de.md), um festzulegen, ob Modelle jedes native Tool-Schema sehen, nur `run_code` mit einem generierten SDK oder beide Formen. Jedes Preset kann unabhängig wählen, sodass native und PTC-Agents einen Prozess teilen können, ohne Tool-Kataloge zu teilen. Die Wahl von `ptc` oder `both` erfordert eine kompatible Code-Runtime; ein Deployment ohne eine solche lehnt das Preset zur Mount-Zeit ab, bevor sein erster Prompt läuft. Das Feld `mode` ist Pflicht, wenn dieses Paket vorhanden ist, während das Weglassen des Pakets den Deployment-Default beibehält.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Füge diese Zeile einem Agent Preset hinzu, um festzulegen, wie jeder dem Preset beigetretene Agent seine Tools sieht. `native` präsentiert jedes sichtbare Tool-Schema als Funktionsdefinition; `ptc` präsentiert nur den `run_code`-Transport plus ein generiertes SDK und die Regel, dass nur `run_code` direkt aufgerufen werden darf; `both` präsentiert beide Formen. Agents, die nichts deklarieren, erhalten den deployment-weiten `mode` in der [`dsh-tools`](../tools/README.de.md)-Zeile.

### Die Zeile einem Preset hinzufügen

```yaml
- name: '@deepseek-ai/dsh-agent-tool-presentation'
  config:
    mode: ptc
```

| Feld | Default | Bedeutung |
|---|---|---|
| `mode` | Pflicht | `native` — jedes Schema; `ptc` — `run_code` plus generiertes SDK; `both` — beide Formen |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-agent-tool-presentation) ist die erschöpfende Quelle für jedes akzeptierte Feld. `mode` ist Pflicht statt voreingestellt, weil ein Preset ohne diese Zeile den Deployment-Default erbt.

### Was der PTC mode benötigt

Die Wahl von `ptc` oder `both` braucht eine komponierte Code-Runtime (`ctx.codeRuntime`), für deren Sprache ein SDK-Renderer registriert ist — die TypeScript-Runtime wird über [`dsh-code-runtime-worker-thread`](../../code-runtime/code-runtime-worker-thread/README.de.md) geliefert, und sowohl der TypeScript- als auch der Python-SDK-Renderer sind in `dsh-tools` eingebaut. Ein Preset, das einen PTC mode gegen ein Deployment wählt, das keine solche Runtime komponiert, verweigert den Mount und benennt diese Zeile, sodass der Fehler dort landet, wo der Operator handeln kann, statt beim ersten Request der Session.

### Eine Präsentation pro Agent

Ein Agent deklariert eine Präsentation. Eine zweite Deklaration in derselben Komposition wird abgelehnt statt gemergt: Zwei Antworten auf „welche Form sieht das Modell" sind ein Widerspruch, kein Override.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie das Paket das obige Verhalten realisiert; der beobachtbare Vertrag ist in [Dieses Paket verwenden](#use-this-package) behandelt.

### Designkonzept

Die Tool-Registry kann nicht in ein Preset ziehen: Ihre Consumer liegen alle auf der Host-Plane — der Agent Loop liest ihren Scheduler, der API-Proxy liest ihre Presenter, und jedes Tool-Plugin registriert sich in sie —, und ein Service zieht nur nach unten, wenn alle seine Consumer mitziehen. Was ein Preset besitzen kann, ist die Präsentation dieser Registry. `ctx.tools.presentAs()` deklariert sie für den Mount-Scope, also den Standing Mount des Presets, sodass die Deklaration jeden dem Preset beigetretenen Agent abdeckt und ein PTC-mode-Preset neben nativen in einem Prozess läuft. Eine Zeile pro Komposition, nicht eine pro Session.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `mode`-Config, `apply`-Verdrahtung von `ctx.tools.presentAs` für den Mount-Scope |
| — | Es wird kein Runtime-Invarianten-Begleiter publiziert; dieses Paket macht genau einen Scoped-Aufruf in `ctx.tools` und besitzt weder Event noch Snapshot; die Relation, die es herstellt — welche Präsentation die Assembly eines Agents verwendet —, liegt bei der Tool-Registry, und `dsh-tools` beobachtet sie dort. |

### Verhaltenshinweise

`native` greift sofort. Ein PTC mode wartet dagegen auf `ctx.codeRuntime`, einen Host-Plane-Service: Ein Preset, das einen PTC mode gegen ein Deployment wählt, das keine Runtime komponiert, hält diese Zeile pending, und `dsh-agent-presets` verweigert den Mount unter Nennung dieser ID. `presentAs` ist selbst der Effekt, sodass die Deklaration mit dieser Zeile abgewickelt wird, ohne dass ein zweiter Wrapper sie besitzt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Der Paketvertrag reicht für die meisten Consumer; lies diese Seiten, wenn du die umgebende Domäne brauchst.

- [tools-Paket](../tools/README.de.md) — die Tool-Präsentationsmodi und die `presentAs`-API.
- [agent-presets-Paket](../../preset/agent-presets/README.de.md) — wie Presets Agents und ihre Standing Mounts komponieren.
- [code-runtime-worker-thread-Paket](../../code-runtime/code-runtime-worker-thread/README.de.md) — die TypeScript-Runtime, die ein PTC mode braucht.
- [PTC-mode-Executor-Collapse-Note](../../../.agents/notes/implemented/bug-fix/2026-08-07-ptc-executor-collapse.de.md) — warum die angekündigte und die aufrufbare Fläche gleich bleiben.
- [Core-Gruppenkarte](../README.de.md) — wie die Core-Pakete komponieren.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über die Tool-Präsentation, die es in `dsh-tools` wählt — die Zeile wählt nur zwischen den zwei Projektionen, die `dsh-tools` besitzt, und registriert keinen eigenen Prompt, kein Schema und kein Ergebnis.

#### KV-Cache-Effekt

Keine direkte Invalidierung; die Präsentation wird bei der Komposition des Agents fixiert, sodass ihr Request-Präfix für die Lebensdauer der Session stabil bleibt.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann diese Zeile besondere Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgabenstapel.

- **Die Runtime bleibt Host-Plane** — ein Preset kann einen PTC mode wählen, aber nicht die TypeScript-Runtime liefern, die er braucht; ein Deployment, das keine komponiert, kann kein PTC-Preset komponieren.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
