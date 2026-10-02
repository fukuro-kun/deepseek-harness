---
description: "Die Workflow-Orchestrierungs-Capability: ein vom Model geschriebenes Skript ausführen, das Subagents auffächert — für Benutzer und Maintainer, die ctx.workflowEngine wählen oder darauf aufbauen."
kind: "package-reference"
---

# @deepseek-ai/dsh-workflow

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Führe ein reines JavaScript-Orchestrierungsskript aus, das Arbeit an Subagents auffächert und den finalen JSON-Wert des Skripts zurückgibt. Skripte können `agent()`, `parallel()`, `pipeline()`, `phase()` und `log()` nutzen; Models greifen normalerweise über das `workflow`-Tool darauf zu. Jeder Run gehört seinem Aufrufer, attributiert jedes Kind auf den aufrufenden Agent, löst Fehler und Cancellation auf, ohne sein Result zu rejecten, und beendet die Disposal innerhalb einer begrenzten Karenzzeit. Der Aufrufer muss eine Execution-Engine liefern, sodass sich die Isolationsstrategie ändern kann, ohne das sichtbare Verhalten zu verändern.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Führe einen Workflow aus, wenn eine Aufgabe in viele unabhängige Teile zerfällt, die ein Skript koordinieren soll — ein Audit über viele Dateien, eine Migration, Recherche aus mehreren Blickwinkeln — und das Model ausdrücklich Workflow-artige Orchestrierung verlangt. Für ein bis zwei Delegationen bevorzuge einen schlichten Subagent-Call.

### Der model-zugewandte Pfad

Das Model erreicht die Capability über das `workflow`-Tool aus `dsh-tool-workflow`, das Call-Schema und Result-Envelope besitzt; die Engine liefert die Ausführung darunter. Ein Tool Call reicht `meta`, `script` und optionale `args` ein und gibt `{ runId, agentsStarted, result }` zurück, wenn der Run abschließt. Das Tool blockiert den Parent-Turn, bis der ganze Workflow settled; das Model sieht daher ein finales Ergebnis und nie Zwischennachrichten der Kinder.

### Ein Workflow-Skript ausführen

Ein Orchestrierungsskript ist ein reiner JavaScript-Body (kein TypeScript), der mit Top-Level-`await` läuft und mit `return <json-value>` endet. Der `meta`-Identitätsblock und etwaige `args` kommen als reine JSON-Daten an — nie als ausgewerteter Code. Während der Ausführung ruft das Skript die bereitgestellten Hooks: `agent(prompt, opts)` startet einen Subagent und resolved mit seinem finalen Text oder, mit einem Schema, einem validierten strukturierten Wert; `parallel()` und `pipeline()` kombinieren unabhängige Arbeit; `phase()` und `log()` erzählen den Fortschritt für Beobachter.

```text
// Script body — runs with top-level await, ends with a JSON return value:
const reviews = await parallel([
  () => agent('Review src/a.ts for correctness'),
  () => agent('Review src/b.ts for correctness'),
])
return { reviewed: reviews.length }
```

Wenn das Skript settled, resolved das Result des Runs mit dem Rückgabewert, dem Stop-Reason und der Zahl gestarteter Kinder. Ein Skript ohne Rückgabewert ergibt `null`.

### Programmatische Runs

Plugin-Consumer können einen Run direkt starten: `ctx.workflowEngine.start({ script, meta, args?, parent, signal? })`. `parent` attributiert jedes Kind auf den aufrufenden Agent; `signal` bricht den Run bei Abort ab. `start()` validiert den Meta-Block und parst das Skript, bevor ein Run existiert, sodass eine malformed Request sofort mit einer Verletzungsliste fehlschlägt.

Ein zurückgegebener Run stellt `id`, `meta`, `result`, `cancel(reason?)` und `dispose()` bereit. Das Result rejectet nie: Ein Skriptfehler resolved mit `stopReason: 'error'`, ein Abbruch mit `'cancelled'`. Der Aufrufer besitzt den Run — rufe auf jedem Pfad `dispose()` auf; es bricht verbleibende Arbeit ab und wartet innerhalb einer begrenzten Karenzzeit, bis Skript und Kinder settlen.

### Fehler und Wiederherstellung

Ein Skript, das nicht parst, ein malformed Meta-Block, eine unverfügbare Provider-Route oder ein nicht unterstütztes Per-Run-Limit werden synchron abgelehnt, bevor ein Run existiert; das `workflow`-Tool meldet sie als Fehler, aus denen das Model korrigieren kann. Während der Ausführung tötet Hook-Missbrauch — falsche Argumente, unbekannte Optionen, nicht unterstützte Schemas, gerissene Obergrenzen — das Skript laut, statt in ein Per-Item-`null` zu zerfließen. Ein gewöhnlicher Kind-Fehler ist kein Infrastrukturfehler: `agent()` resolved `null`, und das Skript entscheidet, wie es damit umgeht.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie die Capability aufgeteilt ist und wo die Contracts liegen; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Das Paket trennt die Skript-, Run-, Result- und Event-Contracts von der Ausführung: Jede Engine kann `ctx.workflowEngine` hinter demselben Vokabular implementieren, und eine Engine bedient jeweils einen Context — das Laden einer zweiten Engine schlägt laut fehl; Engines zu tauschen heißt also, das von der Composition geladene Engine-Plugin zu ändern. Die `workflow/*`-Events sind nur zum Beobachten: Payloads tragen Run-Identitäts-Snapshots, nie den lebenden Run, sodass Listener keine Cancellation- oder Disposal-Autorität erlangen können.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Service-Definition, `workflow/*`-Event-Deklarationen, `WorkflowError` und sein Fatal-Flag |
| [`src/types.ts`](src/types.ts) | Browser-sicheres Vokabular: `WorkflowMeta`, `WorkflowResult`, Run- und Agent-Event-Infos |
| [`src/runtime-types.ts`](src/runtime-types.ts) | Host-only `WorkflowStartRequest`- und `WorkflowRun`-Handles |
| [`src/invariant.ts`](src/invariant.ts) | Invariant-Companion: Event-Pairing- und Identitäts-Checks |

### Lifecycle und Ownership

Ein Run ist halter-eigen: Das Entladen des Engine-Plugins verhindert neue Starts, widerruft aber akzeptierte Runs nicht, und der Aufrufer muss jeden gestarteten Run disposen. `dispose()` bricht bei Bedarf ab und wartet auf Skript- und Kind-Quiescence innerhalb der dokumentierten Grenze der Engine, sodass ein Consumer, der `result` erwartet, nie jenseits einer Cancellation hängt.

`workflow/start` und `workflow/end` paaren den Run; `workflow/phase` und `workflow/log` tragen die Skript-Erzählung; `workflow/agent-start` und `workflow/agent-end` paaren jeden Kind-Call über `seq`. Jeder Listener ist unabhängig eingegrenzt: Ein werfender Listener wird geloggt, ohne Peers auszuhungern oder die Ausführung zu ändern, und jeder erhält seinen eigenen Payload-Klon.

### Fehlerdisziplin

`WorkflowError` trägt einen maschinell routbaren Code und ein `fatal`-Flag; jeder Code ist fatal, und `parallel()` sowie `pipeline()` werfen fatale Fehler erneut, statt das Item auf `null` zu mappen — eine falsch geschriebene Option muss das Skript laut töten. Die Codes decken Start-Fehler, Contract-Verletzungen, überschrittene Obergrenzen, Provider- und Result-Fehler, nicht serialisierbare Werte und Cancellation ab; die genaue Menge und ihre Bedeutungen stehen in [`src/index.ts`](src/index.ts).

Das Per-Item-`null` ist Kind-Run-Fehlern und gewöhnlichen Skriptfehlern innerhalb einer Stage vorbehalten; ein Kind, das normal mit einem nicht abgeschlossenen Stop-Reason settlet, ist daher keine Infrastruktur-Ausnahme: `agent()` gibt `null` zurück und lässt das Skript einen gewöhnlichen Kind-Fehler behandeln.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Contract nicht ausreicht. Sie führen vom gemeinsamen Workflow-Modell zur aktuellen Engine und den model-zugewandten Consumern.

- [Workflow-Subsystem](../../../docs/subsystems/workflow.de.md) — das vollständige Typ-Vokabular, Start-Request und Event-Payloads.
- [Gruppenkarte](../README.de.md) — die Workflow-Capability-Familie und ihre Pakete.
- [workflow-Tool](../tool-workflow/README.de.md) — der model-zugewandte Consumer, der Call-Schema und Result-Envelope besitzt.
- [Worker-Thread-Engine](../workflow-worker-thread/README.de.md) — die aktuelle Execution-Engine und ihre Isolationsgrenze.
- [Dynamic-Workflows-Agent-Note](../../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.de.md) — das Seam-Design und seine Entscheidungen.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über den Consumer `dsh-tool-workflow` und eine Workflow-Engine, die das Parent-Tool-Result und die Kind-Agent-Requests rendern.

#### KV-Cache-Effekt

Keine direkte Invalidierung; der genannte Consumer und die Engine besitzen alle Änderungen am Request-Präfix.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was die Capability noch nicht unterstützt. Sie sind aktuelle Constraints, kein Aufgabenstapel.

- **Nur Foreground-Collection** — der Aufrufer besitzt einen lebenden Run und erwartet ihn; Background-Start/Poll, Spill-Handles und detached Collection sind zurückgestellt.
- **Kein Journaling oder Resume** — Skripte, Kind-Fortschritt und Zwischenwerte werden nicht als Checkpoints festgehalten, sodass ein Prozess-Neustart einen Run nicht fortsetzen kann.
- **Keine gespeicherten oder verschachtelten Workflows** — die Capability startet nur vom Aufrufer gelieferte Skripte, und ein Workflow-Skript erhält keinen `workflow()`-Hook für rekursive Orchestrierung.
- **Kein Token-Budget-Vokabular** — Engines begrenzen Concurrency, Items und Kinder, aber weder Request noch Result rechnen Model-Tokens über Kinder hinweg.
- **Runs sind halter-eigen, nicht service-getrackt** — das Entladen der Engine entdeckt keine unabhängigen lebenden Handles; jeder Consumer muss den Run disposen, den er gestartet hat.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene, unentschiedene Richtungen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen liegen in den Abschnitten oben, im Paket-Code und den verlinkten Agent Notes.

Zurückgestellte Richtungen: eine Background-Start/Poll-API mit Spill-Handles und detached Collection; gespeicherte und verschachtelte Workflows; ein Token-Budget-Vokabular über Kinder hinweg; und das Versprechen des Seams, dass eine zukünftige Prozess- oder Sandbox-Engine die Worker-Thread-Engine ersetzen kann, ohne die model-zugewandte Oberfläche zu ändern.

</details>
