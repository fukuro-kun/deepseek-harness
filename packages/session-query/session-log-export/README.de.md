---
description: "Web Session-Log-ZIP-Export: Host-Streaming, die authentifizierte Download-Route, die Session-Header-Aktion und der /export-Befehl."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-log-export

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-session-log-export` lässt das Web-Interface die vollständige History einer Session herunterladen: Ein `Download session log`-Menüpunkt unter dem More-Actions-Button des Session Headers und ein `/export`-Slash-Command übergeben beide den Session-Baum — die Session, ihre Sub-Sessions und Attachments — als ZIP-Download an den Browser. Das Paket besitzt den Host-Archiv-Stream, seine authentifizierte Fetch-Route sowie die Browser-Controls und -Rückmeldungen. Der Browser wählt das Download-Ziel. Setup und Verwendung kommen zuerst; Implementierungsdetails folgen.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Modell-Erfahrung](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Verwende dieses Paket, wenn das Web-Bundle Nutzern einen Session-Log-Export anbieten soll. Es benötigt Connection, die Command-Registry, Session-Query und -Persistence sowie Attachments. Mounte das Plugin, dann wähle `Download session log` im More-Actions-Menü des Session Headers oder tippe `/export`; der Browser lädt `dsh-session-<id>.zip` herunter.

### Wann es wählen

Wähle es für ein Web-Deployment, das nutzerseitigen Session-Export mit sichtbarem Download-Dialog braucht. Vermeide es, wenn ein programmatischer oder Host-seitiger Export nötig ist: Dieses Paket erzeugt einen Browser-Download, keinen Host-Pfad-Write. Die Logs werden aus Persistence-Read-Handles serialisiert, daher wird jedes gemountete Backend unterstützt.

### Komposition

```yaml
- id: session-log-download
  name: '@deepseek-ai/dsh-session-log-export'
```

Das Web-Bundle mountet das Paket zusammen mit Connection, `dsh-commands`, `dsh-client-ui-commands` und `dsh-client-ui-conversation`.

### Konfiguration

| Feld | Standard | Bedeutung |
|---|---|---|
| `compressionLevel` | `6` | DEFLATE-Level von 0 bis 9 für jeden ZIP-Eintrag. |

### Command-Vertrag

| Eingabe | Ergebnis |
|---|---|
| `/export` | Zeichnet einen Human-Command-Lifecycle auf; der submittende Browser lädt `GET /api/session.export?sessionId=<id>&includeDescendants=true` herunter |
| `/export <path>` | Ein Fehler; Browser-Downloads wählen ihr Ziel über das gewöhnliche Download-Verhalten des Browsers |

### Was zu erwarten ist

Der Dialog meldet drei Phasen: Preparing, Download gestartet oder fehlgeschlagen. Das Schließen des Dialogs bricht keinen laufenden Download ab, und der Dialog öffnet sich nicht erneut, wenn dieser Vorgang später abschließt. Eine Session lässt jeweils einen aktiven Download zu; wiederholte Gesten teilen sich diesen Vorgang. Der Export enthält die neuesten Events der Live-Session: Der Host-Endpunkt flusht eine Live-Root-Session vor dem Lesen, sodass ein slash-getriggertes ZIP das `command/run`-/`command/done`-Paar enthält, das den Download gestartet hat; kalte persistierte Sessions brauchen keinen Flush. Jedes logische Log verwendet im Archiv den kanonischen Dateinamen der aktuellen Generation (`session.jsonl` für v0, sonst `session.vN.jsonl`), einschließlich unterhalb jedes Sub-Session-Verzeichnisses. Bilder verwenden `media/<attachmentId>.<ext>`, generische Dateien `files/<digest-prefix>/<digest>/<name>`. Generische Datei-Bytes werden als begrenzte Chunks gelesen und komprimiert, sodass der Export eines großen Uploads es nicht vollständig puffert.

### Fehlschläge

Der Dialog zeigt einen Preparation-Fehler, wenn der Preflight fehlschlägt, bevor das ZIP-Streaming beginnt — etwa bei einem unerreichbaren oder falsch konfigurierten Host-Endpunkt. Ein Descendant- oder Attachment-Read-Fehlschlag, nachdem der Browser das GET akzeptiert hat, wird vom Browser-Download-Manager gemeldet, nicht vom Dialog.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt, wie das Paket die Export-Control verdrahtet, und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Design-Aufteilung

Das Paket hat zwei Hälften. Die Host-Hälfte ([`src/index.ts`](src/index.ts)) registriert den `/export`-Befehl und trägt die exakte `GET`/`HEAD /api/session.export`-Fetch-Route zu Connection bei; [`src/archive.ts`](src/archive.ts) baut den begrenzten ZIP-Stream. Die Browser-Hälfte ([`src/client/index.ts`](src/client/index.ts)) stellt den geteilten Download-Controller und die UI bereit und observiert `command/executed`, sodass nur der submittende Browser einen Download startet.

### Download-Fluss

Beide Einstiegspfade senden einen `HEAD`-Preflight an `GET /api/session.export?...` und übergeben dann die GET-URL an den Browser-Download-Manager, ohne das ZIP in JavaScript zu puffern. Ein Controller besitzt einen laufenden Download pro Session, faltet nebenläufige Gesten in diesen Vorgang und bricht den Preflight beim Plugin-Disposal ab. Der Modal-State lebt in einem per Session gekeyten Snapshot-Store, sodass Button und Befehl einen Dialog pro Session teilen.

Die Host-Route ist ein feature-eigener exakter Fetch-Beitrag. Connection wendet seine Host-/Origin- und Browser-Session-Checks an und bridged die streamende `Response`; dieses Paket besitzt Query-Validierung, Live-Session-Flushes, handle-basierte Log-Reads und Attachment-Reads, ZIP-Generierung und HTTP-Status-Semantik.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der paketweite Vertrag nicht ausreicht. Sie führen von der Web-Control zum Host-Endpunkt und den umliegenden Command- und Session-Oberflächen.

- [dsh-client-connection](../../client/connection/README.de.md) — der authentifizierte Fetch-Routen-Träger, den der Host-Endpunkt nutzt.
- [Commands-Subsystem-Referenz](../../../docs/subsystems/commands.de.md) — die Human-Command-Registry, auf der sich der `/export`-Befehl registriert.
- [dsh-client-ui-commands](../../client/ui-commands/README.de.md) — die Browser-Command-Oberfläche, die `/export` rendert und quittiert.
- [Session-Query-Paketkarte](../README.de.md) — die Retrieval-Familie, zu der dieses Paket gehört.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

### Menschliche `/export`-Kontrolle

#### Was das Modell sieht

Nichts. `/export` bleibt auf der Human-Command-Plane, und der ZIP-Download gelangt nicht in die Model-History.

#### Token-Effekt

Null. Der Befehl erzeugt keinen Model-Turn.

#### KV-Cache-Effekt

Keiner. Der nur geloggte Command-Lifecycle und der Browser-Download ändern das abgeleitete Request-Präfix nicht.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann dieses Paket ungeeignet ist oder besondere betriebliche Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Browser-Download, kein Host-Pfad-Writer** — der Browser wählt das lokale Ziel; es wird kein Host-Pfad oder native Folder-Aktion zurückgegeben.
- **Preflight meldet nur Pre-Stream-Fehlschläge** — ein Descendant- oder Attachment-Fehlschlag, nachdem der Browser das GET akzeptiert hat, wird vom Browser-Download-Manager gemeldet, nicht vom Dialog.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Diese Dev-Notiz ist Arbeitskontext für Maintainer: offene Design-Fragen und Richtungen, die nicht entschieden sind. Sie ist explizit nicht autoritativ — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen liegen in den Abschnitten oben, dem Paket-Code und den verlinkten Seiten.

#### Zukunft: Export-Ziele jenseits des Browsers

Der Download ist bewusst auf den Browser beschränkt; ein Host-Pfad- oder nativer Folder-Export bräuchte einen neuen Endpunkt-Vertrag und eine Entscheidung darüber, wo das ZIP landet.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Connection und die Command-Registry besitzen beide Registrierungen, während jeder Export autoritative Session-Services liest.
