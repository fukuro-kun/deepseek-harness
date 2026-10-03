# Agent Note: Subagent-Capability-Seam
[English](2026-06-21-subagent-capability-seam.md) | [中文](2026-06-21-subagent-capability-seam.zh.md) | Deutsch

Status: implemented


> Der vollständige Seam ist ausgeliefert: das `dsh-subagent`-Interface und der `dsh-tool-subagent`-Consumer; die beiden In-Process-Backends (`dsh-subagent-spawn-in-process`, `dsh-subagent-fork-in-process`); die Nested-Agent-Snapshot-Infrastruktur ([Per-Session-Snapshot-Replay](../../archived/testing/2026-06-22-subagent-snapshot-replay.md)); und die Out-of-Process-ACP-, Codex- und Claude-Code-Backends ([ACP-Agent-Note](../../archived/feature/2026-06-22-acp-subagent-backend.md), [Produkt-Provider-Agent-Note](2026-08-04-claude-code-and-codex-subagent-backends.de.md)).

## Problem

Das harness hat einen lange verschobenen Seam für **Subagents** — einen Agent, der Arbeit an einen anderen Agent delegiert. Die Absicht war in den `Agent`/`AgentLoop`-Interfaces skizziert ([packages/core/agent/src/types.ts](../../../../packages/core/agent/src/types.ts), [packages/core/agent-loop/src/index.ts](../../../../packages/core/agent-loop/src/index.ts)): eine Creation-Option, die einen Eltern-Agent referenziert (fork = die Child-Session mit dem Event-Log des Elternteils seeden; spawn = frische Session), wobei das Child als `Agent`-Handle zurückgegeben wird, sodass Steering und Event-Subscription einheitlich funktionieren.

**Mehrere Subagent-Implementierungen müssen zur Laufzeit koexistieren.** Ein Elternteil mag ein billiges In-Process-Child für eine abgegrenzte Unteraufgabe UND ein isoliertes Out-of-Process-Child (über ACP) in derselben Session wollen. Die Transports:

- **in-process** — ein Child konkreter `Agent` auf demselben `Context` (das billigste, und mit der bestehenden Agent-Factory nahezu gratis);
- **ACP** — als ACP-*Client* agieren, der einen anderen Agent-Prozess treibt (der eine weitere Instanz von uns selbst sein kann);
- **Codex-App-Server und Claude-Code-Agent-SDK** — die aktuellen One-Shot-Geschwister, die denselben Named-Provider-Vertrag auf offizielle Produktprozesse anwenden ([Produkt-Provider-Agent-Note](2026-08-04-claude-code-and-codex-subagent-backends.de.md));
- später: **A2A** mit derselben Out-of-Process-Form „Child starten, prompten, abrechnen, canceln".

## Erwogene Alternativen

### Warum nicht die Bash-Seam-Form

Der Bash-Seam ([Capability-Seams](../architecture/2026-06-13-capability-seams.de.md)) registriert genau einen `ShellExecutor` pro Context; ein zweiter wirft beim Laden. Das ist für Bash korrekt (eine Maschine, ein Weg, ein Kommando auszuführen), aber hier falsch: Koexistenz ist die Anforderung. Daher ist der Subagent-Service eine **Named-Provider-Registry** — jede Implementierung registriert unter einem eindeutigen Namen und ein Caller wählt einen per Name — im Spiegel der **LLM-Adapter-Registry** (`LlmRuntime.registerAdapter`), nicht des Single-Service-Bash-Executors. Der Seam bleibt dreiteilig (Service Definition / Service Provider / Consumer); nur die Achse „eine vs. viele Implementierungen" unterscheidet sich.

## Entscheidung

### Die Drei-Paket-Grenze

Eine neue Paketgruppe `packages/subagent/`:

| Paket | Rolle |
|---|---|
| `@deepseek-ai/dsh-subagent` | Interface: `SubagentRuntime` (`ctx.subagents`), `SubagentProvider`, `SubagentRun`, das Request-/Result-/Capability-Vokabular, die `subagent/*`-Events |
| `@deepseek-ai/dsh-subagent-spawn-in-process` | Implementierung: ein frisches In-Process-Child via `ctx.agents.create` |
| `@deepseek-ai/dsh-subagent-fork-in-process` | Implementierung: ein In-Process-Child, geseedet mit einem Snapshot des Eltern-Logs |
| `@deepseek-ai/dsh-subagent-acp` | Implementierung: ein ACP-Client, der einen konfigurierten Child-Prozess treibt |
| `@deepseek-ai/dsh-subagent-codex` | Implementierung: ein One-Shot-offizieller Codex-App-Server-Prozess |
| `@deepseek-ai/dsh-subagent-claude-code` | Implementierung: ein One-Shot-offizieller Claude-Code-Prozess über das Agent SDK |
| `@deepseek-ai/dsh-tool-subagent` | Consumer: das modellzugewandte `subagent`-Tool über `ctx.subagents` |

### Das Primitiv: async `start → SubagentRun`

Ein Provider legt `start(request) → Promise<SubagentRun>` offen. Erfüllung veröffentlicht ein Child und übergibt sein Run-Handle an den Caller. Arbeit, die vor der Veröffentlichung fehlschlägt, rejectet `start()`, während Prompt-, Turn-, Cancellation- und Infrastruktur-Outcomes nach der Veröffentlichung über `run.result` abgerechnet werden, ohne die Child-ID zu verbergen. Ein Signal deckt Cancellation vor und nach der Veröffentlichung ab; `dispose()` bricht verbleibende Arbeit ab und wartet auf Quiescence. Ein rejecteter Start räumt unveröffentlichte Ressourcen auf und emittiert kein Lifecycle-Event, während ein Post-Publication-Result-Fehler das veröffentlichte Lifecycle-Paar schließt. `start` ist transport-neutral; `spawn` benennt nur das frische In-Process-Backend.

### Zwei Arten optionaler Capability, auf zwei Wegen entdeckt

- **Start-Time-Features** (`agentOptions`, `outputSchema`, `depthLimit`, `toolFilter`, `persona`) reiten auf einem statischen `provider.capabilities`-Descriptor. Der Service prüft jedes angeforderte VOR dem Delegieren und **rejectet laut** (`SubagentError('UNSUPPORTED_CAPABILITY')`), wenn dem Provider das Feature fehlt — niemals accepted-then-ignored. Sie müssen geprüft werden, bevor ein Run existiert, weshalb sie keine Runtime-Methoden sein können.
- **Continuable Creation** ist die optionale `SubagentProvider.prepareContinuable`-Methode; ihre Anwesenheit ist die Capability und TypeScript-Narrowing der Discovery-Mechanismus, sodass kein separates Flag von der Implementierung driften kann. Der Continuation-Manager besitzt spätere Delivery und Cold Resume direkt über `AgentHandle`, während One-Shot-`SubagentRun` keine Steering- oder Resume-Operation hat, wie von [continuable subagents](2026-07-28-continuable-subagent-conversations.de.md) verfeinert.

### Fork vs. Fresh sind separate Backends, kein Flag

Frische und geforkte Children sind separate Provider, kein Request-Flag. `dsh-subagent-spawn-in-process` startet ein isoliertes Child; `dsh-subagent-fork-in-process` seedet ein balanciertes Präfix, das nur vollendete Eltern-Turns enthält. Der In-Flight-Turn ist ausgeschlossen, weil sein Subagent-Call noch kein Ergebnis hat und keine gültige Replay-History bilden kann.

### Child-Isolation und das Eltern-Log

Jeder In-Process-Subagent läuft in seiner **eigenen `Session`** (eigene ID, `parentSession`-Lineage), unabhängig persistiert. Remote-ACP- und One-Shot-Produkt-Provider prägen stattdessen eine Parent-gescopte Lifecycle-ID und legen weder lokalen `Agent` noch Child-`Session` offen; ihr interner State bleibt im Remote-Prozess. Über beide Formen hinweg zeichnet das Eltern-Log nur den Spawn-`tool/call` und sein `tool/result` auf (den finalen Output des Child oder ein fehlgeschlagenes Result mit optionaler Provider-Diagnostik), während Child-Schritte und Tool-Calls außerhalb des Eltern-Logs bleiben.

### Synchronous Collect (erster Schnitt)

`dsh-tool-subagent` reicht sein Execution-Signal an `start()` weiter, wartet auf das Child-Ergebnis und disposed den Run vor dem Berichten. Nicht-vollendete Outcomes werden zu Fehler-Results statt zu erfolgreichem Partial-Output; sie präsentieren die optionale sichere Diagnostik der [Non-Interactive-Permissions-Entscheidung](2026-08-15-product-subagent-noninteractive-permissions.de.md) getrennt von partiellem Assistant-Text. Unabhängige Result- und Disposal-Rejections bleiben unabhängig beobachtbar.

### Transport-Provider-Auswahl ist Config, nicht modellzugewandt

`dsh-tool-subagent` bindet an genau einen Subagent-Transport-Provider-Namen (`Config.provider`). Um mehr als einen Transport zu exponieren, lädt man das Tool-Plugin mehrfach, jeweils an einen anderen Provider und einen eigenen `toolName` gebunden (die Tool-Registry lehnt doppelte Namen ab). Der *Service* hält die Multi-Provider-Registry; das *Tool* wählt einen — sein Schema trägt keinen Subagent-Transport-/Type-Parameter. Ein späteres Opt-in fügt Child-LLM-Provider/Model-Felder hinzu, ohne diese Transport-Entscheidung zu ändern; siehe [model-selected subagent routes](2026-08-18-model-selected-subagent-routes.de.md).

## Testing

Registry- und Tool-Tests ersetzen nur das nichtdeterministische Child durch einen paketlokalen skriptgesteuerten Provider, während sie die echte `SubagentRuntime`, den Lifecycle, die Task-Integration und das modellzugewandte Tool ausüben. Loader-Regressionstests decken weiterhin die Provider- und Consumer-Exports für den in [Postmortem 0001](../../../../docs/postmortem/0001-acp-default-export-drops-inject.de.md) beschriebenen Fehler ab. Registry-Tests decken Reload-Sicherheit, doppelte Namen und Start-Time-Capability-Ablehnung ab; Nested-Agent-Szenarien replayen schlüssellos über das [Per-Session-Snapshot-Replay](../../archived/testing/2026-06-22-subagent-snapshot-replay.md); In-Process-Backends haben außerdem Real-Loop-Unit-Tests und einen With-Key-e2e.

## Konsequenzen

- **Rekursion.** Ohne Grenze kann ein In-Process-Child das Delegation-Tool sehen und rekursieren. Die In-Process-Backends implementieren das optionale absolute Tiefenlimit und den gescopte Live-Global-`toolFilter`; ACP bewirbt beide Capabilities als aus und rejectet einen solchen Request. Die [Subagent-Composition-Controls-Agent-Note](2026-07-12-subagent-persona-tool-filter-and-depth.de.md) besitzt ihre exakte Semantik und Sicherheitsgrenzen.
- **Blockierung des Eltern-Turns.** Foreground-Collection hält den Schritt des Elternteils für die gesamte Dauer des Child offen. Hintergrund-Delegation verwendet die geteilte `ctx.jobs`-Runtime und die generischen `job_*`-Tools, denselben Collection-Mechanismus wie Background-Bash; der Subagent-Seam selbst bleibt aufgaben-agnostisch.
- **Live-Fortschritt.** Nur Lifecycle + das finale Ergebnis werden sichtbar; ein Per-Chunk-Child→Parent-Update-Stream ist mit dem Hintergrund-Redesign verschoben.
- **ACP-Client-Oberfläche.** Das Proxyen von `fs`/`terminal` vom ACP-Child zurück zum Elternteil (ein Shared-Workspace-Modus) ist künftige Arbeit; das Backend bewirbt keine der beiden Capabilities, sodass das Child sich in seinem eigenen Prozess selbst bedient.
