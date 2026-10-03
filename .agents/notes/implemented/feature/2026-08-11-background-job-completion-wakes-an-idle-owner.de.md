# Agent Note: Hintergrund-Job-Vollendung weckt einen idle Owner

Status: implemented

[English](2026-08-11-background-job-completion-wakes-an-idle-owner.md) | [中文](2026-08-11-background-job-completion-wakes-an-idle-owner.zh.md) | Deutsch

## Problem

`tool-jobs` versprach dem Modell: „Du wirst in der Session benachrichtigt, wenn ein Task fertig wird — polle nicht busy und schlafe nicht auf einen." Das Versprechen galt nur, solange das Modell noch arbeitete. Die Vollendung wurde über `agent.inject()` zugestellt, was an die Next-Step-Inbox anhängt, ohne einen Driver zu reservieren, sodass ein Task, der nach dem Ende seines Turns abrechnete, die Notice geparkt ließ, bis etwas Unabhängiges den Agent weckte. Die häufige Form ist genau die, die bricht: Das Modell startet ein langes Kommando, sagt dem User, dass es gestartet ist, beendet seinen Turn, und das Kommando vollendet in eine Inbox, die niemand claimen wird. Der Prompt sagte dem Modell, nicht zu pollen — und dann kam nichts an.

Die Lücke war als Limitation dokumentiert statt durchdacht, sodass der Fallback `job_output(wait: true)` wurde — das blockierende Warten, das derselbe Prompt abrät.

Diese Entscheidung ersetzt einen Fakt der [Background-Job-Runtime-Entscheidung](../architecture/2026-06-20-generic-long-running-tool-runtime.md) — dass eine Vollendung nie einen idle Owner weckt — und fügt Teardown als `reported`-Setzer hinzu. Jene Note behält jede andere Task-Runtime-Entscheidung und wird in-place aktualisiert statt ersetzt.

Die Delivery-Maschinerie war nie das Hindernis. `Agent.send(message, target, wakeup)` deckt die `target` × `wakeup`-Matrix seit der [Unified-Send-Entscheidung](../../archived/architecture/2026-07-22-unified-send-and-coalesced-user-messages.md) ab, und `wakeDriver()` behandelt bereits idle, maintenance und cancelled-converging Phasen. Das fehlende Stück war die Policy-Wahl, welche Spur eine Vollendung nimmt, plus die Grenze, die diese Wahl braucht.

## Entscheidung

Eine ungemeldete Vollendung wählt ihre Spur danach, was der Owner gerade tut. Ein beschäftigter Owner wird injiziert, unverändert. Ein idle Owner wird mit `followup()` geweckt.

Das übernimmt die Delivery-Regel, die der [Continuation-Manager](2026-08-06-manager-owned-subagent-settlement-delivery.de.md) bereits für die Subagent-Abrechnung ausliefert, wo „steering rather than injecting is deliberate … This is a correctness rule, not a deployment preference" gilt. Die beiden Pfade überschneiden sich nicht: `tool-subagent` registriert einen Task nur für ein One-Shot-Hintergrund-Child und gibt `continuable` zurück, bevor er diesen Code erreicht, sodass ein Child von genau einem der beiden Mechanismen zugestellt wird.

### Der beschäftigte Owner behält Injection

Für einen Driver, der wirklich läuft, sind `steer()` und `inject()` dieselbe Zustellung: `wakeDriver()` kehrt früh zurück, ohne für eine laufende, unabgebrochene Phase zu latchen. Sie unterscheiden sich nur für einen Owner, dessen Turn gecancelt ist, aber noch nicht konvergiert — dort lenkt Steering auf den nächsten Turn um und replayt den Wake bei der Konvergenz.

Injection ist dort korrekt. Ein gecancelter Turn ist ein User, der Stop drückt, und einen in seinem Namen wieder zu öffnen wäscht einen Interrupt in einen Model-Request, den er nicht angefordert hat. Der Turn-Loop deckt den gewöhnlichen Fall bereits ab: Er kann nicht schließen, solange die Next-Step-Inbox etwas enthält, sodass eine vor dieser Prüfung eintreffende Notice den laufenden Turn verlängert, und mehrere gemeinsam abrechnende Tasks einen Schritt statt je einen Turn kosten.

### Waking ist begrenzt, und die Grenze ist nicht Zeit

`maxConsecutiveWakes` (Default 3) begrenzt die Turns, die ein Owner auf diese Weise öffnen darf; darüber hinaus degradiert eine Notice zu Injection und wartet auf den nächsten Turn. Das Claimen einer beliebigen User-verfassten Nachricht stellt das Budget wieder her — Claimen, nicht Eintreffen, weil das der Punkt ist, an dem menschlicher Input tatsächlich in einen Schritt eintritt. Notices, die dieses Plugin einreihte, füllen es nie wieder auf.

Die Grenze existiert, weil diese Kette sich selbst erregt, wie es die Subagent-Abrechnung nicht tut. Abrechnung ist begrenzt durch die Zahl der Children, die das Modell gespawnt hat; ein geweckter Turn kann den Hintergrund-Job starten, dessen Vollendung ihn erneut weckt, ohne dass jemand zuschaut. `dsh run` braucht keine separate Policy: Seine eine User-Nachricht wird im ersten Turn geclaimt und wiederholt sich nie, sodass das Budget monoton verbraucht wird und der Prozess terminiert.

`completionDelivery: quiet` stellt die alte Spur für idle Owner wieder her. Es existiert für deterministische Transcripts; die Job-Vollendung behält unabhängig `quiet | wakeup`, weil ihre begrenzte Owner-Turn-Policy sich von Next-Step-Subagent-Reports unterscheidet.

### Teardown claimt den Report

`cancelForTeardown` markiert den Record jetzt als `reported`, genau wie `kill()` es nach dem Canceln tut. Die Asymmetrie war unsichtbar, solange die Notice ein harmloser Inject war; ein weckender Reporter macht sie zu einem Model-Request pro Teardown-Ebene, auf Agents, die der Host zerstört.

`reported` war bereits das richtige Bit — „ein Kill, Read oder Wait hat den Terminal-Zustand gemeldet oder sich zum Melden verpflichtet" — und Teardown ist ein Kill ohne Caller. Seine Verwendung hält jeden Observer der Abrechnung intakt: `onJobDone` feuert weiterhin, sodass Runtime-Invariants und der Force-Fail-Pfad abgedeckt bleiben, und nur Notice-Reporter verstummen.

### Die Vollendung wird zuletzt angekündigt

`settle()` gab Waiter frei, markierte den Record als abgerechnet und veröffentlichte die Visible-Set-Änderung *nach* dem Lauf der Completion-Listener. Ein Reporter, der einen Turn öffnet, tut das synchron, sodass diese Reihenfolge den `turn/start` eines geweckten Turns vor den Commit der Abrechnung landen ließ, auf die er reagierte, und bevor irgendein `onJobsChanged`-Observer sie gesehen hatte. Die Vollendung zuletzt anzukündigen macht den Reporter zum letzten Observer einer Abrechnung, die jeder andere Observer bereits gesehen hat.

## Erwogene Alternativen

**Ein Producer-deklariertes Wake-Bit auf `JobStart`,** passend zu Codex' `trigger_turn` und Kimis `admission`-Enum. Es ist die bessere langfristige Form — ein `tail -f`-Stream und ein Zweistunden-Build wollen unterschiedliche Antworten —, aber kein aktueller Producer unterscheidet sie, und das Repository verlangt einen aktuellen Owner und Bedarf für öffentliche Oberfläche. Der natürliche Auslöser, es hinzuzufügen, ist der erste Producer, der einen Task wecken und einen anderen nicht wecken will.

**Eine generelle Unsolicited-Input-Queue** mit Prioritätsspuren, wie Claude Code sie verwendet, um Hintergrund-Jobs, Cron, MCP-Push und Hooks in einen Drain zu mergen. DSHs Inbox ist bereits diese Queue — durable `agent/inbox/spliced`-Splices über `next-turn`/`next-step` —, sodass dies eine Schicht über einer bestehenden hinzufügen würde, um ein einzelnes Bit zu entscheiden.

**Das Wiedereröffnen eines Turns zu verweigern, der bereits eine sichtbare Antwort erzeugt hat,** Codex' `MailboxDeliveryPhase`-Latch. Dieser Latch ist der Default, den diese Entscheidung bewusst invertiert: Nach dem Sprechen des Modells zu wecken ist der ganze Sinn, und das Wake-Budget trägt stattdessen die Grenze.

**Ein Wall-Clock-Fenster** oben auf dem Zähler. Für einen interaktiven Agent ist der langsame Fall der gewünschte — ein einstündiger Build, der vollendet, und der Agent fährt fort, ist das Feature — und `dsh run` ist bereits durch den Zähler begrenzt, den es nicht wieder auffüllen kann. Eine Überprüfung lohnt erst, wenn ein unbeaufsichtigtes langlebiges Deployment auftaucht.

**`onJobDone` während des Owner-Drains vollständig zu unterdrücken,** symmetrisch zum service-weiten `listenersClosed`. Es liest sich sauberer, entfernt aber ein Signal, das nicht nur für Notices ist: Der Force-Fail-Record und die Runtime-Invariant beobachten beide Teardown-Abrechnungen. Das `reported`-Bit verweigert genau die Reporter und nichts sonst.

## Konsequenzen

- Das Default-Verhalten ändert sich: Ein idle Owner gibt jetzt einen Model-Request pro Vollendung aus, gedeckelt auf `maxConsecutiveWakes` pro Owner zwischen User-Nachrichten. Deployments, die das alte Verhalten wollen, setzen `completionDelivery: quiet`.
- Der `tool-jobs`-Prompt-Abschnitt braucht keine Änderung; „Du wirst in der Session benachrichtigt, wenn ein Task fertig wird" wurde wahr statt aspirational.
- `JobSnapshot.reported` gewinnt Teardown als vierten Setzer, dokumentiert an der Service Definition und in der [Subsystem-Referenz](../../../../docs/subsystems/jobs.de.md).
- `settle()` kündigt die Vollendung nach dem Commit des Records und dem Veröffentlichen der Visible-Set-Änderung an. Jeder Listener, der sich darauf verließ, vor der Waiter-Freigabe oder vor `onJobsChanged` zu laufen, läuft jetzt nach beiden.
- Der `tool-bash`-Real-Composition-Test ließ seine zweite User-Nachricht fallen: Die Abrechnung allein trägt die Notice in einen Turn, der den Output einsammelt. Er behauptet das durable Outcome statt einer Turn-Grenze, weil ob das Kommando seinen Turn überlebt eine Race ist; die Spurwahl ist stattdessen in `tool-jobs`-Unit-Tests gepinnt.
- Unit-Coverage pinnt idle Wake, busy Injection, quiet Delivery, Budget-Erschöpfung, Budget-Restore bei User-Input, Nicht-Restore bei Plugin-Notices und Teardown-Stille.

### Akzeptierte Risiken

Ein verbrauchtes Budget wird nur durch User-Input wiederhergestellt. Ein unbeaufsichtigter Agent, der es erschöpft, sammelt seine restlichen Notices ein, wann immer etwas anderes einen Turn öffnet, und nichts rüstet ihn zwischendurch wieder scharf.

Eine Notice, die bei einem idle Owner unter `quiet` ansteht, stirbt weiterhin mit dem Disposal dieses Owners, unverändert: Das Disposal-Cancel räumt die ungeclaimte Inbox und das Log behält das Insert-/Cancel-Paar als Record. Die [Settlement-Delivery-Note](2026-08-06-manager-owned-subagent-settlement-delivery.de.md) besitzt die Offline-Mailbox-Diskussion, die das bräuchte.

Ob eine Vollendung den laufenden Turn verlängert oder einen neuen öffnet, ist eine echte Race für kurzlebige Tasks, sodass kein authored Transcript beide Reihenfolgen halten kann. Assembled-Coverage behauptet das Outcome; die Spurwahl ist in Unit-Tests gepinnt.

Ein Microtask-Fenster überlebt: Eine Abrechnung, die nach der letzten Inbox-Prüfung des Turn-Loops, aber bevor der Driver seine idle Phase committet landet, liest noch `status === 'running'`, injiziert also, und nichts weckt. Steering würde es ebenfalls nicht schließen — `wakeDriver()` latchet nur für Maintenance- und Post-Cancel-Phasen, nicht für einen Driver zwischen seiner letzten Prüfung und seinem eigenen Ruhestand. Es zu schließen braucht eine `agent-loop`-Grenze, die den Ruhestand vor dem letzten Claim veröffentlicht — eine Core-Agent-Entscheidung statt einer Delivery-Policy-Entscheidung.
