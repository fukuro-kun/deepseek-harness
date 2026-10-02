---
description: "Der lokale Host-Provider für den Subprocess-Service: OS-eigene Managed Ranges und echte Terminal-Sessions auf der Host-Maschine ausführen, mit explizit schwächeren Fallbacks."
kind: "package-reference"
---

# @deepseek-ai/dsh-subprocess-local

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Mounte `dsh-subprocess-local` in jeder Komposition, die Child-Prozesse auf dem Host ausführt. Es löst lokale Executables auf, gibt gewöhnlichen Linux- und Windows-Kommandos sowie unterstützten Linux-Terminal-Sessions eine OS-eigene Managed Range und stellt echte Terminal-Sessions über `node-pty` bereit; nicht unterstützte Hosts nutzen einen explizit schwächeren Fallback. Es hat keine Konfiguration, sodass jede Disposition, jedes Limit, jede Terminal-Größe und jede Grace-Zeit auf dem Spawn-Request vom aufrufenden Capability-Seam ankommt. Die Output-Collection hält einen begrenzten In-Memory-Tail mit optionalen Spill-Files zur Full-Stream-Wiederherstellung, Children starten aus einer bereinigten Umgebung, und Disposal terminiert und joint jede ausgewählte Range oder Session.

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

Mounte den Provider neben seinen Consumern und starte Prozesse genau so, wie es der Subprocess-Service spezifiziert; dieses Paket entscheidet nur, wie diese Prozesse auf dem Host laufen. Unter Windows starten Nicht-Terminal-Children und `taskkill`-Helper mit versteckten Fenstern, damit Hintergrundoperationen nicht den Fokus nehmen. Das verbirgt auch GUI-Fenster, die die Prozess-Startup-Visibility-Einstellung beachten.

### Den Provider mounten

Lade den Provider in derselben Komposition wie seine Consumer. Er hat keine Config-Felder: Jede Wahl kommt auf dem Spawn-Request an, sodass deployment-abhängige Entscheidungen bei der Konfiguration des Callers bleiben.

```yaml
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-bash-local'
```

### Executables auflösen

Absolute Executable-Pfade werden verifiziert; nackte Namen lösen gegen den bereinigten PATH mit plattformbewussten Executable-Extensions auf (`.COM`/`.EXE`/`.BAT`/`.CMD` unter Windows). Relative Pfade mit Separatoren werden abgelehnt — gib einen absoluten Pfad oder einen nackten PATH-Namen an —, und relative PATH-Einträge lösen aus dem Host-Prozess-cwd auf.

### Output sammeln

Der Collect-Mode hält die letzten `maxBytes` eines Streams im Speicher — Fehler und Endergebnisse ballen sich am Ende — und hängt, wenn ein `spill`-Cap konfiguriert ist, den kompletten Stream an eine private Datei unter einem Pro-Prozess-Verzeichnis im OS-Tempdir (ein `0700`-Verzeichnis, `0600`-Dateien mit Zufallsnamen). Ein Stream größer als das Spill-Cap verwirft sein unvollständiges Spill und gibt nur den als truncated markierten Tail zurück. Reads sind offset-basiert und nicht konsumierend, sodass Hintergrund- und Batch-Reader vor und nach dem Exit koexistieren.

### Terminal-Sessions ausführen

`spawnTerminal` alloziert ein echtes PTY und bridged UTF-8-Text; du kannst die aktuelle Foreground-Prozessgruppe inspizieren und signalisieren und eine `terminate()`-Operation erwarten. Auf unterstützten Linux-Hosts läuft das originale Terminal-argv direkt innerhalb eines User-systemd-Scopes, wobei die node-pty-PID, der Session-Leader, das Controlling-Terminal, das Foreground-`inputWaiting` und die Readiness erhalten bleiben, während der Scope umgeparentete oder `setsid`-Nachkommen besitzt. Auf Fallback-Hosts behält das Cleanup exakte Identitäten aus dem verwurzelten Baum und der beobachtbaren Session, kann aber nicht jeden entkommenen Nachkommen zurückholen. Ein exakter Linux-Input-Wait erfordert einen Foreground-Thread, dessen fd 0 das Controlling-Terminal der Shell identifiziert und dessen aktueller Syscall auf dieses fd wartet; verweigert der Kernel die Syscall-Probe, nutzt das höhere PTY-Backend stattdessen seine Idle-Inferenz. Unter Windows wird SIGINT als Ctrl-C-Input-Write zugestellt, SIGTSTP und SIGHUP werden nicht unterstützt, und das Teardown verifiziert die Terminierung der Shell über die Prozesstabelle, weil eine extern gekillte Shell die PTY-Exit-Notification möglicherweise nie auslöst.

### Shutdown-Verhalten

Normales Disposal terminiert jede laufende Managed Range und Terminal-Session und erwartet Quiescence. Während eines JavaScript-beobachtbaren Host-Exits — direktes `process.exit()`, Default-Uncaught-Exceptions, Default-Unhandled-Rejections — bittet die synchrone Finalisierung einen Linux-Scope, seine Mitglieder zu killen, killt jeden Windows-Runner, damit dessen einziges Job-Handle schließt, und nutzt für Fallbacks die vorhandene PGID-, `taskkill`- oder Captured-Identity-Operation. Sie erstellt keine Promises oder Timer und beansprucht keine Quiescence. Derselbe Exit entfernt das private Pro-Prozess-Spill-Verzeichnis, wenn es kein fertiges Spill-File enthält; fertige Spill-Files bleiben als Full-Output-Wiederherstellungsartefakte bis zu einem externen Cleanup. Unbehandeltes `SIGTERM`/`SIGINT`/`SIGHUP`, `SIGKILL`, fataler OOM, native Crashes und Stromausfall brauchen einen externen Supervisor.

### Was schiefgehen kann

Ein nicht auflösbares Executable schlägt laut mit einem stabilen Fehler fehl. `done` rejected, wenn Spawn- oder Provider-Fehler ein direktes Ergebnis verhindern, und dieses Rejection beweist nicht, ob die Target-Ausführung begann. `waitForExit()` rejected, wenn der ausgewählte Owner seine Range nicht mehr als leer beweisen kann, und Cleanup versucht trotzdem die Terminierung. Ein Read jenseits des behaltenen Tails ist `lossy` und zeigt auf das Spill-File, wenn eines existiert. Eine Fallback-Prozessgruppe oder beobachtete Terminal-Session kann einen Nachkommen verlieren, der vor der Beobachtung entkommt — siehe die Limitations unten.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Provider und zeigt auf den Code, der sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designkonzept

Jeder Spawn wählt einen Owner für Signalisierung und Quiescence. Unterstützte Linux-Ordinary- und -Terminal-Starts nutzen transiente User-systemd-Scopes, während unterstützte Windows-Ordinary-Starts einen helper-owned Kill-on-Close-Job nutzen. macOS, älteres oder nicht verfügbares User-systemd und nicht verfügbarer nativer Windows-Support nutzen die vorhandenen Detached-Prozessgruppen-, `taskkill`- oder Terminal-Session-Beobachtungen mit einer Warnung. Der Provider replayt ein Kommando niemals über einen Fallback, nachdem ein nativer Pfad es gestartet haben könnte.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Service-Wiring: Live-Handle-Mengen, Disposal, Host-Exit-Finalisierung, Executable-Lookup |
| [`src/spawn.ts`](src/spawn.ts) | Geteilte Prozess-Plumbing: direkte Ergebnisse, Tail-Keep-Collection, Spill-Files und Fallback-Spawning |
| [`src/managed-owner.ts`](src/managed-owner.ts) | Privater Signal-and-Wait-Owner, den jedes Ordinary-Handle nutzt |
| [`src/linux-scope.ts`](src/linux-scope.ts) | Linux-User-systemd-Capability-Checks, Scope-Start, Signalisierung und Quiescence |
| [`src/linux-execve.ts`](src/linux-execve.ts) | Linux-libc-Image-Ersetzung und Erhaltung geerbter Standard-Deskriptoren |
| [`src/windows-job.ts`](src/windows-job.ts) | Windows-Job-Capability-Checks und Helper-Start |
| [`src/runner-launch.ts`](src/runner-launch.ts) | Source-, Built- und Packaged-Private-Runner-Auswahl |
| [`src/spawn-runner.ts`](src/spawn-runner.ts) | Linux-One-Shot-Exec-Bootstrap und Windows-Job-Runner |
| [`src/runner-protocol.ts`](src/runner-protocol.ts) | Strikte Linux-Launch-/Startup-Dateien und Windows-IPC-Messages |
| [`src/terminal.ts`](src/terminal.ts) | `node-pty`-Handle: Linux-Scope-Anbindung, Foreground-Inspektion und Fallback-Cleanup |
| [`src/process-inspector.ts`](src/process-inspector.ts) | POSIX-Prozessbaum- und Session-Inspektion |
| [`src/windows-inspector.ts`](src/windows-inspector.ts) | Windows-Toolhelp32-Prozesstabellen-Inspektion via koffi |
| — | Es wird kein Runtime-Invarianten-Companion veröffentlicht; dieses Paket exponiert keine unabhängige Event-Sequenz oder mutable Datenrelation jenseits der Contracts, die sein besitzender Seam erzwingt. |

### Hauptfluss

Ein Spawn validiert synchron das finale argv, cwd und Environment, wählt Containment, bevor das Nutzer-Kommando laufen kann, und gibt ein Handle zurück, während die Target-Identität privat bleibt. Linux-Ordinary- und -Terminal-Starts nutzen einen privaten One-Shot-Request, dessen Scoped-Bootstrap das Target-cwd und -Environment wiederherstellt, das Executable auflöst, Close-on-Exec auf fd 0 bis fd 2 löscht und mit dem originalen argv in libc `execve()` eintritt. Windows-Ordinary-Starts isolieren Runner-fd 0 bis fd 2, reservieren fd 3 für IPC und tragen Target-Stdio auf fd 4 bis fd 6; der Runner löst diese CRT-Deskriptoren zu OS-Handles auf, erstellt das Target suspended, weist es dem Job zu, setzt es fort und schließt nur die Carrier-Deskriptoren. `done` settled das direkte Kommando nach seiner Stdio-Barrier, während `waitForExit()` separat darauf wartet, dass der ausgewählte Scope, Job, die Prozessgruppe oder die beobachtete Session leer wird.

### Sicherheitsinvarianten

Spill-Files werden `0600` mit `O_EXCL` und Zufallsnamen unter einem `0700`-Pro-Prozess-Verzeichnis geöffnet, was Symlink-Planting in geteilten Tempdirs vereitelt; ein fehlgeschlagener finaler Close gibt den Spill-Pfad nicht heraus. Fallback-Prozessidentitäten tragen Startzeiten, sodass Cleanup niemals einer PID-Wiederverwendung folgt. Ein ausgewählter nativer Fehler wird gemeldet, statt argv über den Fallback zu replayen, und eine Range wird erst nach abgeschlossenem Cleanup aus der Live-Menge entfernt oder der Fehler bleibt beobachtbar. Die Host-Exit-Finalisierung erstellt keine Promises oder Timer, bewahrt den Host-Exit-Code und die Diagnostik, dämmt den Fehler jedes Targets ein und beansprucht keine Quiescence.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Provider-Vertrag nicht ausreicht. Sie bewegen sich von der erschöpfenden Typ-Referenz zum abstrakten Vertrag und den Entscheidungen hinter den Host-Mechaniken.

- [Subprocess-Subsystem](../../../docs/subsystems/subprocess.de.md) — Spawn-Specs, Output-Reader, Ergebnisse und das `DSH_*`-Environment vollständig.
- [dsh-subprocess](../subprocess/README.de.md) — der abstrakte Vertrag, den dieser Provider implementiert.
- [dsh-bash-local](../../shell/bash-local/README.de.md) — der größte Consumer und die konkreten Stdio-Formen, die er anfordert.
- [Subprocess-Seam-Agent-Note](../../../.agents/notes/archived/architecture/2026-07-26-subprocess-seam.md) — warum die Prozesshälfte ein eigener Seam wurde.
- [Synchrones Subprocess-Exit-Cleanup](../../../.agents/notes/archived/bug-fix/2026-08-11-synchronous-subprocess-exit-cleanup.md) — die Host-Exit-Finalisierungsentscheidung und ihre Fehlermodi.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über Consumer-Seams wie die Bash-Executor-Familie, die alles model-facing Rendering von Spawn-Prozess-Output und -Lifecycle besitzen.

#### KV-Cache-Effekt

Keine direkte Invalidierung; die benannten Consumer besitzen etwaige Request-Präfix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Provider schlecht passt oder besondere Betriebsaufmerksamkeit braucht. Es sind aktuelle Paket-Constraints, kein allgemeiner Plattformvergleich und kein Aufgabenrückstand.

- **Natives Ownership hat explizite Host-Anforderungen** — Linux braucht einen lesbaren User-Manager und `systemd-run --expand-environment=no`; ältere systemd-Versionen nutzen den gewarnten PGID-Fallback. macOS nutzt immer diesen Fallback, weil kein unterstützter öffentlicher persistenter Owner existiert.
- **Native Auswahl hat begrenzte Pro-Spawn-Kosten** — Linux wiederholt den Bootstrap-Eintritt, libc-`execve`/`fcntl`-Bindings, den Live-User-Manager und die Literal-argv-Scope-Probe, bis sie zuerst erfolgreich ist; spätere zulässige Ordinary- oder Terminal-Spawns prüfen nur den Live-User-Manager erneut. Windows prüft den Runner-Eintritt, Bindings und aktuellen Job-Support vor jedem Ordinary-Spawn erneut. Erfolgreicher Linux-Deep-Probe-Zustand und Fallback-Warnungs-Deduplizierung bleiben für die Provider-Lebensdauer erhalten. Alle Probes enden, bevor das Nutzer-Kommando laufen kann, und Child-Prozess-Probes haben ein 5-Sekunden-Timeout. Jeder Linux-Start erstellt ein privates Request-Verzeichnis, prüft unaufgelöste Scope-Etablierung alle 50 Millisekunden und backed dann einen etablierten aktiven Scope exponentiell auf höchstens 5 Sekunden zwischen Queries ab; ein Windows-Ordinary-Start hält einen Runner und einen IPC-Kanal, bis der Job null aktive Prozesse meldet. Target-Standard-Handles werden direkt geerbt, ohne Named-Pipe-Stdio oder Ergebnisdateien.
- **Windows-Job-Vererbung hat definierte Ausschlüsse** — Ordinary-Nachkommen erben den Job per Default, aber Breakaway-Prozesse liegen außerhalb der Garantie. Das Target startet erst nach der Job-Zuweisung; externe Terminierung des Runners im schmalen Create-to-Assignment-Intervall kann ein suspended Target zurücklassen.
- **Windows-Terminal-Signalisierung ist konsolenweit** — SIGINT wird als `\x03`-Ctrl-C-Input-Write zugestellt, den conhost in ein konsolenweites CTRL_C-Event umwandelt; SIGTSTP und SIGHUP werden als nicht verfügbar abgelehnt; ein `taskkill` ohne `/F` terminiert Konsolenprozesse nicht, sodass die Teardown-TERM-Stufe ein Grace-Wait vor der `/F`-Eskalation ist. Windows-Readiness hat keine exakte Stdin-Wait-Stufe: Der Prompt-Marker-Fast-Path vergleicht die Shell-PID als Pseudo-Foreground-Gruppe, und Silence-/Timing-Stufen decken den Rest ab.
- **Fallback-Terminal-Ownership bleibt beobachtend** — auf macOS oder Linux ohne nutzbares User-systemd kann ein Child, der sich vor irgendeinem Foreground-Inspektions-Snapshot umparentet oder die eigene Terminal-Session verlässt, dem Prozesstabellen-Scan entkommen. Der lokale Provider fügt keinen kontinuierlichen Prozesstabellen-Monitor hinzu; der unterstützte native Linux-Mode behält diese Nachkommen stattdessen über Scope-Mitgliedschaft.
- **In-Process-Cleanup erfordert einen JavaScript-beobachtbaren Exit** — direktes `process.exit()`, Default-Uncaught-Exceptions und Default-Unhandled-Rejections emittieren Nodes synchrones `exit`-Event. Die Default-OS-Disposition für ein unbehandeltes `SIGTERM`, `SIGINT` oder `SIGHUP` umgeht dieses Event; eine Anwendung deckt diese Signale nur ab, indem sie einen Handler installiert, der normales Disposal ausführt oder `process.exit()` aufruft. `SIGKILL`, fataler OOM, `process.abort()`, native Crashes, Stromausfall und jeder Fehler, der kein JavaScript ausführen kann, erfordern einen externen Supervisor, Container-Init oder einen äquivalenten OS-Owner.
- **Der Credential-Scrub ist eine Namensheuristik** — nur `*KEY*`/`*PASSWORD*`/`*SECRET*`/`*TOKEN*`; anders benannte Secrets (etwa `*PASSPHRASE*`) gehen durch, und eine Whitelist für über-bereinigte Variablen ist als künftige Arbeit notiert.
- **Fertige Spill-Files werden nicht gelöscht** — begrenzte Full-Output-Wiederherstellungsdateien sammeln sich unter dem OS-Tmpdir an, bis etwas Externes sie aufräumt; das private Pro-Prozess-Spill-Verzeichnis wird bei einem JavaScript-beobachtbaren Exit nur entfernt, wenn es kein fertiges Spill-File enthält.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
