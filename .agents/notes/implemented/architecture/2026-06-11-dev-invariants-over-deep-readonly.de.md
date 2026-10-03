# Agent Note: Quellseitig gesicherte Session-Immutabilität und Dev-Mode-Invarianten

Status: implemented

[English](2026-06-11-dev-invariants-over-deep-readonly.md) | [中文](2026-06-11-dev-invariants-over-deep-readonly.zh.md) | Deutsch

## Problem

Das Session-Log benötigt zwei verschiedene Schutzebenen: die unveränderliche Ownership jeder gespeicherten Tatsache sowie Prüfungen der Zusammenhänge zwischen Tatsachen über die Zeit und über Service-Verträge hinweg. Beides in einem optionalen development plugin zu vereinen, würde die Produktions-Historie schutzlos lassen; beide über TypeScript-readonly-Typen auszudrücken, würde weder eine Runtime-Grenze schaffen noch relationale Regeln beschreiben.

Das Session-Log ist die dauerhafte source of truth für replay, Request-Rekonstruktion, persistence und die für Nutzer sichtbare Historie. Code außerhalb des session packages muss diese Historie einsehen können, ohne eine Referenz zu behalten, die sie später umschreiben könnte, und aus dem caller akzeptierte Inputs dürfen keine Verbindung zu caller-eigenen mutablen Objekten behalten.

Die Immutabilität einzelner Werte erfüllt nur die Hälfte des contract. Ein Log kann vollkommen immutable records enthalten, bei denen Sequenz, turn/step-Nesting, tool-call-Paarung, scoped delivery oder der rekonstruierte model request falsch sind. Diese Regeln betreffen mehrere records oder services und lassen sich nicht durch das Einfrieren eines einzelnen Objekts herstellen.

TypeScript-readonly-Typen sind keine ausreichende Runtime-Grenze. Sie verschwinden, wenn das Programm läuft, ein cast kann sie umgehen, und ein rekursives `DeepReadonly<T>` würde sich durch jedes log und jeden message consumer ziehen, obwohl einige downstream request-processing APIs bewusst mit mutablen Werten arbeiten.

## Entscheidung

Die Verantwortung ist auf eine immer aktive storage boundary und optionale development assertions aufgeteilt.

### Session besitzt die immutable Historie

`Session` akzeptiert ein event erst nachdem ein rekursiver Durchgang einen verlustfreien JSON-Snapshot materialisiert hat. Dieser Durchgang verwirft nicht unterstützte Werte und erzeugt die exakte, entkoppelte record, die in das Log eintritt, sodass Validierung und storage weder von einem stateful getter andere Werte beobachten noch caller-eigene verschachtelte Referenzen behalten können.

Das akzeptierte event und all seine Nachkommen werden vor der Veröffentlichung tief eingefroren. `append()` gibt diese owned, eingefrorene record zurück, und `session/event`-observer sowie `eventAt(seq)` erhalten dieselbe record. `snapshotEvents(fromSeq?, toSeqExclusive?)` gibt einen eingefrorenen Array-Snapshot zurück; ein zuvor zurückgegebener Array wächst nach einem späteren append nicht. `seq` und `eventAt()` vermeiden die Materialisierung des Arrays, wenn der caller nur die aktuelle Länge oder ein einzelnes event benötigt. Seed-Records durchlaufen dieselben Validierungs-, Snapshot- und Freeze-Grenzen, bevor die Konstruktion erfolgreich ist.

Diese Garantie gehört in `Session`, nicht in einen optionalen listener, weil jede composition auf vertrauenswürdige Historie angewiesen ist. Eine Produktions-Deployment, ein fokussierter test oder ein custom embedding erhält dieselben storage semantics, unabhängig davon, ob development-support plugins registriert sind oder nicht.

### Abgeleitete requests bleiben entkoppelt

`deriveMessages()` projiziert protokollierte surface events in entkoppelte, tief eingefrorene `Message`-Objekte und gibt einen frischen Array-Snapshot zurück. Die Request-Zusammenstellung kann dadurch abgeleitete Historie mit anderen Inputs kombinieren, ohne einen Weg zurück in das Log offenzulegen. Der cache wiederverwendet sichere immutable Projektionen, statt für jeden model call die komplette Historie neu zu klonen.

### Package-eigene invariant companions prüfen Zusammenhänge

`dsh-invariants` registriert den konfigurierbaren `ctx.invariants`-service und enthält keine product checks. Ein package veröffentlicht einen `./invariant`-ownership companion nur für eine unabhängig beobachtbare Runtime-Beziehung; packages ohne eine solche lassen den companion aus und halten den Grund in ihrem README fest. `dsh-session`, `dsh-agent`, `dsh-scope` und `dsh-agent-loop` liefern die ersten Regeln, die trace state oder die Beobachtung eines anderen seams erfordern: monoton wachsende Sequenznummern, turn/step-Nesting, tool-call/result-Paarung, zulässige agent-status-Übergänge, subjekt-korrekte scoped dispatch und die Gleichheit zwischen einem loop-gebauten request und dem request, der aus seinem session-log-Präfix rekonstruiert wird. Globale Aktivierung und package-name-regex-Filter gehören zum service ([package-owned invariant service](../../archived/architecture/2026-07-19-package-owned-invariant-service.md); [Omissions-Entscheidung](../simplification/2026-08-28-omit-unneeded-invariant-companions.de.md)).

Wenn der session companion an eine bestehende oder seed-basierte session angehängt wird, spielt er das immutable Log ab, um den trace state aufzubauen. Der service gibt jedem contribution eine disposable child fiber, sodass ein hot reload mitten im turn sicher ist, ohne der Diagnostik Ownership über die session storage zu geben.

## In Betracht gezogene Alternativen

### Durchgängige deep-readonly-Typen

Ein abgelehnter companion-Vorschlag würde einen rekursiven `DeepReadonly<T>`-Typen über alle öffentlichen log- und message-surfaces legen und die session-Lesepfade (`events`, `session/event`-listener, `deriveMessages()`) auf deep-readonly umstellen, während in-flight waterfalls mutabel bleiben. Das liefert Editor-Feedback, aber keine Runtime-Garantie: TypeScript-Typen werden erasiert, und plugin code kann durch casts hindurch. Es drängt readonly-Typen auch in consumer, in denen Mutation beabsichtigt ist. Runtime-ownership an der `Session`-Grenze schützt jeden caller, ohne diese Typ-Propagation.

### Einfrieren nur im Development-Modus

Die Historie nur dann einzufrieren, wenn ein invariants plugin installiert ist, würde die Kern-Garantie von der composition abhängig machen. Code könnte development tests bestehen und die Historie trotzdem in der Produktion oder in einer fokussierten composition beschädigen, die das plugin auslässt. Storage-Immutabilität ist daher immer aktiv, während die aufwendigeren relationalen Checks weiterhin optionale development support sind.

### Klonen nur bei der Message-Ableitung

`deriveMessages()` zu entkoppeln, würde den häufigsten request path schützen, aber anderen Lesern von `snapshotEvents()`, `eventAt()`, append-Rückgabewerten und session-event-observers die Möglichkeit lassen, die durable Historie zu verändern. Das Log muss seine eigene Grenze schützen; abgeleitete Projektionen sind eine zusätzliche Isolationsgrenze, kein Ersatz.

## Konsequenzen

- Jedes akzeptierte live- oder seed-session event ist von caller-eigenen Inputs entkoppelt und tief immutable, bevor es ein observer erhalten kann.
- `snapshotEvents()` exponiert stabile immutable Snapshots statt des privat wachsenden Arrays; `seq` und `eventAt()` bedienen skalare Lesezugriffe, ohne dieses Array zu kopieren.
- Mutation auf der Request-Seite erreicht die gespeicherte Historie nicht über abgeleitete messages.
- Development builds können relationale Assertions aktivieren, ohne das storage-Verhalten zu ändern, und das Dispose- oder Filtern eines companions schwächt die log-Immutabilität nicht ab.
- `dsh-invariants` konfiguriert die globale Aktivierung plus package-allow/block-regex-Listen; jeder check bleibt seinem product package eigen und wird von diesem getestet.
- Die Runtime-Grenze verursacht einmal pro akzeptiertem event einen rekursiven snapshot-and-freeze-Aufwand; spätere Leser und gecachte Projektionen wiederverwenden die owned immutable records.
