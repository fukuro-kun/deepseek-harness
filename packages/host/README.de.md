---
description: "Package map for the web GUI host half: the HTTP and SPA servers, workspace-directory picking implementations, the open-in-app launch routes, and the plugin inventory projection."
kind: "package-group"
---

# host/ — Web-GUI-Host-Seite

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die Gruppe `host/` stellt den reinen HTTP-Server der Web GUI, den SPA-dist-Server, der die gebaute Web-Shell ausliefert, den Workspace-Verzeichniswahl-seam mit seinen nativen, Browser- und adaptiven Paketen, die open-in-app-Anwendungsprobe- und Startrouten sowie die schreibgeschützte Plugin-Inventar-Projektion bereit. Alle acht Pakete sind Produktpakete; der Browser-Transport liegt in [`client/`](../client/README.de.md), die komponierte Anwendung ist [`apps/cli`](../../apps/cli/README.de.md), die das [`dsh-base`-Bundle](../bundle/base/cordis.patch.yml) startet, das die Web-App unter `apps/web/` ausliefert. Die Picker-Backends ersetzen einander hinter dem gemeinsamen seam.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Acht Pakete übernehmen die Host-Rollen; jede Paket-README besitzt ihren Vertrag und ihre Konfiguration.

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`webserver/`](webserver/README.de.md) | Browser-HTTP-Server: benannte Routen, Upgrades, Index-Taps und der Fallback-Sitz | `ctx.webServer` |
| [`frontend-static/`](frontend-static/README.de.md) | SPA-dist-Server auf dem Fallback-Sitz des webserver | nutzt `ctx.webServer` |
| [`directory-picker/`](directory-picker/README.de.md) | Workspace-Verzeichniswahl-seam: Capability-Vertrag und Fehlervokabular | `ctx.directoryPicker` |
| [`directory-picker-native/`](directory-picker-native/README.de.md) | Natives OS-Auswahl-Backend für Bediener am Host-Display | registriert `ctx.directoryPicker` |
| [`directory-picker-browse/`](directory-picker-browse/README.de.md) | In-App-Verzeichnisbrowser-Backend, auch für Remote-Clients | registriert `ctx.directoryPicker` |
| [`directory-picker-auto/`](directory-picker-auto/README.de.md) | Host-adaptive Auswahl, die beim Start das passende Backend mountet | mountet ein Backend |
| [`open-in-app/`](open-in-app/README.de.md) | Anwendungsprobe-, Icon- und Startrouten, die das Workspace-Verzeichnis in einer installierten Anwendung öffnen | nutzt `ctx.webServer` |
| [`plugin-inventory/`](plugin-inventory/README.de.md) | Schreibgeschützte Projektion der aktuellen Loader-Einträge | Remote `pluginInventory/list` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Beginne mit den Subsystem-Referenzen für den Transport und die Workspace-Records, danach die Schichtungsentscheidung hinter dem Web-Client.

- [HTTP-Server-Subsystem](../../docs/subsystems/web-server.de.md) — die Routen des webserver, Matching-Reihenfolge und Konfiguration.
- [Workspace-Subsystem](../../docs/subsystems/workspace.de.md) — die Workspace-Records, die der Verzeichnis-Picker speist.
- [Web-Konfigbaum-Boot und Transport-Schichtung](../../.agents/notes/implemented/architecture/2026-07-24-web-config-tree-boot-and-transport-layering.de.md) — Zuständigkeit der Web-Transport-Schichten.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
