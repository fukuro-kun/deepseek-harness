---
description: "Semantische Session-Durability-Checkpoints für Anwender und Maintainer, die persistierte Agents deployen, die bei einem Crash weder eine Model-Anfrage noch einen Tool-Seiteneffekt verlieren dürfen."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-checkpoint-policy

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Dieses Paket zusammen mit einem Session-Persistenz-Backend einsetzen, um Arbeit vor einer Model-Anfrage, bevor ein Top-Level-Tool externe Effekte auslösen kann, und vor Beginn des nächsten Agent-Schritts dauerhaft zu machen. Nach jedem Checkpoint kann ein Crash aus den gespeicherten Requests, Tool Calls, Responses und Results fortgesetzt werden, statt sie zu verlieren. Checkpoint-Fehler sind fail-closed: Der Model-Adapter oder der Top-Level-Tool-Body läuft nicht, bevor der durable Write erfolgreich war. Das Paket hat keine Konfiguration und fügt weder Prompt noch Tool Schema hinzu; unvollendete Assistant-Streams bleiben transient, und unterbrochene Tool Calls werden mit unbekanntem Outcome wiederhergestellt statt automatisch wiederholt.

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

Dieses Plugin in jeder Composition mounten, die Sessions persistiert und einen Crash überstehen muss, ohne Arbeit zu wiederholen oder zu verlieren. Persistenz und Checkpoint-Scheduling sind getrennte Plugins: Ein Backend speichert das Event Log, und diese Policy entscheidet, wann der Store geflusht werden muss.

### Wann es wählen

Für jeden persistierten Agent wählen, der unterbrochen werden kann — ein Crash zwischen einem aufgezeichneten Tool Call und seinem Result oder zwischen einer Model-Anfrage und ihrer Response ist genau der Fehler, den diese Policy eindämmt. Ein Backend ohne sie zu laden ist valide, aber schwächer: Events, die noch innerhalb des Batching-Fensters des Backends liegen, oder ein ausstehender Write können verloren gehen. Die Policy überspringen, wenn nichts Sessions persistiert oder wenn ein spezialisiertes Deployment das Checkpoint-Scheduling bewusst ersetzt.

### Minimale Konfiguration

Es existieren keine Konfigurationsfelder; das Plugin wird einfach neben einem Persistenz-Backend geladen:

```yaml
- id: session-persistence
  name: '@deepseek-ai/dsh-session-persistence-jsonl'

- id: session-checkpoints
  name: '@deepseek-ai/dsh-session-checkpoint-policy'
```

### Was durable wird

Drei Barrieren werden checkpointed. Die Model-Anfrage wird geflusht, bevor der Adapter-Stream konstruiert wird, sodass ein Crash vor einer Response keinen unpersistierten Request erneut abspielen kann. Ein Top-Level-Tool-Call wird geflusht, bevor der Tool-Body läuft, sodass ein aufgezeichneter Call vor jedem externen Seiteneffekt durable ist; verschachtelte Tool-Dispatches nutzen den Checkpoint des äußeren Calls wieder. An jeder `agent/pre-step`-Grenze wird alles, was der vorherige Step committed hat — seine Response und die geordneten Tool Results — geflusht, bevor der nächste Request abgeleitet wird.

### Beobachtbares Verhalten und Fehler

Nach einem Checkpoint ist die checkpointete Arbeit durable: Resume stellt sie aus dem Store wieder her wie jede persistierte Session. Trifft ein Cancel ein, während ein Tool-Checkpoint-Flush aussteht, liefert der Wrapper das kanonische `ABORTED_BEFORE_DISPATCH`-Result und betritt den Tool-Body nie. Eine Checkpoint-Reject ist an beiden Grenzen fail-closed — der Adapter- oder Top-Level-Tool-Body läuft nicht — und eine Reject an der Step-Grenze lässt den Turn fehlschlagen, bevor ein weiterer Request startet.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie die Policy in den Loop und den Persistenz-seam eingebunden wird; der beobachtbare Contract ist in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Das Plugin ist eine reine Listener-Composition über drei seams ohne eigenen State: Es wrapped `llm/stream`, sodass der Downstream-Stream erst konstruiert wird, wenn die gepufferten Request-Events der Live-Session durable sind; es wrapped `tools/execute` nach Pre-Execute-Policy und Guards, sodass ein Top-Level-Tool-Body erst läuft, nachdem sein aufgezeichneter Call durable ist; und es hört auf `agent/pre-step`, um den vorherigen Response/Result-Batch vor der Request-Ableitung zu persistieren. Der Flush des Session Stores ist die gemeinsame Durability-Barriere; konkurrierende Tool-Checkpoints serialisieren über ihn und können keine doppelten Sequenznummern erzeugen.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `apply` installiert die drei Checkpoint-Listener |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; die Checkpoint-Reihenfolge wird am abgefangenen waterfall und an den Persistenz-seams erzwungen; diese zustandslose Policy besitzt keine eigenständige mutable Relation. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der Paket-Contract nicht ausreicht. Sie führen vom Durability-Modell zu dem seam, dem die Policy beitritt, und zu den ausgelieferten Backends.

- [Session-Persistenz-Subsystem](../../../docs/subsystems/persistence.de.md) — der Flush-Checkpoint, das Batching-Fenster und die Crash Recovery, die jedes Backend teilt.
- [Session-Paketübersicht](../README.de.md) — benachbarte Persistenz-, Projektions-, Titel- und Telemetrie-Pakete.
- [Session-Persistenz-seam](../session-persistence/README.de.md) — der `ctx.sessionPersistence`-Service, über den diese Policy flusht.
- [JSONL-Persistenz-Backend](../session-persistence-jsonl/README.de.md) — das ausgelieferte Backend, neben dem diese Policy üblicherweise geladen wird.

-----

<a id="model-experience"></a>
## Model Experience

### Unterbrochene Calls

#### Was das Modell sieht

Das Plugin fügt weder Prompt noch Tool Schema hinzu. Ein harter Crash nach einem Tool-Checkpoint, aber vor seinem Result hinterlässt einen durable ungematchten Call; die Session-Recovery liefert das modellsichtbare `TOOL_OUTCOME_UNKNOWN`-Result, das `dsh-session` gehört. Die Nachricht erlaubt Retry für Read-Only- oder idempotente Arbeit und verlangt State-Verifikation oder Nutzerbestätigung für Calls, die Seiteneffekte gehabt haben können.

#### Token-Effekt

Erfolgreiche Checkpoints fügen keine Tokens hinzu und verändern den Request nicht. Recovery fügt eine kurze Tool-Result-Nachricht hinzu, um den unterbrochenen Transcript auszugleichen.

#### KV-Cache-Effekt

Das Repair-Result wird hinter dem wiederverwendbaren Prefix angehängt und invalidiert daher keine früheren Cache-Einträge.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo die Durability-Garantie der Policy endet. Sie sind aktuelle Paket-Constraints, kein Aufgabenstau.

- **Durable Ausführungsintention, kein Exactly-once-Effekt** — die Policy zeichnet auf, dass ein Call dispatched wurde, nicht dass sein externer Effekt abgeschlossen wurde. Tools mit Seiteneffekten sollten `exec.callId` als Idempotency-Key weiterreichen, wenn ihr Provider einen unterstützt.
- **Kein Checkpoint innerhalb eines aktiven Model-Attempt** — ein harter Crash kann transiente Assistant-Frames verlieren, die ihre durable `assistant/message`- oder `assistant/attempt`-Settlement noch nicht erreicht haben.
- **Unbekanntes Outcome statt automatischem Retry** — ein persistierter Call ohne Result kann nicht beweisen, ob sein externer Effekt abgeschlossen wurde; Recovery verzeichnet daher ein unbekanntes Outcome statt zu wiederholen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
