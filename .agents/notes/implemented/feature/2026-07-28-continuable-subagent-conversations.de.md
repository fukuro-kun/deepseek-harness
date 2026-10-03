# Agent Note: Fortsetzbare subagents

Status: implemented

[English](2026-07-28-continuable-subagent-conversations.md) | [中文](2026-07-28-continuable-subagent-conversations.zh.md) | Deutsch

Dieser Eintrag ersetzt den Task-gestützten Continuation-Manager aus [Continuable background subagents](../../archived/feature/2026-07-21-continuable-background-subagents.md). Er behält den einzelnen `ctx.subagents`-Service aus [Merge subagent control into the subagent service](../../archived/simplification/2026-07-26-merge-subagent-control-service.md) und die intentionsbenannte `followup`-Operation aus [Intent-named subagent continuation operations](../../archived/simplification/2026-07-27-intent-named-subagent-continuation-operations.md) bei.

## Problem

Der bisherige Continuation-Manager machte einen Task, eine Provider-Ausführung und eine Ergebnisgrenze zum selben Objektlebenszyklus. Die Task-Abrechnung disposed den child Agent, der Task-Abschluss injizierte die Abschlussbenachrichtigung, und spätere Eingaben rekonstruierten einen weiteren Agent. Das koppelte eine generische Hintergrundarbeits-Abstraktion an die Nachrichtenzustellung, obwohl ein fortsetzbarer subagent bereits eine Session und eine Agent inbox besitzt.

Würde man dem Manager die Reihenfolge von Continuation-Anfragen übergeben, während der Agent seine eigene inbox behält, entstünden zwei FIFOs ohne eine einzige Ordnungsautorität. Alle Nachrichten stattdessen an Jobs zu geben, würde die Zulassungs-, Abbruch- und Quiescence-Machinerie des agent loop duplizieren. `Agent.whenIdle()` kann kein Task-Ergebnis pro Anfrage wiederherstellen, weil ein laufendes Intervall mehrere eingereihte turns abarbeiten kann, und ein breites `Agent.cancel()` kann nicht exakt eine eingereihte Anfrage entfernen.

Der Laufzeit-Lebenszyklus ist zudem weiter als ein turn. Ein subagent kann seinen eigenen turn beenden, während ein von ihm erzeugter child noch läuft. Den parent zur Laufzeit in diesem Moment zu disposen, entfernt den Agent, der noch den Abbau der Nachfahren besitzt. Umgekehrt würde das dauerhafte Residenthalten jeder historischen subagent-Instanz den Speicherverbrauch unbegrenzt machen.

Parent Agents müssen spätere Arbeit an denselben lebenden child senden können, ohne dessen aktuellen turn zu ändern. Jede Continuation-Nachricht als follow-up einzureihen, bewahrt eine einzige Ordnungsregel.

## Entscheidung

Ein fortsetzbarer subagent hat eine dauerhafte Session und höchstens eine prozesslokale Activation:

```text
persisted Session
  -> optional live Activation
       -> one retained AgentHandle
       -> Agent inbox as the only turn FIFO
       -> zero or more owned child Activations
```

Eine Activation ist eine Residenz-Epoche für einen rekonstruierten child Agent. Sie kann mehrere FIFO-turns ausführen und bleibt resident, während sie auf Nachfahren wartet. Sie ist keine Request-, Result-, Cancellation- oder Task-Grenze.

Der Continuation-Manager besitzt Activation-Zulassung, Autoritätsprüfungen, den Live-Besitzgraphen, Cold Resume und das child-first Disposal. Der Agent loop besitzt die gesamte turn-Reihenfolge und -Ausführung. Kein fortsetzbarer subagent hat einen Task, eine Activation-FIFO oder einen queued Activation-Status.

### Materialisierung und öffentliche Operationen

Der benannte subagent Provider beteiligt sich nur an der Vorbereitung der initialen Erstellungsspezifikation, in der sich `spawn` und `fork` unterscheiden. Seine optionale Methode `prepareContinuable(request): Promise<ContinuableCreateSpec>` ist die Continuable-Erstellungsfähigkeit. Die zurückgegebene Spec enthält nur losgelöste, provider-spezifische Erstellungseingaben wie den optionalen parent-history-Seed; sie enthält keinen Agent, kein `AgentHandle`, keine Prompt-Zustellung, kein Ergebnis, kein Disposal und keine Resume-Operation. Der Manager reserviert die child-Identität, löst den dauerhaften Descriptor und das gemeinsame Agent-Setup auf, ruft `ctx.agents.create()` über einen privaten activation-owner-Scope auf, installiert das zurückgegebene `AgentHandle` in die Activation, errichtet eine etwaige Continuable-Parent-Ownership und ruft dann `Agent.followup(initialPrompt)` auf. Die Inbox-Annahme liefert eine `MessageId`; an dieser Grenze gibt `ctx.subagents.startContinuable()` `{ childId, messageId }` zurück, ohne auf den Start des turns oder das Eintreffen der Nachricht im Session-Log zu warten.

Jeder Fehler vor der Inbox-Annahme wird zurückgewiesen, ohne eine der beiden ids zurückzugeben. Die Agent-Erstellung stellt den Rollback vor der Handle-Übergabe bereit; nach der Übergabe hält der Manager eine für konkurrierende Zustellung und drain sichtbare Closing-Transaktion vor, disposed das erzeugte Handle, entfernt die Activation und rollt jede parent-`ownedChildren`-Mitgliedschaft zurück, bevor er ablehnt. Ein Fehler vor der Residenz-Start-Kante publiziert keine terminale Kante, während ein Fehler nach einem publizierten Start das Lebenszykluspaar über das normale Disposal schließt.

`backgroundMode: 'one-shot' | 'continuable'` bleibt Deployment-Policy. Der konfigurierte Continuable-Modus erfordert `prepareContinuable`; das Vorhandensein der Methode ersetzt `SubagentProvider.resume?()` als Capability-Prüfung, während ein fähiger Provider weiterhin one-shot-Arbeit ausführen kann.

Cold Resume wird nicht über einen subagent Provider dispatchen. Der Continuation-Manager folded den generischen prozessinternen Descriptor, ruft `ctx.agents.resume()` über denselben activation-owner-Scope auf, installiert das zurückgegebene `AgentHandle` und reicht den wartenden `next-turn` ein. `SubagentProvider.resume?()` und `SubagentProviderResumeRequest` existieren nicht. Der Descriptor behält den Namen des initialen Providers, nachdem dieser sich abmeldet; der Name verleiht keine Wiederherstellungsfähigkeit und erfordert den Provider nicht für spätere Residenz. Remote-Provider erfordern ein separates Design.

`SubagentProvider.start()` und `SubagentRun` verbleiben ausschließlich auf dem unveränderten one-shot-Pfad. Eine Continuable-Activation besitzt ihr `AgentHandle` direkt und erzeugt, wrappt oder hält niemals ein `SubagentRun`; `SubagentRun.steer?()` existiert daher nicht.

`ctx.subagents.sendMessage(sender, targetId, content, { signal })` ist die einzige modellseitig verfasste Continuation-Nachrichtenoperation. Der exakte Live-Sender autorisiert die Zustellung an seinen direkten parent oder direkten fortsetzbaren child; Cold Resume prüft die Direkt-Child-Autorität vor der Rekonstruktion, und jeder Pfad prüft erneut im finalen await-freien Inbox-Zulassungsabschnitt, sodass ein während der Materialisierung abgemeldeter oder ersetzter Agent keine Zustellung autorisieren kann. Der Service leitet die dauerhafte `agent-message`-Herkunft von diesem Sender ab. Das modellseitige `send_message`-Tool behält nur `agent_id` und `message` und verwendet festes Steer-Scheduling. Sowohl start als auch send geben die akzeptierte `MessageId` zurück, und keine der beiden meldet, wie der Manager die Activation materialisiert hat.

Für start und follow-up besitzt das Caller-Signal Lookup, Materialisierung und Zulassung nur bis zur Inbox-Annahme. Nachdem die Operation ihre `MessageId` zurückgegeben hat, besitzt der Manager die Activation unabhängig; eine spätere Caller-Cancellation bricht den akzeptierten turn nicht ab und disposed den child nicht.

### Dauerhafte Session und Live-Activation

Die Session besitzt die stabile child-Identität, den transcript, die Direkt-Parent-Herkunft, die Delegationstiefe und den versionierten Continuation-Descriptor. `SessionHeader.parentSession` zeichnet den direkten parent auf und ist eine Autorisierungseingabe; es ist keine Live-Routing-Fähigkeit und impliziert nicht, dass der aufgezeichnete parent resident ist.

Eine idle historische Session hat kein `AgentHandle`. Die erste autorisierte `next-turn`-Zustellung resumet eine Activation aus der persistierten Session und reicht die Nachricht in ihre inbox ein. Cold Resume verwendet den exakten Live-Parent-Agent zur Autorisierung und, wenn dieser parent eine Activation hat, zur Ownership; er verwendet den parent niemals zur Rekonstruktion.

Die Activation besitzt das publizierte `AgentHandle` direkt bis zu seiner Abrechnung, während der private activation-owner-Scope des Managers ihr struktureller Cordis-Owner ist. Der Continuable-Pfad erzeugt keinen ergebnis­tragenden Ausführungs-Wrapper dazwischen, einschließlich `SubagentRun`; one-shot-Delegation bleibt unverändert und außerhalb dieses Lebenszyklus. Remote-Provider liegen hier außerhalb des Scopes und benötigen bei Einführung einen separaten Activation-Ownership-Vertrag. Historische Sessions verbrauchen nach dem Disposal ihrer Activation keinen Laufzeitspeicher.

### Activation-Lebenszyklus

Der interne Residenz-Lebenszyklus hat drei Zustände und keinen separaten `queued`-Status:

```text
running
  | Agent quiescent with pending inbox or live children
  v
waiting
  | waking delivery
  +--------------------------> running

running or waiting
  | Agent quiescent, empty inbox, and no live children
  v
settled
  | AgentHandle.dispose completes
  v
no Activation
```

`running` bedeutet, dass der Agent eine aktive Zulassung oder einen turn hat. `waiting` bedeutet, dass der Agent quiescent ist, seine Inbox aber nicht leer ist oder die Activation noch mindestens eine child-Activation besitzt, deren Disposal nicht abgeschlossen ist. `settled` bedeutet, dass der Agent quiescent ist, seine Inbox leer ist und jeder owned child disposed ist; der Manager disposed dann das `AgentHandle` und entfernt die Activation.

Der Manager leitet diese Zustände aus der Agent-Quiescence, dem Pending-Status der Inbox und der Owned-Child-Menge ab, statt eine zweite Ausführungs-Zustandsmaschine zu pflegen. Ein während `running` zugestellter `next-turn` reiht sich in die Agent inbox ein. Eine während `waiting` eintreffende Wakeup-Zustellung weckt denselben Agent und versetzt die Activation zurück nach `running`. Eine Zustellung nach dem Disposal cold-resumet eine neue Activation.

Der Manager linearisiert die manager-eigene Zustellung, child-Freigabe und das Disposal für jeden dauerhaften child. Eine private `SubagentInbox` delegiert Queue und Steer an die Agent inbox und besitzt die bestehende Closing-Transaktion der Activation. Wenn die Manager-Zustellung mit dem finalen Disposal konkurriert, gewinnt genau eine Seite diese Zulassungsgrenze: Die Zustellung gelangt entweder in die noch lebende Agent inbox oder beobachtet das Closing und folgt ihrem operationsspezifischen Ablehnungs- oder Cold-Resume-Pfad. Direkte Agent-Arbeit verwendet diesen Wrapper nicht, sodass die natürliche Abrechnung kurze Maintenance-Claims nutzt, um die Idle-Phase vor dem finalen flush und der finalen Disposal-Entscheidung zu validieren, und danach unter dem child lock die Session-Sequenz, den Inbox-Pending-Status, die Wake-Generation und die Owned-Child-Menge revalidiert. Akzeptierte Arbeit, die aktiv bleibt oder Session-, Inbox- oder Ownership-Status ändert, invalidiert diesen Abrechnungsversuch, statt von ihm abgebrochen zu werden; Maintenance, die vollständig während des flush beginnt und endet, ist vor der Grenze abgeschlossen.

### Eine inbox und follow-up-Zustellung

Die Agent inbox ist die einzige Queue. Jede Continuation-Nachricht verwendet `Agent.followup()` und wird ein FIFO-turn; weder der Continuation-Manager noch der Host pflegen eine weitere Nachrichtenqueue. Jedes ausstehende Inbox-Vorkommnis hält die aktuelle Activation am Leben, bis es geclaimt oder verworfen wird. Diese konservative Regel hält auch injizierten Kontext resident: Eine stille Injection, die nach der Quiescence verbleibt, kann die Activation und ihre lebenden Vorfahren resident halten, bis eine Wakeup-Zustellung sie claimt, eine Queue-Mutation sie entfernt oder der Manager-Teardown den Baum disposed.

Das Routing hängt ausschließlich von der Activation-Residenz ab:

| Activation-Status | `followup` |
|---|---|
| `running` | in derselben Activation einreihen |
| `waiting` | dieselbe Activation wecken |
| keine Activation | eine neue Activation cold-resumen |

Die Continuation-Schicht definiert kein separates Delivery-Route-Ergebnis. Eine erfolgreiche `ctx.subagents.followup()`- oder `send_message`-Zustellung gibt die akzeptierte `MessageId` zurück, während ein Zustellfehler wirft. Die bestehenden Events `agent/inbox/enqueue`, `agent/inbox/dequeue` und `agent/inbox/discard` bleiben die Beobachtungen des Nachrichtenlebenszyklus; Adapter dürfen eine generische Annahme darstellen, exponieren aber kein `started`, `queued`, `resumed` oder ein anderes subagent-spezifisches Route-Vokabular.

### Child-Ownership

Jede Activation besitzt ihr `AgentHandle` und ein `ownedChildren: Set<SessionId>`. Da eine Session höchstens eine Live-Activation hat, identifiziert die child-Session-id den lebenden child ohne eine weitere Laufzeit-Inkarnationsreferenz. `SessionHeader.parentSession` zeichnet die dauerhafte Direkt-Parent-Identität auf, während die Mitgliedschaft in `ownedChildren` die prozesslokale Ownership-Beziehung festhält.

Wenn der authentifizierte parent selbst eine continuation-verwaltete Activation ist, fügt das Starten eines child oder das Einreichen parent-stammender Arbeit die child-Session-id zu den `ownedChildren` dieses parent hinzu, bevor der child laufen oder die Nachricht seine inbox erreichen kann. Dieser parent kann nicht abrechnen oder disposen, solange diese Menge nicht leer ist. Ein Top-Level- oder sonstiger Non-Continuation-Agent hat keine Activation und tritt diesem Wartegraphen nicht bei.

Die child-Freigabe erfolgt erst, nachdem der child Agent quiescent ist, seine Inbox leer ist, jeder child dieses child disposed ist, der best-effort finale Session-flush abgerechnet ist, dieselben Abrechnungsfakten eine Revalidierung unter dem child lock überstehen und das `AgentHandle` des child sein Disposal abschließt. Der Manager erwartet `ctx.sessions.flush(child.session)` vor dem Schließen der Zulassung, interpretiert aber dessen Teilnahme-Boolean nicht: Ein beliebiger Listener kann nicht beweisen, dass das gewählte Persistence-Backend den Zustand gespeichert hat. Eine Rejection wird geloggt, ohne Revalidierung, Handle-Disposal oder Ownership-Freigabe zu verhindern, weil das Zurückbehalten eines child seine Vorfahren dauerhaft in `waiting` pinnen würde. Ist der child owned, löst der Manager anschließend den lebenden parent über `SessionHeader.parentSession` auf und entfernt die child-Session-id aus dessen `ownedChildren`. Der Manager-Teardown verwendet dieselbe child-first-Reihenfolge, schließt aber die Zulassung und stoppt Arbeit sofort, statt eine Natural-Settlement-Revalidierung durchzuführen.

Die Ownership wird gehalten, bis die child-Activation disposed ist. Eine spätere Verfeinerung kann ein request-scoped Lease früher freigeben, würde aber eine exakte Turn-Completion-Korrelation erfordern, die dieses Task-freie Design bewusst nicht hinzufügt.

Der Top-Level-Teardown ist host-owned und wird nicht als weitere Activation dargestellt. Das Manager-Unload ruft seinen internen manager-weiten drain auf, um die Zulassung synchron zu schließen, jede zugelassene Materialisierung durch Publikation oder Rollback abzuwarten, den stabilen Live-Baum zu stoppen und ihn child-first freizugeben. Ein Host, der ausgewählte Top-Level-Agents besitzt, verwendet `drainContinuableDescendants(parents)`: Exakte Agent-Identitäten schließen die Zulassung nur unterhalb dieser Wurzeln, bis jede die registry verlässt, während unrelated Bäume und die manager-weite Zulassung live bleiben; der Manager stoppt ihre sichtbaren Nachfahren vor seinem ersten await, wartet nur auf unterhalb dieser Wurzeln zugelassene Materialisierungen und gibt nur die ausgewählten Äste frei. Jede materialisierte start- und Live-Zustellung prüft Caller-Cancellation, den anwendbaren Draining-Scope, das Activation-Disposal und die exakte Parent-Autorität im selben synchronen Abschnitt wie die Inbox-Einreichung erneut, sodass Teardown oder Parent-Ersatz, der vor der Annahme gewinnt, die Zustellung an das schließende Handle verhindert. Erst nachdem der anwendbare drain abgerechnet ist, darf der Host seine Top-Level-Agents disposen; nur der manager-weite drain geht dem Disposal des Manager-Scopes voraus.

Der activation-owner-Scope existiert, weil gewöhnliche Cordis-Owner-Effekte in umgekehrter Registrierungsreihenfolge abgewickelt werden, was den dynamischen child-Graphen nicht ausdrücken kann. Die Manager-Initialisierung registriert zuerst den strukturellen Disposer des privaten Scopes und danach seinen drain-Disposer, sodass die umgekehrte Abwicklung den drain vor der Freigabe dieses Scopes ausführt; ein Cleanup-Effekt, der lediglich auf demselben Scope wie spätere Agent-Handles registriert würde, könnte das strukturelle Handle-Disposal an der child-first-Reihenfolge vorbeilaufen lassen. Jede Materialisierung registriert ihren Barrier-Teilnehmer und snapshotet ihre exakte Live-Ahnenreihe, bevor sie die innere Transaktion startet, und bleibt getrackt, bis sie eine Activation installiert oder vollständig zurückrollt. Die Activation behält eine schwache Mitgliedschaft in dieser Ahnenreihe, sodass ein dazwischenliegender Agent die registry verlassen kann, ohne einen noch lebenden Nachfahren vor seiner Host-Wurzel zu verbergen. Seine private `SubagentInbox` installiert ein memoized Closing-Promise vor Cancellation oder rekursiven Callbacks, damit Host-Shutdown mit Scope, globales Manager-Unload, child-Freigabe und normale Abrechnung ohne Doppelfreigabe konvergieren. Cancellation propagiert top-down vor der langsamen Nachfahrenbereinigung; die Handle-Freigabe bleibt child-first. Geschwisteräste drainen unabhängig; ein einzelner Disposal-Fehler wird aufgezeichnet, verhindert aber nicht, dass der Manager die übrigen ausgewählten Handles versucht, und der aggregierte drain meldet den Fehler, nachdem alle ausgewählten Äste abgerechnet sind. Dauerhafte child-Sessions überleben diesen prozesslokalen Teardown.

### Nachrichten zwischen benachbarten Agents

Die geteilte Service-Operation `sendMessage(sender, targetId, content, options)` fügt keine zweite Queue hinzu. Sie akzeptiert einen exakten Live-Sender, erlaubt nur dessen direkten parent oder direkten fortsetzbaren child und verwendet festes Steer-Scheduling über die Agent inbox. Das globale `send_message({ agent_id, message })`-Tool exponiert dieselbe Operation in beide Richtungen; die initiale Aufgabe des child identifiziert seinen direkten parent, wenn das Tool sichtbar ist. Die [adjacent-Agent-messaging Agent Note](../architecture/2026-08-27-adjacent-agent-steer-messaging.de.md) besitzt schema, Autorität, Attribution und Prompt-Platzierung.

### Agent- und Human-Scheduling

Jede akzeptierte Agent-Nachricht verwendet `Agent.steer()`. Ein laufendes Ziel claimt sie an der nächsten Step-Grenze; ein idles oder cold-resumtes Ziel startet einen turn. Browser-verfasste menschliche Eingabe trägt separat `delivery: 'queue' | 'steer'` über `subagent.prompt`: Queue eröffnet einen späteren FIFO-turn, während Steer dasselbe best-effort Scheduling an der nächsten Step-Grenze verwendet, ohne die menschliche Herkunft der Nachricht zu ändern. Der öffentliche Service exponiert keinen vom Aufrufer wählbaren Scheduling-Modus für Agent-Nachrichten.

### Autorität und aufgezeichnete Sender-Identität

Die Autorität wird von einem exakten Live-Agent-Tool-Kontext geliefert. Nach der Zulassung zeichnen `MessageSource` und `senderSessionId` auf, wer die Nachricht geliefert hat; Aufrufer können diese Felder nicht als Autorität verwenden.

Diese Version autorisiert nur den direkten parent des dauerhaften child. Der Manager prüft `SessionHeader.parentSession` gegen den exakten Live-Parent-Agent an der finalen await-freien Inbox-Zulassungsgrenze, bevor er den child in den `ownedChildren` dieses parent registriert; Cold Resume führt zusätzlich eine frühere Prüfung vor der Rekonstruktion für fail-fast-Ablehnung durch. Andere Agents, Vorfahren, Hosts, Teams und Workflows bleiben abgelehnt, bis ein konkreter Consumer ein anderes Autoritätsprotokoll rechtfertigt.

Parent-stammende Zustellung erfordert, dass der parent bei der Zulassung live ist, und hält ihn über die Ownership-Beziehung live.

### Durability, Disposal und Recovery

Ohne Jobs gibt es kein `job_output`, `job_kill`, keinen Task-Status und kein nachrichtenbezogenes Ergebnis-Promise. Das Caller-Signal kann start oder follow-up nur vor der Inbox-Annahme abbrechen. Nach der Annahme kann der parent die akzeptierte Nachricht nicht abbrechen oder die Activation über `ctx.subagents` disposen; der einzige öffentliche Stopp ist der spätere [current-turn interrupt](2026-08-06-continuable-subagent-interrupt.de.md), der den aktuellen turn des Live-Ziels mit `keepInbox` abbricht und Residenz, ausstehende Arbeit und Nachfahren intakt lässt.

Host- und Manager-Teardown bleiben der Lebenszyklus-Stopp-Pfad. Das Manager-Unload wendet ihn global an; ein Host wendet ihn nur unterhalb der exakten Top-Level-Agents an, die er besitzt. Jede Form schließt den anwendbaren Zulassungs-Scope, stoppt die ausgewählten sichtbaren Activations, wartet auf in diesem Scope zugelassene Materialisierungen, gibt child-first frei und bewahrt die dauerhaften Sessions.

Jeder turn fordert den Session-Durability-Checkpoint an, während die finale Activation-Abrechnung zusätzlich `ctx.sessions.flush()` als best-effort Barriere erwartet, bevor die Zulassung geschlossen wird. Der Manager revalidiert anschließend, dass sich während des await kein Agent-, Inbox-, Session- oder Owned-Child-Status geändert hat; eine geänderte Beobachtung wiederholt die Abrechnung und flusht den neueren Zustand. Der Manager ignoriert das flush-Boolean bewusst, weil die Listener-Teilnahme kein Persistence-Backend identifizieren kann. Eine Rejection wird geloggt, ohne das Lebenszyklus-Ergebnis oder das Host-drain-Ergebnis zu ändern; der Manager führt dennoch die finale Revalidierung durch, disposed das Handle bei Erfolg und gibt die Ownership frei, während der persistierte child-Zustand bei einem späteren Resume fehlen oder stale sein kann.

Nur Nachrichten, die ins child-Session-Log geschrieben wurden, sind mit der Quelle, die sie lieferte, rekonstruierbar; die Inbox-Annahme allein bietet keine Restart-Garantie.

Session- und Descriptor-Persistenz überleben einen Neustart. Activation-Status, Agent-inbox-Inhalte und der Ownership-Graph sind prozesslokal. Ein Prozessabsturz kann einen akzeptierten initialen Prompt oder follow-up verlieren, der in der inbox verblieb, ohne das Session-Log zu erreichen. Session und Descriptor können überleben, sodass eine spätere autorisierte Nachricht den child cold-resumen kann, aber die verlorene Nachricht wird nicht automatisch replayt. Die Wiederherstellung akzeptierter, unvollendeter oder nicht geloggter Nachrichten erfordert ein dauerhaftes Inbox-Protokoll und ist hier nicht impliziert.

### Umfang

Diese Version deckt fortsetzbare prozessinterne children ab und lässt one-shot-Delegation unverändert. Remote-Provider benötigen ein separates Activation-Handle mit gleichwertiger authentifizierter Kontrolle und child-first-Quiescence-Verträgen, bevor sie dasselbe Verhalten unterstützen können.

Sie fügt keine Host-User-Continuation, keine subagent-Steering-Operation, kein dauerhaftes Mailbox, kein prozessübergreifendes Lease, kein automatisches Replay unterbrochener Inbox-Arbeit, keine Team-Autorität, keine Workflow-Autorität, keine öffentliche Residenz-Abfrage, kein neues Live-Activation- oder Nachfahren-Limit und keinen Runtime-Cache hinzu; der spätere [current-turn interrupt](2026-08-06-continuable-subagent-interrupt.de.md) ergänzte die eine öffentliche Stopp-Operation auf diesem Lebenszyklus. Die bestehende Delegationstiefen-Policy bleibt unverändert. Das optionale child-to-parent-Reporting ist ein späterer Consumer dieses Lebenszyklus, nicht Teil der Basis-Continuable-Fähigkeit.

## Erwogene Alternativen

**Task-gestützte Activations beibehalten.** Jobs bieten generischen Status, Ergebnissammlung und Cancellation, aber ihre Verwendung für die Nachrichtenzustellung erzeugt eine zweite Queue und dupliziert die turn-Ownership. Dieses Design verzichtet auf diese generischen Task-Kontrollen, damit die Agent inbox die einzige Ausführungsreihenfolge bleibt.

**Eine Activation pro `next-turn` erzeugen.** Das stellt unabhängige Ergebnis- und Cancellation-Grenzen wieder her, erfordert aber eine Manager-FIFO neben der Agent inbox und lässt einen gehaltenen Agent künstliche Activation-Grenzen überschreiten. Eine Activation pro Residenz-Epoche ist kleiner und folgt dem `AgentHandle`-Lebenszyklus direkt.

**Den Agent während des Wartens disposen.** Einen parent zu rekonstruieren, während sein child noch zum vorherigen prozesslokalen Ownership-Graphen gehört, würde ein dauerhaftes Ownership- und Teardown-Protokoll erfordern. Das `AgentHandle` nur für den unvollendeten Graphen zu halten, bewahrt den child-first-Teardown, ohne abgerechnete Historie resident zu halten.

**Den Provider über ein Agent-Handle erzeugen, resumen oder zustellen lassen.** Initiale Provider besitzen nur `prepareContinuable()` und dessen Unterscheidung losgelöster Erstellungsspecs: ob ein child frisch oder mit einem parent-Präfix beginnt. Der Manager muss `ctx.agents.create()` über seinen privaten activation-owner-Scope aufrufen, damit dieser Scope struktureller Owner jedes Handles ist. Eine persistierte prozessinterne Session enthält bereits den initialen Präfix und den generischen Rekonstruktions-Descriptor, während die Zustellung zur Agent inbox gehört. Providern irgendein späteres Handle, `SubagentRun` oder Nachrichten-Ownership zu geben, würde Provider-Ownership erhalten, ohne dass ein ausgeliefertes Verhalten dies rechtfertigt.

**Report-Zustellung Teil des Basis-Lebenszyklus machen.** Wiederholbares child-to-parent-Reporting ist mit diesem Lebenszyklus kompatibel, aber stille versus next-step-Zustellung, Acknowledgement, Durability und Retry-Verhalten sind unabhängige Produktentscheidungen. Das spätere report-Paket bleibt optional und konsumiert einen expliziten child-setup-Hook, sodass Continuable-Residenz keinen Rückkanal stillschweigend gewährt.

**`SessionHeader.parentSession` als Live-Ownership behandeln.** Dauerhafte Herkunft beweist nicht, dass der aufgezeichnete parent den child aktuell besitzt. Die Mitgliedschaft in den `ownedChildren` des Live-Parent zeichnet die prozesslokale Beziehung auf, ohne die dauerhafte parent-id zu ändern.

**Den exakten parent-Agent in einem separaten Link halten.** Die parent-Activation besitzt bereits ihr `AgentHandle`, und `ownedChildren` verhindert, dass diese Activation dispost, solange der child live bleibt. Den parent über die Session-id aufzulösen, ist daher ausreichend und vermeidet eine redundante Laufzeitreferenz.

**Eine separate Queue für Continuation-Nachrichten pflegen.** Eine zweite FIFO erzeugt eine mehrdeutige Reihenfolge gegenüber bereits vom Agent akzeptierten Nachrichten. Eine einzige Agent inbox gibt jedem akzeptierten turn eine beobachtbare Reihenfolge.

**Subagent-Steering jetzt exponieren.** Parent-Steering benötigt Current-Turn-Controller-Status und eine separate Zulassungs-Policy gegenüber der follow-up-Zustellung. Das Einreihen jeder First-Version-Continuation vermeidet diesen Status und sein Zulassungs-Race.

**Host-User-follow-up ohne Host-Consumer exponieren.** Eine öffentliche Autoritäts-Minting-Methode und ein User-Branch würden Cold Resume ohne den historischen parent ermöglichen, aber kein Produktions-Host-Adapter ruft diese Operation. Die Continuation-API akzeptiert nur den exakten Live-Parent, bis eine konkrete authentifizierte Host-Interaktion eine private Fähigkeit empfangen kann.

**Eine subagent-spezifische Delivery-Route zurückgeben.** Labels wie `started`, `queued` und `resumed` duplizieren Activation- und Inbox-Status, ohne dem Aufrufer ein unabhängiges Ergebnis zu geben. Die Wiederverwendung von `MessageId` und den bestehenden Inbox-Events belässt die Zustellkorrelation beim Agent-Vertrag, der sie besitzt.

**Einen child-Referenzzähler verwenden.** Ein Zähler kann nicht identifizieren, welcher child noch Teardown-Arbeit besitzt, und erlaubt doppelte Dekrementierungsfehler. Eine Identitätsmenge hält Cancellation- und Disposal-Verpflichtungen explizit fest.

## Konsequenzen

Die Implementierung pinnt diese Verhaltensweisen:

- Ein fortsetzbarer child hat höchstens eine Live-Activation und eine Agent inbox; der Continuation-Manager hat keine Activation-FIFO und keinen queued Activation-Status.
- `SubagentProvider.prepareContinuable?()` gibt nur eine losgelöste `ContinuableCreateSpec` zurück; der konfigurierte Continuable-Modus erfordert diese Fähigkeit, während `backgroundMode` eine unabhängige Policy-Wahl bleibt.
- Der Manager ruft `ctx.agents.create()` über seinen privaten activation-owner-Scope auf, installiert das zurückgegebene `AgentHandle` und die parent-Ownership, ruft `Agent.followup(initialPrompt)` auf und gibt `{ childId, messageId }` zurück, sobald die Inbox-Annahme die `MessageId` liefert, ohne auf den turn-Start oder einen Session-Log-Schreibvorgang zu warten.
- Jeder Fehler vor der Initial-Prompt-Inbox-Annahme wird ohne ids zurückgewiesen und rollt jedes erzeugte Handle, jede Activation und jede parent-`ownedChildren`-Mitgliedschaft über eine für konkurrierende Zustellung und drain sichtbare Closing-Transaktion zurück; ein Lebenszyklus-Publikationsfehler emittiert keine ungepaarte terminale Kante.
- Cold Resume ruft `ctx.agents.resume()` vom Continuation-Manager auf und dispatchen niemals durch oder benötigt den initialen subagent Provider; der Descriptor behält den initialen Provider-Namen nach dessen Entfernung, während `SubagentProvider.resume?()` und `SubagentProviderResumeRequest` nicht existieren.
- Eine Continuable-Activation besitzt `AgentHandle` direkt und erzeugt, wrappt oder hält niemals `SubagentRun`; `SubagentProvider.start()` und `SubagentRun` bleiben one-shot-only, ohne `SubagentRun.steer?()`.
- `followup()` akzeptiert nur den exakten Live-Direkt-Parent und prüft diese Identität an der finalen await-freien Inbox-Zulassungsgrenze nach jeder Materialisierung erneut; dauerhafte Nachrichten-Quellfelder können keine Zustellung autorisieren.
- Continuation-Nachrichten verwenden immer `Agent.followup()` und teilen dessen inbox-FIFO, auch wenn der child bereits einen offenen turn hat.
- `ctx.subagents.followup()` und sein `send_message`-Adapter geben nur die akzeptierte `MessageId` zurück; die Continuation-Schicht akzeptiert kein Delivery-Target und definiert kein subagent-spezifisches Route-Ergebnis.
- Caller-Signale stoppen start und follow-up nur vor der Inbox-Annahme, während Host-scoped und Manager-globaler Teardown die child-first-Bereinigung bewahren; der [current-turn interrupt](2026-08-06-continuable-subagent-interrupt.de.md) ist der eine öffentliche Stopp und tritt nicht in den Teardown ein.
- Diese Version exponiert keine subagent-Steering-Operation und keinen Current-Turn-Controller-Status.
- Ein idler Agent mit lebenden owned children ergibt eine `waiting`-Activation, deren `AgentHandle` gehalten bleibt.
- Ein an `waiting` zugestellter `next-turn` weckt dieselbe Activation; eine Zustellung nach abgeschlossenem Disposal cold-resumet eine neue Activation.
- Jede continuation-verwaltete parent-Activation disposed erst, nachdem alle direkt owned child-Activations ihr `AgentHandle`-Disposal abgeschlossen haben; Top-Level-Agents treten dem Wartegraphen nicht bei.
- Die finale Activation-Abrechnung erwartet `ctx.sessions.flush(child.session)` bei offener Zulassung, loggt Rejection, ohne Listener-Teilnahme als Durability-Beweis zu interpretieren, revalidiert den finalen Zustand unter dem child lock, schließt dann die Zulassung, disposed das child-Handle und gibt die parent-Ownership frei, sodass ein flush-Fehler keine `waiting`-Activation leaken kann.
- Der Manager-Teardown schließt die Zulassung global; ein Host, der ausgewählte Top-Level-Agents besitzt, schließt stattdessen die Zulassung nur unterhalb ihrer exakten Identitäten, bis diese Wurzeln die registry verlassen. Beide tracken zugelassene Materialisierungen anhand exakter Ahnenreihen, installieren einen memoized Disposal-Cutoff pro ausgewählter sichtbarer Activation, propagieren Cancellation top-down, geben Handles child-first frei, warten auf jeden ausgewählten Ast trotz einzelner Fehler und disposen erst dann die entsprechenden Top-Level-Agents oder den Manager-Scope.
- Der Basis-Lebenszyklus hat kein implizites Report-Verhalten; das optionale report-Paket trägt ein explizites child-scoped Tool über den setup-Hook bei.
- Session-Logs rekonstruieren nur tatsächlich geschriebene Nachrichten mit der Quelle, die jede Nachricht lieferte; inbox-akzeptierte, aber ungeloggte Nachrichten haben keine Restart-Garantie.
- Kein Continuable-subagent-Pfad erzeugt oder hängt von einem Task, einer `JobId`, einer Task-Completion-Notice, einer Task-Cancellation oder einem ergebnis­tragenden Ausführungs-Wrapper dazwischen ab.
- Unit-Coverage pinnt die `startContinuable()`-Inbox-Annahme-Rückgabegrenze, den vollständigen Rollback für jeden Pre-Acceptance- und Lebenszyklus-Publikationsfehler, manager-weite und parent-scoped drain-Quiescence für zwischen Agent-Publikation und Activation-Registrierung eingefangene Materialisierung, Sibling-Baum-Isolation, exakte Ahnenreihe nach dem Verlassen eines dazwischenliegenden Agent aus der registry, provider-unabhängiges Cold Resume, finale Exakt-Parent-Reautorisierung nach Cold-Resume-Materialisierung, Caller-Signal- und Teardown-Ownership auf beiden Seiten der Annahme sowie das Fehlen automatischen Replay für akzeptierte, aber ungeloggte Nachrichten.
- Unit-Coverage pinnt die residenzbasierte Routing-Tabelle, Single-Inbox-Ordnung, `MessageId`-Korrelation über Inbox-Events, follow-up während eines offenen turns, waiting-Wakeup, Cold Resume, Ownership-Registrierung und -Freigabe, child-first Disposal, Send-versus-Dispose-Races, direkte Agent-turns, Session-only-Arbeit und während des final-flush-await akzeptierte Maintenance, best-effort final flush mit fehlenden und scheiternden Listenern sowie das Fehlen öffentlicher subagent-Cancellation und -Steering.
- Die Unit-Coverage des report-Pakets pinnt separat child-only-Sichtbarkeit, setup-Widerruf, Autorität, Zustellmodi, stabile Nachrichtenidentität und Lebenszyklus-Races.
- Ein schlüsselloser Assembled-App-Snapshot deckt parent-Delegation und follow-up-Einreihung, das Fehlen von subagent-Steering und impliziter report-Zustellung, gehaltene `waiting`-`AgentHandle` und child-first Disposal ab. Ein separater report-Snapshot deckt den optionalen expliziten Rückkanal ab.

### Akzeptierte Kosten

Das Entfernen von Jobs gibt generische Hintergrundarbeits-Inspektion, Ergebnissammlung und exakte Task-Cancellation auf. Falls diese Produktfeatures zu Anforderungen werden, benötigen sie ein Request-Ticket oder eine Inbox-Fähigkeit, die keine zweite Ausführungsqueue wieder einführt.

Das Halten einer Activation, während Nachfahren laufen, verbraucht Agent-Ressourcen proportional zum unvollendeten Ownership-Graphen. Die bestehende Delegationstiefen-Policy begrenzt die Verschachtelung weiterhin, aber diese Version fügt kein Live-Activation- oder Gesamtnachfahren-Limit hinzu; abgerechnete historische Sessions halten kein `AgentHandle`.

Die prozesslokale inbox und der Ownership-Graph koordinieren nicht zwei harness-Prozesse. Deployments, die konkurrierenden Zugriff auf einen Persistence-Store erlauben, benötigen weiterhin ein dauerhaftes Lease- und Mailbox-Protokoll.

Ohne das optionale report-Paket sendet das Abschließen eines child-turn weder dessen Inhalt an den historischen parent noch weckt es ihn. Mit dem Paket sendet nur ein expliziter `report`-Aufruf ausgewählten Inhalt; stille Zustellung weckt den parent nicht, während next-step-Zustellung ihn weckt und seiner nächsten Step-Grenze beitritt. In jedem Fall bleibt die detaillierte child-Ausgabe in seiner dauerhaften Session.

Das Einreihen jeder Continuation-Nachricht bedeutet, dass ein parent einen laufenden child-turn nicht sofort korrigieren kann; die Korrektur läuft als nächster turn. Eine spätere UI-Steering-Aktion kann diese Latenz reduzieren, ohne die follow-up-Reihenfolge zu ändern.

Ein fehlgeschlagener best-effort finaler flush wird geloggt, während der Laufzeit-Ownership-Graph weiter drainiert; der persistierte child-Zustand kann fehlen oder stale sein. Retry und Repair erfordern ein separates Recovery-Design.
