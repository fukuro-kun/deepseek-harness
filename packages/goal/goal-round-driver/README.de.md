---
description: "Der Fortsetzungstreiber in derselben Session für Benutzer und Maintainer, die automatische Goal Rounds auswählen, zusammensetzen oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-goal-round-driver

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-goal-round-driver` setzt ein aktives Goal in derselben Session automatisch fort, solange der Agent idle ist, die Fortsetzung aktiviert ist und das konfigurierte Round-Kontingent übrig bleibt. Jede Round gibt dem Modell einen weiteren Turn in Richtung des Ziels; nur Goal Rounds, die in die Modellhistorie gelangen, verbrauchen das Kontingent, und dessen Erschöpfung zeichnet einen Blocker auf. Der Treiber hat keine Konfiguration: Das Goal definiert das Round-Limit und `dsh-tool-goal` definiert, wann wiederholtes Blockieren die Fortsetzung stoppt. Für unbeaufsichtigten Fortschritt über mehrere Rounds wird er zusammen mit `dsh-goal` und `dsh-tool-goal` gemountet; weggelassen wird er, wenn jeder Schritt menschliches Steering erfordert.

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

Mounte `dsh-goal-round-driver`, wenn ein aktives Goal ohne menschliches Eingreifen weiter Fortschritt machen soll. Es komponiert mit dem Goal-Service und den Goal-Tools: Der Service besitzt den Zustand, die Tools geben dem Modell Kontrolle darüber und dieses Paket plant die Rounds.

### Komposition

Mounte den Treiber neben dem Goal-Service und den Goal-Tools; der Treiber selbst nimmt keine Konfiguration entgegen.

```yaml
- id: goal
  name: '@deepseek-ai/dsh-goal'

- id: tool-goal
  name: '@deepseek-ai/dsh-tool-goal'

- id: goal-round-driver
  name: '@deepseek-ai/dsh-goal-round-driver'
```

`maxGoalRounds` gehört zur Goal-Definition, während der modellseitige Blockier-Schwellenwert zu `dsh-tool-goal` gehört; eine Duplizierung eines dieser Werte im Treiber könnte divergierende Policies erzeugen.

### Was jede Round tut

Bei einem exakt zugeordneten live Agent im Leerlauf, einem aktiven armierten Goal und verbleibender Kapazität reiht der Treiber einen Goal-Round-Prompt ein. Er nennt das JSON-quotierte Ziel, die Round-Nummer und das Limit und weist das Modell an, aktuellen Workspace, Tool-Ergebnisse und dauerhaften Zustand als maßgeblich zu behandeln. Eine akzeptierte Round startet eine eigene Request-Serie, daher rendert Chat ihren eigenständigen Request-Header vor der Goal-Nachricht. Die Round geht als goal-sourced User-Message in die Historie ein; nur eine eingegangene Goal-Nachricht verbraucht das Limit, menschliche Nachrichten und stale Reservierungen dagegen nicht. Mutations des Goal-Lifecycle erfordern weiterhin die unabhängigen Authority-Checks in `dsh-tool-goal`.

### Wann die Fortsetzung stoppt

Eine Round startet nur bei Idle des gesamten Agent, und Abschluss, Pause und Blockieren unterdrücken die Fortsetzung; eine hostseitig ausgelöste Pause bricht außerdem den bereits laufenden Turn ab, während eine modellseitig ausgelöste Pause innerhalb ihres eigenen Turns normal endet. Ein Edit invalidiert eine laufende Round nur über den Revision-Fence, und der Treiber setzt mit der neuen Revision fort. Der Treiber stoppt außerdem von sich aus, wenn ein Turn mit max tokens endet, ein Durability-Schreibvorgang fehlschlägt, der Agent abgebrochen wird, das Plugin entladen wird oder das Round-Limit erschöpft ist — am Limit zeichnet er einen Blocker mit dem stabilen Code `round-limit` auf. Ein Abbruch startet eine Round niemals automatisch neu: Ein Goal, dessen Round unterwegs oder bereits eingereiht war, wird am nächsten Idle-Punkt pausiert, und ein Abbruch ohne Bezug zu einem Goal-Versuch deaktiviert lediglich die Fortsetzung.

### Nach Resume, Fork oder Unload

Das Mounten des Treibers über einem bestehenden Agent armiert niemals ein Goal, und nach einem Session-Resume oder Fork bleibt ein aktives Goal solange nicht armiert, bis ein expliziter, menschlich autorisierter Resume erfolgt — der Treiber belebt niemals eigenständig Arbeit wieder. Das Entladen des Plugins bricht jede laufende Round ab und stellt sicher, dass keine spätere Round startet.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie der Treiber Rounds ohne Races plant; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Design

- **Reservierung, dann Zulassung.** Bei Idle reserviert der Treiber `roundsStarted + 1` für das aktuelle `{ goalId, revision }`, reiht einen `<goal_round>`-Prompt mit Goal-Message-Quelle ein, und nur eine eingegangene `user/message` erhöht `roundsStarted`. Eine als stale zurückgewiesene Reservierung verbraucht die Round-Nummer nicht.
- **Race-Fences.** Der `agent/pre-step`-Listener prüft den vollständigen beanspruchten Datensatz vor und nach den nachgelagerten Listenern gegen das aktuelle Goal, sodass ein staler, abgebrochener oder konkurrierender Prompt abgelehnt wird, bevor sein Step eintritt. Menschliche Arbeit, die vor einer Reservierung eintrifft, lässt automatische Arbeit zurückstehen, bis der Agent wieder idle ist.
- **Durability-Checkpoint.** `goal/changed` erzeugt eine Durability-Verpflichtung: Bevor Arbeit eingereiht wird, wartet der Treiber auf `ctx.sessions.flush()` und prüft nach dem Await Goal-Revision und konkurrierende Eingaben erneut. Ein Flush-Fehler, der über `agent/error` eintrifft, deaktiviert die Fortsetzung, bevor eine weitere Round starten kann.
- **Fail-closed-Teardown.** Der Teardown schließt die Zulassung, deaktiviert jedes live Goal, bricht aktive Arbeit mit der Ursache `parent` ab und wartet auf die Quiescence von Treiber und Agent, während sein Event-Fence installiert bleibt.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Treiber-Zustandsmaschine, Race-Fences, Teardown |
| [`src/prompt.ts`](src/prompt.ts) | Der persistierte `<goal_round>`-Fortsetzungsprompt |
| [`src/invariant.ts`](src/invariant.ts) | Invariant-Companion: Goal-Round-Nachrichten müssen mit dem paketeigenen Prompt übereinstimmen |

### Der Round-Prompt

Der persistierte Prompt ist ein einzelner Textblock: das JSON-quotierte Ziel und `round/maxGoalRounds` in den ersten Zeilen, danach die Arbeitsanweisungen. Der Invariant-Companion rekonstruiert das Goal aus dem durable Prefix und lehnt jede goal-sourced Message ab, deren Inhalt nicht exakt mit dem Prompt übereinstimmt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Der Treiber konsumiert den Goal-Zustand und überlässt die Policy den Goal-Tools; diese Seiten beschreiben den umgebenden Vertrag und die Designbegründung.

- [Goal-Service](../goal/README.de.md) — der Goal-Zustand und -Lifecycle, den dieser Treiber fortsetzt.
- [Goal-Tools](../tool-goal/README.de.md) — die modellseitigen Tools und ihre Authority-Checks zur Ausführungszeit.

-----

<a id="model-experience"></a>
## Model Experience

### Goal-Round-Prompt

#### Was das Modell sieht

Jede zugelassene Round ist ein persistierter `<goal_round>`-Block mit User-Rolle, der das vollständige Ziel und die positive Round-Nummer nennt. Frühere menschliche Nachrichten, Goal-State-Snapshots, Assistant-Ausgaben und Tool-Records bleiben in derselben Session-Historie.

#### Token-Effekt

Pro zugelassener Round wird ein fester Anweisungsblock plus dem Ziel hinzugefügt. Spätere Requests senden persistierte Rounds erneut, bis sie durch compaction verdeckt werden; es wird weder ein neuer Agent erzeugt noch ein Gesprächspräfix kopiert.

#### KV-Cache-Effekt

Append-only innerhalb einer Epoch: Jede zugelassene Round verlängert die bestehende Konversation hinter ihrem wiederverwendbaren Präfix. Compaction kann das abgeleitete Historien-Suffix ersetzen und die wiederverwendbare Grenze verschieben.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Treiber schlecht passt oder besondere Sorgfalt erfordert. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Kein unabhängiger Evaluator** — die modellseitige Goal-Policy entscheidet, wann Evidenz für den Abschluss ausreicht und ob ein Blocker semantisch unverändert ist; evaluator-gestützte Zertifizierung bleibt zurückgestellt.
- **Nur Ausführung in derselben Session** — dieses Paket spawnt bewusst keinen neuen Agent, forkt kein Session-Präfix und implementiert keine unabhängigen Versuche im Ralph-Stil; dieser Workflow gehört in eine eigene Plugin-Schicht.
- **Unload-Race der akzeptierten Queue** — das Entladen eines Cordis-Plugins ist asynchron. Ein Goal-Prompt, der bereits von der Agent-Inbox akzeptiert wurde, kann vor Beginn des Unloads starten und seine Round verbrauchen; der Teardown bricht den Request dann ab, deaktiviert das Goal und wartet auf Quiescence. Keine spätere Round startet.
- **Round-Limit, kein Ressourcenbudget** — Token-, Währungs-, Zeit- und Provider-Quota-Policies bleiben unabhängig. Ihre Session-Events werden weder der Goal-Nachricht zugeordnet noch auf Goal-Blocker-Codes abgebildet.
- **Kein automatisches Retry bei Abnormalitäten** — transiente Provider- und Persistenzfehler erfordern einen späteren, menschlich autorisierten Resume statt einer impliziten Retry-Policy.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer und ausdrücklich nicht maßgeblich. Offene, unentschiedene Richtungen: eine Retry-Policy für abnormale Fehler und evaluator-gestützte Round-Zertifizierung; beide bleiben bewusst außerhalb dieses Pakets.

</details>
