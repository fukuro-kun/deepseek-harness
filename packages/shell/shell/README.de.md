---
description: "Der Bash-Executor-Seam für Entwickler und Maintainer, die Kommandoausführung über ctx.shell auswählen, zusammensetzen oder implementieren."
kind: "package-reference"
---

# @deepseek-ai/dsh-shell

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Verwende `ctx.shell`, um Foreground-Shell-Kommandos mit begrenzter Ausgabe auszuführen oder Background-Prozesse zu starten, die sofort ein Handle zurückgeben. Ein Profil kann lokale oder gesandboxete Bash- bzw. PowerShell-Ausführung wählen, ohne Aufrufer zu ändern. Löse jeden Request vor der Ausführung auf, um Arbeitsverzeichnis, Timeout und Ausgabelimits explizit zu machen. Kommandoende, Exit-Codes ungleich null, Timeouts und Abbrüche durch den Aufrufer liefern Ergebnisse; nur Infrastrukturfehler rejecten, während die `bash`- und `pwsh`-Tools modellsichtbares Rendering und Sandbox-Guidance besitzen.

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

Verwende `ctx.shell`, wenn ein Agent oder ein In-Process-Plugin ein Shell-Kommando ausführen und seine Ausgabe lesen oder einen Background-Prozess starten und pollen muss. Es ist der Vertrag, auf dem jeder Shell-Executor und die modellseitigen `bash`/`pwsh`-Tools aufbauen, sodass dagegen geschriebener Code über jeder Executor-Implementierung läuft.

### Foreground-Kommandos

Rufe `run` mit einer resolved Spec auf, um ein Kommando im Vordergrund auszuführen. Das Promise resolved, wenn das Kommando endet: Ein Exit-Code ungleich null, ein Executor-Timeout-Kill oder ein Caller-Abort-Kill ist ein Ergebnis, niemals eine Rejection. `run` rejectet nur bei Infrastrukturfehlern wie einem unbrauchbaren Arbeitsverzeichnis oder einer fehlenden Shell. Das Ergebnis trägt Exit-Code oder Signal, ob ein Timeout oder Abort den Lauf verkürzt hat, und das gesammelte stdout/stderr mit Spill-Dateipfaden, wenn ein Stream sein Budget überschritten hat.

```text
const result = await ctx.shell.run(ctx.shell.resolve({ command: 'ls -la' }))
console.log(result.exitCode, result.stdout.text)
```

### Background-Prozesse

Rufe `start` mit einer resolved Spec auf, um einen Background-Prozess zu starten; er gibt sofort ein Handle zurück, und es gilt kein Timeout. Lies die Ausgabe inkrementell mit `readOutput()` — aufeinanderfolgende Reads liefern Ausgabe nie doppelt, und lossy Reads zeigen auf Spill-Dateien des vollständigen Streams. Beende den Provider-verwalteten Bereich mit `kill()` (gibt `false` zurück, sobald das Direktkommando beendet ist) und warte auf `done` für die Settlement des Direktkommandos. Job-IDs, Ownership, Polling und Notices gehören zur generischen `ctx.jobs`-Runtime, in der die Tool-Schicht das Handle registriert.

### Requests und resolved Specs

Jede Ausführung beginnt mit einem `ShellExecRequest` mit optionalen Feldern; das `resolve()` des Executors wandelt ihn in eine vollständig aufgelöste `ShellExecSpec` mit expliziten Defaults und Caps um, bevor irgendetwas läuft. Diese Request/Spec-Trennung ist das Template des Repositorys für explizite Auflösung an Paketgrenzen: Aufrufer verlassen sich nie auf versteckte Defaults in `run` oder `start`. `resolve()` füllt Arbeitsverzeichnis und Timeout aus der Executor-Konfiguration, deckelt pro-Aufruf-Overrides und reicht optionale Inputs — `stdin`, gewöhnliches `env` und den vertrauenswürdigen `DSH_*`-Snapshot — unverändert durch.

### Einen Executor wählen und komponieren

Der Seam ist kein Executor: Mounte genau einen Provider pro Komposition, und die Tools arbeiten unverändert. Auf POSIX führt `dsh-bash-local` Kommandos als frische `bash -c`-Prozesse aus, und `dsh-bash-sandbox` schirmt jedes Kommando über die Sandbox-Capability ab; unter Windows sind `dsh-pwsh-local` und `dsh-pwsh-sandbox` die Gegenstücke. Die `bash`- und `pwsh`-Tools bewerben Escalation-Felder nur, solange ein sandboxender Executor gemountet ist. Die kleinste Komposition ist der Executor allein:

```yaml
- id: bash
  name: '@deepseek-ai/dsh-bash-local'
  config:
    cwd: /path/to/workspace
```

### Der gemeinsame Exit-Status-Vertrag

Tool-Ergebnisse enden mit einem maschinenlesbaren Exit-Marker — `[exit code: N]` oder `[killed by signal: X]` — sodass das Modell immer erkennen kann, wie ein Kommando endete. Der Seam besitzt dieses Marker-Format und den `parseExitStatus`-Helper, der ein gerendertes Ergebnis zurück in Ausgabe-Body und strukturierten Exit-Status zerlegt und so verhindert, dass die `bash`- und `pwsh`-Tools darin auseinanderdriften.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design des Seam und zeigt auf den Code, der es umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Designphilosophie

Das Paket ist eine Rolle eines Standard-Capability-Seams: die Service Definition, die den Executor-Vertrag benennt, mit Service Providers und Consumern so getrennt, dass jede Rolle unabhängig evolviert (siehe die [Capability-Seams-Notiz](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.de.md)). Zwei Entscheidungen verankern den Vertrag:

- **Explizite Auflösung an der Grenze.** `resolve(request)` ist die einzige Stelle, an der Defaults und Caps angewendet werden; `run` und `start` akzeptieren nur resolved Specs und defaulten nie erneut, sodass kein versteckter Fallback in einer Implementierung lebt.
- **Task-freie Background-Handles.** `start` gibt einen `ShellProcess` ohne id oder Owner zurück; Job-Identität, Ownership und Lifecycle gehören zur generischen `ctx.jobs`-Runtime und halten Executors unabhängig von Sessions.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: abstrakter `ShellExecutor`-Service und der geteilte Settings-Namespace |
| [`src/types.ts`](src/types.ts) | Request/Spec-Vokabular, `ShellRunResult`, `ShellProcess` und Sandbox-Fakten |
| [`src/render.ts`](src/render.ts) | `parseExitStatus`: der Exit-Status-Marker-Vertrag, den die Shell-Tools teilen |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; diese zustandslose Service Definition besitzt Request/Result-Typen, während Executors und Policy die Beobachtungen besitzen. |

### Settings-Namespace

`SHELL_SETTINGS_NAMESPACE` wird hier und nicht von einem Provider exportiert, weil er die Capability benennt, nicht eine Implementierung: Ein Host komponiert genau einen Provider von `ctx.shell`, sodass die Provider einen Namespace ohne Kollision teilen, und ein zwischen Plattformen übertragenes Settings-Dokument auf beiden weiter auflöst.

### Background-Lifecycle und Ownership

Ein Background-Prozess gehört zum Subprocess-Service, nicht zum Executor: Er überlebt ein reines Executor-Reload und wird beim Teardown der Komposition gekillt und gejoint. Implementierungen müssen die Semantik des Seam einhalten — `run` rejectet nur bei Infrastrukturfehlern; `start` kehrt sofort ohne Timeout zurück, und sein `done` rejectet nie (eine Rejection des Subprocess-Providers settled als `killed` mit einem stagenneutralen Fehler auf stderr); `readOutput` ist konsumierend, und lossy Reads melden Spill-Dateien.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Seam-Vertrag nicht ausreicht. Sie führen von der gemeinsamen Subsystem-Referenz zu den konkreten Executors und den modellseitigen Tools.

- [Bash-Executor-Subsystem](../../../docs/subsystems/shell.de.md) — das Request/Spec-Vokabular, Ergebnisse und der vollständige Service-Vertrag.
- [bash-local](../bash-local/README.de.md) — der Standard-POSIX-Executor: frische `bash -c`-Prozesse, Budgets und Deadlines.
- [bash-sandbox](../bash-sandbox/README.de.md) — der abschirmende Executor: Sandbox-Modi, Denials und Escalation.
- [tool-bash](../tool-bash/README.de.md) — das modellseitige `bash`-Tool über diesem Seam.
- [Capability-Seams-Notiz](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.de.md) — die Service-Definition-/Provider-/Consumer-Trennung, der dieser Seam folgt.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über `dsh-tool-bash`, das Executor-Ausgabe und Sandbox-Fakten in Guidance und persistierte Tool-Result-Tokens verwandelt.

#### KV-Cache-Effekt

Keine direkte Invalidierung; der benannte Consumer besitzt alle Änderungen am Request-Präfix.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was der Seam nicht bereitstellt. Sie sind aktuelle Paket-Constraints, keine Roadmap.

- **Kein Vokabular für interaktive Eingabe** — `stdin` wird einmal beim Spawn geschrieben und geschlossen; der Seam hat keinen Kanal, um eine laufende Aufgabe zu füttern, und kein PTY-Session-Konzept.
- **Foreground-Timeouts sind immer executor-eigen** — ein Caller-Owned-Deadline-Modus auf dem Seam ist durch die [Tool-Call-Timeout-Policy-Notiz](../../../.agents/notes/implemented/architecture/2026-07-07-tool-call-timeout-policy.de.md) explizit zurückgestellt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
