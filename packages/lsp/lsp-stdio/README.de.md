---
description: "Der Stdio-Language-Server-Provider für ctx.lsp: konfigurierte Server-Kommandos, Extension-Mappings und begrenzte Transient-Open-Queries, für Nutzer und Maintainer, die lokale Code-Navigation komponieren."
kind: "package-reference"
---

# @deepseek-ai/dsh-lsp-stdio

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Verwende `dsh-lsp-stdio`, um Agents Definitionen, Referenzen, Implementierungen und Hover aus explizit konfigurierten lokalen Language Servern zu geben. Es bildet Dateiendungen auf Language-Identifier ab, startet auf Bedarf einen Server pro Workspace und liest jede abgefragte Datei frisch, ohne Dokumentzustand zwischen Queries zu behalten. Language-Server-Prozesse und Quell-Reads teilen sich das gemountete Dateisystem und die Subprocess-Umgebung. Das Paket installiert keine Server und stellt keine Sandbox bereit: Deployments liefern Kommandos, Mappings und jede nötige Isolierung. Queries sind pro Server und Workspace serialisiert, während verschiedene Workspaces parallel laufen können.

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

Mounte diesen Provider, wenn ein Deployment lokale Language Server hat — etwa `typescript-language-server` — und der Harness Code über sie navigieren soll. Es braucht Filesystem- und Subprocess-Provider für dieselbe Execution-World, dazu den `dsh-lsp`-Seam und für Modell-Zugriff `dsh-tool-lsp`.

### Minimale Konfiguration

Der `servers`-Record bildet jede stabile Provider-ID auf ein Server-Kommando ab. Der Provider löst jedes Executable beim Laden nach dem Credential-Scrubbing auf, sodass ein schlechter Eintrag jeden Provider an der Registrierung hindert; Prozesse starten lazy bei der ersten passenden Query.

```yaml
- name: '@deepseek-ai/dsh-fs-local'
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-lsp'
- name: '@deepseek-ai/dsh-lsp-stdio'
  config:
    servers:
      typescript:
        command: typescript-language-server
        args: ['--stdio']
        extensionToLanguage:
          '.ts': typescript
- name: '@deepseek-ai/dsh-tool-lsp'
```

| Feld | Default | Bedeutung |
|---|---|---|
| `command` | erforderlich | Zu spawnendes Executable — absolut oder beim Laden auf dem PATH des Childs aufgelöst; ohne Shell gestartet |
| `extensionToLanguage` | erforderlich | Kleingeschriebene Extension mit führendem Punkt → LSP-Language-ID (z. B. `{ '.ts': 'typescript' }`) |
| `args` | `[]` | Argumente, die an das Executable übergeben werden |
| `env` | `{}` | Zusätzliches Env, gemergt über das credential-bereinigte Umgebungs-Env; Variablen, die `KEY`/`PASSWORD`/`SECRET`/`TOKEN` matchen, und alle `DSH_*`-Namen werden nicht weitergeleitet |
| `initializationOptions` | `null` | Statische `initialize`-Optionen, die an den Server weitergeleitet werden |
| `configuration` | `null` | Statische Antwort auf jedes `workspace/configuration`-Item |
| `maxMessageBytes` | `16000000` | Größte einzelne geframete Nachricht, die vom Server akzeptiert wird |
| `maxStderrBytes` | `1000000` | Größter stderr-Tail, der für Diagnostik behalten wird |
| `maxDocumentBytes` | `4000000` | Größte Quelldatei, die dieser Host öffnet |
| `shutdownTimeoutMs` | `5000` | Budget für graceful `shutdown`/`exit` vor der Eskalation |
| `killGraceMs` | `2000` | Grace-Zeit für Request-Cancel und SIGTERM→SIGKILL-Eskalation |

`servers` muss mindestens einen Eintrag mit nicht-leeren IDs enthalten; Timer-Budgets müssen positive Integer innerhalb von Nodes Timer-Bereich sein, und Byte-Caps müssen positiv sein. Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-lsp-stdio) ist die erschöpfende Quelle für jedes akzeptierte Feld.

### Was eine Query tut

Bei der ersten Query für einen Workspace startet der Provider einen Server-Prozess für diesen Workspace und hält ihn gepoolt. Jede Query liest die aktuelle Quelle über `ctx.fs`, öffnet sie im Server (`textDocument/didOpen`), führt die angefragte Operation aus und schließt sie — der Server sieht also immer den aktuellen Text, und kein Dokumentzustand bleibt zwischen Aufrufen bestehen. Queries an einen Server und Workspace laufen einzeln; verschiedene Workspaces laufen parallel. Schlägt der gepoolte Prozess vor oder während einer Read-only-Query fehl, wiederholt der Provider diese Query einmal auf einem frischen Prozess.

### Beobachtbare Erfolge und Fehler

Eine erfolgreiche Navigation gibt normalisierte Locations zurück, und Hover gibt normalisierten Text oder einen No-Hover-Hinweis zurück; leere Ergebnisse sind erfolgreiche No-Result-Antworten. Die Query schlägt fehl, wenn der Server die Operation oder die Transient-Open/Close-Synchronisation nicht unterstützt (`LSP_UNSUPPORTED_OPERATION`), wenn die Quelle fehlt, kein reguläres File ist, nicht UTF-8 ist, zu groß ist oder außerhalb des kanonischen Workspace liegt (vor dem Server-Start abgelehnt), oder wenn der Server ein malformed Payload zurückgibt (`LSP_MALFORMED_RESPONSE`). Ein hart gekillter Harness lässt Server laufen, bis sie von selbst terminieren — graceful Shutdown geschieht nur über Service-Disposal.

### Sicherheitsgrenze

Dieser Provider vertraut seinem konfigurierten Server und fügt keine Sandbox-Isolierung hinzu; der Server erhält die Filesystem- und Prozess-Autorität der gemounteten Execution-World. Er lehnt Query-Quellen ab, die fehlen, nicht regulär, nicht UTF-8, zu groß oder kanonisch außerhalb des Workspace liegen, bevor der Server startet. Ergebnis-Locations dürfen außerhalb des Workspace zeigen, aber ein externer Pfad kann niemals eine Query-Quelle werden. Mounte Filesystem- und Subprocess-Provider für dieselbe Execution-World — eine Split-World-Komposition ist ungültig.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Provider und wo der Code sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designphilosophie

- **Generischer Host, kein Katalog.** Deployments konfigurieren Kommandos und Mappings explizit; Presets gehören in `cordis.yml`-Overlays, nicht in dieses Paket.
- **Kompatibilitäts-orientiertes Transient-Open.** Jede Query führt `didOpen` (Version 1, Volltext) → Request → `didClose` aus, sodass der Server immer aktuelle Bytes sieht und die erste Version kein `didChange`, keinen Content-Cache und keine Dokument-LRU braucht.
- **Read vor Spawn.** Die Quelle wird innerhalb der Workspace-Queue aufgelöst, auf Enthalten-sein geprüft und byte-begrenzt, bevor irgendein Prozess erstellt wird — eine gequeuete Query sieht aktuelle Bytes, wenn ihr Turn beginnt, und eine ungültige Quelle kann keinen idle Prozess gepoolt zurücklassen.
- **Ein gepoolter Prozess pro kanonischem Workspace.** Instanzen sind single-flight pro `(server id, canonical workspace target)`; ein Transport-Fehler wiederholt die Read-only-Query einmal auf einem frischen Prozess, nachdem das Disposal abgewartet wurde.
- **Pro-Workspace-Serialisierung.** Eine abbrechbare Queue pro Workspace serialisiert die Lifecycles Source-Read/Open/Query/Close; verschiedene Workspaces laufen parallel, und eine Cancellation, die einen Server nicht stoppen kann, terminiert nur diese Instanz.
- **Begrenztes Teardown.** Graceful `shutdown`/`exit` eskaliert über die Managed-Range-Terminierung des Subprocess-Providers; Quiescence wird durch das Abwarten der gesamten Range bestätigt, nicht durch das Ergebnis des Terminierungs-Requests.
- **Execution-World-Pairing.** Server starten über `ctx.subprocess` mit `processId: null` (eine andere Maschine oder ein PID-Namespace darf den Harness nicht überwachen), Quellen werden über `ctx.fs` gelesen, und es wird kein `fs/observed`-Event emittiert — nur das LSP-Ergebnis ist modell-sichtbar.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Eintritt: Config-Schema, Executable-Auflösung, Provider-Registrierung, Prozess-Pooling |
| [`src/host.ts`](src/host.ts) | Workspace-Kanonisierung und begrenzte Source-Reads über `ctx.fs` |
| [`src/instance.ts`](src/instance.ts) | Ein Server-Prozess: Initialize-Handshake, serialisierte Transient-Open-Queries, begrenztes Teardown |
| [`src/connection.ts`](src/connection.ts) | JSON-RPC-Endpoint: ID-Korrelation, ausgehende Requests, eingehende Server-Requests, stderr-Cap |
| [`src/framing.ts`](src/framing.ts) | `Content-Length`-Framing und ein begrenzter Decoder |
| [`src/protocol.ts`](src/protocol.ts) | Wire-Type-Teilmenge: Capabilities, Locations, Hover, Text-Dokument-Synchronisation |
| [`src/translate.ts`](src/translate.ts) | Capability-Checks, UTF-16-Negotiation, `Location`/`LocationLink`/Hover-Normalisierung |
| [`src/abort.ts`](src/abort.ts) | Cancellation-Helfer, die Caller- und Disposal-Signale verschmelzen |
| — | Es wird kein Runtime-Invarianten-Companion veröffentlicht; Prozess-Pools und Pro-Workspace-Queues sind privater Implementierungszustand, und dieser Provider veröffentlicht keinen eigenständigen Lifecycle-Event-Stream oder enumerierbaren Snapshot. |

### Protokollverhalten

Die Initialisierung bewirbt UTF-16-Positionen, Workspace-Folder und -Konfiguration, Markdown/Plaintext-Hover und Link-Support für Definition und Implementation, ohne dynamische Registrierung; die zurückgegebenen Capabilities des Servers sind maßgeblich. Ein ausgelassenes `positionEncoding` des Servers defaultet auf `utf-16`; jeder andere Wert lässt die Query fehlschlagen. Der Client beantwortet `workspace/configuration` aus statischer Config, akzeptiert Lifecycle-Bookkeeping-Requests und lehnt `workspace/applyEdit` ab — er wendet niemals Edits an und führt keine Kommandos aus. Navigation bildet `Location` direkt ab und `LocationLink` aus `targetUri` plus `targetSelectionRange`; Hover-Normalisierung akzeptiert `MarkupContent`- und `MarkedString`-Formen, erhält String-Werte, rendert language-getaggte Werte als fenced Code und verbindet Arrays mit einer Leerzeile. Fehlende Ergebnisse, malformed Ranges oder Positionen und malformed Hover-Encodings schlagen als strukturierte `LSP_MALFORMED_RESPONSE`-Fehler fehl.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie bewegen sich vom gemeinsamen Navigationsmodell zum Seam und zum Tool.

- [LSP-Navigations-Subsystem](../../../docs/subsystems/lsp.de.md) — Operationen, Koordinaten, Requests und Ergebnisse sowie `LspError`-Codes.
- [dsh-lsp](../lsp/README.de.md) — der Seam, gegen den sich dieser Provider registriert.
- [dsh-tool-lsp](../tool-lsp/README.de.md) — das model-facing Tool über dem Seam.
- [lsp-Gruppenkarte](../README.de.md) — die Drei-Pakete-Familie und ihre zugehörige Dokumentation.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über `dsh-tool-lsp`, das die normalisierten Ergebnisse dieses Providers präsentiert, während dieser Host selbst keinen Prompt und kein Schema beisteuert.

#### KV-Cache-Effekt

Keine direkte Invalidierung; `dsh-tool-lsp` besitzt Request-Präfix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Provider schlecht passt oder besondere Betriebsaufmerksamkeit braucht. Es sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Keine Confinement-Policy** — dieses Paket vertraut dem konfigurierten Server und sandkastet seinen Prozess nicht; ein eingeschränktes Deployment muss passende Prozess- und Filesystem-Provider oder einen Same-World-Sandbox-Wrapper liefern.
- **Transient-Open-Kompatibilitätsuntergrenze** — Server, deren Synchronisation Open/Close auslässt (oder `None` bewirbt), werden nicht unterstützt, selbst wenn Closed-Document-Queries funktionieren würden; der angepinnte TypeScript-e2e etabliert eine Kompatibilitätsuntergrenze, keine sprachübergreifende Zusage.
- **Pro-Server- und Pro-Workspace-Serialisierungslatenz** — parallele Agents, die sich einen Server und Workspace teilen, stellen sich hinter einem Prozess an; langlebige Workspace-Prozesse verbrauchen Speicher bis zum Disposal.
- **Ein hart gekillter Harness verwaist Language Server** — `initialize.processId: null` entfernt die server-seitige Client-PID-Überwachung, sodass Server nur durch graceful Service-Disposal aufgeräumt werden; ein SIGKILL-ter Harness lässt sie laufen, bis sie von selbst terminieren.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
