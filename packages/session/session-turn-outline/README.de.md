---
description: "Gliederung aller Turns über das gesamte Log für Clients und Maintainer, die die turnOutline-Projektionseinheit hinter der Turn-Navigation über die ganze Session hinweg zusammensetzen oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-turn-outline
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Dieses Paket gibt History-Clients eine sessionsweite Übersicht über jeden gestarteten Turn, inklusive begrenzter Prompt- und Settled-Response-Vorschauen. Clients können zu Turns navigieren, die noch nicht geladen sind, und ab exakt der Event-Sequenz zurückblättern, die zum Laden eines gewählten Turns nötig ist. Es passt zu Assemblies, die Session-Projektionen bereitstellen; andernorts nutzen Clients weiterhin Navigation über das geladene Fenster. Vorschauen schließen injizierten Kontext und Tool Results aus, und eine Response erscheint erst, nachdem ihr Turn settled.

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

Das Plugin neben dem Session Store und der Projection Registry mounten, wenn Clients jeden Turn einer Session navigieren sollen, ohne ihr vollständiges Event Log zu halten. Die Unit registriert sich nur, wenn die Registry vorhanden ist.

### Composition

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-projection'
- name: '@deepseek-ai/dsh-session-turn-outline'
```

### Was ein Eintrag bedeutet

| Feld | Bedeutung |
|---|---|
| `turn` | Vom Host vergebene Turn-Nummer aus dem `turn/start`-Payload |
| `seq` | Die Event-seq des `turn/start`-Events des Turns — ein Fenster, das über diese seq zurückgeblättert wird, lädt den ganzen Turn |
| `prompt` | Vorschau des ersten menschlichen Prompts des Turns (Textblöcke mit Leerzeichen verbunden, Whitespace kollabiert, 50-Zeichen-Limit mit angehängtem Ellipsis beim Kürzen — eine Rail-Card-Zeile); `''` bis ein eligible Prompt eintrifft |
| `response` | Vorschau der letzten texttragenden Assistant-Message des Turns (gleiche Normalisierung, 120-Zeichen-Limit — bis zu drei Rail-Card-Zeilen); `''` bis der Turn mit Assistant-Text endet |

Der Wire-Wert ist das vollständige Entry-Array, streng monoton steigend nach `turn` (Whole-Value-Regel): Consumer ersetzen, mergen nie. Prompts füllen nur aus `user/message`-Events mit menschlicher `user`-Source, sodass injizierter Kontext und Tool Results nie in die Navigation gelangen; ein Turn, dessen Prompt nur Bilder enthält, behält `''` und wird vom Consumer nach Nummer beschriftet. Die Response puffert als Draft, während ihr Turn streamt, und committed bei `turn/end`; das Raw-View-Identity-Gate des Change Feeds hält Draft-only-Änderungen still, sodass die Outline pro Turn höchstens dreimal pusht — Boundary, Prompt, settled Response. Die Vorschau-Budgets entsprechen den Loaded-Turn-Previews der Chat-Rail, sodass ein Turn vor und nach dem Laden seiner Events denselben Text zeigt.

### Fehler und Recovery

Ohne Projection Registry ist die Unit inert: `inject` lässt den fiber pending und nichts registriert sich, sodass anderen Assemblies der `turnOutline`-Key fehlt. Unmounten des Plugins entfernt den Key, weil Registrierungen Effects auf dem mountenden fiber sind. Persisted-Cache-Zeilen werden beim Restore schema-validiert — einschließlich der streng monotonen Turn-Reihenfolge — sodass eine korrupte Zeile verworfen wird statt einen kaputten fold zu seeden.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt den fold hinter der Outline; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Die Unit ist ein purer fold über committed Session-Events. `turn/start` — nicht der Prompt `user/message` — verankert jeden Eintrag, weil seine seq das Load-through-Ziel eines Sprungs ist: Der agent loop loggt `turn/start` vor dem Prompt und den Steps des Turns, sodass ein über diese seq zurückgeblättertes Fenster den ganzen Turn enthält. Der Prompt füllt aus der ersten menschlichen `user/message`, und nur solange der neueste Eintrag noch leer ist — spätere menschliche Messages im selben Turn (steering) behalten die erste Vorschau. Die Response kann nicht ebenso füllen (`turn/end` trägt keinen Text), daher überschreibt jede texttragende `assistant/message` einen State-Draft und `turn/end` committed den Überlebenden — den neuesten Text, was der `findLast`-Semantik der geladenen Rail entspricht.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `inject`, Unit-Registrierung auf dem mountenden fiber |
| [`src/projection.ts`](src/projection.ts) | Der fold: Entry-Append, Preview-Fill, Wire-View |
| [`src/types.ts`](src/types.ts) | Das eine Zuhause der `turnOutline`-Projection-Key-Deklaration und der Entry-Typen |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht: Das Paket besitzt einen reinen Projektions-fold, `session-projection` schema-validiert die ausgelieferten Werte, und ein erneutes Falten desselben Logs würde die Implementierung duplizieren statt unabhängig gepflegte Beobachtungen zu vergleichen; die Turn-Boundary-Reihenfolge gehört session und agent-loop. |

### Fold-Regeln

- Irrelevante Events geben dieselbe State-Referenz zurück, und Draft-only-Änderungen bewahren die Identität des `turns`-Arrays; die beiden `Object.is`-Gates der Registry begrenzen den Feed dann auf höchstens drei Pushes pro Turn.
- Ein `turn/start`, das die Turn-Nummer nicht voranbringt, wird übersprungen, sodass die Outline sortiert bleibt; die Vorschauen einer retried Boundary landen dann auf dem bestehenden Eintrag.
- Der Wire-View projiziert `state.turns`; das State-Schema des Persisted Cache umschließt das Wire-Schema mit dem Draft-Feld.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der Contract der Unit nicht ausreicht. Sie führen von der Registry, die Units antreibt, zu benachbarten Session-Paketen.

- [Session-Projektions-Subsystem](../../../docs/subsystems/session-projection.de.md) — die Registry, die Units antreibt und Snapshot- und Change-Feed-Werte ausliefert.
- [Session-Projektions-Registry-Paket](../session-projection/README.de.md) — der Registry-Contract, gegen den sich Units registrieren.
- [Session-Paketübersicht](../README.de.md) — benachbarte Persistenz-, Projektions-, Titel- und Telemetrie-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da die turnOutline-Unit bereits geloggte Turn-Boundaries in ein clientseitiges Read Model faltet und nichts Modellzugewandtes registriert.

#### KV-Cache-Effekt

Keiner; das Paket assembliert oder sendet niemals Provider-Requests.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was die Outline beschreibt und wann die Unit fehlt. Sie sind aktuelle Paket-Constraints.

- **Der Wire-Wert wächst mit der Session** — jeder Push trägt die komplette Outline (Whole-Value-Regel), bis zu ~600 Bytes pro Turn bei vollen CJK-Budgets und typischerweise deutlich weniger; das Aufspalten der Vorschauen in ein On-Demand-Read ist zurückgestellt, bis Sessions mit vielen tausend Turns es brauchen.
- **Die Response zeigt nur settled Turns** — sie committed bei `turn/end`, sodass ein offener Turn (oder einer, dessen Ende nie geloggt wurde) bis zum Eintreffen der Boundary nur eine Prompt-Vorschau zeigt.
- **Ein Turn ohne eligible Text behält `''`** — Turns mit nur Bildern oder nur Kommandos sind navigierbar, werden aber nach Nummer beschriftet, und ein Turn, dessen Steps keinen Text emittieren, bekommt keine Response-Vorschau.
- **Nur dort gemountet, wo die Projection Registry komponiert ist** — andere Assemblies liefern keinen `turnOutline`-Key, und ihre Consumer fallen auf Navigation über das geladene Fenster zurück.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
