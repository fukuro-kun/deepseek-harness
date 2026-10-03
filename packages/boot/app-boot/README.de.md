---
description: "Gemeinsame Loader-Boot-Unterstützung für dsh-Profile und die temporäre Python-SDK-Runtime: Environment-Layer, Patches, Diagnostik und Konfigurationsvorschau."
kind: "package-library"
---

# @deepseek-ai/dsh-app-boot
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh-app-boot` ist die gemeinsame Loader-Boot-Bibliothek hinter den `dsh`-Profilen, einschließlich des von der Python-Runtime-Wheel paketierten CLI. Sie lädt Environment-Layer, komponiert Profil-Bundles und Patches, bootet jedes Plugin und gibt die laufende App zurück oder benennt das fehlgeschlagene Plugin und die Ursache. Produktanwendungen verwenden den `dsh`-Launcher statt separater Bins; Direct-Config-Helfer bleiben nur für untergeordnete Embedder und Tests. Du kannst die effektive Konfiguration vor dem Boot einsehen, pro Profil Live- oder Startup-only-Patch-Anwendung wählen und eine terminaleigene App ihr Terminal vor einem fatalen Exit zurückgeben lassen.

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

Eine App mit diesem Paket zu starten ist ein kleiner, expliziter Einstiegspunkt: Du übergibst eine Config-Datei, und er führt den gesamten Boot aus. Dieser Abschnitt beschreibt, was du tun kannst und was du erhältst; die Hilfsaufrufe hinter jedem Ergebnis sind im aufklappbaren Implementierungsabschnitt dokumentiert.

### Wann es verwenden

Verwende es bei der Implementierung des gemeinsamen `dsh`-Launchers oder beim Einbetten seiner untergeordneten Boot-Helfer. Produktfeatures gehören in Profil-Bundles statt in neue Anwendungs-Bins; Code, der einer bereits laufenden App nur Plugins hinzufügt, mountet diese Plugins direkt.

### Die App starten

Du gibst deinem Einstiegspunkt eine Config-Datei, und der Prozess startet die gesamte App: Er lädt deine Environment-Layer, wendet Patches und Profile an, bootet jedes Plugin und kehrt zurück, sobald die App läuft. Im Replay-Modus bootet er stattdessen die benachbarte `cordis.snapshot.yml`, sodass eine aufgezeichnete Session identisch reproduziert wird. Der kleinste Einstiegspunkt sind zwei Aufrufe:

```text
installFailLoud('dsh')
const ctx = await boot('dsh', resolveConfigPath(argv[2], process.env.DSH_SNAPSHOT))
```

Mit diesem Einstiegspunkt sieht Erfolg wie eine laufende App mit jedem aktiven Plugin aus; ein Fehlschlag ist nie still — eine beschriftete Zeile benennt das fehlschlagende Plugin und die Stage, und der Prozess exited mit Nicht-Null. Der App-Kontext wird abgebaut, bevor der Fehler gemeldet wird, sodass nichts halbgestartet weiterläuft.

<a id="profiles"></a>
### Profile

Importiere Profil- und Bundle-Deklarationstypen aus [`@deepseek-ai/dsh-package-manifest`](../../util/package-manifest/README.de.md). App-Boot besitzt Profil-Laden, JSON-Validierung und resolved Runtime-Daten.

Ein Profil ist die Art, wie eine dsh-Installation verschiedene App-Oberflächen ausliefert: `web`, `headless`, `acp`, `sdk` und `sdk-minimal` starten unterschiedliche Kompositionen aus demselben Launcher. Ein Profil liegt unter `$DSH_HOME/profiles/<name>` und kombiniert installierbare Bundles, seine eigene `cordis.patch.yml` und `patchReload: live | startup`; eine ausgelassene Reload-Policy behält den historischen `live`-Default für Custom-Profile. Das ausgelieferte `web`-Template verwendet Live-Reload, während die übrigen ausgelieferten Templates Patches nur beim Startup anwenden. `sdk-minimal` benennt nur sein Standalone-Bundle; die anderen Templates behalten Base-plus-Mode-Stacks. `dsh --profile <name> --from-default-profile <template>` erstellt aus einem ausgelieferten Template ein Custom-Profil unter einem neuen, nicht ausgelieferten Namen, während `dsh plugin` ein base-backed Profil initialisiert und seine installierten Bundles verwaltet. Ein fehlendes Bundle oder eines ohne Patch-Deklaration lässt den Start laut fehlschlagen. Application-owned npm-Projekte wie Electrons reserviertes Desktop-Profil verwenden `loadProfileDirectory`, um ein bereits initialisiertes Verzeichnis zu laden, ohne es über die CLI-Profil-Suche verfügbar zu machen.

Deine maschinenlokalen Einstellungen leben ebenfalls im Harness-Home:

- **`.env`** — deine gewöhnlichen Environment-Layer: Die Datei des aufrufenden Verzeichnisses schlägt die Harness-Home-Datei, und beide stehen unter der geerbten Umgebung. Variablen, die entscheiden, wie der Prozess startet (`PATH`, `DSH_*`, `XDG_*` und ähnliche), werden aus Dateien abgelehnt: Exportiere sie stattdessen. Die vier Proxy-Namen (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`) werden nur aus der Harness-Home-Datei akzeptiert, nie aus der des aufrufenden Verzeichnisses, die mit einem Clone ankommt. Für ein Nicht-Produkt-Bin, das nur die `.env` eines Verzeichnisses will, ist eine fehlende Datei in Ordnung, und eine nicht ladbare gibt eine beschriftete Warnzeile aus.
- **`cordis.patch.yml`** — deine Tweak-Layer, angewendet nach jeder Bundle-Layer (zuerst pro Profil, dann die Home-Level-Datei, die sie daher schlägt): Ersetze die gesamte Config eines Eintrags (wobei du die Felder wiederholst, die du behältst), füge neue Einträge ein oder interpoliere `!!js`-Ausdrücke beim Boot. Ein Patch, der einen nicht existierenden Eintrag benennt, gibt eine stderr-Warnung aus; eine leere oder nur aus Kommentaren bestehende Datei lässt den Boot fehlschlagen — deaktiviere die Layer stattdessen mit `[]`.

Profile mit `patchReload: live` beobachten beide User-Patch-Dateien: Eine gültige Änderung komponiert ohne Neustart neu, während eine abgelehnte Änderung die letzte gute App weiterlaufen lässt. Ein `startup`-Profil installiert weder diese Watcher noch den Watch-only-HMR-Fallback des Launchers.

Eingefügte Plugin-Namen dürfen absolute Dateisystempfade, File-URLs oder Paket-Spezifizierer sein. Das Patch-Laden wandelt absolute Pfade und patch-relative `./`- oder `../`-Pfade innerhalb von `insert`-Zeilen und ihren verschachtelten Gruppen in File-URLs um; Namensassertionen auf bestehende Einträge und ersetzende `config`-Werte bleiben literal.

### Die effektive Konfiguration einsehen

Vor dem Boot kannst du die exakte Konfiguration ausgeben, die die App mounten wird: Der Dump zeigt die komponierte Eintragsliste mit `!!js`-Ausdrücken im Wortlaut, gruppiert unter Kommentaren, die jede Quelldatei und die sie ändernden Patch-Layer benennen, als ein ladbares YAML-Dokument. Patches, die auf keine Zeile passen, werden mit ihrem Layer-Label gemeldet; eine fehlende, nicht parsbare oder ungültige Config lässt den Dump fehlschlagen.

### Was du bei einem Startfehler siehst

Ein Startfehler ist eine einzelne beschriftete Zeile plus ein Exit ungleich null — nie ein stiller Hänger oder ein roher Stack-Dump. Die Meldung benennt das fehlschlagende Plugin; ein Plugin, das warf, behält seinen Originalfehler, und ein Eintrag, der nie startete, wird mit den Services gemeldet, auf die er wartete.

Wenn deine App das Terminal besitzt, kann sie es zurückgeben, bevor der Prozess exited, sodass deine Shell nie im Raw-Modus zurückbleibt. Die Übergabe ist begrenzt: Ein hängendes Cleanup verzögert den fatalen Exit, bricht ihn aber nie ab.

### Dem agent mitteilen, wo der harness liegt

Wenn deine App einen model-backed agent bootet, kannst du dem agent mitteilen, wo der DSH-Implementierungs-Checkout liegt: Er lernt diesen Pfad und dass er das Arbeitsverzeichnis nicht daraus ableiten darf — er soll `pwd` verwenden. Die Anweisung erscheint einmal nahe dem Anfang des System Prompts. Apps ohne System-Prompt-Service überspringen sie; in der Entwicklung verwirft ein Reload des System Prompts sie bis zum nächsten Boot.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie die obigen Ergebnisse umgesetzt werden, und zeigt auf den Code, der sie umsetzt; alles hier ist developer-facing und für die Nutzung des Pakets nicht nötig.

### Designnotizen

- **Channel-neutrale Bibliothek.** Das Paket trägt keine Loader-Hooks und keine Dev-Mode-Oberfläche; die [`dsh`-App](../../../apps/cli/README.de.md) besitzt ihren Node-Source-Launch-Hook und konsumiert diese Helfer für die Boot-Sequenz, und gebaute Consumer verwenden die gewöhnliche Node-Paketauflösung.
- **Zwei Loader-Builtins.** `mountRootInclude` registriert `cordis:include` und `cordis:group` als Loader-Builtins: Eine Gruppenzeile gibt einem Provider und seinen Consumern gemeinsam ein `isolate`-Realm, und ein agent preset außerhalb dieses Workspace kann `@deepseek-ai/cordis-plugin-group` nicht per Namen auflösen. Beide laden über die Ambient-Module-Pipeline statt über die eigene Specifier-Auflösung des eingeschlossenen Baums.
- **Profil-Modul-Fallback.** Bare Plugin-Spezifizierer lösen über den Loader aus dem Config-Verzeichnis auf. Plain Node hält einen Symlink pro Paket im Installations-Dependency-Closure. Ein paketiertes Executable liest stattdessen jede installierte Export Map mit Node-ESM-Conditions und schreibt echte Proxy-Pakete, die virtuelle Modul-URLs re-exportieren, weil ein Betriebssystem-Symlink nicht in pkgs `/snapshot`-Baum eintreten kann. Fehlende Exports bleiben unverfügbar, malformed Maps lassen den Start fehlschlagen, und ein prozessübergreifender Writer-Lock ersetzt stale Einträge, ohne partielle Proxies zu zeigen. Ein ausgewähltes externes Bundle, das im Installations-Closure fehlt, erhält einen profillokalen `.dsh-module-fallback`-Link; existierende pnpm-Einträge gewinnen, projizierte Links werden von späterer Closure-Discovery ausgeschlossen, und das Cleanup entfernt nur dsh-eigene Links.
- **Ein Rejection-Checkpoint.** `assertEntriesActivated` hält die exakten Gründe, die es in die Boot-Diagnostik einfaltet, bis zum nächsten Prozess-Rejection-Checkpoint sichtbar, sodass `installFailLoud` Loaders doppelte Benachrichtigung zusammenführt, während unverwandte unhandled Rejections fatal bleiben.
- **Zweistufige Fehler-Labels.** `boot()` unterscheidet `host preparation failed` — `prepare` warf, bevor irgendein Config-Tree-Eintrag mountete — von `plugin tree failed to load` und hängt den Stack des tiefsten Plugin-Fehlers an, sodass die Startup-Diagnostik den originalen Aktivierungsfehler statt nur der Wrap-Kette bewahrt.

### Verhalten der Helfer

Die Exports besitzen je eine Stage des Boots: Config-Auflösung und Snapshot-Replay, geschichtetes Environment-Laden, Fail-Loud-Reporting, Aktivierungs-Audit, Patch-Parsing, Root-Include-Mounting, Config-Dump-Rendering, Live-Patch-Watching, Profil-Komposition und die Harness-Source-Sektion. Pro-Export-Contracts leben im Code, nicht in diesem README — siehe [`src/index.ts`](src/index.ts) und [`src/profile.ts`](src/profile.ts).

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Boot-Helfer: Config-Auflösung, Environment-Laden, Fail-Loud-Guard, Aktivierungs-Audit, Patch-Parsing, Config-Dump, Harness-Source-Sektion |
| [`src/profile.ts`](src/profile.ts) | Profil-Discovery, Initialisierung, Bundle-Auflösung, Modul-Fallback |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; dieser Presentation-Adapter besitzt keinen dauerhaften paketlokalen Event-Stream; Boundary- und Replay-Tests decken sein Protokoll-Mapping ab. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Contract nicht ausreicht. Sie führen von den gemeinsamen Boot-Mechaniken zum Kompositionsmodell und den Entscheidungsbelegen dahinter.

- [Cordis-Primer](../../../docs/cordis-primer.de.md) — Loader, `!!js`-Config-Ausdrücke und Include-/Group-Semantik.
- [dsh-App](../../../apps/cli/README.de.md) — das `dsh`-Bin, das diese Helfer konsumiert.
- [dsh-cmdline](../cmdline/README.de.md) — die Launcher-zu-App-Kommandozeilen-Übergabe, die die Bins verwenden.
- [Profil-Bundles](../../bundle/README.de.md) — installierbare Patch-Layer, die in `dsh --profile` komponiert werden.
- [dsh-home-paths](../../util/home-paths/README.de.md) — der Harness-Home-Resolver (`resolveDshHome`).
- [Konfigurationsquellen-Ownership](../../../.agents/notes/implemented/architecture/2026-08-04-configuration-source-ownership.de.md) — warum eine discovered Datei das Bootstrap-Verhalten nicht bestimmen darf.
- [Profil-Plugin-Bundles](../../../.agents/notes/implemented/architecture/2026-08-05-profile-plugin-bundles.de.md) — das Profil- und Bundle-Kompositionsdesign.
- [User-Patch-HMR-Tests](../../../.agents/notes/implemented/testing/2026-09-09-user-patch-hmr-test-delivery.de.md) — Ownership von Transaktionsverhalten und nativer Dateisystem-Auslieferung.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über den geladenen Plugin-Baum, der allein Modellkontext beiträgt; der eine Export, der modellsichtbaren Text hinzufügt, `addHarnessSourceSection`, tut dies nur, wenn ein Consumer ihn nach dem Boot aufruft.

#### KV-Cache-Effekt

Der Boot selbst ändert keinen Request-Präfix. `addHarnessSourceSection` platziert seinen Source-Pfad nach den First-Party-Reusable-Instructions, sodass verschiedene Checkouts die vorhergehenden Bytes unverändert lassen, wenn Tools und Konfiguration übereinstimmen. Provider-Cache-Wiederverwendung ist nicht garantiert.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen beschreiben, wann diese Boot-Bibliothek schlecht passt oder besondere Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgabenstapel.

- **Bare Paket-Spezifizierer hängen von Loader-Interna ab** — Produktions-Bins brauchen Loaders optionalen nativen Helfer; ein In-Process-Caller ohne ihn muss auflösbare relative/File-Spezifizierer verwenden oder einen eigenen Modul-Auflösungs-Hook bereitstellen.
- **Snapshot-Replay-Swapping ist basename-spezifisch** — nur eine Config, die auf `cordis.yml` oder `cordis.yaml` endet, bildet auf die benachbarte `cordis.snapshot.yml` ab; eigene Config-Namen erfordern caller-verwaltete Auswahl.
- **Environment-Discovery ist launch-scoped** — `loadLayeredEnv` liest nur einmal das Aufrufverzeichnis und das Harness-Home; es sucht keine Eltern und folgt keinem später gewählten Workspace. `loadEnv` bleibt der Ein-Verzeichnis-Helfer für Nicht-Produkt-Bins.
- **Ein User-Patch ersetzt die gesamte gematchte Config** — ein id-adressierter Patch merged nicht tief, sodass ein Profil-Override die Bundle-Felder wiederholt, die er behält.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Designfragen und Richtungen, die nicht entschieden sind. Sie ist explizit nicht autoritativ — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen leben in den Abschnitten oben, dem Paket-Code und den verlinkten Agent Notes.

#### Offen: Config-Dump-Stabilität

Die Ausgabe von `renderConfigDump` ist ein ladbares YAML-Dokument, dessen `# ==`-Provenance-Kommentare und `!!js`-wortgetreues Rendering der `--dump-config`-Diagnostik dienen. Nichts verspricht Byte-Stabilität über Paketversionen hinweg; entscheide, ob der Dump zu einem Serialisierungs-Contract wird, bevor etwas ihn programmatisch konsumiert.

</details>
