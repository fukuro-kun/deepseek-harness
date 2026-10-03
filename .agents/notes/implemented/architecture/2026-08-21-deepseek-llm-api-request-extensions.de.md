# Agent Note: DeepSeek-LLM-API-Request-Erweiterungen für Session-Logs und Plugin-Pakete
[English](2026-08-21-deepseek-llm-api-request-extensions.md) | [中文](2026-08-21-deepseek-llm-api-request-extensions.zh.md) | Deutsch

Status: implemented


## Problem

Das kanonische Session-Log enthält Request-Grenzen, rohe Response-Chunks, zusammengesetzte Nachrichten, Tool-Aktivität, Plugin-Ereignisse und Fehlerfakten, die die Nachrichtenliste des Modells nicht erhält. Der OTel-Session-Telemetriepfad projiziert und stapelt dieses Log unabhängig von Modell-Requests, nutzt vom Deployment gewählte Sharing-Modi und verwirft absichtlich die meisten Assistant-Chunks. Die offizielle DeepSeek-API kann daher weder aus ihren gewöhnlichen Request-Nachrichten noch aus dem Telemetrie-Feed die vollständige Harness-Trajektorie rekonstruieren.

Die providerseitige Diagnose benötigt außerdem die exakten aktiven Plugin-Paketversionen, die einen Request erzeugt haben. Die vorhandene Browser-seitige Plugin-Bestandsaufnahme meldet konfigurierte Loader-Zeilen und Lifecycle-Phasen, besitzt aber weder die Auflösung von Paket-Manifesten noch die stehende Preset-Komposition des anfragenden agent.

Beide Werte gehören ausschließlich auf den Pfad des offiziellen DeepSeek-adapters. Sie in `GenerateOptions` oder dem provider-neutralen LLM-seam unterzubringen, würde DeepSeek-Protokollkonzepte gegenüber pi-ai und jedem künftigen adapter offenlegen.

## Entscheidung

`@deepseek-ai/dsh-deepseek-llm-api-extensions` registriert `ctx.deepseekLlmApiExtensions`, eine additive registry für Top-Level-Felder in `deepseek-official`-Request-Bodies. Ein Beitragender beansprucht ein declaration-merged-Feld über `register()`. Der adapter ruft `prepare()` auf, nachdem er die exakten Protokollnachrichten serialisiert hat, übergibt das Abbruchsignal des Requests, lehnt die Vorbereitung oder eine Kollision mit Basisfeldern vor dem HTTP ab, mergt die abgelösten Felder und ruft nach HTTP 2xx die erfasste `accept()`-Transaktion auf. Die registry wartet nach einer Abbruch nicht weiter auf die Vorbereitung, selbst wenn ein Beitragender das Signal ignoriert. Fehlschläge bei der Annahme bleiben Request-Fehler unter `REQUEST_EXTENSION`; Transport- und Nicht-2xx-Fehler nehmen niemals einen Beitrag an. Eine Komposition ohne die registry behält den wiederverwendbaren Basis-adapter. Ausgelieferte Kompositionen mounten die registry und beide Beitragenden: Paket-Metadaten sind standardmäßig aktiviert, während der Session-Log-Upload standardmäßig deaktiviert ist und `session-log-deepseek.enabled: true` erfordert. Die schlüssellose `deepseek-official`-Wiedergabe ruft die Vorbereitung mit einem synthetischen leeren Basis-Body und derselben Annahme-Transaktion vor ihrem ersten aufgezeichneten Chunk auf und bewahrt so die Post-2xx-Erweiterungsnebenwirkungen statt der Feldbytes.

Das provider-neutrale `llm`-Paket und `llm-pi-ai` enthalten keinen Erweiterungstyp, keine Service-Suche, kein Feld-Merge und keinen Annahmeaufruf.

## Inkrementelles Session-Log-Feld

`@deepseek-ai/dsh-session-log-deepseek` besitzt `dsh_session_log` als explizites Opt-in. Bei Aktivierung sendet jeder Request mit einer live Session-ID das zusammenhängende kanonische Event-Suffix hinter dem größten dauerhaften `session-log-deepseek/delivery-accepted`-Wasserzeichen für dieselbe Session-Identität. Das Feld enthält den unveränderlichen Session-Header und vollständige Event-Envelope. Ein 2xx hängt ein neues Wasserzeichen für das übertragene `throughSeq` an; dieses Ereignis geht in das Suffix des folgenden Requests ein. Geforkte Logs behalten die Wasserzeichen-IDs des Elternteils, sodass ein Kind unter seiner eigenen Identität bei Sequenz null beginnt. Gleichzeitige Annahmen können außerhalb der Reihenfolge eintreffen, und das maximale Wasserzeichen bleibt maßgeblich. Ein prozesslokaler Fold durchsucht jedes Session-Ereignis einmal und konsumiert spätere Anhänge inkrementell; ein neues Session-Objekt oder eine HMR-Generation baut den Fold aus der dauerhaften Historie neu auf.

Die Fehlerrichtung ist mindestens einmal. Eine Transport- oder provider-Ablehnung zeichnet kein Wasserzeichen auf. Ein Absturz nach entfernter Annahme, aber bevor das Wasserzeichen persistiert ist, führt nach der Wiederaufnahme zu einer Wiederholung, niemals zu einer übersprungenen Sequenz. Vorhandene Session-Checkpoints persistieren das Ereignis; das Upload-Plugin besitzt keinen zweiten Speicher.

Das `events`-Array enthält direkt vollständige kanonische `SessionEvent`-Objekte. Der Sender kopiert jedes vorhandene Event-Mitglied ohne Projektion oder Schwärzung; das Feld ist eigenständig und erfordert keine Rekonstruktion gegenüber `messages`.

## Plugin-Paket-Feld

`@deepseek-ai/dsh-plugin-package-inventory-deepseek` besitzt das standardmäßig aktivierte `dsh_plugin_packages`-Feld aus der `llm`-Paketfamilie. Es liest aktive Nicht-Gruppen-Einträge aus dem Host-Loader-Baum und, für einen live anfragenden agent, dessen stehenden Preset-Baum. Die Node-Paketauflösung lokalisiert das zugehörige manifest, ohne einen `./package.json`-Export zu erfordern. Gewöhnliche Einträge lösen sich aus ihrem zugehörigen Baum auf, während eine stehende Preset-Wurzel die absichtliche harness-base-Überschreibung ihres Loaders spiegelt und verschachtelte Includes ihre eigenen Basen behalten. Ein anonymes nächstes manifest kennzeichnet ein loses Modul; ein benanntes manifest muss eine Version tragen. Exakte Name/Version-Paare werden mit deterministischer Reihenfolge dedupliziert; gleichzeitig aktive Versionen bleiben getrennt.

Deaktivierte, anstehende, fehlgeschlagene, entladende, disposed-, strukturelle, lose Nicht-Paket-, gewöhnliche Abhängigkeits-, programmatische Kind-fiber- und In-Memory-Dynamic-Plugin-Einträge liegen außerhalb dieser Paketbestandsaufnahme. Diese Definition meldet paketgestützte Kompositionsfakten, die die Laufzeit beweisen kann, statt für beliebige Callbacks eine Herkunft zu erfinden.

## Zurückgestelltes Bestands-Caching

Die Implementierung berechnet die aktive Paketmenge bewusst für jeden Request neu, während sie manifest-Identitäten für die Prozesslebensdauer cached. Ein synthetisches host-only-Benchmark auf Node v24.16.0, macOS arm64 nutzte eindeutige aktive relative Plugin-Pakete, 20 Aufwärm-Requests, dann 500 gemessene Requests für 25 und 100 Einträge sowie 250 für 500 Einträge. „Erster Request“ umfasst ungecachte manifest-Lesevorgänge; „cached-provider-Median“ liefert ein vorgefertigtes Feld über dieselbe registry, behält also `structuredClone()`- und Freeze-Kosten, schließt aber adapter-JSON-Serialisierung und Netzwerkzeit aus.

| Aktive Einträge | Erster Request | Aktueller warmer Median | Aktuelles warmes p95 | Cached-provider-Median |
|---:|---:|---:|---:|---:|
| 25 | 1.23 ms | 0.05 ms | 0.07 ms | 0.02 ms |
| 100 | 2.23 ms | 0.14 ms | 0.24 ms | 0.04 ms |
| 500 | 10.22 ms | 0.60 ms | 0.79 ms | 0.18 ms |

Diese Messungen lassen den Cache zurückgestellt: Selbst 500 Einträge bleiben im eingeschwungenen Zustand unter einer Millisekunde, und die geschätzte Ersparnis beträgt etwa 0,42 ms vor der unvermeidlichen JSON-Serialisierung. Ein reales Profil, das eine wesentliche `prepare()`-Latenz zeigt, ist der Auslöser, den Cache hinzuzufügen, statt einer festen Eintragszahlschwelle.

Das zurückgestellte Design verwendet eine monotone Bestands-Epoche. Ein globaler `internal/status`-Listener erhöht sie, wann immer der Wurzel-fiber eines Loader-Eintrags die `FiberState.ACTIVE`-Grenze überschreitet, und deckt damit Abhängigkeitsaktivierung, Deaktivierung, Entladung und HMR ohne zeitbasiertes stale-Fenster ab. Der Beitragende cached den Host-Snapshot nach Epoche, cached jeden stehenden Preset-`EntryTree` in einer `WeakMap` und cached das kombinierte Host-plus-Preset-Ergebnis nach Baum und Epoche. Bereits sortierte Snapshots mergen und deduplizieren exakte `(name, version)`-Paare in linearer Zeit. Eine Berechnung, deren Epoche sich vor der Abrechnung ändert, wird wiederholt, statt einen stale-Snapshot zu veröffentlichen; disposed-Preset-Bäume bleiben über die `WeakMap` collectable.

Der prozesslebensdauerliche manifest-Identitäts-Cache bleibt getrennt, weil ein In-Process-Ersatz der Paketversion nicht unterstützt wird.

## Verifikation

registry-Tests pinnen doppelte Ownership, effektbezogene Entsorgung, abgelöste Feldwerte, gleichzeitige und abbrechbare Vorbereitung, empfängererhaltende Annahme, genau eine Annahme-Abrechnung und Fehleraggregation. Session-Tests pinnen die Default-off-Policy, die explizite full-first/suffix-later-Zustellung, direkte vollständige Event-Envelope unabhängig von Basis-Body-Nachrichten, inkrementelles Wasserzeichen-Folding, persistierte Neustart-Wiederherstellung, Fork-Identitätsabgrenzung, Annahme außerhalb der Reihenfolge und spätes Laden von Invarianten. Paketbestands-Tests pinnen Default-on- und explizite-off-Policies, Host- und stehende-Preset-Erkennung, konfligierende Loader-Auflösungsbasen, manifest-Auflösung, Lifecycle-Filterung und exakte Name/Version-Reihenfolge. Der direkte adapter-mock beweist Pre-HTTP-Vorbereitungsfehler, Abbruch, Nicht-2xx-Nichtannahme, 2xx-Annahme vor einem späteren Stream-Fehler und Feldkollision. Die schlüssellose Wiedergabe pinnt die Post-2xx-Erweiterungsannahme, und die TypeScript-JSON-RPC- plus Python-Packaged-Runtime-Snapshots projizieren das Annahmeereignis durch beide SDKs. Die reale Loader-Komposition pinnt Standard-Paketmetadaten plus Opt-in-Session-Upload, ein Real-API-Request mountet beide ausgelieferten Erweiterungen und beweist, dass der offizielle Endpunkt sie akzeptiert, und pi-ai-Tests behalten ihre unveränderten Protokoll-Requests.

## Erwogene Alternativen

**Generische Metadaten zu `GenerateOptions` oder `ctx.llm` hinzufügen.** Abgelehnt, weil die Werte und das Annahme-Timing DeepSeek-Protokollsemantik sind; ein provider-neutraler Request würde jeden adapter zwingen, fremde Felder zu verstehen oder zu ignorieren.

**Die beiden Produzenten fest in `llm-deepseek` verdrahten.** Abgelehnt, weil der adapter Session-, Loader-, Preset-, Paket-manifest- und Cursor-Logik importieren würde. Die registry hält den Transport nur für Feld-Merge und HTTP-Annahme verantwortlich.

### Warum keine request-relativen Nachrichtenreferenzen?

Eine rekursive getaggte Darstellung könnte exakte Event-String-Bereiche durch Pfade und UTF-8-Byte-Offsets in die `messages` des enthaltenden Requests ersetzen. Die Messung nutzte Node v24.16.0 auf macOS arm64 und die drei größten verfügbaren lokalen Zstandard-Session-Artefakte, deren komprimierte Artefaktgrößen 2.437.052, 572.602 und 118.811 Bytes betrugen. Die Late-Enable-Wiedergabe nutzte jede letzte abgeschlossene Request-Grenze; die eingeschwungene Wiedergabe deckte 411 abgeschlossene Grenzen ab. Die Byte-Zahlen umfassen vollständige minifizierte DeepSeek-Requests.

| Wiedergabe | Rohes JSON | Referenziertes JSON | Ersparnis | Synchrone Encoder-Zeit |
|---|---:|---:|---:|---:|
| Late enable | 29,668,725 B | 27,645,825 B | 6.82% | 500.1 s total |
| Steady state | 389,295,815 B | 387,180,848 B | 0.54% | 285.0 s total |

Die drei Late-Enable-Aufrufe dauerten 470,5, 29,4 und 0,158 Sekunden. Nur 701 von 115.071 Ereignissen (0,61 %) wählten Referenzen. Ein hypothetischer gzip-Vergleich auf Level 6 des gesamten Requests reduzierte die rohen Request-Bytes um 89,38 % für Late Enable und 73,42 % für den eingeschwungenen Zustand; Nachrichtenreferenzen fügten nach gzip 21,68 % bzw. 0,59 % hinzu.

Der Empfänger müsste außerdem den getaggten Baum durchlaufen, Pfade in die exakten Request-Nachrichten auflösen, UTF-8-Bereiche validieren und jedes referenzierte Ereignis rekonstruieren. Selbst wenn man diese Empfängerkosten als null annimmt, rechtfertigen die Byte-Ersparnis im eingeschwungenen Zustand, die synchronen Senderkosten und die Abhängigkeit von einem weiteren Request-Feld kein versioniertes Protokollformat.

### Warum keine Assistant-Chunks oder überlappende Event-Daten weglassen?

Etwa 98 % der gemessenen v1-Real-Session-Ereignisse waren `assistant/chunk`. Sie nach der Referenzkodierung wegzulassen, reduzierte das vollständige Identitäts-JSON um weitere 84,79 % für Late Enable und 6,49 % für den eingeschwungenen Zustand, verhinderte aber eine verlustfreie Rekonstruktion und ließ die Nachrichtenherkunft unverbunden. V2 bettet kompakte Streams in Attempt-Abrechnungen ein; `dsh_session_log` sendet weiterhin jedes aktuelle kanonische Ereignis vollständig und lässt diese eingebetteten Datensätze nicht weg. Fuzzy- oder normalisierte Ersetzungen haben denselben Rekonstruktionsdefekt.

**Den Upload-Cursor nur im Speicher halten.** Abgelehnt, weil ein normaler Prozessneustart die gesamte Session erneut senden würde. Ein kanonisches Annahmeereignis macht die Neustart-Wiederherstellung best-effort-dauerhaft ohne ein weiteres Speicher-Backend; das verbleibende Absturzfenster erzeugt erlaubte Duplikate.

**Jeden live Cordis-fiber inventarisieren.** Abgelehnt, weil programmatische und In-Memory-fibers keine autoritative npm-Paketherkunft haben. Loader-gestützte Host- und Preset-Einträge liefern eine exakt auflösbare Paketidentität.

**Eine prozessglobale Liste cachen oder sie per TTL ablaufen lassen.** Abgelehnt, weil eine unveränderliche Liste für den Loader-Lifecycle und pro-Session-Presets falsch ist, während ein TTL stale-Metadaten zwischen Ablaufgrenzen zulässt. Das zurückgestellte Epochen-Design invalidiert stattdessen beim autoritativen Aktivzustandsübergang.

**Das vollständige Feld durch einen Content-Hash oder eine serverseitige Bestandsreferenz ersetzen.** Abgelehnt, weil dies die eigenständige Request-Rekonstruktion ändert und Endpunktzustand plus eine spätere Protokollversion erfordert. Das ist eine Protokoll-Byte-Änderung, keine Berechnungs-Cache-Optimierung.

## Konsequenzen

Offizielle DeepSeek-Requests tragen aktive Paketversionen zu ihrer aufgelösten `baseURL`, einschließlich konfigurierter Gateways. Ein explizites Session-Log-Opt-in trägt außerdem das vollständige neu unbestätigte Session-Suffix. Die Felder sind modellverborgen und fügen weder Prompt-tokens noch KV-Cache-Änderungen hinzu, können aber die HTTP-Body-Größe erheblich erhöhen. manifest-Auflösung, Feldkollision, Annahme-Logging oder provider-schema-Ablehnung lassen den Modell-Request fehlschlagen, statt Metadaten still zu verwerfen.

Das `delivery-accepted`-Ereignis wird Teil des kanonischen Logs und wird selbst bei einem späteren Request zugestellt. Die Absturzwiederherstellung kann ein Suffix duplizieren, leitet aber keine Annahme aus Assistant-Ausgaben ab und erzeugt keinen zweiten lokalen Cursor-Speicher. Direkte Aufrufe ohne live Session lassen das Session-Feld weg; die Host-Paketbestandsaufnahme bleibt verfügbar.

Die [DeepSeek-Request-Identitätsentscheidung](../feature/2026-08-11-deepseek-request-user-id-header.de.md) bleibt Eigentümerin der user/session-Header, die außerhalb des Bodys bleiben. Die [Session-Telemetrie-Entscheidung](../feature/2026-07-23-session-telemetry-otel-revival.de.md) bleibt aktuell, bis eine separate Änderung diesen seam und das Backend entfernt; dieser Request-Pfad verändert weder die OTel-Erfassung noch die Sharing-Modi.
