<!-- Die englische Quelldatei wird von scripts/gen-doc-graphs.ts generiert; diese deutsche Datei ist das durch Paarung gepflegte, reviewte Pendant.
     Aktualisieren Sie zuerst die englische Datei mit `pnpm run gen-doc-graphs`, dann diese Datei und `pnpm run verify-translation-pairing --write docs/tool-execution-pipeline.md`, um die Paarung neu aufzuzeichnen. -->

# Tool-Execution-Pipeline
[English](tool-execution-pipeline.md) | [中文](tool-execution-pipeline.zh.md) | Deutsch


Dieser Graph zeigt, wo Policy, Hooks, Sandbox-Isolierung, Filesystem-Guards, Result-Rewriting, Beobachtung des finalen Outcomes und UI-Rendering laufen, ohne den Loop zu verändern. Das `tools/pre-execute`-Waterfall läuft zuerst, danach die monotonen Guards, und die `tools/execute`- und `tools/post-execute`-Waterfälle folgen; die drei Waterfälle können einen Call transformieren. Das Definition-eigene `finalizeContent` und `tools/result` laufen anschließend.

```mermaid
flowchart TD
  model["Assistant message contains tool-call block"]
  toolCall["Session event: <code>tool/call</code><br/>logged before execution"]
  presentCall["UI pending card<br/>presentCall(args)"]
  pre["<code>tools/pre-execute</code> waterfall<br/>hooks, permission, sandbox"]
  guards["Registered monotonic guards<br/>deny or abstain; identity protected"]
  denied["denied or approval refused<br/>tool body skipped"]
  approval["<code>ctx.approval</code> one-shot prompt<br/>absent or unanswerable: deny"]
  around["<code>tools/execute</code> waterfall<br/>timeout, retry, metrics (around dispatch)"]
  toolBody["Registered tool execute() body"]
  fsGate["<code>fs/write-intent</code> or <code>fs/edit-intent</code><br/>tool-fs mutations only"]
  owned["Tool-owned session events<br/><code>todo/write</code>, <code>fs/observed</code>, <code>hook/invoked</code>, <code>hook/result</code>, <code>tool/ptc-dispatch</code>"]
  post["<code>tools/post-execute</code> waterfall<br/>accept, block, replace, add context"]
  normalized["Registry outer normalization<br/>pipeline/result snapshot throws become isError"]
  finalize["ToolDefinition.finalizeContent<br/>last content-only invariant"]
  final["<code>tools/result</code> synchronous notification<br/>frozen authoritative outcome"]
  context["Active-batch additionalContexts FIFO<br/>injected user/message after recorded tool results"]
  toolResult["Session event: <code>tool/result</code><br/>single model-facing outcome"]
  allResults["Tool batch settled<br/>recorded tool/result events complete"]
  presentResult["UI completed card<br/>presentResult(args, result)"]
  model --> toolCall
  toolCall --> presentCall
  toolCall --> pre
  pre -->|allow| guards
  guards -->|allow| around
  guards -->|deny| denied
  guards -.->|throw| normalized
  around --> toolBody
  pre -->|deny| denied
  pre -->|ask| approval
  approval -->|allowed-once| guards
  approval -->|rejected, cancelled, unavailable| denied
  approval -.->|throw| normalized
  denied --> post
  pre -.->|throw| normalized
  toolBody --> fsGate
  fsGate --> toolBody
  toolBody --> owned
  toolBody --> around
  around --> post
  around -.->|wrapper throws| normalized
  post -.->|throw| normalized
  post --> finalize
  normalized --> finalize
  finalize --> final
  final --> toolResult
  toolResult --> presentResult
  toolResult --> allResults
  allResults --> context
```

Filesystem-Read-before-Edit-Checks bleiben unterhalb von `tool-fs` auf `fs/*`-Events. Generische Pre-/Post-Waterfälle hosten Hooks und Approval-Policy; `ctx.approval` löst Asks vor den monotonen Guards, und Owner-Policy, die nicht umsortiert werden darf, bleibt ein registrierter Guard. Around-Dispatch-Belange wie Timeouts wrappen `tools/execute`. Die Registry snapshottet verlustfrei das Kandidatenergebnis und normalisiert einen Snapshot-Fehler, bevor der gesnapshottete `finalizeContent`-Callback der sichtbaren Definition sein synchrones Content-only-Invariant erzwingt. `tools/result` beobachtet dann das unveränderliche, verlustfrei-JSON-repräsentierbare Outcome. Das lässt Hooks Tool-Familien überspannen, ohne die Tools an einen Policy-Service zu koppeln. Der PTC-Modus sendet sowohl den reservierten `run_code`-Transport als auch seine serialisierten Sub-Calls durch die Pipeline; Sub-Calls tragen das Parent-Token, loggen `tool/ptc-dispatch`, geben Denials als bindende Rejections zurück und lassen `additionalContexts` weg, um Call/Result-Adjacency zu bewahren.

Maintenance-Modus: kuratierter Mermaid-Flow; exakte Tool-Schemas und Event-Signatures leben in generierten Katalogen.
