---
description: "Die schedule-Gruppenkarte: session-lokale persistente Reminder über dem Session-Log, für Nutzer und Maintainer, die die Gruppe durchsehen."
kind: "package-group"
---

# schedule/ — Session-lokale Reminder
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die schedule-Gruppe lässt einen agent Reminder für die aktuelle Konversation erstellen, auflisten und canceln. Reminder können nach einer Verzögerung, zu einem absoluten Zeitpunkt oder in einem festen Intervall laufen; bei Fälligkeit kommen sie als gewöhnliche Messages in dieser Konversation an. Sie überleben Neustarts, verlassen aber nie die Session und senden keine E-Mail-, SMS- oder Push-Benachrichtigungen. Das Paket der Gruppe stellt Reminder-Verwaltung und -Zustellung bereit. Optionale Browser-Pakete zeigen den aktuellen Reminder-Katalog und markieren Konversationen mit bekannten aktiven Remindern; diese Indikatoren spiegeln gecachten Zustand und können der laufenden Session hinterherhinken.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`schedule/`](schedule/README.de.md) | Session-lokale Reminder: aktive Records planen, auflisten und canceln; eine optionale Read-only-Projection für den Header-Katalog und die Listenzeilen-Markierung publizieren; fällige Reminder als Konversations-Messages zustellen | — (nur Tools, im exakten agent-Scope) |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Session-lokales Schedule-Subsystem](../../docs/subsystems/schedule.de.md) — Contracts für persistente Records, Transitions, Views und Zustellung.
- [Generierter Tool-Katalog](../../docs/tool-catalog.de.md#deepseek-aidsh-schedule) — die `schedule_create`/`schedule_list`/`schedule_delete`-Schemas, die das Modell erhält.
- [Schedule-Nutzer-Guide](../../docs/user/guide/schedule.de.md) — der offizielle Konfigurationsweg zum Mounten des Pakets.
- [Web-Schedule-Katalog](../client/ui-schedule/README.de.md) — die optionale Read-only-Browser-Präsentation aktiver Records.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
