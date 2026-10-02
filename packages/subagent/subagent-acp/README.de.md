---
description: "Das prozessexterne ACP-subagent-Backend für Benutzer und Maintainer, die einen Delegationsprovider wählen, einen Child-ACP-agent-Befehl konfigurieren oder Remote-Child-Läufe debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent-acp

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Verwenden Sie dieses Paket, um eine Aufgabe an einen ACP-kompatiblen agent zu delegieren, der in einem frischen Subprozess mit eigener Runtime, eigener Session, eigenem Modell und eigenen Tools läuft. Jeder Lauf teilt nur das gewählte Arbeitsverzeichnis, sendet die Aufgabe über ACP und gibt die finale Antwort des Child oder einen sicheren Fehler zurück; Zwischennachrichten und Tool-Verkehr bleiben außerhalb der Elternkonversation. Berechtigungs-Prompts werden durch konfigurierte Policy ohne menschliche Interaktion beantwortet. Wählen Sie es, wenn Delegation Prozessisolation oder einen Nicht-Harness-ACP-agent braucht, und wählen Sie ein In-Process-Backend, wenn der Child die Fähigkeiten des Elternteils teilen muss.

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

Mounten Sie diesen Provider, wenn eine Komposition einen vollständig isolierten, prozessexternen Child braucht, der das Agent Client Protocol spricht. Der übliche Weg ist explizit: den seam mounten, diesen Provider mounten und ihm einen Befehl geben, der einen ACP-agent startet.

### Wann man es wählt

Wählen Sie dieses Backend, wenn der Child mit eigener Runtime, eigenem Modell und eigenen Tools in einem separaten Prozess laufen muss — etwa ein ACP-agent aus einem anderen Projekt — oder wenn Sie Delegation wollen, die den Eltern-harness nicht berühren kann. Wählen Sie ein In-Process-Backend, wenn der Child die Komposition des Elternteils teilen oder elternerzwungene Fähigkeiten beachten muss: dieser Provider wirbt keine optionalen Startzeit-Fähigkeiten aus, sodass der seam Anfragen nach `agentOptions`, strukturierter Ausgabe, Tiefenbegrenzungen, Tool-Filtern oder Personas ablehnt, statt sie stillschweigend wegzulassen.

### Konfiguration

| Feld | Standard | Bedeutung |
|---|---|---|
| `providerName` | `acp` | Registry-Name auf `ctx.subagents` |
| `command` | erforderlich | Ausführbare Datei, die pro Lauf gespawnt wird (der Child-ACP-agent) |
| `args` | `[]` | Befehlsargumente |
| `cwd` | cwd der Elternsession | Arbeitsverzeichnis-Override für den Child-Prozess und seine ACP-Session |
| `permission` | `reject` | Berechtigungsanfragen automatisch beantworten: ablehnen oder die erste `allow_once`- bzw. `allow_always`-Option wählen (`allow`) |
| `env` | `{}` | Explizite Child-Umgebung, über die von Credentials bereinigte Elternumgebung gelegt |
| `disposeEofGraceMs` | `6000` | Karenzzeit nach stdin-EOF vor der Plattform-Terminierung |
| `disposeGraceMs` | `3000` | Grenze für das Beobachten strukturierter Prozessfakten nach einem Fehler und, unter POSIX, die SIGTERM-zu-SIGKILL-Karenz |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-subagent-acp) ist die erschöpfende Quelle für jedes akzeptierte Feld und dessen JSDoc.

Ein DeepSeek-Harness-Child verwendet den Produkt-Launcher und ein explizites absolutes `DSH_HOME`. Das isolierte Home verhindert, dass eine verschachtelte Runtime die Profile oder Credentials der startenden Person entdeckt; der generische ACP-Provider erzwingt diese Anforderung nicht für Nicht-DSH-agents.

```yaml
- id: subagent-acp
  name: '@deepseek-ai/dsh-subagent-acp'
  config:
    providerName: acp
    command: dsh
    args: ['--profile', 'acp', '--patch', '/absolute/path/to/acp.patch.yml']
    permission: reject
    env:
      DSH_HOME: /absolute/path/to/isolated-child-home
      DEEPSEEK_API_KEY: !!js process.env.DEEPSEEK_API_KEY
```

### Was man bekommt

Ein erfolgreicher Lauf gibt den finalen gestreamten Assistant-Text des Child als Ergebnisausgabe zurück. Session, Modell und Tools des Child kommen aus dem Child-Prozess selbst — der Elternteil liefert nur die Aufgabe und das Arbeitsverzeichnis. Der Stop-Reason bildet `end_turn` auf `completed`, `max_tokens` auf `max-tokens`, `refusal` auf `refusal`, `cancelled` auf `aborted` und jeden anderen Wert auf `error` ab. Ein fehlgeschlagener veröffentlichter Lauf bewahrt partiellen Assistant-Text in `output` und gibt sichere strukturierte Details separat in `diagnostic` zurück.

### Fehler und Wiederherstellung

Ein Spawn-, Initialisierungs- oder New-Session-Fehler lehnt vor der Veröffentlichung ab, üblicherweise nachdem der verwaltete Bereich als vollständig quiescent nachgewiesen ist. Schlägt auch die Bereinigung fehl, bewahrt die Ablehnung geordnete sichere Start- und Teardown-Fakten, ohne Quiescence des Gesamtbereichs zu behaupten. Nicht-Cancellation-Fehler legen nur feste Provider-, Stufen- und Kategoriefakten offen; der ursprüngliche Fehler bleibt in der internen Cause-Kette und in Host-Diagnostik. Nach der Veröffentlichung schlägt ein Prompt-, Transport- oder Frühprozessfehler als `error` mit einer sicheren Diagnostik fehl, während lokale Cancellation als `aborted` ohne Fehlerdetails aufgelöst wird.

### Sichere Diagnostik

Eine generische Diagnostik verwendet eine feste Zeile: `Subagent failure (provider: ACP; stage: <stage>; category: <category>; ...)`. Optionale Stop-Reasons, Exit-Codes und Signale kommen nur aus geschlossenen Protokoll- oder Managed-Process-Fakten. stderr, Ausnahmetext, Aufgabeninhalt, Tool-Eingaben, Pfade, Umgebungswerte, Credentials und Protokoll-Payloads gelangen niemals in die Diagnostik; die gemeinsame Ergebnisgrenze beschränkt sie auf 4096 UTF-8-Bytes. Ein nicht abgeschlossener Lauf, der eine Berechtigung angefragt hat, kann eine feste Policy-, Tool-Art- und Entscheidungszeile hinzufügen. Erfolgreiche Läufe und lokale Cancellation lassen sie weg.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie das Backend einen Child über ACP steuert und woher das beobachtbare Verhalten kommt; der vollständige Vertrag steht in [Dieses Paket verwenden](#use-this-package).

### Designkonzept

- **Vollständige Prozessisolation.** Jeder Child läuft in einem frischen Subprozess mit eigener Session, eigenem Modell und eigenen Tools; nur das aufgelöste Arbeitsverzeichnis überschreitet die Grenze vom Elternteil.
- **Ein Prozess pro Lauf.** Jeder Lauf spawnt einen neuen Prozess; es gibt kein Prozess-Pooling.
- **Die ACP-Leitung ist die Serialisierungsgrenze.** Subagent-Werte im selben Prozess werden nicht defensiv geklont; das Protokoll ist die Stelle, an der feindliche Eingaben validiert werden.

### Start- und Eigentumsfluss

Ein Start löst das Arbeitsverzeichnis des Child auf (der konfigurierte `cwd`-Override, sonst das cwd der Elternsession), spawnt den Befehl über den Subprocess-seam, führt den ACP-`initialize`- und `newSession`-Handshake durch und veröffentlicht den Lauf erst danach. Erfüllung bedeutet, dass eine Remote-Session bereit ist und das Eigentum an den Aufrufer übergegangen ist. dispose ist idempotent: stdin wird geschlossen und eine konfigurierte Karenzzeit für kooperative Quiescence abgewartet, dann wird über SIGTERM auf SIGKILL eskaliert und der Austritt des Gesamtbereichs abgewartet. Bereinigungsfehler bleiben als geordnete sichere Fakten beobachtbar und behaupten nie Quiescence.

### Stop-Reason-Mapping

Das Laufergebnis bildet den ACP-Endzustand in das gemeinsame Stop-Reason-Vokabular ab (`completed`, `max-tokens`, `refusal`, `aborted` oder `error`), implementiert in [`src/run.ts`](src/run.ts).

### Prozessgrenze

Der Child wird über den Subprocess-seam gespawnt: credential-förmige Umgebungsvariablen werden bereinigt, dann werden explizite `config.env`-Werte nach der Bereinigung gemerged. stderr wird an den Eltern-Stream vererbt, und dispose wendet das EOF-Fenster dieses Providers vor der gemeinsamen Terminierungs-Eskalation an.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen von diesem Backend zum seam, in den es eingesteckt wird, und zum Protokoll, das es steuert.

- [Subagent-Subsystem](../../../docs/subsystems/subagent.de.md) — der Servicevertrag, der Providervertrag und die Semantik terminaler Ergebnisse.
- [dsh-subagent seam](../subagent/README.de.md) — die Registry und Start-API, auf der sich dieser Provider registriert.
- [Agent Client Protocol Automatisierungsserver](../../acp/acp/README.de.md) — der Nur-Automatisierungs-Server, den dieser Provider als Client steuert.
- [dsh-subprocess seam](../../subprocess/subprocess/README.de.md) — die Spawn- und Teardown-Maschinerie hinter jedem Lauf.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-subagent-acp) — jedes akzeptierte Konfigurationsfeld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

### Child-agent-Anfrage

#### Was das Modell sieht

Der Remote-Child empfängt den eigenständigen Aufgabeninhalt über ACP plus den konfigurierten system prompt, die Tools und die frische Session seines eigenen Prozesses. Er empfängt keine Elternkonversation. Dieser Provider wirbt keine optionalen Startzeit-Fähigkeiten aus, sodass der lokale Dienst Anfragen nach `agentOptions`, Persona, Tool-Filterung, Tiefenerzwingung oder strukturierter Ausgabe ablehnt, statt sie stillschweigend wegzulassen.

#### Token-Effekt

Der Child zahlt für einen unabhängigen vollständigen Kontext und seine eigene mehrstufige Historie. Diese Tokens gelangen nie in den Elternkontext.

#### KV-Cache-Effekt

Unabhängig vom Anfragecache des Elternteils. Jeder ACP-Child kann nur Präfixe wiederverwenden, die unter seinem eigenen Provider, Modell, seiner Komposition und Historie identisch sind; Child-Schritte wachsen sonst nur append-only.

### Eltern-Tool-Ergebnis, indirekt

#### Was das Modell sieht

Über `dsh-tool-subagent` empfängt der Elternteil nur den finalen gestreamten Assistant-Text des Child oder den exakten Stop-Reason-Fehler dieses Consumers, nicht Zwischennachrichten oder Tool-Verkehr. Nicht abgeschlossene Ergebnisse zeigen die sichere Diagnostik vor dem separat bewahrten partiellen Assistant-Output. Eine vor der Veröffentlichung bereits gecancelte Anfrage wird exakt zu `Error: subagent request was aborted before the ACP child started`; ein anderer Startfehler enthält nur die feste `Subagent failure (...)`-Zeile.

#### Token-Effekt

Die Elterneingabe wächst nur um das finale Ergebnis oder den Fehler, was datenabhängig ist und bis zur compaction vorgehalten wird. Dieser Provider fügt selbst kein Eltern-Schema hinzu.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt auf das wiederverwendbare Anfragepräfix und macht bestehende KV-Cache-Einträge nicht ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann dieses Backend schlecht passt oder besondere betriebliche Sorgfalt braucht. Sie sind aktuelle Paketbeschränkungen, kein allgemeiner ACP-Vergleich oder Aufgabenrückstand.

- **Ein frischer Prozess pro Lauf** — es gibt kein Prozess-Pooling; jede Delegation zahlt die vollen Spawn- und ACP-Handshake-Kosten.
- **Nur lokale Workspaces** — das aufgelöste Arbeitsverzeichnis ist ein lokaler Pfad, der einem Child auf derselben Maschine übergeben wird; Remote-Workspace-Mapping ist nicht entworfen.
- **Keine optionalen Startzeit-Fähigkeiten** — dieser Provider kann `agentOptions`, `outputSchema`, eine Tiefenbegrenzung, einen Tool-Filter oder eine Persona nicht im Remote-Prozess anwenden, sodass der seam Anfragen ablehnt, die sie benötigen.
- **Nur committeter `agent_message_chunk`-Text wird gesammelt** — der Automatisierungsserver hält Reasoning, Tool-Aktivität, Pläne und andere Trace-Daten im Child-Session-Log, statt sie über ACP zu senden.
- **Berechtigungs-Prompts werden automatisch beantwortet** (`permission: allow | reject`) — keinem Menschen wird ein `session/request_permission` des Child präsentiert.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und unentschiedene Richtungen. Sie ist ausdrücklich nicht autoritativ — ausgeliefertes Verhalten und Grenzen stehen in den Abschnitten oben und im Paketcode.

- **Prozess-Pooling** — die Wiederverwendung persistenter Prozesse ist eine mögliche künftige Optimierung, ändert aber das Isolationsmodell pro Lauf.
- **Remote-Workspaces** — das Mapping des Workspace eines Remote-ACP-agent bräuchte eine eigene Backend-Fähigkeit.
- **Fortsetzbare ACP-Children** — würde die Persistenz der Remote-Session-id und eine Fortsetzungs-Anzeige pro Child erfordern.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Dieses Paket legt keine unabhängige Ereignissequenz oder veränderliche Datenbeziehung offen, die über die an seinem eigenen seam durchgesetzten Verträge hinausginge.
