# Agent Note: Kanonischer Tool-Output-Contract

Status: implemented

[English](2026-07-20-canonical-tool-output-contract.md) | [中文](2026-07-20-canonical-tool-output-contract.zh.md) | Deutsch

## Problem

Tool-Bodies authored bisher model-facing `ContentBlock[]` direkt, optional umhüllt von opaquem `meta`. Native Function Calling hatte daher eine nutzbare Human-Projektion, doch ein programmatischer Aufrufer hatte keinen stabilen Domänenwert: Der PTC-Modus flachte die Blöcke zurück in einen String ab, dynamische Tools wiederholten die Content-Form, und Policy konnte die Presentation ersetzen, ohne dass diese Änderung von einer Ersetzung des Operationsergebnisses unterscheidbar gewesen wäre. Mehrere Capability-Seams lieferten bereits reichere Provider-Werte, nur um sie an ihrer model-facing Tool-Grenze zu verwerfen.

Der durable Session-Contract machte diese Presentation für Replay maßgeblich, doch das Persistieren jedes reichhaltigen Zwischenwerts würde Logs vergrößern, Implementierungsdaten gegenüber Compaction und Migration exponieren und eine execution-lokale API fälschlich in Session-Format verwandeln. Die Foundation braucht stattdessen einen typisierten Wert während der Ausführung und eine explizite Projektion in den bestehenden durable/model-facing Content.

## Entscheidung

Jedes Tool deklariert ein obligatorisches kanonisches Output und gibt nur den darin beschriebenen Wert zurück:

```ts ignore-check
output: {
  schema: OutputSchema
  render(args, value): ContentBlock[]
  presentationMeta?(args, value): JsonValue
}
```

`defineTool` inferiert den Body-Rückgabewert und beide Projektoren aus dem unified `ValueSchemaSpec`. Raw- und Dynamic-Definitionen liefern die kompilierte `JsonSchemaNode`-Form. Die Registrierung lehnt eine fehlende Deklaration oder ein nicht unterstütztes Raw-Schema ab; es gibt keinen Content-Return-Kompatibilitätspfad.

Bei jedem erfolgreichen Dispatch snapshotet die Registry den zurückgegebenen Wert als lossless `JsonValue`, validiert ihn gegen `output.schema`, friert ihn tief ein und ruft dann den puren Renderer und, bei einem direkten Surface-Call, den optionalen Metadaten-Projektor auf. Renderer-, Projektor-, Schema- oder Lossless-JSON-Fehler werden als gewöhnliche `ToolOutputError`-Ergebnisse eingedämmt. Ein Around-`tools/execute`-Wrapper empfängt und gibt die kanonische Success-/Failure-Union zurück; ein vom Wrapper authored Success wird erneut durch die Output-Deklaration des aufgelösten Tools normalisiert, statt unabhängig authoredem Content zu vertrauen. Jedes kanonische Ergebnis ist an das unveränderliche Dispatch-Token gebunden, das es erzeugt hat, sodass die Rückgabe eines gecachten Ergebnisses eines anderen Calls oder Tools eine Normalisierung unter der aktiven Deklaration auslöst, statt sie zu umgehen.

```ts ignore-check
type ToolExecutionResult =
  | { isError: false; value: JsonValue; content: ContentBlock[]; meta?: JsonValue; additionalContexts?: HookContext[] }
  | { isError: true; error: { message: string; info?: { name: string; code: string } }; content: ContentBlock[]; meta?: JsonValue; additionalContexts?: HookContext[] }
```

`tools/post-execute` hat zwei sich gegenseitig ausschließende erfolgreiche Projektionen. Das Ersetzen von `content` ändert nur die Native-/Model-Presentation und bewahrt den kanonischen Wert und die Metadaten. Das Ersetzen von `value` revalidiert den Ersatz und berechnet beide Presentationsprojektionen neu. Ein Block entfernt den Wert und wird zu einem Failure. Content-Ersetzung ist daher kein Vertraulichkeitsmechanismus: Eine Policy, die programmatischen Zugriff verhindern muss, blockiert den Call oder ersetzt den Wert.

Kanonische Werte sind execution-lokal. Der Agent-Loop persistiert `tool/result` nur mit `content`, `error` und optionalem `meta`; der `tool/ptc-dispatch` des PTC-Modus persistiert den gerenderten `content` und `isError` des Sub-Calls. Keines der Events speichert den kanonischen Zwischenwert, sodass Replay die Presentation reproduziert, aber das programmatische Ergebnis nicht rekonstruieren kann. Wenn ein Tool `presentationMeta` deklariert, wird es nur für einen direkten Surface-Call berechnet; ein verschachtelter Code-Dispatch erhält keine Metadaten. Der Client kann [verschachtelte Terminal-Cards](../bug-fix/2026-09-05-nested-terminal-cards.de.md) aus rohen Argumenten und gerendertem Content ohne diese Metadaten ableiten. Die äußere `run_code`-Card liest stattdessen finalen Post-Policy-Content und deklariert keine Presentationsmetadaten. Generische und tool-eigene Spill-Projektionen überspringen verschachtelte Dispatches ebenso, deren kanonischer Wert nie in den Model-Kontext gelangt.

Die First-Party-Tools bewahren ihren bestehenden Native-Text und geben Domänen-DTOs zurück:

| Tool-Familie | Kanonischer Wert |
|---|---|
| `read` | `{ path, offset, lines: [{ number, text }], totalLines }` |
| `write` | `{ path, operation: "create" | "update", before: string | null, after }` |
| `edit` | `{ path, before, after }` |
| `glob` | `{ paths: string[] }` |
| `grep` | `{ matches: [{ path, lineNumber, line }] }` |
| `web_search` / `web_fetch` | Das normalisierte `WebSearchResult` / `WebFetchResult` |
| `lsp` | `{ kind: "locations", locations, resolvedWorkspaceUri }` oder `{ kind: "hover", hover }` |
| `bash` | `{ kind: "background", jobId }` oder `{ kind: "foreground" } & ShellRunResult` |
| `terminal_open` / `terminal_list` / `terminal_send` / `terminal_read` / `terminal_signal` / `terminal_close` | Public-Session-Snapshots, begrenzte Read-/Send-DTOs, Signal-/Close-Outcomes oder ein Background-Job-Handle |
| `job_output` / `job_list` / `job_kill` | Public-Task-Snapshots ohne Owner- oder Notification-Buchführung |
| `subagent` | Background-Job-Handle oder `{ kind: "foreground", runId, output: JsonValue[] }` |
| `workflow` / `ralph` | `{ runId, agentsStarted, result: JsonValue }` |
| `skill` | `{ name, provider, resourceBase?, content }` |
| `todo_write` | `{ todos, counts }` |
| `ask_user_question` | `{ answers: [{ id, selected, custom? }] }` |
| `exit_plan_mode` | `{ approved: true }` |
| `cordis_inspect` / `cordis_mount` / `cordis_unmount` | Inspection-Text oder typisierte Temporary-Plugin-Handles |
| `structured_output` | `{ recorded: true }` |
| `run_code` | `{ logs: string[], result?: JsonValue }` |

Provider- und Executor-Acquisition-Limits bleiben reale Limits auf dem kanonischen Wert. Formatierungs-only-Limits gehören in `render`; `glob` und `grep` etwa behalten jedes akquirierte Item in `value`, während ihre Native-Projektion die konfigurierte erste Seite zurückhält und best-effort spillt. Generic-Spill stellt seinen Post-Execute-Listener voran und delegiert ihn, sodass eine gewöhnliche tool-eigene asynchrone Projektion vor der generischen Byte-Begrenzung abschließt, unabhängig von der Plugin-Ladereihenfolge. Filesystem-Mutationen leiten replaybare Diff-Metadaten aus `args` und dem kanonischen Before-/After-Wert ab, statt UI-State aus dem Body zurückzugeben.

MCP-Bridges bewahren Protokollblöcke durch `McpResult<{...}> = { content: JsonValue[]; structuredContent? }`. Ein beworbenes `outputSchema` wird erzwungen, wenn es zum unterstützten Raw-Subset gehört; nicht unterstützte Schemas fallen auf `JsonValue` zurück, statt eine Validierung vorzutäuschen. Das Native-Rendering nutzt weiterhin die bestehende MCP-zu-`ContentBlock`-Projektion, und MCP `isError` wird zu einem fehlgeschlagenen Tool-Ergebnis.

## Erwogene Alternativen

- **Gerenderten Text an den PTC-Modus zurückgeben:** abgelehnt, weil Aufrufer weiterhin Prosa nach job ids, Mount-ids, Pfaden und strukturierten Provider-Ergebnissen durchsuchen würden.
- **Kanonische Werte auf `tool/result` persistieren:** abgelehnt, weil verschachtelte Ausführungswerte keine Model-History sind, Replay nicht überleben müssen und eine Session-Format- und Storage-Verpflichtung schaffen würden, die nichts mit der Native-Rekonstruktion zu tun hat.
- **Tools sowohl Wert als auch Content zurückgeben lassen:** abgelehnt, weil zwei author-eigene Ergebnisse widersprechen können und Policy nicht angeben kann, welches maßgeblich ist. Der Renderer macht Presentation zu einer deterministischen Projektion des validierten Werts.
- **Content-Ersetzung als Wert-Redaktion behandeln:** abgelehnt, weil Presentation und programmatischer Zugriff unterschiedliche Consumer sind; nur die erstere zu verbergen würde eine falsche Sicherheitsgrenze schaffen.
- **Objekt-wurzelige Tool-Outputs fordern:** abgelehnt, weil skalare, Array- und Null-Ergebnisse legitime JSON-APIs sind. Object-Rooting bleibt eine Consumer-Regel für caller-definierte strukturierte Subagent-/Workflow-Outputs.

## Konsequenzen

Native- und Replay-Verhalten bleiben Content-first und bytekompatibel, während Execution-Time-Aufrufer einen validierten Domänenwert nutzen können, ohne diesen Content zu parsen. Failures haben eine obligatorische Message plus optionale interne Klassen-/Code-Information, erfolgreiche und fehlgeschlagene Ergebnisse sind diskriminiert, und ein fehlgeschlagenes Ergebnis kann nie einen Wert versprechen. Tool-Autoren müssen Wert und Native-Projektion gemeinsam entwerfen; die zusätzliche Deklaration ist beabsichtigt, weil sie verhindert, dass versehentliche programmatische Contracts aus Prosa inferiert werden.

Zwischenwerte bleiben nur durch die produzierende Capability und den Prozessspeicher begrenzt. Ihr Weglassen aus dem Log bedeutet, dass Replay sie nicht wiederherstellen kann, und eine Content-only-Post-Policy verbirgt sie nicht. Dies sind explizite Eigenschaften des execution-lokalen Contracts, keine versehentlichen Lücken.
