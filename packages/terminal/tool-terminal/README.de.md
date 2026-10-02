---
description: "Sechs modellseitige persistente Terminal-Tools mit Owner-Isolation, begrenzten Ergebnissen und optionalen Hintergrund-Sends für Agents, die aufrufübergreifenden Terminal-Zustand brauchen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-terminal

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Verwenden Sie `dsh-tool-terminal`, wenn ein Agent persistenten Terminal-Zustand oder interaktive Eingabe über Aufrufe hinweg braucht. Es kann Terminal-Sessions öffnen, an sie senden, sie lesen, mit Signalen versehen, schließen und auflisten und verhindert dabei, dass ein Agent die Sessions eines anderen Agenten bedient. Sends können auf begrenzte Foreground-Ausgabe warten oder eine Hintergrund-Job-ID zur späteren Abholung oder Unterbrechung zurückgeben. `maxResultBytes` deckelt jedes Ergebnis, das bis zur Compaction in der Session-Historie bleibt. Die Anleitung steuert das Modell dazu, für begrenzte Arbeit Einmal-Tools zu bevorzugen.

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

Aktivieren Sie diese Tools, wenn die Komposition ein Terminal-Backend mountet und das Modell Terminal-Zustand über Aufrufe hinweg nutzen soll — einen Debugger schrittweise bedienen, in einem REPL explorieren oder nach Unterbrechen eines Foreground-Kommandos zur Shell zurückkehren. Der Anleitungsabschnitt steuert das Modell hin zu den Einmal-Tools bash, read, write und edit für begrenzte Operationen.

### Die sechs Tools

| Tool | Funktion | Ergebnis |
|---|---|---|
| `terminal_open` | Erstellt eine Owner-scoped Session aus einem Backend-Typ | Session-ID, Name, Typ, pid, Status und begrenzte Start-Ausgabe |
| `terminal_send` | Schreibt Text, sendet optional Enter und wartet auf Bereitschaft — oder startet einen Hintergrund-Job | Begrenzte Ausgabe plus Warte- und Session-Status oder eine Job-ID |
| `terminal_read` | Liest eine begrenzte Seite der zurückbehaltenen Ausgabe, ohne Eingabe zu senden | Text mit Zeilen-Paginierungs-Metadaten |
| `terminal_signal` | Liefert ein erlaubtes Signal an die Foreground-Prozessgruppe | `delivered` plus die Ziel-Prozessgruppen-ID |
| `terminal_close` | Schließt eine Session und wartet auf das Ende ihres Prozessbaums | Ergebnis geschlossen oder bereits im Schließen |
| `terminal_list` | Listet die live Sessions des Aufrufers | Owner-scoped Session-Zusammenfassungen |

### Komposition

```yaml
- name: '@deepseek-ai/dsh-terminal'
- name: '@deepseek-ai/dsh-terminal-bash'
- name: '@deepseek-ai/dsh-tool-terminal'
```

Die Tools brauchen `ctx.terminals` — ein Backend muss gemountet sein — und den System-Prompt-Service für den Anleitungsabschnitt. Hintergrund-Sends erfordern zusätzlich den Jobs-Service und seinen modellseitigen Controller (`@deepseek-ai/dsh-tool-jobs`).

### Konfiguration

| Feld | Standard | Bedeutung |
|---|---|---|
| `enableRunInBackground` | `true` | `run_in_background` exponieren und akzeptieren; `false` entfernt das Schema-Feld und lehnt das Argument ab |
| `maxResultBytes` | `262144` | UTF-8-Obergrenze (Minimum `64`) für jedes vollständige Terminal-Ergebnis nach Warte-, Session-, Paginierungs-, Kürzungs- und Job-Status-Metadaten |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-terminal) und der [Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-terminal) sind die erschöpfenden Quellen für Config-Felder und Schemas.

### Hintergrund-Sends

`terminal_send(run_in_background: true)` gibt sofort eine Job-ID zurück, statt zu warten. Der Job wird mit `job_output` abgeholt, das wartet und inkrementelle Ausgabe liest, und mit `job_kill` gestoppt, das ein echtes `SIGINT` an die Foreground-Prozessgruppe liefert. Der Hintergrund-Modus schlägt vor dem Schreiben der Eingabe fehl, wenn die Job-Oberfläche fehlt.

### Beobachtbare Ergebnisse und Fehler

Ein Foreground-Send gibt die neue Terminal-Ausgabe plus `wait: <reason>` und den Session-Status zurück; `session_exit` bedeutet, dass die Top-Level-Shell beendet wurde, während `inferred_idle` oder `timeout` niemals beweisen, dass das Foreground-Kommando beendet wurde. Das Öffnen einer Session mit einem nicht registrierten Backend-Typ schlägt fehl. Ergebnisse größer als `maxResultBytes` werden an einer UTF-8-Grenze mit einem Marker gekürzt.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design hinter den Tools und verweist auf den Code, der es umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) behandelt.

### Design-Konzept

Das Paket ist ein dünner Adapter: Die sechs Tools forwarden an `ctx.terminals` mit dem ausführenden Agent als Owner, und die Präsentationsschicht rendert begrenzte Ergebnisse. Hintergrund-Sends registrieren die laufende Operation bei `ctx.jobs`, sodass die generische Job-Oberfläche Warten, inkrementelle Reads und `SIGINT`-Zustellung besitzt.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Sechs Tool-Definitionen, Schemas, Anleitungsabschnitt, Hintergrund-Job-Integration |
| [`src/render.ts`](src/render.ts) | Ergebnis-Rendering und die UTF-8-Obergrenze für vollständige Ergebnisse |

### Ergebnisbegrenzung

Jedes terminal-eigene Einzel-Text-Ergebnis wird durch `maxResultBytes` gedeckelt, nach normalisierten Tool- oder Pipeline-Fehlern, Policy-Ablehnungen und -Kurzschlüssen, Ersetzungen und Blocks sowie generischem Job-Status-Text; Schnitte bewahren UTF-8-Grenzen und reservieren Platz für einen Kürzungsmarker. Strukturierte Multi-Block-Policy-Ergebnisse behalten ihre Form. Die Mindest-Obergrenze von 64 Bytes hält jede registry-ausgestellte Session- oder Job-ID in ihrer Erstellungsbestätigung sichtbar.

### UI-Render-Intents

Foreground-Sends verwenden Terminal-Call- und Ergebnis-Karten; Hintergrund-Sends und die anderen fünf Tools verwenden generische `execute`-, `read`- oder `delete`-Karten. Keines der Tools emittiert Quellpositionen.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen von den generierten Schemas zum Service-Vertrag, dem Backend und der Hintergrund-Job-Oberfläche.

- [Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-terminal) — die sechs generierten Schemas und Ergebnisformen.
- [Terminal-Subsystem-Referenz](../../../docs/subsystems/terminal.de.md) — der Service-Vertrag und die geteilten Typen hinter den Tools.
- [Terminal-Service](../terminal/README.de.md) — Session-Operationen, Owner-Fencing und Cleanup-Semantik.
- [terminal-bash-Backend](../terminal-bash/README.de.md) — das ausgelieferte Shell-Backend, das Sessions bereitstellt.
- [Jobs-Paketkarte](../../jobs/README.de.md) — die Hintergrund-Job-Oberfläche, die Hintergrund-Sends abholt und stoppt.
- [Persistent-PTY-Agent-Note](../../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.de.md) — das Capability-Design und die zurückgestellten Grenzen.

-----

<a id="model-experience"></a>
## Model Experience

### System-Prompt

#### Was das Modell sieht

Das Plugin trägt diesen festen Anleitungsabschnitt bei:

##### Terminal-Anleitung

```markdown
Use a terminal session only when work needs persistent terminal state or interactive stdin; prefer shell/read/write/edit for bounded one-shot operations. Track every terminal session id and close sessions that no longer matter. An inferred_idle or timeout result does not prove the foreground command exited.
```

#### Token-Effekt

Kleine feste Eingabekosten bei jedem Request, solange das Plugin aktiv ist.

#### KV-Cache-Effekt

Präfix-stabil, solange Registrierungs-Scope und Anleitungstext unverändert sind.

### Tool-Schemas

#### Was das Modell sieht

Die sechs generierten Schemas sind im [`dsh-tool-terminal`-Katalogabschnitt](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-terminal) aufgelistet. Ihre festen Schema-Tokens sind vorhanden, wann immer dieses Plugin aktiv ist; Agent-scoped Tool-Filterung kann sie verbergen.

#### Token-Effekt

Feste Schema-Kosten bei Requests, bei denen die Tools sichtbar sind.

#### KV-Cache-Effekt

Präfix-stabil, solange Tool-Sichtbarkeit und -Definitionen unverändert sind.

### Tool-Ergebnisse und Task-Kontext

#### Was das Modell sieht

Spawn gibt die ID und begrenzte Start-Ausgabe zurück. Send und Read geben begrenzten Terminal-Text plus Bereitschafts- und Historie-Marker zurück. Der Hintergrund-Modus gibt eine generische Job-ID zurück. Jedes terminal-eigene Einzel-Text-Ergebnis ist durch `maxResultBytes` gedeckelt; Ergebnisse bleiben bis zur Compaction in der Session-Historie, und inkrementelle Task-Reads wiederholen keine konsumierte Ausgabe.

#### Token-Effekt

Terminal-eigene Ergebnisse sind datenabhängig und durch `maxResultBytes` begrenzt; jedes zurückgegebene Ergebnis bleibt bis zur Compaction in der Historie.

#### KV-Cache-Effekt

Nur anhängend; neue Ergebnisse folgen dem wiederverwendbaren Request-Präfix.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die fehlende modellseitige Oberfläche. Sie sind aktuelle Paket-Einschränkungen, kein Aufgabenstapel.

- **Keine TUI- oder Tastensequenz-Oberfläche** — benannte Tastensequenzen, Fullscreen-TUI-Interaktion, BEL, Resize und Auto-Start sind in keinem Schema exponiert.
- **Hintergrund-Modus erfordert die Job-Oberfläche** — `run_in_background` braucht sowohl `@deepseek-ai/dsh-jobs` als auch seinen modellseitigen Controller (`@deepseek-ai/dsh-tool-jobs`); ohne sie wird das Argument abgelehnt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Dieser zustandslose Adapter trägt Tools und Prompt-Anleitung bei, während PTY-Lifecycle und Hintergrund-Job-Beziehungen bei den Services bleiben, die er komponiert.
