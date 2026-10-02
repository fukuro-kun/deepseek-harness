---
description: "Client-Modulsystem für die Web-GUI: der Host komponiert den Boot-Graph und liefert Plugin-Bundles aus, und der Browser lädt sie lazy, für Benutzer und Maintainer, die Client-Plugins komponieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-modules

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-client-modules` verwandelt die `dsh.client`-Deklaration eines Plugin-Pakets in ein ladbares Browser-Bundle: die Host-Hälfte scannt aktivierte Loader-Einträge und komponiert den Boot-Graph, ein verfügbarer Web-Träger liefert jedes Bundle über `/plugins` aus, und ein shell-eigener Träger dispatcht exakt dieselben Bundle-Antworten über `fetchBundle()`. Die Browser-Hälfte lädt diese Bundles lazy bei Bedarf. Plugin-Bundles werden lazy ausgeführt — das Ausführen eines Bundles registriert nur eine Factory, und Modul-Seiteneffekte laufen bei der Materialisierung — sodass nichts läuft, bevor ein Plugin erstmals verwendet wird. Alles hier ist Browser-Kernel-Maschinerie; das Modell sieht sie nie.

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

Verwenden Sie [`DshClientManifest`](../../util/package-manifest/README.de.md) für den Deklarationstyp. Client-modules validiert das JSON und besitzt den normalisierten Boot-Graph.

Verwenden Sie es, wenn Sie ein Browser-Client-Plugin komponieren oder bauen: das Paket verwandelt die `dsh.client`-Deklaration eines Pakets in ein ladbares Browser-Bundle ohne pro-Plugin-Verdrahtung. Es aktiviert mit der Web-Komposition; die Shell bootet es, bevor irgendein Plugin läuft.

### Ein Client-Plugin deklarieren

Ein Browser-Plugin-Paket deklariert `dsh.client` in seiner `package.json` mit `platform: 'web'`, exportiert ein `./client`-Bundle und listet alle nicht-baseline Modul-Requests unter `dsh.client.external`. Die Host-Hälfte verwandelt jede Deklaration in ein unter `/plugins` ausgeliefertes Bundle, so geordnet, dass dynamische Provider vor ihren Consumern laden.

### Was der Browser lädt

Die Application-Combo-Skripte registrieren Plugin-Factories einmalig beim Boot; Modul-Bodies bleiben lazy und laufen nur beim ersten Import oder bei der Materialisierung. Zeilen, die eine Combo-URL teilen, teilen sich eine in-flight-Skriptaufgabe. HMR schaltet eine geänderte Zeile auf ihre revisionierte Ein-Ressourcen-Combo-URL um. `<id>/client` und die nackte id lösen zu denselben Exports auf, weil ein Plugin-Bundle die Client-Hälfte seines Pakets ist.

### Module teilen

Die Shell befüllt eine eingefrorene Modultabelle (`PLATFORM_MODULES`: React, Cordis und statische UI-Bibliotheken); jedes dynamische Bundle löst seine externals genau gegen diese Baseline auf. `dsh.client.external` fügt nur exakte Nicht-Baseline-Requests hinzu, jeder beantwortet von der dynamischen Paketzeile, die er benennt, oder einem exakten Static-Table-Key. Type-only-Imports werden gelöscht und erzeugen keinen Request. Die Komposition lehnt fehlerhafte Requests, fehlende Lieferanten, Selbst-Requests und synchrone Request-Zyklen ab.

### Build-Anforderungen

Der Host liefert gebaute Client-Bundles aus, daher muss `pnpm run build` jedes `lib/client.js` vor dem Start erzeugt haben; ein fehlendes Bundle lässt die Aktivierung laut mit einer Build-Anweisung und einer Paket-/Pfadliste fehlschlagen. Ein Source-Start bildet Host-Imports auf TypeScript-Quellen ab, konsumiert aber weiterhin den gebauten Client-Export. Das Paket akzeptiert keine eigene Plugin-Konfiguration.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie das Modulsystem gebaut ist; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) behandelt.

### Designkonzept

Das Paket ist doppelgesichtig: die Node-Hälfte ist die Kompositions- und Auslieferungsseite (`ctx.clientModules`, `ClientModuleRegistry`), die Browser-Hälfte die Ladeseite (`ctx.modules`, `ClientModuleSystem`). Die Leitung dazwischen ist der Boot-Graph — `WebBootEntry`-Zeilen, injiziert als `window.__DSH_BOOT__`, mit `<` escaped, sodass plugin-kontrollierte Strings nicht aus dem script-Element ausbrechen können. Der einzige Konsumptionspunkt des vendorten Loader ist `EntryTree.import`, sodass das Modulsystem der alleinige Ersatz für "wie Plugin-Code ankommt" ist.

### Lazy-CJS-Modell

Das Ausführen eines Plugin-Bundles registriert nur seine Factory; jeder Modul-Body-Seiteneffekt (CSS-Injektion eingeschlossen) lebt in der Factory-Closure und läuft bei der Materialisierung (`factory(require)` → exports, memoized in `loadCache`). Eine Factory, die ein registriertes, aber nicht materialisiertes Modul benötigt, materialisiert es rekursiv; require-Zyklen werfen, weil Factory-Form-CJS keine partiellen Exports liefern kann. Die Auflösung prüft in dieser Reihenfolge die Plattform-Seed-Tabelle, memoized Einträge, Boot-Graph-Zeilen und registrierte Factories; alles andere wirft. Das synchrone `require` verwendet dieselbe Reihenfolge ohne asynchrones Graph-Zeilen-Laden und zeichnet beobachtete Kanten im Modul-Record auf.

### Inkrementelle Komposition

Die Node-Hälfte scannt inkrementell pro Paket — es gibt keinen Full-Rescan-Pfad. Jede `internal/plugin`-Emission markiert den Entry-Namen des fiber als dirty; ein Microtask-Flush gleicht jeden dirty Namen gegen die Live-Loader-Einträge ab, und der Aktivierungs-Pass seedet dieselbe dirty-Menge und flusht synchron, sodass erster Scan und Steady State eine Implementierung teilen. Paket-Metadaten werden pro Loader-Specifier und Owning-Tree-Base-URL bis zum Neustart gecacht, während der aufgelöste Manifest-Paketname das Browser-Modul identifiziert. Distincte aktive Loader-Quellen, die auf denselben Paketnamen auflösen, werden abgelehnt; das Entfernen des Konflikts befördert die verbleibende Quelle, ohne dass ihr fiber neu starten muss. Bundle-Inhaltsänderungen erreichen den Graph nur über `rebuilt()` (den HMR-Hook).

Die Node-Hälfte snapshotet jedes Client-Bundle und jede verfügbare Source Map vor der Veröffentlichung. Sie gruppiert Ressourcen in `/plugins/??...&rev=...`-Combo-URLs, mit einer Bootstrap-Combo für die modules-Zeile und einer oder mehreren Application-Combos für die anderen Zeilen; jede Phase wird partitioniert, bevor eine URL 3 KiB überschreitet. Jede Combo-Map ist Indexed Source Map v3 und verwendet eine authored section, wenn verfügbar, oder eine identity section für das gebündelte Paket. Initiale pro-Plugin-Revisionen verwenden Prozess-Nonces, sodass der Start nicht jedes Plugin hasht; HMR hasht nur ein als geändert gemeldetes Artefakt. Ausgelieferte Antworten sind unveränderlich, und eine unbekannte Kombination oder Revision liefert 404.

### Boot-Manifest-Injektion

Der Host steuert strukturierte Index-Zeilen bei, die in `<head>` injizieren: die `window.__ModuleLoader__`-Queue-Facade, advisory Preloads für jede Application-Combo, die parser-blockierenden Bootstrap-Combo-Skripte, dann den Boot-Graph, bevor die Shell ihn liest. Ein Web-Träger rendert diese Zeilen in seine Index-Antwort; ein shell-eigener Träger kann dieselben Zeilen ohne Web-Server rendern. Die `create()` der Facade materialisiert das modules-Bundle, delegiert die Konstruktion an dessen `createClientModuleSystem`-Export und lässt dieselbe Facade im Live-Registration-Modus.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Node-Hälfte: `ClientModuleRegistry`, Scan, Artefakt-Snapshots, optionale Combo-Route, strukturierte Index-Zeilen |
| [`src/client/index.ts`](src/client/index.ts) | Browser-Hälfte: Bootstrap-Export, `ctx.modules`-Eintragung |
| [`src/client/system.ts`](src/client/system.ts) | `ClientModuleSystem`: Lade-/Materialisierungs-/Invalidierungsmaschinerie |
| [`src/client/manifest.ts`](src/client/manifest.ts) | Wire-Typen und Boot-Manifest-Parsing |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese, wenn der Modulvertrag nicht ausreicht: die Subsystem-Referenz, die Shell, die den Baum bootet, und die Client-Autorenregeln hinter dem Graph.

- [Client-modules-Subsystem](../../../docs/subsystems/client-modules.de.md) — die Web-Plugin-Tabelle, der `WebBootGraph`-Wire und die Bundle-Route.
- [Web-Boot-Kernel](../web/README.de.md) — die Shell, die das Modulsystem erzeugt und den Plugin-Baum bootet.
- [Client-HMR-Treiber](../hmr/README.de.md) — die Reload-Kette, die `invalidate`/`prefetch` auf neu gebauten Bundles treibt.
- [Client-Autorenregeln](../AGENTS.md#shared-modules-and-the-module-graph) — die Shared-Module-Baseline und `dsh.client.external`-Semantik.
- [Client-Gruppenkarte](../README.de.md) — die Browser-Hälfte, zu der dieses Paket gehört.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da der Modul-loader Browser-Kernel-Maschinerie ist, die nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket stellt weder eine Provider-Anfrage zusammen noch sendet es eine.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was das Modulsystem nicht tut. Sie sind aktuelle Paketbeschränkungen, kein Aufgabenrückstand.

- **Flacher Modul-Graph aus Design** — jedes Bundle ist ein Modulknoten, dessen Kanten nur auf Tabellenblätter zeigen; das Interface (`loadCache`/`edges`/`invalidate`) unterstützt bereits einen allgemeinen Modul-Graphen, sodass sich die Externalisierungsgranularität ohne Interface-Änderung ändern kann.
- **Keine eigene Unload-Buchführung** — Style-Entfernung und fiber-Teardown-Reihenfolge liegen beim HMR-Treiber (`@deepseek-ai/dsh-client-hmr`); der loader inventarisiert nur eigene Style-Tag-ids pro Record.
- **Snapshot-Auslieferung hält Artefakt-Bytes vor** — der Host hält jedes Bundle, jede optionale Source Map, jede generierte Ein-Ressourcen-Antwort und die aktuellen Startup-Combo-Antworten im Speicher; HMR hält zusätzlich eine vorherige Startup-Generation. Der Speicher skaliert als mehrere Kopien der komponierten Client-Artefakte im Tausch gegen unveränderliche Antworten und Ein-Generationen-Race-Toleranz.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
