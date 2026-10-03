# Agent Note: Produkt-Subagents verwenden Profile-gewählte nicht-interaktive Permissions
[English](2026-08-15-product-subagent-noninteractive-permissions.md) | [中文](2026-08-15-product-subagent-noninteractive-permissions.zh.md) | Deutsch

Status: implemented


## Problem

Die [Claude-Code- und Codex-Produkt-Provider](2026-08-04-claude-code-and-codex-subagent-backends.de.md) laufen ohne menschliche Oberfläche. Native Permission-Prompts, User-Dialoge oder MCP-Elicitation können daher nicht auf einen Menschen warten, aber sich auf den Umgebungs-Default eines der Produkte zu verlassen kann dennoch einen interaktiven Modus wählen. Ein Deployment muss zudem weitergehende native Modi wählen können, ohne dem Eltern-Modell oder einem einzelnen Tool-Call einen Weg zu geben, die eigene Autorität zu erhöhen.

Ein fehlgeschlagener Produktlauf erreichte den [Subagent-Seam](2026-06-21-subagent-capability-seam.de.md) bisher nur als Stop-Reason. Logs konnten den Produktfehler behalten, aber der Foreground-Elternteil und ein [One-Shot-Background-Job](../../archived/feature/2026-08-12-product-subagent-one-shot-background-tasks.md) konnten eine Permission-Verweigerung nicht von einem anderen Fehler unterscheiden. Assistant-Output für diesen Fakt wiederzuverwenden würde Infrastruktur-Detail dem Child-Modell fälschlich zuschreiben.

## Entscheidung

Jeder Produkt-Provider besitzt seinen eigenen Profile-Level-`permissionMode`-Wert. Die beiden Config-Felder verwenden bewusst die nativen Namen der Produkte statt einer geteilten Restricted-/Automatic-/Full-Abstraktion. Der Provider fixiert den aufgelösten Wert für jeden Run dieser Plugin-Instanz. Das Subagent-Tool-Schema und `SubagentStartRequest` enthalten kein Permission-Feld, sodass weder ein Modell noch eine einzelne Delegation ihn ändern kann.

### Claude Code

Claude Code defaulted auf `dontAsk` und akzeptiert nur die nativen nicht-interaktiven Modi, die das gepinnte Agent SDK unterstützt:

| Wert | Natives Verhalten |
| --- | --- |
| `dontAsk` | Operationen, die noch nicht autorisiert sind, ablehnen statt zu prompten. |
| `acceptEdits` | Edits akzeptieren; jeden verbleibenden Permission-Prompt über den Unattended-Callback ablehnen. |
| `auto` | Den nativen Klassifikator von Claude Code Permission-Requests erlauben oder ablehnen lassen. |
| `plan` | Planning-Modus verwenden, Execution-Approval ablehnen und den vollendeten Plan als finale Antwort zurückgeben. |
| `bypassPermissions` | Die explizite Dangerous-Bestätigung des SDK setzen und Permission-Checks umgehen. |

Der Provider lässt weiterhin `settingSources` weg: Ein optionales Instanz-Level-Modell ist ein separates direktes SDK-Override, während Claude Code Owner von User-, Projekt- und lokalen Settings, Authentifizierung, Tools und Sandbox-Verhalten außerhalb des gewählten Modus bleibt.

Jeder Query deaktiviert `AskUserQuestion`. Nicht-Bypass-Permission-Callbacks lehnen ab, statt das unbegrenzt blockierende `null` des SDK zurückzugeben; der Plan-Modus legt zudem `ExitPlanMode` in `disallowedTools`, sodass native Allow-Regeln den unbeaufsichtigten Query nicht zurück in die Ausführung schalten können. MCP-Elicitation wird abgelehnt; der unterstützte Refusal-Dialog wird abgebrochen; undeklarierte Dialogarten verwenden das No-Dialog-Fehlverhalten des SDK. Eine native `permission_denied`-Nachricht zeichnet denselben operationslokalen Fakt auf. Diese Pfade erzeugen keine Approval-Session, -Queue, -Cache oder -Retry-Schleife.

### Codex

Codex defaulted auf `never` und akzeptiert die drei nativen nicht-interaktiven Modi, die Codex 0.153.4 exponiert. Der Provider startet das feste App-Server-Kommando und mappt den gewählten Modus dann auf offizielle `thread/start`-Felder, weil CLI-globale Permission-Flags keine Threads konfigurieren, die später von einem App-Server-Client erzeugt werden:

| Wert | `thread/start`-Felder | Natives Verhalten |
| --- | --- | --- |
| `never` | `approvalPolicy: never`; Sandbox weggelassen | Niemals prompten; Ausführungsfehler kehren unter der nativen Sandbox zum Modell zurück. |
| `approve-for-me` | `approvalPolicy: on-request`, `approvalsReviewer: auto_review`, `sandbox: workspace-write` | Permission-Requests durch die automatische Review von Codex routen. |
| `dangerously-bypass-approvals-and-sandbox` | `approvalPolicy: never`, `sandbox: danger-full-access` | Approval- und Sandbox-Enforcement überspringen. |

Der Provider überschreibt nur diese Permission- und Sandbox-Felder. Ein optionales Instanz-Level-Modell ist ein separates direktes `thread/start`-Override; `CODEX_HOME`, Projektkonfiguration, Model-Provider-Auswahl, MCP, Hooks, Skills, Authentifizierung und nicht vom Modus gewählte Sandbox-Fakten bleiben nativer Codex-State. Der Wire lehnt weiterhin jeden unerwarteten Approval-, Permission-, User-Input- oder MCP-Request ab, statt einen dynamischen Allow-Pfad zu öffnen.

### Fehlerdiagnostik

`SubagentResult` trägt ein optionales `diagnostic` für Provider-verfasstes, nicht-assistisches Fehler-Detail. Ein Provider entfernt Tool-Inputs, Dateiinhalte, Umgebungswerte, Credentials und rohe Protokoll-Payloads, bevor er es erzeugt. Die gemeinsame Out-of-Process-Ergebnisgrenze begrenzt den vollständigen Text auf 4096 UTF-8-Bytes und markiert Truncation, ohne ein Zeichen zu zerteilen. Die [Minimal-Diagnostics-Entscheidung](../../archived/simplification/2026-08-21-product-subagent-minimal-diagnostics.md) besitzt die nicht-permissionalen Aktionskategorien, Lifecycle-Stufen, HTTP-Fakten und Prozess-Outcomes beider Produkte, die dasselbe Feld tragen.

Der Permission-Fakt jedes Produkts enthält nur den wirksamen Modus, die Request-Kategorie, die Unattended-Entscheidung und einen festen sicheren Grund. Claude Code leitet diese Fakten aus SDK-Callbacks und `permission_denied`-Nachrichten ab. Codex leitet sie aus App-Server-Requests, abgelehnten Items und strukturierten `sandboxError`-Terminals ab. Rohes stderr wird an den Host weitergeleitet, aber weder klassifiziert noch in die Diagnostik kopiert. Beide Provider stellen ihre Fehlerzeile vor den neuesten beitragenden Permission-Fakt. Ein erfolgreiches Ergebnis liefert nur die strikte finale Antwort; lokale Cancellation bleibt `aborted` ohne Permission-Detail; ein unveröffentlichter Startup-Fehler lehnt weiterhin `start()` ab. Der Provider fügt keinen der beiden Diagnostik-Fakten zu Assistant-Output, Structured Output oder `subagent/end.lastAssistantMessage` hinzu.

Der Foreground-Consumer präsentiert die Stop-Reason-Headline, dann die optionale Diagnostik, dann etwaigen partiellen Assistant-Output. Der One-Shot-Background-Adapter speichert dieselbe Diagnostik neben dem Stop-Reason im Detail des fehlgeschlagenen Jobs. Provider, die das Feld weglassen, behalten ihr bisheriges Verhalten.

### Ownership und Lifecycle

| Fakt oder Ressource | Owner | Beobachtbares Verhalten |
| --- | --- | --- |
| Profile-Permission-Wahl | Die Config jedes Produkt-Providers | Ungültige, interaktive oder unbekannte Werte schlagen während der Konfiguration fehl. |
| Permission- und Sandbox-Semantik | Claude Code Agent SDK oder Codex App-Server | Jeder Provider übergibt einen nativen Modus und spiegelt keine Produkt-Policy. |
| Interaktionsentscheidungen und sichere Diagnostik | Ein Produkt-Run | Konkurrierende Runs behalten unabhängigen Modus-, Protokoll- und Diagnostik-State. |
| Diagnostik-Typ und Byte-Limit | `dsh-subagent` | Consumers erhalten ein begrenztes optionales Feld getrennt vom Assistant-Output. |
| Foreground- und Job-Präsentation | `dsh-tool-subagent` und die generische Job-Runtime | Die Scheduling-Wahl ändert den zugrunde liegenden Fehler-Fakt nicht. |
| Prozess-Cancellation und Quiescence | Produkt-Provider und `dsh-subprocess` | Ergebnisabrechnung geht weiterhin dem idempotenten Gesamtbaum-Disposal voraus. |

## Verifikation

Paket-Tests pinnen jeden erlaubten und abgelehnten Config-Wert, die exakten SDK- und App-Server-Feldmappungen, Dangerous-Bestätigungen, Unattended-Terminal-Antworten, Diagnostik-Sanitization und UTF-8-Grenze, Successful-Result-Omission, Concurrent-Run-Isolation, Foreground-Ordering, Job-Detail, stderr-Observer-Disposal und Prozess-Cleanup. Das echte Claude-Agent-SDK-0.3.263- und Claude-Code-2.1.263-Fixture beweist seinen sicheren Default, die Restricted-Denial, den expliziten Bypass und Gesamtbaum-Quiescence. Das echte Codex-0.153.4-App-Server-Fixture beweist, dass Thread-Level-`never` das umgebende `on-request` überschreibt, automatische Review startet, Dangerous-Bypass nur in Suite-eigenem temporären Speicher schreibt, eine abgelehnte Eskalation keinen Seiteneffekt und kein rohes Kommando oder Pfad in der Diagnostik hinterlässt, stderr Host-only bleibt und der Wrapper-/Native-Baum exited. Loader-Composition beweist, dass Nicht-Default-Modi veröffentlicht werden können, ohne eines der Produkte zu starten, und das schlüssellose ACP-Snapshot zeichnet die Fehlerdiagnostik jedes Produkts über Foreground- und Job-Präsentation auf, während die modellzugewandten Produkt-Tool-Schemas keinen Permission-Parameter enthalten.

## Erwogene Alternativen

**Den Umgebungs-Permission-Default des Produkts verwenden.** Eine native Einstellung kann einen interaktiven Modus wählen und Unattended-Verhalten deployment-abhängig machen. Der Provider muss für jeden Query explizit einen nicht-interaktiven Modus wählen.

**Den Permission-Modus ins modellzugewandte Tool oder jeden Start-Request legen.** Das ließe Aufgabeninhalt Autorität wählen und würde eine Profile-Deployment-Entscheidung bei jedem Call duplizieren.

**Produkt-Settings kopieren oder die Eltern-Harness-Sandbox mappen.** Die Produkte teilen kein Permission-Vokabular. Ihren State zu spiegeln würde eine zweite Autorität erzeugen und die nativen Sandbox-Konsequenzen der Automatic- und Bypass-Modi verschleiern.

**Prompts an einen Elternteil, Web-Client oder eine CLI weiterleiten.** Der One-Shot-Produktlauf hat keinen eigenen Human-Interaction-Lifecycle. Einen zu schaffen erfordert durable Request-Identität, Routing, Cancellation- und Timeout-Semantik jenseits dieser Entscheidung.

**Rohe Produktfehler, stderr oder Tool-Inputs zurückgeben.** Diese Werte können Kommandos, Pfade, Workspace-Daten, Umgebungswerte oder Credentials enthalten. Eine feste sichere Diagnostik hält den Fehler handhabbar, ohne das Produkt-Transcript offenzulegen.

**Eine separate Job-Diagnostik speichern.** Der Job ist nur ein Scheduling-Adapter für denselben `SubagentRun`; ein zweites Feld ließe Foreground- und Background-Fehlerbedeutungen driften.

## Konsequenzen

Profiles können vor dem Provider-Start jedes Produkts nativen Restricted-, Automatic-, Planning-/Edit-accepting- (wo unterstützt) oder Bypass-Verhalten wählen, während beide sicheren Defaults niemals einen Menschen fragen. Weitergehende Modi bleiben explizite Deployment-Entscheidungen und behalten ihre nativen Sandbox-Konsequenzen.

Permission-Fehler werden sowohl für Foreground-Elternteile als auch für One-Shot-Background-Jobs sichtbar, ohne Infrastruktur-Text in eine Assistant-Antwort zu verwandeln. Dasselbe Feld kann auch die separat besessenen strukturierten Fehlerfakten tragen. Es kann über die gewöhnlichen Consumer-Pfade in Modell-Context, Job-Notices, API-Projektionen und die Job-UI gelangen, daher muss der Provider den vollständigen Text vor der Ergebnisabrechnung sanitisieren und begrenzen.

Die Änderung fügt weder Produkt-Session-Persistenz, einen menschlichen Approval-Kanal, dynamische Permission-Operationen, einen Fortschritts-Stream, eine Retry-Policy noch ein Rollback hinzu. Andere Provider bleiben gültig, ohne eine Diagnostik zu erzeugen oder eine Permission-Mode-Config offenzulegen.
