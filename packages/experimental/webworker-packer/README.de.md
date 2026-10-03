---
description: "Browser-Worker-VFS-Image-Packaging für Maintainer, die das experimentelle Preview-Deployment bauen oder debuggen."
kind: "package-library"
---

# `@deepseek-ai/dsh-experimental-webworker-packer`

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Der VFS-Image-Packer: wandelt ein komponiertes Profil in den gzip-komprimierten Basis-Tar um, den der Browser-Worker als sein Dateisystem mountet, und opake Datenbäume in geordnete Overlay-Tars ([experimentelle Gruppe](../README.de.md)). Nichts wird aus Source kompiliert — das Basis-Image trägt die echten Build-Produkte des Repos, sodass ein Preview-Deployment exakt das debuggt, was das ausgelieferte Deployment shippt. Lies diese Seite beim Packen eines Preview-Images oder beim Diagnostizieren seines Inhalts.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Hinweis für Entwickler](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Der Typ [`DshConfigTreeDeclaration`](../../util/package-manifest/README.de.md) beschreibt jeden `dsh.configTrees`-Eintrag; dieser Packer validiert ihn und löst sein Quellverzeichnis auf.

Das Packen ist ein dreischichtiger Standard-Stack:

1. **Roster** — die Plugin-Zeilen des komponierten Profils (Standard-YAML-Parse unter Includes Dialekt, `!!js` intakt), plus die Zeilen jedes Config-Trees, den die CLI in ihrem `package.json`-`dsh.configTrees` deklariert (Agent-Presets), materialisiert als Node-artige Dependency-Closure. Externe Peer-Edges binden den Worker nie; Workspace-Peers bleiben auf der Kette.
2. **Publish-View** — jedes Workspace- oder vendored Paket steuert seinen gebauten npm-Slice bei (`files` über picomatch), ohne Source oder Workspace-`dist/`. Externe Pakete behalten publiziertes JavaScript sowohl unter `src/` als auch `dist/`, weil ihr `main` oder `exports` dorthin zeigen kann; nur generische Test-, Map-, Declaration- und Archiv-Ausschlüsse greifen.
3. **Reachability-Sweep** — die eigene Resolution des Runtime-Loaders läuft von jeder Workspace-Export-Face plus den Seeds der Worker-Assembly (`IMAGE_ENTRY_SEEDS`) aus und loweret jedes erreichte Modul zum Pack-Zeitpunkt auf den Wrapper-Vertrag. Der Transform meldet statisch benannte Imports, Re-Exports und dynamische Imports; Calls über `require`; sowie direkte Modul-Scope-Calls der Form `createRequire(import.meta.url)('pkg')` über einen benannten Import aus `node:module` oder `module`, einschließlich eines Import-Alias. Page-Assets (`lib/client.js` hinter `./client`-Exports) shippen wörtlich; ein unauflösbarer Request aus eigenem Code lässt den Pack scheitern, Third-Party-Requests werden toleriert, um zur Require-Zeit laut zu scheitern.

`repository.ts` besitzt die repo-förmigen Inputs (Workspace-Scan von `vendor/`, `packages/`, `native/system/packages/` und `apps/`; Profil-Composition über den echten CLI-Dump-Pfad); `pack.ts` besitzt nichts davon, sodass dieselbe Bibliothek durch andersartigen Aufruf einen anderen Baum packt. Der Native-Scan macht das Landlock-Entry-Paket zu einer gewöhnlichen Publish-View-Dependency, während sein Executable eine Worker-Plattform-Implementierung bleibt. Die CLI ist `dsh-pack-vfs-image --out <file> [--profile web]`; `apps/web`s `build:preview` führt sie nach dem Preview-Shell-Build aus.

Der Repository-Adapter deklariert außerdem die Preview-only-Fixture-Trees unter `webworker-runtime/tests/fixtures/`. Die CLI packt jedes benannte Fixture in ein separates deterministisches Overlay-Archiv plus ein browserlesbares Manifest. Overlay-Dateien umgehen die Ausschlüsse von npm-Publish-View und Modul-Reachability, sodass Dot-Verzeichnisse und Beispiel-Quelldateien intakt bleiben; ihre Mounts sind auf `home/` und `workspace/` begrenzt. `pack.ts` behandelt sie als opake Bytes, und die Session- und Workspace-Interpretation bleibt in den Runtime-Paketen, die diese Formate besitzen.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da dieses Paket zur Build-Zeit läuft und eine Image-Datei schreibt; nichts, was es erzeugt, erreicht für sich einen Model-Request.

#### KV-Cache-Effekt

Keiner; dieses Paket stellt weder einen Provider-Request zusammen noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Die Regeltabellen sind Ermessensentscheidungen** (`rules.ts`: Exclude-Globs, Page-Asset-Patterns, Entry-Seeds), gepinnt durch `tests/`; eine neue Asset-Klasse, die der Worker erreichen muss, braucht eine Tabellenzeile, keine Scanner-Änderung.
- **Reachability inferiert nur exakte Request-Formen** — berechnete `import`- und `require`-Argumente, gespeicherte `createRequire`-Ergebnisse, über CommonJS bezogenes `createRequire` und andere Bases als `import.meta.url` lösen erst zur Laufzeit und scheitern laut, wenn das Ziel sonst herausgeschnitten wurde; ein nur über diese Formen erreichbares Ziel braucht einen expliziten Image-Entry-Seed.
- **Vendored Paket-Sources (`src/*.ts`) sind ausgeschlossen** — nichts löst sie zur Laufzeit auf; ein künftiges In-Worker-Source-Inspection-Feature bräuchte eine dedizierte Include-Regel.
- **Der Packer setzt voraus, dass gebaute `lib/`-Artefakte aktuell sind**: Er kompiliert nie, also packt ein staler Workspace-Build stale Bytes. Führe zuerst den Repository-Build aus.


<a id="dev-note"></a>
### Hinweis für Entwickler

<details>
<summary>Arbeitskontext für Maintainer — zum Ausklappen klicken</summary>

Keiner.

</details>

**Laufzeitinvariante:** Es wird kein Companion publiziert. Dieses Paket ist ein Build-Zeit-Durchlauf ohne Produktions-Event-Stream oder mutable Daten; die eigenen Gates des Packs (unauflösbare eigene Requests, der Alles-oder-nichts-Wrapper-Vertrag) lassen stattdessen den Pack scheitern.
