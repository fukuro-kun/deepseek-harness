---
description: "Der lokale PowerShell-Executor für Deployments und Maintainer, die uneingeschränkte PowerShell-Kommandoausführung über den Shell-Seam wählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-pwsh-local

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-pwsh-local` ist der PowerShell-Executor: Jedes Kommando läuft als frischer, nicht-interaktiver `pwsh -Command`-Prozess ohne Profildateien, sodass kein Shell-State zwischen Aufrufen überlebt. Er spiegelt die Semantik von `dsh-bash-local` Aufruf für Aufruf und fügt PowerShell-förmige Belange hinzu: Executable-Auflösung, UTF-8-Output-Pinning und die modellfreundliche Terminal-Umgebung. Kommandos laufen mit der Autorität des Harness-Prozesses selbst — dieser Executor schränkt nichts ein; komponiere `dsh-pwsh-sandbox`, wenn Kommandos die Sandbox-Capability brauchen. Das modellseitige `pwsh`-Tool spricht mit ihm, sobald er gemountet ist.

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

Mounte diesen Executor, wenn eine Komposition PowerShell-Kommandoausführung braucht — typischerweise unter Windows — ohne Confinement. Er registriert sich als `ctx.shell`, und das modellseitige `pwsh`-Tool arbeitet sofort darüber: Ein agent ruft das Tool auf, und das Kommando läuft als frischer `pwsh -Command`-Prozess mit den untenstehenden Budgets.

### Wann es wählen

Er ist das Windows-Gegenstück zu `dsh-bash-local`: Wähle ihn, wo `pwsh` die Plattform-Shell ist, sodass eine Komposition die POSIX-Zeilen gegen die pwsh-Zeilen tauschen und dieselbe Semantik behalten kann. Der Executor resolved das `pwsh`-Executable aus einem expliziten `pwshPath`, bekannten Windows-Installationsorten, PATH-Einträgen oder Windows PowerShell 5.1 als letzte Instanz. Für uneingeschränkte Ausführung ist er der Default; komponiere `dsh-pwsh-sandbox`, wenn Kommandos die Sandbox-Capability brauchen.

### Minimale Konfiguration

Lade den Executor mit den gewünschten Budgets; jedes Feld hat einen Default, sodass die kleinste Komposition der Plugin-Eintrag allein ist. Der Settings-Provider (wenn komponiert) legt eine User-Sektion über diesen Eintrag, sodass Budgets sich zur Laufzeit ohne Reload ändern können (siehe [Budgets zur Laufzeit anpassen](#adjusting-budgets-at-runtime)).

```yaml
- id: bash
  name: '@deepseek-ai/dsh-pwsh-local'
  config:
    cwd: C:\path\to\workspace
    timeoutMs: 120000
```

| Feld | Default | Bedeutung |
|---|---|---|
| `cwd` | `process.cwd()` | Default-Arbeitsverzeichnis für Kommandos |
| `timeoutMs` | `120,000` | Default-Foreground-Timeout in Millisekunden |
| `maxTimeoutMs` | `600,000` | Cap für Pro-Call-Timeout-Overrides |
| `maxOutputBytes` | `64,000` | Pro-Stream-In-Memory-Output-Cap; Überlauf spillt in eine Temp-Datei |
| `maxSpillBytes` | `67,108,864` | Pro-Stream-Full-Output-Spill-Cap |
| `graceMs` | `3,000` | Karenzzeit für Kill-Escalation und Pipe-Draining nach dem Exit |
| `pwshPath` | resolved | Explizites pwsh-Executable; sonst bekannte Orte, dann PATH |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.md#deepseek-aidsh-pwsh-local) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Kommandos ausführen

Führe ein Kommando mit `run` aus und lies seine Ausgabe aus dem Ergebnis; ein Exit ungleich null, ein Timeout oder ein Abbruch resolved beschreibend, und nur Infrastrukturfehler rejecten. Der Kommandostring fährt als ein Argument zu `-Command` mit: PowerShell parst den Text selbst, und es existiert keine Zwischen-Shell, sodass es keine Shell-Quoting-Schicht zum Escapen gibt und native Win32-Pfade unverändert durchgehen. Jedes Kommando pinnt zuerst UTF-8-Ausgabe, sodass Nicht-ASCII-Ausgabe selbst auf dem Windows-PowerShell-5.1-Fallback nicht verstümmelt wird. Die Umgebung ist modellfreundlich: `NO_COLOR=1 PAGER=cat GIT_PAGER=cat` (kein `TERM=dumb` — ein POSIX-Konzept), wobei explizite caller-gelieferte Einträge weiterhin gewinnen.

```text
const result = await ctx.shell.run(ctx.shell.resolve({ command: 'Get-ChildItem' }))
if (result.timedOut) console.log('timed out after', result.timeoutMs)
```

### Background-Prozesse

Rufe `start` auf, um ein Kommando im Hintergrund zu starten; es gibt sofort ein Handle zurück, und es gilt kein Timeout. `readOutput()` mergt die Stream-Deltas zu einem konsumierenden Read und markiert stderr unter einer `[stderr]`-Sektion; `kill()` beendet den provider-verwalteten Bereich; `done` settled, wenn das Direktkommando schließt, und rejectet nie. Job-ids, Ownership, Polling und Notices gehören zur generischen `ctx.jobs`-Runtime, in der die Tool-Schicht das Handle registriert.

<a id="adjusting-budgets-at-runtime"></a>
### Budgets zur Laufzeit anpassen

Wenn ein Settings-Provider komponiert ist, registriert dieser Executor den geteilten `shell`-Settings-Namespace der Capability — denselben, den die POSIX-Familie verwendet, weil ein Host genau einen Provider von `ctx.shell` komponiert —, sodass eine User-Sektion in `settings.yaml` sich über den Kompositionseintrag legt und das nächste Kommando mit den neuen Budgets läuft. Werte, die das Schema nicht beurteilen kann — positive und endliche Zahlen sowie die `graceMs`-Timer-Grenze —, werden beim Schreiben abgelehnt und lassen den laufenden Executor auf seiner letzten guten Sektion.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design des Executors und zeigt auf den Code, der es umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Designkonzept

Der Executor ist der PowerShell-Service-Provider für den `ctx.shell`-Seam auf der Subprocess-Capability: Er besitzt alles pwsh-Förmige — Executable-Auflösung, Kommando-Defaulting und -Caps, Deadline-Fusion und Ursachen-Klassifikation, UTF-8-Output-Pinning, die modellfreundliche Terminal-Umgebung und den Background-Read-Merge —, während Managed-Range-Mechanik (begrenzte spill-gestützte Ausgabe, Credential-Scrub, Termination-Escalation, Quiescence und Disposal) dem Subprocess-Service gehört. Jeder Aufruf spawnt ein frisches nicht-interaktives `pwsh -Command` mit `-NoLogo -NoProfile -NonInteractive`, sodass Kommandos deterministisch sind und Profil-State nie zwischen Aufrufen leakt.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `PwshLocalExecutor`, `Config`, Settings-Verdrahtung, argv-Seam |
| [`src/resolve.ts`](src/resolve.ts) | Reine `resolvePwshPath`/`candidatePwshPaths`-Executable-Auflösung |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; dieses Paket exponiert keine unabhängige Event-Sequenz oder veränderliche Datenrelation jenseits der an seinem besitzenden Seam durchgesetzten Contracts. |
| `tests/` | Ausgeübtes Verhalten: Budgets, Klassifikation, Auflösung, Background-Handles |

### Hauptfluss

Ein Aufruf durchläuft drei Schritte: `resolve()` füllt `workdir`/`timeoutMs`/`stdoutMaxBytes` aus der Config (und deckelt den Pro-Call-`timeoutMs`-Override); der Executor baut das pwsh-argv — `pwsh -NoLogo -NoProfile -NonInteractive -Command <Encoding-Preamble + Kommando>` —, fusioniert das config-gecappte Timeout mit dem Abort-Signal des Callers zu einer Deadline und spawnt über `ctx.subprocess` mit expliziten Byte-Caps und dem `graceMs`; das settled Ergebnis wird klassifiziert und in ein `ShellRunResult` projiziert. Windows meldet erzwungene Termination als Exit 1 ohne Signal, sodass signalgestempelte Fakten dort POSIX-only sind; die Timeout-/Abort-Klassifikation ist plattformunabhängig.

### Invarianten und Ownership

- Das `graceMs`-Budget muss positiv, endlich und nicht größer als `MAX_TIMER_DELAY_MS` sein, damit Node es mit einem Timer darstellen kann; ungültige Werte werden dort abgelehnt, wo sie geschrieben werden.
- Die Environment-Layering ist fixiert: zuerst Terminal-Overrides, dann das `env` des Callers, dann der vertrauenswürdige `dshEnv`-Snapshot zuletzt; der Subprocess-Service scrubbt ambient Credentials und geerbte `DSH_*`-Namen unabhängig.
- Executable-Auflösung ist eine reine Funktion von `(configured, env, platform)` und tastet das Dateisystem nur neu ab, wenn der gespeicherte `pwshPath` von dem abweicht, aus dem das aktuelle Executable resolved wurde.
- Ein Background-Prozess gehört zum Subprocess-Service: Er überlebt ein reines Executor-Reload und wird gekillt und gejoint, wenn der Service disposed.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Executor-Contract nicht ausreicht. Sie führen vom Seam zum einschränkenden Geschwister und dem PowerShell-Tool.

- [shell-Seam](../shell/README.de.md) — der Executor-Contract, den dieser Provider implementiert, einschließlich der Request/Spec-Trennung.
- [bash-local](../bash-local/README.de.md) — das POSIX-Gegenstück, das dieser Executor Aufruf für Aufruf spiegelt.
- [pwsh-sandbox](../pwsh-sandbox/README.de.md) — der einschränkende Executor, den du stattdessen komponierst, wenn Kommandos die Sandbox-Capability brauchen.
- [tool-pwsh](../tool-pwsh/README.de.md) — das modellseitige `pwsh`-Tool über diesem Executor.
- [Bash-Executor-Subsystem](../../../docs/subsystems/shell.de.md) — Request/Spec-Vokabular, Ergebnisse und der Service-Contract vollständig.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über `dsh-tool-pwsh`, das die begrenzten stdout/stderr-Tails dieses Executors, Background-Prozess-Deltas (über die generische Job-Runtime), Spill-Dateipfade und Infrastrukturfehler rendert.

#### KV-Cache-Effekt

Keine direkte Invalidierung; der benannte Consumer besitzt alle Änderungen am Request-Präfix.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann dieser Executor schlecht passt. Sie sind aktuelle Paket-Constraints, keine Roadmap.

- **Für sich allein uneingeschränkt** — Kommandos laufen mit der Autorität des Harness-Prozesses; Deployments, die Confinement brauchen, komponieren stattdessen einen sandboxenden Executor oder eine Policy.
- **Keine persistente Shell und kein PTY** — jeder Aufruf startet ein frisches `pwsh -Command`.
- **Der Kommandostring ist PowerShell-Text** — die `-Command`-Domäne hat keine Shell-Quoting-Schicht, aber ein modellseitiges Kommando wird von PowerShell selbst geparst, sodass PowerShell-Syntaxfehler Kommandofehler sind, keine Launch-Fehler.
- **Eine Background-Provider-Fehlernotiz ist single-delivery** — `SubprocessHandle.done` kann rejecten, bevor oder nachdem die Zielausführung beginnt, sodass der Executor das stageneutrale `subprocess failed before reporting an outcome: …` in genau ein `readOutput()`-Delta injiziert; ein Reader, der dieses Delta verwirft, kann es nicht zurückholen.
- **Windows-Termination meldet kein Signal** — ein force-gekillter Prozess settled als Exit 1 mit `signal: null`, sodass signalbasierte Statusklassifikation unter Windows nicht gilt; `kill()`-initiierte Stopps stempeln weiterhin direkt `killed`.
- **Die Encoding-Preamble steht vor dem Kommando** — PowerShell verlangt `param(...)`-, `#requires`- und `using`-Anweisungen ganz oben in einem Skript, sodass ein Kommando, dessen erste Anweisung eine davon ist, unter der UTF-8-Output-Preamble nicht laufen kann; verpacke ein `param(...)`-Skript in `& { … }` und führe `using`-/`#requires`-Skripte aus einer Datei aus.
- **Nicht-ASCII-stdin unter Windows PowerShell 5.1 kann falsch dekodiert werden** — die Preamble pinnt nur die Ausgabekodierung; `[Console]::InputEncoding` bleibt beim Host-Default, weil das Setzen unter umgeleitetem stdin wirft; pwsh 7 defaulted auf UTF-8 und ist nicht betroffen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
