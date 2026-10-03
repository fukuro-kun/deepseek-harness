# Agent Note: Standard-ACP-v1-Automatisierungs-Controls

Status: implemented

[English](2026-08-22-standard-acp-automation-controls.md) | [中文](2026-08-22-standard-acp-automation-controls.zh.md) | Deutsch

> Diese Note ersetzt nur das Nur-Prompt-Protokollinventar in [ACP als Automation-only-Protokoll](../simplification/2026-07-23-acp-automation-only-protocol.md). Das Verbot dieser Entscheidung, dass ACP zu einer zweiten Produkt-UI wird, bleibt maßgeblich.

## Problem

Die Automation-only-ACP-Bridge konnte eine frische Session erzeugen, jeweils einen Prompt einreichen, ihn canceln, committete Assistant-Nachrichten empfangen und One-Shot-Permission-Requests beantworten. Ein generischer externer Automatisierungs-Controller brauchte dennoch privates Prozesswissen, um Modelle zu entdecken, MCP-Server zu mounten, durable Sessions nach einem Restart zu finden, sie wiederaufzunehmen, eine Session unabhängig zu schließen und Reasoning-, Tool- oder Context-Pressure-Fortschritt zu beobachten. Diese Controls in einer integrationsspezifischen Runtime nachzubauen würde ACP nominell interoperabel machen, während die DSH-Automatisierung von einem privaten Seitenprotokoll abhängig bliebe.

Das stabile ACP-v1-Protokoll definiert bereits das benötigte Control-Vokabular. Private `_meta`, Custom-Methoden, Use-Case-spezifische Umgebungsbehandlung oder Präsentationsprojektionen hinzuzufügen würde dieses Vokabular fragmentieren und die UI-Kopplung wiederbeleben, die die Automation-only-Entscheidung entfernt hat.

## Entscheidung

`@deepseek-ai/dsh-acp` implementiert die vollständige Standard-ACP-v1-Automatisierungs-Teilmenge, die ein generischer Controller braucht: `session/new`, `session/list`, `session/resume`, `session/close`, `session/prompt`, `session/cancel`, `session/set_config_option`, JSON-RPC `$/cancel_request`, `session/update` und `session/request_permission`. Es verwendet `@agentclientprotocol/sdk` 1.4s App-/Context-Interface auf beiden Seiten jeder In-Repository-Verbindung.

Capabilities lassen nicht unterstützte Methoden und Features weg. DSH fügt weder Custom-Methode, Capability-Flag noch `_meta` hinzu und weist Client-Metadaten keine private Bedeutung zu. `session/load`, `session/delete`, `session/fork`, zusätzliche Directories, SSE- und ACP-Transport-MCP, Modes, Commands, Plans, Terminals, Client-Filesystem-Operationen und Elicitation bleiben nicht unterstützt. Session-Controls und semantische Updates sind Protokolldaten für die Automatisierung; sie machen ACP nicht zu einer menschlichen UI.

## Per-Session-Ownership

Ein `AcpSession`-Modul besitzt jeden veröffentlichten Agent-Handle, den gewählten Modell-State, Request-MCP-Mounts, den Single-Prompt-Slot, die geordnete Update-Kette und die memoized Close-Operation. Globale Event-Listener identifizieren nur den exakten Agent oder die Session und delegieren an dieses Modul. Das Modul assoziiert den Admission-Snapshot mit der identifizierten Nachricht im Speicher bis zum Inbox-Claim und pinnt ihn dann auf den zugelassenen Turn. Image-Capability-Checks, Prompt-Variablen, Request-Header und jeder Modellschritt verwenden daher ein Provider/Model/Reasoning-Tupel, während die gewöhnliche durable User-Source unverändert bleibt. Eine konkurrierende Konfigurationsänderung wirkt auf den nächsten ACP-Turn.

Explizites `session/close`, Verbindungsverlust und Plugin-Disposal rufen dieselbe Close-Operation auf. Sie bricht Admission und Agent-Arbeit ab, bevor sie wartet, drainet committete Updates und fortsetzbare Descendants, flushed Persistenz und gibt den Agent-Scope und seine MCP-Clients frei. Close behält das Event-Routing, bis der Drain abgeschlossen ist. Die Fehlerberichterstattung wartet auf alle eigenen Session-Teardowns, und Agents und Descendants anderer Frontends bleiben unberührt.

## Persistente Session-Controls

Vollständige ACP-Lifecycle-Unterstützung erfordert Session-Persistenz. `session/list` liest materialisierte Top-Level-Header, schließt aktive und Descendant-Sessions aus, filtert nach kanonischem physischem `cwd`, sortiert nach Creation-Zeit und ID und gibt begrenzte Seiten über opaque Keyset-Cursor zurück. Summaries lassen Titel und Präsentationsmetadaten bewusst weg.

`session/new` bittet die Persistenz explizit, den Live-Session-Header zu materialisieren, ohne ein Session-Event zu erfinden, sodass selbst eine leere Session geschlossen, gelistet und wiederaufgenommen werden kann. Andere Frontends behalten den Lazy-Default des Persistenz-Seams und lassen verwaiste leere Sessions unmaterialisiert. `session/resume` lehnt aktive IDs und nicht-Top-Level- oder unbekannte persistierte IDs ab, verifiziert das angeforderte kanonische `cwd` vor der Agent-Composition, stellt die durable Session wieder her, ohne sie dem Client zu replayen, und mountet die von diesem Request gelieferten MCP-Deklarationen. `session/close` lässt das durable Log für einen späteren Prozess verfügbar.

Die Persistenz behandelt `create(meta)` bewusst als Live-Registrierung: Der ausgelieferte JSONL-Provider erzeugt kein Artefakt bis zum ersten Event-Append. Dieser Default entfernt verwaiste leere Sessions, aber ACP kann ihn nicht erben, weil `session/new` eine Session-Identität vor jedem Prompt veröffentlicht und der Prozess nach der Erfolgsantwort stoppen kann, ohne `session/close` zu erhalten. Die Bridge materialisiert erst nach erfolgreicher Agent- und MCP-Composition und vor der Rückgabe von `session/new`; fehlgeschlagene Composition bleibt rückstandsfrei, während jede zurückgegebene ID einen Restart überlebt.

Die Bridge materialisiert über die gewöhnliche Durability-Barriere: `ctx.sessions.flush(session)` erreicht den Write-Handle der Session, dessen `flush` Header-only-Materialisierung schreibt, wenn noch nichts angehängt wurde. JSONL schreibt einen Header-Frame; ein Out-of-Tree-Provider muss äquivalenten Header-State atomar materialisieren oder die Operation ablehnen. Wiederholte Aufrufe sind idempotent. `create` eager zu machen würde das Abandoned-Session-Verhalten jedes Frontends ändern, ein synthetisches Event anzuhängen würde eine Sequenz- und Replay-Tatsache allein zum Auslösen von Storage erfinden, und Warten bis zum Close ließe Dauerhaftigkeit gegen Prozessverlust racen.

## Standard-Konfigurationsoptionen

Der advisory LLM-Katalog bedient jetzt einen weiteren Automatisierungs-Consumer, ohne Request-Validierung zu werden. ACP legt ein Provider-gruppiertes `model`-Select offen, dessen opaque Werte das Provider/Model-Paar behalten, plus ein abhängiges `reasoning_effort`-Select aus dem aufgelösten exakten Modell. Ein Modell mit Efforts, aber ohne Adapter-konfigurierten Default enthält `Provider default`, was das Weglassen erhält und den Provider wählen lässt. New-, Resume- und Set-Responses geben den vollständigen State zurück. Adapter-Topology-Events emittieren `config_option_update`; Per-Session-Mutationen serialisieren in Empfangsreihenfolge. Der konfigurierte ACP-Provider/das Modell bleibt die initiale Auswahl, und nicht gelistete konfigurierte Routen werden in die zurückgegebenen Optionen synthetisiert statt abgelehnt.

## Standard-MCP-Mapping

`session/new` und `session/resume` akzeptieren Standard-Stdio- und Streamable-HTTP-MCP-Deklarationen. Stdio verwendet das Session-`cwd`; HTTP verwendet die deklarierte URL und Header; beide behalten `dsh-mcp-client`-Timeout- und Reconnect-Defaults. Namen, Kommandos, URLs, Umgebungseinträge, Header und doppelte normalisierte Namespaces werden vor der Agent-Veröffentlichung validiert. Initiale Verbindungs- oder Discovery-Fehler rollen den unveröffentlichten Agent zurück.

MCP-Namespace-Reservierungen folgen dem nächsten DSH-Registrierungsscope statt dem Prozess-Root. Unabhängige Agent-Scopes dürfen denselben Servernamen verwenden, während doppelte Namen innerhalb eines Agent weiterhin fehlschlagen. Gescoptes Disposal gibt Tools, Transports und Reservierungen frei.

ACP-Clients sind vertrauenswürdige Controller: Eine Stdio-Deklaration autorisiert Prozessausführung und eine HTTP-Deklaration autorisiert Requests mit ihren Headern. DSH fügt keine per-Server-privaten cwd- oder Timeout-Felder hinzu. Die gewöhnliche DSH-Tool-Policy regiert Aufrufe weiterhin, nachdem Tools gemountet sind.

## Semantische Update-Projektion

Nur committete durable Fakten erreichen `session/update`. Assistant-Text/-Bilder werden `agent_message_chunk`; Reasoning wird `agent_thought_chunk`; Tool-Calls/-Results werden generische `tool_call` und `tool_call_update`; bekannter gemessener Context-Druck und Kapazität werden `usage_update`; Adapter-Topology-Änderungen werden `config_option_update`. Durable Message-IDs und Tool-Call-IDs erhalten die Korrelation. Der kanonische DSH-Tool-Name ist der Standard-Tool-Call-Titel.

Die Per-Session-Kette serialisiert alle Updates und drainet vor Prompt-Vollendung. Eine Tool-Call-Notification drainet, bevor ein Permission-Request sich auf sie bezieht. Rohe Modell-Deltas, Retry-Versuche, Cards, Terminal-State, Diffs, Locations, Plans, Titles, Todos und nicht unterstützter Inhalt bleiben vom Wire fern.

`session/cancel` und `$/cancel_request` treten in denselben Prompt-eigenen Cancellation-Pfad ein. Korrelierte Endungen mappen nur auf Standard-Stop-Reasons und JSON-RPC-Fehler; ein Modell-Output-Limit meldet `max_tokens`. ACP gibt keine zusätzliche DSH-Ergebnisstruktur zurück.

## Erwogene Alternativen

**Eine private Controller-Erweiterung hinzufügen.** Abgelehnt, weil Standard-ACP-v1 die benötigten Lifecycle-, Konfigurations-, MCP-, Cancellation-, Permission- und Semantic-Update-Konzepte bereits trägt. Eine private Erweiterung würde generische SDK-Clients unvollständig machen.

**Die frühere Editor-Projektion wiederherstellen.** Abgelehnt, weil Plans, Terminals, Diffs, Cards, Navigation und menschliche Elicitation Präsentationsverantwortung sind. Semantische Tool- und Reasoning-Fakten sind nützliche Automatisierungs-Telemetrie, ohne Präsentationsmodule zu importieren.

**Jede ACP-Session-Methode implementieren.** Abgelehnt. List, Resume und Close vollenden den durable Automatisierungs-Lifecycle. Load/Replay, Delete und Fork führen separate Transcript-, Destructive-Storage- und Lineage-Semantiken ein, die dieser Use Case nicht benötigt.

**Instabile Provider-Methoden für die Modell-Discovery verwenden.** Abgelehnt, weil Standard-Session-Konfigurationsoptionen die Wahl ausdrücken und auf die Session gescopt bleiben.

**Jedes DSH-Runtime-Feld in ACP-Metadaten kopieren.** Abgelehnt, weil exakte Token-Breakdowns, private Ergebnis-Stati, programmatische Anzeigenamen und Per-MCP-Tunables kein stabiles ACP-v1-Äquivalent haben.

## Verifikation

Fokussierte Tests decken exakte Capability-Advertisement ohne private Metadaten ab; Model/Reasoning-Auswahlen, ungültige und konkurrierende Mutation, Topology-Updates und Image-Route-Pinning; Stdio/HTTP-MCP-Setup, Deklarations-Rollback, Scope-Isolation, Resume und Disposal; Listen-Paginierung, kanonische Workspace-Checks, Active-Konflikte, Close/Resume und Restart-Recovery; Message-/Thought-/Tool-/Usage-Reihenfolge und IDs; Tool-vor-Permission-Reihenfolge; Standard-Stop-Reasons; Request- und Session-Cancellation; und Connection-Loss-Teardown.

Ein generischer schlüsselloser Conformance-Test bootet die echte ACP-Demo zweimal und verwendet nur das öffentliche ACP-SDK, um ein Modell und einen Reasoning-Effort zu wählen, einen MCP-Server zu mounten, einen Tool-Turn auszuführen, Standard-Updates zu beobachten, zu schließen, neu zu starten, zu listen, wiederaufzunehmen und zu canceln. Er enthält keine integrationsspezifischen Namen, Abhängigkeiten, Metadaten oder Umgebungsverhalten.

## Konsequenzen

Externe Automatisierungsprojekte können DSH über stabiles ACP v1 verwenden, statt ein DSH-spezifisches Runtime-Protokoll zu pflegen. Die Bridge ist eine größere Control-Oberfläche, bleibt aber kleiner als eine UI: Sie besitzt Lifecycle- und semantische Interoperabilität, während menschliche Präsentation und Interaktion in Produkt-Clients bleiben.

Persistenter Lifecycle und Request-MCP-Mounting machen die Session-Erzeugung strikter. Fehlkonfiguration und initiale MCP-Fehler werden vor der Veröffentlichung abgelehnt, und Close wartet auf echte Quiescence und Persistenz. Dieser Preis ist der Ownership-Nachweis, der nötig ist, um Teil-Agents, geleakte Tools oder verwaiste Prozesse zu vermeiden.
