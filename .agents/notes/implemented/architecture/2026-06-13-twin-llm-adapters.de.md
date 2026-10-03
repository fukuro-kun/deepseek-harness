# Agent Note: Zwei LLM-adapters als Design-Verifizierungs-Twin

Status: implemented

[English](2026-06-13-twin-llm-adapters.md) | [中文](2026-06-13-twin-llm-adapters.zh.md) | Deutsch

## Problem

`dsh-llm` besitzt eine provider-neutrale streaming-Vocabulary — das `StreamChunk`-Protokoll (`block-start`, `text-delta`, `reasoning-delta`, `tool-call-delta`, `block-end`, `usage`, `finish`) und die content-block-Typen ([die content-block vocabulary](2026-06-11-content-block-vocabulary.de.md)). Eine Vocabulary, die gegen einen einzelnen adapter definiert wird, riskiert, die Eigenheiten dieses adapters in den "neutralen" contract einzubrennen: Was die eine implementation zufällig tut, wird zur de-facto-Spec, und die Abstraktion ist unbestätigt, bis ein zweiter provider kommt — zu dem Zeitpunkt ist der Leak teuer zu beheben.

## Entscheidung

Von Anfang an **zwei** adapters gegen denselben contract ausliefern, bewusst auf unterschiedlichen Internals aufgebaut:

- `dsh-llm-deepseek` — direkter `fetch` + In-Repo-Übersetzung gegen die DeepSeek API; das SSE-Framing wird an `eventsource-parser` delegiert ([der archivierte SSE-Parser-Swap](../../archived/simplification/2026-07-26-eventsource-parser-for-deepseek-sse.md)). Die Twin-Identität besteht im Besitz der fetch/translate-Internals, nicht in der Delegation an ein volles provider-SDK — nicht im Selbstbauen von Transport-Piping.
- `dsh-llm-pi-ai` — derselbe endpoint über die `@earendil-works/pi-ai`-Bibliothek (mit ihrer eigenen event-Vocabulary).

Die Regel, die sie durchsetzen: **alles, was die StreamChunk-Vocabulary nicht für BEIDE implementations ausdrücken kann, ist ein core-vocabulary-bug** — sofort gefangen, nicht erst beim nächsten provider. Das Paar festigte Konventionen, die jetzt auf `StreamChunk` in `dsh-llm/src/types.ts` dokumentiert sind: usage wird vor finish emittiert, nach finish kommt nichts, tool-call-`arguments` end-to-end als rohe JSON-Strings, und die zwei sanktionierten error-Pfade (aus `stream()` werfen *oder* mit `finish {kind:'error'|'aborted'}` enden), die ein consumer auf beiden Seiten behandeln muss — eine Divergenz, die der bibliothekgestützte adapter aufdeckte und die ein einziger direct-fetch-adapter verborgen hätte.

## In Betracht gezogene Alternativen

- **Ein einzelner adapter** — weniger Code und halbe e2e-Kosten, aber die "provider-neutral"-Behauptung bleibt unbestätigt; die Vocabulary würde DeepSeek-via-fetch-Annahmen stillschweigend kodieren.
- **Ein mock-zweiter adapter** — billiger, aber übt keine wire-Eigenheiten eines echten providers aus und beweist wenig. Der Twin ist real-gegen-real.

## Konsequenzen

Der Twin verdoppelt die adapter- und key-gated-e2e-Wartung — beide decken V4 Flash und Pro über repräsentative reasoning-Modi ab — im Austausch gegen kontinuierliche seam-Neutralitäts-Verifizierung und ein zweites implementation-Beispiel. Beide verwenden `apiKey`, `baseURL` und `models`; der direct-fetch-adapter exponiert `thinking`/`reasoningEffort`, während pi-ai eine `reasoning`-Stufe exponiert. Ein zukünftiger Conformance-Suite könnte den Rückzug eines adapters über einen ersetzenden Agent Note rechtfertigen.
