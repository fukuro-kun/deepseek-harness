---
description: "Das ausgelieferte Shell-Backend für persistente Terminal-Sessions: interaktive bash oder pwsh unter der geteilten Sandbox-Policy, mit Readiness-Erkennung und begrenzter zeilenorientierter Ausgabe."
kind: "package-reference"
---

# @deepseek-ai/dsh-terminal-bash

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-terminal-bash` startet eine persistente interaktive Shell unter der Sandbox-Policy des Deployments: Die Session bleibt über Tool-Calls hinweg am Leben, Readiness für Eingabe wird erkannt, und begrenzte zeilenorientierte Ausgabe wird für Reads vorgehalten. Es stellt den `shell`-Backend-Typ bereit und unterstützt bash auf POSIX und pwsh auf Windows über eine `shellDialect`-Einstellung. Dasselbe Backend komponiert über den gemounteten Subprocess-Provider mit lokalen oder entfernten Execution-Worlds. Vollbild-Terminalanwendungen liegen außerhalb seines zeilenorientierten Contracts.

## Inhaltsverzeichnis

- [Das Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Das Paket verwenden

Mounten Sie dieses Backend, wenn eine Komposition persistente Shell-Sessions braucht — Zustand wie cwd, exportierte Variablen, Funktionen oder laufende interaktive Childs muss über Tool-Calls hinweg überleben. Es ist der Standard-`shell`-Typ: Eine Komposition, die `@deepseek-ai/dsh-terminal` ohne es mountet, hat keine Sessions zum Öffnen.

### Wann man es wählt

Wählen Sie dieses Backend, wenn die Arbeit eine interaktive Shell oder REPL braucht, deren Zustand persistiert: einen Debugger schrittweise durchlaufen, in einer Python- oder Node-REPL explorieren oder nach dem Unterbrechen eines Foreground-Befehls zur Shell zurückkehren. Wählen Sie das One-shot-bash-Tool für begrenzte Befehle, die in einem Aufruf starten und enden sollen. Der bash-Dialekt zielt auf POSIX; der pwsh-Dialekt zielt auf Windows-Hosts, auf denen `dsh-pwsh-local` eine pwsh-Ausführungsdatei auflösen kann.

### Komposition

Mounten Sie den Terminal-Service, einen Subprocess-Provider, die Sandbox- und Policy-Services, dieses Backend und ein Tool-Paket:

```yaml
- name: '@deepseek-ai/dsh-terminal'
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-sandbox-local'
- name: '@deepseek-ai/dsh-sandbox-policy'
- name: '@deepseek-ai/dsh-terminal-bash'
- name: '@deepseek-ai/dsh-tool-terminal'
```

`danger-full-access` startet die Shell direkt. Eingeschränkte Modi erfordern einen Same-World-`ctx.sandbox`-Provider: ohne einen schlägt der Spawn fehl, bevor die Shell startet.

### Konfiguration

| Feld | Standard | Bedeutung |
|---|---|---|
| `backendType` | `shell` | Auf `ctx.terminals` registrierter Backend-Typ |
| `shellDialect` | `bash` | Interaktiver Shell-Stack: `bash` oder `pwsh` |
| `shellPath` / `shellArgs` | pro Dialekt | Shell-Ausführungsdatei und -Argumente; leer wählt die Dialekt-Defaults |
| `maxReadBytes` | `262144` | Maximale UTF-8-Bytes, die ein Read oder ein abgerechneter Send zurückgibt |
| `timeoutMs` | `30000` | Absolute Grenze für eine Send-Wartezeit |
| `disposeGraceMs` | `3000` | Grace-Zeit, bevor der Teardown zu `SIGKILL` eskaliert |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.md#deepseek-aidsh-terminal-bash) ist die erschöpfende Quelle für jedes Feld, einschließlich der Readiness-Timings (`pollIntervalMs`, `exactProbeAfterMs`, `idleSilenceMs`, `handoffGraceMs`), der Terminal-Größe (`rows`, `cols`) und der Scrollback-Grenzen (`scrollbackLines`, `scrollbackMaxBytes`).

### Shell-Dialekte und Readiness

Beide Dialekte exponieren denselben Readiness-Contract, sodass Consumer dialekt-agnostisch sind. Ein Send settlt, wenn die Shell wieder bereit ist: nachdem der kontrollierte Prompt verifiziert wurde, nachdem die Foreground-Prozessgruppe nachweislich auf stdin wartet (Linux), nach Ausgabestille (`inferred_idle`) oder beim absoluten `timeoutMs`. Ein `inferred_idle`- oder `timeout`-Ergebnis beweist nicht, dass der Foreground-Befehl beendet wurde.

### Sandboxing und sicherer Betrieb

Die Shell läuft ihre gesamte Lebenszeit unter der effektiven Sandbox-Grenze. Das Ändern des effektiven Sandbox-Modus wird abgelehnt, solange der Owner noch offene Sessions oder einen laufenden Spawn hat — warten Sie, bis die Erstellung settled, und schließen Sie zuerst die Sessions, damit kein mit weiterem Zugriff geöffnetes Terminal eine Herabstufung überlebt. Das Backend liefert nur terminal-spezifische Umgebungs-Overrides; der Subprocess-Provider wendet seine geteilte Credential-Bereinigung an.

### Beobachtbare Ergebnisse und Fehler

Ein Open gibt die Session-ID und eine begrenzte Startup-Message zurück. Sends settlen mit einem der vier Wait-Gründe und einem Session-Status; `session_exit` bedeutet, dass die Top-Level-Shell beendet wurde. Setup-Fehler lehnen das Open ab: ein fehlender Sandbox-Provider in einem eingeschränkten Modus, eine Shell, die während des Startups beendet wird, eine Shell, die Readiness vor dem Startup-Timeout nicht erreicht, oder Caller-Cancellation. Cleanup-Fehler lehnen das Close ab, statt Erfolg zu behaupten.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design hinter dem Backend und zeigt auf den Code, der es realisiert; das beobachtbare Verhalten ist in [Das Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Ein Backend bedient beide Dialekte: bash und pwsh teilen dieselbe Session-Maschinerie — Sanitizer, begrenzte Buffer, Readiness-Polling, Cancellation und Teardown — und unterscheiden sich nur in argv, Umgebung und Prompt-Installation. Bash erhält einen privaten Marker über `PS1` plus `PROMPT_COMMAND`. Pwsh schreibt eine Prompt-Funktion, pinnt die UTF-8-Konsolenkodierung und publiziert den Startup erst, nachdem das Backend `stdin_read` meldet; ge-echoter Setup-Text kann die Shell nicht publizieren. Eine Zero-Scrollback-`@xterm/headless`-Instanz konsumiert rohe PTY-Daten und gibt Terminal-Protokoll-Antworten über dasselbe Handle zurück, während der Zeilen-Sanitizer die einzige Ausgabeprojektion bleibt.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Backend-Registrierung, Sandbox-Modus-Fence, argv- und Umgebungs-Assembly, Startup-Sequenz |
| [`src/config.ts`](src/config.ts) | Dialekt-Auflösung, Defaults und Validierung jedes Timing-Felds |
| [`src/session.ts`](src/session.ts) | `LocalPtySession`: Send-Lifecycle, Readiness-Polling, Scrollback, Signale, Close |
| [`src/sanitize.ts`](src/sanitize.ts) | Streaming-Control-Sequence-Sanitizer und Zeilen-Normalisierung |

### Readiness-Modell

Drei begrenzte Stufen settlen einen Send: exakter stdin-Wait-Nachweis vom Subprocess-Provider (nur Linux), der verifizierte private Prompt-Marker mit einem exakten druckbaren Tail und Ausgabestille (`inferred_idle`); ein absoluter Timeout begrenzt die Wartezeit immer. Der pwsh-Startup nutzt eine Deadline über seine gesamte Setup-Schleife, sodass ein `inferred_idle`-Folge-Send die Grenze nicht neu startet. Vor dem Provider-Write gesammelte Evidenz wird an der Write-Grenze verworfen, ein stdin-Wait, der dem Write vorangeht, ist keine Post-Write-Readiness, und unbekannter Foreground-Zustand ist niemals ein positives Exact-Idle-Signal.

### Send-Cancellation und Teardown

Cancellation markiert gequeuete Eingabe als abgebrochen und signalisiert dann der aktuellen Foreground-Prozessgruppe mit einem echten `SIGINT`, nachdem jeder in-flight Provider-Write settled; es emuliert Unterbrechung niemals durch Schreiben von `\x03`. Close stoppt das Readiness-Polling, terminiert den provider-besessenen Prozessbaum, wartet auf Quiescence und settlt den aktiven Send als `session_exit`.

### Sandbox-Modus-Fence

Ein Write, der den effektiven Sandbox-Modus ändern würde, wird abgelehnt, bevor das `sandbox/mode`-Event committet, solange dieser Owner eine offene Session oder einen laufenden Spawn hat. Die Fence ist an den exakten Owner gebunden und überlebt ein Provider-Reload, das bestehende Sessions behält.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paket-Contract nicht ausreicht. Sie führen vom geteilten Terminal-Modell zum Service, den Tools und dem Execution-World-Substrat.

- [Terminal-Subsystem-Referenz](../../../docs/subsystems/terminal.de.md) — der Service-Contract, den dieses Backend implementiert, und die generierte `ctx.terminals`-Fläche.
- [Terminal-Service](../terminal/README.md) — Backend-Registrierung, Owner-Fencing und Cleanup-Semantik.
- [tool-terminal-Tools](../tool-terminal/README.de.md) — die modellseitigen Tools, die Sessions bedienen.
- [Subprocess-Seam](../../../docs/subsystems/subprocess.de.md) — das Terminal-Primitiv, das PTY-Allokation und Prozessbaum-Cleanup besitzt.
- [Persistent-PTY Agent Note](../../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.md) — das Capability-Design und die zurückgestellten Grenzen.
- [Persistent-pwsh Agent Note](../../../.agents/notes/archived/architecture/2026-08-11-pwsh-persistent-pty.md) — das Windows-Substrat und der pwsh-Dialekt.

-----

<a id="model-experience"></a>
## Model Experience

### Indirekter Consumer

#### Was das Modell sieht

Dieses Paket registriert keinen Prompt und kein Tool. Über `@deepseek-ai/dsh-tool-terminal` oder einen anderen PTY-Consumer kann das Modell begrenzte Startup-Ausgabe, Send-Deltas, Scrollback-Seiten, Readiness-Gründe und Cleanup-Fehler erhalten.

#### Token-Effekt

Vorgehaltener PTY-Scrollback wird nicht in die Modell-History gestellt, bis ein Consumer begrenzte Ausgabe zurückgibt.

#### KV-Cache-Effekt

Keine direkte Invalidierung; Consumer-Ergebnisse bleiben nur-append.

### Sandbox-Policy-Kontext

#### Was das Modell sieht

Solange dieses Backend komponiert ist, trägt der `sandbox-policy`-Owner die capability-neutrale `sandbox:policy`-Runtime-Context-Klausel zu Prompts bei.

#### Token-Effekt

Die Policy-Klausel ist auf Requests vorhanden, solange das Backend gemountet ist.

#### KV-Cache-Effekt

Eine Standing-Policy-Änderung hängt einen ersetzenden Runtime-Context-Snapshot nach der vorgehaltenen History an.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo das Backend schlecht passt oder besondere operative Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein allgemeiner Shell-Vergleich und kein Aufgabenrückstand.

- **Nur zeilenorientierte Ausgabe** — ein headless xterm pflegt Control-Sequence-Zustand nur für Terminal-Protokoll-Antworten. Zurückgegebene Ausgabe bleibt auf Zeilen normalisiert, und Vollbild-Alternate-Buffer-Interaktion wird nicht unterstützt.
- **Readiness ist heuristisch ohne eine exakte Stufe** — die exakte stdin-Wait-Erkennung hängt vom gemounteten Subprocess-Provider ab; Provider, die ihn nicht beweisen können (macOS, Windows), settlen auf Prompt-Marker- und Stille-/Timeout-Readiness.
- **pwsh-Bootstrap in einer eingeschränkten Sandbox** — die Prompt-Funktion und der UTF-8-Pin schreiben über `[Console]::`, was der Read-only-Modus der Windows-ACL-Sandbox ablehnen kann. Wenn das Marker-Readiness verhindert, lehnt der Startup bei `timeoutMs` ab, statt eine unvollständige Shell zu publizieren.
- **Cleanup-Garantien gehören dem Provider** — Prozessbaum-Teardown ist der `SubprocessTerminalHandle`-Contract, nicht der dieses Backends.
- **Sessions überleben keinen Prozess-Exit** — ein Harness-Neustart zerstört jede Session.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>

**Runtime-Invariant:** Es wird kein Companion veröffentlicht. Readiness, Terminal-Buffer und Prozessbaum-Zustand sind privater Per-Session-Implementierungszustand, und das Backend publiziert keinen eigenen Lifecycle-Stream oder Snapshot.
