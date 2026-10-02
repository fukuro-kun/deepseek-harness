---
description: "Eingefrorener Released-v1-Session-Reader und kardinalitätsändernde Migration, die Assistant-Streams in Released-v2-Events einbettet."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-format-v1-to-v2

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-session-format-v1-to-v2` konvertiert eine Released-v1-Session über eine zustandsbehaftete Event-Stage in das Released-v2-Event-Modell. Es konsumiert Top-Level-`assistant/chunk`-Events, bettet deren exakten getimten Stream in die passende `assistant/message` ein und zeichnet ein `assistant/attempt` auf, wenn ein fehlgeschlagener, wiederholter, abgebrochener oder Stream-Error-Attempt die Settlement ohne surface message erreichte. Die Edge remapt überlebende Events und jede deklarierte gleiche-Session-Sequenzreferenz dicht, während der v2-Codec ein Event pro Zeile speichert und den geerbten Cut aus einem getaggten `session/end-seed`-Marker ableitet.

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

Die Persistenz bezieht diese Edge über `dsh-session-format-catalog`; Feature-Kompositionen mounten sie nicht. Importieren Sie sie nur direkt, wenn Sie den statischen Released-Format-Katalog zusammenbauen oder testen oder die exakte v1-zu-v2-Transformation inspizieren. Es wird kein Runtime-invariant-Begleitexport veröffentlicht, weil das Paket keine unabhängig beobachtbaren Runtime-Registrierungen hat, deren Zustand divergieren kann; Decoder- und Transformer-Zustand gehört zu einer einzigen Wiederherstellung.

### Einstiegspunkt

```text
const decoder = releasedV1SessionFormatCodec.createDecoder(physicalHeader, 'strict')
for (const row of physicalRows) decoder.decodeRow(row, migrationContext)
const stage = sessionFormatV1ToV2.createStage(stageInput)
stage.transformEvent(event, migrationContext)
const targetInheritedEventCount = stage.finish(migrationContext)
const headerRecord = releasedV2SessionFormatCodec.encodeHeader(currentHeader, targetInheritedEventCount)
const eventRecord = releasedV2SessionFormatCodec.encodeEvent(currentEvent)
```

`releasedV1SessionFormatCodec` liest die eingefrorene v1-Physical-Language Zeile für Zeile. `sessionFormatV1ToV2` erzeugt die kardinalitätsändernde Stage, die der statische Katalog mit diesem Decoder verbindet, ohne ein v1-Event-Array zu behalten. Der Katalog remapt deklarierte Referenzen und validiert den Released-v2-envelope, den geerbten Cut, die Event-Zulassung und die Beziehungen. Die Persistenz wendet die vollständige Installed-Current-Validierung in ihrem Worker vor der Publikation an. `releasedV2SessionFormatCodec` erzeugt einen Released-v2-Zeilendecoder und kodiert v2-Header und -Events Datensatz für Datensatz.

Eine erfolgreiche v1-`assistant/message` muss ihren vollständigen geordneten Attempt zitieren. Die Migration entfernt die zitierten Top-Level-chunks und die veraltete message provenance, kompaktiert die chunks ohne token-Grenzen zu verbinden und speichert den Stream auf dieser message. Ein nicht beanspruchter Attempt wird an seiner finalen chunk-Position ein log-only-`assistant/attempt`. Unverwandte verschachtelte Events behalten ihre relative Reihenfolge.

Die Edge schließt außerdem das begrenzte Legacy-Restart-Muster, in dem auf eine nicht-leere `next-turn`-inbox-Einfügung der nächste `turn/start` ohne das vorherige `turn/end` folgt. Sie zeichnet diesen vorherigen Turn als interrupted auf. Eine Legacy-Round-Zero-goal-Mutation wird zu einem `goal/change`, gefolgt von der ursprünglichen modellsichtbaren message mit gewöhnlicher Plugin-Attribution, sodass sowohl der durable goal-Zustand als auch die historische Modelleingabe überleben.

Die Migration lehnt eine Referenz auf einen konsumierten chunk ab, statt sie auf ein semantisch anderes Event umzuleiten. Sie remapt deklarierte Event-Provenance, surface-Ersetzungen, command-Quellevents, compaction-Bereiche und -Listen sowie Titel-message-Listen. Der bereits modellsichtbare `session/title-llm-request.messages`-Text bleibt nach der Quellvalidierung byte-identisch, sodass die Zielvalidierung die in diesem prompt eingebetteten alten Sequenznummern nicht neu interpretiert. Eine geseedete Quelle lehnt außerdem einen geerbten Cut ab, der einen Assistant-Attempt teilt; das Ziel markiert den exakten Cut mit `session/end-seed { inherited: true }`.

Der v2-Physical-Header erfordert `isSeeded` und speichert keinen numerischen Cut. Der Codec leitet den Cut aus dem letzten geerbten end-seed-Marker ab, schreibt ein Event pro Zeile, bereichskodiert nur `sourceEventSeqs` und bleibt neutral gegenüber gewöhnlichem Event-Vokabular und Payload-Wachstum. Die Released-Current-Wiederherstellung lässt Event-Typen zu, die dem installierten Session-Paket bekannt sind, plus unbekannte Events mit `ignorable: true`, und validiert Event-Members und Beziehungen. Die gewöhnliche Session-Wiederherstellung prüft runtime-erforderliche Settlement-Felder, ohne eingebettete Streams abzuspielen; die Persistenz-Publikation und der eingefrorene Writer-Image-fixture-Validator behalten die vollständige Stream-Verifikation.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Die inkrementelle Edge behält einen unabgerechneten Assistant-Attempt, Events, deren Ausgabeposition von diesem Attempt abhängt, und die dichte Alt-zu-Neu-Sequenzmap. Sie emittiert abgerechnete Überlebende in Quellreihenfolge und schreibt nur Referenzfelder neu, die das eingefrorene Event-Inventar deklariert. Die Released-Current-Validierung lehnt jede Beziehung ab, die die Transformation nicht erhalten kann.

| Datei | Rolle |
|---|---|
| [`src/migration.ts`](src/migration.ts) | Attempt-Gruppierung, Settlement-Substitution, dichte Sequenzabbildung und Referenz-Neuschreibung |
| [`src/codec.ts`](src/codec.ts) | Released-v2-Header, Ein-Event-pro-Zeile-Kodierung, Provenance-Bereiche und wiederherstellbare Präfix-Dekodierung |
| [`src/validation.ts`](src/validation.ts) | Physical-v2-envelope-/-Cut-Validierung sowie Released-Current-Event-Zulassung und -Beziehungen |
| [`src/dispositions.ts`](src/dispositions.ts) | Eingefrorenes Released-v2-Event- und Payload-Member-Inventar |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [Released-v0-zu-v1-Edge](../session-format-v0-to-v1/README.de.md) — der hier wiederverwendete Quell-Codec und das eingefrorene historische Vokabular.
- [Statischer Katalog](../session-format-catalog/README.de.md) — Build-seitige Codec- und Migrations-Reihenfolge.
- [Session-Persistenz-Subsystem](../../../docs/subsystems/persistence.de.md) — immutable Generationsauswahl und -Publikation.
- [Embedded-Assistant-Stream-Entscheidung](../../../.agents/notes/implemented/architecture/2026-09-01-v2-embedded-assistant-streams.de.md) — Begründung, Alternativen und Konsequenzen.

-----

<a id="model-experience"></a>
## Model Experience

### Historische Wiederherstellung

#### Was das Modell sieht

Erfolgreiche Assistant-messages behalten den aus demselben v1-Stream zusammengesetzten Inhalt, Provider, das Modell, usage und den Replay-Zustand. Fehlgeschlagene oder abgebrochene Attempts bleiben über `assistant/attempt` durable Diagnostik, gehen aber nicht in `deriveMessages()` ein.

#### Token-Effekt

Die Migration fügt keinen modellsichtbaren Inhalt hinzu. Sie erhält die abgeleitete message-History und entfernt nur Top-Level-chunk-envelopes aus der aktuellen logischen Eventsequenz.

#### KV-Cache-Effekt

Die wiederhergestellte Modell-message-Sequenz bleibt unverändert, sodass die Migration allein die Cache-Identität des Anfrage-Präfixes nicht ändert.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Geschlossenes First-Party-Quellinventar** — ein unbekanntes v1-Event lässt die Migration fehlschlagen, einschließlich eines mit `ignorable: true` markierten Events.
- **Linearer Remap-Zustand** — das Streaming behält kein vollständiges v1-Event-Array, aber das finale v2-Event-Array und die Alt-zu-Neu-Sequenzmap bleiben O(Event-Anzahl).
- **Keine Publikations- oder Kompatibilitäts-Fallback** — die Persistenz besitzt die exklusive Successor-Publikation, und aufbewahrte v1-Generationen sind keine automatischen Downgrade- oder Restore-Eingaben.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
