---
description: "Die komponierbare Persona-Zeile, die Presets mounten, um einem agent eine eigene System-Prompt-Persona zu geben — für Benutzer und Maintainer, die sie konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-persona
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-persona` gibt einem agent eine eigene Persona: ein Preset mountet diese komponierbare Zeile, um Persona-Präfix- und -Suffix-Abschnitte zu registrieren, die die deployment-weiten Defaults für diese Session überschatten. Sie kann das Präfix auch zur vollständigen System Prompt der Session machen und jeden anderen Abschnitt unterdrücken, und sie kann dynamische Runtime-Context-Snapshots für die Session abschalten. Mounten Sie sie innerhalb einer Preset-Komposition — ein globales Mounten kollidiert mit der eigenen Persona-Registrierung der Prompt-Registry und schlägt hörbar fehl. Ohne diese Zeile könnte ein Preset die tools eines agent ändern, niemals aber seine Identität.

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

Mounten Sie diese Zeile innerhalb einer Preset-Komposition, um den Sessions dieses Presets eine eigene Persona zu geben. Die Zeile braucht einen agent scope: außerhalb davon kollidiert sie mit der eigenen `deployment:persona-prefix`-Registrierung der Prompt-Registry und schlägt hörbar fehl — die Deployment-Persona hat bereits einen Eigentümer, und genau für einen agent zu überschatten ist der Sinn dieser Zeile.

### Konfiguration

```yaml
- name: '@deepseek-ai/dsh-persona'
  config:
    prefix: You are a terse systems engineer who answers in short commands.
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `prefix` | erforderlich | Persona-Prosa, gerendert als `deployment:persona-prefix`-Abschnitt |
| `suffix` | `''` | Template für `deployment:persona-suffix`; weggelassener oder leerer Text schattet das globale Suffix weg |
| `complete` | `false` | Nur das gerenderte Präfix als System Prompt verwenden; das Suffix ignorieren |
| `includeRuntimeContext` | `true` | Dynamische Runtime-Context-Snapshots für diesen agent scope einbeziehen; false unterdrückt jeden Context-Beitrag, ohne die besitzenden Services zu deaktivieren |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-persona) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Persona-Verhalten

Persona-`prefix` und -`suffix` sind Templates: vollständige `{{…}}`-Gruppen lösen strikt gegen registrierte Prompt-Variablen auf, wenn der Prompt rendert, nicht wenn er assembliert. Jedes leere Template überschattet dennoch seinen deployment-weiten Abschnitt und verschwindet dann beim Rendern. Ein weggelassenes `suffix` defaultet auf leer; es erbt das globale Suffix nicht. Mit `complete: true` löst die Assembly weiterhin Contexts, tools, Variablen und kooperative Listener auf, aber die Prompt-Registry stellt genau dieses Präfix als einzigen Abschnitt wieder her; keine Identität, kein Suffix, keine Tool-Anleitung und kein Listener kann Prompt-Text anhängen. Mit `includeRuntimeContext: false` werden Context-Provider für diesen Scope nicht ausgewertet, und von Assembly-Listenern hinzugefügte Contexts werden verworfen.

### Wann einsetzen

Setzen Sie diese Zeile ein, wenn ein Preset die Identität eines agent ändern muss und nicht nur seine tools. Die deployment-weite Persona selbst wird auf der `dsh-system-prompt`-Zeile konfiguriert, nicht hier; diese Zeile existiert nur, um sie für einen agent zu überschatten oder zu ersetzen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

### Wie die Zeile registriert

Die Zeile registriert gescope-te Persona-Präfix- und -Suffix-Abschnitte unter den geteilten Namen und benannten Ordnungen der Registry. Jeder überschattet seinen Deployment-Default, statt daneben zu erscheinen; Ordering, Interpolation und Complete-Prompt-Durchsetzung besitzt die Registry. `includeRuntimeContext: false` ruft `ctx.systemPrompt.suppressRuntimeContext()` auf.

### Warum die Zeile nur im Scope gilt

`dsh-system-prompt` besitzt die globale Persona als eigene Konfiguration und registriert `deployment:persona-prefix` bedingungslos, sodass ein Prozess genau eine hat. Diese Zeile kollidiert außerhalb eines agent scopes bewusst mit dieser Registrierung: die Zeile existiert, weil ein Preset die Prompt-Registry nicht selbst mounten kann.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Eintritt: `Config`-schema, Persona-Abschnittsregistrierung, Runtime-Context-Unterdrückung |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; diese Zeile besitzt keinen Event-Strom und keine veränderlichen Laufzeitdaten — sie registriert Prompt-Abschnitte, und die Prompt-Registry besitzt Identität, Complete-Prompt-Durchsetzung, Überschattung und Entsorgung. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der paketweite Vertrag nicht reicht; sie führen von der Preset-Komposition zur Prompt-Registry, die diese Zeile speist.

- [agent-presets-Paket](../agent-presets/README.de.md) — die Preset-Komposition, in die diese Zeile mountet.
- [System-Prompt-Subsystem](../../../docs/subsystems/system-prompt.de.md) — Abschnitte, Assembly und der Persona-Slot, den diese Zeile überschattet.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-persona) — jedes akzeptierte Konfigurationsfeld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

### Der Persona-Abschnitt

#### Was das Modell sieht

Der `deployment:persona-prefix`-Abschnitt auf Ordnung `0` trägt das `prefix` dieser Zeile; `deployment:persona-suffix` auf Ordnung `10200` trägt ihr `suffix`, nach der First-Party-Anleitung. Beide ersetzen ihre Deployment-Defaults und lösen Prompt-Variablen auf. Im Complete-Modus sieht das Modus nur den gerenderten Präfix-Abschnitt als System Prompt. Runtime Context bleibt standardmäßig aktiviert; wenn deaktiviert, erhält ein frischer agent keinen Runtime-Context-Snapshot von Sandbox-Policy, Approval-Policy, Delegation oder einem anderen System-Prompt-Context-Provider.

#### Token-Auswirkung

Für ein gegebenes Preset fix: die Persona-Präfix- und -Suffix-tokens auf jedem Request dieses agent und keine für jeden anderen agent. Leerer Text trägt nichts bei. Der Complete-Modus entfernt jedes andere System-Prompt-token für diesen agent.

#### KV-Cache-Auswirkung

Präfix-stabil, solange die gerenderten Template-Variablen und der Text unverändert sind. Suffix-Änderungen lassen vorangehende Anweisungen unverändert, wenn Modell, Präfix und tools übereinstimmen. Präfix-Änderungen betreffen das frühe Präfix; Provider-Cache-Teilung ist nicht garantiert.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die Zeile ungeeignet ist. Sie sind aktuelle Paketrestriktionen, kein Aufgabenrückstand.

- **Kein globales Mounten** — die Prompt-Registry besitzt den ungescope-ten Persona-Slot, daher ist diese Zeile nur aus einer gescope-ten Komposition nutzbar. Eine deployment-weite Persona-Änderung gehört in die eigene Konfiguration der `system-prompt`-Zeile.
- **Runtime-Context-Unterdrückung ist alles-oder-nichts** — `includeRuntimeContext: false` schaltet jeden Context-Beitrag für den Scope ab, einschließlich Sandbox-Policy, Approval-Policy und Delegation; es gibt keinen per-provider-Filter.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
