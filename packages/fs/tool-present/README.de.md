---
description: "Zugängliche Dateien mit present als Deliverables deklarieren; Konfiguration, Session-Eigentümerschaft und Quelldatei-Öffnen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-present
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Verwende `present`, um finale Dateien zu deklarieren, die über das Session-Dateisystem zugänglich sind, einschließlich Dateien, die durch Shell-Befehle erstellt wurden. Nutzer öffnen die aktuellen Quelldateien in ihrer Standardanwendung. Das Tool zeichnet Pfade und optionale Beschreibungen auf, ohne Dateiinhalte zu kopieren.

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

Die Agent-Presets `standard`, `ptc` und `cordis` mounten dieses Plugin. Rufe `present` mit `files: [{ path, description? }]` auf, nachdem die Dateien erstellt wurden. Dateien müssen reguläre Dateien sein, die über das Session-Dateisystem zugänglich sind. Relative Pfade werden gegen das Session-Arbeitsverzeichnis aufgelöst; absolute Pfade dürfen Dateien außerhalb benennen, einschließlich `/tmp` oder Downloads. Fehlende Dateien, Verzeichnisse, finale symbolische Links und vom Provider verweigerte Pfade lassen den Aufruf fehlschlagen. Dateien im privaten `/tmp` einer Shell-Sandbox müssen zuerst an einen Ort geschrieben werden, den das Session-Dateisystem erreichen kann.

Mounte es in der Cordis-Komposition eines Agents mit verfügbarem `tools`, `fs` und der `turnBoundary`-Session-Projektion:

```yaml
- name: '@deepseek-ai/dsh-tool-present'
  config:
    maxFiles: 8
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `maxFiles` | `8` | Positive maximale Dateianzahl pro Aufruf |

Das Dateianzahl-Limit wird beim Mounten validiert. Das Tool erfordert eine Agent-Session mit Workspace und offenem Turn. Die Zustellung gehört der aufrufenden Session; ein Elternteil muss `present` selbst aufrufen, um von einem Subagent erstellte Dateien zu deklarieren.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Das Tool löst Pfade über den konfigurierten Dateisystem-Provider auf und prüft Regular-File-Metadaten, ohne Inhalte zu lesen. Erfolgreiche finale `tools/result`-Benachrichtigungen hängen `deliverables/presented` an, einschließlich verschachtelter Aufrufe. Ein späterer Fehlschlag des umschließenden Programms widerruft eine bereits abgeschlossene Deklaration nicht. Blockierte Ergebnisse veröffentlichen keine. Jede Plugin-Instanz zeichnet nur Aufrufe auf, die sie selbst ausgeführt hat; scoped Tools gleichen Namens können nicht über eine andere Instanz veröffentlichen.

Der reine `./types`-Eintrag deklariert `PresentedFile` und das Session-Event, ohne Host-Runtime-Code zu importieren. Der Web-Consumer validiert persistierte Deklarationen, bevor er sie anzeigt oder öffnet. Das Event speichert keine Session-ID, sodass eine geforkte Historie relative Pfade gegen den Workspace der betrachteten Session auflöst.

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Tool- und Event-Registrierungen sind effect-eigen, und das Session-Log besitzt die Dateideklarationen; das Plugin pflegt keinen unabhängigen Dateiinhalts-Store.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [Filesystem-Subsystem](../../../docs/subsystems/filesystem.de.md) — Provider-Pfade und Fehler.
- [Web-Deliverables](../../client/ui-deliverables/README.de.md) — Quelldatei-Öffnen und Karten.
- [Delivery-Entscheidung](../../../.agents/notes/implemented/feature/2026-09-08-present-workspace-source-files.de.md) — Session-Eigentümerschaft und required-on-read Events.

<a id="model-experience"></a>
## Model Experience

### present

#### Was das Modell sieht

Das [present-Schema](../../../docs/tool-catalog.de.md#present) fragt nach existierenden zugänglichen Dateien: „Declare existing files accessible through the Session filesystem as final deliverables. When a file you create or update is an output the user asked to receive, you must call present after writing it and before your final response, including files created through Bash or code execution. Mentioning its path in your reply does not replace this call. The files must already exist. The user opens the current source files; their contents are not copied or preserved.“ Ergebnisse melden `Presented <path>` für jede Datei; das Programmergebnis und das dauerhafte Event enthalten Pfade und optionale Beschreibungen.

#### Token-Auswirkung

Ein Tool-Schema pro gemountetem Agent und eine Ergebniszeile pro zugestellter Datei. Dateibytes gelangen nicht in Modellnachrichten.

#### KV-Cache-Auswirkung

Das Tool-Schema ist für die Mount-Lebenszeit statisch. Der Zustellungsergebnistext erweitert die Konversation, ohne ihr Prompt-Präfix neu zu schreiben.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- Metadaten- und Host-Pfad-Prüfungen können eine Ersetzung nicht atomar verhindern, bevor eine Desktop-Anwendung eine Datei öffnet.
- Bearbeitungen ändern, was geöffnet wird. Gelöschte oder verschobene Quelldateien können nicht aus ihren Deklarationen geöffnet werden.
- Session-ZIP-Exporte enthalten Deklarationen, keine Dateiinhalte. Persistente Zustellungsversionen und Copy-on-Write-Speicher sind zurückgestellt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
