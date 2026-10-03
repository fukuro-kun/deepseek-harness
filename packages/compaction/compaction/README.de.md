---
description: "Geteilter Compaction-Vertrag für Backend-Implementierer und Deployer: was Konversations-Verdichtung tut, wann man sie einsetzt und wie man ein Backend baut."
kind: "package-reference"
---

# @deepseek-ai/dsh-compaction
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-compaction` lässt eine lange Session ihre ältere Historie zu einer einzigen Summary-Message verdichten, die jüngste Konversation intakt halten und weiterlaufen, als wäre die Zusammenfassung schon immer da gewesen — mit einem Backend wie `dsh-compaction-basic` und dem optionalen `/compact`-Befehl. Der verdichtete Inhalt bleibt im Session-Log, sodass ein Replay der Session die exakte Konversation reproduziert. Greife zu diesem Paket, wenn du ein Verdichtungs-Backend implementierst, etwas baust, das Verdichtung auslöst, oder verdichtete Messages erkennen musst — es führt selbst keine Verdichtung durch. Wähle das ausgelieferte Backend, wenn du das Feature einfach out of the box willst.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Modell-Erfahrung](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Entscheide zuerst, was du brauchst. Das ausgelieferte Backend plus der `/compact`-Befehl liefern dir automatische und On-Demand-Verdichtung ohne Code; dieses Paket ist nur relevant, wenn du das Feature erweiterst oder reimplementierst. Die Abschnitte unten beschreiben, was Verdichtung tut, wie man sie aktiviert und wie man ein Backend schreibt.

### Wann es wählen

Wähle `dsh-compaction-basic`, wenn eine modellgeschriebene Zusammenfassung deine Anforderungen erfüllt: Du bekommst Verdichtung automatisch, während die Konversation wächst, und on demand über `dsh-command-compact`. Wähle dieses Paket, wenn du ein Backend mit einem anderen Summarizer schreibst — ein festes Template oder einen Remote-Service — oder wenn du etwas baust, das Verdichtung programmatisch auslöst. Mounte es nicht allein: Ohne Backend verdichtet nichts.

### Wie Verdichtung aussieht

Wenn Verdichtung läuft, wird der gewählte ältere Span der Konversation durch eine Summary-Message ersetzt; die jüngste Historie bleibt unangetastet, und die Konversation setzt ab der Zusammenfassung fort. Verdichtung kann automatisch bei steigendem Token-Druck, on demand oder über einen expliziten Span ausgelöst werden; das Ergebnis meldet, welche Historie verdichtet wurde und wie viele Tokens geschätzt frei wurden.

### Verdichtung aktivieren

Mounte das ausgelieferte Backend, um den Verdichtungs-Service zu registrieren, und füge `dsh-command-compact` für den On-Demand-Befehl hinzu:

```yaml
- name: '@deepseek-ai/dsh-compaction-basic'
- name: '@deepseek-ai/dsh-command-compact'
```

Mit diesen zwei Zeilen ist das Feature an: Die Konversation verdichtet automatisch, während sie wächst, und `/compact` verdichtet auf Anfrage sofort und meldet, wie viele Historieneinträge ersetzt wurden. Ist kein Backend gemountet, verdichtet nichts und `/compact` schlägt fehl; die vollständige Dependency-Kette für das ausgelieferte Backend steht in seinem eigenen README.

### Ein Backend implementieren

Erweitere die bereitgestellte Basisklasse und implementiere drei Operationen: eine, die bei einem automatischen Trigger entscheidet und verdichtet, eine, die on demand verdichtet, und eine, die einen expliziten Bereich der Konversation verdichtet. Lade deine Klasse als Plugin, und sie wird der Verdichtungs-Service der Komposition. Die exakten Signaturen, die Fehlerregeln und der Checkpoint-Marker, den jedes Backend produzieren muss, stehen im Implementierungsabschnitt unten und in der [Compaction-Subsystem-Referenz](../../../docs/subsystems/compaction.de.md).

### Verdichtete Historie erkennen

Messages, die ein Backend als Zusammenfassungen schrieb, tragen einen stabilen Marker, sodass jeder Consumer verdichtete Historie nach Persistierung oder Klonen erkennen kann, ohne zu wissen, welches Backend sie produziert hat. Der Marker wird aus dem Paket-Root exportiert und aus einem Cordis-freien Subpath, den Client- und Wire-Programme importieren können.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt den Vertrag in API-Begriffen und die Designentscheidungen dahinter; das Feature-Level-Verhalten deckt [Dieses Paket verwenden](#use-this-package) ab.

### Designphilosophie

Die Seam baut auf einer Trennung und drei Zusagen auf:

- **Abstrakter Vertrag, konkrete Backends.** Das Interface sagt, was Verdichtung tut; Provider besitzen Policy, Retention und Summarization, sodass jede Rolle unabhängig evolviert und getauscht wird.
- **Session- und LLM-Vokabular sind Teil des Vertrags.** Die Operationen wirken auf einer `Session`, und die Zusammenfassung nutzt `ContentBlock`, sodass die Service Definition trotz der allgemeinen Cordis-only-Guidance von `dsh-session` und `dsh-llm` abhängt — eine bewusste Abweichung, protokolliert in der [Compaction-Capability-Seam-Agent-Note](../../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.de.md).
- **Das log-recorded Bracket ist das Lock.** `compaction/start` wird angehängt, bevor die Summarization yielded, und `compaction/end` gibt frei; jeder Fehler unternimmt genau einen Close-Versuch, und ein fehlgeschlagener Close hinterlässt den ungematchten Start als absichtliches Busy-Signal.
- **Die Surface wird genau einmal mutiert.** Die Zusammenfassung reitet auf einem `user/message`-Replacement innerhalb des Brackets; alle `compaction/*`-Events bleiben log-only.

### Service-API

Der Vertrag besteht aus drei abstrakten Operationen, die ein Backend implementiert: `compactIfNeeded` für automatische `pressure`- oder `context-overflow`-Trigger, `compactNow` für eine explizite On-Demand-Reduktion und `compactRegion` für einen caller-gewählten Surface-Range. Wiederverwendbare Request-Messung ist ein separater Service, `ctx.tokenMeter`. Die erschöpfende Per-Operation-Semantik lebt in der [Compaction-Subsystem-Referenz](../../../docs/subsystems/compaction.de.md); die exakten Signaturen stehen in [`src/index.ts`](src/index.ts).

Ein Backend, das über `ctx.llm.stream()` zusammenfasst, muss das Abort-Signal in `GenerateOptions.signal` des Calls weiterreichen, damit ein Abort oder ein Fiber-Dispose die in-flight Summarization abreißt. Automatische und Explicit-Region-Brackets gewinnen ihren numerischen Owner aus dem offenen Turn zurück; manuelle Brackets brauchen keinen offenen Turn und stempeln `turn: null`.

### Manuelle Fehlertaxonomie

Erwartete manuelle Fehler werfen `ManualCompactionError` mit einem stabilen `code` aus einer kleinen geschlossenen Menge; nur Fehler nach dem `compaction/start`-Marker werden aufgezeichnet — als `compaction/end`, das den Fehler trägt —, während eine `busy`-Ablehnung oder Pre-Start-Cancellation keinen Record hinterlässt. Die Per-Code-Semantik lebt in der [Compaction-Subsystem-Referenz](../../../docs/subsystems/compaction.de.md).

<a id="tool-pairing-boundaries"></a>
### Tool-Pairing-Grenzen

Die Service Definition exportiert `toolPairingBalancedBefore(session, seq)` und `toolPairingBalancedAfter(session, seq)` zum Snappen und Validieren von Compaction-Edges. Eine sichere Edge wird von keinem unbeantworteten Assistant-Tool-Call gekreuzt. Jeder Helper validiert, dass die Event-Sequenz in der aktuellen Surface liegt, und antwortet aus pro Schnitt in Surface-Reihenfolge gecachten Balancen, sodass wiederholte Checks keine Events lesen; eine Replace-Generation baut den Cache neu auf, und fehlende Seqs oder ein Orphan-`tool/result` werden als korrupten Surface-Zustand abgelehnt.

### Der Surface-Vertrag

`SurfaceEventType` ist eine geschlossene Union — `user/message`, `assistant/message` und `tool/result` erfordern `surfaceOp`, und andere Events verbieten es, sodass ein `compaction/*`-Event nicht auf der Surface erscheinen kann. Ein erfolgreicher Backend-Run bracketet die Operation stattdessen im Log: Er hängt `compaction/start` (log-only) an, um das Lock zu erwerben, fasst den Range zusammen, hängt den log-only-`compaction/summary`-Record an, ersetzt den gewählten Span durch ein `user/message`, das die Zusammenfassung trägt — die einzige Surface-Mutation — und hängt `compaction/end` (log-only) an, um das Lock freizugeben.

Das Replacement sitzt innerhalb des Lock-Brackets, sodass ein Crash zwischen `compaction/start` und `compaction/end` ein detektierbares Orphan-Lock hinterlässt statt eines `compaction/end`, das fälschlich Erfolg behauptet. `deriveMessages()` rendert die Zusammenfassung als User-Role-Message gefolgt von den behaltenen Nodes; die verschatteten Events bleiben im rohen Log, sodass Replay deterministisch ist. Die Per-Event-Payloads sind in der [Compaction-Subsystem-Referenz](../../../docs/subsystems/compaction.de.md) aufgezählt.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: abstrakte `CompactionEngine`, `CompactionTrigger`, `ManualCompactionError`, `ctx.compaction`-Merge |
| [`src/types.ts`](src/types.ts) | `CompactionResult` und die declaration-merged `compaction/*`-Session-Events |
| [`src/tool-pairing.ts`](src/tool-pairing.ts) | Per-Session-Schnitt-Balancen-Cache hinter den beiden Boundary-Helfern |
| [`src/checkpoint.ts`](src/checkpoint.ts) | Cordis-freier Checkpoint-Source-Konstruktor und -Prädikat (`./checkpoint`-Leaf) |
| [`src/brand.ts`](src/brand.ts) | `CompactionId`-Branded-Identity |
| [`src/invariant.ts`](src/invariant.ts) | Invarianten-Begleiter: validiert das `compaction/start`→`summary`→`end`-Bracket, seine Owner-Turn-Umschließung und Checkpoint-Korrelation |

### Locking und Serialisierung

Ein log-recorded Lock wird von allen Einstiegspunkten geteilt. Die Tail-Inspektion findet den neuesten ungematchten `compaction/start` und das neueste `session/end-seed`; ein ungematchter Start nach dieser Grenze ist live und meldet `busy`, während ein älterer stale Evidenz aus einem früheren Prozess-Lifecycle ist. Ein Live-Bracket kann kein `turn/start` oder `turn/end` kreuzen. Die Marker sind Lock-Zeitpunkte, kein exklusiver Container: Ein idle `inject()` darf zwischen einem manuellen Start und Ende unrelated Kontext anhängen, daher revalidiert der manuelle Pfad seinen gewählten Span statt Ganz-Surface-Gleichheit zu verlangen.

### Events

Die `compaction/*`-Events erweitern `SessionEventMap` (merge-extensible) via Declaration Merging — Session-Events, keine Cordis-`Events`, und alle log-only. Der generierte [Persistierungs-Log-Event-Katalog](../../../docs/persistence-catalog.de.md) besitzt die Per-Event-Payloads; `compaction/prune` dokumentiert das mit dem Tool-Result-Pruner geteilte Shadow-Price-Protokoll.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Level-Vertrag nicht reicht; sie bewegen sich vom geteilten Vokabular zum ausgelieferten Backend und zur Entscheidungsevidenz.

- [Compaction-Subsystem-Referenz](../../../docs/subsystems/compaction.de.md) — das Verdichtungsvokabular, Ergebnisse und die generierte Service-API.
- [Compaction-Basic-Backend](../compaction-basic/README.de.md) — das ausgelieferte Backend, das automatisch und on demand verdichtet.
- [Tool-Result-Pruner](../compaction-tool-result-pruner/README.de.md) — der optionale Companion, der übergroße Tool-Ausgaben zuerst kürzt.
- [Human-/compact-Befehl](../command-compact/README.de.md) — der On-Demand-Trigger für Verdichtung.
- [Token-Meter](../../llm/token-meter/README.de.md) — der Mess-Service, der entscheidet, wann verdichtet wird.
- [Compaction-Capability-Seam-Agent-Note](../../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.de.md) — die Trennung und die Begründung der Session-/LLM-Abhängigkeit.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

### Konversationshistorie, wenn ein Backend aufgerufen wird

#### Was das Modell sieht

Ein erfolgreiches Backend ersetzt einen älteren Surface-Range durch einen User-Role-Summary-Checkpoint — ein `user/message` mit `surfaceOp: { op: 'replace', startSeq, endSeq }`. Die rohen Events bleiben geloggt, erscheinen aber nicht mehr in abgeleiteten Modell-Messages; die Seam selbst führt kein Rewrite durch.

#### Token-Effekt

Null direkte Tokens von dieser Service Definition. Ein Backend tauscht viele behaltene Historien-Tokens gegen eine Zusammenfassung und lässt den jüngsten Tail unverändert.

#### KV-Cache-Effekt

Ein erfolgreiches Backend-Replacement invalidiert die Wiederverwendung ab dem ersten verschatteten Historien-Token; die Seam selbst verändert keinen Request.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen beschreiben, was Verdichtung nicht kann, unabhängig davon, welches Backend geladen ist; sie sind die aktuellen Paket-Constraints.

- **Human-Command, kein Modell-Tool** — Verdichtung wird durch den `/compact`-Befehl und durch automatischen Druck ausgelöst; es ist kein modellseitiges Compaction-Tool registriert.
- **Mancher Single-Unit-Overflow liegt außerhalb des Vertrags** — Balanced-Summary-Compaction kann eine unteilbare Einheit nicht spalten. Der optionale Pruning-Companion kann ein geschlossenes Tool-Paar noch reparieren, wenn texttragende Tool-Result-Bulk entfernbar ist; ein großer Nicht-Tool-Node oder eine Tool-Einheit mit übergroßem nicht-prunbarem Rest kann nicht verdichtet werden.
- **Eine Envelope, die allein ans Fenster heranreicht, ist keine Surface-Compaction-Arbeit** — Compaction schrumpft abgeleitete Historie, nie System-Prompt, Tools oder Session-Präfix.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Diese Dev-Notiz ist Arbeitskontext für Maintainer und explizit nicht-autoritativ; ausgeliefertes Verhalten lebt in den Abschnitten oben, im Paket-Code und in den verlinkten Agent Notes.

- **Modellseitiges Tool, unentschieden** — Compaction ist nur Human-Command. Ein modellseitiges Compaction-Tool bleibt eine offene Frage; es bräuchte ein eigenes Schema und Interaktion mit dem bestehenden Command-Pfad.
- **Template- und Remote-Backends, unentschieden** — der `SummaryResult`-Vertrag trägt bereits eine unmarkierte `rawOutput`-Variante für Summarizer, die einen Call nicht über `ctx.llm.stream()` identifizieren, aber kein solches Backend wird ausgeliefert.
- **Range-Argumente für `/compact`, unentschieden** — die argumentfreie Form hält das Verhalten über Command-Adapter hinweg stabil; explizite Ranges bleiben der programmatische `compactRegion()`-Pfad.

</details>
