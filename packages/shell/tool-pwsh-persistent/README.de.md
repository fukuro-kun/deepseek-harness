---
description: "Das modellseitige persistente pwsh-Tool für Nutzer und Maintainer, die owner-scoped PowerShell-State auswählen, konfigurieren oder debuggen, der über Aufrufe hinweg überlebt."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-pwsh-persistent

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-tool-pwsh-persistent` gibt jedem agent ein `pwsh`-Tool, das sein aktuelles Verzeichnis, Umgebungsvariablen, Funktionen und Hintergrund-Jobs über Aufrufe hinweg bewahrt. Kommandos für einen agent laufen sequenziell, während verschiedene agents getrennten Shell-State halten. Wählen Sie es für mehrstufige PowerShell-Arbeit; verwenden Sie `dsh-tool-pwsh`, wenn jedes Kommando sauber starten soll, und ein Terminal-Tool, wenn Kommandos interaktives stdin brauchen. Konfigurieren Sie ein pwsh-fähiges Backend und ein Per-Kommando-Timeout; Timeout oder explizites `exit` verwirft die Shell, sodass der nächste Aufruf frisch startet.

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

Laden Sie dieses Plugin in jeder Komposition, in der der agent PowerShell-State zwischen Kommandos behalten soll — das persistente Gegenstück zu `dsh-tool-pwsh` für Arbeit, die aufrufübergreifenden State braucht. Es registriert das `pwsh`-Tool und benötigt die Services `ctx.tools` und `ctx.terminals` sowie eine besitzende agent-Session zur Ausführungszeit.

### Wann Sie es wählen

Wählen Sie das persistente Tool, wenn Arbeit von aufrufübergreifendem PowerShell-State abhängt, und wählen Sie `dsh-tool-pwsh`, wenn jedes Kommando aus einer bekannten, sauberen Umgebung starten soll. Kommandos, die interaktives stdin brauchen, werden hier nicht unterstützt — ein Foreground-Kind, das Eingabe liest, blockiert bis zum Kommando-Timeout, der die Shell zurücksetzt — daher gehört interaktive Arbeit zu den Terminal-Tools.

### Minimale Konfiguration

Das Standard-`shell`-Backend startet eine PowerShell-Shell über eine `dsh-terminal-bash`-Instanz, die mit `shellDialect: pwsh` konfiguriert ist; Deployments können ein anderes pwsh-Dialekt-PTY-Backend registrieren und es per Namen auswählen.

```yaml
- name: '@deepseek-ai/dsh-terminal'
- name: '@deepseek-ai/dsh-terminal-bash'
  config:
    shellDialect: pwsh
- name: '@deepseek-ai/dsh-tool-pwsh-persistent'
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `backendType` | `shell` | Registriertes PTY-Backend für die Shell jedes agents |
| `timeoutMs` | `300,000` | Wall-Clock-Limit für ein Kommando; Timeout schließt die Shell |
| `maxOutputChars` | `16,000` | Maximale zurückbehaltene Kommando-Ausgabezeichen; feste Diagnostik wird danach angehängt |
| `description` | `Run commands in a persistent PowerShell shell. State, including the current directory and exported environment variables, persists across calls for this agent.` | Modellseitiger Umgebungsvertrag; Deployments können ihre Umgebung beschreiben |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-pwsh-persistent) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Worauf sich der agent verlassen kann

Kommandos teilen eine Shell pro agent, sodass cwd, `$env:`-Variablen, Funktionen und Hintergrund-Jobs über Aufrufe hinweg persistieren. Ergebnisse schließen die privaten Vollendungsmarker, den Shell-Prompt und die zurückgeechoete Eingabezeile aus. Ein Wrapper-Kommando ungleich null hängt `[exit code: N]` an — den exakten nativen Exit-Code, wenn das Kommando ein natives Programm laufen ließ, `1` bei einem terminierenden PowerShell-Fehler. Eine Shell, die vor dem Melden dieses Status beendet wird, hängt stattdessen `[shell exited: code N]`, `[shell killed by signal: SIG]` oder `[shell exited]` an (Windows-Zwangsterminierung meldet Exit 1 ohne Signal), setzt dann zurück und sagt dem agent, dass der nächste Aufruf frisch startet. Lange Ausgabe behält das früheste zurückbehaltene Präfix plus einen Kürzungshinweis; wenn das Terminal dieses Präfix bereits verworfen hat, sagt das Ergebnis das explizit.

### Was schiefgehen kann

Ein Aufruf ohne besitzende agent-Session schlägt mit `pwsh requires an owning agent session` fehl, und eine Komposition ohne pwsh-Dialekt-PTY-Backend aktiviert das Tool, lässt aber seinen ersten Aufruf mit `no PTY backend registered for "shell"` fehlschlagen. Eine Modell-Neudefinition der `prompt`-Funktion entfernt den Readiness-Marker, und die Shell settle dann auf der Silence-Tier statt dem Marker-Fast-Path. Rohe ESC-Zeichen innerhalb eines Kommandos werden von PSReadLine vor der Ausführung konsumiert und werden nicht unterstützt. Ein Timeout oder eine Abbruch schließt die unsichere Shell, verwirft das Ergebnis und meldet den Reset.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Tool und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designphilosophie

- **Ein bewusster Zwilling von `dsh-tool-bash-persistent`.** Session-Registry, Polling-Loop und Reset-Vertrag spiegeln das persistente bash-Tool by design ([pwsh-persistent-PTY-Agent-Note](../../../.agents/notes/archived/architecture/2026-08-11-pwsh-persistent-pty.md)).
- **Prompt-Funktions-Readiness.** Das Tool installiert seine eigene `prompt`-Funktion, die einen BEL-terminierten OSC-Marker plus einen druckbaren Prompt ausgibt; der OSC-Marker trägt den letzten Exit-Code, und der druckbare Prompt settled jedes Kommando, sodass eine Modell-Neudefinition von `prompt` die Readiness auf die Silence-Tier degradiert.
- **PSReadLine-Echo wird durch Verankerung entfernt.** PowerShell rendert eingereichte Eingabe zurück in den Stream; die marker-verankerte Extraktion und ein Wrapper-Source-Strip entfernen das Echo, und ein Wrapper, der über die Terminal-Breite umbricht, kann in Teil-Ausgabe-Ergebnissen ein Teil-Echo hinterlassen.
- **Reset, nie Reparatur.** Jeder unsichere Zustand — ein explizites `exit`, ein Timeout, ein Sende-Fehler, ein Abort — schließt die Shell und startet den nächsten Aufruf frisch.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Shell-Registry, Prompt-Setup, Kommando-Wrapping, Scrollback-Polling, Extraktion und Rendering |
| — | Es wird kein Runtime-Invariant-Begleiter publiziert; der private Owner-zu-Shell-Cache des Adapters hat keine beobachtbare Event- oder Datenrelation. Lebenszyklus-Tests beweisen sein Aufräumen, ohne eine öffentliche API nur für eine Invariante hinzuzufügen. |

### Kommandofluss

Ein erstes Kommando spawned die Shell über `ctx.terminals.spawn`, installiert die `prompt`-Überschreibung und wartet auf Readiness. Jedes Kommando wird in eine physische Zeile gewrapped — `Write-Output` des Start-Markers, der Body mit Backtick-Escapes in einen doppelt gequoteten String escaped, und `Write-Output` des End-Markers plus Exit-Status —, sodass PSReadLines Echo einer umgebrochenen Zeile keine Vollendung fälschen kann. Das Tool pollt den Scrollback in 1.000-Zeilen-Seiten, bis der End-Marker oder ein abgeschlossener Prompt erscheint, extrahiert den Bereich, entfernt das geechete Wrapper und die Prompts und rendert es mit jedem Status-Marker. Ein Timeout bricht die Deadline ab, erfasst die Teil-Ausgabe und setzt die Shell zurück.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der paketweite Vertrag nicht ausreicht. Sie bewegen sich von der Terminal-Familie zum Seam, den Backends und den Design-Notizen hinter dem Persistent-Shell-Design.

- [terminal-Paketkarte](../../terminal/README.de.md) — die persistente PTY-Capability-Familie.
- [terminal-Seam](../../terminal/terminal/README.de.md) — der `ctx.terminals`-Service hinter dem Tool.
- [terminal-bash-Backend](../../terminal/terminal-bash/README.de.md) — das Standard-Backend, konfiguriert mit `shellDialect: pwsh`.
- [pwsh-persistent-PTY-Agent-Note](../../../.agents/notes/archived/architecture/2026-08-11-pwsh-persistent-pty.md) — das pwsh-seitige Session-Design und seine Begründung.
- [Persistent-PTY-Sessions-Agent-Note](../../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.de.md) — das owner-scoped Session-Design und seine Begründung.
- [Generierter Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-pwsh-persistent) — das exakte `pwsh`-Argument-Schema.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-pwsh-persistent) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

### Tool-Schema

#### Was das Modell sieht

Das generierte [`pwsh`-Schema](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-pwsh-persistent), einschließlich der konfigurierten `description`. Das Plugin trägt keinen eigenständigen System-Prompt-Abschnitt bei; das Deployment besitzt Persona- und Umgebungs-Anleitung.

#### Token-Effekt

Feste Schema-Kosten, solange `pwsh` sichtbar ist.

#### KV-Cache-Effekt

Präfix-stabil, solange die konfigurierte Beschreibung und das Schema unverändert bleiben.

### Tool-Ergebnisse

#### Was das Modell sieht

Kommandos teilen eine Shell pro agent, sodass cwd, `$env:`-Variablen, Funktionen und Hintergrund-Jobs über Aufrufe hinweg persistieren. Ergebnisse schließen private Vollendungsmarker, den Shell-Prompt und die zurückgeechoete Eingabezeile aus (PSReadLine rendert eingereichte Eingabe zurück in den Stream; die marker-verankerte Extraktion und der Wrapper-Source-Strip entfernen es). Ein Wrapper-Kommando ungleich null hängt `[exit code: N]` an — den exakten nativen Exit-Code, wenn das Kommando ein natives Programm laufen ließ, `1` bei einem terminierenden PowerShell-Fehler. Eine Shell, die vor dem Melden dieses Status beendet wird, hängt stattdessen `[shell exited: code N]`, `[shell killed by signal: SIG]` oder `[shell exited]` an, wenn das Backend keines der beiden liefert (Windows-Zwangsterminierung meldet Exit 1 ohne Signal), setzt dann zurück und sagt dem Modell, dass der nächste Aufruf frisch startet. Lange Ausgabe behält das früheste zurückbehaltene Präfix plus einen Kürzungshinweis; wenn das Terminal dieses Präfix bereits verworfen hat, sagt das Ergebnis das explizit. Timeout gibt begrenzte Teil-Ausgabe zurück, schließt die unsichere Shell und meldet den Reset.

#### Token-Effekt

Datenabhängig. `maxOutputChars` begrenzt die zurückbehaltene Kommando-Ausgabe; feste Kürzungs-, Lost-Prefix-, Status-, Timeout- und Reset-Diagnostik kann das Ergebnis verlängern.

#### KV-Cache-Effekt

Append-only Tool-Ergebnisse folgen dem wiederverwendbaren Request-Präfix.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Einschränkungen definieren, wann das Tool schlecht passt oder besondere Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgaben-Backlog.

- **Das Tool benötigt einen besitzenden agent und ein echtes Terminal-Backend mit pwsh-Dialekt** — Windows-ConPTY oder ein POSIX-pwsh.
- **Eingabe-Echo ist unvermeidbar** — PowerShells PSReadLine rendert eingereichte Eingabe zurück in den Terminal-Stream, und es gibt kein `stty -echo`-Äquivalent. Die marker-verankerte Extraktion schließt das Echo in vollständigen Ergebnissen aus; der Wrapper-Source-Strip deckt Fallback-Pfade ab, aber ein Wrapper, der über die Terminal-Breite umbricht, kann in Teil-Ausgabe-Ergebnissen ein Teil-Echo hinterlassen, begrenzt durch `maxOutputChars`.
- **Rohe ESC-Zeichen in Modellkommandos werden nicht unterstützt** — PSReadLine konsumiert sie vor der Ausführung. Der Wrapper escaped die Kontroll-Bytes, die er braucht (`[char]27`-gebaute OSC-Marker, Backtick-Escapes für den Body).
- **Eine Modell-Neudefinition der `prompt`-Funktion entfernt den Readiness-Marker** — die Shell settle dann auf der Silence-Tier statt dem Marker-Fast-Path.
- **Es gibt kein interaktives stdin während eines Kommandos** — ein Foreground-Kommando, das Eingabe liest, blockiert bis zum Kommando-Timeout, der die Shell zurücksetzt.
- **SIGTSTP/SIGHUP sind unter Windows nicht verfügbar** (Backend-abgelehnt); SIGINT wird als konsolenweiter Ctrl-C-Eingabe-Write zugestellt, der an einem Prompt die anhängige Zeile abbricht, statt einem Prozess ein Signal zu senden.
- **Im Read-only-Modus der Windows-ACL-Sandbox startet pwsh in ConstrainedLanguage**, was den `[Console]::`-Encoding-Pin und den Prompt-Marker des Bootstraps verweigern kann. Kommandos können weiterhin über den druckbaren Prompt und die Silence-Tier settlen, aber Nicht-ASCII-Ausgabe kann der Host-Codepage folgen.
- **Der BEL-terminierte OSC-Marker bleibt nur ein Readiness-Signal** — ein BEL-Event-Kanal zum Modell bleibt zurückgestellt, im Einklang mit der aktuellen Implementierung.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
