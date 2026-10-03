# Agent Note: Paketierung und Updates der Electron-Desktop-Anwendung

Status: implemented

[English](2026-08-25-electron-desktop-packaging-and-updates.md) | [中文](2026-08-25-electron-desktop-packaging-and-updates.zh.md) | Deutsch

## Problem

DeepSeek Harness benötigt eine Electron-Desktop-Anwendung, die die Web-UI wiederverwendet, ohne System-Node.js oder pnpm funktioniert, dsh- und Desktop-Plugins über ein anwendungsgebündeltes pnpm installiert und die vollständige Desktop-Veröffentlichung über einen benutzerseitigen Flow aktualisiert.

Die Desktop-Anwendung und ein per npm installiertes dsh teilen den `.dsh`-Datenstamm, können aber unterschiedliche dsh- und Plugin-Versionen haben. Sie müssen unterstützte Produktdaten teilen, ohne ausführbare Pakete, Lockfiles, `node_modules`, Plugin-Aktivierung oder Paketmanager-Konfiguration zu teilen.

Das aktuelle GUI-Protokoll bindet den Web-Client und die Backend-Veröffentlichung. Eine unabhängige Versionierung des Electron-Artefakts und seines per pnpm installierten dsh würde unqualifizierte Shell-, Client-, Backend- und Plugin-Kombinationen erzeugen und die Update-Verfügbarkeit mehrdeutig machen.

## Entscheidung

Ausgeliefert wird eine kleine Electron-Shell mit einer gebündelten Upstream-Node.js-Executable und gepinntem pnpm. Electron startet das private Desktop-Host-Paket als isolierten Kindprozess; dieses Paket komponiert das installierte dsh-Backend und den passenden Client-Graphen. Fetch-Metadaten und begrenzte rohe Request- und Response-Chunks laufen über zwei versionierte gerahmte Byte-Pipes, Node-IPC ist für Bereitschaft, fatale Fehler und Shutdown reserviert, und Electron serviert validierte Assets über `dsh-app://`; es öffnet keinen lauschenden Port. Jeder Frame trägt einen festen Marker, Typ, eine monotone Stream-ID, Payload-Länge und eine validierte Payload. Serialisierte Writer beachten Pipe-Drain, Reader pausieren global, wenn ein Request- oder Response-Stream Backpressure anwendet, Abbruch schließt den passenden Stream, und späte Response-Frames für einen ausgemusterten Stream bleiben inert. Das Connection-Plugin stellt seine trägerneutralen RPC- und Fetch-registries bereit, ohne `webServer` zu erfordern, während Client Modules die exakten beworbenen Combo-Bundle-Antworten an den Shell-eigenen Träger liefert; Web-Kompositionen hängen ihre optionalen HTTP-Routen für beide an. Der Renderer behält dieselben Fetch-, RPC- und Remote-Stream-Formate, während der Kind-Träger Base64-Aufblähung und V8-Serialisierungs-Kompatibilität zwischen Electron und dem gebündelten Upstream-Node.js vermeidet. Electron schließt seinen Request-Pipe-Writer nach dem Senden von Shutdown, wodurch ein laufender Windows-Pipe-Lesevorgang freigegeben wird, bevor es auf das Kind-Exit wartet. Dies folgt der Electron-Reservierung in der [GUI-Layering- und RPC-Protokoll-Note](../../archived/architecture/2026-07-19-gui-layering-and-rpc-protocol.md).

Electron besitzt das reservierte Profil unter `.dsh/profiles/desktop`. Seine exakte `@deepseek-ai/dsh`-Abhängigkeit liefert das Backend und die passende Web-UI, während die passende private `@deepseek-ai/dsh-desktop-host`-Abhängigkeit nur den Electron-Kindprozess-Einstieg und das Kompositions-Overlay liefert. Die dsh-Veröffentlichung, der private Host und ihre First-Party-Abhängigkeits-Closures verwenden lokale npm-Tarballs, die aus demselben Quell-Build gepackt wurden; das Profil-manifest listet jedes Kernpaket als lokale `file:`-Abhängigkeit, und `pnpm-workspace.yaml` wiederholt die Zuordnung als Overrides. Der Host bleibt außerhalb des öffentlichen CLI-Pakets und wird niemals auf npm veröffentlicht. Desktop-Plugins sind zusätzliche registry-npm-Abhängigkeiten und geordnete `dsh.profile.bundles`-Einträge im selben Profil und lösen sich aus seinem einen `node_modules` auf.

Eine Desktop-Veröffentlichungsnummer identifiziert das Electron-Artefakt und seine exakten `@deepseek-ai/dsh`- und `@deepseek-ai/dsh-desktop-host`-Abhängigkeiten. Eine Veröffentlichung kann zur Build- oder Laufzeit keine andere Kernversion wählen. Das Aktualisieren von dsh erfordert daher eine neue Electron-Veröffentlichung, selbst wenn der Shell-Code unverändert ist.

Die Browser-Web-UI, das dsh-Backend, die bestehende `dsh plugin`-CLI, Benutzer-npm und Benutzer-pnpm können dieses Profil nicht mutieren. Die CLI reserviert jede Schreibvariante des `desktop`-Namens und lehnt Boot-, Config-Dump- und Plugin-Verwaltungs-Requests dafür ab. Electron erwirbt seine prozesslebensdauerliche Single-Instance-Sperre vor der Projektwiederherstellung oder dem Host-Start; spätere Starts fokussieren oder erstellen das primäre Fenster neu, ohne den Profilzustand zu berühren. Eine Electron-only-GUI sendet strukturierte Install-, Remove- und Update-Requests über Preload; Electron ruft nur sein gebündeltes pnpm auf.

## Ownership

| Eigentümer | Verantwortung |
|---|---|
| Electron-Shell | Fenster- und Kind-Lifecycle, gerahmte Byte-Pipes, Lifecycle-IPC, benutzerdefiniertes Protokoll, reserviertes Desktop-Profil, Plugin-GUI, Update-Koordination, Rollback |
| Gebündeltes Node.js und pnpm | dsh ausführen und exakte Desktop-Projekt-Abhängigkeiten installieren, ohne Benutzer-`PATH` oder pnpm-Zustand zu konsultieren |
| Desktop-Profil | Ein Abhängigkeitsgraph, geordnete Bundle-Liste und `node_modules` für das Desktop-dsh-Paket und Desktop-Plugins |
| Privates Desktop-Host-Paket | Electron-only-Kindprozess-Einstieg und Kompositions-Overlay, installiert mit dsh, aber aus dem öffentlichen CLI-Paket und der npm-Veröffentlichung ausgeschlossen |
| Installiertes dsh-Paket | Backend, passende Web-UI, Boot-manifest, Client-Bundles und Produktverhalten |
| Geteilte `.dsh`-Eigentümer | Sessions, Einstellungen, Credentials, Workspaces und Storage, abgesichert durch ihre bestehenden Sperren und Formatversionen |
| npm-installiertes dsh | Seine eigene Executable-Installation und benutzerverwaltete Profile; kein Zugriff auf das reservierte Desktop-Profil oder Paketzustand |

Der Renderer verwendet `nodeIntegration: false`, `contextIsolation: true` und `sandbox: true`. Preload stellt typisierte RPC-, Lifecycle-, Update-, locale- und Desktop-Plugin-Aktionen bereit statt rohem `ipcRenderer`, Dateisystemzugriff, Shell-Befehlen oder pnpm-Argumenten. Electron wählt ein typisiertes englisches oder chinesisches Wörterbuch aus seiner Anwendungs-locale und fällt auf Englisch zurück; Menüs, native Dialoge und der Plugin-Verwaltungs-Renderer verwenden diesen locale-eigenen Text.

## Dateisystem-Layout

```text
~/.dsh/
  desktop/
    staging/<transaction-id>/profile/
    rollback/profile/
    pending.json
    lock
    pnpm/
      store/
      cache/
      state/
      config/
  profiles/
    desktop/
      package.json
      pnpm-lock.yaml
      pnpm-workspace.yaml
      desktop-release.json
      desktop-packages.json
      desktop-packages/
      node_modules/
  sessions/
  storages/
```

`.dsh/profiles/desktop` ist das einzige aktive Desktop-Profil. Sein Paket-manifest zeichnet die eingebaute und installierte Plugin-Bundle-Reihenfolge auf; Electron allein mutiert seine Abhängigkeiten, sein Lockfile und sein `node_modules`. Der Produktionsstart lehnt ein Bundle ab, das außerhalb dieses Profils aufgelöst wird, einschließlich des CLI-gepflegten `.dsh/profiles/node_modules`-Fallbacks. Für das Desktop-Profil installierter Paketinhalt verwendet `.dsh/desktop/pnpm/store`.

## Installation und Auflösung

Der Installer mutiert das aktive Profil niemals an Ort und Stelle. Er kopiert Profil-Metadaten in ein Transaktions-Staging-Verzeichnis und wendet eine exakte Abhängigkeitsänderung mit dem gebündelten pnpm an. Bevor das Staging getestet wird, stoppt Electron das aktive Backend; es startet und stoppt das gestagte Backend allein, dann stellt es das aktive Backend vor der Aktivierung wieder her, sodass zwei Desktop-Backends niemals gleichzeitig `.dsh`-Zustand teilen. Die Aktivierung stoppt das Backend erneut, persistiert jede nächste `pending.json`-Phase vor ihrem entsprechenden Dateisystem-Move, verschiebt das aktive Profil nach `rollback/profile`, verschiebt das Staging nach `.dsh/profiles/desktop` und startet neu. Die Wiederherstellung kombiniert die Write-ahead-Phase mit den tatsächlichen aktiven, Rollback- und Staging-Verzeichnissen, sodass jede Write-to-Move-Unterbrechung ein vollständiges Profil behält oder wiederherstellt.

Die prozesslebensdauerliche Electron-Sperre ist der autoritative Desktop-Eigentümer. Die Paket-Transaktionssperre ist Tiefenverteidigung und zeichnet den Prozess auf, der Paketzustand noch mutieren kann: Electron zwischen Paketoperationen und die gespawnte pnpm-PID, während pnpm läuft. Der Eigentümerwechsel wird trunkiert, geschrieben und über die bereits geöffnete exklusive Sperrdatei synchronisiert. Wenn Electron während der pnpm-Ausführung terminiert, beobachtet ein späterer Prozess den lebenden Worker und verweigert den Start einer konkurrierenden Store- oder Staging-Transaktion; nachdem dieser Worker beendet ist, kann die stale-PID wiederhergestellt werden.

Der gepackte Seed ist ein Offline-Installationskit, kein ausführbarer dsh-Baum. Er enthält die Veröffentlichungsidentität, das initiale Desktop-Projekt-manifest, einen Deskriptor und unveränderliche Tarballs für die Vereinigung der First-Party-Paket-Closures, die bei dsh und dem privaten Desktop-Host wurzeln, Lockfile, Integritätsinventar und die erforderliche Store-Teilmenge. Jeder `mac-arm64`-, `mac-x64`- und `win-x64`-Build besitzt seine gepackten Pakete, Laufzeit, Paketmenge, Seed, pnpm-Vorbereitungszustand, ungepackte Anwendung, Update-Metadaten und finalen Artefakte unter `.desktop-build/targets/<target>`; nur der unveränderliche, checksumverifizierte Node.js-Download-Cache wird geteilt. Der Veröffentlichungs-Build erfordert, dass das Electron-Paket, das Root-dsh-Paket und das private Host-Paket dieselbe Version haben, erstellt finale npm-Tarballs aus dem offiziellen Quell-Build, packt den privaten Host lokal, wählt die erreichbaren dsh-, Host- und vendored-Pakete plus den Landlock-Eintrag und verifiziert, dass der Host-Tarball `lib/index.js` und `config/desktop.cordis.patch.yml` enthält. Das Host-`files`-manifest enthält nur diesen Laufzeiteinstieg und das Overlay, und das Paket wird niemals auf npm veröffentlicht. Öffentliche Paket-Tarballs bleiben die offiziellen `pnpm pack`-Ergebnisse, die vom Veröffentlichungs-manifest jedes Pakets geregelt werden; Desktop entfernt keine veröffentlichten Deklarationen und erzeugt anderweitig keine zweite Paketinhalts-Policy. Das Seed-manifest listet jedes ausgewählte Paket als lokale direkte Abhängigkeit, die automatische Peer-Installation ist deaktiviert, und die Workspace-Datei überschreibt jeden ausgewählten First-Party-Namen auf seinen lokalen Tarball. Das Ziel-Node.js führt gebündeltes pnpm aus, sodass pnpm's Betriebssystem- und CPU-Auswahl den materialisierten Abhängigkeitsgraph und den Seed zielspezifisch macht. Gebündeltes pnpm deaktiviert seinen globalen virtuellen Store, materialisiert externe Produktionsabhängigkeiten aus npm ohne Lifecycle-Skripte, löscht `node_modules` und jedes temporäre pnpm-Cache-, Config- und State-Verzeichnis, führt dann eine saubere Offline-Installation allein aus dem finalen Store durch und prüft den privaten Host-Eintrag und das Overlay. Der Build lehnt jedes Lockfile ab, das einen der lokalen First-Party-Namen per registry-Version auflöst. Die Inventargenerierung folgt der Entfernung dieses zweiten `node_modules`-Baums und temporärer pnpm-Projekt-Registrierungen. Das Erfordernis beider Host-Dateien vor dem Kopieren der Paketmenge und nach der Offline-Installation verhindert, dass eine Veröffentlichung, deren Prozesseinstieg lädt, aber ihr erforderliches Overlay nicht komponieren kann, die Anwendungssignierung erreicht.

Der Seed speichert pnpm-Inhalt in 16 deterministischen unkomprimierten Tar-Shards, die per normalisiertem Store-Pfad ausgewählt werden. Die Apple-Notarisierung inspiziert Mach-O-Code in diesen Archiven, sodass die macOS-Seed-Vorbereitung jedes referenzierte Mach-O-content-addressed-Objekt stagiert und höchstens vier unabhängige Developer-ID-Signierer gleichzeitig mit einem sicheren Timestamp und Hardened-Runtime laufen lässt. Ein Signierer-Fehler wird erst beobachtet, nachdem jeder aktive Signierer beendet ist, und lässt die ursprünglichen CAS-Objekte und den Paketindex unverändert. Nachdem alle Signierer erfolgreich waren, schreibt die Vorbereitung jedes Objekt an seinen neuen SHA-512-Pfad und schreibt transaktional jede Basis- und Side-Effects-Dateireferenz in pnpm's MessagePack-SQLite-Index neu. Eine zweite Offline-Installation beweist, dass pnpm den umgeschriebenen Store auflöst; die Vorbereitung shardet ihn dann, extrahiert die finalen Archive und verifiziert jede eingebettete Signatur. Paketpfade und nicht-native Bytes bleiben unverändert, und der Seed behält gebündelte Architekturvarianten, weil das Entfernen von Dateien eine Desktop-spezifische Paketdateimenge erzeugen würde. Die Seed-Integrität deckt das Shard-manifest und jedes Archiv vor der Extraktion ab. Der Start validiert Archivpfade, Eintragstypen, Eindeutigkeit und Anzahlen, extrahiert jeden Shard in ein eindeutiges Desktop-eigenes Staging-Verzeichnis, ersetzt passende unveränderliche Store-Dateien und mergt transaktional jeden pnpm-Store-Versions-SQLite-`package_index` in `.dsh/desktop/pnpm/store`. Seed-Datensätze ersetzen passende Schlüssel, während für Desktop-Plugins heruntergeladene Datensätze bleiben. Ein unterbrochener Datei-Merge kann gültigen unveränderlichen Cache-Inhalt hinterlassen, aber jeder SQLite-Merge ist atomar, und Profilinstallation und -aktivierung erfordern weiterhin pnpm-Integrität und die vollständige Gesundheitsprüfung.

Der Start erfordert, dass die gepackte Veröffentlichungsidentität der Anwendungsversion von Electron entspricht, dann vergleicht er `.dsh/profiles/desktop/desktop-release.json` plus die installierten dsh- und Desktop-Host-Pakete mit dieser Veröffentlichung, bevor er das Backend startet. Er installiert das neue Seed-manifest und Lockfile mit `pnpm install --offline --frozen-lockfile --trust-lockfile` im Staging. Nach dem Electron-Ersatz stellt er jedes im aktiven Profil aufgezeichnete Plugin-Bundle in seiner exakten installierten Version über ein Offline-pnpm-add aus dem bestehenden Desktop-Store und Metadaten-Cache wieder her. Der vollständige Graph muss dieselbe Gesundheitsprüfung vor der Aktivierung bestehen.

Die Plugin-GUI führt registry-npm-Paketoperationen durch, die `pnpm add <package> --save-exact`, `pnpm remove <package>` und Exact-Version-Update im Staging entsprechen. Jede Mutation behält den lokalen Kernpaket-Deskriptor, Tarballs, dsh- und Desktop-Host-Abhängigkeiten und die vollständige Override-Map. Electron validiert das installierte Paket-manifest und aktualisiert die Abhängigkeits- und geordneten Bundle-Einträge des Profils; kein Renderer-Request kann die registry, das Installationsverzeichnis, die Lifecycle-Policy oder beliebige pnpm-Flags wählen.

Das Backend und der Loader verwenden `.dsh/profiles/desktop/package.json` als ihr Profil-manifest und npm-Auflösungsanker. Der geteilte Profil-loader komponiert seine geordneten Bundle-Einträge, dann wendet der private Desktop-Host sein gepacktes Overlay an. Der Host, dsh, Cordis, Desktop-Plugins, Plugin-Abhängigkeiten und peer dependencies lösen sich über den gewöhnlichen pnpm-`node_modules`-Graphen auf. Ein Desktop-Plugin, das `dsh.client`-Code beisteuert, tritt erst in das Boot-manifest ein, nachdem das vollständige Profil die Gesundheitsprüfung bestanden hat.

## Updates und Wiederherstellung

Das Electron-Update verwendet einen `electron-updater`-Veröffentlichungsstrom und signierte `electron-builder`-Artefakte. Seine Version ist die Desktop-Veröffentlichungsversion; es gibt kein unabhängiges dsh-manifest, keinen Kompatibilitätsbereich und keine dsh-only-Update-Operation. Ein Vordergrund-Install wartet auf eine laufende Hintergrundprüfung, statt ihr Ergebnis als Install-Ergebnis wiederzuverwenden. Der Update-Dialog lädt das Electron-Artefakt herunter und installiert es, dann startet er in die neue Veröffentlichung neu.

Bevor die neue Veröffentlichung ein Fenster öffnet, gleicht der Start dsh aus seinem gepackten Seed ab und behält dabei installierte Desktop-Plugins. Die Gesundheitsprüfung deckt Abhängigkeitsauflösung, native Module, Shell-API-Kompatibilität, Backend-Start und -Shutdown, Web-Assets und den Client-Boot-Graphen ab. Ein inkompatibles Plugin blockiert die Aktivierung und lässt das vorherige Projekt für das Rollback verfügbar. Der Start schlägt sichtbar fehl, statt eine Shell- und dsh-Version zu starten, die nicht übereinstimmen.

`DSH_DESKTOP_AUTO_UPDATE_ENV` wählt standardmäßig das Test-Deployment oder das Produktions-Deployment sowohl für die zielspezifische Generic-provider-URL als auch für das COS-Ziel. Die Veröffentlichungsautomatisierung liefert den Test-HTTPS-Ursprung über `DOWNLOAD_TEST_ORIGIN` und den Bucket jedes Deployments über `DOWNLOAD_TEST_COS_BUCKET` oder `DOWNLOAD_PROD_COS_BUCKET`; das Fernhalten veränderlicher Test-Routing- und COS-Storage-Identitäten aus der Quelle lässt die Deployment-Infrastruktur sich ohne eine Code-Veröffentlichung ändern, während der öffentliche Produktions-Ursprung fest bleibt. Die Paketierung löst nur die öffentliche Updater-URL auf, deaktiviert electron-builder-Publishing, entfernt jedes COS-Credential-Feld aus seiner Subprozess-Umgebung und schreibt einen Abschlussdatensatz erst, nachdem electron-builder und jeder Signier- oder Notarisierungs-hook erfolgreich war. Der Ziel-Upload erfordert zusätzlich den ausgewählten Bucket, dann erfordert er, dass der Abschlussdatensatz, die Root-dsh-Version, die Desktop-Version, versionsabgeleitete Kanal-Metadaten, Artefaktnamen, Größen und SHA-512-Werte übereinstimmen, bevor er die ausgewählten Credentials liest oder Daten sendet. Er lädt unveränderliche versionierte Updater-Payloads und etwaige separate Blockmaps hoch, bevor er die von electron-builder emittierten Kanal-Metadaten ersetzt, und er löscht niemals historische Objekte. Stabile Versionen verwenden den `latest`-Metadatennamen; Prereleases verwenden den ersten Semver-Prerelease-Identifikator. NSIS bettet seine Blockmap in die signierte Executable ein; die macOS-ZIP trägt eine separate Blockmap. Beide lassen electron-updater geänderte Blöcke herunterladen, wenn unterstützt, während Anwendungsersatz und die lokale pnpm-Staging-Transaktion separate Operationen bleiben.

## Sicherheits- und Veröffentlichungs-Policy

Kern-dsh und der private Desktop-Host kommen nur aus integritätsprotokollierten lokalen npm-Tarballs innerhalb der signierten Electron-Veröffentlichung; pnpm-Overrides verhindern, dass transitive Kernpakete auf eine registry zurückfallen. Store-Archive sind integritätsgeprüft und in einem isolierten Extraktionsverzeichnis vollständig validiert, bevor ihre Dateien in beschreibbaren Paketzustand gelangen können. Die Plugin-Installation akzeptiert registry-Paketspezifikationen, die von der Desktop-Policy erlaubt sind, aber niemals rohe pnpm-Befehle. Exakte Versionen, Lockfile-Integrität, eine geprüfte `allowBuilds`-Menge, nur-Benutzer-Verzeichnisberechtigungen, geschwärzte Diagnosen und Gesundheitsprüfung sind vor der Aktivierung erforderlich.

Electron-Artefakte sind signiert; macOS-Artefakte sind notarisiert. Die Veröffentlichungsautomatisierung muss die Anwendungs-ID, den macOS-Developer-ID-Qualifier, die erwartete Team-ID und eine vollständige notarytool-Credential-Strategie über explizite Umgebungsvariablen liefern. Das Konfigurationsladen lehnt fehlende oder fehlerhafte Identifikatoren und unvollständige Notarisierungs-Credentials ab, während die macOS-Paketierung Signierung erfordert, sodass die Zertifikatsentdeckung nicht still eine andere installierte Identität wählen oder eine unsignierte Veröffentlichung emittieren kann. Die Seed-Vorbereitung verifiziert die exakte Authority und Team-ID plus die Timestamp- und Hardened-Runtime-Flags auf jeder eingebetteten Mach-O-Datei. Ein After-Sign-hook führt Apples tiefe strikte Anwendungsverifikation durch und erfordert dieselbe Leaf-Authority und Team-ID, bevor die Artefakterstellung fortgesetzt wird. Electron-builder notarisiert und heftet dann die Anwendung und signiert die DMG. Der DMG-Artefakt-Abschluss-hook notarisiert und heftet separat jede DMG, bevor er die konfigurierte Identität, ein gültiges Ticket und Gatekeeper-Akzeptanz erfordert; das Upload-Ereignis läuft erst, nachdem dieser hook erfolgreich war. DMG-Blockmaps sind deaktiviert, weil macOS-Updates die signierte ZIP konsumieren und das Heften anderweitig eine bereits generierte DMG-Blockmap invalidieren würde. Das benutzerdefinierte Protokoll serviert die installierte Frontend-Distribution plus Client-Dateien, die vom aktiven Modulgraphen benannt sind, und lehnt Traversal oder Zugriff außerhalb dieser Wurzeln ab. Die Plugin-Installer-API ist nur für die Electron-eigene Verwaltungs-GUI verfügbar und fehlt in der Browser-Anwendung und dem Backend-RPC.

Die Windows-Veröffentlichungspaketierung liefert das öffentliche EV-Leaf-Zertifikat, das `DSH_DESKTOP_WINDOWS_CER_FILE` benennt, an das konfigurierte SafeNet-kompatible SignTool über `/f` und identifiziert seinen passenden privaten Schlüssel über den erforderlichen `DSH_DESKTOP_WINDOWS_KEY_CONTAINER`. Die Zertifikatsdatei bleibt außerhalb der Quellverwaltung, und der private Schlüssel bleibt auf dem USB-token. Der electron-builder-hook übergibt jedes Artefakt an das CRLF-`windows-sign.cmd`, dessen einziger SignTool-Aufruf den SafeNet-`/kc "[{{PIN}}]=container"`-Wert und CSP, einen SHA-256-Dateidigest und einen DigiCert-SHA-256-RFC-3161-Timestamp verwendet. Der hook substituiert niemals ein anderes SignTool und wiederholt niemals einen fehlgeschlagenen Request. Die Paketorchestrierung hält jedes `DSH_DESKTOP_WINDOWS_*`-Feld von Build- und Seed-Vorbereitungs-Kindern fern und übergibt nur den Zertifikatspfad, SignTool-Pfad, Schlüsselcontainer und PIN an electron-builder. Der Signierer liefert nur validierte Signierfelder in einer ansonsten bereinigten CMD-Umgebung; die CMD deaktiviert verzögerte Expansion, löscht diese Felder, bevor SignTool startet, und bewahrt die PIN nur in der erforderlichen SignTool-Kommandozeile. Jede ausgegebene Diagnose ersetzt die PIN, und nur das dedizierte Build-Konto und Administratoren dürfen den Runner inspizieren. Der Signierer signiert electron-builders temporären NSIS-Bootstrap, bevor die Enterprise-Code-Integrity diese Executable bewertet, und löscht den Zertifikatstabelleneintrag einer generierten Executable nur, wenn er über die Datei hinaus zeigt, bevor die finale Signatur angewendet wird. Die Paketierung schlägt vor der Erzeugung unsignierter Artefakte fehl, wenn das SignTool, Zertifikat, der Container, die PIN, der token oder die Signatur nicht verfügbar ist. Das benutzerdefinierte Protokoll serviert die installierte Frontend-Distribution plus Client-Dateien, die vom aktiven Modulgraphen benannt sind, und lehnt Traversal oder Zugriff außerhalb dieser Wurzeln ab. Die Plugin-Installer-API ist nur für die Electron-eigene Verwaltungs-GUI verfügbar und fehlt in der Browser-Anwendung und dem Backend-RPC.

Gepackte Anwendungen ignorieren Entwicklungsressourcen- und Projekt-Umgebungs-Overrides. Nur ein ungepackter Electron-Prozess kann die Node.js-Binärdatei, den pnpm-Eintrag, den Seed oder das aktive Projekt ersetzen.

Das gebündelte Upstream-Node.js und pnpm werden voraussichtlich etwa 35–50 MB komprimiert und 120–165 MB installiert vor der Seed-Store-Teilmenge hinzufügen. Architekturspezifische Builds müssen tatsächliche komponentenbezogene Größendifferenzen melden.

## Implementierung

| Oberfläche | Implementierung |
|---|---|
| Shell | `apps/desktop` besitzt Electron-Fenster, eingeschränkte Preloads, das benutzerdefinierte Protokoll, den Kind-Lifecycle, Projekttransaktionen, die Plugin-GUI, Update-Koordination und electron-builder-Konfiguration. |
| Installierte Laufzeit | Das private `@deepseek-ai/dsh-desktop-host` bootet die portlose Desktop-Komposition aus dem aktiven Projekt und streamt API- und Asset-Antworten über validierte gerahmte Byte-Pipes. |
| Paketzustand | Der Veröffentlichungs-Seed und jede spätere Mutation laufen über gebündeltes Node.js und pnpm mit Desktop-eigenen Store-, Config-, Cache-, State- und Home-Pfaden; Kernpakete lösen sich aus Veröffentlichungs-Tarballs auf, während Plugins aus der festen npm-registry aufgelöst werden. |
| Qualifikation | Die macOS-Paketierung erfordert die konfigurierte Firmenidentität und Notar-Credentials, verifiziert jedes native Seed-Objekt nach der finalen Archiv-Extraktion, verifiziert die vollständige Anwendungssignatur und erfordert Notarisierung plus Gatekeeper-Akzeptanz sowohl für die Anwendung als auch für die DMG. Die Windows-Paketierung erfordert das konfigurierte öffentliche Zertifikat, den SafeNet-Private-Key-Container, das token-Passwort und SignTool und verifiziert jede erzeugte Signatur. Update-Hosting, Tests installierter Artefakte der Vorgängerversion und Plattform-GUI-Aufzeichnungen bleiben Veröffentlichungsumgebungs-Schranken. |

`dev:desktop` baut den aktuellen Workspace, projiziert die gebauten CLI- und privaten Desktop-Host-Pakete plus ihre Abhängigkeitslinks in ein Wegwerfprojekt, verwendet ein isoliertes Harness-Home, öffnet die Main-, Renderer- und Host-Debugger und startet ungepacktes Electron ohne Vorbereitung von Veröffentlichungsressourcen. Paketmutation ist in diesem Modus deaktiviert, weil sein verlinkter Abhängigkeitsgraph kein pnpm-installiertes Desktop-Projekt ist. Feste macOS-arm64-, macOS-x64- und Windows-x64-Paketbefehle führen ein Ziel durch Laufzeitvorbereitung, Seed-Installation und electron-builder; jedes hat auch eine Unpacked-Directory-Variante zur Veröffentlichungspfad-Verifikation vor der Installer-Generierung.

## Erwogene Alternativen

**Electrons Node.js für dsh verwenden.** Dies spart Paketgröße, koppelt dsh aber an Electrons Node-Patches, Fuses, native ABI, TLS-Verhalten und Prozess-Lifecycle. Ein gebündeltes Upstream-Node.js hält dsh auf seiner unterstützten Laufzeit.

**Fetch-Bodies über JSON-IPC als Base64 transportieren.** JSON-IPC behält einen Nachrichtenmechanismus, bläht aber jeden Request- und Response-Body auf, konstruiert große Strings in beiden Prozessen, puffert jeden Request vor dem Dispatch und doppelt-kodiert Bild-Bytes, die bereits als Base64 innerhalb von RPC-JSON dargestellt sind. Rohe gerahmte Pipes behalten ein explizites versioniertes Protokoll, ohne sich darauf zu verlassen, dass Electron und Upstream-Node.js das V8-Serialisierungsverhalten teilen.

**Die Produkt-Web-UI in Electron einbrennen.** Unabhängige UI- und Backend-Updates würden ein neues versioniertes Kompatibilitätsprogramm erfordern. Das Installieren von Backend und Web-UI aus demselben dsh-Paket bewahrt die aktuelle Veröffentlichungsbindung.

**Den bestehenden CLI- oder Browser-Plugin-Installer wiederverwenden.** Dies überschreitet den Desktop-Autorisierungs- und Veröffentlichungsumfang und kann den Paketmanager-Zustand des Benutzers verwenden. Die Desktop-Paketmutation bleibt ausschließlich im Besitz von Electron.

**Das Desktop-Profil CLI-verwaltete Pakete oder Plugins verwenden lassen.** Jedes Produkt könnte den Abhängigkeitsgraph, die Cordis-Version, die Plugin-Version oder das native Modul des anderen ändern. Das Desktop-Profil besitzt daher ein vollständiges `node_modules` und lehnt die Bundle-Auflösung über den CLI-Profil-Fallback ab.

**dsh und Plugins in separate Desktop-Projekte installieren.** Dies erzeugt einen zweiten Auflösungsanker und einen peer-dependency-Fallback. Ein gewöhnliches npm-Projekt liefert bereits das erforderliche Installations- und Auflösungsmodell.

**Nicht-Ziel-Mach-O-Dateien aus registry-Paketen entfernen.** Architektur-Beschneidung spart wenig Seed-Platz, aber Pakete können absichtlich mehrere Architekturvarianten ausliefern, und Aufrufer können ihre installierte Dateimenge beobachten. Das Signieren jedes ausgelieferten Mach-O-Objekts erfüllt die Notarisierung, ohne ein Desktop-spezifisches Paketlayout zu erfinden.

**Den Windows-EV-Private-Key in eine PFX-Datei exportieren.** Das extern gelieferte öffentliche Leaf-Zertifikat lässt SignTool die Signatur konstruieren, während `/csp` und `/kc` den Hardware-Schlüssel lokalisieren. Der EV-Private-Key bleibt nicht-exportierbar auf dem token.

**Ein Credential-tragendes Signierskript committen oder das token-Passwort persistieren.** Eine Credential-tragende CMD-Datei, `.env` oder Windows-Benutzer- oder Systemumgebungsvariable lässt das token-Passwort ruhend wiederherstellbar. Die eingecheckte CMD enthält nur Umgebungsvariablenreferenzen, und der Paketierungsschritt akzeptiert das Passwort als ephemeres Runner-Geheimnis.

**electron-builder oder einen allgemeinen Verzeichnis-Sync direkt veröffentlichen lassen.** Ein direkter Publisher kann Kanal-Metadaten exponieren, bevor jedes referenzierte Artefakt existiert, stale- oder zielübergreifende Dateien in eine Veröffentlichung mischen und kann nicht beweisen, dass der vollständige signierte Build noch der aktuellen dsh-Version entspricht. Ein zielspezifischer validierter Upload hält Veröffentlichungsreihenfolge und Veröffentlichungsidentität explizit.

## Konsequenzen

- Eine saubere Offline-Maschine ohne System-Node.js oder pnpm installiert den Seed in `.dsh/profiles/desktop` und startet eine funktionierende dsh-Session.
- Die signierte Anwendung inventarisiert eine feste kleine Menge von Seed-Store-Shards statt jeder pnpm-Cache-Datei; jedes Mach-O-Objekt in den macOS-Shards hat die Veröffentlichungs-Developer-ID, den sicheren Timestamp und Hardened-Runtime, jedes Windows-Artefakt hat die konfigurierte hardwaregestützte EV-Signatur, und der installierte private Store behält das gewöhnliche pnpm-Layout.
- `.dsh/profiles/desktop/node_modules` enthält und löst das Desktop-dsh-Paket und jedes GUI-installierte Desktop-Plugin auf.
- Jede Desktop-pnpm-Operation verwendet die gebündelte Executable und `.dsh/desktop/pnpm/store`; keine liest Benutzer-`PATH`, Config, Store oder Profil-`node_modules`.
- Die Electron-only-GUI installiert, entfernt und aktualisiert gewöhnliche npm-Plugin-Pakete ohne rohe pnpm-Argumente zu exponieren.
- Das Backend und die Browser-Anwendung können keine Desktop-Pakete mutieren.
- npm/CLI-dsh und Electron lösen niemals Plugins aus dem `node_modules` des jeweils anderen auf oder installieren daraus.
- Das aktive Backend und die Web-UI melden dieselbe dsh-Version und eine kompatible Shell-API, bevor das Produktfenster sich öffnet.
- Fehlgeschlagene Installation, Gesundheitsprüfung oder Update lässt das aktuelle Profil nutzbar oder stellt `rollback/profile` nach dem Neustart wieder her.
- Eine Desktop-Version bindet Electron und dsh; jedes dsh-Update kommt über einen Electron-Update-Dialog und einen benutzersichtbaren Neustart an.
- Geteilte `.dsh`-Daten lehnen inkompatible Leser vor der Migration oder Mutation ab.
- Kein Loopback-Listener wird geöffnet, und der gesandboxte Renderer kann nicht auf beliebiges Dateisystem oder Electron-APIs zugreifen.
- Die Workspace-Entwicklung läuft mit aktuellem gebauten Code ohne Herunterladen von Veröffentlichungsressourcen, während die Unpacked-Paket-Verifikation den Produktions-Installationspfad bewahrt.
- Die Windows-Veröffentlichungspaketierung erfordert das validierte SignTool, den EV-token, das passende öffentliche Leaf-Zertifikat, das token-Passwort und einen expliziten Schlüsselcontainer; sie fällt niemals auf ein unsigniertes Artefakt oder eine exportierbare Schlüsseldatei zurück.
- Ein Ziel-Update kann keine neuen Kanal-Metadaten exponieren, bis der vollständige signierte Build und jedes referenzierte Artefakt die Veröffentlichungsvalidierung besteht; beibehaltene historische Artefakte bleiben für differenzielle Updates verfügbar.
- Signierte installierte Artefakte aktualisieren erfolgreich von der vorherigen unterstützten Veröffentlichung auf jeder veröffentlichungsblockierenden Plattform.

## Review-Entscheidungen

| Entscheidung | Empfehlung |
|---|---|
| Erster Start | Eine Offline-Seed-Store-Teilmenge bündeln und über pnpm installieren |
| Desktop-Profil | Ein Electron-eigenes reserviertes Profil mit exakten dsh- und Plugin-Abhängigkeiten |
| Plugin-Verwaltung | Electron-only-GUI und Paket-Service; kein CLI-, Backend- oder Browser-Installationspfad |
| Aktivierung | Staging-Projekt, vollständige Gesundheitsprüfung, journalierter Verzeichnisersatz, eine Rollback-Kopie |
| Initiale Plattformen | macOS arm64/x64 und Windows x64; Linux hat kein unterstütztes Veröffentlichungsziel |
| Update-Verhalten | Hintergrundprüfung, explizite Bestätigung vor differenziellem Download und Neustart, Startup-dsh-Abgleich |

## Risiken

Plugin-Lifecycle-Skripte führen Drittanbieter-Code aus. Die erlaubte registry, Paket-Policy, exakte Versionen, Integrität, `allowBuilds` und Diagnosen erfordern ein Security-Review, bevor die GUI-Installation ausgeliefert wird.

Das Aktualisieren des gebundenen dsh kann Plugin-peer-dependencies oder native Module invalidieren. pnpm-Auflösung und die Gesamtheit-Projekt-Gesundheitsprüfung müssen das gestagte Projekt ablehnen, bevor das aktive ersetzt wird.

Ein npm-installiertes dsh und Desktop-dsh können unterschiedliche Versionen haben, während sie dauerhafte Daten teilen. Jeder geteilte Eigentümer muss seine Formatversion und Prozesssperre vor dem Lesen, Migrieren oder Schreiben durchsetzen.

Verzeichnisersatz unterscheidet sich zwischen Betriebssystemen und kann unterbrochen werden. Das Aktivierungsjournal und installierte-Artefakt-Fehlertests müssen die Wiederherstellung bei jedem Dateisystem-Move beweisen.

Code-Signierung, Notarisierung und Update-Hosting erfordern Produktions-Veröffentlichungsinfrastruktur. Repository-Tests allein können diese Qualifikation nicht vollenden.
