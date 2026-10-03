# Agent Note: Goal-eigene dauerhafte Events

Status: implemented

[English](2026-07-31-goal-owned-durable-events.md) | [中文](2026-07-31-goal-owned-durable-events.zh.md) | Deutsch

## Problem

Goal-State und Inbox-State haben unterschiedliche Lebenszyklen. Eine Goal-Mutation muss Restart und fork überleben, unabhängig davon, ob zugehöriger Modellkontext zugelassen wird, während eine Inbox-Nachricht im Rahmen der Schrittplanung bearbeitet, beansprucht, abgelehnt oder verworfen werden darf. Eine Goal-Mutation in einer Round-Null-Inbox-Nachricht zu kodieren, machte die Platzierung in der Warteschlange zum Commit-Punkt der Domäne und erforderte, dass replay Einfügung, Zulassung, Nachrichtenidentität, Quell-Metadaten und gerenderten Inhalt miteinander abgleicht.

Die Goal-Domäne braucht dauerhaften State, aber keine Ownership über ausstehenden Modell-Input. Die Fortsetzungsplanung braucht weiterhin die Inbox; die Goal-Persistenz nicht.

## Entscheidung

`@deepseek-ai/dsh-goal` besitzt ein dauerhaftes `goal/change`-Session-Event. Jedes Event trägt den vollständigen Goal-Snapshot nach der Mutation oder einen versionierten Clear-Tombstone. `GoalService` hängt dieses Event synchron an und emittiert anschließend `goal/changed`; strict replay und die `goal`-Session-Projektion falten ausschließlich `goal/change` für den Lebenszyklus-State.

`GoalMessageSource` identifiziert nur positive zugelassene Fortsetzungs-Rounds. Eine passende `user/message` erhöht `roundsStarted`; gewöhnliche User-Nachrichten und Inbox-Splice-Events ändern den Goal-State nicht. Das Goal-Package fügt niemals Inbox-Nachrichten ein, beansprucht, entfernt oder inspiziert sie. `@deepseek-ai/dsh-goal-round-driver` bleibt dafür verantwortlich, seine eigenen Fortsetzungs-Prompts über den öffentlichen Inbox-Lebenszyklus einzureihen und zu verfolgen.

Aktivierung bleibt prozesslokal. Der Service assoziiert die synchron angehängte Event-Sequenz mit der angeforderten Aktivierung, während sein Cache das Event beobachtet; replayte oder extern angehängte Änderungen gelten standardmäßig als entschärft. Das Session-Log bleibt die einzige dauerhafte Autorität.

Die Domäne projiziert nicht jede Mutation automatisch in den Modell-Input. Goal-Tools liefern den aktuellen State, und Fortsetzungs-Prompts enthalten Zielvorgabe und Round-State, wenn Arbeit tatsächlich eingeplant wird. Jeder künftige stets sichtbare Goal-Kontext ist ein eigenes Kontext-Plugin, das seine Inbox-Nachricht selbst besitzt, statt ein Persistenz-Nebeneffekt zu sein.

## Erwogene Alternativen

- **Round-Null-Goal-Nachrichten als dauerhaften Datensatz beibehalten.** Abgelehnt, weil es Domänen-Commits an Queue-Mutationen koppelt und vom Goal-Fold verlangt, Claim- und Zulassungsabgleich zu verstehen, obwohl Queue-Ergebnisse Domänen-State nicht zurückrollen können.
- **Goal-State nur aus modellsichtbaren Nachrichten ableiten.** Abgelehnt, weil eine Mutation gültig und dauerhaft sein kann, ohne einen Schritt zu öffnen, und weil Abbruch oder Policy-Ablehnung sie nicht löschen dürfen.
- **Goals in einer separaten Datenbank speichern.** Abgelehnt, weil das geordnete Session-Log bereits Persistenz, replay und fork-Vererbung ohne eine zweite Atomaritätsgrenze liefert.

## Konsequenzen

Goal-State ist unabhängig von Inbox-Platzierung und Zulassung. Replay hat einen einzigen Mutationspfad, Projektionen schreiten direkt auf `goal/change` fort, und Fortsetzungs-Nachrichten tragen nur die Round-Zuordnung. Das Modell erhält keine reine Mutations-`<goal_state>`-Nachricht; modellsichtbarer State erscheint über Goal-Tools und eingeplante Fortsetzungs-Prompts. Direkte Session-Schreiber bleiben vertrauenswürdig und können fehlerhafte Änderungen anhängen, die das strict fold und die Invarianten-Begleitprüfung ablehnen.

Fokussierte Goal-, Goal-Round-Driver-, Command-, TUI- und Client-Fixture-Tests pinnen dauerhaftes replay, Positive-Round-Abrechnung, Inbox-Unabhängigkeit, Projektions-Updates und das Verhalten wiederhergestellter Sessions. Der schlüssellose Prozess-Test inspiziert das persistierte `goal/change`-Event und verifiziert, dass die Erstellung allein keine Fortsetzungs-Round startet.
