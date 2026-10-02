---
description: "Der TypeScript-SDK-Client für Aufrufer, die einen DeepSeek-Harness-Runtime-Subprozess spawnen und Agent-Turns über stdio-JSON-RPC steuern: die DeepSeekHarness-Run-API und der darunterliegende HarnessClient."
kind: "package-library"
---

# @deepseek-ai/dsh-sdk-client

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-sdk-client` lässt TypeScript-Programme eine vollständige DeepSeek-Harness-Runtime über stdio-JSON-RPC starten und steuern. Mit `DeepSeekHarness` öffnest du Sessions, sendest Text- oder Bild-Prompts, sammelst Event- und Notification-Streams und erhältst die zuletzt committete Assistant-Antwort, sobald die Runtime idle wird; `HarnessClient` dient für direkte Protokoll-Requests und Subscriptions. Aufrufer können `dshBin` angeben; andernfalls löst der Client das gleichversionierte `@deepseek-ai/dsh`-Executable auf. Der Client besitzt den Subprozess über Runs hinweg, exponiert typisierte Transport- und Protokollfehler und räumt ihn bei `close()` oder `await using` ab. Er eignet sich, wenn der Aufrufer Runtime-Profil und Launch-Einstellungen wählen kann.

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

Diesen Client verwenden, wenn TypeScript-Code eine vollständige Harness-Runtime aus einem anderen Prozess heraus steuern muss und du das Runtime-Executable explizit benennen kannst. Der übliche Pfad ist minimal: ein `DeepSeekHarness` mit einer Launch-Spec konstruieren, Prompts ausführen und es schließen, damit der Child-Prozess immer abgeräumt wird.

### Agent-Turns mit DeepSeekHarness ausführen

```ts
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'

await using harness = new DeepSeekHarness({
  profile: 'sdk',
  patches: ['./automation.cordis.yml'],
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  reasoningEffort: ReasoningEffortId('max'),
  maxTokens: 49_152,
})
const result = await harness.run('say hi')
console.log(result.finalResponse)
```

Der Subprozess startet lazy bei der ersten Verwendung und bleibt über `run()`-Aufrufe hinweg im Besitz der Instanz; `close()` aufrufen (oder `await using` verwenden), damit der Child immer abgeräumt wird. `start()` memoisiert den begrenzten `initialize`-Handshake, der das Workspace-cwd, die Provider-/Model-Route, das optionale adapter-owned `reasoningEffort` und das optionale positive `maxTokens`-Output-Cap trägt. Der Server validiert exakt diese Route, bevor er Prompts akzeptiert; ein ausgelassenes Effort behält den Default des Modells. `initializeTimeoutMs` hat den Default 10 Sekunden, und seine Diagnose nennt das gewählte Profil mit dem aufbewahrten stderr-Tail. `run(input, { sessionId?, onNotification? })` akzeptiert Text oder `SdkPromptContentBlock[]`; ein Inline-Raster-Block trägt kanonisches base64 plus `mimeType` und wird innerhalb der Runtime zu einem durable Attachment. Der Aufruf besitzt ein Aktivitätsintervall: Er reiht den Prompt ein, wartet, bis seine Message-id in einem durable Inbox-Receipt auftaucht, und sammelt dann bis zum nächsten `idle` des Gesamt-Agents. Er gibt `RunResult { sessionId, finalResponse, events, notifications }` zurück, wobei `finalResponse` der zuletzt committete Assistant-Text der Root-Session in diesem Intervall ist — keine dem Prompt kausal zugeordnete Antwort, weil Steering, injizierter Kontext und andere eingereihte Arbeit vor dem Idle beitragen können. `session(id?)` öffnet ein benanntes oder frisches Session-Handle. Wenn ein fehlgeschlagener Handshake erfolgreich aufgeräumt wird, installiert die Instanz einen frischen Client, sodass ein späterer Aufruf mit einem neuen Prozess wiederholt, bis ein finales `close()` eintritt; schlagen Initialisierung und Cleanup beide fehl, gibt `start()` einen geordneten `AggregateError` zurück und behält den fehlgeschlagenen Client, statt neben einem Prozess zu spawnen, dessen Exit unbewiesen ist. `maxTokens` begrenzt die Request-Ausgabe jedes Root-Agents und wird von In-Process-Nachkommen geerbt; Compaction-Plugins besitzen ihre separaten Summary-Limits.

### Low-Level-Kontrolle mit HarnessClient

`HarnessClient` ist der Protokoll-Client unter der Run-API: explizites `start()`, `initialize()`, `prompt()`, `request()` und `close()` plus Notification-Subscriptions. `prompt()` gibt die eingereihte Message-id zurück, sobald die Runtime sie akzeptiert, und wartet nie auf Agent-Aktivität. `subscribe(filter?)` gibt eine `NotificationSubscription` zurück (awaitables `next()`, nicht-blockierendes `tryNext()`, async-Iteration); `subscribeSessionTree(id)` scopt auf eine Session und die aus `subagent.started`-Lineage-Edges entdeckten Nachkommen — die Runtime benachrichtigt für jede Session in ihrem Kontext, und das Scoping ist clientseitig, exakt wie im Python-SDK.

Der Client exportiert typisierte Fehler für jede Failure-Mode: `JsonRpcResponseError` (eine Wire-Error-Response, Code und Data erhalten), `RequestTimeoutError` (eine konfigurierte Schranke abgelaufen), `SdkProtocolError` (eine Response außerhalb des dokumentierten Protokolls) und `TransportClosedError` (die Runtime ist weg — die Message trägt den Exit-Code und einen begrenzten stderr-Tail). `close()` fordert das Protokoll-`shutdown` an (begrenzt durch `shutdownTimeoutMs`, Default 1000 ms) und läuft dann die Leiter stdin-EOF → SIGTERM → SIGKILL ab, bis der Prozess exited ist; es ist idempotent, und ein geschlossener Client verweigert Wiederverwendung. `HarnessClientOptions.env` ersetzt die Child-Umgebung vollständig, wenn gegeben (`undefined` erbt die des Parents); die Credential-Policy liegt beim Aufrufer — `scrubbedParentEnv` aus `dsh-subprocess` ist die geteilte Scrub-Basis für isolation-orientierte Launches.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design hinter dem Client; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Der Client besteht aus zwei Schichten über einem Wire: `DeepSeekHarness` (owned Runs) über `HarnessClient` (dem Protokoll-Client), gespiegelt aus dem Layering des Python-SDK. Er läuft außerhalb jedes Harness-Kontexts, spawnt die Runtime also direkt statt über den `dsh-subprocess`-Service — die dokumentierte Ausnahme des Seams für SDK-verwaltete Transporte — und seine Teardown-Leiter lebt in diesem Paket. Die Runtime benachrichtigt für jede Session in ihrem Kontext; das Session-Tree-Scoping ist ein clientseitiger Filter über `subagent.started`-Lineage-Edges.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/api.ts`](src/api.ts) | `DeepSeekHarness` + `HarnessSession`: owned Runs, Receipt-to-Idle-Collection, `finalResponse` |
| [`src/client.ts`](src/client.ts) | `HarnessClient`: Spawn, Handshake, Requests, Subscription-Fan-out, typisierte Fehler |
| [`src/dispose.ts`](src/dispose.ts) | Private Teardown-Leiter: stdin-EOF → SIGTERM → SIGKILL bis zum tatsächlichen Exit |
| [`src/types.ts`](src/types.ts) | Launch- und Timeout-Optionen, Notification-Formen, `RunResult` |
| [`src/index.ts`](src/index.ts) | Consumer-Schnittstelle: die zwei Client-Schichten und die aufruferseitigen Typen |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; diese Client-Library läuft außerhalb jedes Harness-Kontexts (ihr Peer ist ein separater Runtime-Prozess); die eigenen Pakete der Runtime besitzen die Event-Stream-Relationen. |

### Owned-Activity-Fluss

Ein Run subscribed den Session-Tree, reiht den Prompt ein, wartet, bis die Message-id des Prompts in einem durable `agent/inbox/spliced`-Receipt auftaucht, und sammelt dann Notifications, bis der Gesamt-Agent `idle` meldet. `finalResponse` wird aus der letzten `assistant/message` der gesammelten Events abgeleitet. Transportverlust, Timeout und Protokollverletzungen rejecten den Run; Modell-Ergebnisse bleiben im Event-Stream beobachtbar, ohne einem Input zugeordnet zu werden.

### Fehler und Teardown

Jede Failure-Mode bildet auf eine exportierte Fehlerklasse ab — eine Wire-Error-Response, eine abgelaufene Request-Schranke, eine Response außerhalb des dokumentierten Protokolls oder eine tote Runtime — sodass Aufrufer nach Fehlertyp verzweigen; die vier Klassen werden aus [src/index.ts](src/index.ts) exportiert. Der Teardown ist eine private, idempotente Eskalation (stdin-EOF → SIGTERM → SIGKILL) in [src/dispose.ts](src/dispose.ts), die erst beim tatsächlichen Prozess-Exit endet.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der Client-Contract nicht ausreicht. Sie bewegen sich vom Wire-Protokoll zum servierenden Plugin und den Anwendungen, die diesen Client nutzen.

- [SDK-Wire-Protokoll](../protocol/README.de.md) — die JSON-RPC-Methoden und Payload-Formen, die dieser Client spricht.
- [JSON-RPC-Serving-Plugin](../server/README.de.md) — das Runtime-Plugin, das diesen Client serviert.
- [Python-SDK](../../../python/README.de.md) — der Design-Zwilling, der denselben Runtime-Peer und dasselbe Protokoll teilt.
- [SDK-Subagent-Backend](../../subagent/subagent-dsh-sdk/README.de.md) — ein harness-interner Consumer dieses Clients.
- [SDK-Application-Bundle](../../bundle/sdk-app/README.de.md) — die `dsh --profile sdk`-Runtime-Anwendung, die dieser Client startet.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da dies eine Client-Prozess-Library ist; modellseitiges Verhalten lebt in den komponierten Plugins der gespawnten Runtime.

#### KV-Cache-Effekt

Keiner im Client-Prozess. Profil-, Patch-, Provider-, Model- und History-Entscheidungen bestimmen die Cache-Wiederverwendung im Child.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Client schlecht passt oder besondere Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Vergleich mit anderen SDK-Clients und kein Aufgabenstau.

- **Keine Bundled-Runtime-Auflösung** — der Client löst das gleichversionierte `@deepseek-ai/dsh`-Paket (oder ein aufruferseitiges `dshBin`) auf; die Discovery paketierter Executables bleibt Python-seitig, bis ein TypeScript-Distribution-Consumer existiert.
- **Kein Mid-Turn-Cancel** — das Wire hat keine Prompt-Cancel-Methode; einen Turn aufzugeben bedeutet, die Runtime zu schließen (siehe die [Protokoll-Limitationen](../protocol/README.de.md#known-limitations-and-deferred-work)).
- **Kein Per-Prompt-Result** — das Low-Level-`prompt()` gibt nur einen Enqueue-Receipt zurück; das High-Level-`run()` besitzt die Receipt-to-Idle-Collection, und es aufzugeben bedeutet, die Runtime zu schließen.
- **Client→Server-Notifications und Server→Client-Requests sind unimplementiert** auf beiden Wire-Enden; der Transport trägt sie für künftige Approval-Flows.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer und explizit nicht-autoritativ — ausgeliefertes Verhalten und Grenzen leben in den Abschnitten oben und im Code. Die Launch-Spec ist absichtlich vollständig explizit: Für TypeScript ist keine Bundled-Runtime-Auflösung geplant, bis ein Distribution-Consumer existiert. Die Dispose-Leiter und das Fehlervokabular sind mit dem Python-Client synchron zu halten, der dieselbe Runtime steuert. Es sind keine weiteren ungelösten Designfragen verzeichnet.

</details>
