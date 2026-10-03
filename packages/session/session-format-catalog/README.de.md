---
description: "Build-statischer First-Party-Session-Format-Codec und angrenzende Migrationsassemblierung für Persistenz-Leser."
kind: "package-library"
---

# @deepseek-ai/dsh-session-format-catalog
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh-session-format-catalog` gibt der Persistenz einen deterministischen Session-Format-Leser, ohne gemountete Plugins zu befragen. Es assembliert Codecs und angrenzende Edges vom frühesten unterstützten Format bis zum [aktuellen Writer-Format](../../../docs/session-format-status.de.md), prüft bei der Modulinitialisierung die vollständige lückenlose Kette und exponiert über `sessionFormatCatalog` physisches Dispatch, Header-only-Klassifikation, Single-Pass-Zeilenwiederherstellung und die Kodierung aktueller Records.

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

### Wann verwenden

Importiere diese Library aus Persistenz- und Test-Support-Lesern, die das vollständige First-Party-Inventar veröffentlichter Formate benötigen, bevor irgendein Feature-Plugin mountet. Feature-Kompositionen registrieren oder ordnen seine Einträge nicht um. Es wird kein Runtime-Invarianten-Companion veröffentlicht, weil die Konstruktion ein ungültiges statisches Inventar ablehnt und jede abgeschlossene Wiederherstellung ihr Ergebnis validiert; mutabler Zeilen-Decoder-Zustand gehört zu einer einzelnen caller-owned Streaming-Wiederherstellung.

### Einstiegspunkt

```text
const descriptor = sessionFormatCatalog.readHeader(physicalHeader)
const restore = sessionFormatCatalog.createRestore(physicalHeader, { recovery: 'recoverable', validation: 'transformed' })
for (const row of physicalRows) restore.decodeRow(row)
const current = restore.finish()
const headerRecord = sessionFormatCatalog.encodeCurrentHeader(current.header, current.inheritedEventCount)
const eventRecords = current.events.map(sessionFormatCatalog.encodeCurrentEvent)
```

Importiere `sessionFormatCatalog` aus dem Paket-Root. JSONL- und Fixture-Leser erzeugen eine Wiederherstellung, schieben jede geparste physische Zeile durch `decodeRow()` und rufen `finish()` einmal auf. Writer serialisieren das zurückgegebene aktuelle Artefakt über `encodeCurrentHeader()` und `encodeCurrentEvent()`. Listings rufen `readHeader()` auf und öffnen nie Event-Bodies.

Produktive historische Reads wählen `{ recovery: 'recoverable', validation: 'transformed' }`. Worker- und Fixture-Verifikation wählt `{ recovery: 'strict', validation: 'current' }`. Transformed Validation führt die Released-Current-Regeln nach der Migration aus, überspringt für bereits aktuelle Eingaben aber bewusst die installierte semantische Validierung.

Der Katalog enthält alle unterstützten historischen Leser direkt. Ein Profil kann durch das Mounten eines Feature-Plugins keine Edge hinzufügen, entfernen oder umordnen. Seine Peer-Dependency auf `dsh-session` liefert das installierte aktuelle Event-Vokabular und die aktuellen Wiederherstellungsregeln, während historische Edge-Validatoren eingefroren bleiben.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

[`src/generated.ts`](src/generated.ts) ist der statische Eigentümer der Codec- und Edge-Reihenfolge. [`src/current.ts`](src/current.ts) delegiert die finale Header-, Envelope-, Message-, Surface-, Seed- und Current-Request-Header-Validierung an die installierte Session-Semantik. Der Low-Level-Konstruktor lehnt doppelte Codecs, doppelte Edges, Lücken und Einträge jenseits der aktuellen Version ab, bevor ein Session-Read beginnen kann.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [Migrationsmaschinerie](../session-format/README.de.md) — Katalogkonstruktion und Dispatch-Verhalten.
- [Released-v0-zu-v1-Edge](../session-format-v0-to-v1/README.de.md) — Codec- und Validator-Ownership.
- [Released-v1-zu-v2-Edge](../session-format-v1-to-v2/README.de.md) — Assistant-Stream-Einbettung und kardinalitätsveränderndes Referenz-Remapping.
- [Released-V2-zu-V3-Spezifikation](../session-format-v2-to-v3/README.de.md#v2-to-v3-specification) — Transformationen, Erhaltung und Ablehnung.
- [JSONL-Persistenz](../session-persistence-jsonl/README.de.md) — immutable Generation-Benennung und exklusive Publikation.

-----

<a id="model-experience"></a>
## Model Experience

### Katalog-Dispatch

#### Was das Modell sieht

Nichts direkt. Der Katalog stellt nur die `SessionEvent`-Historie wieder her, die die Request-Rekonstruktion konsumiert.

#### Token-Effekt

Null direkte Tokens.

#### KV-Cache-Effekt

Kein direkter Effekt; die wiederhergestellte Historie bestimmt die Cache-Identität in ihrem Consumer.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>

- **Nur First-Party-Build-Inventar** — externe Migrations-Ownership und -Distribution werden nicht unterstützt.
- **Generierte Reihenfolge ist geschlossen** — eine Runtime-Plugin-Registrierung kann keine fehlende historische Edge liefern.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
