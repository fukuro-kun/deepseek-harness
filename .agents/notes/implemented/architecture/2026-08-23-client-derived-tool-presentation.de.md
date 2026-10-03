# Agent Note: Client-abgeleitete Darstellung aus rohen Session-Tool-Ereignissen

Status: implemented

[English](2026-08-23-client-derived-tool-presentation.md) | [中文](2026-08-23-client-derived-tool-presentation.zh.md) | Deutsch

## Problem

Die Session-Historie ist eine dauerhafte Journal-Schnittstelle, während Tool-Karten Client-Darstellung sind. Das Berechnen von Kartenansichten während `page` oder `follow` würde Historien-Lesevorgänge an die Tools-registry, agent-Presets, wiederhergestellte Scopes, Presenter-Ausführung und transiente UI-Typen koppeln.

Ein `tool/result` wiederholt weder Tool-Name noch Argumente. Host-seitige Ergebnisdarstellung erfordert daher entweder einen Aufrufindex oder einen Rückwärtsscan über `callId`; wiederholte Scans über eine tool-dichte Seite können sich quadratischer Arbeit nähern, weil `maxMessages` die Ereignisanzahl nicht direkt begrenzt.

Eine Host-Projektion würde außerdem strukturierte Daten duplizieren. Read-, Diff-, Search- und Web-Ergebnisse persistieren bereits begrenzte Fakten in `tool/result.data.meta`; ein weiteres View-Objekt erhöht die Remote-Payload-Größe und das Client-Decoding, ohne dauerhafte Bedeutung hinzuzufügen.

Der Client besitzt bereits einen vollständigen Tool-Darstellungseinstiegspunkt. `ui-chat` assembliert `tool/call`-, `tool/result`- und Code-Dispatch-Ereignisse zu stabilen `ToolCallBlock`-Werten. `ui-tool` besitzt den rekursiven Aufrufbaum, den per Tool-Name dispatchten `tool.call.toolview`-keyed-slot, den Generic-Fallback, Kartenmodelle und Details-Ausgabe. Ein Business-Client-Plugin kann einen Renderer für seine eigenen Tool-Namen registrieren.

Das Aufteilen der Darstellung zwischen Host-Presentern und Client-keyed-Renderern erzeugt zwei Interpretationen desselben Ereignisses. Der keyed-renderer ist der Web-Erweiterungspunkt, sodass eine Host-Zwischenansicht keine unabhängige Web-Fähigkeit liefert.

`ToolDefinition.presentCall` und `presentResult` bleiben nützliche Host-APIs, obwohl ACP automation-only ist und das Repository keinen produktiven TUI-consumer hat. Das Entfernen ihrer Definitionen ist eine andere Entscheidung als das Unabhänghalten von Session-Lesevorgängen von der Darstellung.

Das geforderte Ergebnis ist ein rohes Session-Journal und ein Client-Darstellungseigentümer ohne visuellen Abbau oder beiläufige Erweiterung. Spezialisierte Karten, Interaktionen und die Code-Dispatch-Topologie bleiben stabil, während der Transport keine transienten Views mehr trägt.

## Entscheidung

Die folgenden Anforderungen an visuelle Äquivalenz schließen den separat genehmigten [Nested-Terminal-Card-Fix](../bug-fix/2026-09-05-nested-terminal-cards.de.md) aus; alle anderen Darstellungs- und Ownership-Beschränkungen bleiben bestehen.

Das Session-Remote-Journal sendet nur rohe, validierte, persistierbare Session-Ereignisse. `session.page` und `session.follow` parsen keine Tool-Argumente, fragen nicht die Tools-registry ab, stellen keinen Presenter-Scope wieder her, führen weder `presentCall` noch `presentResult` aus und konstruieren oder klonen keine Tool-View.

Die Client-Conversation-Schicht bleibt Eigentümerin von Tool-call/result-Identität, Paarung, Lifecycle, Code-Dispatch-Topologie und stabilen Chat-Nodes. Sie interpretiert keine einzelnen Tool-Namen und erzeugt keine Terminal-, Diff-, Read-, Search- oder Web-Komponenten-props.

Client `ui-tool` bleibt Eigentümer von Kartenmodellen und konkreten Renderern. Jedes Kartenmodell liest Tool-Name, rohe Argumente, Ergebnisinhalt, Fehler, dauerhafte Metadaten, Session-cwd und Host-Home direkt aus dem `ToolCallBlock` und erzeugt dieselben Komponenten-props wie die aktuelle Seite.

Der Client hat keine zweite Presenter-registry. Der Tool-Name-Dispatch verwendet ausschließlich den bestehenden `tool.call.toolview`-keyed-slot. Reine Client-Kartenmodell-Helfer sind Renderer-Implementierungsdetails, kein Cordis-Service, keine öffentliche registry und kein Protokoll-DTO.

Die Host-APIs `ToolDefinition.presentCall`, `ToolDefinition.presentResult`, `ToolCallView`, `ToolResultView` und die bestehenden Tool-Presenter-Implementierungen bleiben bestehen. Der Session Controller ruft sie nicht auf, und der Client importiert oder konsumiert sie nicht. Ein künftiger Nicht-Client-consumer liegt außerhalb dieser Entscheidung.

`ToolOutputDefinition.presentationMeta` und das dauerhafte `tool/result.data.meta` bleiben bestehen. Sie tragen Ausführungsergebnisfakten, die bestehende spezialisierte Karten benötigen und die der modellsichtbare Ergebnistext nicht verlustfrei darstellen kann. Der Client validiert und konsumiert `meta` direkt, statt vom Host zu verlangen, es während Historien-Lesevorgängen in eine View umzuwandeln.

### Ziele und Nichtziele

| Kategorie | Entscheidung |
|---|---|
| Abwesend | `SessionEventEntry.view`, `SessionToolView` und `SessionToolCallView` |
| Abwesend | `viewFor`, `backscanArgs`, `parseToolCall`, `jsonView` und die Presenter-Scope-Suche aus `history.ts` |
| Abwesend | `openCalls` und Fallback-Ereignisscans, die nur der follow-Darstellung dienen |
| Abwesend | das parallele `views`-Array der Client-Session, Conversation-Input `view` und Tool-Block `callView`/`resultView` |
| Abgeleitet | Terminal-, Diff-, Read-, Search- und Web-Kartenmodelle lesen rohe Blöcke und Metadaten |
| Abgeleitet | Deliverables liest erfolgreiche Mutationsnamen und -argumente |
| Behalten | Host-APIs, -Typen, -Implementierungen und direkte Tests von `ToolDefinition.presentCall`/`presentResult` |
| Behalten | `output.presentationMeta` und dauerhaftes `tool/result.data.meta` |
| Behalten | das Session-Log-Format, der Remote-Journal-Lifecycle und die Conversation-Identität/-Topologie |
| Behalten | der bestehende keyed-slot, der Generic-Fallback und die Chat-, Details- und Trajectory-Struktur |
| Verboten | ein neuer Client-Presenter-Service, eine parallele registry oder eine Renderer-ID auf dem Protokoll |
| Verboten | neue Karten, visuelles Redesign, Interaktions-Redesign oder Code-Dispatch-Rich-Card-Erweiterungen außer der [Nested-Terminal-Card-Ausnahme](../bug-fix/2026-09-05-nested-terminal-cards.de.md) |
| Verboten | Kompatibilitäts-Dual-Writing, Versionsverhandlung oder Beibehaltung des alten `view`-Felds |

## Terminologie

**Rohes Session-Ereignis** bezeichnet ein `SessionEvent`-Fakt aus dem dauerhaften Log, einschließlich `name` und des rohen `arguments`-Strings auf `tool/call` sowie `content`, `isError`, dem strukturierten Fehler und dem optionalen `meta` auf `tool/result`.

**Dauerhafte Metadaten** bezeichnet den JSON-Wert, den `ToolOutputDefinition.presentationMeta` nach einem erfolgreichen Tool erzeugt und der in `tool/result.data.meta` gespeichert wird. Er ist Teil der Ergebnisfakten, kein vorformatiertes React- oder Karten-DTO.

**Host-Tool-View** bezeichnet die von `ToolDefinition.presentCall` oder `presentResult` zurückgegebene `ToolCallView` oder `ToolResultView`. Session Remote transportiert sie nicht.

**Client-Kartenmodell** bezeichnet die reinen props-Daten unter `ui-tool/src/client/tool/models/`, die direkt von `TerminalBlock`, `DiffBlock`, `ReadBlock`, `SearchBlock`, `WebBlock` oder `ToolRow` konsumiert werden.

**Spezialisierte Karte** bezeichnet den strukturierten Terminal-, Diff-, Read-, Search- oder Web-Body. Titel, Zusammenfassungen, Statuspunkte und gewöhnlicher IN/OUT-Text bleiben Teil der generischen Tool-Zeile.

**Äquivalent** bedeutet, dass dieselbe unterstützte Eingabe das durch die bestehenden Komponenten-, Assemblierungs- und Browser-Nachweise gepinnte benutzersichtbare Ergebnis und die Interaktion liefert. Es erfordert nicht dieselben TypeScript-Zwischentypen oder internen Aufrufe.

**Keine Erweiterung** bedeutet, dass diese Entscheidung einer auf den Generic-Fallback gepinnten Eingabe keine neue spezialisierte Karte gibt und die Daten oder Interaktionen einer bestehenden Karte nicht erweitert.

## Architektur und Ownership

### Tool-Ausführung und Persistenz

1. Ein Tool registriert `output.schema`, `output.render` und optional `output.presentationMeta`.
2. Eine erfolgreiche Ausführung erzeugt einen kanonischen JSON-Wert.
3. Die Tools-Laufzeit snapshotet, schema-validiert und friert den Wert ein.
4. `output.render(args, value)` erzeugt modellsichtbare `ContentBlock[]`.
5. Wenn ein Top-Level-Aufruf `output.presentationMeta` deklariert, erzeugt die Laufzeit zusätzlich JSON-sichere Metadaten.
6. Der agent loop schreibt das modellsichtbare Ergebnis und die Metadaten in ein `tool/result`-Session-Ereignis.
7. Das Session-Log speichert weder `ToolCallView` noch `ToolResultView`.

### Host-Journal-Lesevorgänge

1. `session.page` erhält angehängte oder persistierte Ereignisse.
2. `paginate()` schneidet Seiten an append-origin-user/assistant-Nachrichtengrenzen.
3. Eine Tail-Seite erhält ihre Baseline über den registrierten Projektions-Snapshot/Restore-Pfad.
4. Jeder Seiteneintrag enthält nur `{event}`.
5. `session.follow` etabliert seinen Listener vor den Nachlesevorgängen, emittiert den Eröffnungscursor und streamt dann zusammenhängende `{event}`-Frames.
6. Keiner der beiden Pfade löst ein Preset oder einen Tools-Scope für die Darstellung auf, parst Tool-Argumente, ruft Presenter auf oder indexiert Aufrufe.

### Client-Daten und -Darstellung

1. Die Client-Session speichert ein zusammenhängendes rohes Ereignisfenster.
2. `SessionEventSource` veröffentlicht `SessionEventEntry`-Werte, die nur Ereignisse enthalten.
3. `ui-conversation` foldet jedes Ereignis ohne Darstellungsbegleitung.
4. Die Chat- und Trajectory-Tool-Definitions paaren Top-Level-Aufrufe und -Ergebnisse per callId und assemblieren Code-Dispatch-Teilbäume.
5. `RunningToolCall` und `ToolResultNode` behalten rohe Fakten, Metadaten und bestehende Elternidentität.
6. `ToolCallTree` dispatcht `tool.call.toolview` nach Protokoll-Tool-Namen.
7. `ui-tool` leitet Karten-Komponenten-props am Render-Ort aus dem Block ab.

### Produktiv-consumer-Audit

| Objekt | Produzent | Produktiv-consumer | Entscheidung |
|---|---|---|---|
| `presentCall`/`presentResult` | Host-Tools | Nicht-Client-Aufrufer, falls vorhanden | außerhalb von Session Remote behalten |
| `SessionEventEntry.view` | keiner | keiner | nicht auf dem Protokoll |
| `callView`/`resultView` | keiner | keiner | nicht im Client-Modell |
| `presentationMeta` | Tools-Laufzeit | `tool/result`, Client-Kartenmodelle und Host-Presenter | dauerhafte Eingabe behalten |
| fixture-presenter-Spiegel | keiner | keiner | fixtures senden rohe Metadaten |

ACP konsumiert weder eine Session-Tool-View noch bildet es Host-Render-Intent ab. Das Repository hat keinen produktiven TUI-consumer. Host-Presenter bleiben verfügbar, ohne Session Remote zu ihrem Transport zu machen.

## Datenfluss

```text
Tool execute
  -> canonical value
  -> output.render(args, value)
  -> model-visible result content
  -> output.presentationMeta(args, value), when declared
  -> durable tool/result event

Session page/follow
  -> raw Session event envelope
  -> no tool lookup
  -> no preset lookup for presentation
  -> no call backscan
  -> no render-intent serialization

Client SessionEventSource
  -> Conversation Tool Definition
  -> root call/result pairing + Code Dispatch topology
  -> ToolCallBlock(name, argsRaw, content, error, meta)
  -> tool.call.toolview keyed dispatch
  -> Client card model
  -> existing React component
```

Dieser Pfad behält eine dauerhafte Metadatenprojektion, weil sie läuft, solange das kanonische Ergebnis noch im Speicher ist. Er entfernt die zweite Darstellungsprojektion, die beim Lesen der Historie ausgeführt wurde.

### Schichtverantwortlichkeiten

| Schicht | Besitzt | Besitzt nicht |
|---|---|---|
| Tools-Laufzeit | Ausführung, kanonischer Wert, Modelltext, reproduzierbare Metadaten | Web-Kartenauswahl und Komponenten-props |
| Session-Log | dauerhafte Fakten, Reihenfolge, Wiedergabe | transiente Karten-DTOs |
| Session Controller | Adressierung, Autorität, kalte Lesevorgänge, Pagination, follow, Projektionsbaseline | Tool-Suche, Presenter, Darstellungs-Scope |
| Client-Session | Remote-Journal-Lifecycle und zusammenhängendes Fenster | Tool-Bedeutung und Kartentypen |
| Conversation Tool Definition | call/result-Paarung, Lifecycle, root/subcall-Topologie | Abbildung eines Tool-Namens auf eine Komponente |
| `ui-tool` | Kartenmodelle, Generic-Fallback, Chat-/Details-Darstellung | Session-Pagination und die Host-registry |
| Business-Client-Plugin | keyed-renderer für seinen eigenen Tool-Namen | root/subcall-Assemblierung und eine globale registry |
| `ui-deliverables` | erzeugte Pfade für aktuelle First-Party-Mutationen | UI-Karten oder Host-Render-Intent |

## Remote- und dauerhafte Datenverträge

### `SessionEventEntry`

`SessionEventEntry` bleibt der Journal-Eintrags-Envelope und enthält nur `event: SessionWireEvent`. Diese Änderung macht Seiteneinträge nicht zusätzlich zu nackten Ereignissen und refaktorisiert nicht den allgemeinen `RemoteJournalStream`-Eintragsvertrag.

`SessionPage.events` bleibt `SessionEventEntry[]`.

`SessionFollowFrame` bleibt entweder ein Eröffnungsframe oder ein Ereignisframe mit `event`.

`SessionToolCallView`, `SessionToolView` und `SessionEventEntry.view` sind gelöscht.

Die Client-Verbindung re-exportiert `ToolCallView` und `ToolResultView` nicht mehr aus `dsh-tools/presentation` für Session-consumer.

Generierte Kataloge und Graphen leiten die verengten Remote-Typen und Paketabhängigkeiten aus ihren zugehörigen Quellen ab.

### Dauerhaftes Log

- `tool/call.data.name` bleibt unverändert.
- `tool/call.data.arguments` bleibt der modellerzeugte rohe JSON-String.
- `tool/result.data.message.content` bleibt das modellsichtbare Ergebnis.
- `tool/result.data.error` bleibt die strukturierte Fehleridentität.
- `tool/result.data.meta` bleibt ein Tool-privater JSON-Wert.
- Client-Kartenmodelle schreiben nicht in das Session-Log.
- Renderer-Schlüssel und Host-Tool-Implementierungs-IDs gelangen nicht in das Session-Log.
- Bestehende dauerhafte Sessions benötigen keine Migration, und `SESSION_FORMAT_VERSION` ändert sich nicht.

### `presentationMeta`

`presentationMeta` ist keine Host-Tool-View. Es liest den kanonischen Wert, wenn die Tool-Ausführung abgeschlossen ist, und dieser Wert wird nicht persistiert. Sein Entfernen würde die folgende bestehende Darstellung unmöglich verlustfrei rekonstruierbar machen:

- Read-Pfad, Offset, Zeilen, totalLines und lang;
- angewendete kontextuelle hunks für write/edit;
- gruppierte grep/glob-Ergebnisse, Truncation-Flag und Gesamtzahl;
- web_search-Quellfelder und provider-Antwort;
- web_fetch-End-URL, HTTP-Status und effektives Truncation-Flag.

Der Client verengt `meta` lokal zur Laufzeit. Das Umbenennen von `presentationMeta` in neutralere Ergebnismetadaten liegt außerhalb dieser Entscheidung.

## Host-Design

Nach dem Erhalt der Quellereignisse führt `SessionHistoryController.page()` nur die Pagination und die bestehende Projektionsbaseline-Berechnung durch. Angehängte Sessions verwenden den Projektions-registry-Snapshot; abgehängte Sessions verwenden dessen Restore-Pfad über das inspizierte Log. Die Historie mountet kein Preset, um die registrierte Projektionsmenge zu ändern.

`SessionHistoryController.follow()` behält Listener-first-Einrichtung, Eröffnungscursor, lückenlose Wiedergabe, Live-Pufferung, Abbruch und Teardown. Es unterhält keinen zusätzlichen Zustand für Tool-Ereignisse.

Der Controller hat keinen `presenterScopeFor()`-, `viewFor()`-, `backscanArgs()`-, `parseToolCall()`- oder `jsonView()`-Pfad. Der Seitenzustand enthält keinen Presenter-Scope oder Argument-Resolver; der follow-Zustand enthält keine `openCalls`, `fallbackEvents` oder Darstellungs-Argument-Resolver. Jedes page/follow-Ereignis wird nur als `{event}` verpackt, während Adressierungs-, Ownership-, Cursor-, Sequenz- und Projektionslogik intakt bleiben.

Ein unveränderlicher Ereignis-Konvertierungshelfer darf schmal bleiben oder inline sein; sein Name ist irrelevant, solange die Historie keine Darstellungsarbeit leistet.

Session-Controller-Abhängigkeiten bleiben nur bestehen, wenn eine andere Paketverantwortung sie erfordert. manifest- und Projektreferenzen enthalten keine rein darstellungsbedingte Abhängigkeit.

### Performance-Beschränkungen

- `page()` leistet keine Tool-spezifische Arbeit.
- Das Hinzufügen von Tool-Ergebnissen zu einer Seite verursacht keine wiederholten Scans über bestehende Seitenereignisse.
- `follow()` unterhält keinen Darstellungsindex.
- Die Historie triggert nicht den Cordis-`tools`-Service-Proxy.
- Die Historie wartet nicht auf einen stehenden Presenter-Scope.
- Die Historie parst kein Tool-Argument-JSON.
- Die Historie führt keine Tool-View-JSON-Klone durch.
- Die Remote-Payload wiederholt keine strukturierten Daten, die bereits durch `meta` ausgedrückt sind.
- Der Client scannt nicht das vollständige Session-Ereignisfenster, um eine Karte zu bauen.
- Der Client leitet ein Kartenmodell nur dann erneut ab, wenn sich der entsprechende unveränderliche Tool-Block ändert.

## Client-Session und Conversation

Die Client-Session hat kein privates `views`-Array parallel zum rohen Ereignisfenster. `installWindow()`, `prependWindow()` und `appendLive()` behandeln nur Ereigniseinträge, Cursor/hasMore-Zustand, Warteschlangen, Projektion und Benachrichtigungen.

`ConversationEventInput` enthält nur `event`. Der Conversation-Assemblierer kennt `SessionToolView` nicht; sein replace/prepend/append-Verhalten, die Kontextidentität, die Location und die Veröffentlichungskadenz bleiben unverändert.

Die Chat- und Trajectory-Tool-Definitions lesen keine Views. Sie leiten die folgenden Daten aus Ereignissen ab:

- callId;
- Tool-Name;
- rohe Argumente;
- turn, step, seq und Zeit;
- Ergebnisinhalt;
- isError und strukturierter Fehler;
- Ergebnismetadaten;
- root/subcall-Eltern-Kind-Topologie;
- synthetische Unterbrechungsergebnisse.

`RunningToolCall` hat kein `callView`.

`ToolResultNode` hat weder `callView` noch `resultView`.

`ToolCallBlock` erhält kein generisches `view`-, `card`-, `kind`- oder `locations`-Feld, um die gelöschten Felder zu ersetzen. Die konkrete Darstellung bleibt die Verantwortung von `ui-tool` und keyed-renderern.

### Root- und Code-Dispatch-subcalls

Host-Presenter-APIs beschreiben Top-Level-Aufrufe und -Ergebnisse. Code-Dispatch-subcalls behalten die generische, flache Darstellung für die hier abgedeckten Diff-, Read-, Search- und Web-Modelle; unterstützte Terminal-Aufrufe verwenden dieselben Eignungsregeln wie Roots.

Code-Dispatch-Start- und Ergebnisereignisse tragen bereits `parentCallId`. Conversation bewahrt dieses bestehende Fakt auf jedem Kind-`ToolCallBlock`; Root-Session-Aufrufe lassen es weg. Die Diff-, Read-, Search- und Web-Modelle akzeptieren nur Blöcke ohne `parentCallId`; das Terminal-Modell und bestehende Renderer, die absichtlich verschachtelte Aufrufe unterstützen, akzeptieren Kindblöcke.

Geteilte Kartenmodelle wenden dieselbe Terminal-Eignung und Nicht-Terminal-Kind-Beschränkung überall an, wo ein Block rendert, sodass keine zweite Darstellungsoberfläche ein Placement-Feld benötigt; das Details-Panel, das einst einen ausgewählten Block delegierte, wurde mit der rechten Details-Spalte entfernt ([Entscheidung](../feature/2026-09-04-right-sidebar-docking-infrastructure.de.md)).

Der keyed-slot dispatcht weiterhin jeden subcall nach seinem realen Tool-Namen. `parentCallId` beschränkt nur die Diff-, Read-, Search- und Web-strukturierten Modelle, die von dieser Entscheidung abgedeckt sind. Bestehende spezialisierte Renderer wie Skill und Cordis, die bereits rohe Blöcke lesen, bleiben unverändert.

### Fehlender Aufrufkopf

Wenn ein Ergebnisknoten keinen passenden Aufruf im aktuellen Fenster hat, bleibt `ToolResultNode.call` `null`. Der Client scannt nicht das Fenster, stellt keinen weiteren RPC und leitet keinen Tool-Namen aus dem Ergebnistext ab.

Eine spezialisierte Ableitung, die den Namen oder die Argumente benötigt, verwendet den aktuellen Generic-Fallback, wenn `call === null`. Ein Modell, das allein Ergebnismetadaten nutzen könnte, erhält keine neue Darstellung, weil der aktuelle Host-`presentResult` zuerst den passenden Aufruf wiederherstellen muss.

Wenn eine spätere ältere Seite den Aufrufkopf liefert, baut der Conversation-Kontext unter den bestehenden Replay-Regeln neu auf und kann dann die bereits unterstützte spezialisierte Karte erzeugen.

### Argument- und Metadaten-Verengung

Der Client parst JSON aus `argsRaw`; ein Parse-Fehler liefert die Generic-Form, statt einen React-Render-Fehler zu werfen.

Chat und Details nutzen das Parsing für denselben Block über reine Helfer wieder. Jeder künftige Cache muss die unveränderliche Blockidentität verwenden und darf keinen sessionsübergreifenden globalen Zustand per callId erzeugen.

Jedes spezialisierte Modell prüft nur die Felder, die es benötigt. Der Client kopiert keine vollständigen Host-Tool-schemas und ruft keinen Host-`defineTool`-Validator auf.

Gültige First-Party-Ereignisse müssen der aktuellen Presenter-Ausgabe äquivalent sein. Fehlerhafte, altversionierte oder manuell bearbeitete Logs versprechen nur einen absturzfreien Generic-Fallback.

## Client-Kartenmodell-Design

Das bestehende `ui-tool/src/client/tool/models/`-Verzeichnis bleibt die einzige Quelle geteilter Ableitung für Chat und Details. Helfer liefern Komponenten-props direkt; sie liefern weder `ToolCallView` noch `ToolResultView` und erzeugen keine isomorphe `ClientToolView`-Union.

Verzweigungen auf Tool-Namen existieren nur in `ui-tool`-Kartenmodellen, bestehenden Zeilenklassifizierungstabellen oder dem Client-Plugin, das einen keyed-renderer für dieses Tool besitzt. Sie dürfen nicht in den Session Controller, die Client-Session, den Conversation-Assemblierer oder den generischen slot-renderer gelangen.

Unbekannte Tools verwenden weiterhin `GenericToolCard` mit dem Namen, rohen Argumenten, Ergebnisinhalt und Fehler.

### Generische Tool-Zeile

`toolRowModel()` leitet die generische Zeile direkt aus `toolName`, `argsRaw`, Ergebnisinhalt, Fehler, cwd und Home ab. Es bewahrt:

- Klassifizierung in `search`, `read`, `bash`, `write`, `edit`, `code` und `others`;
- bestehende Titel und Tool-spezifische Titel;
- Priorität der Zusammenfassungsfelder und einzeilige Trunkierung;
- Komma-Verknüpfung mehrerer Abfragen;
- cwd-relative Pfade und Home-Abkürzung;
- Dateipfad-Klicks;
- hübsches JSON-Argumente und Nicht-JSON-Rohtext-Fallback;
- flachen Ergebnisinhalt und strukturierten Fehler-Fallback;
- running-, ok-, error- und stopped-Zustände.

Die Titel-, kind-, rawInput-, content- und locations-Werte aus dem generischen Host-`presentCall` treiben derzeit keine gewöhnliche Web-Zeile. Generic `presentResult.content` treibt ebenfalls keine Web-Ausgabe, sodass der Client diese nicht konsumierten Werte nicht kopieren muss.

### Terminal-Karte

Das Client-Terminal-Modell leitet bestehende `TerminalBlock`-props aus dem Tool-Namen, den Aufrufargumenten, dem Ergebnisinhalt, dem Fehler und der Session-cwd ab, unabhängig von `parentCallId`.

| Eingabe | Erhaltenes Ergebnis |
|---|---|
| laufender standard `bash`/`pwsh`-Vordergrundaufruf | Terminal-Prompt, Beschreibung, cwd und Laufzustand |
| erfolgreicher standard Vordergrundaufruf | Terminal-Ausgabe, Exit-Code/Signal und Erfolgs- oder Fehlerstatuspunkt |
| `run_in_background:true` | Generic-Zeile und rohes Ergebnis |
| Tool-Ausführungsfehler | Generic IN/OUT und Fehlerzusammenfassung |
| laufendes persistentes `bash`/`pwsh` | Terminal-Prompt |
| abgerechnetes persistentes `bash`/`pwsh` | Generic flaches Ergebnis, ohne neue Exit-Karte |
| Vordergrund `terminal_send` | Terminal-Prompt und Ausgabe |
| Hintergrund/Fehler `terminal_send` | Generic-Ergebnis |
| Code-Dispatch-Kind | dieselbe Terminal-Eignung und Fallback-Regeln wie ein Root-Aufruf |

Standard-Shell-Ergebnisse parsen abschließende `[exit code: N]`- und `[killed by signal: X]`-Marker. Ein letztes erkanntes spill-Policy-Hinweis wählt stattdessen Generic-Ausgabe: expandierbar in Shell-Zeilen und roh in Details, weil der Exit-Marker verschoben oder weggelassen sein kann. Ein geparster Marker wird aus dem Terminal-Body entfernt; Timeout, Sandbox-Ablehnung und Marker ohne Pill bleiben im Body.

Der Aufruf-`description` bleibt über der Karte und überschreibt die eingeklappte Zusammenfassung. Workdir behandelt weiterhin absolute, relative und fehlende Werte. Relative Pfade lösen sich gegen die Session-cwd auf und bewahren die Normalisierung für `.`, `..`, Laufwerksbuchstaben und UNC-Roots.

Für `terminal_send` bleiben nicht-leere Eingabe und die Session-ID wörtliche Tool-Daten; der Empty-Input-Fallback und das Session-Label lösen sich über die Konversations-locale des Render-Ortes auf.

Standard- und persistente provider, die denselben Tool-Namen teilen, sind ein besonderer Kompatibilitätspunkt. Der Client verwendet derzeit gültige Argument- und Ergebnismerkmale, um ihre gelieferten Unterschiede zu bewahren. Eingabe, die nicht eindeutig identifiziert werden kann, verwendet ein Generic-abgerechnetes Ergebnis, statt neue Darstellung zu erhalten.

`TerminalBlock` ANSI-Behandlung, Cursor-Wiedergabe, breite Zeichen, Zeilenlimits, Expansion, Kopieren und assistiver Text bleiben unverändert.

### Diff-Karte

| Eingabe | Erhaltenes Ergebnis |
|---|---|
| laufender `write` | beabsichtigter Nur-Hinzufügung-Diff aus `file_path` und `content` |
| laufender `edit` | beabsichtigter Ersetzungs-Diff aus `file_path`, `old_string` und `new_string` |
| laufender `str_replace_editor create` | beabsichtigter Nur-Hinzufügung-Diff aus `path` und `file_text` |
| laufender `str_replace_editor str_replace` | beabsichtigter Ersetzungs-Diff aus `path`, `old_str` und `new_str` |
| erfolgreicher abgerechneter `write`/`edit` | angewendete kontextuelle hunks aus `meta.diffs` |
| abgerechneter `str_replace_editor` | Generic, weil das Tool keinen Ergebnis-Presenter definiert |
| Write-Erstellung oder fehlende/fehlerhafte/leere angewendete Metadaten | aktueller Argument-Fallback |
| Fehler, fehlerhafte Argumente, Edit mit fehlerhaften Metadaten oder Code-Dispatch-Kind | Generic |

Pfade, `oldText:null`, `newText`, Ergebnis-vor-Aufruf-Diff-Priorität, das Acht-Zeilen-Chat-Limit, die Vollhöhen-Details-Darstellung und das Dateiöffnungsverhalten bleiben unverändert.

### Read-Karte

Ein laufender `read` zeigt weiterhin nur die Zusammenfassungszeile. Ein erfolgreicher abgerechneter `read` liest Pfad, Offset, Zeilen, totalLines und lang aus den Ergebnismetadaten und bestätigt, dass das Ergebnis ein Textblock ist, der dem Read-Envelope entspricht.

Fehlende Metadaten, fehlerhafte Felder, ein nicht passender Ergebnis-Envelope, ein Fehler, ein fehlender Aufrufkopf oder ein Code-Dispatch-Kind verwenden alle Generic. Cwd-relative Pfad-Labels, Home-Abkürzung, Syntaxsprache, Gesamtzeilenzahl, das Acht-Zeilen-Chat-Limit und die Vollhöhen-Details-Darstellung bleiben unverändert.

Der Client muss den Host-`ReadResultView.content` nicht konstruieren; der Generic-Fallback kann rohen Ergebnisinhalt immer direkt lesen.

### Search-Karte

Ein laufender `grep` oder `glob` zeigt weiterhin nur die Argumentzusammenfassung. Erfolgreiche Ergebnisse erzeugen gruppierte Treffer bzw. eine Pfadliste aus `meta.shape:'matches'` und `meta.shape:'paths'`.

Der Client validiert path, lineNumber, line, truncated und total. Leere Treffer oder Pfade bilden eine gültige Karte. Fehlende oder fehlerhafte Metadaten, eine unbekannte Form, ein Fehler, ein fehlender Aufrufkopf oder ein Code-Dispatch-Kind verwenden Generic.

Bei `truncated:true` zeigt die Karte weiterhin einen Wiederherstellungslokator aus dem rohen Ergebnisinhalt. Sie zeigt keinen, wenn nicht trunkiert. Das Acht-Zeilen-Chat-Limit, die Vollhöhen-Details-Darstellung und das Expansionsverhalten bleiben unverändert.

### Web-Karte

Ein laufender `web_search` oder `web_fetch` zeigt weiterhin nur die Zusammenfassungszeile. Eine erfolgreiche Suche baut die Karte aus `meta.sources`, `meta.answer` und `meta.truncated`; ein erfolgreicher Fetch baut sie aus `meta.url`, `meta.statusCode` und `meta.truncated`.

Der Client validiert die url, den Titel, den Snippet und das publishedAt jeder Quelle und rendert weiterhin nur http/https-URLs als Links. Fehlende oder fehlerhafte Metadaten, ein Fehler, ein fehlender Aufrufkopf oder ein Code-Dispatch-Kind verwenden Generic.

Suchantworttext, Quellreihenfolge, Label-Fallback und Truncation-Hinweis bleiben unverändert. Die Fetch-End-URL, der Status, der Truncation-Hinweis und der rohe Body unter Details bleiben unverändert.

### Renderer, die bereits rohe Blöcke verwenden

- Todo-Zeilen leiten weiterhin abgeschlossene/aktive Zusammenfassungen aus Argumenten ab.
- Question-Zeilen leiten weiterhin wartende, beantwortete, abgebrochene und unterbrochene Zustände aus Ergebnisinhalt und Fehlern ab.
- Skill-Zeilen leiten weiterhin Namen und Zustände aus Aufrufen und Ergebnissen ab.
- Cordis define/run/action-Zeilen leiten weiterhin aus Aufrufen, Ergebnissen und ihren eigenen Client-Services ab.
- Diese Renderer behalten ihre props, slot-Schlüssel, Registrierungsreihenfolge und sichtbaren Ergebnisse.

## Deliverables

`ui-deliverables` leitet Mutations-Geschäftsfakten unabhängig vom Darstellungs-Intent ab, sodass das Produkt-Datei-Verhalten nicht an Karten-Screenshots gekoppelt ist.

Die Deliverables-Definition beobachtet Root-`tool/call`- und erfolgreiche `tool/result`-Ereignisse per callId und behält einen minimalen Client-eigenen Mutationskandidaten, ohne das Session-Fenster zu scannen oder von einem UI-Renderer abzuhängen.

| Tool | Mutationsbedingung | Pfadquelle |
|---|---|---|
| `write` | jeder erfolgreiche Aufruf | `file_path` |
| `edit` | jeder erfolgreicher Aufruf | `file_path` |
| `str_replace_editor` | `create`, `str_replace` oder `insert` | `path` |
| `str_replace_editor` | `view` | erzeugt keinen Pfad |
| Sonstiges | keine aktuelle First-Party-Mutationssemantik | erzeugt keinen Pfad |

Fehler, Unterbrechungen, verwaiste Ergebnisse, fehlende Pfade und fehlerhafte Argumente erzeugen kein Deliverable. Pfade behalten die First-seen-Deduplizierung, und Ergebnisse, die nach der abschließenden Assistant-seq abgerechnet werden, bleiben ausgeschlossen.

Diese Änderung fügt keine allgemeine Tool-Seiteneffekt-registry hinzu. Die Fähigkeit für einen Host-only-Drittanbieter-Presenter, Deliverables automatisch über `kind:'edit'` oder `locations` beizutreten, wird absichtlich entfernt. Eine künftige echte Drittanbieter-Mutationsanforderung muss einen Client-Business-Beitrag verwenden und kann keine Session-Views wiederherstellen.

## fixtures und Testdaten

Die Client-fixture löscht ihr handgeschriebenes `presentCall()`, `presentResult()`, `viewFor()` und ihre fixture-Tool-View-Typen. Sie erzeugt weiterhin dieselben rohen Aufrufe, Ergebnisinhalte und Ergebnismetadaten wie ein echtes Log.

| fixture | Rohe Fakten, die bleiben müssen |
|---|---|
| terminal | Argumente und echte Ergebnisstatusmarker |
| diff | Argumente und Ergebnis `meta.diffs` |
| read | Ergebnismetadaten Pfad/Offset/Zeilen/totalLines/lang |
| grep/glob | Ergebnismetadaten shape/files oder paths/truncated/total |
| web | Ergebnismetadaten sources/answer oder url/statusCode/truncated |
| generic/custom | Name, argsRaw, content und error |

Die fixture importiert keine Host-Tool-Pakete, um die Seitendarstellung zu berechnen, und behält keinen Presenter-Spiegel. Dieselbe rohe fixture treibt weiterhin jsdom, gebaute Web-Snapshots und den `?fixture`-Browser-Pfad.

## Darstellungs-Äquivalenzmatrix

„Aktuelle Darstellung“ ist durch committete Komponententests, Assemblierungstests und Web-Browser-Erwartungsausgaben definiert. Ein Transport- oder Ownership-Refactoring rechtfertigt kein Snapshot-Refresh; eine genehmigte Produktänderung erfordert separate Nachweise.

| Szenario | Geforderte Darstellung |
|---|---|
| unbekanntes Tool, laufend | Generic-Zeile mit Tool-Name und Argumentzusammenfassung |
| unbekanntes Tool, abgerechnet | Generic-Zeile und rohe Ausgabe |
| fehlerhafte Argumente | sicherer Generic-Fallback |
| verwaistes Ergebnis | callId-Titel und Generic-Ausgabe |
| unterbrochener Aufruf | Warn-/Stopped-Zustand |
| Vordergrund bash/pwsh | aktueller Terminal-Prompt, Body, cwd und Zustand |
| Hintergrund/Fehler bash/pwsh | aktuelles Generic IN/OUT |
| persistente Shell | aktuelles laufendes Terminal und abgerechnete Generic-Form |
| terminal_send | aktuelles Vordergrund-Terminal und Hintergrund/Fehler-Generic-Form |
| write/edit | aktueller beabsichtigter/angewendeter Diff und Fehler-Fallback |
| read | aktuelle laufende Zusammenfassung, abgerechneter ReadBlock und Fehler-Fallback |
| grep/glob | aktuelle gruppierte/Pfad-Karte, Truncation und Wiederherstellung |
| web_search/web_fetch | aktuelle Quellen-/Zusammenfassungskarte und roher Body |
| Todo/Question/Skill/Cordis | aktuelle spezialisierte Zeilen |
| Code-Dispatch-subcall | Terminal-Karten, wenn geeignet; Diff/Read/Search/Web bleiben Generic/flach |
| Chat und Details | identische Kartenfelder für denselben Aufruf |
| Trajectory | aktuelle Identität, Baum, Auswahl und Details |
| Deliverables | aktuelle erfolgreiche Mutations-Chips und Links |

## Client-Erweiterungsvertrag

`tool.call.toolview` bleibt der einzige Tool-UI-Registrierungsmechanismus. Ein Tool, das eine spezialisierte Client-Darstellung benötigt, muss ein Client-Plugin haben, das seinen Protokoll-Tool-Namen registriert.

Der Registrant erhält den rohen `ToolCallBlock`, Session-Pfadinformationen und Host-Aktionen und validiert die Argument- und Metadatenfelder, die er erkennt. Er ruft nicht die Host-Tool-registry auf, hängt nicht von `presentCall` oder `presentResult` ab und erfordert kein `SessionEventEntry.view`.

Ein Tool ohne Client-Renderer fällt konsistent auf Generic zurück. Nur eine keyed-Registrierung für einen Tool-Namen kann aktiv sein, und doppelte Schlüssel schlagen weiterhin laut fehl.

Ein Session-bezogener slot kann Client-seitige Session-Unterschiede ausdrücken, aber keine Renderer-Variante wird aus einem Preset abgeleitet. Ein Host-only-Presenter gewährt keine automatische Web-Rich-Card. Dies ist die explizite Grenze zwischen „der Host beschreibt Darstellung“ und „das Client-Plugin besitzt Darstellung“.

## Fehler und Fallback

- Der Client behandelt Argumente und Metadaten als Protokoll-JSON und verengt sie am Konsumort.
- Ein Argument-JSON-Parse-Fehler verwendet Generic.
- Ein bekanntes Tool mit fehlenden Pflichtfeldern verwendet Generic.
- Fehlende oder fehlerhafte Metadaten verwenden Generic, außer bei erfolgreichem `write`, dessen aktueller Presenter seinen argumentabgeleiteten Gesamtdatei-Diff bewahrt.
- Ein Fehlerergebnis zeigt keine Erfolgskarte nur weil Metadaten vorhanden sind.
- Ein fehlender Aufrufkopf löst keine Vermutungen über Tool-Name oder Argumente aus.
- Unbekannte Metadatenfelder werden ignoriert.
- Eine neue Metadatenvariante verwendet Generic in einem älteren Client.
- Kartenmodell-Helfer fangen erwartete Parse-Fehler ab, statt sich für den gewöhnlichen Fallback auf eine React-Fehlergrenze zu verlassen.
- Unerwartete Fehler innerhalb eines keyed-renderers bleiben durch die bestehende slot-Fehlerbehandlung isoliert.

## Gleichnamige Host-provider

Die Host-registry erlaubt verschiedenen Scopes, verschiedene Definitionen unter demselben Tool-Namen bereitzustellen. Über den Presenter-Scope kann eine Session-View theoretisch eine andere Render-Absicht nach Preset wählen. Nach dem Entfernen der View beobachtet der Client-keyed-slot nur den Protokoll-Namen und kann die Host-Definitionsidentität nicht beobachten.

Die bemerkenswerten aktuellen First-Party-Beispiele sind standard- und persistente `bash` und `pwsh`. Die Client-Ableitung verwendet gültige Argument- und Ergebnismerkmale, um ihre gelieferten Unterschiede ohne ein provider-ID-Protokollfeld zu bewahren. Fehlerhafte oder benutzerdefinierte gleichnamige provider-Eingabe, die nicht unterschieden werden kann, verwendet Generic.

Diese Änderung verspricht nicht, Unterschiede zu bewahren, die nur durch einen Host-Presenter von Drittanbieter-gleichnamigen providern ausgedrückt werden. Wenn das Produkt später eine unterschiedliche Client-Darstellung für gleichnamige provider erfordert, muss es eine stabile, nicht-darstellungsbezogene Client-Identität definieren und darf keine pro-Seiten-Host-View-Berechnung wiederherstellen.

## Ausgelieferter Umfang

### Session Controller

- `SessionEventEntry` enthält nur das rohe Ereignis.
- Beide Session-Tool-View-Typen sind abwesend.
- Die Historie hat keine Darstellungs-Imports, -Helfer oder -page/follow-Zustand.
- Adressierungs-, Paginierungs-, follow- und Projektionslogik bleiben im Session-Eigentümer.
- Host-Tests assertieren den rohen Journal-Vertrag.

### Session-Controller-Client

- `Session.views` ist abwesend.
- EventSource-replace/prepend/append-Deltas bleiben unverändert.
- Transport-, fixture- und Test-Support-Typen tragen rohe Einträge.
- Ereignisidentität und Referenzstabilität bleiben unverändert.

### UI-Conversation, Chat und Trajectory

- Conversation-Input und Tool-Blöcke enthalten keine View-Felder.
- Chat- und Trajectory-Tool-Definitions lesen rohe Ereignisse.
- Ereignispaarung, Kontextwiedergabe, Bäume und Ziel-Snapshots bleiben unverändert.
- Kind-Tool-Blöcke bewahren die bestehende Code-Dispatch-`parentCallId`; Zeilen- und Details-slot-Owner-props fügen kein separates Placement-Feld hinzu.

### UI-Tool und Deliverables

- Kartenmodelle leiten aus rohen Blöcken und Metadaten ab.
- Chat und Details teilen dieselben Helfer.
- Generic-Fallback und keyed-Dispatch bleiben unverändert.
- Deliverables erkennt First-Party-Mutationsargumente.

### fixtures, Dokumentation und generierte Artefakte

- fixtures senden nur rohe Ereignisse und Metadaten.
- Session-Controller- und Client-README/JSDoc-Verträge beschreiben das rohe Journal und den Client-Darstellungseigentümer.
- Das Tool-Handbuch dokumentiert den Web-Client-Integrationspfad.
- Diese Agent Note ist die Entscheidungseigentümerin; behaltene Host-Presenter-Notes behalten ihre unabhängigen Entscheidungen.
- Verfasste Remote-Typen, Abhängigkeiten, READMEs, Pairing-Aufzeichnungen und generierte Referenzen bleiben synchron.

## Verifikationsmatrix

### Host

- page liefert zusammenhängende rohe Ereigniseinträge.
- follow liefert einen Eröffnungscursor und zusammenhängende rohe Ereigniseinträge.
- page/follow verhalten sich ohne den Tools-Service identisch.
- Eine kalte Seite löst kein Preset auf und mountet es nicht.
- Eine Tail-Seite berechnet ihre Baseline über die Standard-Projektions-registry; provider-Verfügbarkeit folgt der Projektionskomposition statt einem historienseitigen Setup-Pfad.
- Adressierung, Ownership, nachrichtenausgerichtete Grenzen und Tail-Projektion bleiben unverändert.
- Listener-vor-Lesen, Wiederverbindungs-Nachlesen und Lückenreparatur bleiben unverändert.
- Viele Tool-Ergebnisse lösen keinen Backscan pro Ergebnis aus.
- Protokoll-Ergebnisse enthalten keine View.

`session-history-journal.host.spec.ts` besitzt Pagination, Kontinuität und Historien-Fehlerverhalten ohne Presenter-Assertionen.

### Client-Conversation

- replace, prepend und append akzeptieren Einträge ohne Views.
- Chat- und Trajectory-Root-call/result-Paarung bleibt unverändert.
- Der Code-Dispatch-Baum bleibt unverändert.
- Der Nur-Ergebnis-Fallback bleibt unverändert.
- Ein synthetisches Unterbrechungsergebnis kopiert keine View.
- Node-Identität über registry-Neuaufbau, älteres prepend und live-append bleibt unverändert.

### Client-Kartenmodell

- terminal erzeugt die gepinnten props aus rohen Argumenten/Inhalten.
- diff erzeugt die gepinnten Diffs aus Argumenten/Metadaten.
- read erzeugt die gepinnten Zeilen aus Metadaten/Inhalt.
- search erzeugt die gepinnte gruppierte/Pfad-Karte und Wiederherstellung aus Metadaten/Inhalt.
- web erzeugt die gepinnten Quellen/Fetch-Zusammenfassungen aus Metadaten/Inhalt.
- unbekannte, fehlerhafte, Fehler-, Fehl-Aufruf- und Fehl-Metadaten-Fälle bleiben Generic.
- abwesende und vorhandene `parentCallId`-Fälle beweisen gleiche Terminal-Eignung und bewahren den Generic-Fallback für Diff-, Read-, Search- und Web-Nachkommen.
- Chat und Details erzeugen identische Kartenfelder für denselben Block.

### Deliverables

- Erfolgreiche write/edit-Aufrufe erzeugen `file_path`.
- str_replace_editor create/str_replace/insert-Aufrufe erzeugen `path`.
- str_replace_editor view erzeugt keinen Pfad.
- Fehler, Unterbrechung, fehlerhafte Eingabe und verwaiste Ergebnisse erzeugen keinen Pfad.
- First-seen-Deduplizierung und die Closing-seq-Grenze bleiben unverändert.

### Assemblierung und Browser

- terminal-, diff-, read-, search- und web-Browser-Erwartungsausgaben bestehen alle ohne Refresh.
- Sichtbare Assertionen für den Tool-Baum, Details, Trajectory und Deliverables behalten ihre Erwartungswerte.
- Der gebaute Client zeigt weiterhin dieselben Karten nach dem Erhalt roher Ereignisse von echten Remote-page/follow-Operationen.
- fixtures und der echte Host verwenden dieselbe Client-Ableitung.
- Ein minimales Preset pinnt unabhängig das Persistent-Shell-Verhalten.

### Statisch und Dokumentation

- Produktionscode enthält kein `SessionToolView` oder `SessionToolCallView`.
- Die Session-Historie referenziert nicht `dsh-tools/presentation`, `ctx.tools`, `presenterScopeFor` oder `backscanArgs`.
- Die Client-Conversation referenziert nicht `ToolCallView` oder `ToolResultView`.
- Client-Modelle lesen weder `callView` noch `resultView`.
- Die fixture definiert keinen Presenter-Spiegel.
- Host `presentCall`, `presentResult` und `presentationMeta` bleiben bestehen.
- Keine neue Client-registry oder Host-zu-Client-Darstellungshinweis existiert.
- Betroffene verfasste Typen, READMEs, Agent Notes, Kataloge und Graphen sind synchron.

## Verifikationsbefehle

Änderungen an dieser Entscheidung verwenden `dsh-pre-push-checks`, um Befehle für den finalen Diff auszuwählen. Erforderliche Nachweise umfassen:

- fokussierte Session-Controller-Historie-/Transporttests;
- ui-chat- und ui-trajectory-Tool-Definition-Tests;
- ui-tool terminal-, diff-, read-, search-, web-, row-, tree- und details-Tests;
- ui-deliverables-Produkt-Datei-Tests;
- connection-fixture- und Client-Laufzeittests;
- betroffene Host- und Client-TypeScript-Oberflächen;
- lint und duplication;
- pro-Datei-100%-Coverage für betroffene Quelldateien;
- `DSH_SNAPSHOT=replay pnpm run test:web`, ohne bestehende Darstellungs-Goldens zu refreshen;
- verfasste Remote-Typ- und TypeScript-Checks;
- `pnpm run doc-sync`;
- `git diff --check`.

## Ausgelieferte Invarianten

- Session page/follow liest weder die Tools-registry noch einen Presenter-Scope.
- Die Session-Historie hat keinen callId-Backscan, keinen Darstellungs-Cache und keinen View-Klon.
- Ein Remote-Session-Eintrag trägt keine View.
- Das Session-Log und `SESSION_FORMAT_VERSION` bleiben unverändert.
- Ergebnismetadaten gehen Byte für Byte durch Log und Remote zum Client.
- Conversation assembliert `ToolCallBlock` nur aus rohen Ereignissen.
- `ToolCallBlock` enthält keine Host-Render-Intent-Felder.
- Die fünf strukturierten Kartenmodelle lesen nur rohe Blöcke und Session-Pfadfakten; nur diff, read, search und web verwenden `parentCallId`, um Kinder abzulehnen.
- Generic-, Todo-, Question-, Skill- und Cordis-Zeilen bleiben unverändert.
- Deliverables hängt nicht vom Render-Intent ab und bewahrt aktuelle Pfade.
- Text, Komponenten, erweiterter Inhalt, Zustände, Links und Reihenfolge für alle First-Party-Top-Level-Tools bleiben unverändert.
- Fehlerhafte, Fehl-Metadaten-, Fehler-, Verwaist- und Unbekanntes-Tool-Fälle fallen weiterhin sicher zurück.
- Code-Dispatch-diff-, read-, search- und web-subcalls bleiben Generic und flach; terminal-subcalls folgen der Root-Eignung.
- Chat-, Details- und Trajectory-Verhalten bleiben unverändert.
- Bestehende Web-Browser-Erwartungsausgaben bestehen ohne Refresh.
- Host-Presenter-APIs, -Implementierungen und direkte Tests bleiben unverändert.
- ACP-Ausgabe bleibt unverändert.
- Kein neues downstream-Darstellungsfeld oder zweite Client-registry wird eingeführt.
- Die Paginierungskosten wachsen nicht mehr mit der Ergebnisanzahl multipliziert mit der Seitenereignisanzahl.
- Downstream-Payloads duplizieren Ergebnismetadaten nicht mehr in einem Karten-DTO.

## Erwogene Alternativen

### Nur `backscanArgs` optimieren und Views behalten

Eine `callId → {name,args}`-Map vor der Seitenverarbeitung zu bauen, würde den Backscan linear machen, und live-follow hat bereits einen `openCalls`-Schnellpfad. Es würde Host-Suchen, Preset-Scopes, Presenter, JSON-Klone, doppelte Payloads und doppelte Ownership intakt lassen, daher ist diese Alternative abgelehnt.

### Eine Presenter-registry dem Client hinzufügen

Das Kopieren der `presentCall`- und `presentResult`-Schnittstellen in den Browser würde die Registrierungs-, Lifecycle-, Fallback- und Override-Semantik des `tool.call.toolview`-slots duplizieren. Renderer müssten Presenter-DTOs weiterhin in Komponenten-props umwandeln, daher ist diese Alternative abgelehnt.

### Die Conversation Tool Definition eine einheitliche View erzeugen lassen

Dies würde Tool-Namen und UI-Karten-Semantik in den zielneutralen Conversation-Eigentümer bringen und ein zum Host-View isomorphes Zwischen-DTO neu erzeugen, daher ist diese Alternative abgelehnt.

### `presentationMeta` löschen

Read-Zeilenstruktur, angewendete Diffs, Search-Gruppierung, Web-Quellen und effektive Truncation können nicht verlustfrei aus dem Modelltext wiederhergestellt werden. Das Parsen von Freiformtext würde die UI außerdem an Ausgabeformulierungen binden, daher ist diese Alternative abgelehnt.

### Kanonische Tool-Ergebnisse persistieren

Dies würde das Session-Log vergrößern, interne Ergebnisstrukturen exponieren, das dauerhafte Format ändern und potenziell Objekte speichern, die weit größer sind als die Darstellung erfordert. Bestehende Metadaten sind ausreichend, daher ist diese Alternative abgelehnt.

### Host-Presenter-APIs löschen

Ihr Löschen würde mehr Code entfernen, aber die Entscheidung bewahrt Host `presentCall` und `presentResult`. Ihre APIs, Implementierungen, Tests und Typen bleiben unabhängig von Session Remote.

### Host-Tool-Implementierungen in den Client importieren

Tool-Pakete enthalten Node-, Dateisystem-, subprocess- oder provider-Abhängigkeiten und können nicht in das Browser-Bundle gelangen. Der Client konsumiert nur rohes JSON und unterhält schmale Parser innerhalb seiner eigenen Renderer, daher ist diese Alternative abgelehnt.

### Darstellung pro Ergebnis vom Host abfragen

Ein On-Demand-RPC würde einen Seitenlesenvorgang in N Netzwerkaufrufe verwandeln und würde weiterhin Host-Suchen, Scope-Wiederherstellung, callId-Wiederherstellung und Fehlerkoordination erfordern, daher ist diese Alternative abgelehnt.

### Darstellungsverbesserungen zulassen

Das Bündeln reichhaltigerer Code-Dispatch-Karten, Fehl-Aufrufkopf-Inferenz oder anderer historischer Darstellungsverbesserungen mit der Ownership-Änderung würde verhindern, dass Snapshots die Äquivalenz beweisen. Diese Entscheidung lehnt diese Kopplung ab; die [Nested-Terminal-Card-Ausnahme](../bug-fix/2026-09-05-nested-terminal-cards.de.md) lockert keine Nicht-Terminal-Kind-Beschränkungen.

### Temporäre Generic-Verschlechterung akzeptieren

Das Stoppen der View-Lieferung vor der Fertigstellung der Client-Karten würde das terminal-, diff-, read-, search-, web- und Deliverables-Verhalten vorübergehend verschlechtern. Client-äquivalente Ableitung und Host-Entfernung müssen in derselben veröffentlichbaren Änderung landen.

## Konsequenzen

Die Entscheidung entfernt Darstellungsarbeit, wiederholte Scans und doppelte View-Payloads aus Session-Lesevorgängen. Ihr Preis ist, dass der behaltene Host-Presenter und die Client-Kartenableitung unabhängig voneinander evolvieren können, sodass beide Seiten eigentümerspezifische Tests erfordern und Web-Äquivalenz eine explizite Produktbeschränkung bleibt.

### Client- und Host-Logik driften

Jedes Tool kann einen Host-Render-Intent und eine Client-Kartenableitung haben. Sie bedienen verschiedene consumer und teilen keinen Laufzeitpfad. Unrefreshte Browser-Erwartungsausgaben pinnen visuelle Äquivalenz für die First-Party-Web-Erfahrung, während Host-Presenter-Tests nur die Host-API beschränken.

### Gleichnamige provider fehlt stabile Identität

Ein rohes Ereignis zeichnet den Tool-Namen, aber nicht die spezifische ToolDefinition auf. Der Client verwendet gültige Ereignisfelder, um Unterschiede zwischen standard- und persistenten Shells zu bewahren. Mehrdeutige benutzerdefinierte oder fehlerhafte Eingabe fällt auf Generic zurück; das Protokoll hat keinen zusätzlichen Hinweis für theoretische Erweiterbarkeit.

### Metadaten sind unbekanntes JSON

Alte Sessions können Felder fehlen, und manuell bearbeitete Logs können fehlerhafte Werte enthalten. Jedes Client-Modell muss lokal verengen und kann keine unbekannten Arrays oder Objekte direkt in UI-Primitive übergeben.

### Preset-eigene Projektionsverfügbarkeit

Die Historie kompensiert nicht für Projektionseinheiten, die in der aktuellen Komposition fehlen. Eine Preset-eigene Einheit, die über einen kalten Lesevorgang sichtbar bleiben muss, erfordert, dass die geteilte Session-Vorbereitungs-/Projektionskomposition ihre Definition vor dem Restore verfügbar macht; die Historie darf keinen Preset-Mount- oder Presenter-Setup-Zweig wiedererhalten.

### Zwei Ziele müssen synchron bleiben

Chat und Trajectory haben separate Tool Definitions und tragen beide die rohen Felder. Die Kartenableitung bleibt nur in `ui-tool` und kann nicht in eine der beiden Definitions kopiert werden.

### Deliverables hat eine versteckte Abhängigkeit

Deliverables ist keine visuelle Komponente, sodass sein Mutationsparser mit den unterstützten First-Party-Write-Tools synchron bleiben muss. Dedizierte Tests pinnen Datei-Chips und Markdown-Links unabhängig von Karten-Screenshots.

### fixtures können falsches Vertrauen erzeugen

fixtures senden rohe Ereignisse und Metadaten statt handgeschriebener Views. Echte Host-Assemblierungsabdeckung bleibt notwendig, weil fixture-only-Snapshots den Transportpfad nicht beweisen können.

### Fälschliches Snapshot-Refresh

Diese Änderung verspricht unveränderte benutzersichtbare Ausgabe. Ein Snapshot-Unterschied muss in der Client-Ableitung behoben werden. Erwartungsausgaben dürfen nicht refresht werden, es sei denn, der Eigentümer genehmigt separat eine spezifische visuelle Änderung.

### Dokumentationsdrift

Die Agent Note, Paket-READMEs, das Handbuch, die Root-Regeln und generierte Referenzen müssen sich gemeinsam ändern, wann immer das rohe Journal oder der Client-Darstellungseigentümer sich ändert. Die Host-API-Dokumentation bleibt separat.

### Remote-Protokollverengung

Die Abwesenheit von optionalem `view` ist eine Prerelease-Protokolltypentscheidung, die von allen consumern geteilt wird. Es gibt keinen Kompatibilitäts-Shim, kein Dual-Writing und keine Versionsverhandlung.

## Verhältnis zu bestehenden Entscheidungen

[Nested terminal cards](../bug-fix/2026-09-05-nested-terminal-cards.de.md) ersetzt teilweise nur das Terminal-Kindkarten-Verbot und seine visuelle Äquivalenzanforderung. Diese Note bleibt aktiv für Raw-Journal-Ownership, Client-Ableitung und die diff/read/search/web-Kindbeschränkungen.

Diese Note ersetzt teilweise das Implementierungsfakt in [Client tool presentation ownership](../../archived/architecture/2026-08-08-client-tool-presentation-ownership.md), dass „Kartenmodelle Host-Views erhalten“. Ihre Kernentscheidungen bleiben: `ui-tool` besitzt Darstellung, Business-Plugins verwenden keyed-slots, und Conversation besitzt nur Lifecycle und Topologie.

Diese Note bewahrt die [Toolview-Auflösung](../../archived/architecture/2026-07-23-toolview-dissolution.md): Der Client hat weiterhin ein slot-Registrierungsmodell und stellt keine `ToolViewRegistry` wieder her.

Diese Note verengt den consumer-Umfang der [Render-Intent-Union](2026-07-02-tool-render-intent-union.de.md). Die Host-APIs und -Typen bleiben, während Session Remote und der Web-Client sie nicht konsumieren. Diese Note besitzt die Transport-Trennung, ohne diese Presenter-Entscheidung neu zu schreiben.

Diese Note aktualisiert den Eintragsvertrag aus [Session history and Remote event transport](2026-08-18-session-history-and-event-transport.de.md): Das Journal transportiert nur rohe Ereignisse plus eine unabhängige Projektionsbaseline, keine transienten Tool-Views.

Diese Note folgt [Conversation Node assembly](2026-08-09-client-conversation-node-assembly.de.md): Die Tool Definition besitzt Ereignispaarung und den Aufrufbaum, während konkrete Kartenmodelle in `ui-tool` bleiben.

Diese Note bewahrt Ergebnismetadaten aus dem [kanonischen Tool-Output-Vertrag](2026-07-20-canonical-tool-output-contract.de.md), weil sie die verlustfreie, reproduzierbare Eingabe zur Client-Ableitung sind.

## Zurückgestellt

- Eine separate explizite Entscheidung kann das Löschen von Host-Presentern evaluieren, wenn sie ohne produktive consumer bleiben; diese Entscheidung urteilt nicht vorab darüber.
- Spezialisierte diff-, read-, search- und web-Karten für Code-Dispatch-subcalls erfordern ein separates Design und sichtbare Snapshot-Updates; terminal-Aufrufe sind durch die verlinkte teilweise Ablösung abgedeckt.
- Ein Drittanbieter-Mutations-Tool, das Deliverables beitritt, erfordert einen neuen Client-eigenen Beitrag; diese Entscheidung erzeugt keine registry für einen abwesenden consumer.
- Unterschiedliche Client-Darstellung für gleichnamige provider erfordert zuerst eine stabile, nicht-darstellungsbezogene Identität; sie darf keine pro-Seiten-Host-Views wiederherstellen.
- Wenn die Client-Kartenmodell-Performance gemessen werden muss, kann ein unveränderlicher-Block-Mikrobenchmark hinzugefügt werden; die ausgelieferte Architektur verbietet bereits das Scannen des Session-Fensters.
