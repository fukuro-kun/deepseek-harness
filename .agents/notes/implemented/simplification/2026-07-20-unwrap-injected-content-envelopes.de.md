# Agent Note: Injizierter Content wird wörtlich projiziert — die XML-Envelopes entfallen

Status: implemented

[English](2026-07-20-unwrap-injected-content-envelopes.md) | [中文](2026-07-20-unwrap-injected-content-envelopes.zh.md) | Deutsch

## Problem

Zwei Familien injizierter Session-Inhalte wurden in das Model-Transcript gerendert, eingehüllt in XML-Envelopes: `steering/message` als `<steering source="…">…</steering>` und `context/message` als `<context source="…">…</context>` (letzteres mit einem `'raw'`-Opt-out, das den Wrapper übersprang). Die Envelopes sollten dem Modell sagen: „Das ist injiziert, nicht der User, der spricht."

Zwei Probleme:

- **Kein Modell ist auf diese Tags trainiert.** `<steering>` und `<context>` sind beliebiges Markup, das kein Modell lesen gelernt hat. Das Framing fügt also Tokens ohne verlässliche Wirkung hinzu und kann aktiv in die Irre führen — aufgezeichnete Transcripts zeigen ein Modell, das eine `<steering>`-Anweisung als Metadaten eines Dritten behandelte und ablehnte, während es nur den ursprünglichen Prompt beantwortete.
- **Die Session-Surface ist die falsche Schicht für Framing.** Die Surface projiziert das durable Log in das Model-Transcript; zu entscheiden, wie Content formuliert ist, ist nicht ihre Aufgabe. Ein Caller, der ein bestimmtes Framing will, formatiert seinen Content selbst, bevor er ihn injiziert — was der einzige Schwergewichts-Producer (`agent-instructions`) bereits tut: Er besitzt sein vollständiges `<system-reminder>`-Frame und optet mit `envelope: 'raw'` aus dem `<context>`-Wrapper aus. Die verbleibende Tag-Machinerie (`ContextEnvelope`, ein `envelope`-Feld durch `InjectOptions`, `HookContext`, das `context/message`-Event und den Loop) bediente eine Unterscheidung, die dem Caller gehört.

## Decision

Injizierter Session-Content wird wörtlich projiziert; der Caller besitzt jedes Framing. `deriveEventMessage` rendert `user/message`-Content-Blocks unverändert an das Modell; `source` bleibt im durable Event-Log, wird aber nicht gerendert.

Der `ContextEnvelope`-Typ und jedes `envelope`-Feld sind entfernt — `context/message` in `SessionEventMap`, `InjectOptions`, `HookContext` und das `inject()`/`additionalContexts`-Plumbing in `dsh-agent-loop`. `agent-instructions` fordert `'raw'` nicht mehr an; sein selbst-geframter Content rendert wie zuvor. Die Helper `renderTagged`/`renderContextEnvelope` sind gelöscht. `context/message.meta` trägt weiterhin durable, vor dem Modell verborgene JSON-State.

Die `source`-Attribution bleibt auf den durable Events und wird im Transcript weggelassen.

## Alternatives considered

- **Den `<context>`-Envelope behalten, nur Steering auspacken** — lässt die `ContextEnvelope`/`envelope`-Machinerie für ein Framing-Bit am Leben, das kein Modell liest, und bewahrt die Inkonsistenz, aus der der Haupt-Producer bereits ausgestiegen ist.
- **Das Envelope-Feld nur für Plugin-sourcten Content behalten** — spaltet eine Projektion anhand von `source.kind` in zwei, ohne beobachteten Nutzen; ein Plugin, das den Agent steuert (Fortsetzungsgründe der Hook-Bridge), will ebenfalls, dass die Anweisung befolgt wird, nicht etikettiert.
- **Das Auspacken in die Adapter verschieben** — die kanonische Projektion ist der model-sichtbare Vertrag („model-visible ⟺ logged"); divergierendes Framing pro Adapter würde das abgeleitete Transcript adapter-abhängig machen. Framing, das ein Caller wirklich will, gehört in den Content des Callers, nicht in einen Adapter.

## Consequences

- Mid-Turn-Steering und injizierter Kontext erreichen das Modell mit demselben Gewicht wie ein gewöhnlicher User-Prompt.
- Das Transcript unterscheidet injizierten Content nicht mehr von einer User-Message; Consumer, die die Unterscheidung brauchen, lesen das durable Event-Log, das Event-Typen, `source` und `meta` intakt hält.
- Die ACP-Snapshots `hook-{cc,codex}-stop-continue` wurden neu aufgezeichnet: Die alten Aufzeichnungen erfassten, wie das Modell Steering als Drittanbieter-Metadaten ablehnte — exakt der Failure-Mode, den dieser Fix adressiert.
- Die Tagged-Envelope-Klausel des [Content-Block-Vocabulary-Agent-Notes](../architecture/2026-06-11-content-block-vocabulary.de.md) ist geändert und verweist hierher.

## Deferred

`agent-instructions` framet seinen Content bereits selbst: Es emittiert einen vollständigen `<system-reminder>…</system-reminder>`-Block als Message-Content, statt sich auf einen Surface-Level-Wrapper zu stützen. Dieses caller-eigene Muster ist das zu behaltende — die Surface reicht Content wörtlich durch, und jedes Framing liegt im eigenen Content des Producers.

Es existierten zwei Framing-Pfade — vom Caller eingebautes Framing (`<system-reminder>` von `agent-instructions`) und Surface-Level-Wrapping (`<context>`/`<steering>`, hinzugefügt von `deriveEventMessage`). Diese Änderung entfernt den zweiten und lässt nur caller-eigenes Framing übrig. Falls gelabeltes Framing wieder gewünscht wird, gehört es über die `meta`-Map des Events vereinheitlicht — das vom Producer angehängte, vor dem Modell verborgene Metadatenfeld — konsumiert von einem dedizierten Renderer oder Adapter, statt ein Tag erneut in `deriveEventMessage` zu hartkodieren. Ein Producer deklariert das gewünschte Frame in `meta`; ein Renderer wendet es an; die Session-Surface-Projektion bleibt ein wörtlicher Pass-Through.
