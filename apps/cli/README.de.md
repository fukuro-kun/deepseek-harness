# `@deepseek-ai/dsh`
[English](README.md) | [中文](README.zh.md) | Deutsch


Der Befehl `dsh` ist der einzige unterstützte Launcher für Node-Anwendungen: Profile sind geordnete Stapel aus Patch-Ebenen von Plugin-Bundles unterhalb der eigenen Overrides des Benutzers. SDK und ACP sind Profile, keine separaten öffentlichen Bins. Das Python-Runtime-Wheel paketiert denselben Befehl; das SDK verwendet standardmäßig `sdk`, das Minimalbeispiel wählt `sdk-minimal`. [`src/args.ts`](src/args.ts) definiert die Befehlsgrammatik, und [`src/bin.ts`](src/bin.ts) lädt nur den ausgewählten Runner. Ungültige Befehle, Optionen aus einem anderen Modus, Konfigurationsfehler und Boot-Fehler enden mit einem Exit-Code ungleich null.

## Einstiegsmodi

| Befehl | Zweck |
|---|---|
| `dsh --profile <name>` | Das benannte Profil unter `$DSH_HOME/profiles/<name>` starten. |
| `dsh --profile <name> --from-default-profile <template>` | Ein neues benutzerdefiniertes Profil aus einer mitgelieferten Vorlage erstellen und dann starten. |
| `dsh --profile acp` | Automation-Clients über ACP-stdio bedienen, bis die Verbindung getrennt wird. |
| `dsh --profile headless "job"` | Eine frische persistierte Session ausführen, die finale Antwort ausgeben und beenden. |
| `dsh --profile sdk` | SDK-Clients über JSON-RPC-stdio bedienen, bis Shutdown oder Verbindungstrennung. |
| `dsh --profile sdk-minimal` | SDK-Clients mit dem eigenständigen minimalen Agent-Baum bedienen. |
| `dsh web` | Alias für `--profile web`. |
| `dsh plugin --profile <name> <pnpm args>` | Die Plugins eines Profils verwalten, indem im Profilverzeichnis an pnpm weitergeleitet wird. |

Das aufrufende Verzeichnis ist der standardmäßige Workspace-Root. Die Profile `web`, `headless`, `sdk`, `sdk-minimal` und `acp` initialisieren sich bei der ersten Verwendung automatisch aus mitgelieferten Vorlagen. Ein weiteres Profil lässt sich unter einem unbenutzten, nicht mitgelieferten Namen mit `--from-default-profile` erstellen oder über `dsh plugin` als base-gestütztes Profil initialisieren. Der Name `desktop` ist für das Electron-eigene Profil reserviert, daher lehnt die CLI Boot-, Config-Dump- und Plugin-Management-Anfragen dafür ab.

## App-Argumente

Der Launcher parst nur seine eigenen Flags und reicht alles danach an das gebootete Profil weiter, wo jedes injizierte App-Plugin den gemeinsamen immutable Snapshot parsen darf ([`dsh-cmdline`](../../packages/boot/cmdline/README.de.md)). Das erste Token, das der Launcher nicht erkennt, beginnt die Argumente der App:

```sh
dsh --profile web --port 8080       # --port belongs to the web app
dsh --profile tui --resume <id>     # example, assuming the tui profile is installed; --resume belongs to the terminal app
dsh --profile headless "run the tests"
dsh --profile web --help            # the web app's flags, not the launcher's
dsh --help                          # the launcher's own help
```

<a id="profiles"></a>
## Profile

Ein Profilverzeichnis enthält eine `package.json` (Plugin-Abhängigkeiten von außerhalb des Trees plus das Profil-Manifest `dsh.profile` mit seiner geordneten `bundles`-Liste und dem `patchReload`-Lebenszyklus) und eine `cordis.patch.yml` (die eigene Patch-Ebene des Benutzers). `patchReload: live` überwacht die Patch-Dateien auf Profil- und Home-Ebene; `startup` wendet sie einmal an.

Der Baum wird über einer leeren Wurzel komponiert:
- jeder Bundle-Patch in der Reihenfolge von `dsh.profile.bundles`
- dann die `cordis.patch.yml` des Profils, dann die Home-Ebene `$DSH_HOME/cordis.patch.yml`
- dann `--patch`-Overlays

In `dsh.profile.bundles` benannte Bundles werden zuerst aus der dsh-Installation aufgelöst (`@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, `@deepseek-ai/dsh-headless`, `@deepseek-ai/dsh-sdk-app`, `@deepseek-ai/dsh-sdk-minimal`, `@deepseek-ai/dsh-acp-app`), dann aus dem eigenen `node_modules` des Profils, in das pnpm Plugins von außerhalb des Trees installiert.

Mit `--dump-default-config` und `--dump-config` lässt sich der komponierte Baum ohne Boot prüfen.

Die [CLI-Verhaltensreferenz](reference/README.de.md) definiert die genaue Ebenenpriorität, Flags, das Shutdown-Verhalten, Deployment-Defaults und die Ausführung aus dem Quellbaum.

## Optionale Overlays

`config/examples/` liefert opt-in Overlays für GitHub-Review-Webhooks, Session-lokale Schedule, Memory-MCP-Server und Cordis-Tools zur Laufzeit. Sie sind nie Teil eines Standardprofils; die [User-Guides](../../docs/user/guide/index.de.md) und die [Developer-Practice-Guides](../../docs/user/develop/practice/index.de.md) enthalten Setup- und Sicherheitshinweise.

## Entwicklung

Produktionsläufe benötigen gebaute Paket- und Frontend-Artefakte. Führen Sie im Repository-Root separat `pnpm run build` aus und verwenden Sie dann `pnpm dsh <args...>`, um den TypeScript-Einstieg auszuführen und jedes Argument weiterzureichen; die [Source-Execution-Referenz](reference/README.de.md#source-execution) definiert die Modulauflösungsregeln.
