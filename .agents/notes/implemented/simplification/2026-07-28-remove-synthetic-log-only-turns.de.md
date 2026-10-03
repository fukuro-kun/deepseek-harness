# Agent Note: Synthetische Turns für log-only Events entfernt
[English](2026-07-28-remove-synthetic-log-only-turns.md) | [中文](2026-07-28-remove-synthetic-log-only-turns.zh.md) | Deutsch

Status: implemented


## Problem

Der Session-Store stellte `appendOutOfBand()` bereit, damit ein Plugin ein spät eintreffendes log-only Event publizieren konnte, während kein Agent-Turn lief. Die Methode hüllte dieses Event in `turn/start` und `turn/end` und flushte es anschließend. Das bewahrte die alte Regel, dass jedes durable Event innerhalb eines Turns liegen musste, ließ aber einen Identifikator sowohl eine Model-Loop-Ausführung als auch ein rein persistenzbezogenes Update bedeuten.

Diese Regel wurde eingeführt, als die Persistenz-Wiederherstellung das letzte `turn/end` als einzige committete Grenze behandelte. Die Persistenz-Scanner bewahren inzwischen jedes gültige zusammenhängende Event, und die Crash-Reparatur reagiert nur auf einen tatsächlich offenen Turn. Synthetische Turns für Title-Updates beizubehalten blähte daher die Turn-Zählung auf, erzeugte Execution-Outcomes für Arbeit, die das Modell nie laufen ließ, und ließ einen späten Metadaten-Write die nächste Turn-Nummer verbrauchen.

Der generische Helper duplizierte außerdem Domain-Policy. Seine Marker-Map legte fest, welche Plugin-Events berechtigt waren, während die Title-Capability die Regeln für Cancellation, Liveness und stale Results bereits besaß. Sie durch einen weiteren generischen oder title-spezifischen Append-Wrapper zu ersetzen, hätte dieselbe Typindirektion für zwei literale Event-Typen bewahrt.

## Decision

`SessionStore.appendOutOfBand()`, `OutOfBandSessionEventMap` und `OutOfBandSessionEventType` existieren nicht. Ein Plugin, das ein log-only Event besitzt, hängt es über `Session` an; wenn die Operation Durability verspricht, wartet es explizit auf `ctx.sessions.flush(session)`. Kein Turn wird allein geöffnet, um diesen Checkpoint zu erhalten.

Die Core-Session-Invariants erzwingen weiterhin die core-eigenen Execution-Relationen: Turn- und Step-Nummerierung, das Einschließen von Steering-, Assistant-, Tool-, Todo- und Request-Header-Events sowie die Tool-Call/Result-Paarung innerhalb desselben Steps. Core erlaubt merge-erweiterbare Events zwischen Turns, weil nur das deklarierende Plugin weiß, ob sie execution-scoped oder standalone sind. Die Invariant-Companions der Plugins bleiben für ihre eigenen Event-Relationen verantwortlich.

Der Title-Service hängt `session/title` direkt an, nach seinen bestehenden Service-, Revision-, Cancellation- und Live-Session-Checks. Der gebündelte Model-Helper hängt seinen literalen `session/title-llm-request`-Record vor dem Dispatch an. Die Persistenz nimmt beide über den begrenzten `session/event`-Pfad an und leert sie an gewöhnlichen Checkpoints und beim Lifecycle-Teardown; keines der beiden Appends erzwingt einen Flush nur weil es zwischen Turns liegt. Ein Fallback, ein Hilfs-Request-Record oder ein akzeptierter Provider-Title kann daher nach `turn/end` und vor dem nächsten `turn/start` erscheinen. Manuelle Compaction nutzt dieselbe Between-Turn-Capability für ein `compaction/* { turn: null }`-Bracket, flusht den geschlossenen Versuch aber explizit, weil `/compact` Durability verspricht, bevor die wartende Prompt-Admission freigegeben wird.

Ein Session-Fork darf an jeder stabilen Event-Position außerhalb eines offenen Turns enden, nicht nur bei `turn/end`. Das bewahrt standalone Titles und andere plugin-eigene log-only Records in einem Default-Fork und lehnt dennoch einen Prefix-Schnitt durch eine aktive Ausführung ab.

Die historische [universelle Turn-Enclosure-Entscheidung](../../archived/architecture/2026-06-15-turn-enclosure-invariant.md) bleibt nur als Begründung nützlich, warum der synthetische Mechanismus eingeführt wurde. Die [Context-Injection-Entscheidung](../architecture/2026-07-24-separate-context-injection-from-turn-execution.de.md) etablierte die aktuelle Bedeutung: Ein Turn steht für eine Model-Loop-Ausführung. Die [Queued-Manual-Compaction-Entscheidung](../feature/2026-07-30-queued-manual-compaction.de.md) wendet diese Regel auf ein durables Multi-Event-Bracket an und besitzt dessen Marker- und Admission-Semantik.

## Alternatives considered

**Synthetische Zero-Step-Turns behalten.** Das bewahrt ein einheitlich aussehendes Log und nutzt `turn/end` als Flush-Punkt wieder, berichtet aber Ausführungen, die nie stattfanden, stört die Turn-Nummerierung und zwingt jeden Turn-Consumer, persistence-only Records zu filtern. Durability besitzt bereits die unabhängige `session/flush`-Grenze.

**Einen generischen Core-Durable-Append-Helper ohne synthetische Turns behalten.** Eine Methode, die `append()` plus `flush()` ausführt, ist klein, aber ihr Eligibility-Marker und ihre Concurrency-Zusagen würden Plugin-Policy weiterhin im Session-Store zentralisieren. Die Event-Owner besitzen bereits literale, getypte Append-Stellen, und ein Caller, der wirklich eine Durability-Barriere braucht, kann an dieser Grenze die bestehende `session/flush`-Operation awaiten.

**Titles als mutable Session-Metadaten speichern.** Das vermeidet Between-Turn-Events, schafft aber ein zweites Mutations-, Replay-, Persistenz- und Fork-Protokoll neben dem Append-Only-Log. Titles bleiben stattdessen replaybare Latest-Wins-Events.

**Von jedem Plugin-Event verlangen, Standalone-Eligibility gegenüber Core zu deklarieren.** Das bewahrt eine zentrale Allowlist, lässt aber das Fehlen der Deklaration eine Execution-Relation bedeuten, die Core nicht verifizieren kann. Merge-erweiterbare Unions weisen die semantische Ownership bereits dem deklarierenden Plugin zu; dessen Invariant-Companion ist der richtige Durchsetzungspunkt.

## Verification

Core-Invariant-Tests akzeptieren ein unbekanntes Plugin-Event zwischen Turns und lehnen dort weiterhin eingebaute Execution-Events ab. Die Invariant-Companions von Hook, Plan-Mode, PTC-Mode-Dispatch und Approval lehnen ihre execution-scoped Events ab, wenn kein Turn offen ist; der Compaction-Companion akzeptiert separat ein balanciertes `turn: null`-Manual-Bracket zwischen Turns und verlangt, dass numerische Owner einem offenen Turn entsprechen. Session-Title-Service-Tests pinnen ein direktes Fallback-Event unter gleichzeitigem Refresh, Ablehnung einer detached Session und Akzeptanz der neuesten Revision. Ein JSONL-Round-Trip bewahrt einen nach `turn/end` angehängten Title durch den Persistenz-Lifecycle-Drain, und Fork-Tests behalten einen standalone log-only Tail und lehnen Grenzen innerhalb eines offenen Turns ab. Ein keyless assembliertes ACP-Snapshot verzögert den modelgestützten Title bis nach `turn/end` und pinnt einen standalone Provider-Title ohne synthetischen Turn. Die generierten API- und Type-Equivalence-Kataloge enthalten kein entferntes Symbol.

## Consequences

Turn-Zählungen und Outcomes beschreiben wieder ausschließlich Model-Loop-Ausführungen. Standalone-Events und Manual-Compaction-Brackets verbrauchen Session-Seqs, ohne eine Turn-Nummer zu verbrauchen, gehen wie jeder andere Append in die begrenzte Persistenz und verlangen von Ownern nur dann eine explizite Durability-Barriere, wenn ihre Operation eine verspricht. Generische Plugin-Fehler schlagen nicht mehr unter einer Core-Default-Enclosure-Regel fehl; jedes Plugin, das eine Execution-Relation braucht, muss diese daher selbst deklarieren und testen. Die Title-Capability behält Revision-Ordering und Lifecycle-Persistenz mit weniger Core-State, und die manuelle Compaction gewinnt durable Kontrolle ohne Kollision zwischen synthetischen Turns und Turn-Nummern.
