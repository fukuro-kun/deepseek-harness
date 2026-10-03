---
description: "Geteilter In-Process-Subagent-Run-Driver für Maintainer und Backend-Autoren, die den Spawn- und Fork-Run-Lifecycle verstehen oder erweitern."
kind: "package-library"
---

# @deepseek-ai/dsh-subagent-in-process-driver
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-subagent-in-process-driver` ist der geteilte Run-Driver hinter den beiden In-Process-Subagent-Backends: Er erzeugt über die Agent-Factory des Hosts einen Child-Agent, wendet die Per-Child-Anpassung an, treibt eine Aufgabe zu Ende und liefert die eigene finale Ausgabe des Childs über einen einzigen quiescenten Dispose-Pfad zurück. Spawn ruft ihn ohne Session-Seed auf; fork ruft ihn mit dem Completed-Turn-Präfix des Parents auf. Er ist eine Bibliothek, kein eigenständiges Feature: Provider-Backends rufen `startInProcessRun`, und nichts in einer Komposition konfiguriert ihn. Lies diese Seite, um den Run-Lifecycle zu verstehen, den beide In-Process-Backends teilen.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Modell-Erfahrung](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Du erreichst dieses Paket über ein Provider-Backend, nicht über eine Komposition: `dsh-subagent-spawn-in-process` und `dsh-subagent-fork-in-process` rufen jeweils `startInProcessRun(request, options)` auf und besitzen alles drumherum. Diese Seite dokumentiert den Lifecycle, den beide teilen, damit du das Verhalten des einen Backends lesen und auf das andere schließen kannst.

### Was ein Run liefert

Ein Aufruf startet und treibt einen One-Shot-Child. Erfüllung bedeutet, dass der Child bereits in `ctx.agents` publiziert ist und der Aufrufer den zurückgegebenen Run besitzt; ein abgelehnter Start hat die unpublizierte Erzeugung bereits quiesced, sodass kein halb erzeugter Child überlebt. Der Run exponiert die ID und den Live-Agent des Childs, ein `result`-Promise und ein `dispose()`, das den Loop stoppt, Agent und Session entfernt und Scoped-Registrierungen abwickelt.

### Der eine Input

`InProcessRunOptions` ist `{ seed?: SessionEvent[] }` — ein Fork-Seed aus balancierten Parent-Events. Spawn lässt ihn weg; fork liefert das Completed-Turn-Präfix und protokolliert dessen Länge, damit der Result-Reader geseedete Parent-Messages nie für Child-Output hält.

### Was der Child bekommt

Der Child erhält die Working-Directory-/Session-Linie des Parents und erbt Provider, Modell, Reasoning-Effort und Output-Token-Cap des Parents, sofern `request.agentOptions` sie nicht überschreibt. Er bekommt einen frischen flachen Registrierungs-Scope: Tool-Restriktionen und Authority des Parents werden nicht importiert. Ein Run trägt das explizite Sandbox-Override und den `'never'`-Approval-Pin des Parents in den Child und hängt einen Per-Run-Deskriptor an den Initial-Turn des Childs.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt den Lifecycle-Vertrag des Drivers und die Structured-Output-Runtime; das beobachtbare Verhalten deckt [Dieses Paket verwenden](#use-this-package) ab.

### Start-Vertrag

Der Driver folgt dieser Sequenz:

1. Parent-Depth und optionalen absoluten `maxDepth` validieren, dann die Child-Depth als Parent-Depth plus eins ableiten und im Child-Session-Header persistieren.
2. Den Child über die Host-Agent-Factory erzeugen, mit dem erforderlichen Signal des Aufrufers in die Creation-Transaktion gefädelt.
3. Während des unpublizierten Setup-Fensters dieser Transaktion die angefragte Persona, die Tool-Restriktion und die Structured-Output-Runtime installieren.
4. Den Child publizieren, das zurückgegebene Handle behalten und eine Aufgabe treiben.
5. Die eigene Ausgabe des Childs lesen — seine letzte nicht-leere Assistant-Message oder, falls keine existiert, seinen akkumulierten Assistant-Text — sowie den finalen durable Turn-Reason aus dem vollständig eigenen Run, unter Ausschluss jedes Fork-Seeds.

### Cancellation und Ownership

Das erforderliche Request-Signal deckt sowohl den Start als auch den laufenden Run ab. Vor der Publikation beobachtet die Creation-Transaktion es, rollt zurück und lehnt ab; der Driver prüft einmal nach der Publikation erneut, um die Handoff-Race zu schließen, und installiert dann einen minimalen Live-Run-Listener. Nach der Erfüllung besitzt der Aufrufer den Run: Provider-Unload widerruft ihn nicht, und `dispose()` entfernt den Abort-Listener, protokolliert die Cancellation und delegiert an die memoized Quiescence-Transaktion des Handles, die den Loop stoppt, Agent und Session entfernt und Scoped-Registrierungen abwickelt. Cancellation besitzt jedes nicht abgeschlossene In-Flight-Ergebnis und meldet `aborted`; ein bereits abgeschlossener Turn bleibt abgeschlossen.

### Structured Output

`attachStructuredRuntime(childCtx, schema)` installiert den gesamten Vertrag im Scope des Childs: Ein `structured_output`-Tool validiert und staget den Wert des Modells gegen das angefragte Schema; eine abschließende First-Party-System-Prompt-Sektion mit Order 9900 sagt dem Child, dass der Tool-Call die terminale Antwort ist; ein `tools/result`-Observer committed einen gestagten Wert erst nach dem Erfolg des autoritativen finalen Tool-Results, einschließlich des umschließenden `run_code`-Results bei PTC-Mode-Sub-Dispatch; und ein monotoner Tool-Guard blockiert spätere Calls nach der Capture. Ein sauberer Turn, der den erforderlichen Wert nie committet, meldet `error`; der Driver promptet nicht erneut. Alle Registrierungen reiten auf der Child-Fiber und verschwinden mit ihr.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Run-Driver: Erzeugung, Ein-Turn-Drive, Result-Lesen, Dispose |
| [`src/structured.ts`](src/structured.ts) | Structured-Output-Runtime: Capture-Tool, Prompt-Sektion, Guard, Commit |
| — | Es wird kein Runtime-Invarianten-Begleiter publiziert; dieses Paket exponiert keine eigenständige Event-Sequenz oder mutable Datenrelation über die an seiner besitzenden Seam durchgesetzten Verträge hinaus. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Level-Vertrag nicht reicht; sie bewegen sich vom geteilten Subagent-Modell zu den auf diesem Driver gebauten Backends und zur Delegation-Policy-Entscheidung.

- [Subagent-Subsystem](../../../docs/subsystems/subagent.de.md) — Start-Requests, Results, Provider-Vertrag sowie In-Process-Depth und Seed.
- [dsh-subagent-spawn-in-process](../subagent-spawn-in-process/README.de.md) — das Fresh-Child-Backend auf diesem Driver.
- [dsh-subagent-fork-in-process](../subagent-fork-in-process/README.de.md) — das Seeded-Child-Backend auf diesem Driver.
- [Delegation-Policy-Entscheidung](../../../.agents/notes/implemented/feature/2026-07-25-subagent-policy-inheritance.de.md) — wie Sandbox- und Approval-Policy des Parents den Child erreichen.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

### Child-Agent-Request

#### Was das Modell sieht

Der geteilte Driver sendet die Aufgabe wörtlich als User-Message des Childs und verschattet auf Anfrage die Persona und beschränkt globale Tool-Schemas, Lookup, Execution und PTC-Mode-SDK-Bindings im frischen Scope des unpublizierten Childs; Parent-Restriktionen werden nicht vererbt. Tool-Guidance-Plugins können den Assembly-Scope nutzen, um Guidance für nicht verfügbare Tools wegzulassen; beliebige statische Sektionen werden vom Driver nicht umgeschrieben. Spawn liefert keine Historie; fork liefert seinen balancierten Seed.

#### Token-Effekt

Der Child-Input ist vom Parent isoliert und wächst durch die eigenen Steps des Childs. Eine Persona ändert wiederkehrenden Prompt-Text; Filterung ändert Schema- oder Generated-SDK-Kosten, und scope-bewusste Guidance ändert sich mit den sichtbaren Capabilities.

#### KV-Cache-Effekt

Unabhängig vom Request-Cache des Parents. Die spätere Historie des Childs ist append-only, während Persona-, Tool-Filter-, Generated-SDK-, Provider- oder Modelländerungen ein anderes Child-Präfix etablieren.

### Structured-Output-System-Prompt, Schema und Results

#### Was das Modell sieht

Ein strukturierter Run fügt die untenstehende Structured-Output-Instruktion hinzu. Er fügt außerdem eine Child-Scoped-`structured_output`-Definition mit dem angefragten Schema und der exakten Beschreibung `Report your final structured result. Call this exactly once, when your answer is complete; the arguments must match this tool's parameter schema exactly.` hinzu. Diese nur zur Laufzeit existierende Definition liegt außerhalb der generierten ausgelieferten [Tool-Paket-Karte](../../../docs/tool-catalog.de.md#tool-package-map). Ihre kanonische Bestätigung ist `{ recorded: true }`, gerendert als `Structured output recorded.`; ein späterer Call wird zu ``Error: structured output already recorded: the run is complete, so `<tool>` is not executed``.

##### Structured-Output-Instruktion

```markdown
When you have your final answer, you MUST report it by calling the `structured_output` tool with arguments matching its parameter schema exactly. Do not finish with a plain text answer: only the tool call counts as your result.
```

#### Token-Effekt

Feste Instruktions- und Capability-Tokens zahlt nur dieser Child. Result-Text geht in die Child-Historie, während allein der capturierte Wert zum Parent-Result wird.

#### KV-Cache-Effekt

Präfix-stabil innerhalb des Childs, solange Structured-Output-Instruktion und Schema unverändert sind. Eine Änderung von Schema oder Capability kann den Cache des Childs ab diesem frühen Segment invalidieren; Results hängen sich in Child- und Parent-Historie an.

### Parent-Start-Fehler, indirekt

#### Was das Modell sieht

Über `dsh-tool-subagent` wird ein ungültiger Depth-Zustand exakt zu `Error: agent subagentDepth must be a non-negative safe integer`, `Error: subagent child depth exceeds the safe-integer range` oder `Error: subagent depth <attempted> exceeds maxDepth <max>`. Eine Pre-Publication-Cancellation gibt ihren Abort-Reason durch den `Error: <message>`-Wrapper der Registry weiter.

#### Token-Effekt

Null Tokens bei erfolgreichem Start; nur der fehlgeschlagene Parent-Tool-Call behält diesen Text.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt auf das wiederverwendbare Request-Präfix und invalidiert keine bestehenden KV-Cache-Einträge.

### Parent-Result, indirekt

#### Was das Modell sieht

Der Driver extrahiert nur die eigene letzte Assistant-Ausgabe des Childs oder den capturierten strukturierten Wert; geseedete Parent-Messages und Child-Zwischenarbeit werden nicht zum Result.

#### Token-Effekt

Der Parent erhält über den Consumer ein datenabhängiges Result; alle anderen Child-Tokens bleiben in der Child-Session.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt auf das wiederverwendbare Request-Präfix und invalidiert keine bestehenden KV-Cache-Einträge.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was ein In-Process-One-Shot-Run nicht kann; sie sind aktuelle Paket-Constraints.

- **Runs exponieren kein `sendMessage`/`resume`** — die optionalen Runtime-Capabilities fehlen bei In-Process-One-Shot-Runs.
- **Structured Capture akzeptiert nur die `defineTool`-Schema-Teilmenge** — nicht unterstützte JSON-Schema-Konstrukte schlagen fehl, bevor der Child erzeugt wird; ein Provider, der ein breiteres Schema-Vokabular braucht, benötigt eine andere Runtime.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Keine.

</details>
