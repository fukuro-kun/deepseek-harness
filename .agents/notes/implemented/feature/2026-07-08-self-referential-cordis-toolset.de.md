# Agent Note: Das selbstreferenzielle cordis-Toolset
[English](2026-07-08-self-referential-cordis-toolset.md) | [中文](2026-07-08-self-referential-cordis-toolset.zh.md) | Deutsch

Status: implemented


## Problem

Alles in diesem Harness ist ein cordis-Plugin, doch der agent, der innerhalb dieser Plugin-Laufzeit läuft, kann sie weder sehen noch anfassen: Er kann die Services und Events um sich herum nicht aufzählen, sich nicht mitten in der Session mit einem neuen Tool erweitern und keine Fähigkeiten komponieren, die er erfindet. Dem Modell diese Macht zu geben, ist es wert, erkundet zu werden — ein selbstreferenzieller agent, der seine eigene Laufzeit inspiziert und modifiziert — doch es wirft sofort drei Korrektheitsprobleme auf, und das Design dreht sich darum, sie zu beantworten, statt um die rohe "lass das Modell Code laufen"-Mechanik.

Erstens muss modellgeschriebene Registrierung dort validiert werden, wo sie geschieht: Ein fehlerhaftes Tool-Schema muss bei der Registrierung scheitern, nicht wenn ein späterer Request es in einen prompt zu assemblieren versucht. Zweitens muss modellgeschriebener Code Service-APIs aufrufen, deren Quelle er nie gesehen hat — geratene Methodensignaturen und, schlimmer, geratene Rückgabewert-Formen kosten viele Schritte blinden Austastens. Drittens muss alles, was das Modell mountet, vollständig entsorgbar sein — vom Modell auf Abruf und vom gewöhnlichen Plugin-Lebenszyklus, wenn das Host-Plugin neu lädt — sonst sammelt eine lange Session verwaiste Listener und Tools an.

## Decision

Das Toolset wird als [`@deepseek-ai/dsh-tool-cordis`](../../../../packages/extensions/tool-cordis/README.de.md) ausgeliefert, mit seinem lauffähigen Overlay und seiner Nutzung im [Runtime-Cordis-Guide](../../../../docs/user/develop/practice/dynamic-cordis.de.md). Es gibt dem Modell drei Tools über die lebende Cordis-Laufzeit im aktuellen DSH-Prozess: sie inspizieren, ein In-Memory-Temporary-Plugin mounten und dieses Plugin bis zur quiescence unmounten.

Die vm isoliert versehentliche globale Verschmutzung, und die Kontext-Fassade verbirgt Framework-Interna. Keines der beiden schränkt die Autorität exponierter Services ein: Ein Temporary-Plugin kann `ctx.shell` mit den Privilegien des Host-Executors aufrufen und das echte Dateisystem sowie Web-Services erreichen. Es läuft in der geteilten DSH-Laufzeit und kann andere Sessions in diesem Prozess betreffen. Dies ist ein opt-in-Entwicklungswerkzeug mit bash-äquivalentem Vertrauen, keine Sicherheitsgrenze und kein Produkt-Default.

### Die drei Tools

| Tool | Contract |
|---|---|
| `cordis_inspect` | Schreibgeschützter Bericht über die lebende aktuellprozessige Laufzeit, ein Markdown-Abschnitt pro `what`-Wert (`what` weglassen für alle Abschnitte). `plugins` listet jeden lebenden fiber; `temporary` listet nur die von `cordis_mount` erzeugten Temporary-Plugins. Ein exakter `name` mit `what: "api"` oder `what: "events"` engt auf ein quellendokumentiertes Ziel ein. |
| `cordis_mount` | Wertet `code` jetzt als async-JavaScript-Funktionsrumpf in einer `node:vm`-Sandbox aus und speichert ihn nirgendwo. Das zurückgegebene Plugin wird unter der internen `cordis-dynamic`-Gruppe gemountet und unter einer frischen prozesslokalen id (`dyn-1`, `dyn-2`, …) verfolgt. |
| `cordis_unmount` | Unmountet ein `cordis_mount`-Temporary-Plugin nach id und kehrt erst zurück, nachdem jedes eigene Tool, jeder Listener, Service, Timer und Effekt quiescence erreicht. Es kann keine Loader-, konfigurierten oder installierten Plugins entfernen. |

`cordis_inspect`-Abschnitte sind `services` (jeder bereitgestellte ctx-Service und besitzender fiber), `plugins` (jeder lebende Plugin-fiber), `tools` (was das Modell aufrufen kann), `temporary` (die `cordis_mount`-Teilmenge mit id, running/pending-Zustand, bereitgestellten und erwarteten Services und Lebenszeit), `api` (lebende Service-Signaturen und referenzierte Typen) und `events` (Harness-Events mit Dispatch-Modus und Signatur). Temporary-Plugins bleiben über spätere turns aktiv und verschwinden nach `cordis_unmount`, Toolset-Unload oder DSH-Neustart; sie werden nie automatisch wiederhergestellt. Breite `api`- und `events`-Berichte lassen volles JSDoc weg, um kompakt zu bleiben; ein exakter `name` gibt einen Service oder ein Event mit seinem originalen Methoden-/Deklarations-JSDoc zurück. Ein name ist mit anderen Abschnitten ungültig, unbekannte Ziele scheitern, und ein API-Ziel muss leben. Die modellseitigen Tool-Beschreibungen tragen die zur Aufrufzeit nötigen Betriebsregeln; [der generierte Tool-Katalog](../../../../docs/tool-catalog.de.md) ist ihr erschöpfendes Rendering.

### Sandbox semantics

Mount-Code läuft als async-Funktionsrumpf in einer frischen vm-Realm. Seine dokumentierte API lenkt Datei-, Netz-, Prozess- und Timer-Zugriff über Cordis-Services, sodass Mounts inspizierbar und entsorgbar bleiben. Host-Realm-Helfer machen Node-Ausbruch weiterhin möglich, konsistent mit der vertrauenswürdigen Haltung. `vmTimeoutMs` begrenzt nur die synchrone Auswertung.

Sandbox-Globale sind bewusst klein: ein getaggter Write-through-`console` (`[cordis:<id>] …` auf dem Host-stdout/stderr, sodass ein Listener, der lange nach dem Mount-Aufruf feuert, trotzdem irgendwo landet, das der Nutzer sieht), das `harness.defineTool`-/`harness.registerTool`-Registrierungspaar, die Kodierungsprimitive, die frischen vm-Kontexten fehlen (`btoa`/`atob` als Host-Closures über `Buffer` — eine sanktionierte Ausnahme, `Buffer` selbst wird nie exponiert — plus `TextEncoder`/`TextDecoder`), und aufrufbare Fallen über den vorenthaltenen Node-APIs (`require`, `setTimeout`/`setInterval`/`setImmediate`/`clearTimeout`/`clearInterval`, `fetch`), die eine Umleitung werfen, die die cordis-Alternative benennt. Nur funktionsförmige Globale werden gefallen; `process` und `Buffer` bleiben `undefined`, sodass ein `typeof`-Feature-Probe träge bleibt statt eine werfende Zugriffsfunktion zu zünden.

Mount-Code überquert die vm-Grenze durch drei Kontrollen. Dual-Realm-`instanceof` erkennt sowohl Host- als auch vm-Objekte. `harness.defineTool` baut das Ausgabe-Schema/die Projektoren im Host-Realm neu auf, snapshotet den Body-Wert als Host-eigenes JSON und lässt die Registry den [kanonischen Tool-Ausgabevertrag](../architecture/2026-07-20-canonical-tool-output-contract.de.md) vor der Beobachtung durchsetzen. Das gemountete Plugin erhält eine Whitelist-Kontext-Fassade, kein rohes oder durchgereichtes `Context`; Framework-Plumbing und kontextwertige Rückgaben werden zurückgewiesen. Service-Lesungen erfordern ein deklariertes `inject` und bewahren Cordis-Aktivierungs- und Unload-Semantik. `ctx.tools.get` legt nur die Schema-Sicht offen, sodass gemounteter Code `ToolRuntime.execute` nicht durch direkten Aufruf einer Definition umgehen kann.

Die Grenze normalisiert eindeutige JSON-Schema-Formen in `ParameterSchemaSpec` und bewahrt `integer`, rohe Objekt-Offenheit und required-Arrays. Direkte DSL-Objektknoten müssen `additionalProperties` deklarieren; ungültiges Vokabular scheitert mit den akzeptierten Alternativen. Parse-, TypeScript-, fehlende-return-, Node-API- und Doppel-Tool-Fehler enthalten die betreffende Quellzeile oder den korrigierenden Vertrag, ohne Implementierungsinterna zu erzählen.

### Die interne Gruppe und der Temporary-Plugin-Lebenszyklus

Jedes Temporary-Plugin ist ein Kind einer internen `cordis-dynamic`-Gruppe unter dem Tool-Plugin, sodass gewöhnliche fiber-Disposal Toolset-Reload und -Unload abhandelt. `cordis_mount` wartet Abrechnung ab; ein Startfehlschlag disposed den fiber, bevor ein Fehler zurückgegeben wird. Ein abgerechnetes ausstehendes Plugin bleibt mit seinen fehlenden Injections sichtbar. `cordis_unmount` wartet die Disposal des Plugin-fibers ab.

Temporary-Plugins existieren nur im Prozessspeicher. Sie erzeugen keine Plugin-Datei, installieren kein Paket, ändern kein `cordis.yml` oder persönliche/Projekt-Konfiguration, überleben keinen Neustart und haben keinen automatischen Speicher-, Hochstufungs- oder Installationspfad. Ein Experiment zu behalten heißt, den Agent zu bitten, ein normales Projekt-Plugin oder installierbares Profil-Bundle über den regulären Entwicklungsworkflow zu implementieren.

### Mount-übergreifende Komposition via provide/inject

Mounts beziehen sich durch gewöhnliche cordis-Service-Semantik aufeinander, mit ihren ids als Lebenszyklus-Handles: Mount A ruft `ctx.provide('foo', value)` auf, Mount B deklariert `inject: ['foo']` und aktiviert in dem Moment, in dem `foo` existiert; zuerst gemountet, bleibt B ausstehend und benennt den fehlenden Service; das Unmounten von A schickt B zurück in ausstehend (seine Registrierungen abgewickelt), und ein späteres erneutes Provide lässt Bs `apply` über eine frische Sandbox-Fassade erneut laufen; ein doppeltes Provide schlägt laut fehl mit dem besitzenden fiber benannt. Ein Realm-Vorbehalt: Ein von einem Mount bereitgestellter Service-Wert ist ein vm-Realm-Objekt — Methodenaufrufe darauf funktionieren von überall, doch Consumer dürfen keine Host-Prototypen darauf annehmen.

### Der generierte API-Katalog

`cordis_inspect` serviert API- und Event-Daten aus einem generierten Katalog statt einer duplizierten Tabelle. Der Generator nutzt den Cordis-Katalog-AST-Scan wieder und emittiert Service-Summaries, Signaturen, originales Service-Methoden- und Event-JSDoc, Event-Modi, referenzierte Typdeklarationen und die geerbte Kontext-API. Mehrdeutige Typnamen werden weggelassen und übergroße Deklarationen als gekürzt markiert.

Freshness ist wie bei jedem generierten Artefakt gegatet: `pnpm run verify-cordis-api` (in `doc-sync`) regeneriert im Speicher und scheitert bei jedem Diff, sodass ein JSDoc- oder Öffentliche-Signatur-Edit nicht ausgeliefert werden kann, ohne den Katalog zu regenerieren, den das Modell liest. Zur Laufzeit schneidet das Inspect-Tool den Katalog mit der lebenden Laufzeit statt ihn zu kippen: Breite Berichte rendern lebende katalogisierte Services als Summary + Signaturen, lebende Services ohne Katalogeintrag (Mount-bereitgestellte) als Name + besitzender fiber, katalogisierte Services ohne lebenden Provider knapp und dann die referenzierten Typformen. Exakt-Name-Berichte rendern einen lebenden Service oder ein Event mit dem originalen JSDoc unmittelbar vor jeder Signatur; dieses Detail opt-in zu halten vermeidet, seinen token-Preis auf explorative Auflistungen zu verrechnen.

### Configuration, rendering, and observability

Das Plugin legt ein Config-Feld offen, von schemastery validiert und im [Konfigurationskatalog](../../../../docs/config-catalog.de.md) dokumentiert: `vmTimeoutMs` (Default 5000), die Millisekunden-Grenze des synchronen Teils der Code-Auswertung. Die aktuellen modellseitigen Namen sind `cordis_inspect`, `cordis_mount` und `cordis_unmount`; der interne `cordis-dynamic`-Gruppenname und das `dyn-`-id-Präfix bleiben strukturelles Vokabular. Alle drei Tools rendern als `generic`-Karten gemäß [dem Tool-Cookbook](../../../../docs/cookbook/adding-a-tool.de.md): inspect ist `read`, mount ist `execute` mit Code als `rawInput`, und unmount ist `delete`. Web-Konversationszeilen bewahren diese generische Mechanik, geben den Tools aber die Aktionstitel `Inspect`, `Mount temporary Plugin` und `Unmount temporary Plugin` plus einen geteilten Cordis-Akzent; die mount-Zeile behält die geteilte JavaScript-Expansion und Syntaxhervorhebung.

Modellsichtbar ⟺ geloggt gilt ohne neuen Session-Event-Typ: Mount und Unmount sind über ihre geloggten `tool/call`-/`tool/result`-Paare sichtbar, und jede geänderte Tool-Menge wird vom vollen geänderten Request-Header geloggt, der bei Schema-Änderungen zwischen Schritten emittiert wird. Temporary-Plugins sind Prozessspeicher, kein Session-Zustand: Session-Resume rehydriert Konversations-history, erzeugt sie aber nie neu.

## Alternatives considered

**Ein strukturiertes pro-Fähigkeit-Registrierungs-Tool statt `cordis_mount`.** Die verlockendste Alternative ist ein `cordis_register_tool` mit expliziten `name`-/`description`-/`parameters`-/`code`-Feldern (und Geschwistern `cordis_register_listener`, `cordis_register_service`, …) statt eines einzigen "mounte ein Plugin"-Primitivs. Es wurde abgelehnt, weil sein einziger echter Gewinn — kein Plugin-Boilerplate für den häufigsten Einzelfall — seine Kosten nicht bezahlt, während ein einziges Mount-Primitiv jede Fähigkeit auf einmal beantwortet.

| Dimension | Structured per-capability tools | Single `cordis_mount` |
|---|---|---|
| Schema correctness | `parameters` bleibt modellgeschriebenes JSON, das Unified-Schema-Validierung braucht, nur einen Schritt früher | Dieselbe Validierung läuft an der Sandbox-Grenze, mit denselben lehrreichen Fehlern |
| The code field | Ein `execute`-Body bleibt modellgeschriebenes JS in einer vm; die Realm- und Service-Aufruf-Korrektheitsprobleme bleiben unverändert | Eine Sandbox, ein Normalisierungspfad, eine bewachte Registrierung |
| Capability coverage | Nur Tools; Listener, Services, `inject`-Beziehungen brauchen je ein weiteres strukturiertes Tool — eine API, die grenzenlos wächst | Ein Vokabular (ein cordis-Plugin) deckt jeden Effekt ab, gegenwärtig und künftig |
| Cross-mount composition | In einem Tool-Registrierungs-Payload nicht ausdrückbar | Natives `provide`/`inject`, gewöhnliche cordis-Semantik |
| Inspectability | Registriert etwas, das die Plugin-Liste nicht als Plugin zeigen kann | Was das Modell mountet, ist exakt das, was `cordis_inspect` rendert |
| Model ergonomics | Gewinnt für den einzelnen häufigsten Fall (kein Plugin-Boilerplate) | Gemildert durch das kanonische Rezept in der Mount-Beschreibung plus Grenzfehler, die den Fix lehren |

Die Korrektheitsinvestition geht daher dorthin, wo sie für jede Fähigkeit auf einmal zahlt: den über `cordis_inspect` sichtbaren generierten API-Katalog und die Sandbox-Grenzen-Validierung, deren Fehlermeldungen den korrekten Aufruf lehren. Ein strukturiertes Registrierungs-Tool bleibt später als Sugar hinzufügbar, das Mount-Code synthetisiert; nichts hier schließt es aus.

**Eine handgepflegte Service-/Event-Referenz im Tool.** Der erste Schnitt des Inspect-Tools trug eine handgeschriebene Tabelle von Service-Methoden-Signaturen. Sie wurde durch das generierte `api-catalog.ts` ersetzt, weil eine Handtabelle in dem Moment vom JSDoc abdriftet, in dem sich eine Signatur ändert, und nichts die Drift gatet, während das generierte Artefakt freshness-geprüft gegen denselben AST ist, den die Docs nutzen.

**Ein neues `cordis/mount`-Session-Event.** Ein dauerhaftes Event, das Quelle und Name jedes Mounts aufzeichnet, hat klaren Präzedenzfall (`hook/invoked`, `compaction/start`). Abgelehnt: Mount und Unmount sind bereits als `tool/call`-/`tool/result`-Paare sichtbar und die Tool-Mengen-Änderung ist bereits als voller geänderter Request-Header geloggt, sodass ein dediziertes Event den Datensatz nur duplizieren würde. Es bleibt hinzufügbar, falls ein Audit-Anwendungsfall Mount-Quelle und -Name außerhalb des Tool-Aufrufs braucht.

**Eine gehärtete / fähigkeitsbeschränkte Sandbox.** Node-Builtins zu fallen und Mount-Code eine Whitelist-Fassade statt des rohen Kontexts zu geben, könnte eine Sicherheits-Sandbox-Absicht suggerieren. Es ist ausdrücklich nicht das: Die Fallen und die Fassade verengen die *API*, die Mount-Code sieht — lenken ihn auf cordis-Services und weg von leckanfälligen Node-Builtins und Framework-Interna — aus Korrektheit und um den unbewachten Kontext-Ausbruch zu schließen, doch die Fähigkeiten, die die Fassade exponiert (`ctx.shell`, `ctx.fs`, `ctx.web`), erreichen die echte Laufzeit, sodass sie keine Sicherheitsgrenze ist. Eine echte (separater Prozess, Berechtigungsabfragen) lag außerhalb des Scopes eines Dev-/opt-in-Toolsets und würde dem ganzen Sinn — dem Modell die lebende Laufzeit zu geben — entgegenarbeiten.

## Consequences

Das Toolset ist ein bewusstes opt-in mit einem voll privilegierten `ctx`, sodass ein Deployment es so bewusst übernimmt wie ein bash-Tool. Mehrere Tatsachen folgen, vor denen die Tool-Beschreibungen das Modell direkt warnen: Ein waterfall-Listener (z. B. `tools/pre-execute`), der ohne `next()`-Aufruf zurückkehrt, kurzschließt die Kette, sodass ein gemounteter Listener den eigenen Tool-Dispatch des agent stoppen kann ([waterfall-Semantik](../../../../docs/cordis-primer.de.md#cordis-waterfall-semantics)); Mount-Code läuft innerhalb eines Tool-Aufrufs des aktuellen turn, sodass das Abwarten von etwas, das erst nach dem turn auflöst, deadlocked; `vmTimeoutMs` begrenzt nur synchrone Auswertung; und Mounts überleben kein Session-Resume.
