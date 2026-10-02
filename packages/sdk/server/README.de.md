---
description: "Das stdio-JSON-RPC-Serving-Plugin für Deployments, die Out-of-Process-SDK-Clients Sessions öffnen und agents in einer DeepSeek-Harness-runtime steuern lassen."
kind: "package-reference"
---

# @deepseek-ai/dsh-sdk-jsonrpc-server

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-sdk-jsonrpc-server` serviert das SDK-Wire-Protokoll über stdio, sodass Out-of-Process-Clients harness-agents steuern können: Es öffnet pro `sessionId` eine Session, queued User-Prompts und streamt jedes Session-Event und jede agent-Status-Transition zurück an den Client. Mounte es als `jsonrpc`-Plugin in einer Loader-composition; der umgebende Baum liefert alles Weitere — agents, Modell-Adapter, Persistenz und Tools. Stdout trägt nur JSON-RPC-Frames, daher darf ein Deployment keinen stdout-Logger composen. Es beantwortet `shutdown`, indem es die Root-runtime disposed und mit 0 beendet; das app-bin besitzt EOF- und Signal-Exits.

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

Mounte dieses Plugin, wenn eine runtime SDK-Clients bedienen muss: Füge es zu einem `cordis.yml` hinzu, das den agent-Service composet, boote die runtime, und Clients verbinden über stdio. Der übliche Pfad ist explizit — das Plugin braucht den `agents`-Service; jede andere capability kommt aus dem umgebenden Baum.

### Verdrahtung

Das Plugin erstellt bei erster Verwendung einen agent pro `sessionId`. Ein registrierter Modell-Adapter gewinnt die Route; eine unbesetzte `deepseek-official`-Route mountet den DeepSeek-Adapter, und jeder andere unbesetzte provider lässt die Initialisierung scheitern. Der gewählte Adapter resolved das exakte Modell und die optionale reasoning-Strength, bevor die Initialisierung gelingt.

### Konfiguration

| Feld | Default | Bedeutung |
|---|---|---|
| `maxTokensAsSuccess` | `false` | Max-Token-turn/subagent-Beendigung als erfolgreiches SDK-Ergebnis melden |

Die Profil-composition besitzt die Tools jedes Root-agents. `input`, `output` und `exit` sind runtime-only-Transport-Hooks für Tests; die Produktion verwendet Prozess-stdio und `process.exit`. Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-sdk-jsonrpc-server) ist die erschöpfende Quelle für jedes akzeptierte Feld.

### stdout ist das Protokoll

Stdout trägt nur JSON-RPC-Frames, sodass Clients jedes Byte parsen können; Diagnosen gehören auf stderr. Halte stdout-Logger aus dem componierten Baum heraus.

### Was SDK-Clients tun können

`initialize` ist die runtime-Bereitschaftsgrenze: Wird der Server von einer Loader-composition gemountet, wartet er, bis der aktuelle Plugin-Baum settled ist, bevor er antwortet, sodass async-Geschwister-capabilities wie die initiale MCP-Tool-Entdeckung für den ersten Prompt sichtbar sind. Das Handshake gibt die Wire-stabile Identität `deepseek-harness-sdk-runtime` zurück. Der Server validiert die provider/Modell-Route und die optionale nicht-leere `reasoningEffort` über den gewählten Adapter, bevor er sie speichert; Weglassen speichert keine Strength, sodass das Modell seinen eigenen Default behält. Ein optionales positives `maxTokens` wird die Request-Output-Obergrenze jedes SDK-erstellten agents und seiner prozessinternen Nachfahren, während Weglassen den Default des gewählten Adapters oder der provider-Route anwendet. JSON-RPC-Requests können nebenläufig dispatchen, daher rejectet `session/prompt`, bis ein `initialize` erfolgreich abgeschlossen ist; Clients müssen das Handshake abwarten, bevor sie Prompts senden. Ein akzeptierter Prompt queued eine identifizierte User-Message und gibt sofort `{ messageId }` zurück; der Server streamt dann jedes dauerhafte Faktum als `session.event` und jede agent-weite Lifecycle-Transition als `session.status`. Er weist einem Prompt weder eine assistant-Message noch ein `turn/end` zu, und unabhängige Requests können auf derselben Session weitere Arbeit einreihen. Persistenz-Roots und Persona kommen aus der umgebenden composition.

### Shutdown und Exit

Das Plugin beantwortet `shutdown`, flushed die Antwort, disposed den Root-Kontext, sodass SDK-eigene agents, Subscriptions und Persistenz Quiescence erreichen, und beendet dann mit 0. EOF- und Signal-Exits gehören dem app-bin, das ebenfalls den Root-Kontext disposed. Nur dieses Plugin zu entladen stoppt das Serving, ohne den Prozess zu beenden.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design hinter dem Serving-Plugin; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Designkonzept

Das Plugin ist ein dünner Presentation-Adapter: [`HarnessSdkJsonRpcServer`](src/server.ts) besitzt die Protokollmethoden und -Notifications, während der Transport und die benannten Wire-Typen von `dsh-sdk-protocol` kommen, geteilt mit den Client-SDKs. Es subscribed Session-, agent- und subagent-Lifecycle-Events und leitet sie als Wire-Notifications weiter; subagent-Completions werden nur weitergeleitet, wenn das service-gesnapshottete Lifecycle-`local`-Flag true ist — provider-Namen, Kind-ids und dauerhafte Lineage begründen nie Lokalität.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Config`-Schema, stdio-Verdrahtung, Request-Dispatch, geteilte Shutdown-/Exit-Task |
| [`src/server.ts`](src/server.ts) | `HarnessSdkJsonRpcServer`: Protokollmethoden, agent-Erstellung pro Session, Lifecycle-Subscriptions, Teardown |
| — | Es wird kein Runtime-Invariant-Begleiter veröffentlicht; dieser Presentation-Adapter besitzt keinen dauerhaften paketlokalen Event-Stream; Boundary- und Replay-Tests decken sein Protokollmapping ab. |

### Request-Fluss

Jede Protokollmethode validiert ihre Eingaben und resolved den besitzenden Zustand, bevor sie handelt — `initialize` speichert die SDK-Route, `session/prompt` resolved das live agent+Session-Paar und queued die Message, und `shutdown` disposed den server-eigenen Zustand bis zur Quiescence, bevor es die Antwort flushed und mit 0 beendet — und eine geteilte Exit-Task garantiert, dass racende `shutdown`-Requests nie zweimal disposen oder beenden. Der Dispatch lebt in [src/index.ts](src/index.ts) und [src/server.ts](src/server.ts).

### Teardown

`server.shutdown()` disposed nur, was der Server besitzt — der umgebende Kontext läuft weiter, wenn nur dieses Plugin entladen wird. Das Protokoll-`shutdown` dagegen disposed den Root-fiber, sodass Persistenz und die gesamte runtime Quiescence erreichen, bevor der Prozess beendet.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Plugin-Vertrag nicht ausreicht. Sie führen vom Wire-Protokoll zu den Clients und zur lauffähigen Anwendung.

- [SDK-Wire-Protokoll](../protocol/README.de.md) — die Methoden und Payload-Formen, die dieses Plugin serviert.
- [TypeScript-SDK-Client](../client/README.de.md) — der Client, der dieses Plugin steuert.
- [SDK-Anwendungs-composition-bundle](../../bundle/sdk-app/README.de.md) — die `dsh --profile sdk`-Anwendung, die dieses Plugin bootet.
- [Python-SDK](../../../python/README.de.md) — der Python-Client, der denselben Server steuert.
- [SDK-runtime-Distributionsentscheidung](../../../.agents/notes/implemented/architecture/2026-07-10-single-file-executable-sdk-runtime-distribution.de.md) — warum die paketierte runtime einen geschlossenen Plugin-Baum serviert.

-----

<a id="model-experience"></a>
## Model Experience

### SDK-User-Message

#### Was das Modell sieht

Für jeden akzeptierten `session/prompt` gehen Text und dauerhafte Content-Referenzen wortwörtlich in eine User-Message ein. Inline-`SdkEncodedImageBlock`-Werte werden zuerst über den Attachment-Store der composition validiert und committet, sodass das Session-Log content-addressierte Bildreferenzen behält statt base64-Bytes. Dieses Paket fügt keinen system-prompt-Text oder Tool-Schema hinzu; die kommen von den anderen Plugins in der composition.

#### Token-Effekt

Datenabhängige User-Message-Tokens gehen in die retained Session-History ein und werden in späteren turns erneut gesendet, bis ein anderes Paket sie kompaktiert. Die JSON-RPC-Frames, Session-Notifications und Server-Buchhaltung fügen null Modell-Kontext-Tokens hinzu.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Content folgt dem wiederverwendbaren Request-Prefix und invalidiert keine bestehenden KV-Cache-Einträge.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Plugin besondere Betriebsaufmerksamkeit braucht. Es sind aktuelle Paketconstraints, kein Vergleich mit anderen Serving-Ansätzen und kein Aufgabenstapel.

- **Der Wire hat keine Per-Session-Close- oder Prompt-Cancel-Methode** — SDK-erstellte agents bleiben bis zum Prozess-Shutdown live.
- **Es gibt kein Per-Prompt-Ergebnis** — `MessageId` identifiziert nur die Inbox-Aufnahme; Clients, die ein Automatisierungsintervall besitzen, müssen dieses Intervall selbst definieren und beobachten.
- **stdout-Reinheit wird deployment-erzwungen** — eine umgebende Config kann immer noch einen stdout-Logger laden und den JSON-RPC-Kanal korrumpieren; dieses Plugin inspiziert oder vetot keine Geschwister-Logger.
- **Automatisches Adapter-Mounten ist DeepSeek-spezifisch** — `initialize` kann jeden vorregistrierten Modell-Adapter wiederverwenden, aber sein einziger Fallback mountet den DeepSeek-Adapter.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer und ausdrücklich nicht maßgeblich — das ausgelieferte Verhalten und die Grenzen stehen in den Abschnitten oben und im Code. Die Single-Executable-runtime-Distribution paart dieses Plugin mit dem paketierten `jsonrpc-demo`-bin; halte den Shutdown-/Exit-Vertrag konsistent mit dem app-bin, das EOF- und Signal-Exits besitzt. Es sind keine weiteren ungelösten Designfragen dokumentiert.

</details>
