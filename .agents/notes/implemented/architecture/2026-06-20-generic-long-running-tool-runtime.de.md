# Agent Note: Die background job runtime (`ctx.jobs`) und generische task-control tools
[English](2026-06-20-generic-long-running-tool-runtime.md) | [中文](2026-06-20-generic-long-running-tool-runtime.zh.md) | Deutsch

Status: implemented


## Problem

Background bash vereinte ursprünglich zwei Verantwortlichkeiten: der bash-executor führte Prozesse aus und verwaltete zugleich job ids, ownership, inkrementelle Lesezugriffe, cancellation, completion listener und model-facing-control tools. Das Hinzufügen von background subagents erforderte denselben lifecycle und denselben interaction contract. Dieser contract für jede long-running capability unabhängig zu implementieren, würde Isolation, cleanup, Benachrichtigung und prompt-Verhalten duplizieren und dem model für jeden producer ein anderes collect-and-stop-Protokoll beibringen.

Die job registry, die control tools und die completion notices bilden eine einzige harness capability. Bash und subagents sollen execution-spezifische hooks liefern, ohne das generische task-Verhalten zu besitzen.

## Entscheidung

Die `jobs/`-package-Gruppe besitzt die background-job-semantics:

- `@deepseek-ai/dsh-jobs` registriert laufende Arbeit als `ctx.jobs` und besitzt job ids, authorization, snapshots, Lesezugriffe, cancellation, Warten, completion listener und cleanup.
- `@deepseek-ai/dsh-tool-jobs` exponiert `job_output`, `job_list` und `job_kill`, injiziert completion notices und liefert die background-job-system-prompt-Leitlinie.

Long-running-tools sind producers. `dsh-tool-bash` adaptiert ein `ShellProcess` zu inkrementellem Output und Prozess-Cancellation; `dsh-tool-subagent` adaptiert einen child run zu final output und child disposal. Die bash- und subagent-capability-seams bleiben unabhängig von sessions und der job registry.

`JobRegistry` ist die Service Definition in `@deepseek-ai/dsh-jobs`; der process-lokale provider ist `LocalJobRegistry` in `@deepseek-ai/dsh-jobs-local` (der [task-registry contract Agent Note](../../archived/architecture/2026-07-26-job-registry-seam.md) hält diese Aufteilung fest).

## Runtime contract

Die literalen Typen leben auf der [tasks-Subsystem-Seite](../../../../docs/subsystems/jobs.de.md). Ein producer ruft `ctx.jobs.start()` mit einem kind, label, optionalem owning `Agent`, optionalem positivem `outputLimitBytes` und einer `run()`-Funktion auf. Die runtime vollendet alle failable preflight-Arbeit, bevor sie `run()` aufruft, und ruft es genau einmal auf. Nachdem `run()` hooks zurückgegeben hat, committiert die Registrierung ohne weiteren failable Schritt; ein producer kann keine Arbeit starten, die kein collectables job id hat.

Der process-lokale provider besitzt auch bounded admission, dessen Rationale in der [bounded background job admission decision](../../archived/bug-fix/2026-08-11-bounded-background-job-admission.md) festgehalten ist. Seine positive-safe-integer-`maxConcurrentJobsPerOwner`-config hat `10` als Standard; `start()` leitet die aktive Anzahl jedes exakten `Agent`-Objekts aus `running`- und `stopping`-records ab, während alle unowned tasks einen einzigen service-bucket teilen. Capacity-Verwerfung erfolgt vor `run()` und id-Allokation, und die producer-`done`-settlement ist das einzige event, das den Platz eines stopping tasks freigibt. Der provider wartet nicht in einer Queue, preempts nicht und behält keine zweite mutable Zählung.

`outputLimitBytes` ist producer-eigene presentation policy, kein registry-buffer. Die registry validiert es und projiziert es unverändert in `JobSnapshot`; generische control APIs wenden die Obergrenze auf den vollständigen model-facing-Output an, nachdem sie ihre eigene status- oder notice-Metadaten hinzugefügt haben. Weglassen erhält das bestehende controller-Verhalten, sodass die runtime keinen versteckten Default auf unzusammenhängende producer-Familien auferlegt.

Ein model-facing-producer exponiert diese committete id in seinem kanonischen Erfolgs-Wert, normalerweise `{ kind: 'background', jobId }`; Native-Rendering darf menschenlesbare Prosa behalten. Ein vorab abgebrochener background call schlägt fehl, statt ein no-op zurückzugeben, weil kein task existiert, der den versprochenen handle erfüllen kann. Sobald die Registrierung die id publiziert, gehört die cancellation zum eigenen controller des tasks und zur job runtime: Eine spätere cancellation der produzierenden tool call darf den publizierten task nicht killen. `job_kill`, owner disposal und service teardown requesten die cancellation; die foreground-Ausführung bleibt an das `exec.signal` des calls gekoppelt.

Die producer-hooks definieren drei Verantwortlichkeiten:

- `cancel(reason?)` requestiert synchron die Beendigung, ist idempotent und muss `done` zur settlement bringen.
- `done` lehnt nie ab und settled erst, nachdem der producer die Ressourcen des tasks freigegeben hat.
- Optionales `readOutput()` liefert die nächste konsumierende output-delta. Weglassen erklärt einen final-output-task, dessen terminal result aus `JobOutcome.output` kommt.

Statuses sind `running`, `stopping`, `completed`, `killed` und `failed`. Producer-spezifische Informationen wie Exit-Code oder stop reason gehören in `detail`; die registry interpretiert sie nicht. Task kinds bilden eine merge-extensible string-union, und job ids sind branded und werden als `<kind>-N` erzeugt, mit einem Zähler pro kind.

Die runtime hängt eine continuation an `done`, hält das erste terminal outcome fest, löst waiter auf und ruft completion listener mit per-listener-Fehler-Containment auf. First-wins-settlement zählt während des teardown: Werft `cancel` eine Exception, forciert die runtime das record als fehlgeschlagen und warnt, dass Arbeit orphaned sein kann, statt ewig auf ein promise zu warten, das nie settle kann. Ein späteres producer-outcome kann diese Diagnose nicht überschreiben und nicht zweimal benachrichtigen. Ein `cancel`, das zurückkehrt, ohne `done` schließlich zu settle, blockiert den teardown weiterhin, weil die runtime es nicht von einer langsamen, gültigen stop unterscheiden kann.

Task-Registrierungen sind keine effects der producer-tool-fiber. Das Neuladen eines tool- oder controller-plugins killt daher keine Arbeit, die von einem agent und backend besessen wird. Das eigene disposal des task services cancelt alle live tasks und wartet auf contract-konforme producers.

## Authorization und owner-lifecycle

Job ids sind runtime-global und vorhersagbar, daher autorisiert die registry jeden Zugriff. `get`, `read`, `wait` und `kill` akzeptieren den aufrufenden `Agent`; `list` gibt nur tasks zurück, die für diesen caller sichtbar sind. Ein owned task ist nur der exakten owning session zugänglich. Unowned tasks sind für non-agent-caller offen und sterben mit dem task service.

Der snapshot speichert die branded `SessionId` des owners für die authorization, während lifecycle-operationen die exakte live `Agent`-Instanz behalten. Diese Identitäten dienen verschiedenen Zwecken: session-Gleichheit gewährt Zugriff, aber exakte Objekt-Identität wählt cleanup und completion-delivery aus. Das Wiederverwenden einer agent- oder session-id kann den cleanup oder die notices eines alten scopes nicht auf ein Ersatzobjekt umleiten.

Der erste task eines owners hängt einen asynchronen effect an `owner.ctx`. Agent-scope-disposal cancelt die live tasks dieses owners, wartet auf deren terminal records und entfernt deren snapshots. Dieser effect überlebt producer-reloads und joins die bestehende quiescence-Grenze des agents. Der task service behält den effect-disposer, damit service-reload Callbacks nach dem globalen teardown aus noch live agent-scopes lösen kann.

Für contract-konforme producers resolved `AgentHandle.dispose()` erst, nachdem die owned background-Arbeit gestoppt ist. Arbeit, die länger als ein agent leben soll, muss unowned gestartet werden; Überleben über runtime-restarts erfordert ein separates durable-job-Design.

## Service API

`JobRegistry` bietet:

- `start(spec)` für vorab geprüfte, provider-zugelassene, atomare Registrierung.
- `get(id, caller?)` und `list(caller?)` für nicht konsumierende snapshots.
- `read(id, caller?)` für eine konsumierende stream-delta oder ein idempotentes final result.
- `kill(id, caller?, reason?)` für cancellation.
- `wait(id, timeoutMs, caller?, signal?)` für boundedes terminales Warten.
- `onJobDone(listener)` für effect-scoped Beobachtung mit exact-owner-delivery und listener-containment.
- `attachController(name)` für das task-controller-availability-fence.

`wait` gibt den terminal snapshot zurück, wenn der task settled, oder den live snapshot, wenn seine timeout abläuft. Das Abbrechen eines waits cancelt nur diesen wait. Wenn die settlement die terminale delivery bereits dem waiter zugewiesen hat, gewinnt der terminal snapshot weiterhin. Waiter registrieren synchron beim Abbrechen ab, damit eine same-tick-settlement keine completion notice im Namen eines readers unterdrücken kann, der nichts empfängt.

Ein producer, der ohne jeden controller geladen wird, ließe caller Arbeit starten, die sie nicht collecten oder stoppen können. `dsh-tool-jobs` ruft daher für seine Lebensdauer `attachController()` auf, und `start()` schlägt vor der producer-Ausführung fehl, wenn kein controller angehängt ist. Dieser Check erfolgt beim start, nicht beim plugin-load, weil sibling plugins parallel aktiviert werden können. Custom non-model-controller können sich selbst anhängen, ohne der registry tool-Namen beizubringen.

## Model-facing-control API

`dsh-tool-jobs` registriert drei kind-unabhängige tools mit generischen UI-cards:

- `job_output(job_id, wait?, timeout_ms?)` liest Output und hängt immer `[status: ...]` an. Stream-tasks geben nur Output seit der letzten Lese zurück; final-output-tasks geben ihr result nach der settlement zurück. Lesezugriffe blockieren nicht, außer bei `wait: true`, dessen timeout per plugin-config defaultiert und begrenzt wird. Eine wait-timeout meldet den weiterhin laufenden status und stoppt den task nicht.
- `job_list()` gibt caller-sichtbare tasks als `<id> [<kind>] <status> — <label>` zurück, oder `(no background jobs)`.
- `job_kill(job_id, reason?)` requestiert die cancellation sofort. Der optionale protokollierte Grund wird an den producer weitergeleitet. Terminal tasks melden ihren bestehenden status; ein werfender producer-cancel lässt den call fehlschlagen und den task laufen.

Stream-Lesezugriffe teilen sich einen task-scoped konsumierenden Cursor, weil das owning model der beabsichtigte reader ist. Eine UI oder mehrere unabhängige reader brauchen eine separate nicht-konsumierende observation API; das Teilen dieses Cursors ließe reader den Output voneinander konsumieren.

Der system prompt weist das model an, job ids zu behalten, unabhängige Arbeit fortzusetzen statt busy-polling zu betreiben oder einen laufenden task zu duplizieren, relevante tasks vor der finalen Antwort zu collecten und Arbeit zu killen, die nicht mehr zählt. Completion liefert eine protokollierte message an die session des exakten owners. Ein busy owner wird injiziert; ein idle owner wird geweckt, unter der bounded policy, die die [idle-owner wake decision](../feature/2026-08-11-background-job-completion-wakes-an-idle-owner.de.md) besitzt.

Die runtime markiert einen terminal task als `reported`, wenn eine Lese oder ein wait ihn liefert, wenn ein live waiter die delivery bei der settlement beansprucht hat, oder wenn das model ihn explizit killt. Reported tasks injizieren keine redundanten completion notices. Listener-Fehler werden unabhängig protokolliert, stoppen keine späteren listener und werden nicht von waitern oder teardown abgewartet. Trägt ein snapshot `outputLimitBytes`, erhält `dsh-tool-jobs` UTF-8-Grenzen und wiederverwendet einen bestehenden producer-truncation-marker, statt ihn zu duplizieren. Lesezugriffe reservieren status-suffixes und behalten den output-tail; completion notices reservieren das stabile `background job <id>`-Präfix und die `job_output`-Anweisung, bevor sie variables kind, label, status, detail oder den truncation-marker selbst kappen, damit die minimale PTY-Obergrenze den zu collectenden task weiterhin identifiziert. Der job controller löst die caller-sichtbare producer-Obergrenze in einem vorangestellten pre-execute-listener auf, bevor die policy dispatch verweigern oder short-circuiten kann, und wendet sie dann über die last-mile-`finalizeContent`-callback der task definitions an, damit normalisierte tool-errors, äußere pipeline-Fehler und single-text-policy-results die Grenze nicht verlassen können; bewusst strukturierte multi-block-policy-results behalten policy-ownership über ihre Form und Größe.

## Producer opt-in

Jeder producer besitzt, ob sein schema `run_in_background` über defaultierte config exponiert. `dsh-tool-bash`, `dsh-tool-terminal` und jede `dsh-tool-subagent`-Instanz verwenden `enableRunInBackground`, standardmäßig true. Eine deaktivierte Instanz lässt den Parameter weg und verwirft bei der Ausführung auch ein erzwungenes background-Argument, weil der generische argument-validator undeklarierte keys zulässt. Schema-Omission kündigt die capability an; der execution-check erzwingt sie.

`ctx.jobs` schreibt producer-schemas nicht um. Ein bundle leitet Konfiguration nur für producer weiter, die es besitzt. Erreicht ein background call `start()` ohne angehängten controller, schlägt das runtime-fence vor der Ausführung fehl.

## Producer-Integrationen

Der bash seam exponiert `resolve`, `run` und `start`. `start(spec)` gibt ein `ShellProcess` mit inkrementellen Lesezugriffen, cancellation, exit-facts und einem nicht-lehnenden quiescence-promise zurück. Der lokale executor behält live handles nur, damit sein eigenes disposal Prozesse killen und joinen kann. Foreground-caller verwenden weiterhin `resolve` und `run` direkt.

Für background bash registriert `dsh-tool-bash` den aufrufenden agent als owner. Seine hooks mappen `kill()` auf cancellation, `done` auf ein completed- oder killed-`JobOutcome` und `readOutput()` auf den bounded inkrementellen Output des Prozesses plus spill- und sandbox-notices. Generische task tools besitzen ids, status-Zeilen, Listing, Warten und completion notices.

Für background subagents erstellt `dsh-tool-subagent` einen task-eigenen `AbortController` und beginnt den provider-startup innerhalb des task-starters. Die cancellation bricht dasselbe signal vor oder nach der provider-Publikation ab. `done` wartet auf sowohl das child result als auch das child disposal, mappt completed output auf ein final result, mappt abort auf `killed` und andere stop reasons oder Infrastruktur-Fehler auf `failed`. Zwischenhistorie des child bleibt in der child session und wird nicht über `readOutput()` exponiert.

## In Betracht gezogene Alternativen

### Pro-capability-control tools

Separate bash- und subagent-output/stop-tools duplizieren ids, Isolation, cleanup, Benachrichtigung und Leitlinie und erhöhen zugleich die schema- und protocol-Last des models. Eine einzige runtime hält das execution-spezifische Verhalten in den producers, ohne den task-lifecycle zu klonen.

### Ein sofort abstraktes task-runtime-backend

Der aktuelle `JobStart.run()`-contract überträgt in-process-callbacks und exakte `Agent`-Objekte. Ein durable backend ändert identity, restart, ownership und observation-semantics, daher blieb die registry zur Einführung ein einzelner konkreter service, statt die falsche Grenze einzufrieren. Der [task-registry contract Agent Note](../../archived/architecture/2026-07-26-job-registry-seam.md) trennte später den contract von der process-lokalen implementation, ohne diese in-process-semantics zu ändern.

### Consumer-eigene authorization oder cleanup events

Consumer-eigene Checks locken inkonsistente oder fehlende Isolation bei jedem neuen controller. Ein broadcast-cleanup-event zwingt jeden listener, jeden agent zu filtern, und liefert keinen registration-disposer. Zentrale authorization plus ein owner-scoped effect gibt jedem consumer dasselbe fence und einen abwartbaren, entfernbareren lifecycle-hook.

### Blockender Output oder ein separates wait tool

Standardmäßig zu blockieren, würde den parent serialisieren, während background-Arbeit läuft. Warten ohne Lesen würde einen weiteren model call und ein schema hinzufügen, ohne nützliche Informationen zurückzugeben. `job_output(wait: true)` macht das Blockieren explizit und kombiniert es mit der result-delivery.

Der wait verwendet die geteilten deadline-Primitives, aber nicht die generische tool-timeout-policy. Eine wait-timeout ist eine erfolgreiche observation, die `[status: running]` zurückgibt; die generische policy würde sie durch einen timeout-error ersetzen. Keine tool-call-timeout steuert die task-Lebensdauer, nachdem ein job id zurückgegeben wurde.

### Runtime-eigene output sinks

Ein push sink würde das Buffern zentralisieren, aber bash besitzt bereits bounded buffers, Truncation und spill files hinter seinem executor seam. Formatierter deltas per pull zu ziehen, erhält diese ownership. Ein durable backend, das storage besitzt, könnte einen neuen Blick auf die producer-interface rechtfertigen.

### Zufällige ids, Promotion oder lifecycle-session-events

Authorization, nicht Unvermutbarkeit, ist die Zugriffs-Grenze, und ids leiten keine filesystem-Pfade ab; sequenzielle branded ids halten transcripts lesbar. Foreground-zu-background-Promotion erfordert einen user-interaction contract, den das SDK nicht vorgibt. Starts, Lesezugriffe und notices sind bereits als tool- und context-events protokolliert, daher würden dedizierte task-session-events model-sichtbare Fakten duplizieren.

## Testing

Die Unit-Abdeckung fixiert Preflight-Atomarität, pro-kind-ids, admission pro exaktem owner und unowned-bucket, `stopping`-Belegung, terminale Freigabe, output-limit-Validierung und -Projektion, vollständige UTF-8-result-Grenzen, stream- und final-Lesezugriffe, wait-timeout- und abort-Races, cancellation, first-wins-settlement, listener-containment, notice-Unterdrückung, owner-Isolation, stale owner-Instanzen, owner-cleanup, service-teardown und das no-controller-fence. Producer-Tests decken bash-Prozess-Mapping, subagent-startup-cancellation, terminales Mapping und disposal ab. Die Snapshot-Abdeckung fixiert die control-tool-schemas, die prompt-Leitlinie und einen zusammengesetzten ACP-Pfad, bei dem die konfigurierte Obergrenze einen zweiten echten background-Bash-task mit einer `job_kill`-Recovery-Aktion ablehnt.

## Konsequenzen

Bash-Befehle und subagents teilen eine einzige id-vocabulary, ein Listing, ein notice-Format, eine prompt-Gewohnheit und eine Menge control tools. Neue long-running producers implementieren execution-hooks statt einer weiteren registry und tool-Familie. Die [tool cookbook](../../../../docs/cookbook/adding-a-tool.de.md) verweist producer auf diesen contract.

Ein exakter owner kann process-lokale, Task-getragene Arbeit nicht unbegrenzt anwachsen lassen, und ein anderer owner konsumiert seine Zuteilung nicht. Ein cancellation-Request hält die Kapazität belegt, bis der producer seine Ressource tatsächlich freigegeben hat, daher kann der Austausch langsam stoppender Arbeit das konfigurierte live-resource-Budget nicht überschreiten.

Owned background bash stoppt jetzt mit seinem agent, statt länger zu überleben. Background-Prozesse haben keine executor-timeout; caller müssen irrelevante Arbeit killen oder sich auf owner/service-disposal verlassen. Stream-Lesezugriffe unterstützen einen konsumierenden reader, und ein producer, der von `cancel` zurückkehrt, ohne `done` zu settle, kann den teardown weiterhin blockieren. Durable jobs, unabhängige observation-cursor und foreground-promotion bleiben separate Designs.
