---
description: "Das modellseitige pwsh-Tool für Nutzer und Maintainer, die einmalige PowerShell-Ausführung, Hintergrund-Jobs und Sandbox-Eskalation unter Windows auswählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-pwsh

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-tool-pwsh` stellt dem Agenten ein `pwsh`-Tool bereit, das PowerShell-Kommandos über den gemounteten Shell-Executor ausführt — das Windows-Gegenstück zu `dsh-tool-bash`, das es Aufruf für Aufruf spiegelt. Jeder Aufruf läuft in einem frischen pwsh-Prozess, sodass kein Zustand überlebt; `run_in_background` verwandelt langlaufende Kommandos in Hintergrund-Jobs. Kommandos sind PowerShell-Dialekt: native `C:\...`-Pfade und `$env:NAME`-Variablen, ohne Dialektübersetzung. Jeder Aufruf läuft mit der verwalteten `DSH_*`-Umgebung, und unter einem sandboxenden Executor lehrt und erzwingt das Tool die Windows-spezifischen Language-Mode- und Named-Pipe-Verträge. Mounten Sie es mit einem PowerShell-Executor wie `dsh-pwsh-local` und dem `dsh-shell-env`-Plugin.

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

Laden Sie dieses Plugin in jeder Komposition, in der der Agent PowerShell-Kommandos ausführen soll — typischerweise eine Windows-Komposition, deren `ctx.shell` von einem PowerShell-Executor getragen wird. Es registriert das `pwsh`-Tool, sobald der Executor-Provider und die `dsh-shell-env`-Registry gemountet sind.

### Wann Sie es wählen

Wählen Sie das pwsh-Tool, wenn Kommandos in PowerShell geschrieben werden müssen — native Pfade und `$env:`-Variablen — oder wenn das Deployment Windows-nativ ist. Wählen Sie `dsh-tool-bash`, wenn der Kommandosatz bash-Dialekt ist; zwischen beiden gibt es keine Übersetzung. Wenn Arbeit aufrufübergreifenden Zustand (cwd, Variablen) braucht, hält das persistente Gegenstück [`dsh-tool-pwsh-persistent`](../tool-pwsh-persistent/README.de.md) eine owner-scoped Shell am Leben.

### Minimale Konfiguration

Der übliche Pfad ist ein PowerShell-Executor-Provider, die Environment-Registry und dieses Tool.

```yaml
- name: '@deepseek-ai/dsh-pwsh-local'
- name: '@deepseek-ai/dsh-shell-env'
- name: '@deepseek-ai/dsh-tool-pwsh'
```

Das einzige Config-Feld schaltet die Hintergrund-Unterstützung um.

| Feld | Standard | Bedeutung |
|---|---|---|
| `enableRunInBackground` | `true` | `run_in_background` exponieren; bei `false` werden erzwungene Hintergrund-Aufrufe abgelehnt |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-pwsh) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc; der generierte [Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-pwsh) trägt das vollständige Argument-Schema.

### Ein Kommando ausführen

Das Tool führt `pwsh -Command <command>` aus und gibt die kombinierte Ausgabe zurück. Kommandos laufen bei jedem Aufruf in einem frischen pwsh-Prozess, sodass Zustand nie persistiert — übergeben Sie `workdir` statt `cd`. Pfade verwenden die native Windows-Form, und Umgebungsvariablen werden mit `$env:NAME` gelesen. Ein Exit ungleich null wird als `[exit code: N]` gemeldet; unter Windows rechnet ein zwangsbeendetes Kommando als `[exit code: 1]` ohne Signal-Marker ab, sodass der Agent einen nackten Exit 1 nach einer Unterbrechung als Beendigung behandelt, nicht als Kommando-Fehler. Hintergrund-Läufe, Ausgabekürzung und die Argumente `description`/`timeoutMs`/`workdir` verhalten sich exakt wie in `dsh-tool-bash`.

### Windows-spezifisches Sandbox-Verhalten

Unter einem sandboxenden Executor melden abgelehnte Kommandos `[sandbox: file access denied under <mode> mode]`, und derselbe einmalige Eskalationspfad gilt: Wiederholen Sie das exakte Kommando einmal mit `sandbox_permissions` plus einer `justification` über die Nutzer-Genehmigung. Das Tool lehrt in seiner Beschreibung außerdem zwei Windows-Restricted-Token-Verträge: Read-only-pwsh läuft in ConstrainedLanguage (`.NET`-statische Aufrufe, `Add-Type`, COM und Reflection scheitern mit "only core types"-Fehlern), und in beiden eingeschränkten Modi können Programme keine Named Pipes öffnen, sodass ein Kommando, das die Ausgabe eines anderen Programms über gepipetes stdio erfasst, mit EPERM scheitert — eskalieren Sie das exakte Kommando einmal oder strukturieren Sie es so um, dass keine Ausgabe erfasst wird.

### Was schiefgehen kann

Eine Komposition ohne PowerShell-Executor aktiviert das Tool nie, und die injizierten Services (`tools`, `shell`, `systemPrompt`, `shellEnv`) müssen alle existieren. Hintergrund-Aufrufe ohne Job-Laufzeit scheitern mit `background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs`, und `sandbox_permissions` ohne sandboxenden Executor scheitert mit `sandbox_permissions is not available in this composition (no sandboxing executor to escalate)`.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Design-Entscheidungen hinter dem Tool und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig behandelt.

### Design-Philosophie

- **Ein bewusster Zwilling von `dsh-tool-bash`.** Foreground- und Hintergrund-Ausführung, die verwaltete Umgebung, die Sandbox-Eskalationsfläche und das Marker-/Kürzungs-Rendering spiegeln das bash-Tool Aufruf für Aufruf, sodass Consumer des einen die Wire-Form des anderen akzeptieren ([pwsh-Tool-Bash-Parity-Agent-Note](../../../.agents/notes/implemented/feature/2026-08-02-pwsh-tool-bash-parity.de.md)).
- **PowerShell-Dialekt-Vertrag.** Der Tool-Vertrag ist PowerShell: native Pfade und `$env:`-Variablen, ausgeführt über `pwsh -Command` ohne Zwischen-Shell.
- **Windows-Sandbox-Fakten in der Beschreibung gelehrt.** Die ConstrainedLanguage- und Named-Pipe-Verträge sind Windows-Restricted-Token-Verhalten; die Bedingung für ihr Lehren ist "ein einschränkender Executor ist gemountet", was sicher ist, weil jede ausgelieferte Paarung win32-only ist.
- **Exits ungleich null werden gemeldet, nicht als Fehler.** Nur Infrastrukturfehler (Spawn-Fehler, Abbrüche) erscheinen als Tool-Fehler, wie bei der bash-Story.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Tool-Registrierung, Prompt-Abschnitt, Arg-Validierung, Eskalation, Request-Assembly |
| [`src/background.ts`](src/background.ts) | Abgerechneten Hintergrund-Prozess auf generisches Job-Ergebnis-Vokabular abbilden |
| [`src/render.ts`](src/render.ts) | Modellseitiger Ergebnistext: Streams, Marker, Kürzungshinweise (bash-Zwilling) |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; dieses Paket exponiert keine unabhängige Ereignisfolge oder veränderliche Datenrelation jenseits der an seiner besitzenden Seam erzwungenen Verträge. |

### Rendering und Exit-Marker

Der Renderer teilt die Struktur des bash-Tools und den `parseExitStatus`-Marker-Vertrag aus `dsh-shell`: Ein sauberer Exit (0, kein Signal) erzeugt keinen Marker; die UI-Karte konsumiert den Exit-Marker als ihre Exit-Status-Pill. Windows-Zwangsbeendigung rechnet als Exit 1 ohne Signal ab, sodass `[killed by signal: …]` dort POSIX-only ist. Der `tool:pwsh`-Prompt-Abschnitt (First-Party-Reihenfolge 1010) lehrt die Exit-Marker-Konvention und die Windows-Lesart von Exit 1 nach einer Unterbrechung.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen von der Shell-Familie zur Executor-Seam und den Design-Notizen hinter dem Windows-Verhalten.

- [Shell-Paketkarte](../README.de.md) — die bash-Capability-Familie und ihre Rollen.
- [Bash-Executor-Subsystem](../../../docs/subsystems/shell.de.md) — Request-/Spec-Vokabular, Ergebnisse und Hintergrund-Prozesse.
- [shell-env](../shell-env/README.de.md) — die verwaltete `DSH_*`-Umgebung, die jeder Aufruf erhält.
- [tool-jobs](../../jobs/tool-jobs/README.de.md) — `job_output`-, `job_list`- und `job_kill`-Kontrollen für Hintergrund-Läufe.
- [pwsh-Tool-Bash-Parity-Agent-Note](../../../.agents/notes/implemented/feature/2026-08-02-pwsh-tool-bash-parity.de.md) — warum das Tool das bash-Tool spiegelt.
- [Windows-ACL-Restricted-Token-Sandbox-Agent-Note](../../../.agents/notes/implemented/feature/2026-08-08-windows-acl-restricted-token-sandbox.de.md) — die Language-Mode- und Named-Pipe-Verträge.
- [Generierter Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-pwsh) — das exakte `pwsh`-Argument-Schema.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-pwsh) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

### System-Prompt

#### Was das Modell sieht

Jeder Request im Registrierungs-Scope dieses Plugins enthält die untenstehende pwsh-Anleitung an First-Party-Position 1010. Scoped Tool-Einschränkungen können das Schema verbergen, ohne diesen unabhängig registrierten Abschnitt zu entfernen.

##### Pwsh-Anleitung

```markdown
Non-zero exits are reported as `[exit code: N]` markers; investigate failures before moving on. On Windows a killed process settles as `[exit code: 1]` without a signal marker; treat a bare exit 1 after an interruption as a termination, not a command failure.
```

#### Token-Effekt

Kleine feste Eingabekosten pro Request, solange das Plugin aktiv ist.

#### KV-Cache-Effekt

Präfix-stabil, solange Registrierungs-Scope und Prompt-Text unverändert sind. Plugin-Aktivierung oder Disposal kann die Wiederverwendung ab diesem Prompt-Abschnitt ungültig machen.

### Tool-Schemas

#### Was das Modell sieht

Das Modell sieht das generierte [`pwsh`-Schema](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-pwsh). Agent-scoped Tool-Einschränkungen können die Definition für diesen Agenten entfernen.

#### Token-Effekt

Feste Schema-Kosten bei jedem Request, bei dem das Tool sichtbar ist.

#### KV-Cache-Effekt

Präfix-stabil, solange Sichtbarkeit und Tool-Definition unverändert sind. Eine Einschränkung oder Config-Änderung kann die Wiederverwendung ab dem ersten geänderten Token ungültig machen.

### Foreground-Ergebnis

#### Was das Modell sieht

Der Renderer gibt das datenabhängige stdout-Ende aus, dann optional `[stderr]` und das stderr-Ende. Bedingte Zeilen sind exakt `[output truncated; full output: <path-or-(unavailable)>]`, `[sandbox: file access denied under <mode> mode]` plus dem Eskalationshinweis `[sandbox: escalation available — …]` (nur wenn die Komposition Eskalation anbietet), `[timed out after <timeoutMs>ms]`, `[killed by signal: <signal>]` und `[exit code: <exitCode>]` (nur Exits ungleich null); ein leerer Körper rendert als `(no output)`.

#### Token-Effekt

Null Ergebnis-Tokens vor einem Aufruf. Ausgabe ist pro Stream begrenzt, während jede emittierte Zeile bis zur Compaction in der Historie bleibt.

#### KV-Cache-Effekt

Nur anhängend; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

### Hintergrund-Ergebnis

#### Was das Modell sieht

Ein Hintergrund-Start rendert exakt `started background job <id>`; nachfolgende Lesevorgänge und Status laufen über die generischen `job_output`/`job_kill`-Tools, einschließlich des Spill-Hinweises bei verlustbehafteter Lesung, wenn die In-Memory-Kürzung ungelesene Bytes verworfen hat.

#### Token-Effekt

Die Bestätigung ist eine feste kurze Zeile; Job-Ausgabe ist pro Lesevorgang begrenzt.

#### KV-Cache-Effekt

Nur anhängend; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

### Tool-Fehler

#### Was das Modell sieht

Validierungs- und Infrastrukturfehler werden als `Error: <message>` normalisiert. Die stabilen Nachrichten dieses Pakets sind `invalid command: expected a non-empty string`, `invalid description: expected a non-empty string`, `invalid timeoutMs: expected a positive number, got <value>`, `invalid workdir: "<path>" is not an accessible directory`, die Eskalations-Pairing-Fehler, `sandbox_permissions is not available in this composition (no sandboxing executor to escalate)`, die geteilten Eskalationsfehler (nicht strikt weiter / kein Approval-Service / kein Agent zum Routen / kein Approval-Kanal / Nutzer abgelehnt / wurde abgebrochen), `run_in_background is disabled for this deployment (enableRunInBackground: false)`, `background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs` und `tool call aborted`.

#### Token-Effekt

Nur der fehlschlagende Aufruf fügt diese behaltenen Tokens hinzu; ein abgebrochener Aufruf fügt keine Kommandoausgabe hinzu.

#### KV-Cache-Effekt

Nur anhängend; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Tool ungeeignet ist oder besondere Sorgfalt erfordert. Sie sind aktuelle Paket-Einschränkungen, kein Aufgabenstapel.

- **Language Mode und Named-Pipe-Erfassung unter der Windows-Sandbox** — unter der [Windows-ACL-Sandbox](../../sandbox/sandbox-windows-acl/README.de.md) startet Read-only-pwsh in ConstrainedLanguage, weil seine Temp-Schreibverweigerung den AppLocker-Probe von PowerShell fail-closed scheitern lässt: `Add-Type`, Nicht-Core-.NET-Statikaufrufe (`[System.IO.*]::`, `[math]::`), COM-Objekte und Reflection scheitern mit "only core types"-Fehlern, und der Modus kann nicht von innen aufgehoben werden. Das private Temp von workspace-write lässt den Probe durchlaufen, sodass er in FullLanguage bleibt, es sei denn, die Host-Policy sagt etwas anderes. Beide eingeschränkten Modi verweigern Named-Pipe-Öffnungen, sodass ein Piped-Stdio-Spawn innerhalb eines eingeschränkten Kommandos mit EPERM scheitert. Die Tool-Beschreibung lehrt beide Verträge dem Modell; das Backend-README besitzt die vollständigen Einschränkungen.
- **Keine persistente Shell** — jeder Aufruf startet ein frisches `pwsh -Command`; das persistente Shell-Gegenstück ist [`@deepseek-ai/dsh-tool-pwsh-persistent`](../tool-pwsh-persistent/README.de.md), das eine owner-scoped pwsh über Aufrufe hinweg am Leben hält.
- **PowerShell-Dialekt-Vertrag** — das Modell muss PowerShell schreiben (native Pfade, `$env:`-Variablen), nicht bash; es gibt keine Dialektübersetzung.
- **Session-cwd-Identität ist nicht kanonisiert** — die workdir-Basis ist das Session-Header-cwd unverändert, anders als die Sandbox-Root-kanonisierte Identität des bash-Tools. Unter einem einschränkenden Executor IST die Workspace-Root der Policy kanonisiert (durch den geteilten Policy-Service), sodass workdir und Einschränkungs-Root auseinanderlaufen können, wenn das rohe Session-cwd von seiner kanonischen Form abweicht — eine Paritätslücke, die auf die Extraktion der geteilten Shell-Tool-Basis zurückgestellt ist.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
