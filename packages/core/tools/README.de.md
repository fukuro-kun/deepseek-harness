---
description: "Die Tool-Registry und Ausführungs-Pipeline für Tool-Autoren und Maintainer, die modellseitige Tools registrieren, einschränken, präsentieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tools
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Verwenden Sie `dsh-tools`, um Modellen typisierte Fähigkeiten bereitzustellen, Aufrufe zu validieren, Allow/Deny/Ask-Policy durchzusetzen und finalisierte Ergebnisse zu liefern, ohne bei gewöhnlichen Tool-Fehlern einen Turn zu beenden. Wählen Sie mit `mode` zwischen nativem Function Calling, [PTC mode](#ptc-mode) oder beidem; ein agent kann den Standard über `presentAs` überschreiben. Tool-Autoren deklarieren mit `defineTool` typisierte Parameter und Ausgaben, kooperative Timeouts, Parallel-Sicherheit und optionale UI-Präsentation. Modelle sehen den deklarierten Namen, die Beschreibung und das Parameter-schema jedes erlaubten Tools; agent-spezifische Restriktionen können diese sichtbare Menge verkleinern.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounten Sie `dsh-tools` überall dort, wo agents Tools aufrufen: Es stellt `ctx.tools` bereit, die Registry, in die jedes Tool-Plugin registriert und über die der Loop dispatcht. Ein Tool zu registrieren reicht, um es sichtbar zu machen — die Registry speist seine schemas automatisch in die System-Prompt-Assemblierung ein.

### Ein Tool registrieren

`defineTool` baut eine typisierte Tool-Definition: einen modellseitigen Namen, eine Beschreibung und ein Parameter-schema, eine kanonische Ausgabedeklaration und einen `execute`-Körper, der nur den deklarierten JSON-Wert zurückgibt. Modellargumente werden vor der Ausführung validiert; ungültige Eingabe wird zu einem normalen Fehlerergebnis.

```ts
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

declare const ctx: Context

ctx.tools.register(defineTool({
  name: 'read_file',
  description: 'Read a file from disk.',
  parameters: {
    path: { type: 'string', required: true, description: 'Absolute file path' },
    offset: { type: 'number' },
    limit: { type: 'number' },
  },
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute(args, exec) {
    // args is typed: { path: string; offset?: number; limit?: number }
    return readFile(args.path, { encoding: 'utf8', signal: exec.signal })
  },
}))
```

Die einheitliche schema DSL unterstützt `string`, `number`, `integer`, `boolean`, `null`, `array`, `object`, das nur für Autoren gedachte `json` und das exakt-eine `oneOf`; `InferValue` bewahrt exakte Typen über 16 Containerebenen, bevor es zu `JsonValue` verbreitert. Ein rohes JSON Schema (`JsonSchemaNode`) ist das wire-level-Gegenstück, das mit subagents, Workflows und MCP geteilt wird.

### Den Präsentationsmodus konfigurieren

Die `mode`-Config entscheidet, was das Modell sieht: `native` (jedes sichtbare schema), `ptc` (nur `run_code` plus ein generiertes SDK) oder `both`.

```yaml
- name: '@deepseek-ai/dsh-tools'
  config:
    mode: native
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `mode` | `native` | Wie sichtbare Tools dem Modell präsentiert werden: `native`, `ptc` oder `both` |
| `maxParallelSubCalls` | `10` | Nebenläufigkeits-Obergrenze für die überlappenden Unteraufrufe eines `run_code`-Programms; `1` stellt streng serielle Dispatch wieder her |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tools) ist die erschöpfende Quelle für jedes akzeptierte Feld. Nicht-native Modi erfordern ein komponiertes `ctx.codeRuntime`, dessen Sprache einen registrierten SDK-Renderer hat; ein agent preset wählt seine eigene Präsentation über [`dsh-agent-tool-presentation`](../agent-tool-presentation/README.de.md), und ein einzelner agent kann den Standard mit `presentAs(mode)` überschreiben.

### Tools pro agent einschränken

`ctx.tools.restrict(filter)` wendet eine Allow- oder Deny-Maske auf die globalen Tools an, die ein agent erbt; Masken schneiden sich, scoped Registrierungen bleiben sichtbar, und die Restriktion wird beim dispose aufgehoben. `ctx.tools.get(name, scope)` löst ein Tool so auf, wie ein Scope es sieht. Ein Host-lokaler presenter-Consumer übergibt den aufrufenden agent, wenn er mit der ausgeführten Definition übereinstimmen muss. `ctx.tools.schemas(scope)` liefert die sichtbaren schemas ohne die `execute`-Funktionen.

### Policy auf Aufrufe anwenden

`ctx.tools.guard(guard)` registriert einen monotonen synchronen Guard hinter dem erweiterbaren `tools/pre-execute`-waterfall: Ein zurückgegebener Grund lehnt den Aufruf ab, und kein späterer Listener kann diese Ablehnung zurück in eine Erlaubnis wandeln. Die Pipeline-Events geben Plugins mehr Kontrolle — `tools/pre-execute` entscheidet allow/deny/ask, `tools/execute` umhüllt den Dispatch für Timeout oder Retry, `tools/post-execute` inspiziert oder ersetzt das Ergebnis, und `tools/result` beobachtet das eingefrorene Endergebnis.

### Host-Präsentationsdeskriptoren

Ein Tool kann reine `presentCall()`- und `presentResult()`-Methoden für Host-lokale Consumers behalten. Der eingebaute Web Client konsumiert diese Werte nicht. Er wählt einen Renderer über `tool.call.toolview` und leitet Card-Props aus rohen Aufrufargumenten, Ergebnisinhalt, Fehlerzustand und persistierten Metadaten ab. Die [Client-derived-Presentation-Entscheidung](../../../.agents/notes/implemented/architecture/2026-08-23-client-derived-tool-presentation.de.md) ist Eigentümerin dieser Transport-Aufteilung.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie das Paket das obige Verhalten realisiert; der beobachtbare Vertrag ist in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designkonzept

Die Registry hält typisierte `ToolDefinition`s in scoped Schichten und projiziert sie zur Anfragezeit auf die modellseitige `ToolSchema`-Menge — `output`, `execute`, `finalizeContent`, `timeoutMs` und Präsentations-Callbacks gelangen nie auf die Leitung. Jeder Aufruf durchläuft eine feste Pipeline: `tools/pre-execute` (erweiterbares allow/deny/ask) → registrierte monotone Guards → `tools/execute` (around-dispatch-Wrapper) → `tools/post-execute` (inspizieren/ersetzen, Kontext anhängen) → das definitions-eigene `finalizeContent` → das nur-beobachtende `tools/result`-Event. Nur die `tools/execute`-Sicht darf das erforderliche Signal ersetzen, und die Registry fügt das Caller-Signal vor dem Körper wieder zusammen.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `ToolRuntime`-Service, Config, Registry, Ausführungs-Pipeline |
| [`src/types.ts`](src/types.ts) | `ToolDefinition`, `ToolExecution`, `ToolExecutionResult`, Guard- und Entscheidungstypen |
| [`src/schema.ts`](src/schema.ts) | Die `defineTool`-DSL: `ValueSchemaSpec`, `ParameterSchemaSpec`, `InferValue`, `InferArgs` |
| [`src/json-schema.ts`](src/json-schema.ts) | Die erzwungene rohe JSON-Schema-Teilmenge und Validierung |
| [`src/presentation.ts`](src/presentation.ts) | Die `card`-getaggten UI-Render-Intents |
| [`src/ptc.ts`](src/ptc.ts) | PTC mode: SDK-Generierung, `run_code`-Dispatch-Brücke, Settlement |
| [`src/ts-types.ts`](src/ts-types.ts) | TypeScript-SDK-Typrendering |
| [`src/py-types.ts`](src/py-types.ts) | Python-SDK-Typrendering |
| [`src/invariant.ts`](src/invariant.ts) | Invariant-Begleiter |

### Ausführung und Abbruch

Jeder typisierte Aufruf materialisiert und friert die geparsten Argumente ein, weist ein opakes Korrelationstoken zu und führt Policy und Dispatch aus. Der Abbruch ist kooperativ und quiescent: Jeder Tool-Körper erhält das caller-eigene `exec.signal` und muss es beachten; Abbruch vor dem Körperaufruf ist `ABORTED_BEFORE_DISPATCH`, nach dem Aufruf ersetzt er nur ein erfolgreiches Ergebnis durch `ABORTED`. Ablehnungen, Wrapper-Fehler, Tool-Fehler, Post-Policy-Fehler und timeout-eigenes `TOOL_TIMEOUT` bleiben spezifischer. Unbekannte und werfende Tools werden zu strukturierten Fehlern (`UNKNOWN_TOOL`), sodass ein Aufruf fehlschlägt, ohne den Turn zu beenden.

### PTC mode

Unter `ptc` oder `both` stellt die Registry den reservierten `run_code`-Transport plus ein deterministisch in der Sprache der geladenen Runtime generiertes SDK bereit. Jeder SDK-Binding-Aufruf betritt die vollständige Tool-Pipeline erneut, mit geloggter Korrelation zum äußeren Aufruf, geplant über einen pro-Run-Pool, der den nativen Nebenläufigkeitsvertrag wiederverwendet. Unter reinem `ptc` löst ein modell-direkter Aufruf, der ein anderes sichtbares Tool benennt, vor der Policy zu `UNKNOWN_TOOL` auf — die angekündigte Fläche und die aufrufbare Fläche bleiben identisch. Zwischenwerte von Bindings sind ausführungslokal; nur das äußere `run_code`-Ergebnis hat eine harte Größenbegrenzung. Die [Executor-Collapse-Note](../../../.agents/notes/implemented/bug-fix/2026-08-07-ptc-executor-collapse.de.md) ist Eigentümerin des Collapse-Vertrags.

Neue Unteraufrufe verwenden `<parent>:ptc:<n>`-IDs. Consumers behandeln diese IDs als opak und korrelieren Events durch exakte Gleichheit; wiederhergestellte historische IDs behalten ihre Originalbytes. Die [PTC-mode-Entscheidung](../../../.agents/notes/implemented/feature/2026-06-15-ptc.de.md) ist Eigentümerin der dauerhaften Benennungs- und Wiederherstellungsregeln.

<a id="extension-points"></a>
### Erweiterungspunkte

Tool-Plugins rufen `ctx.tools.register()`, und ihre schemas fließen automatisch in die Prompt-Assemblierung. `tools/pre-execute` ist das umordbare Allow/Deny/Ask-Gate; `ctx.tools.guard()` fügt dahinter monotone Owner-Policy hinzu; `tools/execute` umhüllt den normalisierten kanonischen Dispatch für Timeout, Retry oder Metriken; `tools/post-execute` kann Inhalt oder Wert ersetzen, mit Feedback blockieren oder geordnete Kontexte anhängen; `tools/result` beobachtet das unveränderliche Endergebnis. MCP-Server entdecken Tools und registrieren sie mit den schemas des Servers.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Der paketweite Vertrag reicht für die meisten Consumers; lesen Sie diese Seiten, wenn Sie das umgebende Gebiet brauchen.

- [Tools-Subsystem](../../../docs/subsystems/tools.de.md) — die vollständigen Pipeline-Typen, schema DSL und generierte Service-API.
- [Generierter Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tools) — die schemas der ausgelieferten Tools, die das Modell erhält.
- [Tool-Ausführungs-Pipeline](../../../docs/tool-execution-pipeline.de.md) — die Pipeline visualisiert.
- [Cookbook: Ein Tool hinzufügen](../../../docs/cookbook/adding-a-tool.de.md) — schrittweises Tool-Authoring.
- [Agent Note zu kooperativem Abbruch](../../../.agents/notes/implemented/architecture/2026-07-19-cooperative-tool-cancellation.de.md) — der vollständige Abbruchvertrag.
- [Core-Gruppenkarte](../README.de.md) — wie die Core-Pakete komponieren.

-----

<a id="model-experience"></a>
## Model Experience

### Normale Tool-schemas

#### Was das Modell sieht

Im normalen Modus sieht das Modell den exakten Namen, die Beschreibung und das JSON schema jeder sichtbaren Definition; die ausgelieferten Definitionen sind im generierten [Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tools) verzeichnet. Agent-scoped Restriktionen, Schatten und Erweiterungsregistrierungen verändern die End-Tool-Menge dieses agents.

#### Token-Effekt

Feste Kosten pro Anfrage proportional zu den sichtbaren Definitionen. Restriktionen, die Tools verbergen, entfernen deren gesamte schema-Kosten für diesen agent.

#### KV-Cache-Effekt

Präfix-stabil, solange sichtbare Definitionen und ihre Reihenfolge unverändert sind. Registrierung, Disposal oder scoped Restriktion können die Wiederverwendung ab dem ersten geänderten schema-Token ungültig machen.

### PTC-mode-schema und System-Prompt

#### Was das Modell sieht

PTC mode stellt das generierte [`run_code`-schema](../../../docs/tool-catalog.de.md#deepseek-aidsh-tools), die SDK-Anweisungen unten und den generierten exakten SDK-Block für die Sprache der geladenen Runtime bereit. Die TypeScript-Anweisungen kennzeichnen generierte Deklarationen als nur-programminterne Bindings. Wenn das aktuelle `bash`-Parameter-schema die Beispielargumente akzeptiert, zeigen sie außerdem einen vollständigen `run_code`-Aufruf um `tools.bash(...)`. Der `tools:sdk`-Abschnitt verwendet die First-party-Reihenfolge 5000. `both` stellt normale schemas und diese PTC-mode-API bereit; unter `ptc` trägt der Prompt zusätzlich die `tools:ptc-only`-Regel früher in der First-party-Reihenfolge, sodass das Modell zuerst liest, welche Tools es aufrufen darf, bevor es liest, wofür jedes dient.

##### TypeScript-PTC-mode-SDK-Anweisungen mit bash

```markdown
## Writing code for run_code

`run_code` takes two required arguments: `code` — the body of an async TypeScript function (erasable syntax only — no `enum` or namespaces; type annotations are advisory, the code runs type-stripped) — and `description`, a short summary of what the program does. The declarations below are SDK bindings for this program. A declaration does not make its name a directly callable tool; only names supplied as separate tool schemas may be called directly. When no separate `bash` schema is supplied, invoke a declared `bash` binding inside `run_code`:

`run_code({ code: "return await tools.bash({ command: 'pwd', description: 'Show current directory' })", description: "Show current directory" })`

Inside the program:

- Call tools as `await tools.name(args)` — quoted access for exotic names: `tools["my-tool"](args)`. Every call resolves to the tool's typed canonical JSON value. Tool arguments must be lossless JSON.
- A FAILED tool call rejects with `ToolCallError`, whose `toolName` identifies the failed tool and whose `message` is human-readable — `try/catch` it to handle and continue.
- Independent read-only calls MAY overlap under `Promise.all` (safe calls run concurrently; mutating calls run alone, in submission order). Sequence dependent work with `await`.
- Emit results with `return` and/or `console.log(...)`. Only what you print or return is program output. A successful tool result containing an image is attached after the run so you can inspect it on the next step; every other intermediate result stays out of the conversation, so extract just what you need.

Program-only SDK bindings:
```

#### Token-Effekt

Feste Kosten pro Anfrage proportional zu den sichtbaren Definitionen. PTC mode tauscht End-Tool-schemas gegen generierten SDK-Text plus ein Transport-schema, statt eine universelle Reduktion zu versprechen.

#### KV-Cache-Effekt

Präfix-stabil, solange PTC-mode-Auswahl, generiertes SDK, Transport-schema und sichtbare Tool-Menge unverändert sind. Modus- oder Filteränderungen können die Wiederverwendung ab dem ersten geänderten Prompt- oder schema-Token ungültig machen.

### Tool-Aufruf-Historie und Ergebnisse

#### Was das Modell sieht

Der Loop behält die vom Modell gesendeten Argumente und den finalen Inhalt der Registry. Jeder geworfene oder abgelehnte Aufruf wird exakt zu `Error: <message>`. PTC mode rendert die gedruckten Zeilen und den Rückgabewert des äußeren Programms, `(run_code completed with no output)`, wenn beides leer ist, oder `Error: code run failed (<kind>): <message>`, gefolgt — sofern vorhanden — von `Captured output:` und den erfassten Zeilen. Innere Dispatch-Events bleiben nur im Log, während ein erfolgreiches bildtragendes Unterergebnis nach dem äußeren Ergebnis als quellenzugeordneter Kontext angehängt wird.

#### Token-Effekt

Argumente, Ergebnisse und zusätzlicher Kontext sind datenabhängig und werden bis zur compaction erneut gesendet. Restriktionen, die Tools verbergen, entfernen deren schemas außerdem, bevor das Modell sie aufrufen kann.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Anfrage-Präfix und macht keine bestehenden KV-Cache-Einträge ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die Registry besondere Sorgfalt braucht. Es sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Nebenläufigkeits-Policy ist kein Event-Gate** — `executionMode()` liest die aufgelöste Tool-Definition direkt; Plugins können nur auf Definitionen, die sie besitzen, einen Klassifikator deklarieren.
- **`tools/pre-execute` kann `exec.arguments` bewusst nicht umschreiben** — geloggte und gerenderte Argumente würden von dem abweichen, was lief; das Rewrite-Design steht in [einem vorgeschlagenen Agent Note](../../../.agents/notes/proposed/feature/2026-06-30-pre-tool-input-rewrite.de.md).
- **Caller-definierte strukturierte Ausgaben von subagents und Workflows bleiben objektverwurzelt** — das ist ein Consumer-seitiger Guard; das geteilte schema-Vokabular und Tool-Ausgaben unterstützen jede JSON-Wurzel.
- **`timeoutMs` auf einer Definition ist nur deklarativ** — die Registry erzwingt niemals Deadlines; Durchsetzung erfordert den `@deepseek-ai/dsh-tool-call-timeout-policy`-Wrapper.
- **Die SDK-Sprache des PTC mode folgt der einen geladenen Runtime, und eine Präsentation gilt pro agent statt pro Tool** — `mode: ptc`/`both` lehnt die Prompt-Assemblierung ab, wenn `ctx.codeRuntime.language` keinen registrierten SDK-Renderer hat; innerhalb eines agents kann kein Tool native-only sein, während ein anderes ptc-only ist.
- **PTC-mode-Zwischenwerte sind ausführungslokal und bytes-mäßig unbegrenzt** — sie können nicht aus dem Session-Replay rekonstruiert werden und können Prozess- oder Worker-Speicher erschöpfen; nur die äußere `run_code`-Ausgabe hat das konfigurierbare harte Limit des Workers.
- **`run_code`-Zustand ist pro Run frisch** — ein persistenter REPL-artiger Kernel ist für das MVP abgelehnt, weil aufrufübergreifender Zustand im Log unsichtbar wäre.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
