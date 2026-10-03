# Plugin paketieren und installieren
[English](publish.md) | [中文](publish.zh.md) | Deutsch


Die bisherigen Tutorials haben ein lokales Plugin über ein `--patch`-Overlay geladen. Dieses Tutorial paketiert es als installierbares **Bundle**, installiert es mit `dsh plugin add` in ein **Profil** und erklärt die Schichtenreihenfolge, die die zusammengesetzte Konfiguration bestimmt. Es setzt eine installierte `dsh`-CLI voraus. Schließen Sie zuerst die [Plugin-Konfiguration](./config.de.md) ab.

Um stattdessen einen frischen Quell-Checkout zu verwenden, schließen Sie den Abschnitt [run-from-source](../../../../README.de.md#run-from-source) ab, behalten Sie das `hello-plugin`-Verzeichnis dieses Tutorials im Repository-Root und führen Sie die übrigen `dsh ...`-Befehle von dort als `pnpm dsh ...` aus. Build- und Launcher-Verhalten siehe [Ausführung aus dem Quellbaum](../../../../apps/cli/reference/README.de.md#source-execution).

## Zwei Konzepte, zwei Manifeste

Die Installation beruht auf zwei Konzepten. Beide werden durch eine `package.json` beschrieben, tragen aber unterschiedliche Arten von Manifest unter dem `dsh`-Schlüssel und beantworten unterschiedliche Fragen:

- Ein **Bundle** ist ein npm-Paket, das eine Konfigurationsschicht ausliefert. Sein Manifest deklariert `dsh.bundle` und beantwortet die Frage „Was trägt dieses Paket bei?": eine Patch-Datei, die Plugin-Zeilen einfügt oder überschreibt.
- Ein **Profil** ist ein Verzeichnis unter `$DSH_HOME/profiles/<name>`, das eine lauffähige Komposition beschreibt. Sein Manifest deklariert `dsh.profile` und beantwortet die Frage „Welche Bundles bilden dieses Setup, in welcher Reihenfolge?".

Ein Bundle ist das, was Sie erstellen und verteilen; ein Profil ist das, womit ein Benutzer `dsh --profile <name>` startet. Nichts ist beides zugleich.

### Das Bundle-Manifest

Erstellen Sie das Paketverzeichnis:

```sh
mkdir -p hello-plugin
```

```
hello-plugin/
├── package.json       # declares dsh.bundle
├── cordis.patch.yml   # the layer applied when a profile lists this bundle
└── index.js           # plugin modules the patch rows reference
```

Erstellen Sie `hello-plugin/package.json`:

```json
{
  "name": "dsh-hello-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

Erstellen Sie `hello-plugin/index.js` mit dem Plugin-Einstiegspunkt:

```js
export const name = 'hello-plugin'

export function apply() {
  console.log('[hello-plugin] plugin loaded!')
}
```

Erstellen Sie `hello-plugin/cordis.patch.yml`. Der Patch ist ein YAML-Array wie die `--patch`-Overlays, die Sie geschrieben haben, nur dass Plugin-Zeilen das Paket per Name statt per relativem Quellpfad referenzieren, damit die Node-Auflösung den installierten Code findet:

```yaml
- insert:
    - id: hello
      name: dsh-hello-plugin
```

Ein Paket ohne `dsh.bundle`-Deklaration lässt sich trotzdem installieren, aber nur als gewöhnliche Abhängigkeit: `dsh plugin` gibt eine Warnung aus und aktiviert keine Schicht. Verwenden Sie dieses Paketformat für eine Bibliothek, die Plugin-Pakete importieren, nicht für ein Plugin, das Benutzer aktivieren.

### Das Profil-Manifest

Ein Profilverzeichnis enthält zwei Dateien:

- `package.json` — die Out-of-Tree-Plugin-Abhängigkeiten des Profils (von pnpm verwaltet) plus das `dsh.profile`-Manifest mit seiner geordneten `bundles`-Liste.
- `cordis.patch.yml` — die eigene Patch-Schicht des Benutzers, angewendet nach jeder Bundle-Schicht.

Ein Profil-Manifest wird nie von Hand geschrieben: `dsh --profile <name> --from-default-profile <template>` kann eines aus einer mitgelieferten Anwendungsvorlage erzeugen, während `dsh plugin` ein base-gestütztes Profil erstellt und dessen Liste installierter Bundles pflegt. Die Erstellungsregeln definiert die [CLI-Verhaltensreferenz](../../../../apps/cli/reference/README.de.md#profile-boot); der nächste Abschnitt zeigt den Plugin-Weg.

## In ein Profil installieren

`dsh plugin --profile <name> <args...>` reicht im Profilverzeichnis an pnpm weiter, sodass jedes pnpm-Verb funktioniert. Installieren Sie den Paket-Checkout aus dem Verzeichnis, das `hello-plugin` enthält:

```sh
dsh plugin --profile demo add ./hello-plugin
```

Die erste Verwendung initialisiert das Profil (mit `@deepseek-ai/dsh-base` als erstem Bundle), pnpm verlinkt den Checkout, und `dsh` hängt das Bundle an `dsh.profile.bundles` an, weil das Paket `dsh.bundle` deklariert:

```json
{
  "name": "dsh-profile-demo",
  "private": true,
  "dependencies": {
    "dsh-hello-plugin": "link:/path/to/hello-plugin"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "dsh-hello-plugin"
      ]
    }
  }
}
```

Überprüfen Sie die Schicht ohne Start, dann starten Sie:

```sh
dsh --profile demo --dump-config   # shows a "# == dsh-hello-plugin" layer
dsh --profile demo
```

`dsh plugin --profile demo remove dsh-hello-plugin` entfernt sowohl die Abhängigkeit als auch die Schicht.

## Die Ladereihenfolge

Die effektive Konfiguration komponiert über einer leeren Wurzel, indem der Reihe nach angewendet wird:

1. Jeder Bundle-Patch, der in der `dsh.profile.bundles`-Liste des Profils genannt ist, in Listenreihenfolge — zuerst `@deepseek-ai/dsh-base`, dann jedes installierte Bundle in der Reihenfolge seiner Hinzufügung.
2. Das eigene `cordis.patch.yml` des Profils.
3. Das `$DSH_HOME/cordis.patch.yml` auf Home-Ebene — maschinenlokale Präferenzen, die alle Profile teilen.
4. Jedes `--patch <path>`-Overlay, in argv-Reihenfolge.

App-Argumente sind keine weitere Patch-Schicht. Ein Surface-Bundle kann sie über einen gewöhnlichen app-eigenen Dienst auflösen, wie unten beschrieben.

Spätere Schichten gewinnen pro Zeile, und ein Patch ersetzt den gesamten `config`-Wert einer Zeile, statt Schlüssel tief zu mergen. Zwei Konsequenzen für Bundle-Autoren:

- Ihr Patch kann Zeilen früherer Schichten per `id` überschreiben — so wie das [`dsh-web-app`-Bundle](../../../../packages/bundle/web-app/cordis.patch.yml) `dsh-base`-Zeilen überschreibt — muss aber jeden Schlüssel wiederholen, den die Zeile braucht, nicht nur den geänderten.
- Benutzer können Ihre Zeilen im `cordis.patch.yml` ihres Profils überschreiben, ohne Ihr Paket anzufassen; bevorzugen Sie daher Konfigurationsdefaults, die Benutzer wahrscheinlich behalten, und lassen Sie das Schema den Rest tragen.

Bundle-Namen im Lieferumfang werden immer aus der dsh-Installation selbst aufgelöst; pnpm verwaltet nur Out-of-Tree-Pakete, sodass Ihr Bundle sich auf ein vorhandenes und aktuelles `@deepseek-ai/dsh-base` verlassen kann.

## Einem Surface-Bundle eine eigene Kommandozeile geben

Ein Bundle, das eine lauffähige App definiert, mountet ein gewöhnliches Provider-Plugin:

```yaml
- id: hello-startup
  name: 'dsh-hello-plugin/startup'
```

Das Plugin exportiert `inject = ['cmdlineArgs']`, ruft `parseCmdline` aus [`@deepseek-ai/dsh-cmdline`](../../../../packages/boot/cmdline/README.de.md) mit einem eigenen commander-Programm auf und stellt seinen app-eigenen Dienst aus der Action des Programms bereit. Der Launcher gibt jedem Plugin dieselben unveränderlichen Argumente nach den Launcher-Flags, sodass app-spezifische Flags keine Launcher-Änderung brauchen und mehrere Plugins den Snapshot parsen dürfen. Die Loader-Zeile braucht keinen Launcher-Marker und keine besondere Art.

Zeilen, die durch diese Argumente konfiguriert werden, injizieren den Dienst des Providers und lesen ihn in ihren eigenen `!!js`-Optionen, mit dem Deployment-Wert als Fallback daneben:

```yaml
- id: my-app
  name: '@example/my-app'
  inject: [myAppStartup]
  config:
    port: !!js ctx.myAppStartup.port ?? 8080
```

Bei `--help` veröffentlicht der Provider keinen Dienst, sodass diese Zeilen nie aktiviert werden. Der Loader mountet die Komposition einmal, wartet auf die gewöhnlichen Injektionen jeder Zeile und wertet erst dann die `!!js`-Konfiguration dieser Zeile gegen ihren injizierten Kontext aus.

## Von GitHub installieren: die Build-Skript-Falle

Ein Release in einer Registry ist nicht erforderlich — Benutzer können direkt von einem Git-Host installieren:

```sh
dsh plugin --profile demo add github:you/hello-plugin
```

Aber eine Git-Installation holt **Quellen, keine gebauten Artefakte**: Nichts führt Ihr `build`-Skript aus, sodass ein TypeScript-Paket ohne seine `lib/`-Ausgabe ankommt und nicht lädt. Zwei Dinge müssen geschehen, eines auf jeder Seite:

- **Der Autor** liefert ein `prepare`-Skript — pnpm führt es nach einer Git-Installation aus — das die veröffentlichten Einstiegspunkte aus dem Quellcode baut, eigenständig: Es darf keinen reinen Entwicklungskontext wie einen benachbarten Monorepo-Checkout voraussetzen. [turtle-ui](https://github.com/deepseek-harness/turtle-ui) ist ein funktionierendes Beispiel: Sein `prepare` führt eine eigene tsdown-Konfiguration aus, die `src/` ohne Projektverweise und ohne Typecheck transpiliert.
- **Der Benutzer** erlaubt den Build. pnpm ≥10 verweigert das Ausführen des `prepare`-Skripts einer Git-Abhängigkeit, bis es explizit erlaubt ist, sodass das erste `add` fehlschlägt; `dsh` zeigt auf die Lösung — kopieren Sie den exakten Paketschlüssel, den pnpm ausgegeben hat, in die `pnpm-workspace.yaml` des Profils:

  ```yaml
  allowBuilds:
    dsh-hello-plugin: true
  ```

  und führen Sie `add` erneut aus.

Behandeln Sie diese Erlaubnis als **Erlaubnis, den Code des Pakets zur Installationszeit auf Ihrem Rechner auszuführen**, außerhalb jeder Sandbox, unter der der Agent läuft. Erlauben Sie nur Pakete, deren Quelle Sie vertrauen, und pinnen Sie einen Commit (`github:you/hello-plugin#<sha>`), damit ein späterer Push nicht stillschweigend ändern kann, was läuft.

Wenn Sie Benutzer lieber nicht um diese Erlaubnis bitten möchten, verteilen Sie stattdessen gebaute Artefakte — keine der beiden Formen braucht eine Build-Erlaubnis:

- **Auf npm veröffentlichen** mit `lib/` zur `pnpm publish`-Zeit gebaut; `dsh plugin add your-package` installiert dann vorgebauten Code.
- **Einen Tarball ausliefern** aus `pnpm pack`; Benutzer führen `dsh plugin add ./hello-plugin-0.1.0.tgz` aus.

## Nächste Schritte

- [Plugins und Lebenszyklus](../framework/index.de.md) — der vollständige Plugin-Lebenszyklus
- [CLI-Verhaltensreferenz](../../../../apps/cli/reference/README.de.md) — exakte Schichtenpriorität, Flags und Profilmechanik
