# Agent Note: Getaggte Render-Intent-Union für die Tool-Call-Darstellung

Status: implemented

[English](2026-07-02-tool-render-intent-union.md) | [中文](2026-07-02-tool-render-intent-union.zh.md) | Deutsch

> Die Render-Intent-Union bleibt aktuell für UI-Transports; ihr ACP-Mapping ist durch [ACP as an automation-only protocol](../simplification/2026-07-23-acp-automation-only-protocol.de.md) ersetzt.

## Problem

Ein Tool deklariert über zwei Callbacks — `presentCall`/`presentResult` auf `ToolDefinition` — wie seine Calls in einer UI (einer Tool-Call-Card eines Editors) rendern; diese returnen `ToolCallPresentation` / `ToolResultPresentation` mit optionaler `ToolTerminal`-Subform. Das wuchs inkrementell zu einem **Sack optionaler Felder**: `title`, `kind`, `rawInput`, `content`, `locations`, `terminal` auf dem Call; `title`, `content`, `terminal` auf dem Result; `cwd`/`output`/`exitCode`/`signal` auf `ToolTerminal`. Die Verantwortungsteilung ist trübe:

- Die `terminal`-Felder auf Call- und Result-Seite überlappen, und die Bridge vereinigt pro Call einen `content`-Block UND einen `terminal`-Block UND `rawInput`, zusammengenäht mit Ad-hoc-Conditionals.
- Welche Kombinationen *gültig* sind, ist ungeschrieben: Ein `terminal`-Call, der auch `content` setzt, heißt „Beschreibung über der Card"; ein generischer Call, der `terminal` setzt, ist bedeutungslos, aber darstellbar. Der Typ erlaubt Unsinn.
- Es gibt keinen Weg, die eine File-Tool-Affordance auszudrücken, die ein Editor am meisten will — eine **Diff-Card** (`{path, oldText, newText}`, die Zed als Inline-Diff / New-File-Preview rendert). `ToolCallPresentation.content` ist das *LLM*-`ContentBlock[]`-Vokabular (Text/Bild), sodass ein Tool buchstäblich nicht nach einer Diff fragen kann.

Ein früherer verworfener collapse-tool-owned-presentation-Vorschlag vertagte reichhaltiges Rendering, bis es „als getaggte Render-Intent-Union zurückkehren kann, sobald es mindestens zwei echte Tools und zwei echte Consumer gibt, um das Vokabular zu validieren". Diese Messlatte ist durch mehrere Produzentenfamilien plus die TUI- und Host/Client-Runtime-Consumer (Web) erreicht.

## Entscheidung

Den Optional-Field-Sack durch eine **`card`-getaggte diskriminierte Union** ersetzen. Ein Tool deklariert einen Render-Intent pro Call/Result; die Bridge switcht auf dem Tag.

```ts ignore-check
type FileLocation = { path: string; line?: number }
type FileDiff = { path: string; oldText: string | null; newText: string } // oldText null ⇒ new file

// presentCall → ToolCallView
type ToolCallView = GenericCallView | TerminalCallView | DiffCallView
interface GenericCallView { card: 'generic'; title: string; kind?: ToolCallKind; rawInput?: unknown; content?: ContentBlock[]; locations?: FileLocation[] }
interface TerminalCallView { card: 'terminal'; title: string; description?: string; cwd?: string }
interface DiffCallView { card: 'diff'; title: string; diffs: FileDiff[]; locations?: FileLocation[] }

// presentResult → ToolResultView
type ToolResultView = GenericResultView | TerminalResultView
interface GenericResultView { card: 'generic'; title?: string; content?: ContentBlock[] }
interface TerminalResultView { card: 'terminal'; title?: string; output?: string; exitCode?: number; signal?: string }
```

`card` ist auf jeder Variante **erforderlich** — ein echtes Diskriminant, kein optionaler Default. Die Bridge macht `switch (view.card) { case 'generic': … case 'terminal': … case 'diff': … default: assertNever(view) }`. Die Union ist **geschlossen** (gemäß der [Switch-Exhaustiveness-Konvention](../../../../AGENTS.md)): Ein vierter Render-Intent (eine Tabelle, ein Chart) braucht ohnehin neuen Bridge-Code zum Rendern, also wäre eine vom Plugin hinzugefügte Variante, die die Bridge still droppt, schlimmer als ein Compile-Fehler. Das Hinzufügen einer Variante bricht die Kompilierung am Bridge-Switch — genau das gewünschte Signal.

### Warum eine getaggte Union den Field-Sack schlägt

- **Ungültige Zustände werden undarstellbar.** Eine Generic-Card kann keine Terminal-Ausgabe tragen; eine Terminal-Card kann keine Diff tragen. Der alte Sack erlaubte all das.
- **Consumer switchen statt zu nähen.** Ein Arm pro Card-Art erzeugt exakt die View, die diese Card braucht — statt fünf optionale Felder zu vereinigen, deren Wechselwirkungen undokumentiert sind.
- **`diff` ist ein First-Class-Intent.** `dsh-tool-fs` write/edit deklarieren `card:'diff'` mit `{path, oldText, newText}` und erlauben fähigen UIs ein Inline-Change-Rendering ohne Tool-Name-Special-Cases.

### Produzenten-Mapping

- `dsh-tool-fs` read → `generic` (`kind:'read'`, ein Follow-along-`location`); write → `diff` (`oldText:null`); edit → `diff` (`oldText:old_string || null`, `newText:new_string ?? ''`). Das spiegelt `claude-agent-acp`s `toolInfoFromToolUse`-Read/Write/Edit-Arme Feld für Feld.
- `dsh-tool-bash` foreground → `terminal`-Call + `terminal`-Result; `run_in_background` → `generic`. Die generischen `job_*`-Controls besitzen ihre eigenen Generic-Cards.
- `dsh-tool-todo` → `generic`.

### Terminal-Fallback-Eigentümerschaft

`TerminalResultView` trägt nur `output`/`exitCode`/`signal`. Eine UI ohne die Terminal-Capability braucht einen gefencten ` ```console `-Text-Fallback; diese Ableitung zieht in die **Bridge** (sie wrapped `output` auf dem No-Capability-Pfad in einen gefencten Block), statt dass das Tool es doppelt enkodiert. So bleibt das Result des Bash-Tools eine einzelne strukturierte Form, und das vorhandene Capability-Gating-Verhalten bleibt Byte für Byte erhalten.

Der Terminal-Intent ist reine Anzeige. Der Harness führt den Befehl weiter über seinen Bash-Service aus — mit Sandboxing, Environment-Scrubbing, Job-Ownership und Per-Session-cwd; eine UI projiziert den abgeschlossenen Call und wird niemals ein zweites Execution-Backend.

### Reinheit bewahrt

`presentCall`/`presentResult` bleiben reine Funktionen von `args` (plus dem Result für `presentResult`) — sie laufen auf Live-Streaming UND Session-Log-Replay und müssen daher replay-deterministisch sein. Jede View wird allein aus args abgeleitet: Writes Diff ist New-File-Stil (`oldText:null`), weil das Tool zur Call-Zeit keinen alten Inhalt hat; Edits Diff ist `old_string`→`new_string`.

## Erwogene Alternativen

- **Tool-Owned-Presentation komplett streichen** — der verworfene Collapse-Vorschlag, den diese Note ersetzt; sein eigenes Urteil vertagte auf genau diese Union, sobald zwei echte Tools und zwei echte Consumer existieren, und diese Messlatte ist jetzt erreicht.
- **Eine UI Terminal-Intents ausführen lassen** — verworfen, weil sie die Bash-Policy- und Ownership-Contracts des Harness umgehen und die Befehlsausführung über Backends hinweg spalten würde. Eine Terminal-Card beschreibt Harness-eigene Ausführung; sie autorisiert niemals clientseitige Ausführung.
- **Eine merge-erweiterbare Union** (das `ContentBlockMap`-Pattern) — verworfen: Ein neuer Render-Intent braucht ohnehin neuen Bridge-Code zum Rendern, also wäre eine vom Plugin hinzugefügte Variante, die die Bridge still droppt, schlimmer als der Compile-Fehler, den die geschlossene Union am `assertNever`-Switch der Bridge wirft.
- **Den Optional-Field-Sack behalten** — der Status quo, den das Problem zerlegt: darstellbare ungültige Zustände, undokumentierte Feld-Wechselwirkungen und kein Weg, überhaupt nach einer Diff-Card zu fragen.

## Konsequenzen

Ein neuer Render-Intent ist ein Compile-breakender Change am Bridge-Switch — absichtlich: Rendering-Code muss existieren, bevor eine Card-Art es tut. Ungültige Card-/Feld-Kombinationen sind jetzt undarstellbar, und die Bash-Fallback-Ableitung lebt in der Bridge, sodass ein Tool eine einzelne strukturierte Form returnt. Die Messlatte für eine vierte Card (eine Tabelle, ein Chart) ist, ihren Bridge-Arm im selben Change zu schreiben.

## Non-Goals

- **Live inkrementelles `terminal_output_delta`-Streaming** und **Befehlsklassifikation** — die eigenen vertagten Follow-ups der Terminal-Rendering-Note, hier unberührt.

## Verwandt

- Ersetzt den Aufschub im früheren verworfenen collapse-tool-owned-presentation-Vorschlag (verworfen — „auf zwei echte Tools und zwei echte Consumer warten, dann eine getaggte Render-Intent-Union"). Diese Messlatte ist jetzt erreicht; dies ist jene Union.
- Erweitert durch [Result-time applied-hunk diffs](../../archived/architecture/2026-07-02-result-time-applied-hunk-diffs.md) (archiviert), die einen persistierten `meta`-Channel hinzufügten — der Value/Presentation-Split und der persistierte `presentationMeta`-Channel werden jetzt vom [canonical tool output contract](2026-07-20-canonical-tool-output-contract.md) besessen, sodass write/edit eine Result-time-`DiffResultView` — die applizierte Änderung (ein kontextueller Hunk mit Kontextzeilen / einer pro `replace_all`-Stelle, oder eine Whole-File-Diff bei einem Create) — zusätzlich zur Call-time-Diff-Card dieser Union emittieren.
- Faltet `ToolTerminal` in die getaggten `terminal`-Views, die aktuelle UI-Transports nutzen.
