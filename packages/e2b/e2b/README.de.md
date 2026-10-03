---
description: "Eine gemeinsame Remote-Linux-Sandbox für E2B-gestützte Datei- und Kommandoarbeit: Konfiguration, Lebensdauer und was bei Start und Shutdown passiert."
kind: "package-reference"
---

# @deepseek-ai/dsh-e2b
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh-e2b` führt die Dateioperationen, Shell-Kommandos und Terminals des Agents in einer gemeinsamen Remote-Linux-Sandbox aus statt auf deinem Rechner. Die Sandbox wird beim Start erstellt und gelöscht, wenn ihre konfigurierte Lebensdauer abläuft oder die App herunterfährt — alles, was sie enthält, ist also flüchtig. Konfiguriere einen API-Key, ein absolutes Remote-Arbeitsverzeichnis und die Sandbox-Lebensdauer. Nutze das Paket mit `dsh-fs-e2b` und `dsh-subprocess-e2b`; allein fügt es keine nutzersichtbare Capability hinzu. Es sendet nichts an das Modell, und keine ausgelieferte Composition aktiviert E2B standardmäßig.

## Inhaltsverzeichnis

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Nutze dieses Paket, wenn die Datei- und Kommandoarbeit des Agents in einer Remote-Linux-Sandbox statt auf deinem Rechner laufen soll. Es ist das Fundament der E2B-Familie: Mit eingehängten Filesystem- und Subprocess-Paketen teilt sich all diese Arbeit ein Remote-Arbeitsverzeichnis und eine Prozesswelt.

### Wann du es wählen solltest

Wähle die E2B-Familie, wenn Arbeit von der Host-Maschine isoliert sein soll — etwa wenn die Dateiedits und Kommandoausführungen des Agents in einer wegwerfbaren Umgebung stattfinden sollen. Wähle die lokalen Filesystem- und Subprocess-Pakete, wenn Ausführung auf dem Host in Ordnung ist. Dieses Paket ist für das Modell unsichtbar und verursacht keine Request-Kosten.

### Minimale Konfiguration

Drei Einstellungen sind wichtig: ein API-Key (oder die Umgebungsvariable `E2B_API_KEY`), ein absolutes Remote-Arbeitsverzeichnis und die Sandbox-Lebensdauer. Ein falscher Key, ein relatives Arbeitsverzeichnis oder eine ungültige Lebensdauer lehnen den Start ab, bevor irgendeine Remote-Arbeit stattfindet.

```yaml
- name: '@deepseek-ai/dsh-e2b'
  config:
    apiKey: <E2B API key>
    cwd: /home/user/workspace
    timeoutMs: 300000

- name: '@deepseek-ai/dsh-subprocess-e2b'
- name: '@deepseek-ai/dsh-fs-e2b'
```

| Feld | Default | Bedeutung |
|---|---|---|
| `apiKey` | `E2B_API_KEY` | API-Key für die Host-SDK-Verbindung; wird niemals in der Sandbox installiert |
| `cwd` | `/home/user/workspace` | Remote-Arbeitsverzeichnis, das die Familie teilt; absoluter POSIX-Pfad |
| `timeoutMs` | `300,000` | Sandbox-Lebensdauer in Millisekunden; die Sandbox wird bei Ablauf gelöscht |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-e2b) ist die erschöpfende Quelle für jedes akzeptierte Feld und dessen JSDoc.

### Was du bekommst

Mit eingehängtem Paket laufen Datei-Reads und -Writes, Shell-Kommandos und Terminals alle innerhalb des Arbeitsverzeichnisses der Sandbox, sodass der Agent eine konsistente Remote-Welt sieht: Was er mit den Datei-Features schreibt, können seine Kommandos lesen — und umgekehrt. Das Remote-Arbeitsverzeichnis wird erstellt, falls es noch nicht existiert.

### Sandbox starten und stoppen

Das Laden des Plugins startet die Sandbox im Hintergrund; die Filesystem- und Subprocess-Features sind bereit, sobald sie läuft. Die Sandbox lebt für die konfigurierte Lebensdauer (Standard fünf Minuten), sofern die App nicht zuerst stoppt — in beiden Fällen wird sie gelöscht, also sichere vorher alles, was du noch brauchst. Verschwindet die Sandbox während des Betriebs (abgelaufen oder anderweitig entfernt), behandelt die Familie das als sauberes Ende, nicht als Fehler.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Owner und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Use this package](#use-this-package) beschrieben.

### Designphilosophie

- **Eine Sandbox, ein Handle.** Alle Adapter warten auf dasselbe `getSandbox()`-Promise, sodass Filesystem- und Prozessoperationen eine Remote-Linux-Welt teilen.
- **Secure by construction.** Die Sandbox wird mit `secure: true` und `lifecycle: { onTimeout: 'kill' }` erstellt, sodass Ablauf sie immer löscht.
- **Isolierte Kontroll-Shells.** `e2bControlEnvs()` gibt jeder internen Kommando-Shell ein frisches zufälliges `HOME`, und `quoteE2BShellArg()` erhält opake Argumente durch die unvermeidliche `/bin/bash -l -c`-Schicht des SDK.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `E2BRuntime`-Service, `Config`-Schema, Validierung, Sandbox-Öffnung und -Teardown |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; Sandbox-Erstellung und -Teardown haben ein SDK-Promise und keine unabhängige Event- oder Mutable-Data-Relation zum Gegenprüfen. |

### Lifecycle

`open()` erstellt die Sandbox, bereitet `cwd` und die private Runtime-Wurzel vor, lehnt eine Runtime-Wurzel ab, die kein Verzeichnis oder ein Symlink ist, und wendet `chmod 700` an. Disposal verhindert neue Handle-Akquisition, wartet das Setup ab und löscht die Sandbox, wobei `SandboxNotFoundError` als Quiescence akzeptiert wird. `getSandbox()` prüft das disposed-Flag nach dem Warten auf Bereitschaft erneut, sodass ein mit der Bereitschaft rasendes Disposal die Akquisition trotzdem ablehnt; ein eifriger Verbindungsfehler bleibt beobachtbar, lehnt aber das Plugin-Laden nicht ab — `getSandbox()` zeigt ihn an.

### Setup-Fehlerbehandlung

Jeder Verzeichnis-Setup-Fehler unternimmt einen Löschversuch und bewahrt den ursprünglichen Fehler; ein fehlgeschlagener Rollback ist durch E2Bs konfiguriertes Sandbox-Timeout begrenzt (siehe Dev Note). Provider-Plugins müssen nach diesem Owner laden und vor ihm disposen, weil jeder Adapter auf dasselbe Handle wartet.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Lies diese Seiten, wenn der Paket-Contract nicht ausreicht. Sie bewegen sich von der Familien-Composition zur Subprocess-Seam-Oberfläche und der Entscheidungsgrundlage hinter der Remote-Ausführungswelt.

- [E2B-Provider-Familienkarte](../README.de.md) — die drei Pakete und die Opt-in-Composition.
- [Subprocess-Subsystem](../../../docs/subsystems/subprocess.de.md) — der Subprocess-Seam-Contract und die generierte Cordis-Oberfläche, einschließlich `ctx.e2b`.
- [Entscheidung zur portablen Ausführungswelt](../../../.agents/notes/implemented/architecture/2026-07-28-portable-execution-world-consumers.de.md) — warum Consumer an `ctx.fs` und `ctx.subprocess` delegieren und was im Host bleibt.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-e2b) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da der Owner der gemeinsamen Remote-Runtime keinen Modellkontext registriert; Provider-Adapter und Consumer besitzen die gerenderten Effekte.

#### KV-Cache-Effekt

Keine direkte Invalidierung: Der Owner trägt keine Request-Tokens bei und verändert nie ein Request-Prefix, sodass die Provider-Cache-Wiederverwendung unberührt bleibt.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die E2B-Familie eine schlechte Wahl ist oder besondere Betriebssorgfalt braucht. Es sind aktuelle Paket-Constraints, kein Aufgaben-Backlog.

- **Keine Ganz-Harness-Runtime** — Cordis-Services, Agent-/Session-State, Session-Logs, LLM-Requests, Skills und SDK-seitige Puffer bleiben im Host-Prozess.
- **Sandbox-State ist flüchtig** — Disposal und Timeout löschen die Sandbox; Reconnect, Pause/Leave-Retention, Templates, Volumes und Snapshots liegen außerhalb dieses POC.
- **Keine Deployment-Plattform konfiguriert** — Netzwerk-Policy, Host-Workspace-Synchronisation und Sandbox-Discovery liegen außerhalb dieses POC.
- **`cwd` ist eine Auflösungskonvention, kein Containment** — Adapter und Kommandos können andere Sandbox-Pfade adressieren; der E2B-Netzwerkzugriff behält die Policy des Basis-Images.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und unentschiedene Richtungen. Sie ist explizit nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen stehen in den Abschnitten oben und im Paket-Code.

#### Offen: Sandbox-Setup-Rollback

Der `open()`-Fehlerpfad unternimmt einen einzigen Löschversuch und bewahrt den ursprünglichen Setup-Fehler. Retry-State bleibt zurückgestellt, es sei denn, ein realer Doppelfehler überlebt E2Bs konfiguriertes Sandbox-Timeout (TODO(e2b-setup-rollback)).

</details>
