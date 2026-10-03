---
description: "Das event-sourced Session-Log und der In-Memory-Store für Anwender und Maintainer, die den durable Record hinter jeder Agent-Interaktion bauen, inspizieren oder erweitern."
kind: "package-reference"
---

# @deepseek-ai/dsh-session
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-session` zeichnet jeden modellsichtbaren Fakt in einem append-only Session-Log auf und leitet die Modell-History aus diesem Record ab. Consumer können Sessions inspizieren, replayen, forken und flushen, wobei historische Events erhalten bleiben; Compaction verbirgt überholte Einträge vor der aktiven Konversation, ohne sie zu löschen. Sessions bleiben im Speicher, sofern kein Persistence-Backend hinzukommt, und Durability-Checkpoints warten auf konfigurierte Backends. Wähle dieses Paket überall dort, wo ein Agent einen rekonstruierbaren Session-Record braucht; es ruft selbst keine Modelle auf.

## Inhalt

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounte `dsh-session` überall dort, wo eine Session existieren muss. Es erzeugt und hält event-sourced `Session`-Instanzen im Speicher; durable Ablage wird von einem Persistence-Plugin aufgeschichtet, das den `session/event`-Feed abonniert.

### Sessions erzeugen und inspizieren

`ctx.sessions.create()` baut eine live Session, die an das aufrufende Fiber gebunden ist; `get(id)` und `list()` finden Sessions, und `fork()` erzeugt eine Child-Session aus einem stabilen Präfix einer live Session.

```text
const session = ctx.sessions.create(sessionId, { meta: { cwd: '/workspace' } })
ctx.sessions.get(sessionId)      // the live session
ctx.sessions.list()              // every live session, in creation order
```

### Append und Derivation

`session.append(type, data, opts?)` committet ein typisiertes Event — es snapshotet und friert die Payload ein, validiert sie als verlustfreies JSON und benachrichtigt Observer. `session.deriveMessages()` projiziert das Log in das `Message[]`, das das Modell sieht, inkrementell und gecacht:

```text
session.append('user/message', { role: 'user', content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } },
  { surfaceOp: 'append' })
session.deriveMessages()         // the derived model history
```

Surface-Events (`system/message`, `user/message`, `assistant/message`, `tool/result`) verlangen `surfaceOp` sowohl in typisierten Events als auch im Append-Input. Ein Replace verwendet exakt `{ op: 'replace', startSeq, endSeq }` mit inklusiven `SessionSeq`-Endpunkten in aktueller Surface-Reihenfolge. Eine Assistant-Message bettet ihren exakten kompakten Provider-Stream ein und verbietet `sourceEventSeqs`. Bekannte Log-only-Events verbieten beide Metadatenfelder und erzeugen niemals eine Message.

Append, Seed/Restore und Event-Adoption/-Snapshot lehnen jedes `header.system` und exakt leere optionale Request-Header-Felder (`tools: []`, `adapterDefaults: {}`) ab, statt den Input zu normalisieren. Tool-Result `data.error` ist nur erlaubt, wenn `message.content[0].isError === true`; die Fehler-Identität bleibt optional. Abgelehnte Appends ändern weder Log noch abgeleiteten Zustand noch Event-Feed. Adoption validiert event-lokale Metadaten, aber nicht referenzierte History oder Replace-Zugehörigkeit.

`system/message` trägt den gerenderten System-Prompt: Der erste ist Surface-Knoten 0, die Prepared-Call-Capability regelt die Zulassung — auf einer nicht-fähigen Route wird ein nicht-leeres Rendering am ersten System-Knoten konsolidiert, innerhalb einer fortlaufenden `in-history`-Serie hinter die gecachte History gehängt; leere System-Knoten projizieren zu keiner Message, sodass das Leeren des Prompts geloggte Leer-Ersetzungen aller aktiven System-Knoten erfordert, nicht nur des letzten; der Surface-Fold lehnt einen Replace ab, der Knoten 0 abdeckt, solange dieser ein `system/message` ist, es sei denn, das ersetzende Event ist selbst ein `system/message` über genau diesen Knoten — spätere System-Knoten tragen keinen Schutz, und ein Compaction-Range darf sie verschatten ([Entscheidung](../../../.agents/notes/implemented/architecture/2026-09-02-system-prompt-as-surface-node.de.md)).

### Das Log lesen

`session.seq` liest die aktuelle Log-Länge, ohne ein Array zu materialisieren, und `session.eventAt(seq)` liest ein akzeptiertes, tief eingefrorenes Event per Sequenznummer. `session.snapshotEvents(fromSeq?, toSeqExclusive?)` materialisiert einen eingefrorenen, stabilen Snapshot eines halboffenen Bereichs; ein vollständiger aktueller Snapshot wird bis zum nächsten Append gecacht. Caller, die nur eine Länge oder ein Event brauchen, nutzen `seq` oder `eventAt()`.

Session-Log-Positionen verwenden zwei numerische Typen. `SessionSeq` identifiziert ein existierendes Event oder eine inklusive Event-Wasserstandsmarke; `SessionLogOffset` identifiziert eine Lücke, Präfixlänge oder Lese-Grenze und darf der Event-Anzahl gleichen. `SessionSeqCursor` fügt den Wert `-1` für „noch kein Event“ hinzu, während `OptionalSessionSeq` `null` verwendet, wenn das Fehlen selbst Daten ist. Die Konstruktoren validieren nicht-negative Safe Integers, und die Brands verschwinden zur Laufzeit, sodass durable JSON- und Wire-Werte gewöhnliche Zahlen bleiben.

### Eine Session forken

`ctx.sessions.fork(source, boundary?, childSessionId?)` wählt Source-Events über eine inklusive `boundary`-Seq (Default: das aktuell letzte Event), verlangt, dass das Präfix außerhalb eines offenen Turns endet, und erzeugt eine live Child-Session mit Lineage-Metadaten. Eine Tool-Zeit-Delegation, die mitten im Turn branchen muss, schneidet stattdessen auf ein vollendetes Präfix.

Das logische Feld `SessionHeader.isSeeded` meldet, ob Fork-History existiert, ohne eine positionale Ganzzahl zu exponieren. `Session.inheritedEventCount` behält den exakt geprüften `SessionLogOffset`; `ownEvents()` liefert Events ab diesem Schnitt, und `isOwnSeq(seq)` akzeptiert nur eine existierende Child-eigene Position. Ein Low-Level-Konstruktor mit Seed muss explizit `seed` und `inheritedEventCount` liefern, weil der Konstruktor-Seed hinter dem geerbten Präfix Child-eigene Setup-Events enthalten kann.

### Durable State flushen

`ctx.sessions.flush(session)` dispatcht den awaited Durability-Checkpoint: Jeder Persistence-Listener flusht, und der Call settlet, nachdem alle fertig sind. Ein Producer, der eine sofortige Durability-Barriere braucht, wartet darauf, statt anzunehmen, dass der Write-Behind abgelaufen ist.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen</summary>

Dieser Abschnitt erklärt, wie das Paket das obige Verhalten umsetzt; der beobachtbare Vertrag steht in [Dieses Paket verwenden](#use-this-package).

### Designkonzept

Das Paket baut auf Event Sourcing: Eine `Session` ist ein append-only Log typisierter `SessionEvent`s, und alles andere — Modell-History, Transcripts, Telemetrie, Titel, Persistenz — leitet sich aus diesem Stream ab. Die Surface ist eine abgeleitete Projektion: Ein inkrementeller Manager validiert Append-Kandidaten, schreitet die geordnete Sicht aus committeten Events voran und verfolgt ein `replaceGeneration`, das bei jedem committeten Rewrite erhöht wird. Modellsichtbar heißt geloggt: Alles, was einen Modell-Request erreicht, muss aus dem Log rekonstruierbar sein. Jeder Modell-Attempt, der das Settlement erreicht, committet ein Event: `assistant/message` trägt die assemblierte modellsichtbare Message plus ihren kompakten getimten Stream, während `assistant/attempt` einen fehlgeschlagenen, wiederholten, abgebrochenen oder Stream-Error-Attempt festhält, ohne Modell-History hinzuzufügen. Ein harter Prozessverlust vor dem Settlement hinterlässt keinen durable Attempt-Stream.

### Request-Header

`request/header` speichert einen vollständigen kanonischen Snapshot der nicht-historischen Request-Envelope mit dem Grund `initial`, `resume`, `change` oder `series`. Ein expliziter Message-Serien-Start oder ein Surface-Replace schreibt einen `series`-Snapshot, wenn die Envelope unverändert ist; eine gleichzeitige Änderung nutzt `startsSeries: true`. Serien-interne Steps, Retries und gewöhnliche spätere Turns erben den letzten Snapshot. `adapterDefaults` unterscheidet vom Adapter aufgelöste Werte von expliziten Settings, und `foldRequestHeader()` wählt den letzten Snapshot. Dieser in sich geschlossene Record unterstützt Partial-Window-Rendering und exakte Rekonstruktion um den Preis von Wachstum pro Message-Serie; die Details gehören der [reconstructable-requests Agent Note](../../../.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.de.md).

### Quelltextkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `SessionStore`-Service, Store-Lifecycle, `fork`, `flush` |
| [`src/types.ts`](src/types.ts) | `SessionEventMap`, `SessionEvent`, `UserMessage`, `SessionHeader`, `TurnEndReasonMap` |
| [`src/surface.ts`](src/surface.ts) | Geordnete Surface-Projektion, Replace-Validierung, `deriveEventMessage` |
| [`src/request-header.ts`](src/request-header.ts) | `request/header`-Folding und Rekonstruktion |
| [`dsh-util-values`](../../util/values/README.de.md) | Geteilte verlustfreie JSON-Validierung und detached Snapshots |
| [`src/repair.ts`](src/repair.ts) | Kalte Reparatur crash-verwaister Logs |
| [`src/invariant.ts`](src/invariant.ts) | Invariant-Companion: Seq, Turn-/Step-Einschließung, Tool-Call/Result-Paare |

### Append-Validierung

Jeder Append nutzt den geteilten iterativen `snapshotJsonValue()`-Durchlauf, der jeden verschachtelten Wert einmal liest, validiert und kopiert, sodass ein zustandsbehafteter Getter der Validierung nicht einen anderen Wert liefern kann als der Ablage. Payloads, die kein verlustfreies JSON sind (BigInt, Zyklen, sparse Arrays, `-0`, exotische Prototypen), werden an der Append-Stelle abgelehnt, vor jedem Backend-Flush. Der Append-Pfad konstruiert jede `SessionSeq`; Surface-Events validieren zusätzlich Marker-Form, zitierte Source-Event-Sequenzen und vollständige Abdeckung beschatteter Knoten für Replaces.

### Abgeleitete History

`deriveMessages()` cached die Projektion jedes Surface-Knotens einmal und liefert pro Call ein frisches Array über geteilten, tief eingefrorenen Messages; jeder der vier Surface-Event-Typen (`system/message`, `user/message`, `assistant/message`, `tool/result`) projiziert seine eigene Message-Art — den System-Role-Prompt (ein System-Knoten mit leerem Inhalt projiziert zu keiner Message), User-Content wörtlich, die assemblierte Assistant-Message mit Provider und Modell oder ein User-Role-Tool-Result. Eingebettete Assistant-Streams und `assistant/attempt`-Events bleiben nur Replay- und Diagnosedaten. Ein Surface-Rewrite baut die Projektion neu — es gibt keinen Raw-Log-Fallback, also ist die Surface die einzige Quelle abgeleiteter History.

### Der Request-Header

Der Loop loggt einen vollständigen kanonischen `request/header`-Snapshot (Call-Config, Adapter-Defaults, assemblierte Tool-Schemata — der gerenderte System-Prompt ist ein `system/message`-Surface-Knoten, kein Header-State) an jeder Loop-Instanz-Grenze und bei Änderung; `foldRequestHeader(events)` rekonstruiert ihn durch Wahl des letzten Snapshots und macht damit jeden Konversations-Request zu einer reinen Funktion des Logs. Route-Metadaten (`request/context`) sind separater geloggter State, der nur geappendet wird, wenn Provider, Modell, Kapazität oder `systemPromptUpdate`-Modus abweichen; er zeichnet den Modus des tatsächlich vorbereiteten Calls nach Prompt- und User-Zulassung auf, statt diese Zulassungsentscheidung zu liefern.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Der Paket-Vertrag reicht für die meisten Consumer; lies diese Seiten, wenn du die umgebende Domäne brauchst.

- [Session-Subsystem](../../../docs/subsystems/session.de.md) — das vollständige Event-Vokabular, Surface-Typen und die generierte Service-API.
- [Persistence-Subsystem](../../../docs/subsystems/persistence.de.md) — wie Backends dieses Log durable machen.
- [Core-Subsystem](../../../docs/subsystems/core.de.md) — der Loop, der Sessions schreibt und aus ihnen ableitet.
- [Generierter Persistence-Katalog](../../../docs/persistence-catalog.de.md) — jedes Session-Event mit Payload und Deklarationsstelle.
- [Core-Gruppenkarte](../README.de.md) — wie die Core-Pakete komponieren.

-----

<a id="model-experience"></a>
## Model Experience

### Abgeleitete Message-History

#### Was das Modell sieht

Das Modell erhält die vollständigen Messages aus den Surface-Einträgen `system/message`, `user/message`, `assistant/message` und `tool/result` wörtlich, den System-Prompt zuerst — Identitäten, Rollen, Quellen und Content-Blöcke sind dieselben Werte, die bei der Erstellung festgelegt wurden, und Projektionen prägen niemals Identitäten. Direkte Prompts und injizierter Kontext bleiben separate `user/message`-Events, deren Quellen ihre Provenienz bewahren. Eingebettete Streams, `assistant/attempt`, Grenzen und andere Log-only-Fakten fügen keine Message hinzu.

#### Token-Effekt

Geappendete Surface-Einträge werden in späteren Steps erneut gesendet. Eine `replace`-Surface-Operation entfernt die beschatteten Einträge aus künftigen Inputs, ohne ihre rohen Log-Records zu löschen.

#### KV-Cache-Effekt

Geappendete Surface-Einträge bewahren wiederverwendbare Präfixe. Eine `replace`-Operation invalidiert die Wiederverwendung ab der ersten beschatteten Message, obwohl das zugrunde liegende Event-Log append-only bleibt.

### Crash-Repair-Ergebnis

#### Was das Modell sieht

Findet die Recovery einen Assistant-Tool-Request ohne durable `tool/call`, lautet sein synthetisches `TOOL_NOT_STARTED`-Result `The tool call was interrupted before the Harness recorded it as started. Retry it if it is still needed.` Hat ein durable `tool/call` kein Result, lautet sein `TOOL_OUTCOME_UNKNOWN`-Result `The tool call was interrupted after it was recorded, but no result was durably recorded. Its outcome is unknown. Decide whether to retry from the tool semantics: retry only if the operation is read-only or idempotent; if it may have side effects, first verify external state or ask the user. Do not retry blindly.`

#### Token-Effekt

Null Tokens in einer intakten Session. Jeder reparierte Call fügt beim Resume seinen gehaltenen risikospezifischen Fehlertext hinzu.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und invalidiert keine bestehenden KV-Cache-Einträge.

### Geloggter Request-Header

#### Was das Modell sieht

Die Session rekonstruiert die Tool-Schemata und die Call-Config, die der Loop tatsächlich gesendet hat; der System-Prompt ist Teil von `deriveMessages()` als Surface-Knoten 0 und nach einem In-History-Update als letzter System-Knoten. Header-Events fügen der History keine Message hinzu und halten keine Kopie des Prompts.

#### Token-Effekt

Null Duplikat-Tokens durch das Logging. Die System-Knoten und Schemata verursachen weiterhin ihre normalen Kosten pro Request.

#### KV-Cache-Effekt

Das Logging verursacht keine Invalidierung, und exakte Rekonstruktion bewahrt die Request-Präfix-Identität. Ein späterer Header mit geänderter Config oder Schemata kann die Wiederverwendung ab seiner ersten Abweichung invalidieren; eine Prompt-Änderung, die Surface-Knoten 0 ersetzt, invalidiert die Wiederverwendung ab dem ersten Token, während ein In-History-Append das Präfix durch die gecachte History wiederverwendbar hält.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Session-Store besondere Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgabenstau.

- **`fork()` schneidet nur an stabilen Grenzen live Sessions** — das gewählte Präfix muss außerhalb eines offenen Turns enden, und die Quelle muss im Store sein; das Forken einer persistierten, aber nicht geladenen Session ist von der Fork-API ausgeschlossen.
- **`SESSION_FORMAT_VERSION` benennt die [aktuelle logische Repräsentation](../../../docs/session-format-status.de.md)** — der aktuelle Reader lehnt das ausgemusterte `header.system` ab und validiert `system/message`-Payloads und Protected-Head-Rewrites. Historische Header und Events gehören den benachbarten Format-Paketen; die benachbarte Migrationskette konvertiert unterstützte History vor dem Bauen der `Session`, und Write-Open publiziert nur den Current-Format-Nachfolger. Unbekannte Events gleicher Version erfordern die explizite `ignorable`-Markierung der Envelope, die keine sichere strukturelle Migration verspricht ([Mechanismus](../../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.de.md)).
- **`TurnEndReasonMap` lässt die ACP-benannten Varianten `refusal` / `max_turn_requests` weg** — producer-seitig gated: Sie landen, sobald ein Adapter oder der Loop sie erstmals emittiert.
- **Kein Session-Baum jenseits von Fork** — ein pi-artiger Entry-Baum über gebranchte Sessions ist zurückgestellt, solange kein Consumer mehr als boundary-basiertes Forken braucht.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Keine.

</details>
