---
description: "Der DeepSeek-Chat-Completions-Adapter für Anwender und Maintainer, die die Route deepseek-official, Thinking und Bildeingabe konfigurieren."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-deepseek
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Verwende dieses Paket, um DeepSeek-Modelle über die Route `deepseek-official` zu streamen, einschließlich konfigurierbarem Thinking und Reasoning-Aufwand, Bildeingabe für Vision-Modelle und einem empfehlenden Modellkatalog. Endpunkt, Credentials, Katalog und Thinking-Policy werden pro Request aufgelöst; gültige Änderungen an den User-Settings greifen daher beim nächsten Request ohne Prozessneustart. Wähle es für die offizielle DeepSeek-API oder ein OpenAI-kompatibles Gateway; es kann neben dem pi-ai-Paket laufen, weil beide unterschiedliche Route-Namen verwenden.

## Inhalt

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounte dieses Plugin, wenn eine Komposition DeepSeek-Modelle über den LLM-Service des Harness streamt. Es registriert die einzige Route `deepseek-official` und löst die Verbindungsdaten pro Request auf; ein Kompositionseintrag plus optionaler User-Settings-Abschnitt steuern den gesamten Adapter.

### Wann es die richtige Wahl ist

Wähle diesen Adapter, wenn das Deployment auf die offizielle DeepSeek-API zielt, optional hinter einem OpenAI-kompatiblen Gateway, das über `baseURL` benannt wird. Wähle `dsh-llm-pi-ai`, wenn dieselbe Komposition zusätzlich andere Provider oder manuell deklarierte Gateways über die pi-ai-Kataloge routet; beide Adapter können gemeinsam gemountet werden, da ihre Route-Namen nicht kollidieren. Die Registrierung eines anderen Adapters für `deepseek-official` schlägt mit `DUPLICATE_ADAPTER` fehl.

### Minimale Konfiguration

```yaml
- name: '@deepseek-ai/dsh-llm-deepseek'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY  # credential reference, resolved per request
    baseURL: https://api.deepseek.com # optional; $DEEPSEEK_BASE_URL then this default
    reasoningEffort: high        # optional; off | low | high | max
    maxTokens: 256000            # optional per-request output cap
    maxRequestFilesBytes: 134217728
    maxInlineRequestImageBytes: 20971520
    maxImagesPerRequest: 600
    filesApiTimeoutMs: 60000
```

Ein Request wählt die Route über `provider: deepseek-official`; die Model-ID geht unverändert auf die Leitung, sodass neue DeepSeek-Modelle keine erneute Registrierung brauchen. Ein weggelassenes `models` bewirbt den text- und bildfähigen `deepseek-flash` sowie `deepseek-v4-flash-vision-exp` neben den reinen Textmodellen `deepseek-v4-flash` und `deepseek-v4-pro`, jeweils mit einem Kontextfenster von 1.000.000 Tokens. Eine explizite Liste ersetzt diese Defaults, und nicht gelistete Model-IDs werden weiterhin als reine Text-Routen durchgereicht. Clients, einschließlich Model-Discovery-Tools, lesen die empfehlenden Einträge über `ctx.llm.listModels('deepseek-official')`. Bildfähige Einträge können `imagePixelBudget` auf eine positive Ganzzahl oder `low` setzen und dürfen `imageMaxBytes` setzen. Ein Eintrag darf `systemPromptUpdate: in-history` deklarieren, wenn sein Endpunkt die jeweils letzte `system`-Nachricht an beliebiger Position in `messages` als vollständigen wirksamen System-Prompt liest; der Adapter meldet den Modus auf dem aufgelösten Modell und dem vorbereiteten Call, und der Agent-Loop hängt einen geänderten Prompt dann hinter die gecachte History, statt die führende System-Nachricht umzuschreiben ([Entscheidungsregel](../../core/agent-loop/README.de.md#understand-the-implementation)). Der Default-Eintrag `deepseek-flash` deklariert diesen Modus; andere Modelle benötigen eine explizite `models`-Deklaration, und jeder andere Wert als `in-history` scheitert beim Laden mit `llm-deepseek: catalog model "<id>" systemPromptUpdate must be "in-history" when present`.

| Feld | Default | Bedeutung |
|---|---|---|
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | Credential-Referenz, pro Request über den Credentials-Seam und danach die Umgebung aufgelöst |
| `baseURL` | `https://api.deepseek.com` | Endpunkt-Basis; `$DEEPSEEK_BASE_URL` gewinnt, wenn gesetzt |
| `thinking` | `enabled` | Deployment-Policy; `disabled` sperrt jeden Request auf `off` |
| `reasoningEffort` | `high` | Standard-Aufwand: `off`, `low`, `high` oder `max` |
| `maxTokens` | `256,000` | Ausgabelimit pro Request; das eigene Limit des Modells und explizite Request-Werte gewinnen |
| `defaultContextWindow` | `1,000,000` | Kapazitäts-Fallback für Modelle ohne exakten Wert |
| `models` | V41 Flash + V4 Flash + V4 Pro + V4 Flash Vision Exp | Empfehlender Katalog für Discovery-Consumer |
| `streamIdleTimeoutMs` | `300,000` | Maximale Provider-Leerlaufzeit pro ausstehendem Stream-Read |
| `maxRequestFilesBytes` | `128 MiB` | Hochwassermarke für gehaltene Request-Bild-Bytes vor dem Oldest-first-Offload |
| `maxInlineRequestImageBytes` | `20 MiB` | Unabhängige Hochwassermarke für den Base64-Fallback |
| `maxImagesPerRequest` | `600` | Hochwassermarke für die Anzahl gehaltener Request-Bilder |
| `imageOffloadByteQuantum` | `64 MiB` | Entfernungsquantum für das älteste Präfix im Files-Modus |
| `inlineImageOffloadByteQuantum` | `10 MiB` | Entfernungsquantum für das älteste Präfix im Inline-Modus |
| `imageOffloadCountQuantum` | `20` | Entfernungsquantum bei Mengenüberschreitung |
| `filesApiTimeoutMs` | `60,000` | Deadline für die Files-Auflösung pro Bild |
| `fileExpiresAfterSeconds` | `604,800` | Angeforderte Lebensdauer hochgeladener Bilder |
| `fileRefreshMarginSeconds` | `3,600` | Restlebensdauer, unterhalb derer eine ID ersetzt wird |
| `fileQuotaCleanupBatch` | `100` | Älteste Harness-eigene Dateien, die vor einem Quota-Retry gelöscht werden |
| `retryPolicy` | normal, 5 Retries | Provider-eigene Retry-Policy, ausgeführt von `dsh-llm-retry` |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-llm-deepseek) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Streaming mit Thinking und Bildern

Eine bildfähige Route löst jede durable Referenz innerhalb ihres Pixel- und Byte-Budgets in eine deterministische Request-Version auf. `imagePixelBudget` akzeptiert eine positive Ganzzahl oder `low`; bei Weglassung werden 640.000 Gesamtpixel verwendet, `low` verwendet 512×512 Gesamtpixel, und `imageMaxBytes` liegt standardmäßig bei 1 MiB. Bilder mit Alpha verwenden WebP mit Effort 0, opake Bilder JPEG auf der Qualitätsleiter 85/75/60; wenn jeder Kandidat das Ziel überschreitet, bleibt die kleinste Ausgabe erhalten. Vor jedem gehaltenen Bild steht ein Text, der die vollständige Attachment-ID und die tatsächlichen Request-Abmessungen nennt. Wenn das aktuelle Dateisystem das Host-Objekt des Attachment-Providers abbildet, trägt dieser Text zusätzlich einen schreibgeschützten Execution-World-Pfad und die Erweiterung für eine beschreibbare Kopie. Reine Text- und nicht gelistete Routen erhalten stabile Attachment-Platzhalter, während die durable History die Bildreferenzen behält.

Der Adapter lädt diese exakten Request-Bytes normalerweise über die DeepSeek Files API hoch und sendet File-ID-Blöcke. Eine fehlgeschlagene oder abgelaufene Datei-Auflösung baut den gesamten Chat-Request mit denselben Request-Versionen als Base64-Data-URLs neu auf; ein Request mischt niemals File-IDs und Inline-Bilder. Gecachte IDs sind auf Endpunkt und API-Key beschränkt, werden vor Ablauf erneuert, bei Stale-File-Fehlern des Providers invalidiert und über Singleflight mit wartender lokaler Cancellation aufgelöst. Bei Quota-Fehlschlag wird zuerst ein konfigurierter Batch der ältesten Harness-eigenen Dateien gelöscht, bevor ein Upload-Retry läuft.

Der Files-Modus begrenzt gehaltene Request-Versionen über `maxRequestFilesBytes` und `maxImagesPerRequest`; der Inline-Fallback hat ein eigenes Base64-Budget. Beide entfernen ein ältestes Präfix in konfigurierten Byte- oder Mengenquanten. Jedes ausgelassene Bild erhält einen eigenen modellsichtbaren Platzhalter mit Anzeigename oder Attachment-ID und, soweit verfügbar, normalisierten Abmessungen, Medientyp und aktuellem schreibgeschütztem Pfad. Die gestufte Hochwassermarken-Policy vermeidet, nach jedem neuen Bild ein altes Request-Präfix neu zu schreiben.

`reasoningEffort` wählt den beworbenen Default. Exakte Modell-Metadaten exponieren die geordneten Aufwände `off`, `low`, `high` und `max` samt Auswahlhinweis, wenn die Deployment-Policy Thinking erlaubt. `low`, `high` und `max` aktivieren Thinking und serialisieren als `reasoning_effort`, während das adaptereigene `off` stattdessen `thinking.type: disabled` sendet. Ein nicht unterstützter Wert schlägt vor der Netzwerk-I/O mit `UNSUPPORTED_REASONING_EFFORT` fehl, und `thinking: disabled` weist beim Plugin-Laden jeden Aufwand ungleich `off` zurück. Requests mit `purpose: 'session-title'` erzwingen ausgeschaltetes Thinking, um Ausgabe für den sichtbaren Titeltext zu reservieren.

### Dynamische Konfiguration

Verbindungsdaten werden einmal pro Operation über die optionalen Settings- und Credentials-Seams neu gelesen. Ein Abschnitt `llm-deepseek:` im User-Settings-Dokument überschreibt jedes Feld ohne Neustart; ein Snapshot, der eine schemaübergreifende Grenze verletzt, behält die letzten gültigen Daten und loggt den Fehlschlag. Der API-Key wird pro Stream-Call aus demselben Snapshot aufgelöst, der Endpunkt, Bild- und Files-Policies sowie das Idle-Budget liefert; eine abgelehnte Settings-Generation trägt daher nichts davon bei. Bild-Requests lösen den Attachment-Service zur Request-Zeit auf, sodass die Ladereihenfolge die Bildverfügbarkeit nicht einfriert.

### Providerspezifische Request-Felder

Wenn `ctx.deepseekLlmApiExtensions` vorhanden ist, bereitet der Adapter seine registrierten Top-Level-Felder aus dem exakt serialisierten Basis-Request vor `fetch` vor. Vorbereitungs- oder Feldkollisionen schlagen vor HTTP fehl; nach einer 2xx-Antwort akzeptiert der Adapter jeden erfassten Beitrag vor dem SSE-Konsum. Transport- und Nicht-2xx-Fehler akzeptieren sie nicht. Ausgelieferte Kompositionen nutzen dies für das optionale inkrementelle Feld `dsh_session_log` und das standardmäßig aktive Inventar `dsh_plugin_packages`; beide bleiben außerhalb des Modell-Inputs.

### Fehler und Recovery

Nicht-2xx-Antworten schlagen mit stabilen Codes fehl: `AUTH` (401/403), `QUOTA`, `RATE_LIMIT`, `CONTEXT_WINDOW_EXCEEDED`, `INVALID_REQUEST`, `SERVER` und sonst `HTTP_<status>`; Transportfehler vor der Antwort werfen `TRANSPORT`, Caller-Abbrüche werfen `ABORTED`, und Ablauf des Stream-Idle wirft `TIMEOUT`. Vorbereitung von Request-Erweiterungen, Feldkollision oder Post-2xx-Akzeptanz schlagen mit `REQUEST_EXTENSION` fehl. Eine Normalized-Image-Ablehnung nennt jedes plausible Attachment und seine durable Position, wenn der Provider keine File-ID identifiziert. Eine Stale-File-Ablehnung invalidiert die genannten Mappings (oder jedes vom Versuch verwendete Mapping) und erlaubt einen Ersatz-Chat-Versuch. Protokollverletzungen werfen `STREAM_CLOSED` oder `MALFORMED_RESPONSE`, und ein terminales `stop` ohne Content-Blöcke wird zu `EMPTY_RESPONSE`, das die Default-Retry-Policy wiederholt. Ein Request ohne Key an irgendeiner Stelle schlägt mit `MISSING_CREDENTIAL` fehl, und ein malformed Credential schlägt mit `INVALID_CREDENTIAL` fehl und nennt die zu korrigierende Referenz — niemals einen Teil des Keys.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen</summary>

Dieser Abschnitt erklärt das Design hinter dem Adapter; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designphilosophie

Das Plugin baut auf einem expliziten Resolve-Schritt und einer einzigen Registrierungstatsache auf. `resolveAdapterOptions()` ist der einzige Pfad von roher Config zu validierten Verbindungsdaten, und der Adapter liest diese Daten über einen Thunk einmal pro Operation neu — Base-URL, Katalog, Request-Defaults, Bild- und Files-Policies sowie das Idle-Budget greifen beim nächsten Request, während ein laufender Stream die Daten behält, mit denen er gestartet ist. Die einzige bei der Registrierung erfasste Tatsache ist die Retry-Policy: Ändert sich ihr aufgelöster Wert, registriert das Plugin die Route in einem synchronen Abschnitt in-place neu, sodass kein Request eine Lücke beobachtet.

### Quelltextkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Config`-Schema, Auflösung pro Request, Settings- und Credential-Verdrahtung |
| [`src/adapter.ts`](src/adapter.ts) | Der `DeepSeekAdapter`: Modellauflösung, Bildprojektion, Files-Fallback, Streaming mit Idle-Timeout |
| [`src/file-store.ts`](src/file-store.ts) + [`src/files-api.ts`](src/files-api.ts) | Scoped Upload-Caching, Expiry, Stale-ID-Recovery, Quota-Cleanup und Remote-Dateioperationen |
| [`src/serialize.ts`](src/serialize.ts) | Wire-Serialisierung: Thinking-Defaults, Files- oder Inline-Bildblöcke, History-Regeln |
| [`src/sse.ts`](src/sse.ts) | `eventsource-parser`-SSE-Framing für den direkten `fetch`-Stream |
| [`src/translate.ts`](src/translate.ts) | Übersetzung der SSE-Payloads in Harness-`StreamChunk`-Werte; `id` und `name` eines Tool-Calls sind Identität, sodass ein Fortsetzungs-Delta, das sie leer oder null wiederholt, den etablierten Wert unangetastet lässt |
| [`src/types.ts`](src/types.ts) | Wire-Level-Typen, die die obigen Module teilen |

### Wire-Fluss

Ein `stream()`-Call stellt normalerweise einen Chat-Request: deterministische Request-Bilder auflösen, Files-IDs bevorzugen, alle registrierten Top-Level-Request-Erweiterungen vorbereiten, von der aufgelösten `baseURL` fetchen, Erweiterungstransaktionen nach HTTP 2xx akzeptieren und den SSE-Stream in das Harness-Protokoll übersetzen. Schlägt die Datei-Auflösung fehl, läuft der erste Chat inline; eine Stale-File-Antwort des Providers erlaubt einen Ersatzversuch, ebenfalls inline, wenn die Ersatzauflösung fehlschlägt. Jeder Chat- und Files-Call trägt außerhalb des Modell-Inputs die geteilte Attribution plus die stabile anonyme User-ID, und ein Session-Call trägt zusätzlich seine Session-ID. Reasoning-History wird bei Bedarf zurückserialisiert, und die Cache-Abrechnung bildet DeepSeeks Cache-Hit-Metriken auf die Harness-Usage ab.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht reicht. Sie bewegen sich vom Service-Vertrag zum Zwillings-Adapter, zum Retry-Executor und zu den geteilten Typen.

- [dsh-llm-Service](../llm/README.de.md) — der provider-neutrale Service, auf dem sich dieser Adapter registriert.
- [llm-pi-ai-Adapter](../llm-pi-ai/README.de.md) — der library-gestützte Zwilling für andere Provider und Gateways.
- [LLM-Streaming-Subsystem](../../../docs/subsystems/llm-streaming.de.md) — das `StreamChunk`-Protokoll und der Adapter-Vertrag.
- [llm-retry](../llm-retry/README.de.md) — der Retry-Executor, der die `retryPolicy` dieses Adapters anwendet.
- [DeepSeek-Request-Erweiterungen](../deepseek-llm-api-extensions/README.de.md) — Lifecycle- und Akzeptanzsemantik für providerspezifische Top-Level-Felder.
- [Session-Log-Upload](../../session/session-log-deepseek/README.de.md) — der optionale inkrementelle `dsh_session_log`-Beitrag.
- [Plugin-Paket-Inventar](../plugin-package-inventory-deepseek/README.de.md) — der standardmäßig aktive `dsh_plugin_packages`-Beitrag.
- [Twin-LLM-Adapter](../../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.de.md) — warum DeepSeek zwei strukturell verschiedene Adapter ausliefert.
- [Pflicht-App-Attribution-Header](../../../.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.de.md) — die Identität, die jeder Provider-Request trägt.

-----

<a id="model-experience"></a>
## Model Experience

### DeepSeek-Request

#### Was das Modell sieht

Das gewählte DeepSeek-Modell erhält den Harness-System-Prompt, die Message-History, Tool-Schemata, Stop-Sequenzen und die Call-Config (`maxTokens`, `reasoningEffort`, `temperature`) ohne adapterverfasste Prompt-Prosa. Providerspezifische Request-Erweiterungsfelder bleiben außerhalb des Modell-Inputs. Das Vision-Modell erhält gehaltene User- und Tool-Result-Bilder normalerweise als Files-API-Referenzen neben Attachment-Handles und Request-Vorschauabmessungen. Es erhält außerdem einen Pfad zum normalisierten Objekt, wenn das aktuelle Execution-Dateisystem das Host-Objekt des Attachment-Providers abbildet; der Deskriptor markiert diese Kopie als schreibgeschützt und warnt davor, dass die Normalisierung den Upload skaliert oder neu kodiert haben kann. Bei Fehlschlag der Files-Auflösung werden alle gehaltenen Bilder stattdessen als Inline-Data-URLs gesendet, und ein über dem Budget liegendes älteres Bild behält den für diesen Request aufgelösten Zugriff in seinem Platzhalter. Reasoning-Content aus einem früheren Assistant-Turn wird wörtlich zurückgereicht, unabhängig davon, ob dieser Turn ein Tool aufgerufen hat.

#### Token-Effekt

Die Provider-Tokenisierung bestimmt den exakten Text- und Bild-Token-Input. Der Adapter deklariert `imageRequestPricing` pro Route: Er reproduziert den Oldest-first-Bild-Offload aus durable Byte-Längen und bepreist jedes gehaltene Bild nach seinen projizierten Abmessungen mit der veröffentlichten V4-Vision-Abrechnung (14-px-Patch-Raster, 3:1-Downsampling, 384-Token-Cap, Worst-Case-Ausrichtungs-Padding). Dadurch kann der Token-Meter Bilddruck vor einem Request bepreisen; die gemeldete Usage bleibt maßgeblich. Das Reasoning-Passback trägt die Chain of Thought jedes begründeten Turns in spätere Requests, während das Fallenlassen überzähliger Bilder vermeidet, diese Tokens erneut zu bezahlen. Cache-Read-Usage wird gemeldet, wenn verfügbar. `totalTokens` ist das exakte Aggregat `prompt_tokens + completion_tokens` und wird weggelassen, wenn ein geliefertes `total_tokens` abweicht.

#### KV-Cache-Effekt

Ein unverändertes assembliertes Präfix ist für die DeepSeek-Cache-Wiederverwendung qualifiziert, die dieser Adapter in der Usage meldet. Deterministische Request-Bild-Bytes machen das volle Präfix nicht unveränderlich: Ein geänderter Execution-World-Pfad schreibt historischen Deskriptortext neu, ein erneuerter Upload kann eine `file_id` ersetzen, und der Files-zu-Base64-Fallback ändert die Bilddarstellung. Jedes davon — oder eine Änderung an Modellroute, Prompt, Schema, History oder Bildbudget — kann die Wiederverwendung ab dem ersten betroffenen Token verhindern; das Reasoning-Passback hängt in jedem begründeten Turn an. Bei einem Katalogeintrag mit `systemPromptUpdate: in-history` wird eine System-Prompt-Änderung innerhalb einer fortlaufenden Request-Serie hinter die gecachte History gehängt, sodass das Präfix bis zu dieser History wiederverwendbar bleibt; eine Tool-Schema-Änderung verhindert die Wiederverwendung dennoch ab dem ersten geänderten Token.

### DeepSeek-Antwort

#### Was das Modell sieht

Reasoning, Text und Raw-String-Tool-Argumente werden in Harness-Chunks übersetzt, die der Loop loggt und assembliert.

#### Token-Effekt

Generierte Tokens folgen dem geloggten Reasoning-Aufwand des Requests und `maxTokens`; nur vom Loop gehaltene Blöcke beeinflussen späteren Input.

#### KV-Cache-Effekt

Vom Loop gehaltene Antwortblöcke hängen am nächsten Request an und bewahren dessen früheres wiederverwendbares Präfix; verworfene Blöcke haben keinen späteren Cache-Effekt. Ein Wechsel von Provider oder Modell wählt eine andere Cache-Domäne.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo der Adapter aufhört und zukünftige Arbeit beginnt. Sie sind aktuelle Paket-Constraints, kein allgemeiner DeepSeek-Vergleich und kein Aufgabenstau.

- **Eine `models`-Liste in den Settings ersetzt die Kompositionsliste vollständig** — das Merging auf Settings-Ebene läuft pro Feld, und Arrays sind ein einziges Feld; ein Merging pro Katalogeintrag bräuchte eine keyed Struktur.
- **`tool_choice` wird nicht gemappt** — nicht Teil des Kern-Vokabulars (mit dem pi-ai-Zwilling geteilt).
- **Requests verwenden rohes `fetch`, nicht `@cordisjs/plugin-http`** — keine geteilte Proxy- oder Interception-Konfiguration.
- **Plugin-hinzugefügte Content-Block-Typen werden übersprungen** — Core-Text- und unterstützte Bildblöcke werden serialisiert, und leerer Tool-Output geht als Literal `(no output)` über die Leitung.
- **Bilder sind nur-input durable Attachments** — direkte externe URLs und Assistant-Bild-Output werden nicht unterstützt; DeepSeek-Input nutzt normalerweise die Files API und Inline-Base64 nur zur Wiederherstellung pro Request.
- Der Default-Katalog registriert `deepseek-flash` samt seiner Text-/Bild- und In-History-Fähigkeiten vorab, ohne die Gateway-Verfügbarkeit zu prüfen. Requests können mit `INVALID_REQUEST` fehlschlagen, bis das Gateway die ID freischaltet. Mit konfiguriertem `DEEPSEEK_API_KEY` und einem unterstützenden Gateway aktiviert `DEEPSEEK_FLASH_E2E=1` den Chat-Completions-Check in der [e2e-Suite dieses Pakets](tests/adapter.e2e.ts).

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Diese Dev-Notiz ist nicht-maßgeblicher Arbeitskontext: unentschiedene Richtungen und Hinweise für Maintainer. Ausgeliefertes Verhalten und akzeptierte Begründungen leben in den Abschnitten oben, im Paket-Code und in den verlinkten Agent Notes.

- OpenRouter-spezifische App-Attribution-Header sind auf einen künftigen expliziten OpenRouter-Adapter oder -Modus zurückgestellt; Requests an OpenAI-kompatible Gateways tragen nur die geteilte Attributions-Baseline.
- Der `off`-Reasoning-Aufwand geht niemals als `reasoning_effort: 'off'` über die Leitung; er serialisiert als `thinking: { type: 'disabled' }` und lässt das Feld weg, sodass die Protokollschreibweise auch für Gateways gültig bleibt, die unbekannte Aufwandswerte ablehnen.

</details>

**Runtime-Invariante:** Es wird kein Companion-Entry veröffentlicht. Dieses Paket hat keine eigene Event-Sequenz oder mutierbare Datenrelation; der zugehörige Vertrag wird im besitzenden Seam durchgesetzt.
