---
description: "Shell-Kommandos und Terminals in der geteilten Remote-Sandbox: was der agent dort ausführen kann, wie Output behandelt wird und was zu erwarten ist — für Deployments und Maintainer der E2B-Familie."
kind: "package-reference"
---

# @deepseek-ai/dsh-subprocess-e2b
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-subprocess-e2b` führt die Shell-Kommandos und interaktiven Terminals des agent in einer E2B-Remote-Sandbox statt auf dem Host aus. Bestehende Kommando-, Terminal- und Language-Server-Workflows laufen ohne E2B-spezifische Tools weiter. Host-Umgebungsvariablen und Secrets werden ausgeschlossen; nur explizit angeforderte Umgebungseinträge gelangen in die Sandbox. Verwende es mit `dsh-e2b` und `dsh-fs-e2b`, damit Kommandos, Terminals und Dateien eine Sandbox teilen. Remote-Ausführung fügt Latenz hinzu, da jedes Kommando ein asynchrones Setup erfordert.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Modell-Erfahrung](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Verwende dieses Paket, wenn die Shell-Kommandos und Terminals des agent in der Remote-Sandbox statt auf deiner Maschine laufen sollen. Es ist die Kommando-Hälfte der E2B-Familie: Kommandos, Terminals und Dateien teilen eine Remote-Welt.

### Wann es wählen

Wähle es, wenn eine Komposition bereits die E2B-Sandbox nutzt und Kommandos sowie Terminals dort laufen sollen. Für Host-Ausführung wähle das lokale Subprocess-Paket.

### Konfiguration

Die einzige Einstellung ist, wie oft das Paket den Status eines laufenden Kommandos prüft; der Default passt für die meisten Deployments, und ein höherer Wert reduziert Remote-Requests auf Kosten einer etwas langsameren Exit-Erkennung.

| Feld | Default | Bedeutung |
|---|---|---|
| `pollMs` | `20` | Wie oft das Paket den Status eines laufenden Kommandos prüft, in Millisekunden |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-subprocess-e2b) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Kommandos ausführen

Der agent kann ein Kommando in der Sandbox mit einem Arbeitsverzeichnis und einer Umgebung ausführen, wählen, wie sein Output geliefert wird (live gestreamt, bis zu einer Größenobergrenze erfasst oder zum eigenen Output der App geroutet), und es stoppen, wenn es hängt — ein Stop bittet das Kommando zuerst höflich zu enden und erzwingt dann nach kurzer Schonfrist den Kill, sodass ein hängendes Kommando nicht auslaufen kann. Sehr großer Output kann in eine Datei in der Sandbox gespeichert werden, damit der agent ihn später lesen kann. Der Exit-Code des Kommandos wird normal gemeldet; verschwindet die Sandbox, während ein Kommando läuft, wird das Kommando als beendet behandelt statt zu fehlschlagen.

### Terminals verwenden

Der agent kann ein interaktives Terminal in der Sandbox öffnen, Eingaben senden, Output lesen und darin laufenden Programmen Signale senden — Prompts, interaktive Tools und Vollbildprogramme verhalten sich wie lokal. Terminal-Features wie Scrollback und Readiness-Erkennung werden vom Terminal-Tooling bereitgestellt, das unverändert funktioniert.

### Die Umgebung sauber halten

Kommandos laufen mit einer sauberen, sandbox-nativen Umgebung: Host-Variablen und Werte, die wie Credentials aussehen, werden nicht implizit übergeben, und nur Einträge, die der agent explizit anfordert, werden gesetzt. Das hält Secrets aus der Sandbox.

### Wenn die Sandbox verschwindet

Die Sandbox ist kurzlebig: Wird sie gelöscht, während Kommandos oder Terminals laufen — durch Ablauf, Shutdown oder Entfernung von anderer Stelle — werden die betroffenen Kommandos als sauber beendet behandelt. Verlasse dich nicht darauf, dass Arbeit die Sandbox überlebt.

Das Default-Sandbox-Image enthält die Runtime und die Utilities, die Kommando-Arbeit braucht: `node`, `bash`, `setsid`, `ps`, `awk`, `tr`, `env`, `base64`, `chmod`, `tee`, `head`, `rm`, `kill`, `id` und `getent`.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Design-Entscheidungen hinter dem Provider und zeigt auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designphilosophie

- **Provider-private Remote-Identität.** Der synchrone Seam blockiert nie auf dem Netzwerk. Private Wrapper-Dateien publizieren asynchron eine Prozessgruppen-Identität für stdin, Observation, Termination und Quiescence-Checks, zusammen mit dem direkten Exit-Code und der Spill-Validität; diese Identität ist nicht die angeforderte Ziel-PID.
- **Eine Teardown-Leiter.** Termination, Rollback und Disposal teilen einen Prozessgruppen-Signalpfad — `SIGTERM`, dann `SIGKILL` plus SDK-Kill-Fallback — und behandeln bewiesene Quiescence als final.
- **Die Umgebung ist explizit.** Nichts vom Host und nichts Credential-förmiges gelangt implizit in die Sandbox; jeder ambient Wert wird gesäubert und jeder `spec.env`-Eintrag ist ein explizites Opt-in.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `E2BSubprocessRuntime`, `Config`, spawn und spawnTerminal, Disposal |
| [`src/process.ts`](src/process.ts) | `E2BSubprocessHandle`: Remote-Wrapper, Publikation, Termination, Output-Projektion |
| [`src/terminal.ts`](src/terminal.ts) | `E2BTerminalHandle`: PTY-Allokation, Session-Teardown |
| [`src/environment.ts`](src/environment.ts) | Remote-Umgebungsprobe, Scrubbing, Serialisierung |
| [`src/output.ts`](src/output.ts) | Base64-Decoder und begrenzte Output-Reader |
| [`src/remote.ts`](src/remote.ts) | Geteilte Control-Shell-Helfer: Option-Shaping, Poll-Ticks, Gruppen-Signalisierung |
| — | Es wird kein Runtime-Invariant-Companion publiziert; lebende Remote-Handles sind private Teardown-Ownership, und der E2B-Kommando-Event-Stream ist die alleinige Ergebnis-Autorität. |

### Remote-Wrapper

Der Bootstrap löst seine eigenen Werkzeuge aus dem Sandbox-PATH auf, lehnt jeden fehlenden oder nicht ausführbaren Pfad ab, exec't über `env -i` und `setsid --wait`, publiziert die Prozessgruppen-ID und den Exit-Code in private Dateien unter `ctx.e2b.runtimeRoot/processes` und leitet stdout und stderr durch Base64-Encoder, die einen reservierten Completion-Frame emittieren; `tee` und `head -c` begrenzen optionale Spill-Dateien.

### Private Prozess-Identität und Publikation

Der synchrone Seam liefert sofort ein Handle, während das Kommando asynchron startet. Der Wrapper publiziert eine private Prozessgruppen-ID für stdin, Observation, Termination und Quiescence-Checks, aber diese ID ist nicht die angeforderte Ziel-PID. Ein Startup-Signal bricht Umgebungs- und Private-State-Vorbereitung vor der Allokation ab; sobald die Allokation beginnt, wartet ein Cancel auf ein provisorisches SDK-Handle, das es aufräumen kann.

### Umgebungsgrenze

Eine vertrauenswürdige Control-Shell-Probe löst das Login-Home des Sandbox-Nutzers aus seinem passwd-Eintrag auf und transportiert die Sandbox-Umgebung als Base64-ASCII für ein einziges striktes UTF-8-Decoding; der Wrapper entfernt dann ambient `DSH_*` und credential-förmige (`*KEY*`, `*SECRET*`, `*TOKEN*`) Namen und stellt jeden gültigen `spec.env`-Eintrag als explizites Opt-in des Aufrufers wieder her. Leere Namen, `=` und NUL-Framing-Verletzungen werden vor dem Launch abgelehnt; nachfolgende Kommando- und PTY-Login-Shells erhalten ein frisch randomisiertes `HOME` auf Root-Ebene plus leere Overrides für jeden gesäuberten ambient Namen, bevor User-Profile laufen können. Private Umgebungsdateien werden nach dem Konsum entfernt.

### Output-Behandlung

Der Remote-Wrapper verzweigt rohe Bytes in optionale begrenzte Spill-Dateien und framed jeden Live-Chunk als zeilengetrenntes Base64-ASCII; der Host stellt Bytes über beliebige SDK-Callback-Grenzen wieder her. Pipe-Modus schreibt in Host-Node-Streams, Inherit-Modus in die Harness-Prozess-Streams, und Collect-Modus behält einen begrenzten Host-Tail mit Offset-Reads. Bei Collect- oder Inherit-Output wird ein unvollständiger SDK-Stream nach `graceMs` getrennt und sein Partial-Spill zurückbehalten; natürliche Raw-Pipe-Completion wartet auf verlustfreien Transport und bewahrt Backpressure. Batch- und Streaming-stdin nutzen das SDK-Handle.

### Termination-Leiter

Termination und Rollback teilen einen toleranten Signalpfad (`signalRemoteGroups`), eskalieren `SIGTERM` zu `SIGKILL` bei Ablauf der Schonfrist, nutzen den SDK-Kill als Fallback und beweisen Quiescence mit einer begrenzten Prozesstabellen-Probe, bevor sie Erfolg melden; nur-Zombie-Gruppen gelten als leer, und ein `SandboxNotFoundError` wird als Quiescence behandelt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie führen von der Familien-Komposition zur Subprocess-Seam-Oberfläche und den Consumers, die sie rendern.

- [E2B-Provider-Familienkarte](../README.de.md) — der Sandbox-Besitzer und die Drei-Paket-Komposition.
- [Subprocess-Subsystem](../../../docs/subsystems/subprocess.de.md) — der Subprocess-Seam-Vertrag und die generierte Cordis-Oberfläche.
- [Subprocess-Seam-Paket](../../subprocess/subprocess/README.de.md) — der abstrakte Vertrag, den dieser Provider implementiert.
- [Bash-Executor](../../shell/bash-local/README.de.md) — der Consumer, der gespawnte Kommandos dem Modell rendert.
- [PTY-Terminal-Backend](../../terminal/terminal-bash/README.de.md) — der Consumer, der Terminal-Sessions rendert.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-subprocess-e2b) — jedes akzeptierte Config-Feld und seine Quell-Deklaration.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

Indirekt, über Consumer-Seams wie die Bash-Executor-Familie, die Remote-Output, Exit-Fakten, Hintergrund-Deltas und Spill-Pfade rendern.

#### KV-Cache-Effekt

Keine direkte Invalidierung: Die Consumer-Seams besitzen alle Request-Prefix-Änderungen; der Transport dieses Backends erreicht nie einen Request.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Provider schlecht passt oder besondere Betriebsaufmerksamkeit braucht. Sie sind aktuelle Paket-Constraints, kein Aufgaben-Backlog.

- **Das SDK behält weiterhin den kompletten Kommando-Output im Host-Speicher** — E2B `CommandHandle.stdout` und `.stderr` akkumulieren den Base64-Transport, selbst wenn dieser Adapter begrenzte Raw-Byte-Tails exponiert, sodass die übliche Host-Speicher-Grenze des Subprocess-Seam nicht erreicht wird und die Transport-Retention größer ist als der Quell-Stream.
- **Private State lebt für die Sandbox-Lebenszeit** — Prozessverzeichnisse und gültige Spill-Dateien bleiben unter `.dsh-e2b`, bis der Besitzer die Sandbox löscht; dieser POC liefert kein In-Sandbox-Sweep.
- **Control-State teilt die UID des Sandbox-Nutzers** — E2B führt jedes Kommando als derselbe Default-Nutzer aus, sodass `0700`/`0600`-Modi `.dsh-e2b`-Control-Dateien nicht von gleichzeitig laufenden Sandbox-Prozessen isolieren können; echte Isolation braucht einen E2B-Per-Command-Nutzer oder einen Out-of-Band-Control-Channel.
- **Numerische Prozess-Identitäten sind nicht gegen Wiederverwendung abgegrenzt** — E2B exponiert numerische PID/PGID-Eingaben, Signalisierung und Cleanup-Operationen, aber keine atomare identitätsgebundene Alternative; ein Ersatz bleibt zurückgestellt, bis E2B eine Identitäts-Primitive einführt oder ein Fehler ein engeres Protokoll belegt.
- **Die initiale Umgebungsprobe erbt Sandbox-Defaults** — E2B merged Kommando-Overrides mit Default-Umgebungseinträgen, sodass die Probe unbekannte credential-förmige Namen nicht leeren kann, bevor sie sie aufzählt; dieser POC unterstützt daher keine Secrets in Sandbox-Default-Umgebungsvariablen.
- **E2B exponiert kein Signal-Faktum** — ein vom Adapter angefordertes `SIGTERM` oder `SIGKILL` wird nur gemeldet, wenn kein wrapper-publizierter direkter Exit-Code gewinnt; jeder unangeforderte SDK-Exit bleibt ein Exit-Code, einschließlich Werten gleich `128 + signal`.
- **Exakte Terminal-stdin-Wait-Inspektion ist nicht verfügbar** — E2B exponiert die Foreground-Prozessgruppe, aber nicht die Syscall-Evidenz, die nötig wäre, um zu beweisen, dass sie auf fd 0 wartet; das generische PTY-Backend fällt daher auf kontrollierte Prompt-Marker und begrenztes Schweigen zurück.
- **Linux-Utility- und E2B-Transport-Semantik werden angenommen** — es gibt keine Windows-, Escaped-Session-Recovery- oder Network-Partition-Fidelity-Ebene.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev-Notiz ist Arbeitskontext für Maintainer: offene Fragen und Richtungen, die nicht entschieden sind. Sie ist explizit nicht autoritativ — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen stehen in den Abschnitten oben und im Paket-Code.

#### Offen: numerische Prozess-Identitäten

E2B exponiert numerische PID/PGID-Eingaben, Signalisierung und Cleanup-Operationen ohne eine atomare identitätsgebundene Alternative. Der Adapter minimiert Host-Round-Trips und stellt einen Ersatz zurück, bis E2B eine Identitäts-Primitive einführt oder ein Fehler ein engeres Protokoll belegt (TODO(e2b-pgid-identity)).

#### Offen: Ersatz-Umgebungen und Status-Observation

Die initiale Umgebungsprobe erbt Sandbox-Defaults, weil E2B Kommando-Overrides merged, und Collect/Inherit-Kommando-Status braucht Control-Plane-Polling, weil E2B den Exit eines Direct-Kommandos nicht unabhängig vom durch Nachfahren gehaltenen Output beobachten kann. Beide schließen nur mit neuen E2B-Primitiven (TODO(e2b-replace-environment), TODO(e2b-status-watch)).

</details>
