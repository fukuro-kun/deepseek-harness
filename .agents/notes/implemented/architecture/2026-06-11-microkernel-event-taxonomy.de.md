# Agent Note: Microkernel — Extension über die Cordis-Event-taxonomy, ein konkreter loop
[English](2026-06-11-microkernel-event-taxonomy.md) | [中文](2026-06-11-microkernel-event-taxonomy.zh.md) | Deutsch

Status: implemented


## Problem

Das Produktprinzip lautet "Alles ist ein plugin": hooks, /goal, /loop, dynamische workflows, compaction, sandboxing, permissions, UI, persistence, MCP, skills müssen alle als plugins schreibbar sein, ohne den Kern zu ändern.

## Entscheidung

Reine Cordis-Event-taxonomy. Die extension points des loops sind typisierte events mit bewusst gewählten dispatch-Modes:

- **waterfall** (around-middleware), wo plugins transformieren, short-circuiten, recovern oder wrappen: `agent/pre-step`, `agent/request`, `agent/request-error`, `tools/pre-execute`, `tools/execute`, `tools/post-execute`, `llm/stream`, `system-prompt/assemble`.
- **serial** (in listener-Reihenfolge awaited) für geordnete checkpoints wie `agent/turn-stopping`.
- **parallel** (awaited fan-out), wo jeder listener eine unabhängige Chance erhalten muss: der `session/flush`-durable-checkpoint.
- **emit** (synchrones fire-and-forget) für notifications: inbox-Transitions, lifecycle, errors und die enthaltene immutable `tools/result`-observation. Durable session events besitzen die turn- und step-Grenzen.

Die event-Vocabulary lebt in contract packages (`dsh-agent` deklariert die `agent/*`-events); `@deepseek-ai/dsh-agent-loop` ist das einzige konkrete loop plugin und selbst austauschbar — nichts außerhalb darf von ihm abhängen.

## In Betracht gezogene Alternativen

**Ein zweckgebauter middleware-Stack (koa-compose-Stil)** und **eine explizite Phase-State-Machine, in die plugins Phasen einfügen** — beide würden dispatch, disposal und reload-Semantik neu implementieren, die das native Event-System von Cordis bereits bereitstellt; als Cordis effects erhalten listener HMR und disposal gratis.

## Konsequenzen

- Jedes MVP-feature ist einem listener zugeordnet (die [feature → mechanism map](../../../../docs/cookbook/extension-cookbook.de.md#the-feature--mechanism-map) ist die Beweisverpflichtung, aktuell gehalten).
- HMR und disposal kommen gratis: listener und registrations sind Cordis effects.
- Waterfall-Semantik (`next()` aufrufen oder short-circuit) ist nicht offensichtlich und muss gelehrt werden — in AGENTS.md dokumentiert und von composition tests abgedeckt.
- Der loop muss defensiv sein: plugin-Exceptions werden auf turn-Ebene enthalten, steering von jedem extension point bleibt nie stranded (regressionstest-gesichert).
