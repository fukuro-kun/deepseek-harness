# Agent Note: Queued manuelle compaction mit einer dauerhaften Sperre

Status: implemented

[English](2026-07-30-queued-manual-compaction.md) | [中文](2026-07-30-queued-manual-compaction.zh.md) | Deutsch

## Problem

Automatische compaction schützt das Kontextfenster, doch ein interaktiver Nutzer braucht auch einen deterministischen Weg, angesammelte history zu verdichten, bevor die Druck-Policy feuert. `/compact` als prompt-Text zu senden würde einen Modell-turn kosten und das Konversationsmodell eine direkte Steueraktion neu interpretieren lassen. Die Umsetzung innerhalb einer einzelnen UI würde Kommando-Discovery, Lebenszyklus-Logging, Abbruch und Backend-Policy duplizieren.

Das menschliche Kommando kommt zwischen turns an und muss asynchron zusammenfassen. Ein während dieses Wartens angenommener prompt muss seine gewöhnliche Identität, FIFO-Position und Aufweckverhalten behalten, darf aber keinen Request aus history ableiten, die compaction gleich ersetzen wird. Ein separater Status-Check genügt nicht, weil ein anderer Aufrufer den driver zwischen diesem Check und dem Inanspruchnehmen der idle-Phase durch die compaction-Operation aufwecken kann.

Compaction braucht zudem eine einzige Wechselseitigkeits-Tatsache, die manuelle, Druck-, Überlauf- und explizite-Bereichs-Einstiegspunkte teilen. Ein rein prozesslokales Flag kann ein crash-recovertes Log nicht erklären, während eine summarize-first-Transaktion während des teuren Intervalls keine dauerhafte Evidenz hinterlässt. Umgekehrt würde das Behandeln von Marker-Paaren als exklusive Container gültige idle-injection verbieten, obwohl injection ausdrücklich nicht-aufweckend und sofort zwischen turns geschieht.

Dieses Note erweitert den [compaction-capability-seam](2026-06-18-compaction-capability-seam.de.md), die [Session-end-seed-Grenze](../architecture/2026-07-30-session-end-seed-log-boundary.de.md) und die [Entfernung synthetischer nur-Log-turns](../simplification/2026-07-28-remove-synthetic-log-only-turns.de.md). Jedes bleibt aktiv und besitzt seine breitere Entscheidung; die Überschneidung ist nur partiell.

## Decision

### `/compact` ist ein Kommando über einen backend-unabhängigen seam

`@deepseek-ai/dsh-command-compact` registriert ein argumentfreies menschliches Kommando über `ctx.commands`. Es ruft die dritte abstrakte `CompactionEngine`-Operation `compactNow(agent, signal)` auf und bildet die geschlossene `ManualCompactionError`-Taxonomie (`busy | changed | summary | commit | persistence`) auf direkte UI-Ergebnisse ab. `command/run` und `command/done` bewahren den Kommando-Lebenszyklus, ohne in Modell-history einzugehen oder einen Model-Loop-turn zu verbrauchen.

Das Kommando-Plugin verfolgt jedes echte Handler-Promise unabhängig vom abbruchbewussten Warten des Kommando-Executors. Sein zusammengesetzter Lebenszyklus-Effekt deregistriert `/compact`, bevor er bereits gestartete Handler asynchron ablaufen lässt, sodass root-teardown erst nach Abrechnung der Backend-Schließ- und Flush-Arbeit quiescence erreicht.

Das `ManualCompactAgentContext` des seam fügt nur `runMaintenance()` zu den Session- und Routing-Fakten hinzu, die compaction bereits braucht. Retention, Balancing, Summarization, Marker-Ordnung, Ersetzung und Durability bleiben Backend-Aufgaben.

### Idle-Maintenance wird synchron in Anspruch genommen

`Agent.runMaintenance(task)` startet nur aus der idle-Phase und beansprucht diese Phase, bevor es den Task aufruft. Ein aufweckendes Send startet den Loop sofort bei idle; welche Operation die Phase zuerst beansprucht, besitzt die Grenze.

Maintenance erzeugt keine zweite Queue. Spätere Sends behalten ihre `MessageId`, Platzierung, FIFO-Reihenfolge und Aufweckfakten. Aufweckende Eingabe bleibt eingereiht, bis Maintenance abrechnet, und startet dann den bestehenden driver-Pfad; `inject()` bleibt nicht-aufweckend.

`whenIdle()` behandelt Maintenance und jede dahinter freigegebene aufweckende Arbeit als unerledigte Aktivität. Abbruch bricht das agent-eigene Maintenance-Signal ab, und Lebenszyklus-teardown leert dieselbe Aktivitätsgrenze vor Abschluss der Disposal.

### Eine parametrisierte Transaktion besitzt jede Klammer

`dsh-compaction-basic` hat eine Bereichstransaktion, parametrisiert über Klammer-owner (`number | null`), Stabilitätsregel (ganze Oberfläche oder ausgewählte Spanne) und einen optionalen flush. Sie führt eine Ordnung aus:

1. den ausgewählten Positionsbereich validieren und das dauerhafte Ende inspizieren;
2. einen lebenden ungepaarten compaction-Marker zurückweisen;
3. `compaction/start` synchron anhängen;
4. die Zusammenfassung vorbereiten und abwarten;
5. die geforderte Stabilität revalidieren;
6. `compaction/summary` und das ersetzende `user/message` anhängen;
7. genau einen `compaction/end`-Versuch unternehmen;
8. flushen, wenn der manuelle Aufrufer Durability angefordert hat.

Automatische und explizite-Bereichs-Arbeit nutzt den numerischen owner, der aus dem offenen turn wiederhergestellt wurde, und erfordert Ganzoberflächen-Stabilität. Manuelle Arbeit reserviert zuerst die Zulassung, wählt vor der Transaktion einen brauchbaren Bereich und schreibt nichts, wenn die Auswahl `null` liefert. Ihre Klammer nutzt `turn: null`, erfordert nur Auswahlspannen-Stabilität und flusht jeden erfolgreich geschlossenen Versuch, bevor sie die Zulassung in `finally` freigibt.

`compaction/start` ist daher die einzige compaction-Sperre. Es gibt kein `WeakSet`, keinen Wrapper-Mutex, keine locked/unlocked-Methoden-Aufspaltung und keine redundante Aktivitätsprüfung um die Transaktion.

### Klammer-first weicht bewusst von den untersuchten Implementierungen ab

Codex modelliert manuelle compaction als `CompactionTask`, die ihren aktiven-turn-slot belegt, während automatische compaction inline läuft. Pi nutzt die Existenz eines compaction-abort-controller als Mutex und hängt compaction erst nach Erfolg an. Claude Code teilt eine compaction-Routine zwischen automatischem und manuellem Pfad, konstruiert ihre Grenze aber nach dem Summary-Streaming.

DSH zeichnet `compaction/start` bewusst vor dem Aufruf des Summarizers auf. Ein langsamer oder abgestürzter Versuch ist beobachtbar, automatischer und manueller Pfad teilen dieselbe dauerhafte Sperre, und ein späterer Schreiber kann eine schwebende Zusammenfassung nicht mit einer ungesperrten Session verwechseln. Dies ist eine bewusste Abweichung vom summarize-first-Verhalten, kein versehentlicher Event-Ordnungs-Unterschied.

### Marker sind Zeitpunkte, kein Event-Container

`compaction/start` und `compaction/end` bedeuten Sperr-Erwerb und -Freigabe. Sie beanspruchen keine exklusive Ownership jedes Events zwischen ihren seqs. Ein idle-`inject()` darf ein `user/message` anhängen, während eine manuelle Zusammenfassung aussteht, sodass dieses unverbundene Event innerhalb des Marker-Intervalls liegen kann.

Manuelle Stabilität prüft nur die ausgewählte Spanne: Sie muss vorhanden, zusammenhängend, geordnet, gleich bepreist und balanciert bleiben. Append-only-Kontext außerhalb lässt die Zusammenfassung nicht veralten. Positionelle Ersetzung platziert den checkpoint an der Oberflächenposition der alten Spanne und lässt injizierten Kontext in der abgeleiteten Modell-history danach stehen, obwohl die Log-seq der injection vor den späteren Summary- und Ersetzungs-Events liegt.

Fehlgeschlagene `changed`- oder `summary`-Versuche lassen die Konversationsoberfläche unverändert, doch das Log ist nicht unverändert: Es enthält `compaction/start` und `compaction/end { error }`. Der nutzerseitige Text benennt diesen Unterschied.

### End-seed unterscheidet lebende und veraltete Verwaiste

Der End-Scan findet den aktuellen turn, den ungepaarten compaction-start und das neueste `session/end-seed` unabhängig. Ein ungepaarter start nach dem neuesten end-seed ist lebendig und blockiert jeden compaction-Einstiegspunkt. Ein ungepaarter start vor einem späteren end-seed gehört einem früheren Session-Lebenszyklus an und ist veraltet, sodass er die fortgesetzte oder geforkte Session nicht verkeilt.

Die compaction-Invariante nutzt dieselbe Übergangslogik während des seed-Replay: `session/end-seed` löscht eine offene historische Spur. Die Grenze muss für diesen Fall nicht live aus dem Konstruktor publizieren; Replay ist der tragende Pfad.

Die Client-Request-Projektion schließt einen ungepaarten compaction-Request zur `session/end-seed`-Zeit als unterbrochen und löscht seinen aktiven Index. Ein späteres `compaction/start` erzeugt daher einen unabhängigen Request, statt einen dauerhaft laufenden Verwaisten zu belassen oder zu überschreiben.

Sobald eine Transaktion ihren start angehängt hat, unternimmt jeder spätere Fehlschlag einen Schließversuch. Ein fehlgeschlagener Schließversuch lässt den ungepaarten start bewusst sichtbar und blockierend, und es wird kein flush versucht. Ein geschlossener manueller Versuch wird geflusht, selbst wenn er einen erwarteten Fehlschlag meldet. Abbruch behält den Exakt-Grund-Vorrang nach erforderlichem Schließ- und Flush-Aufräumen.

### Referenzimplementierungs-Grenzen

Eine ungemergte Referenzimplementierung informierte Kommando, Reservierung, Tests und Snapshot-Form. Ihre prozesslokale `WeakSet`-Sperre und ihre locked/unlocked-Methoden-Aufspaltungen wurden erwogen und nicht übernommen, weil die dauerhafte Klammer die einzige erreichbare Sperre ist.

Diese Referenz trug außerdem clientseitige Ersetzungs-Anker-Machinerie zur Bewahrung der transcript-Platzierung. Die log-geordnete transcript-Projektion konsumiert compaction bereits aus der Event-Reihenfolge und konsultiert keine veränderlichen Oberflächenpositionen, sodass diese Anker erwogen und nicht übernommen wurden.

## Alternatives considered

**`agent.status` vor dem Maintenance-Start prüfen.** Abgelehnt, weil Check und Phasen-Beanspruchung getrennte Operationen wären; ein aufweckendes Send könnte den driver dazwischen starten.

**Das Kommando selbst einreihen.** Abgelehnt, weil `/compact` direkte Steuerung ist, kein Modelleingang, und ein zuvor angenommener prompt sein Vorfahrtsrecht behalten muss statt um eine zweite Kommando-Queue herum umsortiert zu werden.

**Vor dem Anhängen von `compaction/start` zusammenfassen.** Abgelehnt, weil die teure schwebende Operation unsichtbar wäre und nicht an der von automatischer compaction geteilten Sperre teilnähme.

**Sowohl einen dauerhaften Marker als auch einen prozesslokalen Mutex nutzen.** Abgelehnt, weil zwei Autoritäten nach Replay auseinanderlaufen können und Wrapper-Zweige für Zustände erfordern, die die Klammer bereits ausdrückt.

**Injection zusammen mit aufweckenden prompts zurückhalten.** Abgelehnt, weil idle-injection vertraglich nicht-aufweckender dauerhafter Kontext ist; ihr Aufschub würde die Plugin-Ordnung von einem UI-Kommando abhängig machen.

**Verlangen, dass das Marker-Intervall nur compaction-Events enthält.** Abgelehnt, weil Marker Sperr-Zeitpunkte darstellen. `compaction/summary` benennt den ausgewählten Bereich und die überdeckten seqs exakt; Exklusivität würde keine Korrektheit hinzufügen und gültige injection zurückweisen.

**Jeden ungepaarten Marker als dauerhaft busy behandeln.** Abgelehnt, weil eine crash-recoverte oder geforkte Session verkeilt bliebe. `session/end-seed` ist die explizite Lebenszyklus-Evidenz, die veraltete history von einem lebenden prozesslokalen Versuch unterscheidet.

## Verification

Agent-Loop-Tests decken gleich-tick-Vorfahrt, bewahrte IDs und FIFO-Lebenszyklus, aufweckende und stille eingereihte Arbeit, idempotente Freigabe, `whenIdle()`, Abbruch und teardown ab. Compact-Tests decken eigenständige und nummerierte Invarianten-Ownership, end-seed-Replay, lebende versus veraltete Verwaiste, reentrante Listener, Auswahlspannen-Drift, Commit- und Schließfehler, flush-Ordnung, exakte Abbruchgründe, Rohausgabe- und Nutzungsbewahrung sowie automatisch/manuellen Wechselschluss ab.

Das Kommando-Paket pinnt Registrierung, Loader-Komposition, Argumentzurückweisung, exakten Erfolgs-/Fehlschlag-Text, Abbruch, Abwesenheit aus Modell-history und das Warten der Disposal über getrennte Schließ- und Flush-Grenzen hinweg, nachdem ein Abbruch den Executor vom Erwarten des Handlers abhält. Der Client-Laufzeit-Projektionstest pinnt end-seed-Unterbrechung gefolgt von einem unabhängigen abgeschlossenen Versuch. Der `queued-manual-compact`-Terminal-Snapshot treibt echte Tastenanschläge durch die assemblierte TUI: `/help` entdeckt das Kommando, eine zurückgehaltene Zusammenfassung lässt einen eingereihten prompt und sofortige injection zu, `turn: null`-Marker und der flush gehen dem eingereihten prompt-turn voraus, der Kommando-Lebenszyklus bleibt nur-Log, und die abgeleitete Ordnung ist checkpoint → injection → eingereihter prompt.

## Consequences

Interaktive Nutzer können brauchbare history verdichten, ohne einen Konversationsmodell-turn zu verbrauchen. Ein vor dem Kommando angenommener prompt gewinnt; einer während des Kommandos wartet mit seiner ursprünglichen Queue-Identität. Manuelle compaction verbraucht Session-seqs, aber keine turn-Nummer.

Das Log legt langsame, fehlgeschlagene, abgestürzte und erfolgreiche Versuche über dieselbe Klammer offen. Ein veralteter Vor-Grenzen-Verwaister verkeilt keinen neuen Lebenszyklus mehr, während ein aktueller ungepaarter start ein hartes busy-Signal bleibt. Marker-Intervalle können unverbundene Events enthalten, sodass Consumer die in `compaction/summary` aufgezeichneten seqs und die relative Ordnung nutzen statt eine zusammenhängende nur-compaction-Scheibe anzunehmen.

Die geteilte Transaktion hält eine Ordnung und eine Sperre über jeden Einstiegspunkt. Die Fehlerberichterstattung ist präzise darin, ob nur das Log geändert wurde, die Oberfläche teilweise geändert worden sein kann oder der In-Memory-Commit nicht persistiert werden konnte.
