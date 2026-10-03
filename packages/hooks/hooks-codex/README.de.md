---
description: "Führe deine bestehende Codex-hooks.json-Hook-Konfiguration während agent-Läufen aus — blockiere Prompts und Tools, hänge Kontext an oder erzwinge eine Fortsetzung — für Nutzer und Maintainer der Bridge."
kind: "package-reference"
---

# @deepseek-ai/dsh-hooks-codex
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-hooks-codex` führt Command-Hooks aus einer bestehenden Codex-`hooks.json` während agent-Läufen aus, sodass Prompt- und Tool-Gates ohne Neuschreiben funktionieren. Es unterstützt fünf Codex-Hook-Punkte: Session-Start, Prompt-Einreichung, vor und nach der Tool-Ausführung sowie Stop. Hooks können Prompts oder Tool-Calls mit modellsichtbaren Begründungen blockieren, Konversationskontext hinzufügen oder einen weiteren agent-Schritt erzwingen. Wähle dieses Paket, um Codex-Command-Hooks im Harness wiederzuverwenden; nutze ein natives Plugin für Verhalten außerhalb dieser unterstützten Teilmenge.

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

Mounte dieses Paket, zeige mit `configPath` auf deine `hooks.json`, und die Hooks, die du bereits hast, feuern zu den entsprechenden Momenten in agent-Läufen. Es gibt nichts weiter einzurichten, bevor der erste Hook wirkt.

### Wann es gewählt wird

Nutze es, wenn du eine Codex-`hooks.json` besitzt und deren Command-Hooks Prompts, Tools und Turns steuern sollen. Überspringe es für Verhalten ohne Codex-Entsprechung: Ein natives Plugin hat die volle Harness-API, während diese Bridge nur die Command-Hook-Teilmenge des Referenz-Tools ausführt.

### Kleinste funktionierende Konfiguration

```yaml
- name: '@deepseek-ai/dsh-hooks-codex'
  config:
    configPath: ./.codex/hooks.json
    model: deepseek-v4
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `configPath` | erforderlich | Pfad zu einer Codex-`hooks.json` |
| `model` | `''` | Model-Name, der auf jede Payload gestempelt wird (Codex enthält `model` bei jedem Event) |
| `defaultTimeoutMs` | `600,000` | Timeout pro Hook, wenn ein Hook keines setzt (der Codex-Default) |
| `stderrSummaryMaxChars` | `500` | Zeichen-Cap für die persistierte `hook/result`-stderr-Zusammenfassung |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-hooks-codex) ist die erschöpfende Quelle für jedes akzeptierte Feld.

### Was deine Hooks können

| Dein Hook | Wann er läuft | Was er kann |
|---|---|---|
| `SessionStart` | beim Start einer Session | Kontext anhängen, den das Model in dieser Session sieht |
| `UserPromptSubmit` | wenn der agent einen Prompt empfängt | den Prompt blockieren oder zusätzlichen Kontext anhängen |
| `PreToolUse` | bevor ein Tool läuft | das Tool blockieren |
| `PostToolUse` | nachdem ein Tool gelaufen ist | das Ergebnis mit Feedback blockieren oder zusätzlichen Kontext anhängen |
| `Stop` | wenn der Lauf zu stoppen droht | einen weiteren Schritt mit Begründung erzwingen |

### Wie Hooks laufen und scheitern

- Hooks laufen in deinem Projektverzeichnis — dem Session-Workspace des agent — sodass `pwd` und relative Pfade in deinen Hooks auf dein Projekt verweisen, nicht auf das Startverzeichnis des Servers.
- Eine Config gilt für den ganzen Prozess: Sie wird einmal beim Start gelesen, und ein relativer `configPath` wird aus dem Verzeichnis aufgelöst, das den Prozess gestartet hat.
- Nur synchrone Command-Hooks laufen; ein `async: true`- oder Nicht-Command-Hook wird mit einer Warnung übersprungen.
- Hooks auf demselben Event laufen nacheinander, in Config-Reihenfolge.
- Kann die Config nicht gelesen oder geparst werden, loggt die Bridge eine Warnung und führt keine Hooks aus — der agent startet trotzdem.
- Ein Hook, der nicht läuft (ein fehlerhaftes Kommando oder ein Crash), wird geloggt, und der agent läuft weiter.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter der Bridge und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Hook-Punkt-Mapping

Jedes unterstützte Event programmiert gegen einen Harness-Erweiterungspunkt: `SessionStart` emittiert Kontext in die neue Session (`agent/session-start`), `UserPromptSubmit` und `PreToolUse` sind waterfalls, die die eingehende Aktion ablehnen können (`agent/pre-step`, `tools/pre-execute`), `PostToolUse` ist ein waterfall, der mit Feedback blockieren oder der Downstream-Entscheidung Kontext hinzufügen kann (`tools/post-execute`), und `Stop` ist ein serieller Listener, dessen blockierendes Ergebnis über `steer()` einen weiteren Schritt erzwingt (`agent/turn-stopping`). Rein kontextgebende Hooks delegieren immer zuerst über `next()`, bevor sie eine quellenbehaftete Nachricht in die Downstream-Entscheidung falten, sodass ein späterer Listener noch ablehnen oder umschreiben kann; Blockierentscheidungen werden auf `deny` abgebildet (`PreToolUse` hat kein `allow` oder `ask`). Die verdrahtung pro Event liegt in [`src/index.ts`](src/index.ts).

### Payloads und Umgebung

Payloads sind Codex-förmig: snake_case mit `turn_id` bei turn-scoped Events, `model` und `permission_mode: "default"` bei jedem Event, und stdin wird ohne abschließenden Zeilenumbruch geschrieben. Die Payload eines Tool-Calls trägt den echten `tool_name` und die Form `tool_input: { command }` (das `command`-Argument, wenn vorhanden, sonst `''`), sodass Nicht-Shell-Tool-Argumente nicht getreu offengelegt werden. Die Basis-Payload trägt `session_id` und `transcript_path`; letzteres behält die Codex-Form `string | null`, ist aber immer `null` — der Persistenz-seam legt keine Artefaktpfade offen, und das standardmäßig zstd-komprimierte Session-Log ist für Hook-Skripte nicht lesbar. Codex führt keine Kommandosubstitution durch und injiziert keine Plugin-Umgebung.

### Matcher-Subjekte und serielle Ausführung

Das Matcher-Subjekt ist der Tool-Name (`PreToolUse` / `PostToolUse`) oder die Session-Quelle (`SessionStart`); `UserPromptSubmit` und `Stop` ignorieren Matcher. Codex-Matcher sind immer unverankerte Regexes. Gematchte Hooks laufen seriell in Config-Reihenfolge, was das `hook/invoked`/`hook/result`-Paar jedes Hooks im Log benachbart hält, und das restriktivste Falten ist reihenfolgeunabhängig (`deny > ask > allow`).

### Abgelöste Läufe und Dispose

`SessionStart` ist der einzige Emit-Punkt und läuft detached — kein Erweiterungspunkt wartet auf ihn. Jede Laufkette wird getrackt, und das Disposen der Bridge bricht einen noch laufenden Hook-Prozess ab und leert dann die Continuation, bevor das Dispose aufgelöst wird (`createDetachedRuns` in `dsh-hook-protocol`).

### Designphilosophie

- **Ein Kompatibilitätsadapter, kein Power-Tool.** Die Bridge existiert, um die explizit unterstützte Teilmenge einer bestehenden Codex-Config auszuführen; maßgeschneidertes Verhalten gehört in ein natives Plugin auf denselben Erweiterungspunkten.
- **Kontext hinzuzufügen ist kein Veto.** Ein rein kontextgebender Hook delegiert über `next()`, bevor er seine Nachricht in eine Downstream-Enter-Entscheidung faltet, sodass ein späterer `agent/pre-step`- oder `tools/post-execute`-Listener noch ablehnen oder umschreiben kann.
- **Eindämmung bei jedem Fehler.** Config-Lese-/Parse-Fehler und ungültige Matcher registrieren nichts; ein werfendes detached Inject wird gefangen und geloggt, statt den Session-Start oder den Loop zu brechen.
- **Dispose erreicht Quiescence.** Abgelöste Läufe werden getrackt und beim Dispose geleert, sodass kein Hook-Prozess oder später Callback das fiber überlebt.
- **Dialektförmig, nicht maximal.** Payloads bleiben snake_case mit `turn_id` / `model`, stdin trägt keinen abschließenden Zeilenumbruch, und die Bridge implementiert keinen Pre-Tool-Approval- oder Rewrite-Pfad — die Form des Protokolls wird bewahrt, auch wo der Harness mehr könnte.

Die [Hook-Bridges-Agent-Note](../../../.agents/notes/archived/feature/2026-06-30-hook-bridges.md) hält das Bridge-Design und die zurückgestellten Lücken fest; die [Hook-Protocol-Lib-Agent-Note](../../../.agents/notes/archived/feature/2026-06-30-hook-protocol-lib.md) hält die Shared-versus-per-Dialekt-Aufteilung fest.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Eintritt: Config-Validierung, Listener-Registrierung, Payloads pro Event, Entscheidungs-Mapping |
| [`src/config.ts`](src/config.ts) | Codex-Config-Parsing: die fünf unterstützten Events, Matcher-Validierung, Skip-Gründe |
| — | Es wird kein Runtime-Invariant-Begleiter veröffentlicht; diese Bridge publiziert Hook-Protokoll-Session-Events, deren Begleiter besitzt, welches Invocation-Event jedes Ergebnis zitiert. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen vom gemeinsamen Protokoll zum Bridge-Design und den Erweiterungspunkten, gegen die es programmiert.

- [Hooks-Gruppenkarte](../README.de.md) — die geschwisterliche Gruppenseite und ihre Pakettabelle.
- [Hook-Protokoll-Bibliothek](../hook-protocol/README.de.md) — die gemeinsamen Hook-Regeln, die diese Bridge anwendet.
- [Hook-Bridges-Agent-Note](../../../.agents/notes/archived/feature/2026-06-30-hook-bridges.md) — das Bridge-Design, das Entscheidungs-Mapping und die zurückgestellten Lücken.
- [Interception-Extension-Points-Agent-Note](../../../.agents/notes/implemented/feature/2026-06-30-interception-extension-points.de.md) — die typisierte Decision-Fläche, auf die die Bridge abbildet.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-hooks-codex) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

### Von Hooks gelieferter Kontext

#### Was das Model sieht

`SessionStart`-, akzeptierte Prompt- und Post-Tool-Hooks können quellenattribuierte Kontextnachrichten hinzufügen; ein blockierender `Stop`-Hook fügt seine Begründung als Next-Step-Steering hinzu.

#### Token-Effekt

Keine Kosten, wenn Hooks keinen Kontext zurückgeben. Hook-Text ist datenabhängig, wird geloggt und in späteren Konversationsanfragen erneut gesendet, bis zur Compaction.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Anfragepräfix und invalidiert keine vorhandenen KV-Cache-Einträge.

### Blockierter Prompt oder Tool-Ausgang

#### Was das Model sieht

Vom Provider gelieferte Begründungen werden wörtlich durchgereicht. Wenn sie fehlen, wird ein verweigertes Tool zu `Error: blocked by PreToolUse hook`, blockiertes Post-Tool-Feedback ist exakt `blocked by PostToolUse hook`, und ein blockierender Stop fügt exakt das Steering `continue: blocked by Stop hook` hinzu; ein blockierter Prompt wird ohne modellsichtbare Nachricht verworfen und beendet den Turn als `blocked`. Codex-`systemMessage` wird nicht angezeigt.

#### Token-Effekt

Das Blockieren eines Prompts entfernt die Request-Tokens dieses Prompts; Verweigerung oder Feedback fügt den aufbewahrten Fallback- oder Provider-Text hinzu; erzwungene Fortsetzung kostet eine weitere volle Anfrage.

#### KV-Cache-Effekt

Ein blockierter Prompt sendet keine Anfrage und invalidiert nichts. Verweigerungs-, Feedback- und Forced-Continuation-Kontext hängen nach dem wiederverwendbaren Präfix an, ohne es umzuschreiben.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen beschreiben, was deine Codex-Hooks durch diese Bridge noch nicht können und wo das Verhalten vom Referenz-Tool abweicht. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Nicht unterstützte Hook-Events (5 der aktuell 10 von Codex)** — `PermissionRequest`, `PreCompact`, `PostCompact`, `SubagentStart` und `SubagentStop`. Config für diese Events wird beim Parsen still verworfen. Die Vergleichsbasis ist Codex' [offizielle Hook-Referenz](https://learn.chatgpt.com/docs/hooks).
- **`SessionStart` ist partiell** — reines stdout und JSON-`additionalContext` funktionieren, aber der Hook läuft detached, sodass Kontext die erste Anfrage verpassen kann.
- **`UserPromptSubmit` ist partiell** — Blockieren plus reines stdout oder JSON-Kontext funktionieren, aber die üblichen `systemMessage`- und `{"continue": false}`-Steuerungen werden nicht durchgesetzt.
- **`PreToolUse` ist partiell** — Blockieren funktioniert, aber `additionalContext`, `permissionDecision: "allow"` und `updatedInput` werden ignoriert. Jedes Tool wird als `tool_input: { command }` dargestellt, sodass Nicht-Shell-Tool-Argumente dem Hook nicht getreu offengelegt werden.
- **`PostToolUse` ist partiell** — Blockierendes Feedback und JSON-`additionalContext` funktionieren, aber `{"continue": false}` wird nicht durchgesetzt, Nicht-Shell-Tool-Argumente werden auf `{ command }` reduziert, und strukturierter Tool-Output wird in `tool_response` zu Text plattgemacht.
- **`Stop` ist partiell** — Blockieren erzwingt einen weiteren Model-Turn, aber `stop_hook_active` ist immer `false`, `last_assistant_message` ist immer `null`, und `{"continue": false}` wird nicht durchgesetzt. Ein bedingungslos blockierender Hook erzwingt daher bei jedem Schritt eine Fortsetzung, sofern er sich nicht selbst begrenzt.
- **Gemeinsame Payload- und Output-Felder sind partiell** — jedes gemappte Event meldet das statisch konfigurierte `model` und `permission_mode: "default"` statt der aktuellen Codex-Runtime-Werte, und `transcript_path` wird nie befüllt: Es ist immer `null`, weil der Persistenz-seam keine Artefaktpfade offenlegt und das standardmäßig zstd-komprimierte Session-Log für Hook-Skripte nicht lesbar ist. `systemMessage` wird geloggt und gewarnt, aber nicht angezeigt, und `{"continue": false}` wird aufgezeichnet, wendet aber nicht Codex' eventspezifisches Stop-Verhalten an.
- **Config-Laden und Ausführung sind partiell** — ein prozessweiter `configPath` wird beim Laden geparst; Codex' aktive User-, Projekt-, Session-, System/Managed- und Plugin-Layer, Trust-Steuerungen und die Inline-`config.toml`-Hook-Form sind nicht implementiert. Es laufen nur synchrone `command`-Handler, aktuelle Metadaten wie `statusMessage` und `commandWindows` werden ignoriert, und gematchte Handler laufen seriell statt mit Codex' nebenläufiger Startsemantik.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und unentschiedene Richtungen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und angenommene Begründungen stehen in den Abschnitten oben, im Paketcode und in den verlinkten Agent Notes.

Die zurückgestellten Lücken oben sind die Arbeitswarteschlange: pro-Session-Hook-Config-Discovery, ein Session-Start-Delivery-Gate, ein Stop-Loop-Guard und ein laufweites Halt für `continue: false`. Keines davon hat ein Design; die offizielle Codex-Referenz ist die Basis zum Schließen jedes einzelnen.

</details>
