---
description: "Host-Hälfte von open-in-app: installierte Editoren, Git-GUIs, Terminals und Dateimanager auf macOS, Windows und Linux zu verifizierten Launchern auflösen und Katalog, Icons und Launch-Endpunkt als drei webServer-Routen bereitstellen."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-open-in-app

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Verwende `dsh-host-open-in-app` zusammen mit seinem [Browser-Begleitpaket](../../client/ui-open-in-app/README.de.md), damit Benutzer ein Workspace-Verzeichnis in einem installierten Editor, einer Git-GUI, einem Terminal oder einem Dateimanager öffnen können. Es bietet einen festen Anwendungskatalog und zeigt nur Einträge, die der Host verifizieren kann; neu installierte Anwendungen erscheinen nach einem Neustart, fehlende Launcher werden bei Erkennung entfernt. Anfragen erfordern die Browser-Authentifizierung und die Host-Origin-Vertrauensprüfungen des Deployments. Erkennungs- und Launch-Kommandos verwenden konfigurierbare Deadlines und geben keine geerbten Credentials an gestartete Anwendungen weiter.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounte das Paket in einer Komposition, die `webServer`, `connection` und `subprocess` trägt, normalerweise neben seiner Browser-Oberfläche [`dsh-client-ui-open-in-app`](../../client/ui-open-in-app/README.de.md); das Paar setzt einen „Open In..."-Split-Button in den Web-Session-Header, sobald der Host mindestens eine installierte Kataloganwendung aufgelöst hat.

### Wann es sich lohnt

Wähle es für ein Web-Deployment, dessen Benutzer neben einem lokalen Editor, einer Git-GUI, einem Terminal oder einem Dateimanager arbeiten und das Workspace-Verzeichnis dort mit einem Klick öffnen wollen. Vermeide es, um aus Host-Code heraus einen Pfad mit der OS-Standardanwendung zu öffnen — das ist `openPath` von `dsh-apiproxy`; Gegenstand dieses Pakets ist *welche* Anwendung, mit Auflösung und Launchern pro Anwendung.

### Minimalkonfiguration

```yaml
- name: '@deepseek-ai/dsh-host-open-in-app'
  config:
    probeTimeoutMs: 10000
    iconTimeoutMs: 10000
    launchWatchMs: 1000
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `probeTimeoutMs` | Pflicht | Deadline in Millisekunden pro Kommando für katalogauflösende Host-Kommandos (`xcode-select`, die Windows-Registry-Reads). |
| `iconTimeoutMs` | Pflicht | Deadline in Millisekunden pro Kommando für icon-extrahierende Host-Kommandos (`plutil`/`sips` unter macOS, die PowerShell-Extraktion unter Windows). |
| `launchWatchMs` | Pflicht | Frühfehler-Beobachtungsfenster pro Launch: Ein Launcher, der beim Schließen des Fensters noch läuft, gilt als gestartet und läuft weiter; es begrenzt also, wie lange die open-Route einen erfolgreichen Launch hält. |

Die drei Deadlines sind unabhängig, sodass das Tuning einer Operation nie die Antwortzeit einer anderen ändert; Timeouts sind Fehlergrenzen, keine Latenzbudgets, sodass die konservativen Auflösungs-/Icon-Werte bei gesunden Kommandos nichts kosten. Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-host-open-in-app) ist die erschöpfende Quelle für jedes akzeptierte Feld.

### Der Katalog und seine Auflösung

Der Katalog ist eine feste Whitelist, die Editoren und IDEs (Cursor, VS Code und Insiders, Windsurf, Zed, Sublime Text, Xcode, Android Studio sowie die JetBrains-IDEs IntelliJ IDEA, PyCharm, WebStorm, PhpStorm, GoLand, Rider, RustRover), Git-GUIs (Fork, Sourcetree, GitHub Desktop, Tower, GitKraken, SmartGit, Sublime Merge), Terminals (Ghostty, Warp, iTerm2, kitty, Terminal, Windows Terminal, Git Bash, GNOME Terminal, Konsole) und plattformspezifische Dateimanager (Finder, Datei-Explorer, `xdg-open`) abdeckt. Jeder Eintrag deklariert plattformspezifische Launcher-Quellen, die der Reihe nach versucht werden, und jede Quelle liefert einen **verifizierten Launcher** — ein Artefakt, das dieser Host tatsächlich besitzt — niemals einen nackten Installationsdatensatz:

- **macOS** prüft die bekannten Anwendungsverzeichnisse (`/Applications`, `~/Applications`) auf die Bundle-Schreibweisen des Eintrags und startet `open -a <resolved bundle>`; Xcode folgt `xcode-select -p`, sodass Beta- oder umbenannte Installationen gefunden werden. Es läuft weder eine Launch-Services-Abfrage noch ein Festplattenscan.
- **Windows** liest die `App Paths`-Registry-Schlüssel, dann die Uninstall-Einträge (nur übernommen, wenn sie eine ausführbare Datei auf der Festplatte beweisen), dann bekannte Installationspfade und das neueste versionierte Installationsverzeichnis, wo eine Anwendung eines nutzt. GitHub Desktop löst seine versionierte Executable zusammen mit dem mitgelieferten `cli.js` auf und ruft das unterstützte `github open <path>`-Verhalten ohne Kommando-Shell auf. Registry-Reads werden gebatcht, ein `reg.exe query` pro Root pro Auflösungsdurchlauf.
- **Linux- und Windows-CLI-Namen** werden prozessintern über die subprocess-Fähigkeit der Komposition aufgelöst (PATH/PATHEXT-stat, keine Shell, kein `which`); Linux-GUI-Einträge, deren CLI nicht auf PATH liegt, fallen auf die verifizierte `TryExec`/`Exec`-Executable ihres XDG-Desktop-Eintrags zurück, und der `xdg-open`-Dateimanager-Eintrag erscheint nur, wenn der Host einen Display-Server ankündigt.

### Was zu erwarten ist

Wenn die geerbte Prozessebene der [Launch-Umgebung](../../util/launch-environment/README.de.md) ein nicht-leeres `SSH_CONNECTION` oder `SSH_TTY` enthält, ist die Anwendungsliste leer und der Web-Header blendet Open In aus — einschließlich einer etwaig gemerkten Auswahl. Projekt- und Benutzer-`.env`-Werte begründen keinen SSH-Launch. Der Host überspringt das Probing und lehnt Icon- und Launch-Anfragen für nicht verfügbare Anwendungen ab. Diese Regel gilt auch, wenn eine SSH-Session ein Display oder eine VS-Code-IPC-Verbindung mitbringt; sie erkennt keine Remote-Deployments, deren Launcher beide SSH-Marker entfernen.

Die Auflösung läuft lazy, einmal pro Host-Prozess, bei der ersten Anfrage, die sie braucht; das Installieren einer Anwendung wirkt beim nächsten Neustart, ein deinstalliertes heilt sofort — ein Launch, der seine Executable verschwunden vorfindet, löst genau diesen einen Eintrag neu auf und streicht ihn aus der Liste, wenn nichts ihn mehr beweist. Die Icon-Route liefert auf jeder Plattform, auf der eines extrahierbar ist, das echte Anwendungsicon: das `.icns` des Bundles als 128px-PNG unter macOS, das verknüpfte Icon der Executable als 32px-PNG unter Windows und das hicolor-theme-Icon des Desktop-Eintrags (PNG oder SVG) unter Linux; ein fehlendes Icon antwortet 404 und die Browser-Oberfläche rendert ein generisches Glyph.

### Der `./shared`-Subpfad

Die Routenpfade und Wire-Payload-Typen werden als browser-sicherer `./shared`-Subpfad veröffentlicht (nur Konstanten und Typen, keine Laufzeitidentität); das Browser-Paket inlinet ihn in sein Client-Bundle. Eine Routen- oder Payload-Änderung landet in `src/shared.ts`, und beide Pakete übernehmen sie von dort.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Das Paket zerfällt in eine Datentabelle und drei Rollen. [`src/catalog.ts`](src/catalog.ts) ist die Compile-Zeit-Tabelle: die plattformspezifische Locator-Kette jedes Eintrags (`fixed`, `app`, `xcode`, `cli`, `file`, `scan`, `app-paths`, `install-record`, `github-desktop`, `desktop`) plus unter Linux die Desktop-Entry-id, die sein Icon besitzt. [`src/resolver.ts`](src/resolver.ts) löst die Tabelle gegen diesen Host auf: Ein Durchlauf ergibt eine Map von Katalog-id zu verifiziertem Launch (primäres plus optionales Fallback-argv plus Icon-Quelle), mit einem gemeinsamen gebatchten Windows-Registry-Read; argv-Launches spawnen detached mit einer credential-bereinigten Umgebung (`scrubbedParentEnv`) plus expliziten Adapter-Einträgen und halten Windows-GUI-Prozesse sichtbar, es sei denn, der Adapter versteckt einen CLI-Prozess, der die GUI separat startet. `shell-open`-Launches (die Dateimanager) führen das open-Verb der OS-Shell über den Path-Opener von `dsh-native-command` unter demselben Beobachtungsfenster aus, und ein `ENOENT` beim Spawn wird als `missing` klassifiziert, damit die Routen einen stale Eintrag auffrischen können. [`src/icons.ts`](src/icons.ts) extrahiert Icons pro Plattform: `plutil`/`sips` über dem aufgelösten Bundle unter macOS, ein generiertes PowerShell-`ExtractAssociatedIcon`-Skript über der aufgelösten Executable unter Windows (positionale `-File`-Argumente halten Pfade aus dem Command-Line-Parsing heraus) und Desktop-Entry-/hicolor-/pixmaps-Dateisystemlookup unter Linux.

[`src/index.ts`](src/index.ts) registriert die drei Routen auf `ctx.webServer`: `GET /open-in-app/apps` (die Keys der Auflösungsmap), `GET /open-in-app/icon/<id>` (das extrahierte Icon, pro Prozess im Speicher gecacht) und `POST /open-in-app/open` (startet den verifizierten Launcher der Map direkt — niemals eine Re-Erkennung). Jede Route fragt zuerst den `connection`-Service der Komposition nach einer Ablehnung; die vollständige Vertrauensdarstellung — der Host/Origin-Zaun und die Browser-Authentifizierung — hat genau eine Heimat im Modulkommentar von [`src/index.ts`](src/index.ts). Oberhalb dieses Zauns validiert die open-Route ihren Body am Wire: ein `application/json`-Media-Type, eine 64-KiB-Obergrenze, eine aufgelöst-verfügbare Katalog-id und ein absoluter Pfad, der ein existierendes Verzeichnis benennt. Auflösungs- und Icon-Kommandos laufen über [`@deepseek-ai/dsh-native-command`](../../util/native-command/README.de.md) (argv, niemals eine Shell) unter ihren jeweiligen Deadlines; PATH-Namen gehen prozessintern über `ctx.subprocess.resolveExecutable()`.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [dsh-client-ui-open-in-app](../../client/ui-open-in-app/README.de.md) — der Browser-Split-Button, der diese Routen konsumiert.
- [dsh-subprocess](../../subprocess/subprocess/README.de.md) — die Fähigkeit, die prozessinterne PATH-Auflösung und die bereinigte Child-Umgebung liefert.
- [dsh-native-command](../../util/native-command/README.de.md) — der shell-lose Host-Kommando-Runner für Auflösungs- und Icon-Kommandos.
- [dsh-host-webserver](../webserver/README.de.md) — die Routenregistratur, die die drei HTTP-Endpunkte trägt.
- [Host-Paketlandkarte](../README.de.md) — die GUI-Host-Familie, zu der dieses Paket gehört.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da dieses Paket Host-Anwendungen für einen Menschen öffnet und weder Prompt, Message, Schema, Stream noch Tool-Ergebnis berührt.

#### KV-Cache-Effekt

Keiner; das Paket assembliert oder sendet niemals Provider-Requests.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>

- **Der Katalog ist zur Build-Zeit fest.** Ein Deployment kann aus cordis.yml keinen eigenen Editor oder keine eigene Git-GUI hinzufügen; die Liste zu erweitern heißt, `OPEN_IN_APP_CATALOG` und die Dictionaries des Browser-Pakets gemeinsam zu erweitern. Das Betriebssystem kann bekannte Anwendungen orten, aber nicht feststellen, ob jede installierte Anwendung ein Workspace-Verzeichnis akzeptiert oder welches Launch-Protokoll sie verlangt; das Paket enumeriert daher keine uneingeschränkte OS-Anwendungsliste. Konfigurierbare Custom-Handler bleiben zurückgestellt; ihre benutzerseitigen Labels sind Nutzerdaten und kein locale-eigener Produkttext.
- **macOS-Erkennung prüft nur bekannte Pfade.** Ein Bundle, das über die Schreibweisen des Katalogs hinaus umbenannt oder aus `/Applications` und `~/Applications` heraus verschoben wurde, wird nicht erkannt; es gibt keine Launch-Services-Abfrage (ein natives LaunchServices/NSWorkspace-Lookup bräuchte ein Addon, das das Repository nicht trägt) und bewusst keinen Festplattenscan.
- **Icon-Treue ist plattformgebunden.** Windows-Icons kommen von `ExtractAssociatedIcon` mit 32px — das Maximum, das die Standard-.NET-Oberfläche ohne natives Addon liefert — und kann auf High-DPI-Displays leicht weich wirken; Linux-Icons folgen nur dem hicolor-Theme und pixmaps, nicht dem aktiven Icon-Theme des Benutzers; mehrere Einträge (reine CLI-Launcher ohne Desktop-Eintrag) haben keine Icon-Quelle und behalten das generische Glyph.
- **Neuinstallationen erscheinen erst nach einem Neustart.** Die Auflösung läuft einmal pro Host-Prozess; nur die Deinstallationsrichtung heilt selbst (ein fehlender Launcher löst seinen einen Eintrag vor Ort neu auf).

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Die Promotion-Entscheidungen — die Aufteilung in host-/`ui-`-Pakete, warum rohe webServer-Routen statt eines Typert Remote, warum der Katalog compile-zeitfest bleibt, das Resolver-Redesign (verifizierte Launcher, ein Auflösungsdurchlauf, keine Re-Erkennung pro Klick), die Drei-Deadline-Konfiguration und die plattformspezifischen Icon-Strategien mit ihren verworfenen Alternativen — sind in der [Promotion-Agent-Notiz](../../../.agents/notes/implemented/feature/2026-08-25-promote-open-anywhere-plugin.de.md) festgehalten.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Das Paket liefert einen Host-Auflösungsdurchlauf über drei zustandslose Routen; die Routenregistrierungen beweisen ihre Disposierbarkeit über ihre HMR-Safety-Specs, und keine unabhängigen Beobachtungen können auseinanderlaufen.
