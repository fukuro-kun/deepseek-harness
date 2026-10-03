---
description: "Nutzerseitige Permission-Presets für Nutzer und Maintainer, die den Permissions-Selektor wählen, konfigurieren oder debuggen, der Sandbox-Modus mit einer Approval-Policy bündelt."
kind: "package-reference"
---

# @deepseek-ai/dsh-permission-presets
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Permission-Presets geben Nutzern einen Selektor, um Sandbox-Modus und Approval-Policy gemeinsam anzuwenden. Ein Deployment kann benannte Presets und einen Default für neu erstellte Sessions konfigurieren; das Ändern dieses Defaults verändert bestehende Sessions nicht, und die ausgelieferte Tabelle enthält `workspace-write` und `danger-full-access`. Passt die aktuelle Kombination zu keinem Preset, zeigen Clients den abgeleiteten `custom`-Zustand, aber Nutzer können ihn weder auswählen noch persistieren; das Wechseln von Presets ändert nur Settings, deren effektive Werte abweichen. Der `/permission`-Befehl meldet oder ändert das aktuelle Preset, während Sandbox-Ausführung und Approval-Handling getrennte Durchsetzungsmechanismen bleiben.

## Inhaltsverzeichnis

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Wähle diesen Service, wenn ein Deployment den Nutzern einen einzigen Permissions-Selektor statt getrennter Sandbox- und Approval-Controls anbieten will. Er bündelt die Regler; Ausführung und Approval behalten ihre eigenen Werte, sodass ein späteres Entfernen des Pakets die letzte Auswahl wirksam lässt.

### Presets konfigurieren

Die Plugin-Config definiert die Preset-Tabelle und den Default für frische Sessions. Jeder Preset-Name bündelt einen Sandbox-Modus mit einer Approval-Policy; `name` und `description` sind optionale Client-Präsentation.

```yaml
- name: '@deepseek-ai/dsh-permission-presets'
  config:
    presets:
      workspace-write:
        sandbox: workspace-write
        approval: ask
      danger-full-access:
        sandbox: danger-full-access
        approval: never
    defaultPreset: workspace-write
```

| Feld | Default | Bedeutung |
|---|---|---|
| `presets` | `workspace-write`, `danger-full-access` | Tabelle Preset-Name → Sandbox/Approval-Bundle |
| `defaultPreset` | abgeleitet | In frische Sessions gepinntes Preset; erforderlich, wenn die Composition-Defaults zu keinem Preset passen |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-permission-presets) ist die erschöpfende Quelle für jedes akzeptierte Feld und dessen JSDoc. Der Name `custom` ist dem abgeleiteten Nicht-ein-Preset-Zustand vorbehalten und kann keinen Tabelleneintrag benennen. Das Mounten erfordert einen beschränkenden Bash-Executor (einen, der einen `sandboxMode` meldet) und den Approval-Service.

### Presets wechseln

Der Wechsel zu einem Preset ändert nur die Regler, deren effektiver Wert abweicht; das Auswählen des bereits wirksamen Presets ändert nichts. Der aktuelle Wert löst sich auf als die noch passende zuletzt aufgezeichnete Auswahl, sonst der erste passende Tabelleneintrag, sonst `custom`. Nutzer wechseln über den `/permission`-Befehl: Ein nackter Aufruf meldet das aktuelle Preset und die verfügbare Tabelle, ein Preset-Argument wechselt zu ihm.

### Was Nutzer sehen

Clients rendern den Selektor mit jedem wechselbaren Preset in Tabellenreihenfolge, plus `custom`, das genau dann angezeigt wird, wenn es aktuell ist. `custom` ist rein zur Anzeige — Aufrufer können aus einer unpassenden Reglerkombination herauswechseln, können aber über diesen Service kein benanntes Custom-Preset auswählen oder persistieren.

### Session-Defaults

Der `permission`-Settings-Namespace hält `defaultPreset` für zukünftige Sessions: Die Session-Erstellung liest ihn, wendet ihn auf Sandbox-Modus und Approval-Policy an und zeichnet das angewendete Preset als `permission/preset`-Auswahl auf. Spätere Settings-Änderungen verändern eine bestehende Session nie. Ein resumed Seed, einschließlich eines explizit leeren, das `session/end-seed` markiert, behält seine effektive Permission und erhält nur fehlende durable Fakten statt des neuesten Nutzer-Defaults.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Das beobachtbare Verhalten ist in [Use this package](#use-this-package) beschrieben; dieser Abschnitt erklärt den Schreibpfad, die Leseseite und die optionalen Kinder.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `PermissionPresetService`: Preset-Tabelle, Schreibpfad, Settings-Namespace, Session-Pinning, Kinder |
| [`src/types.ts`](src/types.ts) | `permissions`-Projection-Key-Deklaration und Select-Payload-Typen |
| [`src/invariant.ts`](src/invariant.ts) | Invarianten-Begleiter, der validiert, dass `permission/preset` ein auflösbares Preset benennt |

### Schreibpfad

`apply()` löst das Preset auf, hängt `permission/preset` nur an, wenn sich das effektive Preset ändert, und schreibt dann jeden geänderten Regler über seinen kanonischen Setter — `setSandboxMode` aus `dsh-sandbox-policy` und `setApprovalPolicy` aus `dsh-user-approval`. Das Selection-Event geht den Regler-Events voraus, sodass die Nutzerabsicht überlebt, wenn zwei Presets ein Bundle teilen; eine Netto-Null-Auswahl hängt nichts an.

### Leseseite und `custom`

`current(session)` liest die `permissions`-Projection, deren Unit die drei Ganzwert-Regler-Events über die Composition-Defaults (`ctx.shell.sandboxMode` und die Approval-Config) faltet. Der Host-State merkt außerdem, ob `session/end-seed` aufgetreten ist, sodass das Session-Pinning ein explizit leeres restauriertes Seed von einer echt frischen Session unterscheidet, ohne das Log erneut zu scannen. Eine noch passende letzte Auswahl gewinnt Gleichstände bei geteilten Bundles; sonst gewinnt der erste Tabellen-Treffer; sonst wird das abgeleitete `CUSTOM_PRESET` zurückgegeben. Eine fehlende Registry oder ein fehlender Projection-Key schlägt explizit fehl.

### Session-Pinning und Blank-Reuse

Das Mounten pinnt jede lebende und zukünftige Session: Eine echt frische Session erhält das Default-Preset und beide Regler-Fakten, während geseedete oder teilweise initialisierte Sessions ihre effektiven Regler-Werte behalten und nur fehlende durable Fakten erhalten. Der projection-eigene Seed-Marker trifft diese Entscheidung aus demselben inkrementellen State wie die Regler-Werte.

### Optionale Kinder

Die `permissions`-Projection-Unit registriert sich nur, wenn eine `ctx.sessionProjections`-Registry komponiert ist; der `/permission`-Befehl registriert sich nur, wenn eine `ctx.commands`-Registry komponiert ist. Aufrufe, die das aktuelle Preset ableiten oder eine Anfangsauswahl pinnen, erfordern die Projection und schlagen ohne ihre Registry oder ihren Key explizit fehl.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Lies diese Seiten, wenn der Paket-Contract nicht ausreicht. Sie bewegen sich vom Preset-Vokabular zu den Durchsetzungsreglern und der Design-Begründung.

- [Permission-Presets-Subsystem-Referenz](../../../docs/subsystems/permission-presets.de.md) — die Preset-Tabelle, das Select-Payload und die `ctx.permissionPresets`-Cordis-Oberfläche.
- [Agent Note zum Sandbox-Switching-Design](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.de.md) — wie Sandbox-Modus und Approval-Policy komponieren und wechseln.
- [Approval-Subsystem-Referenz](../../../docs/subsystems/approval.de.md) — der Approval-Policy-Regler, den dieser Service bündelt.
- [Interaction-Gruppenkarte](../README.de.md) — benachbarte Command-, Approval- und Fragen-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über `dsh-user-approval` und `dsh-tool-bash`, die den Approval-Policy-Prompt, die Wechsel-Benachrichtigung und sandboxed Tool-Ergebnisse rendern, die durch die Regler-Events dieses Services ausgewählt werden; `permission/preset` selbst ist nur im Log.

#### KV-Cache-Effekt

Keine direkte Invalidierung; der genannte Consumer besitzt alle Request-Prefix-Änderungen.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was der Preset-Service nicht bietet. Es sind aktuelle Paket-Constraints, kein Permission-System-Vergleich.

- **Nur zwei Mechanismus-Regler sind gebündelt** — Presets wählen Sandbox-Modus und Approval-Policy; eine Agent-/Profile-Wahl ist noch nicht Teil von `PresetSpec`.
- **`custom` ist nur abgeleitet** — Aufrufer können aus einer unpassenden Reglerkombination herauswechseln, können aber über diesen Service kein benanntes Custom-Preset ansteuern oder persistieren.
- **Die Preset-Tabelle ist prozessebene** — die Konfiguration ist für die Plugin-Lebensdauer fixiert; das Ändern verfügbarer Presets erfordert ein Neuladen des Plugins.
- **Gespeicherte Defaults müssen in der Preset-Tabelle bleiben** — das Entfernen des referenzierten Presets lässt die Permission-Settings-Registrierung fehlschlagen, bis der `permission`-Abschnitt in `settings.yaml` aktualisiert oder zurückgesetzt ist.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
