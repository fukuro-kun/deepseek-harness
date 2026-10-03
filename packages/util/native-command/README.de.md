---
description: "Host-native Befehls- und Pfadöffnungs-Hilfsmittel mit shell-freier Ausführung, Abbruch, Desktop-Erkennung und WSL-Pfadübergabe."
kind: "package-library"
---

# @deepseek-ai/dsh-native-command
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh-native-command` führt Host-Executables ohne Shell aus und öffnet Host-Dateisystempfade über den Desktop. Der Befehls-Runner erfasst utf8-Ausgabe, propagiert Abbruch und verbirgt flüchtige Windows-Konsolen. Der Pfad-Öffner unterstützt Intents für Standardanwendung und Texteditor, im Browser darstellbare Dokumente, WSL-Übersetzung und Prüfungen der Desktop-Verfügbarkeit. Es ist eine Bibliothek, kein Plugin: kein `ctx`, kein Zustand, keine Events.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Diesen Runner verwenden, wenn eine Host-seitige Integration einen nativen Befehl ausführen muss und dessen Ausgabe, dessen Fehlschlag oder beides benötigt — und niemals eine Shell involvieren darf.

### Einen Befehl ausführen

```ts
import { runNativeCommand } from '@deepseek-ai/dsh-native-command'

declare const script: string
declare const signal: AbortSignal
const { stdout, stderr } = await runNativeCommand('osascript', ['-e', script], signal)
```

Bei Exit 0 wird der Aufruf mit erfasstem stdout und stderr aufgelöst. Bei jedem Fehlschlag wird er mit dem Exit-`code` und beiden erfassten Streams am Fehler abgelehnt, sodass ein Aufrufer ein fehlendes Werkzeug (`ENOENT`), einen Abbruch (`ABORT_ERR`) und einen echten Befehlsfehlschlag unterscheiden kann, ohne den Befehl erneut auszuführen.

### Die Befehlsgrenze injizieren

Der Typ `NativeCommandRunner` ist die injizierbare Befehlsgrenze für Host-Integrationen: Die Funktion (oder eine wrapper) wird dort übergeben, wo die Integration eine testbare Seam benötigt, damit Tests einen Fake-Runner einsetzen können.

### Einen Host-Pfad öffnen

`openNativePath(path, signal)` übergibt einen Pfad an die Standardanwendung und bevorzugt den benannten Standard-Browser für HTML und SVG, sofern die Plattform einen ermitteln kann. `openNativeTextFile(path, signal)` wählt den Texteditor-Intent; unter macOS nutzt es `open -t`. WSL-Pfade werden mit `wslpath -w` übersetzt, bevor der Windows-Desktop sie erhält. `canOpenNativePath()` meldet, ob der aktuelle Host plausibel ein Desktop-Ziel besitzt.

`revealNativePath(path, signal)` markiert die Datei in Finder oder Explorer, einschließlich WSL-Pfadübersetzung, und öffnet unter Desktop-Linux das Elternverzeichnis über `xdg-open`. `nativeFileManager()` benennt diese Aktion für vom Host abgeleitete UI-Texte; die Desktop-Verfügbarkeit bleibt eine separate `canOpenNativePath()`-Prüfung. Aufrufer müssen den absoluten Dateipfad autorisieren, bevor sie eine der Operationen aufrufen. Die Plattform-Dispatch ist durch Tests mit injiziertem Runner abgedeckt; die native Desktop-Verifikation liegt bei der jeweiligen Plattform. Explorer erhält eine codierte Datei-URI als separates Argument. Sein Exit-Code 1 wird als delegierte Übergabe akzeptiert; Abbruch, fehlende Executables und andere Exit-Codes lehnen weiterhin ab. Diese Bestätigung beweist nicht, dass ein Desktop-Fenster die Datei markiert hat.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Ausklappen klicken</summary>

Der Befehls-Runner ist ein dünner Wrapper über Nodes `execFile`. Der Pfad-Öffner wählt anhand von Plattform- und Umgebungsfakten einen shell-freien Befehl, während die Aufrufer die Hoheit darüber behalten, welcher Pfad geöffnet werden darf.

### Quellcode-Übersicht

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Öffentliche Exports von Befehls-Runner und Pfad-Öffner |
| [`src/runner.ts`](src/runner.ts) | Shell-freier `execFile`-Adapter |
| [`src/path-opener.ts`](src/path-opener.ts) | Desktop-Erkennung, Open-Intents, Browser-Präferenz und WSL-Übersetzung |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; jeder Lauf ist ein zustandsloser Child-Prozess-Roundtrip ohne eigenen Event-Stream oder veränderliche Runtime-Daten; das Verhalten wird durch Unit-Tests abgesichert. |

### Was execFile dem Runner liefert

`execFile` spawnt das Executable direkt mit einem argv-Array — kein Shell-String, keine Shell-Interpretation der Argumente. Die Option `signal` beendet den Child-Prozess, wenn der Abort des Aufrufers auslöst; `windowsHide` unterdrückt das flüchtige Konsolenfenster unter Windows. Bei einem Exit ungleich null oder einem Spawn-Fehler hängt der Callback `code`, `stdout` und `stderr` an den abgelehnten Fehler und behält den ursprünglichen Fehler als `cause`.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn die Consumer oder die allgemeine Subprocess-Capability gebraucht werden, die dieses Hilfsmittel bewusst nicht ist.

- [Nativer Verzeichnis-Picker](../../host/directory-picker-native/README.de.md) — die OS-Wählerbefehle, die dieser Runner ausführt.
- [Session Controller](../../api/session-controller/README.de.md) — löst Session-relative Workspace-Pfade auf, bevor sie geöffnet werden.
- [Settings Controller](../../api/settings-controller/README.de.md) — wählt Settings-Dokumente und Agent-Preset-Verzeichnisse aus.
- [Subprocess-Capability](../../subprocess/subprocess/README.de.md) — die allgemeine Subprocess-Seam, von der dieses Paket kein Teil ist.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da die Host-seitigen Hilfsmittel nichts Modell-zugewandtes registrieren.

#### KV-Cache-Effekt

Nichts hiervon gelangt in ein Request-Präfix; dieses Paket stellt weder einen Provider-Request zusammen noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen legen fest, wann dieser Runner nicht das richtige Werkzeug ist. Es sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Keine Ausgabe-Begrenzung** — beide Streams puffern unbegrenzt im Speicher; jeder aktuelle Aufrufer ruft kleine native Werkzeuge auf, deren Ausgabe ein Pfad oder eine Fehlerzeile ist. `dsh-output-retention`-Begrenzung einführen, bevor dieser Runner auf Befehle mit nennenswertem Ausgabevolumen zeigt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Ausklappen klicken</summary>

Keiner.

</details>
