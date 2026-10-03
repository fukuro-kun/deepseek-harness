---
description: "Paketkarte der persistenten Bild-Attachment-Capability-Familie: was du mit Bild-Attachments tun kannst und wo deine Bilder gespeichert werden."
kind: "package-group"
---

# attachment/ — persistente Attachment-Capability-Familie

[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die Gruppe `attachment/` stellt persistente Bild-Attachments bereit: Hänge Bilder an prompts und Commands an, und der harness speichert sie auf deinem Rechner, zeigt sie erneut in der Konversationshistorie und sendet sie in späteren Turns an das Modell. Die ausgelieferte `dsh`-Komposition aktiviert das ohne Einrichtung. Die Capability und ihr Storage sind auf zwei Pakete aufgeteilt, siehe unten. Gespeicherte Bilder überleben Neustarts und werden nie automatisch gelöscht; unterstützt werden nur Rasterbildformate.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Diese zwei Pakete stellen persistente Bild-Attachments bereit; jedes README beschreibt, was du mit seinem Teil tun kannst.

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`attachment/`](attachment/README.de.md) | Bild-Attachments für prompts und Commands, die persistieren und in der Historie zurückkehren | `ctx.attachments` |
| [`attachment-local/`](attachment-local/README.de.md) | Speichert deine angehängten Bilder auf diesem Rechner unter `DSH_HOME` | registriert auf `ctx.attachments` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Beginne mit der Subsystem-Referenz für den Service-Contract, dann mit der Capability-seam-Tabelle und der Konfigurationsoberfläche des lokalen Backends.

- [Attachment-Subsystem-Referenz](../../docs/subsystems/attachment.de.md) — Service-Contract, Payload-Typen und die `ctx.attachments`-Cordis-Oberfläche.
- [Capability seams](../../docs/capability-seams.de.md) — die Service-Definition-/Service-Provider-/Consumer-Aufteilung, der diese Familie folgt.
- [Generierter Konfigurationskatalog](../../docs/config-catalog.de.md#deepseek-aidsh-attachment-local) — jedes akzeptierte Feld des lokalen Backends.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
