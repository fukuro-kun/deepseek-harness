---
description: "Die Session-Projection-Registry für Entwickler, die vollständige aktuelle Werte log-abgeleiteten, pro Session geltenden Zustands an Client-Carrier ausliefern, sowie für Maintainer des Drive-Vertrags."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-projection
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Verwende `dsh-session-projection`, wenn Clients aktuellen Pro-Session-Zustand — etwa Todos, Goals oder Konversationsstatistiken — benötigen, ohne das rohe Event-Log erneut abzuspielen. Domänen definieren synchrone Projektionen über committed Session Events, und Clients erhalten vollständige, schema-validierte JSON-Werte über Snapshots und Änderungsbenachrichtigungen. Snapshots bezeichnen das letzte Event, das jeder zurückgegebene Wert widerspiegelt, sodass Carrier den Zustand mit dem passenden Verlaufs-Schnitt paaren können. Projektionszustand kann für schnellere Cold Reads geCheckpointed werden, während Host-only-Projektionen privat beim Host bleiben.

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

Mounte `dsh-session-projection` überall dort, wo Client-Carrier aktuelle Werte log-abgeleiteten Session-Zustands benötigen. Domänen-Plugins registrieren Einheiten; Carrier lesen Snapshots und abonnieren den Change-Feed; keine Seite kennt die andere.

### Wann es wählen

Wähle es, wenn eine Domäne Zustand hält, den Clients sehen sollen, ohne ihn selbst neu abzuleiten — eine Todo-Liste, ein Goal-Snapshot, Konversationsstatistiken. Die Registry treibt Einheiten eifrig über committed Events, sodass der Wert jeder registrierten Einheit per Konstruktion aktuell ist. Überspringe es für Host-only-Buchhaltung, die kein Client liest: Eine Einheit ohne `wire`-Block bleibt Host-only. Ein Host-Leser deklariert entweder `sessionProjections` im `inject` seines Plugins oder scheitert explizit, wenn die Registry oder ein benötigter Key fehlt. Beitragende können die optionale Registrierung über `ctx.inject(['sessionProjections'], ...)` bewahren.

### Eine Projektionseinheit definieren

Eine Domäne trägt eine `ProjectionDefinition` pro State-Key bei: einen Key, ein State-Schema, einen Anfangszustand, einen synchronen Fold `apply(state, event)`, einen optionalen `wire`-Block, der State auf eine Client-View projiziert, und eine `stateVersion`, die erhöht wird, sobald sich State-Felder oder Fold-Semantik ändern:

```text
const definition = {
  key: 'todo',
  stateSchema: todoStateSchema,
  stateVersion: 1,
  init: (_header, _inheritedEventCount) => ({ items: [] }),
  apply: (state, event) => event.type === 'todo/upsert'
    ? { items: event.data.items }
    : state,
  wire: {
    viewSchema: todoViewSchema,
    view: state => ({ items: state.items }),
  },
}
```

`init(header, inheritedEventCount)` erhält sowohl leichtgewichtige Metadaten als auch den exakten fork-geerbten Schnitt; es darf diesen Schnitt nicht aus `firstLiveSeq` oder `session/end-seed` ableiten. `apply` muss synchron sein und für Events, die die Einheit nicht betreffen, dieselbe State-Referenz zurückgeben — eine unveränderte Referenz bedeutet null nachgelagerte Arbeit. Die Registry vergleicht aufeinanderfolgende rohe `wire.view`-Ergebnisse mit `Object.is`; eine Objekt- oder Array-View muss ihre Referenz wiederverwenden, um Publikation bei rein internen State-Änderungen zu unterdrücken, während ein strukturell gleiches neues Objekt dennoch eine Änderung ist. Ein State-tragendes Log-Event muss den vollständigen Nach-Änderungs-Zustand tragen, niemals ein nacktes Delta.

### Registrieren und lesen

`register(definition)` installiert die Einheit; Registrierende mit gleichem Key und gleicher `stateVersion` teilen ihre Cells, während eine inkompatible Version oder ungültige `stateVersion` wirft. Die Registrierung ist ein Effekt auf der aufrufenden Fiber, sodass das letzte Unload den Key und seine gecachten Cells entfernt. Carrier lesen mit `snapshot(session)` einen konsistenten synchronen Schnitt über jede client-sichtbare Einheit — `{ asOfSeq, values }`, wobei `asOfSeq` die Seq des letzten Events ist, das jeder Wert widerspiegelt — und abonnieren mit `onChanged(listener)` Änderungsbenachrichtigungen. `stateOf(session, key)` liest den live schreibgeschützten Host-State einer Einheit, ohne unbeteiligte Views zu berechnen.

```text
const dispose = ctx.sessionProjections.register(definition)
const { asOfSeq, values } = ctx.sessionProjections.snapshot(session)
```

Eine Domäne, die projizierten Zustand benötigt, deklariert `sessionProjections` als Cordis-Service-Abhängigkeit; optionale Beitragende können unter `ctx.inject(['sessionProjections'], …)` registrieren. Carrier verwenden `ctx.get('sessionProjections')` und lassen ihren Block oder ihre Frames weg, wenn die Registry fehlt.

### Persistierte Checkpoints

Der State jeder Einheit wird geCheckpointed — client-sichtbar und Host-only gleichermaßen — über `checkpoint(session)`, und das Schwesterpaket [session-projection-cache](../session-projection-cache/README.de.md) persistiert diese Checkpoints, sodass Cold Reads vollständige Log-Ladevorgänge überspringen. Checkpoint-Watermarks verwenden `SessionSeqCursor` (`-1` für ein leeres Log), während Replay-Starts `SessionLogOffset` verwenden; `restoreFloor` und `restore` implementieren das Leserezept, ohne ein vorhandenes Event mit einer Log-Lücke zu verwechseln.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Drive-Maschinerie und den Einheitenvertrag; der beobachtbare Vertrag ist in [Dieses Paket verwenden](#use-this-package) behandelt.

### Designkonzept

Das Paket ist die Service-Definition- und Drive-Rolle einer Capability Seam: Das Framework treibt, die Domäne rechnet. Die Registry abonniert `session/event` genau einmal; jedes committed Event durchläuft eifrig den `apply` jeder registrierten Einheit (Cells werden lazy bei erstem Zugriff gebaut). Das erste `Object.is`-Gate überspringt View-Arbeit, wenn die State-Referenz unverändert ist; ein Zwei-Slot-Live-Drive-Cache verwendet die vorherige rohe View wieder, und ein zweites `Object.is`-Gate unterdrückt Publikation, solange die rohe View-Referenz unverändert ist. Carrier lesen `snapshot()` im selben Tick wie ihren Page-Slice — genau das macht `asOfSeq` zu einem konsistenten Schnitt; eine versehentlich async View gibt ein Promise zurück und scheitert an `wire.viewSchema.parse`.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `SessionProjectionRegistry`-Service, `ProjectionDefinition`, Snapshot- und Checkpoint-Maschinerie |
| [`src/types.ts`](src/types.ts) | Die merge-erweiterbaren Typ-Tabellen `SessionProjectionMap` und `SessionProjectionStateMap` |
| — | Es wird kein Runtime-Invarianten-Begleiter publiziert; die eigenen Verträge der Registry (Duplicate-Key- und stateVersion-Ablehnung, effektgebundene Entfernung, das Object.is-Change-Gate) werden synchron innerhalb des Services durchgesetzt und von seiner Spec bewiesen, die Drive-Relation (jedes committed `session/event` durchläuft jede Einheit) zu prüfen würde das Drive erneut laufen lassen — die Implementierung duplizieren statt Drift zu erkennen —, und die Served-Value-Relation (jeder ausgelieferte Key hat eine live Registrierung) lebt auf dem Wire-Pfad jedes Carriers, der kein Cordis-Event emittiert, das ein Begleiter beobachten könnte; Carrier-Specs assertieren sie. Synchrone-Einheiten-Disziplin wird so weit praktisch durch das `schema.parse` an der Grenze erzwungen (eine Promise-zurückgebende View scheitert laut). |

### Drive- und Checkpoint-Fluss

Ein committed Event treibt jede registrierte Einheit in Registrierungsreihenfolge; eine client-sichtbare Einheit, deren rohe View sich per `Object.is` ändert, benachrichtigt den Change-Feed mit ihrer schema-validierten View und der auslösenden Seq. Das Live Drive behält seine vorherige und aktuelle rohe View; Snapshots und Cold Reads bleiben vollständige, unabhängige Reads. `checkpoint(session)` gibt pro Einheit eine losgelöste `(key → {ver, seq, val})`-Zeile für den persistierten Cache zurück; `restoreFloor` verankert einen Tail-Read ein Event unter dem niedrigsten nutzbaren Watermark, damit ein geschrumpftes Log erkannt wird, und `restore` foldet persistierte Zeilen über einem gespeicherten Suffix neu und verwirft jede Zeile, deren `ver` nicht passt oder die Events jenseits des gespeicherten Endes behauptet.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen vom Einheitenvertrag zum Read-Model-Subsystem und zum persistierten Cache.

- [Session-Projection-Subsystem](../../../docs/subsystems/session-projection.de.md) — der Projektionseinheiten-Vertrag, Drive-Semantik und die generierte Service-API.
- [Session-Persistence-Subsystem](../../../docs/subsystems/persistence.de.md) — das Event-Log, über dem Projektionen folden.
- [Session-Projection-Cache](../session-projection-cache/README.de.md) — die persistierten Checkpoints, die Cold Reads vollständige Log-Ladevorgänge überspringen lassen.
- [Session-Paketkarte](../README.de.md) — benachbarte Persistence-, Title- und Telemetry-Pakete.
- [Session-Projection-RFC](../../../.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.de.md) — die Designbegründung für Projektionen und das Command-Log.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da die Projektions-Registry clientseitige Read Models bereits geloggten Session-Zustands ausliefert und nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; Projektionen stellen niemals Provider-Requests zusammen oder senden sie.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo die Projektions-Registry bei Skalierung Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgabenstapel.

- **Jede Tail-Page trägt jeden client-sichtbaren Key** — es gibt noch kein Pro-Key-Opt-out oder eine Lazy-Key-Request-Form; akzeptabel, solange Werte UI-maßstäbliche Gesamtzustände sind, neu bewerten, wenn der Wert einer Domäne groß wird.
- **Die Einheitentabelle ist prozessweit, Key-Präsenz ist also kein Pro-Session-Capability-Signal** — ein Key, den ein beliebiges Agent-Preset registriert, erscheint im Snapshot jeder Session; ein Client muss den Wert lesen statt einen fehlenden Key als Fehlen des Features zu lesen.
- **Eifriges Drive berührt jede Einheit pro Event** — per Konstruktion günstig (Whole-Value-Regel und State-/View-Referenz-Gates), aber ein heißer Pfad würde Pro-Einheit-Event-Type-Prefilter rechtfertigen.
- **Registry-Cells leben nur im Speicher** — ein Neustart baut durch Folden des Logs beim ersten Zugriff neu auf; Kompositionen, die `dsh-session-projection-cache` mounten, seeden diesen Fold stattdessen aus persistierten Zeilen.
- **Synchrone-Einheiten-Disziplin ist nur teilweise mechanisch** — `wire.viewSchema.parse` weist eine Promise-zurückgebende View ab, aber ein `apply`, das blockiert oder zerrissenen Nicht-Session-Zustand liest, ist Review-Sache.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
