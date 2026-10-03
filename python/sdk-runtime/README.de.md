# deepseek-harness-runtime-bin

[English](README.md) | [中文](README.zh.md) | Deutsch

Plattform-Runtime-Wheel für das DeepSeek Harness Python SDK. Es paketiert das normale `dsh`-CLI und seinen geschlossenen Node-Abhängigkeitsbaum zu einem nativen Executable, sodass die SDK-Nutzung kein systemseitiges Node.js erfordert. Dieses Paket veröffentlicht ausschließlich Wheels.

## Installierte Befehle und Artefakte

Das Wheel installiert den `dsh`-Konsolenbefehl und das Python-Modul `deepseek_harness_runtime`. `dsh` reicht seine Argumente an das gebündelte Executable weiter und erfordert ein nicht leeres `DSH_HOME`; es fällt niemals auf `~/.dsh` zurück.

Produktions-Executables heißen `deepseek-harness-sdk-runtime-<platform>-<arch>` unter dem `runtime/`-Verzeichnis des Moduls; Windows verwendet das Suffix `.exe`. Linux- und macOS-Wheels enthalten einen zielnativen `-rg`-Sidecar, Windows enthält `-rg.exe`, und macOS enthält zusätzlich `-spawn-helper` für `node-pty`. Veröffentlichte Ziele sind Linux x64, Linux arm64, macOS arm64, macOS x64 und Windows x64. Wheel-Tag und Payload müssen exakt übereinstimmen; es wird kein Windows-arm64-Wheel veröffentlicht.

Repository-Builds materialisieren außerdem einen dev-only `runtime/node/`-Carrier. Er führt `node runtime/node/node_modules/@deepseek-ai/dsh/lib/bin.js` auf System-Node 22.19 oder neuer aus. Er wird niemals automatisch ausgewählt und ist aus Wheels und sdists ausgeschlossen.

Beide Carrier führen dieselbe `dsh`-Grammatik und dieselben ausgelieferten Profile aus, einschließlich des eigenständigen `sdk-minimal`-Baums und des vollständigen `web`-Profils mit seinen Frontend-Assets. Das private `dsh-python-runtime-closure`-Manifest definiert den gepackten Abhängigkeits-Closure; es gibt weder eine Python-spezifische Node-Applikation noch eine eingecheckte Default-`cordis.yml`.

## Python-Modul-API

- `bundled_package_dir() -> Path` gibt die Wurzel der installierten Moduldaten zurück und verifiziert deren Release-Metadaten.
- `bundled_runtime_path() -> Path` gibt das Executable der aktuellen Plattform zurück und verifiziert erforderliche Sidecars.
- `resolve_bundled_launch_args(mode=None) -> tuple[str, ...]` gibt standardmäßig die Executable-argv zurück. Explizites `mode="node"` oder `DSH_RUNTIME_MODE=node` wählt den repo-only Node-Carrier.
- `main()` implementiert den installierten `dsh`-Konsolenbefehl und lehnt ein fehlendes oder leeres `DSH_HOME` ab. Unter Windows wartet es mit geerbten Standard-Streams auf den gebündelten Prozess und reicht dessen Exit-Status weiter; unter POSIX ersetzt es den Python-Prozess.

Nicht unterstützte Plattformen sowie fehlende Executables oder Sidecars werfen `FileNotFoundError` mit den Build- und Installationspfaden. Unbekannte Runtime-Modi werfen `ValueError`.

## Profilauflösung im Paket

`dsh` initialisiert ausgelieferte Profile unter dem expliziten Home, komponiert ihre Bundle-Patches und lädt gebündelte Plugins aus dem virtuellen Dateisystem des Executables. Da Betriebssystem-Symlinks dieses Dateisystem nicht betreten können, pflegen gepackte Starts kleine echte ESM-Proxy-Pakete unter `$DSH_HOME/profiles/node_modules`. Jeder Proxy spiegelt die expliziten Runtime-Exports, zeichnet die ursprüngliche Paketidentität auf und re-exportiert die virtuelle Modul-URL. Eingebaute Rows und externe Plugin-Peers teilen sich so eine Cordis-/Modul-Instanz. Native Shared Libraries und Windows-ConPTY-Addons werden mit den nativen Addons gepackt, während ripgrep und der macOS-PTY-Helper ausführbare Sidecars bleiben.

Die externe Profilverwaltung verwendet `dsh plugin --profile <name> ...`. Dieser Befehl erfordert `pnpm` auf `PATH`; die gewöhnliche SDK-/Profilausführung nicht.

## Build und Distribution

Vom Repository-Stamm aus verifiziert `pnpm exec tsx scripts/build-exe-for-python-sdk.ts` den Closure, baut Pakete, deployt einen symlink-freien Baum, paketiert das gewählte Ziel und synchronisiert Executable und Sidecars in dieses Modul. `scripts/build-python-release.py` stagt releaseförmige Wheels auf der Root-Repository-Version und pinnt `deepseek-harness-sdk` auf exakt dieselbe Runtime-Version.

Der Installed-Wheel-Smoke erzeugt eine saubere virtuelle Umgebung außerhalb des Checkouts, beweist die Herkunft von Distribution und Executable und prüft anschließend Default- und angepasste SDK-Profile, externe Plugins, MCP, native Tools, direktes JSON-RPC, eingecheckte Snapshots und auf vertrauenswürdigen Läufen den echten Provider. Siehe den [Python-Contributor-Workflow](../development.de.md) und die [Installed-Wheel-Testentscheidung](../../.agents/notes/implemented/testing/2026-08-23-installed-python-wheel-black-box-ci.de.md).
