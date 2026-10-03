# Agent Note: Client-Shell-Schichtung und dynamische Paketgrenzen

Status: implemented

[English](2026-08-15-client-shells-and-dynamic-packages.md) | [中文](2026-08-15-client-shells-and-dynamic-packages.zh.md) | Deutsch

> Das [Client-Plugin-Lademodell](2026-07-23-client-plugin-loading-model.de.md) besitzt Modulankunft, Cordis-Lebenszyklus und HMR. Diese Note besitzt Paketplatzierung, Build Faces, Shared-Module-Anfragen und npm-Dependency-Deklarationen; diese Entscheidungen ersetzen die ältere Paket-Taxonomie und die Import-Edge-Regeln in der Lade-Note.

## Problem

Die npm-Dependency-Abschnitte des Clients beschreiben Installations- und Entwicklungsbeziehungen, aber sie beschreiben nicht zuverlässig Bundle-Inhalte. `dependencies`, `peerDependencies` oder `devDependencies` als implizite Bundler-Anweisungen zu behandeln kann ein geteiltes React oder eine geteilte Workspace-Identität inlinen oder eine gebaute Bibliothek mit unaufgelösten Child-Imports zurücklassen, ohne den Host, der sie zusammensetzen soll.

Die Browser-Anwendung enthält außerdem unterschiedliche Rollen: den HTML/Vite-Kompilierungseinstieg, den frameworkfreien Cordis-Startup-Kernel, statische Assembly-Bibliotheken und Loader-gesteuerte Plugins. Frühe Ausführung ab HTML ist eine Ankunfts-Policy, keine Paketart. Module müssen vor dem Vite-Hauptmodul ankommen und behalten dabei ihr gewöhnliches `lib/client.js`-Artifact und ihre dynamische Graph-Zeile.

Geteilte UI-Bibliotheken stellen weiterhin synchronen TypeScript- und React-Werte vielen Verbrauchern bereit. Bis diese Werte hinter Services oder Slots wandern, würde es die Wertekopplung erhalten, aber verschleiern, welche Modulidentität die Shell teilen muss, wenn man die Bibliotheken zu formalen dynamischen Einträgen machte.

## Entscheidung

### Schichten und Build-Formen

| Schicht | Mitglieder | Verantwortung | Build- und Ladeform |
| --- | --- | --- | --- |
| Web-Kompilierungs-Shell | `apps/web` | Besitzt `index.html`, Vite-Konfiguration, dist-Chunks und statische Assets | Setzt die finale Browser-Ausgabe aus gebauten Paket-Exports zusammen |
| Startup-Kernel | `packages/client/web` | Besitzt die Plain-DOM-Boot-Seite, Modulsystem-Verdrahtung, Cordis-Settlement und Renderer-Übergabe | `staticLinked` `lib/index.js`; keine `dsh.client`-Zeile |
| Statische Assembly-Bibliotheken | Cordis, `ui-primitives`, `ui-slots` | Liefern geteilte Modulidentitäten und direkte Werte-APIs | ESM `lib/index.js`, von Vite gemerged und gechunked; keine Loader-Einträge |
| Modul-Bootstrap | `packages/client/modules` | Liefert die Client-Modultabelle und ihren Cordis-Wrapper | Dynamisches Paket mit einem gewöhnlichen `lib/client.js`; der Host liefert seine Factory früh |
| Dynamische Client-Pakete | connection, `ui-renderer`, theme und Feature-Plugins | Nehmen über Cordis-Services, Slots und Effects teil | Deklarieren `dsh.client`, emittieren selbstregistrierendes `lib/client.js` und bleiben Host-Graph-Einträge |

`packages/client/web` hält Cordis als passende Peer- und Entwicklungs-Dependencies und verwendet Module und statische UI-Pakete als Entwicklungs-Kompilierungs-Inputs. `apps/web` konsumiert gebaute Paket-Exports statt Aliases in Workspace-Source.

Das `staticLinked`-Preset lässt jeden Bare Specifier als externen Import in `lib/index.js` und emittiert relative CSS-Assets daneben. Der Vite-Host löst diese Imports auf und dedupliziert sie und entscheidet die finalen Chunk-Grenzen. Eine statische Bibliothek kopiert daher nicht die Bundling-Policy des Hosts in ihr eigenes Artifact.

### Shared-Module-Anfragen

Dynamische Browser-Bundles externalisieren implizit die gemeinsame Baseline: `PLATFORM_MODULES` benennt von der Shell geseedete React-, Cordis- und statische UI-Identitäten, während `PRELOADED_CLIENT_EXTERNALS` für eine dynamische Identität reserviert ist, die vor dem Shell-Boot ankommen muss und derzeit leer ist. Ein Paket verwendet `dsh.client.external` nur für eine exakte Nicht-Baseline-Werteanfrage. Type-only-Imports werden gelöscht und erzeugen keine Anfrage; erlaubte Drittanbieter-Implementierungsbibliotheken bleiben privater Bundle-Inhalt.

Eine Anfrage hat genau zwei Lieferanten:

1. Die dynamische Paketzeile, die sie benennt; ein abschließendes `/client` ist ein Alias für diese Paketzeile.
2. Ein exakter Schlüssel in der statischen Modultabelle der Shell.

Es gibt keinen allgemeinen `dsh.client.provide`-Alias-Mechanismus. Dynamische Zeilen und statische Schlüssel erschöpfen die realen Lieferanten, während die Cordis-Service-Bereitstellung unabhängig bleibt. Die Graph-Komposition lehnt fehlgeformte oder fehlende Anfragen, Selbstanfragen und synchrone Anfragezyklen ab und ordnet dynamische Lieferanten vor ihren Verbrauchern an. `ClientModuleSystem.import()` und `prefetch()` registrieren diese dynamischen Lieferanten-Factories rekursiv, bevor der Verbraucher materialisieren kann, sodass Netzwerk-Timing den synchronen Anfragegraph nicht verletzen kann.

### Parser-Preloading und React-Übergabe

Die Node-Hälfte der Module injiziert das Startup-Protokoll in die ausgelieferte HTML in dieser Reihenfolge:

1. `window.__ModuleLoader__` im Queue-Modus installieren mit `pendingQueue`, `load()` und `create()`.
2. Preloading für jede content-addressierte Anwendungs-Combo-URL starten, die die Zeilen außer den Modulen enthält.
3. Jede blockierende Bootstrap-Combo-URL ausführen; diese enthalten derzeit die gewöhnliche Modul-Factory-Registrierung.
4. `window.__DSH_BOOT__` zuweisen, einschließlich aller Scheduling-Deskriptoren und der One-Resource-HMR-Combo-URL jeder Zeile.
5. Das Vite-Hauptmodul ausführen.

Die Bootstrap-Combo registriert derzeit nur die Modul-Factory. Der Startup-Kernel übergibt den rohen Graph und die Shell-Seeds an `__ModuleLoader__.create()`. Die Facade entfernt die Modul-Registrierung, materialisiert sie mit einer `require`-Funktion, die jedes External ablehnt, und ruft ihren `createClientModuleSystem`-Export auf. Das Modul-Bundle parst den Graph, konstruiert `ClientModuleSystem`, cached seine eigenen Exports als die Modul-Zeile, hält das System in einem Modul-Closure und schaltet dieselbe Facade in den Live-Modus. Die Modul-Client-Face hat folglich eine Zero-External-Bootstrap-Anforderung.

Nachdem die `immediately`-Stufe ihre Factories registriert hat, erstellt der Kernel alle Loader-Einträge, wartet Cordis-Quiescence ab und verlangt, dass jeder Fiber ACTIVE ist. Dann ruft er `ctx.uiRenderer.mount(container)` auf. Das dynamische `ui-renderer`-Paket besitzt React, Slot-Rendering, Hydration des vorhandenen Boot-DOM und den React-Root-Lebenszyklus; der Startup-Kernel und die Fehlerseite bleiben React-frei.

### Dependency-Deklarationen

Jedes Client-Paket hält Cordis in passenden `peerDependencies` und `devDependencies`; Cordis ist sein einziger Peer. Browser-Imports, Typ-Referenzen, Modul-Augmentierungen und `dsh.client.inject` sind Entwicklungs-Inputs, weil der Client-Build und das ausgelieferte Profil ihre Runtime-Identitäten liefern. Ein Paket, das auch einen Host-Eintrag veröffentlicht, hält die Runtime-Werte-Imports dieses Eintrags in `dependencies`. [Published dependency faces](../process/2026-08-26-published-dependency-faces.de.md) besitzt Paket-Discovery, Ausnahmen und das explizite Host-Roster.

Gewöhnliche installierte Bibliotheken bleiben `dependencies`: Ein dynamischer Build darf eine private Implementierung bundlen, während eine `staticLinked`-Bibliothek ihren Bare Import für den finalen Host behält. Jede Build Face entscheidet Externalität unabhängig von npm-Abschnitten. Veröffentlichte Dateilisten decken jeden Runtime-Eintrag, jedes relative Asset und jede vom Artifact erreichte Deklarationsdatei ab.

`verify-package-dependencies` erzwingt und repariert Dependency-Abschnitte. `verify-client-packages` erzwingt Build-Formen, Parser-Preload-Abgleich, Shared-Module-Anfragen und Modulgraph-Azyklizität. Der Repository-publint-Lauf erzwingt Publikations-Closure.

## Alternatives considered

**Jedes Client-Paket sofort in ein dynamisches Plugin umwandeln.** `ui-primitives` und `ui-slots` stellen weiterhin synchrone Werte ohne unabhängige Service- oder Slot-Lebenszyklen bereit; eine Manifest-Deklaration allein würde diese Imports nicht entfernen.

**Ein separates `client-static.js` für Module generieren.** Das Paket bleibt eine dynamische Graph-Zeile und ein Cordis-Plugin; nur seine Factory-Ankunft ist früh. Ein zweites Artifact würde Host-Policy in einem Dateinamen kodieren und zwei Runtime-Produkte aus einer Quelle erzeugen.

**Alle geteilten Module in den Vite-Einstieg kompilieren.** Dies würde Deployment-Komposition und Ersetzung auf Plugin-Ebene aus Geschäfts-Plugins entfernen, einschließlich Renderer und Theme.

**Eine allgemeine Module-Provider-Deklaration behalten.** Paketzeilen und exakte statische Schlüssel benennen bereits alle Lieferanten; Aliases würden ein weiteres Ownership-Protokoll ohne dritte Lieferquelle hinzufügen.

**Preload-URLs in `apps/web/index.html` hartkodieren.** URLs und `rev`-Werte gehören zum aktuellen Graph des Hosts. Das Umschreiben der ausgelieferten HTML hält Queue, Bundle-URLs und Manifest auf einer Graph-Revision.

## Konsequenzen

Bundle-Inhalte bleiben stabil, wenn eine interne DSH-Beziehung nur für die Entwicklung ist, weil jede Build Face Externalität direkt deklariert. Statische Bibliotheken bleiben host-assembliert, während dynamische Pakete einheitliche Artifacts und Lebenszyklus-Governance behalten. Das ausgelieferte Profil besitzt das vollständige Client-Paket-Roster, sodass einzelne Client-Pakete npm nicht bitten, denselben Graphen noch einmal über Peer-Platzierung zu lösen.

Das Startup-Protokoll hängt von der Paket-ID der Module ab, und Module müssen zur Laufzeit self-contained bleiben. Die Combo-Generierung erhält ihr gewöhnliches Paket-Artifact und gibt jeder anderen Zeile einen geteilten initialen Transport; HMR verwendet dieselbe Route mit dieser Zeile als einziger Ressource. Eine fehlende Bootstrap-Registrierung schlägt fehl, bevor Cordis startet; spätere Plugin-Import-, Apply- und Service-Wait-Fehler bleiben über den ACTIVE-Scan der Boot-Seite sichtbar.

Die Shell konsumiert gebaute `lib/`-Produkte, sodass Quelle und Browser-Artifacts driften können, bis der relevante Build oder Watcher läuft. Typechecking der Quelle allein beweist nicht, dass die ausgelieferte Anwendung denselben Code verwendet.

Die beiden statischen UI-Bibliotheken bleiben bewusste Ausnahmen. Die Umwandlung einer der beiden in ein dynamisches Paket erfordert, alle Werteverbraucher auf Services oder Slots umzustellen und ihre Identität im selben Change aus dem statischen Seed zu entfernen.
