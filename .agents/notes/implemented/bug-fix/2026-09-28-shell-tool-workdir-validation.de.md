# Agent Note: Workdir-Validierung des Shell-Tools

Status: implemented

[English](2026-09-28-shell-tool-workdir-validation.md) | [中文](2026-09-28-shell-tool-workdir-validation.zh.md) | Deutsch

## Problem

`dsh-tool-bash` und `dsh-tool-pwsh` reichten ein modellgeliefertes `workdir` ungeprüft an `spawn` weiter. Ein führendes `~` wurde nie expandiert — es läuft vorher keine Shell —, sodass `~/git/…` zu einem nicht existierenden Pfad unter dem Session-cwd aufgelöst wurde. Node meldete das fehlerhafte cwd dann als `spawn <argv0> ENOENT` und nannte die Executable — unter Confinement `bwrap` — statt des Verzeichnisses. Sessions verbrannten Turns damit, eine Diagnose zu wiederholen, die der Fehler nie stützte.

## Entscheidung

Beide Tools expandieren ein führendes `~` gegen das Home-Verzeichnis des Benutzers, lösen ein relatives `workdir` wie bisher gegen das Session-cwd auf und rejecten ein explizites workdir, das kein existierendes, durchsuchbares Verzeichnis ist, mit `invalid workdir: "<path>" is not an accessible directory`, bevor irgendetwas spawnt. Die Schema-Beschreibung nennt die `~`-Expansion, damit sich das Modell darauf verlassen kann.

## Erwogene Alternativen

**Nur `~` expandieren.** Die verbleibende Klasse relativer Tippfehler-Pfade erzeugte weiterhin das irreführende `ENOENT`; Expansion allein behält damit die schlechtere Hälfte des Fehlers.

**Die Validierung dem Executor überlassen.** `LocalBashExecutor` prüft das Spawn-cwd zwar für seine eigene Fehlerklassifikation, doch das läuft nach der Policy-Auflösung und bei bereits confiniertem argv; der Fehler gibt weiterhin der Executable die Schuld. Zur Auflösungszeit zu rejecten nennt das Verzeichnis direkt.

## Konsequenzen

Ungültige Verzeichnisse scheitern schnell mit dem Pfad in der Meldung; `~` und `~/…` funktionieren, wie die Shell-Gewohnheit es nahelegt. Ein unveränderter Fall bleibt: Ohne explizites `workdir` umgeht das session-abgeleitete cwd diese Prüfung weiterhin, weil es aus dem Session-Zustand stammt, nicht aus Modelleingabe.
