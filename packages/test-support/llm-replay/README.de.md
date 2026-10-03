---
description: "Schlüsselloses LLM-Replay-Plugin für Snapshot-Tests, für Testautoren, die den echten agent gegen aufgezeichnete Modell-transkripte booten."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-replay
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh-llm-replay` lässt Snapshot-Tests den echten agent ohne API-Schlüssel laufen, indem es Modell-Streams aus aufgezeichneten Session-JSONL-fixtures abspielt. Jede Eltern- und subagent-Session erhält ihr aufgezeichnetes Skript in Reihenfolge des ersten Aufrufs, während Aufrufe innerhalb einer Session unabhängig fortschreiten. Ein `replay.override.json`-sidecar stellt pre-chunk-Fehler, Abbrüche, Hänger und injizierte Retries dar, die dauerhafte Settlements nicht rekonstruieren können. Verwenden Sie es für deterministische ACP-, Headless- und Web-Browser-Szenarien, die echtes Loop-Verhalten mit fester Modellausgabe brauchen.

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

Dieses Paket gibt einem schlüssellosen Test einen echten agent mit festem Modell-transcript: Mounten Sie es anstelle eines echten LLM-Adapters, richten Sie es auf eine aufgezeichnete fixture und führen Sie das Szenario genau so aus, als hätte das Modell die aufgezeichnete Ausgabe produziert.

### Es mounten

Mit konfiguriertem `providers` registriert das Plugin einen reinen Replay-Adapter, dessen Katalog für Szenarien verfügbar ist, die Modell-Discovery ausüben; ohne `providers` installiert es den catch-all `llm/stream` waterfall, den Tests ohne Discovery-Bedarf verwenden:

```yaml
- id: llm-replay
  name: '@deepseek-ai/dsh-llm-replay'
  config:
    providers:
      - id: deepseek-official
        name: DeepSeek
        retryPolicy:
          mode: normal
          backoff:
            initialDelayMs: 1
            maxDelayMs: 1
            jitterRatio: 0
        models:
          - id: deepseek-v4-flash
            contextWindow: 128000
          - id: deepseek-v4-pro
  # file/overrideFile/childFiles default to $DSH_SNAPSHOT_FILE /
  # $DSH_SNAPSHOT_OVERRIDE / $DSH_SNAPSHOT_CHILD_FILES, set by the snapshot
  # harness per scenario.
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `file` | `$DSH_SNAPSHOT_FILE` | Pfad zur gewählten primären fixture: `session.jsonl` für v0 oder `session.vN.jsonl` für eine positive Generation; erforderlich (Config oder env) |
| `overrideFile` | `$DSH_SNAPSHOT_OVERRIDE` | Optionales `ReplayOverrideDoc`-sidecar für die primäre Session |
| `childFiles` | `$DSH_SNAPSHOT_CHILD_FILES` | Aufgezeichnete subagent-child-Session-Logs für ein verschachteltes Szenario |
| `providers` | — | Optionaler reiner Replay-Provider- und Modellkatalog; ein Modell darf `contextWindow`, Text-/Bild-Modalitäten, positives `imageRequestTokens` bei Bildfähigkeit und `systemPromptUpdate: in-history` deklarieren, damit ein schlüsselloses Szenario den in-history-System-Prompt-Ersatz ausübt; ungültige Werte schlagen beim Laden fehl (`llm-replay: provider "…" model "…" systemPromptUpdate must be "in-history" when present`), und Routen führen niemals Provider-I/O aus |
| `paceMs` | — (Burst) | Optionale Verzögerung pro chunk in ms für echt inkrementelle Zustellung |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-llm-replay) ist die erschöpfende Quelle für jedes akzeptierte Feld und dessen JSDoc.

### Wie die fixture funktioniert

Die fixture ist eine Projektion einer gewählten persistierten Session-Generation, die durch einmaliges Ausführen des echten agent entsteht — dieses Plugin zeichnet nicht auf. Der snapshot harness liefert den numerisch höchsten kanonischen Elternpfad (`<scenario>/session.jsonl` für v0 oder `<scenario>/session.vN.jsonl` für eine positive Generation) und validiert vor dem Replay die Übereinstimmung von Dateiname und Header. Die fixture behält den Header und jedes Event-Payload, lässt aber die `seq`/`time`-envelopes des Bodies weg (`seq0`/`time0` für historische gepackte Zeilen). Replay ergänzt lückenlose Sequenzen und deterministische Zeitstempel, stellt typisierte Werte wieder her, die durch snapshot-tokens ersetzt wurden, lehnt partielle oder gemischte envelopes ab, dekodiert das vollständige physische Artefakt über den build-statischen Session-Format-Katalog und migriert historische Eingaben im Speicher, bevor es Events oder den geerbten cut bereitstellt; aktuelle Eingaben werden direkt wiederhergestellt. Nur für einen projizierten v0-Header bedeutet ein fehlendes `delegationDepth` `0`. Der Parser schreibt oder benennt die fixture niemals um. Die Runtime-Persistenz schreibt weiterhin vollständige Logs. Replay expandiert den kompakten Stream bei jedem `assistant/message` oder `assistant/attempt` der aktuellen Ansicht, sodass eine aufgezeichnete fixture denselben logischen Stream abspielt, den das live Modell produzierte. Eine fixture darf ihren `request/header`-Inhalt zu `{{system}}`/`{{tools}}` tokenisiert tragen; Replay materialisiert nur-validierende Werte, während die Ableitung nur Assistant-Settlements, markierte summary-Events und Session-Metadaten liest. Jede Replay- und Vergleichs-fixture muss dieselbe rein inhaltsbasierte Katalogvalidierung bestehen; Replay repariert niemals ein abgelehntes Artefakt. Die Vergleichskodierung bewahrt akzeptierte Katalogausgabe, einschließlich Erweiterungs-request-header-Felder; aktuelles `header.system` wird abgelehnt. Erwartete Ausgaben für wire-Benachrichtigungen vergleichen direkt mit der Ausgabe des aktuellen Writers, behalten Event-Reihenfolge, eingefügte system-Nachrichten, Wrapper-Felder und opake Zustellungs- und erfasste-Generation-Werte; nur vollständige Session-Artefakte verwenden den Format-Migrationskatalog.

### Verschachtelte agents

Ein Szenario, in dem ein Eltern-agent an in-process-subagents delegiert, zeichnet eine Rolle pro Session auf: Eltern `session[.vN].jsonl`, dann lückenlose children `session.<ordinal>[.vN].jsonl`. Der snapshot harness liefert nur die höchste Generation jeder Rolle. Live Session-ids sind bei jedem Lauf frisch zufällig, sodass Replay jede live Session nach Reihenfolge des ersten Aufrufs an ein aufgezeichnetes Skript bindet: Die erste live Session, die einen Modellaufruf macht, beansprucht das Eltern-Skript, die nächste neue Session das nächste child-Skript und so weiter, wobei jede Session ihren eigenen Cursor fortschreitet. Mehr unterschiedliche live Sessions als aufgezeichnete Skripte schlägt laut fehl.

### Fehlermodi und Overrides

Wenn Replay `deepseek-official` mit `ctx.deepseekLlmApiExtensions` bedient, bereitet es diese Felder vor und akzeptiert sie, nachdem es einen gültigen Skripteintrag gewählt hat und bevor es den ersten chunk ausgibt. Dies spiegelt den post-2xx-Commit-Punkt des live Adapters, sodass dauerhafte Akzeptanz-Wasserstände und SDK-Event-Benachrichtigungen in Aufzeichnung und Replay gleich reagieren. Replay liefert einen synthetischen `{ messages: [] }`-Basis-Body: Er beweist Akzeptanz-Nebeneffekte, nicht präparierte Feld-Bytes.

Zwei Fehlermodi sind nicht aus einem dauerhaften Assistant-Settlement allein rekonstruierbar: Ein reiner throw vor jedem chunk hat kein exception-tragendes Stream-Mitglied, und ein cancel/hang erfordert Nichtterminierung statt eines abgespielten endlichen Präfixes. Ein Szenario, das diese braucht, liefert ein optionales sidecar (`<scenario>/replay.override.json`), das entweder das abgeleitete Skript durch ein nacktes `ReplayEntry[]` ersetzt oder es mit `{ patches: [{ at, entry }] }` ergänzt — Letzteres behält jeden abgeleiteten Aufruf und tauscht die genannten 0-basierten Aufruf-Indizes aus; ein `at` gleich der abgeleiteten Länge hängt den Retry-Versuch nach einem injizierten transienten throw an. Ein `throw`-Eintrag akzeptiert DeepSeek-Request-Erweiterungen, wenn er Präfix-chunks hat; ein zero-chunk-throw bedeutet standardmäßig pre-2xx-Nichtakzeptanz und darf `accepted: true` für einen post-2xx-Fehler setzen. Ein `hang`-Eintrag darf `readyFile` nennen, das Replay vor dem Warten auf Abbruch schreibt, sodass ein externer Treiber deterministisch abbrechen kann.

### Was schiefgehen kann

- **Die fixture wird nicht vollständig konsumiert** — `assertConsumed()` beim Teardown macht aus einem Szenario, das still weniger Modellaufrufe fuhr als aufgezeichnet, eine präzise Diagnose; rufen Sie es auf, wenn Sie Replay direkt in einem Test installieren.
- **Eine nicht aufgezeichnete Session macht einen Aufruf** — Replay schlägt laut fehl und sagt Ihnen, dass Sie das Szenario neu aufzeichnen sollen.
- **Ein skriptierter Platzhalter matcht nichts** — die `{{fromRequest:<regex>}}`-Auflösung validiert das Muster und den Anfragekorpus und schlägt laut fehl bei keinem Match, einem ungültigen Muster oder einem nicht abgeschlossenen Platzhalter.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design des Replay-Plugins; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Design

Replay behandelt die gewählte projizierte Session-Generation als fixture. Ein Parser vervollständigt projizierte envelopes, validiert und migriert das gesamte Artefakt über `sessionFormatCatalog` und gibt den aktuellen Header, den geerbten cut und die Event-Liste als ein Ergebnis zurück. `deriveReplayScript` expandiert jeden `assistant/message`- oder `assistant/attempt`-Stream in Log-Reihenfolge, sodass jedes dauerhafte Settlement ein `chunks`-Eintrag wird; ein nicht-leerer Stream ohne `finish`-chunk ist der fingerprint eines geworfenen `stream()` und muss über ein override-sidecar ausgedrückt werden. Ein `compaction/summary`, das `llmStreamCall: true` und ein vollständiges `rawOutput` trägt, spielt an der Position dieses Events als ein kanonischer erfolgreicher Stream ab. Skriptierte Strings dürfen `{{fromRequest:<regex>}}` einbetten; zur Stream-Zeit löst jeder Platzhalter gegen die String-Blätter der live Anfrage auf und setzt den letzten Match des Musters mit dessen erster Capture-Group (oder dem ganzen Match) an Ort und Stelle ein.

Der [committed-corpus-Test](tests/session-format-corpus.spec.ts) stellt jedes versionierte `session*.jsonl` unter `snapshots/`, `packages/` und `scripts/snapshots/python-sdk-single-exe/` über den echten Katalog wieder her, ohne Quell-Bytes zu ändern. Sein [Inventar](tests/session-format-corpus-inventory.ts) pinnt bewusste historische Ablehnungen per Pfad, Quell-Generation, Fehlertyp und exaktem Grund; eine Ablehnung, die verschwindet oder sich ändert, schlägt fehl. Artefakte der aktuellen Generation können keine Ausnahme erhalten. Headerlose snapshot-harness-Protokollbeispiele haben eine separate explizite Ausnahme. Alle anderen Wiederherstellungsfehler schlagen mit dem Artefaktpfad fehl; historische Dateien bleiben unverändert, und native aktuelle fixtures erfordern Korrektur durch den Besitzer.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Typen, fixture-Ableitung, override-Validierung, Platzhalter-Auflösung, Session-Bindung, `installLlmReplay` und der Plugin-Export |
| [`tests/session-format-corpus.spec.ts`](tests/session-format-corpus.spec.ts) | Committed-Generation-Wiederherstellung und exakte historische Ablehnungsprüfungen |
| — | Es wird kein Runtime-invariant-Begleitexport veröffentlicht; dieser nur-Test-Adapter konsumiert ein festes Replay-Skript; seine Stream-Grammatik wird durch das LLM-Begleitpaket und fixture-Ableitungstests geprüft. |

### Bindung und Stream-Fluss

`installLlmReplay` lädt die geordneten Skripte und installiert dann entweder einen gerouteten Replay-Adapter (wenn `providers` nicht leer ist) oder einen catch-all `llm/stream` waterfall-Listener. Jeder live `stream()`-Aufruf wird über die rufende Session-id gekeyed: Eine neue Session beansprucht das nächste unbeanspruchte Skript (die Eltern-Session zuerst, weil sie streamt, bevor sie delegieren kann), und Aufrufe ohne `sessionId` teilen eine anonyme Session, die an das primäre Skript gebunden ist. Das zurückgegebene `ReplayHandle` trägt einen disposer für HMR-Sicherheit und `assertConsumed()`, das wirft, außer jedes aufgezeichnete Skript band an eine live Session und jeder gebundene Cursor wurde leergelesen.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der paketweite Vertrag nicht ausreicht. Sie führen vom Replay-Adapter zum harness, der fixtures aufzeichnet, und zum Loop, der Streams konsumiert.

- [session-snapshot](../session-snapshot/README.de.md) — die Snapshot-Unterstützung, die fixtures aufzeichnet und Replay-, Record- und Refresh-Modi treibt.
- [LLM-Paket](../../llm/llm/README.de.md) — der Provider-Stream-Vertrag und das Adapter-registry, die Replay implementiert.
- [Teststrategie](../../../docs/testing.de.md) — die schlüssellose Snapshot-Stufe und wann sie erforderlich ist.
- [Test-support-Gruppenkarte](../README.de.md) — Geschwister-harnesses und Support-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da dieser schlüssellose Test-Adapter keine Anfrage an ein Provider-Modell sendet; er spielt nur aufgezeichnete assistant-chunks in den Test-Loop ab.

#### KV-Cache-Effekt

Keiner; dieses Paket stellt weder eine Provider-Anfrage zusammen noch sendet es eine.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann Replay kein live Modell ersetzen kann. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Skript-Bindung nach Reihenfolge des ersten Aufrufs setzt sequentielle Delegation voraus** — ein cut, der Geschwister-subagents parallel laufen lässt, würde live Sessions nicht-deterministisch an aufgezeichnete Skripte binden; eine stärkere Keying ist zurückgestellt, bis ein solches Szenario existiert.
- **Nur gewöhnliche Loop-chunks und markierte lokale compaction-Ausgaben sind ableitbar** — ein reiner pre-chunk-throw, ein cancel/hang oder ein unmarkierter externer Zusammenfassungsaufruf braucht das `replay.override.json`-sidecar; Ersetzungs- und Patch-Formen betreffen nur die primäre Session, und child-Skripte leiten weiterhin aus ihren Logs ab.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
