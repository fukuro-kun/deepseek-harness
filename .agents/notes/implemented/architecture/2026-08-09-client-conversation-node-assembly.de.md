# Agent Note: Client-Conversation-Business-Node-Assemblierung und keyte Chat-Snapshots
[English](2026-08-09-client-conversation-node-assembly.md) | [中文](2026-08-09-client-conversation-node-assembly.zh.md) | Deutsch

Status: implemented


## Problem

Die Client-Session besaß Transport-Fenster, Verbindungszustand und ausstehende Interaktionen und interpretierte zugleich Assistant-, Tool-, Message-, Command-, Compaction-, Retry- und Turn-Tail-Events in einem zentralisierten Transcript-Fold. Das Hinzufügen eines Business-Nodes erforderte Änderungen an Session-Switches, History-Replay, Indexes, Caches und React-Gruppierung; Business-Identität, State-Evolution und finale Präsentation hatten keinen unabhängigen Owner.

Ohne target-neutrale Assemblierung stehen laufende Assistant- und Tool-Werte außerhalb des finalisierten Flusses und treten erst nach Abrechnung in die log-geordnete Node-Liste ein. Ihr React-Parent ändert sich dann und remountet sie, selbst wenn Business-ID und `key` stabil bleiben. Getrennte Update-Pfade für vollständige History-Loads, ältere Prepends, Live-Appends und Token-Streaming machen Referenzstabilität und lokale Neuberechnung außerdem von spezialisierten Caches abhängig, die über den Client verteilt sind.

Business-Events nutzen zudem unterschiedliche Korrelationsmodelle. Tool hat Call-IDs, Assistant korreliert nach Turn und Step, Compaction hat einen eigenen Lifecycle und Checkpoint, und ein Inbox-Splice repräsentiert einen momentanen Zustand in einer Sequenz. Alle diese Unterscheidungen in einem Fold zu halten würde jede Business-Änderung durch eine globale Lookup schicken und unbeteiligte Caches invalidieren.

## Entscheidung

Die Client-Runtime stellt eine target-neutrale Conversation-Node-Assemblierungsengine bereit. Business-Plugins registrieren Event Definitions, und View-Plugins registrieren Per-Session-View-Builder. `ui-conversation` registriert die ersten eingebauten Definitions und den `chat`-Builder; die Session reicht nur das aktuelle zusammenhängende `SessionEventLikeEntry`-Fenster an die Engine und publiziert deren Snapshot, statt einzelne Conversation-Businesses zu interpretieren. Der äußere Diskriminator des Entry unterscheidet Standard- und gepackte Records, während beide ein ausgerichtetes inneres `SessionEventLike` für den Definition-Dispatch tragen.

Diese Note behält die Herleitung, Business-für-Business-Validierung, Verantwortlichkeiten, Algorithmen und Trade-offs, die nach der Implementierung relevant bleiben.

Chat registriert eine Inbox-Definition nur für `next-step`, weil die Message-Klassifikation sein einziger Consumer ist; `next-turn`-Splices bleiben durable Session-Inputs, erzeugen aber keinen Chat-Context. Chat und Trajectory halten jeweils target-eigenen Next-Step-State. Jedes Einfügen speichert nur Message-IDs in einem immutable Splice-Node. Ein erfolgreicher Claim materialisiert die Pending-Kette einmal, ersetzt das bisherige Claimed-Set durch diesen Batch und lässt spätere Contexts das Set teilen, bis ein weiterer Claim erfolgt. Der AgentLoop hängt jede aus diesem Claim zugelassene Message an, bevor er einen weiteren Batch claimen kann; ein abgelehnter Claim hängt kein `user/message` an, sodass spätere Klassifikation nur den aktuellen Batch braucht. Historische Contexts behalten daher linearen ID-State statt kumulativer Array- und Set-Snapshots.

### Verantwortungsebenen

| Ebene | Durable Verantwortung | Besitzt explizit nicht |
|---|---|---|
| Session | Das zusammenhängende Logical-Event-Fenster pflegen, replace, prepend und skalaren append unterscheiden und Snapshot-Benachrichtigungen planen | Tool-, Assistant-, Compaction- oder andere Business-Events interpretieren |
| Event Registry | Die einzigartig-`kind` Definitions und den einzigen Fallback unter Cordis-Lifecycles halten | Context oder State einer Session speichern |
| Assembler | Standard-Events oder gepackte Runs matchen und Contexts, Locations, Abhängigkeiten und das Publication-Dirty-Set pflegen | Business-State-Felder oder Chat-Ordnung interpretieren |
| Node Definition | Identität, State-Transitionen, Location-Daten und target Node eines Business-Objekts definieren | Contexts erzeugen, State eines anderen Business mutieren oder alle Contexts scannen |
| View Builder | Finale target Nodes inkrementell in den Snapshot dieser View organisieren | `SessionEventLike`-Inputs neu interpretieren |
| React-Renderer | Renderer-eigene Daten nach dem `kind` des finalen Node rendern und Business-Daten aus der Location des aktuellen Node lesen | Business-Events paaren, globale Nodes scannen oder Business-Lifecycle-Zustand entscheiden |

Registry-Beiträge sind Cordis-Effekte. Das Entfernen einer Definition verursacht einen niederfrequenten Registry-Rebuild für bestehende Sessions; gewöhnliche Business-Events ändern die Registry nicht und bauen nicht jeden Business-Typ neu auf.

### Der Gesamtvertrag `ConversationNodeDefinition`

Jede [`ConversationNodeDefinition`](../../../../packages/client/ui-conversation/src/client/contract/conversation.ts) besitzt unabhängig die Konversion eines Business-Objekts von `SessionEventLike`-Inputs zu State und finalen View-Nodes. Der `kind` einer Definition ist ihr einzigartiger Registry-Name und der Namespace ihrer Business-IDs.

Ein Input darf von mehreren gewöhnlichen Definitions geclaimt werden. Zum Beispiel aktualisiert ein Assistant-Event oder gepackter Run sowohl den Assistant-Node als auch den Turn Tail, während ein Retry-Event Retry, Assistant und Turn Tail aktualisiert. Der Assembler fragt den Fallback nur, wenn jede gewöhnliche Definition `null` zurückgibt.

Eine Definition hält sessionübergreifend keine mutablen Business-Daten. Der Assembler jeder Session isoliert Contexts, State, Abhängigkeiten und View-Builder dieser Session.

#### `kind`, Business-ID und Context-Key

Die von `match()` zurückgegebene `id` muss nur innerhalb ihrer Definition stabil sein. Eine Tool-ID kann eine Call-ID sein, eine Assistant-ID kann `turn:step` sein, und eine Inbox-ID kann die Splice-Event-Seq sein.

Der Assembler nutzt `conversationContextKey(kind, id)`, um einen kollisionsfreien Key zu erzeugen. Definitions, die dieselbe `id` zurückgeben, teilen trotzdem keinen Context. Der finale View-Node muss diesen engine-eigenen Key behalten und darf `seq` oder Render-Position nicht als Identität nutzen.

Jedes `(kind, id)` hat höchstens einen Start-Match. Ein zweiter Start schlägt sofort fehl; eine Definition muss eine neue ID zurückgeben, um einen neuen Lifecycle darzustellen.

#### `match(event)`

`match(event)` liest nur das aktuelle `SessionEventLike` und gibt `{ id, role: 'start' | 'update' }` oder `null` zurück. Es kann nicht auf einen Context, History, einen Reader, eine Location oder den View-Envelope zugreifen. Ein Client-only-`assistant/live-chunk`-Event kann nur ein Update sein; der Assembler lehnt jeden transienten Start ab, und `start()` erhält einen `ConversationStartMatch`, der ein durables `SessionEvent` enthält.

Diese Einschränkung macht die Routing-Kosten eines skalaren Events oder gepackten Runs nur von der Anzahl registrierter Definitions abhängig. Der Assembler scannt nie die historischen Contexts einer Definition, um zu entscheiden, welcher ein Update besitzt.

Start-, Ergebnis-, Ressourcen-, Checkpoint- und business-eigene terminale Events müssen dieselbe ID tragen oder direkt implizieren. Wenn ein Event diese ID nicht liefern kann, erweitert sein Produzent das Event-Protokoll; der Client rät nicht vom „nächsten unvollendeten Objekt".

Die `role` beschreibt den State-Lifecycle, nicht die Sichtbarkeit. Ein Start kann sofort einen terminalen Node erzeugen, während ein Update einen pending Context betreten kann, bevor sein Start geladen ist.

#### `ConversationMatch`

Nach einem erfolgreichen Match kombiniert der Assembler das Standard- oder gepackte Event, `role` und die engine-berechnete `location` zu einem read-only `ConversationMatch`. Ein gepackter Run bleibt ein Match und behält seine Fragment- und Timestamp-Gap-Arrays.

Die `matches` eines Context liegen immer in aufsteigender erster-`seq`-Ordnung, nicht in Netzwerk-Ankunfts- oder Paginierungs-Ingestionsreihenfolge. Das Session-Journal hat überlappende logische Bereiche bereits abgelehnt. Wenn eine Tail-Page ein Ergebnis liefert, bevor eine ältere Page seinen Call liefert, ordnet die finale Match-Reihenfolge den Call trotzdem vor das Ergebnis.

Location kann sich ändern, wenn ein prepend eine Grenze füllt oder ein append eine schließt. Der Assembler ersetzt die read-only Locations der betroffenen Matches und replayed den Context; Business-Code behält keine alte Location-Kopie als Autorität.

#### `ConversationNodeContext`

| Feld | Owner | Für die Definition sichtbare Semantik |
|---|---|---|
| `key` | Assembler | Stabile finale Identität, abgeleitet aus `kind + id` |
| `kind` / `id` | Definition + Assembler | Aktueller Business-Namespace und Business-ID |
| `matches` | Assembler | Vollständige skalare und gepackte Business-Evidenz, geladen im aktuellen Fenster und sortiert nach erster `seq` |
| `start` | Assembler | Eindeutiger skalarer Start-Match, oder `undefined` bevor er lädt |
| `state` | Von Definition zurückgegeben, vom Assembler gehalten | Neuester `start`/`update`-Rückgabewert, oder `undefined` vor Initialisierung |
| `current` | Assembler | Zuletzt materialisierter Node oder `null` pro target |

Read-only-Context-Felder erfordern keinen tief immutable Business-State. Eine Definition darf ein neues Objekt zurückgeben oder das alte Objekt in-place mutieren und dieselbe Referenz zurückgeben.

Der Assembler übernimmt nur den Rückgabewert. `undefined` aus `start()` oder `update()` zurückzugeben ist ein Vertragsfehler und schlägt sofort fehl; ein Objekt zu mutieren ohne es zurückzugeben ist ebenfalls ungültig.

Eine Definition darf alle `matches` inspizieren, um State oder einen Fallback-Node zu konstruieren, aber sie kann keine Matches hinzufügen oder entfernen, Context-Felder ersetzen oder einen anderen Context mutieren.

#### `start(context, match, reader)`

`start()` ist der einzige State-Initialisierungseinstiegspunkt. Der Assembler ruft ihn auf, wenn der eindeutige Start zuerst erscheint, und übernimmt seinen zurückgegebenen State.

Wenn eine ältere Page die Match-Reihenfolge, die Vorgänger-Antwort des Readers oder Location-Fakten ändert, rechnet der Assembler ab `start()` neu statt einen rückwärtsgerichteten Patch auf alten State anzuwenden.

Der Context kann beim Lauf von `start()` bereits Updates nach dem Start enthalten. Nachdem `start()` initialen State zurückgibt, ruft der Assembler weiterhin `update()` für jeden Post-Start-Match in aufsteigender Log-Reihenfolge auf, sodass die Ingestionsrichtung den finalen Fold nicht ändern kann.

Der `reader` ist nur in `start()` verfügbar. Die Initialisierung kann den nächsten aktiven Context eines angegebenen `kind` strikt vor der aktuellen Start-Seq lesen, aber Business-Code erhält keine allgemeine Schnittstelle zum Scannen interner Engine-Maps.

Jeder neue `start()`-Aufruf ersetzt die vom vorherigen Aufruf aufgezeichneten Reader-Abhängigkeiten, sodass eine Definition, die ihren Query-Zweig ändert, keine veralteten Kanten behält.

#### `reader.previous(kind)`

`reader.previous(kind)` findet den nächsten Context, dessen `candidate.startSeq < current.startSeq` gilt und dessen State initialisiert ist. Er gibt nie einen Context mit gleicher Seq, einen zukünftigen Context oder einen pending Context ohne State zurück.

Das Ergebnis enthält Key, Kind, ID, Start-Seq, read-only State und Matches des Vorgängers. Der Consumer interpretiert diesen State selbst; der Provider pflegt nur seinen State korrekt und muss keine spezialisierte Query-Methode registrieren.

Jede Reader-Query zeichnet eine `{ key, revision, windowGap }`-Abhängigkeit auf. Eine Revisionsänderung eines gematchten Vorgängers replayed den Consumer; ein Miss, während ältere History bleibt, zeichnet einen Window-Gap für ein späteres Prepend auf.

Wenn das Fenster bereits den Session-Anfang erreicht, ist ein Miss ein definitives `undefined`. Wenn `hasMore` true ist, sieht die Definition dasselbe `undefined`, aber der Assembler merkt, dass das Ergebnis vorläufig ist.

Abhängigkeiten zeigen strikt von früheren Starts zu späteren Starts, sodass transitive Replay keinen zeitlichen Zyklus bilden kann. Sowohl die Inbox-Momentanzustandskette als auch Message-Reads der Inbox nutzen diese Einschränkung.

#### `update(context, match)`

`update()` behandelt einen Post-Start-durablen oder transienten Match, den `match()` bereits exakt zum aktuellen `(kind, id)` geroutet hat. Es entscheidet nicht, welcher Context den Input besitzt. Eine Assistant-Definition faltet jedes `assistant/live-chunk`-Update direkt und expandiert einen eingebetteten `assistant/message`- oder `assistant/attempt`-Stream während des History-Replays.

Der Assembler ruft `update()` in aufsteigender `seq`-Reihenfolge auf. Ein Live-Tail-Update kann inkrementell anwenden; jede Nicht-Tail-Insertion, ein neu geladener Start oder eine invalidierte Abhängigkeit verursacht ein vollständiges Replay ab `start()`.

Wenn sich keine Business-Daten ändern, gibt `update()` den bestehenden State zurück. Wenn sich Daten ändern, darf es einen immutable Ersatz zurückgeben oder das bestehende Objekt mutieren und dieses Objekt zurückgeben.

Der Assembler nutzt keine State-Referenzgleichheit, um Publication oder Propagation zu entscheiden. Jedes akzeptierte Update inkrementiert die Context-Revision, markiert ihn dirty und verursacht, dass direkte oder transitive Reader-Consumer neu evaluiert werden.

#### `publication(match)`

`publication()` steuert, wann der neueste State als View-Node materialisiert; es verzögert nicht die synchrone Ausführung von `match()`, `start()` oder `update()`.

| Rückgabewert | Verhalten |
|---|---|
| `immediate` | Eine Benachrichtigung anfordern und im aktuellen Microtask flushen |
| `animation-frame` | Hochfrequente Updates in Materialisierung nach drei Browser-Animation-Frames koaleszieren |
| `none` | Keinen Flush für diesen Match planen; seinen State und Dirty-Marker behalten |

Das Auslassen von `publication()` bedeutet `immediate`. Assistant-Token-Deltas und gepackte Runs nutzen `animation-frame`, unsichtbare Inbox-Contexts nutzen `none`, und Finals, Dependency-Replays und Location-Grenzen publizieren das neueste Ergebnis über einen sofortigen Pfad.

Jedes Live-Delta während des Drei-Frame-Intervalls führt weiterhin `update()` aus, während ein historischer gepackter Run ein Batch-`update()` ausführt. Location-Daten-Publication, `buildViewNode()`, View-Builder-Arbeit und React-Snapshot-Benachrichtigung sind koalesziert; keine Fragmente gehen verloren. Eine sofortige Publication bricht ein ausstehendes Frame-Intervall ab und flusht den neuesten State ohne Verzögerung.

#### `buildLocationData(context, scope)`

`buildLocationData()` lässt eine Definition einen read-only, aus ihrem State abgeleiteten Wert auf einem engine-eigenen Step oder Turn publizieren, ohne mutablen State eines anderen Business zu exponieren. Der Assembler reicht die vorherige Publication zurück an ihren Owner, der exakt diesen Wert zurückgibt, wenn seine Business-Daten unverändert sind. Der Assembler materialisiert immer `step` vor `turn`, sodass Turn-Level-Aggregation Step-Daten lesen kann, die im selben Flush aktualisiert wurden; er ruft `buildViewNode()` erst auf, wenn alle Location-Daten bereit sind.

Eine Definition erhält die Scopes `step` und `turn` getrennt und darf in jeder Phase einen Wert oder `null` zurückgeben. Ein Wert muss die exakten Turn/Step-Koordinaten identifizieren und den `kind` der Definition als Key nutzen. Der Assembler besitzt Ersetzung und Entfernung und lehnt einen anderen Context ab, der denselben Location-Key beansprucht.

`ConversationStepDataMap` und `ConversationTurnDataMap` nutzen Declaration-Merging, um Keys und Werte zu beschränken. Eine Location exponiert nur einen stabilen `data.get(key)`-Reader; Consumer können den Provider-Context nicht erhalten oder seinen State mutieren.

#### `buildViewNode(context, target)`

`buildViewNode()` liest den neuesten Context während der Publication und erzeugt direkt den finalen Business-Node für das benannte target. Der Assembler fügt danach keine generische Aktivitäts-, Tail-Kandidaten- oder Layout-Business-Ebene hinzu.

`null` bedeutet, dass dieser Context für das target noch nicht materialisiert hat. Auf dem gewöhnlichen inkrementellen Pfad kann ein Context, der einen Nicht-Null-Node zurückgegeben hat, später nicht `null` zurückgeben; temporäre Abwesenheit behält den gleich-keyten Node und nutzt die Sichtbarkeitsrepräsentation des targets.

Der Assembler verifiziert `node.key === context.key` und `node.target === target`. Business-Code darf `anchorSeq`, Daten, Location oder Sichtbarkeit ändern, kann aber die Identität innerhalb eines Lifecycles nicht ändern.

`current` lässt eine Definition „nie materialisiert" von „bereits materialisiert und jetzt versteckt" unterscheiden. Die Assistant-Retry-Unterdrückung nutzt es, um illegalen Node-Entzug zu vermeiden.

Eine Definition besitzt höchstens ein View-target; State-only-Definitions lassen sowohl `target` als auch `buildViewNode()` aus. Chat und Trajectory registrieren getrennte Business-Definitions, selbst wenn sie dieselbe durable Event-Familie erkennen, während der geteilte Assembler beiden targets dieselbe Matching-, Replay-, Location- und Publication-Mechanik liefert.

#### Kein generisches `end()`

Die Engine exponiert keinen festen `end()`-Lifecycle. Ein Single-Event-Business vollendet in `start()`, ein Multi-Event-Business zeichnet Vollendung in seinem eigenen Update auf, und ein langlebiges Momentanzustands-Business erzeugt für jedes Event einen neuen Context.

Step- und Turn-Schließung sind externe Location-Fakten und mutieren keinen Business-State. Eine Grenzänderung replayed und baut betroffene Contexts; jedes Business kombiniert seinen eigenen Vollendungs-State damit, ob seine Location geschlossen ist, um normale, laufende oder unterbrochene Präsentation zu erzeugen.

IDs werden nie wiederverwendet. Vollendete Contexts bleiben im aktuellen Fenster und liefern stabile Render-Identität und mögliche Vorgänger-Evidenz für spätere Readers.

### Location ist ein erstklassiger Engine-Fakt

[`ConversationLocationIndex`](../../../../packages/client/ui-conversation/src/client/conversation/location-index.ts) bildet Standard-Events und gepackte Runs auf Locations aus `turn/start`, `step/start`, expliziten Turn- und Step-Payloads, `step/end` und `turn/end` ab. Alle Mitglieder einer Zeile teilen Turn, Step, Block-Index und Delta-Kind, sodass die Zeile einen Location-Eintrag an ihrer ersten `seq` braucht.

Location hat vier Formen: `session`, `turn`, `step` und `unresolved`. Turns und Steps tragen jeweils den Status `open`, `closed` oder `unknown` plus alle geladenen Start- und End-Events.

Jeder Turn und Step trägt auch einen referenzstabilen Location-Daten-Store. Ein Definition-Update ersetzt nur seinen eigenen Key; dieselbe Store-Identität kann durch append oder prepend neue Werte erwerben, sodass Contexts, View-Builder und React-Renderer aufgelöste hierarchieebenen Business-Fakten teilen können, ohne das globale Node-Array zu kopieren oder zu scannen.

`unresolved` bedeutet, dass das aktuelle History-Fenster ausreichende vorangehende Grenzen vermissen lässt; es bedeutet nicht Session-Ebene. Wenn älteres prepend diese Grenzen liefert, korrigiert der Index Match-Locations und replayed nur Contexts, die diese seqs besitzen.

Ein angehängtes Standard-Event erbt nur aktuelle Koordinaten, während eine angehängte Grenze nur ihren besitzenden Turn neu berechnet. Prepend baut Location-Fakten aus dem zusammenhängenden `SessionEventLikeEntry`-Fenster neu auf, aber Referenzstabilitätslogik behält unveränderte Turn- und Step-Objekte.

Der Assembler reicht auch eine referenzstabile Timeline an jeden View-Builder. Businesses pflegen nicht separat Turn-Reihenfolge, Step-Listen, Last-Step-Werte oder Grenz-Maps.

## Drei Input-Fenster-Pfade

„Rückwärts-History-Scannen" beschreibt, dass die UI Pages vom neuesten Tail zum Session-Anfang lädt; es bedeutet nicht, dass eine Definition `update()` rückwärts ausführt. Das Session-Journal validiert den logischen Bereich jedes Records vor der Publication. Unabhängig von der Page-Laderichtung ordnet der Assembler jedes akzeptierte Standard-Event oder gepackte Run nach seiner ersten `seq`.

| Szenario | Input-Bereich | Context- und State-Behandlung | View Builder |
|---|---|---|---|
| Initiales History-Tail oder Resync | Aktuelles vollständiges zusammenhängendes logisches Fenster | Alle Contexts in aufsteigender erster-`seq`-Reihenfolge löschen und neu aufbauen | `replace()` |
| Eine ältere-History-Page laden | Nur bereichsvalidierte frische Standard-Events oder gepackte Runs vor dem Fenster | Bestehende Context-Identität behalten, dann Matches, Locations, Abhängigkeiten und lokale Replays hinzufügen | `apply(upserts)` |
| Live-Append | Ein zusammenhängendes Tail-Event | Definitions matchen und nur die exakten IDs aktualisieren; Grenzen betreffen nur ihren besitzenden Turn | `apply(upserts)` |

### Initiales History-Tail und logisches Rückwärtsscannen

1. `Session.open()` lädt die neueste Tail-Page und reicht ihre zusammenhängenden `SessionEventLike`-Einträge an `replaceWindow(entries, hasMore)`.
2. `replaceWindow` löscht alte Contexts, Start-Seq-Indexes, Seq-Reverse-Indexes, Reader-Abhängigkeiten und die Input-Map.
3. Es sortiert jeden Eintrag nach seiner ersten logischen `seq` und speichert das resultierende aktuelle Fenster.
4. LocationIndex baut Turn- und Step-Fakten für dieses Fenster neu auf.
5. Der Assembler besucht Standard-Events und gepackte Runs in aufsteigender Reihenfolge und ruft jedes gewöhnliche Definitions `match(event)` auf.
6. Jedes Ergebnis erhält oder erzeugt seinen `(kind, id)`-Context und tritt in das geordnete Match-Array dieses Context ein.
7. Ein Start läuft `start()`; ein Tail-Update auf initialisiertem State läuft `update()` direkt.
8. Wenn die Page nur ein Ergebnis oder eine Ressource enthält und ihren Start auslässt, erzeugt die ID trotzdem einen Context und sammelt Matches, während State `undefined` bleibt.
9. Nach dem Matchen aller Inputs prüft der Assembler Reader-Abhängigkeiten erneut, damit frühere Momentanzustände im selben Fenster stabilisieren, bevor spätere Consumer sie lesen.
10. Jeder Context wird dirty, und der nächste Flush baut Location-Daten in Step→Turn-Reihenfolge vollständig neu auf, bevor er `buildViewNode()` für jedes target aufruft.
11. Einige Businesses geben `null` ohne Start zurück; Compaction, Command, Tool-Ergebnis und Turn Error können Fallback-Nodes aus ausreichender Update-Evidenz konstruieren.
12. Jeder View Builder erhält die vollständige Node-Menge und Timeline und etabliert den initialen Snapshot durch `replace()`.

Dieser Pfad startet nur auf der Paginierungsebene von der neuesten Page. State innerhalb der Page berechnet immer vorwärts, sodass dasselbe Fenster unter einer anderen Scan-Richtung keine anderen Business-Ergebnisse erzeugt.

Ein Context ohne Start ist kein Fehler. Er ist ein pending Aggregationscontainer, der auf eine ältere Page wartet; das `buildViewNode()` dieser Definition entscheidet, ob die Evidenz ihn bereits sichtbar macht.

Wenn ein Update mit derselben ID in Log-Reihenfolge echt früher ist als der Start, statt nur zuerst geladen, schlägt Replay mit einem Protokollfehler fehl, nachdem der Start ankommt. Ankunftsreihenfolge darf umgekehrt sein; Business-Log-Reihenfolge nicht.

### Eine neu geladene ältere Page prependen

1. `Session.loadOlder()` fordert die unmittelbar vorangehende Page mit der aktuellen `baseSeq` an und verifiziert zuerst Kontinuität zwischen Page-Tail und aktuellem Fenster.
2. Die Session prepended die akzeptierten Standard- oder gepackten Einträge in ihr eigenes Fenster und reicht nur diese Page an `assembler.prepend(entries, hasMore)`.
3. Das Journal hat vollständige Duplikatbereiche bereits entfernt und partielle Überlappungen abgelehnt; der Assembler sortiert die frische Page nach erster `seq`.
4. Bestehende Contexts, State, aktuelle Nodes und View-Builder-Instanzen bleiben intakt.
5. LocationIndex baut Fakten über den erweiterten vollständigen Input neu auf und meldet seqs, deren Location-Identität sich tatsächlich änderte.
6. Contexts, die diese seqs besitzen, aktualisieren ihre Match-Locations und replayen ab Start; unbeteiligte Contexts nehmen nicht am Location-Replay teil.
7. Frische Standard-Events und gepackte Runs treten durch denselben Definition-Matcher und dieselbe stabile ID in bestehende oder neue Contexts ein.
8. Wenn die neue Page den Start eines pending Context liefert, initialisiert dieser Context ab dem Start und wendet dann jedes bereits gesammelte Update in aufsteigender Reihenfolge an.
9. Wenn die Page einen näheren Reader-Vorgänger etabliert, eine Vorgänger-Revision ändert oder einen Window-Gap entfernt, rechnet der Consumer ab `start()` neu.
10. Reader-Abhängigkeiten propagieren Replay zu späteren Start-seqs; kein Event wird innerhalb des Propagations-Batch rückwärts angewendet.
11. Eine leere Page, die `hasMore` von true zu false ändert, prüft ebenfalls Abhängigkeiten erneut und löst ein vorläufiges `undefined` zu definitiver Abwesenheit auf.
12. Der Flush republiziert Step/Turn-Location-Daten und target-Nodes nur für dirty Contexts und reicht dann Nicht-Null-Ergebnisse an View-Builder-`apply()` als `upserts`.

Prepend behält bestehende Context-Keys und aktuelle Node-Identität. Eine Page kann historische Keys an der Front der Chat-`order` hinzufügen oder Anchor, Location, Sichtbarkeit oder Daten eines bestehenden Node korrigieren, aber sie erzeugt keine unbeteiligten Business-Contexts neu.

Bei einer strukturellen Änderung berechnet der Chat-Builder die sichtbare `order` und den sekundären Location-Index aus seinem keyten Store neu. Das ist View-Index-Arbeit; es läuft weder jede Business-Definition erneut noch ersetzt es unveränderte Node-Werte.

Reader-Gap-Reparatur ist der größte algorithmische Unterschied zwischen prepend und gewöhnlichem append. Eine Page kann sowohl sichtbare historische Nodes hinzufügen als auch spätere Inbox-Momentanzustände und die davon abhängigen Message-Klassifikationen ändern.

### Vorwärts-Live-Append

1. Die Session akzeptiert nur ein Standard-Live-Event unmittelbar nach der aktuellen logischen Tail-Seq; sie dedupliziert Überlappung und führt Tail-Page-Reparatur aus, bevor sie einen Gap akzeptiert.
2. Ein Nicht-Grenz-Event tritt inkrementell in die aktuellen Turn- und Step-Koordinaten ein; ein Grenz-Event aktualisiert Location-Fakten für seinen besitzenden Turn.
3. Der Assembler ruft `match()` einmal auf jeder gewöhnlichen Definition für dieses Event auf und scannt kein Context-Set einer Definition.
4. Jedes erfolgreiche Ergebnis lokalisiert direkt einen Context über `(kind, id)`.
5. Eine neue ID erzeugt einen Context; ein normales Tail-Update für eine bestehende ID ruft `update()` einmal auf.
6. Ein Start oder jede vor dem Tail eingefügte Evidenz nutzt vollständiges `replayContext()` und behält dieselbe Vorwärtsreihenfolge-Semantik.
7. Nachdem eine Context-Revision sich ändert, replayen nur aufgezeichnete Reader-Dependents.
8. Location-Close aktualisiert betroffene Matches innerhalb ihres besitzenden Turn und replayed diese Contexts, sodass unvollendete Assistant-, Tool- oder Retry-Werte unterbrochene oder abgebrochene Präsentation erwerben können.
9. Der Assembler nimmt die höchste Publication-Dringlichkeit unter allen matchenden Definitions: `immediate` schlägt `animation-frame`, das `none` schlägt.
10. Die Session routet immediate-Arbeit zum Microtask-Notifier und animation-frame-Arbeit zum RAF-Notifier.
11. Der Flush aktualisiert Step/Turn-Location-Daten für dirty Contexts, ruft dann `buildViewNode()` auf und reicht die Upserts dieser Transaktion und die neueste Timeline an jeden View Builder.
12. Der neue React-Snapshot nutzt stabile Context-Keys wieder; derselbe Tool running→settled- oder Assistant streaming→final-Wert bewegt sich nie über Parents hinweg.

Appends Business-Matching-Kosten sind die Definitions-Anzahl plus die tatsächlich aktualisierten Contexts, unabhängig von der historischen Context-Anzahl. Reader-Consumer und Location-Schließung fügen Replay proportional zu echten Abhängigkeiten oder dem besitzenden Turn hinzu.

Eine strukturelle Chat-`order`-Änderung kann die aktuell sichtbaren Keys trotzdem umordnen. Ein rein datenbezogenes Update ersetzt einen Keyed-Store-Node und berührt seinen Location-Index. Die Garantie ist, dass unbeteiligte Businesses nicht neu falten und unveränderte Node-Identität behalten, nicht dass jede View-Index-Operation konstante Komplexität hat.

### Konsistenz über replace, prepend und append

Alle drei Pfade bewahren dieselben Invarianten: Context-Matches sind seq-geordnet, State faltet vorwärts ab einem eindeutigen Start, Reader sieht nur strikt vorangehende aktive Contexts, Location-Daten publizieren in Step→Turn-Reihenfolge, und der Node-Key hängt nur von kind und ID ab.

`replaceWindow` ist der niederfrequente vollständige Ersatz für initiales Öffnen, Resync, Gap-Reparatur und Registry-Änderungen; es implementiert kein gewöhnliches Load-Older. Sowohl `prepend` als auch `append` behalten bestehende Builder- und Context-Identität.

Page-Größe, Record-Packing, die Anzahl der History-Loads und RAF-Koaleszierung beeinflussen nur, wann Evidenz ankommt oder publiziert. Sie ändern finalen Context-State und Nodes für gleiche logische Evidenz nicht.

## Wie eingebaute Businesses Definitions nutzen

### Matching, ID und State

| Business / `kind` | Stabile ID | Start-Match | Update-Matches | State und Context-übergreifende Reads |
|---|---|---|---|---|
| Next-step Inbox / `inbox-next-step` | Splice-Event-Seq | Jedes `agent/inbox/spliced` mit Ziel next-step | Keine | Message-IDs an persistenten Splice-State anhängen; einmal pro Claim materialisieren und den geteilten aktuellen Claimed-Batch an Message exponieren |
| Message / `input-message` | Message-ID | Append-Surface `user/message` | Keine | Quelle für eine Kontext-Message nutzen oder die nächste next-step-Inbox lesen, um User von Steering zu unterscheiden |
| Request Prompt / `request-prompt` | Header-Event-Seq | Jedes `request/header` | Keine | Den vorangehenden Request Prompt über Reader lesen, den vollen Prompt-State behalten und System/Tool-Änderungen klassifizieren |
| Assistant / `assistant-step` | `turn:step` | `step/start` | Live `assistant/live-chunk`, durables `assistant/message` oder `assistant/attempt` und gleich-Step Retry | Blöcke, Usage, First-Token-Zeit, Abrechnungsevidenz und retry-versteckten State aggregieren, dann gleich-keyte Step-Daten publizieren |
| Tool / `tool-call` | Root-Call-ID | Root `tool/call` | Root-Ergebnis und Code-Dispatch-Start/Ergebnis | Die Root-, Kinder- und Parent-Map aggregieren; Dispatch-Events routen exakt über `rootCallId` |
| Command / `command` | Command-ID | `command/run` | `command/done` und Compact-Lifecycle/Checkpoint-Events mit Source-Command-ID | Command-Ergebnis und Manual-Compaction-Evidenz aggregieren |
| Automatische Compaction / `compaction` | Compaction-ID | `compaction/start` ohne Source-Command-ID | Summary, End und Ersatz-Checkpoint | Summary/Checkpoint aggregieren; ausreichende Checkpoint-Evidenz trägt Fallback ohne Start |
| Retry / `model-retry` | Retry-ID | Attempt 1 `llm/retry` | Spätere `llm/retry` und `llm/retry-started` | Die Attempts und den scheduled/started-State einer RetryId aggregieren |
| Turn Error / `turn-error` | Turn-Nummer | `turn/start` | Error `turn/end` | Das terminale Scheitern aggregieren; die Retry-History des Turns rendert durch Retry und versteckt diese Zeile nie |
| Turn Tail / `turn-tail` | Turn-Nummer | `turn/start` | Assistant, Retry, `step/end` und `turn/end` | Turn-End behalten, Assistant-Daten jedes Steps lesen und Turn-Daten publizieren; vollständige Matches nutzen, um den visuellen Tail-Anchor zu wählen |
| Deliverables / `deliverables` | Turn-Nummer | `turn/start` | Tool-Calls/Ergebnisse in diesem Turn | Erfolgreiche Mutationspfade aggregieren und Turn-Daten publizieren, ohne einen View-Node zu erzeugen |
| Unknown Fallback / `unknown-surface` | Event-Seq | Append-Surface-Event, das keine gewöhnliche Definition geclaimt hat | Keine | Rohe Typ/Daten für den JSON-Fallback behalten |

### Chat-Node- und History/Live-Verhalten

| Business | `publication()` | Chat-Ausgabe | History- und Runtime-Verhalten |
|---|---|---|---|
| Inbox | `none` | Kein Node | Next-step-ID-State entlang der Reader-Kette neu berechnen, wenn prepend frühere Splices liefert; next-turn erzeugt keinen Chat-Context |
| Message | Standardmäßig immediate | `user`, `steering` oder `context` | Window-Gap-Reparatur kann denselben Message-Key reklassifizieren |
| Request Prompt | Standardmäßig immediate | Ein nichtleerer `system-prompt` für den initialen Request, jede explizite Serie oder eine echte System-Änderung | Der erste Header eines Steps ankert vor seinen Request-Messages; prepend kann einen konservativ gerenderten resume verstecken, nachdem sein vorangehender Header das System als unverändert beweist |
| Assistant | RAF für skalare Chunks und gepackte Runs, immediate für final, none für reine Usage/Finish | Gleich-keyter `assistant-step` mit running/settled/interrupted-Status | Skalare und gepackte Reducer sind äquivalent; Matches tragen Fallback ohne `step/start`; Location-Close erzeugt Unterbrechungspräsentation |
| Tool | Standardmäßig immediate | Ein rekursives `tool-call`-Root mit allen `subCalls` | Ein ergebnis-nur History-Fenster trägt Fallback; running→settled behält seinen Key |
| Command | Standardmäßig immediate | Gewöhnliches `command` oder integriertes `manual-compaction` | Checkpoint-Ankunft kann den Anchor ändern, ohne den Context-Key zu ändern |
| Compaction | Standardmäßig immediate | `compaction`-Marker | Ein Checkpoint kann vor dem Start rendern; ein älterer Start löst Vorwärts-Replay aus |
| Retry | Standardmäßig immediate | Ein `model-retry`-Node mit allen Attempts | Mehrere Retries aktualisieren einen Key; Location-Close stellt den letzten geplanten Attempt als abgebrochen dar |
| Turn Error | Standardmäßig immediate | `turn-error` bei terminalem Scheitern | Error-End trägt Fallback ohne Start; die abgerechnete Retry-Kette des Turns rendert daneben |
| Turn Tail | Immediate nur für `turn/end`; sonst none | Unabhängiger `turn-tail`-Footer | Closing/Metriken aus Step-Assistant-Daten berechnen und gleich-Turn-Matches nutzen, um den Anchor zu wählen |
| Deliverables | Standardmäßig immediate | Kein Node | Tool-Abrechnung aktualisiert Turn-Daten inkrementell; der Turn-Tail-Extension-Slot liest produzierte Dateien |
| Fallback | Standardmäßig immediate | `unknown` JSON-Zeile | Deckt nur Append-Surface-Events ab; ein gewöhnliches Business, das ein Event geclaimt, aber noch nicht gerendert hat, dupliziert es nicht |

Inbox demonstriert, dass jedes Event ein Start-nur-Momentanzustands-Context sein kann; nicht jedes Business braucht ein Start/Update-Paar. Reader verlinkt jeden next-step-State zum vorherigen gleich-kind-Context statt eine Lifecycle-ID für die gesamte Inbox zu erfinden. Der State selbst teilt immutable Pending-Splice-Nodes und ein aktuelles Claimed-Batch-Set, während unkonsumierter next-turn-Input außerhalb von Conversation bleibt, weil keine Chat- oder Trajectory-Klassifikation ihn liest.

Request Prompt demonstriert geteilte pure Interpretation ohne geteilten target-State: Chat und Trajectory rufen `inspectRequestPrompt()` aus ihren eigenen Definitions. Die Funktion kanonisiert den vollen Header und klassifiziert model-sichtbare System/Tool-Unterschiede; jedes target wählt dann seine eigene Ausgabe. Chat materialisiert ein nichtleeres initiales System-Feld, eine echte System-Änderung und jeden `series`-Snapshot, der explizit eine Message-Serie beginnt oder einer Surface-Ersetzung folgt. Ein unveränderter `resume` bleibt in Trajectory- und Rekonstruktions-State, wiederholt aber die sichtbare Chat-Zeile nicht, sobald sein Vorgänger geladen ist. Gewöhnliche append-only spätere Turns schreiben keinen weiteren unveränderten Header. Der erste Header in einem Step folgt dem Provider-Envelope statt der Header-Event-Position: Step eins nutzt den besitzenden Turn-Start und spätere Steps nutzen ihren Step-Start, wodurch das System-Feld vor die User-Role-Messages des Requests gesetzt wird; ein späterer Header im selben Step bleibt an seinem eigenen Event nach der Surface-Umschreibung, die die neue Serie begann. Wenn der vorangehende Header außerhalb eines partiellen Fensters liegt, bleibt ein nicht-`initial`-Header an seinem eigenen Event und rendert konservativ. Prepend eines identischen Vorgängers versteckt einen unveränderten resume, ohne seinen stabilen Node-Key zurückzuziehen; eine echte Änderung bleibt sichtbar. Jeder Header ist ein voller Snapshot, sodass ein zuerst geladener `resume`-, `change`- oder `series`-Header sein System-Feld rendern kann, ohne einen Vergleich zu ungeladener History zu fabrizieren ([resume-Präsentationsentscheidung](../bug-fix/2026-09-03-resume-headers-do-not-repeat-system-prompts.de.md)).

Retry, Assistant und Turn Tail demonstrieren unabhängige Claims auf ein Event. Jede Definition aktualisiert nur ihren eigenen State und erzeugt ihren eigenen atomaren Chat-Node.

Assistant, Turn Tail und Deliverables demonstrieren geschichtete Location-Daten-Komposition. Assistant schreibt `assistant-step`-Daten für jeden Step; Turn Tail leitet `turn-tail`-Daten aus diesen Step-Werten ab; Deliverables pflegt unabhängig `deliverables`-Daten für denselben Turn. Consumer lesen nur declaration-gemergte Keys, scannen nicht die Nodes eines anderen Business und können den Provider-Context-State nicht erhalten.

Tool und Command demonstrieren Multi-Event-Aggregation: Der Produzent liefert eine geteilte ID, und der Context baut einen Baum oder integriert Compaction intern statt Paarung in den Chat-Builder zu schieben.

Compaction und historische Tool-Ergebnisse demonstrieren Business-Fallback ohne Start. Die Engine erzwingt nicht „kein Start heißt kein Rendering"; jede Definition entscheidet, ob aktuelle Matches ausreichen.

Retry demonstriert die State/Location-Trennung. Scheduled und started gehören zum Retry-State, während Step- und Turn-Schließung zur Engine-Location gehört; `buildViewNode()` kombiniert sie zu abgebrochener Präsentation.

Unknown Fallback demonstriert Registry-Ownership: Es behandelt nur Append-Surface-Events, die kein gewöhnlicher Matcher geclaimt hat, und erzeugt keinen doppelten Node nur weil ein geclaimter Context vorübergehend `null` zurückgibt.

## View-Builder und React-Identität

[`ConversationViewRegistry`](../../../../packages/client/ui-conversation/src/client/conversation/view-registry.ts) speichert eine unabhängige Builder-Fabrik für jedes target und teilt keine Ordnung oder Caches einer Session.

Eine Shell-Auswahl oder der erste Subscriber einer target-Quelle fügt dieses target dem monotonen active-target-Set der Session hinzu. Der Assembler indiziert jeden Context unter seinem einzigen target, erzeugt aber keinen Builder, Node oder Snapshot für ein inaktives target. Erste Aktivierung flusht ausstehende target-neutrale Arbeit, erzeugt den Builder und ruft `replace({ nodes, timeline })` einmal aus den aktuellen Contexts dieses targets auf.

Die Shell löst die persistierte Auswahl synchron auf, wenn eine Session-Bindung verfügbar wird, wenn eine gecachte Bindung aktuell wird oder wenn das View-Roster sich ändert, und aktiviert dann explizit diese registrierte View oder den Chat-Fallback. Tab- und Fokus-Aktionen aktivieren ihr aufgelöstes target, bevor sie Auswahl-State aktualisieren. Eine leere Session rendert den View-Slot nicht, und `ConversationSnapshot.activeTargets` leitet nur aus materialisierten aktiven Snapshots ab, ohne inaktive target-Contexts nach Aktivität abzufragen.

Gewöhnliche prepend- und append-Flushes rufen `apply({ upserts, timeline })` nur für aktive targets auf. Vollständige Fenster-Ersetzung und Registry-Rebuild rufen `replace()` nur für aktive targets auf. Unsubscription entfernt ein target nicht, sodass die Rückkehr zu einer geöffneten View sie nicht neu aufbaut.

[`ChatSnapshotBuilder`](../../../../packages/client/ui-chat/src/client/conversation-nodes/chat-snapshot-builder.ts) pflegt `order`, einen keyten `nodes`-Store mit identitätsstabilen Node- und Turn-Process-Quellen, den Turn/Step-`locations`-Index, `timeline` und das `legacy`-Slice, das StatsPills nutzt und in öffentliche Top-Level-Kompatibilitätsfelder gespiegelt wird.

Nur ein neuer Key oder eine Änderung an `anchorSeq`, Sichtbarkeit oder Location-Identität macht ein Chat-Update strukturell. Eine gewöhnliche Inhaltsänderung baut `order` nicht neu auf; der keyte Node-Store ersetzt den Wert dieses Keys und publiziert nur seine Quelle. Der Turn-Process-Projektor berechnet Cross-Node-Präsentation nur für einen Turn neu, dessen Struktur, Spezifikation oder Status sich änderte, und publiziert dann nur die Process-Quellen dieses Turns.

Bei einer strukturellen Änderung berechnet der Builder sichtbare Ordnung aus aktuellen Store-Werten und nutzt unveränderte Index-Arrays per Referenz wieder. Prepend darf frühere History-Keys hinzufügen, append darf einen Key am Tail oder seinem Business-Anchor hinzufügen, und Ordnung benennt bestehende Keys nie um.

[`ChatView`](../../../../packages/client/ui-chat/src/client/chat/ChatView.tsx) traversiert nur `order` und löst die zwei stabilen Quellen für jeden Key auf. Jeder [`ChatNodeSeat`](../../../../packages/client/ui-chat/src/client/chat/ChatNodeSeat.tsx) bleibt in derselben Parent-Liste unter seinem Context-Key, subskribiert nur seine Node- und Turn-Process-Quellen und dispatcht den `'conversation.chat.node'`-keyten Slot nach `node.kind`.

[`ChatNodeDataMap`](../../../../packages/client/ui-chat/src/client/contract/chat-nodes.ts) ist eine declaration-gemergte Renderer-Payload-Registry. Jedes Business-Modul registriert seine eigene Definition und keyten Renderer; `registerConversationNodes()` und `registerChatNodeRenderers()` assemblieren nur diese unabhängigen Beiträge und interpretieren Business nicht über eine geschlossene Union oder einen zentralen Switch. Built-ins leben in `ui-chat`, und diese Typ- und Registrierungsgrenze erlaubt einem Business, in ein unabhängiges Paket zu ziehen, ohne den Chat-Dispatcher zu ändern.

Der Chat-Eintrag in `conversation.view` registriert `ChatNodeTurnDataInjected` einmal, wenn er den `conversation.chat.node`-Child-Slot deklariert. `ChatNodeSeat` reicht den stabilen Turn-Daten-Store des Nodes als `hookContext`; der Slot-Renderer bindet `useTurnData(businessKey)` direkt an diesen Store. Jeder keyte Chat-Renderer liest daher stark typisierte, read-only Daten aus dem Turn seines eigenen Node, und der Assistant-Renderer hat keine spezielle Injektionsautorität.

Slot-Level-kontextuelle Hooks und entry-eigene `inject.hooks` bleiben unabhängige Pfade. Letztere binden weiterhin nur registrierungseigene Observables. Erstere cacht Definitionen nach stabiler Slot-Inject-Face-Identität und bindet ihre Fabrik und Hook pro stabilem Render-Vorkommen. `useTurnData()` subskribiert `turn.data.source(key)`, sodass ein anderer Location-Daten-Key oder eine Session-Snapshot-Publication es nicht benachrichtigt.

Der Standard-`useSession` bleibt jedem session-scoped Slot-Renderer verfügbar, obwohl `ChatNodeSeat` weder ihn noch aggregiertes `useChat` braucht. `useTurnData()` verengt den gemeinsamen Read-Pfad statt als Permission-Sandbox zu wirken. Ganz-Fenster-Statistiken oder beliebige Objekt-Indexes dürfen den Session-Snapshot weiterhin explizit lesen, sind aber nicht als current-Node-Turn-Daten modelliert.

Assistant streaming zu final und Tool running zu settled bleiben in einem Seat, während sie seine Daten und nötigen Ordnungseigenschaften aktualisieren. Abrechnung setzt daher komponentenlokalen State nicht durch einen Parent-Zug zurück.

Wenn Business-Logik einen materialisierten Node bewusst auf hidden ändert, verlässt er die sichtbare Ordnung und remountet beim Wieder-Sichtbar-Werden. Das ist expliziter Business-Entzug von Präsentation, getrennt von der Stable-Seat-Garantie für running→settled.

Der konkrete Tool-Renderer bleibt von der [`ui-tool`-Ownership-Entscheidung](../../archived/architecture/2026-08-08-client-tool-presentation-ownership.md) geregelt. Tool Definition liefert rekursive Root/Subcall-Daten, und `ui-tool` dispatcht konkrete Präsentation über den Tool-Namen-keyten Slot.

Trajectory registriert eigene target- und Business-Definitions gegen denselben Assembler und dasselbe `SessionEventLikeEntry`-Fenster wie Chat. Sein target-Builder bewahrt das stage-orientierte Read-Modell, ohne das legacy-Slice des Chat-Builders zu konsumieren oder einen unabhängigen History-Fold zu laufen. Chat und Trajectory halten unabhängige skalare und gepackte Assistant-Reducer; target-spezifische Definitions ändern die geteilten Context-, Reader- oder Location-Verträge nicht.

Die target-spezifischen Trajectory-Definitions, das bewahrte Stage-Modell, Steering-Adaption, Komplexitätsschranken und Präsentations-Hotpaths gehören der [Trajectory-Context-Assemblierungsentscheidung](../../archived/architecture/2026-08-11-trajectory-conversation-context-assembly.md).

## Runtime- und Render-Pfad

```text
SessionEventLike window
  -> ConversationNodeAssembler
       -> Definition.match(event) -> (kind, id, start/update)
       -> Context matches + State + Location
       -> Definition.buildLocationData(step -> turn)
            -> StepLocation.data / TurnLocation.data
       -> Definition.buildViewNode() for each active target
  -> active target View Builder
       -> chat: ChatSnapshotBuilder -> ChatView -> keyed ChatNodeSeat
       -> trajectory: TrajectorySnapshotBuilder -> stages/layout/table
```

## Verifikation

Runtime-Tests pinnen Definition-Lifecycle-Registrierung, Exakt-ID-Append, Update-vor-Start-Sammlung gefolgt von Vorwärts-Replay nach Start, Prepend-Identität, Reader-Window-Gap-Reparatur, transitive Abhängigkeiten, Location-Schließung, Step→Turn-Daten-Phasenreihenfolge, Location-Daten-Ersetzung, Publication-Kadenz, illegalen Entzug, Erst-Subscription-Aktivierung, monotone aktive targets und Per-target-Builder.

Conversation-Tests decken jede eingebaute Chat-Definition, Assistant-Step-Daten, Turn-Tail- und Deliverables-Turn-Daten, Chat-Ordnung und strukturelles Teilen, Selektor-Isolation, Assistant- und Tool-running-zu-settled-Identität, verschachtelten Code-Dispatch, Steering, Compaction, Retry, Unterbrechung, Load-Older-Ankern und Slot-Dispatch ab. Trajectory-Tests decken seine unabhängig registrierten Message-, Assistant-, Tool-, Compaction-, Request-Header- und Grenz-Definitions zusammen mit dem bewahrten stage-orientierten View-Modell ab.

Slot-Typ/Runtime-Tests pinnen erforderliches parent-gestelltes gemeinsames inject, den `hookContext`-Typ, Hook-Isolation über Node-Contexts, stabile Fabrik/Hook-Identität und das Fehlen von Business-Renderer-Rerenders für unbeteiligte Session-Publications. Bestehende entry-eigene Observable-Hook-Tests pinnen weiterhin den Pfad, der keine kontextuelle Fabrik nutzt.

Assemblierte Web-Snapshots, GUI-Tests und Browser-Szenarien decken den echten Plugin-Graph ab. Browser-Evidenz vergleicht Assistant streaming→settled, Bash running→settled und PTC-Modus-Root plus verschachtelte Subcalls gegen das Master-Layout.

History-Pfad-Tests decken vollständiges replace, nicht-überlappendes prepend, Vollbereichs-Deduplizierung, Partial-Overlap-Ablehnung, Leer-Page-`hasMore`-Konvergenz und skalaren Live-Append ab. Skalare und gepackte Repräsentationen derselben Assistant-History erzeugen gleiche Chat- und Trajectory-State, Timing-Grenzen und finale Nodes; ein gepackter Run bleibt ein Match durch replace, prepend, Location-Replay und Registry-Rebuild.

## Betrachtete Alternativen

**Den zentralisierten Session-Transcript-Fold behalten und nur Helper extrahieren.** Abgelehnt: Business-Identität, History-Replay und Cache-Invalidierung würden weiterhin einem geschlossenen Switch gehören; Funktionen zu verschieben würde keine unabhängige Ownership etablieren.

**React-Renderer Session-Events scannen lassen.** Abgelehnt: Jede View würde Matching und Lifecycle-State duplizieren, React würde Business-Autorität, und Paginierung und Streaming würden unbeteiligte Komponentenbäume neu berechnen.

**Globale Nodes oder Location-Indexes an jeden Business-Renderer reichen.** Abgelehnt: Business-Komponenten würden ihren aktuellen Turn/Step scannen und ableiten, und ihr Subscription-Scope würde mit dem Fenster wachsen. Eine Definition publiziert Aggregate auf eine engine-eigene Location, und ein Renderer liest nur die Location-Daten seines eigenen Node.

**Für jedes neue Event jeden Context einer Definition aufrufen.** Abgelehnt: Append-Kosten würden mit der History wachsen, und `update()` würde Matching mit Konversion kombinieren. Context-freies `match(event)` findet zuerst die ID, danach aktualisiert nur ein Context.

**Einen Definition-Matcher Contexts lesen oder History scannen lassen.** Abgelehnt: Matching würde von der Ingestionsrichtung abhängen, Ergebnis-zuerst-History-Pages könnten Ownership nicht unabhängig bestimmen, und Live-Append würde zum Suchen offener Objekte zurückfallen.

**Einen Rückwärts-State-Fold für Rückwärts-History-Scannen definieren.** Abgelehnt: Jedes Business würde zwei inverse Algorithmen pflegen, und Löschung, nicht invertierbare Aggregation und Context-übergreifende Abhängigkeiten wären schwer äquivalent zu halten. Geordnete Matches gefolgt von Vorwärts-Replay ab Start bewahren eine Business-Bedeutung.

**Einen separaten Live-Stream-Matcher und Update-Lifecycle hinzufügen.** Abgelehnt: Ein zweiter Definition-Pfad würde Dispatch, Replay, Publication und Context-Typen duplizieren. Client-only `assistant/live-chunk` und durable Abrechnungen nutzen den bestehenden `match(event)`- und `update(context, match)`-Lifecycle; nur der Event-Diskriminator und die Stream-Expansion unterscheiden sich.

**Inbox zu einem erstklassigen Engine-Konzept oder einem fensterweiten Context machen.** Abgelehnt: Inbox ist gewöhnlicher Business-State und gehört nicht in die generische Engine. Per-Splice-Momentanstate plus strikt rückwärtsgerichteter Reader tragen prepend, append und Message-Lookup zusammen.

**Spezialisierte Query-Methoden für Business-übergreifende Reads registrieren.** Abgelehnt: Consumer würden weiterhin von Provider-APIs abhängen, und jede neue Beziehung würde eine zentrale Schnittstelle erweitern. Reader exponiert den read-only-Vorgänger-Context eines benannten kind; der Provider schreibt nützlichen State und der Consumer interpretiert ihn.

**Einen Location-Daten-Consumer den Provider-Context-State direkt lesen lassen.** Abgelehnt: Der Consumer würde von der mutablen internen Form eines anderen Business abhängen und könnte nicht ausdrücken, welcher Turn/Step den Wert besitzt. Declaration-gemergte Daten-Maps exponieren nur den Provider-gewählten read-only-Wert und engine-eigene Koordinaten.

**Location-Daten jeder Definition nach State-Identität cachen.** Abgelehnt, weil eine Definition dasselbe State-Objekt mutieren und zurückgeben darf und ihre Location-Daten auch von Match-Locations oder von einer anderen Definition publizierten Werten abhängen können. Stattdessen entscheidet jede Definition, ob sich ihr Business-Wert änderte, und gibt die vorherige Publication unverändert zurück, wenn nicht.

**Generische `end()`-, prepared- oder window-reset-Lifecycles hinzufügen.** Abgelehnt: Businesses haben unterschiedliche Vollendungsbedingungen, und ein Paginierungs-Gap ist kein Business-Lifecycle. Business-Events aktualisieren State, Location-Close löst Replay/Build aus, und Reader-Abhängigkeiten besitzen Paginierungs-Invalidierung.

**Eine Event-Definition über Chat und Trajectory wiederverwenden, indem in `buildViewNode(target)` verzweigt wird.** Abgelehnt: Die Views brauchen unterschiedlichen Business-State und Zwischenrecords, sodass eine geteilte Definition jedes Paket die Bedingungen und Payloads des anderen tragen ließe. Getrennte target-eigene Definitions halten diese Entscheidungen lokal, während sie die Ingestions- und Lifecycle-Verträge des Assemblers teilen.

**Ein target deaktivieren, wenn sein letzter Subscriber geht.** Abgelehnt: Die Rückkehr zur View würde ihren vollständigen Snapshot wiederholt neu aufbauen. Subscription etabliert erste Nutzung; das target bleibt dann für die restliche Session-Lebensdauer inkrementell.

**Ein generisches Layout-Modell über finalen Business-Nodes hinzufügen.** Abgelehnt: Aktivitäts-, Tail-Kandidaten- und Layout-Enums würden aktuelle Chat-Business-Semantik wieder in der Engine zentralisieren. Finale Nodes tragen renderer-benötigte Daten direkt und teilen nur Identitäts-, Ordnungs- und Location-Fakten.

**Den Turn-Daten-Hook nur auf dem Assistant-Renderer registrieren.** Abgelehnt: Current-Node-Location-Zugriff ist eine gemeinsame Fähigkeit des `conversation.chat.node`-Slots, nicht eines Business-Renderers. Der Parent-Chat-Eintrag registriert gemeinsames inject einmal, und jeder keyte Renderer teilt denselben stark typisierten Vertrag.

**Laufende Assistant- oder Tool-Werte in einem unabhängigen Tail-Container halten.** Abgelehnt: Abrechnung würde sie über React-Parents hinweg bewegen, und ein stabiler Business-Key könnte Remount nicht verhindern. Eine keyte Ordnung erlaubt Daten- und Positionsänderungen ohne Seat-Identität zu ändern.

## Konsequenzen

Ein neuer Business-Node kann seinen Matcher, State-Transitionen, optionale Location-Daten, finalen target-Node und Renderer lokal registrieren, ohne den Business-Switch der Session zu ändern. `ChatNodeDataMap` und die Location-Daten-Maps lassen ein Business-Paket stark typisierte Daten in den Vertrag mergen; jedes beteiligte Event muss trotzdem eine stabile, aus diesem Event allein ableitbare ID exponieren.

Host-Business-Pakete declaration-mergen ihre durable Event-Member in `@deepseek-ai/dsh-session/types`, während Client-Definitions die entsprechenden Business-Paket-`/types`-Subpfade type-only importieren. Das Ergänzen der deklarierenden Schnittstelle statt eines Re-Export-Barrels gibt den unabhängigen Host- und Client-TypeScript-Programmen dasselbe Event-Narrowing, ohne Host-Runtime in den Client-Graph zu ziehen.

Initiales Tail, älteres prepend und Live-Append teilen eine Menge von Context-Invarianten. Fehlende Starts, Reader-Window-Gaps, unbekannte Locations und gepackte hochfrequente Deltas sind explizite Engine-Zustände und brauchen keinen richtungsspezifischen Business-Cache.

Append scannt keine historischen Contexts; prepend replayed nur Contexts, deren Matches, Locations oder Reader-Antworten sich tatsächlich änderten. Eine strukturelle Chat-Änderung darf weiterhin sichtbare Ordnung und Indexes neu berechnen, läuft aber keine unbeteiligten Business-Folds erneut und ersetzt keine unveränderte Node-Identität.

Die Trennung von State-Updates und Publication-Kadenz faltet jedes Live-Assistant-Delta und jeden historischen gepackten Run, während höchstens einmal pro drei Animation-Frames materialisiert wird. Die Assistant-View liest dieselbe Projektion, die die vorangehende Step-Location-Phase installierte. Turn Process gibt seine bestehenden offenen Daten und seinen Node für fortsetzende Assistant-Chunks zurück, ohne sie erneut abzuleiten oder zu kodieren, und Turn Tail verschiebt seinen Vollständigkeits-Match-Scan bis `turn/end`. Step- oder Turn-Close und finale Events publizieren den neuesten State sofort.

Ein inaktives target behält Definition-State und einen target-Context-Index, aber keinen Builder, materialisierte Nodes oder Snapshot. Die gemountete eingebaute oder Drittanbieter-View aktiviert ihr eigenes target durch normale Subscription; zuvor geöffnete targets empfangen weiterhin inkrementelle Updates.

Steps und Turns sind stabile Zuhause für Business-übergreifende Aggregate. Turn Tail und Deliverables leiten ihre Werte ohne Renderer-Scans globaler Nodes ab; Slot-Level-`useTurnData()` verengt gemeinsame Reads auf den Turn des aktuellen Node, und keyte Location-Quellen isolieren unbeteiligte Updates.

Inbox-Context-Retention wächst mit Splice-Anzahl und Claimed-Message-Anzahl statt mit ihren kumulativen Präfixen. Das entfernt doppeltes State-Wachstum, dedupliziert aber keinen Message-Inhalt in durable Session-Events und begrenzt nicht das geladene Event-Fenster.

Die Kosten sind neue Runtime-Verträge für Registry, Assembler, Location-Daten, Dependency-Replay und Per-target-Builder, plus parent-eigenes gemeinsames inject und per-occurrence `hookContext` in UI-Slots. Definitions, die Assistant-Deltas konsumieren, pflegen außerdem äquivalente skalare und gepackte Update-Zweige. Definition-Autoren müssen stabile IDs, eindeutige skalare Starts, Vorwärts-Replay, Step→Turn-Publication-Reihenfolge, read-only-Reader-Zugriff und das Verbot von Node-Entzug verstehen.

`useTurnData()` entzieht session-scoped Renderern die Standard-`useSession`-Fähigkeit nicht, sodass diese Grenze auf API-Guidance und Tests statt Capability-Isolation beruht. Registry-Änderungen bleiben niederfrequente Voll-Rebuilds; der Chat-Builder pflegt weiterhin ein legacy-Slice für StatsPills und die öffentlichen Top-Level-Felder, während Trajectory target-spezifische Definitions und einen Builder über dem geteilten Session-Fenster besitzt. Eingebaute Definitions bleiben in ihren jeweiligen UI-Paketen, und diese Kompatibilitätsgrenzen geben Business-Interpretation nicht an die Session zurück.
