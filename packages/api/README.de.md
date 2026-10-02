---
description: "Paketkarte für die Remote-Schicht der Anwendung: typisierte Client-zu-Host-Fähigkeitsaufrufe, Ergebnisse und weitergeleitete Events, für Nutzer und Maintainer, die die Gruppe navigieren."
kind: "package-group"
---

# api/ — Remote-API-Schichten

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Die `api/`-Gruppe stellt die Remote-Schicht der Anwendung bereit: Eine Client-Umgebung kann die auf dem Host laufenden Geschäftsfähigkeiten aufrufen — Ziele verwalten, Befehle ausführen, das Plugin-Inventar auflisten, Datei- und Session-Referenzen entdecken — als typisierte Methodenaufrufe und die Ergebnisse oder weitergeleitete Host-Events empfangen. `remotes` entscheidet, welche Fähigkeiten exponiert werden und wie jeder Aufruf den agent der richtigen Session erreicht; `gateway` trägt die Aufrufe und ihre Ergebnisse zwischen Client und Host. Der Stack läuft über die geteilte Connection der Anwendung; gestreamte Session-Daten sind bewusst nicht Teil davon.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Zugehörige Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Die folgenden Pakete stellen die Remote-Schicht bereit; die paketweiten READMEs besitzen die erschöpfenden Verträge.

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`remotes/`](remotes/README.de.md) | Wählt, welche Host-Fähigkeiten und Events der Client konsumieren kann. | — |
| [`gateway/`](gateway/README.de.md) | Trägt typisierte unäre Aufrufe, multiplexte Streams und weitergeleitete Host-Events. | `ctx.typertGateway` / `ctx.remote` |
| [`session-controller/`](session-controller/README.de.md) | Besitzt Session-Befehle, Historie-Streams, live Kontrollzustand und Agent/Session-Identitätsrichtlinie. | `ctx.sessionController` / `ctx.remote.session` |
| [`settings-controller/`](settings-controller/README.de.md) | Besitzt die Lese- und Schreibzugriffe der Konfigurationsoberfläche über den settings-Domain-seams. | `ctx.settingsController`, `ctx.credentialsController` / `ctx.remote.settings`, `ctx.remote.credentials` |
| [`workspace-controller/`](workspace-controller/README.de.md) | Besitzt Workspace-Mutationen und die vollständige Client-Workspace-Projektion. | `ctx.workspaceController` / `ctx.remote.workspace` |
| [`workspace-files/`](workspace-files/README.de.md) | Besitzt begrenzten Workspace-Dateizugriff — `stat`, paginiertes `read`, `list` und den `changes`-Feed instrumentierter Operationen — sowie den Client-`file`-Ressourcenprovider darüber. | `ctx.workspaceFiles` / `ctx.remote.workspaceFiles` |

Remote-Aufrufe laufen Client → Host über die geteilte Connection der Anwendung. Das API-Gateway besitzt den Remote-Transport, während die controller-Pakete Session-, Konfigurationsoberflächen- und Workspace-Verhalten besitzen. Feature-Pakete registrieren exakte Connection-Fetch-Routen für Antworten, die nicht in Remote-Aufrufe passen, etwa gestreamte Downloads.

-----

<a id="related-documentation"></a>
## Zugehörige Dokumentation

Beginnen Sie mit der API-Gateway-Referenz, um das Remote-Modell Ende zu Ende zu sehen, dann der Typert-Subsystem-Seite für die geteilten Definitionen und Connection für den physischen Träger.

- [API-Gateway-Referenz](../../docs/api-gateway.de.md) — die Ist-Zustand-Referenz für das Typert-API-Gateway: Programmiermodell, Generierungspipeline und Runtime-Aufruf.
- [Typert-Subsystem-Referenz](../../docs/subsystems/typert.de.md) — die öffentlichen Verträge, die Protokoll, Gateway und Consumer-Assemblies teilen.
- [Connection](../client/connection/README.de.md) — der RPC-Träger, die `/api`-Vertrauensgrenze und die Antwort-Envelopes hinter jedem Remote-Aufruf.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
