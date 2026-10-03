# Agent Note: PTC-Modus Live-Dispatch-Lifecycle und Parallelität auf nativem Vertrag
[English](2026-07-26-ptc-live-parallel-dispatch.md) | [中文](2026-07-26-ptc-live-parallel-dispatch.zh.md) | Deutsch

Status: implemented


> Scope: das `tool/ptc-dispatch-start`-Event, Running-State pro Sub-Call im Web-Chat und die Wiederverwendung des nativen Concurrency-Vertrags durch den Bridge-Scheduler. Baut auf der [Host-Grundlage](../../archived/feature/2026-07-26-ptc-dispatch-ui-foundation.md) und den [Chat-Sub-Call-Zeilen](../../archived/feature/2026-07-26-ptc-chat-subcall-rows.md) auf; der native Vertrag selbst gehört der [Parallel-Tool-Call-Notiz](2026-07-10-parallel-tool-call-execution.de.md).

## Problem

Nach Auslieferung der Host-Grundlage und der Chat-Sub-Call-Zeilen blieben zwei Lücken. Sub-Call-Zeilen erschienen nur, wenn jeder Dispatch *settlte* — solange einer lief, zeigte die UI nichts für ihn, sodass ein langsamer Sub-Call wie ein festgefahrener Parent wirkte. Und die Bridge serialisierte jeden Binding-Call („selbst `Promise.all` führt einen nach dem anderen aus"), ein Platzhalter aus der Zeit, bevor Tools Concurrency-Metadaten trugen: `isConcurrencySafe` existiert inzwischen, der Loop-Scheduler lässt native Geschwister bereits in begrenzten Pools laufen, und ein PTC-Modus-Programm, das drei unabhängige Reads erwartete, zahlte die 3-fache Latenz des nativen Pfads.

## Entscheidung

**Ein Lifecycle-Paar, ein Scheduling-Vertrag, geteilt mit native.**

- **Event-Paar**: `tool/ptc-dispatch-start` (Parent-/Sub-Ids, Name, normalisierte Args) wird angehängt, wenn der Scheduler einen Call tatsächlich startet — nicht bei der Submission, sodass ein durch die Run-Settlement verworfener queued Call nichts loggt. Das bestehende `tool/ptc-dispatch` settlt das Paar (gleiche `subCallId`); jeder gestartete Call settlt exakt einmal (Aborts settlen als `isError`-Ergebnisse durch die Pipeline). Timing = die `time`-Felder der beiden Events. Beide bleiben nur Log; der Modellkontext ist unangetastet.
- **Bridge-Scheduler**: Submittete Calls werden zum Startzeitpunkt über `registry.executionMode` klassifiziert (derselbe fail-closed-`isConcurrencySafe`-Vertrag, den der Loop verwendet) und starten strikt in Submissionsreihenfolge. Ein einspuriger Driver besitzt jede ORDERED-Stufe — das Start-Append, `prepare` (Pre-Execute/Guards), der Head-of-Line-`finalize`/`finish`-Commit (Post-Execute + Kontext-Deferral + Settle-Append) —, sodass sich geordnete Policy-Stufen nie überlappen und nur die Around-Dispatch-/Body-Stufe nebenläufig läuft, exakt das Sequencing des nativen Loops (`fillPool` awaited `startCall`, dann `commitReady`). Aufeinanderfolgende parallel-klassifizierte Calls überlappen bis zu `maxParallelSubCalls` (ein `Config`-Feld, vom Loader-Schema validiert UND bei direkter Konstruktion erneut validiert, Default 10 — der eigene Default des Loop-Schedulers; `1` stellt seriellen Dispatch wieder her); ein exklusiver Call leert den Pool, läuft allein und hält seine Barriere, bis sein COMMIT (Post-Execute eingeschlossen) abgeschlossen ist, wie eine native Exklusivgruppe. Die Run-Settlement bricht in-flight Dispatches ab und verwirft queued-unstarted (Binding-Rejection, keine Events) und drainiert dann bis zur Quiescence — einschließlich eines Commits, der bereits mid-flight war, als das Programm zurückkehrte —, bevor das äußere Ergebnis die Runde schließt.
- **Client**: Runtimes `ToolCallTree` speichert ein Start-Event als `RunningToolCall`-Kind und projiziert es durch die rekursiven `subCalls` des Parents (Zeilen leiten den Running-Ring aus dieser Form ab, exakt wie für native in-flight Calls). Sein Settle ersetzt den Private-Index-Eintrag in place, bewahrt die Startreihenfolge unter parallelem Abschluss und trägt das `time` des Starts als `callTime` (Dauerquelle). Ein Settle ohne beobachteten Start (Fenster mid-pair geschnitten oder ein Pre-Start-Event-Log) hängt direkt an, sodass alte Logs weiter rendern.
- **SDK-Prompt**: Der modellzugewandte Satz „Calls werden sequenziell ausgeführt" wird durch den wahren Vertrag ersetzt (unabhängige sichere Calls dürfen unter `Promise.all` überlappen; abhängige Arbeit sequenziert mit `await`) — eine modellsichtbare Änderung, über jeden ptc-Snapshot neu aufgezeichnet.

## Erwogene Alternativen

**Unbeschränkte Parallelität (`Promise.all` lässt alles überlappen).** Verworfen: Writes könnten racen; der native Scheduler existiert gerade, weil das Tool — nicht der Caller — den Safety-Anspruch besitzt. Ein Concurrency-Vokabular über native und PTC-Modus hinweg war die gesetzte Anforderung.

**Das Start-Event bei Submission statt beim Pool-Eintritt emittieren.** Verworfen: Ein Submission-Start zeigte queued-aber-nie-gelaufene Calls als „running" und erzwänge ein drittes „abandoned"-Terminal-Event zur Log-Aussöhnung. Start-am-Eintritt bewahrt die Invariante *gestartet ⇔ settlt exakt einmal* und braucht kein drittes Event.

**Die Loop-Scheduler-Implementierung direkt wiederverwenden.** Verworfen: Der Loop schedult einen vollständig geparsten Batch mit modellreihenfolgen-Commitment; die Bridge schedult einen offenen Strom von Submissions, deren Ergebnisse zum Programm zurückkehren (nicht zum Transcript), sodass nur der *Vertrag* (Klassifikation, Pool, Barrieren) geteilt ist, nicht die Maschinerie.

## Konsequenzen

Programme erhalten native Latenz für unabhängige Reads ohne neue modellseitige API — `Promise.all` funktioniert einfach besser, und die Prompt-Anleitung änderte sich entsprechend. Die Web-UI zeigt Running-Rings pro Sub-Call live (Fixture emittiert Start/Settle-Paare; jsdom fixiert die Running-Form; die Runtime-Spec fixiert in-place Settlement, Out-of-Order-Abschluss und callTime-Pairing). Trajectory-/Waterfall-Sub-Call-Spans ziehen wahrheitsgemäßes Timing aus dem Paar. Die Spill-Begrenzung ([ptc-dispatch-Log-Spill](../../archived/feature/2026-07-26-ptc-dispatch-log-spill.md)) erbt das Settle-Event als ihren einzigen Begrenzungspunkt.
