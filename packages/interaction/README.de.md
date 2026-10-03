---
description: "Package map for the human-collaboration capability family: slash commands, one-shot approvals, permission presets, and the question/answer seam that lets a running agent pause for a human decision."
kind: "package-group"
---

# interaction/ — die Mensch-Kollaborationsebene
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die Gruppe `interaction/` deckt die Wege ab, auf denen ein Mensch einen laufenden agent steuern kann. Slash-Befehle für sofortige Aktionen ohne Modell-Roundtrip, Einmal-Freigaben für sensible Operationen, Berechtigungs-Presets, um Sandbox- und Freigabeverhalten gemeinsam zu wählen, und Fragen, wenn der agent Informationen oder eine Entscheidung braucht. Interaktive Anwendungen stellen diese Capabilities Menschen bereit; Automatisierung behandelt ihre eigenen Freigaben über ACP. Die Paketübersicht unten unterscheidet jede Capability und verlinkt auf ihr vollständiges Verhalten und ihre Konfiguration.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Jede Paket-README und ihre Subsystem-Referenz besitzen die erschöpfenden Verträge.

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`commands/`](commands/README.de.md) | Lässt Benutzer Slash-Befehle eingeben, die direkt gegen einen agent laufen, ohne Modell-Roundtrip | `ctx.commands` |
| [`user-approval/`](user-approval/README.de.md) | Fragt komponierte Answerer nach einmaligen Erlauben/Ablehnen-Entscheidungen und schließt ohne einen Answerer abweisend | `ctx.approval` |
| [`permission-presets/`](permission-presets/README.de.md) | Bündelt Sandbox-Modus mit einer Freigabe-Policy zu einem benutzerseitigen Berechtigungs-Selektor | `ctx.permissionPresets` |
| [`user-questions/`](user-questions/README.de.md) | Definiert das validierte Frage-schema und den gescopten Answerer-waterfall, auf den ein agent pausiert | `ctx.userQuestions` |
| [`tool-ask-user/`](tool-ask-user/README.de.md) | Stellt das `ask_user_question`-tool bereit, damit das Modell den Menschen um eine Entscheidung fragen kann | registriert auf `ctx.tools` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Beginne mit den Subsystem-Referenzen für die gemeinsamen Vokabulare, dann die benachbarten Automatisierungs- und Kompositionsflächen.

- [Commands-Subsystem](../../docs/subsystems/commands.de.md) — Semantik der Befehls-Registry und die `ctx.commands`-Cordis-Fläche.
- [Freigabe-Subsystem](../../docs/subsystems/approval.de.md) — Anfrage-/Ergebnis-Vokabular, der Answerer-waterfall und sitzungsbezogene Policy.
- [Berechtigungs-Presets-Subsystem](../../docs/subsystems/permission-presets.de.md) — die Preset-Tabelle und der Regler-Durchgriff.
- [Benutzerinteraktions-Subsystem](../../docs/subsystems/user-questions.de.md) — Frage-Vokabular, Answerer-waterfall und Präsentationsintention.
- [ACP-Gruppe](../acp/README.de.md) — der nur für Automatisierung gedachte Transport, der Freigabeanfragen für seine eigenen agents beantwortet.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
