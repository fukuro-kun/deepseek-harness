---
description: "Das modellseitige persistente Bash-Tool für Nutzer und Maintainer, die owner-scoped Shell-State wählen, konfigurieren oder debuggen, der über Aufrufe hinweg überlebt."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-bash-persistent

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Dieses Paket gibt einem agent ein `bash`-Tool, dessen cwd, exportierte Variablen, Funktionen und Background-Jobs über Aufrufe hinweg persistieren. Jeder agent erhält eine isolierte Shell, und seine Kommandos laufen sequenziell. Wähle es für Workflows, die auf Aufruf-übergreifendem State beruhen; verwende `dsh-tool-bash`, wenn jedes Kommando sauber starten soll. Konfiguriere das PTY-Backend und das Pro-Kommando-Timeout; `exit`, Timeout oder Abbruch setzen die Shell zurück, während interaktive Kommandos, die auf stdin warten, bis zum Timeout laufen können.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Lade dieses Plugin in jeder Komposition, in der der agent Shell-State zwischen Kommandos behalten soll — etwa lange Build-Sessions, aktivierte Umgebungen oder Skripte, die Variablen für spätere Schritte exportieren. Es registriert das `bash`-Tool und benötigt die Services `ctx.tools` und `ctx.terminals` sowie eine besitzende agent-Session zur Ausführungszeit.

### Wann es wählen

Wähle das persistente Tool, wenn Arbeit auf Aufruf-übergreifendem State beruht: Ein einmaliger `dsh-tool-bash`-Aufruf kann sich kein `cd` oder eine exportierte Variable merken. Wähle das Einmal-Tool, wenn jedes Kommando aus einer bekannten, sauberen Umgebung starten soll oder wenn das Kommando kurz und in sich geschlossen ist. Kommandos, die interaktives stdin brauchen, werden hier nicht unterstützt — ein Foreground-Kind, das Eingabe liest, blockiert bis zum Kommando-Timeout —, sodass interaktive Arbeit den Terminal-Tools gehört.

### Minimale Konfiguration

Das Default-`shell`-Backend startet ein interaktives bash über `dsh-terminal-bash`; Deployments können ein anderes PTY-Backend registrieren und per Namen wählen.

```yaml
- name: '@deepseek-ai/dsh-terminal'
- name: '@deepseek-ai/dsh-terminal-bash'
- name: '@deepseek-ai/dsh-tool-bash-persistent'
```

| Feld | Default | Bedeutung |
|---|---|---|
| `backendType` | `shell` | Registriertes PTY-Backend, das für die Shell jedes agents verwendet wird |
| `timeoutMs` | `300,000` | Wallclock-Limit für ein Kommando; ein Timeout schließt die Shell |
| `maxOutputChars` | `16,000` | Maximal zurückbehaltene Kommandoausgabe-Zeichen; fixe Diagnostik wird danach angehängt |
| `description` | `Run commands in a persistent bash shell. State, including the current directory and exported environment variables, persists across calls for this agent.` | Modellseitiger Umgebungs-Contract; Deployments dürfen ihre Umgebung beschreiben |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-bash-persistent) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Worauf sich der agent verlassen kann

Kommandos teilen eine Shell pro agent, sodass State bis zu einem `exit`, einem Timeout oder einem Reset persistiert — jedes davon schließt die Shell und teilt dem agent mit, dass der nächste Aufruf aus dem Workspace mit frischem Verzeichnis und Umgebung startet. Ergebnisse schließen die privaten Completion-Marker aus; jedes settled Kommando hängt `[Command finished with exit code N]` an, und eine Shell, die exited, bevor sie diesen Status meldet, hängt stattdessen `[shell exited: code N]`, `[shell killed by signal: SIG]` oder `[shell exited]` an und resettet danach. Lange Ausgabe behält das früheste zurückbehaltene Präfix plus eine Clipping-Notiz; hat das Terminal dieses Präfix bereits verworfen, sagt das Ergebnis dies explizit, statt einen Tail als vollständige Ausgabe zu präsentieren.

### Was schiefgehen kann

Ein Aufruf ohne besitzende agent-Session schlägt mit `bash requires an owning agent session` fehl, und eine Komposition ohne PTY-Backend aktiviert das Tool, aber lässt seinen ersten Aufruf mit `no PTY backend registered for "shell"` fehlschlagen. Ein interaktives Foreground-Kind (etwa eine REPL) kehrt nur dort früh mit Partial-Output zurück, wo das Backend dessen stdin-Warte beweist; andernorts läuft der Aufruf bis `timeoutMs`, was die unsichere Shell schließt und den Reset meldet. Ein Abbruch resettet ebenfalls und verwirft das Ergebnis, selbst wenn ein vollständiger Statusmarker bereits beobachtbar ist.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Tool und zeigt auf den Code, der sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Designphilosophie

- **Eine Shell pro Owner, nichts Geteiltes.** Die Shell-Registry keyed jede Session auf den aufrufenden `Agent`, sodass nebenläufige agents nie State teilen und Kommandos desselben agents über eine Pro-Owner-Queue serialisiert werden.
- **Marker-verankerte Extraktion.** Jedes Kommando wird mit einzigartigen Start-/End-Markern umwickelt, die den Exit-Status tragen; das Tool pollt den PTY-Scrollback und extrahiert die Spanne zwischen den echten Markern, sodass Prompts und echoete Eingabe nie in Ergebnisse leaken.
- **Reset, niemals Reparatur.** Jeder unsichere State — ein explizites `exit`, ein Timeout, ein Send-Fehler, ein Abort — schließt die Shell und startet den nächsten Aufruf frisch, weil eine halb bekannte Shell schlimmer ist als eine saubere.
- **Owner-scoped Lifecycle.** Shells werden lazy beim ersten Gebrauch erstellt und bei Plugin-Disposal oder Owner-Teardown gekillt; der owner-scoped `ctx.terminals`-Service zäunt jede Operation auf den besitzenden agent ein.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Shell-Registry, Kommando-Wrapping, Scrollback-Polling, Extraktion und Rendering |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; der private Owner-zu-Shell-Cache des Adapters hat keine beobachtbare Event- oder Datenrelation. Lifecycle-Tests beweisen sein Cleanup, ohne allein für eine Invariante eine öffentliche API hinzuzufügen. |

### Kommandofluss

Ein erstes Kommando spawnt die Shell über `ctx.terminals.spawn`, deaktiviert Input-Echo (`stty -echo`) und wartet auf Readiness. Jedes Kommando wird dann in eine physische Zeile gewrappt — ein printf des Start-Markers, der mit `$'…'` escapte Kommando-Body und ein printf des End-Markers plus `$?` —, sodass eingebettete Newlines keine Terminal-Prompts in das Ergebnis leaken können. Das Tool pollt den Scrollback in 1.000-Zeilen-Seiten, bis der End-Marker erscheint, extrahiert die Spanne und rendert sie mit etwaigem Statusmarker. Ein Timeout bricht die Deadline ab, erfasst die Partial-Output und resettet die Shell.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Contract nicht ausreicht. Sie führen von der Terminal-Familie zum Seam, den Backends und der Designnotiz hinter owner-scoped Sessions.

- [terminal-Paketkarte](../../terminal/README.de.md) — die persistente PTY-Capability-Familie.
- [terminal-Seam](../../terminal/terminal/README.de.md) — der `ctx.terminals`-Service hinter dem Tool.
- [terminal-bash-Backend](../../terminal/terminal-bash/README.de.md) — das Default-`shell`-Backend.
- [tool-terminal](../../terminal/tool-terminal/README.de.md) — sechs modellseitige Terminal-Tools für interaktive Arbeit.
- [Agent Note zu persistenten PTY-Sessions](../../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.de.md) — das owner-scoped Session-Design und seine Begründung.
- [Generierter Tool-Katalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-bash-persistent) — das exakte `bash`-Argument-Schema.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-bash-persistent) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

### Tool-Schema

#### Was das Modell sieht

Das generierte [`bash`-Schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-bash-persistent), einschließlich der konfigurierten `description`. Das Plugin trägt keine eigenständige System-Prompt-Sektion bei; das Deployment besitzt Persona- und Umgebungs-Guidance.

#### Token-Effekt

Fixe Schema-Kosten, solange `bash` sichtbar ist.

#### KV-Cache-Effekt

Präfix-stabil, solange konfigurierte Beschreibung und Schema unverändert bleiben.

### Tool-Ergebnisse

#### Was das Modell sieht

Kommandos teilen eine Shell pro Agent, sodass cwd, exportierte Variablen, aktivierte Umgebungen, Funktionen und Background-Jobs über Aufrufe hinweg persistieren. Ergebnisse schließen private Completion-Marker aus. Wenn die Shell wieder stdin liest, ohne den Completion-Marker gedruckt zu haben — nach `exec`, einem Interrupt oder einem interaktiven Foreground-Kind, dessen stdin-Warte der Provider beweist —, gibt der Aufruf die erfasste Partial-Output zurück, die mit dem eigenen Prompt-Text des Backends enden kann. Jedes settled Kommando hängt `[Command finished with exit code N]` an; eine Shell, die exited, bevor sie diesen Status meldet, hängt stattdessen `[shell exited: code N]`, `[shell killed by signal: SIG]` oder `[shell exited]` an, wenn das Backend keines liefert, dann resettet sie und teilt dem Modell mit, dass der nächste Aufruf frisch startet. Lange Ausgabe behält das früheste zurückbehaltene Präfix plus eine Clipping-Notiz. Hat das PTY dieses Präfix bereits verworfen, sagt das Ergebnis dies explizit, statt einen Tail als vollständige Ausgabe zu präsentieren. Ein Timeout gibt begrenzte Partial-Output gefolgt von `[Command timed out or OOM]` zurück, schließt die unsichere Shell und meldet den Reset.

#### Token-Effekt

Datenabhängig. `maxOutputChars` begrenzt zurückbehaltene Kommandoausgabe; fixe Clipping-, Lost-Prefix-, Status-, Timeout- und Reset-Diagnostik kann das Ergebnis verlängern.

#### KV-Cache-Effekt

Append-only-Tool-Ergebnisse folgen dem wiederverwendbaren Request-Präfix.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Tool schlecht passt oder besondere Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgabenstapel.

- **Das Tool benötigt einen besitzenden Agent und ein echtes PTY-Backend** — agentlose Aufrufe und Backends, die keine interaktive Shell starten können, schlagen fehl.
- **Ein interaktives Foreground-Kind kehrt nur dort früh mit Partial-Output zurück, wo der Subprocess-Provider seine stdin-Warte beweist** — andernorts läuft der Aufruf bis `timeoutMs`.
- **Explizites `exit` und Timeout verwerfen Shell-State** — ein Abbruch resettet ebenfalls und verwirft das Ergebnis, selbst wenn ein vollständiger Statusmarker bereits beobachtbar ist; der nächste Aufruf startet eine frische Shell.
- **Umgebungsfakten wie Netzwerkzugang und Paket-Mirrors gehören in die konfigurierte `description`** — nicht in den Default dieses Pakets.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
