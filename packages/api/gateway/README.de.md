---
description: "Typisierte Client-zu-Host-Aufrufe und -Streams: Dispatch, Validierung, Cancellation, Reconnection und weitergeleitete Host-Events."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-gateway
[English](README.md) | [中文](README.zh.md) | Deutsch


## Überblick

Zweiseitiger Typert-RPC-Endpoint für Host- und Client-Cordis-Umgebungen. Der Host-Einstieg stellt `ctx.typertGateway` bereit, während `@deepseek-ai/dsh-api-gateway/client` `ctx.remote` bereitstellt; beide konsumieren denselben generierten `InvocationDescriptor`-Vertrag und überlassen die Business-Selektion den API Remotes. Connection trägt Unary-Request-Korrelation, Vertrauen und Response-Envelopes, während das Gateway die gemultiplexten Remote-Streams besitzt.

## Inhaltsverzeichnis

- [Host-Service: `TypertGatewayService` (ctx-Key: `typertGateway`)](#host-service-typertgatewayservice-ctx-key-typertgateway)
- [Client-Service: `ClientRemote` (ctx-Key: `remote`)](#client-service-clientremote-ctx-key-remote)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="host-service-typertgatewayservice-ctx-key-typertgateway"></a>
## Host-Service: `TypertGatewayService` (ctx-Key: `typertGateway`)

`ctx.typertGateway.invoke()` löst für jeden Call den aktuellen Descriptor und den Cordis-Service auf, validiert exakte benannte Argumente, löst registrierte Objekt- oder Context-Identitäten auf, ruft die öffentliche Business-Methode auf und validiert ihr Ergebnis. Business-Services erweitern `TypertRemoteService` und markieren Methoden mit `@Remote` oder `@RemoteScope` aus [`dsh-typert-protocol`](../../typert/protocol/README.de.md); `bindTypertRemote()` bleibt verfügbar, wenn eine andere Basisklasse die Vererbung besitzt.

Der Strict-Modus liest generierte Invocation-Descriptors aus `ctx.typert.local`. Lookup-Parameter verwenden den aktuell aktiven Resolver in `ctx.typert.lookups`: Das Business-Paket registriert die stabile Deklaration und Default-Policy, während die Host-Composition das Auflösungsverhalten mit effect-scoped `configure()` überschreiben kann; `@RemoteScope` löst seinen Receiver über einen registrierten Host-Context-Adapter auf. SRC-Modus ist ein Entwicklungs-Fallback für Endpoints, die nie eine strikte Definition hatten; er parsed einfache Parameternamen und akzeptiert für Nicht-Lookup-Parameter nur JSON-sichere Werte. Das Zurückziehen einer beobachteten strikten Definition schlägt fehl, statt die Validierung abzuschwächen.

Der Host-Einstieg registriert einen Trusted-Host-Interceptor auf dem geteilten `/api`-FetchHandler der Connection. Connection reicht diesen zusammengesetzten Handler über seine HTTP-Bridge weiter; der Handler dispatcht beanspruchte Endpoints ans Gateway und liefert 404 für unbeanspruchte Requests, sofern keine exakte Fetch-Route sie besitzt. Direkte `invoke()`-Calls bewahren Business-Fehler; `TypertGatewayError` ist eine `RemoteError`-Subklasse, deren `gateway/*`-Codes die Fehler benennen, die Dispatch, Binding, Provider, Lookup, Context, Argumente und Codecs besitzen. Ein Resolver, der aus Policy-Gründen ablehnt — ein Cold-Resume-Fehler oder ein Ownership-Fence —, wirft seinen eigenen `RemoteError`, und der von ihm gewählte Code erreicht den Caller unverändert.

Eine cancellation-fähige Remote-Methode deklariert `signal: AbortSignal` als ihren letzten Host-Parameter. Das Signal ist Descriptor-Metadatum, kein Wire-Argument: Connection stellt es dem Gateway bereit, und das Gateway injiziert es nach den dekodierten Business-Parametern. SRC erkennt den reservierten letzten Namen, während die strikte Generierung zusätzlich den globalen `AbortSignal`-Typ verlangt.

Ein Stream-Remote verwendet `@Remote({ mode: 'stream' })` und gibt ein `Iterable` oder `AsyncIterable` zurück. `ctx.typertGateway.stream()` wendet dieselben Endpoint-, Argument-, Lookup- und Cancellation-Prüfungen an wie der Unary-Call, dann validiert es jedes yielded Item mit dem generierten Result-Codec. Der Client öffnet den Gateway-eigenen `/api/remote.mux`-WebSocket, wenn sein Plugin aktiviert wird, und hält ihn im Leerlauf verbunden. Connection besitzt den Retry-Zeitplan; vor jedem Retry bittet es den mux, jeden Kandidaten- oder aktiven Socket zu canceln und genau einen frischen physischen Versuch zu machen. Der Host sendet Ping-Control-Frames im konfigurierten `websocketHeartbeatIntervalMs`-Intervall (standardmäßig zwei Sekunden), und der Browser antwortet mit Pong auf der WebSocket-Protokollebene, sodass inaktive Netzwerk-Intermediäre Traffic sehen, ohne dass ein Remote-Stream-Frame entsteht. Ein Socket, der den vorherigen Ping nicht beantwortet hat, wird beim nächsten Intervall terminiert. Unabhängig cancellable logische Streams teilen diesen Socket; ein in-process-Connection-Carrier stellt äquivalente Streams direkt bereit, ohne ihn zu öffnen.

Die Host-Composition kann eine Anwendungs-Event-Quelle über `registerRemoteEvents()` registrieren. Das Gateway reserviert den internen `$events`-Logical-Endpoint für diese Quelle, akzeptiert nur leere `args` und bricht von der Registrierung geöffnete Streams ab, wenn die Quelle zurückgezogen wird. API Remotes besitzt die Event-Selektion, Argument-Validierung, Per-Client-Queues und den im Opening-`{ type: 'ready', clientId, host: { home } }`-Frame gesendeten Host-Home. Seine Source-Factory hängt incrementelle Listener synchron an, sodass der Client die Generation erst veröffentlicht und Baseline-Reads nur beginnt, nachdem die incrementelle Zustellung bereit ist.

<a id="client-service-clientremote-ctx-key-remote"></a>
## Client-Service: `ClientRemote` (ctx-Key: `remote`)

`ctx.remote.$mount()` validiert und registriert einen generierten Host-für-Client-Beitrag, dann installiert es konkrete direkte und gescopedte Methoden für den aufrufenden Cordis-Fiber. Jeder Namespace ist ein getrackter `remote.<namespace>`-Child-Service und entlädt nach dem Zurückziehen seiner letzten Methode. Doppelte Endpoints, Namespace-Kollisionen und Descriptors ohne strikt generierte Codecs schlagen fehl, bevor Methoden aufrufbar werden.

Jeder Unary-Call validiert positionale Inputs, konstruiert die exakten benannten `args` des Descriptors und sendet sie über `ctx.connection.rpc.call('/api', endpoint, ...)`. Eine generierte Stream-Methode gibt ein `AsyncIterable` zurück und öffnet einen logischen Stream über einen in-process-Connection-Carrier, falls verfügbar, andernfalls über den geteilten Gateway-WebSocket. Generierte cancellation-fähige Methoden akzeptieren ein finales optionales `AbortSignal`; der Client kombiniert es mit der Mount-Lifetime des Beitrags, bevor er den Carrier aufruft. Unary-Ergebnisse und jedes Stream-Item werden validiert, bevor sie Anwendungscode erreichen. Das Zurückziehen eines Beitrags entfernt seine Descriptors und Methoden zusammen, bricht in-flight Calls und Streams ab und lässt zurückbehaltene Methoden-Handles rejecten.

Jeder Unary-Call resolvt zu `RemoteResult<T>` — `{ ok: true, value }` oder `{ ok: false, error }` — und rejectet nie wegen eines Carrier-Problems: Diese Face faltet einen offline Carrier in den Error-Branch und antwortet `gateway/cancelled`, wenn das Caller-Signal abbricht, sodass kein Consumer einen Call wrappt, um einen zu recovern. Nur ein Assembly-Fehler rejectet noch: falsche Arität, eine ungemountete Methode, ein zurückgezogener Beitrag, ein fehlender Context-Adapter. `error` ist eine live `RemoteError`-Instanz, sodass `throw result.error` Throw-Semantik bewahrt, und `isRemoteFailure(value)` ist das einzige Prädikat, das ein Consumer braucht — ein gecatchter Wert, den es akzeptiert, trägt einen Host-Code, und alles, was es ablehnt, ist ein lokaler Fehler, den der Caller crashen lassen sollte.

`ctx.remote.$host` liest die festen Host-Fakten als schlichte Werte: `home` (undefined bis zum ersten Ready-Frame) und `isLoopback`. Es ist kein Store — keine Subscription, kein Generation-Counter —, sodass ein Consumer, der auf Reconnection reagieren muss, auf `connection/reset` hört, statt es zu pollen.

`ctx.remote.$stream()` gibt einen Single-Consumer-`RemoteStream` zurück, der über physische Carrier-Generationen spannt. Er erlaubt einen sofortigen Retry, solange der Host verfügbar bleibt, wartet sonst auf die nächste verbundene Host-Generation und annotiert jedes Item mit seiner physischen Generation. Der Domain-Consumer validiert und akzeptiert den Opening-Wert jeder Generation; Business- und Protokollfehler bleiben terminal. Jeder terminale Fehler verlässt diese Face als `RemoteError`, einschließlich erschöpfter Carrier-Retries und einer Generation, die vor ihrem Opening-Wert endet, sodass ein Stream-Consumer genauso diskriminiert wie ein Unary-Caller. `RemoteStreamCarrierError` benennt einen retryablen physischen Verlust und erreicht eine Domain nur als `carrierFailed`-Callback-Argument, nie als terminales Outcome. `RemoteSnapshotStream` fügt einen Opening-Snapshot gefolgt von Deltas hinzu. `RemoteJournalStream` fügt Follow-before-Page-Opening, Pagination, Reconnect-Catch-up und Gap-Repair über domain-definierte inklusive Entry-Ranges hinzu; es entfernt vollständige Duplikate und lehnt Gaps, invertierte Ranges und partielle Overlaps ab. Eine Domain kann auch cursorlose Notifications tragen: Sie rücken den dauerhaften Cursor nie vor und reparieren ihn nie, und während Gap-Repair empfangene Notifications veröffentlichen erst, nachdem die Replacement-Page committet hat. Falls eine neuere Generation dieses Repair ablöst, werden gehaltene Notifications der abgelösten Generation mit ihrer Page verworfen. Das Disposen eines Streams cancellt seine Requests und resolvt, nachdem der aktive Iterator vollständig gestoppt ist.

`ctx.remote.$on()` subscribt ein weitergeleitetes Host-Event. Seine legalen Keys sind exakt die Forwarding-Auswahl der Host-Assembly, und der Listener-Typ ist die eigene Cordis-`Events`-Deklaration des besitzenden Pakets, sodass keine zweite Signatur davon abdriften kann. Jede Subscription gehört zum aufrufenden Fiber und verschwindet mit ihm. Der Client-Remote-Service registriert den `$events`-Pump als Connection-Generation-Source, wenn er aktiviert wird, ob ein `$on`-Listener existiert oder nicht. Browser verwenden den Remote-mux, während in-process-Compositions `connection.rpc.open` verwenden; das Opening-`ready`-Item etabliert eine Connection-Generation und liefert ihre Host-Fakten. Carrier-Fehler, Remote-Stream-Fehler, unerwarteter normaler Abschluss, ein nicht-ready Opening-Item oder ein malformed Event-Item beenden diese Generation und lassen Connection sie unter kontinuierlichem, gedeckeltem jittered exponentiellem Backoff neu öffnen. Gewöhnliche Notifications laufen in Registrierungsreihenfolge und isolieren Listener-Fehler. Agent-scoped Waterfalls lassen einen Listener ein Ergebnis zurückgeben, `next()` aufrufen oder ablehnen; das Gateway gibt dieses Outcome über den bestehenden HTTP-Unary-Carrier zurück.

`ctx.remote` exponiert keine Connection-Lifecycle-Kontrolle. Ein Consumer, dessen Verantwortung Recovery einschließt, liest `ctx.connection.state` und ruft `ctx.connection.reconnect()` direkt auf; gewöhnliche Remote-Consumer bleiben bei generierten Namespaces und `$stream()`.

Generierte Declaration-Merges liefern die TypeScript-API über den geteilten `TypertClientRemote`-Vertrag. Der Client-Einstieg enthält keinen Host-Service- oder Host-Cordis-Interface-Merge, und Methoden-Lookup und -Aufruf verwenden gewöhnliche Objekte und Funktionen statt eines JavaScript-Proxy.

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket Anwendungs-Calls dispatcht und keinen Prompt, kein Tool und kein Session-Event registriert.

#### KV-Cache-Effekt

Kein direkter Effekt; aufgerufene Business-Services besitzen jedes modelsichtbare Ergebnis.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- Der Connection-Adapter antwortet auf Dispatch-Fehler und unklassifizierte Exceptions mit `gateway/internal` und leeren Details; ein von einem Owner oder vom Gateway selbst geworfener `RemoteError` überquert den Wire mit eigenem Code, Message und Details. Seine `cause`-Kette und die `TypertGatewayError`-Subklassen-Identität überleben nur für Same-Process-Caller.
- SRC-Modus unterstützt eindeutige Identifier-Parameter ohne Destructuring, Defaults oder Rest-Parameter. Er validiert JSON-Sicherheit statt generierter Business-Typen und inferiert nie optionale Felder.
- Nur strikt generierte Beiträge können auf der Client-Face mounten. SRC-Marker haben keinen Client-Codec oder Typ-Projektion.
- `$stream()` überwacht Carrier-Ersatz, inferiert aber keine Replay-Semantik; jede Domain besitzt ihren Resume-Cursor oder ihre Replacement-Baseline-Validierung und Normal-End-Klassifikation. Connection-Generationen öffnen den internen `$events`-Stream neu; einseitige Notifications werden nicht replayed, während ausstehende scoped Waterfalls ihre Event-ID über das Replay behalten.
- Lookup-Resolver werden pro Key konfiguriert; ein einzelner Remote-Parameter oder Endpoint kann derzeit keine Live-only-Policy unter demselben `agent`/`session`-Key wählen.
- Weitergeleitete Events erreichen `$on` ohne Business-Payload-Projektion oder -Redaction. Gewöhnliche Notifications werden nach einem Reconnect nicht replayed; Agent-scoped Waterfalls projizieren nur die Top-Level-Agent-Identität, die zur Auswahl des Client-Kontexts nötig ist, und tragen ihre eigene Pending-Lifetime.
- `websocketHeartbeatIntervalMs` ist sowohl die Ping-Kadenz als auch die Pong-Deadline. Der Host terminiert einen Peer, der nicht vor dem nächsten Intervall antwortet, sodass ein Deployment, dessen Event-Loop oder Netzwerk länger als dieses Intervall stallen kann, es erhöhen muss.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Host-Calls lesen autoritativen Cordis- und Typert-State neu, während Client-Methoden, Descriptors und `$on`-Subscriptions in einem eigenen Effect mutieren.
