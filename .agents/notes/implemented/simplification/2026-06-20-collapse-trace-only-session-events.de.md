# Agent Note: Trace-only Session-Fakten in tragende Events eingefaltet
[English](2026-06-20-collapse-trace-only-session-events.md) | [中文](2026-06-20-collapse-trace-only-session-events.zh.md) | Deutsch

Status: implemented


## Problem

Das Session-Event-Vokabular enthält First-Class-Events, die nicht Teil der replaybaren Konversationshistorie sind und kaum oder keinen Produktionskonsum haben. `usage` ist bereits als Model-Stream-Chunk vorhanden, bevor der Loop zusätzlich ein separates `usage`-Event anhängt. `error` dupliziert den `turn/end { kind: 'error', message, code }`-Reason für Loop-Fehler; die ACP-Abwicklung liest den Turn-End-Reason, während Message- und UI-Projektionen das standalone `error`-Event überspringen.

Diese Events lassen das kanonische Transcript nützlicher als Telemetrie erscheinen, als es derzeit ist. Sie fügen Event-Varianten, Invariants, Tests, Snapshots und Persistenzfälle hinzu, sind aber als separate Records nicht tragend. Die Fakten, die sie tragen, können weiterhin nützlich sein: Token-Usage sollte für die Abrechnung verfügbar bleiben, und die Step-Nummer eines Fehlers sollte nicht lautlos verschwinden. Die Vereinfachung besteht darin, diese Fakten in nahe liegende Events einzufalten, die Consumer ohnehin verstehen müssen — nicht darin, weniger Information aufzuzeichnen.

## Decision

Standalone-Trace-only-Events werden genau dort entfernt, wo ihre Information ohne parallelen Record bewahrt bleibt:

- Usage eines erfolgreichen Steps faltet in das passende `assistant/message` ein (`assistant/message { turn, step, content, usage? }`), sodass die assemblierte Model-Ausgabe und ihre Abrechnung gemeinsam reisen.
- Ein fehlgeschlagener oder abgebrochener Step, der Usage, aber keinen Assistant-Content hat, trägt die Usage auf einem `assistant/message { content: [], usage }` mit leerem Content — kein persistierter Usage-Chunk bleibt unrepräsentiert. Der Fall ohne Informationsverlust ist der Max-Tokens-Pfad: Ein mit Usage, aber leerem Content abgeschnittener Step (z. B. nur ein verworfener Tool-Call) emittierte früher ein standalone `usage`. Damit das Empty-Content-Event keinen unechten content-losen Assistant-Turn in das Provider-Transcript injiziert, überspringt `deriveMessages()` `assistant/message`-Events mit leerem Content; ein Regressionstest stellt sicher, dass Usage repräsentiert bleibt UND die abgeleitete Historie unverfälscht bleibt.
- Die Step-Nummer aus dem standalone `error`-Event faltet für `kind: 'error'` in `turn/end.reason` ein (`{ kind: 'error', step, message, code? }`) — `turn/end` ist das durable Turn-Outcome, das ACP und Resume bereits konsumieren.
- `agent/error` und Logging bleiben für Live-Diagnostik; es gibt keinen zweiten Session-Log-Error-Record nach `turn/end`.

Das User-Konversationslog enthält alles, was zum Rendern, Resumen, Auditieren und Abrechnen der Interaktion nötig ist, ohne dass Consumer doppelte Trace-Zeilen abgleichen müssen.

## Alternatives considered

**Die standalone Zeilen als Telemetrie behalten** — die Events ließen das kanonische Transcript nützlicher als Telemetrie wirken, als es war, auf Kosten von Event-Varianten, Invariants, Tests, Snapshots und Persistenzfällen, die nichts konsumierte. Falls Analytics real werden, ist die richtige Form ein Projektions-Helper oder ein dedizierter Telemetrie-Store mit eigener Retention-Policy — nicht doppelte Trace-Zeilen im Konversationslog.

## Verification

`SessionEventMap` trägt kein standalone `usage` oder `error`; der Loop hängt kein separates Usage-Event an und zeichnet durable Fehler über `turn/end { kind: 'error', step, message, code? }` auf; ACP-Snapshots und Persistenztests assertieren, dass keine Trace-only-Zeilen existieren; der eingefrorene v0-Codec und die Identity-Migration bewahren diese released-Repräsentation in das released v1; und die Docs geben an, wo Token-Usage und Betriebsfehler beobachtet werden.

## Consequences

Ein Consumer kann das kanonische Log nicht mehr nach standalone `usage`- oder Step-Level-`error`-Zeilen filtern. Er muss diese Fakten aus den Assistant-/Failure-Events lesen, die sie tragen. Das ist eine vernünftige Vereinfachung, weil dieselben Fakten erhalten bleiben, wie der Abschnitt Verification beweist.

## Implementation note

**Format-Version.** Diese Event-Vereinfachung liegt vor der released v0-Baseline. `dsh-session` besitzt die aktuelle Writer-Konstante, während der statische Katalog und angrenzende Pakete jetzt unterstütztes historisches Decoding und Migration besitzen. Die Identity-v0-to-v1-Kante beweist diesen Lifecycle, ohne diese Event-Repräsentation zu ändern.

Usage wird jetzt über `assistant/message.usage` beobachtet; der Step eines Betriebsfehlers über `turn/end.reason` bei `kind: 'error'`. `agent/error` + Logging bleiben unverändert für Live-Diagnostik.
