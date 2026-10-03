# Agent Note: Event-Domain-Semantik — session ist das Fakten-Log, agent ist der Live-Event-Kanal

Status: implemented

[English](2026-06-30-event-domain-semantics.md) | [中文](2026-06-30-event-domain-semantics.zh.md) | Deutsch

## Problem

Der Harness erweitert den Agent Loop über eine Cordis-Event-Taxonomie (siehe [die Microkernel-Event-Taxonomie Agent Note](2026-06-11-microkernel-event-taxonomy.de.md)). Mit dem Wachsen dieser Taxonomie verschwamm die Grenze zwischen den drei Event-Domains:

- `session/*` trägt das durable, event-sourced Log (`SessionEventMap`).
- `agent/*` trägt Live-Laufzeitsignale, die einem Plugin das `Agent`-Handle übergeben.
- `tools/*` trägt die Tool-Registry und die Execution-Pipeline.

Zwei Probleme motivierten das Festzurren der Semantik. Erstens existierten mehrere Turn-/Step-Grenzen SOWOHL als durable `SessionEvent`s (`turn/start`, `turn/end`, `step/start`, `step/end`) ALS AUCH als gespiegelte `agent/*`-Emits (`agent/turn-start`, `agent/turn-end`, `agent/step-start`, `agent/step-end`). Ein Consumer hatte zwei Wahrheitsquellen für denselben Fakt, und jede Lifecycle-Änderung musste beide aktualisieren. Zweitens braucht das Hooks-Subsystem EINE kohärente, dokumentierte Oberfläche zum Abonnieren — ein Plugin-Autor (und die darauf aufbauenden Claude-Code-/Codex-Hook-Bridges) muss ohne Lektüre des Loops wissen, ob er auf ein Session-Event oder ein Agent-Event hören soll, und warum.

Dieses Vokabular ist das Fundament für Interception-Entscheidungen, das durable `hook/*`-Log und die Claude-Code- und Codex-Bridges.

## Entscheidung

**Drei Domains, je eine Aufgabe, mit einer einzigen Grenzregel.**

- **`session/*` — das durable, replaybare FAKTEN-Log.** Besitzt `SessionEventMap`; jeder Eintrag ist JSON-only (keine Live-Objekte). Ein `session/event`-Emit pro Append plus der `session/flush`-Parallel-Durability-Checkpoint. Es ist zugleich der Live-Transcript-Feed: Ein Consumer, der rendern oder auf Geschehenes reagieren will, abonniert hier — Live-Rendering und Replay-Projektionen teilen so einen Pfad.
- **`agent/*` — die LIVE-Laufzeitoberfläche.** Trägt immer das lebende `Agent`. Interception-Waterfalls (`agent/pre-step`, `agent/request`, `agent/request-error`) transformieren, lehnen ab oder stellen wieder her; das awaited `agent/turn-stopping` beobachtet die Stop-Grenze; transiente Emits melden Lifecycle, Status, Inbox-Insertion/Claim/Discard, Fehler und prozesslokale `agent/assistant-stream`-Frames. Turn- und Step-GRENZEN liegen NICHT hier — sie sind durable Session-Events, die vom `session/event`-Feed gelesen werden; Assistant-Stream-Evidenz wird nur innerhalb einer `assistant/message`- oder `assistant/attempt`-Settlement durable, und Mid-Turn-Steering ist ein durables `user/message`.
- **`tools/*` — die Tool-Registry und die Execution-Pipeline.**

**Die Grenzregel:** Ein durabler, replaybarer Fakt ist ein `SessionEvent`; eine Live-Interception oder ein transientes/Live-Objekt-Signal ist ein `agent`-/`tools`-Cordis-Event. Eine Turn- oder Step-Grenze ist ein durabler Fakt, lebt also im Session-Log und wird vom `session/event`-Feed gelesen — sie wird NICHT als `agent/*`-Emit gespiegelt.

**Die Regel auf die Grenz-Zwillinge angewandt:** Alle vier Grenz-Spiegel — `agent/turn-start`, `agent/turn-end`, `agent/step-start`, `agent/step-end` — werden **ENTFERNT**. Kein Produktions-Consumer braucht das live `Agent` an einer Grenze: Die ACP-Bridge korreliert ihren in-flight Prompt mit dem exakten `session/event`-`turn/start`/`turn/end`-Paar, und andere Transcript-Consumer leiten Grenzen ebenfalls aus dem durable Stream ab. Siehe [die remove-boundary-mirror-events Agent Note](../../archived/simplification/2026-06-20-remove-agent-boundary-mirror-events.md), die diese Entscheidung besitzt. Das Entfernen der Emits vereinfacht auch `closeStep`/`closeTurn` des Loops (je ein Append, kein gepaarter Emit).

## Konsequenzen

- Der Loop emittiert keine Grenz-Spiegel mehr; `closeStep` appended nur `step/end` und `closeTurn` nur `turn/end`. `Session.append` besitzt die Post-Commit-Observer-Eindämmung, sodass ein werfender Grenz-Observer weder das Turn-Ergebnis ändern noch spätere Consumer aushungern kann; ein Acceptance- oder Internal-Validation-Fehler entkommt weiterhin, bevor die Grenze ins Log gelangt.
- Tests, die Grenzen über die entfernten Emits beobachteten, beobachten nun die durable `turn/start`-/`turn/end`-/`step/start`-/`step/end`-Session-Events — das gepinnte Verhalten (Grenz-Reihenfolge, Step-Zählung) ist unverändert; nur der gelesene Feed zog auf den kanonischen um. Die Tests, die einen *werfenden Turn-Grenz-Emit-Listener* prüften, wurden gelöscht, weil dieser Codepfad nicht mehr existiert (es gibt kein Emit mehr, aus dem man werfen könnte). Gemäß [AGENTS.md „tests document behavior, not golden truth"](../../../../AGENTS.md) zogen Verhalten und Test gemeinsam um (oder starben gemeinsam).
- Der Loop markiert den Step erst als offen (`stepOpen = true`), nachdem `append('step/start')` returnt. Die interne Dispatch-Validierung läuft vor dem Log-Push und kann ablehnen, ohne einen Step zu öffnen; Post-Commit-`session/event`-Observer-Fehler werden innerhalb von `Session.append` eingedämmt. Der Marker repräsentiert daher exakt die committed Grenze, die ein späteres `step/end` schuldet.
- Die vollständige Umsetzung davon ist die [Simplification Agent Note „Stop mirroring durable boundaries as agent events"](../../archived/simplification/2026-06-20-remove-agent-boundary-mirror-events.md): Alle vier Grenz-Spiegel werden entfernt und jeder Consumer liest Grenzen vom `session/event`-Feed. `agent/steering` (kein Grenz-Spiegel) lag außerhalb des Scopes jener Agent Note und wurde durch ihr eigenes Follow-up entfernt, [Remove the `agent/steering` mirror emit](../../archived/simplification/2026-07-04-remove-agent-steering-mirror.md) — es spiegelte das durable Mid-Turn-Steering-`user/message`.
- Die generierte Cordis-Event-Oberfläche (die `docs/subsystems/`-Seiten) listet die Mirror-Events nicht mehr.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
