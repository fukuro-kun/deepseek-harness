---
description: "Experimentelle Chrome-DevTools-Inspektion für Host- und Browser-Client-Cordis-Runtimes, einschließlich Console-Auswertung, Sources, Network-Erfassung, Elements-Bäumen und einer CDP-unabhängigen Query-API."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-inspector

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Verwende diesen experimentellen Inspector, um einen laufenden dsh-Host und seine Browser-Clients in Chrome DevTools zu untersuchen. Er stellt Host- und Client-Console-Kontexte, Host-Sources und -Debugging, erfasste Host-Fetches und einen gemeinsamen Cordis-Baum bereit und hält dabei den gesamten CDP-Zustand in einem Worker.

Das Paket ist privat und von Releases ausgeschlossen. Der Worker greift nie auf live Cordis-Objekte zu: Der gemeinsame Host/Client-Collector projiziert sie vor dem Transport in validierte Snapshots. Cordis besitzt außerdem Plugin-Komposition, `ctx.inspector`-Registrierung, Bootstrap-Injection und Disposal.

## Inhaltsverzeichnis

- [Runtime-Layout](#runtime-layout)
- [Konfiguration](#configuration)
- [Observierungs-API](#observation-api)
- [Cordis-Baum-Inspektion](#cordis-tree-inspection)
- [Host-Fetch-Erfassung](#host-fetch-capture)
- [Sicherheit](#security)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="runtime-layout"></a>
## Runtime-Layout

Das Host-Plugin startet den Worker und verbindet einen dedizierten `MessagePort`. Das Client-Plugin liest das injizierte `globalThis.__DSH_INSPECTOR__`-Bootstrap und öffnet einen eigenen authentifizierten WebSocket direkt zum Worker. Chrome DevTools verbindet sich mit dem CDP-WebSocket des Workers. Eine private `node:inspector.Session` pro DevTools-Verbindung hängt vom Worker an den Host-Hauptthread, sodass Host-Console-Auswertung, Sources, Breakpoints und Resume verfügbar bleiben, während das Host-JavaScript angehalten ist.

Der Quellbaum folgt diesen Ausführungsumgebungen: `client/` und `host/` stellen gespiegelte Adapter-Einstiegspfade bereit, `worker/` enthält nur Worker-Thread-Orchestrierung und Chrome-Protokollzustand, und `shared/` enthält umgebungsunabhängige Cordis- und Netzwerkmodelle, normalisierte Realm-Backend-Schnittstellen und das interne Bridge-Protokoll. Worker-seitige Client- und Host-Adapter sind unter `worker/realms/` gespiegelt; ein Client-Adapter in diesem Verzeichnis läuft trotzdem im Worker.

Host- und Client-Producers senden interne Observierungsdatensätze statt CDP-Nachrichten. Datensätze enthalten eine Quellgeneration, eine Sequenz, einen Zeitstempel der Quelluhr, ein Topic und eine JSON-Payload. Der Worker validiert jeden Prozess- oder Netzwerkframe, besitzt Quellzustand und Retention und übersetzt erkannte Topics in standardmäßige CDP-Domänen.

Client-Sources deklarieren typisierte Runtime-, Console- und Read-only-Sources-Fähigkeiten. `Runtime.enable` veröffentlicht den echten Host-Ausführungskontext und einen synthetischen Kontext für jede verbundene Client-Source. Die Auswahl eines Client-Kontexts routet Auswertung, Eigenschaftszugriff, Funktionsaufrufe, Promise-Awaiting und Objektfreigabe in dieses Browser-Realm. Client-Console-Argumente nutzen dieselbe sitzungslokale Objekttabelle, während `Debugger.enable` den gebauten `lib/client.js`-Katalog veröffentlicht und `Debugger.getScriptSource` begrenzte Inhaltschunks liest. Client-Skript-Breakpoints, Step und Call-Frames bleiben nicht unterstützt; target-weite Pause und Resume steuern nur den Host-Debugger.

Beide Plugin-Seiten führen denselben browser-sicheren Cordis-Collector aus. Er wandelt erreichbare Context- und Fiber-Objekte in einen versionierten `CordisTreeSnapshot` um; der Worker speichert diese CDP-unabhängige Darstellung und projiziert jede Host- oder Client-Source in das Elements-Panel.

<a id="configuration"></a>
## Konfiguration

Das Host-Plugin injiziert `webServer` und akzeptiert diese Felder:

| Feld | Standard | Bedeutung |
|---|---:|---|
| `host` | `127.0.0.1` | Worker-Endpoint-Bindadresse; nur Loopback wird akzeptiert |
| `port` | `9230` | Erster Worker-Endpoint-Port; belegte Ports werden aufwärts weitergeschaltet, während `0` einen vom Betriebssystem zugewiesenen Port anfordert |
| `clientOrigins` | `[]` | Zusätzliche exakte Browser-Origins, die `/ingest` akzeptiert; Loopback-Origins bleiben akzeptiert |
| `captureFetch` | `true` | `globalThis.fetch` wrappen und jeden späteren Aufruf veröffentlichen |
| `maxRequestBodyBytes` | 8 MiB | Pro Request erfasstes Request-Body-Präfix |
| `maxResponseBodyBytes` | 32 MiB | Pro Request erfasstes Response-Body-Präfix |
| `maxBodyChunkBytes` | 48 KiB | Rohbytes, die ein Body-Datensatz vor der Base64-Kodierung trägt |
| `maxJournalBytes` | 256 MiB | Vom Worker gehaltene Request- und Response-Body-Bytes |
| `maxRetainedRequests` | `2000` | Aktive und abgeschlossene Requests, die der Worker behält |
| `maxSourceFrameBytes` | 128 KiB | Limit für kodierte Source-Frames |
| `maxSourceRecordsPerFrame` | `128` | Datensätze in einem Source-Batch |
| `maxQueuedRecords` | `2048` | Pro Producer auf Transport wartende Datensätze |
| `maxQueuedBytes` | 16 MiB | Pro Producer wartende kodierte Bytes |
| `startupTimeoutMs` | 10 Sekunden | Worker-Bereitschaftsfrist |
| `stopTimeoutMs` | 5 Sekunden | Frist für ein sauberes Worker-Herunterfahren vor der Beendigung |
| `clientReconnectBaseMs` | 250 ms | Erste Client-Reconnect-Backoff-Obergrenze |
| `clientReconnectMaxMs` | 5 Sekunden | Maximale Client-Reconnect-Backoff-Obergrenze |
| `clientRuntimeTimeoutMs` | 30 Sekunden | Frist für ein Worker-zu-Client-Runtime- oder -Sources-Kommando |
| `queryTimeoutMs` | 10 Sekunden | Frist für eine nicht-CDP-semantische Abfrage |
| `maxClientRuntimeObjects` | `10000` | Live-Client-Objekt-Handles, die pro DevTools-Verbindung gehalten werden |
| `maxClientRuntimeProperties` | `2000` | Property-Deskriptoren, die eine Client-Objekt-Inspektion zurückgibt |
| `maxClientSourceBytes` | 8 MiB | Maximale kodierte Bytes, die aus einem Client-Skript oder einer Source-Map gelesen werden |
| `maxCordisNodes` | `2048` | Context- und Fiber-Knoten, die ein Realm-Snapshot vor dem Abschneiden zulässt |
| `maxDisconnectedCordisTrees` | `8` | Zuletzt getrennte Realm-Bäume, die als nicht-live Snapshots behalten werden |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-experimental-inspector) ist die erschöpfende Quelle für akzeptierte Felder und ihre Deklarationen.

Der Host protokolliert eine `devtools://`-URL, sobald der Worker lauscht. Derselbe Worker bedient `/json`, `/json/list`, `/json/version`, den Target-WebSocket unter `/devtools/page/<id>` und die Client-Source unter `/ingest`.

<a id="observation-api"></a>
## Observierungs-API

Beide Plugin-Seiten bieten denselben Dienst:

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { InspectorJsonValue } from '@deepseek-ai/dsh-experimental-inspector'

declare const ctx: Context
declare const topic: string
declare const jsonPayload: InspectorJsonValue

ctx.inspector.publish(topic, jsonPayload)
await ctx.inspector.cordis.getTree()
```

Das Veröffentlichen validiert verlustfreies JSON und plant die Zustellung, ohne auf den Worker zu warten. Jede Source hat eine begrenzte Warteschlange. Ein Überlauf wird als Sequenzlücke gemeldet und verzögert nie den beobachteten Anwendungsvorgang. `cordis.getTree()` liest den neuesten losgelösten semantischen Snapshot des Workers, ohne eine CDP-Session zu erstellen oder Runtime, Debugger oder Sources zu aktivieren.

<a id="cordis-tree-inspection"></a>
## Cordis-Baum-Inspektion

Das Elements-Dokument hat feste `<host>`- und `<clients>`-Container. `<host>` enthält den Host-Root-Context; `<clients>` enthält ein `<client>` pro Client-Source, und jedes `<client>` enthält den Root-Context dieses Realms. Der Cordis-Root-Fiber wird weggelassen. Jeder andere Fiber ist ein Kind von `fiber.parent`, besitzt genau ein Context-Kind für `fiber.ctx` und trägt nur `uid="<Cordis Fiber.uid>"`; Context-Elemente haben keine Attribute. Context-only-`extend()`-, `isolate()`- und `intercept()`-Schichten bleiben direkte Context-Nachkommen.

Host und Client veröffentlichen denselben verschachtelten `CordisTreeSnapshot`-Typ. Context- und Fiber-Knoten tragen undurchsichtige Objekt-Handles für realm-lokale Objektsuche; Fiber-Knoten tragen zusätzlich die Cordis-`uid`. Der Worker setzt diese Realm-Snapshots zu einem `{ host, clients }`-Inspektionsbaum zusammen. Er weist `BackendNodeId`-Werte pro Quellgeneration zu; jede DevTools-Verbindung vergibt eigene `NodeId`-Werte; `DOM.resolveNode` fragt die zuständige Host- oder Client-Runtime nach einer verbindungslokalen `RemoteObjectId`. `DOM.requestNode` bildet diese Objekt-ID auf denselben Elements-Knoten zurück. `ctx.inspector.cordis.getTree()` und `DSHInspector.getCordisTree` lesen den losgelösten consumer-neutralen Baum ohne Routing-Handles oder CDP-IDs.

Die Knotenzustellung ist pro DevTools-Verbindung tiefenbegrenzt: `DOM.getDocument` liefert drei Dokumentebenen, wenn der Aufrufer `depth` weglässt, zurückgehaltene Ebenen melden `childNodeCount`, und das Aufklappen holt sie über `DOM.requestChildNodes` (`depth: -1` für einen ganzen Teilbaum). NodeIds, die über `DOM.performSearch`, `DOM.requestNode` oder `DOM.pushNodesByBackendIdsToFrontend` hinausgehen, schieben zuerst die noch nicht gesendeten Vorfahrenebenen als `DOM.setChildNodes`-Ereignisse.

Sources veröffentlichen vollständige Snapshots, während der Worker vor der DevTools-Benachrichtigung stabile Backend-Knotenidentitäten vergleicht. Unveränderte Snapshots lösen kein DOM-Ereignis aus; Hinzufügungen, Entfernungen und Attributänderungen verwenden knotenbezogene CDP-Ereignisse, Payloads eingefügter Knoten halten ihren Teilbaum zurück, und das Umordnen von Geschwistern ersetzt nur die Kinder dieses Elternknotens. Bestehende `NodeId`-Werte und unberührte Elements-Aufklappzustände bleiben stabil.

Beim Trennen eines Clients werden dessen Console-Ausführungskontext und Live-Objekt-IDs sofort zerstört. Bei aktivierter Retention getrennter Bäume behält Elements den letzten Baum unverändert, während der Verbindungszustand im Inspektionsmodell bleibt, statt ein ungeprüftes DOM-Attribut zu werden. Eine Wiederverbindung behält die logische Source-ID, erstellt eine neue synthetische CDP-Kontext-ID für die neue Transportgeneration und ersetzt den veralteten Baum, sobald dessen vollständiger Snapshot ankommt. Der Client behält seine logische ID in `sessionStorage` und beansprucht sie über Web Locks für die Lebensdauer der Seite, sodass ein Refresh die ID wiederverwendet, während ein duplizierter aktiver Tab eine neue erhält. Der Worker behält höchstens `maxDisconnectedCordisTrees` solcher Snapshots; Null entfernt sie sofort.

<a id="host-fetch-capture"></a>
## Host-Fetch-Erfassung

Die Fetch-Erfassung ist standardmäßig aktiv und zeichnet die vollständige URL, alle Request- und Response-Header, Request-Body, Response-Body, Status, Timing, Fehler und Abbruch auf. Sie anonymisiert keine Credentials, Cookies, Query-Werte oder Payloads. Die Body-Erfassung liest Klone; der Aufrufer erhält die ursprüngliche Response, sobald der ursprüngliche Fetch auflöst.

Die konfigurierten Body-Limits begrenzen die Retention statt Felder auszuwählen: Die Erfassung behält das Präfix und markiert das Ergebnis als abgeschnitten. `Network.getRequestPostData` und `Network.getResponseBody` lesen die vom Worker gehaltenen Bytes. `Network.streamResourceContent` gibt das gepufferte Präfix zurück und fügt spätere Response-Bytes für diese DevTools-Verbindung an `Network.dataReceived` an, was die Live-Response- und EventStream-Ansichten antreibt. Direkte Undici-Client/Dispatcher-Aufrufe und Fetch-Referenzen, die vor der Plugin-Aktivierung gehalten wurden, liegen außerhalb dieses Beobachters.

Nach dem Eintreffen der Response-Header kann ein aufrufendes Abort den Observer-Klon stoppen; erfasste Bytes bleiben über `Network.getResponseBody` verfügbar, die Erfassungsmetadaten zeichnen Fehler und Kürzung auf, und CDP emittiert `Network.loadingFinished`, weil Fetch eine Response zurückgegeben hat. Eine Fetch-Ablehnung vor den Response-Headern emittiert `Network.loadingFailed`, mit `canceled: true` bei einem Abort.

<a id="security"></a>
## Sicherheit

Das CDP-Target gewährt beliebige Codeausführung in Host- und verbundenen Client-Realms über `Runtime.evaluate`; Host-Debugger-Operationen bieten zusätzliche Kontrolle. Die vollständige Fetch-Erfassung enthält Geheimnisse. Der Worker akzeptiert daher nur eine `127.0.0.1`-Bindadresse. Client-Ingest erfordert zusätzlich ein zufälliges, vom Host injiziertes WebSocket-Subprotocol-Token und lehnt nicht-Loopback-Origins ab, sofern nicht explizit konfiguriert. Der CDP-Socket selbst hat kein Token; Loopback-Binding ist seine einzige Zugriffskontrolle.

<a id="model-experience"></a>
## Model Experience

Keine, da dieser reine Entwickler-Inspector Laufzeitaktivität beobachtet, ohne Modell-Requests zu ändern.

#### KV-Cache-Wirkung

Keine; dieses Paket stellt weder einen Provider-Request zusammen noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Aktives Client-Debugging wird nicht unterstützt** — Console-Ereignisse, Runtime-Auswertung, RemoteObject-Zugriff und Read-only-`lib/client.js`-Sources funktionieren. Client-Skript-Debugger-Anfragen liefern explizite Unsupported-Fehler; target-weite Pause und Resume steuern nur den Host.
- **Client-Sources zeigen nur das Inspector-Bundle** — andere Seitenskripte werden von diesem Paket nicht katalogisiert.
- **Client-Auswertung nutzt Seiten-JavaScript** — die Content Security Policy der Seite kann dynamische Auswertung blockieren, und der synthetische Kontext bietet weder DevTools-Kommandozeilen-Helfer noch native REPL-Deklarationssemantik.
- **Client-Identitätsschiedsverfahren erfordert Web Locks** — Browser ohne diese API behalten Reconnect- und Refresh-Identität über `sessionStorage`, können aber nicht zwei gleichzeitig aktive Tabs unterscheiden, die aus demselben Speicherzustand kopiert wurden.
- **Fetch-Abfangen deckt `globalThis.fetch` ab** — direkte Undici-APIs und vor der Aktivierung gehaltene Fetch-Referenzen werden nicht beobachtet.
- **Body-Klonen kostet** — die vollständige Erfassung teilt Request- und Response-Streams bis zu den konfigurierten Limits auf und kann Speicher- und I/O-Druck erhöhen. Das Limit für gehaltene Bodies schließt die Pufferung im Stream-Tee nicht ein, einschließlich eines übergroßen Quellchunks oder für einen langsameren Anwendungsleser wartender Daten.
- **Kein automatischer Worker-Neustart** — ein unerwarteter Worker-Abbruch lässt die aktuelle Inspector-Instanz fehlschlagen; die Lebenszyklus-Wiederherstellung gehört zu einer späteren Änderung.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Wire-Parsing, Generationen, Worker-Lebenszyklus und CDP-Sessions lehnen ungültige Beziehungen in ihren jeweiligen Operationen ab.
