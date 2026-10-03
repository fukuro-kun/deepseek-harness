# Agent Note: Cordis Host/Client Dynamic Plugin Runtime

Status: rejected — closed as a proposal: the shipped packages/extensions runtime and its READMEs own the design

[English](2026-08-08-cordis-web-dynamic-packages.md) | [中文](2026-08-08-cordis-web-dynamic-packages.zh.md) | Deutsch

## Problem

Das Modell muss den aktuellen DSH-Prozess temporär erweitern können, ohne Repository-Quellcode zu ändern, die Anwendung neu zu bauen oder den Browser zu aktualisieren. Eine Erweiterung kann im Host-Node.js-Prozess laufen, in einer Client-Browser-Seite, oder als ein Plugin, dessen Host-Hälfte Daten beschafft und dessen Client-Hälfte sie darstellt.

Diese Fähigkeit darf nicht auf „irgendwelchen Code ausführen" beschränkt sein. Vor dem Schreiben von Code muss das Modell die auf beiden Plattformen verfügbaren Services, Events, Builtins, Slots und Theme-Tokens ermitteln können. Der Benutzer muss den Code in der Vorschau sehen, bevor er entscheidet, ob Client-Code in die Seite gelangen darf. Ein einzelnes Plugin braucht unveränderliche Versionen, Wiederholversuche nach Fehlern und Rollback. Asynchrone Laufzeitfehler müssen zum Modell zurückgelangen, statt nur in Server-Logs oder der Browser-Konsole zu verbleiben.

Werden Definition, Genehmigung, Ausführung, Versionswechsel, Capability-Ermittlung und UI-Zustand in einer einzigen Aktion kombiniert, entstehen Zustände, die sich nicht konsistent erklären lassen: ob eine erfolgreiche Definition auch einen erfolgreichen Lauf bedeutet; welche Version nach einem fehlgeschlagenen Update die erfolgreiche bleibt; wie lange ein Tool warten soll, wenn keine Seite antwortet; welche historische Karte die Business-UI besitzt, nachdem dasselbe Package mehrfach gelaufen ist; und ob ein seitenlokaler Client-Ladezustand einen prozessweiten Host-Zustand repräsentieren kann.

## Proposal

### Kernprinzipien

- Der Host ist die alleinige prozessweite Autorität für Plugins, Packages, Runs, Genehmigungen und Versionszeiger.
- Der Client speichert nur die Genehmigungsinteraktion der aktuellen Seite, Ladeergebnisse, Slot-Beiträge, Business-Views und seitenlokale Fehler.
- Define erzeugt nur unveränderliche Code-Versionen; Run aktiviert nur eine definierte Version.
- Ein Versionswechsel committet `currentPackageId` erst, nachdem das Ziel-Package seine erforderliche Host/Client-Aktivierung abgeschlossen hat.
- Vor dem Schreiben von Code fragt das Modell Capabilities über Inspect Providers ab. Inspect-Ergebnisse unterstützen das Coding und sind keine Plugin-Laufzeit-Business-Daten.
- Dynamischer Host- und Client-Code verwenden beide eingeschränkte Plain-JavaScript-Kontexte und hängen reversible Seiteneffekte an den Cordis-Lebenszyklus.
- Client-Code benötigt eine Benutzerautorisierung, bevor er eine Seite betritt. Die Autorisierung kann ein einzelnes Package oder zukünftige Versionen desselben Plugins abdecken.
- Tool-Aufrufe warten nicht auf Genehmigungen oder Browser-Operationen, die möglicherweise erst nach Ende des aktuellen Turns eintreten. Zustandsspeicher und Model-Steering melden asynchrone Ergebnisse.

### Package-Verantwortlichkeiten und Abhängigkeitsrichtung

Vier Packages unter `packages/self-modification/` implementieren die dynamische Runtime:

| Package | npm-Package | Verantwortlichkeit |
| --- | --- | --- |
| `tool-cordis` | `@deepseek-ai/dsh-tool-cordis` | Registriert den System Prompt, sieben modellseitige Tools, Host Inspect Providers, `@pluginId`-Kontextinjektion und Tool-Präsentationsmetadaten |
| `cordis-host-runner` | `@deepseek-ai/dsh-cordis-host-runner` | Speichert die autoritative Registry, vergibt IDs, führt Host-Code aus und verwaltet Versionen, Genehmigungen, Runs, private Handler, Inspect-Routing und Modell-Feedback |
| `cordis-client-runner` | `@deepseek-ai/dsh-cordis-client-runner` | Synchronisiert Inspect-Manifeste im Browser, orchestriert genehmigte Host→Client-Aktivierung, evaluiert Client-Code und verwaltet Guard, Loader/Fiber, Timer, Styles und Teardown |
| `ui-cordis` | `@deepseek-ai/dsh-client-ui-cordis` | Rendert Define/Run-Tool-Karten, das globale Cordis-Panel, Genehmigungs-Controls, Versionsauswahl, Laufzeitstatus und Package-spezifische Business-Views |

`tool-cordis` hängt nur vom In-Process-Service des Host Runners ab und importiert nicht die Client-Implementierung. `ui-cordis` konsumiert nur das Client-Runner-Face und Client-sichere Wire-Typen und importiert nicht die Host-Implementierung. Bestehende generierte Remote-APIs und weitergeleitete Events verbinden die Laufzeitsteuerung von Host und Client; das Gateway besitzt keine dynamische Plugin-Domänenlogik.

### Domänenobjekte

#### Plugin

Ein Plugin ist eine dynamische Plugin-Instanz, die im Laufe der Zeit verändert werden kann. Es wird durch den Branded Type `CordisDynamicPluginId` identifiziert, zum Beispiel `clock-1`. Beim Anlegen eines Plugins reicht das Modell nur ein semantisches Präfix aus 3 bis 6 kleingeschriebenen englischen Buchstaben ein; der Host hängt ein prozessweit eindeutiges numerisches Suffix an. Das Modell kann die vollständige `pluginId` nicht vorgeben.

Ein Plugin gehört der Session, die es definiert hat. Modellseitige Tools können nur Plugins der aktuellen Session lesen und bearbeiten. Das globale Client-Panel kann Plugins aus allen Sessions auflisten, jede Aktion wird jedoch weiterhin unter der Owner-Session ausgeführt, die die jeweilige Zeile mitführt.

#### Package

Ein Package ist eine unveränderliche Code-Version unter einem Plugin. Es wird durch `CordisDynamicPackageId` identifiziert, zum Beispiel `pkg-2`. Es enthält einen Namen, einen Zweck, optionalen Host-Code und optionalen Client-Code, wobei mindestens eine Code-Hälfte vorhanden sein muss. Jedes `cordis_define` erzeugt ein neues Package; ein bestehendes Package kann nicht in-place verändert werden.

Ein Plugin kann mehrere Packages besitzen, aber es existiert höchstens ein physischer Run gleichzeitig. Ob ein Package eine Host- oder Client-Hälfte enthält, beeinflusst nur seine Aktivierungsschritte, nicht seine Versionsidentität.

#### Plugin Run

Ein Plugin Run ist ein konkreter Aktivierungsversuch. Er wird durch `CordisDynamicPluginRunId` identifiziert, zum Beispiel `run-3`. Jeder neue Aktivierungsversuch erhält eine neue ID, einschließlich eines Versuchs, der nach Genehmigung fehlschlägt, eines Wiederholversuchs desselben Packages und eines Versionsupdates. `pluginRunId` assoziiert Genehmigung, Host-Aktivierung, Client-Laden, privates RPC, Tool-Karten und Fehler mit demselben Versuch.

Der Host speichert den aktuellen physischen Run getrennt von `latestRun`. Der physische Run ist die Aktivierung, die derzeit Aufrufe empfangen und abgebaut werden kann. `latestRun` zeichnet Genehmigung, Phase, Status beider Hälften und Diagnosen des jüngsten Versuchs auf. Ein fehlgeschlagener Versuch kann keinen lebenden physischen Run hinterlassen, bleibt aber für Inspektion verfügbar.

#### Versionszeiger

- `currentPackageId` ist das jüngste Package, das seinen erforderlichen Aktivierungsfluss abgeschlossen hat. Stoppen des Plugins, Beginn eines Updates oder ein fehlgeschlagenes Update löschen es nicht.
- `nextPackageId` ist das Ziel-Package, das auf Genehmigung wartet, aktiviert wird, auf einen Client wartet oder zuletzt fehlgeschlagen ist. Es wird gelöscht, nachdem das Ziel erfolgreich ist und als current committet wurde.

Ein Host-only-Package committet current, nachdem der Host seine Fiber erfolgreich etabliert hat. Ein Package mit Client-Hälfte committet current, nachdem die Host-Aktivierung erfolgreich war und mindestens ein Client das entsprechende Laden erfolgreich etabliert hat. Eine Fiber, die Cordis wegen einer fehlenden harten Abhängigkeit als waiting parkt, ist dennoch ein erfolgreich etabliertes Lebenszyklusobjekt; sie ist nicht gleichbedeutend mit einem Parse- oder `apply`-Fehler.

Schlägt ein Update-Ziel fehl, wird der alte physische Run nicht automatisch neu gestartet. Die bisherige `currentPackageId` identifiziert weiterhin die letzte erfolgreiche Version, und das fehlgeschlagene Ziel bleibt `nextPackageId`. Benutzer oder Modell können next erneut versuchen oder mit `mode: "run"` current reaktivieren, um ein Rollback durchzuführen.

### Host-Autorität und Persistenz

`DynamicCordisRunnerService` und seine interne Registry sind die alleinige Autorität im aktuellen DSH-Prozess. Sie speichern:

- die Session-Zugehörigkeit jedes Plugins und seinen unveränderlichen Package-Satz;
- `currentPackageId`, `nextPackageId`, den physischen Run und `latestRun`;
- Autorisierung pro Package und versionsübergreifende Plugin-Autorisierung;
- ausstehende Client-Aktivierungsanfragen;
- Host-Fibers, Package-private Handler, wartende Services und jüngste Diagnosen;
- Host- und Client-Inspect-Registry-Verzeichnisse und Query-Routing.

Diese Objekte werden nicht in Konfiguration oder auf Platte geschrieben und nach einem Prozessneustart nicht wiederhergestellt. Das Session Log kann Tool-Aufrufe, Ergebnisse und von Karten benötigte Metadaten aufbewahren, spielt aber keinen dynamischen Code ab, um die Registry wiederherzustellen. Historische Karten bleiben nach einem Neustart in der Konversation, aber ihre ursprüngliche `pluginId` und `packageId` sind nicht mehr lauffähig.

Laufzeitzustand wird nicht als wiederherstellbarer Zustand in die Session-Projection geschrieben. Das Aktualisieren einer Seite oder das Öffnen einer neuen Seite stellt Client-Hälften nicht automatisch wieder her; automatische Wiederherstellung würde Verbindungsidentität, Start-Baselines und seitenübergreifende Konsistenzprotokolle wieder einführen, die außerhalb dieses Designs liegen.

### Define, Run und Versionswechsel

`cordis_define` hat zwei Modi: Das Anlegen eines Plugins reicht `idPrefix` ein, während die Änderung eines bestehenden Plugins dessen exakte `pluginId` einreicht. Code verwendet stets `code: { host?, client? }`. Define validiert Argumente und Plain-JavaScript-Syntax, zeichnet unveränderlichen Source auf und gibt die finalen IDs zurück. Es führt kein `apply` aus, erzeugt keine Genehmigung, ändert keine Versionszeiger und läuft nicht implizit.

Es gibt kein separates `cordis_update`. `cordis_run` drückt die Aktivierungsabsicht über `mode` aus:

| Versionsbeziehung | `mode` |
| --- | --- |
| Kein `currentPackageId` vorhanden | `run` |
| Ziel gleich current, einschließlich Neustart, Wiederholung oder Rollback | `run` |
| Ziel weicht von einem bestehenden current ab | `update` |
| `nextPackageId` nach einem fehlgeschlagenen Update erneut versuchen | `update` |

Run validiert zuerst Plugin/Package-Zugehörigkeit, die Versionsbeziehung und ob ein anderer Übergang im Gange ist. Danach erzeugt es `pluginRunId` und schreibt `latestRun` und `nextPackageId`.

Ein Host-only-Package schließt die Host-Aktivierung innerhalb des Tool-Aufrufs ab und gibt synchron `running` oder einen Fehler zurück. Ein Package mit Client-Hälfte wartet innerhalb des Tool-Aufrufs nicht auf ein Browser-Ergebnis: ohne Autorisierung registriert es eine Genehmigung und gibt `awaiting-approval` zurück; mit Autorisierung registriert es automatische Client-Aktivierung und gibt `starting` zurück. Beide Ergebnisse bedeuten, dass die Anfrage existiert, nicht dass die vollständige Aktivierung erfolgreich war.

Wenn die Zielaktivierung tatsächlich startet, stoppt der Host den alten physischen Run, bevor die Ziel-Host-Hälfte ausgeführt wird. Erst nach Host-Erfolg darf der Client Source für die exakte `pluginRunId` abrufen und laden. Client-Erfolg committet die Versionszeiger. Jeder Fehler wird diesem Versuch zugeordnet, ohne den alten Versionslauf neu zu starten und als Zielerfolg darzustellen.

`cordis_stop` baut den aktuellen Host/Client-Run und die ausstehende Genehmigungsanfrage ab, behält aber Plugin, Packages, Autorisierung und Versionszeiger. `cordis_undefine` stoppt zuerst und löscht dann Plugin, Packages, Autorisierung und Versionszeiger; historische Karten zeigen dann nur noch, dass das Plugin entfernt wurde.

### Client-Genehmigung und Autorisierung

Ein Package, das Client-Code enthält, benötigt vor seiner ersten Aktivierung eine Benutzerautorisierung, weil modellgenerierter Code in der Seite des Benutzers laufen wird. Das Genehmigungspanel bietet drei Aktionen:

- Ein einzelner Haken autorisiert das aktuelle Package. Spätere Läufe desselben Packages benötigen keine Genehmigung, ein neues Package jedoch schon.
- Ein doppelter Haken autorisiert zukünftige Versionen des aktuellen Plugins. Neue Packages, Updates, Wiederholungen und Rollbacks benötigen dann keine Genehmigung pro Version mehr.
- Ablehnen beendet die aktuelle Anfrage, ohne Host- oder Client-Code auszuführen. Das Modell darf nicht sofort erneut eine Genehmigung anfordern, es sei denn, der Benutzer verlangt es.

Die Autorisierung wird in die Host-Registry geschrieben, sobald der Benutzer sie erlaubt, und bleibt auch dann bestehen, wenn ein späterer technischer Schritt fehlschlägt. Wenn das Panel ein Package direkt laufen lässt, autorisiert der Klick des Benutzers selbst dieses Package.

Eine auf Genehmigung wartende Zeile zeigt nur Package-weites Erlauben, versionsübergreifendes Erlauben und Ablehnen; sie bietet nicht gleichzeitig Run, Stop oder Delete an. Das Panel öffnet sich automatisch, wenn eine neue Genehmigung erscheint. Falls das automatische Öffnen fehlschlägt oder das Panel eingeklappt ist, zeigen der fixierte Einstieg und der Zeilenstatus weiterhin die Anzahl ausstehender Genehmigungen und den Zustand.

### Orchestrierung der Client-Aktivierung

Der Host sendet Client-Aktivierungsanfragen über `cordis/request-run`. Eine Anfrage enthält nur Anfrage-Identität, Session, Plugin, Package, Mode, Name, Zweck und ob eine Genehmigung erforderlich ist; sie broadcastet keinen Source-Code.

Eine autorisierte Seite führt die folgende feste Sequenz aus:

1. `runHostHalf` aufrufen, um die Ziel-Host-Hälfte zu starten oder an den bereits gestarteten Host-Run desselben Versuchs zu binden.
2. Nach Host-Erfolg `getClientCode` mit `pluginId + pluginRunId` aufrufen, um nur den Client-Source des exakten aktuellen Runs zu erhalten.
3. Der Client Runner evaluiert das Plugin in der Seite, etabliert seinen Loader-Eintrag/Fiber und installiert Guard, Styles, Slots und seitenlokalen Zustand.
4. Die Seite meldet Erfolg, Waiting oder Fehlschlag über `resolveRequestRun` oder `settleUserRun`.
5. Der Host akzeptiert die Meldung nur für den noch aktuellen exakten Run, committet current oder speichert Diagnosen und broadcastet den Abschluss der Anfrage, sodass andere Seiten ihre Aktivitäten bereinigen.

Die Host-Aktivierung geht der Client-Aktivierung voraus, damit der Client nicht startet, bevor die erforderlichen Host-Handler existieren. Eine Seite darf den Host-Run nach einem Client-Fehler nur dann abbauen, wenn diese Anfrage den Host-Run erzeugt hat; eine Seite, die sich lediglich an einen bestehenden Run gebunden hat, besitzt ihn nicht.

Der Client Orchestrator speichert ausstehende Genehmigungen und aktive Orchestrierung nach `pluginId`, sodass ein Plugin nicht zwei Seitenaktivierungen gleichzeitig ausführen kann. Das Host-Inventory kann ausgelassene Pending-Approval-Einträge und genehmigungsfreie automatische Aktivierungsanfragen rekonstruieren.

Der Client-Ladezustand ist eine seitenlokale Tatsache. Ein aktiver Host bedeutet nicht, dass die aktuelle Seite die Client-Hälfte geladen hat. Die UI hat drei primäre Zustände: grau „Ready", wenn kein physischer Run existiert, gelb „Client ready to activate", wenn der Host läuft, aber die aktuelle Seite den Client noch nicht erfolgreich geladen hat, und grün „Running", wenn beide Hälften in der aktuellen Seite verfügbar sind. Genehmigung und Fehlschlag erscheinen als zusätzliche Zustände.

Diese Version etabliert keine Per-Connection-Identität und kein Mehrseiten-Quorum. Der erste noch gültige Client-Erfolg kann prozessweites current committen; der Store jeder Seite zeichnet unabhängig auf, ob diese Seite den Client geladen hat.

### Package-private Client→Host-Kommunikation

Ein dynamisches Package verwendet einen privaten JSON-Kanal für Client→Host-Aufrufe: Der Host registriert Methoden für den aktuellen Run mit `harness.handle(method, handler)`, und der Client ruft sie mit `host.call(method, args)` auf. Jeder Aufruf ist mit `pluginId + pluginRunId` assoziiert, und der Host lehnt gestoppte oder veraltete Runs ab. Argumente und Rückgabewerte müssen verlustfrei JSON sein; Funktionen, React-Elemente, Contexts, Service-Instanzen und Klassenobjekte sind verboten.

Dieser Kanal dient nur Client→Host-Aufrufen innerhalb desselben Packages. Er verwendet keine öffentlichen Remote Services oder `ctx.remote` in dynamischem Code. Das öffentliche Remote-Interface trägt nur das eigene Kontrollprotokoll des Runners und exponiert keine dynamischen Packages.

### Dynamischer Code, Guard und Lebenszyklus

Host und Client führen beide nur Plain-JavaScript-Funktionskörper aus, ohne TypeScript, JSX oder Bundler-Transformation. Der Host führt in `node:vm` aus; der Client evaluiert in einem eingeschränkten Closure. Diese Kontexte reduzieren Fehlanwendung und liefern lehrreiche Fehler, sind aber keine Sicherheitsgrenzen gegen bösartigen Code.

Standardmäßig liest das Modell einen optionalen Service über `ctx.get('serviceName')` und prüft auf `undefined`. Ein Plugin-Objekt deklariert `inject` nur dann, wenn der Service eine harte Abhängigkeit ist, deren Fehlen das Package parken muss und deren späteres Eintreffen es reaktivieren muss. Direkter `ctx.serviceName`-Zugriff ist nur erlaubt, wenn dasselbe Plugin das entsprechende inject deklariert.

Host- und Client-`timer` sind gleichnamige Cordis Services mit demselben Interface, keine globalen Builtins. Ein Plugin, das Timer benötigt, muss `inject: ['timer']` deklarieren; ein innerhalb eines React-Effekts erzeugter Timer gibt seinen Disposer als Cleanup zurück.

Die aktuelle Fiber besitzt jede Registrierung und jeden reversiblen Seiteneffekt. Event-Listener, Services, Tools, Handler, Timer, Slots, Styles und Theme-Overrides registrieren sich über `ctx.effect()`, `ctx.on()` oder offizielle APIs, die Disposer zurückgeben. Stoppen, Updaten, Fehler-Rollback oder Undefinieren baut die Beiträge beider Hälften ab. Theme-Overrides werden nach Quelle geschichtet und geben einen Disposer zurück, sodass das Entladen die vorherigen Theme-Werte wiederherstellt.

Host, DSH, Cordis sowie deren Service-Instanzen, Event-Payloads, Slot-Props, Session/Conversation-Snapshots, Tool-Zustand und andere Laufzeitobjekte sind interne Live-Daten. Dynamischer Code darf auf diesen Objekten oder deren Nachkommen kein `JSON.stringify`, `structuredClone`, keine rekursive Aufzählung, Vollkopie oder Ganzobjekt-Darstellung ausführen. Er liest nur die vom aktuellen Task benötigten Blattfelder und konstruiert minimale eigene Daten ohne Host-Referenzen.

### Inspect Providers und Catalogs

Die Capability-Ermittlung verwendet drei Tools: `cordis_inspect_list` listet Host/Client-Provider-Manifeste; `cordis_inspect_query` führt eine explizite Read-only-Query auf der gewählten Plattform aus; und `cordis_inspect_self` fragt Plugins, Packages, Source, Versionszeiger und Laufzeitdiagnosen der aktuellen Session ab.

Host und Client besitzen je eine `CordisInspectRegistry`. Ein Provider registriert eine plattformweit eindeutige ID, Beschreibung, Methoden, Input-Schemas und Output-Schemas. Provider-Methoden sind explizit allowlistete Queries, keine beliebige Weiterleitung von Service-Methoden; die Registry hat kein geschichtetes Ziel und macht Business-Service-Methoden nicht automatisch zu ausführbaren Inspect-Methoden.

Die anfänglichen Provider sind:

| Plattform | Provider.method | Datenquelle |
| --- | --- | --- |
| Host / Client | `Service.listService` | Statischer Service Catalog pro Plattform |
| Host / Client | `Event.listEvents` | Statischer Event Catalog pro Plattform |
| Host / Client | `Builtin.listBuiltins` | Handgepflegte Definitionen neben dem Evaluator/Guard |
| Host | `Tool.listTools` | Die dem aktuellen Agent tatsächlich sichtbare Tool Registry |
| Client | `Slots.listSubTree` | Statischer Slot Catalog plus der Live-Subtree/Occupants der Seite |
| Client | `Theme.listTokens` | Read-only-Inspect-Export aus ThemeService |

Wenn sich die Client-Registry ändert, synchronisiert sie das vollständige Manifest zum Host, ohne doppelte Verzeichnisse pro Session zu speichern. Host-Queries werden lokal ausgeführt. Für eine Client-Query broadcastet der Host eine Request-ID, und eine Seite führt den lokalen Provider aus und antwortet. Der Host akzeptiert nur das erste erfolgreiche Ergebnis, das die Output-Schema-Validierung besteht; eine fehlschlagende Seite settled die Anfrage nicht. Wenn keine Seite erfolgreich ist, bleibt das Tool pending, bis ein späterer Erfolg oder ein Tool-Call-Abbruch eintritt.

Inspect-Daten werden nur verwendet, bevor Code geschrieben wird, um Capabilities, Signaturen, Typen und Mounting-Protokolle zu bestätigen. Ein Plugin, das Laufzeit-Business-Daten benötigt, ruft den tatsächlichen Service auf oder lauscht auf das tatsächliche Event; es darf Inspect/Catalog-Ergebnisse nicht cachen, anzeigen oder sich auf sie verlassen.

`CordisCatalogProjector` generiert Host- und Client-Service- und Event-Catalogs separat über TypeRT. Der Slot-AST-Generator scannt `SlotMap`, Registrierungsoptionen, Standard-Props, Owner-Props und referenzierte Typen; der Slots Provider merged den statischen Catalog mit dem Live-Tree zur Query-Zeit. ThemeService exportiert Theme-Tokens, Builtins werden manuell neben dem Evaluator/Guard gepflegt, und Tool-Schemas kommen aus der Registry.

Die Catalog-Generierung scannt echte Source-Signaturen und wendet dann eine modellsichtbare Allowlist an. Die Allowlist darf Services, Member, `@deprecated`-APIs, Runner-eigene Services und `cordis/*`-Kontroll-Events verbergen, darf aber Methodennamen, Parameter oder Rückgabetypen der verbleibenden APIs nicht umschreiben. Guard darf Argumente ablehnen, Quellen festlegen oder Member verbergen, muss aber die Source-Signaturen respektieren.

Modellsichtbares Owner-JSDoc verlangt nur eine vollständige Beschreibung, `@param` für jeden Parameter, `@returns` für jede nicht-void-Rückgabe, `@mode` für Events und Beschreibungen für Slot/props-Felder. Nutzungsempfehlungen, Gegenbeispiele und capability-übergreifende Auswahl gehören in den Skill statt in duplizierte Catalog-Beispielfelder.

### Schichten der Modellführung

Die Modellführung hat vier Schichten:

- Der System Prompt trägt das stabile Laufzeitmodell, die Einschränkungen beider Plattformen, Lebenszyklus, Genehmigung, Versionszeiger, minimale Code-Regeln und eine Nutzungslandkarte für die sieben Tools. Er unterstützt weiterhin eine minimal korrekte Implementierung, wenn der Skill nicht verfügbar ist.
- Der `cordis-plugin-development`-Skill trägt Anforderungsnavigation, Capability-Komposition, Empfehlungen und Gegenbeispiele, ohne vollständige Schemas zu kopieren.
- Jede Tool-Beschreibung nennt nur die Voraussetzungen, Parametersemantik, das synchrone oder asynchrone Ergebnis und den nächsten Schritt dieser Aktion.
- Provider/Catalog-Ergebnisse liefern aktuelle exakte Namen, Signaturen, Parameter, Slot-Props, Tokens und Laufzeit-Query-Ergebnisse.

Der System Prompt verlangt, zuerst den Skill zu laden, dann Capabilities zu listen/abzufragen und erst danach Code zu definieren/auszuführen. React-Beispiele im Skill registrieren sich in einen Slot, statt ein React-Element direkt aus `apply()` zurückzugeben. Beispiele verwenden `React.createElement`, korrektes `ctx.get()`/`inject`, reversible Effekte und minimales JSON-RPC.

### `@pluginId` und Tool-UI

Das Eingabesystem registriert eine `@pluginId`-Mention für die aktuelle Session. Ihre Auswahl injiziert nur Plugin-Identität, das Standard-Baseline-Package, Versionszeiger, den aktiven Run und den jüngsten Status, nicht den Source-Code. Die Standard-Baseline wird in der Reihenfolge next, current und zuletzt definiertem Package gewählt. Das Modell muss Source über `cordis_inspect_self` lesen, bevor es im Existing-Modus ein Package anhängt; eine ungültige Mention darf nicht stillschweigend ein Ersatz-Plugin erzeugen.

Die `cordis_define`-Karte zeigt Host- und Client-Code in zwei Tabs. Eine `cordis_run`-Karte assoziiert sich über `pluginRunId` mit einem exakten Versuch und liest den Client-Store, um ausstehende Genehmigung, Client ready to activate, Running, Fehlschlag, Ersetzung durch einen späteren Run oder entferntes Plugin anzuzeigen.

Ein Package kann `key: "self"` in `tool.view.cordis` registrieren. Zur Laufzeit bindet sich self an `pluginId + packageId`; der Business-Slot-Key lässt `pluginRunId` weg, während Owner-Props weiterhin die exakte Run-Identität liefern. Die neueste Run-Karte eines Packages besitzt die Business-UI, und frühere Karten zeigen, dass ein neuerer Run existiert. Karten reagieren auf Store-Änderungen, statt spätere Session-Log-Einträge zu scannen oder einander zu benachrichtigen.

Das globale Cordis-Panel hat einen fixierten Einstieg und gruppiert Zeilen nach aktueller und anderen Sessions. Titel und Collapse-Aktion bleiben fixiert, während nur die Liste scrollt. Eine normale Zeile kann ein Package auswählen und starten, stoppen oder löschen. Ein fehlgeschlagenes Update kann next erneut versuchen oder current zum Rollback wählen. Eine Pending-Approval-Zeile bietet nur die beiden Allow-Aktionen und Ablehnen.

### Fehler und Modell-Feedback

Technische Fehler, die Host und Client überschreiten, bewahren die ursprüngliche `message` und bewahren `stack`, wenn das Fehlerobjekt sie bereitstellt. Strukturierte Diagnosen enthalten `pluginId`, `packageId`, `pluginRunId` und eine Phase: approval, host-load, host-apply, client-load, client-apply oder client-render.

Host- und Client-Guards, Host-Evaluierung und -Handler, Client-Evaluierung und -Apply, Slot-`onEntryError` und React ErrorBoundary geben Fehler alle an den owning Agent zurück. Die Client-Konsole gibt das ursprüngliche Fehlerobjekt zusätzlich über `console.error` aus. Ein Render-Fehler gehört zum exakten Run und kontaminiert nicht das unveränderliche Package.

Nachdem ein modellinitiierter asynchroner Run erfolgreich war, abgelehnt wurde oder technisch fehlschlug, weckt `agent.steer` den owning Agent. Ein technischer Fehlschlag verlangt vom Modell, Diagnosen zu lesen, dasselbe Plugin zu korrigieren und autonom zu wiederholen. Eine Benutzer-Ablehnung verbietet eine automatische Wiederholungsanfrage. Ein manuelles Starten, Stoppen oder Entfernen des Benutzers im Panel wird per Kontextinjektion dem nächsten Step mitgeteilt, ohne das Modell proaktiv zu wecken.

## Alternatives considered

**Define und Run kombinieren.** Das entfernt den vorschaubaren Zustand „definiert, aber nicht laufend" und mischt Syntaxfehler, Genehmigung, Laufzeitfehler und Wiederholungen in eine Aktion. Das Design verwendet daher unveränderliches Define und unabhängige Run-Aktionen.

**Package-ID als Plugin-ID verwenden.** Eine einstufige ID kann unter einer stabilen Instanz keine unveränderlichen Versionen anhängen; Updates würden Stop, Undefine und ein neues Define erfordern, während historische Karten und `@`-Referenzen die Objektidentität nicht behalten könnten. Das Design verwendet daher getrennte Plugin-, Package- und Run-Identitäten.

**Ein separates `cordis_update` bereitstellen.** Update hat dieselbe Lade-, Genehmigungs-, UI-, Diagnose- und Ausführungssemantik wie Run, sodass ein separates Tool das Protokoll nur duplizieren würde. Es wird durch `cordis_run mode:"update"` abgebildet.

**Den alten physischen Run nach einem Update-Fehler automatisch wiederherstellen.** Automatische Wiederherstellung kombiniert „Ziel fehlgeschlagen" und „alte Version wieder erfolgreich" zu einem Ergebnis. Das Design behält den alten current-Zeiger ohne Neustart, sodass der Benutzer explizit wählt, ob er next wiederholt oder current laufen lässt.

**`cordis_run` bis zur Benutzer-Genehmigung und dem finalen Client-Ergebnis blockieren.** Genehmigung oder Seiteninteraktion kann möglicherweise erst nach Ende des aktuellen Modell-Turns eintreten. Blockieren würde deadlocks erzeugen und das Tool unbegrenzt belegen, wenn keine Seite existiert. Das Tool kehrt sofort zurück, während Stores, Inspect und Steering das finale Ergebnis melden.

**Source vom Host broadcasten und mit Timeout auf Client-Quittungen warten.** Broadcasten sendet Source vor der Autorisierung an jede Seite. Ein Timeout kann keine Seite, eine langsame Seite und keine Benutzeraktion nicht unterscheiden, und der Host müsste kompensierende Rollbacks pflegen. Das Protokoll broadcastet nur Metadaten, und eine autorisierte Seite holt Source für den exakten Run ab.

**Beim Seitenstart jedes Host-aktive Package automatisch wiederherstellen.** Das erfordert Verbindungsidentität, eine Start-Baseline und seitenübergreifende Konsistenz. Das Design akzeptiert seitenlokalen Client-Zustand und lässt den Benutzer über das Panel neu laden.

**Package-Hälften über öffentliche Remote Services oder `ctx.remote` verbinden.** Das exponiert dynamische Packages über das Produkt-RPC-Interface. Das Package-private `harness.handle`/`host.call` reicht für Client→Host-JSON-Aufrufe aus und lehnt veraltete Anfragen per `pluginRunId` ab.

**Jede Service-Methode automatisch als Inspect-Query exponieren.** Das verwandelt Capability-Ermittlung in einen Business-Call-Proxy, der Plugin-Genehmigung und Lebenszyklus umgeht. Provider exponieren nur kuratierte Read-only-Queries; der Service Catalog beschreibt nur Business-Methodensignaturen.

**Die vollständige API in den System Prompt oder den Skill schreiben.** Statischer Text driftet und verbraucht Kontext. Der System Prompt behält stabile Regeln, der Skill liefert Anforderungsnavigation, und Provider/Catalog-Ergebnisse liefern exakte Signaturen und Laufzeitverzeichnisse.

**Von Slot-Ownern verlangen, Props-Schemas zur Laufzeit zu registrieren.** Slot-Props existieren bereits in TypeScript-Typen und JSDoc, doppelte Registrierung schafft also eine zweite Autorität. Der Slot-AST-Catalog extrahiert das statische Protokoll und merged den Live-Tree nur zur Query-Zeit.

**Laufzeitzustand in das Session Log schreiben und beim Replay wiederherstellen.** Dynamischer Code und Fibers sind prozesslokale Objekte. Wiederherstellung würde das erneute Ausführen historischen Codes und die Neuinterpretation von Genehmigungen erfordern. Die Session behält nur modellsichtbare Einträge; Registry und Seiten-Runs werden nicht wiederhergestellt.

**Historische Run-Karten spätere Session-Log-Einträge scannen lassen.** Das koppelt Tool-Views an die vollständige Log-Reihenfolge und spätere Nachrichtenstruktur. Der Seiten-Kartenindex/Store teilt Karten bereits pro Package mit, wann ein späterer Run sie ersetzt oder ihr Plugin gelöscht wird.

## Acceptance criteria

- Ein neues Plugin kann nur aus einem 3-bis-6-zeichenlangen kleingeschriebenen englischen Präfix erzeugt werden; finale Plugin-, Package- und Run-IDs werden vom Host vergeben und verwenden Branded Types.
- `cordis_define` validiert nur Parameter und Plain-JavaScript-Syntax und gibt ein unveränderliches Package zurück; ein Plugin kann Versionen anhängen, während alter Source inspizierbar bleibt.
- `cordis_run` validiert run/update strikt; Host-only-Aktivierung schließt synchron ab, während eine Aktivierung mit Client-Hälfte `awaiting-approval` oder `starting` zurückgibt, ohne auf das finale Browser-Ergebnis zu warten.
- Ein einzelner Haken autorisiert nur das aktuelle Package, ein doppelter Haken autorisiert zukünftige Versionen desselben Plugins. Autorisierung übersteht technische Fehlschläge, während Ablehnung keine der beiden Hälften ausführt.
- Der Host aktiviert zuerst, und der Client holt dann Source für den exakten Run. Ein Package mit Client-Hälfte committet current nicht vor Client-Erfolg, und current/next erlauben Wiederholung und Rollback nach Fehlschlag.
- Ein Plugin hat höchstens einen physischen Run gleichzeitig. Stop baut beide Hälften ab, behält aber Definitionen und Zeiger; Undefine löscht jedes Package, jede Autorisierung und jeden Zustand.
- Die aktuelle Seite unterscheidet „Ready", „Client ready to activate" und „Running", und eine Pending-Approval-Zeile zeigt nur Genehmigungsaktionen.
- `tool.view.cordis`-self bindet Plugin + Package. Die neueste Run-Karte eines Packages besitzt exklusiv dessen Business-UI, während alte Karten und gelöschte Plugins explizite Fallback-Zustände haben.
- Host- und Client-Guards lehnen Imports, JSX, nicht deklarierte Services und nicht verfügbare Globals ab. Services, Timer, Slots, Styles, Tools, Handler und Theme-Overrides werden mit dem Run abgebaut.
- Package-privates RPC erlaubt nur verlustfreies JSON von Client zu Host und lehnt eine veraltete `pluginRunId` ab.
- Inspect-List gibt Host- und Client-Manifeste gemeinsam zurück. Query ruft nur explizite Read-only-Methoden auf, und eine Client-Query wartet auf das erste schema-valid erfolgreiche Ergebnis oder auf Abbruch.
- Service/Event-Catalogs werden pro Host/Client generiert und wenden Allowlists an. `@deprecated`-APIs, Runner-eigene Services und `cordis/*`-Kontroll-Events werden vor dem Modell verborgen; Slot-Query merged statische Props mit dem Live-Subtree.
- `cordis_inspect_self` gibt geschichtete Plugin-Listen, Package-Zusammenfassungen und exakten Source/Diagnosen zurück. `@pluginId` injiziert keinen Source und hält Updates im selben Plugin.
- Asynchrone technische Fehlschläge, Host-Handler, Client-Guards und React-Render-Fehler bewahren message/stack und steuern den owning Agent; Benutzer-Panel-Aktionen injizieren nur Kontext in den nächsten Step.
- Die Schichten System Prompt, Skill, Tool-Beschreibungen und Provider/Catalog folgen dieser Note. Der Prompt bleibt ausreichend, um ein minimal korrektes Plugin zu erzeugen, wenn der Skill nicht verfügbar ist.
- Relevante Workspaces bestehen `pnpm run build`; die Implementierung ergänzt Host/Client-Lebenszyklus, Versionierung, Genehmigung, Inspect, Guard, Tool-Karten- und Real-Application-Snapshot-Abdeckung.

## Risks

- **Ein Prozessneustart verliert alle dynamischen Objekte.** Historische Tool-Karten bleiben, aber die Registry wird nicht wiederhergestellt; der Benutzer muss neu definieren.
- **Mehrseitiger Zustand ist nicht stark konsistent.** Der erste gültige Client-Erfolg kann current committen, während Client-Lade- und Render-Zustand sich weiterhin zwischen Seiten unterscheiden können. Diese Version führt keine Verbindungsidentität, kein Quorum und keine Seitenaggregation ein.
- **Client-Inspect kann unbegrenzt pending bleiben.** Der Host speichert das jüngste Manifest, kann aber ohne eine Seite, die den Provider erfolgreich ausführt, keine veralteten Daten als Live-Ergebnis ausgeben. Wenn jede Seite fehlschlägt, wartet die Anfrage bis zum Abbruch.
- **Versionsübergreifende Autorisierung erweitert das Vertrauen.** Ein doppelter Haken erlaubt zukünftige Packages desselben Plugins ohne weitere Genehmigung. Die UI muss Package-weise und versionsübergreifende Autorisierung klar unterscheiden.
- **Ein fehlgeschlagenes Update kann current auf eine alte, nicht laufende Version zeigen lassen.** Current identifiziert die letzte erfolgreiche Version, nicht den physischen Run. UI, Inspect und Prompts müssen active, current und next gemeinsam zeigen.
- **Eingeschränkte Kontexte sind keine Sicherheits-Sandboxen.** Host-Services, Dateien, Kommandos, Netzwerkzugriff und Client-UI sind echte Fähigkeiten. Allowlists und Genehmigung reduzieren Fehlanwendung, isolieren aber keinen bösartigen Code.
- **Catalogs, Guards und Source können driften.** Generatoren, Allowlists und Owner-JSDoc müssen gemeinsam gepflegt werden. Guards Verbergeregeln dürfen keine zweite Signatur erzeugen.
- **Builtins benötigen manuelle Deklarationen.** React-, harness-, host-, styles- und Context-Methoden haben keine einheitlich scannbare Quelle, daher müssen Injektionsimplementierungen und Provider-Definitionen einen gemeinsamen Pflegeort teilen.
- **Provider-Output-Schemas erlauben derzeit breites JSON.** Die erste Version priorisiert Provider-Ownership, Input-Validierung und Host/Client-Routing; Output-Schemas können später enger werden.
- **Host- und Client-Guards sind Parallelimplementierungen.** Ihre verfügbaren Umgebungen und Cordis-Typ-Interfaces unterscheiden sich, daher bleiben sie getrennt. Eine gemeinsame Spezifikation sollte nur extrahiert werden, wenn sie Code entfernt, ohne Sicherheits-Policy zu verschleiern.
