---
description: "Browser-Worker-Harness-Hosting für Maintainer, die die experimentelle Web-Preview-Runtime bauen oder debuggen."
kind: "package-library"
---

# `@deepseek-ai/dsh-experimental-webworker-runtime`
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Der Browser-Worker-Host: Der gesamte Harness-Plugin-Baum läuft in einem dedizierten Web Worker, für Preview-Deployments und Packaging-Regressionen ([experimentelle Gruppe](../README.de.md)). Der Worker entpackt ein gepacktes VFS-Image während des Downloads und mountet es im Speicher, lädt seine Module über einen CommonJS-Wrapper-Loader und bedient die Seite über einen postMessage-Tunnel, der schlichtes HTTP spricht. Verwende ihn, wenn eine Preview das paketierte Harness ohne Node-Host laufen lassen muss.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Hinweis für Entwickler](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Drei Artefakte aus einer tsdown-Pipeline:

- **`lib/index.js` (Assembly-Bibliothek)** — `createWorkerHost`/`startWorkerHost` mounten das Basis-Image und beliebige geordnete Daten-Overlays (`storage/`), installieren den Modul-Loader (`module-system/`) und den `process`-Shim, booten den Baum über das image-eigene `dsh-app-boot` und übergeben dem Tunnel seine Serving-Seams. Overlays dürfen nur Dateien unter `home/` und `workspace/` ersetzen; sie können weder Basis-Manifest, Konfiguration noch Module ersetzen. Der Image-Layout-Vertrag (`image-layout.ts`: virtuelle Root, Config-/Manifest-Pfade, leere Verzeichnisse, das `lowered`-Wrapper-Contract-Gate) wird mit dem Packer geteilt. Boot-Patches erzwingen die deployment-förmigen Zeilen: Frontend-Serving aus, JSONL-Session-Logs auf dem Klartextpfad, Preset-Roots auf das `config/agent-presets` des Images.
- **`lib/worker.js` (Worker-Bundle)** — die Assembly plus die Node-Kompatibilitätsschicht dieses Pakets als ein eigenständiges ES-Modul. Die Modul-Proxy-Tabelle (`module-proxies.ts`) ist die einzige Plattform-Abzweigung: `node:*`-Builtins über VFS-/Tunnel-/Browser-Primitive, strukturelle Stubs, die auf der Konsole laut für das scheitern, was ein Browser nicht kann, und native/binäre Paket-Ersatzteile. `node:module` liefert `createRequire().resolve` und `.resolve.paths()` über der Image-Package-Root, sodass unveränderte Pakete Manifeste finden können, ohne deren Module auszuwerten. Der globale `process`-Shim trägt Node-Erkennungsfelder einschließlich `title` und verhindert, dass die Worker-Ausführung in DOM-only-Zweige läuft. Der Pack-Time-Parser meldet statisch benannte Modul-Requests an den Reachability-Walk des Packers, einschließlich direkter Modul-Scope-Aufrufe der Form `createRequire(import.meta.url)('pkg')` über einen benannten `node:module`- oder `module`-Import. Gespeicherte, über CommonJS bezogene und rebased `createRequire`-Aufrufe benötigen Image-Entry-Seeds. VFS-Mutationen treiben `node:fs`-Callback-, Polling- und Promise-Watcher; offene Deskriptoren behalten Datei-Identität und Zugriffsmodus über Rename, Ersetzen und Unlink hinweg, `FileHandle.stat({ bigint: true })` meldet dieselbe Device- und Inode-Identität wie ein Path-Stat, solange der Name noch auf diese Datei verweist, und `FileHandle.chmod()` aktualisiert die geöffnete Datei-Identität; `readable-stream` liefert die Stream-State-Machine, die File-Streams und unveränderte Image-Pakete wie Chokidar und readdirp nutzen. AsyncLocalStorage trägt Sync-Stack-Kausalität über `await` hinweg durch die Snapshot-/Restore-Faces, die das Pack-Time-Lowering injiziert. Der Worker hält keinen Compiler: Ein Image, das der Packer nicht gelowered hat, wird beim Mount abgelehnt.
- **`src/shell/` (die eigene Prozessschicht des Workers)** — ein Browser-Worker kann nicht forken, also ist `node:child_process` kein Stub, sondern eine Implementierung: `spawn` startet das Kommando in seinem eigenen Web Worker — diesem selben Bundle, das sein erster Frame anweist, ein Shell-Prozess zu sein — und meldet es über die `ChildProcess`-Oberfläche, die der Subprocess-Service konsumiert. Das Kommando läuft abseits des Host-Threads, `SIGKILL` terminiert es, was immer es gerade tut, und es erreicht das VFS nur per Message (der Host bedient diese Frames). Worker-Plattform-Executables bewahren Native-Package-Protokolle wie Landlock, ohne ihre JavaScript-Pakete zu ersetzen oder ihre Implementierungen an `node:child_process` zu koppeln; gewöhnliche Kommandos nutzen den Evaluator und die Coreutils-Kommandotabelle des Pakets. Die Grammatik ist `@yarnpkg/parsers`' `parseShell`, während `execSync`/`fork` weiterhin ablehnen, weil sie einen echten Prozess brauchen.
- **`lib/client.js` (Seiten-Hälfte)** — der Start hat zwei unabhängige Stufen. `chooseWorkerHostSource({ image?, fixtureManifest? })` besitzt optional die Boot-Barriere und das Fixture-Manifest: ohne `preview-fixture` wartet es am Source-Chooser, während eine gültige Query direkt wählt; beide Pfade geben geordnete Overlays zurück. `connectWorkerHost(worker, { image?, overlays? })` bleibt der öffentliche Base-Runtime-Connector; Aufrufer, die den Chooser überspringen, erhalten eine leere Overlay-Liste. `apps/web` ruft beide auf und liefert seinen statisch gebündelten Worker. Der eröffnende `init`-Frame trägt die Basis- und geordneten Overlay-URLs, der Boot-Payload liefert die strukturierte Index-Injection-Tabelle, und `applyIndexInjections` führt sie aus, bevor der Shell-Eintrag läuft. Script-Preload-Zeilen sind hinweisend und werden übersprungen, weil `/plugins`-Ressourcen nur über den Tunnel aufgelöst werden; `loadBundle` fetcht jedes Combo bei erstem Bedarf, bettet seine Tunnel-only-Source-Map als Base64-Data-URL ein und führt das Skript als Blob aus. Der Tunnel exponiert zusätzlich fetch-förmigen Transport, den unabhängigen File-Upload-Carrier und den API-Client. Request-Frames bewahren Blob-Bodies durch Structured Clone und transferieren `ReadableStream<Uint8Array>`-Ownership. Der Host-Worker streamt beide Formen in die Route, sodass kein Browser-Thread ein vollständiges Byte-Array für einen Generic-File-Upload erzeugt.

Die Abnahme liegt in `apps/web/tests/preview-boot.e2e.ts`, das die echten gebauten Seiten ausliefert und den Pre-Boot-Chooser plus die Worker-Aktivierung in headless Chromium treibt. Die leere Auswahl übt den Erststart. Das `vfs-example`-Overlay liefert gewöhnliche Workspace-Dateien und Klartext-Persistenz-Artefakte für kalte Workspace-/Session-Discovery, Tool-Präsentation, Subagent-Navigation und History-Paging ohne Model-Request. Der Fixture-Generator besitzt Current-Generation-Logs und den Projektions-Cache; committete Vorgänger-Logs bleiben daneben byte-identisch. Der Chooser reserviert WebFS als separate nutzerautorisierte Quelle; dieser Provider liest das eingebaute Fixture nicht.

Der [Built-Bundle-Import-Sweep](tests/compile/transform-corpus-check.ts) prüft bare Node-Imports nach dem Bibliotheks-Build. Seine Dockkit-Ausnahme akzeptiert nur Nodes Unknown-Extension-Fehler für das erwartete Stylesheet; andere Fehlschläge und unerwartet erfolgreiche exempte Imports bleiben Fehler. Siehe die [CI-Beobachtungsentscheidung](../../../.agents/notes/implemented/testing/2026-09-08-ci-completion-observations.de.md).

-----

<a id="model-experience"></a>
## Model Experience

Keine, da dieses Paket den Baum nur in einem Browser-Worker hostet und seine `node:*`-Calls beantwortet; jede modellseitige Registrierung gehört den Plugins, die es bootet.

#### KV-Cache-Effekt

Keiner; dieses Paket stellt weder einen Provider-Request zusammen noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Die Worker-Composition schreibt Klartext-Session-Logs** (`compression: 'none'`-Boot-Patch): Sie trägt keinen Zstandard-Codec, daher sind exportierte Logs `.jsonl`, niemals `.jsonl.zstd`.
- **`node:dns/promises`, `node:vm`, `node:net`, `node:sqlite`, `node:worker_threads` sind strukturelle Stubs**: Jeder Call meldet seine Ablehnung auf der Konsole und wirft. Zeilen, die natives DNS, einen echten Prozess oder Realm-Isolation brauchen, können hier nicht laufen.
- **Filesystem-Watcher beobachten nur das gemountete VFS**: Image-Seeding ist still, und das VFS hat weder Symlinks noch externe Writer. `persistent`, `ref()` und `unref()` bewahren die Node-API, können aber die Lebensdauer eines dedizierten Workers nicht steuern, weil Browser keinen ref-gezählten Event-Loop exponieren.
- **Worker-Confinement ist eine VFS-Grenze, kein Kernel-Landlock**: `read-only` und `workspace-write` führen das unveränderte `@deepseek-ai/node-addon-system/landlock-run`-JavaScript und dessen Launcher-argv aus, aber die Prozessschicht implementiert das logische `landlock-run`-Executable und setzt seine Grants bei jedem Shell-Filesystem-Request durch. `full` deckt daher nur die Worker-Kommandotabelle und das gemountete VFS ab; es beansprucht weder beliebige Native-Process-Ausführung noch Linux-Kernel-Isolation.
- **Das Worker-Bundle pinnt einen Pfad innerhalb von `@yarnpkg/parsers`** — der Build löst das paket-eigene `lib/shell.js` statt der Package-Root auf, deren Barrel auch den Syml-Parser re-exportiert und so js-yaml in ein Bundle zieht, das dieses Format nie parst (rund 175 kB plus dessen Modul-Body beim Worker-Start). Der Pfad wird aus dem Paket-Manifest abgeleitet, sodass ein Layout-Wechsel den Build scheitern lässt statt das Barrel wieder einzuführen; ein Upgrade der Dependency erfordert eine Prüfung, ob der Shell-Parser noch dort lebt.
- **Die Shell ist kein Bash**: keine Loops, Funktionen, `case`, Job-Control oder Process Substitution — die Grammatik endet bei Pipelines, `&&`/`||`, Subshells, Gruppen, Redirections und Expansion. `&` lässt sein Kommando vor Ort zu Ende laufen, `sed` akzeptiert nur Substitutions-Skripte, Patterns sind JavaScript-Regex, und die Kommandotabelle enthält nur Coreutils (kein `git`, keine Netzwerk-Tools).
- **Ein Shell-Prozess hat kein synchrones Dateisystem**: Er liest und schreibt das VFS des Hosts per Message, weil Blockieren auf eine Antwort `SharedArrayBuffer` bräuchte, was eine Cross-Origin-Isolation erfordert, die GitHub Pages nicht gewähren kann. Verzeichnis-wandernde Kommandos kosten daher einen Roundtrip pro Eintrag, und zwei konkurrierende Kommandos können ihre Writes verzahnen.
- **Transport-, Worker-Host- und Seiten-Hälften-Coverage brauchen ein Browser-gleiches Harness** — das Per-File-Coverage-Gate ist für diese Module unerfüllt; Unit-Specs decken Storage, ALS, den Transform und die Stub-Verträge ab.


<a id="dev-note"></a>
### Hinweis für Entwickler

<details>
<summary>Arbeitskontext für Maintainer — zum Ausklappen klicken</summary>

Keiner.

</details>

**Laufzeitinvariante:** Es wird kein Companion publiziert. Dieses Paket ist Pre-Cordis-Plattform-Glue — der Baum, den es bootet, führt die eigenen Invarianten der Produkt-Pakete aus, und die Verträge der Assembly (Image-Contract-Gate, Tunnel-Refusals) scheitern laut beim Boot statt zur Laufzeit zu driften.
