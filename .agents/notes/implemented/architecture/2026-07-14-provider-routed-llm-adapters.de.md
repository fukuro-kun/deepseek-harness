# Agent Note: Provider-geroutete LLM-Adapter und ein generisches pi-ai-Backend
[English](2026-07-14-provider-routed-llm-adapters.md) | [中文](2026-07-14-provider-routed-llm-adapters.zh.md) | Deutsch

Status: implemented


## Problem

`dsh-llm` registrierte Adapter per exaktem Modellnamen. Ein Plugin lieferte beim Cordis-Startup eine Modellliste, `LlmRuntime` speicherte einen Adapter pro gelistetem String, und `GenerateOptions.model` wählte Adapter und Provider-Modell zugleich. Das funktionierte, solange beide ausgelieferten Adapter dieselben zwei DeepSeek-Modelle ansteuerten, vermischte aber zwei unabhängige Entscheidungen: welcher Upstream-Provider einen Request besitzt und welches Modell dieser Provider ausführen soll.

Die Vermischung verhindert, dass ein Provider-Gateway einen offenen Modellkatalog bedienen kann. OpenRouter beispielsweise ist ein Provider mit vielen Modell-IDs, während ein privater OpenAI-kompatibler Endpoint Modelle hinzufügen kann, ohne den Harness-Plugin-Baum zu ändern. Jedes neu gewählte Modell muss derzeit schon beim Plugin-Startup registriert worden sein. Dieselbe Modell-ID kann zudem bei mehreren Providern existieren, sodass reine Modell-Registrierung nicht aussagen kann, welchen Provider der Caller meinte.

`dsh-llm-pi-ai` exponierte nichts von pi-ais Provider-Abstraktion. Es konstruierte ein inline DeepSeek-`openai-completions`-Modell, wendete DeepSeek-spezifische Payload-Patches an und stempelte jede replayte Assistant-Message als DeepSeek. pi-ai selbst hat einen Provider-/Modell-Katalog, wählt APIs wie `openai-responses`, `anthropic-messages` und `google-generative-ai` und bewahrt provider-spezifische Response-IDs und Reasoning-/Tool-Signaturen für spätere Turns. Die Harness-Konvertierung ließ die Provider-/Modell-Route und die Provider-Response-Felder fallen — ein bloßer Ersatz des Inline-Modells durch einen Katalog-Lookup hätte Same-Model-Replay und Cross-Provider-Handoff also unvollständig gemacht.

Die Adapter-Konfiguration setzt außerdem einen einzigen DeepSeek-API-Key und -Endpoint voraus. Ein generisches Backend braucht unabhängige Credentials und Endpoint-Overrides pro Provider, während AWS, Google ADC, OAuth und andere ambient Auth-Mechanismen bei pi-ai bleiben.

## Entscheidung

### Provider ist der Adapter-Registrierungs-Key

`GenerateOptions` und `LlmCallConfig` tragen `provider: string` neben `model: string`; `AgentOptions` trägt das entsprechende optionale Creation-Feld. Ein Loop-Request ist erst gültig, wenn beide Werte nicht-leer sind, und beide Werte sind Teil des geloggten Request-Headers. `agent/request` darf an jedem Step ein Ersatzpaar zurückgeben, sodass eine Session Provider und Modelle wechseln kann, ohne den Cordis-Plugin-Lifecycle zu ändern.

`LlmRuntime` registriert und resolved Adapter per Provider. `registerAdapter(providers, adapter)` prüft die gesamte Provider-Liste, bevor es die Registry mutiert, rejected ein Duplikat mit `DUPLICATE_ADAPTER` und dispost die ganze Registrierung als einen Effect. Modell-IDs sind keine Registrierungs-Keys; der gewählte Adapter validiert oder forwarded sie weiterhin. Die spätere [LLM-Katalog- und ACP-Selection-Agent-Note](../../archived/architecture/2026-07-15-llm-model-catalog-and-acp-selection.md) fügte advisory `listProviders()`-/`listModels()`-Discovery hinzu, ohne Modell-Membership zur Request-Validierung zu machen.

Ein Provider hat exakt einen Adapter-Owner in einem Cordis-Context. `dsh-llm-deepseek` registriert `deepseek`; `dsh-llm-pi-ai` darf ebenfalls `deepseek` registrieren, aber das Laden beider Owner ist ein Konfigurationsfehler, keine Ordering-Regel oder ein Fallback. Ein Deployment, das die handgeschriebene DeepSeek-Implementierung will, schließt `deepseek` aus den pi-ai-Profilen aus. Ein Deployment, das pi-ais DeepSeek-Implementierung will, mountet `dsh-llm-deepseek` nicht.

`dsh-llm-deepseek` entfernt seine Modell-Registrierungsliste und akzeptiert jeden über Provider `deepseek` gerouteten Modell-String. Seine Request-Serialisierung, der `/chat/completions`-Endpoint, Thinking-Optionen, SSE-Parsing und Fehlerverhalten bleiben unverändert; `options.model` wird weiterhin wörtlich gesendet.

### Explizite pi-ai-Provider-Profile

`dsh-llm-pi-ai` nimmt genau eine nicht-leere Liste von Provider-Profilen entgegen. Provider-Namen müssen innerhalb der Liste eindeutig und in pi-ais `getProviders()`-Ergebnis vorhanden sein. Jedes Profil enthält den Provider-Namen plus optionale `apiKey`, `baseURL`, Headers, Reasoning-Level und -Budgets, Cache-Retention, Transport, SDK-Timeouts, ein Harness-Stream-Idle-Timeout und eine provider-eigene `retryPolicy`. Der Adapter zwingt pi-ais `maxRetries` auf null, sodass ein `stream()`-Call genau einen sichtbaren Provider-Versuch macht, während `dsh-llm-retry` die resolved Policy am Agent-Failed-Step-Extension-Point ausführt. Credentials sind niemals global: Ein expliziter Key gilt nur für sein Profil, während ein fehlender Key pi-ai seine Standard-Umgebungsvariable, sein OAuth-Token, die AWS-Credential-Chain, Google ADC oder eine andere provider-native ambient Auth auflösen lässt. Ein explizit leerer Key ist ungültige Konfiguration, kein Environment-Fallback.

Das Plugin registriert die konfigurierten Provider-Namen in einem atomaren Call gegen einen `PiAiAdapter`. Jeder immutable Request-Snapshot kombiniert die effektiven Profile und ihre bedienbaren Modelldeskriptoren. Katalog-externe Modelle erfordern ein explizites oder ableitbares Protokoll und einen Endpoint. Gespeicherte Katalog-Fehler bleiben sichtbar und reparierbar gemäß der [Settings-Catalog-Recovery-Entscheidung](../bug-fix/2026-09-07-pi-ai-settings-catalog-recovery.de.md), während Writes geänderte Provider validieren und Requests das gewählte fehlerhafte Modell vor Netzwerk-I/O ablehnen.

Der Adapter ruft pi-ais `streamSimple()` auf, sodass jedes Katalog-Modell seine registrierte API-Implementierung wählt — einschließlich OpenAI Responses statt Chat Completions, wo der Deskriptor `openai-responses` sagt. Harness-Temperature, Max-Tokens, Signal, Session-ID und die gemeinsamen Stream-Optionen des Profils fließen direkt durch. Profil-Headers mergen mit den obligatorischen Harness-Attribution-Headers, wobei die Harness-Attribution ihre reservierten Namen gewinnt. Der Adapter pflegt keine DeepSeek-spezifischen Payload-Rewrites und keine Provider-Protokoll-Matrix mehr.

pi-ais gemeinsame Stream-Optionen exponieren keine Stop-Sequences. `dsh-llm-pi-ai` rejected eine definierte Harness-`stop`-Option mit `UNSUPPORTED_OPTION`, statt sie still zu ignorieren oder eine zweite provider-spezifische Payload-Implementierung wachsen zu lassen. `dsh-llm-deepseek` unterstützt `stop` weiterhin über seinen nativen Request-Serializer.

### Aufgezeichnete Assistant-Route und Replay-State

Assistant-Messages tragen `provider` und `model` des Requests plus einen optionalen JSON-serialisierbaren Adapter-Replay-State. Ein erfolgreiches `assistant/message`-Session-Event zeichnet diese Felder auf, und `deriveMessages()` gibt sie mit der Assistant-Message zurück. User-, System-, Context- und Tool-Result-Messages tragen keine Assistant-Route-Felder. Die Provider-/Modell-Felder sind autoritative Loop-Daten; ein Adapter besitzt nur sein opakes Replay-State-Payload.

Ein terminales erfolgreiches `finish`-Chunk darf Replay-State als `ReplayEnvelope` tragen: opake Response-Level-Metadaten plus optionale Per-Block-Einträge, ausgerichtet auf die emittierte Block-Sequenz. `BlockAssembler` trifft eine Keep-/Drop-Entscheidung für Content und Metadaten — wenn Max-Token-Assembly einen Tool-Call droppt, verliert der Envelope den Eintrag an derselben Position — sodass der State, den der Loop an die Model-Source der assemblierten Assistant-Message hängt, immer die gespeicherten Blöcke beschreibt, gemäß der [Max-Token-Replay-State-Alignment-Entscheidung](../../archived/bug-fix/2026-08-15-max-token-replay-state-alignment.md). Der Loop exponiert keinen Response-Rewrite-Hook. Fehler- und abgebrochene Responses erzeugen keine normale Assistant-Message und gehen daher nicht in die künftige Modell-History ein.

Der pi-ai-Replay-State füllt diesen Envelope mit einer versionierten minimalen Projektion seiner erfolgreichen `AssistantMessage`: eine Response-Hälfte (Source-API/Provider/Modell, Response-ID/Modell, optionaler provider-nativer Effort, Stop-Reason) und Per-Block-Text-, Thinking- und Tool-Call-Signaturen. Die [pi-ai-Upgrade-Kompatibilitätsentscheidung](../bug-fix/2026-09-05-pi-ai-upgrade-compatibility.de.md#decision) definiert angeforderte versus native Anthropic-Modell-Identität und Effort-Bewahrung. Er dupliziert weder Text noch Tool-Argumente, die Harness-Content-Blöcke bereits tragen, und lässt Diagnostik, Timestamps, Usage und Fehler weg. Bei einem späteren Request gibt `LlmRuntime` Replay-State nur dann an den Ziel-Adapter, wenn der historische Provider und der Ziel-Provider aktuell derselben Adapter-Instanz gehören. Jener Adapter kombiniert den geloggten Harness-Content mit Replay-State, wenn er die historische Response wiederherstellen kann, und besitzt jede nötige Cross-Model- oder Cross-Provider-Konvertierung. Durabler Content bleibt autoritativ: Ein Adapter, der Replay-State erhält, den er nicht nutzen kann — unbekannte Art oder Version, fehlerhafte Metadaten oder eine Block-Form, die nicht mehr zum Content passt — degradiert jene Message zu provider-neutraler Konvertierung mit einer Diagnose; ein anderer Adapter erhält nur provider-neutralen Content plus Provider-/Modell-Felder.

Dieser State ist modell-sichtbarer Replay-Input und folgt daher der bestehenden [Rekonstruierbarer-Request-Regel](2026-07-05-reconstructable-requests.de.md): Er ist sowohl im terminalen `finish`-Chunk als auch in der `assistant/message`-Model-Source vorhanden, die die Derivation treibt. Resume und Fork bewahren ihn wörtlich. Compaction, die die Assistant-Message shadowt, entfernt auch ihren Replay-State von der aktiven Oberfläche; die Zusammenfassung ist gewöhnlicher provider-neutraler Content.

### Das Ziel durch jeden Request-Producer propagieren

Jeder Modell-Selection-Pfad trägt Provider und Modell gemeinsam: deklarative Agents, ACP- und Stdio-App-Config, der JSON-RPC-Initialize-Request, Subagent-Overrides und -Vererbung, Workflow-Child-Overrides und direkte Compaction-Summarization. Subagents erben beide Felder von ihrem Parent, bevor Request-Overrides greifen. Das System-Prompt-Variablen-Set gewinnt `provider` neben `model`.

Compaction-Konfiguration gewinnt `summarizationProvider` neben `summarizationModel`. Beide sind leer zum Erben oder beide nicht-leer zur expliziten Zielwahl; ein halb konfiguriertes Paar schlägt beim Laden fehl. Vererbung nutzt das letzte geloggte Request-Ziel, falls vorhanden, und fällt sonst auf die Creation-Optionen des Agent zurück. `compaction/summary` zeichnet beide Felder mit dem bestehenden Modell-Call-Envelope auf.

Die JSON-RPC-Runtime erhält Provider und Modell explizit. Ihr Convenience-Fallback mountet `dsh-llm-deepseek` nur für Provider `deepseek`, wenn jener Provider keinen registrierten Owner hat; andere fehlende Provider schlagen fehl, ohne einen Adapter zu raten.

Die aktuelle Seed-/Load-Validierung lehnt Request-Header und Assistant-Messages ab, denen Pflicht-Provider-/Modell-Felder fehlen. Die eingefrorene v0-zu-v1-Edge verlangt vor der Migration dieselbe rekonstruierbare Routing-Identität; sie rät niemals einen fehlenden Provider oder ein fehlendes Modell, und fehlerhafte Formen werden vor der Veröffentlichung abgelehnt.

## Erwogene Alternativen

**Modellnamen als Registry-Keys behalten und Wildcard-Adapter hinzufügen.** Ein Wildcard führt Fallback-Ordnung zwischen exakten Registrierungen und Catch-All-Plugins ein, macht doppelte Ownership von Listener-Reihenfolge abhängig und kann dasselbe Modell-ID bei zwei Providern weiterhin nicht ohne eine weitere Konvention unterscheiden.

**Provider und Modell in einen String kodieren.** Werte wie OpenRouters `openai/gpt-*` enthalten bereits provider-artige Präfixe und Slashes. Eine Delimiter-Konvention würde Routing-Syntax in jeden Modell-Selektor lecken und Escaping-Regeln erfordern; zwei explizite Felder sind eindeutig und unabhängig loggbar.

**`backend + provider + model` hinzufügen.** Ein Backend-Key erlaubte das Koexistieren von `dsh-llm-deepseek` und pi-ais DeepSeek-Implementierung mit Per-Request-Wechsel. Die akzeptierte Deployment-Regel ist stattdessen ein Adapter-Owner pro Provider: Implementierungen desselben Upstream sind Alternativen, die per Plugin-Komposition gewählt werden. Eine dritte Routing-Dimension würde jeden Request und jede Konfiguration für eine Capability ohne aktuellen Consumer belasten.

**`dsh-llm-pi-ai` automatisch jeden pi-ai-Provider registrieren lassen.** Das würde ambient Credentials und Provider-Namen beanspruchen, die das Deployment nie exponieren wollte, und mit nativen Adaptern wie `dsh-llm-deepseek` konfligieren. Explizite Profile machen Capability- und Credential-Umfang reviewbar.

**Eine pi-ai-Plugin-Instanz pro Provider mounten.** Separate Instanzen isolieren Config, wiederholen aber Plugin-Deklarationen und können Profil-Registrierung nicht atomar machen. Ein Adapter erhält den Provider ohnehin bei jedem Request — eine validierte Profil-Map ist daher die kleinere Lifecycle-API.

**Beliebige inline pi-ai-Modelldeskriptoren akzeptieren.** Das würde katalog-externe private Modell-IDs unterstützen, exponierte aber pi-ais Modell- und Kompatibilitäts-Schema als Harness-Konfiguration und machte den Adapter für die Validierung protokollspezifischer Kombinationen verantwortlich. Die erste Version unterstützt Custom-Endpoints durch Überschreiben von `baseURL` auf Katalog-Modellen; Custom-Deskriptoren erfordern eine separate Entscheidung, sobald ein reales katalog-externes Deployment identifiziert ist.

## Konsequenzen

- Provider-Namen sind deployment-weite Route-Ownership-Keys: Zwei Provider dürfen denselben Modell-String nutzen, aber das Mounten zweier Adapter für einen Provider schlägt beim Laden fehl, statt Fallback-Ordnung zu schaffen.
- Modell-Selection ändert den Cordis-Plugin-Graphen nicht mehr. Katalog-gestützte Adapter können jedes nach dem Startup gewählte installierte Katalog-Modell akzeptieren, während der native DeepSeek-Adapter beliebige DeepSeek-Modell-IDs forwarded.
- Eine custom `baseURL` bewahrt Protokoll und Capabilities des gewählten Katalog-Modells; sie macht katalog-externe Modell-IDs nicht gültig. Private Endpoints müssen das Protokoll jenes Katalog-Eintrags implementieren.
- pi-ai-Credentials, Transport-Optionen, SDK-Timeouts und der `streamIdleTimeoutMs`-Watchdog mit Fünf-Minuten-Default sind pro Provider-Profil scoped. Versteckte Provider-Retries sind deaktiviert; begrenzte Retries gehören der separat komponierten Agent-Recovery-Policy.
- `dsh-llm-pi-ai` rejected Stop-Sequences, weil pi-ais gemeinsame Stream-API sie nicht ausdrücken kann; der native DeepSeek-Adapter behält seine Stop-Unterstützung.
- Replay-State ist nur innerhalb der Adapter-Instanz portabel, die sowohl den historischen als auch den Ziel-Provider besitzt. Cross-Provider- und Cross-Model-Wiederherstellung ist Adapter-Verantwortung, und ein anderer Adapter erhält provider-neutrale History ohne den opaken State.
- Aktuelles Session-JSONL verlangt Provider/Modell auf Request-Headern und Assistant-Messages. Die v0-Edge migriert nur eingefrorene Formen, die bereits rekonstruierbare Request-Identität tragen.

## Tests

- Unit-Coverage übt Registry-Konflikte, Request-Rekonstruktion, Session-Validierung, Profil-Auflösung, Single-Attempt-Option-Forwarding, native API-Auswahl einschließlich OpenAI Responses, Konvertierung, Replay-Validierung, Error-Mapping, Caller-Cancellation, Idle-Timeout-Transport-Beendigung, Content-Rewrites und Same-Instance- versus Different-Instance-Replay-Dispatch.
- Keyless Loop-/Session-Tests und ACP-Snapshots üben durable Provider-/Modell-Metadaten, Resume- und Fork-Propagation, Workflow-/Subagent-Overrides und unveränderte nutzersichtbare Transcripts; der Key-gated DeepSeek-e2e behält echte Provider-Streaming- und Tool-Follow-up-Coverage.
- Öffentliches JSDoc, Package-READMEs, Architecture- und Subsystem-Docs, generierte Kataloge, Beispiele, Session-Fixtures und Python-SDK-Paare nutzen Provider-/Modell-Ziele konsistent und werden durch die Dokumentations- und Type-Equivalence-Gates des Repository geprüft.

## Risiken

Das war bei Einführung ein repo-weiter API-Break: reine Modell-Request-Konstruktion, Adapter-Registrierung, App-Protokolle, Fixtures und persistierte v0-Event-Formen änderten sich gemeinsam, ohne Kompatibilitäts-Aliase. Freigegebene historische Recovery gehört nun der benachbarten Session-Format-Edge. Die Provider-Exklusivitätsregel verhindert bewusst, dass zwei Implementierungen desselben Upstream in einem Context koexistieren. Ein pi-ai-Dependency-Update kann den akzeptierten Provider-/Modell-Katalog ändern — Lockfile und Adapter-e2e-Matrix definieren daher die getestete Menge. Custom-`baseURL`-Endpoints erben die Protokoll-Annahmen des gewählten Katalog-Modells und können einen inkompatiblen Proxy nicht reparieren. Katalog-externe Modelldeskriptoren und multimodaler Content bleiben ununterstützt. pi-ai-Replay-State kann opake verschlüsselte Reasoning-Signaturen enthalten; er wird persistiert, weil der Provider ihn für Kontinuität verlangt, wird aber niemals außerhalb des bestehenden Session-Records gerendert oder geloggt.
