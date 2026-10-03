# Agent Note: Event-sourced Sessions mit abgeleiteter message-Historie
[English](2026-06-11-event-sourced-sessions.md) | [中文](2026-06-11-event-sourced-sessions.zh.md) | Deutsch

Status: implemented


## Problem

Das MVP erfordert striktes event-basiertes Tracing mit vollständig replay-fähigen sessions（严格的基于事件的trace、logging系统，session完全可回放）.

## Entscheidung

`Session` ist ein append-only-Log typisierter `SessionEvent`s — die einzige source of truth. Die LLM-message-Historie wird aus dem Log *abgeleitet* (`deriveMessages()`); rohe stream chunks werden für token-Level-Replay-Fidelität protokolliert, während das assemblierte `assistant/message` event die Autorität für die Ableitung ist. Replay/fork = eine neue session mit einem bestehenden Log seeden.

Appends sind synchron (der hot path blockiert nie auf I/O); `session/event` ist eine synchron Benachrichtigung; persistence plugins puffern write-behind und leeren sich an dem `session/flush`-checkpoint, der am Ende jedes turns ausgelöst wird.

Reihenfolge-Contract: der loop beansprucht inbox messages vor `agent/pre-step`, öffnet `step/start` nur nach einer enter-Entscheidung und hängt dann das zurückgegebene `user/message`-Batch vor der Request-Ableitung an. Der provider-Output wird als `assistant/message` assembliert und angehängt, bevor die tool dispatch erfolgt, sodass das durable Log die exakte message protokolliert, der die tools folgen. Regressionstests fixieren diese Reihenfolge.

## In Betracht gezogene Alternativen

**Ein mutabler message-Array mit Events, die nur als Benachrichtigungen gefeuert werden** — einfacher, aber state und Log können divergieren; mit event-sourcing IST das Log der state, sodass Divergenz strukturell unmöglich ist.

## Konsequenzen

- Replay, trace und telemetry sind strukturell garantiert, nicht nachgerüstet.
- Persistence bleibt eine plugin-Angelegenheit; der in-memory store wird mit dsh-session ausgeliefert.
- Die event-Vocabulary ist merge-extensibel (plugins fügen z. B. compaction events hinzu); [session persistence](2026-06-14-session-persistence.de.md) hat ihre Form eingefroren, sobald das Log durable wurde.
- Die Ableitungskosten wachsen mit der Log-Länge — compaction (dsh-compaction) ist die beabsichtigte Milderung, keine Log-Mutation.
