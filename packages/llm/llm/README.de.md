---
description: "Der provider-neutrale Modellaufruf-Service für Benutzer und Maintainer, die Anfragen streamen, Provider-Adapter registrieren oder Modellmetadaten auflösen."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`@deepseek-ai/dsh-llm` streamt Modellaufrufe über konfigurierte Provider-Adapter, ermittelt Modelle und löst Modellfähigkeiten sowie Aufruf-Defaults auf. Jede abgesetzte Anfrage bleibt aus dem Session-Log rekonstruierbar. Anfragen werden vor dem Dispatch deep-frozen, sodass Erweiterungen und Adapter sie lesen, aber nicht umschreiben können. Jeder Stream ist genau ein Provider-Versuch: Provider-spezifische Übersetzung bleibt bei seinem Adapter, während das optionale Paket `@deepseek-ai/dsh-llm-retry` fehlgeschlagene Anfragen erneut ausführt. Streams enden immer mit einem terminalen Ergebnis, sodass Aufrufer Erfolg, Fehlschlag und Abbruch einheitlich behandeln können.

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

Jede Komposition, die einen Model-Provider aufruft — ein Agent Loop, ein Session-Titel-Generator, ein Compaction-Summarizer — streamt ihre Anfragen über diesen Service. Zusammen mit mindestens einem Provider-Adapter mounten; der Service selbst hat keine Konfiguration und keinen Provider-Wire-Code.

### Wann wählen

Dieses Paket wählen, wann immer ein Plugin oder eine Komposition ein Modell aufrufen muss: Es ist der einzige unterstützte Weg in die Provider-Adapter und hält ein einheitliches Vokabular über den Loop, das Session-Log und jeden Consumer hinweg. Nicht verwenden, wenn provider-spezifisches Wire-Verhalten benötigt wird (das gehört in einen Adapter wie `dsh-llm-deepseek` oder `dsh-llm-pi-ai`) oder Retry-Ausführung (das gehört in `dsh-llm-retry`).

### Minimale Komposition

Den Service und mindestens einen Adapter mounten, dann den Provider in jeder Anfrage namentlich auswählen:

```yaml
- name: '@deepseek-ai/dsh-llm'
- name: '@deepseek-ai/dsh-llm-deepseek'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
```

Ein Stream liefert Chunks auf Token-Ebene und endet immer mit einem terminalen `finish`-Chunk. `BlockAssembler` verwandelt die Chunks in Content-Blöcke und Messages; `AssistantStreamAccumulator` bewahrt ihre exakten Zeitstempel und Token-Grenzen in einer kompakten Darstellung, die der Loop in eine persistente Attempt-Settlement einbettet:

```text
for await (const chunk of ctx.llm.stream({
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  messages: [createUserMessage({ content: [{ type: 'text', text: 'Hello' }] })],
})) {
  // chunks: block-start, text-delta, ..., usage, finish
}
```

Nach erfolgreichem Mount meldet `ctx.llm.listProviders()` die registrierten Routen in Registrierungsreihenfolge.

### Was möglich ist

- **Einen Modellaufruf streamen** — `ctx.llm.stream(options)` liefert rohe Chunks (Deltas auf Token-Ebene) für jeden registrierten Provider und jedes Modell; Consumer assemblieren sie mit `BlockAssembler`.
- **Provider-Adapter registrieren** — ein Adapter besitzt eine oder mehrere Provider-Routen, und seine Registrierung erfasst die Retry-Policy dieser Route; die doppelte Registrierung derselben Route schlägt mit `DUPLICATE_ADAPTER` fehl.
- **Provider über Konfiguration bereitstellen und aktivieren** — Adapter deklarieren konfigurierbare Provider-Routen plus einen Settings-Namespace, sodass Konfigurationsoberflächen ruhende Provider aktivieren und Verbindungsdaten ohne Neustart bearbeiten können. `LlmConfigurableProvider.error` meldet eine Konfigurationsdiagnose zur Reparatur; nicht betroffene Modelle können weiterhin bedient werden.
- **Modelle ermitteln und auflösen** — die von einem Adapter beworbenen Modelle auflisten, einen Endpoint nach den von ihm bedienten Modellen befragen und Kontextfenster, Output-Default, Reasoning-Efforts, Input-Modalitäten und System-Prompt-Update-Modus eines exakten Modells auflösen: `LlmResolvedModelInfo.systemPromptUpdate` ist `'in-history'`, wenn das Modell die jeweils neueste `system`-Message an beliebiger Position als effektiven Systemprompt liest, und fehlt, wenn nur eine führende System-Message gelesen wird; `normalizeModelInfo` lehnt jeden anderen Wert mit `INVALID_MODEL_INFO` ab.
- **Aufrufkonfiguration validieren** — ein expliziter oder konfigurierter Reasoning-Effort wird vor jeglichem Provider-I/O gegen das exakte Modell geprüft, und eine adapter-konfigurierte Output-Obergrenze wird materialisiert, wenn die Anfrage keine angibt.
- **Einen eingebetteten Assistant-Stream lesen, ohne ihn zu expandieren** — `assistantStreamFirstTokenTime` (erstes Token), `assistantStreamHasVisibleContent` (irgendein sichtbarer Inhalt) und `assistantStreamHasVisibleText` (irgendein sichtbarer Text) beantworten ihre Fragen aus den kompakten Records mit Early Exit; `lastAssistantStreamChunk` scannt rückwärts bis zum letzten rohen Chunk eines Typs, `assistantStreamChunks` und `joinAssistantStreamText` scannen den ganzen Stream, und `assembleAssistantStream` füttert einen `BlockAssembler` mit einem zusammengefügten Delta pro Run — mit denselben Blocks, Usage- und Replay-State wie die per-Member-Expansion. `runFirstTokenTime` und `runFirstVisibleTime` führen den Early-Exit-Scan für einen gepackten Run durch, und `isTokenDelta`, `isVisibleChunk` und `chunkHasVisibleText` definieren die Token- und Sichtbarkeitsregeln für einen einzelnen Chunk. `expandAssistantStream` bleibt der validierende Pfad für Records, die an einer persistenten Grenze gelesen werden; er ist nicht memoized, weil eine zurückbehaltene Expansion ungefähr das Zehnfache des kompakten Streams kostet, solange das Event lebt.

### Fehler und Wiederherstellung

Jeder Stream endet in genau einem terminalen `finish`-Chunk: `{ kind: 'error', failure }` bei Fehlschlag, `{ kind: 'aborted', failure }` bei Abbruch. Fehler tragen stabile Codes wie `NO_ADAPTER`, `MISSING_CREDENTIAL`, `AUTH`, `RATE_LIMIT` und `CONTEXT_WINDOW_EXCEEDED`; Consumer routen auf den Code, niemals auf Message-Text. Eine Anfrage, die einen nicht registrierten Provider nennt, schlägt mit `NO_ADAPTER` fehl, und eine fehlerhafte Credential schlägt mit `INVALID_CREDENTIAL` fehl statt als opaker Fetch-Fehler aufzutreten. Dieser Service führt eine Anfrage nie erneut aus: Retry ist die Aufgabe von `dsh-llm-retry` am Extension Point für fehlgeschlagene Agent-Schritte.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design hinter dem Service; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designphilosophie

Der Service baut auf einer Trennung auf: **Der logische Vertrag ist provider-neutral, die Adapter besitzen das Wire-Format.** Er definiert das kanonische Message-, Content-Block- und Stream-Chunk-Vokabular einmal, und jeder Provider-Adapter übersetzt nur sein eigenes Wire-Format in dieses Vokabular. Die Registry ist der Topologie-Eigentümer — Adapter-Routen, konfigurierbare Provider-Einträge und Discovery-Angebote registrieren alle hier und werden mit ihrer Fiber disposed —, während eine Anfrage eine reine Funktion des Session-Logs bleibt: Loop-gebaute Anfragen kommen deep-frozen an, sodass Listener und Adapter sie lesen und nie umschreiben.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Der `LlmRuntime`-Service: Adapter-Registry, Verzeichnis konfigurierbarer Provider, Modellermittlung, Aufrufvorbereitung und die Streaming-Grenze |
| [`src/types.ts`](src/types.ts) | Das `StreamChunk`-Protokoll, die Content-Block-Map, Finish-Reasons und das gemeinsame Vokabular |
| [`src/message.ts`](src/message.ts) | Immutabile Message-Konstruktoren, geteilt von Zustellung, Verlauf und Anfragen |
| [`src/assembler.ts`](src/assembler.ts) | `BlockAssembler`: inkrementelle Chunk-zu-Block-Assemblierung |
| [`src/assistant-stream.ts`](src/assistant-stream.ts) | Kompakte zeitgestempelte Assistant-Stream-Akkumulation, strikte Validierung, exakte Expansion und Record-Level-Reader |
| [`src/call-config.ts`](src/call-config.ts) | Call-Config-Validierung, Materialisierung von Adapter-Defaults und Request-Freezing |
| [`src/retry-policy.ts`](src/retry-policy.ts) | Provider-eigene Retry-Policy-Auflösung (Modi normal und always) |
| [`src/error.ts`](src/error.ts) | `HarnessError`/`LlmError`-Taxonomie und provider-neutrale Fehlercodes |
| [`src/content.ts`](src/content.ts) | Gemeinsame Datei- und Bild-Projektionshelfer, einschließlich Request-Image-Offloading |
| [`src/api-key.ts`](src/api-key.ts) | Credential-Formatprüfung, geteilt von jedem Adapter |
| [`src/adapter-failure.ts`](src/adapter-failure.ts) | Fehler-Normalisierung in terminale Finish-Chunks |

### Hauptfluss

Eine Anfrage wird gegen die Fähigkeit ihres exakten Modells validiert — Kontextfenster, Output-Default, Reasoning-Efforts, Input-Modalitäten und `systemPromptUpdate`-Modus —, etwaige adapter-konfigurierte Defaults werden materialisiert, dann wird die gesamte Anfrage deep-frozen. `prepareCall()` bindet diese Fakten, losgelösten Kontext und Retry-Policy an die exakte Adapter-Generation, die den terminalen Dispatch durchführt, sodass HMR oder dynamische Settings nicht die Bildfähigkeit einer Generation mit dem Endpoint einer anderen Generation kombinieren können. Ein bildfähiger Adapter projiziert persistente Referenzen in routenspezifische Request-Versionen; `resolveImageAttachmentAccess()` bildet separat das optionale Host-Objekt eines Attachment-Providers in die aktuelle Tool-Ausführungswelt ab, ohne das Request-Bild oder seine `variantId` zu ändern. Eine reine Text-Route erhält deterministische Per-Image-Platzhalter, einschließlich verschachtelter Tool-Result-Bilder, ohne den Append-only-Session-Verlauf umzuschreiben. Persistente `FileBlock`-Referenzen erreichen keinen Adapter: Die Request-Assemblierung ersetzt jede einzelne — einschließlich verschachtelter Vorkommen in Tool-Results — durch deterministischen Handle-Text, der die Datei und ihren gespeicherten Read-only-Pfad nennt, aufgelöst über die gemounteten Attachment- und Filesystem-Provider. `ctx.llm.fileRequestText(ref)` legt genau diese synchrone Projektion der Request-Messung offen. `offloadRequestImagesWithPolicy()` entfernt die ältesten Bilder deterministisch nach Roh- oder Base64-Größe und Anzahl oder Byte-Quanten; die reine Funktion `offloadedImagePrefixCount()` legt diese Entscheidung offen, damit routeneigene Request-Pricing sie reproduzieren kann, ohne die Projektion zu bauen. Adapter, die visuelle Token berechnen, deklarieren per-Route `imageRequestPricing`, das `ctx.llm.imageRequestPricing(provider, model)` synchron für den Token-Meter auflöst. Der Dispatch läuft über den `llm/stream`-Waterfall, dann kehren Chunks als Deltas auf Token-Ebene zurück und jedes Adapter-Ergebnis erreicht den Consumer als ein terminaler `finish`-Chunk.

Die Dateierkennung liest bei jeder Anfrage den aktuellen Inhalt — einschließlich verschachtelter Tool-Results — ohne Message-Identitäten oder Freeze-Status zu cachen. Der [File-Scan-Beschluss](../../../.agents/notes/implemented/simplification/2026-09-07-file-content-scan.de.md) hält die gemessenen Traversierungskosten fest.

### Invarianten

- **Modell-sichtbar ⟺ geloggt** — alles, was eine Provider-Anfrage erreicht, ist aus dem Session-Log rekonstruierbar; Loop-gebaute Anfragen sind deep-frozen und werden nie umgeschrieben.
- **Replay-State wandert nur innerhalb eines Adapters** — Assistant-Replay-State reist nur mit, wenn dieselbe Adapter-Instanz die historische und die Zielroute besitzt; andernfalls wird er vor dem Dispatch verworfen.
- **Vorbereitete Aufrufe sind Einweg** — ein vorbereiteter Aufruf kann genau einmal dispatched werden, und seine Call-Config-Felder müssen der vorbereiteten Config entsprechen.
- **Bildprojektion folgt der erfassten Route** — persistente `ImageBlock`-Referenzen werden nur für bildfähige Modelle zu routenspezifischen Request-Versionen; reine Text-Modelle erhalten stabile Platzhalter.
- **Dateiprojektion ist unbedingt** — kein Provider erhält Dateibytes; jede Route bekommt eine deterministische Handle-Zeile pro `FileBlock`, und das Modell liest die gespeicherte Kopie bei Bedarf mit seinen Datei-Tools.
- **Protokollreihenfolge** — `usage` geht `finish` voraus, Tool-Argumente bleiben rohe JSON-Strings, und nichts folgt dem terminalen `finish`.
- **Registry-Mutationen sind atomar** — Routen- und Verzeichnisregistrierung validiert die gesamte Kandidatenmenge, bevor sich etwas bewegt, sodass eine abgelehnte Änderung den bisherigen Zustand weiter bedienen lässt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der Paket-Vertrag nicht ausreicht. Sie führen von den gemeinsamen Typen zu den konkreten Adaptern, dem Retry-Executor und dem Mess-Service.

- [LLM-Streaming-Subsystem](../../../docs/subsystems/llm-streaming.de.md) — die Message- und Block-Typen, kompakte Assistant-Stream-Records, das `StreamChunk`-Protokoll und der Adapter-Vertrag.
- [llm-deepseek-Adapter](../llm-deepseek/README.de.md) — die direkte DeepSeek-Chat-Completions-Implementierung.
- [llm-pi-ai-Adapter](../llm-pi-ai/README.de.md) — die pi-ai-gestützte Multi-Provider-Implementierung.
- [llm-retry](../llm-retry/README.de.md) — der Retry-Executor, der fehlgeschlagene Modellanfragen erneut ausführt.
- [Token-Meter](../token-meter/README.de.md) — replay-bewusste Request- und Kontextdruck-Messung.
- [Twin-LLM-Adapters](../../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.de.md) — warum die DeepSeek-Route zwei strukturell verschiedene Adapter ausliefert.
- [Terminale LLM-Stream-Fehler](../../../.agents/notes/implemented/architecture/2026-07-29-terminal-llm-stream-failures.de.md) — die Service-Grenze zwischen Modellanfrage-Ergebnissen und Plugin-Fehlern.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da der LLM-Service keinen Inhalt hinzufügt; Adapter entscheiden, wann sie die von diesem Paket exportierten gemeinsamen Bild-Deskriptoren und Per-Image-Platzhalter hinzufügen.

#### KV-Cache-Effekt

Die Reasoning-Effort-Materialisierung bewahrt das assemblierte Anfrage-Präfix. Bildidentität und Request-Vorschau-Text sind deterministisch, während ein optionaler Ausführungswelt-Pfad pro Anfrage aufgelöst wird; ein geänderter Pfad oder eine geänderte Image-Offload-Grenze kann die Wiederverwendung ab diesem Bild verhindern.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo dieser Service aufhört und andere Pakete oder künftige Arbeit beginnen. Sie sind aktuelle Paket-Einschränkungen, kein Aufgabenrückstand.

- **Keine Retry-Ausführung, kein Caching und kein Rate-Limiting in diesem Service** — die Provider-Registrierung speichert die Retry-Policy, aber ein Stream bleibt ein einzelner Provider-Versuch; `@deepseek-ai/dsh-llm-retry` führt die Policy an persistenten Agent-Schritt-Grenzen aus.
- **`GenerateOptions`-Sampling ist nur `temperature`/`maxTokens`/`stop`** — keine `tool_choice`-, `top_p`- oder Penalty-Felder; das Vokabular wächst, wenn ein Produzent landet ([entfernte inerte Regler](../../../.agents/notes/archived/simplification/2026-07-04-drop-inert-request-knobs.de.md)).
- **Produzenten-gesteuerte Varianten bleiben draußen, bis sie produziert werden** — `prefill`, Per-Tool `strict`, Block-`cache`-Hints und die `agent`-Message-Source-Variante haben keinen Produzenten ([Agent Note](../../../.agents/notes/archived/simplification/2026-07-04-prune-producerless-vocabulary-variants.de.md)).
- **`BlockAssembler` verarbeitet nur Kern-Block-Arten** — ein Plugin-hinzugefügter Block-Typ, dessen Stream nie durch `block-end` geschlossen wird, lässt `blocks()` werfen.
- **`GenerateOptions.sessionId` ist ein lokal deklariertes Brand** — der Import von dsh-sessions `SessionId` würde einen Dependency-Cycle erzeugen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist nicht maßgeblicher Arbeitskontext: offene Fragen und unentschiedene Richtungen. Ausgeliefertes Verhalten und akzeptierte Begründungen stehen in den Abschnitten oben, dem Paketcode und den verlinkten Agent Notes.

#### Offene Punkte

- `GenerateOptions.sessionId` ist ein lokal deklariertes Brand, weil der Import von dsh-sessions `SessionId` einen Dependency-Cycle erzeugen würde; ein künftiges IDs-besitzendes Paket könnte den Workaround auflösen.
- Reasoning-Effort-Identifier sind adapter-eigene opake Strings, die nur gegen die beworbene Menge des jeweiligen Adapters aufgelöst werden; ein geteiltes adapterübergreifendes Effort-Vokabular ist nicht entschieden.
- Das `llm/adapters-updated`-Event ist by design payload-frei; Consumer lesen die Registries erneut, statt die neue Topologie im Event zu erhalten.

</details>
