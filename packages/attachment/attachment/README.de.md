---
description: "Durable Bild- und Datei-Attachments für Nutzer und Maintainer, die Uploads in Prompts und Befehlen anhängen, wiederverwenden oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-attachment

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Hänge Bilder und generische Dateien an Prompts und Befehle an und verwende sie nach einem Restart derselben Session wieder — ohne zusätzliches Setup in der mitgelieferten `dsh`-Komposition. Bilder werden validiert und normalisiert, bevor die Message akzeptiert wird; PNG, JPEG, WebP und GIF werden innerhalb der Deployment-Grenzen unterstützt. Andere Dateien werden Byte für Byte ohne Format- oder Größenlimits gespeichert, und Modelle lesen sie bei Bedarf über gespeicherte Read-only-Pfade, statt ihre Bytes zu empfangen. Durable Session-Events schließen Browser-Pfade, Provider-URLs, lokale Storage-Pfade und Base64 aus. Gespeicherte Attachments werden niemals automatisch gelöscht; Audio und Video haben keine dedizierte Behandlung.

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

Bild-Attachments funktionieren End-to-End: Hänge ein Bild an einen Prompt oder einen Befehl an, und es wird gespeichert, in der History angezeigt und an das Modell gesendet, ohne weitere Aktion von dir. In der Default-`dsh`-Komposition ist bereits alles verdrahtet; wenn du dein eigenes Setup komponierst, aktiviert ein Plugin die Capability.

### Bilder an einen Prompt anhängen

Hänge ein oder mehrere Bilder an einen User-Prompt in der Client-UI an. Jede Quelle wird geprüft, zu einem provider-unabhängigen 8-Bit-sRGB/sRGBA-Raster normalisiert und gespeichert, bevor deine Message verarbeitet wird; wird irgendein Bild abgelehnt, schlägt die gesamte Message fehl und nichts wird publiziert. Unterstützte Quellformate sind PNG, JPEG, WebP und GIF; ein Deployment steuert Quell-Limits getrennt von Normalized-Storage- und route-spezifischen Request-Limits. Das eine Plugin unten aktiviert durable Bild-Attachments (die mitgelieferte Base-Komposition mountet es bereits):

```yaml
- name: '@deepseek-ai/dsh-attachment-local'
```

### Beliebige andere Dateien an einen Prompt anhängen

Jede Nicht-Bild-Datei hängt als generische Datei an einen Prompt an: Die exakten Bytes werden read-only unter dem Harness-Home gespeichert, die Message zeichnet Dateiname, Bytegröße und Content-Digest auf, und das Modell erhält eine Zeile, die den gespeicherten Pfad nennt, damit es den Inhalt nur bei Bedarf mit seinen File-Tools liest. Es gibt keine Dateityp-Whitelist und kein Größenlimit; was du anhängst, wird verbatim gespeichert.

### Attachments an Befehle übergeben

Befehle, die Attachment-Input deklarieren, empfangen Bilder und generische Dateien in Auswahlreihenfolge. Befehle, die keine Attachments akzeptieren, liefern einen Fehler und bewahren Draft und Cards des Composers.

### Bilder über die Session hinweg wiederverwenden

Gespeicherte normalisierte Bilder bleiben in der Conversation-History und werden in späteren Turns zu deterministischen, route-großen Request-Versionen projiziert; nach einem Restart zeigt eine resumed Session dieselben Bilder und verwendet sie wieder. Wenn das aktuelle Execution-Filesystem das gespeicherte Host-Objekt mappt, trägt der Request-Deskriptor außerdem einen Read-only-Prozesspfad, den das Modell inspizieren kann. Wenn History oder eine Request-Version zurückgelesen wird, werden die gespeicherten Bytes gegen das Aufgezeichnete geprüft, sodass ein fehlendes, korruptes oder vertauschtes Bild als Fehler auftritt statt als falsche Bytes.

### Was schiefgehen kann

Ein Bild kann beim Anhängen abgelehnt werden — nicht unterstütztes Format, über den Größen-, Pixel- oder Dimension-Limits, oder Bytes, die nicht zu ihrem deklarierten Typ passen — und die Message schlägt dann als Ganzes fehl. Später kann ein History-Read fehlschlagen, wenn das gespeicherte Bild auf der Disk gelöscht oder korrupt wurde. Fehlschläge tragen stabile Codes, sodass Client- und Protokoll-Adapter sie in eigenen Worten erklären können.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt die Design-Entscheidungen hinter dem Seam und die Service-Operationen, die das nutzersichtbare Verhalten umsetzen; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Design-Entscheidungen

- **Normalisieren und persistieren vor dem Event.** Jede Quelle wird vorbereitet und verifiziert, bevor der Batch in Reihenfolge publiziert, sodass das Session-Log niemals eine partielle oder fehlgeschlagene Normalisierung referenziert.
- **Immutable und retention-neutral.** Objekte sind nach Publikation immutable; resumed und geforkte Sessions können sie teilen, daher ist referenzbewusste Garbage Collection zurückgestellt statt an die Deletion einer einzelnen Session gebunden.
- **Beim Read verifizieren.** Reads prüfen Bytes und Metadaten gegen die geloggte Referenz, bevor sie sie zurückgeben, und Request-Projections dekodieren gecachte Bytes vollständig, sodass ein fehlendes, korruptes oder vertauschtes Objekt fail-closed scheitert.
- **Rollenneutrale Image-Blocks.** Der `ImageBlock`-Content-Block in `dsh-llm` trägt einen `ImageAttachmentRef`; Provider-Adapter lösen ihn zu deterministischen Request-Versionen mit expliziten Pixel- und Byte-Budgets auf, während Execution-Filesystems das immutable Host-Objekt auf einen modell-lesbaren Prozesspfad mappen können.
- **Error-Routing per Code.** `AttachmentError` re-implementiert die `HarnessError`-Form statt sie zu erweitern, weil die Basisklasse in `dsh-llm` lebt, das von diesem Paket abhängt; Consumer verwenden `isAttachmentError` und routen auf `code`, niemals auf die Prototype-Chain.
- **Dateien sind verbatim, Bilder sind normalisiert.** `saveFile` committet ein existierendes Byte-Array, `saveFileStream` committet begrenzte Chunks mit Backpressure und Cancellation, `readFileStream` verifiziert und liefert begrenzte Chunks, und `fileHostPath` lokalisiert das gespeicherte Objekt für die Read-on-Demand-Projection; keiner der beiden File-Write-Pfade wendet Admission-Limits an. Der Image-Pfad behält seine eigene Normalisierungs-, Limits- und Request-Version-Pipeline. Der `FileBlock`-Content-Block in `dsh-llm` trägt einen `FileAttachmentRef`, und die Request-Assembly projiziert ihn für jede Route zu deterministischem Handle-Text.

### Service-Operationen

Die Service-Familie betreibt einen einzigen Admission-and-Storage-Fluss: Jeder Einstiegspunkt erzwingt Source-Batch-Limits und kanonisches Base64, bereitet provider-unabhängige normalisierte Attachments vor, bevor irgendein Member publiziert wird, und committet sie durably in Eingabereihenfolge ohne Teilergebnisse. Host-Prompt-Consumer übergeben geordneten Text, enkodierte Bilder und bereits aufgelöste File-Referenzen an `ctx.attachments.admitPromptContent()`; die Methode persistiert Bilder und reicht File-Referenzen unverändert durch. Enkodierende Protokoll-Adapter rufen `ctx.attachments.admitEncodedFile()` auf, das kanonisches Base64 prüft, bevor es an `saveFile` delegiert; Adapter erkennen Attachment-Fehlschläge über `ctx.attachments.isAttachmentError()`. Generic-File-Caller wählen `saveFile` für existierende Bytes oder `saveFileStream` für eine begrenzte asynchrone Byte-Quelle; beide liefern dieselbe durable Referenz, während `readFileStream` Digest und Länge während eines begrenzten Reads verifiziert. `readImageRequest` leitet deterministische route-große Varianten ab, deren Identität Attachment-ID, Transform-Version, Pixel- und Byte-Budgets sowie Encoder-Einstellungen umfasst. Der reine `requestImageDimensions`-Export berechnet die aspektbewahrenden Dimensionen jeder Projection aus einem Total-Pixel-Budget, sodass Provider und Request-Pricing dieselbe Geometrie teilen. `imageHostPath` exponiert einen implementation-eigenen Host-Ort nur an vertrauenswürdige Same-Process-Consumer, die Execution-World-Mapping brauchen. Caller komponieren geordnete Batches, während die Implementierung Compression-Concurrency, Caching und Singleflight besitzt. Reads, gestreamte Writes und Projections bewahren Caller-Cancellation. Fehlschläge tragen stabile maschinenlesbare Codes, und die caller-korrigierbare Admission-Teilmenge ist zur Laufzeit erkennbar, sodass jeder Protokoll-Adapter sein eigenes Vokabular mappt; die exakten per-Operation-Verträge liegen in [`src/index.ts`](src/index.ts) und [`src/error.ts`](src/error.ts).

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: abstrakter `AttachmentStore`-Service und Re-Exports |
| [`src/types.ts`](src/types.ts) | Durables Vokabular: Referenzen, Limits, Upload- und Store-Payloads |
| [`src/admission.ts`](src/admission.ts) | Canonical-Base64-Erzwingung und Store-Delegation für enkodierte Bild- und Datei-Uploads |
| [`src/error.ts`](src/error.ts) | `AttachmentError`-Klasse und die `isImageAdmissionError`-Runtime-Teilmenge |
| [`src/brand.ts`](src/brand.ts) | `AttachmentId` gebrandeter opaker Identifier |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; dieser stateless Seam besitzt Typen, während Implementierungen Immutable-Store-Checks erzwingen. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Für den vollständigen Service-Vertrag und die Payload-Typen lies die Subsystem-Referenz; für den Storage hinter dieser Capability lies das lokale Backend.

- [Attachment-Subsystem-Referenz](../../../docs/subsystems/attachment.de.md) — Service-Vertrag, Payload-Typen und die `ctx.attachments`-Cordis-Oberfläche.
- [Lokales Filesystem-Backend](../attachment-local/README.de.md) — wo deine angehängten Bilder auf dieser Maschine gespeichert werden.
- [Capability-Seams](../../../docs/capability-seams.de.md) — wie diese Capability-Familie in Rollen aufgeteilt ist.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

Indirekt, über den Provider-Adapter, der jede durable Bild-Referenz in eine exakte Request-Version auflöst und ihre stabile Attachment-ID und die tatsächlichen Dimensionen neben dem Bild sendet. Wenn das Execution-Filesystem das gespeicherte Objekt mappt, enthält der Deskriptor außerdem einen Read-only-Prozesspfad und eine passende Extension für eine beschreibbare Kopie. Eine generische Datei erreicht den Provider niemals als Bytes: Jede Route erhält eine deterministische Handle-Zeile, die die Datei, ihre Bytegröße, ihr Digest-Präfix und den gespeicherten Read-only-Pfad nennt, den File-Tools lesen können.

#### KV-Cache-Effekt

Das Hinzufügen eines Bildes ändert den Provider-Request und invalidiert daher das betroffene Request-Suffix.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen beschreiben, was Bild-Attachments können und nicht können; sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Raster-Image-Limits gelten nur für Bilder** — PNG, JPEG, WebP und GIF werden als Bilder innerhalb der Deployment-Limits akzeptiert; jede andere Datei wird verbatim ohne Typ- oder Größenlimit gespeichert, und Audio und Video haben noch keine dedizierte Behandlung.
- **Attachments werden niemals gelöscht** — gespeicherte Bilder und Dateien werden unbegrenzt aufbewahrt; nichts entfernt sie automatisch.
- **Ungesendete Drafts werden nicht gespeichert** — ein Composer-Draft bleibt im Browser, bis du die Message submittest.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Diese Dev-Notiz ist Arbeitskontext für Maintainer: unentschiedene Richtungen und offene Fragen. Sie ist explizit nicht autoritativ — ausgeliefertes Verhalten und Grenzen liegen in den Abschnitten oben und im Paket-Code.

#### Zukunft: referenzbewusste Garbage Collection

Resumed und geforkte Sessions können immutable Objekte teilen, daher braucht jede Retention-Policy ein Referenzmodell, das die Session-Lineage berücksichtigt, bevor Objekte eingesammelt werden können. Es ist noch keine Entscheidung aufgezeichnet; das lokale Backend bewahrt derzeit alles auf.

#### Zukunft: Audio, Video und Assistant-seitige Ausgabe

Audio und Video bräuchten dedizierte Lifecycle- und Provider-Verträge jenseits des Verbatim-File-Pfads, und der rollenneutrale `ImageBlock` lässt Assistant-seitige Bildausgabe als Forward-Kompatibilität offen — aktuelle Produktions-Adapter deklarieren nur Text-Output, daher tragen nur User-Inhalte Bilder. Beide Richtungen sind unentschieden.

</details>
