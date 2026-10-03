# Agent Note: node:timers/promises für handgeschriebene abbrechbare Sleeps verwenden
[English](2026-07-26-builtin-timer-promises-for-hand-rolled-sleeps.md) | [中文](2026-07-26-builtin-timer-promises-for-hand-rolled-sleeps.zh.md) | Deutsch

Status: rejected — die Implementierung (PR #679) hat die Paritätsannahme widerlegt: vitests Fake Clock fängt `node:timers/promises` nicht ab, der Tausch kostet also deterministische schnelle Tests für ~10 gelöschte Zeilen


## Problem

Drei Pakete schreiben promise-umschlossene Timer von Hand, die das Builtin `node:timers/promises` bereits bereitstellt, während andere Pakete (`dsh-llm-mock-server` `pause()`, `dsh-lsp-stdio`, `dsh-acp-snapshot`) das Builtin bereits verwenden — die handgeschriebenen Kopien sind damit auch eine Konsistenzlücke:

- `packages/llm/llm-retry/src/index.ts` `cancellableDelay()` (~14 Zeilen): `new Promise` + `setTimeout` + manuelles Hinzufügen/Entfernen des Abort-Listeners, löst `true` beim Ablauf und `false` beim Abort auf, einmal konsumiert für das Backoff-Warten.
- `packages/workflow/workflow-worker-thread/src/host.ts` `sleep()` (~7 Zeilen): promise-umschlossener unref'd `setTimeout`, verwendet als Obergrenze für die dispose-Schonfrist.
- `packages/terminal/terminal-bash/src/session.ts` `delay()` (~4 Zeilen): schlichter promise-umschlossener `setTimeout`, verwendet in Polling-/Teardown-Warten.

## Proposal

Alle drei durch `import { setTimeout } from 'node:timers/promises'` ersetzen:

- llm-retry: `try { await setTimeout(delayMs, undefined, { signal }); /* retry */ } catch { /* abort → fail */ }` — mit einem signal rejectet das Promise nur mit dem Abort-Fehler, und ein bereits abgebrochenes signal rejectet sofort; das Verhalten ist identisch, einschließlich des Löschens des Timers beim Abort. Das leere `catch` benennt die Abort-Rejection gemäß der Empty-Catch-Regel des Repos.
- workflow-worker-thread: `setTimeout(ms, undefined, { ref: false })` — exakte Semantik, einschließlich des Nicht-Offenhaltens des Event Loops.
- terminal-bash: `import { setTimeout as delay } from 'node:timers/promises'` — identische Signatur, Aufrufstellen unverändert.

Keine dedizierten Tests pinnen die Hilfsfunktionen selbst; die Verhaltenstest-Suiten der Pakete laufen weiter.

## Alternatives considered

- **Pakete im Stil von `p-timeout`/`p-defer`.** Abgelehnt: Das Builtin deckt beide Aufrufstellen exakt ab; ein externes Paket für ein einzeiliges await ist negativsaldo.
- **So belassen.** Nur schwach abgelehnt — die Kosten sind gering, aber das Repo nutzt die Builtin-Idiom bereits an anderer Stelle, und zwei handgeschriebene Varianten eines Builtins laden zu einer dritten ein.

## Acceptance criteria

- Keines der drei Pakete definiert einen promise-umschlossenen `setTimeout`-Helper; alle importieren aus `node:timers/promises`.
- Die Test-Suiten von `llm-retry`, `workflow-worker-thread` und `terminal-bash` bestehen unverändert (Verhaltensparität).

## Risks

Im Wesentlichen keine: keine modell-sichtbare Ausgabe, keine Plattform-Bedenken, keine neue Abhängigkeit. Das llm-retry-Rewrite verwandelt einen bool-rückgibenden Helper in try/catch-Kontrollfluss — ein lokales Lesbarkeitsurteil, das der implementierende PR trifft.
