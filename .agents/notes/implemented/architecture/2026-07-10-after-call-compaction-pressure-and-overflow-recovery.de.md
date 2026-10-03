# Agent Note: After-Call-Compaction-Pressure und Context-Overflow-Recovery

Status: implemented

[English](2026-07-10-after-call-compaction-pressure-and-overflow-recovery.md) | [中文](2026-07-10-after-call-compaction-pressure-and-overflow-recovery.zh.md) | Deutsch

## Problem

`agent/pre-step` läuft vor dem finalen Request-Routing und bevor Assistant-Output, Tool-Ergebnisse, gepufferter Kontext und Steering existieren. Selbst mit dem assemblierten Prompt und Session-Präfix ist seine Pressure-Sicht provisorisch, weil `agent/request` noch Routing oder Call-Konfiguration ändern kann und Tool-Schemas nicht mit diesen Inputs eingefroren sind. Felder hinzuzufügen kann den Pre-Call-Zustand nicht einen abgeschlossenen Call beschreiben lassen und koppelt den generischen Extension-Point an Compaction.

Erfolgreiche Calls sind nicht das einzige Pressure-Signal. Ein Provider kann einen Request wegen Überschreitung seines Kontext-Fensters ablehnen, bevor er Usage zurückgibt, und manche erfolgreichen Calls lassen Usage weg. Das System braucht daher replaybaren Post-Call-Pressure plus einen schmalen Failure-Recovery-Pfad, der den Provider-Fehler bewahrt, wann immer Compaction keinen nützlichen Fortschritt beweisen kann.

## Entscheidung

### Erfolgreicher Pressure läuft an der nächsten Pre-Step-Grenze

`agent/pre-step` erhält den exklusiv geclaimten Message-Batch plus `{ turn, step, signal }` und gibt die finale Reject/Enter-Entscheidung zurück. Es trägt keine Compaction-only-Prompt- oder Prefix-Felder.

Compact-basic umhüllt `agent/pre-step` vor jedem vorgeschlagenen Request. An einer Continuation-Grenze sind der vorhergehende Assistant-Output, jedes dispatche oder synthetische Tool-Ergebnis, Post-Tool-Kontext und Steering bereits durable, sodass Pressure-Policy den vollständigen Successful-Call-Zustand sieht, ohne einen Assistant-Tool-Call von seinem Ergebnis zu trennen. An der initialen Grenze hat eine headerlose Session keinen abgeschlossenen gerouteten Request und produziert keine Pressure-Arbeit. Compact-basic enthält operationelle Fehler, warnt und delegiert, ohne den vorgeschlagenen Step zu rejecten.

`dsh-compaction-basic` liest das exakte neueste geroutete Modell aus dem durable Request-Header nur, um festzustellen, dass eine abgeschlossene Route existiert, und bittet dann das Singleton `ctx.tokenMeter`, das kanonische geloggte Envelope und die aktuelle Surface zu messen. Es fällt für automatischen Pressure nicht auf `AgentOptions.model` zurück. Eine headerlose Session hat keinen abgeschlossenen gerouteten Request zum Bewerten und produziert keine Arbeit; jeder durable nicht-leere Modellname nutzt denselbe Estimator. Operationelle Mess- oder Zusammenfassungs-Fehler warnen und fahren von der neuesten durable Surface fort: volle History vor jeder Ersetzung, oder die geprunten Surface, falls Pruning bereits gelandet ist.

### Request-Recovery ist auf die finale Modell-Grenze begrenzt

`agent/request-error` repräsentiert terminale Failures von der finalen Adapter-Grenze. Adapter-Auswahl, Dispatch, Iterator-Konstruktion und Iterations-Throws werden zu terminalen `error`- oder `aborted`-Finishes, bevor der Agent-Loop sie konsumiert; Adapter-emittierte terminale Finishes gehen in denselben Pfad. Prompt-Assembly, Request-Middleware, Request-Logging, Ergebnis-Verarbeitung, Tools, Step-Listener und Cleanup bleiben gewöhnliche Failures. [Terminale LLM-Stream-Failures](2026-07-29-terminal-llm-stream-failures.md) besitzt diese Normalisierungsgrenze.

Der fehlgeschlagene Step schließt, bevor Recovery läuft. Ein handelnder Listener repariert durable Zustand, gibt `{ kind: 'retry' }` zurück und stoppt Waterfall-Delegation. Der Loop schließt dann den fehlgeschlagenen Turn und öffnet einen Retry-Turn aus dem durable Log ohne dazwischenliegende Idle-Benachrichtigung. Retry-Policy und Versuchs-Zähler bleiben Plugin-owned; compaction-basic räumt seinen Per-Agent-Overflow-Zähler auf, wenn die Kette terminales `agent/settled` erreicht. Beide DeepSeek-Adapter normalisieren erkannte Provider-Kontext-Limit-Failures zu `CONTEXT_WINDOW_EXCEEDED`. Die [Retry-Action-Entscheidung](../simplification/2026-07-27-request-error-retry-action.de.md) besitzt die Return-Grenze.

Wenn Cancellation landet, nachdem Assistant-Tool-Calls durable sind, aber bevor alle Calls dispatchen, zeichnet der Loop ein synthetisches `tool/call`- und abgebrochenes `tool/result`-Paar für jeden nicht-dispatchen Call auf, bevor er dem normalen Abort-Pfad folgt. Die Surface behält daher nie verwaiste durable Tool-Calls, nur weil Cancellation das Rennen gewann.

### CompactionEngine exponiert Intent, nicht Token-Buchhaltung

`CompactionEngine.compactIfNeeded(agent, trigger, signal)` akzeptiert `trigger: 'pressure' | 'context-overflow'`. Das Interface gewinnt keine Estimation-Methoden oder Token-Typen; `ctx.tokenMeter` bleibt der wiederverwendbare Accounting-Owner.

Für `pressure` löst compaction-basic die Adapter-eigene Kapazität und Exact-Target-Policy des durable Provider/Model-Targets auf und wendet dann die resultierende Threshold- und Retained-Tail-Budgets auf ein einheitliches `ctx.tokenMeter.measure()`-Ergebnis an. Unter Pressure kehrt es ohne Pruning zurück. Sobald Pressure qualifiziert, rewritten optionales `ctx.toolResultPruner` übergroße aktuelle Ergebnisse und compaction-basic misst durch dasselbe Meter erneut; sicherer Pressure überspringt den Modell-Call, während verbleibender Pressure aus der geprunten Surface auswählt und zusammenfasst. Dasselbe Singleton-Meter besitzt Range-Pricing, zitierte Source-Event-Accounting, überschattete Token-Counts und Nicht-schrumpfende-Summary-Rejection. Gemeinsame Defaults bleiben Threshold-Ratio `0.8`, Retained-History-Ratio `0.16`, Summarization-Provider/Model `''`, `maxTokens: 8192`, `compactionRetries: 1` und `auto: true`; optionale `modelPolicies`-Einträge überschreiben sie für ein exaktes Provider/Model-Paar.

Für kanonischen Overflow braucht compaction-basic keine Kapazitäts-Metadaten und umgeht skalaren Pressure und das normale Retained-Token-Budget. Es prunt zuerst, wählt dann die maximale Tool-balancierte Head-Range, während es die neueste unteilbare Einheit lässt, und versucht eine schrumpfende Summary-Compaction unter demselben Signal, wenn eine Range existiert. Der automatische Listener snapshotet `session.surface.replaceGeneration` und gibt `{ kind: 'retry' }` zurück, wann immer Pruning oder Summarization es erhöht. Das bleibt wahr, wenn Pruning landet, bevor spätere Summary-Arbeit wirft; Cancellation gewinnt weiterhin. Ein Backend, das ein Ergebnis ohne Ersetzung zurückgibt, kann Retry nicht autorisieren, während Pruning-only-Fortschritt einen Retry ohne `CompactionResult` autorisieren kann.

`maxOverflowRetries` ist optional und defaulted auf `1`; `0` deaktiviert Overflow-Recovery, ohne Pressure zu deaktivieren. `auto: false` registriert keinen der beiden automatischen Listener. Nicht-kanonische Fehler, erschöpfte Versuche, ein bereits abgebrochenes Signal, ein fehlendes geroutetes Modell, keine sichere Range, keine Generation-Änderung und Recovery-Throws vor jeder Ersetzung delegieren alle zum nächsten Listener. Ohne spätere Recovery meldet der Loop das ursprüngliche Provider-Fehler-Objekt und -Code. Ein Recovery-Throw, nachdem Generation fortgeschritten ist, autorisiert Retry aus durable Fortschritt; Cancellation oder Disposal bleibt autoritativ, selbst wenn Recovery-Arbeit nebenläufig abschließt.

Der Default-Summarizer löst explizite Konfiguration auf, dann die neueste geloggte Route, dann Agent-Options. Weil direkte `llm/stream`-Middleware diesen Auxiliar-Call rerouten kann, zeichnet `compaction/summary.{provider, model}` das finale mutable `GenerateOptions`-Target auf, das nach Dispatch beobachtet wurde, statt des Pre-Waterfall-Kandidaten.

## Testing

Unit-Tests decken die Final-Adapter-Normalisierungsgrenze, Closed-Turn-Retry-Nummerierung und -Reset, Cancellation und Disposal, Step-Boundary-Ordering, Routed-Envelope-Pressure, Pressure-gated Pruning, Pruning-only-Entlastung, Pruned-Input-Summarization, balancierte Overflow-Reduktion, durable Prune-Fortschritt vor späterem Failure, Generation-Proof, Caps, Delegation und Auxiliar-Call-Routing ab. Real-Loop-Tests decken geworfenen und In-Band-Overflow durch Pruning oder Summary-Compaction bis zu einem rekonstruierten Retry-Request ab.

## Erwogene Alternativen

- **Compaction-only-Felder zu pre-step hinzufügen** — abgelehnt, weil die kanonische durable Session und das Token-Meter bereits den Mess-Input besitzen; der generische Lifecycle muss kein zweites Envelope tragen.
- **Denselben nummerierten Step retryen** — abgelehnt, weil Recovery durable Events nach der fehlgeschlagenen Grenze anhängt. Ein neuer Step bewahrt balancierte Nesting und Rekonstruierbarkeit.
- **Retryen, wann immer `compactIfNeeded` ein Ergebnis zurückgibt** — abgelehnt, weil ein Custom-Backend Erfolg melden kann, ohne modell-sichtbaren Zustand zu ändern. `replaceGeneration` ist der autoritative Beweis.
- **compaction-basic Provider-Formulierung parsen lassen** — abgelehnt, weil Klassifikation zu Adaptern gehört und sowohl geworfene als auch In-Band-Zustellung abdecken muss.
- **Auf `AgentOptions.model` zurückfallen, wenn keine durable Route existiert** — abgelehnt, weil automatische Policy einen abgeschlossenen geloggten Request beschreiben muss. Headerloser Pressure und Recovery delegieren unverändert.

## Konsequenzen

Der nächste Pre-Step-Pressure-Check beschreibt den vorhergehenden abgeschlossenen gerouteten Request, einschließlich durabler Tool-Ergebnisse und neu geclaimtem Input. Optionales modell-freies Pruning entfernt vorhersagbaren Tool-Output-Bulk vor Summary-Auswahl und kann unabhängig retry-würdigen Fortschritt erzeugen. Kanonischer Overflow liefert den Auffang, wenn kein erfolgreicher Usage-Anker existiert. Recovery ist begrenzt, Cancellation-owned und monoton: Es retryt nur nach einer sichtbaren Surface-Generation-Änderung.

Die Kosten sind Pressure-Arbeit im geteilten Pre-Step-Waterfall und Adapter-maintainte Overflow-Klassifikation. Provider-Formulierung und heuristische Zeichen-Dichte bleiben Wartungsrisiken. Surface-Compaction kann weiterhin kein Envelope reparieren, das allein das Fenster überschreitet, keinen unteilbaren Nicht-Tool-Knoten spalten oder eine Tool-Einheit reparieren, deren nicht-prunbarer Rest übergroß bleibt. Der optionale Pruner kann ein sonst unteilbares Tool-Paar reparieren, wenn entfernbarer text-tragender Tool-Result-Inhalt der Bulk ist.

Die [Claimed-Pre-Step-Lifecycle](2026-07-31-claimed-pre-step-inbox-lifecycle.md) ersetzt den früheren Post-Step-Trigger dieser Note. Der Service-Split, das Standalone-Token-Meter, der Balanced-Range-Vertrag, das Log-recorded Lock, die Summary-Ersetzung und der einzige `summarize()`-Subclass-Hook bleiben unverändert.
