---
description: "Der persistierte same-session Goal-Service für Benutzer und Maintainer, die ein dauerhaftes Vollendungsziel pro Session auswählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-goal
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-goal` lässt ein langlaufendes Vollendungsziel über Turns, Session-Resume, Fork und Prozessneustarts hinweg bestehen. Benutzer und Agents können es erstellen, bearbeiten, pausieren, fortsetzen, abschließen, blockieren oder löschen; Compare-and-Set-Updates lehnen veraltete Ansichten ab. Eine konfigurierbare Round-Obergrenze (standardmäßig 256) begrenzt die automatische Fortsetzung, und blockierte Goals behalten einen stabilen Policy-Code mit einer menschenlesbaren Erklärung. Das Paket speichert Goal-Zustand, scheduliert aber keine Arbeit, und die Fortsetzungserlaubnis bleibt prozesslokal statt persistent. Wählen für ein Ziel über viele Turns; weglassen für routinemäßige Single-Turn-Arbeit oder parallele Ziele.

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

`dsh-goal` mounten, wann immer eine Session ein langlaufendes Vollendungsziel über viele Turns und Neustarts hinweg behalten soll. Das Paket ist ein Service: Die Modell-Tools, der `/goal`-Befehl und der Fortsetzungstreiber sind separate Pakete, die denselben Goal-Zustand konsumieren, sodass das Mounten nur dieses Pakets das Goal speichert und ausliefert, ohne Arbeit zu starten.

### Wann verwenden

Ein Goal passt zu einem langlaufenden Vollendungsziel, das über autonome Goal Rounds fortgesetzt werden soll — etwa eine Migration ausliefern oder jedes fehlschlagende Doc-Gate reparieren. Routinemäßige Single-Turn-Arbeit sollte kein Goal erzeugen. Der Service hält höchstens ein aktuelles Goal pro Session: Ein unvollendetes Goal muss bearbeitet, pausiert, fortgesetzt, blockiert oder gelöscht werden, bevor ein anderes seinen Platz einnimmt, während ein vollendetes Goal direkt ersetzt werden kann.

### Den Service einrichten

Das Paket mit einem Kompositionseintrag laden; die einzige Deployment-Wahl ist die Default-Round-Obergrenze, die auf Creates angewendet wird, die keine eigene nennen.

```yaml
- name: '@deepseek-ai/dsh-goal'
  config:
    defaultMaxGoalRounds: 256
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `defaultMaxGoalRounds` | `256` | Round-Obergrenze, angewendet wenn ein Create-Request keine eigene nennt |

`defaultMaxGoalRounds` muss eine positive Safe Integer sein; ein Create-Request, der eine eigene Obergrenze nennt, überschreibt sie. Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-goal) ist die erschöpfende Quelle für jedes akzeptierte Feld.

### Session-Projektion

`GoalService` benötigt `ctx.sessionProjections` ([`@deepseek-ai/dsh-session-projection`](../../session/session-projection/README.de.md)) und registriert die `goal`-Projektionseinheit beim Start; eine Komposition, die die Projektions-Registry weglässt, kann `ctx.goals` nicht aktivieren. Der Host-State der Einheit in Version 6 hält das neueste gültige aktuelle Goal, jede jemals verwendete Goal-ID und den ersten Strict-Replay-Fehler. Ihre Client-View liefert das aktuelle Goal oder `null` vor dem ersten Create und nach einem Clear-Tombstone. Der Key mergt in `SessionProjectionStateMap` und `SessionProjectionMap`; Träger liefern den Client-Wert auf der History-Tail-Seite und im `session/projection`-Push-Frame.

### Den Lebenszyklus steuern

Ein Goal durchläuft vier persistente Phasen — `active`, `paused`, `blocked`, `complete` — plus ein prozesslokales Flag, das angibt, ob automatische Fortsetzung scharf ist. Die Verben:

| Operation | Was sie tut |
|---|---|
| `create` | Startet ein aktives Goal mit Ziel und Round-Obergrenze |
| `edit` | Ändert Ziel und/oder Round-Obergrenze, ohne die Phase zu ändern |
| `pause` | Stoppt die automatische Fortsetzung und behält den Zustand |
| `resume` | Startet die Fortsetzung neu; scharf auch ein aktives Goal nach Session-Resume oder Fork erneut |
| `complete` | Markiert das Goal als erreicht und stoppt die Fortsetzung |
| `block` | Zeichnet einen stabilen Blocker-Code und eine Erklärung auf |
| `clear` | Entfernt das aktuelle Goal; sein Verlauf bleibt im Session-Log |

Pause, Vollendung, Blockierung und Clear entschärfen die Fortsetzung alle. Blockierung ist die einzige Phase, die einen policy-eigenen lower-kebab-case-Code und eine freiform Erklärung behält, sodass Provider-Limits, erschöpfte Budgets, Ausführungsfehler und Anfragen nach menschlichem Input eine einzige persistente Phase teilen statt Lebenszykluszustände zu vermehren. Resume akzeptiert ein gestopptes Goal — oder ein aktives, aber entschärftes — nur solange die Round-Obergrenze noch Restkapazität hat, und löscht jeden früheren Blocker-Grund.

### Was überlebt und was nicht

Jede akzeptierte Änderung wird persistent im Session-Log aufgezeichnet — der einzige Speicher des Goal-Zustands —, sodass der Goal-Zustand niemals von flüchtiger Nachrichtenzustellung abhängt. Nach Session-Resume oder Fork sind das Goal, seine Phase, seine Revisionen und seine Anzahl zugelassener Rounds alle noch da. Die automatische Fortsetzung ist die Ausnahme: Ein aktives Goal ist nach jeder Session-Start-Kante entschärft, sodass der Agent nicht von selbst weitermacht, bis jemand es explizit fortsetzt.

### Ein Goal beobachten

Consumer lesen das aktuelle Goal mit `ctx.goals.get(agent)` und erhalten eine losgelöste Sicht: Ziel, Phase, gestartete Rounds gegenüber der Obergrenze, Blocker-Grund wenn blockiert, und ob die Fortsetzung scharf ist. Mutationen müssen das exakte `{ id, revision }` aus dieser Sicht tragen, sodass ein Consumer mit älterem Zustand einen klaren Stale-Revision-Fehler erhält statt neueren Zustand still zu überschreiben:

```text
const view = ctx.goals.get(agent)      // undefined when no goal is current
view.phase                             // 'active' | 'paused' | 'blocked' | 'complete'
view.roundsStarted, view.maxGoalRounds // continuation progress
view.activation                        // 'armed' | 'disarmed' — not persisted
```

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie der Service das obige Verhalten realisiert; der beobachtbare Vertrag ist in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Design

- **Event-sourceter Zustand.** Jede Mutation hängt ein persistentes `goal/change`-Event (Version 1) mit dem vollständigen Post-Mutation-Snapshot an; `clear` schreibt einen revisionierten Tombstone. Das Session-Log ist die einzige persistente Autorität.
- **Compare-and-Set-Mutationen.** `ctx.goals` akzeptiert nur den exakten Live-`Agent`, der unter seiner ID registriert ist. `get()` liefert eine losgelöste `GoalView`; Mutationen nehmen ein `GoalRef { id, revision }` und lehnen veraltete Refs ab. Die Erstellung löst den Deployment-Default intern auf, bevor sie committet.
- **Aktivierung ist prozesslokal.** `armed` und `disarmed` leben in einem Per-Session-Cache und werden nie persistiert. Ein frischer Cache und jede `agent/session-start`-Kante entschärfen die Fortsetzung, selbst wenn Replay eine aktive persistente Phase findet; `disarm()` entzieht die Autorität, ohne eine Revision zu schreiben oder eine Mutation zu emittieren.
- **Strict Replay.** Der Fold leitet Lebenszyklus-Mutationen nur aus `goal/change` ab und lehnt missgestaltete Formen, diskontinuierliche Revisionen, illegale Phasenübergänge, nicht-monotone Per-Goal-Zeitstempel und nicht-sequentielle zugelassene Rounds ab. Positive Rounds schreiten nur bei zugelassenen goal-sourced `user/message`-Events voran, und Mutationszeitstempel werden gegen das vorangehende Update geklemmt, wenn die Wandzeit rückwärts läuft.
- **Projektionseinheit.** Das Paket benötigt die Projektions-Registry und registriert eine strikte `goal`-Einheit. Ihr Host-State hält Replay-Validierungsdaten und den ersten Fehler, während ihre Client-View das neueste gültige gesamte Goal oder `null` liefert; `GoalService` lehnt Zugriff nach einem zurückbehaltenen Replay-Fehler ab.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `GoalService`, Config-Schema, Mutationen, Aktivierungs-Cache, Projektionseinheit |
| [`src/domain.ts`](src/domain.ts) | Persistente Change-Payloads, `goal/changed`-Event, Goal-Message-Source-Attribution |
| [`src/types.ts`](src/types.ts) | Reine client-sichere Typen: `GoalView`, `GoalSnapshot`, `GoalActivationChanged`, Projektions-Key-Deklaration |
| [`src/fold.ts`](src/fold.ts) | Strict-Replay-Fold und Decoder für persistente Goal-Änderungen |
| [`src/runtime.ts`](src/runtime.ts) | `GoalId`-Brand, `GoalError`-Codes, Change-Versions-Konstante |
| [`src/invariant.ts`](src/invariant.ts) | Invariant-Begleiter: unabhängiger inkrementeller Fold über jede angehängte Session |

### Events und Attribution

`goal/changed` feuert nach dem Commit des persistenten Events, mit eingedämmten Listener-Fehlern; der Payload trägt die Operation, den exakten Ref und die frische View (fehlt bei einem Clear-Tombstone). `goal/activation-changed` leitet eine prozesslokale `armed`/`disarmed`-Kante mit dem exakten aktuellen Ref weiter — oder kein Goal nach einem Clear —, ohne persistenten Zustand zu ändern. Zugelassene Fortsetzungs-Rounds werden über `GoalMessageSource { goalId, revision, round }` am `user/message`-Event attributiert, das der strikte Fold als nächste zugelassene Round des aktuellen Goals validiert.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Der Paket-Vertrag reicht für die meisten Consumer; diese lesen, wenn die umgebende Domäne und die Designbegründung gebraucht werden.

- [Goal-Subsystem](../../../docs/subsystems/goal.de.md) — die Goal-Typen, persistenten Change-Payloads und generierte Service-API.
- [Goal-Gruppenkarte](../README.de.md) — die Goal-Pakete und wie sie sich zusammensetzen.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-goal) — jedes akzeptierte Config-Feld und seine Quelldeklaration.
- [Goal-Domain Agent Note](../../../.agents/notes/implemented/feature/2026-07-19-persisted-same-session-goal-domain.de.md) — das Domain-Design, Alternativen und Entscheidungen.

-----

<a id="model-experience"></a>
## Model Experience

### Goal-State-Mutationen

#### Was das Modell sieht

Goal-Mutationen injizieren keinen Modellkontext. Tools wie `get_goal` geben den aktuellen Zustand zurück, und ein Fortsetzungs-Consumer kann das Ziel und den Round-Status rendern, wenn er Modellarbeit scheduliert.

#### Token-Effekt

Goal-Mutations-Events fügen allein keine Modell-Token hinzu. Tool-Results und geplante Fortsetzungs-Prompts tragen ihren eigenen sichtbaren Zustand bei.

#### KV-Cache-Effekt

Es gibt keinen KV-Cache-Effekt, bis eine andere Komponente Goal-Zustand in modellsichtbaren Input legt.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Goal-Service ungeeignet ist oder besondere Sorgfalt braucht. Sie sind aktuelle Paket-Einschränkungen, kein Aufgabenrückstand.

- **Zustand, nicht Scheduling** — dieses Paket entscheidet nicht, wann ein scharfes Goal fortgesetzt wird, wiederholt keine abnormalen Fehlschläge und bricht keinen aktiven Turn ab; diese Policies gehören zu Consumer-Paketen wie `dsh-goal-round-driver`.
- **Nur Round-Anzahl-Budget** — `maxGoalRounds` misst keine Token, Währung, Wandzeit oder Provider-Quoten.
- **Kein unabhängiger Evaluator** — der Aufrufer, der Vollendung oder Blockierung aufzeichnet, ist maßgeblich; evaluator-gestützte Zertifizierung ist auf eine separate Policy-Schicht verschoben.
- **Ein aktuelles Goal** — parallele Ziele und eine separate Goal-Datenbank fehlen absichtlich; der Verlauf bleibt nach Ersetzung oder Clear im Session-Log verfügbar.
- **Vertrauenswürdige In-Process-Produzenten** — ein Plugin mit direktem `Session`-Zugriff kann gefälschte `goal/change`-Daten anhängen. Strict Replay erkennt missgestaltete oder inkonsistente Records und lässt den Goal-Zugriff ab diesem Record fehlschlagen, bis das Log repariert ist; das ist Integritätserkennung, keine Plugin-Isolation.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer; sie ist ausdrücklich nicht maßgeblich. Offene, unentschiedene Richtungen: ein immer-sichtbares Goal-Kontext-Plugin für Deployments, die das Ziel in jeder Modellanfrage wollen, und evaluator-gestützte Zertifizierung von Vollendungs- und Blockierungsbehauptungen.

</details>
