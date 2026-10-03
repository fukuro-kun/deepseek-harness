<!-- Die englische Quelldatei wird von scripts/gen-doc-graphs.ts generiert; diese deutsche Datei ist die über den zweisprachigen Paarungsprozess gepflegte begutachtete Gegenseite.
     Zum Aktualisieren zuerst `pnpm run gen-doc-graphs` für die englische Seite ausführen, dann diese Datei aktualisieren und `pnpm run verify-translation-pairing --write docs/agent-lifecycle.md` zur erneuten Paaraufzeichnung ausführen. -->

# Agent-Turn- und Step-Lebenszyklus
[English](agent-lifecycle.md) | [中文](agent-lifecycle.zh.md) | Deutsch


Diese Sequenz ist die visuelle Begleitung zu [architecture.md](architecture.de.md#turn-flow). Sie hält dauerhafte Replay-Fakten auf `session/event` und Live-Steuerung/Status auf `agent/*`.

```mermaid
sequenceDiagram
  participant User
  participant Agent
  participant Driver
  participant Hooks as hook listeners
  participant Prompt as ctx.systemPrompt
  participant LLM as ctx.llm
  participant Tools as ctx.tools
  participant Session
  participant SDK as UI or SDK listener
  User->>Agent: followup(content)
  Agent-->>SDK: <code>agent/inbox/spliced</code>
  Agent-->>SDK: <code>agent/inbox/inserted</code> { message }
  Agent->>Driver: queued work wakes driver
  Driver-->>SDK: <code>agent/status</code> running
  Driver->>Session: <code>turn/start</code>
  Note over Agent,Driver: claim pending next-step input plus one queued prompt
  Driver-->>SDK: <code>agent/inbox/spliced</code> pure deletion
  Driver-->>SDK: <code>agent/inbox/claimed</code> { message, turn } per message
  Driver->>Prompt: <code>system-prompt/assemble</code> waterfall
  Driver->>Hooks: <code>agent/pre-step</code> waterfall
  Hooks-->>Driver: authoritative reject or enter(messages)
  alt proposed step rejected, first batch empty, or pre-step failed
    Driver-->>Driver: claimed batch stays removed, the open turn spends no step
  else enter proposed step
  Driver->>Session: <code>step/start</code>
  Driver->>Hooks: <code>agent/request</code> waterfall
  Driver->>LLM: prepareCall(config, signal)
  Note over Driver,LLM: cancellation during either async phase commits neither system nor users
  Note over Driver,Session: synchronous admission using the prepared call capability
  Driver->>Session: <code>system/message</code> ordered per-node reconciliation
  Driver->>Session: <code>user/message</code> per entered message
  Driver->>Session: <code>request/header</code> and <code>request/context</code> as needed
  Driver->>Driver: derive and freeze request from the log
  Driver->>LLM: bound prepared call through <code>llm/stream</code> waterfall
  LLM-->>Driver: StreamChunk*
  Driver-->>SDK: <code>agent/assistant-stream</code> chunk*
  alt final adapter or terminal in-band request failure
    Driver->>Session: <code>assistant/attempt</code>
    Driver-->>SDK: <code>agent/assistant-stream</code> committed end
    Driver->>Hooks: <code>agent/request-error</code> waterfall
    Hooks-->>Driver: return retry action or preserve the original error
    Note over Driver,LLM: retry in the open step: prepare and reconcile the same rendered assembly without repeating pre-step or users
  else model request succeeded
  Driver->>Session: <code>assistant/message</code>
  Driver-->>SDK: <code>agent/assistant-stream</code> committed end
  Driver->>Tools: classify pending call by executionMode
  loop barriers and bounded rolling pool, reclassify before start
    opt call starts
      Driver->>Session: <code>tool/call</code>
      Driver->>Tools: ordered pre, concurrent execute
      Tools-->>Session: tool-owned events when applicable
    end
    opt next model-order result ready
      Driver->>Tools: ordered post
      Driver->>Session: <code>tool/result</code>
    end
  end
  Driver->>Session: <code>step/end</code>
  opt natural stop and next-step inbox empty
    Driver->>Hooks: <code>agent/turn-stopping</code> serial terminal checkpoint
  end
  opt next-step input is pending
    Driver-->>Driver: claim pending next-step input
    Driver-->>SDK: <code>agent/inbox/claimed</code> { message, turn } per message
    Driver->>Hooks: <code>agent/pre-step</code> waterfall
    Hooks-->>Driver: authoritative reject or enter(messages)
  end
  end
  end
  Driver->>Session: <code>turn/end</code>
  Driver-->>SDK: <code>agent/status</code> idle
```

Das `assistant/message`-Event zeichnet jeden erfolgreichen Provider-Aufruf auf, einschließlich inhaltsloser und `max-tokens`-Abschlüsse, und bettet den exakten kompakten zeitgestempelten Stream ein. Leere Inhalte bleiben aus der abgeleiteten Historie heraus. Ein fehlgeschlagener, wiederholter, abgebrochener oder stream-error-Versuch, der ohne Surface-Message zur Ruhe kommt, zeichnet seinen Stream als `assistant/attempt` auf. Live-`agent/assistant-stream`-Chunk-Frames sind transient; Replay liest entweder die dauerhafte Settlement, und ein harter Prozessverlust vor der Settlement hinterlässt keinen dauerhaften Attempt-Stream.

`dsh-compaction-basic` nutzt `agent/pre-step` für Druck vor der Request-Ableitung und `agent/request-error` nur für kanonischen Context-Overflow. Sobald einer der Trigger qualifiziert, läuft optionales Tool-Result-Pruning vor der Summary-Auswahl. Recovery läuft innerhalb des offenen Steps und wiederholt nur, wenn Pruning oder Summarization die Surface-Replacement-Generation vorantreibt; andernfalls bleibt der ursprüngliche Request-Fehler maßgeblich. Jeder Retry bereitet seinen Call vor und gleicht die beibehaltene gerenderte Assembly vor der Request-Ableitung ab, ohne Assembly, Pre-Step oder User-Admission zu wiederholen.

Die zurückgegebene `agent/pre-step`-Entscheidung ist maßgeblich; Listener, die `next()` wrappen, erhalten Downstream-Messages und `startsRequestSeries`, sofern die Ersetzung nicht beabsichtigt ist. Steering und injizierter Context durchlaufen denselben Waterfall, nachdem eine spätere Claim-Operation ihren Next-Step-Batch übernimmt.

SDK-Nutzer, die replaybare Transcript-Daten benötigen, sollten `session/event` konsumieren; `agent/*` ist die Live-Koordinations-API für Queue/Status, Prompt-Interception, Request-Konstruktion, Steering, Fortsetzung und Fehler.

Wartungsmodus: kuratierte Mermaid-Sequenz; die exakten Event-Signaturen liegen im generierten Cordis-Katalog. Diese deutsche Datei ist die über den zweisprachigen Paarungsprozess gepflegte begutachtete Gegenseite.
