---
description: "Opt-in-Tmux-Ortskontext pro Turn für Anwender und Maintainer, die das Session-, Window- und Pane-Bewusstsein des Agenten aktivieren oder tunen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tmux-context
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-tmux-context` lässt das Modell die tmux-Session, das Window, die Pane und das Pane-Tree-Layout identifizieren, die seinen Agent-Prozess enthalten. Es fügt eine durable, quellenattribuierte Messung nur dann im ersten Step eines Turns hinzu, wenn sich der Ort geändert hat. Terminals, die lediglich tmux-Umgebungsvariablen erben, ohne in der benannten Pane zu laufen, fügen nichts hinzu; fehlgeschlagene Abfragen fügen ebenfalls nichts hinzu und lassen den Turn nicht fehlschlagen. Dieses Paket ist Opt-in und in den mitgelieferten Web- oder Headless-Profilen nicht enthalten.

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

Dieses Plugin mounten, wenn der Agent-Prozess innerhalb von tmux läuft und das Modell davon profitiert, seine Window- und Pane-Position zu kennen. Jede Messung ist eine zusätzliche User-Role-Nachricht in der durable Historie; ein unveränderter Ort fügt nichts hinzu, sodass langlebige Sessions wenig ansammeln.

### Was der Agent bekommt

In jedem Turn, dessen tmux-Status sich geändert hat, erhält das Modell eine quellengetaggte Kontextnachricht mit Session-Name, Window-Index und -Name, Pane-Index und -ID, Active-Flags und dem kompakten Pane-Tree-Layout. Messungen erfolgen nur im ersten Step eines Turns; eine mid-turn verschobene oder vergrößerte Pane spiegelt sich im nächsten Turn. Pixel-Größen sind absichtlich ausgenommen, und der sichtbare Inhalt benachbarter Panes wird nie erfasst.

### Konfiguration

Das minimale Mount braucht keine Konfiguration. Ein positives `refreshIntervalMs` unterdrückt zusätzlich Injectionen, die innerhalb dieser Millisekunden der letzten folgen; Weglassen oder `0` injiziert, wann immer sich der tmux-Status seit der letzten Injection geändert hat.

```yaml
- name: '@deepseek-ai/dsh-tmux-context'
  config:
    refreshIntervalMs: 60000
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `refreshIntervalMs` | `0` (jeder geänderte Turn) | Mindestmillisekunden zwischen durable Injectionen in einer Session |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tmux-context) ist die erschöpfende Quelle für jedes akzeptierte Feld und dessen JSDoc.

### Wann der Ort bekannt ist

Der Prozess gilt nur dann als in tmux, wenn sein Controlling-Terminal mit dem `#{pane_tty}` der Pane übereinstimmt; ein aus einer tmux-Shell gestartetes Terminal (ein integriertes VS-Code-Terminal, ein Desktop-Launcher) erbt die Variablen, aber nicht die Pane, und gilt daher als nicht in tmux. Ein fehlender `ctx.shell`, eine fehlende Umgebung oder eine fehlerhafte Messung ist ein No-op, und eine Executor-Ablehnung wird eingedämmt und als Warnung geloggt, statt den Turn fehlschlagen zu lassen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design des Plugins; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Das Plugin registriert einen `agent/pre-step`-Listener vorne an, der nur im ersten Step jedes Turns läuft. Bei Fälligkeit führt er ein Read-Only-Kommando über den `ctx.shell`-Executor-Service aus — Sandbox und Policy des Deployments gelten, und das Plugin besitzt keinen Subprocess-Code. Das Kommando vergleicht das `#{pane_tty}` von `$TMUX_PANE` mit dem eigenen Controlling-Terminal dieses Prozesses, bevor es tab-separierte Felder ausgibt, sodass eine geerbte Umgebung als nicht in tmux gelesen wird. Das Plugin injiziert nur dann neu, wenn sich der gerenderte Status von seiner letzten Injection unterscheidet.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: First-Step-Listener, Shell-Abfrage, Change-Suppression, Scheduling |
| — | Es wird kein Runtime-Invariant-Begleitmodul veröffentlicht; eine Messung ist ein Per-Turn-Snapshot externen tmux-Status, sodass die Session keine eventübergreifende Relation zum Prüfen enthält; Scheduling und Format gehören den Pipeline-Tests. |

### Hauptablauf

Im ersten Step eines Turns prüft der Listener, ob eine Injection fällig ist, fragt den Ort über `ctx.shell` ab und vergleicht den gerenderten Status mit der letzten durable Injection dieser Quelle. Change-Suppression und Intervall-Scheduling scannen die rohen durable Session-Events, sodass der Schedule Compaction und wiederaufgesetzte Prozesse ohne prozesslokalen Cache-State überlebt; Sessions schedulen unabhängig. Ein nachgelagerter Pre-Step-Listener, der ablehnt oder fehlschlägt, verhindert, dass die Messung aufgezeichnet wird.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der paketweite Contract nicht ausreicht. Sie führen von der Designentscheidung zum Executor, über den die Abfrage läuft, und zur erschöpfenden Konfiguration.

- [Entscheidungsaufzeichnung zum Tmux-Ortskontext](../../../.agents/notes/archived/feature/2026-07-27-tmux-location-context.md) — Designbegründung für die tty-basierte Erkennung und die Form der Messung.
- [Shell-Subsystem](../../../docs/subsystems/shell.de.md) — der Executor-Service, über den die Read-Only-Abfrage läuft.
- [Context-Gruppenkarte](../README.de.md) — die Schwester-Request-Context-Pakete.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tmux-context) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

### Tmux-Ort zur Vorbereitungszeit

#### Was das Modell sieht

In jedem Turn, dessen tmux-Status sich geändert hat, eine quellengetaggte Kontextnachricht mit den drei folgenden Zeilen. `<window-layout>` ist tmux' kompakte Pane-Tree-Beschreibung; Pane- und Window-Pixel-Größen sind absichtlich ausgenommen, und der Inhalt benachbarter Panes wird nie erfasst.

##### Messung eines geänderten Turns

```markdown
tmux location (turn <turn>):
session <session>, window <index> "<name>", pane <index> <pane-id>
window active=<0|1>, pane active=<0|1>, layout <window-layout>
```

#### Token-Effekt

Jede dreizeilige Messung sammelt sich an, bis die Compaction sie überdeckt. Unveränderte Orte und Intervall-Suppression fügen nichts hinzu.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Prefix und invalidiert keine bestehenden KV-Cache-Einträge.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen bestimmen, wann der Tmux-Ortskontext ungeeignet ist. Sie sind aktuelle Paketbedingungen.

- **Nur erster Step** — eine mid-turn verschobene oder vergrößerte Pane spiegelt sich im nächsten Turn, nicht zwischen Steps.
- **Nur eigener Ort** — das Plugin erfasst nie den sichtbaren Text benachbarter Panes.
- **Layout, nicht Größe** — Pane-/Window-Pixel-Dimensionen werden weggelassen; nur der Layout-Tree und die Active-Flags werden gemeldet.
- **Tab-getrennte Felder** — ein tmux-Window-Name mit der literalen Zweizeichensequenz `\t` würde die Messung falsch splitten und als fehlerhaft übersprungen; gewöhnliche Namen sind unbetroffen.
- **tty-basierte Pane-Erkennung** — der Prozess gilt nur dann als "in tmux", wenn sein Controlling-Terminal mit dem `#{pane_tty}` von `$TMUX_PANE` übereinstimmt. Das schließt absichtlich Terminals aus, die `$TMUX`/`$TMUX_PANE` von einem tmux-Vorfahren geerbt haben (z. B. ein integriertes VS-Code-Terminal). `ps -o tty=` ist POSIX; die Prüfung ist ein No-op überall dort, wo es oder `#{pane_tty}` nicht verfügbar ist.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
