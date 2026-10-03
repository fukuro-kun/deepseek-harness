---
description: "Das SDK-Wire-Protokoll für Client- und Server-Implementierer: der newline-delimitierte JSON-RPC-Transport und die benannten Request-, Result- und Notification-Typen, die zwischen einer Harness-Laufzeit und ihren SDK-Clients gesprochen werden."
kind: "package-library"
---

# @deepseek-ai/dsh-sdk-protocol
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-sdk-protocol` lässt eine DeepSeek-Harness-Laufzeit und ihre SDK-Clients JSON-RPC-2.0-Nachrichten über newline-delimitierte Bytestreams austauschen: eine Transportklasse plus die benannten Request-, Result- und Notification-Typen, die beide Wire-Enden sprechen. Die anbietende Seite ist das Plugin [`dsh-sdk-jsonrpc-server`](../server/README.de.md); die Clients sind der TypeScript-[`dsh-sdk-client`](../client/README.de.md) und das [Python-SDK](../../../python/README.de.md), das diese Formen spiegelt, ohne sie zu importieren. Verwende dieses Paket, wenn du ein Wire-Ende implementierst oder debuggst: Framing-Regeln, Methodennamen, Payload-Typen und Fehlersemantik leben alle hier. Es ist eine reine Bibliothek — kein Plugin, keine Konfiguration, keine Registrierungen.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Verwende dieses Paket, wenn du ein SDK-Wire-Ende baust oder debuggst — das anbietende Plugin, eine Client-Bibliothek oder eigenes Tooling, das das SDK-Protokoll spricht. Es liefert einen Transport für JSON-RPC 2.0 über aufrufereigene Bytestreams und die typisierten Formen für jede SDK-Methode und -Notification.

### Framing und Transport

Trage eine JSON-RPC-2.0-Nachricht pro `\n`-terminierter Zeile über Bytestreams, die du besitzt. Ein Frame mit `id` und `method` ist ein Request, `id` allein eine Response und `method` allein eine Notification; fehlerhafte Zeilen werden ignoriert. Requests ohne registrierten Handler antworten `-32601`, Handler-Fehler antworten `-32603`, und Error-Responses weisen den ausstehenden Request mit `JsonRpcResponseError` zurück, das den Wire-`code` und das optionale `data` bewahrt. `start()` hängt Stream-Listener an und `close()` löst sie wieder und weist ausstehende Requests zurück, ohne die Streams zu zerstören.

### Die SDK-Methoden

Beide Wire-Enden teilen einen Methodensatz: drei Client-zu-Server-Requests und vier Server-zu-Client-Notifications.

| Richtung | Methode | Payload-Typen |
|---|---|---|
| client→server | `initialize` | `InitializeParams` → `InitializeResult` |
| client→server | `session/prompt` | `SessionPromptParams` → `SessionPromptResult` (dauerhafte Enqueue-Quittung) |
| client→server | `shutdown` | keine Params → `{}` |
| server→client | `session.event` | `SessionEventNotification` (jede Session in der Laufzeit, ungefiltert) |
| server→client | `session.status` | `SessionStatusNotification` (Gesamt-agent-`running`/`idle`-Übergang) |
| server→client | `subagent.started` | `SubagentStartedNotification` |
| server→client | `subagent.finished` | `SubagentFinishedNotification` (nur in-process-Läufe) |

`HarnessSdkRequestMap` und `HarnessSdkNotificationMap` indizieren diese Formen nach Methodenname; der Paket-Root exportiert sie zusammen mit dem Transport.

### Payload-Semantik

`SessionPromptResult.messageId` identifiziert die eingereihte Benutzernachricht; es identifiziert keine spätere Assistant-Nachricht, kein Turn-Ende und kein Prompt-Ergebnis. `SdkPromptContentBlock` akzeptiert gewöhnlichen dauerhaften Inhalt plus `SdkEncodedImageBlock { type: "image", data, mimeType }`; der Server wandelt kodierte Bilder vor dem Enqueue in dauerhafte Referenzen um. `InitializeParams.reasoningEffort` ist ein optionaler nicht-leerer adapter-eigener Bezeichner für die gewählte Provider-/Modellroute; Weglassen bewahrt den Default dieses Modells. `InitializeParams.maxTokens` ist eine optionale positive sichere Ganzzahl, die jede Konversationsmodell-Ausgabe für SDK-erzeugte Agents und deren in-process-Nachkommen deckelt; Weglassen lässt den Exaktmodell-Default des gewählten Adapters gelten. Der Server löst die exakte Route während der Initialisierung auf und lehnt `session/prompt` ab, bis dieser Handshake erfolgreich ist, sodass ein fehlender Adapter, ein nicht verfügbares Modell oder ein nicht unterstützter Effort-Wert nicht auf Konstruktor-Defaults zurückfallen kann. `SubagentFinishedNotification.lastAssistantMessage` trägt die letzte nicht-leere Assistant-Nachricht des Kindes oder dessen akkumulierten Assistant-Text, wenn keine solche Nachricht existiert; das Feld fehlt, wenn das Kind keines von beiden erzeugte. `serverInfo.name` bleibt der wire-stabile Wert `deepseek-harness-sdk-runtime`. Notification-Payloads hängen von `SessionEvent` (`dsh-session`), `ContentBlock` (`dsh-llm`) und `SubagentStopReason` (`dsh-subagent`) ab, sodass das Session-Vokabular Teil des Wire-Vertrags ist.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design hinter der Wire-Bibliothek; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designkonzept

Das Paket baut auf einer Trennung auf: einer einzigen newline-delimitierten Transportklasse, die beide Wire-Enden teilen, und benannten Typen, die die Protokollmethoden indizieren. Der Paket-Root ist die einzige Import-Oberfläche — Quellmodule werden nicht als Deep-Imports exportiert. Es ist eine reine Bibliothek ohne Plugin, Config oder Registrierung; das anbietende Plugin und die Clients besitzen das gesamte Verhalten drumherum.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/transport.ts`](src/transport.ts) | `JsonRpcLineTransport`: Zeilen-Framing, Request-/Response-/Notification-Dispatch, Fehlermapping, Buchführung ausstehender Requests |
| [`src/types.ts`](src/types.ts) | Benannte Request-/Result- und Notification-Payload-Typen, nach Methode indiziert |
| [`src/index.ts`](src/index.ts) | Consumer-Schnittstelle: der Transport und die benannten Wire-Typen |
| — | Es wird kein Runtime-Invarianten-Companion veröffentlicht; eine reine Wire-Bibliothek (Transportklasse + Typdeklarationen) ohne eigenen Event-Stream oder mutierbare Datenrelation; beide Wire-Enden besitzen ihr Protokollverhalten. |

### Frame-Dispatch

Eingehende Zeilen werden einzeln geparst: Ein Frame mit `id` und `method` wird über den Request-Handler beantwortet (oder mit `-32601`), ein Frame mit `id` allein erfüllt den passenden ausstehenden Request (ein Error-Frame weist ihn mit `JsonRpcResponseError` zurück), und ein Frame mit `method` allein wird dem Notification-Handler übergeben. `start()` hängt die Input-Listener an; `close()` löst sie und lässt jeden ausstehenden Request fehlschlagen, ohne die Streams zu zerstören.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Wire-Vertrag nicht ausreicht. Sie führen vom anbietenden Plugin zu den Clients und zur lauffähigen Anwendung.

- [JSON-RPC-Server-Plugin](../server/README.de.md) — das Laufzeit-Plugin, das dieses Protokoll über stdio anbietet.
- [TypeScript-SDK-Client](../client/README.de.md) — der Client, der dieses Protokoll fährt.
- [Python-SDK](../../../python/README.de.md) — das Python-Gegenstück, das diese Formen spiegelt.
- [SDK-Anwendungsbundle](../../bundle/sdk-app/README.de.md) — die `dsh --profile sdk`-Anwendung, die den Server bootet.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da dies eine clientseitige Wire-Bibliothek ist; das gesamte modellseitige Verhalten besitzen die Laufzeit-Plugins hinter dem Serving-Einstieg.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert oder sendet keinen Provider-Request.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was das Protokoll nicht abdeckt oder verspricht. Sie sind aktuelle Paket-Einschränkungen, kein Vergleich mit anderen Wire-Formaten und kein Aufgabenrückstand.

- **Keine Protokollversions-Aushandlung** — der Handshake trägt nur `serverInfo.version` (`0.0.1`, von Clients nicht validiert); Pre-Release-Haltung, kein Kompatibilitätsversprechen.
- **Keine Cancel- oder Session-Close-Methoden** — ein Client bricht einen Turn ab, indem er den Laufzeit-Prozess schließt; siehe das [JSON-RPC-Server-Plugin](../server/README.de.md).
- **Server→Client-Requests sind eine tote Fähigkeit** — der Transport unterstützt sie, aber der Server sendet niemals einen; die Responder-Oberfläche des Python-SDK existiert für künftige Approval-Flows.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer und ausdrücklich nicht autoritativ — ausgeliefertes Verhalten und Grenzen stehen in den Abschnitten oben und im Code. Die Formen dieses Protokolls werden vom Python-SDK gespiegelt (nicht importiert); eine Änderung an einer Methode, einem Payload oder dem wire-stabilen `serverInfo.name` erfordert daher, das Python-Gegenstück und den TypeScript-Client in derselben Änderung zu aktualisieren. Es sind keine weiteren ungelösten Designfragen verzeichnet.

</details>
