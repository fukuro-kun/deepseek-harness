---
description: "Lokale Speicherung angehängter Bilder unter DSH_HOME, für Benutzer und Maintainer, die wählen oder debuggen, wo Bild-Attachments aufbewahrt werden."
kind: "package-reference"
---

# @deepseek-ai/dsh-attachment-local

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Speichert Bilder und generische Datei-Attachments persistent unter `DSH_HOME` auf der Maschine, die DSH ausführt. Bilder werden validiert, für Modellanfragen normalisiert und pro Route gecacht; generische Dateien werden Byte für Byte ohne Zulassungsgrenzen bewahrt. Identische Bytes werden einmal gespeichert, auch wenn Uploads verschiedene Anzeigenamen verwenden, Reads verifizieren Dateilänge und Inhalt, und zugelassene Bilder bleiben lesbar, wenn Limits später verschärft werden. Die ausgelieferte `dsh`-Komposition verwendet dieses Paket ohne Konfiguration. Objekte bleiben lokal auf einer Maschine und werden niemals automatisch gelöscht.

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

In der Default-Komposition werden Bilder und generische Dateien, die an Prompts oder Befehle angehängt werden, automatisch auf dieser Maschine gespeichert. Bei eigener Komposition stellt das Mounten dieses Plugins persistente Attachments bereit.

### Minimale Konfiguration

Das Plugin ohne erforderliche Konfiguration mounten. Die Defaults unten definieren, was angehängt werden kann; der generierte Konfigurationskatalog ist die erschöpfende Quelle für jedes Feld.

```yaml
- name: '@deepseek-ai/dsh-attachment-local'
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `dshHome` | aufgelöst | Explizites Harness-Home; weggelassen folgt `$DSH_HOME`, dann `~/.dsh` |
| `maxImageBytes` | `20 MiB` | Maximale kodierte Quell-Bytes, die für ein Bild akzeptiert werden |
| `maxImagesPerMessage` | `20` | Maximale Bildanzahl in einer eingereichten Message |
| `maxMessageImageBytes` | `200 MiB` | Maximale aggregierte kodierte Quell-Bytes in einer eingereichten Message |
| `maxImagePixels` | `64,000,000` | Maximale Quell-Breite multipliziert mit Höhe |
| `maxImageDimension` | `8192` | Maximale Quell-Breite oder -Höhe |
| `normalizedImageMaxPixels` | `2048 × 2048` | Gesamtpixel-Budget des gespeicherten normalisierten Bildes |
| `normalizedImageMaxDimension` | `8192` | Maximale lange Kante nach Anwendung des Gesamtpixel-Budgets |
| `normalizedImageMaxBytes` | `4 MiB` | Kodierte-Bytes-Ziel; die kleinste Ausgabe der Qualitätsleiter wird behalten, wenn keine passt |
| `imageCompressionConcurrency` | `2` | FIFO-Limit für gleichzeitige Normalisierungs- und Request-Transformationen |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-attachment-local) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Wo die Bilder gespeichert werden und wie lange sie bleiben

Angehängte Bilder werden unter `<DSH_HOME>/attachments/v1` auf dieser Maschine aufbewahrt. Gespeicherte Bilder werden niemals automatisch gelöscht, identische Bilder werden nur einmal gespeichert, und eine spätere Verschärfung der Limits macht bereits gespeicherte Bilder niemals unlesbar. Wenn die Bilder von einer anderen Maschine lesbar sein müssen, ist dieses Paket nicht die richtige Wahl.

### Was beim Anhängen eines Bildes passiert

Beim Anhängen eines Bildes werden seine Quell-Limits, Medien, Dimensionen und Pixel geprüft, bevor es normalisiert und gespeichert wird. EXIF-Orientierung wird angewendet, Metadaten und Farbprofile werden entfernt, Transparenz bleibt erhalten, und das Raster wird unter einem Gesamtpixel-Budget plus einer Langkanten-Obergrenze verkleinert. Alpha-Bilder verwenden WebP und opake Bilder JPEG auf der gemeinsamen 85/75/60-Qualitätsleiter; die kleinste Ausgabe wird behalten, wenn jeder Kandidat das Byte-Ziel überschreitet. Ein akzeptiertes Bild erscheint wieder im Verlauf und in späteren Turns, auch nach einem Neustart; die gewählte Modellroute erhält eine gecachte Request-Version und, wenn ihr Dateisystem das Host-Objekt abbildet, einen Read-only-Ausführungswelt-Pfad.

### Was schiefgehen kann

Ein Bild kann beim Anhängen abgelehnt werden: nicht unterstütztes Format, über den Byte-, Pixel- oder Pro-Seiten-Dimensionslimits, oder Bytes, die nicht zu ihrem deklarierten Typ passen. Bei einem späteren Read schlägt ein auf der Platte gelöschtes oder beschädigtes Bild mit einem klaren Fehler fehl. Jeder Fehler trägt einen stabilen Code, sodass Client und Protokoll-Adapter ihn in eigenen Worten erklären können.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Persistenz- und Verifikationsdesign hinter dem Storage sowie die Schreib- und Lesepfade, die es realisieren; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designentscheidungen

- **Persistenz durch fsync-Kette, nicht Existenz.** Eine gesyncte Datei allein überlebt keinen Crash, wenn ihr Verzeichniseintrag nie den Speicher erreichte, daher synct der Schreibpfad jeden Vorfahren-Eintrag bis zu einer prozessbewiesenen Grenze, bevor eine Referenz einen Session-Checkpoint erreichen kann.
- **Einmal normalisieren, pro Route projizieren.** Die Zulassung persistiert ein provider-unabhängiges normalisiertes Attachment; die Request-Projektion leitet deterministische Varianten ab, ohne den persistenten Verlauf umzuschreiben.
- **Lazy alpha-geroutetes Encoding.** Alpha-Bilder verwenden WebP und opake Bilder JPEG; Qualitätskandidaten laufen in der Reihenfolge 85/75/60, und die kleinste Ausgabe wird behalten, wenn keiner das Kodierte-Bytes-Ziel erreicht.
- **Limits sind Write-Time-Policy.** Byte-, Gesamtpixel- und Pro-Seiten-Dimensionslimits binden nur die Zulassung, sodass späteres Verschärfen zugelassenen Verlauf niemals unlesbar macht.

### Schreib- und Lesepfade

Objekte landen unter `<DSH_HOME>/attachments/v1/objects/<sha256-prefix>/<sha256>`; gleiche Bytes deduplizieren zu einem Objekt und einer `sha256:`-ID. Vor dem ersten Schreiben synct der Prozess jedes Vorfahren-Verzeichnis des Home einmal bis zur Dateisystemwurzel, sodass ein Verzeichnis, das ein anderer Prozess erstellt, aber noch nicht gesynct hat, nie für eine sichere Grenze gehalten wird. Writes stagen Bytes dann in `v1/tmp`, syncen die temporäre Datei, publizieren mit einem atomaren exklusiven Hardlink und syncen die Publikationsverzeichnisse — unter Windows besitzt das Dateisystem-Metadaten-Journaling die Eintragspersistenz. Sobald das Speichern aufgelöst ist, ist die gemeldete Referenz persistent.

Die Zulassung akzeptiert bis zu 20 Bilder und 200 MiB Quell-Bytes pro Message; eine Quelle darf bis zu 20 MiB, 64 Millionen Pixel und 8192 Pixel pro Seite verwenden. Sie wendet Orientierung an, entfernt Metadaten und Farbprofile und normalisiert unter einem 2048×2048-Gesamtpixel-Budget, einer 8192-Pixel-Langkante und einem 4-MiB-Kodierte-Bytes-Ziel. Extreme Seitenverhältnisse behalten daher ihre Kurzkanten-Auflösung. Sauberes Single-Frame-8-Bit-sRGB/sRGBA-PNG-, JPEG- oder WebP-Input, das bereits innerhalb dieser Limits liegt, geht Byte-identisch durch; GIF, Animation, Metadaten, Orientierung, 16-Bit-PNG und inkompatible Farbräume erzwingen Konvertierung.

Request-Versionen liegen unter `<DSH_HOME>/attachments/v1/request-images/`. `readImageRequest` skaliert ohne Vergrößerung auf ein Routen-Pixel-Budget und wendet dann ein separates Kodierte-Bytes-Ziel über dasselbe Alpha-Routing und dieselbe Qualitätsleiter an. Seine Cache-Identität umfasst Attachment-ID, Transformationsversion, Budgets und feste Encoder-Einstellungen; gecachte Bytes werden per Header-Probe auf Format, 8-Bit-sRGB/sRGBA, Dimensionen und Alpha-Fakten geprüft, und ein Mismatch regeneriert den Eintrag. Gleichzeitige Aufrufer teilen eine Transformation und einen Cache-Write, während Abbruch geteilte Arbeit nur stoppt, wenn kein Wartender übrig bleibt. `imageHostPath` leitet den Host-Pfad des normalisierten Objekts ab, und das gemountete Dateisystem kann diesen Pfad in seine Ausführungswelt abbilden, ohne ihn in den persistenten Verlauf zu schreiben.

Generische Dateibytes haben ein kanonisches Objekt unter `<DSH_HOME>/attachments/v1/file-objects/<digest-prefix>/<digest>`. Jeder Referenzpfad unter `<DSH_HOME>/attachments/v1/files/<digest-prefix>/<digest>/<name>` ist ein Read-only-Hardlink, sodass verschiedene Namen für gleiche Bytes keinen Platteninhalt duplizieren. `readFileStream` liest den Referenzpfad in begrenzten Chunks und verifiziert den vollständigen Digest und die aufgezeichnete Byteanzahl, bevor ein Consumer erfolgreich abschließen kann. Ein fehlendes, geändertes oder abgeschnittenes Objekt lässt seinen Consumer fehlschlagen, statt einen vollständigen Export mit anderen Bytes zu erzeugen.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `LocalAttachmentStore`, `Config`-Schema, Defaults |
| [`src/store.ts`](src/store.ts) | Content-adressiertes Schreiben und verifiziertes Lesen: Staging, Hardlink-Publish, fsync-Kette, Digest-Verifikation |
| [`src/file-store.ts`](src/file-store.ts) | Wortgetreue gestreamte Datei-Writes, verifizierte gestreamte Reads und sichere gespeicherte Dateinamen |
| [`src/normalization.ts`](src/normalization.ts) + [`src/encoding.ts`](src/encoding.ts) | Provider-unabhängige Normalisierung und begrenzte Format-/Qualitätskandidaten |
| [`src/request-image.ts`](src/request-image.ts) | Routenspezifische Request-Transformationen, Cache-Identität und Singleflight |
| [`src/image.ts`](src/image.ts) | Vollständige Raster-Dekodierung und Metadaten-Verifikation |
| — | Es wird kein Runtime-Invariant-Begleiter publiziert; immutable Writes und verifizierte Reads werden direkt an der Backend-Grenze erzwungen. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Für den vollständigen Service-Vertrag und die Payload-Typen die Subsystem-Referenz lesen; für die Capability, die dieser Storage stützt, das Seam-Paket lesen.

- [Attachment-Subsystem-Referenz](../../../docs/subsystems/attachment.de.md) — Service-Vertrag, Payload-Typen und die `ctx.attachments`-Cordis-Oberfläche.
- [Attachment-Seam-Paket](../attachment/README.de.md) — die Image-Attachment-Capability, die dieser Storage stützt.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-attachment-local) — jedes akzeptierte Config-Feld und seine Quelldeklaration.
- [Home-Paths-Auflösung](../../util/home-paths/README.de.md) — wie `DSH_HOME` aus expliziter Config, Umgebung und User-Home aufgelöst wird.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über Request-Deskriptoren. Ein gemapptes Ausführungs-Dateisystem lässt das Modell neben den Request-Bytes Identität, Dimensionen, Medientyp, Read-only-Prozesspfad, Writable-Copy-Extension und Normalisierungswarnung jedes Bildes sehen. Generische Dateien projizieren als Text-Handles, die ihre Identität und den Read-only-Prozesspfad nennen; ohne Mapping gibt der Handle an, dass die Ausführungsumgebung die Datei nicht lesen kann.

#### KV-Cache-Effekt

Normalisierung und Request-Projektion sind deterministisch. Ein unverändertes Attachment und Routen-Policy verwenden in späteren Turns identische gecachte Request-Bytes wieder; Ausführungswelt-Pfad-Mapping kann Deskriptortext ändern, ohne diese Bytes oder ihre `variantId` zu ändern.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen beschreiben, was dieser Storage kann und nicht kann; sie sind aktuelle Paket-Einschränkungen.

- **Bilder werden für immer aufbewahrt** — gespeicherte Bilder werden niemals automatisch gelöscht, und nichts sammelt unreferenzierte Objekte ein.
- **Lokal auf dieser Maschine** — Bilder leben auf der Maschine, die den Harness ausführt; andere Hosts können sie nicht lesen.
- **Animiertes GIF wird statisch** — die Normalisierung behält nur den ersten Frame; Animation liegt außerhalb des Version-eins-Bildvertrags.
- **Encoder-Ausgabe ist versioniert** — der installierte Sharp/libvips-Build pinnt Normalisierungs- und Request-Bytes; ein Encoder- oder Transformationsversions-Upgrade adressiert künftige Varianten neu, während bestehende Objekte gültig bleiben.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: unentschiedene Richtungen und offene Fragen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten und Grenzen stehen in den Abschnitten oben und dem Paketcode.

#### Zukunft: Retention und Remote-Storage

Retention und Garbage Collection sind zurückgestellt, weil resumed und geforkte Sessions immutabile Objekte teilen können, und ein Backend, das Remote-Runtimes oder geteilten Storage bedient, einen eigenen Persistenzbeweis bräuchte. Beide Richtungen sind unentschieden; der lokale Storage behält derzeit jedes Objekt unter `DSH_HOME`.

</details>
