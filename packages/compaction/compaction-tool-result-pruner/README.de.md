---
description: "Tool-Ausgabe-Trimming für Deployments, die Compaction komponieren: Size-Limits auswählen oder debuggen, warum übergroße Tool-Ergebnisse gekürzt werden."
kind: "package-reference"
---

# @deepseek-ai/dsh-compaction-tool-result-pruner
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-compaction-tool-result-pruner` verhindert, dass übergroße Tool-Ausgaben das Kontextfenster füllen. Sobald ein Compaction-Trigger qualifiziert, ersetzt er über-Budget-Text durch einen begrenzten Head, einen kurzen „middle pruned"-Marker und einen begrenzten Tail; Konversationen unter Druck bleiben unverändert. Das vollständige Originalergebnis bleibt im Session-Log für exaktes Replay und Inspektion. Trimming macht keinen Modell-Call und kann genug Token-Druck abbauen, um die Summarization zu überspringen. Character-Budgets approximieren die Token-Nutzung nur; der Token-Meter entscheidet, ob Druck abgebaut wurde.

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

Mounten Sie dieses Paket neben `dsh-compaction-basic`, wenn Tool-Ausgaben regelmäßig das Konversationsfenster dominieren. Trimming ändert, was das Modell sieht — kürzere Ergebnisse — und gibt der Compaction weniger Historie zum Verdichten.

### Kleinste funktionierende Komposition

Mounten Sie Token-Messung, dieses Paket und das Backend in dieser Reihenfolge:

```yaml
- name: '@deepseek-ai/dsh-token-meter'
- name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
- name: '@deepseek-ai/dsh-compaction-basic'
```

Mit diesen Zeilen werden übergroße Tool-Ergebnisse automatisch als Teil der Verdichtung getrimmt. Sie können den Erfolg prüfen, indem Sie kontrollieren, dass künftige Requests die getrimmten Ergebnisse zeigen; die vollständigen Originale bleiben im Session-Log.

### Was getrimmt wird

Jedes Tool-Ergebnis, dessen Text den Schwellenwert überschreitet, wird durch eine getrimmte Version ersetzt: der konfigurierte Head, ein kurzer „middle pruned"-Marker und der konfigurierte Tail. Rich-Content wie Bilder und strukturierte Blöcke behält seine Reihenfolge. Der Ersatz behält Tool-Call, Step, Errors und Metadata — nur der Text-Inhalt ändert sich. Wenn ein Ersatz nicht aufgezeichnet werden kann, schlägt der Lauf fehl, und die bereits angewendeten Trims bleiben bestehen.

### Die Size-Limits setzen

Alle Settings sind optional; die Defaults trimmen jedes Ergebnis mit mehr als 8.192 Text-Characters auf seine ersten 4.096 plus seine letzten 1.024, durch den Marker verbunden. Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-compaction-tool-result-pruner) ist die erschöpfende Quelle.

| Feld | Default | Bedeutung |
|---|---|---|
| `thresholdChars` | `8192` | Trimmen, wenn der kombinierte Text so viele Unicode-Codepoints überschreitet. |
| `headChars` | `4096` | Behaltene führende Unicode-Codepoints. |
| `tailChars` | `1024` | Behaltene abschließende Unicode-Codepoints. |

Character-Zählungen sind Unicode-Codepoints, sodass Slicing nie ein Emoji-Paar spaltet, obwohl ein Multi-Character-Graphem trotzdem geschnitten werden kann. Head plus Marker plus Tail müssen in den Schwellenwert passen, sodass eine gültige Konfiguration jedes über-Budget-Ergebnis trimmt, ohne Wachstum oder wiederholtes Rewriting. Ein unbekanntes Setting rejected das Plugin bei der Konstruktion.

### Wann das Trimming läuft

Trimming läuft nur, wenn ein Compaction-Trigger qualifiziert: `dsh-compaction-basic` ruft es auf, nachdem Druck oder Overflow bestätigt ist, bevor es auswählt, was zu verdichten ist. Unter Druck wird nichts getrimmt, und Trimming selbst macht keinen Modell-Call.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Design-Entscheidungen hinter dem Pruner; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig behandelt.

### Design-Philosophie

Der Pruner baut auf drei Zusagen:

- **Deterministische Ein-Pass-Konvergenz.** Gesliced wird nach Unicode-Codepoint mit festen Budgets, sodass jedes emittierte Ergebnis exakt den konfigurierten Head, Marker und Tail in Text-Codepoints hat, nicht größer als `thresholdChars` ist und strikt kleiner als die auslösende Eingabe.
- **Replay-sicherer Ersatz.** Das Original-Event bleibt im Append-only-Log; der Ersatz zitiert es über `sourceEventSeqs`, sodass Replay die exakte Eingabe zurückgewinnt, die das geprunete Ergebnis erzeugte.
- **Das Shadow-Price-Protokoll.** `compaction/prune` steht unmittelbar vor seinem Ersatz und bepreist den exakt ersetzten Bereich über den injizierten Token-Meter, sodass reine Consumer ihn ohne Per-Node-State abziehen können — das auf dem `compaction/prune`-Event dokumentierte geteilte Protokoll.

### Pruning-Mechanik

Pruning misst `text`-Blöcke nach Unicode-Codepoint (Nicht-Text-Blöcke kosten null), erzeugt einen begrenzten Ersatz — oder keinen, wenn der Inhalt schon im Budget liegt — und tauscht jedes über-Budget-Tool-Ergebnis gegen ein neu angehängtes `tool/result`, das das Original-Event ersetzt und über `sourceEventSeqs` zitiert, unmittelbar vorausgegangen von einem `compaction/prune`-Shadow-Price-Event. Eine Session, die einen Ersatz ablehnt, lässt den Lauf synchron fehlschlagen; früher im Pass committed Replacements bleiben durable. Nicht-Text-Blöcke behalten ihre originalen relativen Positionen, und Slicing spaltet nie ein UTF-16-Surrogatpaar. Exakte Signaturen stehen in [`src/index.ts`](src/index.ts).

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `ToolResultPruner`-Service, `pruneSession` / `pruneContent` / `measureContent` |
| [`src/config.ts`](src/config.ts) | `PRUNE_MARKER`, Defaults, Codepoint-Zählung, Budget-Validierung |
| [`src/types.ts`](src/types.ts) | `ToolResultPruneConfig`, `ResolvedConfig`, `PrunedEntry`, `PruneResult` |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; die Session validiert jeden Content-only-Rewrite, und ihr Begleiter besitzt die Cross-Event-Enclosure. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paket-Vertrag nicht ausreicht; sie führen vom konsumierenden Backend zur geteilten Seam und zum Pricing-Service.

- [Compaction-Basic-Backend](../compaction-basic/README.de.md) — das Backend, das übergroße Tool-Ausgaben vor dem Verdichten trimmt.
- [Compaction-Seam](../compaction/README.de.md) — der Verdichtungs-Vertrag, in den dieses Paket einsteckt.
- [Compaction-Subsystem-Referenz](../../../docs/subsystems/compaction.de.md) — das Verdichtungs-Vokabular, Ergebnisse und das Service-Verhalten.
- [Token-Meter](../../llm/token-meter/README.de.md) — der Mess-Service, der entscheidet, ob Trimming Druck abbaute.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-compaction-tool-result-pruner) — jedes akzeptierte Config-Feld und seine Quell-Deklaration.

-----

<a id="model-experience"></a>
## Model Experience

### Geprunetes Tool-Ergebnis

#### Was das Modell sieht

Sobald ein Compaction-Trigger qualifiziert, sehen künftige Requests den behaltenen Head, `\n\n[... tool result middle pruned ...]\n\n` und den behaltenen Tail anstelle des entfernten Textes. Rich-Blöcke behalten ihre Reihenfolge. Das Modell sieht keine zweite Kopie des Originals.

#### Token-Effekt

Jedes rewritten Tool-Ergebnis hat höchstens `thresholdChars` Text-Codepoints. Pruning selbst macht keinen Modell-Call; compaction-basic überspringt die Summarization, wenn der neu gemessene Request unter den Druck fällt, sonst liest der Summarizer die geprunete Oberfläche.

#### KV-Cache-Effekt

Das Ersetzen eines früheren Ergebnisses invalidiert Reuse ab dem ersten geänderten Token. Das geprunete Präfix ist reuse-fähig, solange seine Route, sein Envelope und die vorangehende Historie identisch bleiben.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann Trimming eine schlechte Wahl ist oder besondere Sorgfalt braucht; sie sind die aktuellen Paket-Einschränkungen.

- **Character-Budgets sind keine Token-Budgets** — die Provider-Token-Dichte variiert, deshalb bleibt `ctx.tokenMeter` die Autorität dafür, ob Trimming Request-Druck abbaute.
- **Pruning ist syntaktisch** — es behält Anfang und Ende, ohne zu interpretieren, welche mittleren Zeilen semantisch wichtig sind.
- **Graphem-Cluster können gespalten werden** — Codepoint-Slicing schützt Surrogatpaare, führt aber keine locale-aware Graphem-Segmentierung durch.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer und explizit nicht maßgeblich; ausgeliefertes Verhalten lebt in den obigen Abschnitten, dem Paket-Code und den verlinkten Agent Notes.

- **Semantische Middle-Auswahl, unentschieden** — Pruning behält Head und Tail blind; zu interpretieren, welche mittleren Zeilen zählen, bräuchte ein Modell oder strukturierte Heuristiken, von denen keines ausgeliefert wird.
- **Token-basierte Budgets, zurückgestellt** — Budgets sind Unicode-Codepoints; auf Token-basierte Budgets umzustellen erforderte einen Estimator-Vertrag, den der Token-Meter nicht exponiert.

</details>
