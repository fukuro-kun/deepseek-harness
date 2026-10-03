# Agent Note: Parallele Tool-Aufruf-Ausführung nach Aufrufsicherheit

Status: implemented

[English](2026-07-10-parallel-tool-call-execution.md) | [中文](2026-07-10-parallel-tool-call-execution.zh.md) | Deutsch

## Problem

Eine assistant-Nachricht kann mehrere gleichrangige `tool-call`-Blöcke enthalten. Serielles Ausführen addiert die Latenz unabhängiger Lesungen und Web-Requests, obwohl das Modell sie bereits zusammen angefordert hat.

Nebenläufigkeit ist eine Host-Scheduling-Angelegenheit, keine modellseitige Tool-Metadaten. Der Loop muss entscheiden, welche Aufrufe sich überlappen dürfen, ohne Tool-Namen hartzukodieren oder Scheduling-Policy im JSON Schema offenzulegen.

Das Session-Log bleibt autoritativ: Jeder gestartete Aufruf hat ein Audit-Event, gewöhnliche Fertigstellung und Abbruch paaren Aufrufe mit Ergebnissen, und die Modell-history beobachtet committed Ergebnisse in der ursprünglichen Aufrufreihenfolge, unabhängig von der Fertigstellungsreihenfolge.

## Decision

Jedes Tool kann einen optionalen `isConcurrencySafe(args)`-Klassifizierer bereitstellen. Er ist synchron und rein: Er prüft nur die geparsten Argumente des aktuellen Aufrufs und führt weder I/O noch Mutation durch. Nur ein explizites `true` wählt sich ein; ein fehlender Klassifizierer, ungültige Argumente, ein werfender Klassifizierer oder jeder andere Rückgabewert macht den Aufruf exklusiv. Der kanonische Typvertrag liegt in den [Tool-Datenstrukturen](../../../../docs/subsystems/tools.de.md).

Der Klassifizierer ist bewusst unär. `true` zurückzugeben ist das Versprechen des Tools, dass dieser Aufruf mit jedem gleichrangigen Aufruf überlappen darf, der ebenfalls `true` zurückgibt; der Scheduler vergleicht keine Aufrufe und beweist nicht, dass ihre Ressourcenzugriffe kompatibel sind.

Der unäre Klassifizierer bleibt eingabesensitiv. Ein Tool kann eine schreibgeschützte Operation als parallel und eine mutierende als exklusiv klassifizieren. Die Schnittstelle kann keine relationalen Regeln wie "diese Schreibzugriffe sind nur sicher, wenn ihre Pfade verschieden sind" ausdrücken, daher bleibt ein Aufruf, dessen Sicherheit von einem Geschwister abhängt, exklusiv.

`defineTool()` validiert Argumente, bevor es einen typisierten Klassifizierer aufruft. Ungültige Argumente klassifizieren als exklusiv und erzeugen den gewöhnlichen Argumentfehler nur, wenn der Aufruf ausgeführt wird. `ctx.tools.executionMode(exec)` löst die lebende Tool-Definition auf und gibt den getaggten `parallel`- oder `exclusive`-Modus zurück; unbekannte Tools fallen geschlossen auf exklusiv.

Ein getaggter Modus statt einer öffentlichen booleschen Scheduler-API hält ressourcenbewusste Varianten darstellbar, ohne den Klassifizierervertrag zu ändern.

## Scheduling and ordering

Der Loop wartet auf die vollständige assistant-Nachricht, parst jeden Aufruf einmal, erzeugt für jeden Aufruf eine eigene `ToolExecution` und scannt sie in Modellreihenfolge. Aufeinanderfolgende parallele Aufrufe bilden eine Gruppe; jeder exklusive Aufruf bildet eine Singleton-Gruppe und eine Ordnungsbarriere. Gruppen laufen sequenziell. Die Klassifikation ist träge: Der Scheduler löst den nächsten Aufruf nach jeder Barriere auf und klassifiziert jeden späteren Aufruf neu, bevor er einen parallelen Pool auffüllt. Wenn eine Registry-Mutation diesen Aufruf exklusiv macht, leert sich der aktuelle Pool, bevor der Aufruf als nächste Barriere startet.

Zum Beispiel:

```text
[parallel read(A), parallel read(B), exclusive write(A), parallel read(C)]

→ [read(A), read(B)]
→ [write(A)]
→ [read(C)]
```

`read(A)` und `read(B)` dürfen sich überlappen. `write(A)` startet, nachdem beide fertig sind, und `read(C)` startet nach der Schreiboperation.

Jede Gruppe nutzt einen rollenden Pool, begrenzt durch `maxParallelToolCalls`: Der Loop startet Aufrufe in Modellreihenfolge bis zur Grenze und startet einen weiteren, sobald einer abrechnet. Eine exklusive Gruppe ist ein Pool der Größe eins. Eine Grenze von `1` bewahrt serielle Ausführung.

Nur Dispatch und der Tool-Body überlappen. `tools/pre-execute` und `tools/post-execute` laufen in Modellreihenfolge, weil Middleware ordnungsabhängigen Zustand führen kann. `tools/execute`-Wrapper laufen um nebenläufige Dispatches und müssen daher über verschiedene Ausführungen hinweg reentrant sein.

Jeder gestartete Aufruf hängt `tool/call` unmittelbar vor seinem pre-execute-Gate an. Abgeschlossene Dispatches belegen Modellreihenfolge-Slots, und ein Commit-Cursor hängt `tool/result` an und sammelt `additionalContexts` nur, wenn der nächste Slot bereit ist. Live-Oberflächen können mehrere ausstehende Aufrufe zeigen, doch Ergebnisse und Post-Tool-Kontext bleiben modellgeordnet.

Ein Abbruch vor Gruppenstart zeichnet keine Aufrufe dieser Gruppe auf. Ein Abbruch während einer Gruppe stoppt das Auffüllen, wartet auf bereits gestartete Aufrufe, committed ihre Ergebnisse der Reihe nach, leert akzeptierten Batch-Kontext nach diesen Ergebnissen und beendet den Schritt dann über den bestehenden Abbruchpfad. Aufrufe, die nie starten, haben kein Audit-Event. Ein unerwarteter Scheduler-Fehlschlag stoppt neue Dispatches, wartet auf die Abrechnung jedes bereits gestarteten Dispatch und wirft den ersten Fehlschlag erneut. Da dieser Fehlschlag terminaler interner Zustand ist und kein Tool-Ergebnis, erfindet der Loop keine Tool-Ergebnisse für zurückgewiesene oder uncommittete Aufrufe.

PTC mode bleibt außerhalb dieses Schedulers, weil das Modell einen nativen `run_code`-Aufruf emittiert. `run_code` und seine interne Dispatch-Queue bleiben seriell; native Geschwisteraufrufe in `mode: 'both'` nutzen den normalen Scheduler.

## Safety contract

Ein Tool, das `true` zurückgibt, verspricht, dass sein Body sicher gleichzeitig mit anderen parallelen Aufrufen laufen kann. Es darf die parent-Session oder anderen parent-eigenen Zustand nicht direkt mutieren; es gibt seine Ausgaben an den Loop zurück, der sie in Modellreihenfolge committet.

Jeder während der Ausführung berührte geteilte Zustand muss nebenläufigkeitssicher sein. Das schließt Tool-Wrapper und Provider ein: Sie dürfen intern serialisieren oder eigene Kapazität erzwingen, müssen aber nebenläufigen Dispatch ohne Zustandskorruption unterstützen.

## Configuration and declarations

`maxParallelToolCalls` ist eine positive AgentLoop-Deployment-Obergrenze, die jeder von der Factory erzeugte agent teilt. Sie ist standardmäßig `10`; `1` bewahrt serielle Ausführung. Exakte Felder und Defaults stehen im generierten [Konfigurationskatalog](../../../../docs/config-catalog.de.md).

Die ausgelieferten Deklarationen sind konservativ. Web-Suche, Web-Fetch, Dateisystem-Lesen, die Session-Query-trace/read-Tools und subagent-Delegation wählen sich ein — Delegation, weil ein child in seiner eigenen Session arbeitet und sein Lauf die parent-Session nie mutiert, wobei die geschwisterliche Workspace-Koordination dem Modell obliegt ([parallele-subagent-Agent-Note](../../archived/feature/2026-08-09-parallel-subagent-delegations.md)). Dateisystem-Schreiben und -Edits, bash-Tools, die Session-Query-search-Tools, Workflow, Nutzerinteraktion, todo-Mutation, PTC mode und Cordis-Mutationstools bleiben exklusiv. Bash hat keinen bewiesenen eingabesensitiven Klassifizierer und bleibt exklusiv.

Dateisystem-Lesen stützt sich auf eine schmale Recorder-Ausnahme: Seine synchronen Beobachtungs-Updates können außer der Reihe abrechnen, doch Schreiben und Editieren prüfen die beobachtete Version vor der Mutation erneut, sodass veralteter Zustand nur `FS_STALE_VERSION` ergibt.

## Verification

Unit-Abdeckung pinnt geschlossene Klassifikation, typisierte Argumentvalidierung, Gruppierung, Barrieren, Live-Neuklassifikation nach Registry-Ersetzung, die rollende Obergrenze, eigene Ausführungsobjekte, Middleware-Reihenfolge, geordnete Ergebnisse und Kontext, Abbruch-Leerung und Scheduler-Fehlschlag-quiescence. First-party-Tests pinnen jede parallele Deklaration.

Snapshot-Abdeckung pinnt den sichtbaren Mehraufruf-transcript: Ausstehende Aufrufe dürfen überlappen, während abgeschlossene Ergebnisse modellgeordnet bleiben. PTC-mode-Abdeckung pinnt seine serielle Grenze. Kein provider-gestütztes e2e ist nötig, weil Scheduling deterministisches Loop-Verhalten ist.

## Alternatives considered

**Serielle Ausführung beibehalten.** Das vermeidet neue Ordnungs- und Abbruchfälle, behält aber unnötige Latenz für unabhängige Geschwisteraufrufe.

**Ein Tool-Level-Boolean nutzen.** Ein festes `supportsParallelToolCalls`-Flag ist kleiner, kann aber nicht zwischen schreibgeschützten und mutierenden Operationen eines Tools unterscheiden. Der argumentsensitive Klassifizierer bewahrt diese Unterscheidung.

**Zustandsbehaftete Klassifikation nutzen.** Dem Klassifizierer einen lebenden agent, eine Registry oder I/O-Zugriff zu geben, macht die Entscheidung vom Zeitpunkt ihres Laufs abhängig und erzeugt eine Lücke zwischen Klassifikation und Dispatch. Veränderliche Autorisierung und Veraltungsprüfungen bleiben Ausführungszeit-Aufgaben.

**Geschwister- oder ressourcenbewusste Klassifikation nutzen.** Der Scheduler könnte Aufrufe paarweise vergleichen oder jeden Aufruf Ressourcen-Lese-/Schreibansprüche deklarieren lassen. Das kann nicht-konfligierende Schreibzugriffe parallelisieren, erfordert aber geteilte Ressourcenidentität und Konfliktsemantik über unverbundene Tools hinweg. Der unäre Vertrag verzichtet stattdessen auf diese Nebenläufigkeit und schließt fail-closed, wenn Sicherheit relational ist.

**Die gesamte Tool-Pipeline parallelisieren.** Das hält den Loop auf der öffentlichen Ein-Aufruf-API, lässt aber pre- und post-execute-Middleware nebenläufig laufen. Bestehende Guards und Hook-Bridges können geordneten Zustand tragen, daher überlappt nur Dispatch.

**Gestufte Methoden oder einen Scheduling-waterfall offenlegen.** Öffentliche `prepare`-/`dispatch`-/`finalize`-Methoden oder ein `tools/execution-mode`-Event fügen Erweiterungsfläche hinzu, bevor ein anderer Consumer sie braucht. Der Loop nutzt eine interne Scheduler-Sicht, während `executionMode(exec)` einen Einstiegspunkt für einen Policy-Hook lässt.

**Scheduler-Fehlschläge in Tool-Ergebnisse umwandeln.** AgentLoop kann nicht feststellen, ob ein zurückgewiesener Dispatch den Tool-Body aufgerufen hat; ToolRuntime besitzt Body-Aufrufzustand und typisierte Tool-Ergebnisse. Interne Scheduler-Fehlschläge bleiben daher terminal statt als `ABORTED`-Ergebnisse umklassifiziert zu werden.

**Aufrufe starten, während das Modell streamt.** Das kann Latenz weiter senken, ändert aber assistant-Nachricht-Autorität, Replay und Aufruf/Ergebnis-Paarung. Der Scheduler startet erst, nachdem die assistant-Nachricht vollständig ist.

**Fenster fester Größe nutzen.** Auf jeden Aufruf eines Fensters vor dem Start des nächsten zu warten lässt Kapazität hinter einem langsamen Aufruf brachliegen. Der rollende Pool bewahrt die Obergrenze ohne diese Verzögerung.

**Nebenläufigkeits-Metadaten dem Modell offenlegen.** Das Modell kann bereits Geschwisteraufrufe emittieren. Host-Scheduling-Metadaten würden Requests vergrößern, ohne die Tool-Wahl zu verbessern.

## Consequences

Das Design ist fail-closed und für Tool-Autoren einfach, kann aber keine Nebenläufigkeit ausnutzen, deren Sicherheit vom Vergleich von Geschwistern abhängt. Ein Tool, das sich zu breit einschreibt, kann latente Shared-State-Races freilegen.

Parallele Aufrufe können in Fällen beginnen, in denen serielle Ausführung vor ihrem Erreichen abgebrochen hätte. Der Scheduler zeichnet daher nur gestartete Aufrufe auf, leert sie beim Abbruch und startet nach einem Abbruch niemals Ersatzaufrufe.

Geordnete Commits können ein schnelles Ergebnis hinter einem langsamen früheren Geschwister zurückhalten. Das bewahrt Replay- und Modell-history-Reihenfolge, während Live-Oberflächen weiterhin ausstehenden Fortschritt zeigen.

Nebenläufige externe Aufrufe können um Quota oder Prozesskapazität konkurrieren. Provider besitzen ihre Kapazitätskontrollen; die Loop-Obergrenze begrenzt nur Aufrufe aus einem agent-Schritt.

Tool-Registrierung ist eine Scheduling-Grenze. Registry-Mutationen betreffen noch nicht gestartete Aufrufe, weil der Scheduler nach jeder Barriere und vor jeder Pool-Auffüllung neu klassifiziert. Bereits gestartete Aufrufe behalten die Scheduling-Entscheidung, unter der sie in den Pool eingetreten sind.

Ein terminaler Scheduler-Fehlschlag kann aufgezeichnete Aufrufe ohne Ergebnisse hinterlassen, bevor der fehlgeschlagene Schritt schließt. Das Warten auf lebende Dispatches bewahrt quiescence, ohne diese internen Fehlschläge als Tool-Ergebnisse falsch zu melden.
