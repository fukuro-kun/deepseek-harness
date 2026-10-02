---
description: "Der One-Shot-Claude-Code-Subagent-Provider für Anwender und Maintainer, die ein Produkt-Backend auswählen, ein Profile-Bundle installieren oder eine unbeaufsichtigte Claude-Code-Delegation konfigurieren."
kind: "package-bundle"
---

# @deepseek-ai/dsh-subagent-claude-code

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Installiere dieses Profile-Bundle, wenn eine delegierte Aufgabe als frische, unbeaufsichtigte Claude-Code-Session im Parent-Workspace laufen soll. Jeder Lauf akzeptiert eine eigenständige Textaufgabe und liefert die finale Antwort oder eine sichere Fehlerdiagnose; Reasoning, Tool-Verkehr, stderr, Usage und Workspace-Diffs bleiben außerhalb der Parent-Session. Native Claude-Settings und -Authentifizierung bleiben maßgeblich, während die Profile-Konfiguration Modell, Environment und `permissionMode` wählt. Die plattform-gepinnte Runtime startet bei Bedarf und fällt niemals auf das `claude`-Executable des Hosts zurück. Wähle es, wenn Isolation und echtes Claude-Code-Verhalten wichtiger sind als Fortsetzung oder Prompts.

## Inhalt

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounte diesen Provider, wenn eine Delegation als echte Claude-Code-Session im Workspace des Parents laufen soll. Der übliche Weg ist explizit: Installiere das Bundle in ein Profile, konfiguriere optional die Provider-Zeile und exponiere es dem Modell über eine Delegation-Tool-Zeile.

### Das Bundle installieren

Installiere das Paket in das Ziel-Profile und starte dieses Profile anschließend neu. Die Installation bringt das gepinnte Agent SDK und eine kompatible Plattform-CLI-Payload in das Profile; die deklarierte Patch-Schicht registriert nur den dormanten Provider und startet keinen Claude-Prozess.

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-claude-code
dsh plugin --profile <name> remove @deepseek-ai/dsh-subagent-claude-code
dsh --profile <name>
```

Das Entfernen des Pakets zieht den Provider und seinen privaten Runtime-Closure beim nächsten Profile-Start zurück. Die Installation steuert die Host-Verfügbarkeit, nicht die Modell-Berechtigung: Das Modell erreicht den Provider nur über eine Delegation-Tool-Zeile, die du komponierst.

### Konfiguration

| Feld | Default | Bedeutung |
|---|---|---|
| `providerName` | `claude-code` | Nicht-leerer Registry-Name auf `ctx.subagents`; jede gemountete Instanz braucht einen eindeutigen Wert |
| `model` | native Claude-Settings | Optionaler nicht-leerer Modellname, für jeden Lauf dieser Provider-Instanz fixiert; Weglassung sendet kein SDK-Override |
| `env` | `{}` | Explizites SDK/CLI-Environment, über das von Credentials bereinigte Parent-Environment gelegt |
| `permissionMode` | `dontAsk` | Native nicht-interaktive Permission-Policy, für jeden Lauf dieser Provider-Instanz fixiert |
| `disposeGraceMs` | `3000` | Karenzzeit zwischen den Termination-Tiers des geteilten Managed-Range-Owners |

| `permissionMode`-Wert | Natives Verhalten |
|---|---|
| `dontAsk` | Operationen ablehnen, die nicht bereits autorisiert sind, statt zu prompten |
| `acceptEdits` | Datei-Edits akzeptieren; jeder verbleibende Permission-Prompt wird vom unbeaufsichtigten Callback abgelehnt |
| `auto` | Den nativen Klassifikator von Claude Code Permission-Anfragen erlauben oder ablehnen lassen |
| `plan` | Im nativen Planungsmodus laufen, Ausführungs-Approval ablehnen und den fertigen Plan als finale Antwort zurückgeben |
| `bypassPermissions` | Die gefährliche Bestätigung des SDK explizit setzen und Permission-Checks umgehen |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-subagent-claude-code) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc. Ein konfiguriertes `model` wird unverändert an jede Query dieser Provider-Instanz weitergereicht; Weglassung belässt die native Modellauswahl in Kraft. Credential-förmige Umgebungsvariablen werden entfernt, bevor das explizite `env`-Overlay greift, sodass ein für das Child bestimmter API-Key dort geliefert werden muss. Der Provider lässt die SDK-Option `settingSources` weg, sodass Claude Code die normalen User-, Projekt- und lokalen Settings des Hosts relativ zum Parent-Session-cwd liest. Er kopiert oder filtert diese Dateien nicht, erzeugt oder verändert keinen Login-State, inspiziert `PATH` nicht und fällt nicht auf ein `claude`-Executable des Hosts zurück.

### Das Tool exponieren

Jede Delegation-Tool-Zeile benennt einen Provider und braucht ein eigenes `toolName`, sodass das Modell statische Tools sieht statt eines dynamischen Provider-Selektors. Vollständige Agent-Presets tragen eine passende Default-Tool-Zeile mit `disabled: true`; kopiere ein Preset und entferne dieses Feld, um `subagent_claude_code` nur den aus der Kopie komponierten Agents zu exponieren.

```yaml
- id: jobs
  name: '@deepseek-ai/dsh-jobs-local'
- id: tool-jobs
  name: '@deepseek-ai/dsh-tool-jobs'
- id: tool-subagent-claude
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: claude-code
    toolName: subagent_claude_code
    backgroundMode: one-shot
    maxDepth: provider-managed
```

Die `one-shot`-Policy hält Calls mit weggelassenem oder `false` `run_in_background` im Vordergrund, während explizites `true` eine Parent-eigene Job-ID für `job_output` oder `job_kill` zurückgibt; der Base-Host und die vollständigen Presets stellen die generische Job-Registry und -Kontrollen bereits bereit.

### Was du bekommst

Ein Foreground-Call gibt dem Modell die strikte finale Claude-Code-Antwort oder einen Fehler mit Abbruchgrund und optionaler sicherer Diagnose für einen fehlgeschlagenen Lauf. Ein Background-Call liefert zuerst eine Job-ID; die generischen Job-Kontrollen liefern später eine Completion-Notice und exponieren dieselbe finale Antwort oder denselben Failed-Status über `job_output`. Claude-Code-Reasoning, Tool-Aktivität, Zwischennachrichten, stderr und Workspace-Diffs gelangen niemals in die Parent-Session.

### Fehler und Recovery

Eine Installation, die optionale Dependencies weglässt, eine nicht unterstützte Plattform verwendet oder die gewählte Payload verliert, lässt den Provider dormant und lässt die erste Delegation an der SDK-Startup-Grenze mit einer sicheren `query-start`-/`unknown`-Fehlertatsache fehlschlagen; es gibt keinen Host-CLI-Fallback. Der ursprüngliche Produktfehler bleibt in der internen Cause-Chain und im Host-Log des Providers. Ein abgebrochener Lauf wird als `aborted` abgerechnet.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen</summary>

Dieser Abschnitt erklärt, wie der Provider eine echte Claude-Code-CLI treibt und woher das beobachtbare Verhalten kommt; der vollständige Vertrag steht in [Dieses Paket verwenden](#use-this-package).

### Designkonzept

- **Eine frische Query pro Lauf.** Jeder Lauf hat eine unabhängige SDK-Query, einen Cancellation-Controller, einen CLI-Prozess und eine nicht persistierte Produktsession; es gibt keine Fortsetzung, kein Resume und kein Pooling.
- **Native Settings sind maßgeblich.** Der Provider lässt die SDK-Option `settingSources` bewusst weg, sodass Claude Code die normalen User-, Projekt- und lokalen Settings des Hosts liest; ein optionales `model` und das erforderliche `permissionMode` sind die einzigen Overrides auf Query-Ebene.
- **By design unbeaufsichtigt.** `AskUserQuestion` ist deaktiviert, und Permission-Prompts werden außerhalb des Bypass-Modus abgelehnt, sodass die Query niemals auf ein User-Interface wartet.

### Quelltextkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Config-Schema, Provider-Registrierung |
| [`src/run.ts`](src/run.ts) | Der SDK-Query-Lifecycle, Ergebnisakzeptanz und Permission-Behandlung |
| [`src/process.ts`](src/process.ts) | Managed-Range-Terminations-Eskalation bei Disposal |
| [`cordis.patch.yml`](cordis.patch.yml) | Die Profile-Patch-Schicht, die den dormanten Provider registriert |

### Lauf-Fluss

Ein Start akzeptiert nur eine nicht-leere Sequenz von Textblöcken und leitet das Child-cwd aus der Parent-Session ab. Er erzeugt einen privaten `AbortController`, ruft die offizielle SDK-`query()` mit der exakt konkatenierten Aufgabe auf und publiziert den Lauf erst, nachdem der Custom-Spawn-Hook des SDK ein aktives CLI-Handle geliefert hat, das dem Subprocess-Seam gehört. Der Provider iteriert den vollständigen Message-Stream und akzeptiert nur eine `result`-Message mit `subtype: "success"`, `is_error: false` und einem nicht-leeren `result`, gefolgt von normalem Iterator-Abschluss. Jedes andere Ergebnis mappt auf eine `error`-Diagnose fester Kategorie, die Lifecycle-Stufe und beobachtetes Prozessergebnis benennt — die Kategoriemenge steht in [`src/run.ts`](src/run.ts). Lokale Cancellation gewinnt das Ergebnis-Rennen und mappt auf `aborted` ohne Fehlerdiagnose.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht reicht. Sie bewegen sich von diesem Provider zum Seam, in den er sich einhängt, und zum Geschwister-Produkt-Provider.

- [Subagent-Subsystem](../../../docs/subsystems/subagent.de.md) — der Service-Vertrag, der Provider-Vertrag und die Semantik terminaler Ergebnisse.
- [dsh-subagent-Seam](../subagent/README.de.md) — die Registry und Start-API, auf der sich dieser Provider registriert.
- [Codex-Subagent-Provider](../subagent-codex/README.de.md) — das Geschwister-Produkt-Backend über das offizielle App-Server-Protokoll.
- [Claude-Code- und Codex-Backends](../../../.agents/notes/implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.de.md) — die Design-Aufzeichnung für die Produkt-Provider.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-subagent-claude-code) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

### Child-Request

#### Was das Modell sieht

Das Claude-Code-Child erhält die eigenständige Textaufgabe als eine frische SDK-Query. Sein Workspace ist das Parent-Session-cwd; die gewählte Provider-Instanz fixiert konfiguriertes Modell, Environment und nicht-interaktiven Permission-Modus der Query, während ein weggelassenes Modell und jede andere Produkteinstellung aus der nativen Claude-Konfiguration kommen. Die Executable-Version stammt aus der gepinnten SDK-Plattform-Payload des Bundles.

#### Token-Effekt

Das Child bezahlt einen unabhängigen Claude-Code-Kontext und eine Query. Child-Tokens gelangen nicht in den Parent-Kontext.

#### KV-Cache-Effekt

Unabhängig vom Request-Cache des Parents. Wiederverwendung hängt nur von Claude Codes eigenem Modell, Instruktionen, Tools, nativen Settings und der frischen Query ab.

### Parent-Scheduling und Ergebnisse, indirekt

#### Was das Modell sieht

Über `dsh-tool-subagent` gibt ein Foreground-Call dem Parent die strikte finale Claude-Code-Antwort oder einen Fehler mit Abbruchgrund und optionaler sicherer Diagnose für ein nicht vollendetes Ergebnis. Diese Diagnose kann eine grobe Aktionskategorie, Lifecycle-Stufe und beobachtetes Prozessergebnis unterscheiden, ohne rohen Produkttext oder versionsspezifische Subtype-Namen zu kopieren. Ein Background-Call liefert zuerst eine Job-ID; die generischen Job-Kontrollen liefern später eine Completion-Notice, exponieren dieselbe finale Antwort oder Failed-Status-Details über `job_output` und lassen `job_kill` eine Cancellation anfordern. Claude-Code-Reasoning, Tool-Aktivität, Zwischennachrichten, stderr, Workspace-Diffs, Usage, Produkt-IDs, Tool-Inputs und rohe Protokoll-Payloads werden nicht in die Parent-Session kopiert.

#### Token-Effekt

Der Foreground-Input wächst um die gehaltene finale Antwort oder den Fehler. Der Background-Input enthält zusätzlich die Start-Bestätigung, die Completion-Notice und alle `job_output`-, `job_kill`- oder späteren Status-Ergebnisse; Child-Tokens gelangen weiterhin nicht in den Parent-Kontext. Dieser Provider fügt selbst kein Parent-Tool-Schema hinzu.

#### KV-Cache-Effekt

Append-only: Der Vordergrund fügt ein Ergebnis hinter dem wiederverwendbaren Parent-Präfix hinzu, während der Hintergrund die Job-Bestätigung, Notice und spätere Kontroll- oder Sammelergebnisse anhängt. Background-Scheduling kann einen notice-getriebenen Turn hinzufügen, aber keine dieser Messages schreibt das frühere Präfix neu.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann dieser Provider eine schlechte Wahl ist oder besondere Betriebssorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein allgemeiner Claude-Code-Vergleich und kein Aufgabenstau.

- **Eine frische Query und ein Prozess pro Lauf** — es gibt keine Fortsetzung, kein Resume, kein Pooling, keinen Progress-Stream und keine Produktsession-Persistenz.
- **Statische Instanzauswahl** — Profile-Zeilen fixieren Provider-Namen, optionale Modelle und Tool-Bindings; Calls können weder Provider noch Modell dynamisch wählen oder ändern, und jedes exponierte Tool braucht ein eindeutiges `toolName`.
- **Host-Settings sind absichtlich maßgeblich** — bei weggelassenem `model` wählen Projekt- und User-Settings; native Settings behalten stets die übrigen Tools und das Verhalten, und der Provider bietet keinen gefilterten oder hermetischen Produktionsmodus.
- **Authentifizierung und Account-State bleiben nativ** — das Bundle liefert die CLI, erzeugt aber keinen Account, loggt sich nicht ein und schreibt keine Claude-Settings um; Konfigurations- und Authentifizierungsfehler treten mit ihrer Lifecycle-Stufe und dem sicheren `unknown`-Fallback auf statt mit einer separaten öffentlichen Klassifikation.
- **Die SDK-Plattform-Payload ist zur Delegationszeit erforderlich** — Installationen ohne optionale Dependencies, nicht unterstützte Plattformen und fehlende oder beschädigte Payloads schlagen bei der ersten Query fehl; es gibt keinen Host-CLI-Fallback.
- **Kein Human-Interaction-Pfad** — `AskUserQuestion` ist deaktiviert, Permission-Prompts werden abgelehnt, MCP-Elicitation wird abgelehnt, und blockierende Dialoge schlagen geschlossen fehl statt zu suspendieren.
- **Die Assistant-Payload ist nur finaler Text** — Reasoning, Zwischennachrichten, Tool-Verkehr, Usage, stderr und Workspace-Diffs bleiben produktlokal.
- **Keine optionalen geteilten Capabilities** — `agentOptions`, Output-Schemata, Child-Personas, Tool-Filterung und Harness-Depth-Enforcement werden vom geteilten Service für diesen Provider abgelehnt.
- **Kein Wall-Clock-Timeout und kein Side-Effect-Rollback** — der Caller bricht lange Arbeit ab, und vor der Cancellation geänderte Dateien oder externe Systeme werden nicht zurückgesetzt.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Diese Dev-Notiz ist Arbeitskontext für Maintainer: offene Fragen und unentschiedene Richtungen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten und Grenzen leben in den Abschnitten oben und im Paket-Code.

- **Payload-Größen-Offenlegung** — die aktuelle darwin-arm64-Plattform-Payload packt auf etwa 92 MB und entpackt auf etwa 325 MB; dies sind Offenlegungszahlen, keine Installationsschwellen.
- **Versionsgepinntes Protokoll** — die Runtime-Dependency ist auf Agent SDK 0.3.263 gepinnt; ein Upgrade pinnt eine neue SDK-Version und erfordert das erneute Laufen der schlüssellosen Real-Produkt- und Loader-Kompositions-Evidenz.

</details>

**Runtime-Invariante:** Es wird kein Companion publiziert. Lifecycle-Pairing gehört dem geteilten Subagent-Service, und Managed-Range-Ownership gehört dem Subprocess-Service.
