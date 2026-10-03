---
description: "Paketkarte für die Browser-Hälfte der Web-GUI: Shell-Boot, Browser-Host-Kommunikation, geteilte Client-Services, Lokalisierung, Entwicklungs-Reload und die UI-Feature-Plugins."
kind: "package-group"
---

# client/ — Web-GUI-Browser-Hälfte
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die `client/`-Gruppe stellt das Browser-Erlebnis der dsh-Web-GUI bereit, einschließlich Conversation, Navigation, Settings, Approvals, Dateizugriff und weiterer interaktiver Features. Wähle Pakete aus dieser Familie, wenn du browser-sichtbares Verhalten hinzufügst; verwende [`host/`](../host/README.de.md) für server-seitige Seitenauslieferung und Host-Integration. Die Pakete decken sowohl die geteilte Browser-Grundlage als auch fokussierte UI-Features ab, während jedes Kind-README seine Konfiguration und sein Verhalten besitzt. Die Authoring-Regeln stehen in [AGENTS.md](AGENTS.md), und die zugehörige Dokumentation unten erklärt die paketübergreifende Komposition.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Zugehörige Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Die Kernel-Pakete booten und bedienen die Seite; die UI-Feature-Pakete präsentieren sie. Jedes Paket-README besitzt seinen Vertrag und seine Konfiguration.

| Paket | Rolle | ctx-Key |
|---|---|---|
| [`web/`](web/README.de.md) | Bootet die Browser-Shell | — |
| [`modules/`](modules/README.de.md) | Lädt browser-seitige Client-Module | `ctx.clientModules` / `ctx.modules` |
| [`connection/`](connection/README.de.md) | Hält die Browser-Host-RPC-Kommunikation und Event-Zustellung aufrecht | `ctx.connection` |
| [`file-upload/`](file-upload/README.de.md) | Sendet rohe Blob- und Byte-Stream-Request-Bodies außerhalb des Seiten-Threads | `ctx.fileUpload` |
| [`store/`](store/README.de.md) | Stellt React-freie Observable- und Snapshot-Store-Primitive bereit | — |
| [`hmr/`](hmr/README.de.md) | Aktualisiert Client-Plugins während der Entwicklung | — |
| [`locale/`](locale/README.de.md) | Stellt Lokalisierungs-Präferenzen und Message-Dictionaries bereit | `ctx.locale` |
| [`test-runtime/`](../test-support/client-runtime/README.de.md) | Geteilter Repository-Test-Support für Client-Feature-Pakete | — |
| [`ui-renderer/`](ui-renderer/README.de.md) | Bindet Slot-Daten an React und mountet die zusammengesetzte Anwendung | `ctx.uiRenderer` |
| [`ui-slots/`](ui-slots/README.de.md) | Definiert, wie UI-Features Extension-Slots registrieren und komponieren | — |
| [`ui-session/`](ui-session/README.de.md) | Adaptiert Session-Controller-Zustand in Standard-Slot-Quellen und -Hooks | — |
| [`ui-theme/`](ui-theme/README.de.md) | Wendet das gewählte Farbtheme an | — |
| [`ui-primitives/`](ui-primitives/README.de.md) | Stellt geteilte React-Controls, Icons und Content-Renderer bereit | — |
| [`ui-attachment/`](ui-attachment/README.de.md) | Registriert Composer- und Message-Image-Attachment-Präsentation | — |
| [`ui-layout/`](ui-layout/README.de.md) | Ordnet die Hauptbereiche der Anwendung an | — |
| [`ui-sidebar/`](ui-sidebar/README.de.md) | Präsentiert Workspace- und Session-Navigation | — |
| [`resources/`](resources/README.de.md) | Einheitliches Ressourcenmodell: Protokoll-Provider hinter dem `useResource`-Session-Standard-Hook | `ctx.resources` |
| [`ui-sidebar-files/`](ui-sidebar-files/README.de.md) | Rechte-Sidebar-Workspace-Dateibaum-Tab-Typ | — |
| [`ui-brand-official/`](ui-brand-official/README.de.md) | Füllt die generischen Browser-Brand-Slots mit dem offiziellen Namen und den Markenzeichen | — |
| [`ui-workspace/`](ui-workspace/README.de.md) | Stellt Workspace-Auswahl- und -Erstellungs-Surfaces bereit | — |
| [`ui-conversation/`](ui-conversation/README.de.md) | Präsentiert die aktive Conversation und ihre Input-Surface | — |
| [`ui-chat/`](ui-chat/README.de.md) | Projiziert und rendert das Chat-Conversation-Target | — |
| [`ui-approval/`](ui-approval/README.de.md) | Präsentiert Approval-Requests und gibt Nutzer-Entscheidungen zurück | — |
| [`ui-tool/`](ui-tool/README.de.md) | Komponiert Tool-Call-Bäume und gekeyte Pro-Tool-Views | — |
| [`ui-workflow-run/`](ui-workflow-run/README.de.md) | Replayed persistente Workflow-Runs als verschachtelte Chat-Disclosures | — |
| [`ui-goal/`](ui-goal/README.de.md) | Präsentiert und verwaltet das aktuelle Goal | — |
| [`ui-trajectory/`](ui-trajectory/README.de.md) | Präsentiert alternative Ansichten der Agent-Aktivität | — |
| [`ui-commands/`](ui-commands/README.de.md) | Stellt Session-bewusste Kommando-Discovery und -Dispatch bereit | — |
| [`ui-input-trigger/`](ui-input-trigger/README.de.md) | Koordiniert Inline-Kommando- und -Referenz-Vorschläge | — |
| [`ui-skill/`](ui-skill/README.de.md) | Fügt Skill-Referenzen zu Inline-Vorschlägen hinzu | — |
| [`ui-reference/`](ui-reference/README.de.md) | Einheitliche Web-`@file`-/`@session`-Referenzquelle | — |
| [`ui-subagent/`](ui-subagent/README.de.md) | Stellt Subagent-Navigation, Child-Transcript-Zustände und Inline-Referenzen bereit | — |
| [`ui-schedule/`](ui-schedule/README.de.md) | Listet die aktiven Reminders der aktuellen Session in einem Read-only-Header-Katalog | — |
| [`ui-jobs/`](ui-jobs/README.de.md) | Listet die Background-Jobs dieser Session im Conversation-Header | — |
| [`ui-model-selection/`](ui-model-selection/README.de.md) | Stellt Modellauswahl in Conversation-Surfaces bereit | — |
| [`ui-permission-presets/`](ui-permission-presets/README.de.md) | Konfiguriert Default-Permissions und schaltet den Zugriff der aktuellen Session um | — |
| [`ui-plan/`](ui-plan/README.de.md) | Präsentiert den aktiven Plan-Mode-Status und dessen Exit-Control | — |
| [`ui-settings-plugins/`](ui-settings-plugins/README.de.md) | Besitzt den Plugins-Settings-Bereich, seinen Tab-Extension-Point und konfigurierbare Host-Plane-Plugin-Karten | — |
| [`ui-user-questions/`](ui-user-questions/README.de.md) | Präsentiert interaktive Fragen, die der Agent anfordert | — |
| [`ui-agent-preset/`](ui-agent-preset/README.de.md) | Wählt das Agent-Preset einer Session und erstellt Preset-Kompositionen | — |
| [`ui-settings/`](ui-settings/README.de.md) | Hostet das Settings-Interface und seine Extension-Bereiche | — |
| [`ui-settings-general/`](ui-settings-general/README.de.md) | Stellt den allgemeinen Settings-Bereich bereit | — |
| [`ui-settings-models/`](ui-settings-models/README.de.md) | Stellt Model-Provider-Konfiguration und DeepSeek-Onboarding bereit | — |
| [`ui-settings-plugin-inventory/`](ui-settings-plugin-inventory/README.de.md) | Trägt den Read-only-Host-Loader-Inventory-Tab zu den Plugins-Settings bei | — |
| [`ui-deliverables/`](ui-deliverables/README.de.md) | Erzeugt den Turn-Tail produzierter Dateien und klickbare Final-Response-Dateireferenzen | — |
| [`ui-message-feedback/`](ui-message-feedback/README.de.md) | Die Feedback-Surface: Pro-Message-Like/Dislike in der Assistant-Message-Action-Strip und der Feedback-Dialog hinter Dislike und `/feedback` | — |
| [`ui-directory-picker-browse/`](ui-directory-picker-browse/README.de.md) | In-App-Verzeichnis-Browsing-Surface für den Workspace-Verzeichnis-Flow | — |
| [`ui-directory-picker-native/`](ui-directory-picker-native/README.de.md) | Native Directory-Picker-Surface, die den OS-Chooser des Hosts antreibt | — |
| [`ui-open-in-app/`](ui-open-in-app/README.de.md) | Session-Header-Split-Button, der das Workspace-Verzeichnis in einer installierten Anwendung öffnet | — |

-----

<a id="related-documentation"></a>
## Zugehörige Dokumentation

Beginne mit der Subsystem-Referenz und den beiden Notes, die die paketübergreifenden Kompositionsentscheidungen besitzen, dann mit der Host-Hälfte, die diese Seite ausliefert.

- [Client-Modules-Subsystem](../../docs/subsystems/client-modules.de.md) — die Web-Plugin-Tabelle: `dsh.client`-Deklarationen, der Boot-Graph-Wire und die Bundle-Route.
- [Slot-System-Standard](../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.de.md) — das maßgebliche Slot-Modell: Registrierung, Props-Shares und Stores.
- [Web-Client-Architektur-Note](../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.de.md) — die Ladekette, die Objektschicht und die Client-Services.
- [Host-Gruppenkarte](../host/README.de.md) — die Host-Hälfte, die diese Browser-Hälfte ausliefert.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
