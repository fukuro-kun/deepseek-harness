---
description: "Abstrakte Code-Ausführungs-Seam (`ctx.codeRuntime`) für Benutzer und Maintainer, die ein Backend zusammenstellen, konsumieren oder bauen, das ein modellgeschriebenes Programm gegen hostseitig bereitgestellte Bindings ausführt."
kind: "package-reference"
---

# @deepseek-ai/dsh-code-runtime

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Mit `dsh-code-runtime` führst du ein modellgeschriebenes Programm über ein konfiguriertes Backend gegen hostseitig bereitgestellte asynchrone Funktionen aus. Eine Anfrage liefert einen verlustfreien JSON-Wert, pro Kanal geordnete Logs oder einen strukturierten Fehler zurück; Programmfehler werden im Ergebnis aufgelöst, während eine Promise-Ablehnung Fehlgebrauch durch den Aufrufer signalisiert. Jede Ausführung ist von früheren Ausführungen isoliert, und die Runtime kennt weder Tools noch Sessions. Das Ausführungs-Backend wird separat gewählt; seine Sprach- und Isolationsdeskriptoren bezeichnen die geforderte Quellsprache und das Ausführungssubstrat, versprechen aber selbst keine Sicherheitsgrenze.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Wähle dieses Paket, wenn du ein Deployment zusammenstellst, das modellgeschriebene Programme ausführt, `ctx.codeRuntime` direkt konsumierst oder ein Backend baust, das Programme ausführt. In der ausgelieferten Komposition ist der PTC mode in `dsh-tools` der Consumer: Nur was das Programm ausgibt und zurückgibt, gelangt wieder in die Konversation.

### Ein Programm ausführen

Übergib der Runtime eine Programmquelle und einen oder mehrere Binding-Namensräume. Jeder Namensraum wird zu einem globalen Objekt asynchroner Funktionen im Programm — der PTC mode übergibt einen unter `tools`. Das Programm läuft als Rumpf einer async-Funktion, daher funktionieren `await` und `return` auf oberster Ebene; ein verlustfreier JSON-Abschlusswert wird zu `result.value`, jeder Ausgabekanal bewahrt in `result.logs` seine eigene Reihenfolge, während kanalübergreifendes Interleaving backendabhängig ist, und jeder Fehler wird in `result.error` mit einem `kind` gemeldet, auf das du verzweigen kannst. Die Runtime lehnt niemals wegen eines Programmfehlers ab — eine Ablehnung bedeutet Fehlgebrauch der Seam, etwa eine nach dem dispose eingereichte Ausführung.

```text
const result = await ctx.codeRuntime.run({
  program: 'return await tools.add({ a: 1, b: 2 })',
  bindings: [{ global: 'tools', functions: { add: async (args) => args.a + args.b } }],
})
// result.value === 3
```

### Ein Backend wählen

Backends deklarieren zwei Deskriptoren, auf die du dich verlassen kannst: `language` — die Sprache, in der das Programm geschrieben sein muss, mit `'typescript'` und `'python'` als bekannten Werten — und `isolation` — das Ausführungssubstrat (`'worker-thread'`, `'process'`, `'container'`), eine Bezeichnung für Deployments und Diagnostik, keine Sicherheitszusage. [`dsh-code-runtime-worker-thread`](../code-runtime-worker-thread/README.de.md) führt TypeScript in einem frischen Node-Worker-Thread aus; das private Paket [`dsh-experimental-code-runtime-python`](../../experimental/code-runtime-python/README.de.md) führt Python in einem frischen CPython-Subprozess für Opt-in-Kompositionen aus.

### Bindings portabel benennen

Namen für Binding-Globals und Error-Klassen sind sprachportabel: Sie müssen zu `[A-Za-z_][A-Za-z0-9_]*` passen, die reservierten Wörter jeder portablen Zielsprache meiden und backend-eigene Slots meiden, sodass eine Namensraumliste gegen jedes Backend gültig ist. Ein Name wie `$tools`, `lambda` oder `console` lässt die Ausführung vor ihrem Start fehlschlagen; die genauen Ausschlussmengen sind Teil des Seam-Vertrags.

### Was schiefgehen kann

Fehler kommen als `result.error` mit einem orthogonalen `kind` an: Das Programm warf eine Ausnahme oder ließ sich nicht parsen (`exception`), ein Budget lief ab (`timeout`), die Ausführung wurde abgebrochen (`abort`), das Ausführungssubstrat starb (`worker-exit`), der Abschlusswert war kein verlustfreies JSON (`invalid-output`), oder die serialisierte Ausgabe überschritt das Limit (`output-limit`). Jedes `kind` trägt eine modellgeeignete Nachricht. `run()` lehnt nur bei Seam-Fehlgebrauch ab, etwa eine nach dem dispose eingereichte Ausführung oder ein Binding-Name, der die Regeln für portable Bezeichner verletzt.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design hinter der Seam; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Designkonzept

Das Paket ist die Service-Definition-Rolle der Code-Ausführungs-Capability-Seam ([capability seams](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.de.md)): ein als `ctx.codeRuntime` registriertes abstraktes `CodeRuntime extends Service` plus dem Vokabular, das beide Backends und der Consumer teilen. Provider leiten `CodeRuntime` ab, implementieren `run` und registrieren den Service; der Consumer (PTC mode in `dsh-tools`) erzeugt das modellseitige SDK und überbrückt den Tool-Dispatch. Die Runtime bleibt vertraglich unwissend über Tools und Sessions: Sie empfängt ein Programm und benannte asynchrone Bindings und gibt `{ value, logs, error? }` zurück.

### Service-API

Der Vertrag besteht aus drei Membern, die ein Backend implementiert: `run(request)` führt ein Programm gegen die Bindings der Anfrage aus und löst jedes Programmergebnis — Parse-/Transformationsfehler, geworfene Ausnahme, ungültiger Abschlusswert, Ausgabeüberlauf, Budgetablauf, Abbruch oder Substrat-Tod — als `error`-Feld des Ergebnisses auf; Ablehnung ist Fehlgebrauch durch den Aufrufer vorbehalten, etwa eine nach dem dispose eingereichte Ausführung. `language` und `isolation` sind schreibgeschützte Deskriptoren, die Quellsprache und Ausführungssubstrat für Deployments und Diagnostik bezeichnen.

Die erschöpfende Semantik steht in der [Code-Runtime-Subsystem-Referenz](../../../docs/subsystems/code-runtime.de.md); die genauen Signaturen stehen in [`src/index.ts`](src/index.ts).

### Vokabular

`CodeRunRequest` (`program`, `bindings`, `signal?`) trägt alles, worauf die Runtime wirkt; Defaulting (Zeitbudgets, Ausgabelimits) ist die validierte Config des jeweiligen Providers, niemals ein verstecktes `??` innerhalb von `run()`. `bindings` ist eine Liste von `CodeBindingNamespace`s (`global` + `functions` + optionales `errorClass`), die dem Programm jeweils als ein globales Objekt asynchroner, `CodeJsonValue` zurückgebender Callables exponiert wird — dem strukturellen verlustfreien JSON-Typ der Seam. Ein `errorClass`-Deskriptor benennt einen echten programmweiten Konstruktor und die eigene Property, die den abgelehnten Member-Namen aufnimmt, sodass Backends niemals Consumer-Begriffe wie `ToolCallError` erfahren. `CodeRunResult` meldet den verlustfreien JSON-Abschlusswert `value?`, pro Kanal geordnete `logs: string[]` mit backendabhängigem kanalübergreifendem Interleaving und `error?` (`CodeRunFailure`: orthogonales `kind` + modellgeeignete `message`). Die vollständigen Verträge stehen in `src/types.ts`.

### Portable Bezeichner

Namen für Binding-Globals und Error-Klassen sind sprachportabel: Sie müssen zur Bezeichner-Teilmenge `[A-Za-z_][A-Za-z0-9_]*` passen (kein JS-spezifisches `$`) und die von der Seam exportierten Ausschlussmengen passieren, sodass eine `bindings`-Liste gegen jedes Backend gültig ist. Das Paket exportiert den Vertrag, den jedes Backend durchsetzt — `PORTABLE_RESERVED_WORDS` (ECMAScript- ∪ Python-Reservierungen), `RESERVED_BINDING_GLOBALS` (backend-eigene Globals wie `console` und `__dsh_main__`), `RESERVED_ERROR_MEMBERS` und `DUNDER_MEMBER` (Error-Member-Ausschlüsse) —, sodass ein Name wie `$tools`, `lambda` oder `__dsh_main__` `run()` auf jedem Backend als Seam-Fehlgebrauch ablehnen lässt. Die genauen Mengen stehen in `src/index.ts`.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: abstrakter `CodeRuntime`-Service und die Ausschlussmengen für portable Bezeichner |
| [`src/types.ts`](src/types.ts) | Vokabular: `CodeRunRequest`, `CodeBindingNamespace`, `CodeJsonValue`, `CodeRunResult`, `CodeRunFailure` |
| — | Es wird kein Runtime-Invarianten-Begleiter publiziert; das Paket exponiert keine unabhängige Ereignissequenz oder veränderliche Datenrelation jenseits der an seiner eigenen Seam durchgesetzten Verträge. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen vom PTC-mode-Consumer zu den Backends und zum Capability-Seam-Modell.

- [PTC-mode-Agent-Note](../../../.agents/notes/implemented/feature/2026-06-15-ptc.de.md) — wie die Tool-Registry `ctx.codeRuntime` konsumiert und `run_code` dem Modell präsentiert.
- [Worker-Thread-Backend](../code-runtime-worker-thread/README.de.md) — das ausgelieferte TypeScript-Ausführungs-Backend.
- [Experimentelles Python-Backend](../../experimental/code-runtime-python/README.de.md) — der private CPython-Subprozess-Provider und sein fd-3-Protokoll.
- [Code-Runtime-Subsystem-Referenz](../../../docs/subsystems/code-runtime.de.md) — Anfrage-/Ergebnis-Vokabular, Bindings und die `ctx.codeRuntime`-Cordis-Oberfläche.
- [Capability Seams](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.de.md) — die Aufteilung in Service Definition / Service Provider / Consumer.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über den PTC mode in `dsh-tools`, der `run_code` exponiert und Programmlogs, -werte oder -fehler als aufbewahrte Tool-Ergebnis-Tokens zurückgibt.

#### KV-Cache-Effekt

Keine direkte Invalidierung; der genannte Consumer besitzt etwaige Änderungen am Request-Präfix.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was die Seam nicht kann; sie sind aktuelle Paket-Constraints, kein Aufgabenstapel.

- **`run()` ist one-shot** — `logs` kommen nur mit dem aufgelösten `CodeRunResult` an; die Seam bietet keine Streaming-Log- oder Fortschritts-API für die Ausgabe eines laufenden Programms.
- **Zwischen Ausführungen bleibt kein Zustand erhalten** — jede Anfrage läuft gegen eine frische Welt; ein persistenter REPL-artiger Kernel bleibt zurückgestellt, bis ein Backend eine eigene Logging-Lösung mitbringt.
- **Das Worker-Thread-Backend ist ausgeliefert; das Python-Prozess-Backend ist privat-experimentell; `'container'` hat keine Implementierung** — eine harte Sicherheitsgrenze wartet auf ein Container-Backend.
- **Zwischenwerte von Bindings haben kein Byte-Limit** — Implementierungen bleiben Structured-Clone-Kosten und Prozessspeicher unterworfen, während ein Provider oder Executor bereits eine eigene Acquisition-Grenze gesetzt haben kann.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: unentschiedene Richtungen und offene Fragen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten und Grenzen stehen in den Abschnitten oben und im Paketcode.

#### Zukunft: persistenter Kernel-Backend

Ein REPL-artiger Kernel, der Zustand über `run_code`-Aufrufe hinweg hält, bleibt unentschieden; er bräuchte eine eigene Logging-Lösung, denn der Vertrag „kein Zustand zwischen Ausführungen" ist es, der jede Anfrage allein aus dem Session-Log rekonstruierbar hält.

#### Zukunft: Container-Backend

Ein Backend der Container-Klasse würde eine harte Mandantengrenze für Code- und Shell-Ausführung bieten; über den bekannten `isolation`-Wert hinaus ist nichts entschieden.

</details>
