# Agent Note: Kooperative Tool-Cancellation an der Registry-Grenze
[English](2026-07-19-cooperative-tool-cancellation.md) | [中文](2026-07-19-cooperative-tool-cancellation.zh.md) | Deutsch

Status: implemented


## Problem

Jeder getypte Tool-Aufruf braucht ein Caller-eigenes Cancellation-Signal. Ein optionales `ToolExecutionInput.signal` lässt direkte Caller Ownership weglassen, macht `exec.signal` in jedem Tool-Body optional und ermutigt Registry-Fallbacks, die die tatsächliche Lifetime des Callers nicht repräsentieren können.

Die Pipeline hat außerdem an verschiedenen Stufen unterschiedliche Mutabilitätsbedürfnisse. Tool-Implementierungen, Pre-Policy, Post-Policy und Ergebnis-Observer leihen Cancellation-State nur, während ein Around-Dispatch-Wrapper das Signal vorübergehend ersetzen muss, um eine Deadline oder einen anderen lexikalen Cancellation-Scope hinzuzufügen. Ein einziger mutabler öffentlicher Typ gewährt Mutation entweder zu breit oder verhindert jene Komposition.

Cancellation kann vor der Policy, während eines Approval, innerhalb eines Around-Dispatch-Waits, nach dem Start eines Tool-Bodys oder während Post-Policy wartet eintreffen. Ein undifferenziertes `ABORTED`-Ergebnis kann durable Consumers nicht sagen, ob Body-Seiteneffekte möglich waren. Ein Tool-Promise gegen Cancellation zu racen ist kein sicherer Fallback, weil verlassene Same-Process-Arbeit weiterläuft, nachdem die Registry Abschluss meldet.

## Entscheidung

`ToolExecutionInput.signal` ist ein Pflicht-Readonly-`AbortSignal`. `ToolExecution.signal` und `ToolRunContext.signal` sind daher ebenfalls Pflicht und Readonly. Jeder getypte Caller liefert das Signal, das er besitzt; die Registry bietet weder Overload, Default-Controller, Never-Abort-Sentinel noch einen Convenience-Ausführungspfad.

`ToolDefinition.execute(args, exec)` behält seine bestehende Signatur. `defineTool()` typet `exec.signal` kontextuell als Pflicht-`AbortSignal`, sodass jedes registrierte TypeScript-Tool Cancellation ohne Cast beobachten oder forwarden kann. First-Party-direkte Caller und geschachtelte PTC-Modus-Dispatches reichen ihr aktuelles Operations-Signal explizit weiter.

Die Registry vertraut diesem getypten Same-Process-Contract. Sie führt keine Runtime-`AbortSignal`-Validierung durch und fügt keine Hostile-Input-Tests für ein weggelassenes oder fehlerhaftes Signal hinzu. Validierung bleibt an Parser-/Config-, Modell-/Tool-JSON-, Durable-/Datei-, Worker-, Prozess- und Wire-Grenzen; ungetyptes JavaScript, das das TypeScript-Interface verletzt, hat keinen Kompatibilitäts-Contract.

### Mutabilität folgt der Pipeline-Stufe

`ToolDispatchExecution` ist identisch zu `ToolExecution`, außer dass sein Pflicht-`signal` mutabel ist. Nur der `tools/execute`-Waterfall erhält diesen Typ. Pre-Policy, Post-Policy, Ergebnis-Observer, Guards und Tool-Implementierungen erhalten Readonly-Views eines privaten registry-eigenen mutablen Run-Objekts.

Ein Around-Dispatch-Wrapper darf `exec.signal` für seine delegierte Lifetime ersetzen, kann es aber nicht typsicher löschen oder `undefined` zuweisen. Die Registry capturiert das Pflicht-Caller-Signal außerhalb jenes mutablen Objekts, fusioniert jede Wrapper-Ersetzung unmittelbar vor dem Body-Aufruf mit dem Caller-Signal, entfernt Dispatch-scoped Listener nach dem Settlement und stellt das Pflicht-Upstream-Signal bedingungslos wieder her.

### Cancellation-Codes zeichnen auf, ob Dispatch stattfand

`dsh-tools` exportiert `TOOL_ABORTED = 'ABORTED'` und `TOOL_ABORTED_BEFORE_DISPATCH = 'ABORTED_BEFORE_DISPATCH'`. Die Registry zeichnet den Body-Aufruf unmittelbar vor dem Aufruf von `ToolDefinition.execute()` auf.

`ABORTED_BEFORE_DISPATCH` trägt `{ name: 'AbortError' }` und Modelltext `Error: tool call aborted before dispatch`. Es gilt, wann immer Cancellation den Body-Aufruf verhindert — einschließlich Pre-aborted Entry, Cancellation während Pre-Policy oder Approval, ein aborted Wrapper-Signal, ein Wrapper-Erfolg, der vor der Delegation von Caller-Cancellation überholt wurde, und Agent-Loop-Geschwister, die nach Turn-Cancellation übersprungen werden.

`ABORTED` trägt Modelltext `Error: tool call aborted` und gilt nur, nachdem der Body aufgerufen wurde — einschließlich Cancellation, während ein Around-Wrapper oder Post-Policy-Listener nach dem Body-Abschluss wartet. Ein Denial, Wrapper-Fehler, Tool-Fehler oder Post-Policy-Fehler bleibt spezifischer als generische Cancellation. Ein von der Timeout-Policy besessener Timeout bleibt `TOOL_TIMEOUT`, und Contexts, die aufgeschoben wurden, bevor ein erfolgreiches Ergebnis ersetzt ist, bleiben attached.

### Pre-aborted Entry kürzt nach der Materialisierung kurz

Die Registry erzeugt zuerst das Call-Token, snapshotet den optionalen Final-Content-Callback der sichtbaren Definition und snapshotet und friert die Argumente verlustfrei ein. Ein Argument-Materialisierungsfehler gewinnt selbst dann, wenn das Caller-Signal bereits aborted ist. Vor dem finalen Content snapshotet die Registry außerdem das Kandidaten-Ergebnis verlustfrei und wandelt einen Ergebnis-Snapshot-Fehler in einen gewöhnlichen Fehler um, sodass der Callback seine Content-Invariante weiterhin durchsetzen kann. Nach erfolgreicher Argument-Materialisierung überspringt ein pre-aborted Signal `tools/pre-execute`, Approval, `tools/execute`, `tools/post-execute` und den Tool-Body und reicht dann `ABORTED_BEFORE_DISPATCH` durch jenen reinen Content-Callback, bevor exakt ein gefrorenes autoritatives `tools/result` veröffentlicht wird.

### Gestartete Arbeit erreicht weiterhin Quiescence

Sobald ein Tool-Body startet, wartet die Registry ihn ab. Cancellation erreicht den Body über das fusionierte Signal, ract oder verlässt sein Promise aber niemals. Eine kooperative Implementierung stoppt oder forwarded Cancellation und settelt, nachdem ihre eigene Arbeit Quiescence erreicht; eine unkooperative Same-Process-Implementierung kann die Registry unbegrenzt pending halten. Prozess-, Worker-, Netzwerk- und Provider-Schichten behalten die Verantwortung für ihre eigenen Terminationsmechanismen.

Diese Entscheidung verlangt Cancellation nur an der Tool-Aufrufgrenze. Signale auf asynchronen Capabilities zur Pflicht zu machen, die aus Tool-Bodys erreichbar sind, ist eine separate Migration, vorgeschlagen in [Required cancellation through tool-reachable capability seams](../../proposed/architecture/2026-07-19-required-cancellation-through-tool-capability-seams.de.md).

## Verifikation

[`execution-signal-types.spec.ts`](../../../../packages/core/tools/tests/execution-signal-types.spec.ts) beweist die Pflicht-exakten Signal-Typen, Readonly-Observer- und -Tool-Views, die mutable-aber-pflichtige Around-Dispatch-View und `defineTool()`-Inference. [`tools.spec.ts`](../../../../packages/core/tools/tests/tools.spec.ts) deckt Pre-aborted-Materialisierung, Phase-Skipping, Policy- und Wrapper-Races, Body-Aufruf-Klassifizierung, Caller-Signal-Fusion, Fehler-Präzedenz, Context-Retention und quiescentes Drainage ab. [`tool-calls.spec.ts`](../../../../packages/core/agent-loop/tests/tool-calls.spec.ts) und [`contract-regressions.spec.ts`](../../../../packages/core/agent-loop/tests/contract-regressions.spec.ts) decken balancierte durable Ergebnisse für nicht-dispatcte Geschwister ab. [`ptc.spec.ts`](../../../../packages/core/tools/tests/ptc.spec.ts) und First-Party-Integration-Suites decken explizites Forwarding ab, während [`timeout-policy.spec.ts`](../../../../packages/guard/timeout-policy/tests/timeout-policy.spec.ts) Timeout-Ownership bewahrt.

Kein Registry-Test kann beweisen, dass beliebiger Third-Party-Same-Process-Code das Signal beobachtet oder in begrenzter Zeit stoppt. Capability-Tests beweisen weiterhin Cancellation und Quiescence an der Grenze, die jeden Seiteneffekt besitzt.

## Erwogene Alternativen

**Das Signal optional lassen und einen Fallback synthetisieren.** Abgelehnt, weil ein registry-eigener Fallback keine Caller-Lifetime hat, die er repräsentieren könnte, und genau das Weglassen bewahrt, das der Typ verhindern soll.

**`AbortSignal` zur Laufzeit validieren.** Abgelehnt, weil dies eine getypte Same-Process-Grenze ist, keine Serialisierungsgrenze. Runtime-Prüfungen würden den statischen Contract duplizieren, ohne kooperative Nutzung durchsetzbar zu machen.

**`supportsCancellation`-Metadaten, Callback-Arity-Checks oder Signal-Use-Linting hinzufügen.** Abgelehnt, weil keines davon beweist, dass asynchrone Arbeit Cancellation beobachtet oder korrekt forwarded. Verfügbarkeit ist ein Type-Contract; Verhalten bleibt Tool- und Capability-Verantwortung.

**Einen mutablen Execution-Typ an jede Stufe exponieren.** Abgelehnt, weil Observer und Tool-Implementierungen das Signal nur leihen. Stufenspezifische Typen machen Ersetzung nur dort möglich, wo die Pipeline diese Operation besitzt.

**Around-Wrappern das Ersetzen des Signals verbieten.** Abgelehnt, weil Deadlines und geschachtelte Operations-Scopes lexikalische Ableitung brauchen. Das Capturen und Fusionieren des Caller-Signals bewahrt Komposition, ohne Detachment zu erlauben.

**Das Tool-Promise gegen Cancellation racen.** Abgelehnt, weil es Abschluss meldet, während Seiteneffekte noch leben können — ein Verstoß gegen die [Quiescent-Disposal-Regel](../../../../docs/defensive-patterns.de.md#dispose-must-reach-quiescence-not-just-request-it).

## Konsequenzen

- TypeScript lehnt jedes `ToolExecutionInput` ab, das `signal` weglässt, jede Tool- oder Observer-Mutation eines Readonly-Signals und jeden Around-Dispatch-Versuch, das Signal zu entfernen.
- Durable Consumers können Calls, deren Body Seiteneffekte erzeugt haben könnte (`ABORTED`), von Calls unterscheiden, die den Body nie betraten (`ABORTED_BEFORE_DISPATCH`).
- Die Änderung ist absichtlich breaking unter der Pre-Release-Haltung des Repository; kein Kompatibilitäts-Overload oder Runtime-Fallback bleibt.
- Kooperative Tools stoppen prompt und erreichen Quiescence; eine Implementierung, die ihr Signal ignoriert, bleibt als pending Call beobachtbar.
- Downstream-Capability-Interfaces bleiben unverändert, bis die verlinkte vorgeschlagene Agent Note akzeptiert und implementiert ist.
