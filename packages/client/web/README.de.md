---
description: "Web-Boot-Kernel für die Web-GUI: zweistufiger Boot des Client-Plugin-Baums, die framework-freie Boot-Seite und die geteilte Modultabelle, für Anwender und Maintainer, die die Browser-Anwendung zusammensetzen oder debuggen."
kind: "package-library"
---

# @deepseek-ai/dsh-client-web

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-client-web` bootet die Web-GUI: Es lädt das Client-Modulsystem aus dem vom Host bereitgestellten Boot Graph und aktiviert dann jedes Client-Plugin, bevor die Anwendung mountet, sodass die volle UI erst erscheint, wenn jedes Plugin oben ist. Eine framework-freie Boot-Seite meldet Per-Entry-Status, sodass ein fehlschlagendes Bundle oder Plugin sichtbar bleibt statt eines leeren Bildschirms. Es definiert außerdem die geteilte Modultabelle (`PLATFORM_MODULES`), gegen die jedes dynamische Bundle seine Externals auflöst. Das Modell sieht dieses Paket nie.

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

Es verwenden, wenn du die Browser-Anwendung assemblierst: Der Vite-Entry von `apps/web` führt `new AppWebEntry(container).run()` gegen den Mount Point aus, und die Boot-Seite führt den Nutzer durch die Aktivierung. Gewöhnliche Browser-Aufrufer übergeben keine Optionen. Ein vorinjizierter Page-Transport ist der Default vor dem `seams`-Override: Trägt `globalThis.__DSH_TRANSPORT__` `loadBundle`, übernimmt die Modulstufe ihn als Bundle-Transport und überspringt den HTTP-Prefetch des `immediately`-Tiers, während explizite `seams` weiterhin gewinnen (zum Beispiel jsdom-Tests, wo externe `<script>`-Ausführung den Page-Kontext nicht erreichen kann).

Die Shell-Basis-Styles wenden automatische CJK/Latin-Spacing auf gewöhnlichen Inhalt in unterstützenden Browsern an. Semantische Code- sowie Terminal-, Diff-, Read- und Search-Output-Container behalten literale Source-Spacing und Spaltenausrichtung; Browser ohne `text-autospace`-Support ignorieren beide Deklarationen.

### Wie Boot aussieht

Der Boot läuft in zwei Stufen: Die Modulstufe übernimmt den vom Parser geladenen Bootstrap-Batch, baut das Modulsystem aus dem vom Host bereitgestellten Boot Graph und prefetcht den `immediately`-Tier über die geteilte Application-Batch-URL, die einmal ausgeführt wird. Die Plugin-Stufe aktiviert dann jeden Graph-Eintrag und wartet auf alle, bevor sie das markierte Boot-DOM an den UI-Renderer übergibt, der es hydratisiert und zur vollständigen UI umschaltet.

### Die Boot-Seite

Die Boot-Seite verwendet plain DOM und lokales CSS, sodass Bundle- und Plugin-Aktivierungsfehler sichtbar bleiben: Sie zeigt einen Spinner-Node, dessen CSS-Arc mit der Aktivierung der Einträge wächst, und meldet Per-Entry-Status. Der Spinner und seine Animationsphase bleiben bestehen, bis die volle UI die Boot-Seite ersetzt. Ein Plugin, dessen Import oder Aktivierung fehlschlägt, wird mit Name und Grund (fehlender Service, Importfehler oder State) gemeldet statt einer leeren Seite.

### Die geteilte Modultabelle

`PLATFORM_MODULES` (in `src/platform.ts`) benennt die shell-geseedeten geteilten Module — React, Cordis und statische UI-Libraries — und definiert zusammen mit `PRELOADED_CLIENT_EXTERNALS` (der vom Parser vorgeladenen Runtime-Zeile) die implizite External-Baseline, gegen die jedes dynamische Bundle auflöst. `dsh.client.external` fügt nur exakte Nicht-Baseline-Requests hinzu; siehe [Geteilte Module und der Module Graph](../AGENTS.md#shared-modules-and-the-module-graph).

### Konfiguration

Das Paket akzeptiert keine eigene Plugin-Config; der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md) listet jede Plugin-Config im Repository zum Vergleich.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie der Boot-Kernel gebaut ist; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Der Kernel besitzt exakt drei Dinge: das Modulsystem, den Cordis-Loader und die Boot-Seite. Der Host besitzt Graph, Batch-Preload und Loader-Facade, sodass `AppWebEntry` nie die Bootstrap-Package-Id kennt oder das Wire Format parst. Der dynamische UI-Renderer erhält den Mount Point erst, nachdem jeder Client-Eintrag aktiviert ist.

### Zweistufiger Boot

`run()` ruft das vom Host installierte `window.__ModuleLoader__.create({ boot, staticModules, ...seams })` auf; die Facade gibt das konstruierte Modulsystem und das geparste manifest zurück, nachdem sie den vom Parser geladenen Bootstrap-Batch übernommen hat. Die Modulstufe prefetcht den `immediately`-Tier über die eine geteilte Application-Batch-URL. Die Plugin-Stufe mountet den Loader, weist `loader.internal = modules` zu, erstellt jeden Graph-Eintrag einheitlich, wartet auf quiescence und auditiert dann die Aktivierung: Jeder Eintrag, dessen Import fehlschlug, der wegen eines fehlenden Services pending blieb oder in einem anderen nicht-aktiven State landete, wirft einen aggregierten Fehler, der jeden fehlschlagenden Eintrag nennt.

### Boot-Seiten-Mechanik

Die Boot-Seite ist plain DOM mit lokalem CSS, dessen Fallback-Fonts und -Farben zu den Theme-Tokens passen, die während des Ladens ankommen. `internal/status`-Events treiben einen Spinner-Node und Per-Entry-Labels; die Hydratation bewahrt Node und Animationsphase durch den Application-Commit, und `fail()` rendert den geworfenen Grund. React-Mounting, slot-Rendering und Assembly liegen in `ui-renderer`; `ui-layout` besitzt die assemblierte Browser-Titel-Projektion.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Library-Einstieg: `AppWebEntry`, `getStaticModules`, Plattform-Tabellen |
| [`src/boot.ts`](src/boot.ts) | `AppWebEntry`: zweistufiger Boot, Aktivierungs-Audit, Renderer-Übergabe |
| [`src/boot-page.ts`](src/boot-page.ts) | Framework-freie Boot-Seite: Spinner, Per-Entry-Status, Fehler-Rendering |
| [`src/platform.ts`](src/platform.ts) | `PLATFORM_MODULES` / `PRELOADED_CLIENT_EXTERNALS`: die implizite External-Baseline |
| [`src/seed.ts`](src/seed.ts) | Die beim Boot an den loader übergebene statische Modultabelle |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese lesen, wenn der Boot-Contract nicht ausreicht: das Modulsystem, das er bootet, der Renderer, der die App mountet, und die Client-Authoring-Regeln hinter der Baseline.

- [Client-Modulsystem](../modules/README.de.md) — die Lazy-Modultabelle und der Boot Graph, die dieser Kernel konsumiert.
- [UI-Renderer](../ui-renderer/README.de.md) — erhält den Mount Point und bindet slot-Daten an React.
- [Client-Modules-Subsystem](../../../docs/subsystems/client-modules.de.md) — die Web-Plugin-Tabelle, der Boot-Graph-Wire und die Bundle-Route.
- [Client-Authoring-Regeln](../AGENTS.md#shared-modules-and-the-module-graph) — die Shared-Module-Baseline und die `dsh.client.external`-Semantik.
- [Client-Gruppenübersicht](../README.de.md) — die Browser-Hälfte, zu der dieses Paket gehört.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da der Boot-Kernel eine browserseitige UI-Plugin-Schicht ist, die nichts Modellzugewandtes registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert oder sendet keinen Provider-Request.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was der Boot-Kernel nicht unterstützt. Sie sind aktuelle Paket-Constraints, kein Aufgabenstau.

- **Die Anwendung wartet auf das vollständige Roster** — ein fehlschlagender Eintrag lässt die framework-freie Boot-Seite mit einem Per-Entry-Report sichtbar; partielle UI-Verfügbarkeit wird nicht unterstützt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Die Vite-Entry-Shell — Boot-Glue und Module-Table-Seeding ohne Cordis-Events und ohne pluginübergreifenden mutablen State; die Boot-Chain (Loading-Seite → settled → einmaliger UI-Flip) wird vom Web-Smoke-e2e gegen den echten Träger assertiert.
