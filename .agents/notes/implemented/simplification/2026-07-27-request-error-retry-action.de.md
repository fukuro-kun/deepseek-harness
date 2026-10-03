# Agent Note: Retry-Aktion bei Request-Fehlern

Status: implemented

[English](2026-07-27-request-error-retry-action.md) | [中文](2026-07-27-request-error-retry-action.zh.md) | Deutsch

## Problem

Die Recovery von Model-Requests wurde innerhalb von `agent/request-error` entschieden, aber über `Agent.retry()` kommuniziert. Dieser öffentliche Befehl war nur in einem schmalen Waterfall-Fenster und im Leerlauf gültig, lehnte andere laufende Zustände ab und verlangte, dass `ReactLoopAgent` neben dem Waterfall-Ergebnis ein veränderliches Retry-Fenster vorhält. Die Recovery-Plugins waren die einzigen produktiven Aufrufer, sodass die breitere Live-agent-Capability Zustände und Verhalten exponierte, die nichts mit ihrer Policy-Entscheidung zu tun hatten.

## Entscheidung

`agent/request-error` gibt `RequestErrorAction` zurück, dessen Handling-Aktion `{ kind: 'retry' }` ist; der Default `undefined` lässt den fehlgeschlagenen Turn terminal. Ein Listener, der den Fehler nicht besitzt, ruft `next()` auf. Ein Listener, der ihn besitzt, führt jede awaitete Reparatur aus und gibt die Retry-Aktion zurück, ohne zu delegieren.

Der Loop liest die Aktion, nachdem der Waterfall sich gesettelt hat, schließt den fehlgeschlagenen Turn und öffnet einen Retry-Turn aus durable History. Er prüft das Turn-Signal erneut, wenn er die Aktion konsumiert, sodass Cancellation oder Dispose während der Recovery den Retry verhindern, selbst wenn ein Listener ihn danach zurückgibt. Eine geworfene Recovery erzeugt nie eine Aktion.

`Agent` und `ReactLoopAgent` exponieren keine `retry()`-Methode. Normale neue Arbeit tritt über `followup()`, `steer()` und `inject()` ein; nur ein behandelter Model-Request-Fehler kann einen promptlosen Retry-Turn öffnen.

## Betrachtete Alternativen

**`Agent.retry()` als Recovery-Befehl behalten.** Runtime-Guards können den Befehl auf das Request-Error-Fenster beschränken, aber das Interface bewirbt weiterhin eine Idle-Resummon-Operation ohne produktiven Consumer, und der Loop braucht weiterhin veränderlichen Side-Channel-State, um eine Entscheidung zu rekonstruieren, die der Waterfall bereits besitzt.

**Eine explizite terminale Aktion zurückgeben.** `undefined` repräsentiert bereits den unbehandelten Default des Waterfall und komponiert direkt über `next()`. Ein zweiter Wert `{ kind: 'fail' }` würde weder andersartiges Verhalten noch Ownership-Information hinzufügen.

## Konsequenzen

Recovery-Ownership, asynchrone Reparatur und die Retry-Entscheidung teilen einen getypten Return-Pfad. Das Live-agent-Interface und der konkrete Loop verlieren die Idle-Resummon-Capability und den Retry-Fenster-State. Aufrufer können beliebige fehlgeschlagene Nicht-Request-Arbeit nicht ohne späteren Prompt neu starten, während Transient- und Context-Overflow-Policies nummerierte Retry-Turns, Rekonstruktion aus durable History, endliche private Budgets und Cancellation-Precedence behalten.

Fokussierte agent-loop-Tests pinnen Retry-Chaining, terminalen Fallthrough, Recovery-Fehler und Cancellation-Races. Die llm-retry- und compaction-basic-Suites pinnen ihre policy-eigenen Aktions-Returns, und die ACP-, goal-round-driver- und plan-mode-Integrationen pinnen die Übernahme des Nachfolge-Turns.
