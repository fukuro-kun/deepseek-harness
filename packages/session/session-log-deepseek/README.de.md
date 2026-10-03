---
description: "Inkrementeller kanonischer Session-Log-Upload für Deployments, die offizielle DeepSeek-Request-Metadaten aktivieren."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-log-deepseek
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Inkrementeller kanonischer Session-Log-Upload für offizielle DeepSeek-LLM-API-Requests. Dieses Function-Plugin injiziert `ctx.sessions` und `ctx.deepseekLlmApiExtensions` und besitzt dann das Request-Feld `dsh_session_log` sowie das durable `session-log-deepseek/delivery-accepted`-Event, aus dem es den Acceptance-Watermark ableitet. Es nur aktivieren, wenn die offizielle API ein Session-Log-Suffix erhalten soll.

## Inhaltsverzeichnis

- [Konfiguration](#configuration)
- [Request-Feld](#request-field)
- [Acceptance und Retry](#acceptance-and-retry)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Entwicklerhinweis](#dev-note)

-----

<a id="configuration"></a>
## Konfiguration

| Schlüssel | Standard | Bedeutung |
|---|---:|---|
| `enabled` | `false` | Den `dsh_session_log`-Beitrag registrieren. Auf `true` setzen, um den Session-Log-Upload zu aktivieren. |

Die ausgelieferten Profile mounten das Plugin, damit ein Overlay es aktivieren kann; die Default-Konfiguration registriert aber kein Request-Feld und hängt keinen Acceptance-Watermark an.

<a id="request-field"></a>
## Request-Feld

Für einen Request mit lebender `sessionId` faltet das Plugin den größten akzeptierten Watermark für genau diese Session-Format-Generation, snapshotet `Session.events` und sendet das zusammenhängende Suffix nach dem Watermark. Ein prozesslokaler Fold scannt jedes Event einmal und konsumiert spätere Appends inkrementell; Neustart und HMR bauen ihn aus dem durable Log neu auf. Das Version-1-Feld enthält `sessionFormatVersion`, einen rohen Session-Header (`seedLength` ist nur bei einer geseedeten Session vorhanden), die numerischen `afterSeq` und `throughSeq` sowie jedes vollständige kanonische Event, übersetzt in Roh-Zahlen-Envelope-Felder. Geforkte Sessions ignorieren geerbte Parent-Watermarks, weil sowohl die aufgezeichnete Session-id als auch die Format-Generation zur Request-Quelle passen müssen. Surface-Events erfordern `surfaceOp`, mit numerischem `startSeq` und `endSeq` für Replacements; nur User- und Tool-Events dürfen `sourceEventSeqs` tragen. Assistant-Provenance bleibt im eingebetteten Stream, und reine Log-Events tragen keines der beiden Metadatenfelder.

<a id="acceptance-and-retry"></a>
## Acceptance und Retry

Der DeepSeek-Adapter ruft das `accept()` des vorbereiteten Beitrags nach HTTP 2xx auf, bevor er den SSE-Body konsumiert. Acceptance hängt `session-log-deepseek/delivery-accepted` mit der hochgeladenen `throughSeq` und `sessionFormatVersion` an; ein Record ohne Formatfeld bezeichnet v0. Der nächste Request lädt dieses Event als Teil seines neuen Suffixes hoch. Transport- und Nicht-2xx-Fehler hängen keinen Acceptance-Record an, sodass spätere Requests den unsicheren Bereich erneut senden. Nebenläufige Zustellungen können out-of-order akzeptiert werden; das Falten der maximalen passenden `throughSeq` verhindert Cursor-Regression.

Ein Crash nach Server-Acceptance, aber bevor der Watermark die Persistenz erreicht, kann nach dem Neustart einen bereits akzeptierten Bereich nachspielen. Das ist die At-least-once-Fehlerrichtung: Unsicherheit erzeugt Duplikate, niemals eine übersprungene Sequenz. Die gewöhnliche Session-Checkpoint-Policy persistiert den Watermark am nächsten semantischen Checkpoint; dieses Plugin führt kein eigenes I/O aus.

Direkte Requests ohne lebende Session lassen `dsh_session_log` weg. Gewöhnliche Agent-, Compaction- und Session-Title-Calls tragen ihre lebende Session-id.

<a id="model-experience"></a>
## Model Experience

### Session-Log-Metadaten

#### Was das Modell sieht

Nichts. `dsh_session_log` ist ein Geschwister der Model-Input-Felder des DeepSeek-Requests und wird weder in `messages` noch in den System-Prompt oder Tool-Schemas eingefügt.

#### Token-Effekt

Null Model-Input-Tokens; das Feld vergrößert nur die HTTP-Request-Bytes.

#### KV-Cache-Effekt

Keiner; das modellsichtbare Request-Präfix bleibt unverändert.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Crash-Fenster-Duplikate** — ein 2xx gefolgt von Prozessverlust, bevor der Acceptance-Watermark persistiert ist, verursacht beim Fortsetzen ein konservatives Replay.
- **Keine lebende Session heißt kein Feld** — direkte oder stale-session Calls haben kein kanonisches Log zum Snapshoten; explizite Abwesenheitssemantik bleibt zurückgestellt.
- **Keine eigene Request-Größenbegrenzung** — vollständige Zustellung ist fail-closed; eine Provider-Ablehnung lässt den Cursor unverändert, statt das Log abzuschneiden.


<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
