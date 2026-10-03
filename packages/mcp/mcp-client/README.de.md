---
description: "MCP-Client-Bridge für Deployments und Maintainer, die Verbindungen zu externen MCP-Servern auswählen, konfigurieren oder debuggen, deren Tools sich auf ctx.tools registrieren."
kind: "package-reference"
---

# @deepseek-ai/dsh-mcp-client
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-mcp-client` lässt das Modell Tools von externen Model-Context-Protocol-(MCP-)Servern als native Harness-Tools aufrufen. Konfigurieren Sie einen Server pro Eintrag, und seine Tools erscheinen unter stabilen Namen wie `mcp__github__create_issue`. Verwenden Sie es für Dateisystem-, GitHub-, Datenbank-, Memory- oder andere MCP-Tool-Server; standardmäßig ist kein Server aktiviert. Tool-Definitionen fügen jedem Modell-Request Tokens hinzu, während ein langsamer oder abgestürzter Server den Start verzögern oder seine Tools bis zur Wiederherstellung scheitern lassen kann. Das Paket bridged nur Tools; MCP Resources und Prompts werden nicht unterstützt.

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

Fügen Sie `dsh-mcp-client` hinzu, wenn das Modell Tools eines externen MCP-Servers wie native aufrufen soll. Ein Konfigurationseintrag pro Server ist das gesamte Setup: Geben Sie dem Server einen kurzen eindeutigen Namen und einen Transport, und seine Tools erscheinen als `mcp__<serverName>__<tool>`. Wählen Sie stdio, wenn der Server als lokales Programm läuft, und Streamable HTTP, wenn er als Dienst läuft. Wenn Sie MCP-Tool-Server bereits von einem anderen Client aus nutzen, funktionieren dieselben Server-Zeilen hier.

### Minimale Konfiguration

Fügen Sie einen Eintrag pro Server hinzu; nichts weiter ist nötig. Nach dem Start des Harness erscheinen die Tools des Servers in der Tool-Liste des Modells.

```yaml
- id: mcp-github
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: github
    transport: stdio
    command: npx
    args: ['-y', '@modelcontextprotocol/server-github']
    env:
      GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN

- id: mcp-web
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: web
    transport: streamable-http
    url: http://localhost:3000/mcp
    headers:
      Authorization: !!js '`Bearer ${process.env.MCP_TOKEN}`'
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `transport` | erforderlich | `stdio` oder `streamable-http` |
| `serverName` | erforderlich | Namespace für die Tool-Namen des Servers; `[A-Za-z0-9_-]{1,32}`, eindeutig innerhalb eines Registrierungs-Scopes |
| `command` / `args` / `env` / `cwd` | — | stdio: ausführbare Datei, Argumente, zusätzliche Env über der bereinigten Umgebung, Arbeitsverzeichnis |
| `url` / `headers` | — | streamable-http: Endpunkt-URL und zusätzliche Request-Header |
| `toolCallTimeoutMs` | `60,000` | Timeout pro `tools/call`-Aufruf |
| `failOnStartupError` | `false` | Plugin-Aktivierung ablehnen, wenn die initiale Verbindung oder Tool-Synchronisation scheitert |
| `reconnect.enabled` | `true` | Nach einem Verbindungsverlust automatisch neu verbinden |
| `reconnect.initialDelayMs` | `500` | Erste Reconnect-Verzögerung; verdoppelt sich pro aufeinanderfolgendem Fehlversuch |
| `reconnect.maxDelayMs` | `30,000` | Backoff-Obergrenze; zugleich die Uptime, nach der das Versuchsbudget zurückgesetzt wird |
| `reconnect.maxAttempts` | `10` | Aufeinanderfolgende Fehlversuche pro Ausfall, bevor aufgegeben wird |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-mcp-client) ist die erschöpfende Quelle für jedes akzeptierte Feld.

Nach dem Start erscheinen die Tools des Servers als `mcp__<serverName>__<tool>` — probieren Sie einen Prompt aus, der eines davon nutzt. Scheitert die initiale Verbindung, startet der Harness trotzdem, aber keine Tools dieses Servers erscheinen, und ein Fehler wird geloggt; setzen Sie `failOnStartupError: true`, damit ein Startfehler den Harness stattdessen abbricht.

### Tool-Benennung und Koexistenz

Das Modell sieht jedes Tool unter einem stabilen server-qualifizierten Namen: `mcp__<serverName>__<rawName>`, zum Beispiel `mcp__github__create_issue` — dieselbe Namensform, die Claude Code und Codex verwenden. Namen bleiben stabil, solange der Server denselben Tool-Namen behält, sodass Session-Historie und Permission-Regeln Neustarts und Reloads überleben. Zwei Server können beide ein Tool namens `search` anbieten und als `mcp__github__search` und `mcp__web__search` koexistieren.

- Zwei Server, die denselben Tool-Namen veröffentlichen (zum Beispiel `search`), koexistieren unter ihren eigenen Namespaces.
- Zwei Einträge mit demselben Server-Namen: Der spätere scheitert beim Laden mit einem klaren Fehler.
- Ein Server, der dasselbe Tool zweimal auflistet, bekommt seine Tool-Liste als ungültig zurückgewiesen, und der vorherige Tool-Satz bleibt aktiv.
- Ein wiederholter nicht-leerer `tools/list`-Fortsetzungscursor weist das Update sofort zurück, einschließlich Zyklen über leere Seiten; der vorherige Tool-Satz bleibt aktiv und spätere Updates können trotzdem gelingen.
- Ein Update, das mit einem bereits registrierten Tool-Namen kollidiert, wird vollständig zurückgewiesen — Sie erhalten nie einen partiellen Tool-Satz von diesem Server.

### Tools aufrufen und Ergebnisse lesen

Wenn das Modell ein MCP-Tool aufruft, läuft der Aufruf gegen den Remote-Server mit einem Timeout pro Aufruf (Standard 60 Sekunden) und kann wie jeder andere Tool-Call abgebrochen werden. Das Ergebnis kommt als gewöhnlicher Text in Blockreihenfolge zurück; Resource-Links erscheinen als Text mit Name und URI. Meldet der Server einen Fehler, scheitert der Aufruf sichtbar — das Modell sieht keinen vorgetäuschten Erfolg.

Bilder werden unterstützt, wenn das aktuelle Modell Bildeingaben akzeptiert und das Attachment-Feature des Harness aktiviert ist; sie erscheinen dann wie andere Bilder in der Konversation. Andernfalls — sowie bei Audio oder eingebetteten Ressourcen — sieht das Modell eine klare Diagnosemeldung statt nichts.

### Start, Updates und Reconnect

Die Tools des Servers erscheinen, bevor der Harness seinen ersten Turn startet. Ändert der Server seine Tool-Liste, aktualisiert sich der Tool-Satz des Modells automatisch; scheitert das Update, funktioniert der vorherige Tool-Satz weiter.

Wenn eine Serververbindung abbricht — etwa wenn ein lokaler Serverprozess abstürzt — verbindet sich das Plugin automatisch mit Verzögerungen, die sich von 500 ms bis auf 30 s verdoppeln, und frischt dann den Tool-Satz auf; der Reconnect-Fortschritt ist in den Logs sichtbar. Während eines Ausfalls bleiben die zuletzt bekannten Tools gelistet, aber Aufrufe scheitern, bis der Server sich erholt. Nach zehn aufeinanderfolgenden Fehlversuchen werden die Tools des Servers entfernt und der Reconnect stoppt, bis Sie die Konfiguration neu laden oder den Harness neu starten; ein Server, der eine Weile verbunden bleibt, setzt diesen Zähler zurück. Setzen Sie `reconnect.enabled: false`, um den automatischen Reconnect zu deaktivieren — Tools bleiben dann gelistet, scheitern aber bis zum Reload. Das Bearbeiten des Konfigurationseintrags lädt die Serververbindung in-place neu, und unveränderte Namen bleiben unverändert.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Design-Entscheidungen hinter der Bridge und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig behandelt.

### Design-Philosophie

- **Server-qualifizierte Identität.** Jedes MCP-Tool hat die stabile Identität `(serverName, rawName)`. Der Namespace ist lokale Konfiguration, niemals das Remote-`serverInfo.name` — der Remote-Name ist nicht vertrauenswürdig, nicht deployment-übergreifend eindeutig und kann sich bei einem Upgrade ändern; nichts davon darf modellseitige Tools still umbenennen.
- **Benennung ist ein angepinnter Vertrag.** Öffentliche Namen sind reine Funktionen von `(serverName, rawName)` und erfüllen den DeepSeek-Funktionsnamen-Vertrag; verlustbehaftete Normalisierung hängt einen 12-stelligen Hex-SHA-256-Hash an, sodass unterschiedliche Identitäten nie kollabieren. Session-Historie und Permission-Regeln überleben daher HMR-Swaps, Re-Syncs und Änderungen anderer Server.
- **Der Raw-Name ist der einzige Wire-Name.** `tools/call` erhält immer den Raw-Namen; der öffentliche Name wird nie an den Server gesendet und nie geparst, um den Raw-Namen zurückzugewinnen.
- **Volle Generation oder keine.** Syncs tauschen Generationen atomar: Ein Fetch-Fehler behält die vorherige Generation, und ein Registrierungskonflikt rollt die gesamte versuchte Generation zurück.
- **Ein kanonischer Wert, eine Projektion.** Der Executor gibt das protokoll-vollständige kanonische `McpResult` zurück; eine separate geordnete Projektion bereitet den Native-Content vor, und `finalizeContent` installiert ihn nur, wenn das Post-Execute-Ergebnis der Registry unverändert ist, sodass Policy-Blöcke und Wert-Ersetzungen maßgeblich bleiben.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Config`-Schema, `serverName`-Reservierung, Aktivierungs-Await |
| [`src/connection.ts`](src/connection.ts) | Verbindungs-Supervisor: Client-Generationen, Reconnect-Policy, Versuchsbudget, Disposal |
| [`src/tools.ts`](src/tools.ts) | Tool-Bridge: Discovery, Benennung, Registrierungs-Swap, Ausführung, Bild-Projektion |
| [`src/transport.ts`](src/transport.ts) | Transport-Factory: stdio-Spawn mit bereinigter Env, Streamable HTTP |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; MCP-Generationen tragen über die Tool-Registry bei, aber die Bridge exponiert nach einem asynchronen Resync keinen unabhängigen Server-zu-Tool-Snapshot. |

### Lifecycle und Sync

`apply` löst die Reconnect-Policy auf, reserviert den `serverName` innerhalb des aktuellen Registrierungs-Scopes, startet den Supervisor und awaited die initiale Verbindung plus Discovery. Unabhängige Agent-Scopes dürfen denselben Namespace wiederverwenden, weil ihre Tools und Transporte isoliert sind; ein Duplikat innerhalb eines Scopes scheitert beim Laden. Der Supervisor serialisiert jeden Sync — initial, Notification und Reconnect — über eine Queue, sodass zwei Syncs ihren Dispose-previous/Register-next-Swap nie verschachteln können. Disposal bricht ausstehende Reconnects ab, schließt den live Client, wartet, bis der laufende Versuch und die gequeueten Syncs zur Ruhe kommen, und deregistriert die aktuelle Generation.

Der Supervisor lauscht auf `notifications/tools/list_changed` und queuet einen Re-Sync; ein Fetch-Phasen-Fehler behält die vorherige Generation registriert, während ein Registrierungskonflikt die versuchte Generation zurückrollt. Jeder Ausfall teilt sich ein Versuchsbudget: Nach `maxAttempts` aufeinanderfolgenden Fehlschlägen werden die Tools deregistriert und der Reconnect stoppt, und eine Verbindung, die länger als `maxDelayMs` besteht, setzt das Budget zurück.

### Tool-Ausführung intern

Ein Tool-Call sendet einen ungecachten `tools/call`-Request, der den rohen MCP-Namen, die JSON-Argumente, das Abort-Signal und das konfigurierte Timeout trägt; der öffentliche Name wird nie an den Server gesendet und nie zurückgeparst. Kanonischer Erfolg ist `{ content: JsonValue[], structuredContent? }`, das die vollständigen MCP-JSON-Blöcke für programmatische und PTC-Mode-Caller erhält. Ein unterstütztes deklariertes `outputSchema` validiert `structuredContent`; nicht unterstütztes Schema-Vokabular fällt auf unbeschränktes `JsonValue` zurück. Ein MCP-`isError`-Ergebnis wirft vor jeder Bild-Persistierung, sodass die Registry ein fehlgeschlagenes Tool-Ergebnis erzeugt. Bild-Batches werden als Ganzes dekodiert und validiert, bevor ein Mitglied gespeichert wird; jede Verweigerung projiziert jedes Bild als Diagnosetext.

### Environment-Scrubbing (stdio)

Die Child-Environment startet vom `scrubbedParentEnv()` der Subprocess-Seam — ambient Namen, die auf `/KEY|PASSWORD|SECRET|TOKEN/i` matchen, und ambient `DSH_*`-Namen werden verworfen — und das konfigurierte `env` merged obenauf, sodass explizite Overrides überleben. Das MCP SDK besitzt den eigentlichen Spawn; dieses Paket teilt die Scrub-Definition, nicht den Spawn-Pfad.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen von der geteilten Tool-Registry zu den Design-Nachweisen der Bridge und ausgearbeiteten Beispielkonfigurationen.

- [Tools-Subsystem-Referenz](../../../docs/subsystems/tools.de.md) — der `ToolRuntime`- und `ctx.tools.register()`-Vertrag, der die gebridgten Tools empfängt.
- [MCP-Client-Plugin-Agent-Note](../../../.agents/notes/implemented/feature/2026-07-07-mcp-client-plugin.de.md) — die Namensinvarianten, Discovery- und Ausführungsdesign, Alternativen und Konsequenzen.
- [Canonical-Tool-Output-Contract-Agent-Note](../../../.agents/notes/implemented/architecture/2026-07-20-canonical-tool-output-contract.de.md) — wie MCP-Ergebnisse auf den kanonischen Tool-Output-Vertrag abbilden.
- [Drittanbieter-Memory-MCP-Guide](../../../docs/user/guide/mcp-memory.de.md) — drei Memory-Server-Overlays mit diesem Paket.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-mcp-client) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

### Entdeckte MCP-Tools

#### Was das Modell sieht

Nach erfolgreicher initialer Discovery erscheint jedes deklarierte MCP-Tool als natives Tool namens `mcp__<serverName>__<rawName>` (oder seiner deterministisch normalisierten Form) mit der server-gelieferten Beschreibung und dem Input-Schema. Ein erfolgreicher Re-Sync — einschließlich desjenigen nach einem automatischen Reconnect — ersetzt die Generation; Plugin-Disposal oder ein erschöpftes Reconnect-Budget entfernt sie.

#### Token-Effekt

Die Tool-Beschreibungen und Input-Schemas gehen in jeden Request ein, solange die Tools registriert sind; Re-Syncs ersetzen Schemas statt sie zu akkumulieren, und der server-qualifizierte Name fügt jeder Tool-Definition und jedem Aufruf Tokens hinzu.

#### KV-Cache-Effekt

Der Tool-Definition-Präfix bleibt stabil, solange der entdeckte Satz und die Schemas unverändert sind. Ein Re-Sync, der ein Tool hinzufügt, entfernt, umbenennt oder ändert, ersetzt Definitionen und kann die Wiederverwendung ab dem ersten geänderten Schema-Token ungültig machen; ein Reconnect, der eine unveränderte Liste wiederherstellt, reproduziert identische Definitionen und bleibt präfix-stabil.

### Tool-Call-Historie und Ergebnisse

#### Was das Modell sieht

Der öffentliche Tool-Name und die JSON-Argumente bleiben in der Assistant-Historie. Der kanonische Wert behält die vollständigen MCP-JSON-Blöcke und optionalen strukturierten Content für programmatische und PTC-Mode-Caller; unterstützte Bild-Blöcke projizieren nach exaktem Route-Capability-Nachweis in ihrer ursprünglichen Reihenfolge neben Text. Verweigerte Bilder, Audio, eingebettete Ressourcen, Resource-Links und unbekannte Blöcke bleiben als begrenzte Textdiagnosen sichtbar, und MCP `isError` weist den Aufruf vor der Bild-Persistierung zurück.

#### Token-Effekt

Argumente, gemappter Text und dauerhafte Bild-Referenzen bleiben bis zur Compaction erhalten. Inline-MCP-Base64 bleibt nur im ausführungslokalen kanonischen Wert und wird nie in ein Session-Event kopiert; der Provider liest die verifizierten Bytes aus dem Attachment-Store. Audio- und Embedded-Resource-Payloads bleiben aus dem Modellkontext heraus.

#### KV-Cache-Effekt

Nur anhängend; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen beschreiben, was Sie mit diesem Plugin nicht tun können und wann es betriebliche Aufmerksamkeit braucht. Sie sind aktuelle Paket-Einschränkungen, kein Vergleich mit anderen MCP-Clients und kein Aufgabenstapel.

- **Tools sind die einzige gebridgte MCP-Capability** — Resources und Prompts haben keinen Harness-Consumer-Mechanismus und sind zurückgestellt.
- **Start- und Discovery-Timeouts werden vom MCP SDK geerbt** — das Plugin exponiert kein Verbindungs- oder Discovery-Timeout; jeder `initialize`- und paginierte `tools/list`-Request verwendet den 60-Sekunden-Request-Default des SDK, sodass ein nicht antwortender Server oder eine Cursor-Kette sowohl Aktivierung als auch Teardown verzögern kann, während die initiale Synchronisation abgerechnet wird.
- **Reconnect triggert auf Transport-Close** — ein abgestürztes stdio-Child löst ihn aus; Streamable-HTTP-Fehler zeigen sich pro Request über das eigene Recovery des SDK-Transports, sodass ein unerreichbarer HTTP-Server pro Aufruf erneut versucht wird statt vom Supervisor neu gespawnt zu werden.
- **Bild ist die einzige dauerhafte Rich-Result-Bridge** — PNG, JPEG, WebP und GIF gehen nach exaktem Capability-Nachweis in den Native-Kontext ein. Audio- und Embedded-Resource-Payloads bleiben ausführungslokal mit expliziten Diagnosen, während Resource-Links nur ihren Namen und ihre URI als Text bewahren.
- **Nicht unterstützte MCP-Output-Schemas werden nicht erzwungen** — `structuredContent` fällt auf `JsonValue` zurück, wenn das deklarierte Schema Vokabular außerhalb der Harness-Teilmenge verwendet.
- **Task-erforderte MCP-Tools werden zur Aufrufzeit zurückgewiesen** — ein Tool, das die task-basierte Ausführungserweiterung erfordert, wirft statt zu bridgen; die Erweiterung ist nicht implementiert.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Design-Fragen und Richtungen, die nicht entschieden sind. Sie ist explizit nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen leben in den Abschnitten oben, dem Paketcode und den verlinkten Agent Notes.

- Der Public-Name-Algorithmus ist ein v1-Vertrag, der durch Tests angepinnt ist; ihn nach Release zu ändern würde Session-Historie und Permission-Regeln brechen.
- Ein explizites DSH-besessenes Verbindungs- und Discovery-Timeout ist eine offene Richtung; der 60-Sekunden-Default des SDK begrenzt Start und Teardown.
- Die Reconnect-Eigentümerschaft für Streamable HTTP ist offen: Retry pro Request ist SDK-Verhalten, und der Supervisor könnte die HTTP-Generation ebenfalls besitzen.
- Das Bridgen von MCP Resources braucht eine Harness-seitige Injection-Entscheidung (System-Prompt, on demand oder modellgetriggert); das Bridgen von Prompts braucht ein Prompt-Template-Konzept, das dem Harness fehlt.
- Das angepinnte MCP SDK entwickelt sich weiter; eine brechende Upstream-Änderung erfordert ein Update der Bridge.

</details>
