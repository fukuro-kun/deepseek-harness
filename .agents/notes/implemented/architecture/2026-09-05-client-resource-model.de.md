# Agent Note: Client-Resource-Modell

Status: implemented

[English](2026-09-05-client-resource-model.md) | [中文](2026-09-05-client-resource-model.zh.md) | Deutsch

## Problem

Der Body eines Right-Sidebar-Tabs, eine Chat-Card oder eine andere Slot-Komponente braucht oft Live-Daten, die sie nur über eine Adresse kennt: die Datei, die ein agent gerade geschrieben hat, später ein Chat-Node oder ein Terminal. Vor dem Resource-Modell fetzte jeder Consumer für sich — die Text-Preview besaß ihren eigenen Remote-Call und Refresh-Loop — sodass jeder Mount neu las, zwei Komponenten mit derselben Datei zwei Kopien hielten, ein Tab-Wechsel den Body unmountete und seinen Inhalt verlor, und jede neue Inhaltsart einen neuen maßgeschneiderten Hook bedeutete.

Der Tab-Record setzte die Bedingung. Ein Tab muss Undo, Redo, Body-Remount und Hot Module Replacement überleben, ohne den Code, der ihn geöffnet hat, sodass der Record nur serialisierbare Daten halten kann: eine Adresse und Navigationsparameter. Ein Browser-Page-Reload setzt den memory-only Sidebar-State zurück. Der Opener kann einem Body seine Daten daher nicht übergeben, und Injection ist das falsche Werkzeug — Injection ist eine Registration-Time-Relation zwischen einer Domain und einem Seat, während Öffnen ein Runtime-Event ist. Eine Komponente muss ihre Daten allein aus der Adresse finden, über etwas, das einmal von demjenigen registriert wird, der diese Art von Daten besitzt.

## Entscheidung

[`packages/client/resources`](../../../../packages/client/resources/README.de.md) (`@deepseek-ai/dsh-client-resources`) stellt `ctx.resources` und den globalen Standard-Hook `useResource` bereit. Alles, was ein Consumer live liest, ist eine **Resource**, eine Resource wird durch ihre **Adresse** und nichts sonst identifiziert, und das Protokoll der Adresse benennt den einen **Provider**, der sie in einen Frame-Stream verwandelt.

### Adressen

Eine Resource-Adresse ist eine `dsh-resource://<type>/…`-URL. Der Host ist der Protokoll-Key — der Key von `ResourceProtocolMap` — und der Pfad gehört dem Eigentümer des Protokolls. `RESOURCE_SCHEME = 'dsh-resource'` ist die eine Scheme-Konstante; `protocolOf(address)` parst den String mit `new URL`, verlangt `protocol === 'dsh-resource:'` und gibt den lower-cased Host zurück, oder `undefined` für einen String, den der Parser ablehnt, ein anderes Scheme oder einen leeren Host. `dsh-resource` gehört nicht zu den Special Schemes der URL-Spezifikation, sodass der Parser die Groß-/Kleinschreibung des Hosts beibehält und den Pfad als opaque behandelt; das Lower-Casing ist explizit, und jedes Pfadsegment wird von dem Protokoll percent-codiert, das es definiert. Ein Protokoll, das einen Scope braucht, codiert ihn im Pfad: `dsh-resource://file/session/<sessionId>/<path>`, wobei `session/<sessionId>` die Session benennt, deren Host-Workspace den relativen oder absoluten Pfad auflöst ([Grammatik](../../../../packages/util/workspace-path/README.de.md)). Jedes andere Scheme — `sidebar://guide` — ist eine Navigationsadresse: es benennt einen Tab, keine Daten, und das Modell antwortet dafür `none` ([Tab-Typen und Navigation](2026-09-05-sidebar-tab-types-and-navigation.md)).

### Der Service

```ts ignore-check
interface Resources {
  register<P extends ResourceProtocol>(provider: ResourceProvider<P>): () => void
  pin(address: string, signal: AbortSignal): void
  source(address: string): ObservableSnapshot<ResourceSnapshot<unknown>>
}

interface ResourceProvider<P extends ResourceProtocol> {
  readonly protocol: P
  open(address: string, ctx: { readonly signal: AbortSignal }): AsyncIterable<RemoteResult<ResourceProtocolMap[P]>>
}

interface ResourceSnapshot<Value> {
  readonly status: 'none' | 'loading' | 'live' | 'failed'
  readonly value: Value | undefined
  readonly failure: RemoteFailure | undefined
}

type UseResource = <P extends ResourceProtocol>(address: string) => ResourceSnapshot<ResourceProtocolMap[P]>
```

`register` besitzt genau einen Provider pro Protokoll: eine zweite Registrierung für dasselbe Protokoll wirft, und die Registrierung ist ein Effect auf der Fiber des registrierenden Plugins, sodass ein Protokoll mit seinem Plugin geht und danach erneut registriert werden darf. `pin` hält eine Resource offen, ohne zu subskribieren, bis das Signal abbricht; ein bereits abgebrochenes Signal pinnt nichts. `source` ist das nackte Observable hinter dem Hook, referenz-stabil pro Adresse, für Caller außerhalb von React. Der Value-Typ wird in `ResourceProtocolMap` nachgeschlagen, das als leeres Interface in `ui-slots` neben `SlotMap` deklariert ist — eine Module-Augmentation kann keinen Export einführen, den das Zielmodul nicht hat, und jeder Consumer hängt bereits von `ui-slots` ab — und der Eigentümer jedes Protokolls mergt sein Member per Declaration Merging (`file: WorkspaceFileStat`); das Resources-Package re-exportiert den Typ.

### Der Hook

`useResource` ist auf `GlobalStandardProps` in `ui-slots` deklariert, sodass jede Slot-Komponente es hat, egal welchen Scope, und das Plugin stellt es über `ctx.slots.provideRoot({ keyedHooks: { resource: address => resources.source(address) } })` bereit, denselben Root-Keyed-Hook-Pfad, den `useSessions` nutzt. Es ist kein Session-Standard-Prop: eine Resource trägt ihren eigenen Scope in ihrer Adresse, und Komponenten außerhalb jedes Session-Scopes lesen Resources ebenfalls. `useResource<P>(address)` gibt den Snapshot zurück: `none`, wenn das Protokoll der Adresse keinen Provider hat oder die Adresse keine Resource-Adresse ist, `loading` zwischen dem Öffnen des Streams und seinem ersten Frame, `live` mit dem letzten `ok`-Wert, `failed` mit dem Failure des letzten Frames neben dem letzten Wert.

### Frames

Ein Provider yieldet `RemoteResult`-Frames: zuerst den aktuellen Zustand, einen Frame pro späterer Änderung. Ein `ok`-Frame macht die Resource `live`, ersetzt den Wert und löscht den Failure; ein `ok: false`-Frame macht sie `failed`, zeichnet den Failure auf und behält den letzten Wert. Failure ist Daten, keine Exception: das Remote-Face faltet Failures bereits in `ok: false` und rejected nie, Provider reichen diese Frames durch, und das Modell weder catched noch wrappt — ein Throw innerhalb des Streams eines Providers ist ein Programmierfehler, der auftauchen darf. Ein Stream, der von selbst endet, behält seinen letzten Zustand; Frames, die ein Provider nach dem ihn abbrechenden Release noch yieldet, werden verworfen und der Iterator wird zurückgegeben. Streams tragen Metadaten, nicht Payload: der `file`-Wert ist `{ absolutePath, version, bytes? }`, und ein Consumer liest Inhalt selbst über den [Workspace-Files-Service](2026-09-05-workspace-files-service.md).

### Lebenszyklus

Pro Adresse existiert ein Record. Holds starten und stoppen Beobachtung, nicht die darunterliegende Datei oder Session. Seine Holder sind die Subscriber des Hooks plus Pins; der erste Holder öffnet den Stream des Providers unter einem `AbortController`, spätere Holder teilen ihn und lesen den letzten Wert sofort, und der letzte Release bricht den Stream ab und setzt den Snapshot auf idle zurück — `loading`, solange ein Provider registriert ist, sonst `none`. Ein Provider, der ankommt, während eine Adresse bereits gehalten wird, öffnet den Stream dieser Adresse; einer, der geht, bricht ihn ab und die Adresse liest `none`. Records werden für die Page-Lebensdauer gehalten, damit `source(address)` über Reacts Render-then-Subscribe-Fenster und einen StrictMode-Remount hinweg referenz-stabil bleibt, wo ein neu erzeugter Record resubskribieren und den Stream bei jedem Render neu starten würde.

Die Tab-Domain der Right Sidebar pinnt die Adresse jedes offenen Tab-Records für dessen Lebensdauer, sodass ein Tab-Wechsel einen Body unmountet, ohne seinen Stream zu schließen, und ein Zurückwechseln den letzten Wert liest; ein durch Undo wiederhergestellter Record ist ein neuer Pin, und eine Resource, die das Modell bereits losließ, wird erneut gelesen ([Tab-Typen und Navigation](2026-09-05-sidebar-tab-types-and-navigation.md)). `openResource(address)` akzeptiert nur Resource-Adressen; Seiten wie die Guide und der File-Tree werden nach Art geöffnet und betreten das Resource-Modell nie.

## Erwogene Alternativen

**Session-gebundene Resources: `useResource` auf dem Session-Kit und eine `(session, address)`-Identität.** Die erste Form. Abgelehnt, weil eine Datei kein Session-Anliegen ist — die Session ist nur, wer den Pfad autorisiert — und weil das Modell Protokolle und Komponenten außerhalb jedes Session-Scopes bedienen muss. Identität wurde die Adresse allein, der Scope zog in die Adressgrammatik, und der Hook zog ins globale Kit.

**Content im Resource-Stream.** Abgelehnt: Content kann beliebig groß sein, und ein Stream dient dem Pushen von Änderungen, nicht dem Transport von Payload. Der Stream trägt Metadaten, und der Consumer wählt, wie viel Inhalt er liest und behält.

**Failure als geworfener Fehler, mit Wrapping eines Nicht-`RemoteFailure`-Throws als `gateway/internal`.** Abgelehnt: das Remote-Face rejected nie, also ist alles, was ein Provider wirft, ein Bug, und ihn zu wrappen wäre ein Fallback, der den Bug vor dem Entwickler versteckt, der ihn verursacht hat. Ein Failure ist ein `ok: false`-Frame; ein Throw taucht auf.

**`file:/<scope>/<id>/<path>`, dann `file://<scope>/<id>/<path>` mit dem Scope in der Authority.** Zwei frühere Grammatiken. Die Single-Slash-Form war keine URL, die der Plattform-Parser akzeptierte, sodass jeder Consumer sie von Hand parste. Den Scope in die Authority zu verschieben machte es zu einer URL, gab aber jedem Resource-Protokoll sein eigenes Scheme — `file://`, später `chat://`, `terminal://` — sodass die Menge der Schemes mit der Menge der Protokolle wuchs, eine `file://`-Adresse nicht mehr bedeutete, was sie überall sonst bedeutet, und das Unterscheiden einer Resource-Adresse von einer Navigationsadresse eine Liste brauchte. Das einzelne `dsh-resource://<type>/…`-Scheme macht diesen Test zu einem Vergleich, lässt den Host frei, das Protokoll zu benennen, und hält jedes andere Scheme für Navigation verfügbar.

**Ein hand-geparstes Scheme-Präfix statt des URL-Parsers.** Das erste `protocolOf` matchte einen regulären Ausdruck für das Scheme. Abgelehnt, sobald Adressen URLs waren: der Parser entscheidet bereits über Gültigkeit und Groß-/Kleinschreibung, und ein String, den er ablehnt, sollte als „kein Protokoll" lesen statt halb geparst zu werden.

**Ein Per-Tab-Stream-Hook oder ein framework-verwaltetes `useTabResource(fetch)`.** Der Reihe nach abgelehnt: ein Stream-Hook auf der Tab-Domain fragt den falschen Eigentümer — `file`-Daten müssen vom Workspace-File-Service kommen, Chat-Daten von der Chat-Domain — und ein framework-eigener Fetch hat keinen guten Cache-Key. Was bleibt, ist das framework-gebundene `useTabInfo` auf dem Tab plus ein client-weiter `useResource`, gekeyt nach Adresse.

## Konsequenzen

Jede Slot-Komponente liest Live-Daten über eine Adresse und nichts sonst, sodass ein Opener nur Daten übergibt und ein Body sich nach Undo, Body-Remount oder Hot Replacement aus seinem Record rekonstruiert. Zwei Komponenten mit derselben Adresse teilen einen Stream, und eine gepinnte Adresse überlebt den Unmount ihres Bodys. Der Transport eines Protokolls lebt in genau einem Provider, und ein Protokoll hinzuzufügen ist ein Declaration-Merged-Typ plus eine Registrierung.

Die Kosten werden hier festgehalten, damit sie nicht wiederentdeckt werden. Records werden nie zurückgefordert: Speicher wächst mit der Anzahl je gelesener distinkter Adressen, nicht mit den Reads. Abort-Compliance liegt beim Provider; das Modell verwirft, was ein freigegebener Stream noch yieldet, kann aber einen Provider, der das Signal vor seinem nächsten Frame ignoriert, nicht stoppen. Der Failure-Typ ist das `RemoteFailure` des Remote-Face, sodass ein Provider, dessen Quelle kein Remote-Call ist, eines prägen muss. Eine Navigationsadresse oder ein malformed String liest als `none` statt als Fehler, was gemischte Adresslisten günstig zu rendern hält, einem vertippten Protokoll aber keine Diagnose jenseits des fehlenden Werts gibt.

## Tests

`packages/client/resources/tests/resources.client.spec.ts` treibt die Registry mit gescripteten Feeds: Protokoll-Ownership und Disposal, `none` für ein Protokoll ohne Provider und für eine Navigationsadresse, ein Provider, der nach einer gehaltenen Adresse ankommt und geht, während sie gehalten wird, mit ihrer Fiber verworfene Registrierungen, Open-on-First-Holder und Close-on-Last, ein Source pro Adresse, Pins einschließlich eines bereits abgebrochenen Signals, ein Remount, der den letzten Wert liest ohne neu zu öffnen, Reopen als frischer Stream, nach Abort verworfene Frames mit zurückgegebenem Iterator, ein Stream, der von selbst endet, und Failure-Frames neben dem letzten Wert. `tests/apply.client.spec.ts` mountet das Plugin in `SlotTestRuntime` und prüft über eine Root-Scope-Probe-Komponente, dass `useResource` die Props erreicht, dass sein Rendern den Stream des Providers öffnet und dass das Disposen des Plugins sowohl Service als auch Hook zurückzieht.

## Zurückgestellt

Zurückfordern idle Records, ein resource-eigener Failure-Typ entkoppelt vom Remote-Face und die Protokolle `chat` und `terminal` sind offen; jeder wartet auf einen Consumer. Die entwicklerseitige Referenz ist [docs/subsystems/client-resources.md](../../../../docs/subsystems/client-resources.de.md); die Sidebar, die das Modell konsumiert, wird in [docs/subsystems/sidebar-right.md](../../../../docs/subsystems/sidebar-right.de.md) beschrieben.
