---
description: "Die Tool-Ergebnis-Spill-Policy: wie Deployments übergroße Plain-Text-Tool-Ergebnisse mit einer Vorschau und einer abrufbaren spill-Datei aus dem Modellkontext heraushalten."
kind: "package-reference"
---

# @deepseek-ai/dsh-spill-policy
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Mounten Sie dieses Paket, wenn übergroße Plain-Text-Tool-Ergebnisse aus dem Modellkontext herausgehalten werden sollen. Ergebnisse über `maxInlineBytes` werden zu einer begrenzten Kopf-/Fuß-Vorschau mit einem Locator und Abrufhinweisen, während der vollständige Text über das konfigurierte spill-Backend verfügbar bleibt. spill-Fehler lassen das Originalergebnis sichtbar, und das Weglassen von `maxInlineBytes` deaktiviert die Policy. Dasselbe Limit begrenzt durable `run_code`-Sub-Call-Log-Kopien, ohne den an das Programm zurückgegebenen Wert zu ändern.

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

Mounten Sie die Policy zusammen mit einem spill-Backend, um zu begrenzen, wie viel vom Plain-Text-Ergebnis eines Tools das Modell sieht. Die Begrenzung gilt für finale Ergebnisse, nachdem das Tool gelaufen ist; Ergebnisse, die die Policy unberührt lässt, passieren weiterhin unverändert.

### Minimale Konfiguration

Laden Sie die Policy mit einem `maxInlineBytes`-Budget in UTF-8-Bytes und einem spill-Backend:

```yaml
- name: '@deepseek-ai/dsh-spill-local'
- name: '@deepseek-ai/dsh-spill-policy'
  config:
    maxInlineBytes: 50000
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `maxInlineBytes` | weggelassen | Modellseitige Kontext-Obergrenze für ein Plain-Text-Ergebnis in UTF-8-Bytes; Weglassen deaktiviert die Policy vollständig |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-spill-policy) ist die erschöpfende Quelle für jedes akzeptierte Feld. Eine negative oder gebrochene Obergrenze lässt das Plugin-Laden fehlschlagen, statt das Pro-Call-Verhalten zu beschädigen.

### Was das Modell sieht

Ein übergroßes Plain-Text-Ergebnis wird durch eine Vorschau plus eine Notiz innerhalb desselben Budgets ersetzt, sodass der gesamte Ersatz nie `maxInlineBytes` überschreitet:

```text
<retained head/tail preview>

(Omitted N bytes. Full formatted result stored at: /…/session-…/…-web_fetch.txt. Use read with offset/limit, or grep this path to search within it.)
```

Wenn die Notiz allein das Budget füllt (eine winzige Obergrenze oder ein langer Locator), ist die Vorschau leer und nur die Notiz wird zurückgegeben; wenn selbst das die Obergrenze überschreiten würde, behält die Policy das originale Inline-Ergebnis — ein Ersatz innerhalb der Obergrenze ist immer kleiner als das Original. Der vollständige Text bleibt in der spill-Datei verfügbar, und ein erfolgreicher Ersatz ändert nur die modellseitige Kopie, nie das kanonische programmatische Ergebnis.

### Welche Ergebnisse betroffen sind

Die Policy formt nur finale, akzeptierte Plain-Text-Ergebnisse. Ergebnisse an oder unter der Obergrenze, Ergebnisse mit beliebigen Nicht-Text-Blöcken, verschachtelte Composite-Calls, `read`-Ergebnisse, blockierte Entscheidungen und akzeptierte Wert-Ersetzungen passieren unverändert. Bereits erfolgte Provider-seitige Trunkierung (zum Beispiel `web-fetch-http.maxBodyChars`) kann hier nicht zurückgeholt werden — die spill-Datei hält, was das Tool tatsächlich zurückgegeben hat.

### Best-Effort-Fehlerverhalten

Ein fehlender Session-Owner, ein fehlendes `ctx.spillStore`-Backend oder eine `saveText`-Ablehnung loggt eine Warnung und gibt das Originalergebnis zurück. Ein spill-Fehler macht aus einem erfolgreichen Call nie einen Fehler und verbirgt nie das Inline-Ergebnis.

### Die durable Log-Kopie

Dieselbe Obergrenze begrenzt auch die Session-Log-Kopie jedes `run_code`-Sub-Call-Ergebnisses: Das Programm erhält weiterhin den vollständigen Wert, nur die Log-Kopie wird durch Vorschau und Locator ersetzt. Übergroße `read`-Sub-Call-Ergebnisse werden hier ebenfalls begrenzt, da eine Log-Kopie kein Modellkontext ist.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter der Policy; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designphilosophie

Die Policy ist bewusst schmal: Sie entscheidet nur, **wann** gespillt wird, und komponiert die Notiz. Sie registriert keinen Service, besitzt kein Storage und besitzt keine Vorschau-Mechanik — `TextRetainer` aus `dsh-output-retention` baut die Kopf-/Fuß-Vorschau. Zwei Invarianten formen den Code: Der modellseitige Ersatz überschreitet nie `maxInlineBytes` (die Byte-Kosten der Notiz werden zuerst aus dem Budget reserviert), und ein spill-Fehler ändert nie das Ergebnis des Tool-Calls.

### Die zwei Arme

Ein `tools/post-execute`-waterfall-Listener (mit `prepend` registriert, delegiert via `next()`) begrenzt das modellseitige Ergebnis; ein `tools/ptc-dispatch-log`-Listener begrenzt die durable Log-Kopie jedes `run_code`-Sub-Calls. Beide teilen einen Ersetzungshelfer, sodass die zwei Projektionen byte-identisch sind. Der post-execute-Arm überspringt `read`, um eine read → spill → read-Schleife zu vermeiden; der dispatch-log-Arm begrenzt `read`-Sub-Calls, weil eine Log-Kopie kein Modellkontext ist.

<a id="shared-notice-ownership"></a>
### Geteilte Notiz-Verantwortung

Der browser-sichere Einstieg `@deepseek-ai/dsh-spill-policy/notice` besitzt sowohl `formatSpillNotice(omitted, ref)`, das vom Produzenten verwendet wird, als auch `hasSpillNotice(text)`, das von Präsentations-Consumers verwendet wird. Formatierung und Erkennung teilen die Notiz-Delimiter; die Weglassungs-Validierung nutzt den bestehenden `describeOmitted`-Formatter statt einer zweiten Kopie seiner Prosa. Die Erkennung akzeptiert eine vollständige finale Notiz nach einer Vorschau oder alleinstehend und bewahrt die persistierte Notiz-Schreibweise. Sie liest aufgezeichneten Text, ohne ihn umzuschreiben.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Config`-Validierung, die zwei waterfall-Listener, der geteilte Ersetzungshelfer |
| [`src/notice.ts`](src/notice.ts) | Browser-sichere Notiz-Formatierung und -Erkennung, publiziert als `./notice` |
| [`src/types.ts`](src/types.ts) | `SpillPolicyExec`: die minimale strukturelle Sicht auf eine Tool-Ausführung, die die Policy für die besitzende Session-id liest |
| — | Es wird kein Runtime-Invariant-Begleiter publiziert; dieses Paket legt keine unabhängige Event-Sequenz oder mutierbare Datenrelation über die an seinem besitzenden Seam durchgesetzten Verträge hinaus offen. |

### Fehlerfälle

Best-Effort-Degradation gilt für beide Arme: kein Session-Owner, kein Backend, eine abgelehnte Speicherung oder kein Ersatz innerhalb der Obergrenze loggt eine Warnung und behält den Originalinhalt. Die Load-Zeit-Validierung lehnt eine negative oder gebrochene `maxInlineBytes` ab, sodass eine schlechte Config das Deployment scheitern lässt, nicht jeden übergroßen Call.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der paketweite Vertrag nicht ausreicht.

- [spill-Storage-Service](../spill/README.de.md) — der `saveText`-Vertrag hinter dem Policy-Ersatz.
- [dsh-spill-local](../spill-local/README.de.md) — das lokale Backend, das den gespillten Text speichert.
- [dsh-output-retention](../../util/output-retention/README.de.md) — die Vorschau-Mechanik (`TextRetainer`), die die Policy komponiert.
- [Tool-Output-spill-Entscheidung](../../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.de.md) — die Capability-Grenze und die Designbegründung.

-----

<a id="model-experience"></a>
## Model Experience

### Übergroßes Plain-Text-Ergebnis

#### Was das Modell sieht

Ergebnisse an oder unter `maxInlineBytes`, verschachtelte Ergebnisse, `read`-Ergebnisse, blockierte Entscheidungen und Ergebnisse mit Nicht-Text-Blöcken bleiben unverändert. Ein übergroßes modellseitiges Plain-Text-Ergebnis wird zu einer begrenzten Kopf-/Fuß-Vorschau, gefolgt von `(Omitted <bytes> bytes. Full formatted result stored at: <locator>. <retrievalHint>)`; ein Storage- oder Ownership-Fehler lässt das Originalergebnis sichtbar.

#### Token-Effekt

Ein erfolgreicher Ersatz ist höchstens `maxInlineBytes` UTF-8-Bytes und bleibt bis zur compaction im Verlauf; der vollständige spill-Text wird dem Modell nicht erneut gesendet.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und invalidiert keine bestehenden KV-Cache-Einträge.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Einschränkungen definieren, wann die Policy nicht helfen kann. Sie sind aktuelle Paket-Constraints.

- **Texterkennung kann Output nicht authentifizieren** — ein Tool kann denselben Notiztext ausgeben; `hasSpillNotice` identifiziert eine Text-Konvention, keinen Beweis, dass die Policy ein Ergebnis gespeichert hat.
- **Nur finale Plain-Text-Ergebnisse sind spillbar** — Mixed-Content-Ergebnisse, blockiertes Feedback und `read` passieren unverändert; früher erfolgte Provider-Trunkierung oder Tool-eigene Retention kann hier nicht zurückgeholt werden.
- **Eine nicht passende Notiz deaktiviert den Ersatz für diesen Call** — eine winzige Obergrenze oder ein langer Locator lässt das übergroße Original inline, nachdem das Backend bereits einen nicht referenzierten spill gespeichert hat.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Richtungen. Sie ist explizit nicht autoritativ.

#### Zukunft: Per-Tool-Konfiguration

Per-Tool-Opt-out oder Per-Tool-Policy-Deklarationen bleiben zurückgestellt; der eingebaute `read`-Skip deckt die bekannte Schleife ab, und ein zweites reales Tool-Bedürfnis würde eine Konfiguration rechtfertigen.

#### Zukunft: früheres spill

Die Policy sieht nur final formatierten Text, daher bleibt bereits von einem Provider gekappter Inhalt oder Inhalt, der nur als Runtime-Artefakt existiert (zum Beispiel bash-Streams oder subagent-Rollouts), außer Reichweite; Tool-eigenes frühes spill über `ctx.spillStore` ist zurückgestellt.

</details>
