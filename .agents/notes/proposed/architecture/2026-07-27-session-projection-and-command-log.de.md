# Agent Note: Session-Projektionen und Command-Lifecycle-Logging
[English](2026-07-27-session-projection-and-command-log.md) | [中文](2026-07-27-session-projection-and-command-log.zh.md) | Deutsch

Status: proposed


## Problem

Drei in-flight Web-Features — todo (#497), goal (#527) und Plan-Mode (#587) — leiten jeweils Per-Session-Zustand aus dem Session-Log ab und stellen ihn im Browser-Client dar, und jedes hat seine eigene Kopie derselben Maschinerie erfunden:

- **Die Client-Core-Klasse absorbiert jede Domain.** Alle drei fügen private Felder, Fetch-Choreografie und Event-Switches zur `Session`-Klasse der Client-Runtime hinzu und projizieren ihre Werte durch `ConversationSnapshot`. Allein Plan fügt sieben private Felder und einen dreischichtigen Zaun hinzu (Request-Version, Event-Version, Latest-Live-Cache); goal fügt einen Write-Revision-Zaun plus einen coalesced Refetch-Loop hinzu; todo fügt ein Projektionsfeld und einen Event-Case hinzu. Eine vierte Domain bedeutet, die Core-Klasse ein viertes Mal zu bearbeiten.
- **Drei Baseline-Kanäle.** Todo reitet auf einem `todos`-Feld auf der History-Tail-Page — berechnet von `backscanTodos` **innerhalb von api-proxy**, Geschäfts-Folding lebt im Carrier; plan fügt einen dedizierten `session.planMode`-Unary hinzu; goal fügt `goals.get` hinzu. Dasselbe Problem, drei Wire-Formen.
- **Command-Ergebnisse sind nicht wiederherstellbar.** `/goal`, `/plan` und jedes andere Slash-Command liefern ihr Ergebnis nur in der `command.execute`-RPC-Response, dargestellt als transiente Composer-Notice auf dem ausstellenden Tab. Nichts erreicht das Session-Log: Ein Refresh, ein anderer Tab, resume oder fork verliert die Aufzeichnung, dass das Command je lief. Die Domain-*State*-Änderungen sind durable (goal committet `goal/change`-Metadaten, plan committet `plan/mode`), aber die Command-Invocation und ihr Verdict sind es nicht.

Die zugrundeliegende Lücke ist architektonisch: Der Client hat keinen seam, über den ein Plugin Session-Events im Scope einer Session beobachten und seinen eigenen abgeleiteten Zustand halten kann, und der Host hat keinen einheitlichen Weg, einem Client den aktuellen Wert log-abgeleiteten Zustands zu übergeben, dessen History aus dem Fenster des Clients herauspaget sein könnte.

## Vorschlag

Vier Infrastrukturteile, danach werden die Domains zu reinen Contributors.

### Whole-Value-Event-Regel

Ein zustandstragendes Log-Event MUSS den kompletten Post-Change-Zustand tragen, nie ein nacktes Delta. Alle drei Domains erfüllen das bereits: `todo/write` ist ein Ganz-Listen-Snapshot, `plan/mode` ein ganzer Boolean, `goal/change`-Metadaten ein voller `GoalSnapshot` (oder ein Whole-Value-Clear-Tombstone). Die Regel hält den Übergang jeder Domain trivial billig (das Framework treibt ihn pro Event), hält Werte auf dem Wire selbstbeschreibend und lässt jeden Consumer den zuletzt gepushten Wert als final behandeln — Out-of-order-Immunität durch seq-Vergleich, selbstheilend, weil ein verpasstes Update durch das nächste korrigiert wird.

### Host-Projektions-Registry (`dsh-session-projection`, neues Package)

Ein leichtes Service-Definition-Package: merge-erweiterbare Host-State- und Client-View-Typmaps, der Registry-Service und zod-Validierung für persistierten Zustand und Client-Werte. Capability-seam-Rollen: Domain-Host-Plugins stellen Projektionseinheiten bereit, Carrier konsumieren sie, und keiner kennt den anderen.

Was eine Domain registriert, ist eine **zustandsgetriebene Berechnungseinheit** — ein reiner fold plus Deklarationen und ein optionaler Client-View — nie ein opaker Getter. Das Framework besitzt das Treiben (Subscription, Watermark, Caching und später Checkpointing); die Domain besitzt nur die Berechnung. Projektionen bedienen jede Geschäftsdomain (Session-Titel, Plan, Goal, Permission, Todos); Commands sind nur ein Trigger-Pfad und haben keine Sonderstellung in diesem Vertrag.

```ts ignore-check
export interface SessionProjectionStateMap {} // host fold states
export interface SessionProjectionMap {}      // client-visible whole values

export interface ProjectionDefinition<K extends keyof SessionProjectionStateMap, S> {
  key: K
  stateSchema: ZodType<S>
  persist?: boolean // host-only units opt in; client-visible units always persist
  /** State for the empty log. */
  init(): S
  /** Pure transition: previous state + one event → next state. The framework drives it; domains hold no subscriptions. */
  apply(state: S, event: SessionEvent): S
  /** Client view; omitted for host-only units. */
  wire?: K extends keyof SessionProjectionMap ? {
    viewSchema: ZodType<SessionProjectionMap[K]>
    view(state: S): SessionProjectionMap[K]
  } : never
  /** State must be plain JSON (persisted-cache precondition); bump to invalidate persisted rows. */
  stateVersion: number
}

declare module 'cordis' {
  interface Context { sessionProjections: SessionProjectionRegistry }
}
```

- `SessionProjectionStateMap` typisiert Host-fold-Zustände; `SessionProjectionMap` bleibt die eine Client-DTO-Tabelle, die der Wire-Block und der React-Hook via `import type` teilen. Eine Einheit kann durch Weglassen von `wire` Host-only bleiben. Wie ein Client-Wert *gerendert* wird, ist Sache des Slot-Systems, nie der Projektionsschicht. Der State/View-Split ist durch die [implementierte State-and-Client-View-Note](../../archived/architecture/2026-08-19-session-projection-state-and-client-views.md) spezifiziert.
- **Der Host ist der einzige Ort, an dem eine Projektion berechnet wird.** Das Framework treibt jede registrierte Einheit eifrig voran: jedes committete Session-Event läuft durch `apply`; eine Einheit, die an einem Event nicht interessiert ist, gibt dieselbe State-Referenz zurück, und eine unveränderte Referenz (`Object.is`) erzeugt keine Downstream-Arbeit. Clients folden nie Domain-Events — sie empfangen fertige Werte (Baseline-Block + Push-Frame unten). Das beseitigt die Double-Implementation-Falle (Plans Zwei-Event-fold einmal geschrieben, auf dem Host) und jeden client-seitigen Domain-Code.
- **State wird immer berechnet, nie geloggt.** Das Log hält nur Events; der State der Einheit lebt im Per-Session-Watermark-Cache des Frameworks (`{state, observedSeq}` pro Einheit) und in einer späteren Phase in einem **persistierten Projektions-Cache** auf dem Domain-KV-Storage-seam: Zeilen von `(sessionId, key, ver, seq, val)` (`ver` = `stateVersion` der Einheit, `seq` = der Watermark, `val` = das State-JSON). Eine Zeile ist nie falsch, nur möglicherweise stale — ihr `seq` sagt exakt, wie stale. Das eine Lese-Rezept, kalt wie live: den gecachten State nehmen (oder `init()`), nur die Events hinter seinem Watermark forward-applyen, das Ergebnis `view`en. Kalte Listings (der Titel jeder Session über alle Workspaces) werden zu einem Index-Read plus im schlimmsten Fall einem kurzen Tail-Replay; der Session-Persistence-seam wächst dafür in derselben späteren Phase ein Read-from-seq-Primitiv. Schreibpolicy: gedrosselt (Anzahl/Intervall, konfigurierbar) plus zwei Pflichtpunkte — `turn/end` und detach (der Live-zu-Kalt-Moment). Ein Crash zwischen Schreibvorgängen kostet ein längeres Tail-Replay, nie einen falschen Wert.
- Die Input-Event-Menge einer Domain ist ihre eigene Wahl: todos foldet `todo/write` allein; plan foldet `plan/mode` plus seine eigenen `/plan`-`command/run`-Records (siehe Plan-Abschnitt); goal foldet `goal/change`-Metadaten; der Session-Titel foldet seine Title-Events (und ersetzt damit den maßgeschneiderten `session/title`-Frame und die Title-Snapshot-Map des Clients — die vierte handgerollte Projektion, die dieser seam absorbiert).
- Registrierung ist ein Effect (Disposer mit dem fiber): Der Key eines entladenen Plugins verschwindet aus nachfolgenden Responses, und der Client liest es als Capability-Abwesenheit — HMR-Semantik gratis. Doppelte Keys werfen. Domain-Plugins registrieren unter `ctx.inject(['sessionProjections'], …)`, sodass headless Assemblies ohne die Registry unbetroffen bleiben.
- Das Package besitzt `./invariant` (jeder bediente Key hat eine live Registrierung).

### Ausgelieferter Consumer: die Subagent-Identity-Einheit

Die beiden Leseflachen der Registry bedienen bereits einen ausgelieferten Consumer jenseits des Wire-Plans dieses RFC: [Subagent-List-Identity über die Projektionseinheit](../../archived/architecture/2026-08-06-subagent-list-identity-projection.md) registriert eine `subagent`-Einheit — die durable Mode/Label-Identität, last-wins aus `subagent/descriptor` gefoldet — und `SubagentRuntime.listChildren` liest sie über `snapshot()` für ein live Child (der Watermark-Cache, null Log-Reads) und `restore({}, events, 0)` über eine Persistence-Inspection für ein kaltes. Der Registry-Vertrag bleibt unverändert: kein Failure-Channel und keine neue Lesefläche — eine Einheit wirft nie, ein fehlender Wert ist das Signal, und wie Abwesenheit rendert, ist die Entscheidung dieses Consumers.

### Wire: Projections-Block auf der History-Tail-Page

```ts ignore-check
// session.history response, tail page only (beforeSeq absent):
{ events, hasMore,
  projections?: { asOfSeq: number, values: Partial<SessionProjectionMap> } }
```

Der api-proxy-History-Handler läuft nach dem Schneiden der Tail-Page synchron über die Registry — nirgends ein `await`, sodass der Wert jedes Keys und `asOfSeq` einen konsistenten Schnitt bilden. `asOfSeq` ist der **seq des letzten Events** (`session.seq - 1`; `-1` für ein leeres Log, dasselbe Vokabular wie `session/subscribed.lastSeq`), sodass ein Push-Frame mit der ersten Post-Baseline-Änderung immer strikt größer vergleicht. Api-proxy hält null Domain-Wissen (dieselbe Carrier/Contributor-Beziehung wie `viewFor` gegen `ctx.tools`).

Keine neue RPC-Methode. Das Timing-Zusammenfallen ist exakt: Jeder Moment, in dem der Client eine frische Baseline braucht (open, Reconnect-Resync, Gap-Repair), zieht bereits die Tail-Page, und der einzige Pfad, der nie eine braucht (loadOlder), ist der einzige Pfad, der `beforeSeq` übergibt. Der Client hat daher **keinerlei** eigenständige „Baseline neu fetchen"-Entscheidung. Fensterinhalt ist nie ein Signal: „kein Domain-Event im Fenster" ist dort konstruktionsbedingt unbeantwortbar, und nur die Baseline beantwortet es.

Durch diesen Block abgelöst: `session.planMode` und `setPlanMode` (beide Seiten — die Plan-Auswahl läuft über den Standard-Command-Channel, siehe Plan-Abschnitt), `goals.get` (Leseseite; die sechs Mutations-RPCs bleiben, ihre Responses speisen keinen State mehr — das mux-Event kommt ohnehin), das `todos`-Rider-Feld und `backscanTodos` in api-proxy (wandert in die Einheit der todo-Domain, in `tool-todo`).

### Push-Frame und der Client-Value-Store (Domains schreiben null Client-Code)

Weil der Host der einzige Berechnungsort ist, erreichen fertige Werte Clients über einen neuen mux-Frame:

```ts ignore-check
// MuxFrame union + schema branch:
{ type: 'session/projection', sessionId, key: string, value: unknown, seq: number }
```

Das Framework emittiert ihn, wann immer sich die State-Referenz einer Einheit ändert (das `Object.is`-Gate oben); `seq` ist der Watermark der Einheit bei der Emission. Das ist live Push-State, nie geloggt — dieselbe Haltung wie der `view`-Slot der Tool-View: Replay berechnet auf dem Host neu.

Die Client-Objektschicht hält einen **generischen Value-Store** pro Session: `key → { value, seq }`, geseedet vom Projections-Block der Tail-Page und aktualisiert vom Frame, unter der einen Regel **höherer seq gewinnt**. Replayed Baselines können einen neueren Frame nicht zurückrollen; ein verlorener Frame kostet Staleness bis zum nächsten Frame oder Baseline, nie Falschheit. Kein `fromEvent`, keine Per-Domain-Cell-Registrierung, kein client-seitiges Domain-Folding — eine Domain liefert Projektionssupport mit **null Client-Code** (der `SessionProjectionMap`-Merge bedient beide Seiten über den `/types`-Outlet). Der maßgeschneiderte `session/title`-Frame und die Title-Snapshot-Map des Managers gehen in diesem generischen Paar in Rente. Alle Per-Domain-Zäune (#587s drei Schichten, #527s Write-Revision) lösen sich in der einen seq-Regel auf.

### Plan über den Standard-Command-Channel (durchgearbeitetes Beispiel)

Der Plan-Mode demonstriert das volle Muster — Trigger-Pfad, Run-Ebene und Replay-Ebene, sauber getrennt:

- **Trigger-Pfad**: der Web-Plan-Toggle sendet `/plan` / `/plan off` durch `command.execute` wie jedes andere Command; die dedizierten `setPlanMode`/`planMode`-RPCs gehen in Rente. Die *Anfrage* des Users wird durable als `command/run { name: 'plan', args: 'off' | '' }` dieses Commands aufgezeichnet — strukturierte Felder, kein Zeilenparsing.
- **Run-Ebene** (unverändert): der Plan-Mode-Service hält seinen In-memory-Pending-Intent und flusht `plan/mode` an der nächsten Turn-Grenze. Beim Kaltstart baut der Service seine Intent-Queue aus der Replay-Ebene wieder auf („leerer Run-State bedeutet der Replay-State").
- **Replay-Ebene**: Plans Projektionseinheit foldet **zwei** Event-Typen — seine eigenen `command/run`-Records setzen `wanted`; `plan/mode` setzt `active` und cleart `wanted`; `view` leitet `{ active, pending: wanted !== null && wanted !== active }` ab. Pending ist dadurch eine reine Replay-Größe: Host-Restarts stellen es wieder her, andere Tabs folden dieselben Events (Cross-Tab-Pending gratis), und ein kalter Read, der `{ active: false, pending: true }` antwortet, ist akkurat („eine unerfüllte Auswahl wartet auf resume").

Die Input-Event-Menge einer Domain ist ihre eigene Wahl — das ist die allgemeine Regel, die dieses Beispiel instanziiert. Ob „der User hat X angefragt" in einer Projektion erscheint (plan foldet seine Command-Records) oder nur im Flow (der Command-Node rendert ohnehin), ist Per-Domain-Semantik, nie ein Framework-Concern.

### React: `useProjection`, der fünfte Framework-Hook-Sitz

Die bestehenden vier Sitze können diesen State nicht hosten (Store-Disziplin verbietet Geschäftsobjekte; inject verbietet Hooks; `ConversationSnapshot` wird geräumt). `useProjection` wird ein Framework-Sitz, geminted in ui-renderer (der eine Hook-Konstruktor), geliefert durch denselben Standard-Kit-Kanal wie `useSession` (`provideInfo` → SessionProvider → props):

```ts ignore-check
type UseProjection = {
  <K extends keyof SessionProjectionMap>(key: K): SessionProjectionMap[K] | undefined
  <K extends keyof SessionProjectionMap, S>(
    key: K, selector: (v: SessionProjectionMap[K] | undefined) => S,
    eq?: (a: S, b: S) => boolean): S
}
```

`undefined` bedeutet einheitlich Capability abwesend (Host-Plugin entmountet, oder keine Baseline/kein Frame hat den Key getragen). Der Value-Store exponiert nackte Per-Key-`{subscribe, getSnapshot}`-Flächen; `bindSnapshotSelector` mit Per-Key-Caching erledigt den Rest — Referenzstabilität gilt, weil sich die Wert-Referenz eines Keys nur ändert, wenn ein Frame oder eine Baseline landet. Schreibpfade sind unverändert: Mutations-Callbacks bleiben im inject-Share (Callbacks aus inject, Live-State aus `useProjection`).

Die eine bestehende Verletzung von „keine Hooks durch inject" — `DetailsInjected.useSelection` — wird mit dieser Änderung eingefoldet: Selection ist Viewing-State, der im Chat-Store lebt, also deklariert die Details-Registrierung den geteilten Store-Handle und die Komponente liest `props.useStore(s => s.selection)`; `useSelection` verlässt den inject-Vertrag.

### Command-Lifecycle im Log

Zwei Log-only-Events (non-surface, model-unsichtbar), gespiegelt an der `tool/call`/`tool/result`-Paarung:

```ts ignore-check
'command/run':  { commandId: string; name: string; args?: string; source: CommandSource }
'command/done': { commandId: string; kind: 'success' | 'error'; text?: string }
```

Der Host-Command-Executor (`packages/interaction/commands`) appendet `command/run` vor dem Aufruf des Handlers und `command/done` bei Settlement — direkte eigenständige Appends auf der Session des empfangenden agents, in derselben Form wie jedes andere plugin-owned Log-only-Event nach dem [Synthetic-Turn-Removal](../../implemented/simplification/2026-07-28-remove-synthetic-log-only-turns.de.md): kein Turn wrappt sie (Turns beschreiben nur Model-Loop-Ausführungen), Persistence drainet sie an gewöhnlichen Checkpoints, und der eigene Invariant-Companion des Commands-Packages erzwingt die run/done-Paarung. Das Payload ist strukturiert — `name` und standardmäßig `args` sind der eigene Split des Parsers (`parseCommand`s name und rawInput), sodass ein Consumer (eine Projektionseinheit, die ihre eigenen Command-Records foldet, eine reiche Command-Card) nie eine Zeile re-parst. Eine Definition setzt `recordInput: false`, wenn ihr maßgebliches Domain-Event das Payload besitzt; `command/run` lässt dann `args` weg statt es zu duplizieren. `text` ist das wortgetreue Ergebnis des Handlers — faktische Daten derselben Natur wie `tool/result.content`, keine Präsentation (wie es angelegt wird, bleibt client-computed zur Render-Zeit und erfüllt die rote Linie „Präsentation betritt nie das Log"). Domains, die das Model das Ergebnis wissen lassen wollen, behalten ihr bestehendes Verhalten (Plans Narration, Goals inject) — das ist eine Domain-Entscheidung, unverändert.

Weil committete Events auf dem mux-Stream broadcasten, kommen Refresh-Persistenz, Multi-Tab-Sync und Fork/Resume-Recovery gratis. Der `command.execute`-RPC degradiert zu Admission — `{ matched, commandId? }`: ob die Zeile resolved, und die gemintete Pairing-id wenn ja, sodass der ausstellende Client seine Anfrage mit dem Flow-Node korrelieren kann, den die Lifecycle-Events erzeugen. Der One-Shot-Notice-Channel (`runDetached` → `noticeFor`) geht in Rente.

Der Client-Flow-Builder bekommt einen generischen Command-Node (run/done gepaart über `commandId`; fensterübergreifende Schnitte soft-fallen wie Tool-Paare). Das Rendering läuft über einen neuen Keyed-Slot `'conversation.chat.commandview'`, Key = Command-Name, **Fallback = eine generische Command-Card** (null Registrierung nötig — der frühere Notice-Text rendert jetzt durable im Flow). Eine Domain upgraded, indem sie eine Row-Komponente registriert, die auf `command/run`s strukturierte Felder und ihren eigenen Projektionswert (`useProjection`) zurückgreift — dieselbe Form wie Tool-Rows nach der Toolview-Auflösung.

## Umsetzungsplan

Infrastruktur zuerst; die drei in-flight PRs bleiben unangetastet und retargeten, nachdem die Basis landet (ihr Migrations-Mapping ist die Anleitung):

1. **Host-Basis**: `dsh-session-projection` (Einheitenvertrag, eager drive, Watermark-Cache) + api-proxy-Projections-Block + der `session/projection`-Push-Frame. Mergebar mit null registrierten Domains (Block und Frames einfach abwesend).
2. **Client-Basis**: der generische Value-Store + `useProjection`-Sitz; die Per-Domain-Cell-Maschinerie in Rente schicken und, mit titles Einheit registriert, den `session/title`-Frame und die Title-Snapshot-Map. Hängt an 1 für die Frame-Form (Fixtures speisen synthetische Frames in der Zwischenzeit).
3. **Command-Channel**: die zwei Events, Executor-Logging, generischer Node + Keyed-Slot, Notice-Ruhestand, `{matched, commandId?}`-Admission. Parallel zu 1.
4. **Domain-Retargets** (nach 1+2): todo (Einheit in `tool-todo`, Rider-Feld streichen), dann plan (Zwei-Event-Einheit, RPCs in Rente, Toggle → `/plan`), dann goal (`goal/change`-Einheit, `goals.get` streichen, die sechs `Session`-Methoden ins inject des Domain-Plugins verschieben).
5. **Persistierter Projektions-Cache** (spätere Phase, nach dem Domain-KV-Storage-seam): die `(sessionId, key, ver, seq, val)`-Zeilen, gedrosselte Schreibvorgänge mit turn/end- + detach-Pflichtpunkten und das Persistence-Read-from-seq-Primitiv für kaltes Tail-Replay.

## In Betracht gezogene Alternativen

**Ein dedizierter `session.projections`-RPC** — abgelehnt: Baseline-Refresh-Momente fallen exakt mit Tail-Page-Pulls zusammen, also kauft ein separater Unary einen zweiten Round-Trip, einen zweiten seq zum Abgleichen und eine client-seitige „wann refetchen"-Entscheidung, die das Rider-Design glatt streicht.

**Ein opaker `get(agent)`-Provider-Vertrag** — abgelehnt: mit dem Berechnungsmodell in der Domain versteckt kann das Framework den State nie checkpointen, kalte Sessions bedienen (kein agent, kein geladenes Log — `get` hat nichts, wogegen es läuft) oder von einer Mid-Log-Position resumen. Die Registrierung der `(init, apply, view)`-Einheit übergibt dem Framework den Drive und hält die Domain bei reiner Mathematik; eine Domain mit host-seitigen Verhaltensbedarfen behält ihre eigenen Service-Subscriptions unabhängig von der Projektionseinheit.

**Ein Live-only-Overlay-Hook (`live?(agent, base)`) für Plans Pending-Intent** — abgelehnt: er existierte nur, weil die Plan-*Auswahl* des Users nicht im Log war. Die Auswahl über den Standard-Command-Channel zu routen stellt `command/run` auf dem Konto bereit, Pending wird eine reine Replay-Größe, und die Projektion bleibt ein reiner fold mit optionalem Client-View.

**Die Registrierungs-API `registerFold` nennen** — ersetzt durch den Einheitenvertrag: das registrierte Objekt ist jetzt zwar genuin ein fold, aber `fold*` benennt in diesem Repo reine `(events) => state`-Hilfsfunktionen, während diese Registry eine gekeyte, geschemate, versionierte Einheit annimmt. Projection bleibt der Event-Sourcing-Begriff für die Read-Model-Rolle, und sowohl #587s Note-Titel als auch #497s Kommentare nutzen ihn bereits.

## Akzeptanzkriterien

- Ein Domänen-Plugin liefert pro-Session-Log-abgeleiteten Zustand nach React, indem es nur schreibt: die Whole-Value-Event-Deklaration, einen Host-Unit-`register`, seinen `SessionProjectionMap`-Merge und Inject-Callbacks — null Client-seitiger Code, keine Edits an der Client-`Session`-Klasse, `ConversationSnapshot`, api-proxy oder den Wire-Schema-Dateien.
- Die History-Tail-Seite trägt `projections` mit `asOfSeq` gleich dem Fenster-Tail-seq; loadOlder-Seiten tragen es nie; ein Deployment ohne das Registry dient Historien ohne den Block und Clients behandeln jeden Key als abwesend.
- Eine veraltete Baseline kann keinen neueren `session/projection`-Frame überschreiben, und ein replayed Frame kann den Value-Store nicht zurücksetzen (higher-seq-wins-Tests auf beiden Pfaden).
- Ein auf einem Tab ausgeführter Slash-Befehl rendert einen dauerhaften Knoten im Flow beim Refresh, auf einem zweiten Tab und nach Resume; nicht registrierte Befehle rendert die generische Karte; der Composer-Benachrichtigungspfad für Befehlsausgänge ist weg.
- `useProjection` erreicht Komponenten über das Standard-Props-Kit; kein Hook überquert einen Inject-Vertrag (einschließlich `useSelection`).
- Session-Titel reiten auf dem generischen Paar (Baseline-Block + Projektions-Frame); der spezielle `session/title`-Frame und die Client-Titel-Snapshot-Map sind weg.

## Risiken

- **Whole-Value-Regel ist tragend**: ein zukünftiges Domänen-Logging mit bloßen Deltas kann Konsumenten nicht von seinem neuesten Event bedienen und verkompliziert seine eigene Einheit. Minderung: die Regel ist hier und im Projektions-Paket-README stated; der Unit-Vertrag macht den vollen Zustand bei jeder Transition explizit.
- **Synchroner Unit-Diziplin**: `init`/`apply`/`view`, die awaiten würden, würden den Konsistenz-Schnitt zerreissen. Das Registry dokumentiert und der Invariant-Companion assertet Synchronizität so weit wie praktisch; Review besitzt den Rest.
- **Live-Registry-Churn wird nicht gepusht**: Laden oder Entladen eines Domänen-Plugins mid-Session ändert den Key-Satz, aber kein Session-Event feuert und kein Frame wird gepusht; offene Clients halten den veralteten Key bis zum nächsten Tail-Pull (Reconnect, Gap-Repair, Open). Akzeptiert als dev-only (HMR) Staleness-Fenster — ein Registry-Änderungs-Push kann später zum Änderungs-Feed hinzugefügt werden ohne Vertrag-Impact.
- **Eager-Drive-Kosten bei besetzten Sessions**: jedes committe Event durchläuft jede registrierte Einheits-`apply`. Einheiten sind pro-Event billig durch Konstruktion (Whole-Value-Regel), nicht passende Events geben denselben Reference zurück, und die Anzahl registrierter Domänen ist klein; wenn ein Hot-Pfad je zeigt, können pro-Unit-Event-Typ-Prefilter ohne Vertragsänderung hinzugefügt werden.
- **Projektions-Payload-Wachstum**: jede Tail-Seite trägt jeden registrierten Key. Payloads sind Whole-Values von UI-Skalen-Zustand (eine todo-Liste, ein goal-Snapshot); wenn ein zukünftiges Domänen-Wert groß ist, können pro-Key-Opt-out oder lazy Keys zur Anfrage hinzugefügt werden ohne das Modell zu ändern.
- **Command-Log-Volumen**: zwei log-only-Events pro Slash-Befehl; begrenzt durch menschliche Befehlsfrequenz, vernachlässigbar gegen Chunk-Volumen.
- **Re-target-Churn**: drei offene PRs rebasen auf eine verschobene Grundlage. Akzeptierte Kosten von Infrastructure-first.
