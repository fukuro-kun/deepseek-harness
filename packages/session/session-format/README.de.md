---
description: "Reine Planung benachbarter Session-Formate, verlustfreie JSON-Wertprüfungen, reine Header-Migration und physische Codec-Dispatch."
kind: "package-library"
---

# @deepseek-ai/dsh-session-format
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-session-format` ermöglicht Persistenzcode, eine aktuelle Session direkt wiederherzustellen oder eine eindeutige Sequenz benachbarter Migrationen zu komponieren, während physische Zeilen nur einmal konsumiert werden. Ein Restore überführt vom Aufrufer bereitgestellte geparste Werte durch zustandsbehaftete Stages, ohne Kopien oder Einfrieren von Zwischen-Artifacts. Physisches Framing, Kompression, unveränderliche Generation-Benennung, exklusive Publikation und das Cordis-Lifecycle-Verhalten liegen außerhalb dieser Bibliothek.

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

### Wann es verwenden

Verwende diese Bibliothek in Persistenz- oder Format-Katalog-Code, der einen physischen Session-Header klassifizieren, aktuelle logische Werte wiederherstellen oder veröffentlichte benachbarte Migrationen komponieren muss. Sie ist kein Cordis-Plugin und hat keine Profile-Mount-Zeile. Es wird kein Runtime-Invariant-Companion veröffentlicht, da jede abgeschlossene Operation ihr Ergebnis validiert; Decoder- und Transformer-Zustand gehört zu genau einem unvollendeten Streaming-Restore und wird nie über Restores hinweg geteilt.

### Einstiegspunkt

```text
const catalog = createSessionFormatCatalog({ currentVersion, codecs, currentEncoder, migrations, restoreCurrent, restoreTransformedCurrent, restoreCurrentHeader })
const descriptor = catalog.readHeader(physicalHeader)
const restore = catalog.createRestore(physicalHeader, { recovery: 'recoverable', validation: 'transformed' })
for (const row of physicalRows) restore.decodeRow(row)
const current = restore.finish()
const headerRecord = catalog.encodeCurrentHeader(current.header, current.inheritedEventCount)
const eventRecords = current.events.map(catalog.encodeCurrentEvent)
```

`createSessionFormatCatalog()` akzeptiert einen eingefrorenen Codec pro unterstützter Version, den aktuellen Record-Encoder, eine Migration pro benachbartem Versionspaar sowie Restorer für aktuelles Artifact und Header. `readHeader()` gibt einen `current`-, `migration-required`-, `unsupported`- oder `malformed`-Deskriptor zurück, ohne Events zu lesen. Body-Reader erstellen einen Restore, schieben jede geparste physische Zeile durch `decodeRow()` und rufen einmal `finish()` für ein aktuelles Artifact auf. Writer kodieren dessen Header und Events Record für Record.

Die Option `recovery` wählt zwischen strikter Zeilenfehlerbehandlung oder behandelbarem Suffix-Handling. `validation: 'current'` wendet die gesamte installierte Current-Format-Validierung an. `validation: 'transformed'` wendet nach historischer Migration die veröffentlichte Current-Format-Validierung an, während bereits aktuelle Eingabe nur die physische Validierung ihres Codecs erhält.

Der wiederherstellbare Decoder gibt das akzeptierte logische Präfix zurück. Ein Codec darf eine fehlerhafte oder in der Sequenz lückenhafte Zeile samt ihres nicht committeten Suffix verwerfen, doch ein später dekodiertes `turn/end` macht das ursprüngliche Problem fatal.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Die Kette validiert bei der Konstruktion eine eindeutige, lückenlose Reihenfolge. Ein Quell-Cut kann bis zum EOF unbekannt bleiben; Stages, die einen Header-Cut benötigen, lehnen dessen Fehlen ab, während markerbasierte Stages ihn aus emittierten Events ableiten. Jede Stage gibt bei `finish()` ihren exakten Ziel-Cut zurück, und jeder vordeklarierte Cut muss übereinstimmen. Der Katalog komponiert einen Zeilen-Decoder mit zustandsbehafteten benachbarten Event-Transformern, behält nur deren begrenzten Zustand und die finalen aktuellen Events zurück und führt die Ziel-Validierung bei `finish()` aus; nur der Aufrufer entscheidet, ob und wie dieses Ergebnis publiziert wird.

| Datei | Rolle |
|---|---|
| [`src/chain.ts`](src/chain.ts) | Konstruktion des benachbarten Plans und Current-Bypass |
| [`src/catalog.ts`](src/catalog.ts) | Physische Versions-Dispatch und Header-Klassifizierung |
| [`src/json.ts`](src/json.ts) | Abgelöste verlustfreie JSON-Snapshots und gemeinsame Koordinaten-Checks |
| [`src/filename.ts`](src/filename.ts) | Kanonischer `session[.vN].jsonl`-Basisname, gemeinsam genutzt von Persistenz, Export und Fixtures |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [Veröffentlichte v0-zu-v1-Kante](../session-format-v0-to-v1/README.de.md) — eingefrorene historische Dekodierung und Identitätskonvertierung.
- [Statischer Katalog](../session-format-catalog/README.de.md) — First-Party-Codec- und Migrations-Assembly.
- [JSONL-Persistenz](../session-persistence-jsonl/README.de.md) — durable Framing und Generation-Publikation.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

### Session-Wiederherstellung

#### Was das Modell sieht

Nichts direkt. Consumers rekonstruieren die Modell-Historie aus dem validierten aktuellen Artifact über `deriveMessages()`.

#### Token-Effekt

Null direkte Tokens.

#### KV-Cache-Effekt

Kein direkter Effekt. Eine Migration, die die aktuelle Historie verändert, kann die Cache-Identität ändern, die der Request-Rekonstruktion gehört.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>

- **Die finale aktuelle Historie bleibt resident** — Streaming behält nur begrenzten Zwischenzustand zurück, aber das zurückgegebene aktuelle Event-Array und jede benötigte Sequenz-Remap-Tabelle bleiben O(Event-Anzahl).
- **Nur benachbarte Ganzzahl-Versionen** — die Bibliothek exponiert keine Spans, keine stabilen Event-Identitäten und keine allgemeine Referenz-Rewrite-Algebra.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
