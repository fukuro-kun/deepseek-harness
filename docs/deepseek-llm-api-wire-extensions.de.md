# Offizielle DeepSeek LLM API-Wire-Erweiterungen
[English](deepseek-llm-api-wire-extensions.md) | [中文](deepseek-llm-api-wire-extensions.zh.md) | Deutsch


Diese Referenz definiert jeden DeepSeek-Harness-spezifischen HTTP-Header und jedes additiven JSON-Feld, das von [`@deepseek-ai/dsh-llm-deepseek`](../packages/llm/llm-deepseek/README.de.md) bei `deepseek-official`-Chat-Completion-Anfragen gesendet wird. Sie definiert keine Felder neu, die der Upstream-DeepSeek-API gehören. Die Provider-neutrale LLM-Schnittstelle und `llm-pi-ai` implementieren diese Erweiterungen nicht.

Der Adapter sendet die Erweiterungen an seine aufgelöste `baseURL`, einschließlich eines konfigurierten Gateways. Sie bleiben außerhalb von `messages`, System-Prompts und Tool-Schemas und fügen daher keine Modell-Input-Tokens hinzu oder verändern den modellsichtbaren Präfix.

## Wire-Namespaces und Versionierung

| Position | Namensgebung | Beispiele |
|---|---|---|
| HTTP-Feldnamen | Lowercase-Kebab-Case; HTTP-Matching bleibt Case-insensitive | `user-agent`, `x-deepseek-harness-session-id` |
| DeepSeek-Request-Body-Erweiterungsfelder | Snake Case mit reserviertem `dsh_`-Präfix | `dsh_plugin_packages`, `dsh_session_log` |
| DSH-eigene verschachtelte JSON-Member | Camel Case | `afterSeq`, `throughSeq`, `sessionId` |
| Getaggte Werte | Kebab-Case-Strings; dauerhafte Events verwenden `domain/action` | `session-log-deepseek/delivery-accepted` |

Jede Body-Erweiterung besitzt ihre `version` unabhängig. Eine Version gilt nur für das Objekt, das sie enthält; zwischen Versionen verschiedener Felder besteht keine Kompatibilitäts- oder Sortierungsbeziehung. Die JSON-Member-Reihenfolge ist nicht Teil des Protokolls.

Die [`DeepSeekLlmApiExtensionRegistry`](../packages/llm/deepseek-llm-api-extensions/README.de.md) reserviert einen Provider pro Top-Level-Erweiterungsname. Leere oder mit Leerzeichen aufgefüllte Namen, doppelte Registrierungen und Kollisionen mit der DeepSeek-Basisanfrage schlagen vor dem HTTP-Dispatch fehl.

## Request-Header

| Header | Vorhanden bei | Wert |
|---|---|---|
| `user-agent` | Jeder Provider-HTTP-Request, einschließlich Files-API-Operationen | Anwendungsidentität in `product/version (+url)`-Form; das Standardprodukt ist `deepseek-harness` |
| `x-deepseek-harness-user-id` | Jeder autorisierte Chat-Completion-Request | Die stabile anonyme UUID für das aufgelöste Harness-Home |
| `x-deepseek-harness-session-id` | Chat-Completion-Requests mit Session-ID | Die exakte Request-`sessionId`-Zeichenkette |
| `x-deepseek-harness-compact` | Chat-Completion-Requests deren Purpose `compaction` ist | Die Literal-Zeichenkette `1` |

Ein Credential-Fehler tritt vor der Auflösung der anonymen User-ID auf, sodass ein nicht autorisierter Request weder diese Header sendet noch die Identity-Datei erstellt. Ein direkter Request ohne Session lässt `x-deepseek-harness-session-id` weg. Session-Titel-Requests haben keinen zusätzlichen Purpose-Header; die gewöhnliche Session-ID-Regel gilt weiterhin, wenn einer eine `sessionId` trägt.

## Body-Erweiterungs-Transaktion

Der Adapter serialisiert den vollständigen Basis-Body, einschließlich der exakten `messages`, bevor er registrierte Provider auffordert, Felder vorzubereiten. Ein Provider erhält diesen unveränderlichen Body, das Anfrage-Abbruch-Signal und optionales `sessionId` und Auxiliary-Call-`purpose`. Die Rückgabe von `undefined` lässt das Feld dieses Providers für den Request weg.

Vorbereitete JSON-Werte werden vom Provider-eigenen Zustand getrennt, als Top-Level-Siblings der Basisfelder zusammengeführt und in denselben HTTP-Body serialisiert. Ein Vorbereitungs- oder Kollisionsfehler verhindert den Request. Eine Komposition ohne die Registry sendet den unerweiterten Basis-Body.

Nachdem der konfigurierte Endpoint HTTP 2xx zurückgibt, führt der Adapter die vorbereitete `accept()`-Transaktion aus, bevor er den SSE-Response-Body liest. Transportfehler und Non-2xx-Antworten akzeptieren keinen Contribution. Ein Akzeptanzfehler schlägt den Modell-Request fehl, obwohl der Endpoint 2xx zurückgegeben hat. Akzeptanz protokolliert Endpoint-Level-HTTP-Erfolg; sie bestätigt nicht, dass ein SSE-Stream abgeschlossen wurde oder dass der Endpoint eine Erweiterung persistiert hat.

## `dsh_plugin_packages`

[`@deepseek-ai/dsh-plugin-package-inventory-deepseek`](../packages/llm/plugin-package-inventory-deepseek/README.de.md) trägt das vollständige aktive Loader-gestützte Plugin-Paket-Inventar bei. Das Feld ist standardmäßig aktiviert.

```json
{
  "dsh_plugin_packages": {
    "version": 1,
    "packages": [
      {
        "name": "@deepseek-ai/dsh-example",
        "version": "0.1.1-rc.2"
      }
    ]
  }
}
```

| Member | Typ | Bedeutung |
|---|---|---|
| `version` | `1` | Schema-Version für `dsh_plugin_packages` |
| `packages` | Array | Vollständige aktive Menge für diesen Request |
| `packages[].name` | String | Exakter nicht-leerer npm-Paketname aus dem besitzenden Manifest |
| `packages[].version` | String | Exakte nicht-leere Paketversion aus demselben Manifest |

Jeder Request liest aktive nicht-gruppierte Loader-Einträge aus dem Host-Tree und, wenn für die Request-Session verfügbar, deren Standing-Agent-Preset-Tree erneut. Relative und absolute Module verwenden ihr nächstgelegenes besitzendes Manifest; Bare-Package-Einträge folgen der Loader-Auflösungsbasis, die sie aktiviert hat. Ein benanntes Manifest ohne nicht-leere Version lässt die Request-Vorbereitung fehlschlagen.

Der Sender dedupliziert exakte `(name, version)`-Paare und sortiert zuerst nach `name`, dann nach `version`, mit einem Locale-unabhängigen Textvergleich. Gleichzeitig aktive Versionen eines Pakets bleiben separate Einträge. Empfänger dürfen das Array nicht nach Paketname zusammenfassen oder Paketaktivierung aus der Array-Reihenfolge ableiten.

Deaktivierte, Pending-, Failed-, Unloading-, Disposed- und strukturelle Loader-Einträge fehlen. Gewöhnliche Abhängigkeiten, Loose-Module ohne benanntes besitzendes Paket, programmatisch gemountete Child-Fibers und In-Memory-dynamische Plugins fehlen ebenfalls, da sie keine autoritative Loader-Paketprovenienz haben.

Ein aktiviertes Inventar ohne qualifizierende Einträge sendet `packages: []`; das Deaktivieren des Contributors lässt das gesamte `dsh_plugin_packages`-Feld weg. Paket-Identitäten sind Provider-Metadaten und enteren niemals den Modell-Input.

## `dsh_session_log`

[`@deepseek-ai/dsh-session-log-deepseek`](../packages/session/session-log-deepseek/README.de.md) trägt einen zusammenhängenden Suffix des kanonischen Session-Logs bei. Das Feld ist standardmäßig deaktiviert. Wenn aktiviert, gilt es für einen Request mit einer Live-Session und mindestens einem Event; ein direkter Request, eine veraltete Session-ID oder ein leeres Log lässt das Feld weg. Die folgenden Beispiele verwenden das logische Session-Format 2 nur zur Veranschaulichung der Wire-Felder; sie identifizieren nicht das [aktuelle Writer-Format](session-format-status.de.md).

```json
{
  "dsh_session_log": {
    "version": 2,
    "sessionFormatVersion": 2,
    "session": {
      "version": 2,
      "id": "session-id",
      "createdAt": 1780000000000,
      "isSeeded": false
    },
    "afterSeq": -1,
    "throughSeq": 0,
    "events": [
      {
        "type": "turn/start",
        "seq": 0,
        "time": 1780000000001,
        "data": {
          "turn": 1
        }
      }
    ]
  }
}
```

| Member | Typ | Bedeutung |
|---|---|---|
| `version` | `2` | Schema-Version für `dsh_session_log` |
| `sessionFormatVersion` | nicht-negative integer | Session-Format-Generation, die dieser Suffix repräsentiert |
| `session` | Object | Unveränderliche Wire-Projektion des aktuellen Session-Headers |
| `afterSeq` | integer | Größte Sequenz, die vor diesem Request als akzeptiert aufgezeichnet wurde, oder `-1` |
| `throughSeq` | nicht-negative integer | Größte Sequenz, die dieser Request repräsentiert |
| `events` | Array | Zusammenhängende Events von `afterSeq + 1` bis `throughSeq` |

Der erste Upload verwendet `afterSeq: -1` und trägt das vollständige aktuelle Log. Jeder spätere Upload beginnt nach dem größten akzeptierten Watermark für dieselbe Session-ID. Der Sender snapshottet das Event-Array einmal pro Request; Appends nach diesem Snapshot gehören zu einem späteren Request.

### Wire-Session-Header

Das `session`-Member projiziert `Session.header`, weder eine vollständige Runtime-Session noch das Header-Objekt selbst. Es kopiert die aktuellen Header-Fakten, einschließlich des erforderlichen `isSeeded`-Lineage-Bits; die exakte `Session.inheritedEventCount` ist nicht Teil dieses Request-Felds. Das äußere `dsh_session_log.version` wählt dieses Erweiterungs-Schema, während `session.version` das logische Session-Format wählt. Eine Änderung der Session-Header-Projektion erfordert ein Erweiterungs-Schema-Bump, auch wenn sich das eingebettete logische Format gleichzeitig ändert.

| Member | Vorhanden bei | Bedeutung |
|---|---|---|
| `version` | erforderlich | Logische Session-Format-Version aus `Session.header`; siehe [Format-Status](session-format-status.de.md) |
| `id` | erforderlich | Exakte Session-ID |
| `createdAt` | erforderlich | Nicht-negative Safe-Integer Unix-Epoch-Millisekunden |
| `cwd` | optional | Absolutes Arbeitsverzeichnis, bei Session-Erstellung aufgezeichnet |
| `parentSession` | optional | Parent-Session-ID für einen Fork |
| `isSeeded` | erforderlich | Ob die Session ein Fork-geerbtes Event-Präfix enthält |
| `origin` | optional | Literal `subagent` für ein Subagent-Child |
| `delegationDepth` | optional | Nicht-negative persistierte Subagent-Delegations-Tiefe |
| `agentPreset` | optional | Agent-Preset-ID, die zur Komposition dieser Session verwendet wurde |

### Kanonische Event-Envelopes

Jedes `events`-Element ist ein vollständiges kanonisches `SessionEvent`, unabhängig von jedem anderen Request-Feld. Ein Event trägt immer `type`, `seq`, `time` und `data`; es kann `ignorable: true` tragen, und Surface-Events können zusätzlich `sourceEventSeqs` und `surfaceOp` tragen. Der Sender kopiert jedes vorhandene Member ohne Projektion, Redaktion oder Rekonstruktion.

### Akzeptanz-Watermark und At-Least-Once-Zustellung

Nachdem der Endpoint HTTP 2xx zurückgibt, hängt der Contributor dieses kanonische Event an dieselbe Session an:

```json
{
  "type": "session-log-deepseek/delivery-accepted",
  "seq": 8,
  "time": 1780000000002,
  "data": {
    "sessionId": "session-id",
    "sessionFormatVersion": 2,
    "throughSeq": 7
  }
}
```

`delivery-accepted` bedeutet, dass der konfigurierte Endpoint HTTP 2xx für den enthaltenden LLM-Request zurückgegeben hat. Es bestätigt keinen SSE-Abschluss oder Remote-Persistenz. Das `throughSeq` des Events muss ein früheres Event identifizieren, sein `sessionId` identifiziert die Session, deren Suffix gesendet wurde, und `sessionFormatVersion` bindet das Watermark an diese exakte logische Generation. Fehlen bedeutet historisches Format v0.

Der Sender falten die größte übereinstimmende `throughSeq` für die aktuelle Session-ID und Format-Generation, sodass gleichzeitig akzeptierte Requests den Cursor nicht zurückbewegen können und ein Watermark einer anderen Generation den aktuellen Suffix nicht autorisieren kann. Ein fortgesetzter Prozess baut den Cursor aus dem dauerhaften Log neu auf. Ein Fork ignoriert geerbte Watermarks, die eine andere Session benennen, und sendet daher sein eigenes vollständiges geerbtes Präfix, bevor er unter der Child-ID fortschreitet. Das Watermark-Event selbst gehört zum nächsten ungesendeten Suffix.

Transport- und Non-2xx-Fehler hängen kein Watermark an. Ein Absturz nach Endpoint-Akzeptanz aber vor lokaler Persistenz kann einen bereits akzeptierten Bereich erneut senden; Unsicherheit erzeugt Duplikate, niemals eine Sequenzlücke. Es gibt keinen unabhängigen Upload-Store, keine Größenbeschränkung und keinen Truncation-Pfad.

## Exposition und Empfängeranforderungen

Die Request-Header exponieren die Harness-Anwendungsversion, eine anonyme Harness-Home-Identity und eine optionale Session-Identity. `dsh_plugin_packages` exponiert aktive npm-Paketnamen und -versionen. Wenn aktiviert, kann `dsh_session_log` das Session-Arbeitsverzeichnis, System-Prompt-Snapshots, User- und Assistant-Content, eingebettete Assistant-Streams, Failed-Attempt-Output, Tool-Argumente und -Ergebnisse, Compaction-Zusammenfassungen, Feedback und Plugin-eigene Events exponieren. Adapter-API-Keys sind keine Session-Events und enteren daher nicht das Feld. Ein über `baseURL` ausgewähltes Gateway erhält dieselben Werte wie der offizielle Endpoint.

Empfänger adressieren Erweiterungsfelder nach Namen, dispatchen jedes Feld nach seiner eigenen `version`, bewahren unterschiedliche Paketversionen und ignorieren JSON-Member-Reihenfolge. Ein Session-Log-Empfänger validiert den zusammenhängenden Sequenzbereich, bevor er Event-Typen interpretiert. Ein unbekanntes kanonisches Event ohne `ignorable: true` verhindert verlustfreie Rekonstruktion. Der Basis-Request bleibt ohne die Registry oder einen bestimmten Contributor verwendbar; Feld-Fehlen bedeutet, dass dieser Contributor für diesen Request nicht angewendet wurde.
