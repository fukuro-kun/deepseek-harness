---
description: "App-eigene Kommandozeilen für dsh-App-Bins: Ihre App parst ihre eigenen Flags, --help und Exit-Verhalten aus den verbleibenden Argumenten des Launchers."
kind: "package-library"
---

# @deepseek-ai/dsh-cmdline
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-cmdline` lässt eine App ihre eigenen Flags, `--help` und Fehler aus den Argumenten parsen, die nach den Launcher-Flags unverändert übrig bleiben. Geparste Werte können Konfigurations-Defaults überschreiben, ohne die Konfiguration umzuschreiben. Die App kann außerdem über den Shutdown-Pfad des Launchers einen Prozess-Exit anfordern. Verwenden Sie dieses Paket für App-Bins mit eigener Kommandozeilen-Schnittstelle. Es fügt keinen Prompt, kein Schema und keinen modell-sichtbaren Inhalt hinzu.

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

Ihre App liest beim Start die inneren Argumente des Aufrufs, und eine beliebige Zahl ihrer Plugins kann sie verwenden. Der übliche Weg: Ein Startup-Plugin liest die Argumente, parst sie und veröffentlicht die geparsten Werte; andere Zeilen konfigurieren sich aus diesen Werten.

### Die Launcher-Werte

Der Launcher stellt Ihrer App drei Dinge bereit:

- `ctx.cmdlineArgs` — die inneren Argumente Ihres Aufrufs. Sie zu lesen gibt einen immutable Snapshot zurück und konsumiert oder ändert sie nie: `dsh --profile tui --resume abc` gibt Ihrer App `['--resume', 'abc']`.
- `ctx.appExit` — ein Weg, den Prozess zum Exit aufzufordern, sobald der Baum heruntergefahren ist, verdrahtet mit dem Shutdown-Controller des Launchers.
- `ctx.appReady` — das Successful-Startup-Signal, das erst committed wird, nachdem der Loader-Baum und das launcher-eigene Setup erfolgreich waren.

Eine ohne Argumente gestartete App sieht eine leere Liste — das ist die ehrliche Antwort, kein fehlender Wert.

`exitOnStdinEnd(ctx, label)` bindet das EOF einer erfolgreich gestarteten Stdio-App an `ctx.appExit(0)`. Es liest oder resumed stdin nie, sodass ein Protocol-Transport vor dem Mounten gepufferte Bytes erhält; ein Startup-Reject gewinnt gegen ein rasendes EOF, und die besitzende Fiber entfernt beide ausstehenden Listener.

### Ihre Flags parsen

Sie bringen Ihr eigenes Commander-Programm mit: Deklarieren Sie Ihre Flags und Ihre Actions, und das Paket führt es gegen die inneren Argumente aus. Ihre Action ist der einzige Ort, an dem Validierung passiert, und sie veröffentlicht, was Ihre Zeilen brauchen. Die Loader-Zeile des Plugins trägt keinen besonderen Marker:

```yaml
- id: web-startup
  name: '@deepseek-ai/dsh-web-app/startup'
```

Zeilen, die aus den geparsten Werten konfiguriert werden, injizieren den veröffentlichten Service und lesen ihn direkt in ihrer Config:

```yaml
- id: webserver
  name: '@deepseek-ai/dsh-host-webserver'
  inject: [webStartup]
  config:
    host: !!js ctx.webStartup.host ?? '127.0.0.1'
    port: !!js ctx.webStartup.port ?? 3080
```

Die Ergebnisse: `dsh --profile web --port 8080` startet den Server auf Port 8080, selbst wenn die Config 3080 sagt, weil das Flag gewinnt. `--help` druckt die Hilfe Ihrer App und exitet mit 0, ohne irgendetwas zu starten; ein rejected Wert (zum Beispiel ein nicht-numerischer Port) druckt Ihren Fehler und exitet nonzero, und keine Zeile, die von den geparsten Werten abhängt, startet je.

### Wie Flags Config-Werte schlagen

Der neben einem `!!js`-Ausdruck geschriebene Wert ist der Fallback: Das Flag gewinnt, wenn vorhanden, andernfalls wird der geschriebene Wert verwendet. Die Resolution passiert einmal beim Start, nachdem Ihr Parser gelaufen ist, sodass ein Flag nie still von einem späteren Config-Reload zurückgesetzt wird.

### Dieselben Argumente aus mehreren Plugins lesen

Eine beliebige Zahl von Plugins kann dieselben Argumente lesen — Lesen konsumiert sie nie — und jedes kann parsen, was es braucht, und seine eigenen Werte veröffentlichen. Der Launcher entscheidet nicht, wer die Kommandozeile besitzt: Eine App ohne Reader ignoriert ihre Argumente.

Apps, die außerhalb dieses Repositories gebaut sind, verhalten sich genauso: Ihr `--help` druckt und exitet, statt zu crashen, obwohl sie ihre eigene Commander-Kopie mitbringen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie die obigen Ergebnisse realisiert sind, und verweist auf den Code, der sie umsetzt; alles hier ist Developer-facing und wird zum Verwenden des Pakets nicht benötigt.

### Design-Notizen

- **Launcher-Fakten, keine Config.** `cmdlineArgs` und `appExit` werden auf dem Host-Kontext bereitgestellt, bevor der Baum mountet; sie sind keine Loader-Zeilen, also besitzt oder überschreibt sie keine Komposition.
- **Positions-basierter Split.** Der Launcher erkennt keine App-Zeile: Das erste Token nach seinen eigenen Flags beginnt die Argumente der App, sodass die App ihre Flag-Familie, ihren `--help`-Text und ihre Parse-Fehler besitzt.
- **Strukturelle Fehlererkennung.** `isCommanderError` liest Commander's Error-Code-Präfix statt `instanceof` zu verwenden, weil ein Out-of-Tree-Plugin seine eigene Commander-Kopie mitbringt, deren `CommanderError`-Identität sich unterscheidet; `configureExitAndOutput` läuft über jedes Subcommand, weil Commander Exit- und Output-Settings nur bei der Registrierung kopiert.
- **Injizierbare Output-Streams.** `internals` hält die Output-Streams, damit Tests Commander's Text erfassen können, ohne den Prozess anzufassen.

### Parsing-Vertrag

Der Parse-Pfad ist eine kleine Familie mit zwei Ownern: `provideCmdline` friert die Host-Argumente ein und stellt `cmdlineArgs` und `appExit` bereit, bevor irgendein Baum-Eintrag mountet, und `parseCmdline` führt Ihr Commander-Programm gegen die immutable Argumente aus und routet Help-, Version- und Error-Output jedes Kommandos durch den Launcher. Ein rejected Wert, `--help` oder `--version` druckt Commander's Text und fordert `ctx.appExit` an, ohne etwas zu veröffentlichen, sodass abhängige Zeilen nie aktivieren; der Loader verschiebt die `!!js`-Interpolation jeder Zeile, bis ihre deklarierten Injections aktiv sind. Pro-Export-Verträge leben im Code, nicht in diesem README — siehe [`src/index.ts`](src/index.ts).

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `CmdlineArgs`/`AppExit`-Typen, `provideCmdline`, `parseCmdline`, Commander-Exit/Output-Routing |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; `cmdlineArgs` ist ein immutabler Launcher-Fakt, den eine beliebige Zahl gewöhnlicher Plugins lesen darf. App-eigene Provider und Consumer verwenden normale Cordis-Service-Injection, deren fehlende Dependencies bereits durch die Loader-Settlement gemeldet werden. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie führen vom Handoff-Mechanismus zu den Apps, die ihn konsumieren.

- [dsh-app-boot](../app-boot/README.de.md) — die Boot-Sequenz, die diese Launcher-Werte bereitstellt.
- [dsh-web-app-Bundle](../../bundle/web-app/README.de.md) — eine App, die die Web-Flag-Familie über dieses Paket besitzt.
- [dsh-headless-Bundle](../../bundle/headless/README.de.md) — der One-Shot-Runner, der seinen Task aus der Kommandozeile liest.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da dieses Paket die Prozess-Kommandozeile auflöst, bevor irgendeine Session existiert; konfigurierte Zeilen besitzen jede modell-sichtbare Konsequenz.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert oder sendet keinen Provider-Request.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen beschreiben, wo app-eigene Kommandozeilen eine schlechte Wahl sind oder besondere Sorgfalt brauchen. Sie sind aktuelle Paket-Einschränkungen, kein Task-Backlog.

- **Launcher-Flags müssen vor den App-Argumenten stehen** — der Split ist positions-basiert: Das erste Token, das der Launcher nicht erkennt, beginnt die inneren Argumente, sodass ein `--patch` hinter einem App-Flag der App gehört. Der Parser des Launchers konsumiert ein `--`, sodass ein App-Argument, das als literales `--` überleben muss, `-- --` braucht.
- **Ein app-eigener Service hat keinen statisch deklarierten Provider** — Consumer-Zeilen benennen ihn über gewöhnliche Injection; ein Bundle, das seinen Provider auslässt, scheitert bei der Settlement mit ausstehenden Einträgen, die den Service benennen, statt beim Laden.
- **Ein User-Patch, der die ganze `config` einer Zeile ersetzt, verwirft ihre Ausdrücke** — ein Flag schlägt den daneben geschriebenen Wert, nicht ein Literal, das ein User anstelle des Ausdrucks schrieb; den Ausdruck zu behalten ist, was das Flag gewinnen lässt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Design-Fragen und Richtungen, die nicht entschieden sind. Sie ist explizit nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen leben in den obigen Abschnitten, dem Paket-Code und den verlinkten Agent Notes.

#### Offen: Parser-Oberfläche

`parseCmdline` ist ein Commander-Adapter, kein Kommandozeilen-Framework: Help-, Version- und Error-Output folgen Commander's Formatierung, und das Exit/Output-Routing setzt Commander's Control-Flow-Modell voraus. Ein anderer Parser bräuchte sein eigenes Routing und Error-Handling; nichts im `cmdlineArgs`-Service-Vertrag hängt von Commander ab.

</details>
