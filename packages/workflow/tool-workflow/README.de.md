---
description: "Das modellseitige Workflow-Tool: führt ein JavaScript-Orchestrierungsskript aus, das Subagents auffächert — für Benutzer und Maintainer, die modellgesteuerte Orchestrierung auswählen oder konfigurieren."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-workflow

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-tool-workflow` lässt ein Modell ein JavaScript-Orchestrierungsskript ausführen, das Arbeit an viele Subagents delegiert und den finalen JSON-Wert des Skripts zurückgibt. Nur verwenden, wenn der Benutzer ausdrücklich einen Workflow oder eine große Multi-Agent-Orchestrierung anfordert; für eine oder zwei Delegationen normale Subagent-Aufrufe verwenden. Der übergeordnete Turn wartet, bis jede delegierte Aufgabe abgeschlossen ist; Abbruch oder abnormaler Abschluss liefern einen Fehler statt eines Teilerfolgs. Deployments können das Tool über `toolName` umbenennen und den gerenderten Ergebnistext über `maxResultChars` begrenzen.

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

Das `workflow`-Tool führt ein vom Modell verfasstes Orchestrierungsskript aus, das Arbeit auf viele Subagents auffächert und den finalen JSON-Wert des Skripts zurückgibt. Nur verwenden, wenn der Benutzer ausdrücklich einen Workflow oder eine große Multi-Agent-Orchestrierung anfordert — etwa ein Audit über viele Dateien, eine Migration, Recherche aus mehreren Blickwinkeln; für eine oder zwei Delegationen normale Subagent-Aufrufe bevorzugen.

### Das Tool aufrufen

Das Modell übermittelt drei Parameter: `meta` (erforderliche Identitätsdaten: `name`, `description` sowie optionale `whenToUse` und `phases`), `script` (erforderlicher reiner JavaScript-Rumpf — ohne `export const meta`-Anweisung; die Tool-Beschreibung trägt den vollständigen Authoring-Vertrag) und `args` (optionales JSON-Objekt, das dem Skript als globales `args` bereitgestellt wird; eine nackte Liste in ein Feld verpacken, damit das Schema das Format wahrheitsgemäß abbildet).

Bei Erfolg wird die kanonische Hülle `{ runId, agentsStarted, result }` zurückgegeben, dem Modell gerendert als `workflow "<name>" completed (<count> agent<optional-s>).`, gefolgt von `Return value:` und dem formatiert ausgegebenen JSON. Ein Workflow, der nicht starten kann — ein Skript-Parse- oder Meta-Validierungsfehler — liefert einen Fehler, den das Modell korrigieren kann. Abbruch und Ausführungsfehler liefern `Error: workflow run was cancelled` oder `Error: workflow run failed: <error>`; Teilausgabe wird nie als Erfolg gemeldet.

### Was während eines Laufs zu erwarten ist

Während das Skript läuft, wartet der übergeordnete Turn: Das Tool startet den Lauf, wartet auf sein Ergebnis und disposed ihn immer, sodass das Skript und seine Kinder auf jedem Pfad vollständig zur Ruhe kommen — einschließlich Abbruch, der vom Abort-Signal des übergeordneten Schritts überbrückt wird. Das Modell sieht ein finales Ergebnis, niemals Zwischenmeldungen der Kinder; die eigene Arbeit der Kinder bleibt außerhalb der übergeordneten Konversation.

### Konfiguration

| Feld | Standard | Bedeutung |
|---|---|---|
| `toolName` | `workflow` | Der zu registrierende modellseitige Tool-Name. |
| `maxResultChars` | `50000` | Obergrenze für gerenderte Ergebnisse; längeres JSON wird mit einem Hinweis gekürzt. |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-workflow) ist die erschöpfende Quelle für jedes akzeptierte Feld.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie der Consumer von der Engine getrennt ist und wie Lauf-Lebenszyklus und Aufzeichnungen funktionieren; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Der Consumer besitzt das modellseitige Schema, die `tool:<toolName>`-Systemprompt-Anleitung und die Ergebnishülle; Skript-Parsing, Ausführung, Obergrenzen und Abbruch liegen hinter `ctx.workflowEngine`, sodass eine gehärtete Engine eingewechselt werden kann, ohne zu ändern, was das Modell sieht. Die Nutzungsanleitung wird mit dem Tool-Plugin als Prompt-Abschnitt ausgeliefert, niemals in der Deployment-Persona.

### Lauf-Lebenszyklus

`execute` startet den Lauf und wartet auf `run.result` in einem `try/finally`, das den Lauf immer disposed. `exec.signal` wird auf `run.cancel()` überbrückt, einschließlich des Falls, dass bereits vor dem Start abgebrochen wurde. Ein nicht-`completed` Stop-Grund wird auf ein `isError`-Ergebnis abgebildet, das den Grund meldet; bei Abschluss wird `{ runId, agentsStarted, result }` gerendert, wobei der Native-Renderer nur diese Projektion bei `maxResultChars` kürzt.

### Persistente Session-Aufzeichnungen

Bei einer Root-Transport-Ausführung (`exec.parent` nicht vorhanden) projiziert das Tool den Lauf mit vier Log-only-Events in die Session des aufrufenden Agent: run-start nach der Rückkehr von `start()`, Member-Starts und -Enden gefiltert nach `run.id`, dann run-end erst nachdem das Ergebnis verfügbar ist und das Dispose vollständig zur Ruhe gekommen ist. Verschachtelte Transport-Aufrufe laufen normal, schreiben aber keine Aufzeichnung. Der erste fehlgeschlagene Session-Append deaktiviert die weitere Aufzeichnung für diesen Lauf mit einer Warnung und hinterlässt entweder keine Aufzeichnung oder ein zulässiges kontinuierliches Präfix, ohne Tool-Ergebnis oder Aufräumarbeiten zu ändern. Das Paket-Invariant lehnt doppelte Starts, ungepaarte Member, Terminalevents mit offenen Membern und Updates nach run-end sowohl bei Cold Load als auch bei Live-Append ab, akzeptiert dagegen fehlende Terminal-Suffixe.

### Render-Intent

Vornherein festgelegt gemäß dem [Render-Intent Agent Note](../../../.agents/notes/implemented/architecture/2026-07-02-tool-render-intent-union.de.md): eine `generic`-Karte mit Titel `workflow: <meta.name>`, direkt aus `args.meta.name` gelesen — die Darstellung ist eine reine Funktion der Args —, wobei der Skripttext als `rawInput` mitgeführt wird. Das Ergebnis behält die generische Karte.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Tool-Registrierung, Lauf-Lebenszyklus, Recorder-Verdrahtung |
| [`src/types.ts`](src/types.ts) | Die vier Log-only-Aufzeichnungs-Event-Payloads und ihre `SessionEventMap`-Deklaration |
| [`src/invariant.ts`](src/invariant.ts) | Invariant-Begleiter: Validierung des persistenten Workflow-Aufzeichnungsprotokolls |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der Tool-Vertrag nicht ausreicht. Sie führen vom gemeinsamen Workflow-Modell zur Engine und zum vergleichbaren Delegations-Tool.

- [Workflow-Subsystem](../../../docs/subsystems/workflow.de.md) — der Seam-Vertrag, die Startanfrage und die Event-Payloads.
- [Workflow-Seam](../workflow/README.de.md) — das Lauf- und Ergebnisvokabular hinter dem Tool.
- [Worker-Thread-Engine](../workflow-worker-thread/README.de.md) — die Engine, die die Skripte ausführt.
- [Subagent-Tool](../../subagent/tool-subagent/README.de.md) — die Alternative mit einfacher Delegation für ein oder zwei Kinder.
- [Gruppenkarte](../README.de.md) — die Workflow-Capability-Familie und ihre Pakete.
- [Dynamic-Workflows Agent Note](../../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.de.md) — das Seam-Design und seine Entscheidungen.

-----

<a id="model-experience"></a>
## Model Experience

### Systemprompt

#### Was das Modell sieht

Jede übergeordnete Anfrage im Registrierungsbereich dieses Plugins erhält die folgende Workflow-Anleitung. Eine bereichsbezogene Tool-Einschränkung kann das Schema verbergen, ohne diese unabhängig registrierte Anleitung zu entfernen.

##### Workflow-Anleitung

```markdown
Use the <toolName> tool ONLY when the user explicitly asks for a workflow or for large multi-agent orchestration: you write a JavaScript script (the tool description documents the exact format) that fans work out across many subagents with phases and structured results. For one or two delegations, prefer plain subagent calls.
```

#### Token-Effekt

Kleine feste Anleitungskosten pro Anfrage, solange das Plugin aktiv ist.

#### KV-Cache-Effekt

Präfix-stabil, solange Plugin-Bereich und Anleitungstext unverändert sind. Aktivierung oder Dispose kann die Wiederverwendung ab diesem Prompt-Abschnitt ungültig machen.

### Tool-Schema

#### Was das Modell sieht

Wenn sichtbar, trägt das generierte Standard-[`workflow`-Schema](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-workflow) den vollständigen JavaScript-Hook- und Metadaten-Vertrag; `toolName` kann die Definition umbenennen, und das Modell übermittelt Skript, Metadaten und optionale Args.

#### Token-Effekt

Erhebliche feste Schema-Kosten bei jeder Anfrage, bei der das Tool sichtbar ist.

#### KV-Cache-Effekt

Präfix-stabil, solange `toolName`, Definition und Sichtbarkeit unverändert sind. Umbenennung, Plugin-Lebenszyklus oder bereichsbezogene Einschränkungen können die Wiederverwendung ab diesem Schema ungültig machen.

### Tool-Call-Verlauf und Ergebnis

#### Was das Modell sieht

Das vollständige modellverfasste Skript, die Metadaten und Args bleiben im Assistant-Tool-Call erhalten. Erfolg ist exakt `workflow "<name>" completed (<count> agent<optional-s>).`, Zeilenumbruch, `Return value:`, Zeilenumbruch und formatiert ausgegebenes datenabhängiges JSON; bei der Obergrenze wird `… [truncated: <omitted> more characters]` auf einer neuen Zeile angehängt. Fehler sind exakt `Error: workflow run was cancelled`, optional mit Suffix ` (<error>)`, `Error: workflow run failed: <error-or-unknown error>` oder defensiv `Error: workflow run ended abnormally (<reason>)`; ein Aufruf ohne zugehörigen Agent wird zu `Error: workflow tool requires a calling agent (exec.agent was undefined)`. Zwischenmeldungen der Kinder werden weggelassen.

#### Token-Effekt

Call-Token können groß sein und bleiben bis zur Compaction erhalten. Das Ergebnis-Rendering ist durch `maxResultChars` begrenzt; Kind-Modell-Token sind vom übergeordneten erhaltenen Kontext getrennt.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt auf das wiederverwendbare Anfrage-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was das Tool noch nicht unterstützt. Sie sind aktuelle Einschränkungen, kein Aufgabenrückstand.

- **Der übergeordnete Turn blockiert, bis der gesamte Workflow abgerechnet ist** — es gibt keine Hintergrund-Start-/Poll-API, und Abbruch verwirft Teilausgabe als Fehler.
- **`args` muss ein Objekt sein und der Native-Ergebnistext ist begrenzt** — Aufrufer verpacken Top-Level-Arrays und Skalare in ein Feld; das kanonische Workflow-Ergebnis bleibt vollständig, während JSON jenseits von `maxResultChars` in der modellseitigen Projektion gekürzt wird statt hinter einem Abruf-Handle gespeichert zu werden.
- **Workflow-Policy ist pro Tool-Registrierung fest** — Provider-Auswahl, Obergrenzen und Tool-Name sind Deployment-Konfiguration, keine Modellaufruf-Argumente.
- **Persistente Aufzeichnungen sind Top-Level und rein beobachtend** — verschachtelte PTC-Modus-Dispatches werden nicht aufgezeichnet, und ein Aufzeichnungsfehler degradiert absichtlich zu einem unvollständigen Präfix, statt die Ausführung zu ändern.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Richtungen, die nicht entschieden sind. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen stehen in den Abschnitten oben, dem Paketcode und den verlinkten Agent Notes.

Offene Richtungen: eine Hintergrund-Start-/Poll-Route, damit der übergeordnete Turn nicht blockiert; gekürztes JSON hinter einem Abruf-Handle speichern statt die Projektion zu beschneiden; verschachtelte Dispatches jenseits der Top-Ebene aufzeichnen.

</details>
