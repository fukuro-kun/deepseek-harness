---
description: "Das modellseitige ralph-Tool: eine feste Vordergrundschleife frischer agents auf ein unveränderliches Ziel hin, für Benutzer und Maintainer, die Fresh-agent-Iteration wählen oder konfigurieren."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-ralph

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`ralph` führt eine Vordergrundsequenz frischer Child-agents auf ein unveränderliches Ziel hin aus, wobei jede Round nur den vorherigen begrenzten Bericht und den gemeinsamen Workspace-Zustand erhält. Es kehrt zurück, wenn ein worker Abschluss oder einen konkreten Blocker meldet oder wenn das konfigurierte Round-Limit erreicht ist; diese Berichte werden nicht unabhängig verifiziert. Elternkonversation und frühere Child-Sessions werden niemals in eine neue Round kopiert. Verwenden Sie es nur, wenn der direkte Mensch ausdrücklich Ralph-artige Fresh-agent-Iteration anfordert; für gewöhnliche langlaufende Arbeit nutzen Sie goal-Tools und für begrenzte Delegation subagents oder Workflows.

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

Das `ralph`-Tool führt eine feste Vordergrundschleife aus: pro Round arbeitet ein frischer Child im gemeinsamen Workspace am unveränderlichen Ziel, und nur ein begrenzter strukturierter Bericht überschreitet Rounds. Verwenden Sie es nur, wenn der direkte Mensch ausdrücklich eine Ralph-Schleife oder Fresh-agent-Iteration anfordert. Für gewöhnliche langlaufende Arbeit in derselben Session nutzen Sie goal-Tools; für begrenzte Delegation und Fan-out normale subagents oder das `workflow`-Tool.

### Das Tool aufrufen

Das Modell reicht `{ objective, maxRounds? }` ein, und der Aufruf blockiert, bis der gesamte Lauf abgerechnet ist. Das `maxRounds` der Deployment-Konfiguration ist sowohl Standard als auch Obergrenze für einen Aufruf-Override. Das terminale Ergebnis ist `complete`, `blocked` oder `budget-limited` und trägt den letzten begrenzten Bericht sowie die Anzahl gestarteter Rounds; ein gewöhnlicher Child-Fehler gibt einen Fehler zurück, der die fehlgeschlagene Round nennt und, falls vorhanden, das letzte erfolgreiche Handoff bewahrt.

### Was jede Round sieht

Jeder Child erhält nur das unveränderliche Ziel, seine aktuelle Round und deren Obergrenze, eine "Shared-Workspace-ist-autoritativ"-Anweisung und das vorherige strukturierte Handoff; Elternkonversation und frühere Child-Sessions werden nie als Seed eingespeist. Der Workspace ist das Langzeitgedächtnis über Rounds hinweg. Berichte tragen einen Status (`continue`, `complete` oder `blocked`), eine nichtleere Zusammenfassung, Evidenz, nächste Schritte und Blockertext; ungültige oder übergroße Berichte lassen den workflow fehlschlagen, statt gekürzt oder als Erschöpfung der Obergrenze missverstanden zu werden.

### Konfiguration

| Feld | Standard | Bedeutung |
|---|---|---|
| `subagentProvider` | `spawn` | Frischer Structured-Output-Provider, der für jede Round verwendet wird. |
| `maxRounds` | `256` | Standard und Deployment-Obergrenze für einen Ralph-Lauf. |
| `maxHandoffChars` | `16384` | Maximale serialisierte Zeichen in einem Round-Bericht. |
| `maxResultChars` | `16384` | Maximale Zeichen im vollständigen erfolgreichen Elternergebnis. |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-ralph) ist die erschöpfende Quelle für jedes akzeptierte Feld. Der konfigurierte Provider muss existieren, strukturierte Ausgabe unterstützen und `inheritsParentContext: false` melden; ein Aufruf gegen einen Provider, der dies verletzt, schlägt laut fehl, bevor irgendeine Round beginnt.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Fixed-Script-Design sowie die Validierungs- und Lebenszyklusmechanik; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) behandelt.

### Designkonzept

Die Schleife ist ein deploymentseitig festes Skript: das Modell liefert nur Daten und kann weder Schleife, Provider-Route, schema noch Handoff-Validierung ändern. Das Tool ist ein gewöhnliches Plugin über `ctx.workflowEngine` und `ctx.subagents` — es wird kein Ralph-Modus oder Fresh-agent-loop zu `agent-loop` hinzugefügt, und die Goal-Domäne derselben Session bleibt unabhängig. Die [Agent Note zur harnessweiten zielbasierten Ausführung](../../../.agents/notes/implemented/feature/2026-07-16-harness-level-loop.de.md) besitzt die Policy und die zurückgestellten Arbeiten.

### Festes Skript und Routing

Der konfigurierte Provider wird als `WorkflowStartRequest.subagentProvider` übergeben, sodass das feste Skript das Routing weder einsehen noch ändern kann und das gewöhnliche modellgeschriebene `workflow`-Tool keinen Provider-Selektor erhält. Die aufgelöste Round-Obergrenze wird als `WorkflowStartRequest.maxTotalAgents` übergeben und koordiniert so die feste Schleife mit der Gesamt-Child-Absicherung der Engine; bei einer Obergrenze über der Deployment-Grenze der Engine lehnt diese vor dem Veröffentlichen eines Laufs ab.

### Berichtsvalidierung

Statusspezifische Semantik und die serialisierte `maxHandoffChars`-Obergrenze werden innerhalb des festen workflow und erneut an der Consumer-Grenze validiert: ein Fortsetzungsbericht braucht nächste Schritte und einen leeren Blocker, ein Abschlussbericht braucht Evidenz und keine nächsten Schritte, und ein Blockerbericht braucht einen konkreten Blocker. Ungültige, fehlende oder übergroße Berichte lassen den workflow fehlschlagen.

### Lebenszyklus und Cancellation

Der agent des Aufrufers ist der Elternteil jedes frischen Child, wodurch cwd und Abstammung erhalten bleiben, ohne dessen Konversation zu kopieren. `exec.signal` gelangt in die Workflow-Engine und wird zusätzlich auf `run.cancel()` gebrückt, um implementierungsunabhängig zu bleiben. Das Tool wartet auf `run.result` und ruft `run.dispose()` in `finally` auf, sodass ein gecancelter Elternschritt auf die begrenzte Terminierung der Engine und die Quiescence der Children wartet, bevor er zurückkehrt.

### Render-Intent

Der ausstehende Aufruf ist eine `generic`-Karte mit dem Titel `ralph` und dem unveränderlichen Ziel als `rawInput`; das Ergebnis behält die generische Karte. Beide Darstellungsfunktionen hängen nur von den Tool-Argumenten und der abgerechneten Tool-Hülle ab, und die Abschluss- und Blocker-Labels geben an, dass ein worker das Ergebnis gemeldet hat, nicht eine unabhängige Beglaubigung.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: festes Skript, Provider-Routing, Berichtsvalidierung, Tool-Registrierung |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; dieser modellseitige Orchestrierungs-adapter besitzt keinen eigenen event stream; workflow- und subagent-Eigentümer validieren die gestarteten Läufe und Child-Lebenszyklen. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Tool-Vertrag nicht ausreicht. Sie führen vom gemeinsamen Workflow-Modell zur Engine, zum subagent-seam und zur benachbarten Goal-Domäne.

- [Workflow-Subsystem](../../../docs/subsystems/workflow.de.md) — der seam-Vertrag hinter der festen Schleife.
- [Workflow-seam](../workflow/README.de.md) — das Run- und Ergebnisvokabular.
- [Worker-Thread-Engine](../workflow-worker-thread/README.de.md) — die Engine, die das feste Skript ausführt.
- [subagent-seam](../../subagent/subagent/README.de.md) — der Providervertrag für frische Children.
- [Goal-Gruppe](../../goal/goal/README.de.md) — goal-Tools derselben Session für gewöhnliche langlaufende Ziele.
- [Agent Note zur harnessweiten zielbasierten Ausführung](../../../.agents/notes/implemented/feature/2026-07-16-harness-level-loop.de.md) — die Policy, Provider-Anforderungen und zurückgestellten Arbeiten.

-----

<a id="model-experience"></a>
## Model Experience

### System prompt

#### Was das Modell sieht

Jede Elternanfrage im Registrierungs-Scope dieses Plugins erhält die untenstehende feste Routing-Anleitung.

##### Ralph-Anleitung

```markdown
Use the ralph tool ONLY when the direct human explicitly asks for a Ralph loop or fresh-agent iterative execution. Each Ralph round starts a fresh child with no conversation seed and uses the shared workspace as durable memory. Completion and blockers are worker reports, not independent evaluation. Use same-session goal tools for ordinary long-running objectives, and plain subagents or workflows for bounded delegation and fan-out.
```

#### Token-Effekt

Kleine feste Anleitungskosten pro Anfrage, solange das Plugin aktiv ist.

#### KV-Cache-Effekt

Präfixstabil, solange Plugin-Scope und Anleitungstext unverändert sind. Aktivierung oder dispose kann die Wiederverwendung ab diesem Prompt-Abschnitt ungültig machen.

### Tool schema

#### Was das Modell sieht

Das generierte [`ralph`-Schema](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-ralph) legt einen erforderlichen `objective`-String und eine optionale `maxRounds`-Zahl offen. Provider-Wahl, Handoff-Größe, Berichtsschema, Workflow-Skript und Orchestrierungsverhalten sind deploymentseitig und fehlen im Aufrufschema.

#### Token-Effekt

Kleine feste Schema-Kosten bei jeder Anfrage, bei der das Tool sichtbar ist.

#### KV-Cache-Effekt

Präfixstabil, solange Definition und Sichtbarkeit unverändert sind.

### Child-Anfragen und Elternergebnis

#### Was das Modell sieht

Jeder Child sieht den eigenständigen festen Round-Prompt plus den Structured-Output-Erfassungsvertrag. Der Elternteil sieht nur den ursprünglichen Aufruf und ein terminales Ergebnis mit einem von einem worker gemeldeten Status, der Round-Anzahl und dem hübsch gedruckten Abschlussbericht; Zwischennachrichten und -berichte der Children gelangen nicht in die Elternkonversation. Ein fehlgeschlagener gewöhnlicher Child ergibt stattdessen einen Fehler mit seiner Round-Nummer und, ab Round eins, dem letzten erfolgreichen Handoff.

#### Token-Effekt

Jede Round zahlt für einen frischen Child-Kontext. `maxHandoffChars` begrenzt den Round-übergreifenden Zustand und `maxResultChars` begrenzt unabhängig den vollständigen erfolgreichen Elterntext; Child-Arbeit bleibt außerhalb des Elternkontexts.

#### KV-Cache-Effekt

Jeder frische Child hat einen unabhängigen Anfragecache. Das Elternergebnis wird hinter dem wiederverwendbaren Anfragepräfix angehängt.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was das Tool noch nicht unterstützt. Sie sind aktuelle Beschränkungen, kein Aufgabenrückstand.

- **Abschluss ist Selbstaussage des worker** — es gibt keinen unabhängigen Evaluator oder Verifier, der entscheidet, ob das Ziel erreicht ist; Evaluator-Policy und evaluator-gesteuerte Fortsetzung sind zurückgestellt.
- **Nur Vordergrund** — es gibt keine job id, keine Hintergrundsammlung, keinen Process-Resume-checkpoint, keinen Scheduler und keine Wall-Clock-Startpolicy.
- **Der Workspace ist das einzige Round-übergreifende Langzeitgedächtnis** — ein begrenzter Bericht ist das explizite Handoff, und nicht committertes konversationelles Reasoning verschwindet mit jedem Child.
- **Eine Round ist ein frischer Child** — es gibt kein Fan-out innerhalb der Round, keinen Modell- oder Provider-Wechsel, keinen fork-Kontext und keine vom Modellaufruf gewählte Provider.
- **Gewöhnliches Child-Versagen ist terminal für den Lauf** — das feste Skript meldet die fehlgeschlagene Round und das letzte erfolgreiche Handoff, versucht es aber nicht erneut; fatale Workflow-Infrastrukturfehler können enden, bevor dieser Zustand zurückgegeben wird.
- **Nur die Round-Anzahl begrenzt den Gesamtaufwand** — Token-, Preis- und Laufzeitbudgets sind zurückgestellt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Richtungen, die nicht entschieden sind. Sie ist ausdrücklich nicht autoritativ — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen stehen in den Abschnitten oben, im Paketcode und in den verlinkten Agent Notes.

Offene Richtungen: ein unabhängiger Evaluator mit evaluator-gesteuerter Fortsetzung; Fan-out innerhalb der Round und Provider-Auswahl; sowie Token-, Preis- und Laufzeitbudgets jenseits der Round-Obergrenze.

</details>
