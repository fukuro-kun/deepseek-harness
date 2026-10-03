# Agent Note: Terminale LLM-stream-Fehler

Status: implemented

[English](2026-07-29-terminal-llm-stream-failures.md) | [中文](2026-07-29-terminal-llm-stream-failures.zh.md) | Deutsch

Diese note ersetzt nur die thrown-error-identity und den call-lokalen sidecar-Mechanismus in [begrenzte LLM-Anfragewiederherstellung](2026-06-21-bounded-llm-request-recovery.de.md) und [context-overflow-recovery nach dem call](2026-07-10-after-call-compaction-pressure-and-overflow-recovery.de.md). Diese notes besitzen weiterhin strukturierte failure-facts, retry-policy, durable attempts und compaction-recovery.

## Problem

Ein adapter-Fehler hatte zwei öffentliche Repräsentationen: eine Ausnahme aus selection, dispatch, iterator-Konstruktion oder Iteration und ein in-band `finish { kind: 'error' | 'aborted' }`. `LlmRuntime` taggte geworfene Objekte in einem stream-keyed sidecar, damit der agent loop sie von middleware- und consumer-Fehlern unterscheiden konnte. Der consumer benötigte dennoch einen catch um Iteration, signal-checks, chunk-logging und assembly; Korrektheit hing daher davon ab zu beweisen, welches statement warf, und metadaten zu konsultieren, die an genau das zurückgegebene iterable angehängt waren.

Die retry-policy hatte dieselbe indirekte ownership. Sie wurde über den stream-sidecar nach dem dispatch entdeckt, obwohl `prepareCall()` die serving-Registrierung bereits erfasst hatte. Eine wrapper-besessene route und eine adapter-besessene route teilten daher eine opake lookup-API trotz unterschiedlicher Autorität.

## Entscheidung

`LlmRuntime` ist die Normalisierungsgrenze für einen adapter-attempt. Sie fängt nur final-adapter-selection, synchronen dispatch, iterator-Konstruktion und `next()`-Fehler, konvertiert den geworfenen Wert in eine unveränderliche `LlmFailure` und emittiert ein terminales `finish`. Caller-abbruch oder eine `ABORTED`-failure wählt den aborted-Grund; jeder andere adapter-Fehler wählt error. Ein adapter darf auch direkt einen der beiden terminalen Gründe emittieren.

Der adapter-besessene catch endet vor jedem yielded chunk. Fehler aus `llm/stream`-middleware, verschachtelten calls, adapter-cleanup, chunk-consumern, logging, signal-checks und assembly bleiben als defects oder lifecycle-Fehler geworfen; sie gelangen nie in die model-request-recovery. Ein transport-Fehler nach partiellen deltas kann blocks offen lassen, daher erlaubt die stream-invariant offene blocks nur für terminale error- oder aborted-finishes. Aus diesem unvollständigen output wird keine assistant-message und kein tool call assembliert.

`PreparedLlmCall` exponiert die mit seiner config und Registrierung erfasste unveränderliche retry-policy. One-shot-Wiederverwendung und config-mismatch bleiben synchrone `INVALID_PREPARED_CALL`-misuse-Fehler. Eine vollständig von `llm/stream`-middleware bediente route hat keine prepared Registrierung und daher keine serving-policy.

Der agent loop konsumiert eine failure-Repräsentation. Er iteriert und loggt chunks ohne classification-catch, inspiziert das terminale finish und übergibt dessen failure-facts plus die prepared policy an `agent/request-error`. Die öffentlichen sidecar-APIs `isLlmAdapterFailure`, `llmFailureOf` und `llmRetryPolicyOf` sind nicht vorhanden.

## In Betracht gezogene Alternativen

**Call-lokales error-tagging beibehalten.** Dies bewahrt die geworfene Objekt-identity, lässt aber jeden consumer-catch eine Region umfassen, die dessen eigene fehleranfällige Arbeit enthält, und koppelt die Klassifikation an die identity eines iterable-wrappers. Das ursprüngliche error-Objekt hat keine durable Rolle in der recovery; normalisierte facts sind der nützliche Grenzwert.

**Von jedem adapter verlangen, failure-chunks zu emittieren und würfe zu verbieten.** Library-iterators, transports und JavaScript-dispatch können weiterhin werfen. Von jedem adapter zu verlangen, dieselbe catch-Grenze zu reproduzieren, dupliziert ownership und schützt einen direkten `LlmRuntime`-consumer nicht vor einer unvollständigen Implementierung.

**Jeden Iterationsfehler im agent loop fangen.** Der loop kann provider-Fehler nicht zuverlässig von middleware-, session-append-, abbruch- oder assembly-Fehlern unterscheiden, ohne eine sidecar-map von stream-Objekten zu den adapter-calls wiederherzustellen, die sie erzeugten. Klassifikation gehört dorthin, wo der adapter-call gemacht wird.

**Ein `Result` vor dem streaming zurückgeben.** Ein pre-stream-result kann einen transport-Fehler nach partiellem output nicht repräsentieren, ohne einen zweiten response-lifecycle hinzuzufügen. Der bestehende terminale chunk repräsentiert bereits frühe und späte attempt-Ergebnisse.

## Konsequenzen

Alle `LlmRuntime.stream()`-consumer erhalten adapter-operational-Fehler über ein einziges typisiertes terminales Protokoll, während Programmier- und lifecycle-Fehler gewöhnliche Ausnahmesemantik behalten. Die recovery gibt die exakte geworfene Objekt-identity auf und exponiert nur losgelöste provider-neutrale facts. Der stream-service besitzt etwas mehr adapter-plumbing, aber consumer löschen catches, die identifizieren, welcher adapter warf, und löschen stream-keyed metadaten. Prepared calls tragen ihre policy explizit, und middleware-only-routing bleibt sichtbar policy-frei.
