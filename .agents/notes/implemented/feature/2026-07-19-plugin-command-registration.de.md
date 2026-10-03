# Agent Note: Plugin-owned Human-Command-Registrierung
[English](2026-07-19-plugin-command-registration.md) | [中文](2026-07-19-plugin-command-registration.zh.md) | Deutsch

Status: implemented


## Problem

Die TUI besitzt die Slash-Commands. Wenn Command-Namen, Hilfetexte, Autocomplete, Dispatch und Cancellation im Adapter bleiben, wird jeder neue Command zu einem TUI-Eingriff, und optionale Plugins können keine Commands beitragen. Slash-Eingaben als gewöhnlichen Modell-Prompt zu behandeln ist ebenfalls unsicher: Eine nutzersichtbare direkte Aktion kann unerwartet Token verbrauchen oder das Modell ein unbekanntes Command neu interpretieren lassen.

Ein gemeinsamer Mechanismus muss ein UI-Anliegen bleiben, nicht ein Modell-Tool oder ein Agent-Loop-Zweig. Er braucht außerdem exakte Per-Agent-Sichtbarkeit, HMR-sichere Entfernung, direktes Ergebnis-Rendering und request-scoped Cancellation, ohne Command-Text oder -Ausgabe automatisch in die Modell-History aufzunehmen.

## Entscheidung

`@deepseek-ai/dsh-commands` in `packages/interaction/commands/` ist die Produkt-Command-Registry. `dsh-base` mountet sie für konsumierende Frontends; die [Automation-only-ACP-App](../simplification/2026-07-23-acp-automation-only-protocol.de.md) und der eigenständige `sdk-minimal`-Baum lassen sie weg. UI-Flächen injizieren den Service, während Command-Produzenten nur von der Registry und der Domain abhängen, auf der sie operieren.

### Registry-Contract

Eine `CommandDefinition` enthält einen kleingeschriebenen Namen ohne `/`, eine nicht leere Beschreibung, einen optionalen Hinweis auf unstrukturierte Eingabe und einen abbrechbaren Handler. Die Registrierung validiert und detacht die Metadaten, friert die effektive Definition ein und gibt den exakten Cordis-Effect-Disposer zurück. Doppelte Namen schlagen innerhalb einer Ebene fehl. Jeder Consumer sieht jede effektive Definition; ein Command-Plugin, das in einem Deployment nicht operieren kann, lässt dort seine Registrierung weg, statt Consumer-Identitäten in die geteilte Domain zu kodieren.

`list(agent)` gibt nach Scoped-Shadowing unveränderliche, namenssortierte Deskriptoren zurück. `find(agent, name)` löst die effektive Definition auf. `execute(agent, line, signal)` parst und führt eine bekannte Definition aus und gibt ein detachtes `success`- oder `error`-Ergebnis zurück; ungültige Syntax und unbekannte Namen geben `undefined` zurück, sodass der Adapter seinen eigenen direkten Fehlertext besitzt.

`parseCommand(line)` verlangt `/` an Byte null, einen kleingeschriebenen ASCII-Namen aus Buchstaben, Ziffern, `_` oder `-`, gefolgt von Whitespace oder Eingabeende. Es bewahrt das vollständige vom Adapter gelieferte Suffix als `rawInput`, einschließlich des Trenn-Whitespace. Command-spezifische Plugins besitzen jede weitere Grammatik-Entscheidung.

### Scope und Lifecycle

Eine unscoped Registrierung ist global. Ein Command-injizierendes Plugin, das unterhalb eines Agent-Kontexts gemountet ist, erbt dessen Scope-Key und Lebensdauer, sodass seine Definition ein gleichnamiges Global nur für genau diesen Agent überschattet. Das Child deklariert seine eigene `commands`-Injektion, weil `agent.ctx` absichtlich die Dependency-API des Core-Agent-Loops erbt; einen UI-Service nur zur Ermöglichung scoped Registrierung in den Loop aufzunehmen würde den Dependency-Graphen invertieren.

Registrierung und Entfernung emittieren die ungefilterte, nicht vetofähige `commands/change`-Registry-Notification. Adapter berechnen die effektive Sicht jedes live Agent neu, statt abzuleiten, welche Sessions eine Änderung betrifft. Die Registry isoliert und protokolliert jeden Observer-Fehler unabhängig, sodass eine defekte UI-Aktualisierung weder die Mutation eines anderen Plugins zurückrollen noch einen späteren Observer aushungern kann. Cordis-Ownership entfernt Definitionen, wenn ihr Produzent, ihre UI-Instanz oder ihr Agent-Scope entlädt, sodass HMR keine veralteten Discovery-Einträge oder Handler hinterlassen kann.

### Direkter Dispatch und Cancellation

Commands laufen in einer Human-only-Command-Ebene. Die Registry wandelt ihre Eingabe nicht in `user/message` um, ihre Ausgabe wird kein Session-Event, und keines von beiden wird implizit an das Modell gesendet. Ein Handler erhält den exakten Ziel-Agent, die Roheingabe und ein request-eigenes `AbortSignal`; ein Produzent kann über diesen Agent explizit separate modellsichtbare Arbeit einplanen und besitzt dann deren Logging- und Lifecycle-Contract. Die Registry hört auf, einen unkooperativen Handler zu erwarten, wenn das Signal abbricht; der Handler bleibt dafür verantwortlich, bereits gestartete externe Seiteneffekte zu stoppen.

Erwartete Handler-Fehler geben `CommandResult.error` zurück. Geworfene oder malformed Ergebnisse bleiben adapter-sichtbare Command-Fehler, keine Modell-Messages. Diese Grenze trennt UI-Ausgabe bewusst von durabler Domain-Mutation: Ein Goal-Command kann etwa `ctx.goals` ändern, aber der Goal-Service besitzt diesen persistierten Zustand.

### TUI-Mapping

Die TUI registriert ihre eingebauten Slash-Commands als agent-scoped Command-Definitionen, statt auf Strings zu switchen. Autocomplete und Hilfeansicht lesen den live Katalog, sodass Plugin-Commands mit ihren Effects erscheinen und verschwinden. Jede eingereichte Zeile, die mit `/` beginnt, bleibt in der Command-Ebene; unbekannte Eingabe erzeugt eine Terminal-Warnung, statt zu `Agent.steer()` durchzufallen.

Jeder eingereichte Command besitzt einen `AbortController`. Das TUI-Disposal bricht ausstehende Dispatches ab, entfernt die lokalen Definitionen und wartet auf die Command-produzierende Fiber, bevor der Teardown abgeschlossen wird.

## Tests

Die Registry-Suite deckt mit pro-Datei-100%-Statement-, Branch-, Function- und Line-Coverage ab: Syntaxgrenzen, unveränderliche Normalisierung, Laufzeit-Metadatenvalidierung, deterministische Sortierung, globales und scoped Shadowing, Duplikat-Ablehnung, exaktes Disposal, isolierte Change-Notification-Fehler, direkte Invokation, erwartete und malformed Ergebnisse, synchrone und asynchrone Fehler sowie jede Abort-Timing-Kante.

TUI-Tests prüfen alle migrierten Built-ins, live Plugin-Discovery, Help-/Autocomplete-Refresh, direkte Ergebnisse, Unknown-Command-Ablehnung, Raw-Input-Zustellung, Definition-Entfernung, Startup-Rollback und Disposal-Cancellation. Schlüssellose Terminal-Snapshots pinnen die gerenderten Hilfe-, Fehler- und Command-Ergebnisformen.

## Erwogene Alternativen

- **Adapter-lokale Switches beibehalten** — abgelehnt, weil optionale Plugins ohne TUI-Eingriff keine Discovery und kein Verhalten beitragen können.
- **Human Commands als Modell-Tools darstellen** — abgelehnt, weil Discovery und direkte Invokation menschliches UI-Verhalten sind; Routing über das Modell fügt Latenz, Token-Kosten und Reinterpretation hinzu.
- **Die Registry in den verpflichtenden Agent-Core legen** — abgelehnt, weil UI-lose Einstiegspunkte sie nicht konsumieren, während UI-Profile sie explizit komponieren können.
- **`dsh-agent-loop` Commands injizieren lassen** — abgelehnt, weil der Loop menschliche Commands weder ausführt noch entdeckt. Agent-scoped Produzenten deklarieren die UI-Abhängigkeit stattdessen in einem Child-Plugin.
- **Adapter-Masken an jede Definition hängen** — abgelehnt, weil Unterstützung ein Kompositionsfakt ist, kein Command-Domain-Zustand. Jeder komponierte Adapter exponiert einen registrierten Command; ein inkompatibles Plugin lässt die Registrierung in diesem Deployment weg.
- **Unbekannte Slash-Eingabe an das Modell senden** — abgelehnt, weil falsch getippte oder nicht verfügbare direkte Aktionen vorhersagbar fehlschlagen müssen, statt die Ausführungsebene zu wechseln.
- **Generische Command-Ein- und -Ausgabe persistieren** — abgelehnt, weil Adapter-Hinweise kein modellsichtbarer Zustand sind. Ein Handler, der durables Verhalten ändert, ruft die besitzende Domain-API, die ihre eigenen Events aufzeichnet.

## Konsequenzen

- Command-Produzenten sind gewöhnliche entfernbare Plugins, und die TUI konsumiert ihren validierten Katalog und Dispatch-Contract.
- Agent-spezifische Definitionen behalten die bestehende flache Scope- und Shadow-Semantik ohne Core-zu-UI-Abhängigkeit.
- Unbekannte Slash-Eingabe und Command-Ausgabe sind deterministisches UI-Verhalten mit null direkten Modell-Token.
- Direkte Command-Cancellation ist von Modell-Turn-Cancellation isoliert.

## Bekannte Einschränkungen und zurückgestellte Arbeit

- Eingabe-Metadaten beschränken sich auf einen unstrukturierten Texthinweis. Typisierte Formulare, Argument-Schemas und Completion-Provider bleiben command-owned oder erfordern eine spätere Registry- oder Consumer-Erweiterung.
- Generische Command-Ausgabe ist nur live und wird nach einem TUI-Neustart nicht rekonstruiert.
- Registry-Cancellation stoppt das Warten sofort, aber externe Arbeit stoppt nur, wenn ein Handler mit seinem Signal kooperiert.
- Der ACP-Automation-Server, die Headless-CLI und die JSON-RPC-SDK-Einstiegspunkte exponieren die Command-Ebene nicht; nur die TUI konsumiert sie.
