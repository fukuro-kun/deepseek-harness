---
description: "Session-adressierte Browser-Datei-Uploads mit Streaming-Aufnahme, Fortschritt, Abbruch und vorgelagerten Quittungen für spätere Prompts."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-file-upload

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Dieses Paket lässt Browser-Features ein `Blob`, exakte Bytes oder einen `ReadableStream<Uint8Array>` für eine Session speichern und eine opake Quittung für einen späteren Prompt erhalten. Ausgelieferte Seiten senden Blob- und Stream-Bodies, ohne deren Bytes auf dem Seiten-Thread zu aggregieren; Seiten, deren Host in einem anderen Ausführungskontext läuft, stellen vor dem Cordis-Boot einen Fetch-förmigen Träger bereit. Aufrufer können verbrauchte Bytes beobachten und eine aktive Operation abbrechen. Ein Stream-Body wird einmal konsumiert und überträgt seine Eigentümerschaft, wenn er eine Worker-Grenze überschreitet. Die eigenständige `?fixture`-Seite verwendet das generierte Remote für reproduzierbare Blob- und Exakt-Byte-Eingaben.

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

Mounte das Paket vor einem Consumer, der `fileUpload` injiziert, und rufe dann `ctx.fileUpload.upload(sessionId, body, name, signal, onProgress)` auf. Die Session-Identität adressiert sowohl die rohe Route als auch den generierten Remote-Fallback; Aufrufer setzen keine der beiden Anfragen zusammen.

```yaml
- id: file-upload
  name: '@deepseek-ai/dsh-client-file-upload'
```

Das Paket hat keine Cordis-Konfigurationsfelder. Ein `Blob` verwendet XMLHttpRequest in einem dedizierten Worker, damit der Dienst den Browser-Upload-Fortschritt melden kann, einschließlich der Gesamtmenge, wenn der Browser sie liefert. Ein `ReadableStream` wird an diesen Worker transferiert und speist Fetch inkrementell; der Fortschritt meldet verbrauchte Bytes ohne Gesamtmenge. Ein `AbortSignal` beendet den dedizierten Worker oder erreicht einen seiten-eigenen Träger. Exakte Bytes und Fixture-Blob-Eingaben verwenden das generierte Remote.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Das Client-Plugin stellt `ctx.fileUpload` bereit. Seine `upload()`-Methode empfängt die besitzende Session-Identität, setzt die rohe Routenanfrage zusammen und ruft den generierten Remote-Fallback für reproduzierbare Eingaben auf. Der Provider liest den optionalen Pre-Cordis-Hook `__DSH_FILE_UPLOAD__` einmal. Ohne Hook besitzt jede Nicht-Fixture-Rohanfrage einen kurzlebigen Worker und gibt ihn nach Abschluss, Fehlschlag oder Abbruch frei. Mit Hook sendet der Dienst den Body über den seiten-eigenen Fetch-Träger; die Web-Worker-Runtime transferiert Stream-Bodies durch ihren Request-Frame und stellt sie der Host-HTTP-Bridge als backpressured Chunks bereit.

Das Host-Plugin stellt `ctx.fileUploads` bereit. Es besitzt die authentifizierte Streaming-Route, den kodierten Remote-Fallback, den Kommando-Quittungs-Resolver und den Lebenszyklus vorgelagerter Quittungen; kodierte Zulassung, Anhang-Fehler-Erkennung und Byte-Speicherung bleiben hinter `ctx.attachments`. Quittungstabellen verwenden das Session-Objekt des empfangenden Agents als Schlüssel. Der Session Controller registriert den Resolver, der einen kalten gewöhnlichen Agent fortsetzen kann, und konsumiert Quittungen während der Prompt-Zulassung. Die Prompt-Zustellung hält jede Quittungsbindung in einer disponiblen Transaktion: Disposal stellt die vorherige Bindung wieder her, bis eine erfolgreiche Zustellung sie committet, und Queue- oder Historien-Beobachtung zieht die committete Quittung dann zurück.

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Host-Streaming-Route, Attachment-Service-Zulassung und Agent-scoped Quittungslebenszyklus |
| [`src/types.ts`](src/types.ts) | kodierte Anfrage-, Quittungs- und dauerhafte Ergebnistypen |
| [`src/client/contract.ts`](src/client/contract.ts) | Client-Upload-, Fortschritts- und Seiten-Hook-Typen |
| [`src/client/runtime.ts`](src/client/runtime.ts) | dedizierte Worker- und seiten-eigene Träger-Implementierungen |
| [`src/client/index.ts`](src/client/index.ts) | Client-Plugin-Registrierung und `ctx.fileUpload`-Deklaration |

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Jede Upload-Quittung gehört zu genau einer Session, und jede Anfrage verwendet einen ausgewählten Träger. Nicht unterstützte Stream-Träger schlagen fehl, bevor der Body gesendet wird.

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [Connection](../connection/README.de.md) — authentifiziertes RPC, exakte Host-Routen und Verbindungsgenerationen.
- [Session Controller](../../api/session-controller/README.de.md) — Prompt-Zulassung, die vorgelagerte Quittungen konsumiert.
- [Web-Worker-Runtime](../../experimental/webworker-runtime/README.de.md) — der Seite-zu-Host-Worker-Request-Tunnel.
- [Client-Gruppenkarte](../README.de.md) — Browser-Dienste und UI-Feature-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da dieses Paket Browser-Request-Bodies überträgt und keinen Modell-Input beiträgt.

#### KV-Cache-Auswirkung

Keine; dieses Paket setzt weder eine Provider-Anfrage zusammen noch sendet es eine.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

Diese Grenzen gelten für die Transportoperation selbst.

- **Uploads sind nicht fortsetzbar** — ein fehlgeschlagener oder abgebrochener Versuch startet beim ersten Byte neu.
- **Stream-Bodies sind einmalig** — das Transferieren eines `ReadableStream` sperrt das Objekt des Aufrufers, sodass ein Retry einen neu erstellten Stream erfordert.
- **Stream-Fortschritt hat keine Gesamtmenge** — Aufrufer erhalten Verbrauchte-Byte-Zahlen, weil die Stream-API keine Bytelänge trägt.
- **Der Browser-Worker ist in sich geschlossen** — seine Quelle wird aus einem Funktionsstring emittiert. Das Hinzufügen von Runtime-Imports erfordert die Verlagerung in einen eigenständigen, von tsdown gebündelten Worker-Eintrag.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
