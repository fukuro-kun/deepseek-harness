---
description: "Beratender Loop-Hygiene-Guard, der das Model aus identischen Tool-Call-Schleifen holt — für Benutzer und Maintainer, die das Plugin auswählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-repeat-tool-reminder
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Dieses Paket hilft einem Model, aus Schleifen auszubrechen, in denen es dasselbe Tool mit identischen Argumenten aufruft, ohne Fortschritt zu machen. Bei konfigurierten Wiederholungszahlen fordert es das Model auf, das vorherige Ergebnis zu prüfen und den Ansatz zu ändern oder zu beenden. Die Erinnerung ist beratend: Sie blockiert oder verzögert niemals einen legitimen wiederholten Aufruf. Wiederholungen werden pro Agent separat verfolgt und durch eine neue User-Nachricht gelöscht. Das `dsh`-Base-Bundle aktiviert das Paket mit Erinnerungen bei 3, 5 und 8 Wiederholungen.

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

Dieses Plugin mounten, wenn das Model sich selbst dabei erwischen soll, dass es auf identischen Tool-Calls schleift. Es gibt nichts zu lernen oder zu verdrahten: Das `dsh`-Base-Bundle läuft es bereits, und die Defaults funktionieren für die meisten Sessions — die Schwellenwerte und den Tool-Scope unten anpassen, wenn der Hinweis früher, später oder auf weniger Tools kommen soll.

### Wann es die richtige Wahl ist

Es ist die richtige Wahl, wenn das Model lange Strecken autonom arbeitet und eine festsitzende Schleife der Fehler ist, den man mit Rat statt mit Zwang brechen will. Es ist zu vermeiden, wenn identische Wiederholungen legitim sind und ungestört laufen müssen — der Guard erinnert nur, und eine Erinnerung ist eine kleine Zusatznachricht nach dem wiederholten Aufruf — und wenn annähernd identische Varianten erkannt werden müssen, denn nur exakte Wiederholungen (gleiches Tool, gleiche Argumente unabhängig von der Property-Reihenfolge) werden erkannt.

### Schwellenwerte und Scope setzen

Wenn sich ändern soll, wann Erinnerungen feuern oder welche Tools sie abdecken, das Plugin mit Konfiguration mounten:

```yaml
- name: '@deepseek-ai/dsh-repeat-tool-reminder'
  config:
    thresholds: [3, 5, 8]        # remind at 3, 5, and 8 consecutive repeats
    include: []                  # track every tool; list patterns to track only some
    exclude: [todo_write]        # never track these tools
    argumentsPreviewChars: 500   # cap on arguments shown in the detailed reminder
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `thresholds` | `[3, 5, 8]` | Wiederholungszahlen, die eine Erinnerung auslösen |
| `include` | `[]` | Nur diese Tools werden verfolgt; leer bedeutet jedes Tool |
| `exclude` | `[]` | Diese Tools werden nie verfolgt; Aufrufe an sie zählen weder noch setzen sie zurück |
| `argumentsPreviewChars` | `500` | Wie viele Zeichen der wiederholten Argumente die detaillierte Erinnerung zeigt |

Ungültige Konfiguration scheitert beim Start mit einem klaren Fehler — eine leere `thresholds`-Liste, eine Wiederholungszahl unter 2 oder ein Duplikat — niemals eine stille Verhaltensänderung. Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-repeat-tool-reminder) dokumentiert jeden akzeptierten Wert.

### Was man bekommt

Mit den Defaults erhält ein Model, das denselben Aufruf mit identischen Argumenten wiederholt, bei der dritten Wiederholung eine kurze Erinnerung — das vorherige Ergebnis vor dem nächsten Aufruf zu analysieren — und bei der fünften und achten detaillierte Erinnerungen, die Tool und wiederholte Argumente nennen, damit es entscheiden kann, ob es den Ansatz ändert, weitere Belege sammelt oder beendet. Eine neue User-Nachricht löscht den Zähler, sodass eine frische Anweisung nie als Schleife gilt. Erinnerungen erscheinen in der Konversation nach dem Ergebnis des wiederholten Aufrufs, dem Plugin zugeordnet, sodass das Model sie wie jede andere Nachricht liest.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie der Guard Wiederholungen erkennt und Erinnerungen zustellt, und verweist auf den Code, der das umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) behandelt.

### Designphilosophie

Der Guard baut auf vier Verpflichtungen auf:

- **Beratend, kein Veto.** Der Guard reichert Post-Execute-Entscheidungen mit Model-Kontext an; er blockiert oder schreibt einen Aufruf nie um, sodass `PostToolDecision`-Blockierung die Aufgabe eines späteren Listeners bleibt.
- **Zählen im Post-Execute.** Die Erkennung läuft auf `tools/post-execute`, das auch für verweigerte Aufrufe feuert; dort zu zählen lässt einen Listener jeden Versuch abdecken, ohne event-übergreifenden Zustand.
- **Exakt-Match-Kanonisierung.** Argumente erreichen den Guard als `JSON.parse`-Ausgabe der Loop (oder dessen Raw-String-Fallback), sodass der JSON-Wertebereich der gesamte Eingabebereich ist und ein tiefer Key-Sort plus `JSON.stringify` eine vollständige, deterministische Identität ergibt — es existiert kein BigInt-, Zyklus- oder `undefined`-Handling, weil kein Eingabepfad sie erzeugen kann.
- **Fail-loud beim Laden.** `thresholds` und `argumentsPreviewChars` werden in `apply` validiert und werfen, fallen nie auf Defaults zurück.

### Erkennung: die Wiederholungskette

Die Kette jedes Agents ist über `(Tool-Name, kanonische Argumente)` gekeyed — zwei Aufrufe mit demselben Tool und kanonisch identischen Argumenten (Property-Reihenfolge ignoriert) zählen als aufeinanderfolgend, und ein anderer verfolgter Aufruf setzt den Zähler auf 1 zurück. Die Kette lebt in einer `WeakMap<Agent, Chain>`.

- **Nicht verfolgte Aufrufe sind für die Kette transparent.** Ein durch `include`/`exclude` ausgeschlossener Aufruf erhöht den Zähler weder noch setzt er ihn zurück, sodass `grep X → todo_write → grep X` bei ausgeschlossenem `todo_write` weiterhin als zwei aufeinanderfolgende `grep X` zählt — in eine Schleife eingestreute Buchhaltungs-Tools verwaschen sie nicht.
- **Verweigerte Aufrufe zählen.** Die Erkennung sitzt auf `tools/post-execute`, das auch für von einem `tools/pre-execute`-Listener verweigerte Aufrufe läuft; ein Model, das einen verweigerten Aufruf hämmert, ist genau die Schleife, die es zu brechen lohnt.
- **Aufrufe ohne Agent werden ignoriert.** Ein direkter `ctx.tools.execute()`-Aufrufer hat kein zu erinnerndes Model und kein lebendes Agent-Objekt als Schlüssel.
- **Pro-Agent-Keying, Reset bei User-Prompts.** Die Wiederholung eines Agents löst nie die Erinnerung eines anderen aus; ein User-Prompt (`agent/pre-step`) löscht die Kette des einreichenden Agents, und die Objektlebensdauer begrenzt den Weak-Eintrag ohne Dispose-Listener.
- **Nur im Speicher.** Eine aus der Persistenz fortgesetzte Session startet mit einer frischen Kette — der Guard ist ein heuristischer Stupser, keine protokollierte Invariante, sodass Erinnerungen nach einem Resume der akzeptierte Preis sind.

### Erinnerungs-Zustellung

Erinnerungen reiten auf dem `additionalContexts` der Post-Execute-Entscheidung (Quelle `{kind: 'plugin', plugin: 'repeat-tool-reminder', form: 'notice', summary: '<tool> × <count>'}`), niemals als `content`-Ersetzung: Das `tool/result`-Event bleibt zur Audit-Fähigkeit die eigene Ausgabe des Tools. Die Loop puffert den Kontext und hängt ihn als injizierte `user/message` nach den Tool-Ergebnissen des Schritts an, was die Session als gewöhnliche synthetische User-Nachricht rendert — model-sichtbar, quellen-zugeordnet und ohne neues Session-Event aus dem Session-Log rekonstruierbar. Der Guard delegiert immer via `next()` und stellt seine Erinnerung dem Kontext-Array der Downstream-Entscheidung voran, sodass beide Entscheidungsvarianten (eine blockierter Aufruf eingeschlossen) den Stupser erhalten und jeder Eintrag seine eigene Quelle und Metadaten behält.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Config`-Schema, Fail-loud-Validierung, Ketten-Listener |
| — | Es wird kein Runtime-Invarianten-Companion veröffentlicht; die Wiederholungskette ist privat für einen Post-Execute-Listener und exponiert kein paket-eigenes Event oder Snapshot, das ein unabhängiger Companion beobachten könnte. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der Paket-Vertrag nicht ausreicht. Sie führen vom Tools-Waterfall zur erschöpfenden Konfiguration und zur Guard-Gruppenkarte.

- [Tools-Subsystem-Referenz](../../../docs/subsystems/tools.de.md) — der `tools/execute`-Waterfall, `additionalContexts` und die Entscheidungsformen, die dieser Guard konsumiert.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-repeat-tool-reminder) — jedes akzeptierte Config-Feld und seine Quell-Deklaration.
- [Guard-Gruppenkarte](../README.de.md) — die Geschwister-Guard-Pakete und die Loop-Hygiene-Familie.

-----

<a id="model-experience"></a>
## Model Experience

### Kontext-Nachricht beim ersten Schwellenwert

#### Was das Model sieht

Beim ersten konfigurierten Schwellenwert aufeinanderfolgender Wiederholungen erhält dieser Agent die folgende Erinnerung. Es werden weder Tool-Schema noch Normal-Call-Text hinzugefügt.

##### Erinnerung beim ersten Schwellenwert

```markdown
You are repeating the exact same tool call with identical arguments. Carefully analyze the previous result before calling again: if the task is not complete, try a different approach or different arguments instead of repeating the call.
```

#### Token-Auswirkung

Null Tokens vor dem Schwellenwert. Die Erinnerung ist behaltene History für diesen Agent.

#### KV-Cache-Auswirkung

Append-only; neu sichtbarer Inhalt folgt auf das wiederverwendbare Anfrage-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

### Kontext-Nachricht bei späteren Schwellenwerten

#### Was das Model sieht

Ein späterer Schwellenwert erhält die unten stehende detaillierte Erinnerungsvorlage. Eine gekappte Argument-Vorschau endet exakt mit `… (+<omitted> more chars)`.

##### Erinnerung bei späterem Schwellenwert

```markdown
Repeated tool call detected:
- tool: <toolName>
- consecutive_calls: <count>
- arguments: <canonicalArguments>
The repeated calls are not making progress. Do not call this tool with these exact arguments again. Inspect the latest result and choose a different action, different arguments, or finish the task if enough evidence has been gathered.
```

#### Token-Auswirkung

Jede Erinnerung ist behaltene History; `argumentsPreviewChars` begrenzt ihren datenabhängigen Argument-Text, während Agents unabhängige Zähler führen.

#### KV-Cache-Auswirkung

Append-only; neu sichtbarer Inhalt folgt auf das wiederverwendbare Anfrage-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Guard schlecht passt. Sie sind aktuelle Paket-Einschränkungen, kein Aufgaben-Backlog.

- **Nur Exakt-Match-Erkennung** — die Kanonisierung ist ein tiefer Key-Sort, sodass annähernd identische Varianten (ein angepasster Pfad, zusätzlicher Whitespace in einem Wert) der Kette entkommen; Fuzzy-Matching ist bis zum Nachweis eines Bedarfs abgelehnt.
- **Compaction setzt Ketten nicht zurück** — eine Kette, die einen Compaction-Checkpoint überspannt, zählt weiter.
- **Nur beratend** — eine Eskalation zu einer blockierenden Form bei hohem Schwellenwert ist nicht implementiert, obwohl `PostToolDecision` Blockierung bereits unterstützt.
- **Keine Ketten-Teilung mit Subagents** — Ketten bleiben pro Agent isoliert; ein Elternteil und sein Subagent, die denselben Aufruf wiederholen, werden nie kombiniert.
- **Legitime idempotente Polling zieht jenseits der Schwellenwerte weiter Stupser nach sich** — die Druckventile sind die `thresholds`/`exclude`-Config.
- **Jenseits des höchsten Schwellenwerts verstummt eine Kette** — Erinnerungen feuern nur bei exakt konfigurierten Zahlen, nie darüber hinaus.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und Richtungen, die nicht entschieden sind. Sie ist ausdrücklich nicht autoritativ — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen stehen in den Abschnitten oben, im Paket-Code und in den verlinkten Agent Notes.

Die [repeat-tool-guard-Feature-Note](../../../.agents/notes/archived/feature/2026-07-08-repeat-tool-guard.md) hält das ursprüngliche Design und die Alternativen unter dem früheren Paketnamen fest; das [Benennungs-Ledger](../../../.agents/notes/archived/architecture/2026-08-11-repository-naming-contract-and-rename-ledger.md) hält die Umbenennung zu `repeat-tool-reminder` und ihren Grund fest.

</details>
