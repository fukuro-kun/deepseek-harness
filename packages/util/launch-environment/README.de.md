---
description: "Ein unveränderlicher Snapshot der Umgebung dieses Laufs, der sich merkt, welche Schicht jeden Wert geliefert hat — für Pakete, die nutzerseitige Werte auflösen müssen, ohne einem abgeflachten process.env zu vertrauen."
kind: "package-library"
---

# @deepseek-ai/dsh-launch-environment

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`@deepseek-ai/dsh-launch-environment` verwenden, um Umgebungswerte zum Startzeitpunkt aufzulösen, ohne dem abgeflachten `process.env` zu vertrauen. Es friert die geerbten Prozesswerte, die `.env` des Aufrufverzeichnisses und die `.env` des Harness-Homes ein und liefert dann den gewinnenden Wert samt Quelle in fester Vertrauensreihenfolge. Aufrufer können Schichten für sensible Lookups ausschließen; eine weggelassene Schicht bleibt unerreichbar, unabhängig von späteren Änderungen der Reihenfolge. Der Snapshot ist unveränderlich, aber jede Schicht wird weiterhin nach `process.env` kopiert — er isoliert also keine Subprozesse. Als Bibliothek importieren; sie lässt sich nicht aus `cordis.yml` mounten.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Nutzerseitige Werte über den Snapshot statt über `process.env` auflösen, wann immer die Schichten nicht gleichermaßen vertrauenswürdig sind — etwa bei einem Credential-Override, das ein Aufrufer niemals aus einem Projektverzeichnis übernehmen darf.

### Einen Wert auflösen

```ts
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'

declare const ctx: import('@deepseek-ai/cordis').Context
const endpoint = launchEnvironmentOf(ctx).get('DEEPSEEK_BASE_URL')?.value
```

`get(name)` durchsucht jede Schicht, die vertrauenswürdigste zuerst. `getFrom(name, sources)` durchsucht nur die benannten Schichten, ohne diese Vertrauensreihenfolge zu ändern — ein Aufrufer, der eine Schicht niemals akzeptieren darf, lässt sie aus der Liste weg, sodass keine künftige Umordnung sie zurückbringen kann.

`launchedThroughSsh(snapshot)` liefert nur dann true, wenn in der geerbten Prozessschicht ein nicht-leeres `SSH_CONNECTION` oder `SSH_TTY` steht. Webbrowser-Handoff, der adaptive Directory-Picker und Open In teilen sich dieses Prädikat; Projekt- und Nutzer-`.env`-Werte begründen niemals eine SSH-Session.

### Wie die Schichten rangieren

| Schicht | Was sie ist |
|---|---|
| Geerbte Prozessumgebung | Was die startende Shell, der CI-Job oder der Container hereingereicht hat — die explizite Absicht dieses Laufs |
| `<invocation cwd>/.env` | Das Projekt, in dem der Harness gestartet wurde; das Produkt vertraut ihm, seinen eigenen Agent zu konfigurieren |
| `$DSH_HOME/.env` | Die eigenen maschinenweiten Defaults des Nutzers |

Namen werden so gematcht, wie die Plattform sie matcht: exakt auf POSIX, case-insensitiv auf Windows. Ein case-sensitiver Lookup auf Windows würde die falsche Schicht rangieren — das `deepseek_api_key` einer Shell und das `DEEPSEEK_API_KEY` einer Projekt-`.env` sind für das Betriebssystem eine Variable.

### Wenn kein Launcher den Baum gebootet hat

`launchEnvironmentOf(ctx)` liefert den Snapshot des Launchers, wenn das Produkt-CLI den Baum gebootet hat, und sonst die geerbte Umgebung als einzige Schicht. Der Fallback schwächt die Regeln nicht ab: Ein SDK-Host oder ein nacktes `cordis.yml` hat keine Dateien gefunden, also ist alles, was es besitzt, die Umgebung, mit der es gestartet wurde.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Ausklappen klicken</summary>

Der Snapshot baut auf einer Trennung auf: Der Launcher besitzt, welche Dateien existieren, und der Snapshot besitzt, wie Werte rangieren.

### Quellcode-Übersicht

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `createLaunchEnvironmentSnapshot`, `launchEnvironmentOf` und der `ctx.launchEnvironment`-Slot |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; der Snapshot ist eingefroren, bevor irgendeine fiber startet, und dieses Paket besitzt keinen Event-Stream und keine veränderlichen Runtime-Daten; seine Lookup- und Ablehnungsregeln werden durch Unit-Tests abgesichert. |

### Wie der Snapshot eingefroren bleibt

`createLaunchEnvironmentSnapshot` kopiert die Werte jeder Schicht bei der Konstruktion, sodass eine spätere Mutation des Quellobjekts den Snapshot nicht ändern kann. Lookups durchlaufen unabhängig von der Konstruktionsreihenfolge eine kanonische Vertrauensordnung; auf Windows werden Namen vor dem Speichern auf Großschreibung gefaltet, damit Groß-/Kleinschreibungsvarianten die Priorität nicht spalten können.

### Was Weglassen bedeutet

`getFrom` filtert nach der kanonischen Reihenfolge, niemals nach der Reihenfolge der Aufruferliste. Eine Schicht wegzulassen ist eine Verweigerung: Der Wert ist über diesen Aufruf unerreichbar — genau der Mechanismus, den ein Aufrufer nutzt, wenn eine Schicht eine bestimmte Entscheidung niemals beeinflussen darf.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der Launcher gebraucht wird, der den Snapshot baut, oder die Consumer, die über ihn auflösen.

- [Boot-Paket](../../boot/app-boot/README.de.md) — der Launcher, der `ctx.launchEnvironment` füllt, bevor irgendein Config-Eintrag mountet.
- [Credentials-Store](../../credentials/credentials-local/README.de.md) — löst gespeicherte Credentials gegen die Schichten des Snapshots auf.
- [DeepSeek-Provider](../../llm/llm-deepseek/README.de.md) — liest die Provider-Konfiguration über die Launch-Umgebung.

-----

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen legen fest, wann der Snapshot keine Sicherheitsgrenze ist. Es sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Der Snapshot ist keine Subprozess-Grenze** — jede Schicht wird ebenfalls nach `process.env` materialisiert, sodass gewöhnliche Projektvariablen Child-Prozesse unter dem Scrubbing von [`dsh-subprocess`](../../subprocess/subprocess/README.de.md) erreichen; der [`.env`-Vertrag](../../boot/app-boot/README.de.md) des Produkt-Launchers lehnt Bootstrap-Variablen vor der Materialisierung ab.
- **Keine Schicht pro Workspace** — die Projektschicht ist das Aufrufverzeichnis, beim Start festgelegt; ein später in der Web-UI gewählter Workspace trägt bewusst nichts bei, weil ein Folgen darauf dem eigenen Workspace des Modells erlauben würde, die Harness-Umgebung mitten in der Session zu ändern.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Ausklappen klicken</summary>

Keiner.

</details>
