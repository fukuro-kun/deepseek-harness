---
description: "Replay-fähige Token- und Context-Pressure-Messung für Nutzer und Maintainer, die Prompts bemessen oder Compaction- und Occupancy-Anzeigen bauen."
kind: "package-reference"
---

# @deepseek-ai/dsh-token-meter

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Verwenden Sie `ctx.tokenMeter`, um den aktuellen Request- und Context-Druck einer Session zu schätzen oder eine einzelne Nachricht zu bepreisen. Messungen replayen das durable Session-Log, bleiben deterministisch und tätigen keine Modellaufrufe, sodass Compaction, Occupancy-Anzeigen und Telemetrie ein Ergebnis teilen können. Wenn Session-Projections verfügbar sind, können Consumer `tokenUsage`, `contextPressure` und `contextBreakdown` lesen; Text und Routen ohne Bild-Bepreisung verwenden eine approximative feste Heuristik, deklarierte Visual-Token-Bepreisung gilt, wenn verfügbar, und Dateien werden als modellsichtbarer Handle-Text bepreist. Provider-gemeldete Usage wird nur bei identischem Request-Envelope wiederverwendet; das Paket fügt keinen modellsichtbaren Inhalt hinzu und trifft keine Loop-Entscheidungen.

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

Mounten Sie dieses Plugin, wenn ein Consumer Token- oder Context-Druck für Compaction-Entscheidungen, Occupancy-Anzeigen oder Telemetrie benötigt. Der Schätzer hat keine Settings und fügt keine modellsichtbare Oberfläche hinzu; Modellkapazität gehört dem Adapter, der die exakte Provider/Model-Route besitzt, und ist über `ctx.llm.resolveModelInfo().context` verfügbar.

### Wann Sie es wählen

Wählen Sie es, wenn mehrere Plugins sich auf eine replay-basierte Messung einigen sollen — Compaction-Planung, Occupancy-UIs und Pressure-Checks lesen alle denselben Fold. Die Messungen replayen das durable Session-Log, sind also deterministisch, kosten keine Modellaufrufe und spiegeln exakt das Geloggte. Text und nicht deklarierte Bild-Routen verwenden eine feste Heuristik; greifen Sie zu einem Provider-Tokenizer, wenn ein Deployment exakte abrechnungsgenaue Zählungen braucht.

### Druck messen

`ctx.tokenMeter` exponiert zwei Operationen. `measure(session, requestHeader?)` liefert einen losgelösten, tiefenunveränderlichen Snapshot bei einer konsumierten Log-Revision: `totalTokens` ist Request-und-Response-Druck, und `surfaceTokens` ist die nur-oberflächliche routen-bepreiste Summe, gleich der Summe von `nodes[].tokens`. Ein optionaler `requestHeader`-Override wählt die bepreiste Route und die Pressure-Felder; die Node-Menge beschreibt weiterhin die aktuelle Session. `estimateMessage(message)` bepreist eine Nachricht mit der festen Heuristik. Jeder Aufruf klont die positionalen Surface-Nodes, sodass Messung O(surface) ist.

```text
const { totalTokens, surfaceTokens, nodes } = ctx.tokenMeter.measure(session)
const price = ctx.tokenMeter.estimateMessage(message)
```

Jede Messung löst Provider/Model des effektiven Envelopes über den optionalen `llm`-Service auf. Bild-Vorkommen verwenden den Visual-Token-Preis des gerouteten Requests plus modellsichtbaren Text, wenn der Adapter Bepreisung deklariert; andere Routen behalten die feste Heuristik. Datei-Vorkommen verwenden den exakten routen-unabhängigen Handle-Text, den derselbe `llm`-Service für den Adapter-Dispatch auflöst, einschließlich seines aktuellen Execution-World-Pfads oder einer expliziten Ohne-Pfad-Meldung. Jeder Node trägt zusätzlich routen-unabhängige `heuristicTokens` für Replacement-Schattenpreise. Provider-Usage wird nur wiederverwendet, wenn der kanonische Request-Envelope des letzten erfolgreichen Aufrufs mit dem gemessenen Envelope übereinstimmt und seine Summe nicht unter dem vollständig routen-bepreisten Anker dieses Aufrufs liegt; andernfalls werden der komplette aktuelle Envelope und die Surface geschätzt. Surface-Änderungen bleiben relativ zu einem passenden, unter derselben Route neu bepreisten Anker vorzeichenbehaftet, einschließlich negativer Deltas nach schrumpfenden Replacements.

Der Messungsanker umfasst die bepreiste Surface unmittelbar vor der erfolgreichen `assistant/message`, einschließlich der nach `step/start` zugelassenen System- und User-Messages und der vor einem Retry vorgenommenen Replacements. Bei unverändertem durable Output hat der abgeschlossene Aufruf ein Surface-Delta von null: Sein Prompt ist bereits in der Provider-Usage enthalten. Spätere Surface-Änderungen bleiben vorzeichenbehaftete Deltas gegenüber diesem Anker.

### Session-Projections

Wenn die Komposition `ctx.sessionProjections` bereitstellt, registriert token-meter drei Projection-Units. `tokenUsage` trägt `uncachedInputTokens`, `outputTokens`, `cacheReadTokens` und `cacheWriteTokens` des kompletten durable Logs. Ein finales Assistant-Message-Sample ersetzt Streaming-Usage desselben Versuchs; `llm/retry-started` beendet diesen Replacement-Scope, sodass ein Retry im selben Step einen weiteren berechneten Versuch beiträgt. `contextPressure` trägt optionale `pressureTokens` (die neueste provider-gemeldete Prompt-Größe), optionale `projectedTokens` (was der Prompt des nächsten Requests kosten würde) und optionales `contextWindow` aus dem neuesten `request/context`-Record. `contextBreakdown` trägt heuristische `systemTokens`, `toolsTokens` und `messageTokens` — die Zusammensetzung des Kontexts, nicht seine provider-verrechnete Größe. Das Entladen des Plugins entfernt alle drei Schlüssel.

`contextBreakdown` klassifiziert die letzte nichtleere überlebende `system/message` in Surface-Reihenfolge als `systemTokens`; leere dormante Nodes tragen nichts bei, und ohne nichtleeres System ist der Wert null. `messageTokens` umfasst jeden anderen sichtbaren Node, einschließlich ersetzter Prompts. Ihre Summe entspricht immer `measure().nodes[].heuristicTokens`, auch nach unvermessenen Replacements, Compaction und pro-Node-Prompt-Clearing. `toolsTokens` folgt dem neuesten `request/header`. Alle drei verwenden die feste Heuristik, nicht Routen-Bild-Bepreisung oder File-Handle-Projektion; sie sind approximative Zusammensetzung, nicht Abrechnung oder `projectedTokens`.

### Komposition

```yaml
- name: '@deepseek-ai/dsh-token-meter'
- name: '@deepseek-ai/dsh-compaction-basic'
```

Beide Plugins haben nutzbare Defaults. Der Meter konsumiert nur den optionalen `llm`-Service, und nur um routen-deklarierte Request-Bild-Bepreisung aufzulösen; Compaction bleibt optional. Ein Deployment konfiguriert Kapazität und Bild-Bepreisung auf seinem LLM-Adapter und die Compaction-Policy auf `dsh-compaction-basic`.

### Die Zahlen lesen

Occupancy ist eine Referenzgröße, kein Abrechnungsrecord: Nichts im Harness trifft Entscheidungen daraus, und Compaction liest stattdessen `measure()`. Eine UI berechnet Occupancy, indem sie den gemessenen Druck durch die separat aufgelöste Kapazität des gewählten Modells teilt. Die `contextBreakdown`-Zahlen sind Schätzwerte, die sich nicht zu `projectedTokens` summieren, dessen Provider-Anker genau den heuristischen Fehler trägt — CJK-Text und JSON-Schemas unterbepreisen bei vier Zeichen pro Token deutlich.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design hinter dem Service; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig behandelt.

### Design-Philosophie

Der Service baut auf einem Fold und einem Anker auf. Jede Session erhält einen isolierten Replay-State — Cursor konsumierter Events, kanonischer Request-Header, bepreiste Surface, Step-Grenze und Messungsanker — der durch Falten des durable Logs fortgeschrieben wird. Provider-Usage verankert eine Messung nur, wenn ihr kanonischer Envelope übereinstimmt und ihre Summe nicht unter den vollständig routen-bepreisten Kosten desselben Aufrufs liegt; andernfalls werden der komplette Envelope und die Surface geschätzt. Das routen-unabhängige `heuristicTokens`-Feld hält Replacement-Schattenpreis-Projektionen deterministisch. Der Fold ist total und allokationsfrisch: Ein malformed Event wirft vor jeder Mutation, sodass dasselbe Log bei jedem Retry identisch fehlschlägt.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Der `TokenMeter`-Service: Replay-State, Fold, `measure()` und `estimateMessage()` |
| [`src/estimate.ts`](src/estimate.ts) | Die feste Heuristik: vier Zeichen pro Token plus Block- und Rollen-Overhead |
| [`src/surface-fold.ts`](src/surface-fold.ts) | Der mit `measure()` geteilte positionale Surface-Fold |
| [`src/surface-projection.ts`](src/surface-projection.ts) | Schattenpreis-Protokoll für die O(1)-Projection-Units |
| [`src/usage-projection.ts`](src/usage-projection.ts) | `tokenUsage`- und `contextPressure`-Projection-Definitionen |
| [`src/breakdown-projection.ts`](src/breakdown-projection.ts) | `contextBreakdown`-Projection-Definition |
| [`src/client.ts`](src/client.ts) | Browser-sichere Client-Oberfläche für Projection-Consumer |
| [`src/turn-usage.ts`](src/turn-usage.ts) | Reiner Fold für exakte Usage pro Versuch und pro Turn |

### Fold-Fluss

Jeder `measure()`-Aufruf synchronisiert den Fold auf den aktuellen durable Tail und liest dann einen kohärenten Snapshot. Der Fold verfolgt vollständige Request-Header-Snapshots, Step-Grenzen, Surface-Appends und -Replacements, erfolgreiche Assistant-Messages und Provider-Usage. Provider-Output für einen Usage-Anker wird aus dem exakten eingebetteten Stream der Assistant-Message reassembliert, unabhängig von Listener-Rewrites auf durablem Inhalt; leerer reassemblierter Inhalt kostet null.

### Projection-Semantik

`contextBreakdown` behält Plain-JSON-Einträge `{ seq, heuristicTokens, system }` in Surface-Reihenfolge und verwendet den Plan/Commit-Fold der Messung wieder. Sein State und seine Surface-Transitionen sind O(aktuell zurückbehaltene Surface), nicht O(1) und nicht O(gesamtes historisches Log); ersetzte Einträge und Message-Bodies werden nicht zurückbehalten. State-Version 4 invalidiert skalare Checkpoints und replayt das Log. `contextPressure` bleibt der skalare Schattenpreis-Consumer: Replacements ohne angrenzende Claims tragen ein Delta von null bei. Der Usage-Fold behält einen Last-Sample-Slot, weil legale Logs nie Usage für einen früheren Step melden, nachdem ein späterer Step Usage gemeldet hat.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie führen vom Mess-Service zum Compaction-Consumer und den geteilten Typen.

- [Token-Meter-Subsystem](../../../docs/subsystems/token-meter.de.md) — die Mess-Semantik hinter `ctx.tokenMeter`.
- [dsh-llm-Service](../llm/README.de.md) — der Modellaufruf-Service, dessen Kapazitäts-Metadaten `resolveModelInfo()` liefert.
- [Compaction-Capability](../../../docs/subsystems/compaction.de.md) — der drucksensitive Consumer, der `measure()` liest.
- [Projizierte Token-Usage](../../../.agents/notes/implemented/architecture/2026-07-29-projected-token-usage-and-request-context.de.md) — das Design hinter `projectedTokens` und der verworfene Atomic-Pair-Vergleich.
- [LLM-Streaming-Subsystem](../../../docs/subsystems/llm-streaming.de.md) — die Message- und Block-Typen, die dieser Service bepreist.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über Consumer wie `dsh-compaction-basic`; der Service selbst fügt keinen Prompt, keine Message, kein Schema, kein Tool und keinen Modellaufruf hinzu.

#### KV-Cache-Effekt

Keine direkte Invalidierung; der benannte Consumer besitzt etwaige Request-Präfix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo die Messung endet und künftige Arbeit beginnt. Sie sind aktuelle Paket-Einschränkungen, kein allgemeiner Token-Accounting-Vergleich und kein Aufgaben-Backlog.

- **Die feste Heuristik ist approximativ** — Text ohne wiederverwendbare Provider-Usage wird nach Zeichenzahl plus Struktur-Overhead bepreist, nicht nach einem exakten Provider-Tokenizer oder Request-Serializer; nur Bild-Vorkommen auf Routen mit deklarierter Bepreisung tragen provider-exakte Visual-Tokens.
- **Jede Messung klont die aktuelle Surface** — kohärente unveränderliche Snapshots machen Reads O(surface), einschließlich Pressure-Checks unter der Schwelle.
- **Provider-Usage ist nur für einen identischen kanonischen Envelope wiederverwendbar** — Änderungen an Tools, Provider, Modell oder Call-Config fallen bewusst auf volle heuristische Schätzung zurück; System-Prompt-Änderungen sind bis zum nächsten erfolgreichen Aufruf vorzeichenbehaftete Surface-Deltas.
- **Ein System-Prompt-Rewrite trägt keinen Schattenpreis** — der Loop ersetzt einen System-Node ohne angrenzendes Metering-Event, sodass `contextPressure.projectedTokens` dieses Replacement mit Delta null faltet, bis zum nächsten Usage-Sample; `contextBreakdown.systemTokens` und `measure()` bepreisen den neuen Prompt sofort neu.
- **Composition-Checkpoints behalten die aktuelle Surface** — exakte System/Message-Klassifikation braucht positionale Einträge; Checkpoint-Größe und Surface-Event-Falten sind O(aktuell zurückbehaltene Surface).

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist nicht-autoritativer Arbeitskontext: Notizen für Maintainer und offene Fragen. Ausgeliefertes Verhalten und akzeptierte Begründungen leben in den obigen Abschnitten, dem Paket-Code und den verlinkten Agent Notes.

- Die feste Vier-Zeichen-pro-Token-Heuristik unterbepreist CJK-Text und JSON-Schemas; der Provider-Anker trägt genau diesen Fehler, wenn Usage wiederverwendet wird, und präsentieren Sie die Composition-Zeilen als approximative Zusammensetzung, niemals als Summe.
- Ein per-Provider-exakter Tokenizer ist nicht entschieden; eine einzige deterministische Heuristik zu behalten ist genau das, was die Messung jedes Consumers konsistent und replay-stabil macht.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Usage-Folds ersetzen Samples innerhalb jedes Versuchs; Summen müssen nicht monoton sein. Composition und Messung teilen den positionalen Replacement-Planner und den festen Schätzer, sodass ihre heuristischen Surface-Summen konstruktionsbedingt übereinstimmen statt durch unabhängige mutable Beobachtungen. Routen-bepreiste Summen weichen absichtlich ab.
