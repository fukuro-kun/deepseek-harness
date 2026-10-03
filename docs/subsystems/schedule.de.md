# Session-lokaler Schedule
[English](schedule.md) | [中文](schedule.zh.md) | Deutsch


Schedule besitzt dauerhafte Erinnerungen, die als gewöhnliche spätere Konversations-Turns in die ursprüngliche Live-Session zurückkehren. Der [Durable-Schedule-Agent-Note](../../.agents/notes/implemented/feature/2026-08-05-durable-web-schedule.de.md) besitzt Persistenz, Lebenszyklus und Darstellung des aktiven Zustands, und die [explizite Zeitzonen-Grenze](../../.agents/notes/implemented/simplification/2026-08-09-explicit-schedule-time-zone.de.md) besitzt die browserlokale Interpretation. Diese Seite dokumentiert die dauerhaften und modellseitigen Formen aus [`packages/schedule/schedule/src/types.ts`](../../packages/schedule/schedule/src/types.ts); das [Package-README](../../packages/schedule/schedule/README.de.md) besitzt Komposition, Tool-Verhalten und das exakte Reminder-Framing.

## Dauerhafte Datensätze

`ScheduleId` ist eine [gebrandete id](core.de.md#branded-ids), innerhalb einer Session eindeutig und niemals wiederverwendet. Version 1 unterstützt einen positiven Safe-Integer-Delay `after_seconds`, ein explizites absolutes `at`-Ziel oder ein Safe-Integer-Intervall `every_seconds` von mindestens fünf Minuten. Die Erstellung kanonisiert jedes erste Ziel in einen RFC-3339-UTC-`scheduledAt` mit vierstelliger Jahreszahl; ein `after`-Datensatz behält seinen eingereichten Delay, ein `at`-Datensatz speichert nur den resultierenden Zeitpunkt, und ein `every`-Datensatz behält sein festes Intervall und das nächste Ziel.

```ts type-equiv
/** Durable one-shot reminder created from a positive delay. */
interface AfterScheduleRecord {
  /** Session-local stable identity. */
  readonly id: ScheduleId
  /** Rule discriminator for a delayed one-shot reminder. */
  readonly kind: 'after'
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Positive safe-integer delay accepted at creation. */
  readonly afterSeconds: number
  /** Four-digit-year RFC 3339 UTC target. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** Durable one-shot reminder created from an absolute instant. */
interface AtScheduleRecord {
  /** Session-local stable identity. */
  readonly id: ScheduleId
  /** Rule discriminator for an absolute one-shot reminder. */
  readonly kind: 'at'
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Four-digit-year RFC 3339 UTC target. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** Durable fixed-rate reminder whose next target remains creation-anchor-aligned. */
interface EveryScheduleRecord {
  /** Session-local stable identity. */
  readonly id: ScheduleId
  /** Rule discriminator for a fixed-rate recurring reminder. */
  readonly kind: 'every'
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Fixed safe-integer interval, never below five minutes. */
  readonly everySeconds: number
  /** Earliest anchor-aligned occurrence not yet dispatched. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** One-shot record variants that terminate on an id-only dispatch. */
type OneShotScheduleRecord = AfterScheduleRecord | AtScheduleRecord
```

```ts type-equiv
/** The v1 durable reminder record union. */
type ScheduleRecord = OneShotScheduleRecord | EveryScheduleRecord
```

## Absolute Zeiteingabe

Der `at`-Selektor ist entweder ein strikter RFC-3339-String mit Offset oder ein exaktes lokales Kalenderobjekt. Die lokale Form hält ihre Interpretation an der Tool-Grenze explizit:

```ts type-equiv
/** Structured local-calendar input accepted by `schedule_create`. */
interface LocalAtInput {
  /** Four-digit ISO calendar date. */
  readonly date: string
  /** Local wall-clock time with optional one-to-three digit milliseconds. */
  readonly time: string
  /** Explicit UTC or IANA Area/Location zone. */
  readonly time_zone: string
}
```

```ts type-equiv
/** Absolute selector accepted by `schedule_create`. */
type AtInput = string | LocalAtInput
```

Das offizielle Web-Overlay sampelt für jeden Prompt die IANA-Zone des Browsers. Time-Context weist das Modell an, ansonsten nicht näher qualifizierte natürlichsprachliche Daten und Zeiten in dieser request-lokalen Zone zu interpretieren, wenn der offene Turn eine eindeutige Browser-Zone hat; bei gemischter oder fehlender Herkunft weist es das Modell an nachzufragen. Diese Anweisung ist kein dauerhafter Session-Default: Das Modell muss weiterhin in der String-Form einen Offset oder in der lokalen Form `time_zone` übergeben, und Schedule liest niemals Browser-, Session-, Prozess- oder Modell-Kontext.

Schedule lehnt ungültige Offsets und Zonen, Strings ohne Offset, nicht in der Zukunft liegende Ziele und lokale Zeiten innerhalb von Sommerzeit-Lücken ab. Bei einer Sommerzeit-Überlappung wird der erste, frühere Zeitpunkt gewählt. Eine erfolgreiche Erstellung speichert nur das kanonische UTC-`scheduledAt`, sodass das Replay niemals von Umgebungs-Zeitzonen-Zustand abhängt.

## Festraten-Eingabe und Catch-up

`every_seconds` ist ein datensatzindividuelles Intervall von mindestens 300 Sekunden, verankert am Erstellungszeitpunkt. Es ist ausschließlich Festraten-Wiederholung: Das Protokoll kennt weder Kalender- oder Cron-Ausdruck noch Wiederholungs-Zeitzone, gemeinsame Cooldowns oder datensatzübergreifende Zulassungsregeln.

Wenn eine Session über mehrere Ziele hinweg kalt oder beschäftigt war, trägt ein Every-Datensatz nur sein letztes fälliges Auftreten bei. Der Dispatch schiebt es direkt auf das erste auf den Erstellungsanker ausgerichtete Ziel nach dem Dispatch-Entscheidungszeitpunkt, ohne verpasste Intervalle aufzuzählen, zu persistieren oder zu wiederholen. Passt das nächste Ziel nicht mehr in ein vierstelliges UTC-Jahr, terminiert der letzte Dispatch den Datensatz.

Sind mehrere verschiedene Every-Datensätze überfällig und kein One-Shot fällig, trägt jeder ein Auftreten zu demselben Follow-up-Batch bei, geordnet nach Ziel und Erstellung. Jeder Every-Datensatz hält unabhängigen Zustand, während alle Dispatches in diesem zugelassenen Batch denselben Entscheidungszeitpunkt verwenden. Batching begrenzt die Modell-Turns; das Fünf-Minuten-Minimum begrenzt die Timer-Frequenz jedes Datensatzes.

## Dauerhafte Änderungen und Replay

Das `schedule/change`-Session-Event in Version 1 ist die einzige dauerhafte Schedule-Autorität. Create speichert den vollständigen Datensatz, und Delete ist ein terminaler, nur-id-Übergang. Auch ein One-Shot-Dispatch ist terminal und nur-id. Ein Every-Dispatch trägt die Wall-Clock-Entscheidungszeit, mit der das letzte fällige Auftreten gewählt wurde, und schiebt den aktiven Datensatz normalerweise weiter, statt ihn zu terminieren. Dispatch bedeutet, dass der Follow-up synchron eingereiht wurde — nicht, dass eine Modellantwort gelang oder der Nutzer sie gelesen hat.

```ts type-equiv
/** Creates one durable reminder record. */
interface ScheduleCreateChange {
  readonly version: 1
  readonly operation: 'create'
  readonly schedule: ScheduleRecord
}
```

```ts type-equiv
/** Deletes one currently active reminder. */
interface ScheduleDeleteChange {
  readonly version: 1
  readonly operation: 'delete'
  readonly id: ScheduleId
}
```

```ts type-equiv
/** Records that one active one-shot reminder entered the durable dispatch history. */
interface OneShotScheduleDispatchChange {
  readonly version: 1
  readonly operation: 'dispatch'
  readonly id: ScheduleId
}
```

```ts type-equiv
/** Records one fixed-rate decision and advances directly past missed occurrences. */
interface EveryScheduleDispatchChange {
  readonly version: 1
  readonly operation: 'dispatch'
  readonly id: ScheduleId
  /** Wall-clock decision time used to select the latest due occurrence. */
  readonly acceptedAt: string
}
```

```ts type-equiv
/** Durable dispatch shapes supported by the current rule set. */
type ScheduleDispatchChange = OneShotScheduleDispatchChange | EveryScheduleDispatchChange
```

```ts type-equiv
/** Strict version-1 durable Schedule mutation union. */
type ScheduleChange = ScheduleCreateChange | ScheduleDeleteChange | ScheduleDispatchChange
```

Der strikte Decoder und der Fold lehnen unbekannte Versionen, Zusatzfelder, wiederverwendete ids, nicht passende One-Shot- oder Every-Dispatch-Formen sowie Delete- oder Dispatch-Übergänge gegen inaktive Datensätze ab. Eine normale Session faltet ihren vollständigen Event-Stream. Ein Fork faltet nur Events an oder nach seinem exakten `inheritedEventCount`, behält also die Historie, ohne die aktiven Erinnerungen der Eltern-Session zu übernehmen. Die Projektions-Initialisierung erhält diesen Schnitt neben dem unveränderlichen Header, verwendet den gemeinsamen Übergang und persistiert sowohl Schnitt als auch aktive Datensätze und Used-id-Historie, sodass ein Cache-Restore das strikte Replay bewahrt. Die `schedule/change`-Deklaration und Quellstelle sind ebenfalls im [Persistenzkatalog](../persistence-catalog.de.md#schedulechange--log-only) indexiert.

## Aktive Ansichten und Verwaltung

Tool-Werte kombinieren den dauerhaften Datensatz mit einem aus der aktuellen Wall Clock abgeleiteten Zustellstatus. `session-local` bedeutet, dass die ursprüngliche Session live sein muss: Es gibt keinen externen Benachrichtigungskanal und keinen Cold-Session-Scheduler.

```ts type-equiv
/** Current delivery timing derived from the durable record and wall clock. */
type ScheduleState = 'scheduled' | 'overdue'
```

```ts type-equiv
/** Fixed v1 delivery boundary: the original session must be live. */
type ScheduleDeliveryMode = 'session-local'
```

```ts type-equiv
/** Complete model-facing view of one active reminder. */
type ScheduleView = ScheduleRecord & {
  /** Whether the target remains in the future. */
  readonly state: ScheduleState
  /** Reminder delivery never leaves the owning session. */
  readonly deliveryMode: ScheduleDeliveryMode
}
```

Der generierte [Tool-Katalog](../tool-catalog.de.md#deepseek-aidsh-schedule) besitzt die Argument- und Ergebnis-Schemata für `schedule_create`, `schedule_list` und `schedule_delete`. Verwaltungsaufrufe serialisieren sich mit fälliger Arbeit in einer Agent-scoped Queue. Jeder Lesevorgang oder jede Entscheidung wartet zuerst auf die gemeinsame Session-Persistenz-Barriere; Create und ein tatsächliches Delete warten nach dem Append erneut. Ein Barrier-Fehler meldet `persistence_uncertain`, statt zu raten, ob ein eager Write committet wurde. Die übrigen stabilen Fehlercodes sind `invalid_prompt`, `invalid_selector`, `invalid_rule`, `invalid_time_zone`, `not_future`, `time_out_of_range`, `frequency_too_high`, `corrupt_schedule_log` und `internal_error`.

## Read-only-Web-Katalog

Ist die optionale Session-Projektions-Registry vorhanden, registriert Schedule den client-sichtbaren `schedule`-Key, dessen Wert das vollständige aktive `ScheduleRecord[]` ist. Live-, Cache-, History- und Detached-Lesevorgänge verwenden denselben Header-aware strikten Fold; fehlerhafte autoritative Eingabe lässt den bestehende Lesepfad fehlschlagen, statt einen Teilwert zu publizieren.

Das ausgelieferte Web-Bundle hält `ui-schedule` standardmäßig deaktiviert, während das explizite Schedule-Overlay es zusammen mit der Host-Capability aktiviert. [`dsh-client-ui-schedule`](../../packages/client/ui-schedule/README.de.md) besitzt die Header-Interaktion, [`dsh-client-ui-workspace`](../../packages/client/ui-workspace/README.de.md) besitzt die Zeilendarstellung, und der Durable-Schedule-Agent-Note besitzt ihre gemeinsame Grenze für den aktiven Zustand. Der geteilte Wert repräsentiert den aktuellen aktiven Zustand, niemals Zustellhistorie oder eine Quittung; fällige Erinnerungen erscheinen weiterhin über die unten beschriebene gewöhnliche Assistant-Ausgabe.

## Live-Zustellung

Der prozesslokale Owner leitet seinen frühesten Timer aus dem dauerhaften Fold ab und liest die Wall Clock nach jedem begrenzten Warten erneut. Kalte Sessions verrichten keine Arbeit; das erneute Öffnen rekonstruiert Timer und macht vergangene Ziele überfällig. Fällige One-Shots haben Vorrang und gehen jeweils einzeln in einen späteren Turn. Ist kein One-Shot fällig, bilden alle überfälligen Every-Datensätze den oben beschriebenen einzelnen Batch.

Fällige Arbeit wartet, bis der Agent vollständig idle ist, und beansprucht die Maintenance-Phase, bevor sie den Zustand neu faltet, die Entscheidung sampelt, ein `followup()` einreiht und die zugehörigen Dispatch-Changes anhängt. Sie ruft niemals `steer()` auf und unterbricht niemals einen laufenden Turn.

Der zugelassene One-Shot- oder Festraten-Batch startet einen normalen späteren Turn und erscheint nur über das gewöhnliche Konversations-Transcript; Schedule hat keine eigenständige dauerhafte Web-Quittung. Der obige Read-only-Aktivkatalog repräsentiert niemals Zustellerfolg. Scheitert das Framing oder die synchrone Queue-Aufnahme, wird kein Dispatch aufgezeichnet und die Erinnerung bleibt aktiv. Das schmale Crash-Intervall nach Aufnahme, aber vor dem dauerhaften Dispatch kann Erinnerungsinhalte nach der Wiederherstellung wiederholen — die Grenze ist daher Best-Effort-At-Least-Once statt Exactly-Once-Zustellung.
