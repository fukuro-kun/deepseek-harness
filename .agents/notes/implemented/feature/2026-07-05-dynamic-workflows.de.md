# Agent Note: Dynamische Workflows — ein skriptgetriebener Multi-Agent-Orchestrierungs-Seam

Status: implemented

[English](2026-07-05-dynamic-workflows.md) | [中文](2026-07-05-dynamic-workflows.zh.md) | Deutsch

## Problem

Das harness kann EINE Aufgabe an EIN Child delegieren (`dsh-tool-subagent`), aber Arbeit, die sich über viele unabhängige Teile fächert — ein Audit über viele Dateien, eine Migration, mehrperspektivische Recherche, adversariale Verifikation von Befunden — zwingt das Modell, Turn für Turn zu orchestrieren: Jedes Zwischenergebnis landet im Eltern-Context, der Plan lebt nirgendwo durable, und Koordination kostet einen Modell-Roundtrip pro Schritt. Claude Code liefert diese Fähigkeit als [dynamic workflows](https://code.claude.com/docs/en/workflows): Das Modell schreibt ein JavaScript-Orchestrierungsskript, eine Runtime führt es aus, und das Skript — nicht die Konversation — hält die Schleife, die Verzweigung und die Zwischenergebnisse.

## Entscheidung

Eine Workflow-Capability-Familie unter `packages/workflow/` in der Form des Bash-Seams (Service Definition / Service Provider / Consumer), plus die Structured-Output-Grundlage, die sie auf dem Subagent-Seam braucht.

### Der Skriptvertrag (Claude-Code-kompatibel)

Ein Workflow-Call enthält JSON-`meta` (`name`, `description` und optional `whenToUse`/`phases`) und einen JavaScript-`script`-Body mit Top-Level-`await`, der einen JSON-Wert zurückgibt. Metadaten werden als Daten validiert und niemals evaluiert. Der Body erhält `agent(prompt, options)`, `parallel(thunks)`, `pipeline(items, ...stages)`, `phase(title)`, `log(message)` und `args`. Pipeline-Stages erhalten `(prev, item, index)` ohne Stage-übergreifende Barriere; fehlgeschlagene Children und gewöhnliche Stage-Fehler lösen das betroffene Item zu `null` auf und überspringen seine restlichen Stages. Claude Codes Determinismus-Einschränkungen sind zusammen mit Journaling verschoben, sodass kompatible Bodies nach dem Verschieben ihres Meta-Headers in den Parameter Uhr und Zufall verwenden dürfen.

Eine bewusste Strenge-DIVERGENZ von CC: Hook-Missbrauch — unbekannte oder verschobene Optionen (`effort`/`isolation`/`agentType`), fehlerhafte Argumente, Schemas außerhalb der unterstützten Teilmenge, überschrittene Caps, Seam-Start-Fehler — wirft einen `WorkflowError` mit `fatal: true`, und die Kombinatoren WERFEN fatale Fehler ERNEUT, statt das Item zu nullen. Ohne das löst sich eine falsch getippte Option in ein `null` auf, das von einem Child-Fehler nicht zu unterscheiden ist — der Accepted-then-ignored-Fehlermodus, den dieses Repo verbietet. Eine Ergänzung: Der `args`-Parameter des Tools ist ein JSON-OBJEKT (eine nackte Liste wird als Feld verpackt), damit das Wire-Schema ehrlich bleibt.

### Der Seam (dsh-workflow)

`ctx.workflowEngine` ist ein abstrakter `WorkflowEngine` in der Bash-Form — eine Engine pro Context, keine Named-Provider-Registry (Engines sind Deployment-Austausch, keine Ko-Residenten). `start(request)` wirft synchron für ein Skript, das nicht beginnen kann; das `result` eines zurückgegebenen `WorkflowRun` rejected NIEMALS (Fehler lösen als `stopReason: 'error' | 'cancelled'` auf). Die `workflow/*`-Events sind Observe-only-Emits, die DATENSNAPSHOTS tragen (ID + Meta; `workflow/end` lässt den Ergebniswert weg), pro Listener contained, im Spiegel von `subagent/start`/`subagent/end` — die Kontrolle bleibt beim Halter des Runs. Vokabular-Details: [subsystems/workflow.md](../../../../docs/subsystems/workflow.de.md).

### Die Engine (dsh-workflow-worker-thread): ein Worker-Thread pro Run

**Vertrauensprämisse**: Workflow-Skripte haben dasselbe Vertrauen wie der Bash-Zugriff des Modells. Die Engine enthält fehlerhafte Skripte und garantiert abgerechnete Ergebnisse, JSON-sichere Werte und Cancellation-Quiescence; sie verteidigt nicht gegen feindlichen Code. Ein VM-Context und ein Worker-Thread sind keine Sicherheitsgrenzen: Ein Skript kann zu Node-APIs mit prozessweiter Autorität entkommen. Sandboxing erfordert eine Separate-Process- oder isolated-vm-Engine hinter diesem Seam.

**Warum `node:worker_threads`**: Jeder Run erhält einen ungepoolten Worker. Ein VM-Context begrenzt die dokumentierte Skript-API, während Message-Port-RPC `agent()` zu hostseitigen Child-Loops brückt. Der Worker verhindert, dass synchrone Skriptarbeit den Host blockiert, stellt eine Serialisierungsgrenze bereit und erlaubt erzwungene Termination nach Cancellation. `isolated-vm` wurde wegen seines Wartungszustands und seiner Deployment-Anforderungen abgelehnt.

Der Host validiert Metadaten und parst den Body vor der Veröffentlichung. Private Enum-keyed Payload-Maps definieren das Wire-Protokoll; ausstehende Starts, veröffentlichte Child-Records, ein Cancellation-Signal, Worker-Death-Reaping, Ergebnis-Priorität und Disposal-Quiescence erhalten den Subagent-Run-Vertrag darüber. Die [Agent-Scope-Runtime-Design-Agent-Note](../architecture/2026-07-12-agent-scope-runtime-design.md#workflow-children-are-pending-starts-or-published-records) besitzt diese Race-Algorithmen.

Die Engine legt einen In-Process-`MessageChannel`-Testpfad offen, weil Main-Process-V8-Coverage Worker-Ausführung nicht sehen kann.

**Meta ist Daten**: Das schema-validierte `meta`-Feld erreicht den Seam als JSON und wird nur formvalidiert. Der Host evaluiert niemals ein Metadaten-Literal, was skriptgesteuerte Accessoren außerhalb der Worker-Isolation laufen ließe.

**Wertegrenze**: `materializeFromRealm` kopiert ausgehende Werte und lehnt Funktionen, Symbole, verschachteltes `undefined`, exotische Prototypen, Zyklen, Sparse Arrays und nicht-endliche Zahlen ab. Data-Property-Kopien machen `"__proto__"` sicher; Getter werden normal gelesen, und ein werfender Getter schlägt laut fehl. `args` überquert über `workerData` und wird vor der Exposition erneut geklont. Realm-Funktionen werden aufgerufen statt kopiert, und geworfene Werte verwenden einen totalen Renderer, sodass `result` nicht rejecten kann. Hook-Fehler sind Host-Realm-`WorkflowError`s, sodass Skripte auf `name` oder `code` statt auf `instanceof Error` verzweigen, wie im Engine-README dokumentiert. Concurrency-, Total-Agent-, Item-, Timeout- und Grace-Limits sind validierte Config.

### Der Consumer (`dsh-tool-workflow`)

Ein `workflow`-Tool im Spiegel der synchronen Form von `dsh-tool-subagent`: start, await, `try/finally`-Dispose, Abort-Bridge-`exec.signal`, nicht-`completed` → `isError`. Render-Intent: eine `generic`-Karte mit Titel aus dem `meta.name`-Parameter des Calls (Präsentation ist eine reine Funktion der Args). Die Tool-Beschreibung IST die modellzugewandte Authoring-Spezifikation. Die Usage-Policy wird mit dem Tool als eigener `tool:<toolName>`-Prompt-Abschnitt ausgeliefert (Explicit-Ask-only-Guidance — Tool-Guidance lebt in Tool-Plugins, nie in der Deployment-Persona); das harness hat kein Ultracode-artiges Effort-Gate.

Für eine Top-Level-Tool-Ausführung schreibt derselbe Consumer auch den Run und den tatsächlichen Member-Lifecycle als vier Log-only-`tool-workflow/*`-Events in die aufrufende Eltern-Session. Der Recording-Pfad beobachtet die Ausführung statt sie zu steuern: Sein erster Append-Fehler deaktiviert spätere Writes für diesen Run und hinterlässt ein legales Präfix, ohne das Tool-Result zu ändern. [`ui-workflow-run`](../../../../packages/client/ui-workflow-run/README.de.md) baut diese Fakten über die Conversation-Node-Engine als separate keyed Chat-Row wieder auf; die bestehende generische Tool-Row bleibt ihr eigener Präsentations-Owner. Die detaillierte Persistenz-, Replay-, Disclosure- und Live-Navigation-Entscheidung lebt in [durable Workflow-Runs in Chat](../../archived/feature/2026-08-10-durable-workflow-runs-in-chat.md).

### Die Grundlage: Structured Output auf dem Subagent-Seam

`SubagentStartRequest.outputSchema` ist von `dsh-subagent-in-process-driver` für beide In-Process-Backends implementiert. Jedes strukturierte Child erhält sein eigenes gescopte Capture-Tool, Anweisung und Enforcement-Registrierungen auf `child.ctx`; konkurrierende Children können unterschiedliche Schemas verwenden, ohne mutable Policy zu teilen, und das Disposieren des Child entfernt den gesamten Anhang.

Ein Output-Schema macht einen schema-validen committeten Capture für erfolgreiche Child-Vollendung obligatorisch. Die gescopte Runtime präsentiert Capture-Tool und Anweisung, committet nur ein erfolgreiches finales Outcome — einschließlich des umschließenden `run_code`-Outcome bei einem SDK-Call —, lehnt spätere Seiteneffekte ab, sobald der Capture pending ist, und stoppt das Child ohne weiteren Modellschritt nach dem Commit. Ein Validierungsfehler bleibt ein retrybarer Tool-Fehler; saubere Vollendung ohne committeten Capture rechnet als Fehler ab.

`ObjectJsonSchema` ist die objektwurzelige Consumer-Sicht der vereinheitlichten durchsetzbaren Raw-JSON-Schema-Teilmenge in `dsh-tools`; nicht unterstützte Keywords schlagen laut fehl, weil diese Wire-Daten wörtlich die Parameter des Capture-Tools werden. Die [Unified-JSON-Value-Schema-Agent-Note](../architecture/2026-07-20-unified-json-value-schema-dsl.md) besitzt Vokabular und Validierungssemantik, während die [Agent-Scope-Runtime-Design-Agent-Note](../architecture/2026-07-12-agent-scope-runtime-design.md#structured-output-commits-only-authoritative-outcomes) die Assembly-, Commit-, Guard- und Terminal-Stop-Algorithmen besitzt.

## Testing

Worker-seitige Logik läuft über einen In-Process-`MessageChannel`, damit V8-Coverage sie misst. Unit-Tests decken Skript-Helfer, fatale und nullable Fehler, JSON-Grenzen, Caps, Cancellation, Child-Ownership und Structured Output über echte Loops ab. Ein Built-Bin-Smoke führt das separat gebündelte `lib/worker.cjs` unter plain Node aus, ein With-Key-e2e treibt echte Child-Agents, und modellzugewandtes Workflow-Verhalten ist über sein besitzendes Beispiel snapshot-abgedeckt.

## Verschoben (dokumentierte Nicht-Ziele)

- **Hintergrund-Collection** (Start-Tool → Run-ID → Completion-Notice → Collect), entworfen zusammen mit der Shell-/Subagent-Hintergrund-Vereinheitlichung.
- **Journaling + Resume** (`resumeFromRunId`, gecachte agent()-Präfixe) — es zu implementieren würde CCs Determinismus-Verbote als Verschärfung des Skriptvertrags wieder einführen (Skripte dürfen die Uhr lesen).
- **Gespeicherte/gebündelte Workflows** (eine `.deepseek/workflows/`-Registry, Slash-Command-API) und **Skript-Persistenz in ein Run-Verzeichnis** (das Tool-Call-Event zeichnet das Skript bereits durable auf).
- **Verschachteltes `workflow()`**, **Token-`budget`** und die `effort`/`isolation`/`agentType`-Agent-Optionen (jede rejected laut mit einer Meldung, die sie als verschoben benennt).
- **Ein Wall-Clock-Timeout für den Gesamtrun** — Cancellation befreit den Caller immer (result rechnet innerhalb der Grace ab), sodass eine Gesamtlaufzeit-Obergrenze ein Policy-Knopf für das Hintergrund-Redesign ist, kein Korrektheitsbedürfnis hier.
- **Engine-Härtung jenseits von Worker-Threads**: eine isolated-vm- oder Separate-Process-Engine hinter demselben Seam (echtes Sandboxing; Speicherlimits).
- **ACP-Backend-Structured-Output** und **`toolFilter`** (beide weiterhin Capability-gegatet `false`).

## Erwogene Alternativen

- **Hostile-Value-Containment im Host** (trap-freie Proxy-Ablehnung, Accessor-nie-aufgerufene Descriptor-Walks, Realm-seitiges Vor-Rendering geworfener Werte, Realm-gebaute Promise-/Array-/Error-Klone mit struktureller Fatal-Erkennung): abgelehnt, weil jede Abwehr einen Autor adressiert, den die Vertrauensprämisse akzeptiert, während die Serialisierungsgrenze des Threads Realm-übergreifende Werte bereits konstruktiv total macht.
- **In-Process-`node:vm`-Ausführung**: mechanisch am einfachsten — kein RPC, kein Thread —, aber `start()` blockiert den Caller für den initialen synchronen Slice des Skripts, ein synchroner Spin hinter dem ersten await ist im Prozess nicht killbar (das vm-`timeout` deckt nur diesen ersten Slice ab), und `dispose()` könnte ein nicht abrechnendes Skript auf dem Host-Loop nur verwaist zurücklassen. Die Worker-Thread-Engine behält dieselbe VM-Context-Skript-API, während sie den Host entblockt und Termination real macht.
- **Hintergrund-Ausführung als Default** (CCs Form): verschoben; Foreground-synchron passt zum Schnitt von `dsh-tool-subagent`, und Hintergrund-Semantik sollte EINMAL über Shell/Subagent/Workflow entworfen werden statt pro Tool.
- **Workflow-Layer-JSON-Parsing für `agent({schema})`**: dupliziert ein Seam-Anliegen an einem Consumer, während das Capability-Flag des Seams unehrlich `false` blieb.
- **Meta im Skript als `export const meta = {...}` eingebettet** (CCs exaktes Format): hält Skripte in sich geschlossen und CC-Skripte drop-in-fähig, aber Meta zu erhalten erfordert das Evaluieren modellgeschriebenen Texts auf dem Host. Selbst ein leerer getimter VM-Context kann skriptgesteuerte Getter nicht begrenzen, wenn der Host das resultierende Objekt liest. Ein JSON-Parameter beseitigt Scanner-, Evaluierungs- und Host-Spin-Loch; der Preis ist, dass der Meta-Header eines CC-Skripts in den Parameter ziehen muss (der Body bleibt drop-in).
- **`ValueSchemaSpec` als `outputSchema`-Wire-Typ**: Die Autor-Form hat inzwischen äquivalentes Vokabular, aber ein Workflow liefert realm-fremde Raw-JSON-Schema-Daten; diese Runtime-Daten als vertrauenswürdige Autor-Deklaration auszugeben würde die Raw-Schema-Assertionsgrenze überspringen.
- **Eine Schema-Objekt-Bibliothek (zod oder das schemastery des Repos) für die Structured-Output-Teilmenge**: Das Schema ist Wire-Daten — plain JSON, das die VM-Realm-Grenze in `agent({schema})` überquert und wörtlich in den Parametern des Forced-Tools landet — genau dort, wo lebende Schema-Objekte nicht sitzen können; Raw-JSON-Schema zur Laufzeit zu konsumieren bräuchte zusätzlich einen Drittanbieter-Konverter (zod core emittiert nur JSON Schema, nicht umgekehrt), und es stellte eine zweite Schema-Sprache neben schemasterys Config-Rolle.
- **ajv für die Wertvalidierung**: Es validiert VOLL-JSON-Schema, sodass das Subset-Gate — der eigentliche Punkt des Moduls, da jedes akzeptierte Keyword eines sein muss, das das harness durchsetzt — ohnehin handgeschrieben bliebe; es kompiliert Validatoren über `new Function`; und es wäre die erste Runtime-Dependency von dsh-tools, nur um den ~70-zeiligen Wert-Walker zu ersetzen, während die pfadqualifizierte Jede-Verletzung-Fehlermeldung ohnehin custom bliebe.
- **Provider-JSON-Modus statt des Capture-Tools**: Er garantiert valides JSON, nicht Schema-Konformität, und seine Interaktion mit Tool-Calling ist unklar. Das Capture-Tool erhält In-Turn-Validierungs-Retries. Provider-seitige strikte Tool-Schemas können die akzeptierte Teilmenge später verengen, ohne dieses Design zu ändern.

## Konsequenzen

Fan-out-Pläne leben jetzt in erneut lauffähigen Skripten, und `outputSchema` liefert autoritative strukturierte Child-Ergebnisse. Jeder Run zahlt Worker-Startup- und Message-Port-RPC-Kosten, aber Host-Startup bleibt nicht-blockierend, Cancellation kann den Worker terminieren, und Serialisierung setzt die Wertegrenze durch. Worker-Threads sind keine Sicherheitsgrenze. Ungültige Optionen schlagen fehl statt zu Claude Codes `null` zu degradieren; Consumers behalten die Kontrolle über das Run-Handle, während Observer nur Snapshots erhalten. Top-Level-Web-Users erhalten zudem einen durable, replaybaren Workflow-Record, ohne den Execution-Seam zu erweitern oder die ursprüngliche Tool-Karte an Workflow-spezifische UI zu koppeln.
