---
description: "Ein kleines Team benannter Agents in einer Session ausführen: dauerhafte Nachrichten zwischen Mitgliedern und ein gemeinsames Task Board, für Deployments, die die experimentellen Team-Plugins zusammenstellen."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-agent-team

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-experimental-agent-team` verwandelt eine Coding-Session in ein kleines Arbeitsteam: Der Agent der Session wird zum Lead, erstellt benannte Teammates für delegierte Arbeit, tauscht dauerhafte Nachrichten mit ihnen aus und verfolgt gemeinsame Tasks auf einem gemeinsamen Board. Nachrichten und Task-Zustand überstehen Abstürze, Reloads und Unterbrechungen, sodass ein Teammate, das offline war, seine wartenden Nachrichten beim Fortsetzen erhält. Es stellt keine eigenen Tools bereit — mounten Sie das Geschwisterpaket `dsh-experimental-tool-agent-team`, damit das Modell Teammates erstellen, ihnen Nachrichten senden und das Task Board nutzen kann. Es wird unter seinem experimentellen Namen veröffentlicht, gibt kein Stabilitätsversprechen und benötigt dauerhaften Session-Speicher zur Aktivierung.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Fügen Sie dieses Paket einer Komposition hinzu, wenn ein Agent ein kleines Team benannter Helfer in seinem eigenen Arbeitsverzeichnis betreiben soll, mit Nachrichten und Task-Zustand, die Abstürze und Neustarts überstehen. Es bringt keine eigenen Tools mit: Mounten Sie es zusammen mit `@deepseek-ai/dsh-experimental-tool-agent-team`, damit das Modell Teammates erstellen, ihnen Nachrichten senden und das Task Board nutzen kann.

### Wann es wählen

Wählen Sie es, wenn mehrere Agents auf einem gemeinsamen Workspace zusammenarbeiten müssen und ihr Roster, ihre Nachrichten und ihr Task-Zustand Abstürze und Neustarts überstehen müssen. Vermeiden Sie es, wenn Teammates eigene Arbeitsverzeichnisse benötigen, wenn mehrere Prozesse ein Team koordinieren müssen oder wenn ein Task-Owner automatisch freigegeben werden soll — nichts davon wird unterstützt. Die Team-Funktionen benötigen dauerhaften Session-Speicher zur Aktivierung.

### Kleinste funktionierende Konfiguration

<a id="smallest-working-setup"></a>

Die kleinste Ergänzung zu einer bestehenden Komposition ist dauerhafter Session-Speicher plus beide Team-Pakete:

```yaml
# smallest team setup — durable storage plus both Team packages
- name: '@deepseek-ai/dsh-session-persistence-jsonl'
- name: '@deepseek-ai/dsh-experimental-agent-team'
- name: '@deepseek-ai/dsh-experimental-tool-agent-team'
```

Mit installierten Tools erledigt das Modell den Rest auf Anfrage — etwa „erstelle ein Teammate namens reviewer, das den Diff prüft", dann „sende reviewer die Änderungszusammenfassung". Alle Limits sind optional und werden beim Start validiert:

| Feld | Standard | Bedeutung |
|---|---|---|
| `maxMembers` | `8` | Maximale Anzahl von Teammates, die ein Team je erstellen darf, einschließlich fehlgeschlagener |
| `maxTasks` | `256` | Maximale Anzahl aktiver Tasks auf dem Board |
| `maxPendingMessagesPerMember` | `64` | Maximale Anzahl wartender Nachrichten für ein Mitglied |
| `maxMessageBytes` | `65,536` | Maximale Größe einer gesendeten Nachricht |
| `disposalTimeoutMs` | `5,000` | Für die Shutdown-Bereinigung zugestandene Zeit |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-experimental-agent-team) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Teammates

Bitten Sie den Lead, ein Teammate zu erstellen: Geben Sie ihm einen eindeutigen Kleinbuchstaben-Namen wie `reviewer` und beschreiben Sie seine Aufgabe. Ein Teammate startet frisch ohne Erinnerung an die Konversation des Leads oder als Fork, der die abgeschlossenen Turns des Leads erbt; die Erstellungsanfrage entscheidet welche Variante. Teammate-Namen sind permanent — selbst ein Teammate, dessen Erstellung fehlschlug, behält seinen Namen, und kein Name wird je wiederverwendet.

Das Roster zeigt jedes Mitglied mit seiner Rolle (`lead` oder `teammate`) und seinem aktuellen Status: `running`, `idle`, `inactive` (ein Mitglied, das existiert, aber nicht geladen ist), `provisioning` oder `failed`. Ein nicht geladenes Mitglied erhält seine Nachrichten, wenn es aufwacht.

Nur der Lead kann Teammates erstellen oder unterbrechen.

### Nachrichten zwischen Teammates

Jedes Mitglied kann an jedes andere Mitglied oder an den Lead eine Nachricht senden. Ein live Mitglied erhält sie sofort; die Nachrichten eines offline Mitglieds werden eingereiht und kommen beim Fortsetzen an. Nachrichten gehen nie verloren und werden nie doppelt zugestellt.

Jede Nachricht verwendet Steer: Ein laufendes Ziel erhält sie an der nächsten Schritt-Grenze, ein idle Ziel startet einen Turn, und ein inaktives Teammate wird kalt fortgesetzt. Der Sender sieht immer das Ergebnis — von der Ziel-Inbox akzeptiert oder bei vorübergehend nicht verfügbarer Zustellung als queued zurückbehalten. Eine wartende Nachricht ist bereits sicher gespeichert und darf daher nicht erneut gesendet werden.

### Gemeinsames Task Board

Jedes Mitglied kann einen Task mit Titel, Details, optionalen Abhängigkeiten von anderen Tasks und optionalen Hinweisen zu den zu berührenden Dateien hinzufügen. Ein Task ist nur claimbar, wenn alles, wovon er abhängt, abgeschlossen ist.

Tasks haben einen Owner: Ein Mitglied claimt einen Task, um zu beginnen, schließt ihn ab, wenn es fertig ist, gibt ihn zurück oder öffnet ihn erneut; der Lead kann einen Task jedem Mitglied zuweisen. Jede Änderung ist compare-and-set: Ein Update auf Basis einer veralteten Kopie wird abgelehnt, sodass zwei Mitglieder sich nicht stillschweigend gegenseitig überschreiben können.

Dateihinweise erzeugen Warnungen, wenn zwei laufende Tasks überlappende Pfade berühren wollen — sie blockieren nie etwas. Gelöschte Tasks bleiben in der Historie, verschwinden aber aus der aktiven Liste.

### Warten und Unterbrechen

Ein Mitglied kann auf die nächste Team-Änderung warten — den Status eines Teammates, eine eingehende Nachricht oder ein Task-Update — statt wiederholt zu pollen; das Warten meldet nur, ob es abgelaufen ist, und der Aufrufer liest danach den aktuellen Zustand erneut.

Der Lead kann den aktuellen Turn eines Teammates stoppen, ohne dessen wartende Nachrichten zu löschen; die Task-Eigentümerschaft bleibt unverändert.

### Wie Erfolg und Misserfolg aussehen

Erfolg sieht aus wie ein Teammate, das im Roster erscheint, eine Nachricht, die `accepted` oder `queued` meldet, und Task-Revisionen, die mit jeder Änderung voranschreiten. Wahrscheinliche Fehler werden als konkrete Fehler gemeldet, statt Zustand still zu korrumpieren: Senden an einen Namen, der kein Mitglied ist, Claimen eines Tasks, der nicht bereit ist, Bearbeiten mit einer veralteten Revision oder Erstellen eines Teammates jenseits des Mitglieds-Limits.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Design-Entscheidungen hinter dem Service und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig behandelt.

### Design-Philosophie

Der Service beruht auf einer Trennung und drei Zusagen:

- **Dauerhaftes Log, abgeleiteter Zustand.** Das Lead-Session-Log ist die einzige Quelle der Wahrheit; Roster-, Mailbox- und Task-Zustand werden bei jedem Lesen daraus replayed.
- **Prozess-lokale Eigentümerschaft.** Die gesamte Koordination lebt in einem Prozess; die Garantie ist Retry plus Deduplizierung, niemals prozessübergreifender Konsens.
- **Explizite Autorität.** Jede Service-Methode nimmt den exakten live aufrufenden `Agent` entgegen; nur der Lead spawnt, weist neu zu oder unterbricht.
- **Grenzen, die laut fehlschlagen.** Jedes Limit ist ein validierter Deployment-Wert, und Erschöpfung meldet einen typisierten Fehler, statt eine ID oder einen Namen wiederzuverwenden.

Die [Agent Teams Agent Note](../../../.agents/notes/implemented/feature/2026-08-05-agent-teams.de.md) trägt die Identitäts-, Mailbox-, Task- und Shared-Checkout-Entscheidungen.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Config`-Schema, Service-Registrierung, Recovery-Scheduling |
| [`src/roster.ts`](src/roster.ts) | Team-Identität, Mitgliedschaftsauflösung, Provisioning und Roster-Teardown |
| [`src/mailbox.ts`](src/mailbox.ts) | Dauerhafte Queue, ziel-lokale Zustellung, Bestätigung und Recovery |
| [`src/task-board.ts`](src/task-board.ts) | Task-CAS-Kommandos, DAG-Validierung und abgeleitete Views |
| [`src/journal.ts`](src/journal.ts) | Serialisierte Lead-Log-Transaktionen und Commit-Benachrichtigung |
| [`src/projection.ts`](src/projection.ts) | Strikte Replay-Projektion, die Team-Events dekodiert und validiert |
| [`src/activity.ts`](src/activity.ts) | Einmal-Änderungs-Warter und Disposal-Freigabe |
| [`src/lifecycle.ts`](src/lifecycle.ts) | Gemeinsame Zulassungsgrenze und begrenzte Abrechnung |
| [`src/invariant.ts`](src/invariant.ts) | Invarianten-Begleiter, der Kandidaten-Events vor dem Append replayed |

### Team-Identität und Roster

Jede gewöhnliche Runtime-Root ist der implizite Lead eines Teams, dessen `TeamId` ihrer `SessionId` entspricht; es gibt kein Erstellungs-Event, und dauerhafter Zustand beginnt mit dem ersten Mitglieds-, Nachrichten- oder Task-Datensatz. `spawnTeammate()` hängt zuerst einen `provisioning`-Mitgliedsdatensatz an und flusht ihn, dann bittet es den konfigurierten Provider, das reservierte Child zu erstellen; ein Provider-Fehler hängt ein dauerhaftes `failed`-Mitglied an. Ein frisches Child startet ohne Lead-Historie; ein Fork-Child erfasst das Turn-Präfix abgeschlossener Turns des Leads einmalig. Recovery gleicht einen nicht terminierten Provisioning-Datensatz mit der unabhängig persistierten Session des Childs ab: Ein passender direkter Parent und ein fortsetzbarer Deskriptor plus einer aufgezeichneten initialen User-Nachricht ergeben `active`, alles andere ergibt `failed`. Gewinnt Recovery einen Race im selben Prozess, akzeptiert der Ersteller den Endzustand oder meldet `TEAM_PROVISIONING_CONFLICT` und drained das Child. Namen werden vom ersten Provisioning-Datensatz reserviert und nie wiederverwendet.

### Dauerhafte Mailbox

`sendMessage()` validiert die Peer-Mitgliedschaft, hängt `team/message/queued` an und flusht, bevor es die Zustellung versucht. Die Zielnachricht beginnt mit `Team message <id> from <name>:` und behält dieselbe ID und denselben Sender in `TeamMessageSource`. Eine Ziel-Quittung wird erst mit `team/message/delivered` bestätigt, nachdem die Ziel-Session die Nachrichtenidentität dauerhaft in ihrer wartenden Inbox oder aufgezeichneten Historie hält. Sofortige Zulassungen werden pro Ziel in dauerhafter Queue-Reihenfolge serialisiert; Recovery versendet queued-minus-delivered-Datensätze in derselben Reihenfolge erneut. Die Zustellung faltet vor dem Retry sowohl live als auch persistierten Ziel-Inbox-/Historienzustand zusammen, sodass ein Absturz zwischen Inbox-Annahme und Modell-Claim die Nachricht nicht dupliziert. Die Garantie ist prozess-lokaler Retry plus Ziel-Session-Deduplizierung, nicht prozessübergreifende Exactly-once-Zustellung.

Die Zustellung an den Lead ruft `Agent.steer()` direkt auf. Die Zustellung an Teammates nutzt den Host-only-Steer-Pfad des Continuation-Owners, der die Team-Sender-Quelle bewahrt und gleichzeitig die Lead-zu-Child-Kante autorisiert sowie inaktive Ziele kalt fortsetzt. Geschwister-Nachrichten geben sich über die öffentliche Adjacent-Agent-Messaging-Operation niemals als Lead aus.

### Gemeinsames Task Board

Tasks sind vollständig versionierte Snapshots; jede Mutation trägt `expectedRevision`, und ein veralteter Aufrufer erhält `TEAM_TASK_STALE_REVISION`, statt einen neueren Wert zu überschreiben. Numerische `task-<n>`-IDs erfordern ein Safe-Integer-Suffix, und Erschöpfung des ID-Raums meldet `TEAM_TASK_LIMIT`, statt die letzte ID wiederzuverwenden. Gelöschte Tasks bleiben Tombstones für Replay und ID-Stabilität, verbrauchen aber kein `maxTasks` und erscheinen nicht in `listTasks()`. `writeScopes` sind normalisierte workspace-relative Präfixe; Views warnen bei Überlappung mit laufenden Tasks, blockieren aber nie einen Claim und autorisieren keine Schreibzugriffe.

### Warten und Unterbrechen

`waitForChange()` wartet auf eine Roster-, Task-, Mailbox- oder Live-Status-Kante, die nach der Registrierung auftritt, von zehn Sekunden bis zu einer Stunde, und meldet nur, ob es abgelaufen ist; Runtime-Disposal gibt aktuelle Wartevorgänge frei. Abbruch bewahrt einen Error-Grund oder meldet einen Nicht-Error-Grund über `TEAM_WAIT_ABORTED`. `interrupt()` ist nur für den Lead und delegiert an den Continuable-Subagent-Interrupt-Pfad, der nur den aktuellen Turn eines live Teammates mit `keepInbox` abbricht; er gibt weder Task-Eigentümerschaft frei noch löscht er dauerhafte Mail.

### Dauerhaftigkeitsmodell

Team-Events werden an die exakte live Lead-Session angehängt und geflusht, bevor die Operation Erfolg meldet oder Warter aufweckt. `team/member`, `team/task`, `team/message/queued` und `team/message/delivered` sind nur im Log: Sie treten nie in die Konversationsoberfläche ein, sodass die abgeleitete Modell-Historie von Koordinationsdatensätzen unberührt bleibt. `seq` und `time` der Session-Events bestimmen Reihenfolge und Zeitpunkt; Snapshots duplizieren sie nicht. Der `./invariant`-Begleiter replayed jedes Kandidaten-Team-Event gegen sein committetes Präfix und weist ungültige Übergänge vor dem Append zurück.

### Disposal

Disposal schließt die Zulassung, bricht zugelassene Erstellungs- und Mailbox-Dispatch-Transaktionen ab und wartet sie ab, dann bittet es den Continuation-Owner, die exakten live direkten Children des Rosters und deren Nachkommen freizugeben; nicht-Team-fortsetzbare Children des Leads bleiben unberührt. Bereinigungsfehler lassen Disposal sichtbar fehlschlagen, begrenzt durch `disposalTimeoutMs`.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paket-vertrag nicht ausreicht. Sie führen von den gemeinsamen Subsystem-Typen zur Tool-Oberfläche und den Entscheidungen hinter dem Design.

- [Agent-Teams-Subsystem](../../../docs/subsystems/agent-team.de.md) — dauerhafte Team-Typen und die `ctx.agentTeams`-Service-API.
- [tool-agent-team-Paket](../tool-agent-team/README.de.md) — die Tools, mit denen das Modell Teammates erstellen, benachrichtigen und koordinieren kann.
- [Agent Teams Agent Note](../../../.agents/notes/implemented/feature/2026-08-05-agent-teams.de.md) — Identitäts-, Mailbox-, Task- und Shared-Checkout-Entscheidungen.
- [Entscheidung zu experimentellen Paketen](../../../.agents/notes/implemented/architecture/2026-08-18-experimental-agent-teams-packages.de.md) — Platzierung, Veröffentlichung und Dependency-Isolation.

-----

<a id="model-experience"></a>

### Browser Remote

`TeamService` besitzt neben den Roster-, Mailbox-, Task- und Lifecycle-Operationen die generierten Remote-Methoden `agentTeams/view`, `agentTeams/createTask` und `agentTeams/updateTask`. Der Export `./remote` liefert den Client-Beitrag, den die Web-UI mountet, während `./client` die Request-, View- und Task-Mutations-Ergebnistypen re-exportiert, die in einer Browser-Compiler-Face sicher sind. Typert bewahrt Transportfehler in seinem äußeren `RemoteResult`; Create- und Update-Rejections bleiben explizite Domänenergebnisse innerhalb einer erfolgreichen Transport-Antwort, wobei veraltete Update-Revisionen als Task-Konflikte unterschieden werden.

## Model Experience

### Peer-Nachrichten

#### Was das Modell sieht

Jede zugestellte Peer-Nachricht ist eine User-Rollen-Nachricht. Ein kurzer erster Textblock nennt ihre stabile Nachrichten-ID und den Sender; die ursprünglichen Content-Blocks des Senders folgen unverändert. Roster-, Task- und Mailbox-Datensätze existieren nur im Log und treten nie in die abgeleitete Modell-Historie ein.

#### Token-Effekt

Jede Peer-Zustellung fügt der Zielhistorie das Sender-Präfix plus Nachrichteninhalt hinzu. Task- und Roster-Mutationen fügen keine Modell-Tokens hinzu; ihre modellseitige Darstellung gehört zu den Ergebnissen von `@deepseek-ai/dsh-experimental-tool-agent-team`.

#### KV-Cache-Effekt

Peer-Nachrichten werden nach dem wiederverwendbaren Historien-Präfix des Ziels angehängt. Kaltes Fortsetzen verwendet die persistierte Konversation wieder, bevor ein zuvor unzugestelltes Element angehängt wird.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen beschreiben, was ein Team noch nicht kann oder was besondere betriebliche Sorgfalt erfordert. Sie sind aktuelle Paket-Einschränkungen, kein Vergleich mit anderen Koordinationsmechanismen.

- **Experimenteller Prototyp ohne Stabilitätsversprechen** — das Paket ist öffentlich, aber seine Verträge können sich während der Inkubation frei ändern.
- **Ein Prozess und ein gemeinsamer Checkout** — Mitglieder teilen cwd und beobachten Änderungen sofort; dieses Paket bietet kein Worktree, keine entfernten Mitglieder, kein Merge und keine Dateisperre.
- **Write-Scopes nur hinweisend** — Bash, Formatter, Code-Generatoren und direkte externe Schreiber können Dateisystem-Versionsprüfungen umgehen; Leads müssen Eigentümerschaft koordinieren und den finalen Diff prüfen.
- **Flaches unveränderliches Roster** — nur der Lead erstellt direkte Teammates; es gibt keine verschachtelten Teams, kein Umbenennen, kein Löschen und keine Namenswiederverwendung.
- **Keine automatische Owner-Freigabe** — Idle, Unterbrechung, Prozessende und fehlgeschlagene Arbeit geben einen Task-Owner nicht frei.
- **Mailbox ist nicht prozessübergreifend exactly-once** — gleichzeitige Harness-Prozesse über einem Team werden nicht unterstützt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer und ausdrücklich nicht maßgeblich.

#### Promotion

Die Promotion in eine Produktrollen-Gruppe erfordert die Prüfung des öffentlichen Vertrags, der Einschränkungen, der Test-Evidenz, des Release-Payloads, der Laufzeit-Abhängigen und eines benannten stabilen Owners, gemäß den [Regeln des experimentellen Teilbaums](../AGENTS.md).

#### Zukünftige Richtungen

Unentschiedene Richtungen umfassen verschachtelte Teams, Richtlinien zur automatischen Owner-Freigabe, prozessübergreifende Mailbox-Transaktionen und Dateisystem-Isolation über Worktrees; nichts davon ist zugesagt.

</details>
