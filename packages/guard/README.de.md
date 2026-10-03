---
description: "Paketkarte der Loop-Hygiene-guard-Familie: der beratende Repeat-tool-Reminder und die Tool-Call-Timeout-Policy pro Aufruf, für Nutzer und Maintainer, die die guards wählen oder komponieren."
kind: "package-group"
---

# guard/ — Loop-Hygiene-guard-Familie

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die Gruppe `guard/` hält den agent loop produktiv, indem sie zwei häufige Fehlermuster beobachtet. `repeat-tool-reminder` bemerkt, wenn das Modell exakt denselben tool-Aufruf wiederholt, und erinnert es daran, den Ansatz zu wechseln oder abzuschließen, damit eine hängende Schleife nicht weiter Zeit und Tokens verbrennt. `timeout-policy` setzt ein Zeitlimit für tool-Aufrufe, die eines deklarieren, damit ein hängender Aufruf dem Modell einen klaren Timeout-Fehler zurückgibt, statt die Session zu blockieren. Beide werden im `dsh`-Base-Bundle aktiviert ausgeliefert; eine Komposition kann sie tunen oder entfernen.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Zwei kleine Plugins decken die zwei Muster ab; jedes README unten erklärt, wann man es behalten, tunen oder entfernen sollte.

| Paket | Was es bereitstellt |
|---|---|
| [`repeat-tool-reminder/`](repeat-tool-reminder/README.de.md) | Erinnert das Modell, wenn es denselben tool-Aufruf wiederholt, damit es den Ansatz wechselt oder abschließt |
| [`timeout-policy/`](timeout-policy/README.de.md) | Lässt tool-Aufrufe mit deklariertem Limit in einen Timeout laufen, damit das Modell einen klaren Fehler erhält statt ewig zu warten |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Beginne mit der Tools-Subsystem-Referenz für die tool-Call-Pipeline, dann mit der Konfiguration des Reminders und der Timeout-Library-Entscheidung hinter der Policy.

- [Tools-Subsystem-Referenz](../../docs/subsystems/tools.de.md) — die tool-Call-Pipeline und die Entscheidungen, auf denen beide guards aufbauen.
- [Generierter Konfigurationskatalog](../../docs/config-catalog.de.md#deepseek-aidsh-repeat-tool-reminder) — jedes akzeptierte Feld des Repeat-Call-Reminders.
- [Agent Note zur Timeout-Deadline-Library](../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.de.md) — die Timing-/Termination-Aufteilung, die `timeout-policy` durchsetzt.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
