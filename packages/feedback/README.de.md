---
description: "Die feedback-Paketgruppe: Nutzerfeedback zu Sessions und Assistant-Messages, für Nutzer und Maintainer, die Feedback-Erfassung wählen, komponieren oder debuggen."
kind: "package-group"
---

# feedback/ — aufgezeichnetes menschliches Feedback
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die feedback-Gruppe sammelt menschliche Meinungen über die Arbeit des Harness: Nutzer können eine Freitext-Anmerkung zu einer ganzen Session abgeben und einzelne Assistant-Messages bewerten oder annotieren. Keine der beiden Feedback-Arten erreicht das Modell — es sind Signale über den Output, nie Input für ihn. Nutzer zeichnen eine Session-Anmerkung mit dem `/feedback`-Command auf; Produkt-Oberflächen lesen und ändern Per-Message-Bewertungen über den `messageFeedback`-Service. Die zwei Pakete sind unabhängig: Session-Anmerkungen und Per-Message-Bewertungen interagieren nicht. Diese Seite kartiert die Gruppe; die Paket-READMEs und die [Feedback-Subsystem-Seite](../../docs/subsystems/feedback.de.md) besitzen die Per-Package-Contracts.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

<a id="packages"></a>
## Pakete

| Paket | Rolle |
|---|---|
| [`command-feedback`](command-feedback/README.de.md) | Session-Level-Feedback: das `/feedback`-Command, das `sessionFeedback`-Remote hinter dem Web-Dialog und die fixe Kategorien-Taxonomie, alles ohne Model-Turn |
| [`message-feedback`](message-feedback/README.de.md) | Per-Message-Bewertungen, Kategorien und Notizen, über den `messageFeedback`-Service an Produkt-Oberflächen serviert |

Session-Anmerkungen sind ein Einweg-Signal: Eine aufzuzeichnen ist an jedem Punkt einer Konversation sicher und ändert nie, was das Modell sieht. Unter einer feedback-gated Sharing-Policy ist das Aufzeichnen einer Session-Anmerkung das, was die Session zum Teilen freigibt.

Per-Message-Bewertungen und Notizen werden mit der Session gespeichert, überleben Restarts und erscheinen nie in Model-History oder Telemetrie.

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Feedback-Subsystem](../../docs/subsystems/feedback.de.md) — die message-feedback-Typen, der Service-Contract und der Web-Consumer.
- [Session-Telemetry-Subsystem](../../docs/subsystems/session-telemetry.de.md) — die Sharing-Policy, die die `/feedback`-Bestätigung offenlegt.
- [Anonyme Nutzeridentität](../identity/README.de.md) — die pro-Harness-Home-id, die in der Feedback-Bestätigung eingebettet ist.

<a id="dev-note"></a>
## Dev Note

Keiner.
