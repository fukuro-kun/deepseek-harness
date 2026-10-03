# Agent Note: Durable Agent Teams über continuable children

Status: implemented

[English](2026-08-05-agent-teams.md) | [中文](2026-08-05-agent-teams.zh.md) | Deutsch

## Problem

Der subagent seam stellt fresh/fork Provider, durable child Sessions, FIFO follow-ups und kalt fortsetzbare Activations bereit. Seine Direct-Parent-Controls bieten weder Peer-Kommunikation noch ein stabiles benanntes Roster oder gemeinsames Task-Ownership. Ein Coordinator kann mehrere Worker erzeugen, aber Worker können einander nicht adressieren; durable follow-up-Absicht lebt nur in den Inboxes der Targets, und kein gemeinsames Compare-and-Set-Board verhindert veraltete Assignment-Updates.

Alle Agenten im selben Prozess teilen sich außerdem einen Checkout. Filesystem-Edit-Tools können eine beobachtete veraltete Version ablehnen, aber Bash, Formatter, Generatoren und externe Writer umgehen diese Barriere. Einen Teammate-Namen oder Task-Owner als Dateisperre zu behandeln, würde diese Nebenläufigkeitsgrenze eher verdecken als lösen.

Agent Teams braucht eine explizite Opt-in-Komposition, solange seine öffentlichen Contracts experimentell sind. Der Standard-Toolkatalog und das Simple-Task-Verhalten müssen unverändert bleiben, während ein explizit angefordertes Team die Settlement der child Activations und die Mailbox-Zustellungs-Races überdauern muss — lange genug, damit der Lead das Ergebnis vor dem Prozess-Teardown aggregieren kann.

## Entscheidung

Jede gewöhnliche Runtime-Root ist der implizite Lead eines Teams, das durch die `SessionId` dieser Root identifiziert wird. Das Team hat kein Creation-Event: Seine Lead-Pseudo-Zeile existiert allein durch Identität, während durabler Zustand mit dem ersten member-, message- oder task-Event beginnt. Ein Roster ist flach und enthält höchstens die konfigurierte Anzahl unveränderlicher lowercase-kebab-case-Namen. Jeder Teammate ist ein continuable direct child mit reservierter Session-id; nur der Lead erzeugt oder unterbricht Teammates. Gewöhnliche provider-verwaltete Subagents außerhalb des Rosters sind keine Team-Members, und ein gewöhnlicher fork ist eine neue Root, deren geerbte Team-Datensätze über ihren ancestor `TeamId` ausgeschlossen werden.

Die Implementierung ist aufgeteilt in `@deepseek-ai/dsh-experimental-agent-team`, das `ctx.agentTeams` und die durable Semantik besitzt, und `@deepseek-ai/dsh-experimental-tool-agent-team`, das scoped schemas und Modell-Anleitung besitzt. Jedes Team-Tool deklariert sein vollständiges Ergebnis-schema und rendert diesen Wert als kompaktes JSON, sodass der Compiler jedes `execute` gegen das prüft, was dem Modell versprochen wurde, und kein Ergebnis Token für Einrückung ausgibt. Deployments mounten beide Plugins explizit und können ältere continuable Controls mit denselben modellsichtbaren Namen deaktivieren. Die explizite Delegation-Policy erlaubt Team-Erzeugung nur, wenn der Nutzer nach Agent Teams oder Teammates fragt. Beide Pakete sind öffentliche Mitglieder von `packages/experimental/`; die [Experimental-Package-Entscheidung](../architecture/2026-08-18-experimental-agent-teams-packages.de.md) besitzt Veröffentlichung, Dependency-Isolierung und Promotion.

Der Lead muss erforderliche Arbeit abwarten, bevor er seine finale Antwort gibt. Der Prozess-Teardown bleibt der finale Lifecycle-Owner und entleert continuation Activations; ein Team-Task-Owner ist durabler Zustand und wird durch Idle, Interruption oder Prozessende nicht automatisch freigegeben.

## Provisioning und Recovery

Die Erzeugung hängt zuerst einen `team/member`-Provisioning-Snapshot in der Lead-Session an und flusht ihn, dann startet sie das reservierte continuable child über den gewählten fresh- oder fork-Provider. Ein Fehler vor der initialen Inbox-Annahme hängt einen failed-Snapshot an. Bei Erfolg wird das akzeptierte Inbox-Item des child geflusht, bevor active angehängt wird. Die Recovery erkennt die initiale Nachricht, solange sie noch pending ist oder nachdem sie in die User-Message-History eingetreten ist. Namen werden durch den ersten Provisioning-Datensatz reserviert und nie wiederverwendet, auch nicht nach einem Fehlschlag. Disposal schließt die Admission, bricht zugelassene Erzeugungs- und Mailbox-Dispatch-Transaktionen ab und wartet sie ab, dann stoppt es jedes vom Roster erfasste live child; ein failed child bleibt bis zum Exit seiner Activation cleanup-owned, und eine Cleanup-Ablehnung lässt das Disposal fehlschlagen.

Eine Root-Recovery gleicht einen nicht terminierten Provisioning-Datensatz mit der unabhängig persistierten Session des child ab. Übereinstimmende direct-parent- und continuable-Deskriptoren plus eine aufgezeichnete initiale User-Message belegen erfolgreiche Admission und ergeben active; Fehlen, Korruption, nicht passender Provider/lineage oder eine fehlende admitted Nachricht ergeben failed. Der Erzeuger liest die terminale Phase unter demselben Lead-Log-Serializer erneut; hat die Recovery failed markiert, während die Erzeugung erfolgreich war, entleert er das child und meldet einen Provisioning-Konflikt, statt ein Orphan zu behalten. Das vermeidet die Rekonstruktion eines initialen Prompts, der nie im Team-Log gehalten wurde, und begrenzt Plugin-Reload-Races.

Fresh children haben keine geerbte Konversation. Fork children erfassen das Completed-Turn-Präfix des Leads einmalig und behalten es als eigenes durables Seed. Der aktuelle Delegation-Turn bleibt ausgeschlossen, entsprechend dem bestehenden Fork-Provider-Contract.

## Mailbox- und Task-Transaktionen

Peer-Kommunikation ist eine Lead-Log-Mailbox. `team/message/queued` wird vor der Zustellung angehängt und geflusht. Die Zielnachricht trägt die stabile message id und die Sender-Identität sowohl in durablen source-Metadaten als auch in einem kurzen modellsichtbaren Präfix. Ein Zielempfang wird erst mit `team/message/delivered` quittiert, nachdem sein pending Inbox-Item oder seine aufgezeichnete User-Message geflusht wurde. Sofortige Admission wird pro Target in Reihenfolge des Queued-Logs serialisiert; die Recovery wiederholt queued-minus-delivered in derselben Reihenfolge, und die Zustellung faltet live oder persistierten Inbox-/History-Zustand des Targets vor dem Cold-Resume. Jedes Team-Payload der aktuellen Version wird zur Laufzeit validiert, bevor es in den Replay-Zustand eintritt. Die Team-Runtime verfolgt Dispatch- und asynchrone Acknowledgement-Arbeit von der synchronen Admission bis zum Settlement; Disposal schließt die Admission und wartet beide ab, bevor der Service entfernt wird. Aktuelle Waiter werden erst geweckt, nachdem der Flush des zugehörigen Team-Events erfolgreich war.

`send_message` versucht stets die Steer-Zustellung. Ein laufendes Target empfängt die Nachricht an der nächsten Step-Grenze, ein idle Target startet einen Turn, und ein inaktiver Teammate wird kalt fortgesetzt. Erfolg bedeutet, dass die Nachricht bereits durabel ist, selbst wenn ein temporärer Zustellungsfehler sie queued belässt. Der Mechanismus bietet prozesslokale Wiederholung und Target-Session-Deduplizierung, keine prozessübergreifende Exactly-once-Zusage. Die [Team-Steer-Messaging-Entscheidung](../../archived/simplification/2026-08-30-team-send-message-steer.md) besitzt die Begründung für die Single-Tool-Planung.

Geteilte Tasks sind vollständige Snapshots mit Team-lokalen Ids und monotonen Revisionen. Jede Mutation trägt `expectedRevision`. Jedes Member kann einen bereiten, unbelegten Task erzeugen, lesen oder claimen; der Owner oder der Lead bearbeitet und überführt ihn, während nur der Lead ihn einem anderen Member zuweist. Numerische Task-Ids bleiben im Safe-Integer-Allokationsbereich; Erschöpfung schlägt fehl, ohne eine Id wiederzuverwenden. Abhängigkeiten müssen nicht gelöschte Tasks benennen und einen vollständigen DAG bilden. Gelöschte Tasks bleiben als Tombstones erhalten. `writeScopes` sind normalisierte Pfadpräfixe, die Überlappungsdiagnosen erzeugen, aber niemals ein Claim blockieren oder einen Schreibzugriff autorisieren.

`wait_agent` blockiert auf eine Roster-, Mailbox-, Task- oder Live-Status-Kante, die nach Aufrufbeginn registriert wird, statt Modell-Polling zu begünstigen. Es spielt keine frühere Kante nach, sodass Aufrufer nach Wakeup oder Timeout den autoritativen Zustand erneut lesen. Die Lead-only-Interruption bricht den aktuellen Turn unter Erhalt der Inbox ab und verändert weder Mailbox- noch Task-Ownership.

## Shared-Checkout-Grenze

Alle Members verwenden dasselbe cwd und beobachten Schreibvorgänge sofort. Die Policy weist Members an, Tasks zu partitionieren, advisory write scopes aufzuzeichnen, abhängige Arbeit zu ordnen, und den Lead den finalen Diff prüfen und Tests ausführen zu lassen. Eine Filesystem-Stale-Version-Ablehnung erfordert ein erneutes Lesen und Rebasen der beabsichtigten Änderung. Für Bash, Formatter, Codegenerierung oder direkte externe Schreibzugriffe wird keine gleichwertige Garantie behauptet.

Worktree-Isolierung ist kein Harness-Runtime-Verhalten. Ein Deployment oder Prompt kann separate Worktrees einrichten, aber die Team-Domain leitet weder Branches ab, noch mergt sie Änderungen oder ändert stillschweigend das cwd. So bleiben die bestehenden same-world-Subagent- und Sandbox-Contracts erhalten.

## Erwogene Alternativen

**Direct-child-Subagent-Tools um Peer-Ids erweitern.** Abgelehnt, weil parent/child-Autorität und Team-Peer-Mitgliedschaft unterschiedliche Domains sind. Peer-Zugriff in den Continuation seam aufzunehmen würde die Exact-Parent-Autorisierung schwächen und ließe Roster und Tasks weiterhin ohne Persistence-Owner.

**Mail vor dem Lead-Log-Enqueue in jeder Target-Session speichern.** Abgelehnt, weil Target-Materialisierung und -Annahme fehlschlagen können, nachdem das Team das Senden committet hat. Die stets live Lead-Session ist der Transaktionsort; die Target-Aufzeichnung ist die Acknowledgement- und Deduplizierungsgrenze.

**Task-Ownership oder write scopes als Locks behandeln.** Abgelehnt, weil externe Writer sie umgehen, abgestürzte Owner durabel bleiben und Pfadpräfix-Überlappung keine semantische Unabhängigkeit beweisen kann. Falsches Mutual Exclusion ist gefährlicher als eine explizite Warnung.

**Isolierte Worktrees automatisch erzeugen.** Abgelehnt, weil Worktree-Erzeugung, Branch-Benennung, Merge-Policy, ignorierte Dateien, Build-Artefakte und Cleanup Deployment-Entscheidungen sind. Es würde außerdem das same-world-Verhalten ändern, das bestehende Subagents und Sandboxes exponieren.

**Teams im Standardkatalog aktivieren.** Abgelehnt, weil scoped Team-Controls gleichnamige ältere Globals überschatten würden und unaufgeforderte Delegation einfachen Tasks Latenz und Token-Kosten hinzufügen würde. Ein Opt-in-Profile-Bundle fügt Team ein und deaktiviert die älteren Controls, ohne den ausgelieferten Dependency-Graphen Team-Pakete hinzuzufügen.

**Ein In-Memory-Board und -Mailbox verwenden.** Abgelehnt, weil Child-Settlement, HMR und Prozessunterbrechung akzeptierten Koordinationszustand verlieren und Wiederholungen mehrdeutig machen würden.

**Team-Tool-Ergebnisse als untypisiertes JSON zurückgeben.** Abgelehnt, weil ein undeklarierter Ergebnistyp `execute` ohne Compilerfehler von dem Wert abdriften lässt, der dem Modell versprochen wurde, und weil er Einrückung einlädt, die bei jedem Roster, Task und jeder Quittung Token kostet. Jedes Team-Tool deklariert daher sein vollständiges Ergebnis-schema, und ein gemeinsamer Helper rendert es kompakt.

## Tests

Package-Tests decken mit pro-Datei-100%-Coverage ab: Identität, Namens- und Autoritätsprüfungen, Provider-Auswahl, Reserved-Id-Persistenzkollisionen, Child-vor-Lead-Flush-Reihenfolge, durable Provisioning-Fehler und Pending-Inbox-JSONL-Reconciliation, nebenläufige Target-lokale Reihenfolge, Pending/History-Deduplizierung, Mailbox-Limits, Post-Flush-Notification, begrenztes Disposal mit Abbruch laufender Erzeugung und Dispatch, Failed-Member-Cleanup, Task-CAS- und DAG-Validierung, Write-Scope-Warnungen, Wait-Cancellation/Timeout, Inbox-erhaltende Interruption, Ordinary-Fork-Isolierung, Legacy-Control-Shadowing, kompaktes Ergebnis-Rendering mit deklariertem Schema und Scoped-Registration-HMR. Ein schlüsselloser Produkt-Snapshot lädt das Agent-Teams-Profile-Bundle über `dsh --profile headless` und pinnt seine vollständige modellsichtbare Tool-Liste, Team-Policy und durable Workflow-Projektion für zwei Teammates, abhängige Tasks, Peer-Zustellung, Warten, Abschluss und Aggregation. Ein CLI-e2e verwendet denselben deterministischen Adapter und verifiziert normalen Prozess-Exit mit persistierten Team- und Child-Logs.

## Konsequenzen

Die Lead-Session wächst mit ganzen Task-/Member-Snapshots und Mailbox-Acknowledgements. Das bevorzugt unabhängig inspizierbare Recovery gegenüber kompakten Deltas; konfigurierte Task- und Pending-Mail-Grenzen begrenzen den aktiven Zustand, während deleted- und delivered-History append-only bleibt, bis breitere Session-Retention greift.

Ein aktives Roster-Member kann nicht-resident sein, sodass `inactive` kein Fehlschlag ist und ein Send Cold-Resume-Latenz verursachen kann. Temporäre Inspection-, Resume- oder Inbox-Admission-Fehler können eine durable queued Nachricht für die Recovery hinterlassen. Ein failed member belegt seinen Namen und Member-Slot dauerhaft, wodurch Provisioning-Fehler sichtbar bleiben, statt Identität still zu recyceln.

Koordination reduziert wahrscheinliche Checkout-Konflikte, kann aber Schreibvorgänge außerhalb der Filesystem-Compare-and-Set-Tools nicht ausschließen. Der finale Diff und die Tests bleiben die Integrationsgrenze des Leads.
