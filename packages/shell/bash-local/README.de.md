---
description: "Der Default-POSIX-Bash-Executor für Deployments und Maintainer, die uneingeschränkte Kommandoausführung über die Shell-Seam auswählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-bash-local
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-bash-local` ist der Default-Bash-Executor für POSIX: Jedes Kommando läuft als frischer Non-Login-`bash -c`-Prozess ohne rc-Dateien, sodass kein Shell-State zwischen Aufrufen überlebt. Er wendet die konfigurierten Budgets — Arbeitsverzeichnis, Timeout, Ausgabeobergrenzen — auf jedes Kommando an, klassifiziert Timeouts und Abbrüche und liefert begrenzte Ausgabe mit Spill-Datei-Wiederherstellung, wenn ein Stream überläuft. Kommandos laufen mit der eigenen Autorität des Harness-Prozesses: Dieser Executor schränkt nichts ein, also komponieren Sie `dsh-bash-sandbox`, wenn Kommandos die Sandbox-Capability brauchen. Sobald er gemountet ist, spricht das modellseitige `bash`-Tool mit ihm.

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

Mounten Sie diesen Executor, wenn eine Komposition Bash-Kommandoausführung auf POSIX ohne Einschränkung braucht. Er registriert sich als `ctx.shell`, und das modellseitige `bash`-Tool arbeitet sofort darüber: Ein Agent ruft das Tool auf, und das Kommando läuft als frischer `bash -c`-Prozess mit den untenstehenden Budgets.

### Minimale Konfiguration

Laden Sie den Executor mit den gewünschten Budgets; jedes Feld hat einen Default, sodass die kleinste Komposition allein der Plugin-Eintrag ist. Der Settings-Provider legt (wenn komponiert) eine User-Sektion über diesen Eintrag, sodass Budgets zur Laufzeit ohne Reload wechseln können (siehe [Budgets zur Laufzeit anpassen](#adjusting-budgets-at-runtime)).

```yaml
- id: bash
  name: '@deepseek-ai/dsh-bash-local'
  config:
    cwd: /path/to/workspace
    timeoutMs: 120000
```

| Feld | Default | Bedeutung |
|---|---|---|
| `cwd` | `process.cwd()` | Default-Arbeitsverzeichnis für Kommandos |
| `timeoutMs` | `120,000` | Default-Foreground-Timeout in Millisekunden |
| `maxTimeoutMs` | `600,000` | Obergrenze für pro-Aufruf-Timeout-Overrides |
| `maxOutputBytes` | `64,000` | Pro-Stream-In-Memory-Ausgabeobergrenze; Überlauf spillt in eine Temp-Datei |
| `maxSpillBytes` | `67,108,864` | Pro-Stream-Obergrenze für die vollständige Spill-Ausgabe |
| `graceMs` | `3,000` | Karenzzeit für Kill-Eskalation und Pipe-Draining nach dem Exit |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-bash-local) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Kommandos ausführen

Führen Sie ein Kommando mit `run` aus und lesen Sie seine Ausgabe aus dem Ergebnis. Ein Nonzero-Exit, ein Timeout oder ein Abbruch resolved mit einem beschreibenden Ergebnis — nur Infrastruktur-Fehler rejecten. Pro-Aufruf-`timeoutMs`-Overrides werden durch die Konfiguration gedeckelt, während `workdir` auf den konfigurierten Default zurückfällt, wenn es nicht gesetzt ist; ein vertrauenswürdiger Foreground-Aufrufer kann außerdem das stdout-Capture-Budget für einen Aufruf erhöhen, während stderr und Hintergrund-Läufe `maxOutputBytes` behalten. Die Umgebung ist per Default modellfreundlich: `NO_COLOR=1 TERM=dumb PAGER=cat GIT_PAGER=cat` verhindern, dass Pager und ANSI-Farben die Ausgabe verunstalten, und ein explizit vom Aufrufer gelieferter Eintrag gewinnt trotzdem.

```text
const result = await ctx.shell.run(ctx.shell.resolve({ command: 'ls -la' }))
if (result.timedOut) console.log('timed out after', result.timeoutMs)
```

### Hintergrund-Prozesse

Rufen Sie `start` auf, um ein Kommando im Hintergrund laufen zu lassen; es gibt sofort einen Handle zurück, und es gilt kein Timeout. `readOutput()` mergt die Stream-Deltas zu einem konsumierenden Read und markiert stderr unter einer `[stderr]`-Sektion; `kill()` beendet den provider-verwalteten Bereich; `done` settlet, wenn das direkte Kommando schließt, und rejectet nie. Job-Ids, Ownership, Polling und Notices gehören der generischen `ctx.jobs`-Runtime, bei der die Tool-Schicht den Handle registriert.

<a id="adjusting-budgets-at-runtime"></a>
### Budgets zur Laufzeit anpassen

Wenn ein Settings-Provider komponiert ist, registriert dieser Executor den von der Capability geteilten `shell`-Settings-Namespace mit dem Kompositionseintrag als Basis, sodass eine User-Sektion in `settings.yaml` darüber liegt und das nächste Kommando mit den neuen Budgets läuft. Werte, die das Schema nicht beurteilen kann — positive und finite Zahlen sowie die `graceMs`-Timer-Schranke — werden beim Schreiben abgelehnt, sodass der laufende Executor auf seiner letzten guten Sektion bleibt; ohne Provider läuft der Kompositionseintrag.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design des Executors und verweist auf den Code, der es umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig behandelt.

### Design-Konzept

Der Executor ist ein Service Provider der `ctx.shell`-Seam, gebaut auf der Subprocess-Capability: Er besitzt alles Bash-förmige — Kommando-Defaults und -Obergrenzen, Deadline-Fusion und Ursachen-Klassifikation, die modellfreundliche Terminal-Umgebung und den Hintergrund-Read-Merge — während die Managed-Range-Mechanik (begrenzte spill-gestützte Ausgabe, Credential-Scrub, Terminierungs-Eskalation, Quiescence und Disposal) dem Subprocess-Service gehört. Jeder Aufruf spawnt ein frisches Non-Login-`bash -c` ohne rc-Dateien, sodass Kommandos deterministisch sind und nie Shell-State zwischen Aufrufen leakt.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `LocalBashExecutor`, `Config`, Settings-Sektion-Verdrahtung |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; dieses Paket exponiert keine unabhängige Event-Sequenz oder mutable Datenrelation über die an seiner besitzenden Seam durchgesetzten Verträge hinaus. |
| `tests/executor.spec.ts` | Ausgeübtes Verhalten: Budgets, Klassifikation, Hintergrund-Handles, Ownership |
| `tests/settings.spec.ts` | Settings-Layering über dem Kompositionseintrag |

### Hauptfluss

Ein Aufruf durchläuft drei Schritte: `resolve()` füllt `workdir`/`timeoutMs`/`stdoutMaxBytes` aus der Config (und deckelt pro-Aufruf-Overrides); `run` fusioniert das config-geklemmte Timeout mit dem Abort-Signal des Aufrufers zu einer Deadline und spawnt `['bash', '-c', command]` über `ctx.subprocess` mit expliziten Byte-Obergrenzen und dem `graceMs`; das abgerechnete Subprocess-Ergebnis wird klassifiziert — nur das eigene Timeout des Executors meldet `timedOut`, ein Upstream-Abbruch meldet `aborted`, ein selbst-signalisiertes Kommando meldet keines von beiden — und in ein `ShellRunResult` mit gesammelter Ausgabe projiziert.

### Invarianten und Ownership

- Das `graceMs`-Budget muss positiv, finit und nicht größer als `MAX_TIMER_DELAY_MS` sein, damit Node es mit einem Timer darstellen kann; ungültige Werte werden dort abgelehnt, wo sie geschrieben werden.
- Das Umgebungs-Layering ist fix: zuerst Terminal-Overrides, dann das `env` des Aufrufers, zuletzt der vertrauenswürdige `dshEnv`-Snapshot; der Subprocess-Service scrubbt unabhängig ambient Credentials und geerbte `DSH_*`-Namen.
- Ein Hintergrund-Prozess gehört dem Subprocess-Service: Er überlebt einen Executor-only-Reload und wird gekillt und gejoint, wenn der Service disposed wird.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Executor-Vertrag nicht ausreicht. Sie führen von der Seam zum einschränkenden Geschwisterpaket und zur Mechanik darunter.

- [shell-Seam](../shell/README.de.md) — der Executor-Vertrag, den dieser Provider implementiert, inklusive des Request/Spec-Splits.
- [bash-sandbox](../bash-sandbox/README.de.md) — der einschränkende Executor, den Sie stattdessen komponieren, wenn Kommandos die Sandbox-Capability brauchen.
- [tool-bash](../tool-bash/README.de.md) — das modellseitige `bash`-Tool über diesem Executor.
- [Bash-Executor-Subsystem](../../../docs/subsystems/shell.de.md) — Request/Spec-Vokabular, Ergebnisse und der Service-Vertrag in voller Länge.
- [subprocess-local](../../subprocess/subprocess-local/README.de.md) — die Managed-Range-Mechanik hinter diesem Executor.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über `dsh-tool-bash`, das die begrenzten stdout/stderr-Tails, Hintergrund-Prozess-Deltas, Spill-Datei-Pfade und Infrastruktur-Fehler dieses Executors rendert.

#### KV-Cache-Effekt

Keine direkte Invalidierung; der benannte Consumer besitzt alle Request-Präfix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann dieser Executor eine schlechte Wahl ist. Sie sind aktuelle Paket-Einschränkungen, keine Roadmap.

- **Selbst uneingeschränkt** — Kommandos laufen mit der Autorität des Harness-Prozesses; Deployments, die Einschränkung brauchen, komponieren `dsh-bash-sandbox`, während pro-Aufruf-Allow/Deny/Ask-Policy auf dem `pre-execute`-Waterfall der Tools liegt.
- **Keine persistente Shell und kein PTY** — jeder Aufruf startet ein frisches Non-Login-`bash -c`; reine cwd-Persistenz und interaktive Terminal-Sessions bleiben zurückgestellt, bis ein echter Workflow sie erfordert.
- **Nur POSIX** — das `bash`-Binary ist hartkodiert, und die Gruppensemantik des zugrunde liegenden Services ist POSIX; Windows wird nicht unterstützt.
- **Eine Hintergrund-Provider-Fehler-Notiz ist Single-Delivery** — `SubprocessHandle.done` kann vor oder nach Beginn der Zielausführung rejecten, deshalb injiziert der Executor das stage-neutrale `subprocess failed before reporting an outcome: …` in genau ein `readOutput()`-Delta; ein Reader, der dieses Delta verwirft, kann es nicht zurückgewinnen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
