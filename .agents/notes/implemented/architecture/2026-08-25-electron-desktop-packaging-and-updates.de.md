# Agent Note: Electron-Desktop-Anwendung paketieren und aktualisieren

Status: implemented

[English](2026-08-25-electron-desktop-packaging-and-updates.md) | [中文](2026-08-25-electron-desktop-packaging-and-updates.zh.md) | Deutsch

## Problem

DeepSeek Harness benötigt eine Electron-Desktop-Anwendung, die die Web UI wiederverwendet, ohne systemweites Node.js oder pnpm auskommt, dsh und Desktop-Plugins über ein in der Anwendung gebündeltes pnpm installiert und das gesamte Desktop-Release über einen einzigen benutzerseitigen Ablauf aktualisiert.

Die Desktop-Anwendung und ein per npm installiertes dsh teilen sich den `.dsh`-Datenstamm, können aber unterschiedliche dsh- und Plugin-Versionen haben. Sie müssen unterstützte Produktdaten teilen, ohne ausführbare Pakete, Lockfiles, `node_modules`, Plugin-Aktivierung oder Package-Manager-Konfiguration zu teilen.

Das aktuelle GUI-Protokoll bindet den Web-Client und das Backend-Release aneinander. Electron-Artefakt und sein per pnpm installiertes dsh unabhängig zu versionieren würde nicht qualifizierte Kombinationen aus Shell, Client, Backend und Plugins erzeugen und die Update-Verfügbarkeit mehrdeutig machen.

## Entscheidung

Wir liefern eine kleine Electron-Shell mit gebündeltem Upstream-Node.js und gepinntem pnpm aus. Electron startet das private Desktop-Host-Paket als isolierten Child-Prozess; dieses Paket komponiert das installierte dsh-Backend und den passenden Client-Graphen. Fetch-Metadaten und begrenzte rohe Request- und Response-Chunks laufen über zwei versionierte gerahmte Byte-Pipes; Node-IPC ist für Readiness, fatale Fehler und Shutdown reserviert, und Electron liefert validierte Assets über `dsh-app://` aus — es öffnet keinen lauschenden Port. Jeder Frame trägt eine feste Markierung, einen Typ, eine monotone Stream-ID, die Payload-Länge und eine validierte Payload. Serialisierte Writer respektieren Pipe-Drain, Reader pausieren global, sobald ein Request- oder Response-Stream Backpressure anwendet, ein Abbruch schließt den zugehörigen Stream, und verspätete Response-Frames für einen ausgemusterten Stream bleiben wirkungslos. Das Connection-Plugin stellt seine carrier-neutralen RPC- und Fetch-Registries ohne `webServer` bereit, während Client Modules die exakt angekündigten Combo-Bundle-Responses für den Shell-eigenen Carrier liefert; Web-Kompositionen hängen ihre optionalen HTTP-Routen für beide an. Der Renderer behält dieselben Fetch-, RPC- und Remote-Stream-Formate, während der Child-Carrier Base64-Aufblähung und V8-Serialisierungskompatibilität zwischen Electron und dem gebündelten Upstream-Node.js vermeidet. Electron schließt seinen Request-Pipe-Writer nach dem Senden von Shutdown und gibt damit einen laufenden Windows-Pipe-Read frei, bevor es auf das Child-Exit wartet. Dies folgt der Electron-Reservierung in der [Agent Note zu GUI-Layering und RPC-Protokoll](../../archived/architecture/2026-07-19-gui-layering-and-rpc-protocol.md).

Electron besitzt das reservierte Profil unter `.dsh/profiles/desktop`. Seine exakte `@deepseek-ai/dsh`-Dependency liefert Backend und passende Web UI, während die passende private `@deepseek-ai/dsh-desktop-host`-Dependency nur den Electron-Child-Prozess-Einstieg und das Composition-Overlay liefert. Das dsh-Release, der private Host und ihre First-Party-Dependency-Closures nutzen lokale npm-Tarballs, die aus demselben Quell-Build gepackt wurden; das Profil-manifest führt jedes Core-Paket als lokale `file:`-Dependency, und `pnpm-workspace.yaml` wiederholt die Zuordnung als Overrides. Der Host bleibt außerhalb des öffentlichen CLI-Pakets und wird niemals auf npm veröffentlicht. Desktop-Plugins sind zusätzliche Registry-npm-Dependencies und geordnete `dsh.profile.bundles`-Einträge im selben Profil und lösen aus dessen einzigem `node_modules` auf.

Eine einzige Desktop-Release-Nummer bezeichnet das Electron-Artefakt und seine exakten `@deepseek-ai/dsh`- und `@deepseek-ai/dsh-desktop-host`-Dependencies. Ein Release kann zur Build- oder Laufzeit keine andere Core-Version wählen. Ein dsh-Update erfordert daher ein neues Electron-Release, selbst wenn der Shell-Code unverändert ist.

Die Browser-Web-UI, das dsh-Backend, die bestehende `dsh plugin`-CLI, das npm und das pnpm des Benutzers können dieses Profil nicht verändern. Die CLI reserviert jede Schreibvariante des Namens `desktop` und lehnt Boot-, Config-Dump- und Plugin-Management-Anfragen dafür ab. Electron erwirbt seinen prozesslebenslangen Single-Instance-Lock vor Projekt-Recovery oder Host-Start; spätere Starts fokussieren oder erzeugen das Hauptfenster neu, ohne den Profilzustand anzufassen. Eine Electron-exklusive GUI sendet strukturierte Install-, Remove- und Update-Anfragen über das Preload; Electron ruft ausschließlich sein gebündeltes pnpm auf.

## Zuständigkeiten

| Besitzer | Verantwortung |
|---|---|
| Electron-Shell | Fenster- und Child-Lifecycle, gerahmte Byte-Pipes, Lifecycle-IPC, Custom Protocol, reserviertes Desktop-Profil, Plugin-GUI, Update-Koordination, Rollback |
| Gebündeltes Node.js und pnpm | dsh ausführen und exakte Desktop-Projekt-Dependencies installieren, ohne `PATH` oder pnpm-Zustand des Benutzers zu konsultieren |
| Desktop-Profil | Ein Dependency-Graph, geordnete Bundle-Liste und `node_modules` für das Desktop-dsh-Paket und Desktop-Plugins |
| Privates Desktop-Host-Paket | Electron-exklusiver Child-Prozess-Einstieg und Composition-Overlay, mit dsh installiert, aber aus dem öffentlichen CLI-Paket und der npm-Veröffentlichung ausgenommen |
| Installiertes dsh-Paket | Backend, passende Web UI, Boot-manifest, Client-Bundles und Produktverhalten |
| Geteilte `.dsh`-Besitzer | Sessions, Settings, Credentials, Workspaces und Storage, abgesichert durch ihre bestehenden Locks und Formatversionen |
| Per npm installiertes dsh | Seine eigene ausführbare Installation und benutzerverwaltete Profile; kein Zugriff auf das reservierte Desktop-Profil oder den Paketzustand |

Der Renderer nutzt `nodeIntegration: false`, `contextIsolation: true` und `sandbox: true`. Das Preload exponiert typisierte RPC-, Lifecycle-, Update-, Locale- und Desktop-Plugin-Aktionen statt rohem `ipcRenderer`, Dateisystemzugriff, Shell-Befehlen oder pnpm-Argumenten. Electron wählt anhand seiner Anwendungslocale ein typisiertes englisches oder chinesisches Dictionary und fällt auf Englisch zurück; Menüs, native Dialoge und der Plugin-Management-Renderer verwenden diese locale-eigenen Texte.

## Dateisystemlayout

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

`.dsh/profiles/desktop` ist das einzige aktive Desktop-Profil. Sein Paket-manifest hält die Bundle-Reihenfolge eingebauter und installierter Plugins fest; allein Electron verändert dessen Dependencies, Lockfile und `node_modules`. Der Produktionsstart lehnt ein Bundle ab, das außerhalb dieses Profils aufgelöst wird — einschließlich des von der CLI gepflegten `.dsh/profiles/node_modules`-Fallbacks. Paketinhalte, die für das Desktop-Profil installiert werden, nutzen `.dsh/desktop/pnpm/store`.

## Installation und Auflösung

Der Installer verändert das aktive Profil niemals in-place. Er kopiert die Profilmetadaten in ein transaktionales Staging-Verzeichnis und wendet eine exakte Dependency-Änderung mit dem gebündelten pnpm an. Bevor er Staging testet, stoppt Electron das aktive Backend; es startet und stoppt das gestagte Backend allein und stellt danach das aktive Backend vor der Aktivierung wieder her, sodass niemals zwei Desktop-Backends gleichzeitig `.dsh`-Zustand teilen. Die Aktivierung stoppt das Backend erneut, persistiert jede nächste `pending.json`-Phase vor dem zugehörigen Dateisystem-Move, verschiebt das aktive Profil nach `rollback/profile`, verschiebt Staging nach `.dsh/profiles/desktop` und startet neu. Die Recovery kombiniert die Write-ahead-Phase mit den tatsächlichen Active-, Rollback- und Staging-Verzeichnissen, sodass beide Write-to-Move-Unterbrechungen ein vollständiges Profil bewahren oder wiederherstellen.

Der prozesslebenslange Electron-Lock ist der autoritative Desktop-Besitzer. Der Pakettransaktions-Lock ist Tiefenverteidigung und zeichnet den Prozess auf, der den Paketzustand noch verändern kann: Electron zwischen Paketoperationen und die gespawnte pnpm-PID, während pnpm läuft. Der Besitzerwechsel wird über die bereits offene exklusive Lock-Datei gekürzt, geschrieben und synchronisiert. Terminiert Electron während der pnpm-Ausführung, beobachtet ein späterer Prozess den laufenden Worker und lehnt den Start einer konkurrierenden Store- oder Staging-Transaktion ab; nach dem Exit dieses Workers kann die verwaiste PID recycelt werden.

Der gepackte Seed ist ein Offline-Installationskit, kein ausführbarer dsh-Baum. Er enthält die Release-Identität, das initiale Desktop-Projekt-manifest, einen Deskriptor und unveränderliche Tarballs für die Vereinigung der First-Party-Paket-Closures mit Wurzel bei dsh und dem privaten Desktop Host, Lockfile, Integritätsinventar und die benötigte Store-Teilmenge. Jeder `mac-arm64`-, `mac-x64`- und `win-x64`-Build besitzt seine gepackten Pakete, Runtime, Paketmenge, Seed, pnpm-Vorbereitungszustand, entpackte Anwendung, Update-Metadaten und finalen Artefakte unter `.desktop-build/targets/<target>`; geteilt wird nur der unveränderliche, checksum-verifizierte Node.js-Download-Cache. Der Release-Build verlangt, dass Electron-Paket, Root-dsh-Paket und privates Host-Paket dieselbe Version haben, erzeugt finale npm-Tarballs aus dem offiziellen Quell-Build, packt den privaten Host lokal, wählt die erreichbaren dsh-, Host- und vendorten Pakete plus den Landlock-Eintrag aus und verifiziert, dass der Host-Tarball `lib/index.js` und `config/desktop.cordis.patch.yml` enthält. Das `files`-manifest des Hosts enthält nur diesen Runtime-Einstieg und das Overlay, und das Paket wird niemals auf npm veröffentlicht. Öffentliche Paket-Tarballs bleiben die offiziellen `pnpm pack`-Ergebnisse, die vom Publikationsmanifest jedes Pakets geregelt werden; Desktop entfernt keine publizierten Deklarationen und schafft sonst keine zweite Paketinhalts-Policy. Das Seed-manifest führt jedes gewählte Paket als lokale direkte Dependency, automatische Peer-Installation ist deaktiviert, und die Workspace-Datei überschreibt jeden gewählten First-Party-Namen mit seinem lokalen Tarball. Das Ziel-Node.js führt das gebündelte pnpm aus, sodass pnpms Betriebssystem- und CPU-Auswahl den materialisierten Dependency-Graphen und den Seed zielspezifisch macht. Das gebündelte pnpm deaktiviert seinen globalen virtuellen Store, materialisiert externe Produktions-Dependencies aus npm ohne Lifecycle-Skripte, löscht `node_modules` sowie jedes temporäre pnpm-Cache-, Config- und State-Verzeichnis und führt dann eine saubere Offline-Installation allein aus dem finalen Store durch und prüft den privaten Host-Einstieg und das Overlay. Der Build lehnt jedes Lockfile ab, das einen der lokalen First-Party-Namen über eine Registry-Version auflöst. Die Inventarerzeugung folgt der Entfernung dieses zweiten `node_modules`-Baums und der temporären pnpm-Projekt-Registrierungen. Die Forderung nach beiden Host-Dateien vor dem Kopieren der Paketmenge und nach der Offline-Installation verhindert, dass ein Release, dessen Prozesseinstieg lädt, aber sein erforderliches Overlay nicht komponieren kann, die Anwendungssignierung erreicht.

Der Seed speichert pnpm-Inhalte in 16 deterministischen unkomprimierten Tar-Shards, die über den normalisierten Store-Pfad gewählt werden. Die Apple-Notarisierung inspiziert Mach-O-Code in diesen Archiven, daher stagt die macOS-Seed-Vorbereitung jedes referenzierte content-addressed Mach-O-Objekt und führt höchstens vier unabhängige Developer-ID-Signer parallel mit sicherem Zeitstempel und Hardened Runtime aus. Ein Signer-Fehler wird erst sichtbar, nachdem jeder aktive Signer beendet ist, und lässt die ursprünglichen CAS-Objekte und den Paketindex unverändert. Nachdem alle Signer erfolgreich waren, schreibt die Vorbereitung jedes Objekt an seinen neuen SHA-512-Pfad und schreibt transaktional jede Base- und Side-Effects-Dateireferenz in pnpms MessagePack-SQLite-Index um. Eine zweite Offline-Installation beweist, dass pnpm den umgeschriebenen Store auflöst; die Vorbereitung shardet ihn dann, extrahiert die finalen Archive und verifiziert jede eingebettete Signatur. Paketpfade und nicht-native Bytes bleiben unverändert, und der Seed behält gebündelte Architekturvarianten, weil das Entfernen von Dateien eine Desktop-spezifische Paketdateimenge erzeugen würde. Die Seed-Integrität deckt das Shard-manifest und jedes Archiv vor der Extraktion ab. Der Startup validiert Archivpfade, Eintragstypen, Eindeutigkeit und Anzahlen, extrahiert jeden Shard in ein eindeutiges Desktop-eigenes Staging-Verzeichnis, ersetzt passende unveränderliche Store-Dateien und merged transaktional den SQLite `package_index` jeder pnpm-Store-Version nach `.dsh/desktop/pnpm/store`. Seed-Records ersetzen passende Schlüssel, während für Desktop-Plugins heruntergeladene Records bestehen bleiben. Ein unterbrochener Datei-Merge kann gültige unveränderliche Cache-Inhalte hinterlassen, aber jeder SQLite-Merge ist atomar, und Profilinstallation und -aktivierung verlangen weiterhin pnpm-Integrität und den vollständigen Health Check.

Der Startup verlangt, dass die gepackte Release-Identität der Anwendungsversion von Electron entspricht, und vergleicht dann `.dsh/profiles/desktop/desktop-release.json` sowie die installierten dsh- und Desktop-Host-Pakete mit diesem Release, bevor er das Backend startet. Er installiert das neue Seed-manifest und Lockfile mit `pnpm install --offline --frozen-lockfile --trust-lockfile` im Staging. Nach dem Ersetzen von Electron stellt er jedes im aktiven Profil aufgezeichnete Plugin-Bundle in seiner exakten installierten Version wieder her — über ein einziges Offline-`pnpm add` aus dem vorhandenen Desktop-Store und Metadaten-Cache. Der vollständige Graph muss denselben Health Check vor der Aktivierung bestehen.

Die Plugin-GUI führt Registry-npm-Paketoperationen aus, die `pnpm add <package> --save-exact`, `pnpm remove <package>` und einem exakt-versionierten Update im Staging entsprechen. Jede Mutation behält den lokalen Core-Paket-Deskriptor, die Tarballs, die dsh- und Desktop-Host-Dependencies und die vollständige Override-Map. Electron validiert das installierte Paket-manifest und aktualisiert die Dependency- und geordneten Bundle-Einträge des Profils; kein Renderer-Request kann Registry, Installationsverzeichnis, Lifecycle-Policy oder beliebige pnpm-Flags wählen.

Backend und Loader nutzen `.dsh/profiles/desktop/package.json` als Profil-manifest und npm-Auflösungsanker. Der geteilte Profil-Loader komponiert dessen geordnete Bundle-Einträge, dann wendet der private Desktop Host sein gepacktes Overlay an. Host, dsh, Cordis, Desktop-Plugins, Plugin-Dependencies und Peer Dependencies lösen über den gewöhnlichen pnpm-`node_modules`-Graphen auf. Ein Desktop-Plugin, das `dsh.client`-Code beisteuert, gelangt erst in das Boot-manifest, nachdem das vollständige Profil den Health Check bestanden hat.

## Updates und Recovery

Das Electron-Update nutzt einen einzigen `electron-updater`-Release-Stream und signierte `electron-builder`-Artefakte. Seine Version ist die Desktop-Release-Version; es gibt kein unabhängiges dsh-manifest, keinen Kompatibilitätsbereich und keine dsh-only-Update-Operation. Eine Vordergrund-Installation wartet auf einen laufenden Hintergrund-Check, statt dessen Ergebnis als Installationsergebnis wiederzuverwenden. Der Update-Dialog lädt das Electron-Artefakt herunter, installiert es und startet dann in das neue Release.

Bevor das neue Release ein Fenster öffnet, gleicht der Startup dsh aus seinem gepackten Seed ab und behält dabei installierte Desktop-Plugins. Der Health Check deckt Dependency-Auflösung, native Module, Shell-API-Kompatibilität, Backend-Start und -Shutdown, Web-Assets und den Client-Boot-Graphen ab. Ein inkompatibles Plugin blockiert die Aktivierung und lässt das vorherige Projekt für den Rollback verfügbar. Der Startup scheitert sichtbar, statt eine Shell- und eine dsh-Version zu starten, die nicht zusammenpassen.

`DSH_DESKTOP_AUTO_UPDATE_ENV` wählt standardmäßig das Test-Deployment oder das Produktions-Deployment — sowohl für die zielspezifische Generic-Provider-URL als auch für das COS-Ziel. Die Release-Automation liefert den Test-HTTPS-Origin über `DOWNLOAD_TEST_ORIGIN` und den Bucket jedes Deployments über `DOWNLOAD_TEST_COS_BUCKET` oder `DOWNLOAD_PROD_COS_BUCKET`; veränderbares Test-Routing und COS-Storage-Identitäten aus dem Quellcode herauszuhalten erlaubt Änderungen an der Deployment-Infrastruktur ohne Code-Release, während der öffentliche Produktions-Origin fest bleibt. Das Packaging löst nur die öffentliche Updater-URL auf, deaktiviert electron-builder-Publishing, entfernt jedes COS-Credential-Feld aus der Subprozess-Umgebung und schreibt einen Completion-Record erst, nachdem electron-builder und jeder Signing- oder Notarization-Hook erfolgreich waren. Der Target-Upload verlangt zusätzlich den gewählten Bucket, dann verlangt er, dass Completion-Record, Root-dsh-Version, Desktop-Version, versionsabgeleitete Channel-Metadaten, Artefaktnamen, -größen und SHA-512-Werte übereinstimmen, bevor er die gewählten Credentials liest oder Daten sendet. Er lädt unveränderliche versionierte Updater-Payloads und etwaige separate Blockmaps hoch, bevor er die von electron-builder emittierten Channel-Metadaten ersetzt, und er löscht niemals historische Objekte. Stabile Versionen verwenden den Metadatennamen `latest`; Prereleases verwenden den ersten Semver-Prerelease-Bezeichner. NSIS bettet seine Blockmap in die signierte ausführbare Datei ein; das macOS-ZIP trägt eine separate Blockmap. Beide lassen electron-updater geänderte Blöcke herunterladen, wo unterstützt, während Anwendungsersatz und die lokale pnpm-Staging-Transaktion getrennte Operationen bleiben.

## Sicherheits- und Release-Policy

Core-dsh und der private Desktop Host kommen ausschließlich aus integritätsgesicherten lokalen npm-Tarballs innerhalb des signierten Electron-Releases; pnpm-Overrides verhindern, dass transitive Core-Pakete auf eine Registry zurückfallen. Store-Archive werden integritätsgeprüft und in einem isolierten Extraktionsverzeichnis vollständig validiert, bevor ihre Dateien in schreibbaren Paketzustand gelangen können. Die Plugin-Installation akzeptiert Registry-Paketangaben, die die Desktop-Policy erlaubt, aber niemals rohe pnpm-Befehle. Exakte Versionen, Lockfile-Integrität, eine geprüfte `allowBuilds`-Menge, nur-benutzer-Verzeichnisberechtigungen, geschwärzte Diagnosen und der Health Check sind vor der Aktivierung erforderlich.

Electron-Artefakte sind signiert; macOS-Artefakte sind notarisiert. Die Release-Automation muss die Anwendungs-ID, den macOS-Developer-ID-Qualifier, die erwartete Team-ID und eine vollständige notarytool-Credential-Strategie über explizite Umgebungsvariablen bereitstellen. Das Laden der Konfiguration lehnt fehlende oder fehlerhafte Bezeichner und unvollständige Notarisierungs-Credentials ab, während das macOS-Packaging Signing verlangt, damit die Zertifikatsermittlung nicht stillschweigend eine andere installierte Identität wählt oder ein unsigniertes Release ausgibt. Die Seed-Vorbereitung verifiziert die exakte Authority und Team-ID sowie die Zeitstempel- und Hardened-Runtime-Flags auf jeder eingebetteten Mach-O-Datei. Ein After-Sign-Hook führt Apples strikte Tiefenverifikation der Anwendung durch und verlangt dieselbe Leaf-Authority und Team-ID, bevor die Artefakterstellung fortgesetzt wird. Electron-builder notarisiert und stapelt dann die Anwendung und signiert das DMG. Der DMG-Artefakt-Completion-Hook notarisiert und stapelt jedes DMG separat, bevor er die konfigurierte Identität, ein gültiges Ticket und Gatekeeper-Akzeptanz verlangt; das Upload-Ereignis läuft erst nach Erfolg dieses Hooks. DMG-Blockmaps sind deaktiviert, weil macOS-Updates das signierte ZIP konsumieren und Stapling eine bereits erzeugte DMG-Blockmap sonst invalidieren würde. Das Custom Protocol liefert die installierte Frontend-Distribution plus die vom aktiven Modulgraphen benannten Client-Dateien aus und lehnt Traversal oder Zugriffe außerhalb dieser Wurzeln ab. Die Plugin-Installer-API steht nur der Electron-eigenen Management-GUI zur Verfügung und fehlt in Browser-Anwendung und Backend-RPC.

Das Windows-Release-Packaging liefert das von `DSH_DESKTOP_WINDOWS_CER_FILE` benannte öffentliche EV-Leaf-Zertifikat an das konfigurierte SafeNet-kompatible SignTool über `/f` und identifiziert den zugehörigen privaten Schlüssel über den erforderlichen `DSH_DESKTOP_WINDOWS_KEY_CONTAINER`. Die Zertifikatsdatei bleibt außerhalb der Quellverwaltung, und der private Schlüssel bleibt auf dem USB-Token. Der electron-builder-Hook übergibt jedes Artefakt an das CRLF-`windows-sign.cmd`, dessen einziger SignTool-Aufruf den SafeNet-Wert `/kc "[{{PIN}}]=container"` und CSP, einen SHA-256-Dateidigest und einen DigiCert-SHA-256-RFC-3161-Zeitstempel nutzt. Der Hook ersetzt niemals ein anderes SignTool und wiederholt niemals eine fehlgeschlagene Anfrage. Die Paketorchestrierung hält jedes `DSH_DESKTOP_WINDOWS_*`-Feld von Build- und Seed-Vorbereitungs-Kindprozessen fern und übergibt nur Zertifikatspfad, SignTool-Pfad, Schlüsselcontainer und PIN an electron-builder. Der Signer versorgt nur validierte Signing-Felder in einer ansonsten bereinigten CMD-Umgebung; die CMD deaktiviert verzögerte Expansion, leert diese Felder bevor SignTool startet und bewahrt die PIN nur in der erforderlichen SignTool-Kommandozeile. Jede ausgegebene Diagnose ersetzt die PIN, und nur das dedizierte Build-Konto und Administratoren dürfen den Runner einsehen. Der Signer signiert electron-builders temporären NSIS-Bootstrap, bevor die Enterprise Code Integrity diese ausführbare Datei auswertet, und löscht den Certificate-Table-Eintrag einer erzeugten ausführbaren Datei nur, wenn er über das Dateiende hinaus zeigt, bevor die finale Signatur angebracht wird. Das Packaging scheitert vor der Erzeugung unsignierter Artefakte, wenn SignTool, Zertifikat, Container, PIN, Token oder Signatur nicht verfügbar sind. Das Custom Protocol liefert die installierte Frontend-Distribution plus die vom aktiven Modulgraphen benannten Client-Dateien aus und lehnt Traversal oder Zugriffe außerhalb dieser Wurzeln ab. Die Plugin-Installer-API steht nur der Electron-eigenen Management-GUI zur Verfügung und fehlt in Browser-Anwendung und Backend-RPC.

Gepackte Anwendungen ignorieren Development-Resource- und Projekt-Umgebungs-Overrides. Nur ein ungepackter Electron-Prozess kann die Node.js-Binary, den pnpm-Einstieg, den Seed oder das aktive Projekt ersetzen.

Von gebündeltem Upstream-Node.js und pnpm wird erwartet, dass sie etwa 35–50 MB komprimiert und 120–165 MB installiert hinzufügen — vor der Seed-Store-Teilmenge. Architekturspezifische Builds müssen die tatsächlichen komponentenbezogenen Größendifferenzen ausweisen.

## Implementierung

| Oberfläche | Implementierung |
|---|---|
| Shell | `apps/desktop` besitzt Electron-Fenster, eingeschränkte Preloads, das Custom Protocol, den Child-Lifecycle, Projekttransaktionen, die Plugin-GUI, die Update-Koordination und die electron-builder-Konfiguration. |
| Installierte Runtime | Das private `@deepseek-ai/dsh-desktop-host` bootet die portlose Desktop-Komposition aus dem aktiven Projekt und streamt API- und Asset-Responses über validierte gerahmte Byte-Pipes. |
| Paketzustand | Der Release-Seed und jede spätere Mutation laufen über gebündeltes Node.js und pnpm mit Desktop-eigenen Store-, Config-, Cache-, State- und Home-Pfaden; Core-Pakete lösen aus Release-Tarballs auf, während Plugins aus der festen npm-Registry auflösen. |
| Qualifizierung | Das macOS-Packaging verlangt die konfigurierte Unternehmensidentität und Notary-Credentials, verifiziert jedes native Seed-Objekt nach der finalen Archivextraktion, verifiziert die fertige Anwendungssignatur und verlangt Notarisierung plus Gatekeeper-Akzeptanz für Anwendung und DMG. Das Windows-Packaging verlangt das konfigurierte öffentliche Zertifikat, den SafeNet-Private-Key-Container, das Token Password und SignTool und verifiziert jede erzeugte Signatur. Update-Hosting, Installationsartefakt-Tests der Vorgängerversion und Plattform-GUI-Aufzeichnungen bleiben Release-Umgebungs-Gates. |

`dev:desktop` baut den aktuellen Workspace, projiziert die gebauten CLI- und privaten Desktop-Host-Pakete samt ihrer Dependency-Links in ein Wegwerfprojekt, nutzt ein isoliertes Harness-Home, öffnet die Main-, Renderer- und Host-Debugger und startet ungepacktes Electron, ohne Release-Ressourcen vorzubereiten. Paketmutation ist in diesem Modus deaktiviert, weil sein gelinkter Dependency-Graph kein per pnpm installiertes Desktop-Projekt ist. Feste macOS-arm64-, macOS-x64- und Windows-x64-Paketbefehle führen ein Ziel durch Runtime-Vorbereitung, Seed-Installation und electron-builder; jeder hat zudem eine Unpacked-Directory-Variante zur Release-Pfad-Verifikation vor der Installer-Erzeugung.

## Erwogene Alternativen

**Electrons Node.js für dsh verwenden.** Das spart Paketgröße, koppelt dsh aber an Electrons Node-Patches, Fuses, native ABI, TLS-Verhalten und Prozess-Lifecycle. Ein gebündeltes Upstream-Node.js hält dsh auf seiner unterstützten Runtime.

**Fetch-Bodies als Base64 über JSON-IPC transportieren.** JSON-IPC behält einen einzigen Nachrichtenmechanismus, bläht aber jeden Request- und Response-Body auf, konstruiert große Strings in beiden Prozessen, puffert jeden Request vor dem Dispatch und kodiert Bildbytes doppelt, die bereits als Base64 im RPC-JSON vorliegen. Rohe gerahmte Pipes behalten ein explizites versioniertes Protokoll, ohne sich darauf zu verlassen, dass Electron und Upstream-Node.js V8-Serialisierungsverhalten teilen.

**Die Produkt-Web-UI in Electron einbacken.** Unabhängige UI- und Backend-Updates würden ein neues versioniertes Kompatibilitätsprogramm erfordern. Backend und Web UI aus demselben dsh-Paket zu installieren bewahrt die bisherige Release-Bindung.

**Den bestehenden CLI- oder Browser-Plugin-Installer wiederverwenden.** Das überschreitet den Desktop-Autorisierungs- und Release-Scope und kann den Package-Manager-Zustand des Benutzers nutzen. Die Desktop-Paketmutation bleibt ausschließlich Electron-eigen.

**Das Desktop-Profil CLI-verwaltete Pakete oder Plugins nutzen lassen.** Beide Produkte könnten den Dependency-Graphen, die Cordis-Version, Plugin-Version oder native Module des jeweils anderen ändern. Das Desktop-Profil besitzt daher ein vollständiges `node_modules` und lehnt Bundle-Auflösung über den CLI-Profil-Fallback ab.

**dsh und Plugins in getrennte Desktop-Projekte installieren.** Das erzeugt einen zweiten Auflösungsanker und Peer-Dependency-Fallback. Ein gewöhnliches npm-Projekt liefert bereits das benötigte Installations- und Auflösungsmodell.

**Nicht-zielgerichtete Mach-O-Dateien aus Registry-Paketen entfernen.** Architekturbereinigung spart wenig Seed-Platz, aber Pakete können bewusst mehrere Architekturvarianten ausliefern und Aufrufer können deren installierte Dateimenge beobachten. Jedes ausgelieferte Mach-O-Objekt zu signieren erfüllt die Notarisierung, ohne ein Desktop-spezifisches Paketlayout zu erfinden.

**Den Windows-EV-Private-Key in eine PFX-Datei exportieren.** Das extern bereitgestellte öffentliche Leaf-Zertifikat lässt SignTool die Signatur konstruieren, während `/csp` und `/kc` den Hardware-Schlüssel lokalisieren. Der EV-Private-Key bleibt nicht exportierbar auf dem Token.

**Ein Credential-beladenes Signing-Skript committen oder das Token Password persistieren.** Eine Credential-beladene CMD-Datei, `.env` oder Windows-Benutzer- oder -Systemumgebungsvariable lässt das Token Password im Ruhezustand wiederherstellbar. Die eingecheckte CMD enthält nur Umgebungsvariablen-Referenzen, und der Packaging-Schritt nimmt das Password als ephemeres Runner-Secret entgegen.

**Direkt über electron-builder oder einen allgemeinen Directory-Sync publizieren.** Ein direkter Publisher kann Channel-Metadaten exponieren, bevor jedes referenzierte Artefakt existiert, veraltete oder zielübergreifende Dateien in ein Release mischen und kann nicht beweisen, dass der fertige signierte Build noch zur aktuellen dsh-Version passt. Ein zielspezifischer validierter Upload hält Publikationsreihenfolge und Release-Identität explizit.

## Konsequenzen

- Eine saubere Offline-Maschine ohne systemweites Node.js oder pnpm installiert den Seed nach `.dsh/profiles/desktop` und startet eine funktionierende dsh-Session.
- Die signierte Anwendung inventarisiert eine feste kleine Menge von Seed-Store-Shards statt jeder einzelnen pnpm-Cache-Datei; jedes Mach-O-Objekt in den macOS-Shards trägt die Release-Developer-ID, den sicheren Zeitstempel und die Hardened Runtime, jedes Windows-Artefakt trägt die konfigurierte hardwaregestützte EV-Signatur, und der installierte private Store behält das gewöhnliche pnpm-Layout.
- `.dsh/profiles/desktop/node_modules` enthält und löst das Desktop-dsh-Paket und jedes per GUI installierte Desktop-Plugin auf.
- Jede Desktop-pnpm-Operation nutzt die gebündelte Binary und `.dsh/desktop/pnpm/store`; keine liest `PATH`, Config, Store oder Profil-`node_modules` des Benutzers.
- Die Electron-exklusive GUI installiert, entfernt und aktualisiert gewöhnliche npm-Plugin-Pakete, ohne rohe pnpm-Argumente zu exponieren.
- Backend und Browser-Anwendung können Desktop-Pakete nicht verändern.
- npm/CLI-dsh und Electron lösen niemals Plugins aus dem `node_modules` des jeweils anderen auf oder installieren daraus.
- Das aktive Backend und die Web UI melden dieselbe dsh-Version und eine kompatible Shell-API, bevor das Produktfenster öffnet.
- Fehlgeschlagene Installation, Health Check oder Update lässt das aktuelle Profil nutzbar oder stellt `rollback/profile` nach dem Neustart wieder her.
- Eine Desktop-Version bindet Electron und dsh; jedes dsh-Update kommt über einen Electron-Update-Dialog und einen benutzersichtbaren Neustart an.
- Geteilte `.dsh`-Daten lehnen inkompatible Leser vor Migration oder Mutation ab.
- Es wird kein Loopback-Listener geöffnet, und der gesandboxte Renderer kann nicht auf beliebiges Dateisystem oder Electron-APIs zugreifen.
- Workspace-Entwicklung läuft mit aktuell gebautem Code ohne Download von Release-Ressourcen, während die Unpacked-Package-Verifikation den Produktions-Installationspfad bewahrt.
- Das Windows-Release-Packaging verlangt das validierte SignTool, den EV-Token, das passende öffentliche Leaf-Zertifikat, das Token Password und den expliziten Schlüsselcontainer; es fällt niemals auf ein unsigniertes Artefakt oder eine exportierbare Schlüsseldatei zurück.
- Ein Target-Update kann keine neuen Channel-Metadaten exponieren, bis der fertige signierte Build und jedes referenzierte Artefakt die Release-Validierung bestehen; beibehaltene historische Artefakte bleiben für differentielle Updates verfügbar.
- Signierte installierte Artefakte aktualisieren sich auf jeder Release-blockierenden Plattform erfolgreich vom vorherigen unterstützten Release.

## Review-Entscheidungen

| Entscheidung | Empfehlung |
|---|---|
| Erster Start | Offline-Seed-Store-Teilmenge bündeln und über pnpm installieren |
| Desktop-Profil | Ein Electron-eigenes reserviertes Profil mit exakten dsh- und Plugin-Dependencies |
| Plugin-Management | Electron-exklusive GUI und Paketservice; kein CLI-, Backend- oder Browser-Installationspfad |
| Aktivierung | Staging-Projekt, vollständiger Health Check, journalisierter Verzeichnisersatz, eine Rollback-Kopie |
| Initiale Plattformen | macOS arm64/x64 und Windows x64; Linux hat kein unterstütztes Release-Target |
| Update-Verhalten | Hintergrund-Check, explizite Bestätigung vor differentiellem Download und Neustart, Startup-dsh-Abgleich |

## Risiken

Plugin-Lifecycle-Skripte führen Drittanbieter-Code aus. Die erlaubte Registry, die Paket-Policy, exakte Versionen, Integrität, `allowBuilds` und Diagnosen erfordern ein Security-Review, bevor die GUI-Installation ausgeliefert wird.

Das Update des gebundenen dsh kann Plugin-Peer-Dependencies oder native Module invalidieren. Die pnpm-Auflösung und der vollständige Projekt-Health-Check müssen das gestagte Projekt ablehnen, bevor das aktive ersetzt wird.

Ein per npm installiertes dsh und ein Desktop-dsh können unterschiedliche Versionen haben, während sie dauerhafte Daten teilen. Jeder geteilte Besitzer muss seine Formatversion und seinen Prozess-Lock durchsetzen, bevor er liest, migriert oder schreibt.

Verzeichnisersatz unterscheidet sich zwischen Betriebssystemen und kann unterbrochen werden. Das Aktivierungsjournal und Installationsartefakt-Fehlertests müssen die Recovery bei jedem Dateisystem-Move beweisen.

Code-Signing, Notarisierung und Update-Hosting erfordern produktive Release-Infrastruktur. Repository-Tests allein können diese Qualifizierung nicht abschließen.
