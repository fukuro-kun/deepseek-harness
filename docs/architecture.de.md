# DeepSeek Harness-Architektur
[English](architecture.md) | [中文](architecture.zh.md) | Deutsch


Lies dies, bevor du etwas unter `packages/` änderst. Es setzt voraus, dass du Cordis kennst; wenn nicht, beginne mit der [Einführung](cordis-primer.de.md) oder dem [Tutorial](cordis-tutorial/index.de.md).

Wir empfehlen, einen Agenten zu nutzen, um die Codebasis zu erkunden und ihre Architektur zu verstehen.

## Cordis

[Cordis](cordis-primer.de.md) ist das Framework unter dsh: Plugins tragen Dienste, typisierte Ereignisse und reversible Effekte in einen gemeinsamen Kontext bei. Jeder Teil des Produkts ist ein Plugin, einschließlich des Modell-Adapters, des Tool-Registers, des Session-Logs und der Agenten-Schleife selbst, sodass jeder aus der Konfiguration ersetzbar ist.

Es gibt keinen privilegierten Kern, der gepatcht werden müsste: Du erweiterst dsh, indem du ein Plugin neben die anderen montierst, und Registrierungen sind Effekte, die sich aufrollen, wenn ihr Plugin entladen wird.

## Profile und Bundles

Ein laufendes `dsh` ist ein Plugin-Baum, der beim Start aus geordneten Ebenen zusammengesetzt wird.

Ein **Profil** ist eine benannte Zusammensetzung, die im Harness-Home gespeichert ist. Es listet die Bundles auf, die es stapelt, enthält die installierten Plugins außerhalb des Baums und bewahrt die eigene `cordis.patch.yml` des Nutzers. `web`, `headless`, `sdk`, `sdk-minimal` und `acp` werden als Vorlagen ausgeliefert.

Ein **Bundle** ist ein Verteilformat für Cordis-Konfigurationszeilen und den Code, den sie montieren, sodass alles, was es einfügt, von den darüberliegenden Ebenen patchbar bleibt.

Jede deklariert sich in ihrer eigenen `package.json` unter einem `dsh`-Feld: `dsh.profile` listet die Bundles eines Profils, und `dsh.bundle` verweist auf die Patch-Datei eines Bundles.

[`dsh-base`](../packages/bundle/base/README.de.md) ist die gemeinsame erste Ebene der Profile `web`, `headless`, `sdk` und `acp`: Modell-Adapter, Tools, Persistenz, Sandbox- und Genehmigungspolitik, Einstellungen, Anmeldedaten, Telemetrie. [`dsh-web-app`](../packages/bundle/web-app/README.de.md) fügt die Browser-Anwendung hinzu, [`dsh-headless`](../packages/bundle/headless/README.de.md) einen Einmal-Ausführer ohne Server, [`dsh-sdk-app`](../packages/bundle/sdk-app/README.de.md) den SDK-JSON-RPC-Server und [`dsh-acp-app`](../packages/bundle/acp-app/README.de.md) den nur für Automatisierung gedachten ACP-Server. [`dsh-sdk-minimal`](../packages/bundle/sdk-minimal/README.de.md) ist die bewusste Ausnahme: Ein Bundle besitzt seinen vollständigen, expliziten SDK-Baum und wendet `dsh-base` nicht an.

Ebenen werden in dieser Reihenfolge auf eine leere Eintragsliste angewendet: jedes Bundle in der im Profil aufgeführten Reihenfolge, dann die `cordis.patch.yml` des Profils, dann die auf Home-Ebene, dann jedes `--patch`-Overlay. Ein Patch adressiert eine Zeile per id und ersetzt ihre gesamte Konfiguration oder fügt neue Zeilen ein.

Eigene Profile laden Patches standardmäßig live neu. Das mitgelieferte `web`-Profil ist live; `headless`, `sdk`, `sdk-minimal` und `acp` wenden alle Ebenen einmalig beim Start an, weil der Austausch der Abhängigkeiten einer Einmal- oder stdio-Anwendung, nachdem sie Arbeit übernommen hat, deren Lebenszyklus ungültig machen würde.

Um den Baum zu sehen, mit dem dein Rechner startet:

```sh
dsh --profile web --dump-config
```

Jede Zeile, die es ausgibt, kann durch einen eigenen Patch ersetzt werden.

Die Zusammensetzungsmechanik steht in [app-boot](../packages/boot/app-boot/README.de.md#profiles); die Konfigurationsfelder im generierten [Konfigurationskatalog](config-catalog.de.md).

## Anwendungsstart

Jede unterstützte Node-Anwendung startet über die `dsh`-CLI mit einem benannten Profil. Die mitgelieferten Anwendungen sind `dsh web` (der bewusste Alias für `--profile web`), `dsh --profile headless`, `dsh --profile sdk`, `dsh --profile sdk-minimal` und `dsh --profile acp`. Das TypeScript-SDK löst seine `dsh`-Abhängigkeit in gleicher Version auf und wählt `sdk`; eine eigene Plugin-Zusammensetzung bleibt ein Profil plus geordnete Patch-Dateien, keine weitere ausführbare Datei oder ein inline-Anwendungsbaum. `sdk-minimal` ist ein eigenständiges, dem Repository gehörendes Bundle hinter demselben Startprogramm, kein vom Aufrufer gelieferter Cordis-Baum.

Vendored CLIs, nur für Build und Test bestimmte ausführbare Dateien, das direkte In-Prozess-Montieren von Plugins und die private Browser-WebWorker-Vorschau sind keine Harness-Anwendungsstartprogramme. [`verify-application-entrypoints`](../scripts/verify-application-entrypoints.ts) hält jedes Paket-Bin, jede ausführbare Quelle und jede Root-Demo in einer expliziten Kategorie und lehnt einen Node-Anwendungspfad ab, der `dsh` umgeht.

Das Python-SDK folgt derselben Anwendungsarchitektur. Sein Runtime-Wheel paketet die normale `dsh`-CLI als `deepseek-harness-sdk-runtime-<platform>-<arch>`, und der Client startet standardmäßig `dsh --profile sdk` mit einem expliziten Harness-Home. Das Minimalbeispiel wählt das mitgelieferte `sdk-minimal`-Profil. Python stellt Profilwahl und geordnete Patch-Dateien bereit, keinen vollständigen Cordis-Baum; dauerhafte externe Plugins werden über `dsh plugin` installiert. Der entfernte private Direkt-Konfigurations-Träger hat weder ein Kompatibilitäts-Bin noch einen Fallback-Parser.

## Desktop-Anwendung

Die [Electron-Desktop-Anwendung](../apps/desktop/README.de.md) besitzt das reservierte npm-Projekt `$DSH_HOME/profiles/desktop`. Jede signierte Electron-Version bindet genau eine dsh-Version und trägt einen First-Party-Offline-Seed; der Start installiert diese Version mit dem eingebundenen pnpm in das schreibbare Profil und bewahrt dabei die genauen Desktop-Plugin-Versionen des vorherigen Profils. CLI-Profile teilen sich unterstützte Produktdaten unter `$DSH_HOME`, aber niemals ausführbare Pakete, Plugin-Aktivierung, Lockfiles oder `node_modules` mit Desktop.

Electron startet das private Desktop-Host-Paket unter seinem eingebundenen upstream Node.js-Prozess; dieses Paket lädt das installierte dsh-Backend und den passenden Client-Graphen aus dem reservierten Profil. Unäre RPC-Aufrufe, Remote-Streams und versionsgematchte Client-Assets durchqueren versionierte, gerahmte Byte-Pipes, wobei Node IPC der Lebenszykluskontrolle vorbehalten ist, und erreichen den Renderer anschließend über das sichere `dsh-app://`-Protokoll; die Desktop-Zusammensetzung öffnet keinen Web-Server und keinen Loopback-Port. Nur die Shell-eigene UI kann über das eingebundene pnpm und dessen privaten `$DSH_HOME/desktop/pnpm/store` Plugin-Transaktionen ausführen.

## Kernpakete

Hier sind einige Kernpakete, die zum Cordis-Baum beitragen.

| Paket | Zuständigkeit | `ctx`-Schlüssel |
|---|---|---|
| [`core/session`](subsystems/session.de.md) | Das nur anfügbare `SessionEvent`-Log und der Speicher im Arbeitsspeicher | `ctx.sessions` |
| [`core/system-prompt`](subsystems/system-prompt.de.md) | Die Zusammenstellung von Prompt-Abschnitten und Tool-Schemas | `ctx.systemPrompt` |
| [`core/tools`](subsystems/tools.de.md) | Das bereichsgebundene Tool-Register und die abgesicherte Ausführungspipeline | `ctx.tools` |
| [`core/agent`](subsystems/core.de.md) | Die `Agent`-Schnittstelle, das aktive Register und die `agent/*`-Ereignisse | `ctx.agents` |
| [`core/agent-loop`](subsystems/core.de.md) | Der Standard-Treiber, der diese Schnittstelle implementiert | `ctx.agentLoop` |
| [`core/scope`](subsystems/scope.de.md) | Das Primärregister für die pro-Agenten-Bereichsregistrierung | Bibliothek, kein Schlüssel |
| [`llm/llm`](subsystems/llm-streaming.de.md) | Das Vokabular für Nachrichten und Streams sowie die Adapter-Nahstelle | `ctx.llm` |
| [`webhook/webhook`](subsystems/webhook.de.md) | Die Dispatch-Verwaltung für authentifizierte Zustellung und die Erstellung von Workspace-Sessions | `ctx.webhookRuntime` |

## Ereignisse

Ereignisse sind die Erweiterungspunkte, und die Wahl des richtigen Bereichs ist die erste Entscheidung bei den meisten Änderungen.

- **Session-Ereignisse** sind dauerhafte Fakten, die dem Log angehängt und über `session/event` ausgestrahlt werden. Nutze eines, wenn der Fakt einen Neuladen überleben muss.
- **Agenten-Ereignisse** (`agent/*`) tragen einen aktiven `Agent`: Posteingang, Schritt, Status, Anfrage, Validierung, Fortsetzung. Nutze eines, um laufende Arbeit zu beobachten oder abzufangen.
- **Fähigkeits-Ereignisse** hängen Richtlinien und Adapter an eine Nahstelle (`fs/*`, `tools/*`, `telemetry/*`) an, ohne die Schleife zu importieren.

Die [Ereigniskarte](event-producer-consumer.de.md) listet die Erzeuger und Verbraucher jedes Ereignisses.

## Rundenablauf

Ein **Schritt** ist eine Modell-Anfrage plus die Tools, die sie aufruft. Eine **Runde** besteht aus null oder mehreren Schritten: Sie öffnet sich, bevor ihre erste Eingabe beansprucht wird, und schließt sich, wenn nichts mehr aussteht.

```text
turn/start
  claim next-step input plus one queued message
  assemble prompt sections + tool schemas; project runtime context
  -> agent/pre-step                   reject | enter(messages, startsRequestSeries?)
     reject, or a first enter rewritten empty -> close the turn with no step
     step/start
     agent/request -> prepareCall (cancellation commits neither system nor users)
     reconcile system/message using the prepared call capability
     append entered messages as user/message; log request/header and request/context as needed
     derive and freeze model history from the log
     stream the bound prepared call -> llm/stream -> agent/assistant-stream start
       agent/assistant-stream chunk*
       assistant/message | assistant/attempt -> agent/assistant-stream end
     tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*
     step/end
     tools owe another request, or next-step input arrived -> claim -> next step
  -> agent/turn-stopping
turn/end
```

`turn/*`, `step/*`, `system/message`, `user/message`, `assistant/message`, `assistant/attempt` und `tool/*` sind dauerhafte Session-Ereignisse; der Rest besteht aus live-Erweiterungspunkten in drei Bereichen. `agent/assistant-stream` veröffentlicht prozesslokale Start-, transiente Chunk- und End-Frames. Die Schleife schreibt den vollständigen kompakten Stream als eine Nachricht oder einen nur im Log geführten Versuch fest, bevor ein festgeschriebenes End-Frame folgt, und der Web-Session-Follow-Adapter ist der einzige Remote-Verbraucher des live-Ereignisses. `agent/pre-step`, `agent/request`, `llm/stream` und die drei `tools/*`-Ereignisse sind Kaskaden, deren Listener `next()` aufrufen müssen, um weiterzudelegieren; `agent/turn-stopping` ist seriell und hat kein `next()`.

Eingaben erreichen den Treiber über einen gemeinsamen Posteingang. Manche Nachrichten wecken ihn sofort; injizierter Kontext wartet im Posteingang, bis eine andere Nachricht es tut.

`agent/pre-step` entscheidet über die angenommene Eingabe. Listener dürfen beanspruchte Nachrichten umschreiben oder ablehnen; eine abgelehnte oder leere erste Beanspruchung schließt eine dauerhafte Runde ohne Schritt. Eine `enter`-Entscheidung kann `startsRequestSeries` setzen: Die Schleife protokolliert einen frischen `request/header` (Grund `series` oder `change` mit `startsSeries: true`, wenn sich auch der Umschlag geändert hat). Wrapper-Listener bewahren diese Deklaration mit `{ ...decision, messages }`. Nach der Zusammenstellung und `step/start` lösen `agent/request` und `prepareCall()` die tatsächliche Route auf, bevor System-Prompt und angenommene Nutzer festgeschrieben werden; ein Abbruch in einer der asynchronen Phasen schreibt weder fest. Die Fähigkeit des vorbereiteten Aufrufs regelt die Prompt-Zulassung, nicht den vorangegangenen `request/context`. Jeder Versuch gleicht dieselbe gerenderte Zusammenstellung synchron ab, hängt Nutzer nur beim ersten Versuch an, protokolliert Header/Kontext nach Bedarf und leitet die Anfrage ab und friert sie ein, bevor der gebundene Aufruf gestreamt wird. Wiederholungen wiederholen weder Zusammenstellung noch `agent/pre-step`. Oberflächen-Ersatz nach der Anbindung startet eine neue Anfrage-Serie, einschließlich während des ersten fortgesetzten pre-step; eine unveränderte Fortsetzung setzt die Serie fort. Der erste zugelassene Schritt reserviert den System-Kopf vor den Nutzernachrichten, selbst bei leerem Prompt (keine Protokollnachricht). Der Prompt reist nur als `system/message`-Historie: Eine leere Darstellung räumt alle aktiven System-Knoten und lässt keinen alten Prompt modell-sichtbar; fähige Routen können nicht-leere Aktualisierungen nach dem gepufferten Präfix anhängen; unfähige Routen und neue Anfrage-Serien bündeln nicht-leeren Prompt-Text am ersten System-Knoten, mit protokollierten leeren Ersatz-Einträgen für nicht-leere spätere System-Knoten ([Entscheidung](../.agents/notes/implemented/architecture/2026-09-02-system-prompt-as-surface-node.de.md); [Entscheidungsregel](../packages/core/agent-loop/README.de.md#understand-the-implementation)).

Die Schleife sendet unveränderliche Anfragen und hält den Abbruch dabei live. Sie wiederverwendet die Herkunftsnachweise des Nachrichtenfrierens nur für Identitäten, die sie vollständig eingefroren hat; [agent-loop](../packages/core/agent-loop/README.de.md) besitzt die Regeln für den Anfrageaufbau.

Details: das [Sequendiagramm](agent-lifecycle.de.md), die [Tool-Pipeline](tool-execution-pipeline.de.md) und [Abbruch und Fehlererholung](subsystems/core.de.md#the-agent-handle).

## Session-Log

Das Session-Log ist die Quelle des Kontexts, den das Modell sieht. `deriveMessages()` projiziert die Modell-Historie daraus. Jedes `assistant/message` bettet den exakten kompakten zeitgestempelten Stream ein, der seinen zusammengestellten Inhalt erzeugte; `assistant/attempt` bewahrt abgewickelte fehlgeschlagene, wiederholte, abgebrochene und Stream-Fehler-Versuche, ohne Modell-Historie hinzuzufügen. Fork, Fortsetzung, Transkripte, Telemetrie und Persistenz leiten sich alle aus diesen dauerhaften Abwicklungen ab, während die live-Zunahme der UI aus `agent/assistant-stream` kommt; ein harter Prozessverlust vor der Abwicklung hinterlässt keinen dauerhaften Versuchs-Stream ([Entscheidung](../.agents/notes/implemented/architecture/2026-09-01-v2-embedded-assistant-streams.de.md)).

Session-Verbraucher kennen nur das aktuelle logische Format. `stat` und `list` in der header-nur-Form durchsuchen jedes Session-Verzeichnis neu, wählen seine numerisch höchste kanonische Generation und übersetzen einen unterstützten historischen Header, ohne Ereignisse zu laden oder einen Nachfolger zu veröffentlichen. Ein `open` einer gespeicherten Session wählt dieselbe Generation, lehnt eine zukünftige Version ab oder dekodiert und komponiert die statische benachbarte Migrationskette einmal, bevor es validierte aktuelle logische Ereignisse zurückgibt. Ein Lese-`open` verwendet dieses Ergebnis im Speicher, ohne einen Nachfolger zu veröffentlichen; ein Schreib-`open` kodiert, verifiziert und veröffentlicht zuerst den finalen versionsbenannten Nachfolger exklusiv neben der unveränderten Quelle. Die gewöhnliche Reparatur eines nicht versiegelten, unterbrochenen Endes bleibt die Verantwortung eines Handle-Verbrauchers; die Migration fügt ein fehlendes unterbrochenes `turn/end` nur für den begrenzten freigegebenen Neustart ein, der bereits durch ein späteres `turn/start` versiegelt ist. JSONL v0 verwendet `session.jsonl[.zstd]`, v1 und später die kleingeschriebene `session.vN.jsonl[.zstd]`, und festgeschriebene Generationspfade werden niemals umbenannt, ersetzt oder gelöscht. Der JSONL-Anbieter besitzt die physische Rahmung, Kompression, Generationsauswahl und exklusive Veröffentlichung, während jedes benachbarte Migrationspaket genau einen `vN -> vN+1`-Schritt besitzt ([Entscheidung](../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.de.md)).

**Modell-sichtbar bedeutet protokolliert.** Alles, was eine Modell-Anfrage erreicht, muss aus dem Log rekonstruierbar sein, und eine Laufzeit-Invariante besagt das. Darum erfordert eine neue modell-sichtbare Eingabe ein neues Session-Ereignis: `SessionEventMap` erweitern und aus dem Log rendern.

**Projektions-Nahstelle.** `dsh-session-projection` besitzt `ctx.sessionProjections`: registrierte Einheiten falten festgeschriebene Ereignisse inkrementell, Host-Verbraucher lesen einen typisierten Zustand mit `stateOf()`, und Träger stapeln beschnittene Client-Ansichten mit `snapshot()`. Ein Host-Leser verlangt diesen Dienst entweder während der Aktivierung oder schlägt explizit fehl, wenn das Register oder der erforderliche Schlüssel fehlt. Beiträger dürfen die `ctx.inject(['sessionProjections'], ...)`-Registrierung beibehalten, ohne einen fehlenden Host-Wert stillschweigend auf einen Standardwert zu setzen. Die Agenten-Schleife registriert einen gemeinsamen `turnBoundary`-Zustand für ihre Leser ([Entscheidung](../.agents/notes/implemented/architecture/2026-08-19-session-projection-mandatory-seam.de.md)).

## Fähigkeitsnähte

Eine **Nahstelle** ist eine austauschbare Fähigkeit mit drei Rollen: einer **Dienstdefinition**, die die Schnittstelle deklariert, einem **Dienstanbieter**, der sie implementiert, und einem **Verbraucher**, der sie nutzt, gewöhnlich ein modell-zugewandtes Tool. Ein Paket kann Rollen kombinieren, aber eine Rolle allein ist keine Nahstelle; eine Fähigkeit hinzufügen heißt, alle drei zu entwerfen ([Fähigkeitsgraph](capability-seams.de.md)).

Nahstellen sind der Grund, warum ein einziger Anbieterwechsel das ganze Produkt verändert. Dateisystem- und Subprozess-Anbieter teilen sich eine Ausführungswelt, sodass das Zeigen auf eine ferne Sandbox Bash, PTY und LSP mitnimmt, ohne Anbieter-Forks. [Subagenten-Anbieter](subsystems/subagent.de.md) variieren hinter derselben Schnittstelle genauso breit, von einem frischen Kind-Agenten bis zu einer delegierten Runde in einem anderen Produkt.

[Experimentelle Agent-Teams](subsystems/agent-team.de.md) ist eine veröffentlichte, opt-in Koordinierungs-Nahstelle auf `ctx.agentTeams`, mit einer dauerhaften Teilnehmerliste, einem Aufgabenboard und einem Postfach, die über fortsetzbaren Subagenten gelegt sind.

## Wo neues Verhalten hingehört

Neues Verhalten hängt an einem dokumentierten Erweiterungspunkt. Eine Änderung der Schleife selbst aktualisiert diese Karte.

| Ziel | Mechanismus |
|---|---|
| Modell-Anbieter hinzufügen | seinen Adapter in `ctx.llm` registrieren |
| Modell-zugewandte Fähigkeit hinzufügen | in `ctx.tools` registrieren; sein Schema wird in die Prompt-Zusammenstellung aufgenommen |
| Einer Session einen anderen Fähigkeitssatz geben | einen Agent-Preset zusammensetzen; eine Dienstezeile dort benötigt einen `isolate`-Bereich |
| Shell-Ausführung hinzufügen | ein `ctx.shell`-Backend registrieren; das lokale Backend startet über `ctx.subprocess` |
| Dauerhafte Terminal-Ausführung hinzufügen | ein `ctx.terminals`-Backend plus `dsh-tool-terminal` registrieren |
| Menschenbefehl hinzufügen | in `ctx.commands` registrieren; er wird ohne Modellrunde ausgeführt |
| Hintergrundarbeit hinzufügen | in `ctx.jobs` registrieren; die `job_*`-Tools holen sie ab oder stoppen sie |
| Session von externem Webhook starten | eine vertrauenswürdige Regel in `ctx.webhookRuntime` registrieren und einen Anbieter-Adapter montieren |
| Dateisystemzugriff oder -richtlinie hinzufügen | einen `ctx.fs`-Anbieter registrieren oder `fs/*`-Ereignisse abhören |
| Gestartete Prozesse einschränken | ein `ctx.sandbox`-Backend verwenden; Verbraucher kapseln argv vor dem Start |
| Anfrage, Tool oder Runde abfangen | sein `agent/*`- oder `tools/*`-Ereignis verwenden; `agent/turn-stopping` stoppt eine Runde |
| Modell-zugewandten Kontext hinzufügen | `agent.inject()` aufrufen; er landet in der nächsten zugelassenen Anfrage |
| UI- oder Editor-Integration hinzufügen | `ctx.agents` steuern und aus `session/event` rendern |
| Web-Client-Chat-Knoten hinzufügen | eine `ConversationNodeDefinition` + einen schlüsselbasierten Renderer registrieren |
| Dauerhaften Session-Zustand hinzufügen | `SessionEventMap` erweitern; aus dem Log rendern und abspielen |
| Session-Titel generieren | den einzigen `ctx.sessionTitle`-Anbieter registrieren |
| Ziel innerhalb derselben Session verwalten | `ctx.goals` verwenden; über `agent/*` fortsetzen |
| Session an einer Runden-Grenze forken | `ctx.agents.create({ sessionId, seed, meta: { parentSession, seedLength } })` — nur vom agent-loop veröffentlichte Sessions werden persistiert |
| Sessions in einem neuen Backend speichern | `SessionPersistence` (`create`/`open`/`stat`/`list`/`export`) über dem gemeinsamen Handle-Gerüst implementieren |
| Registrierung auf einen Agenten begrenzen | den `agent.ctx` dieses Agenten verwenden |

Das [Erweiterungs-Kochbuch](cookbook/extension-cookbook.de.md) ordnet Funktionen Fähigkeiten zu und führt die schrittweisen Anleitungen für [Pakete](cookbook/adding-a-package.de.md), [Tools](cookbook/adding-a-tool.de.md), [LLM-Adapter](cookbook/adding-an-llm-adapter.de.md) und [Einstellungs-Karten](cookbook/adding-a-settings-card.de.md). Das [Conversation-Subsystem](subsystems/conversation.de.md) besitzt die Chat-Knoten-Zusammenstellung.
