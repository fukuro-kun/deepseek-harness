# Tool-Authoring-Referenz
[English](adding-a-tool.md) | [中文](adding-a-tool.zh.md) | Deutsch


Referenz für die Verträge, die ein modellseitiges Tool erfüllen muss. Für ein erstes Tool mit Schrittfolge siehe [Tool erstellen](../user/develop/basic/tool.de.md). `packages/shell/tool-bash` ist das produktionsreife Drei-Paket-Beispiel.

## Die minimale Form

```ts
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'my-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'read_file',
    description: 'Read a file from disk.',          // what the model sees
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path' },
      limit: { type: 'number' },                     // optional by default
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      // args is TYPED from the schema: { path: string; limit?: number }
      // exec carries immutable identity + token; signal is the operational field
      return readFile(args.path, { encoding: 'utf8', signal: exec.signal })
    },
  }))
}
```

Die Registrierung ist effektbasiert: Dispose des Plugin-fibers meldet das Tool ab. Schemas fließen automatisch in die System-Prompt-Assembly ein.

## Regeln des execute()-Vertrags

- **Args sind für dich validiert.** `defineTool` validiert modellgenerierte `arguments` gegen das vereinheitlichte `ParameterSchemaSpec`, bevor `execute` läuft (Typen, Required-Keys, Literal-Constraints, Exact-One-Unions und verschachtelte Werte), sodass innerhalb von `execute` die Args mit `InferArgs` übereinstimmen. Explizite Object-Nodes deklarieren `additionalProperties: true | false`; die implizite Parameter-Root bleibt offen. Du prüfst weiterhin Constraints manuell, die das DSL nicht ausdrückt, wie nicht-leere Strings, positive Zahlen oder Cross-Field-Regeln. Raw-JSON-Schema-Tools, die direkt registriert werden, besitzen ihre eigene Input-Validierung.
- **Die Registrierung entlehnt deine Readonly-Definition.** Ein typisierter Same-Process-Beitrag ist keine Serialisierungs-Grenze; mutiere nach der Registrierung nicht sein Schema oder ersetze Callbacks. `schemas()` materialisiert nur die explizite modellseitige Projektion. Um ein Tool zu hot-swappen, dispose seinen besitzenden Effect und registriere die Ersetzung; mutabler State im Closure des Callbacks bleibt gewöhnlicher Plugin-State.
- **Die Execution-Identity ist geschützt.** Die Registry materialisiert `arguments` als detached Lossless-JSON in einem rekursiven Pass, friert diesen Wert ein, bevor die Policy startet, und weist ein opakes `exec.token` zu; `callId`, `name`, `arguments`, `agent`, `token`, das erforderliche Caller-owned `signal` und ein optionales Enclosing-Transport-`parent`-Token bleiben durch den Dispatch unveränderlich. `parent` ist Identity-only und exponiert keine Live-Outer-Execution. Behandle `args` als Readonly-Input. Nur ein Around-Dispatch-Wrapper erhält eine mutable View, und er darf das erforderliche `exec.signal` ersetzen und wiederherstellen, um eine Deadline aufzuerlegen, aber nicht entfernen.
- **Deklariere und returne einen kanonischen JSON-Wert.** `output.schema` verwendet `ValueSchemaSpec` und kann eine Object-, Array-, Scalar- oder Null-Root haben. `execute` returnt nur den inferierten Wert; die Registry snapshotted ihn als Lossless-JSON, validiert ihn, friert ihn ein und übergibt ihn an `output.render(args, value)`. Returne keine Content-Blocks aus dem Body und zwinge Caller nicht, Prose für Ids und Fields zu parsen.
- **Werfen oder Returnen eines invaliden Werts bedeutet `isError`.** Die Registry fängt Throws ab und enthält Schema-, Renderer-, Metadata-Projector- und Lossless-JSON-Fehler, bevor Observer laufen. Wirf für Infrastructure-Fehler. Repräsentiere ein erfolgreiches Domain-Outcome im kanonischen Wert, selbst wenn sein Native-Renderer einen nicht-idealen Zustand erklärt, wie einen Non-Zero-Process-Exit.
- **Respektiere `exec.signal`.** Cancelle In-Flight-Work, wenn es feuert.
- **Projiziere durable Card-Daten mit `presentationMeta` (optional).** `output.presentationMeta(args, value)` derived replayable JSON aus demselben kanonischen Wert. Der Core persistiert es auf `tool/result` und übergibt es an `presentResult`, sodass eine Card, die Result-Time-Facts benötigt — wie `write`/`edit` angewandte Hunks — Replay übersteht, ohne den kanonischen Wert zu persistieren. Der Projector wird für verschachtelte Code-Dispatches übersprungen, da sie keine Cards haben.
- **Verwende `exec.agent` für async Notifications.** `agent.inject({ content, source: { kind: 'plugin', plugin: '<name>' } })` hängt durable Context an, den die NÄCHSTE Model-Request sieht — es ist kein Wake-Up (ein idler Agent bleibt idle). Schütze gegen disposed Agents (try/catch).

## Lange laufende Work

Gate `run_in_background` mit Producer-Config, registriere dann durch `ctx.jobs.start({ kind, label, owner: exec.agent, run })`. Die Registry lehnt einen pre-aborted Invocation vor dem Producer-Body ab; die Runtime validiert Ownership und Task-Controller-Verfügbarkeit, bevor `run()` mit der Arbeit beginnt, und liefert dann die id, den Session-Fence, generische Control-Tools, Notices und Owner-Cleanup. Ein erfolgreicher Background-Branch returnet ein typisiertes kanonisches Handle wie `{ kind: 'background', jobId }`; sein Native-Renderer darf Human-Prose wie `started background job bash-1` behalten, aber PTC mode darf diese Prose nie parsen, um die id zu recovered.

Der Producer liefert synchrones `cancel`, nicht-rejectendes `done`, das nach Resource-Cleanup settled, und optionales konsumierendes `readOutput` mit Bounded-Output-Formatierung. Ein pre-aborted Call ist ein Fehler, weil keine Task existiert, deren id das erfolgreiche Output-Schema erfüllen könnte. Sobald `ctx.jobs.start()` die id published, verwende ein Task-owned Cancellation-Signal statt `exec.signal`: spätere Outer-Call-Cancellation stoppt das Warten auf den Call, killt aber nicht die published Work; `job_kill`, Owner-Disposal und Service-Teardown besitzen diese Lifetime. Foreground-Work bleibt an `exec.signal` gekoppelt. Siehe die [Background-Job-Runtime-Agent-Note](../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.de.md) und `dsh-tool-bash` für einen Stream-Producer.

<a id="execution-policy-and-observation"></a>

## Ausführungsrichtlinie und Beobachtung

Baue Deployment-Policy bevorzugt nicht in das Tool ein. Verwende `tools/pre-execute` für extensible Allow/Deny/Ask-Policy (das [Permission-Gate-Beispiel](extension-cookbook.de.md#a-hook-plugin-permission-gate-example)), `ctx.tools.guard()` für ein finales monotones Deny, das spätere Listener nicht rückgängig machen können, `tools/execute` um den Dispatch mit Deadline, Retry oder Metrics-Collection zu wrappen, `tools/post-execute` um Presentation-Content oder den returned Wert zu ersetzen, das Result zu blocken oder modellseitigen Context anzuhängen, und `tools/result` um das immutable normalisierte Outcome zu beobachten. Eine Content-Ersetzung lässt den programmatischen Zugriff auf `value` intakt; Confidentiality-Policy blockt oder ersetzt den Wert. Eine Sandbox-Implementierung kann auch innerhalb der Executor-Implementierung des Tools laufen; das [`dsh-tools`-README](../../packages/core/tools/README.de.md#extension-points) definiert jeden Extension-Point's Inputs, Reihenfolge, Return-Werte und Failure-Verhalten.

## PTC mode erreicht dein Tool kostenlos

In [PTC mode](../../packages/core/tools/README.de.md) ist jedes sichtbare registrierte Tool als `await tools.<name>(args)` ohne zusätzliche Integration verfügbar. Die generierte `ToolArgsMap` und `ToolOutputMap` derived exakte Argument- und Canonical-Return-Typen aus denselben Schemas, und Calls re-enter die normale Execution-Pipeline. Ein erfolgreicher Call resolved zum finalen kanonischen JSON-Wert nach Policy, nicht zu gerendertem Native-Content. Ein fehlgeschlagener Call rejected mit dem echten `ToolCallError`; Programme können nur sein `name`, `toolName` und menschenlesbares `message` inspizieren, nicht interne Error-Codes oder eine Failure-Union.

Designe `output.schema` als nützliche programmatische API: returne Handles und Fields direkt, erlaube Scalar/Array/Null-Roots, wenn sie der ehrliche Wert sind, und behalte menschliche Erklärung in `output.render`. Intermediate Values sind Execution-local, werden nicht persistiert oder Prompt-truncated und haben kein Byte-Cap, also zählen die wahrheitsgemäßen Acquisition-Bounds des Producers und der Process-Memory weiterhin. Nur die äußeren `run_code`-Logs/Result crossen das konfigurierbare Output-Cap und die modellseitige Spill-Pipeline.

## Wie dein Tool in einer UI rendert

Deines Tools `output.render` returnt modellseitigen Content; seine **UI-Card** ist ein separates Concern, deklariert durch reine Presentation-Projektionen und optionale `presentCall`/`presentResult`-Methoden. Designe diese zusammen mit dem kanonischen Wert. Ein Tool ohne UI-Presentation fällt auf eine generische Card zurück (Title = Tool-Name, Raw-Args als Input).

Beide Methoden returnen einen **`card`-getaggten Render-Intent** — wähle die Card-Art, die zu dem passt, was dein Tool tut:

- `presentCall(args)` → ein `ToolCallView` (die PENDING-Card):
  - `{ card: 'generic', title, kind?, rawInput?, content?, locations? }` — der Default. Setze `kind` für ein Icon (`read`/`search`/…); setze `locations: [{ path, line? }]` für jede Datei, die dein Tool berührt, damit ein fähiger Editor folgt / dorthin springt.
  - `{ card: 'terminal', title, description?, cwd? }` — dein Call IST ein Shell-Befehl. `title` ist der Befehl, `description` rendert über der Terminal-Card. (tool-bash.)
  - `{ card: 'diff', title, diffs, locations? }` — dein Call erstellt oder modifiziert eine Datei. `diffs: [{ path, oldText, newText }]` (`oldText: null` für eine neue Datei) rendert als Inline-Diff-Card. (tool-fs `write`/`edit`.)
- `presentResult(args, { content, isError, meta? })` returnet die fertige Card:
  - `generic` liefert einen optionalen Title und Content.
  - `terminal` liefert Raw-Output und optionale Exit-Metadata; jede UI rendert ihre fähige oder Fallback-View.
  - `diff` liefert angewandte Hunks, oft durch `output.presentationMeta` derived und in persistiertem `result.meta` getragen, sodass Replay sie reproduziert. Mutation-Tools behalten ein Diff-Result, weil die fertige View die Pending-Card ersetzt.
  - `read` liefert ein fertiges File-Window, rekonstruiert aus persistiertem `result.meta`: den Datei-`path`, einen 1-basierten `offset`, die returned `lines` (jede behält ihre Datei-Zeilennummer), `totalLines` und einen optionalen `lang`-Highlight-Hint; eine UI ohne die `read`-Capability fällt auf den Raw-Result-Content zurück. Es gibt keine `read`-Call-View — eine Read-Call's-Pending-State bleibt eine generische Card, da Content erst nach `execute` existiert. (tool-fs `read`.)
  - `search` liefert ein Discovery-Result, rekonstruiert aus persistiertem `result.meta`: nach Datei gruppierte Matches (`shape: 'matches'`, grep) oder eine flache Path-Liste (`shape: 'paths'`, glob), plus `truncated`/`total`, sodass eine UI nie ein gecapptes Result als komplett präsentiert. Die View trägt keinen Result-Text (eine UI ohne Search-Card fällt auf den Raw-Result-Content zurück), und es gibt keine `search`-Call-View — eine Discovery-Call's-Pending-State bleibt eine generische Card, da Matches erst nach `execute` existieren. (tool-fs-search `grep`/`glob`.)
  - `web` liefert eine fertige Web-Retrieval, diskriminiert durch `kind: 'search' | 'fetch'` (die strukturierten Search-Sources oder die Fetch-Summary), derived aus `result.meta`; sie trägt keinen Body-Copy, also fällt eine UI ohne die `web`-Capability auf den Raw-Result-Content zurück. (tool-web `web_search`/`web_fetch`.)

Harte Regeln (Verstöße haben Konsequenzen):

- **Purity.** Diese laufen auf Live-Streaming UND auf Session-Log-REPLAY, also müssen sie reine Funktionen von `args` (+ dem Result) sein — KEIN I/O, KEIN Lesen von Session-State, KEIN Clock/Random. Ein Diff wird aus den Args derived (`write` verwendet `oldText: null`, weil ein Call-Time-Presenter keinen vorherigen Datei-Content hat); der UI-Adapter, nicht das Tool, liefert den Session-Context. Wenn du den alten Datei-Content oder das Working Directory in `presentCall` brauchst, stopp — das gehört in durable Result-Metadata oder den Adapter, nicht in den Presenter.
- **UI-only-Formatierung bleibt aus dem Model-Result raus.** Ein ` ```console `-Block, ein Diff, ein relativisierter Path — nichts davon gehört in den kanonischen Wert oder Native-Content, nur um eine UI zu bedienen. `output.render` besitzt modellseitige Prose; `presentationMeta` plus die Card-Presenter besitzen replayable UI-State. Eine `terminal`-Result-View trägt Raw-Output und der Adapter fügt jegliches Fallback-Framing hinzu.
- **`defineTool` soft-validiert den Display-Pfad.** Malformierte oder ältere geloggte Arguments lassen den Wrapper `undefined` (einen generischen Fallback) returnen statt zu throwen — Display darf nie einen Replay crashen.

Das neutrale Vokabular lebt in `dsh-tools`; Tools importieren nie einen UI- oder Transport-Typ. Consumer dieser API mappen jedes `card` in ihre eigene View. Das Design und das Warum stehen in der [Render-Intent-Union-Agent-Note](../../.agents/notes/implemented/architecture/2026-07-02-tool-render-intent-union.de.md); `dsh-tool-fs` (generic/diff) und `dsh-tool-bash` (terminal) sind die Referenz-Implementierungen.

## Web-Client-Präsentation

Der eingebaute Web Client konsumiert nicht `presentCall` oder `presentResult`. Session `page` und `follow` transportieren Raw-`tool/call`- und `tool/result`-Events, inklusive persistiertem `result.meta`. Ein Client-Plugin registriert seinen Wire-Tool-Namen im `tool.call.toolview`-Keyed-Slot und derived Component-Props aus den `ToolCallBlock`-Arguments, Content, Error, Metadata, dem bestehenden Code-Dispatch-`parentCallId` und Session-Path-Facts. Es validiert diese Wire-Werte lokal und returnet die generische Row für malformierte oder nicht unterstützte Input.

Verwende `output.presentationMeta(args, value)`, wenn eine bestehende Web-Card bounded strukturierte Result-Facts benötigt, die modellseitiger Content nicht lossless bewahren kann. Speichere keine React-Props oder eine ausgewählte Card in Metadata, importiere keine Host-Tool-Implementierung in ein Browser-Bundle, und erstelle keine weitere Client-Presenter-Registry. Allein das Definieren von Host-Presentation-Methoden fügt keine spezialisierte Web-Card hinzu. Die [Client-derived-Presentation-Agent-Note](../../.agents/notes/implemented/architecture/2026-08-23-client-derived-tool-presentation.de.md) definiert Ownership-, Fallback- und Equivalence-Anforderungen.

## Verifikation

Folge der [Repository-Testing-Policy](../testing.de.md) und der Test-Dokumentation des besitzenden Packages. Eine gelieferte modell- oder UI-sichtbare Änderung erfordert die dort spezifizierte assembled Coverage.
