---
description: "In-process fork subagent-Backend für Nutzer und Maintainer, die children auswählen, konfigurieren oder debuggen, die mit den abgeschlossenen Turns des Elternteils geseedet werden."
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent-fork-in-process

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-subagent-fork-in-process` ist ein in-process subagent-Backend, das jedes child mit den abgeschlossenen Konversations-Turns des Elternteils seedet: Das child sieht jeden abgeschlossenen Turn und keinen des in-flight-Turns, sodass Folgearbeit auf der Konversation aufbaut, ohne sie zu duplizieren. Ein Delegations-Tool erreicht es unter dem Provider-Namen `fork`, und sein Verhalten entspricht dem spawn-Backend bis auf den Session-seed. Wählen Sie es, wenn eine Teilaufgabe diese Konversation fortsetzt; wählen Sie spawn, wenn das child eigenständig stehen muss. Der seed ist eine einmalige Momentaufnahme zum fork-Zeitpunkt: Spätere Eltern-Turns erreichen das child niemals.

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

Mounten Sie dieses Backend, wenn delegierte Arbeit auf der Konversation des Elternteils aufbauen muss. Der übliche Pfad spiegelt spawn: Laden Sie den subagent-Service und dieses Backend und richten Sie dann ein Delegations-Tool wie `dsh-tool-subagent` auf den `fork`-Provider.

### Wann es wählen

Wählen Sie fork, wenn das child die abgeschlossenen Turns der Konversation braucht — eine Folgeanalyse, ein Review, eine Fortsetzung. Wählen Sie spawn, wenn das child sauber starten soll, oder ein out-of-process-Backend, wenn das child diesen Prozess nicht teilen darf. Der seed trägt nur Konversationshistorie: Das child erhält weiterhin einen frischen Tool-scope und nichts von der Autorität des Elternteils.

### Seed-Grenze

Der seed endet am letzten abgeschlossenen Turn des Elternteils. Der aktuelle Tool-Calling-Turn des Elternteils ist noch offen, wenn ein subagent startet, sodass dieser in-flight-Turn niemals enthalten ist; vor dem ersten abgeschlossenen Turn ist der seed leer, und das child verhält sich wie ein frischer spawn.

### Minimale Konfiguration

Laden Sie den subagent-Service und dieses Backend und konfigurieren Sie dann ein Delegations-Tool. Diese Composition stellt ein `subagent`-Tool bereit, das von fork getragen wird:

```yaml
- name: '@deepseek-ai/dsh-subagent'
- name: '@deepseek-ai/dsh-subagent-fork-in-process'
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: fork
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `providerName` | `fork` | Provider-Name, der auf `ctx.subagents` registriert wird |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-subagent-fork-in-process) ist die erschöpfende Quelle für jedes akzeptierte Feld und dessen JSDoc.

### Was eine fork-Delegation tut

Ein Tool-Aufruf startet ein child, das mit den abgeschlossenen Turns geseedet ist, und wartet auf sein Ergebnis: Das child sieht die Konversation bis zum letzten abgeschlossenen Turn des Elternteils, arbeitet in seiner eigenen Session, und das Elternteil erhält nur seine finale Ausgabe — oder ein fehlerhaftes Tool-Ergebnis bei Abbruch, Ablehnung, token-Limit-Kürzung oder Start-Zurückweisung. Der seed wird einmalig beim Start erfasst; spätere Eltern-Turns erreichen das child niemals.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Design-Entscheidungen hinter dem Backend und woher das Verhalten in [Dieses Paket verwenden](#use-this-package) stammt.

### Designkonzept

Ein Unterschied zu spawn, als Daten ausgedrückt: Das Backend berechnet das balancierte Präfix abgeschlossener Turns aus dem Log des Elternteils und reicht es als Session-seed des child an den geteilten in-process-Treiber. Weil live Sequenznummern Array-Indizes gleichen, bleibt das Präfix ein gültiger seed, der bei Sequenz null beginnt, und der Treiber protokolliert seine Länge, sodass der Ergebnisleser eine geseedete Eltern-Nachricht nie für child-Ausgabe hält.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Provider-Registrierung: Präfix-Berechnung, `Config`-schema, Fähigkeitsdeklaration |
| — | Es wird kein Runtime-invariant-Begleitexport veröffentlicht; dieses Paket stellt keine unabhängige Event-Sequenz oder veränderliche Datenbeziehung über die Verträge hinaus bereit, die an seinem besitzenden seam durchgesetzt werden. |

### Ablauf

Bei `start` wird das Präfix aus dem Event-Log des Elternteils bis einschließlich des letzten `turn/end` geschnitten; der geteilte Treiber erstellt dann das child mit diesem seed, wendet dieselbe persona-, Tool-Filter- und strukturierte-Ausgabe-Einrichtung an, treibt eine Aufgabe, liest die eigene finale Ausgabe des child und disposed in Ruhezustand. Der Provider bewirbt `agentOptions` plus dieselben Ausgabe-, Tiefen-, Filter- und persona-Fähigkeiten wie spawn. `prepareContinuable` erfasst das Präfix einmalig bei der Erstellung, weil es Teil des eigenen dauerhaften transcript des child wird.

### Lifecycle-Bindung

Das Basis-bundle und die ACP-/Headless-Beispiele binden diesen Provider an `backgroundMode: one-shot`, während die CLI-presets `continuable` wählen. Beide bewahren das geerbte Anfrage-Präfix: Elternteil und child erhalten dieselbe Messaging-Tool-Definition und -Reihenfolge, und die Eltern-id sowie Rückgabe-Anleitung des continuable child liegen in seiner initialen Nutzeraufgabe nach der geerbten Historie ([cache-erhaltender fork Agent Note](../../../.agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.de.md)).

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der paketweite Vertrag nicht ausreicht; sie führen vom geteilten subagent-Modell zu den Geschwister-Backends und der Design-Evidenz für die one-shot-Bindung.

- [Subagent-Subsystem](../../../docs/subsystems/subagent.de.md) — Start-Anfragen, Ergebnisse, Provider-Vertrag sowie in-process-Tiefe und seed.
- [dsh-subagent-in-process-driver](../subagent-in-process-driver/README.de.md) — der geteilte Lauf-Treiber, den dieses Backend aufruft.
- [dsh-subagent-spawn-in-process](../subagent-spawn-in-process/README.de.md) — das Geschwister-Backend mit frischem child.
- [dsh-tool-subagent](../tool-subagent/README.de.md) — das modellseitige Delegations-Tool, das diesen Provider erreicht.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-subagent-fork-in-process) — jedes akzeptierte Config-Feld und seine Quelldeklaration.
- [Fork children stay one-shot](../../../.agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.de.md) — warum ausgelieferte Compositionen fork an one-shot binden.

-----

<a id="model-experience"></a>
## Model Experience

### Child-agent-Historie und Umschlag

#### Was das Modell sieht

Das child erhält das balancierte Präfix abgeschlossener Eltern-Turns, dann den neuen Aufgabeninhalt wortwörtlich. Eine konfigurierte persona überdeckt Prompt-Text im frischen scope des child; eine Tool-Einschränkung filtert seine globalen wire-schemata, die ausführbare Lookup und die PTC-mode-SDK-Bindings, aber nicht eigenständige Anleitungen. Die Tool-Sicht und Autorität des Elternteils werden nicht vererbt; eine optionale strukturierte-Ausgabe-Anfrage fügt einen child-exklusiven Vertrag hinzu; der aktuelle in-flight-Turn des Elternteils ist ausgeschlossen.

#### Token-Effekt

Ein fork dupliziert die erhaltene abgeschlossene Historie in die Anfrage des child, die dann ihre eigenen tokens unabhängig ansammelt. Eine persona ändert wiederholte Prompt-Kosten; Filterung ändert schema- oder generierte-SDK-Kosten; ein fork im ersten Turn hat keine geerbte Historie.

#### KV-Cache-Effekt

Das child kann das geerbte byte-identische Präfix unter demselben Provider und Modell wiederverwenden. persona-, Tool-Filter-, generierte-SDK- oder Route-Änderungen können die Wiederverwendung vor der geerbten Historie ungültig machen; spätere child-Historie ist append-only. Continuable Messaging fügt keinen child-exklusiven system-prompt-Abschnitt oder Tool-schema hinzu; die Eltern-id und Rückgabe-Anleitung folgen der geerbten Historie in der initialen Nutzeraufgabe ([cache-erhaltender fork Agent Note](../../../.agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.de.md)).

### Eltern-Tool-Ergebnis, indirekt

#### Was das Modell sieht

Das Elternteil erhält über `dsh-tool-subagent` nur die eigene finale Ausgabe des child, nicht das geerbte Präfix oder Zwischenarbeit.

#### Token-Effekt

Die Eltern-Eingabe wächst um ein datenabhängiges finales Ergebnis, das bis zur compaction erhalten bleibt.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Anfrage-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Backend die falsche Wahl ist; sie sind aktuelle Paket-Constraints.

- **Der seed ist eine einmalige Momentaufnahme** — das child sieht die abgeschlossenen Eltern-Turns zum fork-Zeitpunkt und nichts, was das Elternteil danach protokolliert; es gibt kein live Kontext-Sharing.
- **Die fork-Lifecycle-Richtlinie unterscheidet sich je nach Composition** — das Basis-bundle und die ACP-/Headless-Beispiele verwenden one-shot-fork, während die CLI-presets continuable fork verwenden. Beide halten das geerbte Präfix wiederverwendbar, weil Eltern- und child-Messaging-Definitionen byte für byte übereinstimmen; explizite persona-, Tool-Filter-, generierte-SDK- oder Route-Änderungen können die Gleichheit dennoch brechen. Begründung: der [cache-erhaltende fork Agent Note](../../../.agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.de.md).
- **Ausgelieferte fork-Tools stellen keine child-LLM-Routenwahl bereit** — sie erben Provider und Modell des Elternteils, damit die kopierte Historie für KV-Cache-Wiederverwendung in Frage kommt. Routenwahl bleibt deaktiviert, bis eine Änderung die Wiederverwendung bewahren oder begrenzte Neuberechnungskosten offenlegen kann; der [modellgewählte Route Agent Note](../../../.agents/notes/implemented/feature/2026-08-18-model-selected-subagent-routes.de.md) besitzt diese Einschränkung.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
