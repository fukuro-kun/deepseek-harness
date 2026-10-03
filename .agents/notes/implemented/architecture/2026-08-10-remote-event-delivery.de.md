# Agent Note: Remote-Event-Zustellung (`ctx.remote.$on`)
[English](2026-08-10-remote-event-delivery.md) | [中文](2026-08-10-remote-event-delivery.zh.md) | Deutsch

Status: implemented


## Problem

[Typert-Remote-Methodenaufrufe](../../implemented/architecture/2026-08-02-typert-remote-method-calls.de.md) decken zunächst gezielte Aufrufe mit einem Ergebnis pro Request ab und lassen Session-Streams und zustandsbehaftete Interaktionen bewusst außerhalb. Host-to-Consumer-Events brauchen einen Zustellmechanismus, der nicht der API-Proxy-Domäne gehört.

Der Host besitzt Einweg-Events wie `agent-preset/selected`, `commands/change`, `credentials/reference-updated`, `llm/adapters-updated` und `settings/document-updated`. Sie hängen nicht von AgentScope ab, und ihre Payloads sind bereits JSON. Zu verlangen, dass jedes Event einen handgeschriebenen API-Proxy-Frame, eine handgeschriebene Client-Runtime-Bridge und ein Client-Event-Alias durchquert, fügt über die Owner-Event-Deklaration hinaus keine Tatsache hinzu.

Diese doppelte Deklaration ist auch verlustbehaftet: Die Client-Seite formuliert ein Event als `settings/changed(ns: string)` nach und plattet einen gebrandeten Typ zu barem `string` — entgegen der Remote-Methoden-Regel, dass Consumer-Typen auf das eine kanonische Symbol des Business-Pakets zeigen.

## Entscheidung

Die Consumer-Remote-Oberfläche hat ein Event-Abonnement-Verb, `ctx.remote.$on(event, listener)`, mit allowlist-gesteuerter, wortgetreuer Weiterleitung:

- `packages/api/remotes/src/remote-events.ts` besitzt eine Liste weiterleitbarer Host-Events mit expliziten `emit`/`waterfall`-Modi. Sie ist auch der einzige Kontrollpunkt dafür, was Consumer abonnieren dürfen. Das benachbarte `src/types.ts` leitet die Typprojektion ab und füllt den Selektionsplatz, bleibt aber type-only. Beide Dateien stehen in den `files` der Host- und Client-Faces des Pakets, sodass beide eine Deklaration lesen.
- Der Event-Name auf der Leitung ist der ursprüngliche Host-Cordis-Name (`settings/document-updated`) ohne `host/`-Präfix. Der Payload ist die Host-Argumentliste, Element für Element durch JSON, ohne Projektion, Schwärzung oder Umbenennung.
- `api/remotes` registriert die Host-Quelle beim API-Gateway. Das Gateway reserviert den internen logischen Endpoint `$events` auf dem bestehenden `/api/remote.mux`, fügt keine physische Verbindung hinzu und gibt dem API-Proxy keine Event-Interpretation. Waterfall-Ergebnisse gehen über den HTTP-Unary-Endpoint `$events/result` zurück.
- Event-Signaturen haben keine zweite Tabelle. Owner-Pakete legen ihre Cordis-`Events`-Deklarationen in Client-sichere, type-only `./types`-Exports, sodass beide Faces dieselbe Deklaration lesen. `$on`-Listener-Parameter, Ergebnis und `next()` leiten sich aus `Events[Event]` ab; wortgetreue Übereinstimmung gilt konstruktionsbedingt.
- Nur Cordis-Typdeklarationen werden geteilt. Zustellsemantik, Registrierung und Fehlerbehandlung gehören Typert.

Wenn ein `Events`-Member ein Host-only-Symbol wie einen Service, `Agent` oder Context erreicht, wird der Code geteilt, bis die Deklaration sauber in `./types` liegen kann. Eine Deklaration wird nie zwischen `index.ts` und `types.ts` aufgespalten, und `types.ts` erfindet keinen strukturell äquivalenten Schattentyp. Jeder aktuelle Owner exponiert seine ausgewählte Event-Deklaration aus einem Client-sicheren Type-Export.

Alle allowlisteten Events nehmen diesen Pfad, und dedizierte Frames sowie Client-Aliase sind entfernt. Modell-Consumer abonnieren direkt `llm/adapters-updated` und `settings/document-updated`; Preset-Consumer abonnieren `agent-preset/selected`; zustandslose Session- und Dynamic-Cordis-Benachrichtigungen nutzen `emit`; Approval und Question nutzen Agent-scoped `waterfall`. Daten, die eine Baseline, Projektion oder Deduplizierung brauchen, behalten einen dedizierten Remote-Stream.

`skills/change`, `tools/change` und `system-prompt/change` haben dieselbe reine Invalidierungsform, aber keinen ausgelieferten Consumer. Die Regel, dass jede Abstraktion einen aktuellen Owner und ein Bedürfnis braucht, hält sie außerhalb der Allowlist; sie bleiben nur ein hier vermerkter Erweiterungspunkt.

### Consumer-Vertrag (`dsh-typert-protocol`)

Die Typmetadaten fügen Event-Form-Prädikate, Mode-Einträge, einen Selektionsplatz und ein Member von `TypertClientRemote` hinzu, ohne Runtime-Code:

```ts ignore-check
import type { Events } from '@deepseek-ai/cordis'

type TypertForwardingMode<Event extends keyof Events> =
  unknown extends ThisParameterType<Events[Event]>
    ? TypertEventResult<Event> extends void ? 'emit' : never
    : TypertWaterfallEvent<Event> extends never ? never : 'waterfall'

/** Cordis event names that can cross the Remote Event carrier without a second signature. */
export type TypertForwardableEvent = {
  [Event in keyof Events]: TypertForwardingMode<Event> extends never ? never : Event
}[keyof Events]

/** Event and dispatch mode accepted by the Remote Event source. */
export type TypertForwardableEventEntry = {
  [Event in keyof Events]: TypertForwardingMode<Event> extends infer Mode
    ? Mode extends 'emit' | 'waterfall'
      ? { readonly event: Event; readonly mode: Mode }
      : never
    : never
}[keyof Events]

/** The Host assembly's forwarding selection; api/remotes' allowlist fills it, no other package does. */
export interface TypertRemoteEventSelection {}

/** `$on`'s legal keys: selected, and present in the current compilation face. */
export type TypertRemoteEvent = Extract<keyof Events, keyof TypertRemoteEventSelection>
```

```ts ignore-check
/** Subscribe to one forwarded Host event; the returned disposer belongs to the calling fiber. */
$on<Event extends TypertRemoteEvent>(event: Event, listener: TypertClientEventListener<Event>): () => void
```

`Events` löst pro Programm auf: das vollständige Host-Event-Vokabular in einem Host-Programm und nur Deklarationen, die für die Client-Kompilierungs-Face sichtbar sind, in einem Client-Programm. Dasselbe Prädikat gilt daher auf beiden Seiten, ohne Host-Deklarationen in den Client zu bringen.

**Der Vertrag exponiert nur das Consumer-Verb.** `ClientRemoteService` registriert die eine interne `$events`-Pumpe als Connection-Generationsquelle bei der Aktivierung, unabhängig davon, ob ein `$on`-Abonnement existiert. Browser öffnen `$events` über den geteilten Remote-Mux; In-Process-Kompositionen öffnen denselben logischen Stream über `connection.rpc.open`. Decodierung, exakte Item-Validierung und Cordis-Dispatch sind private Gateway-Client-Implementierung. `TypertClientRemote` exponiert keine Produzenten-Operation, sodass ein Business-Plugin kein Host-Event synthetisieren kann.

Jedes Mal, wenn der Host `$events` öffnet, installiert die API-Remotes-Quellfabrik synchron jeden Allowlist-Listener. Das Gateway liefert dann das öffnende `{ type: 'ready', clientId, host: { home } }`, bevor es die Event-Quelle iteriert. `ConnectionController` publiziert `connected` erst nach dem Eintreffen dieses Items, sodass Baseline-Reads den inkrementellen Listenern nicht vorauslaufen können.

Eine physische Mux-Trennung beendet den logischen Stream mit `RemoteStreamCarrierError`. Ein Host-Remote-Stream-Fehler, unerwartete normale Vollendung, ein nicht-ready öffnendes Item oder ein fehlgeformtes Event-Item beendet ebenfalls die aktuelle Generation. Connection zieht diese Generation zurück und öffnet `$events` nach Backoff neu; der Gateway-Mux baut nur den physischen WebSocket neu auf. Gewöhnliche Events werden nicht wiederholt. State, dessen Korrektheit Wiederherstellung erfordert, muss einen Query, Cursor oder eine öffnende Baseline bereitstellen und darf `$on` nicht als zuverlässiges Journal behandeln.

Der Client dispatcht auf einen Cordis-Key, der jeder Remote-Instanz privat ist. Gewöhnliches `emit` nutzt `parallel()` und kapselt Listener-Fehler; Agent-scoped `waterfall` nutzt `waterfall()` auf dem aufgelösten Agent-Context und erlaubt ein Ergebnis, eine Ablehnung oder `next()`-Delegation. Beide Registrierungsarten gehören der aufrufenden fiber, und Host-Events lösen keine gleichnamigen Client-lokalen Events aus.

### Die Allowlist: eine Deklaration, gelesen von beiden Faces

`packages/api/remotes/src/remote-events.ts` steht in `tsconfig.host.json` und `tsconfig.client.json` und ist das einzige Zuhause der Allowlist. `src/types.ts` leitet die Typ-Face ab:

```ts ignore-check
// remote-events.ts — the value
export const API_REMOTE_FORWARDED_EVENTS = [
  { event: 'agent-preset/selected', mode: 'emit' },
  { event: 'approval/request', mode: 'waterfall' },
  ...SESSION_CONTROLLER_REMOTE_EVENTS.map(event => ({ event, mode: 'emit' as const })),
  { event: 'commands/change', mode: 'emit' },
  { event: 'credentials/reference-updated', mode: 'emit' },
  { event: 'cordis/request-run', mode: 'emit' },
  { event: 'cordis/request-run-resolved', mode: 'emit' },
  { event: 'cordis/dynamic-package', mode: 'emit' },
  { event: 'cordis/dynamic-retract', mode: 'emit' },
  { event: 'cordis/inspect-query', mode: 'emit' },
  { event: 'cordis/inspect-query-resolved', mode: 'emit' },
  { event: 'llm/adapters-updated', mode: 'emit' },
  { event: 'settings/document-updated', mode: 'emit' },
  { event: 'user-questions/request', mode: 'waterfall' },
] as const satisfies readonly TypertForwardableEventEntry[]

// types.ts — the type face, derived
export type ApiRemoteForwardedEvent = typeof API_REMOTE_FORWARDED_EVENTS[number]['event']

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteEventSelection extends Record<ApiRemoteForwardedEvent, true> {}
}
```

Ein Event hinzuzufügen ist daher ein Array-Eintrag: Typprojektion, die `$on`-Key-Menge, der Host-Dispatch-Modus und die Weiterleitungsschleife leiten sich alle daraus ab. `ctx.remote.$on('slots/changed', …)` für ein Client-lokales Event und `$on('skills/change', …)` für ein deklariertes, aber nicht selektiertes Event sind Kompilierfehler.

Das abschließende `satisfies` der Deklaration wendet Host-Event-Vokabular- und Modus-Einschränkungen auf dieselbe Allowlist an:

```ts ignore-check
API_REMOTE_FORWARDED_EVENTS satisfies readonly TypertForwardableEventEntry[]
```

Es erzwingt drei Eigenschaften: Der Name existiert, weil das Prädikat nach `keyof Events` keyt; der gewählte Modus passt zur Signatur; und die Signatur ist entweder eine scopelose `void`-Benachrichtigung oder ein waterfall mit Top-Level-Agent-Scope, einem `next()` mit gleichem Ergebnis und einem Promise-Return. Andere Scope-, Bail-, Parallel- und Serial-Formen sind ausgeschlossen.

Wortgetreue Übereinstimmung wird nicht separat bewiesen, weil sie konstruktionsbedingt gilt. `$on`s Listener-Typ und die Host-Weiterleitung lesen beide die eine Cordis-`Events`-Deklaration des Owner-Pakets, sodass keine zweite Deklaration driften kann.

JSON-Sicherheit bleibt ein Runtime-Anliegen. Vor dem Einreihen prüft die API-Remotes-Host-Quelle jedes Argument mit `isJsonValue` aus `dsh-session` und schlägt laut fehl, wenn eines ungültig ist, weil dies ein Allowlist-Kompositionsfehler ist statt unvertrauenswürdiger Input.

### Wire-Protokoll (API-Gateway-Remote-Mux)

```ts ignore-check
ready     { type, clientId }
emit      { type, event, args }
waterfall { type, event, eventId, agentId, request }
cancel    { type, eventId }
```

Der Client öffnet den internen logischen Stream `$events` mit Payload `{ args: {} }`. Das Gateway lehnt zusätzliche Parameter, eine fehlende Host-Quelle und doppelte Quellregistrierung ab. Das Zurückziehen einer Quelle bricht jeden Stream ab, der von dieser Registrierung geöffnet wurde. Jeder Client-Stream besitzt eine unabhängige Queue und Allowlist-Listener-Menge in `api/remotes`, sodass das Trennen eines Clients weder Events eines anderen Clients konsumiert noch zurückzieht.

Der Client verlangt ein öffnendes `ready`-Item mit nichtleerem `clientId` und `host.home`; jedes spätere Item wird per Diskriminator auf exakte Felder geprüft. Das ready-Item etabliert die Connection-Generation und liefert die stabile Host-Pfad-Anzeigetatsache. Ein gewöhnliches `emit` mit unbekanntem, aber strukturell gültigem Event-Namen wird verworfen, wenn es keinen Subscriber gibt. Waterfalls nutzen `eventId` zur Korrelation mit `$events/result` und `agentId` zur Auswahl eines Client-Agent-Context. Der Client gibt nur Werte zurück, die als verlustfreies JSON darstellbar sind; der Transport interpretiert Business-Felder nicht um.

`$events` ist ein interner Gateway-Endpoint. Er geht nicht in einen generierten Typert-Remote-Deskriptor ein und wird nicht `ctx.remote.<namespace>`. Anwendungsselektion existiert nur in der API-Remotes-Allowlist und der Host-Quelle; das Gateway besitzt nur Registrierung, Payload-Validierung und physischen Transport.

### Der `apps/web`-Browser-e2e gehört zur Host-Face

Die `apps/web/tests/**`-e2e-Dateien typechecken in der Root-`tsconfig.host.json`: Sie booten ein echtes harness im Prozess und greifen direkt auf `ctx.connection`, Host-`SessionStore.get/create/flush` und `ctx.sessionProjectionCache` zu. Einen Browser zur Laufzeit zu steuern platziert eine Datei nicht im Client-TypeScript-Programm. Diese Tests ins Client-Aggregat zu verschieben erzeugt Fehler, weil ein Programm nicht die Merges beider Faces für denselben Context-Key halten kann.

Daraus folgt eine Build-Regel, die das Design braucht: Ein Wert- oder Typ-Import aus einem Client-Paket in diesen Tests bringt das ganze Projekt dieses Pakets und alle seine Projekt-Referenzen in den Host-Build-Graph. Vier Consumer (`ui-settings-general`, `ui-settings-models`, `ui-permission` und `ui-commands`) referenzieren die Client-Face von API-Remotes, die nicht kompilieren kann, bis Host-tsdown `@deepseek-ai/dsh-goal/remote` generiert. Das bildet einen Build-Reihenfolge-Zyklus: Host-tsc braucht API-Remotes-Client, der generiertes `goal/remote` braucht, das Host-tsdown nach Host-tsc emittiert.

Die wenigen benötigten Client-Symbole werden testseitig gespiegelt: `scaffold.ts` exportiert die gespiegelten welcome-notice-Konstanten, während die zwei Chat-e2e-Dateien `dsh-client-runtime/client` direkt importieren, weil das Runtime-Projekt bereits zum Host-Graph gehört. Das entfernt diese vier Consumer aus dem Host-Graph, und die 15 Client-Projekt-Referenzen in `apps/cli/tsconfig.json` dienen keiner Owner-Map-Rolle mehr. Jeder Spiegel ist byte-identisch zu seiner Quelle; Drift erzeugt einen Selektor-Mismatch oder eine nicht unterdrückte Notice und schlägt laut fehl.

### Änderungsinventar

| Ort | Änderung |
|---|---|
| `dsh-typert-protocol` | `src/types.ts` stellt Forwardable-Mode-Ableitung, Selektion und Client-Listener-Projektion bereit; `TypertClientRemote` exponiert nur `$on`. Nur Typen, keine Runtime |
| `api/gateway` | Host stellt eine Remote-Event-Quelle, `$events`, Pending-Waterfall-Koordination und `$events/result` bereit; Client registriert die private Pumpe als Connection-Generationsquelle und besitzt Frame-Validierung und Cordis-Dispatch |
| `api/remotes` | `src/remote-events.ts` (modustragender Allowlist-Wert) und `src/types.ts` (Key-Projektion und Selektion) gehören beiden Faces; Host registriert jede Client-Quelle und validiert JSON vor dem Einreihen; Client komponiert weiterhin generierte Remote-Beiträge |
| Root-`tsconfig.base.json` | Fügt Source-Plane-`paths`-Einträge für `dsh-settings/types`, `dsh-credentials/types` und `dsh-api-remotes/types` hinzu |
| `dsh-commands` / `dsh-settings` / `dsh-credentials` | Verschiebt jedes `interface Events`-Member in den Client-sicheren `./types` des Owners; settings und credentials fügen diesen Export hinzu, verschieben Brands und pure Typen mit, behalten Konstruktoren im Index und nehmen `lib/types/**/*.js` in die publizierten Dateien auf |
| `dsh-session` | Exponiert `isJsonValue` zur Validierung jedes Event-Arguments durch die API-Remotes-Host-Quelle |
| `client/runtime` | Entfernt die Bridge von Host-Frames zur Remote-Subscription-Tabelle; es publiziert nur `connection/reset`, nachdem eine Connection-Generation etabliert ist |
| Consumer | Client-Plugins abonnieren direkt über `ctx.remote.$on(...)`, importieren Owner-Event-Deklarationen type-only und injizieren `'remote'` |
| `client/connection` | Stellt den einen Generationsquellen-Registrierungspunkt bereit; `ConnectionController` publiziert die Host-Fakten aus `$events`-ready, und die fixture emittiert Events aus derselben Quelle |
| `apps/web/tests` + `apps/cli` | Spiegelt Client-Symbole testseitig wie oben beschrieben und entfernt 15 Client-Projekt-Referenzen aus `apps/cli/tsconfig.json` |

## Betrachtete Alternativen

**Weiter den Host-Downlink des API-Proxy nutzen.** Das nutzt Connection-Generation und `connection/reset` wieder, lässt aber Remote-Event-Allowlist, Queue, Schema und Client-Runtime-Bridge im API-Proxy und verhindert, dass Domänentransporte den Lifecycle anderer Remote-Streams teilen. Mit dem residenten `/api/remote.mux` des API-Gateways fügt `$events` nur einen internen logischen Stream hinzu und gehört natürlich ins Gateway.

**Einen dritten physischen WebSocket oder Duplex-Stream für Remote-Events öffnen.** Ein unabhängiger Kanal könnte Verbindungszustand besitzen, würde aber authentifiziertes Upgrade, Multiplexing, Abbruch, Fehler-Mapping und Reconnect-Backoff duplizieren, die der Gateway-Mux bereits bereitstellt. Das interne `$events` behält einen unabhängigen logischen Stream, während Waterfall-Ergebnisse HTTP-Unary-Calls wiederverwenden.

**Eine separate `TypertRemoteEventMap` in den Typmetadaten deklarieren und Owner-Pakete per Declaration-Merging hineinschreiben lassen.** Die Consumer-Key-Menge wäre exakt gleich den remote zustellbaren Events, aber jede Signatur würde außerhalb von Cordis-`Events` erneut geschrieben, was einen bidirektionalen Äquivalenzbeweis und neue Typmetadaten-Abhängigkeiten für Owner-Pakete erfordert. Eine geteilte `Events`-Deklaration macht Äquivalenz strukturell, daher wird die zweite Map nicht erzeugt.

**Den Typert-Generator Host-`Events`-Deklarationen projizieren lassen.** Der Generator analysiert Host-Events bereits, kann aber keine Projektions- oder Schwärzungsabsicht ableiten und würde Generator und Build-Fläche aufblähen. Wortgetreue Weiterleitung braucht keine Projektion.

**Weiterleitbaren Events eine Payload-Projektionsfunktion geben.** Eine `{ event, project, zod }`-Tabelle könnte Modellverzeichnis-Eingaben kombinieren und Workspace-Views ableiten, würde aber Projektionslogik manuell mit Payload-Typen abgleichen und die zentrale Tabelle nachbauen, die aus den Remote-Methoden entfernt wurde.

**Den `apps/web`-Browser-e2e ins Client-Aggregat verschieben.** Die Intuition, dass Browser-Tests zur Client-Face gehören, scheitert mit 21 Fehlern, weil die Tests Host-Services nutzen, während `ctx.sessions` des Client-Programms `ISessions` ist.

**`directory-picker-browse`/`-native` in Host- und Client-Faces splitten.** Das würde Client-Pakete aus dem Host-Graph entfernen, ändert aber Pakete eines anderen Owners nur für einen saubereren Build-Graph. Das Spiegeln der benötigten Client-Symbole testseitig macht diese Spaltung überflüssig.

## Verifikation

- Ein echter Host-Quellen-Kompositionstest beweist, dass zwei Client-Streams jeweils `{ event, args }` empfangen, das Trennen des einen den anderen nicht beeinflusst und Nicht-JSON-Argumente laut fehlschlagen, ohne spätere gültige Zustellung zu vergiften.
- Typ-Negative lehnen nicht selektierte Events, nicht-`void` scopelose Events, nicht-Agent-scoped Waterfalls und Allowlist-Modi ab, die Signaturen widersprechen. `$on('slots/changed', …)` und `$on('skills/change', …)` kompilieren beide nicht, sodass `$on`s Key-Menge der Allowlist gleicht.
- Der Consumer-`$on('settings/document-updated', …)` löst `ns` als `SettingsNamespace` auf und bewahrt den Brand über die Leitung.
- Ein `$on`-Disposer gehört der aufrufenden fiber, und das zweimalige Registrieren desselben Funktionsobjekts erzeugt unabhängig entfernbare Registrierungen; Subscriptions werden über Registrierung statt Listener-Identität adressiert.
- Gewöhnliche Benachrichtigungen enthalten sowohl einen werfenden Listener als auch einen, der ein rejected Promise zurückgibt. Waterfall-Tests pinnen Client-Ergebnis, `next()`, Ablehnung, Abbruch, ersten Claim über mehrere Clients und Reconnect-Replay eines ausstehenden Requests.
- Gateway-Tests decken fehlende, doppelte und zurückgezogene Quellen, Payload-Ablehnung, Ready-vor-Event-Reihenfolge sowie Browser- und In-Process-Träger ab. Client-Tests decken Generationsquellen-Registrierung, Description/Increment-Bereitschaftsreihenfolge, Wiederöffnung nach physischem Fehler, Host-Fehler und unerwartete Vollendung, nicht-ready öffnende Items, fehlgeformte Event-Items, `$events/result`-Fehler und Disposal-Quiescence ab.
- `host/remote-event`, öffentliches `$dispatch`, die Client-Runtime-Bridge und die Allowlist-Abhängigkeit des API-Proxy sind abwesend; Consumer beobachten Owner-Events direkt.

## Konsequenzen

- **Das Gateway hat einen nicht-generierten Endpoint.** `$events` hat keinen Business-Namespace und geht nicht in den Typert-Deskriptor ein. Es ist der interne Verbindungspunkt zwischen Gateway und API-Remotes und definiert die Lebensdauer der Client-Connection-Generation. Strikte Leer-Payload-Validierung, Opening-Ready-Validierung und Single-Source-Registrierung verhindern, dass es zu einer weiteren handgeschriebenen Business-API wird.
- **Zwei Dateien brechen die Face-Disjunktheitsregel von API-Remotes.** `src/remote-events.ts` und `src/types.ts` gehören beiden Projekten und emittieren identische Deklarationen in das geteilte `lib/types`. Ihr Inhalt ist byte-identisch und `.tsbuildinfo`-Dateien bleiben getrennt, sodass dies in der Praxis sicher ist; die README dokumentiert, warum Source-Plane-`paths` die Ausnahme erfordern.
- **Produzenten-Operationen bleiben privat.** Business-Plugins können nur `$on` aufrufen. Host-Quellregistrierung und Client-Dispatch fehlen in `TypertClientRemote`; Test-Doubles treiben Subscriptions über eigene `emit`-Operationen statt eine Produktions-API zu impersonieren.
- **Fehlgeformte Argumente schlagen beim emit fehl.** Ein API-Remotes-Listener wirft vor dem Einreihen, sodass Host-`ctx.emit` sofort einen Allowlist-Kompositionsfehler beobachtet und die Queue weiterhin gültige Events zustellen kann.
- **Testseitige Spiegel können driften.** Kein Mechanismus vergleicht gespiegelte Client-Konstanten unter `apps/web/tests` mit ihrer Quelle. Drift erzeugt stattdessen einen Selektor-Mismatch. `apps/web/tests/README.md` dokumentiert die Review-Regel; ein grep-Level-Gate wird bewusst weggelassen.
- **Bewusst weggelassene Fähigkeiten.** Payload-Projektion und -Schwärzung werden nicht unterstützt, Scopes außer Agent werden nicht unterstützt, und gewöhnliche Benachrichtigungen werden nicht wiederholt. Wiederherstellbarer State braucht einen Query, Cursor oder eine öffnende Baseline; ein waterfall wird nur wiederholt, solange sein ursprünglicher Host-Aufruf aussteht.
- **Einige Client-Pakete bleiben im Host-Graph.** Zwölf Projekte, darunter `connection`, `runtime` und `ui-slots`, bleiben über ungesplittetes `directory-picker-browse`/`-native` und `api/gateway → client/connection` erreichbar. Sie kompilieren und ziehen die Client-Face von API-Remotes nicht mehr herein, sodass diese Änderung sie nicht splittet. Direkte `dsh-client-runtime/client`-Imports in zwei Chat-e2e-Dateien stützen sich auf die aktuelle Präsenz von Runtime in diesem Graph statt auf eine allgemeine Garantie.
- **Das Paket publiziert bewusst kein Invariant-Companion.** Eine frühere Revision assertierte die Zustellform auf dem Live-Event-Bus, koppelte Diagnostik an die Allowlist und veranlasste Rolldown, einen dritten Bundle-Chunk zu emittieren, den die mechanisch abgeleitete Publikationsliste ausließ. Die Host-Face-`TypertForwardableEventEntry`-Assertion lehnt diese Abweichungen bereits zur Kompilierzeit ab, und die Paket-README dokumentiert, warum keine unabhängige Runtime-Relation bleibt.
