---
description: "Die bash-Capability-Familie für Deployments und Maintainer, die einen Shell-Executor, Sandboxing und die modellseitigen bash- und pwsh-Tools wählen und komponieren."
kind: "package-group"
---

# shell/ — bash-Capability-Familie

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die shell-Gruppe stellt agents Befehlsausführung bereit: einen Foreground-Befehl ausführen und seine begrenzte Ausgabe lesen oder einen Hintergrundprozess starten und pollen — auf POSIX mit Bash und auf Windows mit PowerShell. Pro Komposition wird genau eine Executor-Implementierung gemountet; die Sandboxing-Executoren begrenzen jeden Befehl über die Sandbox-Capability, und die modellseitigen `bash`- und `pwsh`-Tools sitzen über dem jeweils gemounteten Executor. Wähle einen Bash-Executor für POSIX, einen PowerShell-Executor für Windows und die Sandboxing-Variante, wenn Befehle Isolation auf Dateiebene brauchen.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`shell`](shell/README.de.md) | Definiert den Executor-Contract: Foreground-Runs, Background-Handles und Request-Auflösung | `ctx.shell` |
| [`bash-local`](bash-local/README.de.md) | Führt Bash-Befehle als frische `bash -c`-Prozesse auf POSIX aus | registriert `ctx.shell` |
| [`bash-sandbox`](bash-sandbox/README.de.md) | Führt Bash-Befehle begrenzt über die Sandbox-Capability aus und meldet Ablehnungen als Fakten | registriert `ctx.shell` |
| [`pwsh-local`](pwsh-local/README.de.md) | Führt PowerShell-Befehle als frische `pwsh -Command`-Prozesse auf Windows aus | registriert `ctx.shell` |
| [`pwsh-sandbox`](pwsh-sandbox/README.de.md) | Führt PowerShell-Befehle begrenzt über die Sandbox-Capability aus | registriert `ctx.shell` |
| [`shell-env`](shell-env/README.de.md) | Liefert die verwaltete `DSH_*`-Umgebung, die jeder Shell-Befehl erhält | `ctx.shellEnv` |
| [`tool-bash`](tool-bash/README.de.md) | Exponiert Bash-Ausführung und Hintergrund-Jobs dem Modell als `bash`-Tool | registriert auf `ctx.tools` |
| [`tool-bash-persistent`](tool-bash-persistent/README.de.md) | Führt Modell-Shell-Aufrufe in einer owner-isolierten persistenten Bash-Session aus | registriert auf `ctx.tools` |
| [`tool-pwsh`](tool-pwsh/README.de.md) | Exponiert PowerShell-Ausführung dem Modell als `pwsh`-Tool | registriert auf `ctx.tools` |
| [`tool-pwsh-persistent`](tool-pwsh-persistent/README.de.md) | Führt Modell-Shell-Aufrufe in einer owner-isolierten persistenten PowerShell-Session aus | registriert auf `ctx.tools` |

Ein Profile-Layer wählt genau eine Executor-Implementierung (der win32-Layer tauscht die POSIX-Zeilen gegen die pwsh-Zeilen; zwei zu mounten schlägt laut an der doppelten Service-Registrierung fehl) sowie die benötigten modellseitigen Tools. Eine gesandboxte Komposition wählt zusätzlich einen `ctx.sandbox`-Provider und `ctx.sandboxPolicy`; das [Base-Bundle](../bundle/base/cordis.patch.yml) besitzt die ausgelieferte Verdrahtung.

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Bash-Executor-Subsystem](../../docs/subsystems/shell.de.md) — das gemeinsame Request/spec-Vokabular, Ergebnisse, Hintergrundprozesse und der Service-Contract.
- [Sandbox-Subsystem](../../docs/subsystems/sandbox.de.md) — die Isolation-Capability, die die Sandboxing-Executoren konsumieren.

<a id="dev-note"></a>
## Dev Note

Keine.
