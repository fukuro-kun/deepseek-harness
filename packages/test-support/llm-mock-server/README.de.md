---
description: "Skriptbarer OpenAI-kompatibler Fault-Server zum Testen von LLM-Adaptern und Recovery-Policy ohne Provider-Key, für Testautoren und Demos."
kind: "package-library"
---

# @deepseek-ai/dsh-llm-mock-server

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Dieses Paket gibt Tests und Demos einen skriptbaren OpenAI-kompatiblen HTTP/SSE-Endpunkt, damit sie Erfolge und Fehler eines Model-Providers ohne Provider-Key ausüben können. Jede akzeptierte `/chat/completions`-Anfrage konsumiert das nächste skriptierte Verhalten, einschließlich Resets, Stalls, malformed chunks, Rate Limits, Server-Fehler, Completions und Tool Calls. Testautoren können ihn mit `pnpm run mock:llm` starten oder `startMockLlmServer` aufrufen, das die erfassten Requests für Assertions zurückgibt. Das geseedete `random`-Verhalten unterstützt reproduzierbare Stress-Runs mit gemischten Fehlern.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Modell-Erfahrung](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Dieses Paket lässt einen Test oder eine Demo das Provider-Protokoll sprechen, ohne einen Provider: Starte den Server, skripte die Wire-Verhalten, die du ausüben willst, und richte einen echten LLM-Adapter auf seine Base URL.

### Standalone ausführen

Starte den Source-Einstieg aus diesem Repository:

```sh
pnpm run mock:llm \
  --port 8000 \
  --api-key mock-key \
  --sequence partial_disconnect,success \
  --partial-text "discard this half"
```

Richte den ausgelieferten DeepSeek-Adapter auf den Server; er hängt `/chat/completions` an die konfigurierte Base an:

```sh
DEEPSEEK_BASE_URL=http://127.0.0.1:8000/v1 \
DEEPSEEK_API_KEY=mock-key \
pnpm dsh --profile headless "test provider recovery"
```

Das Repository-Skript schreibt JSONL auf stdout: Ein `ready`-Record trägt die `/v1`-Base-URL und den Random Seed, gefolgt von Request/Result-Records, die sowohl das skriptierte Verhalten als auch das konkret gewählte Verhalten nennen. Das Paket exponiert keine installierbare Binary.

### Verhalten skripten

`--sequence` ist eine kommagetrennte FIFO. Erschöpfung liefert ein strukturiertes HTTP 500; `--repeat-last` verwendet den letzten Eintrag explizit wieder.

| Verhalten | Wire-Ergebnis |
|---|---|
| `connection_reset` | Socket vor den HTTP-Headers zerstören |
| `stream_disconnect` | SSE-Headers senden, dann vor dem ersten Event resetten |
| `partial_disconnect` | Text-Deltas senden, dann den Socket resetten |
| `stall` | SSE-Headers senden und idle bleiben, bis Client oder Server abbricht |
| `empty` | Einen gültigen inhaltslosen Stop und `[DONE]` senden |
| `empty_body` / `stream_eof` / `partial_eof` | Sauber enden ohne die erforderliche `[DONE]`-Grenze |
| `malformed_json` / `malformed_event` | Ungültiges SSE-JSON oder eine ungültige Provider-Chunk-Form senden |
| `rate_limit` / `server_error` / `service_unavailable` | Retry-orientierte 429/500/503-JSON-Fehler zurückgeben |
| `auth_error` / `invalid_request` / `context_overflow` / `quota_exceeded` | Terminale oder separat recovered Provider-Fehler zurückgeben |
| `success` / `slow_success` / `reasoning_success` | Eine vollständige Textantwort streamen, optional verzögert oder mit vorangestelltem Reasoning |
| `tool_call_success` / `max_tokens` | Mit einem Tool Call oder `length`-Finish abschließen |
| `wrong_content_type` | Einen gültigen SSE-Body unter `application/json` senden |
| `random` | Ein konkretes Request-Verhalten aus gewichteter geseedeter Zufälligkeit wählen |

`connection_refused` ist CLI-only und muss der erste Eintrag sein. Es verzögert das Binden eines vom Aufrufer angegebenen Nicht-Null-Ports, sodass Requests während `--listen-delay-ms` eine echte TCP-Refusal erhalten; die übrigen Einträge beginnen, nachdem der Listener gestartet ist.

### Random-Modus

Verwende einen sich wiederholenden `random`-Eintrag für einen offenen gemischten Run:

```sh
pnpm run mock:llm \
  --port 8000 \
  --sequence random \
  --repeat-last \
  --seed 42 \
  --random-weights 'success=60,slow_success=10,connection_reset=5,stream_disconnect=5,partial_disconnect=10,empty=5,server_error=5'
```

Wird `--seed` weggelassen, wird einer generiert und im `ready`-Record ausgegeben. `--random-weights` akzeptiert nicht-negative relative `behavior=weight`-Einträge und erfordert mindestens ein positives konkretes Verhalten. Der exportierte Default ist ein erfolgslastiges Stress-Profil mit Reset, Disconnect, Partial Output, leerer Completion, Stall, 429/5xx, sauberer Truncation und malformed JSON; es ist Testdruck, keine Schätzung der Produktions-Inzidenz. `connection_refused` ist ausgeschlossen, weil ein gebundener Request-Handler keine echte Refusal erzeugen kann. Enthalten die Random-Weights `stall`, konfiguriere den zu testenden Client mit einem kurzen Stream-Idle-Timeout, damit das Szenario zeitnah terminiert.

### Timing- und Content-Steuerungen

Der CLI exponiert `--success-text`, `--partial-text`, `--reasoning-text`, `--chunk-size`, `--chunk-delay-ms`, `--disconnect-delay-ms`, `--retry-after-ms`, `--request-id`, `--tool-name` und `--tool-arguments`. Millisekunden-Delays sind begrenzte Integer im Timer-Bereich von Node; `retryAfterMs` muss zusätzlich positiv sein. Die Library akzeptiert dieselben Camel-Case-Optionen. Ein optionales exaktes `apiKey` validiert `Authorization: Bearer <token>`; bei Weglassen wird jeder Token akzeptiert.

### Was schiefgehen kann

- **Das Skript geht aus** — Erschöpfung liefert ein strukturiertes HTTP 500; setze `--repeat-last` oder verlängere die Sequenz, wenn ein Run mehr Requests braucht.
- **Random-Weights ohne positives konkretes Verhalten werden abgelehnt** — jeder Eintrag muss ein existierendes Verhalten nennen und mindestens eines muss positives Gewicht tragen.
- **Ungültige Requests konsumieren das Skript nicht** — falsche Methoden, Pfade, Bearer-Tokens und malformed JSON erhalten gewöhnliche 4xx-Antworten, sodass ein falsch konfigurierter Client Retries verbrennen kann, ohne die Sequenz voranzutreiben.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design des Servers; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Design

Der Server baut auf einer Regel auf: Jede akzeptierte Chat-Completions-Anfrage konsumiert genau ein Verhalten aus einem ankunftsgeordneten FIFO-Cursor, und der Server wiederholt nie und interpretiert keine Harness-Policy. Die Validierung geschieht, bevor der Cursor voranschreitet — nur ein `POST`, dessen Pfad auf `/chat/completions` endet, mit gültigem Bearer-Token, sofern konfiguriert, und parsbarem JSON-Body konsumiert das Skript; alles andere erhält ein gewöhnliches 4xx. `random`-Einträge werden zur Request-Zeit über einen geseedeten PRNG auf die konfigurierten Weights aufgelöst, sodass ein Run aus seinem ausgegebenen Seed reproduzierbar ist.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `startMockLlmServer`: Listener, Verhaltenstabelle, geseedete Zufälligkeit, Telemetrie, erfasste Request-Records |
| [`src/cli.ts`](src/cli.ts) | `--sequence` und Parsing der Timing-/Content-Optionen, JSONL-stdout-Telemetrie |
| [`src/bin.ts`](src/bin.ts) | Der `pnpm run mock:llm` Source-Einstieg |
| — | Es wird kein Runtime-Invariant-Companion publiziert; dieser Standalone-Test-Server besitzt keinen Cordis-Event-Stream und keine geteilten Daten; sein Wire-Verhalten und sein Lifecycle werden durch direkte HTTP- und Assembled-Loop-Tests ausgeübt. |

### Wire-Fluss

Ein Request tritt in den Handler ein, wird validiert und wählt ein Verhalten: Ein konkreter Skript-Eintrag läuft direkt, `random` zieht eines, und ein erschöpftes Skript meldet `script_exhausted` als strukturiertes 500. `runBehavior` führt dann das Wire-Ergebnis aus — Socket-Destroy, SSE-Stream, JSON-Fehler oder Completion — während jeder Request und jedes Ergebnis in Ankunftsreihenfolge auf dem zurückgegebenen Handle für Test-Assertions aufgezeichnet wird. `close()` stoppt das Annehmen von Requests und beendet gestallte Verbindungen forciert.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie führen vom Fault-Server zum Adapter-Vertrag, den er ausübt, und zur schlüssellosen Alternative für aufgezeichnete Erfolgs-Transcripts.

- [LLM-Paket](../../llm/llm/README.de.md) — der Provider-Stream-Vertrag und die Retry-Policy, die dieser Server ausübt.
- [llm-replay](../llm-replay/README.de.md) — das schlüssellose Gegenstück, das aufgezeichnete Erfolgs-Transcripts replayt statt Fehler zu erzeugen.
- [Testing-Policy](../../../docs/testing.de.md) — die Coverage-Tiers und Recovery-Tests, denen dieser Server dient.
- [Test-Support-Gruppenkarte](../README.de.md) — Geschwister-Harnesses und Support-Pakete.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

Keine, da dieser Test-Server Provider-Wire-Verhalten ersetzt, ohne ein echtes Modell aufzurufen.

#### KV-Cache-Effekt

Keiner; Requests terminieren lokal und erreichen nie einen Provider-Cache.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Server besondere Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgaben-Backlog.

- **Random-Weights modellieren Testdruck, keine Produktions-Inzidenz** — Aufrufer, die eine umgebungsspezifische Verteilung wollen, müssen gemessene Weights liefern und den ausgegebenen Seed aufzeichnen.
- **Request-Skripte sind ankunftsgeordnet** — nebenläufige Aufrufer teilen einen Cursor, daher erfordert deterministische Fehlerzuweisung pro Session separate Server-Instanzen.
- **Echte Verbindungs-Refusal ist eine Listener-Lifecycle-Phase** — das CLI-Delay muss den Client-Versuch überlappen; Request-Level-Random-Auswahl kann nur eine akzeptierte Verbindung resetten.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
