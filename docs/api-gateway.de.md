# API-Gateway

[English](api-gateway.md) | [中文](api-gateway.zh.md) | Deutsch

Dies ist die Current-State-Referenz für das Typert API-Gateway. Sie beschreibt, wie Business-Services unäre Remote-Methoden deklarieren, wie der Build Host- und Client-Verträge generiert und wie Aufrufe die Connection-RPC und die `/api`-Route wiederverwenden. Session-Events, inkrementelle Daten und andere Streaming-Protokolle fallen nicht in den Anwendungsbereich dieses Dokuments; sie können dieselbe Connection verwenden, aber keine Remote-Methoden-Deskriptoren.

## Programmiermodell

Business-Services verwenden `@Remote` oder `@RemoteScope`, um die für den Client verfügbaren Methoden auszuwählen. Unmarkierte Methoden werden weder in die generierten Client-Typen noch in die Runtime-Contributions aufgenommen und können nicht über `ctx.remote` aufgerufen werden.

`@Remote` bezeichnet den Aufruf eines Cordis-Service, der auf dem Root-Host-Context registriert ist. Komplexe Host-Objekte können nicht direkt über das Wire-Format übertragen werden; das Business-Paket muss ihre Zuordnung zu einer Wire-Identity über `TypertLookupMap` deklarieren und zur Laufzeit einen Standard-Resolver-Provider bei `ctx.typert.lookups` registrieren. Beispielsweise erzeugt ein `Agent`-Parameter namens `agent` in der Host-Signatur ein `agentId`-Wire-Feld, und das Gateway löst diese ID vor dem Aufruf der Business-Methode zu einem Host-Objekt auf. Die Host-Komposition kann `ctx.typert.lookups.configure()` verwenden, um die Auflösungs-Policy für einen Lookup-Key zu überschreiben, ohne den Parameternamen, das Wire-Feld oder das kanonische Typ-Symbol zu ändern, die dem Business-Paket gehören.

`@RemoteScope(key)` löst zunächst eine Identity über `ctx.typert.contexts` zu einem scoped Context auf, bezieht dann den Service aus diesem Context und ruft die Methode auf. Es gilt, wenn die Methode selbst von scoped Komposition abhängt und keine Objekte wie `Agent` explizit empfangen muss.

Services erben normalerweise `TypertRemoteService`, sodass der Konstruktor den Cordis-Service-Key und den Standard-Remote-Namespace explizit bindet. Ein Service, der bereits eine andere Basisklasse hat, kann stattdessen `readonly typertRemote = bindTypertRemote(this, serviceKey)` deklarieren; beide Formen hinterlassen eine inspizierbare öffentliche Bindung und hängen nicht davon ab, dass der Compiler ein Symbol in den Konstruktor injiziert.

```ts
import type { Agent } from '@deepseek-ai/dsh-agent'
import { TypertRemoteService, Remote, RemoteScope } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'

export interface CreateGoalRequest {
  objective: string
}

export interface CreateGoalResult {
  accepted: boolean
}

export class GoalService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'goals')
  }

  @Remote('create')
  createForClient(
    agent: Agent,
    request: CreateGoalRequest,
    signal: AbortSignal,
  ): CreateGoalResult {
    signal.throwIfAborted()
    return this.create(agent, request)
  }

  @RemoteScope('agent', 'current')
  currentForClient(): CreateGoalResult {
    return { accepted: true }
  }

  private create(_agent: Agent, request: CreateGoalRequest): CreateGoalResult {
    return { accepted: request.objective.length > 0 }
  }
}
```

Remote-Methoden können synchron einen Wert zurückgeben oder ein Promise zurückgeben. Für kooperativen Abbruch muss der letzte Parameter in der Host-Signatur `signal: AbortSignal` mit dem globalen Typ sein; er wird im Deskriptor statt in `args` erfasst, während die generierte Client-Methode ein optionales abschließendes `AbortSignal` akzeptiert.

Der Client verwendet konkrete Funktionen auf normalen Objekten, kein JavaScript-Proxy. Direkte und scoped Aufrufe erscheinen unter `ctx.remote.<namespace>` bzw. `agentCtx.remote.<namespace>`. Jeder Namespace ist ein verfolgter Cordis-Child-Service, registriert als `remote.<namespace>`; die Client-Assembly mountet Contributions über `ctx.remote.$mount()`, und der Namespace entlädt sich nach dem Widerruf seiner letzten Methode. Abhängigkeitsdeklarationen gehören dem tatsächlichen Aufrufer: Nur ein Business-Paket, das `ctx.remote.<namespace>` oder `agentCtx.remote.<namespace>` liest, deklariert sowohl `remote` als auch `remote.<namespace>` in seinem eigenen `inject`; Assemblies, die nur Contributions mounten, und übergeordnete Runtimes, die diesen Namespace nicht aufrufen, deklarieren die Namespace-Abhängigkeit nicht im Auftrag des Business-Pakets. Wenn eine `@Remote`-Methode genau einen Lookup-Parameter hat und eine gleichnamige `TypertContextMap` dieselbe Wire-Identity verwendet, lässt die generierte scoped-Signatur diesen Identity-Parameter weg. `@RemoteScope` generiert nur die scoped-Aufrufschnittstelle.

```ts ignore-check
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AgentContext } from '@deepseek-ai/dsh-api-session-controller/client'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'

export const inject = ['remote', 'remote.goals']

declare const ctx: Context
declare const agentCtx: AgentContext
declare const agentId: SessionId

await ctx.remote.goals.create(agentId, { objective: 'ship it' })
await agentCtx.remote.goals.create({ objective: 'ship it' })
```

Client-Anwendungen assemblieren nur `@deepseek-ai/dsh-api-remotes`. Dieses Paket importiert die `/remote`-Subpaths ausgewählter Business-Pakete als Runtime-Werte, mountet deren Contributions über `ctx.remote.$mount()` und re-exportiert die Declaration-Merges aus denselben Dateien. Das Hinzufügen eines Host-Remote-Pakets ist eine explizite Entscheidung des Client-Kompositionseigentümers; Business-Komponenten müssen das Typert-Gateway oder das Remote-JS des Business-Pakets nicht separat laden.

Die `api-remotes`-Assembly und der `ctx.remote`-Vertrag sind React-unabhängig; die für jede Client-Assembly sichtbaren Host-Methoden sind auf die zur Generierungszeit ausgewählten Remote-Methoden beschränkt.

## Komponenten-Verantwortlichkeiten

| Position | Paket oder Entry | Verantwortung |
|---|---|---|
| Shared | `@deepseek-ai/dsh-typert-protocol` | Deklariert Decorators, Gateway-Bindungen, merge-extensible Protocol-Maps, Aufrufsdeskriptoren und Provider-Typen; startet keine TypeScript-Analyse und registriert keine Cordis-Services |
| Build | `@deepseek-ai/dsh-typert-generator` | Analysiert strikt Remote-Signaturen, den Typ-Graph, Lookups, Contexts und Quellpositionen aus dem Host-`ts.Program` und generiert Host- und Host-for-Client-Artefakte |
| Host | `@deepseek-ai/dsh-typert-registry` und Loader | Platziert generierte Host-Deskriptoren, Schemas und Business-Paket-Registrierungen in `ctx.typert` und hält Lookup- und Context-Provider |
| Host | `@deepseek-ai/dsh-api-session-controller` | Besitzt die Anwendungs-Agent/Session-Identity-Policy und konfiguriert die entsprechenden Typert-Lookups |
| Host | `@deepseek-ai/dsh-api-gateway` | Stellt `ctx.typertGateway` bereit, beansprucht Remote-Endpoints, löst Objekte oder Contexts auf, ruft Live-Cordis-Services auf und validiert Anfrage- und Rückgabewerte |
| Client | `@deepseek-ai/dsh-api-gateway/client` | Stellt `ctx.remote` und `remote.<namespace>`-Child-Services bereit, mountet generierte Deskriptoren als konkrete Methoden und initiiert, validiert und bricht Aufrufe über die Connection ab |
| Client | `@deepseek-ai/dsh-api-remotes/client` | Wählt und mountet explizit die von der Anwendung zugelassenen `/remote`-Contributions und bringt die entsprechenden Declaration-Merges in den Business-Code ein |
| Beide | `@deepseek-ai/dsh-client-connection` | Stellt den RPC-Carrier, die Anfrage-Korrelation, die Trust-Boundary, den Abbruch, das Response-Envelope und die `/api`-HTTP-Bridge bereit |

Das API-Gateway-Paket besitzt den Host-Dispatcher und den Client-Remote-Endpoint als Peer-Entries, aber die beiden Builds treten nie in dasselbe `ts.Program` ein. Der Host-Entry importiert nicht das Client-Cordis-`Context`-Merge, und der Client-Entry importiert nicht den Host-Gateway-Service.

## Strikte Generierungs-Pipeline

Der Root-Build führt `build:lib:host`, `build:lib:client` und `build:web` nacheinander aus. Die Host-Lib-Phase führt zuerst `tsc -b tsconfig.host.json` aus, dann `tsdown --env.DSH_BUILD_FACE host`; der normale Host-Project-Reference-Graph kompiliert den Typert-Generator, der während dieses tsdown-Passes mit dem Host-Aggregat als einzigem `ts.Program`-Seed läuft. Die Client-Lib-Phase führt dann `tsc -b tsconfig.client.json` und `tsdown --env.DSH_BUILD_FACE client` aus und verarbeitet die neu generierten Remote-Client-Deklarationen und Runtime-Contributions, ohne Typert erneut zu starten.

Beide tsdown-Pässe erhalten den vollständigen Workspace und bündeln nur das JavaScript, das vom entsprechenden tsc-Pass nach `lib/types` emittiert wurde. Die Root-Konfiguration scannt keine Client-Artefakte, klassifiziert keine Paketnamen und übergibt keinen gepflegten Filter an tsdown; paketlokale Konfigurationen geben Entries für die aktuelle Phase basierend auf `DSH_BUILD_FACE` zurück. Ein gewöhnliches Client-Plugin produziert sowohl seinen Node-Loader-Entry als auch sein Browser-Bundle während der Client-Phase.

`api/remotes`, `api/gateway`, `api/session-controller` und `api/workspace-controller` (sowie `client/connection`) splitten TypeScript-Faces. Das Client-Projekt von `api/remotes` hängt von den `/remote`-Deklarationen ab, die für Business-Pakete während des Host-tsdown generiert wurden; Root-Aggregate und direkte Konsumenten müssen jeweils die `tsconfig.host.json` oder `tsconfig.client.json` jedes gesplitteten Pakets referenzieren. `api-remotes`' `clientBundle(..., { hostPhase: true })` produziert seinen Host-Entry während des Host-tsdown und überlässt der Client-tsdown nur den Browser-Entry. Die Agent/Session-Lookup-Policy liegt in `@deepseek-ai/dsh-api-session-controller`, nicht in `api-remotes`.

Jedes beitragende Business-Paket schreibt generierte Dateien in sein eigenes `lib/`-Verzeichnis, nicht in sein Quellverzeichnis:

| Datei | Konsument | Inhalt |
|---|---|---|
| `typert.host.js` | Host-Loader | Runtime-Reflexion für das Host-Face, strikte Aufrufsdeskriptoren und Schema-Registrierungswerte |
| `typert.host.d.ts` | Host-Typsystem | Generierte Deklarationen für das Host-Face |
| `typert.remote-client.js` | `api-remotes` | Eine mountbare `TypertRemoteContribution` mit strikten Deskriptoren und Runtime-Codecs |
| `typert.remote-client.d.ts` | Client-Typsystem | Declaration-Merges für `TypertRemoteNamespaceMap` und `TypertRemoteScopeMap` sowie Client-safe-Typreferenzen |
| `typert.remote-client.d.ts.map` | Editor | Mappt generierte Methodeneigenschaften zurück auf Remote-Methoden-Deklarationen im Host-Paket |

Business-Pakete exponieren den Host-Loader-Entry über `./typert` und den Host-for-Client-Entry über `./remote`. Der Generator validiert auch diese Paket-Exports und Published-File-Listen; er generiert Artefakte nur für explizite Contribution-Pakete, die den entsprechenden Entry bereitstellen.

Parameternamen in Remote-Client-Deklarationen stammen aus Wire-Feldern, während Parameter- und Rückgabetypen auf Client-safe-Typen verweisen, die vom ursprünglichen Business-Paket exportiert werden. Die Declaration-Map löst die generierte Eigenschaft hinter `ctx.remote.goals.create` zurück auf die Host-Quellmethode, die mit `@Remote` markiert ist, sodass Editoren mit Declaration-Map-Unterstützung von einem Client-Aufruf zur echten Implementierung navigieren können, anstatt bei der generierten `.d.ts` stehen zu bleiben.

Die strikte Analyse erfordert, dass ein Remote eine öffentliche, nicht-statische Instanzmethode mit einer konkreten Implementierung ist. Die Methode darf nicht generisch sein; Parameter müssen erforderliche, benannte einfache Bezeichner sein und dürfen kein Destructuring, keine Standardwerte, keine Rest-Parameter und keine optionalen Parameter verwenden. Typert generiert strikte Schemas für gewöhnliche JSON-repräsentierbare Typen; komplexe Objekte wie Workspace-Klassen müssen eine eindeutige `TypertLookupMap`-Deklaration haben. Lookup- und Context-Pakete sind sowohl für statische Declaration-Merges als auch für Runtime-Provider-Registrierungen verantwortlich; fehlt eine Seite, schlägt der Build fehl oder der erste Aufruf, der den Provider benötigt, schlägt fehl.

## Runtime-Aufruf

Remote-Aufrufe verwenden die `/api`-Route der Connection. Der Client-Remote ruft `connection.rpc.call('/api', '<namespace>/<method>', { args }, signal)` auf; der HTTP-Carrier mappt dies auf `POST /api/<namespace>/<method>`, mit einem Payload, der nur ein benanntes `args`-Objekt enthält.

Die Connection führt die einheitliche Trust-Prüfung für `/api` vor der HTTP-Bridge aus und dispatcht dann innerhalb des gemeinsamen FetchHandler. Das Typert-Gateway beansprucht nur zwei-Segment-Endpoints, die einen strikten Deskriptor oder einen aktiven SRC-Marker haben; Feature-eigene exakte Fetch-Routes verarbeiten Non-JSON-Antworten, andere Anfragen geben 404 zurück. Die Connection besitzt Transport, RPC-IDs, Response-Envelopes und Anfrage-Abbruch, während das Gateway nur das Remote-Datenprotokoll und den Business-Dispatch besitzt. Das Ersetzen des Connection-Carriers erfordert keine Änderungen an Remote-Deskriptoren oder der Client-Programmierschnittstelle.

Für jeden Aufruf löst das Gateway den Deskriptor und den Live-Service aus den aktuellen Registries auf, anstatt Business-Objekte zu cachen. Es verlangt, dass die Felder in `args` exakt mit dem Deskriptor übereinstimmen, validiert Wire-Werte mit Codecs, löst Objekte oder Empfänger über registrierte Lookup- oder Context-Provider auf, ruft die Service-Methode auf, die durch die Bindung adressiert wird, und validiert den Rückgabewert. Ein fehlender Provider, eine unbekannte Identity, eine Bindungs-Inkongruenz, ein fehlendes oder zusätzliches Argument, ein Schema-Fehler oder eine fehlende Methode schlägt fehl, bevor der Business-Code betreten oder nachdem er verlassen wird.

Die `register()`-Methode des Lookup-Providers liefert sowohl die stabile Deklaration als auch den Standard-Resolver; `configure()` liefert einen Resolver, der der Host-Komposition gehört, asynchron ausgeführt werden kann und auf eine Effect-Lebensdauer beschränkt ist. Die Konfiguration kann der Provider-Mounting vorausgehen; ohne einen Provider schlägt der Aufruf weiterhin mit `gateway/lookup-unavailable` fehl, und das Entladen der Konfiguration stellt die Standard-Policy des Providers wieder her. Der Session-Controller besitzt die Standard-Resolver-Semantik für `agent` und `session`: Er verwendet einen Live-Agent wieder, nimmt automatisch gewöhnliche Cold-Session wieder auf, dedupliziert gleichzeitige Wiederaufnahmen und lehnt Identitäten ab, die Subagent-Routing gehören; der `session`-Lookup gibt die Session dieses Agents zurück. Ein Wiederaufnahmefehler und ein Ownership-Fence werfen einen `RemoteError` mit eigenem Code, `session/not-found` oder `session/agent-busy`, den das Gateway unverändert auf das Wire-Format kodiert; nur ein unklassifizierter Throw wird zu `gateway/internal` zusammengefasst.

Das Entladen einer Client-Contribution entfernt deren Deskriptoren und konkrete Methoden gemeinsam, bricht ihre In-Flight-Aufrufe ab und lässt von externem Code zurückbehaltene Stale-Methoden-Handles weitere Aufrufe ablehnen. Ein auf dem Host zurückgezogener strikter Endpoint degradiert auch nicht zu SRC-Inferenz, was verhindert, dass ein Hot-Unload die Validierung unbemerkt schwächt.

## SRC-Entwicklungs-Fallback

Wenn der Host aus dem Quellcode über `node --import tsx/esm` startet, führt er das Typert-Compiler-Plugin nicht aus. Standard-Decorator-Initialisierer zeichnen dennoch den Methodennamen und den Aufrufmodus in einem versionierten Deskriptor auf dem Service-Prototype auf, während `TypertRemoteService` oder `bindTypertRemote()` die explizite Service-Bindung liefert; das Gateway kann daher einen schwächeren temporären Deskriptor konstruieren, ohne ein `ts.Program` zu starten. Die stabile String-Eigenschaft des Deskriptors ermöglicht es `remoteMethods()`, Marker zu lesen, die von einer anderen installierten Kopie des Protocol-Pakets geschrieben wurden.

Der SRC-Fallback parst einfache Parameternamen aus der Live-Funktion. Wenn ein Parametername mit dem `parameter` eines registrierten Lookups übereinstimmt, z. B. `agent` oder `session`, verwendet er das `agentId`- oder `sessionId`-Wire-Feld und löst das Objekt auf dem Host auf; andere Parameter werden nur auf zyklusfreie, JSON-safe-Daten ohne spezielles Prototype geprüft. `@RemoteScope` verwendet direkt das Wire-Feld eines registrierten Host-Context-Providers. SRC liest keine TypeScript-Typen, generiert keine Zod-Schemas, leitet keine optionalen Parameter ab und unterstützt kein Destructuring, keine Standardwerte, keine Rest-Parameter und keine doppelten Parameternamen.

SRC löst nur das Dispatch-Problem für einen Host-Prozess, der aus dem Quellcode läuft. Der Client entdeckt keine Decorators vom laufenden Host, und der Client-Remote lehnt das Mounten von SRC-Deskriptoren ab, denen strikte Codecs fehlen; seine Typen, Codecs und Remote-Registrierungswerte stammen immer aus den zuletzt generierten `lib/typert.remote-client.*`-Artefakten.

## Entwicklungsmodus

Die Web-Entwicklung bereitet aktuelle Host-, Client- und Web-Artefakte mit `pnpm run build` vor und führt dann den Quell-Host und den Client-Plugin-Watcher in separaten Terminals aus:

```sh
pnpm dsh web
pnpm run dev:web
```

`dsh` startet den Host-Quellcode über tsx, sodass der Host den SRC-Fallback verwenden kann; `dev:web` überwacht nur Client-Plugins mit einer `dsh.client`-Deklaration und schreibt deren `lib/client.js` neu. Es analysiert keine Host-Decorators und generiert keine Remote-Client-DTS.

Das Ändern nur des Implementierungskörpers einer Remote-Methode ohne Änderung des Vertrags erfordert keine Regenerierung der Typert-Dateien. Nach dem Hinzufügen oder Entfernen eines Decorators oder nach Änderung eines Export-Namens, Namespace, Parameters, Rückgabewerts, Lookup, Context oder Abbruch-Signatur führen Sie den geordneten Lib-Build erneut aus, damit der Host den strikten Vertrag generiert, bevor der Client die neue Contribution kompiliert und bündelt:

```sh
pnpm run build:lib
```

Der laufende Client-Watcher verarbeitet diese generierten Dateien beim Re-Bundling. Wenn `pnpm run build:lib:host` bereits den Host-Vertrag aktualisiert hat, kann `pnpm run build:lib:client` die Client-Seite abschließen; ein sauberer Worktree kann die Host-Phase nicht überspringen. Das Neu-Kompilieren nur des Frontend-Quellcodes kann keine neuen Typen aus Host-Decorators ableiten. `pnpm run typecheck` führt die Host-Lib-Phase vor dem Client-tsc aus, und CI- und Release-Builds verwenden dieselbe Reihenfolge.

## Grenzen

Remote verarbeitet nur unäre Methodenaufrufe mit einer Anfrage und einem Ergebnis. Session-Event-Streams, Pagination, inkrementelles Reduce, Projektion und Entity-Substreams erfordern ein separates Datenprotokoll und Registrierungsmodell; selbst wenn sie die Connection wiederverwenden, dürfen sie nicht als Remote-Methoden auftreten oder in Aufrufsdeskriptoren einfließen.

Die API-Schichten sind als `remotes → gateway → connection → webserver` organisiert. Die BFF- und Typert-RPC-Schichten liegen unter `packages/api`; Connection und WebServer liegen unter `packages/client/connection` und `packages/host/webserver`. Ein Feature, das eine gestreamte oder Browser-native Antwort benötigt, registriert eine exakte Connection-Fetch-Route, anstatt eine Remote-Methode zu definieren.

Die Lookup-Policy wird pro Key konfiguriert, sodass alle `agent`- oder `session`-Parameter das Cold-Resume-Verhalten teilen. Das Akzeptieren nur von Live-Objekten würde eine explizite Per-Parameter- oder Per-Endpoint-Policy erfordern, die nicht existiert; die Business-Methode darf nicht raten, ob das Objekt aus einer Wiederherstellung stammt.
