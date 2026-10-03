---
description: "Eingefrorener Released-v0-Session-Header-, Event- und Packed-Row-Decoder mit der identitären Konvertierung zu v1."
kind: "package-library"
---

# @deepseek-ai/dsh-session-format-v0-to-v1
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Dieses Paket stellt Released-v0-Session-JSONL wieder her, indem es jede physikalische Zeile dekodiert und das v1-Format mit gemeinsamem Layout erzeugt. Es erhält validierte Header und Events, abgesehen von der Änderung von Version 0 auf Version 1, und wendet dabei nur die endlichen Legacy-Normalisierungen an, die die v0-Persistenz akzeptiert. Fehlerhafte oder nicht unterstützte historische Datensätze lassen die Migration fehlschlagen, bevor der aktuelle Restorer läuft; die Quelle bleibt zur Wiederherstellung erhalten. Die Migration akzeptiert nur das eingefrorene First-Party-Event-Inventar und publiziert oder wählt keine späteren Format-Migrationen.

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

### Wann es zu verwenden ist

Die Persistenz bezieht diese Edge über `dsh-session-format-catalog`; Feature-Kompositionen mounten sie nicht. Importieren Sie sie nur direkt, wenn Sie den statischen Released-Format-Katalog zusammenbauen oder testen. Es wird kein Runtime-invariant-Begleitexport veröffentlicht, weil das Paket keine unabhängig beobachtbaren Runtime-Registrierungen hat, deren Zustand divergieren kann; Decoder- und Migration-Stage-Zustand gehört zu einer einzigen Wiederherstellung.

### Einstiegspunkt

```text
const decoder = releasedV0SessionFormatCodec.createDecoder(physicalHeader, 'recoverable')
for (const row of physicalRows) decoder.decodeRow(row, migrationContext)
const inheritedEventCount = decoder.finish(migrationContext)
const stage = sessionFormatV0ToV1.createStage(stageInput)
stage.transformEvent(event, migrationContext)
const targetInheritedEventCount = stage.finish(migrationContext)
```

`releasedV0SessionFormatCodec` liest den exakten v0-Header und die physikalischen Zeilen, einschließlich gepackter Assistant-Deltas und bereichskodierter Provenance. Sein Decoder emittiert entweder ein skalares Event oder einen codec-eigenen kompakten Run über `emitEvent()` und `emitRun()`. `sessionFormatV0ToV1` erzeugt eine zustandsbehaftete Stage pro Wiederherstellung; der statische Katalog verbindet diesen Decoder und die Stage, sodass die Migration kein Physical-Row-Array behält. `releasedV1SessionFormatCodec` stellt denselben zeilenweisen Decoder für das v1-Physical-Layout bereit, ohne das gewöhnliche Event-Vokabular einzufrieren.

Die Alpha-Edge lehnt jeden Event-Typ außerhalb ihres eingefrorenen Inventars ab, einschließlich eines unbekannten, mit `ignorable: true` markierten Events. Sie lehnt auch unerwartete Payload-Member ab. `tool/result.meta` und verschachtelte PTC-`arguments` bleiben explizite opake JSON-Felder und werden ohne Session-Sequenz-Interpretation erhalten. Unbekannte content-block-`type`-, message-source-`kind`-, assistant-finish-reason-`kind`- und `turn/end`-reason-`kind`-Arme bleiben owner-opakes JSON, während ihre bekannten Arme strukturelle Validierung erhalten.

Die begrenzten historischen Normalisierer konvertieren `steering/message` zu `user/message`, benennen `compact/*`-Events zu `compaction/*` um, entfernen `turn/start.trigger`, konvertieren eingestellte `turn/end`-Reasons, fügen aktuelle message-Wrapper und deterministische IDs für Legacy-messages, -Retry-Chains und -Compaction-Gruppen hinzu und entfernen das eingestellte `request/header.header.messagePrefix`-Duplikat. Eingestellte `request/header-delta`-, `mode/set`- und `request/header`-Fallback-Reasons lassen die Migration fehlschlagen. Kein anderes Event-, Referenz-, Quell- oder Payload-Faktum darf sich ändern.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Der physikalische Codec validiert jede gepackte Zeile atomar, emittiert sie als kompakten Run und mutiert die geparste Eingabe niemals. Die wiederherstellbare Dekodierung verwirft eine vollständige fehlerhafte Zeile und behält das vorhergehende Präfix, es sei denn, ein später dekodiertes `turn/end` beweist, dass der fehlerhafte Bereich committet war. Der inkrementelle Normalisierer behält nur message-, retry- und offene-compaction-Identitäten; der Katalog führt die vollständige Beziehungsvalidierung auf dem finalen aktuellen Artefakt durch.

| Datei | Rolle |
|---|---|
| [`src/codec.ts`](src/codec.ts) | Eingefrorene v0/v1-Physical-Header, gepackte Zeilen und Provenance-Bereiche |
| [`src/dispositions.ts`](src/dispositions.ts) | Released-v0-Event- und Payload-Member-Inventar |
| [`src/payload-validation.ts`](src/payload-validation.ts) | Eingefrorene verschachtelte Payload-Semantik für jeden Released-v0/v1-Event-Typ |
| [`src/relationships.ts`](src/relationships.ts) | Eingefrorene Event-übergreifende Paarungen: Turns, Steps, Tool-Starts und -Ergebnisse, Retries, Compaction, Titel |
| [`src/migration.ts`](src/migration.ts) | Identitäre Edge und Legacy-Normalisierung |
| [`src/validation.ts`](src/validation.ts) | Exakte Quell- und Zielvalidierung |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [Migrationsmaschinerie](../session-format/README.de.md) — reine Chain- und Codec-Kontrakte.
- [Statischer Katalog](../session-format-catalog/README.de.md) — Build-seitige Assembly.
- [Session-Subsystem](../../../docs/subsystems/session.de.md) — aktuelle logische Session-Semantik.

-----

<a id="model-experience"></a>
## Model Experience

### Historische Wiederherstellung

#### Was das Modell sieht

Nichts direkt. Nach der Wiederherstellung sieht `deriveMessages()` kanonische Released-v0-Events unverändert unter v1; begrenzte historische Formen erzeugen denselben modellsichtbaren Inhalt über ihre definierten aktuellen Wrapper.

#### Token-Effekt

Null direkte Tokens.

#### KV-Cache-Effekt

Kein direkter Effekt für kanonische v0-History. Begrenzte Normalisierer erhalten modellsichtbaren Inhalt, während sie aktuelle Wrapper und deterministische Identitäten erzeugen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Geschlossenes First-Party-Inventar** — unbekannte External-Plugin-Events lassen die Migration unter dieser Alpha-Policy fehlschlagen.
- **Eine benachbarte Edge** — dieses Paket führt keine Publikation durch und wählt keine späteren Migrationen aus.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
