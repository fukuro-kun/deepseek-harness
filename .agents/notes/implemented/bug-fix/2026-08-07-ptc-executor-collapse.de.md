# Agent Note: PTC mode collapses the executor, not just the wire
[English](2026-08-07-ptc-executor-collapse.md) | [中文](2026-08-07-ptc-executor-collapse.zh.md) | Deutsch

Status: implemented


## Problem

`mode: 'ptc'` kollabierte nur die Ankündigungsoberfläche, nicht die Ausführungsoberfläche. `wireSchemas()` schickte dem Modell genau ein Tool — `run_code` —, aber der Executor löste jeden Call über `get()` auf, das die vollständige sichtbare Map plus den reservierten Transport zurückgibt. Ein Modell, das einen nativen Tool-Namen emittierte (`write`, `read`, `bash`, `subagent`, …), umging `run_code` vollständig: Der Call durchlief die normale Pipeline und wurde ausgeführt, obwohl nie ein Schema dafür angekündigt worden war. Provider fangen nicht angekündigte Tool-Namen nicht ab, sodass Schema-Auslassung nichts durchsetzte.

Der Package-Vertrag benennt genau dieses Anti-Pattern: Schema-Auslassung ist keine Durchsetzung, wenn ein direkter Aufrufer sie umgehen kann; Ablehnung muss durch den Executor getestet werden.

## Decision

`ToolRuntime` löst aufrufbare Definitionen über ein neues privates `resolveExecution(name, scope, nested)` auf, das den Modus-Kollaps an der Operationsgrenze anwendet, die ihn besitzt. Wenn `modeFor(scope)` zu `ptc` auflöst, darf ein modell-direkter Call (`nested = false`) nur den reservierten `run_code`-Transport benennen; jeder native Name löst zu `undefined` auf und taucht als bestehender `UNKNOWN_TOOL`-Fehler des Executors auf, dessen Meldung den Weg zurück durch `run_code` nennt, weil der Name diesem Modell ja deklariert IST (ein bereits abortetes Caller-Signal bewahrt den Cancellation-Vertrag: `ABORTED_BEFORE_DISPATCH`, mit angewandtem Finalizer des sichtbaren Tools). Der effektive Scope-Modus umfasst von einem Agent-Preset geerbte Deklarationen, sodass sein Wire-Schema und seine Ausführungsrechte aligned bleiben. Ein kollabierter Call terminiert bei `createExecution` — der ersten Stufe von `prepare` — VOR der erweiterbaren Policy-Pipeline, sodass `tools/pre-execute`-Listener, Approval-`ask` und Guards nie einen Call beobachten, der deterministisch abgelehnt wird; ein Mensch wird nie um seine Genehmigung gebeten. Ein verschachtelter Sub-Dispatch (`nested = true` — ein gesetzter `parent`-Token, den nur das `run_code`-SDK-Binding im Produktionscode setzt) darf jedes sichtbare Tool aufrufen, sodass Programme jedes Binding behalten, das das generierte SDK deklarierte.

Vier Execution-Path-Lookups — `executionMode`, `dispatchToolBody`, `postExecute`, `normalizeDispatchResult` — laufen über `resolveExecution`. `createExecution` wendet denselben Kollaps über das geteilte `collapses(name, nested)`-Prädikat an, damit es einen kollabierten Call von einem genuin unbekannten Namen unterscheiden kann, bevor die Policy-Pipeline erreicht wird. Der öffentliche Registry-View (`get`) und die SDK-Projektion (`schemas`) behalten ihre Semantik: Presentation, Inspection und Binding-Enumeration sehen weiterhin die vollständige sichtbare Menge. Der Wire (`wireSchemas`) und der Executor sind jetzt einig. Ein kollabierter Call mit nicht-JSON-serialisierbaren Argumenten meldet den Parameter-`TypeError` (der Invalid-Args-Vertrag), nicht `UNKNOWN_TOOL` — der Body läuft trotzdem nie und die Policy ebenso wenig.

Der Kollaps ist eine sicherheitsrelevante Invariante, daher wird die Akzeptanz durch den Executor gepinnt: Ein modell-direkter nativer Call unter `ptc` liefert `UNKNOWN_TOOL`, dasselbe Tool über einen SDK-Sub-Dispatch gelingt, und `native`/`both`-Direktcalls sowie `run_code` selbst bleiben unverändert. Die grundlegende [PTC-Mode-Basis](../feature/2026-06-15-ptc.de.md) besitzt das Transport-Design, auf das diese Note die Ausführungsgrenze legt.

## Alternatives considered

### `get()` / den Registry-View nach Modus filtern

Der View wird von Presentern, `tool-cordis`-Inspection und dem SDK-Binder konsumiert; ihn zu kollabieren würde Tools vor der Programmoberfläche verbergen, die weiterhin binden müssen, und würde den öffentlichen Auflösungsvertrag für jeden Consumer ändern, nicht nur für den Executor.

### Am agent-loop-Eingang filtern

Der Loop ist nicht der einzige Executor-Aufrufer, und die relevante Unterscheidung (modell-direkt vs. Transport-Sub-Dispatch) hängt am Execution-Input, nicht an der Loop-Grenze. Ein Eingangsfilter würde außerdem PTC-Mode-Semantik nachbauen, die die Registry bereits besitzt.

### Über einen ausgelieferten Guard ablehnen

Guards sind eine optionale Plugin-Erweiterung; eine Sicherheitsinvariante darf nicht davon abhängen, dass ein Deployment das richtige Plugin komponiert. Die Registry besitzt die Modus-Entscheidung und muss sie selbst durchsetzen.

### Nur Schema-Auslassung beibehalten (Status quo)

Kein Provider garantiert das Abfangen nicht angekündigter Namen; die gemeldete Session beweist, dass es nicht geschieht.

## Consequences

- `mode: 'ptc'` setzt jetzt durch, was es ankündigt: Ein modell-direkter nativer Call wird zu `UNKNOWN_TOOL`, den das Modell korrigieren kann, indem es über `run_code` routet (ein vorab aborteter Call löst weiterhin `ABORTED_BEFORE_DISPATCH` auf, gemäß Cancellation-Vertrag).
- `both`- und `native`-Verhalten sind unverändert; SDK-Sub-Dispatches sind unverändert (der `parent`-Token ist der Diskriminator).
- Ein kollabierter Call wird bei `prepare` abgelehnt, VOR der erweiterbaren Policy-Pipeline: pre-execute-Listener, Approval-`ask` und Guards beobachten ihn nie. `executionMode` failt ebenfalls closed (`exclusive`), sodass Scheduling keinen beobachtbaren Unterschied hat.
- Native-Tool-Guidance-Sektionen (`tool:read`, `tool:write`, `tool:bash` usw.) bleiben im System Prompt, weil sie Capabilities beschreiben, die sowohl über das generierte SDK als auch über native Function Calls verfügbar sind, und mehrere tragen Cross-Tool-Routing-Policy (`read` vor `bash cat`, `read` vor `write` für die Default-fs-observation-policy, `subagent` vor `workflow`), die keine einzelne Tool-Beschreibung halten kann. Der Executor-Kollaps, nicht Prompt-Filterung, verhindert modell-direkte native Calls.
- Der Prompt STELLT den Kollaps dar, in der `tools:ptc-only`-Sektion, die vor den first-party Per-Tool-Guidances eingeordnet ist. Jene Sektionen nennen ihr Tool, ohne zu qualifizieren, wie es erreicht wird, sodass ein Modell, das nur sie las, einen nativen Call emittierte, `UNKNOWN_TOOL` für ein vom selben Prompt deklariertes Tool erhielt und schloss, das Deployment sei inkonsistent, statt sich selbst zu korrigieren. Die Ablehnung trägt aus demselben Grund die Route. Die TypeScript-SDK-Sektion wiederholt die Unterscheidung neben den generierten Deklarationen, labelt sie als program-only Bindings und stellt klar, dass nur separat gelieferte Tool-Schemas Direktcall-Verfügbarkeit gewähren. Weil die Deklarationsliste sonst als native Tool-Verfügbarkeit gelesen werden kann, emittiert die Sektion einen vollständigen `run_code`-Call um `tools.bash(...)`, wenn das aktuelle `bash`-Parameter-Schema die Beispielargumente akzeptiert. `both` rendert die Regel leer: Seine nativen Calls werden ja ausgeführt, sie dort zu behaupten wäre falsch — darum teilt `both-mode-turn` nicht mehr den Expected-Prompt von `ptc-turn`.
- Jeder künftige Composite-Transport, der einen `parent`-Token setzt, optet seine Sub-Dispatches in die vollständige Tabelle, passend zur Nested-Call-Semantik, die der Token bereits dokumentiert.
