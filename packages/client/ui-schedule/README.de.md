---
description: "Der schreibgeschützte Web-Katalog aktiver Schedule-Erinnerungen, für Benutzer, die die Oberfläche wählen, und Maintainer ihres Projektions-, Timing- und Accessibility-Verhaltens."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-schedule
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Dieses Paket rendert einen schreibgeschützten Katalog der aktiven Schedule-Erinnerungen der aktuellen Session im Web-Header. Es liest die vollständige `schedule`-Projektion und stößt keinen RPC oder Mutation an. Der Browser leitet Status, lokale Zeit, relative Zeit und Reihenfolge ab, ohne diese Präsentationswerte in den dauerhaften Zustand zu übernehmen. Das ausgelieferte Web-Bundle hält das Plugin deaktiviert, bis das explizite Schedule-Overlay sowohl die Host-Schedule-Services als auch diese Client-Zeile aktiviert.

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

Aktiviere das Schedule-Overlay vor dem Start der Web-Session, die Erinnerungen exponieren soll:

```sh
dsh web --patch apps/cli/config/examples/schedule/cordis.yml
```

Der ausgelieferte Web-Graph löst `@deepseek-ai/dsh-client-ui-schedule` bereits über eine deaktivierte `ui-schedule`-Zeile auf; das Overlay aktiviert diese Zeile zusammen mit `@deepseek-ai/dsh-schedule`. Der Trigger erscheint nur, solange die Session erfolgreich geöffnet ist und die Projektion mindestens einen aktiven Eintrag enthält. Beim Öffnen werden überfällige Zeilen zuerst gezeigt, dann zukünftige Zeilen nach Zielzeit; exakte Gleichstände behalten die Erstellungsreihenfolge der Projektion bei.

### Den Katalog lesen und schließen

Jede Zeile zeigt den vollständigen umbrechenden Prompt, einen separaten Scheduled- oder Overdue-Status, lokalisiertes Once oder die größte exakte ganze Einheit für ein wiederholendes Intervall, browserlokale Zielzeit und browseruhr-relative Zeit. Intervalle werden nie gerundet, und die drei Metadatenfelder umbrechen über Zeilen, statt gültige große Werte abzuschneiden. Das an `body` portalierte Popover zielt auf 336 px, teilt die linke Kante des Triggers, wenn Platz reicht, und weicht nach links aus, um einen 16-px-Viewport-Rand zu behalten, wenn der Trigger nahe dem rechten Rand liegt; seine maximale Breite ist die Viewport-Breite minus 32 px. Es scrollt bei Bedarf vertikal und exponiert keine Schedule-id, keinen rohen UTC-Wert, keine Details und keine Aktionskontrollelemente.

Nur der native Trigger-Button kommt in die Tab-Reihenfolge. Enter und Space verwenden die normale Button-Aktivierung; solange der Fokus auf dem Trigger oder Katalog bleibt, schließt Escape das Popover und stellt den Trigger-Fokus wieder her; ein Pointer-Press außerhalb schließt es. Wenn ein Live-Update den letzten Eintrag entfernt, schließt und unmountet die Komponente, ohne den Fokus auf eine andere Header-Aktion zu verschieben. Ein fehlgeschlagener Session-Open verbirgt den Trigger selbst dann, wenn ein vorläufiger gecachter Projektionswert existiert.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Das Browser-Plugin trägt `schedule-catalog` mit Reihenfolge 10 zu `conversation.session.header.actions` bei, nach dem statischen Agent- und Subagent-Kontext und vor den Hintergrund-Jobs. Es liest `openState` über den Standard-Session-Hook und den vollständigen Wert über `useProjection('schedule')`; Popover-Sichtbarkeit ist sein einziger lokaler Interaktionszustand. Die Komponente portaliert den Katalog auf `document.body` und gibt ihre Trigger- und Panel-Refs an `useAnchoredPosition`, das fixed-Koordinaten nach dem Messen des gerenderten Panels veröffentlicht, eine 5-px-Lücke unter dem Trigger hält, auf einen 16-px-Viewport-Rand clampet und bei Resize, captured Scroll und Panel-Resize neu misst. Der Katalog-Ref macht auch Pointer-Presses innerhalb des Portals Teil der bestehenden Dismissal-Grenze. Browser-Formatierung verwendet Locale, Zeitzone und Uhr des Betrachters, während dauerhafte Schedule-Einträge unverändert bleiben.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Browser-Einstieg: Locale-Registrierung und Session-Header-Slot-Beitrag |
| [`src/client/ScheduleCatalogAction.tsx`](src/client/ScheduleCatalogAction.tsx) | Sichtbarkeit, Reihenfolge, Formatierung, Popover und Tastaturverhalten |
| [`src/client/locales.ts`](src/client/locales.ts) | Englischer und chinesischer Katalogtext |
| [`src/index.ts`](src/index.ts) | Leeres Host-apply, das das optionale Browser-Feature für den Loader adressierbar hält |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht, weil dieser schreibgeschützte Client-Katalog keinen veränderlichen plugin-übergreifenden Zustand besitzt. |

Die [durable-Web-Schedule-Agent-Note](../../../.agents/notes/implemented/feature/2026-08-05-durable-web-schedule.de.md) besitzt die aktive Projektion und die Opt-in-Präsentationsgrenze; dieses Paket besitzt das Timing- und Accessibility-Verhalten des Katalogs.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Katalog allein nicht ausreicht. Sie führen von der Browser-Präsentation zum dauerhaften Schedule-Zustand und dem geteilten Projektionstransport.

- [Schedule-Paket](../../schedule/schedule/README.de.md) — erstellt, listet, bricht ab und liefert die hier gezeigten Erinnerungen.
- [Schedule-Subsystem](../../../docs/subsystems/schedule.de.md) — dauerhafter Eintrag, Übergangs- und Auslieferungssemantik.
- [Session-Projektions-Subsystem](../../../docs/subsystems/session-projection.de.md) — der Vollwert-Transport, den dieses Paket liest.
- [Client-Paketkarte](../README.de.md) — benachbarte Browser-UI-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da dieses Paket eine fertige Client-Projektion für einen Menschen rendert und nie Prompts, Nachrichten, Schemas, Streams oder Tool-Ergebnisse verändert.

#### KV-Cache-Wirkung

Keine; das Paket assembliert oder sendet nie Provider-Requests.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren den aktuellen Schedule-Katalog. Sie sind aktuelle Paketbeschränkungen, kein Erinnerungsdienst-Vergleich oder Aufgabenrückstand.

- **Nur aktive Einträge** — terminale delete- und dispatch-Übergänge entfernen Zeilen; das gewöhnliche Transkript bleibt die einzige Erinnerungs-Auslieferungs-History.
- **Browser-abgeleitete Zeit** — lokale und relative Labels verwenden die aktuelle Locale, Zeitzone und Uhr des betrachtenden Browsers. Sie sind Präsentationswerte, keine dauerhaften Schedule-Fakten.
- **Schreibgeschützte Oberfläche** — Erstellen und Löschen von Erinnerungen bleibt bei den Schedule-Tools; der Katalog hat keine Mutations-, Retry-, Acknowledgement-, Toast- oder Auslieferungsbeleg-Semantik.
- **Geöffnete Session erforderlich** — ein fehlgeschlagener Open verbirgt selbst einen vorläufigen gecachten Wert, weil das strikte Session-Replay maßgeblich bleibt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
