# DeepSeek Harness Desktop

[English](README.md) | [中文](README.zh.md) | Deutsch

Die Desktop-Anwendung ist eine Electron-Shell um die dsh-Web-UI. Sie öffnet keinen Listening-Port: Ein gebündeltes Upstream-Node.js-Child bootet das installierte dsh-Projekt, versionierte Framed-Byte-Pipes tragen Fetch-Requests und Streaming-Responses ohne äußere Base64-Hülle, Node-IPC trägt die Lifecycle-Steuerung, und `dsh-app://` liefert die passenden Client-Assets.

## Zentrale technische Entscheidungen

| Entscheidung | Warum | Direkte Konsequenz |
|---|---|---|
| Release-Identität | Die Shell-API, der Web-Client, das Backend und der Plugin-Graph werden als eine Kombination qualifiziert; unabhängige Versionen würden ungetestete Kombinationen und mehrdeutige Update-Verfügbarkeit erzeugen. | Electron und `@deepseek-ai/dsh` haben immer exakt dieselbe Version. Ein dsh-Upgrade ist ein Desktop-Release, selbst wenn der Shell-Code unverändert ist. |
| Runtime | Node.js von Electron trägt Electron-Patches, Fuses, ABI und Lifecycle-Constraints, während System-Runtimes und Package-Manager-Zustand unkontrolliert sind. | dsh läuft unter dem gebündelten Upstream-Node.js, und jede Paketoperation verwendet das gebündelte pnpm. Node.js von Electron, System-Node.js, System-pnpm und die Package-Manager-Konfiguration des Benutzers liegen außerhalb des Ausführungspfads. |
| Paketquellen | Der exakte dsh-Quell-Build muss vor der npm-Veröffentlichung paketierbar und offline installierbar sein; Plugins müssen gewöhnliche benutzergewählte npm-Pakete bleiben. | Die signierte Anwendung trägt lokal gepackte First-party-dsh-Pakete und einen Offline-Seed-Store. Desktop-Plugins bleiben gewöhnliche npm-Dependencies, die aus der festen Desktop-Registry aufgelöst werden. |
| Seed-Transport | Die Apple-Notarisierung prüft Code in Archiven; jede pnpm-Store-Datei einzeln mitzuliefern würde das Signaturinventar der Anwendung außerdem um Zehntausende Cache-Einträge wachsen lassen, während ein einzelnes komprimiertes Archiv kleine Paketänderungen vergrößern würde. | Die macOS-Paketierung signiert jedes Mach-O-CAS-Objekt, schreibt seine pnpm-Hashes neu und beweist eine weitere Offline-Installation, bevor sie Store-Dateien auf 16 deterministische unkomprimierte tar-Shards verteilt. Das äußere Installationsprogramm komprimiert sie, und differenzielle Updates können unveränderte Shards wiederverwenden. |
| Zustandshoheit | Geteilte ausführbare Dependency-Graphen würden CLI und Desktop erlauben, gegenseitig ihre dsh-, Cordis-, Plugin- oder Native-Module-Versionen zu ändern, während zwei Desktop-Prozesse auf demselben Profil racen könnten. | Electron erwirbt seinen prozesslebensdauernden Single-Instance-Lock vor jedem Profilzugriff und besitzt exklusiv `$DSH_HOME/profiles/desktop` samt dessen Package-Manager-Zustand. CLI und Desktop teilen unterstützte Produktdaten unter `$DSH_HOME`, aber niemals ausführbare Pakete, Plugin-Aktivierung, Lockfiles oder `node_modules`. |
| Transport | Ein lauschender Web-Service bringt Port-Hoheit, Authentifizierung, CORS und Exposure-Bedenken mit; Electron und Upstream-Node.js benötigen außerdem ein explizites prozessübergreifendes Protokoll. | Die Anwendung öffnet keinen Web-Port. `dsh-app://` trägt Web-Assets und Fetch-Traffic; Framed-Byte-Pipes tragen begrenzte Request- und Response-Chunks mit Backpressure, während Node-IPC nur die Child-Lifecycle-Steuerung trägt. |
| Aktivierung | Dependency-Auflösung, Lifecycle-Skripte, Native-Module und Plugin-Start können fehlschlagen, und ein Prozess kann während eines Verzeichnisersatzes stoppen. | Release- und Plugin-Änderungen installieren in Staging, booten einen vollständigen Backend-Health-Check und ersetzen das aktive Profil erst nach Erfolg; ein Journal und ein Rollback-Profil decken unterbrochene Ersetzungen ab. |
| Updates | Unabhängige Shell- und dsh-Updates würden Versions-Splits neu erzeugen, während unveränderte Shell-Blöcke keinen vollständigen Transfer erfordern sollten. | Die Electron-Shell, der passende dsh-Seed, Node.js und pnpm bilden eine signierte Update-Einheit. Plattform-Update-Artefakte dürfen unveränderte Blöcke wiederverwenden, aber die Runtime-Versionswahl löst sich nie vom Desktop-Release. |

Die [Agent Note zu Electron-Paketierung und Updates](../../.agents/notes/implemented/architecture/2026-08-25-electron-desktop-packaging-and-updates.de.md) enthält die Begründung, Alternativen, Sicherheitsconstraints und Release-Qualifikationsanforderungen hinter diesen Entscheidungen.

## Installationshoheit

Electron besitzt das reservierte Profil unter `$DSH_HOME/profiles/desktop`. Sein Manifest listet die eingebauten und installierten Plugin-Bundles in `dsh.profile.bundles`, während sein `node_modules` das exakte `@deepseek-ai/dsh`-Release, den passenden privaten `@deepseek-ai/dsh-desktop-host` und jedes Desktop-Plugin enthält. Den Electron-eigenen Prozesseinstieg und das Overlay in einem privaten App-Paket zu halten, verhindert, dass die Desktop-Implementierung Teil des öffentlichen CLI-Pakets wird. Die CLI kann dieses Profil weder booten noch verändern. Electron ruft immer sein gebündeltes Node.js und pnpm mit dem Store unter `$DSH_HOME/desktop/pnpm/store` auf; es verwendet nie System-pnpm oder die npm/pnpm-Konfiguration des Aufrufers.

Der dsh-Hauptrenderer erhält nur den Desktop-Protokollmarker. Das separate Plugin-Fenster erhält strukturierte List-, Install-, Remove-, Update- und Update-Check-Operationen; kein Renderer erhält Dateisystemzugriff, rohes Electron-IPC, eine Shell oder beliebige pnpm-Argumente.

Electron wählt typisierte englische oder chinesische Shell-Texte anhand seiner Anwendungs-Locale und fällt auf Englisch zurück. Menüs, native Dialoge und der Plugin-Management-Renderer verwenden dieselbe Locale-Payload; das Client-UI-i18n-Gate des Repositories prüft diese Desktop-Quellen.

### Seed-Installation

Der paketierte Seed ist ein Installationskit, kein lauffähiger `node_modules`-Baum. Die Paketierung erstellt das Lockfile, materialisiert den Produktionsgraphen online mit deaktivierten Lifecycle-Skripten, löscht `node_modules` und jedes temporäre pnpm-Cache-, Config- und State-Verzeichnis und beweist eine vollständige Offline-Installation allein aus dem finalen Store mit vorhandenem privatem Desktop-Host-Entry und Overlay. Ein macOS-Build staget jedes Mach-O-Objekt aus dem Content-addressed Store von pnpm, signiert mit Developer ID höchstens vier unabhängige Kopien gleichzeitig und aktualisiert die betroffenen SHA-512-Indexrecords erst, nachdem alle Signer erfolgreich waren. Eine weitere Offline-Installation beweist den umgeschriebenen Store vor dem Sharding; die Vorbereitung extrahiert anschließend die finalen Archive und verifiziert jede eingebettete Signatur. Der signierte Seed behält die Release-Identität, lokale First-party-Tarballs samt Deskriptor, Projekt-Metadaten, Lockfile, Integritätsinventar und den pnpm-Store-Inhalt, der nötig ist, um diese Installation auf der Maschine des Benutzers zu wiederholen.

| Seed-Inhalt | Beschreibbares Ziel oder Verwendung |
|---|---|
| `integrity.json` und `desktop-packages.json` | Verifiziert jede inventarisierte Seed-Datei, jeden lokalen Tarball-Hash und die gebundenen dsh- und Desktop-Host-Versionen, bevor Paketzustand geändert wird. |
| `store-archives.json` und `store-archives/*.tar` | Validiert die deterministischen unkomprimierten Shards, extrahiert sie in ein eindeutiges Desktop-Staging-Verzeichnis, ersetzt passende immutable Store-Dateien und merged den versionierten SQLite-Paketindex von pnpm transaktional in `$DSH_HOME/desktop/pnpm/store`, ohne bereits für Desktop-Plugins heruntergeladene Pakete zu entfernen. |
| Projekt-Metadaten und `desktop-packages/` | Wird in ein eindeutiges `$DSH_HOME/desktop/staging/<transaction-id>/profile`-Projekt kopiert. |
| Lockfile und lokale Paket-Mappings | Treibt die gebündelte pnpm-Installation, ohne einen paketierten Core-Namen aus npm aufzulösen. |

Der Start installiert oder gleicht den Seed als eine serialisierte Transaktion ab:

1. Ein unterbrochenes Aktivierungsjournal wiederherstellen, das vollständige Seed-Inventar und den lokalen Paketsatz verifizieren und verlangen, dass die Seed-Version der Anwendungsversion von Electron entspricht.
2. Enthält das aktive Profil bereits dieses Release plus die passenden dsh- und Desktop-Host-Versionen, seinen lokalen Paketsatz verifizieren und ohne Neuinstallation wiederverwenden.
3. Andernfalls jeden Archiveintrag validieren, alle Store-Shards in ein temporäres Desktop-eigenes Staging-Verzeichnis extrahieren, die Paketdateien und SQLite-Paketindex-Records in den privaten Store mergen, ein Staging-Profil erstellen und `pnpm install --offline --frozen-lockfile --trust-lockfile` über das gebündelte Node.js und pnpm ausführen. Seed-Records ersetzen passende Index-Keys, während Plugin-only-Records verfügbar bleiben.
4. Während eines Electron-Upgrades jeden Plugin-Namen und jede exakte Version aus dem alten aktiven Profil lesen und diese Versionen mit `--offline` aus dem bestehenden Desktop-pnpm-Zustand zum Staging hinzufügen. Eine Erstinstallation hat keinen Plugin-Restore-Schritt.
5. Das aktive Backend stoppen, das vollständige gestagte Backend als Health-Check booten und stoppen und dann das aktive Backend vor der Aktivierung neu starten. Diese Serialisierung verhindert, dass zwei Desktop-Backends `$DSH_HOME` teilen; Installations- oder Plugin-Inkompatibilität vor der Aktivierung löscht das Staging und lässt das aktive Profil unverändert.
6. Jede nächste Aktivierungsphase vor ihrem Verzeichniszug persistieren, das aktive Profil nach `$DSH_HOME/desktop/rollback/profile` verschieben und das Staging nach `$DSH_HOME/profiles/desktop` verschieben. Das Recovery kombiniert das Journal mit den tatsächlichen Profil-, Rollback- und Staging-Verzeichnissen, sodass eine Unterbrechung in einer der beiden Schreib-Verschiebe-Lücken ein vollständiges Profil wiederherstellt oder behält.

GUI-Plugin-Mutationen verwenden denselben Staging-, Health-Check-, Aktivierungs- und Rollback-Pfad, nachdem Registry-Pakete in den geteilten Desktop-pnpm-Store installiert wurden.

Der prozesslebensdauernde Electron-Lock ist der primäre Desktop-Eigentümer. Der Transaktions-Lock ist Tiefenverteidigung: Er zeichnet Electron auf, während lokaler Zustand vorbereitet wird, zeichnet den gespawnten pnpm-Worker auf, solange dieser noch schreiben kann, und gibt die Eigentümerschaft an Electron zurück, nachdem der Worker beendet ist. Ein späterer Prozess kann einen lebenden verwaisten Worker nicht als stale Transaktion behandeln.

## Entwicklung

`dev:desktop` baut den aktuellen Host, die Client-Bundles, das Web-Frontend und die Electron-Shell, projiziert die gebauten CLI- und privaten Desktop-Host-Pakete mit ihren Workspace-Dependencies in ein wegwerfbares Desktop-npm-Projekt und startet Electron, ohne die paketierte Node.js-Runtime herunterzuladen oder dsh aus npm aufzulösen:

```sh
pnpm run dev:desktop
```

Der Development-Harness-Zustand liegt standardmäßig in `apps/desktop/.desktop-build/development/home`, das wegwerfbare npm-Projekt in `apps/desktop/.desktop-build/development/project` und die Electron-Browserdaten in `apps/desktop/.desktop-build/development/electron-user-data`. Sessions, Settings, Credentials, Paket-Links und Browserdaten bleiben daher außerhalb des normalen Harness-Home des Benutzers. Ein explizites `DSH_HOME` ersetzt nur das Development-Harness-Home. Die Renderer-DevTools öffnen automatisch; Main-, Renderer- und dsh-Host-Debugging lauschen auf den Ports 9229, 9222 und 9230. `DSH_DESKTOP_MAIN_INSPECT_PORT`, `DSH_DESKTOP_RENDERER_DEBUG_PORT` und `DSH_DESKTOP_HOST_INSPECT_PORT` ersetzen diese Ports, während `DSH_DESKTOP_OPEN_DEVTOOLS=0` die abgetrennten Renderer-Tools geschlossen hält.

Nach einem expliziten Build rekonstruiert `start:desktop` das wegwerfbare Projekt und startet die vorhandenen Artefakte ohne erneuten Build:

```sh
pnpm run start:desktop
```

Die Workspace-Entwicklung lässt die aktuellen CLI- und privaten Desktop-Host-Pakete unter dem aufrufenden Node.js laufen und deaktiviert Desktop-Paket-Mutationen. Sein explizit verlinktes Wegwerfprofil ist der einzige Modus, der Bundles außerhalb seines eigenen Verzeichnisses auflösen darf. Verwenden Sie eine unverpackte Anwendung, um das gebündelte Node.js, das gebündelte pnpm, den Release-Seed, die Plugin-Installation, das Staging und die Rollback-Pfade zu testen.

## Paketierung

Der normale Paketierungspfad ist ein einziger vollständiger Befehl. Er führt die Release-Vorbereitung durch, bevor er die Installer und Update-Metadaten der Host-Plattform erstellt. Jedes Target erfordert eine Reverse-DNS-`DSH_DESKTOP_APP_ID`. macOS-Targets erfordern zusätzlich den electron-builder-Zertifikatsqualifizierer in `DSH_DESKTOP_MACOS_SIGNING_IDENTITY`, seine 10-stellige Apple-Team-ID in `DSH_DESKTOP_MACOS_TEAM_ID` und eine vollständige notarytool-Credential-Strategie. Die App-Store-Connect-API-Key-Strategie verwendet diese Variablen:

```sh
export DSH_DESKTOP_APP_ID='<reverse-DNS application ID>'
export DSH_DESKTOP_MACOS_SIGNING_IDENTITY='<certificate name without the Developer ID Application prefix>'
export DSH_DESKTOP_MACOS_TEAM_ID='<10-character Apple Team ID>'
export APPLE_API_KEY='<absolute path to the .p8 file>'
export APPLE_API_KEY_ID='<App Store Connect API Key ID>'
export APPLE_API_ISSUER='<App Store Connect issuer UUID>'
```

`prepare:desktop` ist keine Voraussetzung:

```sh
pnpm run package:desktop
```

Die Release-Automatisierung verwendet feste Target-Befehle, sodass Runtime-Vorbereitung, Seed-Installation und electron-builder dieselbe Plattform und Architektur erhalten:

```sh
pnpm run package:desktop:mac:arm64
pnpm run package:desktop:mac:x64
pnpm run package:desktop:win:x64
```

Der macOS-arm64-Befehl erfordert Apple Silicon. Der macOS-x64-Befehl läuft auf Intel-macOS oder Apple Silicon mit Rosetta. Der Windows-x64-Befehl erfordert Windows x64. Linux ist kein unterstütztes Desktop-Release-Target.

Jedes Target besitzt seine gepackten Paket-Inputs, die vorbereitete Runtime, den Paketsatz, den Seed, den pnpm-Vorbereitungszustand, die unverpackte Anwendung, die Update-Metadaten und die finalen Artefakte unter `apps/desktop/.desktop-build/targets/<target>/`. Der Node.js-Archiv-Cache bleibt unter `.desktop-build/downloads` geteilt, weil jeder Archivname seine Version, Plattform und Architektur enthält und vor dem Entpacken verifiziert wird. Ein Target-Build konsumiert nie den mutablen Vorbereitungszustand eines anderen Targets.

### Updates hochladen

`DSH_DESKTOP_AUTO_UPDATE_ENV` wählt `test` oder `production` sowohl für die beim Paketieren eingebettete URL als auch für den späteren COS-Upload; ein fehlender Wert wählt `test`. Test-Paketierung erfordert ihren HTTPS-Origin in `DOWNLOAD_TEST_ORIGIN`, während der Produktions-Origin `https://download.deepseek.com` bleibt. Der Upload erfordert zusätzlich den COS-Bucket des gewählten Deployments in `DOWNLOAD_TEST_COS_BUCKET` oder `DOWNLOAD_PROD_COS_BUCKET`. Der Zielpfad ist `_/harness/desktop/stable/<target>/`, wobei `target` `mac-arm64`, `mac-x64` oder `win-x64` ist.

Update-Ziel und Upload-Credentials folgen dem gewählten Deployment:

| Umgebung | Öffentlicher Origin | COS-Bucket | COS-Credentials |
|---|---|---|---|
| `test` oder unset | `DOWNLOAD_TEST_ORIGIN` | `DOWNLOAD_TEST_COS_BUCKET` | `DOWNLOAD_TEST_COS_SECRET_ID`, `DOWNLOAD_TEST_COS_SECRET_KEY` |
| `production` | `https://download.deepseek.com` | `DOWNLOAD_PROD_COS_BUCKET` | `DOWNLOAD_PROD_COS_SECRET_ID`, `DOWNLOAD_PROD_COS_SECRET_KEY` |

Paketieren und laden Sie ein Target unter derselben Umgebung hoch. Das Standard-Test-Deployment verwendet beispielsweise:

```sh
export DOWNLOAD_TEST_ORIGIN='https://desktop-updates.example.com'
pnpm run package:desktop:mac:arm64

export DOWNLOAD_TEST_COS_BUCKET='<test COS bucket>'
export DOWNLOAD_TEST_COS_SECRET_ID='<test COS SecretId>'
export DOWNLOAD_TEST_COS_SECRET_KEY='<test COS SecretKey>'
pnpm run upload:mac:arm64
```

Setzen Sie `DSH_DESKTOP_AUTO_UPDATE_ENV=production` vor dem Paketieren und stellen Sie dann `DOWNLOAD_PROD_COS_BUCKET` und das Produktions-Credential-Paar bereit, bevor Sie `upload:mac:arm64`, `upload:mac:x64` oder `upload:win:x64` ausführen. Die Paketierung benötigt weder einen COS-Bucket noch Credentials. Sie deaktiviert explizit das electron-builder-Publishing, entfernt alle vier COS-Credential-Felder aus ihren Subprozessen und schreibt einen Target-Completion-Record erst, nachdem electron-builder und jeder Signier- oder Notarisierungs-Hook erfolgreich waren. Der Upload verlangt, dass dieser Record mit der gewählten Umgebung, dem Target, der öffentlichen URL und der aktuellen dsh-Version übereinstimmt; er verlangt außerdem, dass Root-dsh-Version, Desktop-Version, Channel-Metadaten-Version, Artefaktnamen, -Größen und SHA-512-Werte übereinstimmen, bevor er das gewählte COS-Credential-Paar liest. Er lädt nur die immutable versionierten Artefakte dieses Targets hoch, lädt die von der Version abgeleiteten Channel-Metadaten zuletzt mit `no-cache` hoch und löscht nie historische Objekte. Stabile Releases verwenden `latest-mac.yml` oder `latest.yml`; ein Prerelease wie `alpha` verwendet `alpha-mac.yml` oder `alpha.yml`, passend zum von electron-builder emittierten Dateinamen.

Die macOS-Konfiguration verwendet die erforderliche Release-Umgebung, statt das zuerst gefundene Zertifikat in einem Keychain zu akzeptieren. Sie lehnt leere Werte, eine missformte Team-ID, eine Signier-Identität mit dem von electron-builder nicht unterstützten `Developer ID Application:`-Präfix und unvollständige Notarisierungs-Credentials ab. Die macOS-Paketierung erfordert die konfigurierte Identität und ihren Private Key. Die Seed-Vorbereitung wendet diese Identität, einen sicheren Zeitstempel und die Hardened Runtime auf jede eingebettete Mach-O-Datei an; nach dem Signieren der Anwendung lehnt ein tiefer strenger Check jede andere Leaf-Authority oder Team-ID ab, bevor Artefakte erstellt werden. Electron-builder notarisiert und stapelt die Anwendung vor dem Paketieren und signiert die DMG. Der DMG-Artefakt-Completion-Hook notarisiert und stapelt sie anschließend, bevor er ihre exakte Identität, ihr Ticket und die Gatekeeper-Akzeptanz verlangt; erst nach dem Erfolg des Hooks darf electron-builder die Datei veröffentlichen. Der Private Key kann aus dem Login-Keychain oder dem Standard-`CSC_LINK`-Input von electron-builder stammen; das Umgebungs-`CSC_NAME` und die Zertifikats-Suchreihenfolge wählen nicht den Release-Eigentümer. Notary-Credentials dürfen stattdessen die vollständige Apple-ID- oder Keychain-Profil-Strategie von electron-builder verwenden. Die beiden macOS-Identitätsvariablen werden auch benötigt, wenn die Anwendungsprüfung manuell mit `pnpm --dir apps/desktop run verify:mac-signature -- <path-to-app>` wiederholt wird.

### Windows-EV-Signierung

Die Windows-Release-Paketierung erfordert `DSH_DESKTOP_WINDOWS_CER_FILE` zur Identifikation des öffentlichen GlobalSign-EV-Leaf-Zertifikats, `DSH_DESKTOP_WINDOWS_SIGNTOOL` zur Identifikation der SafeNet-kompatiblen SignTool-Executable, `DSH_DESKTOP_WINDOWS_KEY_CONTAINER` zur Identifikation des passenden Private-Key-Containers und `DSH_DESKTOP_WINDOWS_TOKEN_PIN` für das SafeNet-Token-Passwort. Die Zertifikatsdatei bleibt außerhalb der Versionskontrolle, und der passende Private Key bleibt auf dem USB-Token. Setzen Sie die vier Inputs vor dem festen Windows-Target:

```powershell
$env:DSH_DESKTOP_WINDOWS_CER_FILE = 'C:\path\to\server.cer'
$env:DSH_DESKTOP_WINDOWS_SIGNTOOL = 'C:\path\to\the\validated\signtool.exe'
$env:DSH_DESKTOP_WINDOWS_KEY_CONTAINER = '<SafeNet private-key container name>'
$env:DSH_DESKTOP_WINDOWS_TOKEN_PIN = '<SafeNet Token Password>'
pnpm run package:desktop:win:x64
```

Stecken und entsperren Sie den Token vor dem Paketieren. Der electron-builder-Hook reicht jedes Artefakt an das CRLF-`scripts/windows-sign.cmd`, das das konfigurierte SignTool einmal mit `/f`, SafeNet-`/kc "[{{PIN}}]=container"`, `/csp "eToken Base Cryptographic Provider"`, einem SHA-256-Dateidigest und einem DigiCert-SHA-256-RFC-3161-Zeitstempel aufruft. Der Hook ersetzt nie das gebündelte SignTool von electron-builder und wiederholt nie eine fehlgeschlagene Signieranfrage. Die Windows-Paketierung schlägt fehl, statt unsignierte Artefakte zu emittieren, wenn SignTool, Zertifikat, Container, PIN, Token oder Signatur nicht verfügbar sind.

Die PIN darf kein `]`, kein Anführungszeichen und keinen Zeilenumbruch enthalten, weil diese Zeichen den SafeNet-`/kc`-Wert oder sein CMD-Argument begrenzen. Das CMD deaktiviert die verzögerte Expansion, sodass eine PIN mit `!` unverändert bei SafeNet ankommt. Die Paketierung hält jedes `DSH_DESKTOP_WINDOWS_*`-Feld von Build- und Seed-Vorbereitungs-Subprozessen fern, gibt electron-builder nur die vier konfigurierten Inputs, gibt dem Signier-CMD nur die validierten Signierfelder in einer ansonsten bereinigten Umgebung, löscht diese Felder vor dem SignTool-Start und redigiert SignTool-Diagnosen. SafeNet verlangt die PIN weiterhin in der Kommandozeile des SignTool-Prozesses. Injizieren Sie sie nur als ephemeres Secret auf einem kontrollierten Self-hosted-Windows-Runner mit angeschlossenem physischem Token; committen Sie sie nie, legen Sie sie nie in `.env` ab und persistieren Sie sie nie als Windows-Benutzer- oder System-Umgebungsvariable.

Erstellen Sie ein lauffähiges Anwendungsverzeichnis statt eines Installers über den passenden `:dir`-Befehl, etwa:

```sh
pnpm run package:desktop:dir
pnpm run package:desktop:mac:arm64:dir
```

Um die für das Host-Target vorbereiteten Ressourcen zu prüfen oder zu diagnostizieren, ohne electron-builder aufzurufen, stoppen Sie dieselbe Pipeline nach der Vorbereitung:

```sh
pnpm run prepare:desktop
```

Dieser Diagnosebefehl ist ein alternativer Haltepunkt, nicht die erste Hälfte eines Zwei-Befehl-Builds. Ein späterer `package:desktop*`-Befehl wiederholt den offiziellen Build und die Vorbereitung, sodass er keine stale dsh-Pakete, Runtime-Dateien oder Seed-Inhalte konsumieren kann.

Jeder Paketbefehl führt den offiziellen Repository-Build aus, packt die dsh- und vendored-Paketfamilien, packt das private Desktop-Host-Paket lokal und packt den Landlock-Eintrag, bevor Release-Ressourcen vorbereitet werden. `prepare:packages` wählt die Vereinigung der First-party-Produktions-Closures mit den Wurzeln `@deepseek-ai/dsh` und `@deepseek-ai/dsh-desktop-host`, verifiziert, dass der private Host-Tarball `lib/index.js` und `config/desktop.cordis.patch.yml` enthält, kopiert die ausgewählten Tarballs in den Seed-Input und zeichnet ihre Größen und SHA-512-Integrität auf. Das Host-Paket wird nie auf npm veröffentlicht; sein `files`-Manifest enthält nur diesen Runtime-Einstieg und das Overlay. Öffentliche Paket-Tarballs bleiben die offiziellen `pnpm pack`-Ausgaben, die vom Publikationsmanifest jedes Pakets gesteuert werden, sodass Desktop keinen zweiten Filter hinzufügt, veröffentlichte Deklarationen wie `lib/types` behält und Source Maps weder eigenständig entfernt noch hinzufügt. Registry-Pakete behalten ebenfalls ihre veröffentlichten Paket-Bytes im Content-addressed Store von pnpm. Der dsh-Release-Bump aktualisiert beide privaten Desktop-Manifeste zusammen mit dem Root- und den publizierbaren Workspaces; die Paketierung verlangt außerdem, dass Root-dsh-Paket, Desktop-Host-Paket und Electron-Paket dieselbe Version haben. Weder dsh noch der private Host müssen auf npm veröffentlicht sein, bevor die Desktop-Anwendung gebaut wird. `prepare:runtime` lädt Node.js 24.17.0 vom offiziellen Node.js-Release-Dienst herunter, verifiziert dessen SHA-256-Eintrag vor dem Entpacken und führt das vorbereitete Target-Binary auf einem kompatiblen Build-Host aus, um dessen gemeldete Version zu prüfen. Es kopiert die vom Desktop-Paket deklarierte pnpm-Version und zeichnet beide Runtime-Versionen im Release-Seed auf. `prepare:seed` lässt dieses Target-Node.js und das gebündelte pnpm laufen, sodass plattform- und CPU-gefilterte optionale Dependencies den pnpm-Store und den Seed Target-spezifisch machen. Es generiert lokale Core-Paket-Mappings, deaktiviert den globalen Virtual Store, materialisiert externe Produktions-Dependencies aus npm ohne Lifecycle-Skripte, löscht `node_modules` und jedes temporäre pnpm-Cache-, Config- und State-Verzeichnis, beweist, dass der vollständige Graph offline mit dem privaten Host-Entry und dem Overlay installiert, führt gegebenenfalls das macOS-Rewrite aus, beweist den umgeschriebenen Store mit einer weiteren Offline-Installation, entfernt temporäre pnpm-Projektregistrierungen und ersetzt den losen Store durch 16 deterministische unkomprimierte tar-Shards. Es extrahiert diese finalen Shards und verifiziert jede eingebettete macOS-Signatur vor der Inventarerstellung. Spätere GUI-Plugin-Operationen behalten die lokalen Core-Mappings bei, während sie Plugin-Pakete und deren externe Dependencies aus der festen Desktop-npm-Registry auflösen. `electron-builder` emittiert die Plattform-Artefakte jedes Targets unter `apps/desktop/.desktop-build/targets/<target>/artifacts`; eine spätere Version behält anders benannte immutable Installer und Blockmaps, während sie die unverpackte Anwendung, Diagnosen, den Completion-Record und die Channel-Metadaten dieses Targets ersetzt.

Ein unverpacktes Artefakt enthält vier unabhängige Größenbeiträge: Electron, die Offline-Seed-Store-Shards und lokalen dsh-Tarballs, die Upstream-Node.js- und pnpm-Runtime sowie die kleine Shell-Anwendung. Die Shards sind unkomprimiert, damit der äußere DMG-, ZIP- oder NSIS-Kompressor und der differenzielle Updater auf stabilen Bereichen arbeiten können. Dateisystemgröße ist nicht die Installer-Downloadgröße, also messen Sie beide getrennt. Der erste paketierte Start extrahiert den Seed-Store außerdem nach `$DSH_HOME/desktop/pnpm/store`, bevor er das beschreibbare Profil installiert; die Release-Qualifikation muss daher sowohl Anwendungs- als auch Harness-Home-Festplattenverbrauch messen.

## Updates

Eine paketierte Anwendung prüft ihren Target-spezifischen Release-Stream zehn Sekunden, nachdem sich das Hauptfenster öffnet; der lokalisierte Menüpunkt **Auf Updates prüfen…** löst denselben Check manuell aus. Ein verfügbares Release öffnet einen nativen Bestätigungsdialog. Die Annahme wartet auf einen laufenden Check, lädt das signierte Desktop-Release herunter und verifiziert es, stoppt das dsh-Child und übergibt Installation plus Neustart an electron-updater. Der nächste Start gleicht den versionsgebundenen Seed ab, bevor er das Produktfenster wieder öffnet.

Electron-builder emittiert immer Generic-Provider-Channel-Metadaten für das von `DSH_DESKTOP_AUTO_UPDATE_ENV` gewählte Deployment. NSIS-Differential-Pakete und das macOS-ZIP-Target erlauben electron-updater, unveränderte Blöcke wiederzuverwenden; die manuell installierte DMG wird ohne Blockmap notarisiert, weil sie keine macOS-Updater-Payload ist. Seed und Shell bilden weiterhin ein signiertes Desktop-Release. macOS-Signier- und Notarisierungs-Credentials verwenden die Standard-Umgebung von electron-builder; die Windows-EV-Signierung verwendet das oben beschriebene öffentliche Zertifikat, das validierte SignTool, den SafeNet-Container und die Runner-PIN. Die erforderliche Desktop-Release-Umgebung wählt die Anwendungs- und Plattform-Signaturidentitäten, die der Build verifiziert.

## Low-level-Entwicklungs-Overrides

`DSH_DESKTOP_NODE_BINARY`, `DSH_DESKTOP_PNPM_ENTRY`, `DSH_DESKTOP_SEED_DIR` und `DSH_DESKTOP_DEV_PROJECT_DIR` wählen explizite Ressourcen für einen unverpackten Electron-Prozess. Paketierte Anwendungen ignorieren diese Variablen und lösen signierte Ressourcen aus `process.resourcesPath` auf.

## Bekannte Einschränkungen

- Die Web-Aktion „In App öffnen…" ist in Desktop deaktiviert, weil ihr Host-Plugin HTTP-Routen benötigt; Desktop stellt keinen `webServer` bereit.
- Release-Signierung, Notarisierung, Update-Hosting und die Qualifikation installierter Artefakte der Vorversion erfordern die Produktions-Release-Umgebung.
- Desktop-Plugins mit Dependency-Lifecycle-Skripten werden abgelehnt, es sei denn, ihr Paket erscheint in der geprüften `allowBuilds`-Policy des Desktop-Projekts.
- Die Desktop-Shell teilt Sessions, Settings, Credentials, Workspaces und Storage unter `$DSH_HOME` mit CLI-dsh, während ausführbare Pakete, Plugin-Aktivierung, Lockfiles und Package-Manager-Zustand getrennt bleiben.
