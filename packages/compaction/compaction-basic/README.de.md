---
description: "Automatische Konversations-Verdichtung für Deployments, die wählen, tunen oder debuggen, wie ältere Historie bei steigendem Token-Druck zusammengefasst wird."
kind: "package-reference"
---

# @deepseek-ai/dsh-compaction-basic
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Dieses Paket hält lange agent-Konversationen nahe am Kontextlimit des Modells funktionsfähig. Bei steigendem Token-Druck verdichtet es die älteste Historie zu einer Zusammenfassung und bewahrt die jüngsten Nachrichten; nach einem Context-Overflow-Fehler verdichtet es und wiederholt den Request. Verdichtung kann auch über `/compact` angefordert werden, mit optional vorangehender Kürzung übergroßer Tool-Ausgaben. Verdichtung kostet einen zusätzlichen Modell-Request und behält nur dessen Zusammenfassungstext. Sie kann weder System-Prompt, Tools oder das Session-Präfix verkleinern noch eine unteilbare Einheit wie einen einzelnen riesigen Tool-Call spalten.

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

Mounte dieses Paket für automatische Konversations-Verdichtung in einer Komposition, die bereits ein LLM, Session-Storage und Token-Messung bereitstellt. Die ausgelieferte `dsh`-Basis aktiviert es standardmäßig; mounte es explizit, um zu steuern, wann Verdichtung beginnt.

### Was du bekommst

Mit den Default-Einstellungen bekommst du vier Verhaltensweisen: automatische Verdichtung, wenn die Konversation auf das Kontextlimit des Modells zuläuft; Wiederherstellung nach einem bestätigten Context-Overflow-Fehler, bei der die Konversation verdichtet und der Request wiederholt wird; On-Demand-Verdichtung über den `/compact`-Befehl; und — wenn der Pruner gemountet ist — Kürzung übergroßer Tool-Ausgaben vor der Verdichtung.

### Kleinste funktionierende Komposition

Mounte Session-Storage, Token-Messung, den optionalen Pruner, dieses Backend und optional den On-Demand-Befehl:

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-token-meter'
- name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
- name: '@deepseek-ai/dsh-compaction-basic'
- name: '@deepseek-ai/dsh-command-compact'
```

Erfolg zeigt sich daran, dass die Konversation über den Punkt hinaus weiterläuft, an dem sie sonst überlaufen würde, und daran, dass `/compact` eine sofortige Verdichtung auslöst. Fehlen in der Komposition LLM, Session-Storage oder Token-Messung, schlägt das Laden des Plugins fehl. Ein Backend kann Modelle mit unterschiedlichen Kontextgrößen bedienen; gib jeder Route eigene Schwelle und Retention mit einem Per-Model-Override:

```yaml
- name: '@deepseek-ai/dsh-compaction-basic'
  config:
    thresholdRatio: 0.8
    retainRatio: 0.16
    modelPolicies:
      - provider: local
        model: small-context
        thresholdRatio: 0.7
        retainTokens: 2048
```

### Tunen, wann Verdichtung beginnt

Alle Einstellungen sind optional. Die Defaults beginnen die Verdichtung bei 80 % des Kontextfensters des gerouteten Modells und behalten die neuesten 16 % wörtlich; die Tabelle unten ist die vollständige Policy-Oberfläche, und der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-compaction-basic) ist die erschöpfende Quelle.

| Feld | Default | Bedeutung |
|---|---|---|
| `thresholdRatio` | `0.8` | Verdichtung bei `floor(routedContextWindow × ratio)` beginnen. |
| `retainRatio` | `0.16` | Wörtlich behaltene jüngste Konversation als Anteil des gerouteten Kontextfensters; schließt `retainTokens` aus. |
| `retainTokens` | — | Absolutes Budget wörtlich behaltener jüngster Konversation; schließt `retainRatio` aus und muss unter der aufgelösten Schwelle liegen. |
| `summarizationProvider` | `''` | Zusammen mit `summarizationModel` setzen; ein leeres Paar nutzt das letzte geroutete Request-Ziel, dann das `AgentOptions`-Paar. |
| `summarizationModel` | `''` | Zusammen mit `summarizationProvider` setzen; ein leeres Paar nutzt das letzte geroutete Request-Ziel, dann das `AgentOptions`-Paar. |
| `maxTokens` | `8192` | Ausgabelimit für den Summarization-Request; kann Reasoning-Tokens einschließen. |
| `compactionRetries` | `1` | Zusätzliche Verdichtungsversuche nach dem ersten, wenn der Druck über der Schwelle bleibt. |
| `maxOverflowRetries` | `1` | Maximale Retries nach einem bestätigten Context-Window-Overflow; `0` deaktiviert nur die Wiederherstellung. |
| `modelPolicies` | `[]` | Exakte `{ provider, model, ...partialPolicy }`-Overrides für einzelne Modellrouten. |
| `auto` | `true` | Automatische Verdichtung und Overflow-Wiederherstellung aktivieren; `false` für rein manuellen Betrieb. |

Fehlkonfiguration schlägt früh fehl: eine unbekannte Einstellung, ein doppelter Per-Model-Override, beide Retention-Formen zusammen oder eine Ratio-Retention, die nicht unter der Schwelle liegt, lehnen das Plugin beim Laden ab. Ein absolutes `retainTokens`-Budget — Top-Level oder Per-Model —, das nicht unter seiner Schwelle liegt, schlägt bei der ersten Nutzung dieses Modells fehl, weil der Vergleich die Kontextgröße des Modells braucht.

### Was passiert, wenn Verdichtung läuft

Der älteste ausgewogene Span wird durch eine Zusammenfassungs-Nachricht ersetzt und der jüngste Tail bleibt wörtlich; die Konversation setzt ab der Zusammenfassung fort. Die Operation meldet, wie viele Historieneinträge verdichtet wurden und wie viele Tokens geschätzt frei wurden. Kann nichts sicher verdichtet werden — etwa weil die ganze Konversation eine unteilbare Einheit ist — ändert sich nichts und nichts wird ins Session-Log geschrieben. Steht kein Modell für die Zusammenfassung bereit (kein konfiguriertes Ziel und noch kein gerouteter Request), schlägt die Verdichtung mit einem klaren Fehler fehl, der dich auffordert, Summarization-Provider und -Modell zu konfigurieren oder einen Request zu routen.

### On-Demand-Verdichtung mit /compact

Mit gemountetem `dsh-command-compact` tippe `/compact` in einer Chat-UI, um sofort zu verdichten, auch unterhalb der Druckschwelle. Der Befehl meldet, wie viele Historieneinträge verdichtet wurden und wie viele Tokens geschätzt eingespart wurden. Während der agent mitten im Turn ist oder Verdichtung bereits läuft, meldet `/compact`, dass Verdichtung nicht verfügbar ist; Prompts, die du während des Laufs sendest, werden angenommen und starten nach seinem Ende.

### Übergroße Tool-Ausgaben kürzen

Mounte `dsh-compaction-tool-result-pruner` vor diesem Paket, um übergroße Tool-Ergebnisse als Teil der Verdichtung zu kürzen. Kürzung braucht keinen Modell-Call und kann die Zusammenfassung ganz überflüssig machen: Passt die gekürzte Konversation unter die Schwelle, überspringt die Verdichtung die Zusammenfassung. Kürzung läuft nur, nachdem ein Verdichtungs-Trigger qualifiziert — eine Konversation unter Druckschwelle wird nie angefasst.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Backend; das beobachtbare Verhalten deckt [Dieses Paket verwenden](#use-this-package) vollständig ab.

### Designphilosophie

Das Backend baut auf vier Zusagen auf:

- **Ein Mess-Service bepreist jede Entscheidung.** Das Singleton `ctx.tokenMeter` misst den neuesten kanonisch geloggten Envelope und die aktuelle Surface bei einer konsumierten Log-Revision. Deklariert der geroutete Adapter Request-Image-Bepreisung, wendet der Meter sie auf die Bildhistorie an. Druck, Recent-Tail-Retention, Span-Auswahl und Shrink-Validierung nutzen dieselben routenbepreisten Node-Zahlen; geloggte Replacement-Shadow-Preise bleiben auf der routenunabhängigen Heuristik, damit reine Projektions-Folds konsistent bleiben.
- **Das geloggte Bracket ist die Transaktion.** Alle Einstiegspunkte teilen eine Bracket-first-Regionstransaktion: Span und Live-Lock validieren, `compaction/start` synchron anhängen, die Zusammenfassung vorbereiten und abwarten, revalidieren, `compaction/summary` plus Replacement anhängen und genau einen Close-Versuch unternehmen. Automatische und explizite Regions-Aufrufe verlangen einen numerischen Open-Turn-Owner und Ganz-Surface-Stabilität; `compactNow()` reserviert Idle-Admission, nutzt `turn: null`, akzeptiert append-only-Kontext außerhalb seines gewählten Spans, flusht jeden geschlossenen Versuch und gibt die Admission im `finally` frei.
- **Summarization nutzt das warme Provider-Präfix wieder.** Werden der vom `system/message` an Surface-Node 0 gehaltene System-Prompt, die Tools des letzten gerouteten Requests und die Nachrichten der shadowed Region Byte-für-Byte replayed, wird der Hilfsaufruf ein echtes Präfix der Konversation, sodass nur die abschließende Instruktion und die Zusammenfassungs-Ausgabe ungecacht sind.
- **`summarize()` ist der einzige Subclass-Hook.** Eine Template- oder Remote-Summarizer-Subclass kann ihn überschreiben, während Druck, Retention, zitierte Quell-Events, Shrink-Validierung und Shadowed-Token-Buchhaltung beim Token-Meter bleiben.

### Automatische Trigger und Overflow-Wiederherstellung

Bei `auto: true` prüft ein serieller `agent/pre-step`-Listener den Druck vor der Request-Ableitung: Er bepreist den neuesten durablen gerouteten Request-Envelope über `ctx.tokenMeter`, und wenn der Druck die Schwelle des gerouteten Modells überschreitet, prunt er zuerst und fasst dann den ältesten ausgewogenen Span zusammen, während er einen bepreisten jüngsten Tail behält. Jeder gewählte Span beginnt am ersten Surface-Node, der kein `system/message` ist, sodass ein System-Prompt an Surface-Node 0 nie geschattet wird; ein späteres, von einem In-History-Prompt-Update angehängtes `system/message` ist gewöhnliche Historie, die der Span schatten darf, und die Projektion des Agent-Loops ersetzt Node 0 dann durch den aktuellen Prompt, wenn sich ihre Texte unterscheiden ([Entscheidungsregel](../../core/agent-loop/README.de.md#understand-the-implementation)). Der `agent/request-error`-Listener reagiert auf ein providerbestätigtes `CONTEXT_WINDOW_EXCEEDED`: Er umgeht die normale Schwellen- und Retention-Policy, versucht eine maximale ausgewogene Head-Reduktion und autorisiert einen Retry erst, nachdem die Surface-Replacement-Generation fortgeschritten ist. Cancellation bleibt durchgehend maßgeblich.

Die Druck-Policy löst die Kapazität über den Adapter auf, der die durable Route besitzt. Ein Adapter, der für eine gültige dynamische Route keine Kapazität liefert, lässt den manuellen Druckpfad einen zielspezifischen Konfigurationsfehler werfen; der automatische Listener warnt einmal für genau dieses Ziel und fährt mit voller Historie fort.

### Summarization-Mechanik

Ein direkter `ctx.llm.stream()`-Aufruf nutzt das konfigurierte Provider/Model-Paar und -Limit, fällt auf das letzte geloggte Request-Ziel und dann auf das `AgentOptions`-Paar zurück, ohne den loop-exklusiven `agent/request`-Extension-Point zu durchlaufen. Der Aufruf replayt das abgeleitete `system/message` an Surface-Node 0 als führenden Eintrag von `messages`, gefolgt von den Nachrichten der shadowed Region (einschließlich eines geschatteten In-History-`system/message` an seiner Surface-Position), trägt die Tools des Headers wörtlich — einschließlich Bildreferenzen, die der gewählte Adapter auflösen oder explizit ablehnen muss — und hängt die Compaction-Instruktion als letzte User-Nachricht an, sodass er den warmen Prefix-Cache des Providers wiederverwendet statt ihn zu invalidieren. Ein leerer System-Head steuert keine Nachricht bei, bleibt aber außerhalb der verdichteten Spanne. Der Aufruf setzt `GenerateOptions.purpose` auf `compaction`; nur zurückgegebener Text geht in den Checkpoint, Reasoning und Tool-Calls sind ausgeschlossen. Bild-Ausgabe schlägt mit `UNSUPPORTED_CONTENT` fehl statt zu verschwinden. Die Replacement-User-Nachricht rahmt die Zusammenfassung mit `<compacted-summary>`-Tags; die rohe Zusammenfassung bleibt auf dem `compaction/summary`-Event.

### Die Regionstransaktion

Die Transaktion validiert den Surface-Span und das durable Lock, hängt `compaction/start` an, fasst über den Hook zusammen, revalidiert die Stabilität (Ganz-Surface für automatische Aufrufe, gewählter Span für manuelle), lehnt eine Zusammenfassung ab, die ihre Quelle nicht schrumpft, hängt `compaction/summary` plus das Replacement-`user/message` an und unternimmt genau einen `compaction/end`-Versuch. Ein lebendiger ungematchter Start ist das durable Lock: Ein ungematchter Marker vor einem neueren `session/end-seed` ist stale Evidenz aus einem früheren Lifecycle und blockiert nicht; einer nach dieser Grenze meldet `busy`. Ein fehlschlagender Close hinterlässt absichtlich einen blockierenden Orphan. Cancellation bleibt nach Cleanup und Durability maßgeblich.

### Config-Auflösung

`resolveConfig` validiert und löst die Defaults ab, `resolveTargetPolicy` merged einen exakten Provider/Model-Override darüber, und `resolveCompactSpec` skaliert die gemergte Policy mit der adaptereigenen Kontextkapazität zu konkreten Token-Budgets. Model-Discovery (`listModels()`) wird für die Policy nie konsultiert; nur die Kapazität der durablen Route zählt.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `BasicCompactionEngine`, automatische Listener, Entry-Point-Dispatch |
| [`src/region.ts`](src/region.ts) | Retention-Auswahl und die geteilte Bracket-first-Compaction-Transaktion |
| [`src/summarizer.ts`](src/summarizer.ts) | Default-`ctx.llm.stream()`-Summarization, Checkpoint-Framing, Safe-Summary-Projektion |
| [`src/config.ts`](src/config.ts) | Load-Time-Validierung und Routed-Model-Policy-Auflösung |
| [`src/types.ts`](src/types.ts) | `BasicCompactionConfig` und aufgelöstes Policy-Vokabular |
| — | Es wird kein Runtime-Invarianten-Begleiter publiziert; dieses Paket exponiert keine eigenständige Event-Sequenz oder mutable Datenrelation über die an seiner besitzenden Seam durchgesetzten Verträge hinaus. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Level-Vertrag nicht reicht; sie bewegen sich von der geteilten Seam zu den optionalen Companions und der Entscheidungsgrundlage.

- [Compaction-Seam](../compaction/README.de.md) — der Verdichtungsvertrag, den dieses Backend implementiert.
- [Compaction-Subsystem-Referenz](../../../docs/subsystems/compaction.de.md) — Verdichtungsvokabular, Ergebnisse und Service-Verhalten.
- [Tool-Result-Pruner](../compaction-tool-result-pruner/README.de.md) — der optionale Companion, der übergroße Tool-Ausgaben zuerst kürzt.
- [Human-/compact-Befehl](../command-compact/README.de.md) — On-Demand-Verdichtung ohne auf Druck zu warten.
- [Token-Meter](../../llm/token-meter/README.de.md) — der Mess-Service, der entscheidet, wann verdichtet wird.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-compaction-basic) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

### Konversationshistorie

#### Was das Modell sieht

Nachdem ein erfolgreicher Step die Schwelle überschreitet, werden übergroße Tool-Ergebnisse zuerst umgeschrieben, wenn der optionale Pruner geladen ist. Bleibt Summarization nötig, erhält der nächste Request die untenstehende Checkpoint-Präambel, eine Leerzeile, `<compacted-summary>`, die datenabhängige Zusammenfassung und `</compacted-summary>`. Die Overflow-Wiederherstellung baut den unmittelbaren Retry aus dem Replacement neu, das die Surface fortgeschritten hat. Ein Checkpoint ersetzt den gewählten älteren Span, gefolgt von den behaltenen jüngsten Einheiten.

##### Checkpoint-Präambel der Konversation

```markdown
This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.
```

#### Token-Effekt

Modellfreies Prunen kann den Hilfsaufruf ganz vermeiden; andernfalls verkleinert es dessen Transcript, bevor die Zusammenfassung einen älteren Span ersetzt. Das Replacement reduziert künftige Input-Historie statt eine zweite Kopie anzuhängen. Eine Zusammenfassung bleibt, bis eine spätere Compaction sie ersetzt, während eine unteilbare Nicht-Tool-Einheit das Budget trotzdem überschreiten kann.

#### KV-Cache-Effekt

Ersetzend statt append-only. Jeder Checkpoint invalidiert die Wiederverwendung ab dem ersten ersetzten Historien-Token; das unveränderte Request-Präfix vor diesem Span bleibt wiederverwendbar.

### Hilfs-Summarizer-Request

#### Was das Modell sieht

Das Summarization-Modell erhält die wörtlich replayte Konversation — denselben System-Prompt, dieselben Tool-Schemas und Nachrichten, die der letzte geroutete Request für die shadowed Region sandte — gefolgt von einer letzten User-Nachricht: der untenstehenden Compaction-Instruktion. Das Konversationsmodell sieht diesen privaten Request und sein Reasoning nie; nur zurückgegebener Text wird gespeichert.

##### Compaction-Instruktion (letzte User-Nachricht)

```markdown
You are now acting as a compaction engine for this AI coding assistant. Condense the conversation ABOVE into a structured checkpoint that lets another model resume the work with no loss of essential context.

Output EXACTLY the Markdown structure below: keep every section, in order. Use terse bullets, not prose paragraphs. Write "(none)" for an empty section — never drop a section.

## Primary Request and Intent
- [the user's original and evolving goals; quote verbatim where the exact wording matters]

## Key Technical Concepts
- [technologies, frameworks, patterns, and conventions in play]

## Files and Code
- [exact path: why it matters, key changes or snippets]

## Errors and Fixes
- [error: how it was resolved, plus any related user feedback]

## Pending Jobs
- [explicitly requested work not yet completed]

## Current Work
- [precisely what was in progress at this checkpoint]

## Next Step
- [the single next action, directly in line with the most recent request, or "(none)"]

## Critical Context
- [decisions and their rationale, constraints, user preferences, open questions, data needed to continue]

Rules:
- Write concise English engineering prose. Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.
- Capture user feedback and explicit instructions faithfully, especially corrections.
- Do NOT mention this summarization request or that the context was compacted.
- Output only the checkpoint text: do not call any tool or take any other action.
- If the conversation already contains a <compacted-summary> block, it is a PRIOR checkpoint. Do not copy it forward verbatim: preserve still-true facts, drop stale ones, and merge newer information into a single consolidated summary under the same structure.
```

#### Token-Effekt

Dies ist ein separater Modell-Call: das replayte Konversationspräfix plus die feste Instruktion als Input, mit `maxTokens`-gedeckelter Ausgabe. Konvergenz-Retries können diese Kosten mehrfach bezahlen.

#### KV-Cache-Effekt

Der replayte System-Prompt, die Tools und die Nachrichten der shadowed Region stimmen Byte-für-Byte mit dem letzten gerouteten Request der Konversation überein, sodass der warme Prefix-Cache des Providers bis zur abschließenden Instruktion wiederverwendet wird; nur diese Instruktion und die Zusammenfassungs-Ausgabe sind ungecacht. Den Summarizer auf einen anderen Provider/ein anderes Modell zu routen oder eine Nicht-Head-Spanne zu verdichten, verzichtet auf diese Wiederverwendung.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann automatische Verdichtung schlecht passt oder besondere Sorgfalt braucht; sie sind die aktuellen Paket-Constraints.

- **Meter-Genauigkeit folgt der festen Heuristik** — fehlende wiederverwendbare Provider-Usage fällt auf Zeichenzahl plus strukturellen Overhead statt exakter Tokenisierung zurück; Bildvorkommen tragen providerexakte visuelle Tokens nur auf Routen, deren Adapter Request-Image-Bepreisung deklariert.
- **Overflow-Klassifikation wird vom Adapter gepflegt** — Provider-Formulierungen können sich ändern; beide DeepSeek-Adapter normalisieren erkannte Kontextlimit-Fehlschläge zu `CONTEXT_WINDOW_EXCEEDED`.
- **Ein Teil der unteilbaren Einheiten und reiner Envelope-Overflows bleibt außerhalb der Surface-Compaction** — die Wiederherstellung kann System/Tools/Präfix nicht verkleinern, einen unteilbaren Nicht-Tool-Node nicht spalten oder eine Tool-Einheit reparieren, deren nicht prunbarer Rest das Fenster noch überschreitet. Der optionale Pruner kann texttragende Tool-Result-Masse innerhalb eines sonst unteilbaren Paars verkleinern.
- **`compactRegion` braucht einen offenen Turn** — ein manueller Aufruf auf einer vollständig geschlossenen Session wirft ("no open turn") statt zu verdichten.
- **Summarization-Fehlschlag bewahrt die neueste durable Surface** — vor jedem Replacement loggt der Auto-Pfad eine Warnung und fährt mit voller, überbudgeteter Historie fort. Landete Pruning bereits, geht ein späterer Summarization-Fehlschlag von dieser durablen geprunten Surface aus. Summarization-Truncation bei `maxTokens`, die versteckte Reasoning-Tokens aufbrauchen können, folgt derselben Regel.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Diese Dev-Notiz ist Arbeitskontext für Maintainer und ausdrücklich nicht maßgeblich; ausgeliefertes Verhalten steht in den obigen Abschnitten, dem Paketcode und den verlinkten Agent Notes.

- **Default-Ratios, unentschieden** — `thresholdRatio: 0.8` und `retainRatio: 0.16` sind feste Defaults; Per-Model-Tuning über `modelPolicies` existiert, aber keine korpusbasierte Anleitung zu Idealwerten ist aufgezeichnet.
- **Tokenizer-genaue Messung, zurückgestellt** — die Vier-Zeichen-pro-Token-Heuristik des Token-Meters bepreist CJK-Text und JSON-Schemas zu niedrig; exakte Tokenisierung bleibt eine offene Richtung für den Mess-Service.
- **Overflow-Wiederherstellung jenseits kanonischer Fehler, unentschieden** — Wiederherstellung triggert nur auf `CONTEXT_WINDOW_EXCEEDED`; andere providerseitige Kontextfehler werden nicht klassifiziert.

</details>
