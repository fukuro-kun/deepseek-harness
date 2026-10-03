# Agent Note: Typisierte Tool-Rückgaben im PTC mode
[English](2026-07-20-ptc-typed-tool-returns.md) | [中文](2026-07-20-ptc-typed-tool-returns.zh.md) | Deutsch

Status: implemented


## Problem

PTC mode projizierte ursprünglich jedes verschachtelte Tool-Ergebnis aus `ContentBlock[]` zurück in einen String. Das bewahrte die menschenlesbare Native-Darstellung, löschte aber das kanonische Ergebnis, das das Tool bereits erzeugt hatte: Programme mussten job ids und dynamische Mount-IDs aus Prosa herausparsen, strukturierte Such- und Workflow-Ergebnisse verloren ihre Form, und Nicht-Text-Blöcke wurden zu Platzhaltern. Das generierte SDK konnte Argumente beschreiben, aber unabhängig von der tatsächlichen Tool-Ausgabe nur `Promise<string>` versprechen.

Die Laufzeit behandelte außerdem Bindungswerte und den finalen Programmwert als Präsentationsdaten. Getrennte Log- und Completion-Obergrenzen konnten eine übergroße oder nicht klonbare Completion durch inspizierten Text ersetzen, obwohl Zwischenwerte gar nicht in den Modellkontext eingehen. Das machte programmatische Komposition verlustbehaftet und verwechselte die Speichergrenze mit der prompt-Grenze.

Der [kanonische Tool-Ausgabevertrag](../architecture/2026-07-20-canonical-tool-output-contract.de.md) etabliert einen validierten Ausführungszeit-Wert und einen separaten Native-Renderer. PTC mode soll diesen Wert direkt konsumieren, über die worker-Grenze bewahren und nur die finale Ausgabe begrenzen, die das Programm bewusst an das Modell zurückgibt.

## Decision

PTC mode ist eine typisierte Projektion der sichtbaren Tool-Registry. Jede erfolgreiche Bindung löst zum finalen kanonischen `JsonValue` nach post-execute-Policy auf, während eine fehlgeschlagene Bindung mit einem echten `ToolCallError` rejected. Zwischenwerte bleiben im Lauf und überqueren die worker-Grenze als Ganzes. Die äußeren `run_code`-Logs, der Completion-Wert oder die Fehlerdiagnose gehen in das konfigurierbare Ausgabe-Ledger und die modellseitige spill-Pipeline; ein erfolgreich abgerechneter Unteraufruf, dessen finaler Native-Inhalt ein Bild enthält, verzögert zusätzlich dessen vollständigen geordneten Inhalt über das parent-Ergebnis als geloggten, quellattribuierten Kontext.

Dieses Note besitzt den Rückgabe- und Fehlervertrag, der auf das ursprüngliche [PTC-mode-Fundament](2026-06-15-ptc.de.md) geschichtet ist. Das einheitliche Schema-Vokabular gehört dem [JSON-value-schema-DSL-Note](../architecture/2026-07-20-unified-json-value-schema-dsl.de.md), und Native-Rendering und Policy-Projektion bleiben im canonical-output-Note.

### Generated SDK

Bei jeder prompt-Assembly projiziert die Registry das Parameter-Schema und das losgelöste kanonische Ausgabe-Schema jedes sichtbaren Tools in eine deterministische Deklaration:

```ts ignore-check
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

interface ToolArgsMap {
  // one exact inferred entry per visible tool
}

interface ToolOutputMap {
  // one exact inferred entry per visible tool
}

type ToolName = keyof ToolOutputMap

declare class ToolCallError extends Error {
  readonly name: 'ToolCallError'
  readonly toolName: ToolName
}

declare const tools: {
  [K in ToolName]: (args: ToolArgsMap[K]) => Promise<ToolOutputMap[K]>
}
```

`jsonSchemaToTs()` deckt jeden unterstützten Unified-Schema-Knoten ab: object, array, string, number, integer, boolean, null, unbeschränktes JSON, skalare `enum` und `const` sowie `oneOf`. Nicht unterstützte Rohkonstrukte degradieren während der prompt-Generierung zu `unknown`, statt die Assembly zu brechen. Tool-Namen behalten ihre exakten Schlüssel, einschließlich Namen, die quotierten Zugriff erfordern.

### Binding values and failures

Vor dem Dispatch snapshotet die Bridge die Bindungsargumente als verlustfreies JSON und snapshotet den losgelösten Wert erneut für ein unabhängiges dauerhaftes Summary-Event. Host-seitiges Detachment, immutable Execution und Ausgabe-Schema-Projektion nutzen allesamt iterative Traversierungen statt verschachteltem structured clone oder rekursivem Einfrieren. `undefined`, nicht-endliche Zahlen, `-0`, sparse arrays, Zyklen, Funktionen und exotische Objekte lassen diesen Aufruf noch vor dem Tool-Lauf fehlschlagen. Erfolgreicher Dispatch gibt `ToolExecutionResult.value` zurück; Native-`content`, Metadaten und interne Fehlerinformationen gelangen nicht zum Programm. Bildtragender finaler Inhalt ist kein zweiter Bindungswert: Die Bridge fährt ihn nach dem äußeren Ergebnis über, damit die nächste Modellanfrage das dauerhafte Bild sehen kann, während post-execute-Block-/Inhalts-Ersetzung autoritativ bleibt und reine Text-Ergebnisse nicht dupliziert werden.

PTC mode deklariert seine Rejection-Fähigkeit am Laufzeit-Request als `{ name: "ToolCallError", memberNameProperty: "toolName" }`. Die Runtime-Service-Definition behandelt diese Namen als Daten: Der worker materialisiert und injiziert den tatsächlichen Konstruktor, der für `tools`-Bindungsfehler verwendet wird, sodass `error instanceof ToolCallError` funktioniert, ohne dass eine generische Laufzeit Tools kennen muss. Der worker konstruiert Fehler und definiert ihre öffentlichen Felder über modul-erfasste Error- und Property-Definition-Intrinsics plus null-Prototyp-Deskriptoren, sodass Modell-Mutationen das versprochene Rejection nicht durch einen worker-Fehler ersetzen können. Der Fehler trägt die Standard-`Error`-Nachricht plus das exakte `toolName`; er lässt `ToolFailure.info`, Fehlercodes und Native-Inhalt bewusst weg. Dies ist ein Ausnahmevertrag für Kontrollfluss, keine Fehler-Union zur programmatischen Klassifikation.

Bindungsargumente und -auflösungen werden auf beiden Seiten des feindlichen worker-Protokolls als verlustfreies JSON neu validiert und haben keine Byte-Obergrenze. Vor dem Übertritt durch structured clone wird jeder losgelöste Wert als flacher Preorder-Token-Stream kodiert, dessen Transport-Verschachtelung begrenzt ist; der Empfänger baut ihn iterativ wieder auf. Gültige Anwendungsverschachtelung hat damit weder eine JavaScript-Call-Stack-Tiefenbegrenzung noch ein plattformspezifisches Limit für verschachteltes structured clone. Bei der Modulinitialisierung erfasst der worker die `Array.prototype`- und `Object.prototype`-Identitäten seiner eigenen Realm, das native Funktionsquell-Intrinsic, das nur zur Erkennung fremd-realmiger Plain-Container-Prototypen dient, sowie jedes strukturelle und Metering-Intrinsic, das die JSON-Grenze nutzt. Property-Schreibzugriffe verwenden null-Prototyp-Deskriptoren, während private Array- und Set-Operationen erfasste Methoden aufrufen, ohne veränderliche globale oder Prototyp-Slots zu konsultieren. Modellcode kann daher Helfer wie `Object.keys`, `Array.isArray`, Collection-Methoden, String-Methoden oder `Buffer.byteLength` ersetzen, Konstruktor-Slots intrinsischer Prototypen umschreiben oder deskriptorförmige Felder zu `Object.prototype` hinzufügen, ohne Validierung, Wire-Transport oder Byte-Abrechnung zu ändern. Die Fremd-realm-Prüfung des nativen Funktionsquells weist weiterhin nutzergeschriebene Konstruktoren zurück, die `Object` oder `Array` imitieren. Die dependency-arme Runtime-Service-Definition benennt ihr strukturelles Äquivalent `CodeJsonValue`, damit sie nicht vom session-eigenen kanonischen Typ abhängen muss; das generierte SDK und die Tool-API nutzen `JsonValue`. Zwischenwerte werden weder prompt-gekürzt noch kontext-gespillt oder persistiert. Das bewahrt vollständig erfasste Such-, Workflow-, Task-, Dateisystem- und MCP-Werte für programmatisches Filtern, während Provider- und Executor-Erfassungslimits wahrheitsgemäß bleiben.

### Outer result and output ledger

Die Laufzeit akzeptiert eine exakte verlustfreie JSON-Completion mit beliebiger Wurzel. `undefined` zurückzugeben lässt die Completion weg; `null` ist ein explizites Ergebnis. `run_code` legt den kanonischen äußeren Wert `{ logs: string[], result?: JsonValue }` offen. Sein Native-Renderer gibt zuerst Logs aus, rendert ein String-Ergebnis roh und rendert jede andere JSON-Wurzel mit einem iterativen Pretty-Printer. Die Gesamteinrückung ist auf zehn Zeichen begrenzt, tiefere Unterbäume bleiben kompakt — das bewahrt den etablierten flachen Text, hält die Traversierung stack-sicher und die formatierte Größe linear zur kanonischen JSON-Größe.

`WorkerThreadCodeRuntime` ersetzt die früheren unabhängigen Log- und Wert-Obergrenzen durch das konfigurierbare `maxOutputBytes`, Standard `67_108_864` Bytes. Der worker verrechnet erfasste Logs mit ihrer exakten JSON-String-Serialisierung und prüft die losgelöste Completion oder Programmausnahme gegen das verbleibende kombinierte Budget, bevor er eine Terminal-Nachricht postet. Ein riesiger geworfener String oder Stack überquert den worker-Port daher nur als feste `output-limit`-Diagnose. Der Host wiederholt das Feind-Peer-Ledger für gefälschten Verkehr und native Pipe-Schreibzugriffe, die der worker nicht beobachten kann. Feste `CodeRunResult`-Feldnamen, geschweifte Klammern, das begrenzte Error-Kind-Tag und spätere Präsentations-Leerräume liegen bewusst außerhalb dieses Variablen-Payload-Ledgers. Keine der Stufen materialisiert eine über-limit-serialisierte Completion. Ein Ergebnis an oder unter der Grenze ist exakt. Eine Completion, die das verlustfreie JSON-Snapshotting nicht übersteht, schlägt als `invalid-output` fehl; ein Wert, eine Diagnose oder ein kombiniertes Ergebnis über der Grenze schlägt als `output-limit` fehl, statt zu inspiziertem oder gekürztem Text zu werden.

Logs streamen eifrig, sodass ein beendeter Lauf bereits zugelassene Ausgabe behalten kann. Native stdout- und stderr-Schreibzugriffe, die die gepatchten Stream-Slots des workers umgehen, nutzen unabhängige Pipes, sodass die terminale Abrechnung die begrenzte Erfassung bis zum Abschluss der worker-Terminierung fortsetzt, bevor das Ergebnis materialisiert wird. Bei Überschreiten der Grenze gibt die Laufzeit einen expliziten begrenzten Fehlschlag mit dem passenden erfassten Präfix zurück. Dieses äußere Ergebnis durchläuft dann das gewöhnliche `run_code`-Rendering und die spill-Policy, die den erfassten Text speichern und seine konfigurierte Kopf-/Fuß-Vorschau offenlegen kann. Die spill-Schicht kann keine Bytes zurückholen, die die Laufzeit jenseits der harten Grenze abgelehnt hat.

Rechenzeit, Wandzeit, worker-Heap, Abbruch und Fresh-worker-Isolation bleiben unabhängige Grenzen. Das äußere Ledger belastet niemals Zwischenbindungen; Snapshotting, Flat-Wire-Kodierung und -Dekodierung, structured-clone-Kosten und verfügbarer Prozess- oder worker-Speicher sind deren praktische Schranken.

### Typed handles and lifetime

Hintergrund-Produzenten geben ein typisiertes kanonisches Handle wie `{ kind: 'background', jobId }` zurück und behalten ihren etablierten Native-Satz. Ein vorab abgebrochener Hintergrundaufruf bleibt ein Fehlschlag, weil erfolgreiche Ausgabe eine id verspricht und kein Task erzeugt wurde. Nachdem `ctx.jobs.start()` die id veröffentlicht hat, regelt task-eigener Abbruch die Arbeit: Abrechnung oder späterer Abbruch des umschließenden `run_code`-Aufrufs tötet sie nicht. Ein späteres Programm kann die zurückgegebene id an `job_output` übergeben, und `job_kill`, owner-Disposal oder Service-teardown besitzen den Abbruch. Vordergrund-Ausführung bleibt an das Aufrufsignal gekoppelt. Der Task-Lebenszeitvertrag gehört dem [background-job-runtime-Note](../architecture/2026-06-20-generic-long-running-tool-runtime.de.md).

Temporäre Cordis-Plugins folgen derselben Regel: `cordis_mount` gibt `{ id, pluginName, state, provides, waitingFor }` zurück, sodass ein Programm `mounted.id` lesen, den aktiven oder ausstehenden Zustand prüfen und diese id an `cordis_unmount` übergeben kann, ohne den stabilen Native-Satz zu parsen.

### Persistence, metadata, and spill

Verschachtelter Dispatch loggt den vollständig gerenderten `content`/`isError` des Unteraufrufs auf `tool/ptc-dispatch`, persistiert aber keine kanonischen Werte. `tool/result` persistiert weiterhin nur gerenderten Inhalt, Fehler und optionale Metadaten. Eine erfolgreiche finale Inhaltssequenz mit Bild wird zusätzlich in eine quellattribuierte user-Nachricht verpackt und über das äußere Ergebnis verzögert; das gewöhnliche Session-Event macht diesen modellsichtbaren Eingang rekonstruierbar. Das [PTC-mode-Note](2026-06-15-ptc.de.md) besitzt dauerhafte Event-Namen und historische Identitätsbewahrung; Replay kann kanonische Programm-Zwischenwerte nicht wiederherstellen.

Das opake `exec.parent`-Token markiert verschachtelte Aufrufe. Präsentations-Metadaten und generische oder tool-eigene spill-Projektionen überspringen diese Aufrufe; ihre kanonischen Werte gelangen nie in den Kontext. Der Client kann [verschachtelte Terminal-Karten](../bug-fix/2026-09-05-nested-terminal-cards.de.md) aus rohen Dispatch-Events ohne Metadaten ableiten. Der äußere `run_code`-Aufruf erzeugt das modellseitige Ergebnis und kann seine finale post-policy-Präsentation spillen; `run_code` deklariert bewusst weder einen Ergebnis-Presenter noch Präsentations-Metadaten, sodass UI-Adapter die Karte über ihren generischen Raw-Content-Fallback mit dauerhaftem `tool/result.content` vervollständigen.

## Testing

Compile-Zeit- und Snapshot-Tests pinnen exakte `ToolArgsMap`, `ToolOutputMap`, `ToolName`, Schema-zu-TypeScript-Abdeckung, exotische Namen und assemblierte PTC-mode-Bildweiterleitung. Registry- und Real-worker-Tests decken skalare, Array-, Objekt- und null-Werte ab; rohes String-Rendering; abwesendes `undefined`; consumer-deklarierte echte Rejection-Klassen einschließlich `ToolCallError`; ungültige Argumente und Completions einschließlich intrinsic-artig gefälschter Prototypen; modellmutierte JSON-Grenz-Globale, Prototyp-Methoden, Konstruktor-Slots und geerbte Deskriptorfelder; typisierte Bindungsfehler nach diesen Mutationen; große unbegrenzte Zwischenbindungen; verschachtelte spill-Unterdrückung; generische bildtragende Kontext-Verzögerung plus post-execute-Ersetzungs-/Block-Vorrang; exakte und über-limit-64-MiB-Verrechnung; kombinierte Logs/Wert/Diagnose-Verrechnung; riesige geworfene Stacks; bounded-failure-spill; feindlich gefälschter Verkehr; und Ausführung des gebauten Pakets.

Schlüssellose Real-worker-Integrationstests pinnen die beiden Handle-Workflows, die Prosa-Ergebnisse nicht sicher tragen konnten. Ein Hintergrund-bash-Aufruf gibt seine job id zurück, der äußere Lauf rechnet ab, und ein späterer Lauf pollt diese id bis zur Fertigstellung; separate Fälle beweisen, dass ein Pre-abort keinen Task erzeugt, ein Post-Publikations-Aufrufabbruch den Task bewahrt, Vordergrund-Ausführung signal-gekoppelt bleibt und `job_kill` den Abbruch besitzt. Ein Cordis-Programm liest die id- und `waitingFor`-Felder eines aktiven oder ausstehenden Mounts direkt, unmountet über diese id und bestätigt die Entfernung, ohne gerenderten Text zu parsen.

## Alternatives considered

**Native-Text plus optionales JSON zurückgeben.** Abgelehnt, weil das Programm zwei konkurrierende Erfolgsverträge hätte und bei fehlendem optionalem Wert weiterhin tool-spezifische Parseregeln bräuchte. Der kanonische Wert ist die API; Native-Inhalt ist seine Präsentation.

**Eine Erfolgs-/Fehlschlag-Union aus jeder Bindung offenlegen.** Abgelehnt, weil Fehlschlag keine stabile programmatische Taxonomie hat. Rejections bewahren gewöhnlichen `try`/`catch`-Kontrollfluss und legen nur Tool-Name und menschenlesbare Nachricht offen.

**Jede Zwischenbindung begrenzen.** Abgelehnt, weil Zwischenwerte nicht in den Modellkontext gelangen und willkürliches Kürzen programmatische Komposition korrumpieren würde. Der Erfassungsvertrag des Produzenten und der Prozessspeicher bleiben explizite Grenzen.

**Eine übergroße Completion still inspizieren oder kürzen.** Abgelehnt, weil die Umwandlung eines JSON-Werts in einen String verlustbehaftet und typfehlerhaft ist. Der explizite `output-limit`-Fehlschlag lässt das Modell ein kleineres Ergebnis wählen, während die erhaltenen Logs und die Diagnose weiterhin normalen äußeren spill nutzen können.

**Jedes reiche Leaf-Tool verpflichten, `exec.parent` zu prüfen und sich selbst zu verzögern.** Abgelehnt, weil es Leaf-Tools an PTC-mode-Interna koppelt, Policy-Behandlung dupliziert und künftige reiche Tools verfehlt. Die Dispatch-Bridge besitzt die generische Weiterleitung aus dem bereits abgerechneten finalen Ergebnis.

**Native reichen Inhalt als Teil des kanonischen Werts jeder Bindung offenlegen.** Abgelehnt, weil ein kanonischer Wert verlustfreies JSON und tool-spezifisch ist; Attachment-Blöcke sind eine Modellprojektion mit dauerhafter Lebenszyklussemantik. Wert und Projektion getrennt zu halten bewahrt typisierte Programme, ohne Bilder aus späterem Modellkontext zu verlieren.

## Consequences

Code-Programme können Tools über stabile Werte komponieren, statt Native-Prosa rückzuentwickeln. Native und Both mode behalten ihre bestehende Text- und UI-Präsentation, während PTC mode Ausgabe-Schema-Typen und exaktes Laufzeit-JSON erhält. Tool-Autoren müssen den kanonischen Wert als ihre programmatische API behandeln und rein anzeigende Formatierung in den Renderer legen.

Der worker führt Transport über Flat-Wire mit begrenzter Tiefe und verlustfreie Validierung durch, macht Zwischenwerte aber weder billig noch dauerhaft. Äußerer Überlauf ist ein expliziter fehlgeschlagener Lauf, und Fehlerbehandlung bleibt bewusst menschengeführt statt einer versionierten Code-Union.

## Known Limitations and Deferred Work

- Subagent- und Workflow-aufruferdefinierte strukturierte Ausgaben bleiben über Consumer-Level-Guards objektgewurzelt, obwohl Tool-Ausgaben jede JSON-Wurzel nutzen dürfen.
- Post-execute hat getrennte Wert- und Präsentationsprojektionen; Inhaltsersatz ist kein Vertraulichkeitsmechanismus, daher muss die Policy den Wert blockieren oder ersetzen, um ihn vor programmatischen Aufrufern zu verbergen.
- Kanonische Zwischenwerte sind ausführungslokal und für Replay nicht verfügbar, weil dauerhafte Events nur Präsentation und begrenzte Summaries persistieren.
- Zwischenwerte haben keine Byte-Obergrenze und können Prozess- oder worker-Speicher durch Retention, Flat-Wire-Kopien oder structured-clone-Kosten erschöpfen.
- Die 64-MiB-Hartgrenze gilt nur für die äußeren variablen Payloads, ohne feste Ergebnis-Envelope-Syntax und Präsentations-Leerräume; spill kann jenseits dieser Grenze verworfene Bytes nicht zurückholen.
- Provider- oder Executor-Erfassungslimits können Quelldaten bereits verworfen haben, bevor ein kanonischer Wert PTC mode erreicht.
- Nicht unterstützte MCP-Ausgabe-Schemas fallen auf `JsonValue` zurück; zugelassene MCP-Bilder nutzen die generische verzögerte Projektion, während Audio- und Embedded-Resource-Payloads nur diagnostisch bleiben.
- Verschachtelte Aufrufe haben kein separates modellseitiges Ergebnis; Client-child-Karten fügen keinen Modellkontext hinzu.
- Code-Fehlschläge legen nur `ToolCallError`-Nachricht und Tool-Name offen, ohne programmatische Fehlercode-Union.
