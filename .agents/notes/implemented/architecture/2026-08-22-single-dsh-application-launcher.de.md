# Agent Note: Ein dsh-Launcher für Anwendungsprofile
[English](2026-08-22-single-dsh-application-launcher.md) | [中文](2026-08-22-single-dsh-application-launcher.zh.md) | Deutsch

Status: implemented


## Problem

DeepSeek-Harness-Anwendungsprozesse benötigen einen Eigentümer für Komposition, Plugin-Auflösung, Umgebungserkennung, Shutdown und Benutzeranpassung. Ein dediziertes App-bin mit einer vollständigen `cordis.yml` erzeugt einen zweiten Lifecycle neben dem Profil-Launch: In ein Profil installierte Plugins erreichen es nicht, das Verhalten driftet von `dsh-base` ab, und SDK-Aufrufer lernen beliebige Prozess-argv statt des Kompositionsmodells des Produkts.

Das Python-SDK vertreibt eine native ausführbare Datei über vier Plattform-wheels. Sein gepackter Prozess verwendet denselben Profil-Launcher und bewahrt dabei den geschlossenen VFS-Abhängigkeitsbaum, native Sidecars und die Installed-wheel-Nachweise.

## Entscheidung

### Launch-Umfang

Jede unterstützte Node-Anwendung startet über die `dsh`-CLI und ein benanntes Profil. Die ausgelieferten Anwendungsbefehle sind `dsh web`, `dsh --profile headless`, `dsh --profile sdk`, `dsh --profile sdk-minimal` und `dsh --profile acp`; `dsh web` ist der bewusste Komfort-Alias für `--profile web`, kein weiterer Anwendungseinstieg.

Vendor-CLIs, Build-only- und Test-only-Executables, direktes In-Process-Plugin-Mounten und die private Browser-WebWorker-Vorschau liegen außerhalb des Anwendungs-Launch-Inventars. Ein Paket-App-bin oder ein Root-Demo, das einen Paketeinstieg startet, ist kein akzeptierter Erweiterungspunkt.

### Profilanwendungen

`@deepseek-ai/dsh-sdk-app` und `@deepseek-ai/dsh-acp-app` komponieren die vollständigen Protokollanwendungen über `@deepseek-ai/dsh-base`. Das SDK-Bundle fügt den JSON-RPC-Server plus App-eigene Hilfe und stdio-Lebensdauer hinzu; das ACP-Bundle fügt den automation-only-ACP-Server plus dieselben Anwendungsverantwortlichkeiten hinzu. Beide übernehmen das Basismodell, die Tools, Persistenz, Einstellungen, Credentials, Policy und das Umgebungsverhalten. Das [eigenständige sdk-minimal-Profil](../../archived/architecture/2026-08-24-standalone-sdk-minimal-profile.md) nutzt SDK-Startup und JSON-RPC-Serving wieder, besitzt aber bewusst einen vollständigen expliziten Baum ohne `dsh-base`.

Profil-manifeste besitzen das Patch-Reload:

| Profil | `patchReload` |
|---|---|
| `web` | `live` |
| `headless` | `startup` |
| `sdk` | `startup` |
| `sdk-minimal` | `startup` |
| `acp` | `startup` |

Benutzerdefinierte Profile verwenden standardmäßig `live`. Ein Startup-Profil wendet weiterhin seine Bundle-, Profil-, Home-Level- und Aufruf-`--patch`-Layer an, beobachtet sie aber nach dem Boot nicht mehr. `dsh-base` fügt die Modul-HMR-Zeile deaktiviert ein; ein Profil mit einem getesteten Source-Modul-Reload-Lifecycle muss sie explizit aktivieren. Keines der ausgelieferten Profile aktiviert Server-Modul-HMR: `patchReload: live` verwendet den reinen Config-Watcher des Launchers, während die Startup-Profile keinen Watcher installieren. SDK und ACP können ihren Server, ihre agents, Persistenz oder Tool-registry innerhalb einer eigenen stdio-Verbindung nicht sicher ersetzen.

Die ausgelieferten Protokollprofile reservieren stdout für Protokoll-Frames, stellen Hilfe bereit, ohne den Transport zu starten, und leiten stdin-EOF und Signale durch eine begrenzte Root-Disposal. ACP bleibt automation-only. Die SDK-JSON-RPC-Methoden, Notification-Felder und `initialize.serverInfo.name` bleiben stabil. Die modellsichtbaren Tool- und Persistenz-Defaults der Vollprofile stammen von `dsh-base`, einschließlich seiner [Standard-Editor-Auswahl](../simplification/2026-09-05-base-default-file-editor.de.md); `sdk-minimal` besitzt seine expliziten Defaults. Ausführbare Snapshots besitzen die assemblierten Anwendungsausgaben.

### TypeScript-SDK-Anpassung

`@deepseek-ai/dsh-sdk-client` hängt vom `@deepseek-ai/dsh`-Paket derselben Version ab, löst sein installiertes CLI-Modul auf, führt es über die aktuelle Node-Executable aus und wählt standardmäßig `sdk`. Beide Client-Layer stellen `dshBin`, `profile`, geordnete `patches`, `dshHome`, Prozess-cwd, Umgebung und Timeouts bereit; beliebiger Befehls-/argv-Launch bleibt ein interner Fake-Runtime-adapter.

SDK-Benutzer passen Plugins über Profile an. `dsh plugin --profile <name> ...` verwaltet persistente Abhängigkeiten und die Bundle-Reihenfolge, das `cordis.patch.yml` des Profils besitzt persistente Zeilenänderungen, und Launch-`patches` liefern geordnete ephemere Overrides. Ein benutzerdefiniertes Profil muss `@deepseek-ai/dsh-sdk-app` oder eine andere SDK-Server-Zeile beibehalten. Relative CLI-Modul-, Patch-, explizite Home- und Prozess-cwd-Pfade werden vor dem spawn absolut gemacht, und die Initialisierung hat eine endliche Schranke, deren Diagnose das gewählte Profil benennt.

Die direkte SDK-Nutzung folgt der normalen Harness-Home-Auflösung: explizites `dshHome`, geerbtes `DSH_HOME`, dann `~/.dsh`. `subagent-dsh-sdk` erfordert dagegen ein explizites absolutes Home, sodass eine verschachtelte Laufzeit keine Profile, installierten Plugins, Credentials oder Sessions einer Person über das Betriebssystem-Home entdecken kann. DSH-spezifische ACP-Kindbeispiele übergeben ebenfalls ein isoliertes Home; das ACP-Backend selbst bleibt generisch für Nicht-DSH-agents.

### Python-Laufzeit

Das Python-Runtime-wheel stellt [`python/sdk-runtime/runtime-bootstrap.mjs`](../../../../python/sdk-runtime/runtime-bootstrap.mjs) als `dsh-python-runtime-closure`-Einstieg bereit. Sein gewöhnlicher Zweig ruft den öffentlichen CLI-Export auf; ein provider-privater Selektor dispatcht vor dem CLI-Parsing zum internen subprocess-runner und ist kein Anwendungseinstiegspunkt. Die [Native-Containment-Entscheidung](2026-08-28-subprocess-native-containment.de.md) besitzt diesen privaten Dispatch. Der Python-Client wählt standardmäßig `dsh --profile sdk`, geordnete Patch-Dateien und ein explizites Harness-Home; das ausführbare Beispiel unter `python/sdk/examples` wählt `sdk-minimal`. Der installierte `dsh`-Konsolenbefehl stellt dieselbe Profilgrammatik und die separat gepackte `web`-Anwendung bereit.

Die Executable-Familie ist `deepseek-harness-sdk-runtime-<platform>-<arch>`. Das SDK-Protokoll, wheel- und Import-Distributionsnamen, Sidecar-Namen und die Protokollidentität `deepseek-harness-sdk-runtime` bleiben stabil. Die SDK-Paketfamilie ist `@deepseek-ai/dsh-sdk-client`, `@deepseek-ai/dsh-sdk-protocol` und `@deepseek-ai/dsh-sdk-jsonrpc-server`; `@deepseek-ai/dsh-acp` bleibt das ACP-Protokoll-Plugin. Es gibt keine Python-spezifische Node-Anwendung, keine eingecheckte vollständige Konfiguration, kein Kompatibilitätspaket, keine Forwarding-Executable, keinen Fallback-Parser und keinen SDK/ACP-Launcher-Alias. [docs/architecture.md](../../../../docs/architecture.de.md) besitzt diesen Launch, und das [`python/sdk-runtime`-README](../../../../python/sdk-runtime/README.de.md) besitzt den Windows-Träger.

### Durchsetzung

`verify-application-entrypoints` durchsucht Anwendungs-/Paket-manifeste, Executable-Quellen und Root-Demo-Skripte. Die Allowlist klassifiziert das `dsh`-Produkt-bin, den vendor-ausgeschlossenen Bereich, das private WebWorker-Build-Tool und Test-Support. Ein nicht klassifiziertes Shebang, ein neues Paket-bin oder ein Demo-wrapper, das `apps/cli/src/bin.ts` umgeht, lässt die Hygiene und die primären/statischen CI-Aggregate fehlschlagen.

## Bestehende Entscheidungen und Ablösung

Diese Entscheidung ersetzt die Anwendungs-Launch- und Paketnamen-Fakten in [Profil-Plugin-Bundles](2026-08-05-profile-plugin-bundles.de.md), [TypeScript-SDK-Client und subagent-Backend](../../archived/feature/2026-07-27-typescript-sdk-and-sdk-subagent-backend.md), [SDK-Projekt-Toolchain entfernen](../../archived/simplification/2026-08-11-remove-sdk-project-toolchain.md) und [Single-File-Python-SDK-Runtime-Distribution](2026-07-10-single-file-executable-sdk-runtime-distribution.de.md). Diese Notes behalten unabhängige Autorität für Profil-Layering, Client-/Protokollsemantik, entfernte Projektwerkzeuge und native Paketierung.

Das [automation-only-ACP-Protokoll](../simplification/2026-07-23-acp-automation-only-protocol.de.md) bleibt maßgeblich für ACP-Protokoll- und Interaktionsumfang. Das [adding-a-package-Handbuch](../../../../docs/cookbook/adding-a-package.de.md) besitzt rollenbasierte Paketnamen. Das [eigenständige sdk-minimal-Profil](../../archived/architecture/2026-08-24-standalone-sdk-minimal-profile.md) ersetzt teilweise die base-first-Regel und die Complete-Tree-Alternative dieser Note und behält dabei deren Launcher-Ownership. Keine aktive Note ist vollständig abgelöst oder zur Archivierung geeignet.

## Erwogene Alternativen

**Direkte bins behalten und Profile als bevorzugt deklarieren.** Abgelehnt: Dokumentation kann Profile nicht zum Eigentümer von Plugin-Installation, Umgebungsladen, Shutdown und Tests machen, solange eine unterstützte Executable sie umgeht.

**Forwarding-Kompatibilitäts-bins behalten.** Abgelehnt: Eine Forwarding-Executable bleibt ein weiterer öffentlicher Launch-Name und ein Kompatibilitätsversprechen. Das Pre-Release-Repository kann Aufrufer direkt auf Profile umstellen.

**Aufrufergelieferte vollständige Cordis-Bäume hinter Profil-wrappern.** Abgelehnt: Das zentralisiert argv, ohne die Anwendungskomposition zu zentralisieren. Vollprofile verwenden `dsh-base` plus dünne App-Bundles, damit die gemeinsame Policy einen Eigentümer hat. Ein repository-eigenes, versioniertes Standalone-Bundle ist nur erlaubt, wenn eine explizite Liste das Produktverhalten ist, wie [sdk-minimal](../../archived/architecture/2026-08-24-standalone-sdk-minimal-profile.md) festhält.

**Inline-Plugins oder eine vollständige `cordis.yml` im TypeScript-Konstruktor akzeptieren.** Abgelehnt: Das SDK würde zu einem weiteren Paket-Installer und Anwendungskomponisten. Benannte Profile und Patch-Dateien bieten bereits persistente und pro-Launch-Anpassung über ein Auflösungsmodell.

**`dsh` nur über `PATH` auflösen.** Abgelehnt: Gewöhnliche Node-Prozesse erben nicht zuverlässig einen projektlokalen `.bin`-Pfad. Eine Paketabhängigkeit derselben Version liefert eine deterministische Laufzeit.

**Modul-HMR in `dsh-base` aktivieren und unsichere Profile es deaktivieren lassen.** Abgelehnt: Die gemeinsame Basis liegt auch benutzerdefinierten Profilen zugrunde, sodass ein aktivierter Default jede neue Anwendung daran erinnern müsste, sich vom Source-Modul-Ersatz abzumelden. Eine deaktivierte Basis macht Modul-HMR zu einer expliziten Profilfähigkeit und lässt `patchReload: live`-Config-Watching verfügbar.

**Protokollprofile hot-reloaden.** Abgelehnt: Der Ersatz eines Protokollservers oder seiner Abhängigkeiten kann ausstehende Frames und SDK-eigene agents invalidieren. Der Prozessneustart ist die Übernahmegrenze für SDK- und ACP-Konfigurationsänderungen.

**Die Python-Executable ohne separaten Paketierungsnachweis durch Profile führen.** Abgelehnt: Die native VFS-Closure, vier Plattform-wheels, Profil-Assets, ripgrep- und spawn-helper-Sidecars sowie das Clean-Install-Verhalten erfordern eigene Migrationsnachweise.

## Verifikation

- Source- und Built-CLI-Akzeptanz decken `sdk`-, `sdk-minimal`- und `acp`-Hilfe, Transportstart, stdout-Reinheit, EOF, Signale und Root-Disposal ab.
- Bundle-Konfigurationstests pinnen deaktiviertes Modul-HMR in `dsh-base` und dessen Abwesenheit in ausgelieferten Mode-Overrides; das e2e des benutzerdefinierten Live-Profils pinnt Config-Reload über den Watch-only-Fallback des Launchers.
- Fokussierte Unit-Suiten decken Profil-Launch-Auflösung, Initialisierungsschranken, SDK-Retries, Server-Bereitschaft und verschachtelte isolierte Homes mit 100 % Coverage auf den geänderten Laufzeitquellen ab.
- Schlüssellose ACP- und SDK-Snapshots booten reale `dsh`-Profile und pinnen Protokollausgaben plus persistierte Logs; die verschachtelte SDK-Komposition bootet eine zweite reale Profillaufzeit.
- Der Real-API-Workflow begrenzt den Datei-Parallelismus auf vier, weil eine Profil-e2e-Datei mehrere vollständige `dsh`-Subprozessbäume besitzen kann; Workflow-Tests pinnen diese Ressourcenschranke.
- Die Python-Suite übt exe- und node-Träger; Packaged-Runtime-Szenarien, native macOS-Executable-Konstruktion, beide wheels und Clean-wheel-Default/MCP-Smokes pinnen die `deepseek-harness-sdk-runtime-*`-Artefakte und den Profil-Launch.
- `verify-application-entrypoints` enthält ungültige fixtures für Paket-bins, Executable-Quellen, paketstartende Demo-wrapper und nicht klassifizierte Demos.

## Konsequenzen

- Ein Benutzer ändert die Plugin-Komposition einer SDK-Anwendung über ein benanntes Profil und geordnete Patches, unter demselben Installations- und Auflösungsmodell wie jede andere dsh-Anwendung.
- Ein benutzerdefiniertes Profil erhält Live-Config-Watching ohne Server-Modul-HMR und aktiviert Source-Modul-Ersatz nur durch ein explizites Zeilen-Override.
- Die vollständigen SDK- und ACP-Profile teilen die vollständige Basisanwendung und einen Satz von Policy und Tools; `sdk-minimal` besitzt seine explizite eigenständige Liste, und Snapshots zeigen beabsichtigte assemblierte Unterschiede.
- Das Hinzufügen von `@deepseek-ai/dsh` erhöht die Installationsgröße des TypeScript-Clients im Austausch für eine deterministische Laufzeit derselben Version.
- Vertrauenswürdige Benutzer-Patches können ein Plugin hinzufügen, das auf stdout schreibt und ihren eigenen Protokollstream korrumpiert; ausgelieferte Profile garantieren Reinheit, nicht beliebige Drittanbieter-Komposition.
- Python packt den gewöhnlichen `dsh`-Profil-Launcher und behält dabei eine geschlossene native Laufzeit und keine System-Node-Anforderung für wheel-Benutzer.
