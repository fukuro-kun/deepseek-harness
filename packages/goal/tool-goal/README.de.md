---
description: "Die modellzugewandten Goal-Tools für Benutzer und Maintainer, die get_goal, create_goal und update_goal auswählen, komponieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-goal

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-tool-goal` lässt ein Modell persistierte Goals lesen sowie ein langlaufendes Goal aus einer direkten menschlichen Anfrage ableiten und erstellen. Erstellen, Bearbeiten, Pausieren oder Fortsetzen erfordert diese direkte Anfrage in einer Top-Level-Agent-Turn; Abschließen oder Blockieren funktioniert auch in einem autonomen Goal Round. Updates erfordern die exakte Goal-Id und Revision, die ein vorheriges Lesen zurückgab. `resume` rüstet aktive, aber entschärfte oder blockierte Goals wieder scharf, während Benutzer dauerhaft pausierte Goals über Web oder `/goal resume` fortsetzen. Autonomes Blockieren erfordert dieselbe Bedingung für einen konfigurierbaren Schwellenwert, standardmäßig drei aufeinanderfolgende Rounds.

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

Mounte `dsh-tool-goal` neben dem Goal-Service, wenn das Modell persistierte Goals selbst erstellen und aktualisieren soll. Die Tools sind die modellzugewandte Hälfte der Goal-Oberfläche; der `/goal`-Befehl ist die menschenzugewandte Hälfte, und der Continuation-Driver nutzt dieselben Tools, um Goals am Ende autonomer Rounds abzuschließen oder zu blockieren.

### Tools

Alle drei Tools geben dasselbe kompakte JSON zurück — `{ goal: null }`, wenn kein Goal aktuell ist, sonst die Goal-Id, Revision, das Objective, Phase, gestartete Rounds, Round-Obergrenze, optionaler Blocker-Grund und ob Continuation scharf ist — entsprechend dem, was Native-Aufrufer bereits rendern.

| Tool | Was es tut |
|---|---|
| `get_goal()` | Liest das aktuelle Goal, oder `null`, wenn keins aktuell ist |
| `create_goal(objective, max_goal_rounds?)` | Erstellt ein Goal aus einer direkten menschlichen Top-Level-Turn |
| `update_goal(goal_id, revision, action, objective?, max_goal_rounds?, blocked_reason?)` | `edit`, `pause`, `resume`, `complete` oder `blocked` auf der exakten Goal-Revision |

Rufe `get_goal` vor `update_goal` auf und kopiere die exakten `goal_id` und `revision`; alle Aufrufe sind exklusiv, sodass ein vom Modell geordneter Batch frühere Mutationen und deren neue Revisionen beobachtet. Ersetzungen gehören nur zu `edit`; `blocked_reason` ist nur bei `blocked` erforderlich und wird mit dem stabilen Code `model-reported` persistiert. Leerstring- und Null-Füller unter striktem Schema gelten als ausgelassen, während sinnvolle Werte auf ihre Action beschränkt bleiben.

### Konfiguration

```yaml
- id: tool-goal
  name: '@deepseek-ai/dsh-tool-goal'
  config:
    blockedAfterConsecutiveRounds: 3
```

Der Wert muss eine positive sichere Ganzzahl sein. Er liefert sowohl die harte Untergrenze für das Selbst-Blockieren des Modells als auch die in der Modellanleitung genannte Zahl. Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-goal) ist die erschöpfende Quelle für jedes akzeptierte Feld.

### Autoritätsregeln

Die Tools führen nur für den exakten live aufrufenden Agent innerhalb seines aktiven Drivers mit offener Turn aus. `create`, `edit`, `pause` und `resume` erfordern zusätzlich eine direkte menschliche Nachricht in der aktuellen Turn eines Runtime-Root-Agents — ein Subagent oder ein nicht-menschlicher Produzent kann keine Goals erstellen oder bearbeiten. `resume` lehnt ein dauerhaft pausiertes Goal ab, bevor der Goal-Service läuft; dieser Zustand gehört dem nutzerseitigen Resume-Pfad. `complete` und `blocked` akzeptieren außerdem das exakt aktuelle Goal Round: Ein Goal-basierter Round darf das Goal sofort abschließen, aber ein Block-Aufruf wird mechanisch abgelehnt, bis die konfigurierte Anzahl aufeinanderfolgender Rounds vergangen ist — das Modell beurteilt, ob dieselbe Bedingung tatsächlich fortbestand, und muss sie in `blocked_reason` beschreiben. Eine direkte menschliche Anfrage darf ein Goal sofort stoppen.

Ein autonomer Round, der `complete` oder `blocked` erfolgreich meldet, beendet außerdem die physische Turn nach diesem Schritt, und das Modell erhält eine Abschlussanweisung, die finale Nachricht an den Benutzer zu schreiben. Direkt-menschliche Mutationen lösen diesen Stopp nie aus: Der Assistant kann die Änderung bestätigen, und der Loop hält paralleles menschliches Steering verfügbar.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie die Tools Autorität durchsetzen und Ausgabe rendern; der beobachtbare Contract ist in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Design

- **Autorität zur Ausführungszeit.** Jeder Aufruf löst den exakten live Agent, seinen geerbten `AgentRegistry`-Initiator, Running-Status und eine offene Turn auf; `create`, `edit`, `pause` und `resume` erfordern zusätzlich eine akzeptierte `{ kind: 'user' }`-Nachricht oder ein Steering-Event in der aktuellen Turn eines Runtime-Root-Agents. Ein dauerhaft pausiertes Goal lässt die `resume`-Action mit `GOAL_TOOL_RESUME_PAUSED` fehlschlagen; der nutzerseitige Befehl oder das Web-Control besitzt diesen Übergang. Dauerhafte Fork-Herkunft stuft eine wiederaufgesetzte Root nicht herab; live Subagent-Ownership tut es.
- **Host-Bescheinigung menschlicher Eingabe.** `{ kind: 'user' }` wird von `Agent.followup()` und `steer()` vergeben, wenn deren Aufrufer eine Source auslässt, sodass Plugins, Scheduler und andere nicht-menschliche Produzenten ihre eigene Source übergeben müssen statt menschliche Autorität zu erben.
- **System-Prompt-Anleitung mit dem konfigurierten Schwellenwert.** Das Paket registriert eine `tool:goal`-System-Prompt-Sektion, deren fester Text `blockedAfterConsecutiveRounds` interpoliert; derselbe Wert ist die harte Untergrenze, die zur Ausführung durchgesetzt wird.
- **Wrap-up-Kontext für terminale Rounds.** Ein erfolgreiches autonomes `complete` oder `blocked` verzögert eine abschließende `<goal_complete>`- oder `<goal_blocked>`-Anweisung, damit das Modell den Benutzer einmal anspricht, bevor die Turn endet; direkt-menschliche Mutationen verzögern diesen Kontext nie.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Tool-Registrierung, Config, System-Prompt-Sektion, Ergebnis-Rendering |
| [`src/authority.ts`](src/authority.ts) | Autoritätsprüfungen zur Ausführungszeit und Goal-Round-Akzeptanz |
| [`src/wrapup.ts`](src/wrapup.ts) | Abschluss-Nachrichten-Anweisung für terminale autonome Updates |
| — | Es wird kein Runtime-Invariant-Begleiter veröffentlicht; dieser modellzugewandte Adapter besitzt keinen unabhängigen Zustand oder Event-Protokoll; akzeptierte Mutationen werden von der Goal-Domäne geprüft und Autoritätsverhalten ist paket-getestet. |

### Tool-Ausgabe

Alle drei Tools teilen eine kanonische Ausgabe: das kompakte JSON `{ goal: null }` oder `{ goal: { id, revision, objective, phase, roundsStarted, maxGoalRounds, blockedReason? }, activation }`. `activation` in einem Ergebnis ist eine live Beobachtung und wird nie Replay-Autorität. UI-Clients erhalten reine generische Karten — read für `get_goal`, other für Mutationen.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Die Tools sind die modellzugewandte Hälfte der Goal-Oberfläche; lies diese Seiten für den Zustand, den sie mutieren, und die Policy, der sie folgen.

- [Goal-Service](../goal/README.de.md) — der Goal-Zustand und -Lifecycle, den die Tools mutieren.
- [Goal-Gruppenkarte](../README.de.md) — die Goal-Pakete und wie sie komponieren.
- [Generierter Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-goal) — die exakten Schemas, die das Modell erhält.
- [Goal-Tool-Agent-Note](../../../.agents/notes/implemented/feature/2026-07-19-model-facing-goal-tools.de.md) — der Autoritäts-Split und die UX-Entscheidungen.

-----

<a id="model-experience"></a>
## Model Experience

### System-Prompt

#### Was das Modell sieht

Eine feste Goal-Policy sagt, wann semantische menschliche Absicht eine Erstellung rechtfertigt, erfordert exakte Read-before-Update-Refs, erklärt Rearming nach Resume/Fork und begrenzt Abschluss-/Blockierungs-Aussagen. Dauerhaft pausiertes Resume wird zur Ausführung mit `GOAL_TOOL_RESUME_PAUSED` abgelehnt; das nutzerseitige Goal-Control besitzt diesen Übergang. Der konfigurierte Schwellenwert wird in diese Anleitung interpoliert.

##### Goal-Policy

```markdown
Use goal tools for one long-running completion objective in the current session. create_goal may infer goal intent from a direct human request in any language; do not create a goal for routine single-turn work. Call get_goal before update_goal and copy its exact goal_id and revision. After session resume or fork, an active goal is disarmed: when a human asks to continue or resume in any wording or language, use update_goal action resume to rearm it. Mark complete only when the objective is actually achieved. Mark blocked only after the same blocking condition persists for at least 3 consecutive goal rounds, and report that concrete condition in blocked_reason; difficulty, uncertainty, or useful remaining work is not blocked.
```

#### Token-Effekt

Kleine feste Eingabekosten bei jeder Anfrage, bei der die Prompt-Registrierung dieses Plugins im Scope liegt.

#### KV-Cache-Effekt

Prefix-stabil, solange Plugin-Scope, konfigurierter Schwellenwert und Anleitungstext unverändert sind. Aktivierung, Disposal oder Konfigurationsänderungen können die Wiederverwendung aus dieser Prompt-Sektion invalidieren.

### Tool-Schemas und Ergebnisse

#### Was das Modell sieht

Die generierten [`get_goal`-, `create_goal`- und `update_goal`-Schemas](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-goal). Erfolgreiche Ergebnisse sind kompaktes JSON. Eine Mutation hängt das durable `goal/change`-Event der Goal-Domäne an, ohne Modellkontext zu queuen. `activation` in einem Ergebnis ist eine live Beobachtung und wird nie Replay-Autorität.

#### Token-Effekt

Feste Schema-Kosten plus ein kompaktes Ergebnis pro Aufruf. Die durable Mutation fügt keinen separaten modellsichtbaren Kontext hinzu.

#### KV-Cache-Effekt

Schemas sind prefix-stabil, solange ihre Definitionen und Sichtbarkeit unverändert sind. Aufrufe und Ergebnisse hängen nach dem wiederverwendbaren Request-Prefix an, ohne frühere Einträge zu invalidieren.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die Goal-Tools schlecht passen oder besondere Sorgfalt brauchen. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Semantische Absicht bleibt Modellurteil** — die Ausführung kann beweisen, dass die aktuelle Turn eine direkte menschliche Nachricht enthält, nicht ob die Anfrage substanziell genug ist, ein Goal zu verdienen.
- **Gleichheitsbedingung beim Blockieren bleibt Modellurteil** — die Runtime erzwingt eine Zahl distinkter zugelassener Rounds, nicht semantische Äquivalenz der Hindernisse; ein unabhängiger Evaluator ist zurückgestellt.
- **Kein Scheduling oder direktes menschliches Rendering** — diese Tools mutieren nur Zustand; der Same-Session-Driver und `dsh-command-goal` sind unabhängige Consumer derselben Domäne.
- **Goal-Round-Autorität braucht einen Driver** — der autonome `complete`/`blocked`-Pfad ist dormant, solange kein Continuation-Driver Goal-basierte User-Turns zulässt; das Mounten dieses Tool-Pakets allein erzeugt sie nicht.
- **Prompt-Registrierung ist unabhängig vom Filtern** — ein Scope kann die Tools verbergen, während er ihre Anleitung behält, solange das Deployment nicht beide Registrierungen gemeinsam scoped.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer; sie ist explizit nicht maßgeblich. Offene Frage: ob die Goal-Policy-Sektion unabhängig von den Tool-Registrierungen gescoped werden sollte, damit ein Scope nicht die Tools verbergen kann, während er die Anleitung behält.

</details>
