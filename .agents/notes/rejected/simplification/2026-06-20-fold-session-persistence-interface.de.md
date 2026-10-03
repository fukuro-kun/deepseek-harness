# Agent Note: Das Persistence-Interface in dsh-session falten
[English](2026-06-20-fold-session-persistence-interface.md) | [中文](2026-06-20-fold-session-persistence-interface.zh.md) | Deutsch

Status: rejected — das separate Persistence-Service-Definition-Paket ist der intendierte modulare Rollensplit für die Durable-Persistence-Capability-Seam. Es in `dsh-session` zu falten würde die Paketanzahl auf Kosten einer saubereren Backend-Grenze reduzieren.


## Problem

`dsh-session-persistence` ist ein Service-Definition-Paket, dessen Hauptkonzepte bereits `dsh-session` gehören: `SessionHeader`, `SessionEvent`, `SessionId`, `session/event` und `session/flush`. Das Paket fügt den abstrakten `SessionPersistence`-Service, den geteilten Write-Coordinator und Contract-Helper hinzu. Provider-Pakete hängen davon ab, und `agent-loop` muss für Resume optional einen Geschwister-Service finden.

Der Capability-Seam-Split ergab Sinn, als Persistence ein neues austauschbares Backend-Design war. Nachdem das mutable Summary entfernt wurde, umhüllt das Service-Definition-Paket größtenteils die eigene Storage-Angelegenheit des Session-Logs. Es getrennt zu halten könnte mehr Zeremonie als Klarheit sein.

## Proposal

Den abstrakten `SessionPersistence`-Service, den Coordinator und die Persistence-Contract-Helper nach `dsh-session` verschieben. JSONL und SQLite als separate Backend-Pakete behalten, die den session-eigenen Service registrieren. Das bewahrt Backend-Austauschbarkeit und löscht gleichzeitig ein Support-Paket und eine paketübergreifende Grenze.

Der implementierende PR sollte die [Capability-Seams](../../implemented/architecture/2026-06-13-capability-seams.de.md)-Guidance um die Ausnahme ergänzen: Persistence ist nicht wie bash oder LLM, weil ihr Vokabular und ihre Lifecycle-Events bereits die Kerndomäne des Session-Pakets sind.

## Acceptance criteria

- `@deepseek-ai/dsh-session-persistence` wird als Paket entfernt.
- `dsh-session` exportiert den Persistence-Service-Typ, den Coordinator und die Contract-Helper.
- JSONL- und SQLite-Backend-Pakete hängen direkt von `dsh-session` ab.
- `agent-loop` Resume nutzt den session-eigenen Service-Key.
- [Session Persistence](../../implemented/architecture/2026-06-14-session-persistence.de.md), [Handle-basierte Session-Persistence](../../implemented/architecture/2026-08-27-handle-based-session-persistence.de.md) und die [Paket-Docs](../../../../packages/session/session-persistence/README.de.md) erklären, warum Backend-Implementierungen getrennt bleiben.

## What we give up

`dsh-session` wird schwerer: Es besitzt sowohl das In-Memory-Log als auch die Persistence-Service-Definition. Das ist der Tausch. Wären Third-Party-Persistence-Backends bereits ein öffentliches Ökosystem, wäre das separate Service-Definition-Paket eine sauberere SDK-Grenze; pre-release wirkt das Extra-Paket wie Abstraktion, bevor es einen externen Consumer gibt.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
