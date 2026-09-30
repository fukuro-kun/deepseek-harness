---
description: "Der pi-ai-gestützte Multi-Provider-Adapter für Nutzer und Maintainer, die den Harness-LLM-Dienst über pi-ai-Kataloge und handdeklarierte Gateways routen."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-pi-ai

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`@deepseek-ai/dsh-llm-pi-ai` routet Modellanfragen aus einer Konfiguration heraus zu mehreren pi-ai-Providern, OpenAI-kompatiblen Gateways oder selbst gehosteten Servern. Installierte pi-ai-Provider liefern Endpoint-, Protokoll- und Modellkatalog-Defaults; eigene Routen können diese Werte ohne Codeänderung deklarieren. Profile und Credentials werden pro Request aufgelöst, sodass Settings-Änderungen beim nächsten Request ohne Neustart greifen. Unterstützte Provider können gespeichertes OAuth oder interaktive Key-Anmeldung mit prozessübergreifendem Refresh-Lock nutzen. Das Paket kann ohne Routen starten und aktiviert sich, sobald User-Settings Routen hinzufügen.

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

Mounte dieses Plugin, wenn eine Komposition Modellanfragen über pi-ais Provider-Kataloge oder über Gateways routet, die der installierte pi-ai-Katalog nicht beschreibt. Das `providers`-Dictionary ist die gesamte Konfigurationsoberfläche: Jeder Key ist der Provider-Routenname, den ein Request mit `GenerateOptions.provider` auswählt.

### Wann einsetzen

Wähle diesen Adapter, wenn dieselbe Komposition mehrere Provider bedient, eine Route pi-ais Katalog-Defaults mit wenigen korrigierten Feldern braucht oder ein handdeklariertes Gateway über eigenen Endpoint und eigenes Protokoll erreicht werden muss. Wähle `dsh-llm-deepseek` für die direkte DeepSeek-Route, wenn das Deployment keinen anderen Provider braucht. Beide Adapter können gemeinsam gemountet werden, weil ihre Routennamen nicht kollidieren; eine Route zu registrieren, die ein anderer Adapter bereits besitzt, lässt das Plugin-Loading fehlschlagen.

### Provider-Routen konfigurieren

Jedes Profil kann eine `retryPolicy` setzen; ohne Angabe gilt der Normalmodus mit fünf Retries. `apiKeyEnv` ist eine Credential-Referenz, die pro Request über die Harness-Credential-Seam aufgelöst wird — so landet kein Secret in der Konfigurationsdatei; eine Referenz, die zu nichts auflöst, lässt den Request mit `MISSING_CREDENTIAL` fehlschlagen. Ohne Angabe bleibt die Route konfiguriert-aber-keyless, was bei einer installierten Katalog-Route an pi-ais providernative Ambient-Discovery delegiert.

```yaml
- name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      openai:
        apiKeyEnv: OPENAI_API_KEY
        baseURL: https://proxy.example.com:8443
        reasoning: high
        requestImagePixelBudget: 4194304 # total pixels; 2048 by 2048 default
        requestImageMaxBytes: 1048576    # raw bytes before base64 expansion
        maxRequestImageBytes: 20971520   # accumulated base64 payload
        retryPolicy:
          mode: normal
          maxRetries: 3
      anthropic:
        apiKeyEnv: ANTHROPIC_API_KEY
        models:
          - id: claude-sonnet-4-5
            contextWindow: 200000
      acme-gateway:
        displayName: Acme Gateway
        apiKeyEnv: ACME_GATEWAY_API_KEY
        api: openai-completions
        baseURL: https://gateway.acme.example/v1
        compat:
          thinkingFormat: deepseek
        models:
          - id: acme-think
            name: Acme Think
            contextWindow: 262144
            reasoningEfforts:
              off:
              high: high
```

| Feld | Default | Bedeutung |
|---|---|---|
| `apiKeyEnv` | — | Credential-Referenz, pro Request aufgelöst; ohne Angabe Delegation an pi-ai Ambient Discovery |
| `displayName` | Providername | Label auf Selektor-Oberflächen |
| `api` | Katalog-Protokoll | Wire-Protokoll; nur nötig für Routen, die der Katalog nicht liefert |
| `baseURL` | Katalog-Endpoint | Endpoint jedes Modells der Route |
| `models` | installierter Katalog | Ersetzt den Routen-Katalog vollständig; jeder Eintrag erbt Defaults vom installierten Modell |
| `modelOverrides` | keine | Formt einzelne Katalog-Modelle um, ohne den Rest zu ersetzen |
| `compat` | Katalog-Erkennung | Wire-Kompatibilitäts-Schalter für unbekannte Endpoints |
| `defaultContextWindow` | `262,144` | Kapazitäts-Fallback für unbeschriebene Modelle |
| `defaultMaxTokens` | `32,768` | Output-Cap-Fallback für unbeschriebene Modelle |
| `requestImagePixelBudget` | `4,194,304` | Gesamtpixel-Budget pro deterministischem Request-Bild |
| `requestImageMaxBytes` | `1 MiB` | Byte-Ziel pro Request-Bild vor Base64-Expansion |
| `maxRequestImageBytes` | `20 MiB` | Gesamt-Bindgrenze für Base64-Bildpayload mit Älteste-zuerst-Offload |
| `retryPolicy` | normal, 5 Retries | Providereigene Retry-Policy, ausgeführt von `dsh-llm-retry` |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-llm-pi-ai) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Bei einem Provider anmelden

Ein Provider, für den pi-ai einen Login mitliefert, kann über die Harness-Authorization-Seam angemeldet werden: Der Flow bietet OAuth oder einen interaktiven Key-Prompt (ein Key wird in pi-ais eigenem Login-Prompt eingegeben, nicht in das Settings-Formular), und die resultierende Credential wird im Harness-Credential-Store unter `llm-pi-ai/<provider id>` abgelegt. Die gespeicherte Anmeldung authentifiziert ihre Route unterhalb jeder `apiKeyEnv`-Überschreibung und aktualisiert sich unter der prozessübergreifenden Sperre des Stores; Abmelden löscht den gespeicherten Datensatz. Ein handdeklarierter Route-Key außerhalb der Record-Grammatik — ein lowercase-hyphenated Identifier — kann nicht angemeldet werden, weil ein Record-Write dafür mit `LlmError('UNSTORABLE_PROVIDER_ID')` abgelehnt wird; so eine Route authentifiziert stattdessen über `apiKeyEnv` oder umgebungsabhängige Provider-Einstellungen.

### Den Modellkatalog auflösen

Die `models`-Liste eines Profils ersetzt den installierten Katalog der Route, statt ihn zu erweitern; jeder Eintrag befüllt ungesetzte Felder aus dem installierten Modell gleicher ID, sodass eine Route auf zwei Modelle einzuschränken, eine Kapazität zu korrigieren oder ein neueres Modell als der installierte Katalog hinzuzufügen Einzeilen-Änderungen sind. `modelOverrides` formt einzelne Katalog-Modelle ohne diesen Preis um — ein Modell korrigieren, die anderen siebenunddreißig behalten — und wird abgelehnt, wenn es neben einer `models`-Liste, auf einer handdeklarierten Route oder für ein Modell gesetzt wird, das der Katalog nicht beschreibt, weil ein still unverändertes Modell ein Tippfehler wäre, den später jemand sucht.

### Mit Reasoning und Draht-Kompatibilität laufen

`reasoningEfforts` deklariert die wählbaren Denkstufen eines Modells: Jeder Key ist eine Stufe, die Selektoren anbieten, sein Wert die Schreibweise, die Dispatch auf den Wire schickt — `max: ultra` benennt also eine Stufe für ein Gateway mit eigenem Vokabular um. Ohne das Feld bleibt die Capability des Katalogeintrags; `false` deklariert ein Non-Reasoning-Modell. `compat`-Schalter formen den Request für Endpoints um, die pi-ai nicht erkennt — welche Rolle den System-Prompt trägt, welches Feld den Output deckelt, wie eine Denkstufe transportiert wird — konfigurierbar pro Route und pro Modell. Ein Modell, das weder der Eintrag noch der installierte Katalog bemaßt, bekommt die `defaultContextWindow`- und `defaultMaxTokens`-Fallbacks der Route.

Für selbst gehostete Chat-Completions-Endpoints wählt `thinkingTokenBudgetField` den Reasoning-Budget-Parameter, und `vllmPriority` setzt eine Integer-Scheduler-Priorität, wenn der Server Priority-Scheduling aktiviert hat. Template-Argumente akzeptieren `$var: thinking.budget`. `openai-responses`-Gateways können `supportsMaxOutputTokens: false` setzen, um `max_output_tokens` wegzulassen; Azure- und Codex-Transports ignorieren dieses geteilte Kompatibilitätsfeld. Diese Steuerungen sind Opt-in; katalogeigene Anthropic-Effort- und Fallback-Capabilities sind keine konfigurierbaren Schalter.

### Konfiguration zur Laufzeit ändern

Profile werden einmal pro Operation über die optionale Settings-Seam neu gelesen: Die Basis und die `llm-pi-ai:`-Settings-Sektion des Users mergen pro Provider, sodass ein User eine Route hinzufügen, ein Feld einer Kompositions-Route überschreiben oder eine Route auf einen anderen Proxy zeigen kann — alles wirksam beim nächsten Request ohne Neustart. Eine Sektion, die der Adapter nicht bedienen kann, wird dort abgelehnt, wo sie geschrieben wird — `settings.mutate` antwortet `settings-rejected` — und eine gespeicherte Sektion, die später fehlschlägt, behält den letzten guten Wert des Namespace. Wenn sich die Routenmenge oder die Retry-Policy einer Route ändert, registriert das Plugin atomar neu: Eine kollidierende Route lässt die bisherigen Routen im Dienst.

<a id="discover-models-from-endpoints"></a>
### Modelle von Endpoints entdecken

Das Plugin beantwortet „welche Modelle kann dieser Provider bedienen?" für eine Route, die eine Konfigurationsoberfläche gerade editiert oder entwirft. Eine Route, die der installierte Katalog mitliefert, wird aus diesem Katalog ohne Netzwerkcall beantwortet; nur eine Route, die der Katalog nicht beschreibt, wird über den Wire befragt. `openai-completions` und `openai-responses` nutzen `GET {baseURL}/models` mit Bearer-Auth, während `anthropic-messages` natives `GET /v1/models?limit=1000` mit `x-api-key` und `anthropic-version` verwendet; dessen Listing-URL akzeptiert die API-Root mit oder ohne abschließendes `/v1`, weil Gateway-Dokumentation beide Schreibweisen publiziert, und nur diese Listing-URL normalisiert das Segment, sodass Modellrequests die konfigurierte `baseURL` unverändert erhalten. Eine benannte konfigurierte Route liefert ihre gespeicherte Credential und Profil-`headers` im Host, sodass per `settings.yaml` oder Cordis-Config gesetzte Deployment-Header die Modelldiscovery erreichen, ohne Discovery-Request- oder Models-Page-Felder zu werden; ein ins Formular getippter Key gewinnt weiterhin gegen die gespeicherte Credential. Der Parser akzeptiert sowohl das Standard-`data`-Array als auch eine angereicherte `models`-Map und normalisiert ID, Anzeigename, Context Window und Output-Token-Cap jedes Kandidaten; Anthropics `max_input_tokens` und `max_tokens` speisen dieselben Kapazitätsfelder, ein Map-Key bleibt die Request-ID, selbst wenn sein Eintrag eine andere kanonische ID nennt, primitive Map-Properties werden ignoriert, und ein fehlender Anzeigename fällt auf die Request-ID zurück. Fehlt einer der beiden Kapazitätswerte im Listing, sendet Discovery zusätzlich einen Best-Effort-`GET {root}/endpoints`-Request; er nimmt das größte positive `n_ctx` über gesunde passende Einträge und füllt nur ein fehlendes `contextWindow`; `maxTokens` ergänzt er nur, wenn jeder gesunde passende Eintrag ein positives `max_tokens_cap` meldet, und verwendet dann die kleinste Obergrenze. Dieses Aggregat ignoriert momentane Slot-Zahlen, und `max_tokens_default` ist keine Obergrenze. Der Modelllisten-Request hat ein Zehn-Sekunden-Limit und die Fähigkeitsabfrage ein Drei-Sekunden-Limit; beide lehnen Redirects ab. Schlägt die Abfrage fehl, liefert die Schaltfläche trotzdem das Modell-Listing; ist `/models` unerreichbar oder läuft in den Timeout, meldet die Schaltfläche einen Discovery-Fehler, statt weiter beschäftigt zu bleiben. Die Abfrage entdeckt keine Eingabemodalitäten wie vision. Die Antwort sind Kandidaten-Metadaten, die eine Oberfläche zur Übernahme anbieten kann — nichts wird gespeichert, und `settings.yaml` bleibt die einzige Instanz, die entscheidet, was eine Route bedient.

### Fehler und Wiederherstellung

Eine Route, die pi-ai nicht mitliefert, braucht `api`, `baseURL` und eine nicht-leere `models`-Liste; ein nicht bedienbares Profil wird dort abgelehnt, wo es geschrieben wird, mit Route- und Modellname. Fehler tragen stabile Codes: Eine unbrauchbare Credential schlägt mit `INVALID_CREDENTIAL` fehl und nennt Route und Referenz, eine Route, deren `apiKeyEnv`-Referenz zu nichts auflöst, schlägt mit `MISSING_CREDENTIAL` fehl, ein nicht konfiguriertes Modell mit `UNKNOWN_MODEL`, und terminale Provider-Fehler unterscheiden `QUOTA` von vorübergehendem `RATE_LIMIT`. `GenerateOptions.stop` wird mit `UNSUPPORTED_OPTION` abgelehnt, weil pi-ais gemeinsame Streaming-UI es nicht providerübergreifend garantieren kann.

Settings-Writes validieren jeden neuen oder geänderten Provider strikt nach dem Merge aus Kompositions- und User-Layer. Bei der Namespace-Registrierung behalten gespeicherte Katalog-Fehler die Namespace- und Provider-Zeilen, mit der ersten verfügbaren Modell-Diagnose oder Route-Fehler in `LlmConfigurableProvider.error`; unveränderte fehlerhafte Provider blockieren keine Änderungen anderswo. Bedienbare Modelle bleiben wählbar, während unauflösbare Modelle in der editierbaren Konfiguration bleiben und bei direkter Anfrage mit `INVALID_CONFIG` vor jeglichem Netzwerk-I/O fehlschlagen. Reparieren oder Löschen der fehlerhaften Konfiguration räumt ihre Diagnose ab. Schema- und eigenständige Profilfehler lehnen das Laden weiterhin ab. Spätere externe Änderungen validieren geänderte Provider und behalten bei Fehlschlag die letzte akzeptierte Sektion.

`displayName`, `apiKeyEnv` oder `baseURL` zu ändern, ohne die Modellfehler des Providers aufzulösen, lässt das Speichern weiterhin fehlschlagen. Beispiel: Eine OpenRouter-Route umzubenennen, deren Modell `111` ein `api` braucht, ist allein nicht speicherbar — das Modell im selben Editor-Entwurf reparieren oder entfernen, dann die vollständige Provider-Konfiguration speichern. Zwischenständige Reparaturen bleiben im Entwurf, bis der ganze Provider validiert; andere Provider lassen sich unabhängig speichern.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt das Design hinter dem Adapter; das beobachtbare Verhalten deckt [Dieses Paket verwenden](#use-this-package) vollständig ab.

### Designphilosophie

Der Adapter baut auf immutable Snapshots und pro-Operation-Auflösung. Jede Operation erfasst vor ihrem ersten `await` einen ganzen Snapshot — die Profile plus eine `createModels()`-Sammlung mit dem `Provider`, den jede Route gebaut hat — und eine Konfigurationsänderung baut eine neue Sammlung, statt die genutzte zu verändern, sodass ein Request, der unter einer Konfiguration begann, nie unter einer anderen endet. Die eigene Credential-Referenz einer Route löst über die Harness-Seam auf und reist als `apiKey`-Option des Requests, die pi-ai als höchstprioritätiges Auth-Override behandelt — das hält die Fail-loud-Referenzsemantik. Alles, was dieses Override nicht abdeckt, erreicht pi-ai über die eigene Auth der Sammlung: Der Credential-Store hält die Records, die ein Login schrieb und ein Refresh rotiert (adressiert als `llm-pi-ai/<provider id>`), und der Auth-Context beantwortet die Umgebungsfrauen, die ein Provider beim Auflösen stellt. Beide sind über Snapshots stabil, sodass eine Konfigurationsänderung die Sammlung neu baut, ohne zu vergessen, wer angemeldet ist.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Profil-Auflösung, Settings-Wiring, Directory- und Route-Registrierung |
| [`src/auth.ts`](src/auth.ts) | Credential-Store und Ambient-Auth-Context über der Harness-Credential-Ebene |
| [`src/login.ts`](src/login.ts) | Authorization-Flows für die installierten Provider mit eigenem Login |
| [`src/config.ts`](src/config.ts) | Profil-Schema, Auflösung und Bedienbarkeits-Checks |
| [`src/catalog.ts`](src/catalog.ts) | Integration des installierten Katalogs und Drift-Gates |
| [`src/provider.ts`](src/provider.ts) | Tabelle der unterstützten Protokolle und Provider-Konstruktion |
| [`src/context.ts`](src/context.ts) | Kontextkonvertierung von Harness zu pi-ai, Bildverarbeitung, Replay-Wiederherstellung |
| [`src/stream.ts`](src/stream.ts) | pi-ai-Event-Konvertierung in Harness-`StreamChunk`-Werte |
| [`src/replay.ts`](src/replay.ts) | Versionierte `ReplayEnvelope`-Speicherung und -validierung |
| [`src/discovery.ts`](src/discovery.ts) | Endpoint-Befragung für Konfigurationsoberflächen |

### Registrierung und Verzeichnis

Das Plugin deklariert jeden installierten Katalog-Provider, den es authentifizieren kann, im konfigurierbaren-Provider-Verzeichnis, zusammengeführt mit jeder Route, die die aktuellen Profile deklarieren — so können Konfigurationsoberflächen den vollen Katalog anbieten, bevor irgendeine Route existiert. Jeder Eintrag trägt `declared` — ob pi-ai unter diesem Key nichts mitliefert — weil nur der Adapter eine handdeklarierte Route von einer eingeschränkten Katalog-Route unterscheiden kann. Route-Registrierung ist atomar: Eine Kandidatenmenge, die mit einem anderen Adapter kollidiert, lässt die bisherigen Routen im Dienst. Ein nackter Mount ohne Routen ist der inaktive Zustand: Nichts registriert sich, bis eine Settings-Sektion Profile liefert, und Routen fallen weg, wenn sie leer wird.

### Replay und Vokabular

Erfolgreiche Assistenten-Antworten speichern einen versionierten, verlustfreien JSON-Replay-Zustand neben Provider und Modell, die sie erzeugten — Fakten auf Antwortebene plus einen Eintrag pro Block je gestreamtem Block. Zur Request-Zeit reicht `LlmRuntime` den Replay-Zustand nur weiter, wenn dieselbe Adapter-Instanz beide Routen besitzt; der Adapter validiert ihn und stellt native Antwort-IDs, Provider-Signaturen und optionale `providerThinkingLevel`-Effort-Metadaten wieder her — fehlende Effort-Metadaten bleiben fehlend. Replay validiert die angefragte Modell-Identität gegen die Assistenten-Quelle und stellt separat ein Anthropic-Antwortmodell wieder her, wenn der Provider einen Alias oder Fallback auflöste. Ein unbrauchbarer Zustand degradiert zu providerneutralem Inhalt, statt den Request fehlschlagen zu lassen. Pi-ai-Tool-Call-Argumente sind geparste Objekte, daher parst der Adapter den Eingang und stringifiziert den Ausgang in die Harness-Raw-JSON-Konvention; pi-ai-In-Stream-Fehler-Events werden auf terminale `finish`-Chunks abgebildet.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Level-Vertrag nicht reicht. Sie bewegen sich vom Service-Vertrag zum Twin-Adapter und den geteilten Typen.

- [dsh-llm Service](../llm/README.de.md) — der providerneutrale Service, auf dem sich dieser Adapter registriert.
- [llm-deepseek Adapter](../llm-deepseek/README.de.md) — der direkte DeepSeek-Twin für die `deepseek-official`-Route.
- [LLM-Streaming-Subsystem](../../../docs/subsystems/llm-streaming.de.md) — das `StreamChunk`-Protokoll und der Adapter-Vertrag.
- [llm-retry](../llm-retry/README.de.md) — der Retry-Executor, der die `retryPolicy` jedes Profils anwendet.
- [Twin-LLM-Adapter](../../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.de.md) — warum die DeepSeek-Route zwei strukturell verschiedene Adapter ausliefert.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-llm-pi-ai) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

### Provider-Request über pi-ai

#### Was das Modell sieht

Das ausgewählte Katalog-Modell erhält einen System-Prompt (`GenerateOptions.system`, andernfalls den Text einer führenden `system`-Historien-Nachricht; eine führende System-Nachricht mit leerem Text sendet keine), die restliche Historie, Tools und die Sampling-Felder, die pi-ais gemeinsame Streaming-API unterstützt. Jedem beibehaltenen Bild geht ein Text voraus, der seine vollständige Anhang-ID und die tatsächlichen Request-Dimensionen nennt. Wenn das aktuelle Execution-Filesystem das Host-Objekt des Attachment-Providers abbildet, trägt der Text auch einen schreibgeschützten Pfad zum normalisierten Objekt und warnt, dass Normalisierung oder Request-Projektion den Upload verkleinert, vergrößert oder neu kodiert haben können. Überschreitet der akkumulierte Base64-Bildpayload das `maxRequestImageBytes` der Route, behält jedes ausgelagerte Bild seine eigene Identität und den aktuell aufgelösten Zugriff im Ersatztext. Ausgelagerte normalisierte Anhänge werden nicht gelesen oder transformiert. Providernative Replay-Metadaten werden nur wiederhergestellt, wenn der Adapter sie für den historischen Inhalt validiert.

#### Token-Effekt

Provider-Tokenisierung bestimmt den exakten Input. Beibehaltene Bilder fügen den stabilen Anhang- und Koordinaten-Deskriptor hinzu; der Auslagerungs-Platzhalter ersetzt die visuellen Tokens eines weggelassenen Bildes. Replay-Metadaten können einer nativen API erlauben, providerseitigen Zustand wiederzuverwenden.

#### KV-Cache-Effekt

Die Konvertierung erhält die logische Request-Reihenfolge, während Bild-Handles und Auslagerungs-Platzhalter modellsichtbaren Text hinzufügen. Ein geänderter Ausführungs-Welt-Pfad schreibt ein historisches Handle um und kann die Wiederverwendung ab diesem Bild verhindern, selbst wenn Anhang-Identität und Request-Bytes stabil bleiben. Adapter-Instanz, Provider, Modell oder ein anderes Upstream-Token zu wechseln hat denselben Suffix-Effekt. Das Überschreiten der Bildgrenze ersetzt ein früheres Bild durch Platzhaltertext, sodass die Wiederverwendung an dieser Nachricht endet, bis das ausgelagerte Präfix stabil ist.

### Provider-Response

#### Was das Modell sieht

pi-ai-Events werden zu Harness-Reasoning-, Text-, Tool-Call-, Usage- und Finish-Chunks. Der Adapter reicht geparste Tool-Argumente als Raw-JSON-Strings an den Harness weiter.

#### Token-Effekt

Generierter Inhalt beeinflusst spätere Eingänge erst, nachdem die Schleife ihn aufgezeichnet hat. Pi-ai faltet Reasoning-Tokens in die Output-Usage, wenn der Provider sie nicht separat meldet, und bewahrt seinen exakten `totalTokens`-Wert unverändert.

#### KV-Cache-Effekt

Aufgezeichneter Antwortinhalt hängt an die nächste Anfrage an und ungültig macht nicht ihren früheren wiederverwendbaren Präfix. Nicht aufgezeichnete Transport-Metadaten und Nutzungs-Abrechnung beeinflussen die Cache-Identität nicht.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo der Adapter aufhört und zukünftige Arbeit beginnt. Sie sind aktuelle Paket-Einschränkungen, kein allgemeiner pi-ai-Vergleich und kein Aufgaben-Backlog.

- **`maxRequestImageBytes` zählt nur Base64-Bildpayload** — Text, Tools, Deskriptoren und JSON-Struktur liegen außerhalb der Grenze, sie muss also mit Puffer unter der Request-Body-Obergrenze des Gateways sitzen. Offload ist eine deterministische Request-Projektion und wird nicht als Session-Ereignis aufgezeichnet.
- **Ein Sign-in lebt nur im Prozess, der ihn gestartet hat** — ein Authorization-Versuch ist nicht dauerhaft, ein Seiten-Reload mitten im Login bricht ihn ab und der Mensch beginnt von vorn. Abmelden ist `deleteRecord` auf dem gespeicherten Record, der ihn lokal vergisst, ohne den Herausgeber zu informieren.
- **Providernative Discovery antwortet über den Ambient-Context dieses Plugins** — eine Route ohne Credential delegiert an die eigene Auflösung des Katalog-Providers, die nach Umgebungswerten (`AZURE_OPENAI_API_KEY`, `AWS_PROFILE` und jedes Providers eigenem Set) und lokalen Credential-Dateien fragt. Beide Fragen werden hier beantwortet: Die Credential-Seam wird vor der Prozess-Umgebung befragt, und Dateiexistenz wird gegen das Dateisystem des Host-Prozesses mit expandiertem `~` geprüft. Was sie nicht kann: den *Inhalt* einer Credential-Datei lesen — ein Provider, der `~/.aws/credentials` selbst parst, tut das direkt, außerhalb der Seam.
- **Settings können Routen hinzufügen oder überschreiben, aber keine Kompositions-Routen entfernen** — der User-Layer wird über die Kompositions-Basis zusammengeführt, das Löschen eines per `cordis.yml` bereitgestellten Providers ist also eine Kompositions-Änderung.
- **Der Layered Merge hat kein Delete für Dict-Keys** — ein `reasoningEfforts`-Level, `modelOverrides`-Eintrag oder `compat`-Feld, das die Basis deklariert, kann vom User-Layer überschrieben, aber nicht entfernt werden.
- **`headers` können eine Credential tragen, die der Redactor nie sieht** — die Profil-Auflösung lehnt Namen und Werte ab, die Fetch nicht repräsentieren kann, aber das Dict bleibt einfache Strings; Credentials als `apiKeyEnv`-Referenzen speichern.
- **Der Katalog einer Route aktualisiert sich nie selbst** — der Katalog ist, was `settings.yaml` sagt; nichts hier fragt einen Provider nach den Modellen, die er bedient.
- **Anthropic-Discovery liest höchstens 1.000 Modelle** — der Request nutzt die maximale Seitengröße der API, traversiert aber `has_more` nicht; Einträge jenseits der ersten Seite müssen von Hand ergänzt werden.
- **Ein Wire-Protokoll pro Route** — eine Mixed-Protocol-Katalog-Route kann kein Modell des anderen Protokolls hosten; den Provider auf zwei Route-Keys aufzuteilen ist der Workaround.
- **Eine Modalitäts-Deklaration wird nicht verifiziert** — ein Modell, das `image` deklariert, sein Gateway aber nicht bedient, wird vom Provider nach der Prompt-Aufnahme abgelehnt. Das dauerhafte Bild bleibt in der Historie, und dasselbe, falsch deklarierte Modell kann erneut fehlschlagen; auf ein Text-only-Modell zu wechseln bleibt möglich, weil die gemeinsame LLM-Runtime Bild-Referenzen für diesen Request in stabilen Text projiziert.
- **Eine unauthentifizierte Route hängt vom Protokoll ab** — eine Route ohne Credential löst sich als konfiguriert-ohne-Schlüssel auf, aber pi-ais OpenAI-kompatible Implementierung verlangt trotzdem einen API-Key oder einen `Authorization`-Header, sodass ein schlüsselloser lokaler Server eine Platzhalter-Credential per `apiKeyEnv` oder einen `Authorization`-Eintrag in `headers` braucht.
- **`GenerateOptions.stop` wird nicht unterstützt** — pi-ais gemeinsame Stream-Optionen können Stop-Sequenz-Verhalten nicht providerübergreifend garantieren.
- **Nur eine führende `system`-Nachricht in der Historie wird zu pi-ais `systemPrompt`** — pi-ai hat einen einzigen System-Slot, eine spätere `system`-Nachricht oder eine führende bei gesetztem `GenerateOptions.system` faltet also an ihrer Position in eine `user`-Nachricht; providerspezifische Platzierung des Prompts folgt pi-ai statt einem Harness-eigenen Wire-Override. Bilder in System- oder Assistant-Historie, einschließlich der führenden System-Nachricht, schlagen mit `UNSUPPORTED_CONTENT` auf beiden Konvertierungspfaden fehl.
- **Der Provider-HTTP-Status ist nicht verfügbar** — pi-ai-Fehler-Events exponieren keinen stabilen HTTP-Status über Provider hinweg.
- **Retry-Policy ist providereigen, kein SDK-Retry** — pi-ai-SDK-Retries bleiben deaktiviert, sodass dauerhafte Agent-Schritte und `llm/retry`-Events jeden sichtbaren Versuch besitzen und direkte `ctx.llm.stream()`-Aufrufe Einzelversuche bleiben.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Diese Dev-Notiz ist nicht-autoritativer Arbeitskontext: unentschiedene Richtungen und Hinweise für Maintainer. Ausgeliefertes Verhalten und akzeptierte Rationale leben in den Abschnitten oben, dem Paket-Code und den verlinkten Agent Notes.

- Der angebotene Protokoll-Satz ist bewusst schmaler als pi-ais volles API-Set: Bedrock, Vertex, Azure und Codex authentifizieren über Flows, die ein Profil mit Key, Endpoint und Headers nicht vollständig beschreiben kann; Katalog-Routen erreichen sie weiterhin über ihren eigenen Provider, und nur ein explizites Override wird abgelehnt. Codex ist über den OAuth-Grant des Authorization-Flows anmeldbar.
- Der `compat`-Schaltersatz ist durch Drift-Gates an pi-ais Compat-Typen gepinnt; ein Upstream-Upgrade, das ein Feld hinzufügt, einem weiteren Protokoll einen Compat-Typ gibt oder eine Werte-Union erweitert, lässt den Build fehlschlagen, bis jemand es klassifiziert.

</details>

**Runtime-Invariante:** Kein Companion publiziert. Dieses Paket exponiert keine unabhängige Event-Sequenz oder mutable Datenrelation über die an ihrer besitzenden Seam erzwungenen Verträge hinaus.
