# Agent Note: Providerneutrale Content-Block-Vocabulary in Verantwortung von dsh-llm
[English](2026-06-11-content-block-vocabulary.md) | [中文](2026-06-11-content-block-vocabulary.zh.md) | Deutsch

Status: implemented


## Problem

Der harness benötigt eine einzige interne Sprache für Messages, die agent loop, das Session-Log und alle plugins sprechen.

## Decision

Die Vocabulary besitzt der harness selbst: Messages sind Arrays typisierter content blocks (`text`, `reasoning`, `tool-call`, `tool-result`), deren Union aus dem merge-extensiblen `ContentBlockMap` abgeleitet ist, sodass plugins block-Typen per Deklarations-Merging hinzufügen. Dasselbe merge-extensible-Map-Muster typisiert jedes "stringly"-Feld (`MessageSource`, `FinishReason`, `TurnTrigger`, `TurnEndReason`). Streaming ist ein rohes Chunk-Protokoll; `BlockAssembler` ist die einzige gemeinsame Assembly-Implementierung. Adapter übersetzen in die wire formats der provider — die Mapping-Kosten bleiben bei den Adaptern, wo sie hingehören.

Die Kontext-Injection innerhalb einer session (`context/message`) und das mid-turn-Steering wurden ursprünglich als getaggte user-role-Envelopes (das system-reminder-Muster) gerendert, nicht als neue Rolle, sodass die Adapter keine Last tragen. Beide werden jetzt als gewöhnlicher user content ohne wrapper projiziert; siehe [den injected-content-envelope Agent Note](../simplification/2026-07-20-unwrap-injected-content-envelopes.de.md). Die Live-Adapter-Validierung bestätigt diese Darstellung für das aktuelle DeepSeek-Verhalten; ein provider-spezifisches Missverhältnis in Zukunft gehört in diesen Adapter, nicht in eine neue kanonische Rolle.

## In Betracht gezogene Alternativen

- **Die chat-completions-Form von DeepSeek/OpenAI spiegeln** — keine Mapping-Kosten für den ersten provider, aber unpraktikabel für reiche Inhalte (reasoning, tool results als strukturierte blocks).
- **Die Messages-Block-Struktur von Anthropic wörtlich übernehmen** — praxiserprobt, aber die kanonischen Typen würden eine Drittanbieter-API spiegeln, die der harness nicht primär anvisiert.

## Konsequenzen

- Reasoning ist im Kern verankert, ohne provider-spezifische shapes.
- Multimodale blocks kehren erst mit abgestimmter Unterstützung von Adapter, UI und compaction zurück; siehe [den drop-image Agent Note](../../archived/simplification/2026-07-04-drop-image-content-block.md).
- Cache hints und assistant-prefill fehlen, bis ein produktionsreifer Adapter sie einhalten kann; siehe die Agent Notes [producer-less variants](../../archived/simplification/2026-07-04-prune-producerless-vocabulary-variants.md) und [inert request knobs](../../archived/simplification/2026-07-04-drop-inert-request-knobs.md).
- Jeder Adapter trägt einen Übersetzungsaufwand; die ersten echten Adapter haben das streaming-Protokoll inzwischen validiert, und neue Adapter sollten ihre provider-spezifische Mapping-Logik weiterhin in adapter-lokalen Tests nachweisen.
- IDs, die package-Grenzen überschreiten, sind branded (`ToolCallId`, das gemeinsame agent/session `SessionId`) — nominale Typisierung ohne Laufzeitkosten.
