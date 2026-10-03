# Subagent
[English](subagent.md) | [中文](subagent.zh.md) | Deutsch


Das Subagent-Seam erlaubt einem Agent, Arbeit an einen Child-Agent zu delegieren. Wie [bash](shell.de.md) ist es **eine optionale Capability**, nicht Teil des Agent-Loops, daher leben seine Typen hier und nicht in [core.md](core.de.md). Es unterscheidet sich von den anderen Capability-Seams, weil **mehrere Provider-Implementierungen koexistieren** in einem Kontext, registriert nach Namen (`ctx.subagents`), während bash nur einen Executor erlaubt. Seine Registry folgt der [LLM-Adapter-Registry](llm-streaming.de.md), nicht dem Single-Service-bash-Executor.

Service Definition: [dsh-subagent](../../packages/subagent/subagent) (`ctx.subagents` + das Vokabular unten). Service Provider sind Geschwisterpakete (`dsh-subagent-spawn-in-process`, `dsh-subagent-fork-in-process`, `dsh-subagent-acp`, `dsh-subagent-codex`, `dsh-subagent-claude-code`, `dsh-subagent-dsh-sdk`); die modellseitigen Consumer sind [dsh-tool-subagent](../../packages/subagent/tool-subagent) (Per-Provider-Delegation) und [dsh-tool-subagent-control](../../packages/subagent/tool-subagent-control) (die optionalen globalen `send_message`-, `interrupt_agent`- und `list_agents`-Kontrollen). Derselbe `ctx.subagents`-Service besitzt die Continuable-Child-Orchestrierung durch einen internen Aktivierungsmanager und das Read-only-Child- und Descendant-Discovery direkt aus dem Session-Store und der optionalen Session-Persistenz. Die Produkt-Provider-Rationale liegt im [Codex- und Claude-Code Agent Note](../../.agents/notes/implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.de.md); die Common-Seam-Rationale liegt im [Subagent Agent Note](../../.agents/notes/implemented/feature/2026-06-21-subagent-capability-seam.de.md), im [Continuable-Subagents Agent Note](../../.agents/notes/implemented/feature/2026-07-28-continuable-subagent-conversations.de.md) und im [Adjacent-Agent-Messaging Agent Note](../../.agents/notes/implemented/architecture/2026-08-27-adjacent-agent-steer-messaging.de.md); der [archivierte List-Identity-Projection-Datensatz](../../.agents/notes/archived/architecture/2026-08-06-subagent-list-identity-projection.md) dokumentiert die ursprüngliche List-Identity-Entscheidung.

Quellen: [`packages/subagent/subagent/src/types.ts`](../../packages/subagent/subagent/src/types.ts), [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts) und [`packages/subagent/subagent/src/continuation.ts`](../../packages/subagent/subagent/src/continuation.ts)

Die `subagentCatalog`-Projektion stellt `SubagentCatalogEntry[]` in Parent-Ereignis-Reihenfolge über Session-Beobachtungen und Client-Snapshots zur Verfügung. Jeder Eintrag enthält die Child-ID, die Erstellungszeit, den Modus und den modusabhängigen Label; von Fork geerbte Katalog-Fakten werden ausgeschlossen. Das [Subagent-Paket](../../packages/subagent/subagent/README.de.md) besitzt die Katalog-Erstellung und Persistenz-Semantik.

## Zwei Arten von Capability, zwei Arten der Entdeckung

Ein Provider kündigt seine **Startzeit**-Features auf einem statischen Deskriptor an, den der Service VOR der Existenz eines One-Shot-Runs prüft; eine Anfrage, die ein Feature benötigt, das der Provider nicht hat, wird laut abgelehnt (`SubagentError('UNSUPPORTED_CAPABILITY')`), niemals akzeptiert-dann-ignoriert. Diese Flags beschreiben nur den One-Shot-[`start()`](#the-provider-contract-subagentprovider)-Pfad, in dem der Provider das Child komponiert. **Continuable**-Children werden vom Continuation-Manager selbst komponiert, daher werden sie durch eine optionale Methode gesichert, deren Vorhandensein DIE Capability ist, mit TS-Narrowing als Entdeckungsmechanismus: [`SubagentProvider.prepareContinuable`](#the-provider-contract-subagentprovider).

```ts type-equiv
/**
 * Which START-TIME features a provider supports. Checked by the service before delegating to
 * {@link SubagentProvider.start}: a request that needs a capability the chosen provider lacks
 * is rejected with a typed error rather than accepted-then-ignored (the "fail loud, no silent
 * degradation" rule). These flags describe the ONE-SHOT
 * {@link SubagentProvider.start} path, where the provider composes the child;
 * continuable children are composed by the continuation manager itself and are
 * gated by {@link SubagentProvider.prepareContinuable} instead. Each flag
 * corresponds one-to-one to a {@link SubagentStartRequest} option: `depthLimit`
 * to `maxDepth`; the other names match.
 */
interface SubagentCapabilities {
  readonly agentOptions: boolean
  readonly outputSchema: boolean
  readonly depthLimit: boolean
  readonly toolFilter: boolean
  readonly persona: boolean
}
```

## Die One-Shot-Start-Anfrage

Die Tool-Schicht baut diese Anfrage aus der Modelleingabe und ihrer eigenen Konfiguration; der Service validiert sie gegen den benannten Provider vor dem `start`. Das erforderliche `parent` liefert die Session-cwd, die Lineage und die Delegationstiefe. Optionale Agent-Provider-, Modell-, Reasoning-Effort- und Token-Overrides, Output-Schema, Tiefe, Tool-Filter und Persona erfordern passende Capability-Flags. In-Process-Backends mergen `agentOptions` über die Optionen des Parent-Agent, scopen Filter und Personas auf die Child-Erstellung und implementieren das unterstützte objekt-gerootete Schema mit einem erzwungenen Capture-Tool. Das DSH-SDK-Backend mergt die vier Agent-Route-Felder über seine Instanz-Defaults und validiert sie in der Initialisierung der Child-Runtime; ACP, Codex und Claude Code lehnen `agentOptions` ab, bevor sie ihre Transporte starten.

```ts type-equiv
/**
 * What a caller asks for when starting a ONE-SHOT subagent. The tool layer
 * builds this from the model's `{ description, prompt }` plus its own config;
 * the service validates {@link SubagentCapabilities} against the named provider
 * and resolves the durable descriptor before dispatching to
 * {@link SubagentProvider.start}.
 */
interface SubagentStartRequest {
  /** Optional short display label persisted with a session-backed child. */
  readonly label?: string
  /** Content delivered as the child's user message. */
  readonly prompt: ContentBlock[]
  /**
   * The spawning agent. In-process providers derive workspace, lineage, and
   * delegation depth from its durable session state. ACP reads only its cwd,
   * and only when no deployment `cwd` override is configured.
   */
  readonly parent: Agent
  /**
   * Cancellation signal from the spawning context (the tool's `exec.signal`).
   * This is the canonical cancellation channel both before and after startup:
   * a provider rejects `start()` after cleaning partial resources when it
   * fires before the run is published, and cancels the published run's
   * remaining turn work when it fires afterward.
   */
  readonly signal: AbortSignal
  /**
   * Optional host-Agent provider, model, reasoning-effort, and output-token
   * overrides. Requires {@link SubagentCapabilities.agentOptions}; in-process
   * providers merge them over the parent Agent's options when they create the
   * child, while the DSH SDK provider merges them over its instance defaults
   * before initializing the separate child runtime.
   */
  readonly agentOptions?: AgentOptions
  /**
   * Object-rooted JSON Schema within `assertObjectJsonSchema`'s enforced subset. Start rejects
   * unsupported schemas or providers without the capability. Data must be plain host-realm JSON;
   * a successful child returns the matching value as {@link SubagentResult.structured}.
   */
  readonly outputSchema?: ObjectJsonSchema
  /**
   * Optional absolute delegation-depth cap for the child being started: its
   * computed depth must be less than or equal to this non-negative safe
   * integer. Requires {@link SubagentCapabilities.depthLimit}; rejected at
   * start otherwise.
   */
  readonly maxDepth?: number
  /**
   * Optional child tool scoping. Requires {@link SubagentCapabilities.toolFilter};
   * rejected at start otherwise. In-process backends apply it as a scoped
   * `tools.restrict()` in the child's creation window: the named tools vanish
   * from the child's prompt AND refuse to execute (one visibility), with loud
   * unknown-name validation.
   */
  readonly toolFilter?: ToolRestriction
  /**
   * Optional per-child persona. Requires {@link SubagentCapabilities.persona};
   * rejected at start otherwise. In-process backends register it as a scoped
   * `deployment:persona-prefix` section on the child, SHADOWING the deployment's
   * persona for this child alone — same template semantics as the deployment
   * persona (strict `{{…}}` interpolation against the registered variables).
   */
  readonly persona?: string
}
```

`signal` ist der einzelne Abbruchkanal vor und nach der Bereitschaft. Der [Subagent-Composition-Controls Agent Note](../../.agents/notes/implemented/feature/2026-07-12-subagent-persona-tool-filter-and-depth.de.md) besitzt die Persona-, Live-Global-Tool-Filter-, Absolute-Tiefen- und Visibility-Not-Authority-Rationale.

Die aufruferseitige Anfrage trägt keine Katalogformat-Details oder Continuation-Zustand. `SubagentRuntime.start()` löst den detachten One-Shot-Deskriptor nach den Capability-Checks auf und übergibt dann diese providerseitige Anfrage an den ausgewählten Transport; ein Continuable-Child erreicht niemals `SubagentProvider.start()`:

```ts type-equiv
/**
 * Provider-facing one-shot request after {@link SubagentRuntime.start} resolves
 * the durable child descriptor.
 */
interface ResolvedSubagentStartRequest extends SubagentStartRequest {
  /** Detached descriptor a session-backed provider persists in the child log. */
  readonly descriptor: SubagentDescriptorData
}
```

## Continuable-Children und Aktivierungen

Ein **Continuable-Background-Subagent** ist eine dauerhafte Child-Session mit höchstens einer prozesslokalen **Activation**, der Periode, in der ein rekonstruierter Child-Agent resident ist. Eine Activation ist keine Anfrage, kein Ergebnis, kein Abbruch und kein Task: sie kann viele FIFO-Turns ausführen und bleibt resident, solange Descendants, die sie erzeugt hat, noch laufen. Der Continuation-Manager besitzt die Activations-Admission, die Direct-Parent-Autorisierung, den Live-Ownership-Graph, den Cold-Resume und die Child-First-Disposal; der Agent-Loop besitzt die gesamte Turn-Sortierung und Ausführung. Kein Continuable-Pfad erzeugt einen Task oder einen intermediären ergebnistragenden Wrapper.

```text
persisted Session
  -> optional live Activation
       -> one retained AgentHandle
       -> Agent inbox as the only turn FIFO
       -> zero or more owned child Activations
```

`SubagentRuntime.startContinuable()` reserviert die stabile Child-ID, snapshottet die versionierte `subagent/descriptor`-Payload, fragt den benannten Provider nach seiner detachten `ContinuableCreateSpec`, erzeugt den Child-Agent durch einen privaten Activation-Owner-Scope, etabliert jegliche Continuable-Parent-Ownership und reicht den initialen Prompt ein. Sie resolvt mit `{ childId, messageId }`, wenn die Inbox-Akzeptanz die Message-ID liefert — ohne auf den Turn-Start oder das Eintreten der Message in das Session-Log zu warten. Jeder Fehlschlag vor dieser Akzeptanz lehnt ohne beide IDs ab, disposed jeglichen erzeugten Handle und rollt die Activation und Parent-Ownership zurück.

`SubagentRuntime.sendMessage()` ist die einzige modellautorierte Message-Operation. Sie akzeptiert den exakten Live-Sender plus eine Ziel-ID, erlaubt nur einen direkten Parent oder ein direktes Continuable-Child, leitet die Sender-Attribution selbst ab und routet ein Direct-Child-Ziel nach Activation-Residenz:

| Target Activation state | `sendMessage` |
|---|---|
| `running` | den nächsten Step in derselben Activation steuern |
| `waiting` | dieselbe Activation wecken und steuern |
| keine Activation | eine neue Activation kalt fortsetzen, dann steuern |

`running` bedeutet, dass der Agent einen aktiven Driver oder Maintenance-Task hat; `waiting` bedeutet, dass keine Agent-Aktivität aktiv ist, aber seine Inbox nicht leer ist oder er mindestens eine Child-Activation besitzt, die ihren Disposal nicht abgeschlossen hat; `settled` bedeutet, dass keine Agent-Aktivität aktiv ist, die Inbox leer ist und jedes besessene Child disposed wurde, woraufhin der Manager den [`AgentHandle`](core.de.md#creation-and-ownership) disposed und die Activation entfernt. Der Manager leitet diese internen Bedingungen aus `Agent.whenIdle()`, `Agent.inbox.hasPending`, der besessenen-Child-Menge und einer Activation-Generation, die veraltete Beobachtungen invalidiert, ab, anstatt einen zweiten Ausführungszustandsautomaten zu pflegen. Nach dem finalen Session-Flush nutzt die Child-Lock-Entscheidung den synchronen Task-Eintritt von `Agent.runMaintenance()`, um die Idle-Phase zu beanspruchen und die Admission in demselben JavaScript-Turn zu schließen. Diese konservative Regel unterscheidet nicht zwischen Zustellmodi: durch `Agent.inject()` geparkter Kontext kann eine Idle-Activation und ihre Live-Ancestors resident halten, bis eine weckende Zustellung sie beansprucht, eine Queue-Mutation sie entfernt oder ein Manager-Teardown sie verwirft.

Die Agent-Inbox ist die einzige Queue. Jede Agent-Message verwendet `Agent.steer()`: ein Idle-Ziel startet einen Turn, während ein laufendes Ziel sie an der nächsten Step-Grenze beansprucht. Das Browser-`subagent.prompt`-Remote trägt separat `delivery: 'queue' | 'steer'` durch denselben internen Admission-Pfad; Queue öffnet einen späteren FIFO-Turn, während Steer das Best-Effort-Next-Step-Verhalten des Agent-Loops und die menschliche Quelle der Message behält. Erfolgreiche Zustellung gibt die akzeptierte `MessageId` zurück; die bestehenden `agent/inbox/inserted`-, `agent/inbox/claimed`- und `agent/inbox/discarded`-Ereignisse bleiben die Message-Lifecycle-Beobachtungen, und die Continuation-Schicht definiert keine zweite Queue.

Autorisierung kommt vom exakten Live-Sender. Parent-zu-Child-Zustellung erfordert, dass `SessionHeader.parentSession` des Ziels den Sender nennt; Child-zu-Parent-Zustellung erfordert, dass die residente Activation des Senders das Ziel nennt. Geschwister, Ancestors jenseits einer Kante, Self-Targets, veraltete Agent-Objekte und One-Shot-Children werden abgelehnt. Jede akzeptierte Message wird als `Agent <sender-id> sent a message:` gerahmt und zeichnet `AgentMessageSource` auf; die Provenienz zeichnet den Sender auf, gewährt aber keine Autorisierung.

Für `startContinuable()`, `sendMessage()` und Browser-Prompt-Zustellung besitzt das Caller-Signal Lookup, Materialisierung und Admission nur bis zur Inbox-Akzeptanz. Danach besitzt der Manager die Activation unabhängig: ein späterer Caller-Abbruch bricht weder den akzeptierten Turn ab noch disposed das Child. Der öffentliche Subagent-Service stellt kein vom Caller ausgewähltes Agent-Message-Scheduling zur Verfügung; Browser-Mensch-Queue und Steer bleiben interne Adapter-Entscheidungen.

Live-Queue-Occurrence-Mutation bleibt in der Session-Domäne. `session.updateQueue` lässt gewöhnliches Edit, Remove und QueueDock-Steer für einen Live-Subagent-besessenen Agent nur zu, wenn seine aktuelle projizierte Identität Continuable ist und seine Deskriptor-Sequenz in dem eigenen Nicht-Seed-Suffix des Child liegt. Die Identitätsprojektion faltet Deskriptoren Last-Wins, sodass ein Child-Deskriptor Deskriptoren übertrifft, die aus Fork-Lineage zurückbehalten wurden; die Own-Suffix-Sequenz-Prüfung verhindert, dass eine Seed-only-Ancestor-Identität eine Mutation autorisiert. One-Shot-, fehlende, unbekannte, beschädigte oder Cold-Children bleiben abgelehnt, und Queue-Mutation setzt niemals ein Child kalt fort. Die Ziel-Session-ID ist die menschliche Autorität für diese Mutationen, einschließlich ausstehendem `nextStep`-Steering oder injiziertem Kontext. Steer erfordert eine gequeue-te `MessageId` und einen Agent, der Running meldet, wenn der Befehl beginnt; Abbruch nach Admission nutzt den akzeptierten weckenden `nextTurn`-Fallback des Agenten. Edit schreibt Content unter derselben `MessageId` um, und sowohl Edit als auch Steer schließen ihre Inbox-Arbeit synchron ab, sodass Settlement nur den Endzustand beobachtet. `agent/inbox/claimed` und `agent/inbox/discarded` wecken den Watcher, neu zu lesen, ob noch eine ausstehende Occurrence verbleibt; dies lässt direkte Agent-Zustellung geparkte Arbeit fortsetzen und das Entfernen der letzten geparkten Occurrence ein Idle-Child abschließen. Der [Human-Inbox-Control Agent Note](../../.agents/notes/implemented/feature/2026-08-27-continuable-subagent-human-inbox-control.de.md) besitzt diese Semantik.

`SubagentRuntime.interrupt(targetSessionId, authority)` ist der eine öffentliche Stopp: er autorisiert synchron, gibt `Agent.cancel(cause, { keepInbox: true })` auf dem Live-Ziel ab und kehrt zurück, ohne auf Quiescence zu warten. Die Activation, ihre unbeanspruchte ausstehende Inbox-Arbeit und veröffentlichte Descendants werden nicht berührt; Arbeit, die bereits in den unterbrochenen Turn beansprucht wurde, wird nicht neu gequeu-t. Sobald der unterbrochene Driver Idle ist, setzt eine weckende Send die geparkte FIFO-Queue fort. Ein abwesendes Ziel — unbekannt, One-Shot oder bereits abgeschlossen — und eine Manager-lose Komposition sind akzeptierte No-Ops. Für ein Live-Ziel lehnt eine falsche Parent-Adresse oder ein Caller außerhalb seiner Live-Ancestry mit `UNAUTHORIZED` ab; veraltete Ancestor-Objekte und Self-Targeting-Ancestor-Anfragen lehnen vor dem Target-Lookup ab.

```ts type-equiv
/**
 * Authority under which one interrupt request is admitted. `user` carries the
 * durable direct-parent address a human client presented; `ancestor` carries
 * the exact live Agent object whose recorded lineage must contain the caller.
 */
type SubagentInterruptAuthority =
  | { readonly kind: 'user'; readonly parentSessionId: SessionId }
  | { readonly kind: 'ancestor'; readonly agent: Agent }
```

Jede Activation besitzt ihren `AgentHandle` und ein `ownedChildren: Set<SessionId>`; da eine Session höchstens eine Live-Activation hat, identifiziert die Child-Session-ID das Live-Child ohne eine weitere Runtime-Inkarnations-Referenz. Das Starten eines Child oder das Einreichen von Parent-stammender Arbeit registriert das Child in der Continuation-gemanagten Parent-Menge, bevor das Child laufen kann, und dieser Parent kann nicht abschließen, solange die Menge nicht leer ist. Ein Top-Level- oder anderer Nicht-Continuation-Agent hat keine Activation und bleibt außerhalb des Waiting-Graphen. Die Child-Freigabe geschieht erst, nachdem das Child keine aktive Agent-Arbeit hat, seine Inbox leer ist, jedes Child dieses Child disposed ist, der Best-Effort-finale Session-Flush abschließt und der `AgentHandle` des Child den Disposal abschließt.

Das finale Settlement wartet auf `ctx.sessions.flush(session)`, ignoriert aber seine Teilnahme-Boolean, weil ein beliebiger Listener nicht beweisen kann, dass ein Persistenz-Backend den Zustand gespeichert hat. Rejection wird protokolliert, ohne die Activation fehlschlagen zu lassen, und der Manager disposed dennoch den Handle und gibt die Ownership frei; der persistierte Child-Zustand kann dann bei einem späteren Resume fehlen oder veraltet sein. Manager-Unload ruft einen internen Manager-weiten Drain auf, der die Admission schließt und jeden Live-Forest disposed; `drainContinuableDescendants(parents)` schließt die Admission nur unter exakten Live-Host-besessenen Agenten und disposed deren Continuable-Descendants, während unzusammenhängende Forests live bleiben. Beide warten auf bereits zugelassene Materialisierungen in ihrem Scope, propagieren Abbruch Top-Down, geben Handles Child-First frei und warten auf jeden ausgewählten Branch trotz einzelner Fehlschläge. Dauerhafte Child-Sessions überleben diesen prozesslokalen Teardown.

```ts type-equiv
/** Durable attribution for one model-authored message between adjacent Agents. */
interface AgentMessageSource {
  readonly kind: 'agent-message'
  /** A message another agent addressed to this one (`relay` context form). */
  readonly form: 'relay'
  /** Session id of the Agent whose tool call produced the message. */
  readonly senderSessionId: SessionId
}
```

```ts type-equiv
/** Options for one model-authored message between adjacent Agents. */
interface SubagentSendMessageOptions {
  /** Caller cancellation, owning the operation only until inbox acceptance. */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/** Identities returned once a continuable child accepted its initial prompt. */
interface ContinuableStart {
  /** The durable child session id, stable across activations. */
  readonly childId: SessionId
  /** The accepted initial prompt's inbox message id. */
  readonly messageId: MessageId
}
```

Wenn eine residente Activation abschließt, liefert der Manager eine Notice an den dauerhaften direkten Parent des Child, die beschreibt, wie diese Epoche endete, und deren finale Assistant-Content trägt. Diese Zustellung ist für jedes Child, dessen ID ein Caller erhielt, unbedingt; sie geschieht vor der Ownership-Freigabe, die den Parent als abgeschlossen urteilen ließe, und erreicht einen residenten Parent durch dieselbe weckende Agent-Zustellung wie eine Agent-Message. Ein Parent, dessen eigene Lineage bereits abgebaut wird, empfängt sie ohne Wake, weil das Wecken eines Idle-Agent einen Turn startet statt Arbeit zu queuen. Ihre Provenienz ist eine eigene Art, sodass ein Transcript niemals eine Runtime-Buchführung als etwas präsentiert, das das Child geschrieben hat.

```ts type-equiv
/**
 * Durable attribution for the runtime's own account of a continuable child
 * settling. Deliberately a different kind from
 * {@link AgentMessageSource}: an Agent message is content the sender chose,
 * while this message is the manager stating what became of the child, and a
 * transcript that merged them would credit the child with words it never wrote.
 */
interface SubagentSettledMessageSource {
  readonly kind: 'subagent-settled'
  /** A runtime account shown without expanding the row (`notice` context form). */
  readonly form: 'notice'
  /** One-line account of how the child ended. */
  readonly summary: string
  /** Session id of the child that settled. */
  readonly senderSessionId: SessionId
}
```

Der Provider partizipiert nur an der Vorbereitung der initialen Erstellungs-Spec, wo sich `spawn` und `fork` unterscheiden. Die zurückgegebene Spec trägt nur detachte Provider-spezifische Erstellungs-Inputs — den optionalen Parent-History-Seed — und keinen Agent, `AgentHandle`, Prompt-Zustellung, Ergebnis, Disposal oder Resume-Operation. Cold-Resume wird gar nicht durch einen Provider dispatcht: der Manager faltet den generischen Deskriptor, ruft `ctx.agents.resume()` durch denselben Activation-Owner-Scope auf und reicht den wartenden Turn ein.

```ts type-equiv
/**
 * What the continuation manager asks a provider for while materializing one
 * continuable child's FIRST activation. The manager has already reserved the
 * durable child identity and owns every later operation, so this request
 * carries only what distinguishes a fresh child from one seeded with parent
 * history.
 */
interface ContinuableCreateRequest {
  /** The reserved durable child session id, for provider diagnostics. */
  readonly sessionId: SessionId
  /** The delegating parent agent whose history a seeding provider reads. */
  readonly parent: Agent
  /**
   * Caller cancellation, which owns preparation only until the manager accepts
   * the initial prompt into the child's inbox.
   */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/**
 * A provider's detached contribution to one continuable child's creation. This
 * is DATA, never a capability: it carries no Agent, `AgentHandle`, prompt
 * delivery, result, disposal, or resume operation, because the continuation
 * manager owns the child's whole lifecycle after preparation.
 */
interface ContinuableCreateSpec {
  /**
   * Completed-turn prefix of the parent's log to seed the child session with,
   * or absent for a fresh child. Same durable contract as
   * `CreateAgentOptions.seed`: contiguous from seq 0, lossless JSON, balanced.
   */
  readonly seed?: readonly SessionEvent[]
}
```

Der Deskriptor (`SubagentDescriptorData` in [descriptor.ts](../../packages/subagent/subagent/src/descriptor.ts)) ist eine modusdiskriminierte dauerhafte Identität für jeden Session-gestützten Subagent. Beide Modi tragen den Provider-Namen. Ein `one-shot`-Deskriptor trägt optional ein Caller-besessenes Anzeige-`label`; ein `continuable`-Deskriptor erfordert die Delegations-`description` als dauerhaftes Erstellungs-Label und snapshottet zusätzlich aufgelöste Child-`agentOptions.provider`/`model`/`reasoningEffort` und optionale `persona`/`toolFilter` für Cold-Resume. Er snapshottet niemals das Merge-erweiterbare `AgentOptions`-Objekt, daher kann ein unzusammenhängender Erweiterungswert die Continuation nicht brechen und ein späterer Kompositions-Input ist eine bewusste Versionsänderung. Er lässt `subagentDepth` weg (Cold-Resume vertraut dem `delegationDepth` des persistenten Headers als monotone Untergrenze) und `outputSchema` (One-Run- oder Activation-Ergebnis-Contract, keine dauerhafte Identität).

Ein lokaler One-Shot-Provider hängt den Deskriptor innerhalb des initialen Turns des Child vor seiner ersten Anfrage an. Der Continuation-Manager hängt den Deskriptor nach jeglicher Provider-gelieferter Lineage und vor der Akzeptanz des initialen Prompts an; `Session.inheritedEventCount` bleibt die Fork-Lineage-Grenze: die Deskriptor-Autorität beim Resume liest das eigene Suffix des Child, während die List-bedingte Identitätsprojektion `subagent/descriptor` Last-Wins faltet, sodass der eigene Deskriptor des Child einen Fork-geseedeten Ancestor-Deskriptor übertrifft. Eine geseedete Cold-List überspringt einen Cache-Hint, bis eine autoritative Beobachtung den exakten Cut liefert. Das Ereignis ist Log-only: kein `surfaceOp`, niemals in der Modell-Historie und über Compaction durch das Append-only-Log erhalten. Fehlformatierte Current-Version-Deskriptoren sind beschädigt; nicht unterstützte Versionen können von dieser Runtime nicht klassifiziert werden.

## Dauerhafte Enumeration: `listChildren()`, `listDescendants()` und ihre Einträge

`SubagentRuntime.listChildren(parentSessionId)` enumeriert die direkten Session-gestützten Subagents des Parent aus der Live-Preferred-Merge von `ctx.sessions` und der Session-Query-Engine `listSessions()` — kein Agent wird geladen oder fortgesetzt. Kandidaten sind die direkten Children, deren dauerhafter Header `origin: 'subagent'` trägt; der Marker klassifiziert Enumeration und grobe generische Route-Denial, kann aber keinen gültigen Deskriptor, keine Fortsetzbarkeit oder Autorisierung feststellen — die Projektionsfaltung besitzt die Identität und der Activation-Contract besitzt den Resume. Jede Zeilen-`mode`/`label` ist der Wert der registrierten `subagent`-Projektionseinheit, geliefert durch eine dreistufige Leiter: der Wassermark-Cache der Registry für ein Live-Child (null Log-Lesezugriffe); der optionale Projektions-Checkpoint-Cache für ein Cold-Child (`cachedSnapshot` — eine Identität, die das Own-Suffix-Seq-Gate passiert, ist final, weil ein eigener Deskriptor nach dem Anhängen unveränderlich ist); andernfalls eine `query.observeSession()`-Cold-Beobachtung, gefaltet durch die Registry (begrenzte Nebenläufigkeit, pro Listing neu berechnet). Der Cache ist eine rein optionale Beschleunigungsschicht: abwesend, die `null`-Sentinel liefernd oder den Key vermissend, das Seq-Gate nicht bestehend oder fehlerhaft, fällt er lautlos zur autoritativen Neufaltung zurück. Die Faltung ist `subagent/descriptor` Last-Wins ohne Fehlerkanal: der eigene Deskriptor des Child übertrifft den eines Fork-geseedeten Ancestors und eine fehlerformatierte oder unbekannte Version-Payload faltet zu einem serialisierbaren `null`-Sentinel, behandelt als kein Wert. Das Ergebnis ist ein `SubagentListEntry[]` in `createdAt`-dann-id-Reihenfolge: eine gelieferte Identität erzeugt einen `child`-Eintrag mit `mode: 'one-shot' | 'continuable'` und `activity: 'running' | 'inactive'`; Continuable-Einträge tragen immer `label`, während One-Shot-Einträge es nur tragen, wenn der Start-Caller Präsentationsmetadaten lieferte. Ein abgeschlossener Kandidat, dessen Faltung keine Identität lieferte, erzeugt eine `corrupt`-Diagnose — fehlende, fehlerformatierte und unbekannte-Version-Deskriptoren werden bewusst nicht unterschieden (`unsupported` bleibt im Typ, wird aber nie produziert); ein laufender Kandidat ohne Identität wird weggelassen (das Erstellungsfenster vor dem Landen des Deskriptors); eine fehlgeschlagene Cold-Inspektion erzeugt eine `unavailable`-Diagnose, die beim nächsten Listing erneut versucht wird, sodass ein beschädigtes Geschwister nicht gesunde Children verbergen kann. `hasChildren` markiert einen direkten Descendant mit dauerhaftem Subagent-Origin, gelesen aus demselben verschmolzenen Material. Die Aktivität snapshottet nur, ob der logische Datensatz in `ctx.sessions` live ist, nicht Ergebnis oder Fortsetzbarkeit. Ohne Persistenz ist die Enumeration nur Live statt ein Fehler — ein Cold-Child kann dann auch nicht fortgesetzt werden. `listChildren()` wirft `SubagentError` mit Code `SUBAGENT_CONTROL_PROJECTIONS_UNAVAILABLE`, wenn die `ctx.sessionProjections`-Registry abwesend ist, und `SUBAGENT_CONTROL_SESSION_STORE_UNAVAILABLE`, wenn der Session-Store abwesend ist, beide vor jeglichem Lesezugriff geprüft, sodass ein Deployment ohne Children deterministisch fehlschlägt; das List-Tool erfordert `ctx.subagents` und `ctx.agents` beim Plugin-Laden. Ein Service-Consumer wie eine UI kann beide Modi anzeigen und einen ungelabelten One-Shot-Fallback wählen, während der modellseitige `list_agents`-Adapter (das separat ladbare `/list-agents`-Plugin von [dsh-tool-subagent-control](../../packages/subagent/tool-subagent-control)) nur Continuable-Einträge behält und den Status durch die Live-Agent-Registry in sein eigenes `running`/`idle`/`ready`-Vokabular verfeinert, dessen `ready` ein nur im Speicher existierendes Child als fortsetzbar statt als terminal benennt. Die Enumeration konsultiert nicht die Activation-Map des Continuation-Managers, die Agent-Registry oder die Provider-Verfügbarkeit; `send_message` bleibt die autoritative Zustellzeit-Operation und ein gelistetes laufendes Continuable-Child kann eine Zustellung noch als Ownership-Konflikt ablehnen. Der [archivierte List-Identity-Projection-Datensatz](../../.agents/notes/archived/architecture/2026-08-06-subagent-list-identity-projection.md) dokumentiert die ursprüngliche Lese-Pfad-Entscheidung.

`SubagentRuntime.listDescendants(rootSessionId)` wendet dasselbe Live-Preferred-Corpus und die projektionsgestützte Interpretation auf den vollständigen Descendant-Baum des Root in stabiler Pre-Order an. Gewöhnliche Sessions und One-Shot-Children bleiben Traversierungsknoten, sodass Continuable-Descendants unter ihnen entdeckt werden; nur `origin: 'subagent'`-Kandidaten erzeugen Zeilen. Jedes zurückgegebene Child oder jede Diagnose fügt seine Position aus dem enumerierten dauerhaften Header hinzu, während eine Cold-Inspektion diesen vollständigen Lifecycle vor der Identitätslieferung revalidiert:

```ts type-equiv
/**
 * One entry of a descendant listing: the interpreted subagent facts plus its
 * position in the complete session tree. `parentId` is the durable direct
 * parent from the enumerated header, and `depth` counts edges from the root.
 */
type SubagentDescendantListEntry = SubagentListEntry & {
  /** Durable direct parent of this candidate in the enumerated tree. */
  readonly parentId: SessionId
  /** Edge distance from the requested root; direct children are `1`. */
  readonly depth: number
}
```


<a id="the-terminal-result-subagentresult"></a>

## Das terminale Ergebnis: `SubagentResult`

Das Ergebnis eines One-Shot-Runs, aufgelöst durch `SubagentRun.result`. `structured` ist nur vorhanden, nachdem ein angefordertes `outputSchema` erfolgreich erfüllt wurde; ein Schema anzufordern garantiert es nicht, und ein Provider kann `stopReason: 'error'` zurückgeben, wenn das Child fehlschlägt oder ohne einen gültigen Capture endet. Ein Provider kann ein sicheres, nicht-Assistant-`diagnostic` an ein Nicht-`completed`-Ergebnis anhängen; der Provider entfernt Tool-Inputs, Dateiinhalte, Umgebungswerte, Credentials und rohe Protokoll-Payloads und begrenzt den vollständigen Wert auf 4096 UTF-8-Bytes, bevor Consumer ihn separat von `output` präsentieren. Ein Nicht-`completed`-`stopReason` bedeutet, dass `output` partiell sein kann — der Consumer mappt es auf ein `isError`-Tool-Ergebnis, statt partiellen Output als Erfolg zu melden.

```ts type-equiv
/**
 * The terminal outcome of a subagent run, resolved by {@link SubagentRun.result}.
 */
interface SubagentResult {
  /**
   * The child's final assistant output is the content of its last non-empty
   * assistant message. Empty-content messages, including usage-only messages,
   * are skipped. Without a non-empty message, the output is its accumulated
   * assistant text stream, or `[]` when the child produced neither.
   */
  readonly output: ContentBlock[]
  /**
   * The structured result after a requested `outputSchema` was successfully
   * satisfied. Requesting a schema does not guarantee presence: a provider can
   * end with `stopReason: 'error'` when the child fails or finishes without a
   * valid capture. The structured value is validated against the requested
   * output schema by the provider; `unknown` here because the seam is
   * schema-agnostic.
   */
  readonly structured?: unknown
  /**
   * Provider-authored, non-assistant failure detail for a non-`completed`
   * result. Providers keep this text free of tool inputs, file contents,
   * environment values, credentials, and raw protocol payloads, and limit it
   * to 4096 UTF-8 bytes. Consumers present it separately from {@link output}.
   */
  readonly diagnostic?: string
  /** Why the run ended. A non-`completed` reason means `output` may be partial. */
  readonly stopReason: SubagentStopReason
}
```

`SubagentStopReason` ist eine [Merge-erweiterbare abgeleitete Union](core.de.md#the-map--derived-union-pattern) — ein Backend kann Varianten hinzufügen, daher verzweigen Consumer auf die bekannten Fälle und behandeln einen unbekannten terminalen Grund als Fehlschlag:

```ts type-equiv
/**
 * Why a subagent run ended. Merge-extensible (a backend may add variants);
 * consumers branch on the known cases and fall through `default`. The known
 * cases mirror the harness turn-end vocabulary so the tool layer can map a
 * non-`completed` result to an `isError` tool result.
 */
interface SubagentStopReasonMap {
  /** The child finished its turn normally. */
  completed: 'completed'
  /** Cancelled through the request signal or disposal. */
  aborted: 'aborted'
  /** Model or transport failure. */
  error: 'error'
  /** The child hit its token ceiling before finishing. */
  'max-tokens': 'max-tokens'
  /** The child declined the task. */
  refusal: 'refusal'
}
```

## Ein One-Shot-Run: `SubagentRun`

`SubagentRun` ist der Consumer-besessene Handle für ein veröffentlichtes One-Shot-Child — eine disponierbare Vordergrund-Delegation mit einem Ergebnis, niemals ein dauerhafter Child-Handle. Prompt-Einreichung, Turn-Arbeit und Infrastruktur-Fehler nach der Veröffentlichung gehören zu `result`. Consumer erwarten dieses Ergebnis und disposed den Run immer, um Quiescence zu erreichen. Child-Fehlschläge resolven mit einem Nicht-Completed-Stop-Reason; nur unrepräsentierbare Infrastruktur-Fehler lehnen ab. Ein Run hat kein Steering und keinen Resume: Continuable-Conversations haben gar keinen Run, weil der Continuation-Manager ihren `AgentHandle` direkt hält und jeden Turn durch die eigene Inbox des Child ordnet.

```ts type-equiv
/**
 * ONE-SHOT child handle returned after publication. Prompt submission, turn
 * work, and infrastructure faults after that boundary belong to {@link result}.
 * Consumers await that result and must always {@link dispose} to cancel
 * remaining work and reach quiescence. A run is one disposable foreground
 * delegation with one result; continuable conversations have no run — the
 * continuation manager holds their `AgentHandle` directly and orders every
 * turn through the child's own inbox.
 */
interface SubagentRun {
  /**
   * Parent-scoped run id. For a local run, this MUST equal the published child
   * session id, whose `parentSession` records `request.parent.session.id`; a
   * remote provider mints an id unique in the parent namespace.
   */
  readonly id: SessionId
  /**
   * The exact published in-process child, or `undefined` for a remote run.
   * When present, its id is {@link id}; the provider retains no ownership
   * implication beyond the run's ordinary {@link dispose} contract.
   */
  readonly localAgent: Agent | undefined
  /**
   * Resolves with the child's terminal {@link SubagentResult} when the run
   * settles. Does NOT reject on a child-level failure — a model/transport
   * failure resolves with `stopReason: 'error'` so the consumer maps it to an
   * `isError` tool result. Rejects on an infrastructure fault the seam cannot
   * represent as a stop reason.
   */
  readonly result: Promise<SubagentResult>
  /**
   * Cancel remaining work, reach child quiescence, and release resources.
   * Idempotent.
   */
  dispose(): Promise<void>
}
```

Ein lokaler One-Shot-Run MUSS einen gewöhnlichen Child-Agent/Session veröffentlichen, bevor `start()` erfüllt, diese Child-Session-ID als `SubagentRun.id` zurückgeben, das exakte Child als `localAgent` verfügbar machen, `request.parent.session.id` im `parentSession`-Header des Child aufzeichnen und den aufgelösten Deskriptor innerhalb des initialen Turns des Child vor seiner ersten Anfrage anhängen. Runtime-Ownership kann das Child unter den Parent-, Provider- oder Root-Scope stellen. Ein Remote-Provider gibt stattdessen eine Parent-gescopete Lifecycle-ID und `localAgent: undefined` zurück; ohne eine lokale Child-Session fehlt er in der dauerhaften Enumeration.

<a id="the-provider-contract-subagentprovider"></a>

## Der Provider-Contract: `SubagentProvider`

Jeder Provider ist ein benannter Child-Agent-Transport und mehrere Provider können koexistieren. Der Service validiert angeforderte Startzeit-Capabilities vor `start()` und lehnt einen Continuable-Start auf einem Provider ohne `prepareContinuable` ab. `inheritsParentContext` beschreibt nur Conversation-Seeding (`fork`: true; `spawn` und `acp`: false) und ermöglicht Consumern, genaue modellseitige Formulierungen zu erzeugen, ohne geerbte Tools, Services oder Autorisierung zu implizieren. Ein Provider, dessen One-Shot-Route statische Provider-besessene Defaults hat, veröffentlicht optionale unveränderliche `agentRouteDefaults`, die es einem Consumer ermöglichen, Modell/Tool-Overrides gegen die korrekte Baseline vor der Vorprüfung zu mergen.

```ts type-equiv
/**
 * One registered transport for running child agents. Providers are trusted
 * same-process implementations; callers treat descriptors and returned values
 * as borrowed immutable data. The service may call one provider concurrently
 * for distinct children. Providers isolate operation-local mutable state; a
 * shared capacity controller may delay an operation but must not couple its
 * settlement or cleanup to a sibling.
 */
interface SubagentProvider {
  /** Unique registry name (e.g. `spawn`, `fork`, `acp`). */
  readonly name: string
  /** The start-time features this provider supports (see {@link SubagentCapabilities}). */
  readonly capabilities: SubagentCapabilities
  /**
   * Whether the child sees the parent's completed-turn prefix. This is descriptive, not a
   * service-validated start capability: the model-facing tool derives truthful wording from it.
   * It says nothing about tool registration, injected services, or authority inheritance.
   */
  readonly inheritsParentContext: boolean
  /**
   * Optional static provider-owned provider/model route for one-shot Agent
   * options. Consumers merge tool/model overrides over these values before
   * preflight; providers whose route derives from the parent omit it. The value
   * is detached immutable data and requires `agentOptions` support.
   */
  readonly agentRouteDefaults?: Readonly<{ provider: string; model: string }>
  /**
   * Establish a ONE-SHOT child and return its handle after publication.
   * The service has already validated that every requested start-time
   * capability is supported and resolved `request.descriptor`, so a
   * session-backed implementation appends that descriptor inside the child's
   * initial turn. Before fulfillment, the provider owns setup and cleans any
   * unpublished partial resources before rejecting. Ownership transfers on
   * fulfillment; subsequent turn or infrastructure failure settles through
   * the returned run. Distinct starts may overlap; cancellation, failure,
   * result settlement, and disposal remain independent for each run.
   */
  start(request: ResolvedSubagentStartRequest): Promise<SubagentRun>
  /**
   * OPTIONAL (continuable-creation capability): contribute the detached
   * creation inputs that distinguish this provider's continuable children —
   * only whether the child session is seeded with parent history. Method
   * presence IS the capability: the service rejects continuable starts on
   * providers without it, while a provider that has it may still serve
   * ordinary one-shot delegations.
   *
   * This is the provider's ONLY participation in a continuable child. The
   * continuation manager owns identity reservation, composition, Agent
   * creation, prompt delivery, cold resume, ownership, and disposal, so a
   * provider never sees the child's Agent, handle, turns, or teardown.
   * Distinct preparations may overlap; each follows its own signal and returns
   * data belonging only to `request.sessionId`.
   */
  prepareContinuable?(request: ContinuableCreateRequest): Promise<ContinuableCreateSpec>
}
```

Provider `start()` erfüllt mit einem veröffentlichten Run. Der Service mintet eine eindeutige `runId`, snapshottet `local` aus dem exakten `localAgent` des Providers, beobachtet das Ergebnis, emittiert `subagent/start` und gibt denselben Run zurück; eine `start()`-Rejection impliziert das Aufräumen unveröffentlichter Ressourcen und emittiert kein Lifecycle-Paar, während eine Post-Publication-Ergebnis-Rejection das emittierte Paar schließt. Jede Continuable-Activation emittiert dasselbe Observe-only-Paar für ihre Residenz-Epoche, sodass ein Cold-Resume eine neue Epoche mit eigener `runId` ist. Das gepaarte `subagent/end` trägt dieselbe Identität und den finalen Output oder Infrastruktur-Fehler. Beide Ereignisse sind Observe-only und enthalten Listener-Exceptions. Ihr `provider`-Feld nennt den Provider, der den Run oder die Activation-Epoche startete; es behauptet nicht, dass der Provider beim Emittieren des Edge noch registriert ist.

## In-Process-Backends: Tiefe und Seed

Die Spawn- und Fork-Backends erzeugen einen gewöhnlichen One-Shot-Agent durch `parent.ctx`, geben Abbruch in die Core-Erstellung weiter und disposed durch `AgentHandle`; ein Continuable-Child wird stattdessen vom Continuation-Manager durch seinen eigenen Activation-Owner-Scope erzeugt. Provider-Entfernung blockiert neue Starts, ohne akzeptierte Runs zu widerrufen. Jedes Child erhält einen neuen flachen Scope anstatt Parent-Registrierungen zu erben. Tiefe und Fork-Seeding verwenden das bestehende Agent- und Session-Vokabular:

- **Delegationstiefe** ist die dauerhafte `SessionHeader.delegationDepth` plus das Merge-erweiterbare Runtime-Feld `AgentOptions.subagentDepth`; Abwesenheit bedeutet Top-Level-Tiefe null und der größere vorhandene Wert ist autoritativ. Das Seam besitzt beide Felder — der Loop setzt oder liest sie nicht —, daher persistiert ein In-Process-Child Parent-Tiefe + 1, Cold-Resume kann sie nicht senken und jeder Start lehnt eine abgeleitete Tiefe außerhalb der Safe-Integer-Domäne oder über einer definierten absoluten `request.maxDepth`-Obergrenze ab.
- **Fork-Seeding** verwendet [`CreateAgentOptions.seed`](core.de.md#creation-and-ownership) (ein `SessionEvent[]`-Präfix, durch `AgentLoop.createAgent` → `ctx.sessions.prepare({ seed })` gefädelt, dasselbe Primitiv, das `ctx.agents.resume()` verwendet). Das Fork-Backend gibt ein *balanciertes Completed-Turn-Präfix* des Parent-Logs weiter — die Events des Parent bis einschließlich seines letzten `turn/end` —, sodass der Seed Contiguous-from-0 ist und das [Invariants](../../packages/runtime-diagnostics/invariants)-Replay ihn akzeptiert (der In-Flight-, unbalancierte Turn wird ausgeschlossen).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsubagentmodelselection--subagentmodelselectionconfig"></a>

### `ctx.subagentModelSelection` — `SubagentModelSelectionConfig`

Singleton settings owner read when delegation tools are composed for a Session.

```ts cordis-catalog
/**
 * Read a detached selection preference for the next eligible Session composition.
 * @returns the enabled state and exact allowed routes.
 */
current(): SubagentModelSelectionSettings
```

Source: [`packages/subagent/tool-subagent/src/model-selection-settings.ts`](../../packages/subagent/tool-subagent/src/model-selection-settings.ts)

<a id="ctxsubagents--subagentruntime"></a>

### `ctx.subagents` — `SubagentRuntime`

Named provider registry with one-shot runs, durable discovery, and continuable-child operations.

```ts cordis-catalog
/**
 * Establish one durable continuable child and deliver its initial prompt.
 * Resolves when the child's inbox accepts that prompt, without waiting for the
 * turn to start or for the message to reach the Session log; any earlier
 * failure rejects with no ids and rolls back the child entirely.
 * @param spec - provider, delegation request, and caller cancellation.
 * @returns the durable child id and the accepted prompt's message id.
 * @throws when continuation services are unavailable or materialization fails.
 */
async startContinuable(spec: ContinuableStartSpec): Promise<ContinuableStart>

/**
 * Steer one model-authored message to the sender's direct parent or direct
 * continuable child. A running target admits it at the nearest step boundary;
 * an idle target starts a turn, and an absent direct child cold-resumes from
 * persistence. The service derives durable sender attribution from the exact
 * live sender. Caller cancellation stops only pre-acceptance work.
 * @param sender - exact live Agent authorizing and originating the message.
 * @param targetId - durable direct-parent or direct-child session id.
 * @param content - model-authored content to deliver.
 * @param options - caller cancellation before inbox acceptance.
 * @returns the accepted message's inbox id.
 * @throws when continuation services are unavailable, adjacency is rejected,
 *   or the message was not admitted.
 */
async sendMessage( sender: Agent, targetId: SessionId, content: ContentBlock[], options: SubagentSendMessageOptions, ): Promise<MessageId>

/**
 * Interrupt one live continuable child's current turn under a human parent
 * address or an exact live ancestor Agent. Fire-and-return: the cancel
 * signal is issued before this returns, but the target may keep running
 * until it observes the signal. Unclaimed pending inbox work, the Activation,
 * and published descendants are preserved; claimed work is not requeued.
 * Once the interrupted driver is idle, a waking send resumes the parked FIFO
 * queue. An absent target — including a one-shot or unknown id —
 * is an accepted no-op, as is a manager-less composition, which cannot own a
 * live Activation.
 * @param targetSessionId - the durable child session id to interrupt.
 * @param authority - the human parent address or exact live ancestor Agent.
 * @throws {SubagentError} `UNAUTHORIZED` when the authority does not own the
 *   live target.
 */
interrupt(targetSessionId: SessionId, authority: SubagentInterruptAuthority): void

/**
 * Close continuable admission below exact live parent Agents, stop only their
 * visible descendant Activations synchronously, then await admitted scoped
 * materializations and release those forests child-first. The scoped cutoff
 * lasts until each exact parent leaves the registry; unrelated parent trees
 * remain live.
 * @param parents - exact host-owned parent Agents entering teardown.
 * @returns once every retained descendant Activation released its `AgentHandle`.
 * @throws an aggregate error after all branches settle when any failed.
 */
async drainContinuableDescendants(parents: readonly Agent[]): Promise<void>

/**
 * Release selected resident continuable direct children of one exact live
 * parent. Other children of the same parent remain admitted and resident.
 * Absent targets and a manager-less composition are accepted no-ops.
 * @param parent - exact live direct parent authorizing the selected release.
 * @param childIds - durable direct-child ids to release when resident.
 * @returns once every selected Activation released its `AgentHandle`.
 * @throws {SubagentError} `UNAUTHORIZED` when a resident target belongs to a
 *   different parent or the supplied parent identity is stale.
 */
async drainContinuableChildren(parent: Agent, childIds: readonly SessionId[]): Promise<void>

/**
 * Enumerate the parent's direct session-backed subagents without loading or
 * resuming an Agent. The Session query service supplies one live-preferred
 * corpus and shared point observations; the projection cache supplies
 * immutable descriptor hits without opening cold logs. The registered
 * `subagent` projection remains the sole mode/label classifier.
 *
 * Every query receives `signal`, and the listing rechecks cancellation
 * around each await. Read rejections that settle
 * after an abort become a stable `SubagentError` with code `CANCELLED`.
 * @param parentSessionId - parent session whose direct children are listed.
 * @param signal - caller-owned cancellation forwarded to Session queries
 *   and observed around every read await.
 * @returns children and per-child diagnostics ordered by `createdAt`, then id.
 * @throws {@link SubagentError} when the projection registry or the session
 *   store is not mounted, or the caller cancels the listing.
 */
listChildren(parentSessionId: SessionId, signal?: AbortSignal): Promise<SubagentListEntry[]>

/**
 * Enumerate the root's complete session-backed subagent tree in stable
 * pre-order from one live-preferred corpus, without loading or resuming an
 * Agent. Ordinary sessions and one-shot children remain traversal nodes so
 * continuable descendants below them are discovered; each returned entry
 * adds its durable `parentId` and root-relative `depth`. Identity resolution,
 * diagnostics, optional persistence, and cancellation follow the same
 * projection-backed contract as {@link listChildren}.
 * @param rootSessionId - session whose complete descendant tree is listed.
 * @param signal - caller-owned cancellation forwarded to persistence reads
 *   and observed around every read await.
 * @returns children and per-candidate diagnostics with tree position, in
 *   stable pre-order.
 * @throws {@link SubagentError} under the same conditions as {@link listChildren}.
 */
listDescendants(rootSessionId: SessionId, signal?: AbortSignal): Promise<SubagentDescendantListEntry[]>

/**
 * Remote face of {@link listChildren} for one browser: the durable listing
 * plus live Agent activity and the delivery-time parent availability hint.
 * Parent availability is a hint; {@link prompt} performs the authoritative
 * check. Named apart from the provider-name {@link list}, which owns the
 * member.
 * @param parentSessionId - parent session whose direct children are listed.
 * @param signal - carrier cancellation forwarded to Session queries.
 * @returns the catalog view for that parent.
 * @throws {RemoteError} `gateway/bad-request` for an empty parent id,
 *   `gateway/cancelled` for an aborted read, `subagent/projections-unavailable` when
 *   the deployment has no projection registry, otherwise `gateway/internal`.
 */
@Remote('list') async remoteExportList(parentSessionId: SessionId, signal: AbortSignal): Promise<SubagentCatalog>

/**
 * Deliver one browser-authored message to a continuable child through the
 * exact live direct parent, retaining the caller-minted request identity and
 * validated browser zone on the accepted message. Success identifies the
 * message the child's inbox accepted; later execution is independent of this
 * call. Queue delivery targets a later turn; steer delivery targets the
 * nearest step and retains the Agent loop's best-effort fallback semantics.
 * Image parts are admitted and persisted through the attachment store
 * before delivery, and the child's model must accept image input.
 * @param request - durable address, delivery, minted identity, content, and optional browser zone.
 * @param signal - carrier cancellation, owning the call until inbox acceptance.
 * @returns the accepted message's inbox identity.
 * @throws {RemoteError} `gateway/bad-request`, `subagent/attachment-invalid`,
 *   `subagent/invalid-time-zone`, `subagent/parent-unavailable`,
 *   `subagent/not-resumable`, `subagent/unauthorized`,
 *   `subagent/delivery-unavailable`, `gateway/cancelled`, or `gateway/internal`.
 */
@Remote('prompt') async prompt(request: SubagentPromptRequest, signal: AbortSignal): Promise<SubagentPromptReceipt>

/**
 * Remote face of {@link interrupt} under one durable parent address. No
 * catalog, history, persistence, or parent Agent lookup runs: the core
 * primitive alone authorizes the address against the live Activation, which
 * is what keeps a live child interruptible while its parent Agent is offline.
 * Absent, idle, and already-completed targets are accepted no-ops there.
 * @param childSessionId - durable child session id to interrupt.
 * @param parentSessionId - durable direct parent whose authority is claimed.
 * @param mode - required continuable-address discriminator.
 * @returns acknowledgement that the cancel signal was admitted, not that the target is quiescent.
 * @throws {RemoteError} `gateway/bad-request` for an empty id,
 *   `subagent/unauthorized` when the address does not own the live target,
 *   otherwise `gateway/internal`.
 */
@Remote('interruptByParent') interruptByParent( childSessionId: SessionId, parentSessionId: SessionId, mode: 'continuable', ): SubagentInterruptReceipt

/**
 * Register a provider under its name. Registration is effect-scoped and HMR
 * safe; removing a provider blocks new starts but does not revoke runs that
 * were already returned to their holders.
 * @param provider - the trusted provider implementation.
 * @returns the exact Cordis effect disposer.
 */
registerProvider(provider: SubagentProvider): () => void

/**
 * Look up a provider by name.
 * @param name - the provider name.
 * @returns the provider, or undefined when absent.
 */
getProvider(name: string): SubagentProvider | undefined

/**
 * List registered provider names in insertion order.
 * @returns the registered names.
 */
list(): string[]

/**
 * Establish a published child on the named provider. Capability and semantic
 * checks run before delegation. Provider ownership lasts until its promise
 * fulfills; a rejection therefore has no run for the caller to dispose and
 * emits no run lifecycle events. Post-publication turn and infrastructure
 * failures settle through the returned run.
 * A catalog append failure disposes the run and handles its result rejection;
 * the caller receives the catalog error even if disposal also fails.
 * @param name - the provider to use.
 * @param request - child label, prompt, parent, signal, and optional capabilities.
 * @returns the published holder-owned run.
 */
async start(name: string, request: SubagentStartRequest): Promise<SubagentRun>
```

Types: [Agent](core.de.md) · [ContentBlock](llm-streaming.de.md) · [MessageId](llm-streaming.de.md) · [SessionId](core.de.md)

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)

<a id="subagent-events"></a>

### `subagent/*` events

<a id="subagentend--emit"></a>

#### `subagent/end` — emit

A published child settled. Scope-filtered dispatch uses the same delegating parent carrier as `subagent/start`, so the lifecycle pair reaches the same scoped audience.

```ts cordis-catalog
/**
 * A published child settled. Scope-filtered dispatch uses the same delegating
 * parent carrier as `subagent/start`, so the lifecycle pair reaches the
 * same scoped audience.
 * @param info - the run identity and terminal outcome.
 * @dshScopeScan unsupported
 * @mode emit
 */
'subagent/end'(this: Scoped<SubagentRuntime>, info: SubagentRunEndInfo): void
```

Types: [Scoped](scope.de.md)

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)

<a id="subagentprovider-added--emit"></a>

#### `subagent/provider-added` — emit

A provider became resolvable in the registry.

```ts cordis-catalog
/**
 * A provider became resolvable in the registry.
 * @param provider - the registered provider.
 * @mode emit
 */
'subagent/provider-added'(provider: SubagentProvider): void
```

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)

<a id="subagentprovider-removed--emit"></a>

#### `subagent/provider-removed` — emit

A provider left the registry. Accepted runs remain holder-owned.

```ts cordis-catalog
/**
 * A provider left the registry. Accepted runs remain holder-owned.
 * @param name - the provider name that no longer resolves.
 * @mode emit
 */
'subagent/provider-removed'(name: string): void
```

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)

<a id="subagentstart--emit"></a>

#### `subagent/start` — emit

A provider established a published child. For in-process providers, `ctx.agents.get(info.id)` resolves during this notification. Scope-filtered dispatch keys the carrier by the delegating parent, so a parent-scoped listener observes only its own delegations. Paired with `subagent/end`.

```ts cordis-catalog
/**
 * A provider established a published child. For in-process providers,
 * `ctx.agents.get(info.id)` resolves during this notification.
 * Scope-filtered dispatch keys the carrier by the delegating parent, so a
 * parent-scoped listener observes only its own delegations. Paired with
 * `subagent/end`.
 * @param info - the provider and published child identity.
 * @dshScopeScan unsupported
 * @mode emit
 */
'subagent/start'(this: Scoped<SubagentRuntime>, info: SubagentRunInfo): void
```

Types: [Scoped](scope.de.md)

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)
<!-- END GENERATED cordis-surface -->
