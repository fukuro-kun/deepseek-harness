---
description: "Die deployment-weite Standard-Modellauswahl für Benutzer und Maintainer, die wählen, konfigurieren oder debuggen, mit welchem Modell frisch erstellte agents starten."
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-default-model

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-agent-default-model` gibt neu erstellten agents einen geteilten Standard-Provider und ein Standardmodell, wenn ihre Sessions keines angeben. Verwenden Sie es, um das Startmodell einmal für alle unterstützten agent-Einstiegspunkte zu wählen, einschließlich `dsh --profile headless`. Wenn Settings verfügbar sind, können Benutzer die konfigurierte Auswahl überschreiben — einschließlich Reasoning-Effort —, und gespeicherte Änderungen gelten für nachfolgende Lesevorgänge. Der Standard ist prozessweit; die Session-weise Modellauswahl bleibt Aufgabe des Einstiegspunkts, der den agent erstellt.

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

Mounten Sie dieses Paket überall dort, wo agents ohne explizite Modell-Route erstellt werden. Der Service beantwortet eine Frage — welches Modell soll ein frischer agent verwenden? —, sodass Einstiegspunkte, die agents erstellen, ihn befragen, statt einen Standard neu zu implementieren.

### Den Standard konfigurieren

Der Kompositionseintrag ist die Basis des Standards: er erfordert Provider und Modell und bleibt ohne jeden Settings-Provider nutzbar.

```yaml
- name: '@deepseek-ai/dsh-agent-default-model'
  config:
    provider: deepseek
    model: deepseek-chat
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `provider` | erforderlich | Registrierte Provider-Route für frische agents |
| `model` | erforderlich | Provider-eigene Modell-id für frische agents |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-agent-default-model) ist die erschöpfende Quelle für jedes akzeptierte Feld. `reasoningEffort` ist bewusst kein Konfigurationsfeld: es gehört in die Settings-Schicht, sodass eine vollständig gespeicherte Auswahl einen Effort löschen kann, wenn das nächste gewählte Modell keinen hat, während ein Kompositionswert erneut vererbt würde.

### Den Standard lesen und ändern

`currentSelection()` liefert ein losgelöstes `{ provider, model, reasoningEffort? }` für einen neu erstellten agent; `saveSelection()` speichert die vollständige Auswahl für spätere agents.

```text
const selection = ctx.agentDefaultModel.currentSelection()
await ctx.agentDefaultModel.saveSelection({ provider, model, reasoningEffort: 'high' })
```

Ohne Settings-Provider ist `saveSelection()` ein no-op, und der Kompositionseintrag bleibt aktuell. Der Service validiert keine Katalogzugehörigkeit: eine Provider-Route kann ein unangekündigtes Modell bedienen, und der Consumer, der einen Modell-Request öffnet, besitzt die Verfügbarkeitsdiagnostik.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie der Service das obige Verhalten realisiert; der beobachtbare Vertrag wird in [Dieses Paket verwenden](#use-this-package) behandelt.

### Designkonzept

Der Service ist ein Kompositionseintrag mit einer settings-gestützten Quelle. Die Plugin-Konfiguration liefert das Basis-`{ provider, model }`; ist ein Settings-Provider gemountet, wird der `agent-default-model`-Settings-Abschnitt zur live-Quelle, und jeder Consumer liest über `currentSelection()`, sodass ein Settings-Schreibvorgang keinen Rebuild auf Registrierungsebene braucht. `reasoningEffort` lebt nur im Settings-schema — die Konfiguration kann es nicht tragen, weil ein von einer neuen Auswahl gelöschter Effort gelöscht bleiben muss, statt aus der Komposition erneut vererbt zu werden.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Eintritt: `AgentDefaultModelConfig`-Service, Settings-Abschnittsinstallation, `currentSelection`/`saveSelection` |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; die Settings-Validierung besitzt die einzige Beziehung mit veränderlichem Wert. |

### Verhaltensnotizen

Beide öffentlichen Methoden sind dünne Lese- und Schreibzugriffe über jener Quelle: `currentSelection()` liefert ein frisches losgelöstes Objekt, sodass ein Aufrufer es halten kann, ohne Service-Zustand zu aliasen, und `saveSelection()` schreibt die gesamte Auswahl über `ctx.settings`, falls vorhanden.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Der paketweite Vertrag reicht für die meisten Consumer; lesen Sie diese, wenn Sie die umgebende Domäne brauchen.

- [Core-Subsystem](../../../docs/subsystems/core.de.md) — das `Agent`-handle und die `AgentOptions`-Routenauswahl.
- [agent-loop-Paket](../agent-loop/README.de.md) — wie agents Provider und Modell zur Request-Zeit auflösen.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-agent-default-model) — jedes akzeptierte Konfigurationsfeld und seine Quelldeklaration.
- [Core-Gruppenkarte](../README.de.md) — wie die Core-Pakete komponieren.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über die `ModelSelection`, die der Service einem Einstiegspunkt liefert; Request-Assembly und die Provider-Adapter besitzen den modellsichtbaren Request.

#### KV-Cache-Auswirkung

Das Ändern des Standards betrifft nur agents, die danach aus ihm auflösen. Eine bestehende Session, deren Request-Log bereits eine Auswahl nennt, behält diese Auswahl, sodass dieser Service ihr etabliertes Präfix nicht invalidiert.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren den Umfang des Service. Sie sind aktuelle Paketrestriktionen, kein Aufgabenrückstand.

- **Ein prozessweiter Standard** — der Service besitzt einen einzigen Standard; die Session-weise Modellauswahl bleibt Aufgabe des Einstiegspunkts.
- **Keine Persistenz ohne Settings-Provider** — `saveSelection()` kann ohne gemounteten Settings-Provider keine Auswahl für einen späteren agent aufbewahren.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
