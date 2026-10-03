---
description: "Führe deine vorhandene Claude-Code-hooks.json- oder settings-hook-Konfiguration während agent-Läufen aus — blockiere prompts und tools, hänge Kontext an oder erzwinge Fortsetzung — für Nutzer und Maintainer der Bridge."
kind: "package-reference"
---

# @deepseek-ai/dsh-hooks-claude-code
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-hooks-claude-code` führt command-hooks aus deiner vorhandenen Claude-Code-`hooks.json` oder settings-Datei während agent-Läufen aus, ohne dass du umschreiben musst. Unterstützte hooks können laufen, wenn sessions, prompts, tools, stops oder subagents passende Momente erreichen. Sie können prompts oder tool calls mit modell-sichtbaren Gründen blockieren, Konversationskontext anhängen oder einen weiteren Modell-turn erzwingen. Wähle dieses Paket, um Claude-Code-command-hooks im harness wiederzuverwenden; für Verhalten ohne Claude-Code-Entsprechung verwende ein natives Plugin.

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

Mounte dieses Paket, zeige mit `configPath` auf deine hook-Konfiguration, und die hooks, die du bereits hast, beginnen zu den entsprechenden Momenten in agent-Läufen zu feuern. Bevor der erste hook funktioniert, ist nichts weiter einzurichten.

### Wann es sich lohnt

Verwende es, wenn du eine Claude-Code-`hooks.json` besitzt (oder eine settings-Datei, deren `hooks`-Schlüssel die Konfiguration trägt) und deren command-hooks prompts, tools und turns bewachen sollen. Überspringe es für Verhalten ohne Claude-Code-Entsprechung: Ein natives Plugin hat die volle harness-API, während diese Bridge nur die command-hook-Teilmenge des Referenz-tools ausführt.

### Kleinste funktionierende Einrichtung

```yaml
- name: '@deepseek-ai/dsh-hooks-claude-code'
  config:
    configPath: ./.claude/hooks.json
    pluginRoot: ./.claude/plugins/my-plugin
    projectDir: .
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `configPath` | erforderlich | Pfad zu einer `hooks.json` oder einer settings-Datei, deren `hooks`-Schlüssel die Konfiguration trägt |
| `pluginRoot` | — | Ersetzt `${CLAUDE_PLUGIN_ROOT}` in Befehlsstrings |
| `projectDir` | session-Workspace | Ersetzt `${CLAUDE_PROJECT_DIR}` und setzt die env-Variable `CLAUDE_PROJECT_DIR` |
| `defaultTimeoutMs` | `600,000` | Timeout pro hook, wenn ein hook keins setzt (der Claude-Code-Standard) |
| `stderrSummaryMaxChars` | `500` | Zeichenobergrenze für die persistierte `hook/result`-stderr-Zusammenfassung |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-hooks-claude-code) ist die erschöpfende Quelle für jedes akzeptierte Feld.

### Was deine hooks können

| Dein hook | Wann er läuft | Was er kann |
|---|---|---|
| `SessionStart` | wenn eine session startet | Kontext anhängen, den das Modell in dieser session sieht |
| `UserPromptSubmit` | wenn der agent einen prompt empfängt | den prompt blockieren oder zusätzlichen Kontext anhängen |
| `PreToolUse` | bevor ein tool läuft | das tool blockieren oder vor dem Lauf um Freigabe bitten |
| `PostToolUse` | nachdem ein tool gelaufen ist | das Ergebnis mit Feedback blockieren oder zusätzlichen Kontext anhängen |
| `Stop` | wenn der Lauf kurz vor dem Stoppen steht | einen weiteren step mit Begründung erzwingen |
| `SubagentStart` | wenn ein subagent startet | Kontext an einen noch laufenden subagent anhängen (nur im selben Prozess) |
| `SubagentStop` | wenn ein subagent endet | nur beobachten — kann nicht blockieren oder Kontext hinzufügen |

### Wie hooks laufen und fehlschlagen

- Hooks laufen in deinem Projektverzeichnis — dem session-Workspace des agents —, sodass sich `pwd` und relative Pfade in deinen hooks auf dein Projekt beziehen, nicht auf das Startverzeichnis des Servers.
- `${CLAUDE_PLUGIN_ROOT}` und `${CLAUDE_PROJECT_DIR}` in Befehlsstrings werden aus deiner Konfiguration ersetzt, und `CLAUDE_PROJECT_DIR` wird für jeden hook-Prozess gesetzt.
- Eine Konfiguration gilt für den ganzen Prozess: Sie wird einmal beim Start gelesen, und ein relativer `configPath` löst sich aus dem Verzeichnis auf, das den Prozess gestartet hat.
- Hooks auf demselben Ereignis laufen nacheinander in Konfigurationsreihenfolge.
- Kann die Konfiguration nicht gelesen oder geparst werden, loggt die Bridge eine Warnung und führt keine hooks aus — der agent startet trotzdem.
- Ein hook, dessen Ausführung fehlschlägt (schlechter Befehl oder Absturz), wird geloggt, und der agent läuft weiter.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Design-Entscheidungen hinter der Bridge und zeigt auf den Code, der sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig abgedeckt.

### Hook-Punkt-Abbildung

Jedes unterstützte Ereignis programmiert gegen einen harness-extension-point: `SessionStart` emittiert Kontext in die neue session (`agent/session-start`), `UserPromptSubmit` und `PreToolUse` sind waterfalls, die die eingehende Aktion ablehnen können (`agent/pre-step`, `tools/pre-execute`), `PostToolUse` ist ein waterfall, der mit Feedback blockieren oder der Downstream-Entscheidung Kontext hinzufügen kann (`tools/post-execute`), und `Stop` ist ein serieller Listener, dessen blockierendes Ergebnis über `steer()` einen weiteren step erzwingt (`agent/turn-stopping`). Die zwei subagent-Ereignisse emittieren in den child-Lifecycle (`subagent/start`, `subagent/end`): start injiziert Kontext in ein lebendes prozessinternes Kind, stop beobachtet nur. Reine Kontext-hooks delegieren immer zuerst über `next()`, bevor sie eine quell-markierte Nachricht in die Downstream-Entscheidung falten, sodass ein späterer Listener noch ablehnen oder umschreiben kann; blockierende Entscheidungen bilden auf `deny` ab (für `PreToolUse` auf `ask`). Die Verdrahtung pro Ereignis liegt in [`src/index.ts`](src/index.ts).

### Nutzlasten und Umgebung

Die Bridge baut die stdin-Nutzlast jedes Ereignisses aus einer Basis von `session_id`, string-förmigem `transcript_path`, `cwd` und `hook_event_name` plus ereignis-spezifischen Feldern. `transcript_path` bleibt aus Kompatibilitätsgründen in der Nutzlast, ist aber immer `''`: Die persistence-seam legt keine artifact-Pfade offen, und das standardmäßig zstd-komprimierte session-Log ist für hook-Skripte nicht lesbar. `CLAUDE_PROJECT_DIR` fällt pro Lauf auf den session-Workspace zurück, wenn `projectDir` weggelassen wird — dasselbe Verzeichnis, in dem der hook läuft; die Substitution von `${CLAUDE_PLUGIN_ROOT}` und `${CLAUDE_PROJECT_DIR}` geschieht zum Konfigurations-Parse-Zeitpunkt.

### Matcher-Subjekte und serielle Ausführung

Das matcher-Subjekt ist der tool-Name (`PreToolUse` / `PostToolUse`), die session-Quelle (`SessionStart`) oder der konstante `agent_type` `general-purpose` (`SubagentStart` / `SubagentStop` — die subagent-seam trägt kein Label pro kind); `UserPromptSubmit` und `Stop` ignorieren matcher. Gematchte hooks laufen seriell in Konfigurationsreihenfolge, was jedes `hook/invoked`-/`hook/result`-Paar im Log benachbart hält, und das restriktivste fold ist reihenfolgeunabhängig (`deny > ask > allow`).

### Detached-Läufe und dispose

Die drei emit-Punkte (`SessionStart`, `SubagentStart`, `SubagentStop`) laufen detached — kein extension-point wartet auf sie. Jede Lauf-Kette wird verfolgt, und das dispose der Bridge bricht noch laufende hook-Prozesse ab und leert dann die Fortsetzungen, bevor das dispose aufgelöst wird (`createDetachedRuns` in `dsh-hook-protocol`).

### Designphilosophie

- **Ein Kompatibilitäts-adapter, kein Power-tool.** Die Bridge existiert, um die explizit unterstützte command-hook-Teilmenge einer vorhandenen Claude-Code-Konfiguration auszuführen; maßgeschneidertes Verhalten gehört in ein natives Plugin auf denselben extension-points.
- **Kontext hinzuzufügen ist kein Veto.** Ein reiner Kontext-hook delegiert über `next()`, bevor er seine Nachricht in eine Downstream-enter-Entscheidung faltet, sodass ein späterer `agent/pre-step`- oder `tools/post-execute`-Listener noch ablehnen oder umschreiben kann.
- **Containment bei jedem Fehler.** Konfigurations-Lese-/-Parse-Fehler und ungültige matcher registrieren nichts; ein werfender detached-Inject wird abgefangen und geloggt, statt den session-Start oder den loop zu brechen.
- **Dispose erreicht quiescence.** Detached-Läufe werden verfolgt und beim dispose geleert, sodass kein hook-Prozess oder später Callback die fiber überlebt.
- **Seriell, nicht nebenläufig.** Gematchte hooks laufen seriell in Konfigurationsreihenfolge: Jedes `hook/invoked`-/`hook/result`-Paar bleibt im Log benachbart, und das Entscheidungs-fold ist reihenfolgeunabhängig — das Ergebnis entspricht also dem nebenläufigen Start der Referenz-Engines zum Preis serialisierter Latenz.

Die [hook-bridges Agent Note](../../../.agents/notes/archived/feature/2026-06-30-hook-bridges.md) zeichnet das Bridge-Design und die zurückgestellten Lücken auf; die [hook-protocol-lib Agent Note](../../../.agents/notes/archived/feature/2026-06-30-hook-protocol-lib.md) zeichnet die geteilt-gegen-pro-Dialekt-Aufteilung auf.

### Quelltext-Karte

| Datei | Aufgabe |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: config-Validierung, Listener-Registrierung, Nutzlasten pro Ereignis, Entscheidungsabbildung |
| [`src/config.ts`](src/config.ts) | Claude-Code-Konfigurations-Parsing: unterstützte Ereignisse, matcher-Validierung, Befehlssubstitution |
| — | Es wird kein Runtime-Invarianten-companion veröffentlicht; diese Bridge veröffentlicht hook-protocol-session-Ereignisse, deren companion besitzt, welches Aufruf-Ereignis jedes Ergebnis zitiert. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-vertrag nicht ausreicht. Sie führen vom geteilten Protokoll zum Bridge-Design und den extension-points, gegen die es programmiert.

- [Hooks-Gruppenkarte](../README.de.md) — die Schwester-Gruppenseite und ihre Paket-Tabelle.
- [Hook-protocol-Bibliothek](../hook-protocol/README.de.md) — die geteilten hook-Regeln, die diese Bridge anwendet.
- [Hook-bridges Agent Note](../../../.agents/notes/archived/feature/2026-06-30-hook-bridges.md) — das Bridge-Design, die Entscheidungsabbildung und die zurückgestellten Lücken.
- [Interception-extension-points Agent Note](../../../.agents/notes/implemented/feature/2026-06-30-interception-extension-points.de.md) — die typisierte Decision-Oberfläche, auf die die Bridge abbildet.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-hooks-claude-code) — jedes akzeptierte config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

### Von hooks gelieferter Kontext

#### Was das Modell sieht

`SessionStart`-, akzeptierte prompt-, post-tool- und live prozessinterne subagent-start-hooks können quell-zugeordnete Kontextnachrichten hinzufügen; ein blockierender `Stop`-hook fügt seinen Grund als steering für den nächsten step hinzu. Remote-child-Injektion hat kein lokales Ziel.

#### Token-Wirkung

Keine Kosten, wenn hooks keinen Kontext zurückgeben. hook-Text ist datenabhängig, wird geloggt und in späteren Konversationsanfragen bis zur compaction erneut gesendet.

#### KV-Cache-Wirkung

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Anfrage-Prefix und macht bestehende KV-Cache-Einträge nicht ungültig.

### Blockierter prompt oder tool-Ausgang

#### Was das Modell sieht

Vom Provider gelieferte Gründe werden wörtlich durchgereicht. Fehlen sie, wird ein abgelehntes tool zu `Error: blocked by PreToolUse hook`, blockiertes post-tool-Feedback ist exakt `blocked by PostToolUse hook`, und ein blockierender stop fügt exakt das steering `continue: blocked by Stop hook` hinzu; ein blockierter prompt wird ohne modell-sichtbare Nachricht verworfen und beendet den turn als `blocked`. `systemMessage` und `updatedInput` werden geloggt oder verwarnt, sind aber in dieser Implementierung nicht modell-sichtbar.

#### Token-Wirkung

Das Blockieren eines prompts entfernt die Anfrage-tokens dieses prompts; Ablehnung oder Feedback fügt den zurückbehaltenen fallback- oder Provider-Text hinzu; erzwungene Fortsetzung kostet eine weitere volle Anfrage.

#### KV-Cache-Wirkung

Ein blockierter prompt sendet keine Anfrage und macht nichts ungültig. Ablehnungs-, Feedback- und Erzwungene-Fortsetzung-Kontext hängen hinter dem wiederverwendbaren Prefix an, ohne es umzuschreiben.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen beschreiben, was deine Claude-Code-hooks über diese Bridge noch nicht können und wo das Verhalten vom Referenz-tool abweicht. Es sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Nicht unterstützte hook-Ereignisse (23 der aktuell 30 von Claude Code)** — `Setup`, `InstructionsLoaded`, `UserPromptExpansion`, `MessageDisplay`, `PermissionRequest`, `PostToolUseFailure`, `PostToolBatch`, `PermissionDenied`, `Notification`, `TaskCreated`, `TaskCompleted`, `StopFailure`, `TeammateIdle`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `SessionEnd`, `Elicitation` und `ElicitationResult`. Konfiguration für diese Ereignisse wird vor dem Gruppen-Parsing ignoriert, sodass ein nicht unterstütztes Ereignis weder ungültig machen noch hooks registrieren kann. Vergleichsbasis ist Claude Codes [offizielle hook-Ereignis-Referenz](https://code.claude.com/docs/en/hooks#hook-events).
- **`SessionStart` ist partiell** — JSON-`additionalContext` wird konsumiert, aber reiner stdout-Kontext, `initialUserMessage`, `sessionTitle`, `watchPaths`, `reloadSkills` und `CLAUDE_ENV_FILE` werden nicht unterstützt. Der hook läuft detached, sodass Kontext die erste Anfrage verpassen kann, und die Nutzlast lässt optionale Felder wie `model`, `agent_type` und `session_title` weg.
- **`UserPromptSubmit` ist partiell** — Blockieren und JSON-`additionalContext` funktionieren, aber reiner stdout-Kontext, `sessionTitle` und `suppressOriginalPrompt` werden nicht unterstützt. Sofern nicht überschrieben, verwendet die Bridge außerdem ihren 600-Sekunden-Standard statt Claude Codes ereignis-spezifischem 30-Sekunden-Befehls-Timeout.
- **`PreToolUse` ist partiell** — `deny`- und `ask`-Entscheidungen funktionieren; `allow` genehmigt nicht vorab, `defer` wird nicht unterstützt, `additionalContext` wird ignoriert, und `updatedInput` wird geloggt + verwarnt, aber nicht befolgt ([die pre-tool-input-rewrite Agent Note](../../../.agents/notes/proposed/feature/2026-06-30-pre-tool-input-rewrite.de.md)).
- **`PostToolUse` ist partiell** — blockierendes Feedback und JSON-`additionalContext` funktionieren, aber `updatedToolOutput` und `updatedMCPToolOutput` werden nicht unterstützt, und `tool_response` wird zu Text abgeflacht.
- **`SubagentStart` und `SubagentStop` sind partiell** — beide melden einen konstanten `agent_type` `general-purpose` und verwenden die child-session-id dort, wo Claude Code die parent-session meldet. Start-Kontext ist best-effort und kann nur ein lebendes prozessinternes Kind erreichen; stop ist nur beobachtend und kann den subagent weder blockieren noch mit Kontext füttern. Stop lässt `agent_transcript_path`, `last_assistant_message`, `background_tasks` und `session_crons` weg und meldet immer `stop_hook_active: false`.
- **`Stop` ist partiell** — Blockieren erzwingt einen weiteren Modell-turn, aber `stop_hook_active` ist immer `false`, `last_assistant_message`, `background_tasks` und `session_crons` werden weggelassen, und die Obergrenze für aufeinanderfolgende Blockierungen ist nicht implementiert. Ein bedingungslos blockierender hook erzwingt daher bei jedem step Fortsetzung, sofern er sich nicht selbst begrenzt.
- **Gemeinsame Nutzlast- und Ausgabefelder sind partiell** — abgebildete Ereignis-Nutzlasten lassen `prompt_id`, `permission_mode` und `effort` weg, die Claude Code liefern würde, und `transcript_path` wird nie befüllt: Es ist immer der leere String, weil die persistence-seam keine artifact-Pfade offenlegt und das standardmäßig zstd-komprimierte session-Log für hook-Skripte nicht lesbar ist. `systemMessage` wird geloggt + verwarnt, aber nicht sichtbar gemacht; `{"continue": false}` wird aufgezeichnet, hält den Lauf aber nicht an; `suppressOutput`, `stopReason` und `terminalSequence` werden nicht angewendet.
- **Handler- und Konfigurationsunterstützung ist partiell** — nur command-handler in Shell-Form laufen. `http`-, `mcp_tool`-, `prompt`- und `agent`-Handler werden übersprungen; command-handler-Optionen wie `args`, `async`, `asyncRewake`, `shell`, `if`, `once` und `statusMessage` werden nicht befolgt. Passende handler laufen seriell und werden nicht dedupliziert, während Claude Code sie parallel laufen lässt und identische handler dedupliziert. Ein prozessebener `configPath` wird einmal beim Laden geparst; Claude Codes geschichtete Projekt-, Nutzer-, Plugin- und policy-Discovery sowie Live-Reload sind nicht implementiert.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und unentschiedene Richtungen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen stehen in den Abschnitten oben, im Paket-Code und in den verlinkten Agent Notes.

Die oben zurückgestellten Lücken sind die Arbeitswarteschlange: pro-session-hook-Konfigurations-Discovery, ein session-start-Zustellungs-Gate, ein stop-Schleifen-Schutz und ein lauf-ebener Halt für `continue: false`. Für keine existiert ein Design; die offizielle Claude-Code-Referenz ist die Basis zum Schließen jeder einzelnen.

</details>
