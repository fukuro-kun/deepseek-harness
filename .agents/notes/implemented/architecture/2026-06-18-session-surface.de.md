# Agent Note: Session surface — eine geordnete Projektion über das Event-Log
[English](2026-06-18-session-surface.md) | [中文](2026-06-18-session-surface.zh.md) | Deutsch

Status: implemented


## Problem

Das Event-Log ist autoritativ, aber die Historien-Manipulation hatte keinen durable, geteilten Mechanismus. Ohne einen würden plugins wie compaction abgeleitete requests über reihenfolge-sensitive listener umschreiben, ohne festzuhalten, welche events jede Ersetzung verwendet hat. Jede neue Historien-Manipulation würde auch Änderungen an `deriveMessages()` erfordern.

## Entscheidung

Ein **surface** hinzufügen — eine abgeleitete, gecachte Reihenfolge von Event-Sequenzen (die Teilmenge der events, die LLM-messages erzeugen) —, die durch `surfaceOp`-marker im Event-Log gepflegt wird.

### Top-Level-surface-Metadaten auf `SessionEvent`

Surface-Metadaten gehören nur zu den vier surface-event-Typen (`system/message`, `user/message`, `assistant/message`, `tool/result`):

- **`sourceEventSeqs?: SessionSeq[]`** — seq-Nummern früherer events, die als Quellen zitiert werden, etwa ein `tool/call`, den sein result zitiert, oder surface-Node, die von einem compaction-marker verdeckt sind. Eine vorhandene Liste ist nicht leer, eindeutig, früher und bekannt. `assistant/message` embedet seinen provider stream und kann dieses Feld nicht tragen. Ohne zitierte seqs kann replay nicht validieren, dass eine replace-range-Operation jedes entfernte event benennt.
- **`surfaceOp: SurfaceOp`** — obligatorische Platzierung für jedes surface event. Bekannte log-only-events verbieten beide Metadatenfelder; native unbekannte oder obsolete ignorable envelopes bleiben opak.

### SurfaceOp: zwei operationen

Die [an der Quelle verankerte `SurfaceOp`-Referenz](../../../../docs/subsystems/session.de.md#surface-types) definiert die exakte Union. Replacement-Objekte enthalten nur `op`, `startSeq` und `endSeq`; Endpunkte verwenden das `SessionSeq`-brand.

1. **Append** — das neue event seq ans Ende anhängen. Verwendet von `system/message`, `user/message`, `assistant/message`, `tool/result`. Der loop übergibt bei allen solchen Appends `surfaceOp: 'append'` und hält `sourceEventSeqs` fest, wo anwendbar: `tool/result` hält seine `tool/call`-Quelle fest, während `assistant/message` seinen eingebetteten stream direkt besitzt.

2. **Replace** — Einträge von `startSeq` bis `endSeq` (beide inklusive) entfernen und das neue event seq an deren Stelle einfügen. Sowohl `startSeq` als auch `endSeq` müssen im aktuellen surface vorhanden sein; `startSeq === endSeq` ersetzt einen Eintrag. Die `sourceEventSeqs` des events müssen jede verdeckte surface seq enthalten. Die verdeckten events bleiben im Log, sind aber nicht mehr auf dem surface.

### SurfaceManager: delta-basiert, kein kompletter Rebuild

Eine `Session` besitzt einen `SurfaceManager`, der eine geordnete `SessionSeq[]` von event-seqs pflegt. Der manager validiert jeden seed- oder append-Kandidaten, ohne ihn vor dem commit anzuwenden, und verarbeitet dann nur committete events seit seiner letzten Synchronisation, statt das gesamte Log neu zu scannen. `Session.surface` exponiert denselben manager über den readonly-`SessionSurface`-contract, sodass acceptance, abgeleitete Historie, compaction und workspace context einen einzigen inkrementellen state teilen. Replace lokalisiert seine inklusiven Endpunkte über die Array-Position und spliced die replacement seq in diesen Bereich; kein zweiter manager, keine link-Objekte und keine seq-zu-node-map duplizieren die Reihenfolge.

Delta-Verarbeitung ist O(1) ohne neue events und O(neue events), wenn neue events eintreffen.

`deriveMessages()` durchläuft das surface als seinen einzigen Ableitungspfad. Ein surface event ohne seinen obligatorischen marker ist ungültig, kein impliziter append.

### Persistence

Die Felder werden als Top-Level-JSON-Eigenschaften serialisiert. JSONL erhält Platzierung und Herkunft ohne eine separate column-mapping. Die [V3 canonical-envelope decision](2026-09-06-v3-canonical-session-envelopes.de.md) besitzt die exakten replacement-keys und die strikte acceptance-Rationale; die [V2-zu-V3-Spezifikation](../../../../packages/session/session-format-v2-to-v3/README.de.md#canonical-envelopes) besitzt die historische Konversion. Diese note behält die ownership der geordneten Projektion und die replacement-Rationale.

### Crash recovery

Das Modul `repair.ts` synthetisiert `tool/result`-closer für verwaiste tool calls nach einem crash. Diese closer tragen `surfaceOp: 'append'` und `sourceEventSeqs`, die auf das verwaiste `tool/call` event zeigen, sodass das rehydratierte surface gültig ist.

### Invarianten

`Session` validiert `sourceEventSeqs` und `surfaceOp` an der immer aktiven seed/append-Grenze: source lists sind nicht leer, eindeutig, früher und bekannt; `assistant/message` trägt keine source list; replacement-Endpunkte existieren in surface-Reihenfolge; und `sourceEventSeqs` deckt jeden verdeckten Node ab. Das sind single-record-acceptance- und storage-projektions-Regeln, keine optionalen invariant-service-contributions.

Jedes surface-fähige event muss `surfaceOp` tragen, sonst würde es aus der abgeleiteten Historie verschwinden. Typisierte `append`-overloads erzwingen das für literale event-Typen; Runtime-Checks in `append` und dem seed-Konstruktor decken erweiterte Unions und aktuelle geladene Logs ab. Veröffentlichte Validierung und Konversion gehören zu ihren versionierten migration edges, nicht zu generischem Session-Code; siehe die [V2-zu-V3-Platzierungsregeln](../../../../packages/session/session-format-v2-to-v3/README.de.md#canonical-envelopes).

## In Betracht gezogene Alternativen

- **Per-plugin-`agent/request`-Wrapping** (das pre-surface-Muster für Historien-Manipulation) — Listener-Reihenfolgen-Fragilität, kein durable record über das, was geändert wurde, und jede neue Manipulation erzwingt eine weitere Änderung des Core-`deriveMessages()`.
- **Halboffene `[start, endExclusive)`-replace-Bereiche** — abgelehnt: Endpunkte werden durch surface-event-seqs benannt, und Single-Eintrag-Ersatz (`startSeq === endSeq`) liest sich natürlich mit inklusiver Semantik.
- **Verlinkte node-Objekte plus eine seq-map** — abgelehnt: die Produktion las keine predecessor-links, der einzige successor-Gebrauch war die nächste Array-Position, und Ersatz erforderte bereits lineare `indexOf`-Suche. Ein einzelnes seq-Array erhält dasselbe asymptotische Verhalten mit einer einzigen zu validierenden Darstellung.
- **Vollständiger Rebuild hinter einem dirty flag** statt Delta-Verarbeitung — O(N²) über die Lebensdauer einer session: jeder single-event-append würde alle vorherigen events neu scannen.

## Konsequenzen

- **`packages/core/session`**: `surface.ts` (`SurfaceManager`) pflegt ein einzelnes geordnetes seq-Array für Kandidaten-acceptance und live-Projektion; `SessionSurface` ist seine readonly-öffentliche Ansicht. `SurfaceOp`/`SurfaceIntent` und die Top-Level-session-event-Felder halten fest, wie Einträge es beitreten. `append()` verlangt für surface events eine `SurfaceIntent`, `deriveMessages()` durchläuft das surface als einzigen Ableitungspfad, und `repair.ts` emittiert surface-bewusste closer. Der seed-Konstruktor lehnt ein surface-fähiges seed event ohne seinen `surfaceOp`-marker ab (siehe § Invarianten).
- **`packages/core/agent-loop`**: Alle surface-fähigen Appends übergeben surface-opts. Jeder `assistant/message` embedet seinen exakten provider stream und verbietet `sourceEventSeqs`; jedes `tool/result` zitiert seine `tool/call`-seq.
- **`packages/session/session-persistence-jsonl`**: Persistiert kanonische surface-Metadaten und stellt aktuelle events über validierte format preparation wieder her.
- **`packages/session/session-persistence`**: Hält die storage-ownership getrennt von der in-memory-surface-Projektion.

Das surface ist das Fundament, auf dem Historien-Manipulation ausgeliefert wird — dsh-compactions compaction fährt darauf. Ein compaction- oder tool-result-pruner-plugin hängt einen der bestehenden message-erzeugenden event-Typen an (etwa eine `user/message`, die die Zusammenfassung trägt) mit `surfaceOp: { op: 'replace', startSeq, endSeq }` und `sourceEventSeqs`, die die verdeckten Einträge abdecken — das neue event nimmt den Platz des Bereichs auf dem surface ein, während die eigenen trace events des plugins (z. B. `compaction/start`, `compaction/end`) außerhalb bleiben. Replay erhält die Entscheidung deterministisch.

Ein `tool/result`-Ersatz darf genau ein aktuelles `tool/result` umschreiben und muss jedes Datenfeld außer `content` erhalten. Die Session-acceptance erzwingt diese Regel zusammen mit der Positions-Bereichs- und zitierten source-event-Validierung, unabhängig von optionalen diagnostischen plugins.
