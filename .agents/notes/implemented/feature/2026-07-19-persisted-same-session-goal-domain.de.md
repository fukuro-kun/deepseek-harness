# Agent Note: Persistierte Same-Session-Goal-Domain
[English](2026-07-19-persisted-same-session-goal-domain.md) | [中文](2026-07-19-persisted-same-session-goal-domain.zh.md) | Deutsch

Status: implemented


## Problem

Ein lang laufendes Objective überlebt einen einzelnen Prompt, Turn oder Modell-Request. Dieses Objective als In-Memory-Loop-Variable zu behandeln verliert es beim Prozess-Neustart, während es allein im UI-Zustand Modellverhalten unrekonstruierbar macht. Jeden Session-Turn als Fortschritt zu behandeln belastet außerdem das Automatic-Work-Budget mit nicht zusammenhängenden menschlichen Messages.

Durable Lifecycle und die Erlaubnis zur Fortsetzung sind unterschiedliche Fakten. Eine Session kann nach Restart oder Fork ein aktives Objective behalten, aber stillschweigend Arbeit zu starten, wenn ein Nutzer diese Session öffnet, ist überraschend. Die Domain braucht replaybaren Zustand ohne persistierte Auto-Execution-Authority, und sie muss ein Plugin auf den öffentlichen Agent- und Session-Services bleiben statt ein Sonderfall im konkreten Loop.

## Entscheidung

`@deepseek-ai/dsh-goal` in `packages/goal/goal/` besitzt ein aktuelles Same-Session-Goal über `ctx.goals`. Ein Goal hat eine gebrandete Id, ein Objective, eine durable Phase, eine Compare-and-Set-Revision und `maxGoalRounds`. `defaultMaxGoalRounds` ist eine validierte Deployment-Einstellung mit Default `256`; `create()` materialisiert sie intern vor der Mutation, statt die Auflösung als weiteres Service-Verb zu exponieren.

Die durablen Phasen sind `active`, `paused`, `blocked` und `complete`. Ein Blocked-Snapshot enthält einen policy-eigenen lower-kebab-case-Code und eine normalisierte Freiform-Message, sodass Usage-Limits, Round-Caps, Execution-Fehler und Human-Input-Abhängigkeiten einen Lifecycle-Zustand teilen, ohne ihre Ursache zu verlieren. Eine separate live Activation ist `armed` oder `disarmed`. Erzeugung und explizites Resume armen die Activation; Pause, Completion, Blocking und Clear disarmen sie. Edits bewahren Activation und jeden Blocker-Grund; Resume und Completion löschen diesen Grund. Activation ist niemals Teil des persistierten Snapshots.

### Durable Aufzeichnung und Replay

Jede Mutation hängt ein versioniertes `goal/change`-Session-Event an, das einen vollständigen Snapshot oder, für Clear, einen revisionierten Tombstone enthält. Das Session-Log ist die einzige durable Source of Truth, sodass Persistenz und Fork Goal-Datensätze ohne weitere Datenbank oder Header-Feld erben. Die [Goal-owned-Durable-Events-Entscheidung](../architecture/2026-07-31-goal-owned-durable-events.de.md) besitzt die Trennung von Inbox-Zustand und Modell-Kontext.

Der Replay-Fold leitet Lifecycle-Mutationen nur aus `goal/change` ab und validiert JSON-Form, frische Ids, Revisionskontinuität, Lifecycle-Übergänge, Zähler und monotone Per-Goal-Timestamps. Goal Rounds schreiten nur aus positiven sequenziellen zugelassenen `user/message`-Source-Nummern für die aktuelle aktive Revision voran und können `maxGoalRounds` nicht überschreiten; gewöhnliche Session-Turns beeinflussen den Zähler nicht. Ein malformed Datensatz im aktuellen Format lässt das Replay fehlschlagen, statt ignoriert oder repariert zu werden.

Inkrementelles Replay schiebt seinen Cursor nach jedem gültigen Event vor und bleibt am ersten korrupten Event positioniert, sodass spätere Reads denselben durablen Fehler melden. Das durable Log bleibt nach einem Restart autoritativ.

### Lifecycle und live Activation

Höchstens ein Goal ist aktuell. Create erfordert kein aktuelles nicht-abgeschlossenes Goal und erzeugt immer eine Revision-eins-Id, die in der Session nicht früher verwendet wurde; ein abgeschlossenes Goal darf ersetzt werden. Jede andere Mutation trägt das erwartete `GoalRef`, und veraltete Ids oder Revisionen werden abgelehnt. Resume akzeptiert eine paused- oder blocked-Phase oder ein disarmed aktives Goal nur dann, wenn das Round-Cap noch Kapazität hat. Die Domain validiert die Form des Blocker-Grunds, überlässt Reason-Codes und die Blockierungsentscheidung aber bewusst Policy-Consumern.

Ein aus beliebigem Seed gebauter Cache startet disarmed, und jede `agent/session-start`-Kante disarmt ihn erneut. `GoalService.disarm(agent)` erlaubt einem Lifecycle-Owner außerdem, prozesslokale Authority zu entfernen, ohne Session-Event, Revisionsänderung oder `goal/changed`-Notification. Resume, Fork und Continuation-Driver-Ersatz bewahren daher das durable Objective und die History, initiieren aber niemals selbst Arbeit. Ein späterer menschlicher Prompt kann vom Modell interpretiert werden, dessen Policy-API explizit Resume aufrufen und das Goal armen darf.

### Service-Grenze

Der Service akzeptiert nur das exakt live `Agent`-Objekt, das unter seiner Id registriert ist. Eine committete Mutation emittiert das gescopte `goal/changed`-Event mit isolierten Listener-Fehlern. Policy-Consumer verwenden diesen Service plus das öffentliche `Agent`-Interface und `agent/*`-Events; die Goal-Domain importiert oder modifiziert `dsh-agent-loop` nicht.

## Tests

Die Unit-Coverage pinnt Erzeugungs-Defaults, Exact-Live-Agent-Prüfungen, Compare-and-Set-Ablehnung, jeden Lifecycle-Übergang, Blocker-Reason-Validierung und -Erhalt, Cap-Durchsetzung bei Resume, Clear/Replacement, Seeded-Replay- und `SessionStore.fork()`-Vererbung, Session-Start- und Lifecycle-Owner-Disarming, Active-Goal-Rearming, Durable-Event-Folding, Inbox-Unabhängigkeit, stabiles Corrupt-Event-Replay, Service-/Listener-Disposal, Listener-Isolation, Backward-Clock-Clamping, striktes Record-Decoding, Lifecycle-Kontinuität und sequenzielle Round-Attribution. Ein schlüsselloser Loader/stdio-Prozess-Test mountet den Service und einen Lifecycle-Consumer über ein Test-only-`cordis.yml` und liest dann das persistierte JSONL extern, um den Goal-Datensatz und das Fehlen einer unangeforderten Goal Round zu verifizieren. Der Paketquellcode unterliegt dem Per-File-100%-Coverage-Gate des Repositorys.

## Erwogene Alternativen

- **Goals in einer separaten Datenbank oder einem Session-Header speichern** — abgelehnt, weil das Session-Log bereits Ordnung, Persistenz, Fork-Präfixe und Rekonstruierbarkeit liefert; ein zweiter Store führt Atomaritäts- und Lineage-Fragen ein.
- **Jede durable Mutation an queued Modell-Kontext koppeln** — von der späteren [Goal-owned-Durable-Events-Entscheidung](../architecture/2026-07-31-goal-owned-durable-events.de.md) abgelehnt: Goal-Tools und geplante Continuation-Prompts exponieren Zustand bei Bedarf, während Domain-Persistenz unabhängig von Queue-Ergebnissen bleibt.
- **Activation persistieren und automatisch neu starten** — abgelehnt, weil das Öffnen oder Fortsetzen einer Session auf menschliche Eingabe warten muss; die durable Phase zeichnet Status auf, nicht frische Authority, Ressourcen auszugeben.
- **Alle Session-Turns als Goal Rounds zählen** — abgelehnt, weil eine Session menschliche Klärung, Inspektion und unzusammenhängende Arbeit enthalten kann; nur goal-attribuierte Continuation-Turns verbrauchen dieses Budget.
- **Goal-Zustand oder eine generische Loop-Abstraktion zu `dsh-agent-loop` hinzufügen** — abgelehnt, weil Zustand und Continuation-Policy über bestehende Plugins, `Agent`-Verben und Events komponiert werden können, ohne die ausgelieferte Loop-Implementierung zu bevorzugen.

## Konsequenzen

- Goal-History überlebt Persistenz, Resume, Compaction nicht zusammenhängender Knoten und Session-Fork als gewöhnliche Session-Daten.
- Resume und Fork exponieren dieselbe durable Phase, bleiben aber operativ inert, bis eine explizite Resume-Mutation die Activation armt.
- Vollständige Snapshots vereinfachen Inspektion, striktes Replay und Last-Wins-Projektion, ohne der Modell-History rein mutationale Messages hinzuzufügen.
- Revisions- und Lifecycle-Validierung lehnen manipulierte, teilweise geschriebene oder produzenteninkonsistente Goal-Datensätze früh ab.
- Round-Caps begrenzen nur die Fortsetzungsanzahl; Policy-Consumer bilden Round-, Token-, Währungs-, Zeit- und Provider-Limits auf Blocker-Gründe ab, wenn sie Arbeit stoppen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

- Diese Domain zeichnet Zustand auf, plant aber keine Goal Rounds, bricht keine aktiven Turns ab und klassifiziert keine abnormalen Stopps.
- Der Akteur, der `complete` oder `blocked` aufzeichnet, ist autoritativ; ein unabhängiger Evaluator oder ein Abschlusszertifikat ist auf einen Policy-Consumer zurückgestellt.
- Es gibt ein aktuelles Goal pro Session; parallele Objective-Graphen und Session-übergreifende Goal-Speicherung fehlen.
- Plugins teilen eine vertrauenswürdige Prozessgrenze. Direkte Session-Writer können Goal-Datensätze fälschen; striktes Replay erkennt Inkonsistenz und lässt Goal-Zugriff am verletzenden Datensatz fehlschlagen, isoliert aber keine Plugins und repariert das Log nicht.
- `GOAL_CHANGE_VERSION` hat kein Vorab-Kompatibilitätsversprechen und keinen Migrationspfad.
