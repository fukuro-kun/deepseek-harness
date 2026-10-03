# Agent Note: Settlement-Zustellung gehört dem continuation manager
[English](2026-08-06-manager-owned-subagent-settlement-delivery.md) | [中文](2026-08-06-manager-owned-subagent-settlement-delivery.zh.md) | Deutsch

Status: implemented


## Problem

Fortsetzbare Hintergrunddelegation war die einzige asynchrone Operation, die ein Modell starten, aber nicht zu Ende bringen konnte. Jede andere Form hat ein Abruf-Primitiv oder einen Rückgabewert: Ein Hintergrund-bash-Kommando und ein one-shot-Hintergrund-subagent rechnen beide über einen Task ab, auf den `job_output(wait: true)` blocken kann; ein Workflow und ein Vordergrund-subagent geben ihr Ergebnis an den Aufrufer zurück. Ein fortsetzbares Hintergrund-child gab nur seine dauerhafte id zurück, und nichts existierte, auf das ein parent warten oder das ihm übergeben würde.

Vom child verfasste Nachrichten schließen die kooperative Hälfte dieser Lücke: Ein child kann Fortschritt und eine finale Übergabe an seinen direkten parent senden. Modellwahl kann den Rest nicht schließen. Ein durch eine token-Obergrenze, einen Modellfehlschlag, Abbruch oder teardown gestopptes child sendet eine solche Nachricht möglicherweise nie, und das sind genau die Enden, von denen ein wartender parent am dringendsten hören muss. Die beobachtbaren Downstream-Symptome waren parents, die `list_agents` busy-pollten, Nachrichten an bereits abgerechnete children erneut sendeten und Deployments, die `subagent` zugunsten von `workflow` aufgaben, weil ein Workflow wenigstens etwas zurückgibt.

Das Signal existierte bereits. `subagent/end` trägt `stopReason` und `lastAssistantMessage`, seit fortsetzbare Activations ausgeliefert wurden. Was fehlte, war ein Consumer, der es in Kontext verwandelt, den das Modell des parent sehen kann.

## Decision

Der continuation manager liefert die Abrechnung selbst, aus dem Inneren der Disposal-Transaktion, die die Activation beendet.

Wenn eine residente Activation abrechnet, löst `notifySettlement()` den dauerhaften direkten parent des child auf und sendet ihm eine user-Rollen-Nachricht: das Ergebnis der epoch als ein Satz, auf den der parent reagieren kann, dann der finale assistant-Inhalt des child oder die Feststellung, dass es keinen erzeugte. Die Zustellung ist unbedingt für jedes child, dessen id ein Aufrufer tatsächlich erhalten hat. Sie konsultiert nicht, ob das child berichtet hat, und führt keine Buchhaltung, die das Versprechen bedingt machen könnte — genau diese Unbedingtheit erlaubt `tool-subagent`, eine Laufzeit-Notice mit dem Ergebnis und einer etwaigen finalen assistant-Nachricht zu versprechen. Eine Materialisierung, die vor ihrer ersten angenommenen Nachricht zurückgerollt wird, bleibt still, weil dem Aufrufer mitgeteilt wurde, dass dieses child nicht etabliert wurde.

### Provenance

Die Notice trägt `{ kind: 'subagent-settled', form: 'notice', summary, senderSessionId }`. Sie ist bewusst nicht der `agent-message`-kind, den `send_message` nutzt. Eine Agent-Nachricht ist Inhalt, den das child gewählt hat; diese ist die Laufzeit, die feststellt, was aus dem child wurde. Sie zu verschmelzen würde dem child Worte zuschreiben, die es nie schrieb, und ein dauerhaftes Log unfähig machen, "das child sagte, es sei fertig" von "der Harness beobachtete, dass es stoppte" zu unterscheiden. Die `notice`-Form gibt einer UI außerdem die eingeklappte Einzeilen-Darstellung, die diese Nachricht will, wo `relay` Agent-Korrespondenz präsentiert.

### Zwei Ordnungsregeln, und warum der manager sie besitzt

Ein externer `ctx.on('subagent/end')`-Listener sieht entkoppelter aus und ist falsch. `SubagentRunEndInfo` benennt keinen parent, das child-Handle ist bereits disposed, wenn die Kante feuert, sodass der parent nicht daraus zurückgewonnen werden kann, und die Ownership-Freigabe, die den eigenen Settlement-Watcher des parent aufweckt, ist bereits gelaufen. Der manager hält die parent-Referenz während der gesamten Disposal, sodass keines dieser Hindernisse für ihn existiert.

**Das Senden geschieht vor `releaseOwnership`.** Zu diesem Zeitpunkt enthält die owned-child-Menge des parent dieses child noch, sodass das Settlement-Prädikat nicht gelingen kann. Stattdessen nach der Freigabe zuzustellen rast gegen einen Watcher, der einen Microtask später fortsetzt, sich childless und still findet und einen Agent disposed, dessen `cancel()` genau die inbox leert, in der die Notice liegt. Der Fehlermodus ist eine still fehlende Nachricht ohne Fehler irgendwo.

**Ein residenter parent empfängt sie über seine private `SubagentInbox`.** Der Wrapper prüft das Schließ-Promise der Activation unmittelbar vor dem synchronen aufweckenden Send, und der manager erneuert die Wake-Generation vor der Rückkehr. Die finale Settlement-Entscheidung prüft diese Generation, die Session-Sequenz, die ausstehende Inbox und die owned-child-Menge unter dem child-Lock erneut, beansprucht dann die idle-Phase des Agent über `runMaintenance()`, bevor sie die Zulassung schließt. Dies ist nicht redundant zur ersten Regel: `Agent.status` faltet Kontext-Maintenance in `idle`, und ein aufweckendes Send hinter Maintenance rüstet nur einen aufgeschobenen Wake.

Beide Regeln sind durch Tests gepinnt, die fehlschlagen, wenn die Ordnung umgekehrt oder die Buchhaltung entfernt wird.

### Establishment hält Ownership offen

Die owned-child-Buchhaltung schützt auch die Erzeugungsseite: `holdOwnership()` registriert die child-id vorab in der owned-Menge eines continuation-verwalteten parent, bevor die Establishment- oder Resume-awaits laufen (Persistenz-stat, Provider-Vorbereitung, Materialisierung), sodass ein untätiger parent nicht als abgerechnet beurteilt werden kann, solange ein Aufrufer dieses child noch erzeugt oder fortsetzt — eine nach der Abrechnung zugelassene Zustellung fände eine veraltete parent-Identität. Der zurückgegebene Releaser dient nur dem Fehlerpfad: Er entfernt nur den Hold, den dieser Aufruf hinzufügte, und sobald eine lebende Activation für das child existiert, gehört die Ownership-Kante dieser Activation und `finishDisposal`s `releaseOwnership`. Ein parent ohne Activation braucht keinen Hold (nur dieser manager rechnet parents ab), und ein parent, dessen eigene Disposal-Transaktion bereits offen ist, weist mit `ACTIVATION_CLOSING` zurück, statt ein child zu etablieren, dem nie zugestellt werden könnte.

### Scheduling

Ein untätiger parent bekommt einen gewöhnlichen späteren turn. Ein beschäftigter parent wird in seine nächste Schritt-Grenze gesteuert, weil `Inbox.claim()` den ganzen Next-Step-Batch an einer Grenze nimmt: Vier gemeinsam abrechnende children kosten dann einen Schritt statt vier turns. Steern statt Injizieren ist bewusst — der Wake ist ein no-op, solange der driver läuft, und er schließt das Fenster, in dem ein driver zwischen Status-Lesung und Send ausscheidet, was die Notice uneingelöst stranden ließe, bis etwas Unverbundenes den parent aufweckte. Dies ist eine Korrektheitsregel, keine Deployment-Präferenz, daher ist sie kein `Config`-Feld.

Ein `running`-parent ist nicht steuerbar: einer, dessen turn bereits abgebrochen, aber noch nicht verlassen ist. `Agent.send()` leitet nach Abbruch eingereichte aufweckende Eingabe auf den nächsten turn um, verriegelt den Wake und spielt ihn nach, sobald der abgebrochene driver konvergiert — außer einem Disposal-Abbruch, der nie verriegelt und zur teardown-Regel unten gehört. Die Notice öffnet daher weiterhin ihren eigenen turn, ohne auf unverbundene Eingabe zu warten; der Preis ist eine umgeleitete turn-Grenze, nicht die Nachricht.

**Ein parent, dessen eigener teardown begann, bekommt keinen Wake.** Aufwecken ist keine Queue-Operation: `Agent.followup()` auf einem ruhigen Agent startet einen turn, und `cancel()` auf einem untätigen Agent ist ein dokumentierter no-op, der nicht gegen einen späteren wappnet. Jeder teardown-Pfad endet daher mit einem lebenden, abgebrochenen, noch registrierten parent — `drainContinuableDescendants()` wird von der ACP-Bridge zwischen dem Abbrechen ihrer Session-Agents und ihrem Disposal aufgerufen — sodass eine ungeschützte Notice einen echten Modell-Request auf einem bald zerstörten Agent startet, einmal pro Baumebene, weil die eigene Notice jeder Ebene dann die Ebene darüber aufweckt. `notifySettlement()` stellt dieselbe Frage wie `assertAdmitting()` (ist die fortsetzbare Zulassung dieser Linie geschlossen?) und injiziert stattdessen. Injection ist keine dauerhafte Mailbox — was der eigene Disposal des parent dann damit tut, steht unter Akzeptierte Risiken — aber es ist das einzige Send, das einen parent erreicht, der seine inbox noch liest, ohne einen turn auf einem zu rüsten, der es nicht tut, und nichts geht verloren, was der Wake geliefert hätte: Der turn, den ein Wake startete, wurde selbst mitten im Flug disposed.

Zustellung blockiert oder scheitert teardown niemals. Ein zurückgewiesenes Send wird geloggt und verworfen, weil das Zurückhalten eines child zum Wiederholen einer Notice seine ganze Abstammungslinie für immer in `waiting` festnageln würde, und ein parent, der die Registry verlassen hat, ist ein gewöhnliches Ergebnis statt eines Fehlers.

### Das eigene Log der epoch ist die ganze Abrechnung

`epochStopReason()` liest das Ergebnis der epoch aus ihrem eigenen Log, weil gelingender teardown nichts darüber aussagt, ob das Modell fehlschlug, seine Obergrenze traf oder gestoppt wurde. Nur turns zu lesen lag zweimal falsch, beide Male in derselben Form: Ein vor seinem ersten Schritt gestoppter turn hinterlässt ein `turn/end`, das von den balancierten no-op-turns, die ein Rejection oder eine geleerte Claim erzeugt, ununterscheidbar ist, sodass der Filter, der jene übersprang, auch echte Enden übersprang und mit dem sauberen Abschluss des vorherigen turn antwortete. Der Durability-checkpoint (`dsh-session-checkpoint-policy`, in jedem ausgelieferten Profil) und die prompt-Assembly laufen beide an dieser Grenze und propagieren beide, und `Inbox.claim()` hat die Nachrichten dann bereits genommen — sodass dem parent gesagt wurde, ein child sei fertig, während die Zustellung, auf die er wartete, verschluckt worden war. Unter der beworbenen automatischen Settlement-Notice ist das der eine Fehlschlag, den ein parent nicht entdecken und nicht wiederholen kann.

Das fehlende Faktum gehörte nie dem turn; es gehörte der inbox. `Inbox` loggt jede Mutation mit `removedCount` und markiert einen Abbruch `outcome: 'canceled'`, was ein turn, der seine Eingabe beansprucht, von ungelaufen verworfener Arbeit trennt. `foldConsumedWork()` in `dsh-agent` faltet beide Vokabulare zu einer Antwort: der letzte turn, der konsumierte Arbeit abrechnet — gesteppt oder geclaimt-dann-fehlgeschlagen, gestoppt oder zurückgewiesen — und ob danach akzeptierte Arbeit abgebrochen wurde, ohne dass ein turn über ihr öffnete. Ein `blocked`-Ende über geclaimter Eingabe ist ebenfalls eine Abrechnung: Das pre-step-Rejection, das sie erzeugte — ein Hook-deny, ein Policy-Plugin — verwarf die Nachrichten, die der turn geclaimt hatte, sodass die Notice sagt, das child habe abgelehnt statt fertiggestellt. Nur ein `blocked`-turn, der nichts geclaimt hat, bleibt unsichtbar.

Ihn aus dem Log statt aus Live-Zustand abzuleiten macht ihn vollständig. Eine frühere Version sampelte die eigene Activation des managers unmittelbar vor dem Abbrechen, was nur je Abbrüche sehen konnte, die dieser manager gleich ausführen würde: Das `interrupt()` eines Vorfahren oder ein entladendes Plugin, das einen von ihm verfolgten agent abbricht, ließ die Stichprobe falsch und die Notice weiterhin `finished` sagen. Sie ließ auch den akzeptiert-aber-nie-geclaimten-Fall an nichts festgenagelt, das ein Test von seiner Abwesenheit unterscheiden könnte. Ein Fold über das Log deckt jeden Aussteller ab, und beide Hälften lassen ihre eigenen Tests fehlschlagen, wenn sie entfernt werden.

Vorrang gehört dem Consumer: Ein aufgezeichneter Fehlschlag oder eine Obergrenze gewinnt über einen Abbruch, weil das Stoppen eines bereits fehlgeschlagenen child seinen Fehlschlag nicht in einen Abbruch verwandelt. `dsh-agent` besitzt den Fold, weil es den inbox-Marker besitzt, von dem die Antwort abhängt, und beide Consumer bereits davon abhängen — die fortsetzbare epoch hier und das one-shot-`readResult()`, das dasselbe Loch hatte.

Beides wirkt über die Notice hinaus: `subagent/end` trägt `stopReason` zur jsonrpc-UI und der Claude-Hook-Bridge, die ein mitten im turn abgerissenes child als `completed` meldeten.

### Snapshot coverage

Drei assemblierte ACP-Szenarien decken die Notice ab: ein child, das keine Nachricht sendet, ein child, das zuerst eine Nachricht sendet, und ein child, das über mehrere Agent-Nachrichten-turns getrieben wird. Alle drei brauchen einen expliziten Zaun. Die Notice trifft ein, sobald der teardown des child fertig ist, was gegen alles rast, was der parent gerade tut, sodass jedes Szenario das child hinter dem spawn-turn des parent hält und dann auf den parent-turn wartet, den die Notice öffnet (`waitForTurnStart` auf diesen turn, dann `waitForTurnEnd`), bevor das Skript weitergeht. Auf einen turn zu warten, zu dessen Erzeugung der Lauf nicht eingezäunt ist, ist keine Abdeckung: Es ist ein Timeout, wenn die Notice stattdessen im bereits laufenden turn landet.

`subagent-continuable` ist das Szenario, das einen Fehlschlag pinnt. Der letzte turn seines child stirbt am erzwungenen Durability-checkpoint, ohne einen Schritt zu betreten, sodass dieser transcript der Ort ist, wo die stop-reason-Regel oben Ende-zu-Ende sichtbar wird: Die Notice sagt, das child sei *fehlgeschlagen*, trägt das frühere `SECOND_OK` als seinen letzten Inhalt statt als Ergebnis, und der eigene Bestätigungs-turn des parent erreicht den ACP-Client.

Ein schlüsselloser headless-Loader-Snapshot deckt den nutzersichtbaren Pfad Ende zu Ende ab. Sein Replay-parent lässt `run_in_background` weg, um den fortsetzbaren Hintergrund-Default zu üben, ruft nie `list_agents`, `send_message` oder Task-Tools auf, konsumiert die manager-verfasste `subagent-settled`-Notice und erzeugt seine finale Antwort. Das child sendet keine Agent-Nachricht, sodass der transcript nur von der Laufzeit-Notice abhängt. Ein nur-Test-Loader-Zaun hält den Post-spawn-Request des parent, bis die echte manager-Notice seine inbox erreicht, und entfernt Plattform-Scheduling aus dem transcript, ohne die Notice zu synthetisieren.

Das `subagent-send-message`-Szenario hält das child, bis der spawn-turn des parent endet, hält den parent dann in Maintenance, bis die Abrechnung der vom child verfassten Nachricht folgt. Der fortgesetzte parent claimt die Next-Step-Agent-Nachricht vor der eingereihten Next-turn-Abrechnung. Die [Nachricht/Abrechnung-Ordnungsentscheidung](../bug-fix/2026-08-17-subagent-message-settlement-ordering.de.md) besitzt diese zustandsübergreifende Ordnung.

Die Ablehnungs- und Unterbrechungs-Formulierungen sind wörtlich in Unit-Tests gepinnt statt in einem gespielten transcript: Sie zu erzeugen braucht ein ablehnendes Policy-Plugin oder einen an einer Schritt-Grenze eingezäunten Abbruch, die die schlüssellosen Assemblies sonst nicht tragen, und die assemblierten Szenarien pinnen den Notice-Pfad selbst bereits Ende zu Ende.

## Alternatives considered

**Fortsetzbaren children einen Task geben.** Ein Task ist ein one-shot-Vertrag: ein Produzent, eine Abrechnung, ein Ergebnis. Eine Activation läuft viele turns, überlebt jeden einzelnen und kann nach ihrem Ende fortgesetzt werden. Sie in einen Task zu wickeln erzeugt genau die Lebenszeit-Diskrepanz neu, die fortsetzbare children beseitigen sollten, und würde einen turn terminal aussehen lassen.

**Einen externen `subagent/end`-Listener anhängen.** Aus den drei oben genannten Gründen abgelehnt — kein parent im Payload, ein disposed child-Handle und eine Ordnung, die der Listener nicht beeinflussen kann. Ein Listener müsste außerdem strikt synchron sein, um die Freigabe zu schlagen, und nichts an diesem seam erzwingt das, sodass die korrekte Version nur zufällig korrekt wäre.

**Nur zustellen, wenn das child keine Nachricht sendete.** Das war der erste Entwurf. Er braucht pro-Activation-Buchhaltung, verfehlt weiterhin das child, das Fortschritt sendete und dann vor seinem Ergebnis starb, und macht — entscheidend — das parent-seitige Versprechen bedingt. "Meistens wirst du informiert" ist kein Vertrag, den eine Tool-Beschreibung aussagen kann, und ein Modell, das sich nicht auf die Notice verlassen kann, pollt ohnehin.

**Zustellung konfigurierbar machen.** Ein Deployment-Schalter würde den modellseitigen Text auf "meistens" zurückführen, was genau der Fehlschlag ist, den diese Änderung beseitigen soll. Protokollkonstanten und Sicherheitsinvarianten bleiben fest; dies ist eine davon.

**`subagent/end` so ändern, dass es den parent trägt, und ein Plugin zustellen lassen.** Das verbreitert ein veröffentlichtes Payload für einen einzigen paketinternen Consumer, behält jedes Ordnungsrisiko und macht den Rückkanal wieder zu einem optionalen Plugin. Das paketprivate `ActivationObserver` um `terminal(failure)` zu erweitern hält eine Berechnung der terminalen Fakten und keine Änderung der öffentlichen Oberfläche.

**Immer `followup` nutzen.** Einfacher und einheitlich, aber ein Fan-out gemeinsam abrechnender children würde je einen parent-turn kosten. Der Schritt-Grenzen-Batch existiert bereits; ihn zu nutzen ist frei.

## Consequences

- Der parent eines fortsetzbaren child empfängt eine Nachricht pro abgerechneter Activation. Fan-out-Deployments fügen daher parent-turns hinzu; Steern hält einen simultanen Batch auf einen Schritt.
- `tool-subagent` verspricht die Notice in seinem Schema, weil der Rückkanal Service-Verhalten ist, kein optionales Plugin.
- `Activation` trägt `parentSession` und `announced`. Das erste existiert, weil das child-Handle vor der Zustellung disposed wird; das zweite hält eine zurückgerollte Materialisierung still.
- `foldConsumedWork()` ersetzt `dsh-session`s `findLastMessageTurnEnd()` und zieht zu `dsh-agent` um, das den inbox-Marker besitzt, den es liest; der one-shot-prozessinterne Pfad faltet dieselbe Antwort und klassifiziert ein abgeschnittenes one-shot-child nicht als `completed`.
- Unit-Abdeckung pinnt den unbedingten Vertrag, jeden terminalen Grund, idle- und busy-Scheduling, den Batch, die Maintenance-Regression, die Pre-Release-Ordnung, einen verschwundenen parent und ein zurückgewiesenes Send, das teardown nicht scheitern lassen darf.
- Drei ACP-Szenarien nutzen einen expliziten Settlement-Zaun, und `subagent-send-message` pinnt die Agent-Nachricht-vor-Abrechnung-Next-Step-Ordnung.
- Ein schlüsselloser headless-Loader-Snapshot pinnt Hintergrundstart → manager-verfasste Settlement-Notice → finale parent-Antwort ohne Polling oder vom child verfasste Nachricht.

### Accepted risks

Die Notice wird zugestellt, nicht bestätigt. Es gibt keine dauerhafte Mailbox, Quittung oder Wiederholung: Ein nicht lebender parent verliert sie, und die Session des child bleibt der einzige dauerhafte Datensatz. Das zu schließen braucht ein Offline-Mailbox-Protokoll mit eigener Adressierung, Autorisierung und Replay-Regeln.

Eine während teardown injizierte Notice wird von keinem Modell gelesen, wenn dieser parent als Nächstes disposed wird — was jeder teardown-Aufrufer tut: Der Disposal-Abbruch löscht die uneingelöste Nachricht, und das Log bewahrt das insert/cancel-Paar als Datensatz. Teardown-Zustellung nach Resume lesbar zu machen erfordert entweder die obige Offline-Mailbox oder eine Änderung der Disposal dauerhafter ausstehender Arbeit. Disposal verwirft jedes uneingelöste inbox-Element einschließlich Nutzereingabe, sodass eine Änderung dieses Verhaltens eine Core-agent-Entscheidung ist, kein Settlement-Delivery-Detail. Nach Resume kann der parent das child entdecken, empfängt aber nicht das Ergebnis: `list_agents` meldet nur Existenz und Live-oder-gespeichert-Status — `SubagentListEntry.activity` sagt das — und das Ende zurückzuholen erfordert, das child über `send_message` zu fragen.

Stop-reason-Zuschreibung ist ein Best-Effort über das bestehende Splice-Vokabular des Logs, voreingenommen gegen Erfolgsübertreibung. `Inbox.remove()` und teardowns `clear()` schreiben identische Abbruch-Splices, sodass das Entfernen einer Nachricht, deren Inhalt anderswo überlebt — `agent-instructions`, das einen ausstehenden Anweisungs-Refresh wegsaugt, oder settlements eigener Abbruch, der eine ausstehende löscht — als ungelaufen verworfene Arbeit lesbar sein kann und ein fertiges child als gestoppt meldet. Sie zu trennen braucht ein reicheres Entfernungs-Vokabular in `dsh-agent`; ohne es ist das Misreading schmal und irrt dahin, dass der parent ein fertiges child nachprüft, nie dahin, einem unfertigen zu vertrauen.

Turn-Verstärkung ist real für tiefe oder breite Bäume und bewusst nicht konfigurierbar. Der Schritt-Grenzen-Batch begrenzt sie für simultane Abrechnung, nicht aber für children, die versetzt abrechnen.

Agent-Nachrichten und ihre späteren Settlement-Notices werden über die Next-Step-FIFO des parent geordnet. Unabhängige Abrechnungen geschwisterlicher children behalten ihre tatsächliche Zustellreihenfolge statt einer synthetischen Geschwisterordnung.
