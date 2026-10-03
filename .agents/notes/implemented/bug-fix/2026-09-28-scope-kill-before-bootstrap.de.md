# Agent Note: Scope-Kill im Wettlauf mit dem One-Shot-Bootstrap
[English](2026-09-28-scope-kill-before-bootstrap.md) | [中文](2026-09-28-scope-kill-before-bootstrap.zh.md) | Deutsch

Status: implemented


## Problem

Eine Terminierung, die mit dem Bootstrap-Fenster des Linux-Scope kollidiert, erzeugte in `dsh-subprocess-local` zwei Fehler. Erstens rejectete ein Launcher-Exit bei noch bereitliegendem `launch-request.json` das direkte Ergebnis stets mit `subprocess scope exited before its bootstrap consumed the launch request` — selbst wenn der Exit der vom Owner selbst angeforderte Kill war, sodass Timeouts und Abbrüche einen Phantom-Startfehler statt `SIGTERM` meldeten. Zweitens konnte die Scope-Unit sich beim Manager registrieren, *nachdem* der Launcher gestorben war; `--collect` hängt an der Lebensdauer von `systemd-run`, nichts deaktivierte sie also, die Range-Beobachtung polte ewig einen leeren `active`-Scope, und verlassene Scopes sammelten sich auf dem Host an.

## Entscheidung

`SystemdScopeOwner` verzeichnet, ob die Terminierung über `signal()` oder `terminateForHostExit()` angefordert wurde. `directOutcome` und das terminale `resolveOutcome` rejecten einen Exit mit unkonsumiertem Request nur dann weiterhin als Startfehler, wenn kein Kill angefordert wurde; ein angeforderter Kill meldet das reale Ergebnis. Die Statusabfrage stoppt eine Unit, die sich registriert, während die Etablierung noch aussteht und der Launcher bereits tot ist, und `cleanup()` stoppt eine nie etablierte Unit best-effort, sobald der Launcher weg ist — sodass eine Registrierung nach dem Tod keinen leeren `active`-Scope leaken kann.

## Erwogene Alternativen

**Den Kill bei signalisiertem Exit bedingungslos melden.** Ein externes `SIGKILL` auf den Launcher sähe dann identisch zu einer angeforderten Terminierung aus und würde die Startfehler-Diagnose für Exits still abschaffen, die niemand angeordnet hat; das Gating auf die eigene Anforderung des Owners bewahrt diesen konservativen Pfad.

**`--collect` späte Registrierungen abräumen lassen.** `systemd-run` ist der Kollektor und in diesem Fenster bereits tot — der Mechanismus kann nicht feuern, genau deshalb leakten die Scopes.

## Konsequenzen

Timeout-, Abort- und Hintergrund-Kill-Pfade rechnen mit ihrem wahren Signal-Ergebnis ab; Kills innerhalb des Bootstrap-Fensters (≈hunderte ms für einen Source-Mode-Runner) leaken keine leeren Scopes mehr. Extern gekillte Launcher mit unkonsumierten Requests rejecten weiterhin wie zuvor und bewahren das Startfehler-Signal.
