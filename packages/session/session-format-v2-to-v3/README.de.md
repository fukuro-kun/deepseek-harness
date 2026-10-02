---
description: "Die vollständige V2-zu-V3-Session-Konvertierung: System-Heads, auditierte Referenzen, PTC- und Preset-Namen, kanonische Envelopes, Bewahrung und Zurückweisung."
kind: "package-library"
---

# @deepseek-ai/dsh-session-format-v2-to-v3

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Stellt unterstützte released V2 Sessions als V3 wieder her, ohne die Bedeutung historischer Requests zu ändern. Diese Seite ist die einzige Spezifikation für diese benachbarte Kante: was sie transformiert, bewahrt und zurückweist, gefolgt von separater nativer V3-Admission. Die Bibliothek hebt System-Prompts zu Nachrichten, mappt lokale Event-Referenzen um, übersetzt PTC- und Preset-Namen und kanonisiert Envelopes. Persistenz konsumiert sie über den statischen Katalog; die Bibliothek liest oder publiziert keine Dateien.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [V2-zu-V3-Spezifikation](#v2-to-v3-specification)
  - [Header- und Preset-Referenzen](#header-and-presets)
  - [System-Head und Nachrichten-Identitäten](#system-head)
  - [Sequenz-Referenzen und Vererbung](#sequence-references)
  - [PTC-Vokabular](#ptc-vocabulary)
  - [Kanonische Envelopes und Tool-Fehler](#canonical-envelopes)
  - [Delivery-Guards](#delivery-guards)
  - [Quell-Audit und Zurückweisung](#source-audit)
- [Native V3-Admission](#native-v3-admission)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

### Wann Sie es verwenden

Verwenden Sie den [Katalog](../session-format-catalog/README.de.md), um eine Session wiederherzustellen. Direkte Imports dienen der Katalog-Assembly und Tests; diese Bibliothek hat keine Cordis-Mount-Konfiguration. Die [öffentlichen Exports](src/index.ts) stellen die Migration-Deklaration, den released V2-Quell-Codec, den V3-Ziel-Codec, den Ziel-Header-Validator und den Ziel-Restorer bereit.

### Einstiegspunkt

Die Header-only-Operation konvertiert oder validiert keinen Event-Body:

```text
const targetHeader = sessionFormatV2ToV3.migrateHeader(sourceHeader)
```

Die vollständige Wiederherstellung speist dekodierte Events durch eine frische Stage und validiert das Ziel-Artefakt. Aufrufer dürfen partielle Stage-Emissionen nicht als erfolgreiche Wiederherstellung behandeln: Ein Fehler kann bei einem späteren Event oder bei `finish()` auftreten. Das [Format-Protokoll](../session-format/README.de.md) besitzt Stage-Scheduling und Katalog-Fehlerbehandlung; [JSONL-Persistenz](../session-persistence-jsonl/README.de.md) besitzt Lese-Vorbereitung und immutable Nachfolger-Publikation.

-----

<a id="v2-to-v3-specification"></a>
## V2-zu-V3-Spezifikation

Die vollständige Kante ist keine Identitätskonvertierung. Sie bewahrt die relative Reihenfolge und die Zeitstempel der Quell-Events sowie die Bedeutung jedes historischen Requests, aber eingefügte System-Events ändern Event-Anzahl, dichte Sequenzpositionen, lokale Referenzen und ererbte Schnitte. PTC-/Preset-Übersetzung und finale Envelope-Kanonisierung fügen keine Events hinzu. Nur die unten benannten Felder ändern sich; Bewahrung gilt für admitted Input, nicht für beliebige unauditierte Erweiterungen.

<a id="header-and-presets"></a>
### Header- und Preset-Referenzen

Der logische Header ändert `version: 2` zu `version: 3`. Er behält `id`, `createdAt`, `isSeeded`, `delegationDepth` und die admitted optionalen `cwd`, `parentSession` und `origin`. Die exakte Preset-ID `code` wird zu `ptc` in `header.agentPreset` und jedem `agent-preset/selected.data.agentPreset`, einschließlich ererbter und lokaler Auswahlen. Andere Strings und ein fehlendes Header-Preset bleiben unverändert. Selection-Payloads erfordern eine String-Preset-ID und weisen unauditierte Mitglieder zurück.

Diese Konvertierung inspiziert keine installierten Presets und schreibt andere Vorkommen von `code` nicht um. Released V0/V1-Daten erhalten sie erst, nachdem die eingefrorenen vorangehenden Kanten V2 erreichen. Native V3-Custom-Preset-IDs werden nicht umbenannt, und `settings.yaml` liegt außerhalb dieses Pakets.

<a id="system-head"></a>
### System-Head und Nachrichten-Identitäten

Auf das erste `step/start` folgt sofort ein leerer `system/message`-Append, selbst wenn der Step ohne Request abbricht. Spätere Steps erzeugen keinen weiteren Head. Ein Log ohne Step und ohne Surface erhält weder Head noch erfundenen Request.

Bei jedem `request/header` bedeutet ein fehlendes `data.header.system` den leeren Prompt; andernfalls wird sein String exakt mit dem aktuellen Prompt verglichen. Eine Änderung fügt eine System-Nachricht unmittelbar vor diesem Request-Header ein, ersetzt exakt den aktuellen geschützten Head und zitiert ihn in `sourceEventSeqs`. Ein unveränderter Prompt fügt nichts ein. Leere Strings und fehlende Felder räumen einen früheren Prompt ab; nur-whitespace Strings bleiben nicht-leerer Text. Jeder Request-Header verliert `data.header.system`, unabhängig davon, ob eine Ersetzung nötig war.

Synthetische Nachrichten tragen `turn` und `step` des offenen Steps, `time` des Anchor-Events, Rolle `system` und die Quelle `{ kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' }`. Leere Prompts verwenden `content: []`; andere Prompts verwenden einen Textblock mit dem exakten String. Der erste Append hat keine Provenienz; jede Ersetzung verwendet die Ziel-Sequenz des vorangehenden Heads für beide Endpunkte und ihre einzige Quell-Referenz. Leere Heads behalten den Schutz, erzeugen aber keine Modell-Nachricht.

Jede synthetische ID ist `v2-to-v3-system-` gefolgt vom hexadezimalen SHA-256 von `JSON.stringify(['session-format-v2-to-v3', sourceHeader.id, anchor.seq, anchor.type])`. Der Anchor ist das Quell-`step/start` für die initiale Erstellung oder das geänderte `request/header` für die Ersetzung. Kollisionen mit generierten oder Quell-Nachrichten-IDs werden in beiden Begegnungsreihenfolgen zurückgewiesen, einschließlich IDs in Inbox-Einfügungen und Title-Request-Nachrichten. Bestehende Nachrichten-IDs ändern sich nie. Insbesondere behält eine `TOOL_NOT_STARTED`-Repair-ID ihr kanonisches historisches `interrupted-tool-result-<callId>-<integer>`-Suffix; dieses Suffix ist keine Ziel-Sequenz-Koordinate.

<a id="sequence-references"></a>
### Sequenz-Referenzen und Vererbung

Quell-Events müssen ab null dicht sein. Jedes Original-Event erhält seine Zielposition nach jeder vorangehenden Einfügung. Der [Referenz-Mapper](src/references.ts) ändert nur diese Same-Artifact-Referenzen; jede referenzierte Quellposition muss ein früheres Event mit etabliertem Mapping benennen:

| Owner | Umgemappte Felder |
|---|---|
| Surface-Envelope | `sourceEventSeqs[]`; `surfaceOp.start/end` vor ihrer kanonischen Umbenennung |
| `command/done.data` | `sourceEventSeq`, wenn vorhanden |
| `compaction/summary.data` und `compaction/prune.data` | `shadowedRange.start/end` und `shadowedSeqs[]` |
| `session/title.data` und `session/title-llm-request.data` | `messageSeqs[]` |

Es gibt kein rekursives Numeric-Field-Rewrite. Delivery-`throughSeq` und `sessionFormatVersion`, Session-Referenz-`capturedThroughSeq` und `capturedFormatVersion`, Workflow-lokale `seq`, Stream-Block-Indizes, Turn-/Step-Nummern, Inbox-Indizes, Token-/Byte-Zählungen und alle IDs behalten ihre Quellwerte. Eingebettete Assistant-Streams, Modell-Replay-Zustand, Tool-Argumente/-Ergebnisse, Title-Request-Input-Text und `data.system` behalten ihre aufgezeichnete Bedeutung. Compaction-Payload-Endpunkte behalten die Namen `start/end`; nur Envelope-Ersetzungsendpunkte werden umbenannt.

Für eine geseedete Session identifiziert das letzte `session/end-seed` mit `data.inherited: true` den Quell-Schnitt. Seine Quell-Sequenz ist die ererbte Event-Anzahl ohne diesen Marker; seine gemappte Ziel-Sequenz ist der Ziel-Schnitt. Synthetische Events davor sind ererbt, spätere sind lokal. Ein ungetaggter Marker etabliert den Schnitt nicht. Ein geliefertes `sourceInheritedEventCount` muss übereinstimmen; ein geseedetes Log ohne Marker und ein ungeseedetes Log mit einem werden zurückgewiesen. Ungeseedete Stages exponieren `headerInheritedEventCount: 0`; geseedete Stages lassen es unbekannt, bis `finish()` den exakten Schnitt ableitet. Dies unterstützt auch V0/V1-Ketten, deren vorangehende Stage die Event-Anzahl ändert und den Schnitt vor EOF nicht liefern kann.

<a id="ptc-vocabulary"></a>
### PTC-Vokabular

Die exakten Event-Tags `tool/code-dispatch-start` und `tool/code-dispatch` werden zu `tool/ptc-dispatch-start` und `tool/ptc-dispatch`. Ihre Payloads behalten ihre Werte. Plugin-Attribution ändert sich von exakt `tools-code-mode` zu `tools-ptc` nur wenn `source.kind === 'plugin'` in diesen drei Slots:

- `user/message.data.source.plugin`
- `agent/inbox/spliced.data.inserted[].source.plugin`
- `session/title-llm-request.data.messages[].source.plugin`

Ähnliche Plugin-Namen, andere Source-Kinds, beliebiger Text, verschachteltes JSON und historische IDs einschließlich `:code:` bleiben unverändert. Dies benennt `run_code` oder sein `code`-Argument nicht um. V2-Quell-Events, die bereits einen der reservierten V3-PTC-Tags verwenden, werden zurückgewiesen, selbst wenn sie ignorable sind; eine opake Quell-Erweiterung darf durch Migration keine aktuelle Lifecycle-Bedeutung erlangen.

<a id="canonical-envelopes"></a>
### Kanonische Envelopes und Tool-Fehler

Nach struktureller Einfügung und Referenz-Ummapping konvertiert die Kanonisierung exakte Envelope-Ersetzungen `{ op: 'replace', start, end }` zu `{ op: 'replace', startSeq, endSeq }` auf Original- und synthetischen Events. Sie lässt exakt `tools: []` und `adapterDefaults: {}` aus `request/header.data.header` weg. Diese finale Operation bewahrt ihre Input-Event-Anzahl, Koordinaten, Zeitstempel, Reihenfolge und ererbten Schnitt; sie mappt weder doppelt um noch normalisiert sie unverwandte leere Werte wie `config.stop: []`.

Alle vier V3-Surface-Typen (`system/message`, `user/message`, `assistant/message`, `tool/result`) erfordern `surfaceOp`. Assistant-Nachrichten allein verbieten `sourceEventSeqs`; für die anderen muss eine gelieferte Liste nicht-leer, eindeutig und nur auf frühere Events verweisend sein. Bekannte Log-only-Events erlauben keines der beiden Surface-Metadaten-Felder. Ersetzungen erlauben keine Aliase oder Extra-Keys. Ihre Endpunkte identifizieren eine inklusive Spanne in aktueller Surface-Reihenfolge, nicht in numerischer Sequenzreihenfolge; die Wiederherstellung prüft Live-Mitgliedschaft, Endpunktreihenfolge und vollständige Provenienz-Abdeckung.

Quell-Surface-Events erfordern bereits Placement; die Migration erfindet keine fehlenden Append-Marker. Ein `tool/result` mit `data.error` erfordert, dass sein einzelner Tool-Result-Block `isError: true` trägt. Fehlgeschlagene Ergebnisse dürfen strukturierte Fehler-Identität weglassen. Widersprüchliche Ergebnisse werden zurückgewiesen, niemals durch Hinzufügen von `isError` oder Löschen von Diagnosen repariert. Gewöhnliche Tool- und PTC-Lifecycle-Beziehungen erfordern weiterhin Validierung nach diesen event-lokalen Checks.

<a id="delivery-guards"></a>
### Delivery-Guards

Ein V2-`session-log-deepseek/delivery-accepted` mit `data.sessionFormatVersion === 3` wird zurückgewiesen, nicht zu einer V3-Upload-Wassermarke befördert. Marker für andere Generationen behalten ihre Payloads, einschließlich einer fehlenden Generation und zukünftiger Nicht-Ziel-Generationen. Ein V2-Generations-Marker muss eine gültige frühere `throughSeq` haben; benennt er eine andere Session, ist er nur im ererbten Präfix einer Session mit `parentSession` erlaubt. Ein fremder lokaler Marker oder einer ohne Parent-Metadaten wird zurückgewiesen. Die Envelope-Sequenz des Markers ändert sich normal; seine erfassten Acceptance-Koordinaten nicht.

<a id="source-audit"></a>
### Quell-Audit und Zurückweisung

Die Migration klassifiziert das [released V2-Event-Inventar](../session-format-v1-to-v2/src/dispositions.ts), einschließlich des Log-only `assistant/attempt`, plus `feedback/message-put` und `feedback/message-delete`. Der [Payload-Validator](src/payload.ts) wendet exakte admitted Envelope- und Payload-Mitglieder und released Nested-Validierung an. Unbekannte Events, selbst ignorable, und unauditierte Mitglieder an geprüften Records werden zurückgewiesen. Die Message-Source-Klassifizierung deckt die fünf Message-Slots unten ab: Unbekannte Source-Kinds werden zurückgewiesen, während Agent-Relay-Attribution admitted ist, ohne IDs als Session-Referenzen zu interpretieren.

Das Content-Audit lässt exakt `text`, `reasoning`, `image`, `file`, `tool-call` und `tool-result` zu. Es validiert eigene Block-Felder und auditiert rekursiv jedes verschachtelte `tool-result.content` in dieser endlichen Menge von Positionen:

| Owner | Auditiertes Content |
|---|---|
| Fünf Message-Slots | `user/message.data.content`; `assistant/message.data.message.content`; `tool/result.data.message.content`; `agent/inbox/spliced.data.inserted[].content`; `session/title-llm-request.data.messages[].content` |
| Gequeuete Team-Nachricht | `team/message/queued.data.message.content`; das historische Team-Payload bleibt `version: 1` mit `message.delivery` |
| Compaction-Output | `compaction/summary.data.summary` und optional `compaction/summary.data.rawOutput` |
| PTC-Vorgänger-Output | `tool/code-dispatch.data.content` |
| Eingebettete Assistant-Streams | In `assistant/message.data.stream[]` und `assistant/attempt.data.stream[]`, rohe `type: 'chunk'`-Records: `chunk.block` für `block-end` und `chunk.blockType` für `block-start`, einschließlich Starts ohne vollendeten Block |

Alle Positionen verwenden dieselbe historische Kind-Menge; ein partieller Start kann kein unbekanntes Kind einführen. Unbekannte Kinds und malformed eigene Blöcke weisen die gesamte Migration zurück; die Katalog-Wiederherstellung meldet `SessionFormatUnsupportedMigrationError`. Die Diagnose identifiziert den Quell-Event-Typ, die Quell-Sequenz, den vollständig indizierten Payload-Pfad und die verletzte Regel. Unknown-Kind-Fehler benennen das verletzende Kind; malformed-Known-Block-Fehler benennen Kind und Feldfehler. Ein malformed Content-Container oder fehlender Block meldet seine Position, ohne ein Kind zu erfinden. Bei Zurückweisung lässt die Persistenz die Quell-Bytes unverändert und publiziert keinen Nachfolger.

Admission schreibt Content nicht um. Insbesondere bleiben eingebettete Stream-Bytes erhalten, obwohl ihre eigenen Block-Felder inspiziert werden. Tool-Argumente, `replayState.response` und `replayState.blocks` bleiben opak; übereinstimmende Feldnamen in beliebigem JSON triggern dieses Audit nicht. File-Attachment-Metadaten werden validiert, ohne IDs oder Byte-Zählungen als Session-Referenzen zu interpretieren. Dies ist kein allgemeines Schema-Audit und keine rekursive Koordinaten-Inferenz, und native V3-Extension-Acceptance ist separat.

Ein Surface-Event vor dem ersten Step, ein geänderter Prompt außerhalb eines offenen Steps oder eine Generated-ID-Kollision wirft `SessionFormatUnsupportedMigrationError`, statt Events zu verschieben oder Eigentümerschaft zu erfinden. Malformed Quell-Felder, fehlendes Placement, ungültige Referenzen, inkonsistente Schnitte, Delivery-Verletzungen und widersprüchliche Tool-Ergebnisse werfen Format-Fehler in der direkten Stage oder dem Ziel-Validator. Der Katalog meldet Migration-Stage- und transformierte-Ziel-Validierungsfehler als typisierte Unsupported-Migration; physische Dekodierungsfehler bleiben Corruption unter seiner gewählten Recovery-Policy. Diese Kante führt keine Quell- oder Ziel-Reparatur, keinen Generations-Fallback und kein File-Rewrite durch.

-----

<a id="native-v3-admission"></a>
## Native V3-Admission

Input, der bereits als V3 markiert ist, läuft nicht durch V2-zu-V3. Native Katalog-Lesungen mit `validation: 'transformed'` wenden nur Codec-Checks an und überspringen Artefakt-Wiederherstellung; vollständige Beziehungen, Open-Step-Eigentümerschaft, Protected-Head-Operationen und Vokabular-Checks erfordern `restoreReleasedV3Artifact` oder Katalog-`validation: 'current'`. Die folgenden Regeln unterscheiden diese Wiederherstellungs-Checks von der Codec-Admission; sie sind keine zusätzlichen historischen Transformationen:

- Native V3 lässt In-History-System-Appends, Nicht-Head-System-Ersetzungen und Compaction von Nicht-Head-System-Knoten zu. System-Nachrichten erfordern gültige Payloads und passende Open-Step-Eigentümerschaft. Der erste Surface-System-Head kann nur durch eine System-Nachricht ersetzt werden, die exakt diesen Head abdeckt; gewöhnliche Ersetzungen und Compaction können ihn nicht konsumieren. Die Migration selbst erzeugt nur den initialen Head und Head-Ersetzungen, keine route-abhängigen In-History-Updates.
- Native V3 weist jedes `request/header.data.header.system` zurück, selbst leere oder malformed, und weist nichtkanonische Ersetzungsschreibweisen und die zwei leeren Header-Optionals zurück. Sie bewahrt Whitespace-Content, leere Stop-Listen und admitted verschachtelte Header/Source/Data-Erweiterungen. Diese Extension-Admission erweitert weder das V2-Quell-Audit noch die exakten logischen Session-Header-Felder.
- Erforderliche Vorgänger-PTC-Tags werden zurückgewiesen, selbst wenn installiert. Obsolete oder unbekannte ignorable Events bleiben opak, einschließlich ihrer logischen Metadaten, und können aktuelle PTC-Beziehungen nicht erfüllen. Installierte gewöhnliche Event-Erweiterungen werden als Log-only-Envelopes admitted; unbekannte erforderliche Typen werden von vokabular-bewusster Wiederherstellung zurückgewiesen. Der physische Codec erzwingt weiterhin released Framing und Provenienz-Encoding.
- V3-Event-lokale Checks laufen vor dem Encoding und nach dem Decoding. Rohe Retired-System-Header-, Malformed-System-Payload- und Required-Predecessor-PTC-Zurückweisungen laufen vor der recoverable Suppression, einschließlich nach korrupten Zeilen. Strikte Lesungen weisen kanonische Fehler sofort zurück. Recoverable kanonische Dekodierung hält das erste ungültige Event und sein Suffix zurück; ein späteres `turn/end` etabliert einen Commit und weist dieses Suffix zurück. Nur akzeptierte Inherited-Marker zählen; ein geseedetes akzeptiertes Präfix ohne einen wird zurückgewiesen. Unklassifizierte Event-Metadaten werden an die vokabular-bewusste Wiederherstellung verschoben statt als kanonische Corruption verworfen zu werden, sodass sie keinen unbekannten erforderlichen Typ verbergen können.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Die [Stage](src/migration.ts) besitzt synchrone Per-Artefakt-Sequenz-Maps, Nachrichten-Identitäts-Mengen und Prompt-/Lifecycle-Zustand. Kompakte Runs expandieren inkrementell. Der [Codec](src/codec.ts) verwendet eingefrorenes V2-Framing wieder; der [Restorer](src/validation.ts) validiert V3-Struktur, bevor er der eingefrorenen gewöhnlichen Beziehungs-Validierung eine private System-/PTC-/Repair-ID- und Endpunkt-Sicht gibt. Diese Sicht behält die tatsächliche Ziel-Generation für Delivery-Checks und entkommt nie: Die Wiederherstellung gibt das originale V3-Artefakt und die Identitäten zurück. Eingefrorene V0-zu-V1- und V1-zu-V2-Semantik bleibt unverändert. Es wird kein Runtime-Invarianten-Begleiter veröffentlicht, weil diese Bibliothek keine unabhängig beobachtbaren Registrierungen oder Zustandsrepliken besitzt.

[Kombinierte Katalog-Tests](tests/combined-migration.spec.ts) üben Transformations-Komposition und natives Reopen; [Migrations-Tests](tests/migration.spec.ts) und [kanonische Tests](tests/canonical-envelopes.spec.ts) pinnen Bewahrung und Zurückweisung. [Persistenz-Integration](../session-persistence-jsonl/tests/v2-ptc-migration.spec.ts) besitzt den Publikations-Nachweis. Die [Released-Format-Entscheidung](../../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.de.md) besitzt die Begründung dafür, benachbarte Komposition separat von nativer Admission zu testen.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [Released V1 zu V2](../session-format-v1-to-v2/README.de.md) — eingefrorene vorangehende Konvertierung und Quell-Codec.
- [System-Prompt-Surface-Entscheidung](../../../.agents/notes/implemented/architecture/2026-09-02-system-prompt-as-surface-node.de.md) — Prompt-Eigentümerschaft und Protected-Head-Begründung.
- [Canonical-V3-Envelope-Entscheidung](../../../.agents/notes/implemented/architecture/2026-09-06-v3-canonical-session-envelopes.de.md) — strikte Acceptance und Validierungs-Eigentümerschaft.

-----

<a id="model-experience"></a>
## Model Experience

### Historische Wiederherstellung

#### Was das Modell sieht

Jeder historische Request behält seinen Prompt-Text und gewöhnlichen Nachrichten-Content. Leere System-Heads erzeugen keine Modell-Nachricht. PTC-Attribution verwendet `tools-ptc`; Dispatch-Events bleiben Log-only.

#### Token-Effekt

Die Kante fügt keinen modellsichtbaren Text hinzu; sie verschiebt den aufgezeichneten Prompt vom Request-Header in die Nachrichten-Historie.

#### KV-Cache-Effekt

Die Kante bewahrt historische Request-Bedeutung und Modell-Konfiguration; sie garantiert weder Provider-Cache-Treffer noch byte-identische native V3-Aufzeichnungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Historische Preset-Mehrdeutigkeit** — released `code`-Referenzen können ein Custom-Preset mit der Legacy-Built-in-ID nicht unterscheiden; die [exakte Umbenennung](#header-and-presets) ist Host-unabhängig.
- **Keine Datei- oder Settings-Migration** — dieses Paket ändert niemals committed Generationen oder `settings.yaml`. Persistenz besitzt die Publikation des finalen Nachfolgers; eine bestehende V3-Generation wiederholt ihre eingehende Kante nicht. Siehe [Format-Release-Status](../../../docs/session-format-status.de.md) und die Kompatibilitäts-Verpflichtungen in der [Released-Format-Policy](../../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.de.md).

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
