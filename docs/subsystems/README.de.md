# Subsysteme
[English](README.md) | [中文](README.zh.md) | Deutsch


Eine Seite pro Subsystem des DeepSeek Harness: was es ist, welche Datenstrukturen es bewegt und — wo ein `ctx`-Service oder Event-Scope dahintersteht — ein generierter **Cordis-API**-Abschnitt mit seiner Service- und Event-Referenz. Der Ordner ergänzt [architecture.md](../architecture.de.md), das das *Verhalten* über Subsysteme hinweg beschreibt (die Service-Karte, den Session-/Turn-/Step-Lebenszyklus, die Event-Taxonomie); jede Seite hier ist die Referenz für das Vokabular und die Verdrahtung eines Subsystems.

| Seite | Besitzt |
|---|---|
| [core.md](core.de.md) | wie `packages/core` den Agent Loop steuert: die paketweise Loop-Beschreibung, Agent-Erzeugung und -Besitz (`AgentHandle`), die Delivery-/Cancellation-/Interception-Verträge des `Agent`-Handles und die repo-weiten Typmuster (`…Map → abgeleitete Union`, gebrandete IDs) |
| [llm-streaming.md](llm-streaming.de.md) | die `packages/llm`-Konversationstypen — `Message`/`ContentBlock`, die zusammengesetzte Modellanfrage, das `StreamChunk`-Wire-Protokoll und der Adapter-Vertrag, `BlockAssembler` und der `LlmAdapter`-Provider-Vertrag |
| [token-meter.md](token-meter.de.md) | immutable skalare und positionale Replay-Messungen mit konsumierten Log-Revisionen |
| [scope.md](scope.de.md) | Scoped-Registration-Identität, Dispatch-Carrier und der eigene `Scope`-Kontext |
| [typert.md](typert.de.md) | Remote-Invocation-Deskriptoren, Lookup-/Context-Deklarationen, Typert-Registries und die Host-Gateway-/Client-API-Grenzen |
| [goal.md](goal.de.md) | persistierte Goal-Identität, Lebenszyklus-Snapshots, Aktivierung, Änderungsdatensätze und Round-Attribution |
| [schedule.md](schedule.de.md) | session-lokale Reminder-Datensätze, durable Übergänge, aktive Ansichten und gewöhnliche Konversationszustellung |
| [todo.md](todo.de.md) | der Ganzlisten-Item-Typ des Todo-Pakets, durable Event-Verantwortung, Projektion und Open-Turn-Invariante |
| [commands.md](commands.de.md) | der Human-Command-Registry-Service: Definitionen, Adapter-Discovery, direkte Invocation, Ergebnisse und Parsing-Ansichten |
| [session.md](session.de.md) | der vollständige `SessionEventMap`-Variantenkatalog, `TurnEndReason`, `deriveMessages()`, Execution Enclosure und eigenständige Events |
| [persistence.md](persistence.de.md) | die Durability-Seam: `SessionPersistence`, der JSONL-Provider, `session/flush`, Crash Recovery, `SessionHeader` |
| [settings.md](settings.de.md) | die User-Settings-Seam: `SettingsNamespace`-Registrierung, geschichtete Auflösung (Defaults → Composition-`base` → Benutzerdokument), Owner-Scopes, Hot Commits |
| [credentials.md](credentials.de.md) | die Credential-Seam: `CredentialRef`-Referenzen (niemals Werte) in der Konfiguration, pro-Operation-Auflösung, UI-sicheres `CredentialInfo`, Provider-Quellschichten |
| [session-query.md](session-query.de.md) | logische Datensätze, begrenzte Exact-Event-Reads, Relationship-Traces, semantische Filter/Dokumente und Volltext-Ergebnisseiten |
| [feedback.md](feedback.de.md) | lebenszyklusgebundene pro-Nachricht-Feedback-Datensätze, optimistische Versionen, Sidecar-Persistenz und der Host-Remote-Vertrag |
| [session-title.md](session-title.de.md) | durable Titel-Snapshots, zitierte Quellnachrichten-Seqs und der asynchrone Provider-Vertrag |
| [session-reference.md](session-reference.de.md) | strukturierte sessionübergreifende Referenzen: `SessionReferenceInput`/`Candidate`, vorbereitete Nachrichtenkontexte, die stabile Fehlertaxonomie |
| [system-prompt.md](system-prompt.de.md) | pro-Assembly-Kontext, Tool-Provider-Ergebnisse, Prompt-Abschnitte und kooperative Assembly |
| [tools.md](tools.de.md) | `ToolDefinition`-Vollfelder, die Schema-DSL, `ToolExecution`/`ToolResult`, Tool-Präsentations-UI-Typen und die abgesicherte Execution-Pipeline |
| [user-questions.md](user-questions.de.md) | die UI-gestützte Human-Question/Answer-Seam: `AskUserQuestionRequest`, Answer/Options-Vokabular, Provider-API, Fehlertaxonomie |
| [approval.md](approval.de.md) | die Einmal-Benutzer-Approval-Seam: `ApprovalRequest`, `ApprovalOutcome`, pro-Session-Policy, Audit-Events und Answerer-Verträge |
| [attachment.md](attachment.de.md) | durable Bildidentität und Metadaten, Validierungseingaben, verifizierte Reads und die `AttachmentStore`-Seam |
| [shell.md](shell.de.md) | die Bash-Executor-Seam: `ShellExecRequest`/`Spec`, `ShellRunResult`, Hintergrund-`ShellProcess`-Handles |
| [subprocess.md](subprocess.de.md) | die Subprocess-Seam: vollständig explizites `SubprocessSpawnSpec`, offsetbasierte Output-Reader, unklassifiziertes `SubprocessOutcome` und das verwaltete `DSH_*`-Umgebungsvokabular |
| [terminal.md](terminal.de.md) | persistente Terminal-IDs, Backend-/Session-Verträge, Sendebereitschaft, begrenzte Reads und Owner-sichtbare Snapshots |
| [sandbox.md](sandbox.de.md) | pro-Session-Policy-Auflösung und die Process-Confinement-Seam: File-Effect-Modi, Execution-/Provider-Policies, `ConfinedArgv`, Durchsetzung und Fail-Closed-Fehler |
| [code-runtime.md](code-runtime.de.md) | die Code-Execution-Seam: `CodeRunRequest`/`Result`, Binding-Namespaces, erfasste Logs, die `CodeRunFailure`-Taxonomie |
| [extensions.md](extensions.de.md) | versionierte dynamische Cordis-Plugins und -Packages, Host-/Client-Aktivierung, Approval, Runtime-Inspection und Lifecycle-Teardown |
| [filesystem.md](filesystem.de.md) | die Filesystem-Seam: `FsTarget`, Read-/Write-/Edit-Ergebnisse, Observed-File-Zustand, `FsErrorCode` |
| [lsp.md](lsp.de.md) | die LSP-Navigations-Seam: `LspQueryRequest`/`Result`, `LspProvider`/`Service`, vier Operationen, `LspError` |
| [skills.md](skills.de.md) | der Skill-Service: Discovery-Priorität, `SkillSummary`/`SkillDefinition`, Session-Präfix-Katalog, modellseitiges `skill`-Laden |
| [compaction.md](compaction.de.md) | die Compaction-Seam: die `compaction/*`-Session-Events, `CompactionResult`, das `CompactionEngine`-Interface |
| [subagent.md](subagent.de.md) | die Subagent-Seam: die Named-Provider-Registry, `SubagentStartRequest`/`Result`/`Run`, die Start-Time-vs-Runtime-Capability-Aufteilung |
| [agent-team.md](agent-team.de.md) | Agent Teams: implizite Lead-Identität, benannte fortsetzbare Teammitglieder, durable Peer-Mailbox und geteiltes Task-DAG |
| [web.md](web.de.md) | die Web-Access-Seam: `WebSearchRequest`/`Result`, `WebFetchRequest`/`Result`, `WebFetchBody`, Provider-Verfügbarkeit, `WebError` |
| [spill.md](spill.de.md) | die Spill-Storage-Seam: `SaveTextSpill`, `SpillOwner`/`SpillSource`, `SpillRef`, der gebrandete `SpillLocator` |
| [workflow.md](workflow.de.md) | die Workflow-Seam: `WorkflowStartRequest`, `WorkflowMeta`, `WorkflowRun`/`Result`, die `workflow/*`-Event-Payloads, `WorkflowError`-Fatalität |
| [jobs.md](jobs.de.md) | die Background-Job-Laufzeit: gebrandete `JobId`s, der Producer-Vertrag, Consumer-Ansichten und `ctx.jobs`-Serviceverhalten |
| [permission-presets.md](permission-presets.de.md) | die Permission-Preset-Schicht: `PresetSpec`/`PresetOption`, der abgeleitete `custom`-Zustand, das nur-geloggte `permission/preset`-Event |
| [plan.md](plan.de.md) | Plan Mode: der nur-geloggte `plan/mode`-Zustand, der Pending-Selection-Flush, `PlanModeConfig`, der `exit_plan_mode`-Review-Bogen |
| [invariants.md](invariants.de.md) | die Runtime-Invariant-Registry: Auswahl-`Config`, `InvariantInstaller`/`InvariantFailure`, der Empty-Companion-Vertrag |
| [web-server.md](web-server.de.md) | der HTTP-Carrier: `WebRouteKind`/`WebRoute`, Match-Reihenfolge, der beanspruchbare Fallback-Platz, Index-Taps |
| [webhook.md](webhook.de.md) | authentifizierte Provider-Zustellungen, beliebige programmatische Regeln und Fire-and-Forget-Workspace-Session-Erzeugung |
| [storage.md](storage.de.md) | das Storage-Subsystem: der Backend-Vertrag (`StorageBackend`), `StorageForms`, `DomainSpec`/`Domain`, `domain/changed` |
| [workspace.md](workspace.de.md) | die Workspace-Registry: `Workspace`/`WorkspaceId`, Registrierung und Auflösung, die Session-`cwd`-Beziehung |
| [web-client.md](web-client.de.md) | die Browser-Architektur: Boot, Remote-Kommunikation, gepaarte Client-Modelle, UI-Adapter, Conversation-Assembly, Slots und Reconnect-Semantik |
| [client-modules.md](client-modules.de.md) | die Web-Plugin-Tabelle: `dsh.client`-Deklarationen, `WebBootGraph`-Wire-Komposition, die Bundle-Route und der Index-Tap |
| [slots.md](slots.de.md) | typisierte Web-UI-Komposition: Deklarationsbesitz, Kardinalität und Scope, Framework- und Feature-Injection, Props-Ableitung und die ausgelieferte Hierarchie |
| [client-resources.md](client-resources.de.md) | das Client-Ressourcenmodell: `dsh-resource://<type>/…`-Adressen, Protokoll-Provider und `ResourceProtocolMap`, der globale `useResource`-Hook und seine Zustände, Pins und Freigabe |
| [sidebar-right.md](sidebar-right.de.md) | die rechte Sidebar: Ressourcen- und Navigationsadressen, Tab-Typ-Registrierung und Routing, der `ctx.sidebarRight`-Navigationsservice, die Pane-Tab-Slots und Owner-Props, das Ressourcenmodell und der Workspace-Files-Service |
| [conversation.md](conversation.de.md) | target-neutrale Session-Event-Assembly: Context-Identität, Location-Daten, Replay-Pfade, View-Builder und target-eigene Render-Knoten |
| [session-projection.md](session-projection.de.md) | die Projection-Seam: `SessionProjectionMap`, die reine `ProjectionDefinition`-Unit, der konsistente Schnitt von `ProjectionSnapshot`, der Change-Feed |
| [session-telemetry.md](session-telemetry.de.md) | die ausgehende Session-Reporting-Capability-Seam: `SessionTelemetryRecord`/`SessionTelemetrySeverity`, der `SessionTelemetrySink`-Vertrag und der `session-telemetry/record`-Redact-Waterfall |

> Typdeklarationen und ihr JSDoc auf diesen Seiten sind quelläquivalent und werden durch `pnpm run verify-type-equiv` auf Drift geprüft (siehe [development.md](../development.de.md#documenting-types-verbatim-ts-type-equiv)). Gewöhnliche Blöcke erhalten vollständige Deklarationen; `public-api`-Blöcke erhalten body-gestrippte öffentliche Klassendeklarationen. Cordis-Services und -Events verwenden den generierten **Cordis-API**-Abschnitt jeder Seite.
