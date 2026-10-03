# Cookbook: Extension-Plugin-Formen
[English](extension-cookbook.md) | [中文](extension-cookbook.zh.md) | Deutsch


Referenzmuster für harness-Erweiterungen. Die Snippets lassen Imports und Hilfsimplementierungen weg und sind nicht kopierfertig. Für konkrete Autorierungspfade siehe die [Package-Checkliste](adding-a-package.de.md), das [Erstes-Tool-Tutorial](../user/develop/basic/tool.de.md), die [Tool-Referenz](adding-a-tool.de.md), den [LLM-Adapter-Leitfaden](adding-an-llm-adapter.de.md) und das [Session-Format-Version-Tutorial](adding-a-session-format-version.de.md); die [Architektur](../architecture.de.md) besitzt die System- und Extension-Point-Map.

## Ein Tool-Plugin

Ein Tool registriert sich auf `ctx.tools`. Das annotierte `defineTool`-Beispiel (typisierte `execute`-Argumente, Result-Konstruktion, das `run_in_background`-Muster) steht in [adding-a-tool.md](adding-a-tool.de.md) — dieser Leitfaden ist die Quellwahrheit für Tool-Definitionen. Rohe JSON-Schema-`ToolDefinition`s werden auch direkt von `ctx.tools.register()` akzeptiert (so kommen MCP-Quell-Tools an); `defineTool` ist der typisierte Helfer für First-Party-Tools.

<a id="a-hook-plugin-permission-gate-example"></a>

## Ein Hook-Plugin (Permission-Gate-Beispiel)

Dieses Permission-Gate ist ein Beispiel für ein Hook-Plugin. Es gibt eine typisierte Entscheidung aus dem `tools/pre-execute`-Gate zurück, um einen Aufruf zu erlauben oder abzulehnen; Sandbox-, Permission- und Plan-Mode-Plugins können diesen Extension Point nutzen. Hook-Plugins können auch andere Extension Points abfangen und sind nicht von Natur aus Permission-Gates. Ein „native hook" ist ein gewöhnliches Cordis-Plugin auf einem Interception Point; es benötigt kein externes Protokoll.

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'

declare function isAllowed(exec: ToolExecution): Promise<boolean>

export const name = 'permission-gate'

export function apply(ctx: Context) {
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (!(await isAllowed(exec))) {
      return { kind: 'deny', reason: 'Denied by policy.' }
    }
    return next()
  })
}
```

Dieser waterfall ist die umordnbare Policy-Schicht. Verwende `ctx.tools.guard()`, wenn eine Invariante eine monotone finale Ablehnung benötigt, `tools/execute`, wenn ein Plugin die Dispatch-Lebensdauer wrappen muss (Timeouts/Retries/Metriken; nur `exec.signal` ist ersetzbar), `tools/post-execute` für explizite Result-Transformation und `tools/result` für enthaltene Beobachtung des unveränderlichen finalen Outcomes. Der [adding-a-tool-Leitfaden](adding-a-tool.de.md#execution-policy-and-observation) gibt die Auswahlregel.

## Ein UI-Plugin

Ein UI-Plugin kombiniert dauerhafte `session/event`-Records (Assistant-Settlements, Turn-/Step-Grenzen und Tool-Aktivität) mit transienten `agent/assistant-stream`-Frames für Live-Token-Präsentation und treibt Input zurück über `agent.followup()` / `agent.steer()`. Ein Browser-Plugin, das eine Business-Row zum eingebauten Web Client beiträgt, registriert stattdessen eine `ConversationNodeDefinition` und einen keyed Chat-Renderer; siehe die [Conversation-Subsystem-Referenz](../subsystems/conversation.de.md).

```ts
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'

declare function render(text: string): void
declare function onUserInput(handler: (text: string) => void): void

export const name = 'my-ui'
export const inject = ['agents']

export function apply(ctx: Context) {
  ctx.on('agent/assistant-stream', ({ frame }) => {
    if (frame.type === 'chunk' && frame.chunk.type === 'text-delta') {
      render(frame.chunk.text)
    }
  })
  onUserInput(text => ctx.agents.get(brandString<SessionId>('client-session'))?.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })))
}
```

## Ein externer Protokoll-Treiber

Ein *Protokoll-Treiber* adaptiert einen Wire-Peer an `ctx.agents`; er kann ein UI oder einen Automatisierungs-Client bedienen. Ein stdio-Treiber besitzt stdout, erstellt oder resumed agents über die Factory und mappt Protokoll-Anfragen auf `followup()` oder `cancel()`. Eine Low-Level-Prompt-Anfrage gibt ihre dauerhafte Enqueue-Quittung zurück; sie erlangt kein Ergebnis, indem sie `MessageId` mit `turn/end` korreliert. Den ganzen-agent-Status separat veröffentlichen. Eine Automatisierungs-Methode darf von ihrer Quittung bis zum nächsten idle warten und dieses explizit besessene Intervall zusammenfassen, während ein UI normalerweise den offenen Event-Stream weiter beobachtet. Agents mit `AgentHandle.dispose()` abbauen, damit dispose quiescence erreicht.

[`packages/acp/acp`](../../packages/acp/acp) ist das fertige Automatisierungs-only-Beispiel: es stellt frische Text-Sessionen über ACP (Agent Client Protocol) JSON-RPC stdio bereit, emittiert committeten Assistant-Text und registriert einen One-Shot-Machine-Permission-Answerer für agents, die es besitzt. Sein [README](../../packages/acp/acp/README.de.md) definiert die exakten Methoden, die Event-Reihenfolge und den Lebenszyklus-Vertrag.

```ts
import type { Context } from '@deepseek-ai/cordis'
import { expandAssistantStream } from '@deepseek-ai/dsh-llm'

export const name = 'my-protocol-bridge'
export const inject = ['agents', 'sessions', 'sessionPersistence']

export function apply(ctx: Context) {
  // Publish every committed Assistant text delta to the client.
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
      for (const { chunk } of expandAssistantStream(event.data.stream)) {
        if (chunk.type === 'text-delta') {
          // sendToClient({ kind: 'message_chunk', text: chunk.text })
        }
      }
    }
  })
  // Inbound "prompt": create/resume an agent, feed it, and return its enqueue receipt.
  // Whole-agent status is a separate notification; no turn end belongs to this prompt.
  // Teardown reaches quiescence via AgentHandle.dispose() (stop + await exit).
}
```

## Ausführbare Verdrahtungen

Ausgelieferte Anwendungen tragen Profile-Schichten über `packages/bundle/*/cordis.patch.yml` bei, und der Produkt-`dsh`-Launcher besitzt Web-, ACP-, SDK- und One-Shot-Headless-Ausführung über benannte Profile. Optionale nutzerseitige Overlays liegen unter `apps/cli/config/examples/`; Profile-Integrationstests liegen unter `apps/cli/tests/profiles/`, während paketspezifische Loader-Kompositionen bei ihren jeweiligen Paket-Tests bleiben.

<a id="the-feature--mechanism-map"></a>

## Die Feature-→-Mechanismus-Map

Jedes Produkt-Feature mappt auf einen Listener an einem dokumentierten Extension Point — die Microkernel-Behauptung wird prüfbar gemacht ([Microkernel-Agent-Note](../../.agents/notes/implemented/architecture/2026-06-11-microkernel-event-taxonomy.de.md)). Keine Zeile modifiziert den Loop.

`system-prompt/assemble` ist eine kooperative Whole-Assembly-Transformation durch Experten: ihre zurückgegebene Assembly ist autoritativ, daher besitzen Listener-Autoren die Pflicht, aktive PTC-Mode- und Structured-Output-Protokoll-Beiträge zu bewahren. Bevorzuge `ctx.tools.restrict()` für Tool-Filtering, das über Präsentation, Lookup und Execution hinweg ausgerichtet bleiben muss.

| Produkt-Feature | Plugin-Mechanismus |
|---|---|
| Hook-System (Nutzer- + Projekt-Ebene) | Listener auf `agent/session-start`, `agent/pre-step`, `agent/request`, `tools/pre-execute`, `tools/post-execute` und `agent/turn-stopping`; die waterfalls geben typisierte Entscheidungen zurück, während `agent/turn-stopping` einen weiteren Step steuern kann; die `dsh-hooks-claude-code`/`dsh-hooks-codex`-Bridges mappen Hook-Konfigurationsdateien auf diese Extension Points |
| `/goal` | `ctx.goals` besitzt dauerhaften Zustand, `dsh-goal-round-driver` schedult same-session Rounds über den öffentlichen `Agent`, und separate Kommando-/Tool-Produzenten stellen Menschen-/Modell-Kontrolle bereit |
| `/loop` | auf dem `turn/end`-Session-Event `followup()` der nächsten Iteration; oder Force-Continue |
| Dynamischer Workflow | `ctx.workflowEngine` + die Worker-Thread-Engine + das `workflow`-Tool; strukturierte In-Process-Children erzwingen Output über scoped Prompt-/Tool-Registrierungen, eine monotone Tool-Guard, finalen `tools/result`-Commit (einschließlich umschließendem `run_code`) und die monotone `concludeTurn()`-Markierung der Structured-Output-Execution |
| Queued- + Steering-Nachrichten | Kern-`Agent.followup()` / `Agent.steer()` |
| Context-Compaction (auto + manuell) | der `ctx.compaction`-seam + `dsh-compaction-basic`; automatischer Druck läuft auf seriellem `agent/pre-step`, kanonischer Overflow-Recovery läuft auf `agent/request-error`, und manuelle Aufrufer nutzen denselben Compact-Service ([Compaction-Agent-Note](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.de.md)) |
| System-Prompt-Konfigurierbarkeit | `ctx.systemPrompt.section()` mit Sortierung und Scope-lokalem Shadowing |
| AGENTS.md (Wurzel) | ein Section-Provider, der die Datei liest |
| AGENTS.md (Unterverzeichnis, on-touch) + Dateiänderungs-Notizen | `agent.inject()` von einem Watcher / Tool-Result-Listener |
| Eingebaute Tools | `ctx.tools.register()`; Schemas fließen automatisch in die Assembly — die `dsh-tool-*`-Familien (bash, fs, web, subagent, todo) sind die ausgelieferten Beispiele |
| ToolSearch / Progressive Disclosure | ersetze eine scoped `ctx.tools.restrict()`-Registrierung, wenn sich das sichtbare Set ändert; die Registry hält Präsentation, Lookup und Execution ausgerichtet |
| Tool-Deadline / Retry / Metriken | wrappe Kern-Dispatch mit `tools/execute`; ein Wrapper darf `exec.signal` ersetzen, delegieren und das normalisierte Result in einer lexikalischen Lebensdauer inspizieren |
| Finale Tool-Result-Metriken / Audit / Capture | beobachte unveränderliche autoritative Outcomes mit `tools/result`; verwende `tools/post-execute` stattdessen nur, wenn das Plugin das Result transformieren oder Kontext anhängen muss |
| Monotone Terminal-Turn-Policy | rufe `ToolExecution.concludeTurn()` vom erfolgreichen Terminal-Tool; spätere Tool-Aufrufe in derselben Response bleiben guardable, und der Loop stoppt nach dem Step |
| Unterprozess-Sandbox (landlock / sandbox-exec) | verwende ein `ctx.sandbox`-Backend über `dsh-bash-sandbox`; Capability-Level-Ablehnung über `tools/pre-execute` |
| Permission-System / AskUserQuestion | gib `ask` von `tools/pre-execute` zurück und antworte über `ctx.approval`; registriere ein separates modellseitiges Ask-Tool für gewöhnliche Nutzerfragen |
| Plan Mode | [`@deepseek-ai/dsh-plan-mode`](../../packages/plan/plan-mode/README.de.md) — geloggter `plan/mode`-Zustand, die `plan:policy`-Guidance-Section, der `/plan [message]`-Einstieg, der `/plan off`-Direkt-Exit und der vom Nutzer geprüfte `exit_plan_mode`-Exit; Enforcement bleibt auf den unabhängigen Sandbox-/Approval-Achsen |
| Subagent-Delegation | die `ctx.subagents`-Provider-Registry (`dsh-subagent-spawn-in-process`/`dsh-subagent-fork-in-process`/`dsh-subagent-acp`/`dsh-subagent-codex`/`dsh-subagent-claude-code`/`dsh-subagent-dsh-sdk`) + `dsh-tool-subagent` stellt einen konfigurierten Provider dem Modell bereit |
| MCP | ein Plugin pro Server: Tools entdecken → `ctx.tools.register()` |
| Skills | Section- + Tool-Registrierung; `inject()` Skill-Content bei Aufruf |
| Memory | Section-Provider + Tool |
| Geplante Aufgaben (cron) | ein Plugin registriert modellaufrufbare Scheduling-Tools; Timer feuert → `followup(…, {source: {kind: 'plugin', plugin: 'schedule'}})` bei idle / `inject()`-Notification bei beschäftigt |
| UI (GUI; CLI emittiert JSONL) | höre auf `agent/assistant-stream` für Live-Chunks und `session/event` für dauerhafte Settlements, Grenzen und Tool-Aktivität; Input → `followup()` |
| Web-Client-Chat-Business-Node | registriere eine `ConversationNodeDefinition` und einen `conversation.chat.node`-keyed-Renderer |
| SessionTelemetryBackend / replaybarer Trace | `session/event` → JSONL; Replay = `sessions.create(id, { seed })` |
| Modell-Adapter | `LlmAdapter`-Subklasse über `registerAdapter` (`dsh-llm-deepseek`, `dsh-llm-pi-ai`) |
| Plugin-Hot-Reload | jede Registrierung ist ein `ctx.effect` → vendored HMR just works |
