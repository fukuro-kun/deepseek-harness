---
description: "Begrenzte modellzugewandte Ausgabe für Tools, die kappen müssen, wie viel Kontext sie zurückgeben: Item- und Text-Retainer sowie ein standardisierter Auslassungs-Footer."
kind: "package-library"
---

# @deepseek-ai/dsh-output-retention

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Verwende `dsh-output-retention`, um die Items oder den Text zu begrenzen, die ein Tool an ein Modell zurückgibt, und dabei zu melden, was ausgelassen wurde. `ItemRetainer` hält ein geordnetes Head-Fenster und kann eine exakte Anzahl ausgelassener Items melden; `TextRetainer` hält Head-, Tail- oder Head-and-Tail-Bytefenster, ohne ungültige UTF-8-Schnitte zurückzugeben. `formatRetentionNotice` fügt einen konsistenten Auslassungssatz hinzu, während jedes Tool seine eigene Recovery-Anweisung liefert. Gruppierung, Zeilennummerierung, spill-Dateien und Provider-Fehler bleiben Aufgabe der Tools; Consumer importieren diese Bibliothek direkt, statt sie über `cordis.yml` zu laden.

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

Verwende einen Retainer überall dort, wo ein Tool kappen muss, wie viel seines Ergebnisses das Modell erreicht, und ehrlich melden muss, was verworfen wurde. Wähle `ItemRetainer` für geordnete logische Einheiten und `TextRetainer` für byteorientierte Streams.

### Eine Item-Liste begrenzen

```ts
import { ItemRetainer } from '@deepseek-ai/dsh-output-retention'

declare const globMaxResults: number
declare const candidates: AsyncIterable<{ path: string }>
const retainer = new ItemRetainer<{ path: string }>({ kind: 'head', maxItems: globMaxResults })
for await (const entry of candidates) {
  retainer.push(entry)          // keep draining past the cap for an exact count
}
const { items, truncated, omitted } = retainer.finish()
```

`push()` meldet pro Item, ob es behalten wurde, und `finish()` gibt die behaltenen Items plus `omitted` zurück — eine exakte Anzahl, wenn der Aufrufer jede beobachtete Einheit weiter einspeiste. Ein Such-Tool kann die vollständige Ergebnismenge für eine spill-Datei sammeln und dabei nur die erste Seite für das Modell behalten.

### Einen Text-Stream begrenzen

```text
import { TextRetainer } from '@deepseek-ai/dsh-output-retention'

const out = new TextRetainer({ kind: 'headTail', headBytes: headCap, tailBytes: tailCap })
child.stdout.on('data', (chunk: Buffer) => { out.push(chunk) })
const { text, omittedBytes } = out.finish()
```

`head`, `tail` und `headTail` zählen Bytes, nicht Zeichen oder Zeilen: Die Pipe eines Kindprozesses und ein HTTP-Body sind Byte-Streams. `finish()` stutzt an jedem Schnitt ein unvollständiges Codepoint ab, sodass der zurückgegebene Text nie einen durch den Schnitt eingeführten Ersatzzeichen trägt, und ein Codepoint wird nie über die ausgelassene Mitte hinweg rekonstruiert.

### Den Auslassungs-Footer bauen

```ts
import { formatRetentionNotice } from '@deepseek-ai/dsh-output-retention'

declare const grepMaxMatches: number
declare const items: { length: number }
import type { Omitted } from '@deepseek-ai/dsh-output-retention'

declare const omitted: Omitted

const footer = formatRetentionNotice(
  { scope: 'grep', strategy: 'head', unit: 'items', limit: grepMaxMatches, kept: items.length, omitted },
  ({ kept }) => `Results capped at ${kept}. Narrow the pattern, path, or include to see more.`,
)
```

Die Bibliothek standardisiert den Auslassungssatz (`Omitted 3 items.`) und verbindet ihn mit der eigenen Recovery-Anweisung des Tools; nur das Tool kennt die Recovery-Aktion, also liefert das Tool diesen Wortlaut.

### Was `truncated` bedeutet

`truncated` ist eine Budget-Tatsache: Der Retainer hat wegen einer Kappe ansonsten verfügbaren Inhalt ausgelassen. Es bedeutet nie, dass die Quelle unvollständig war — Permission-Fehler, übersprungene Binärdateien, partielle Provider-Fehler und unlesbare Kandidaten bleiben in Tool-Domänen-Feldern und werden nie in `truncated` gefaltet.

### Wie die aktuellen Tools es verwenden

| Tool | Retainer | Was das Tool weiterhin besitzt |
|---|---|---|
| `glob` | `ItemRetainer`, `head` | spill-Datei-Sammlung, Pfad-Mapping, übersprungene Kandidaten, `incomplete` |
| `grep` | `ItemRetainer`, `head` | spill-Datei-Sammlung, Preview-Kürzung pro Match, Gruppierung, Sortierung |
| `bash` | `TextRetainer`, `tail` oder `headTail` | spill-Dateien, Exit-Status, Signal, Timeout, Hintergrund-Jobs |
| `web_fetch` | `TextRetainer`, `head` oder `headTail` | Provider- und Ressourcen-Obergrenzen, Fehlerzustände |
| `web_search` | `ItemRetainer`, `head` | Der Wortlaut des „sources capped"-Hinweises und Provider-Fakten |

`read` bleibt außerhalb dieser Bibliothek: Seine Zeilenfenster-Paginierung (`offset`/`limit`, Zeilennummern, `totalLines`) ist ein dateispezifischer Renderer, den eine einzelne Auslassungszahl nicht darstellen kann.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Die Bibliothek baut auf einer einzigen Trennung auf: Sie besitzt die mechanische Frage, was behalten und was ausgelassen wurde; die Tool-Pakete besitzen jede fachliche Bedeutung.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `ItemRetainer`, `TextRetainer`, `describeOmitted` und `formatRetentionNotice` |
| — | Es wird kein Runtime-Invariant-Begleiter veröffentlicht; dieses reine Utility besitzt keinen Event-Stream und keine veränderlichen Runtime-Daten; seine Wertalgebra wird durch Unit-Tests abgesichert. |

### Zwei Retainer, zwei Ressourcenmodelle

`ItemRetainer` begrenzt geordnete logische Einheiten und behält nur die ersten `maxItems`; der Aufrufer speist jede beobachtete Einheit weiter ein, sodass die Auslassungszahl exakt ist. `TextRetainer` begrenzt Bytes mit einem gemeinsamen Prefix/Suffix-Akkumulator: `head` ist nur Prefix, `tail` ist nur Suffix, `headTail` ist beides, und der Akkumulator hält höchstens `headBytes + tailBytes + ein Chunk` im Speicher, sodass ein großer Stream nicht unbegrenzt anwächst.

### Wie die Budget-Fakten ehrlich bleiben

`push()` gibt `kept` zurück (diese Einheit oder dieses Chunk wurde vollständig behalten) und `truncated` (irgendetwas wurde bereits verworfen). `finish()` meldet die Auslassung gegenüber den tatsächlich zurückgegebenen Bytes, sodass ein UTF-8-Grenzschnitt, der Teil-Codepoint-Bytes verwirft, ebenfalls gezählt wird — ein nur aus dem Budget abgeleiteter Hinweis würde den behaltenen Text überschätzen. `describeOmitted` gibt nur für `exact` eine Anzahl aus; `unknown` gibt keine Anzahl aus, weil der Aufrufer keine geliefert hat.

### Der Ausschluss des read-Renderers

Die `offset`/`limit`-Paginierung von `read` ist ein Zeilenfenster-Renderer mit eigener Byte-Obergrenze über dem gewählten Fenster; ein einzelner `Omitted`-Wert kann nicht beide Seiten dieses Fensters darstellen, daher bleibt er außerhalb dieser Bibliothek.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn du die Consumer oder die Boundary-Entscheidung hinter der Bibliothek brauchst.

- [spill-Policy](../../spill/spill-policy/README.de.md) — komponiert `TextRetainer` für eine begrenzte Vorschau um einen spill-Datei-Hinweis.
- [spill-Subsystem](../../../docs/subsystems/spill.de.md) — das spill-Vokabular, dem die Preview-Mechanik dieser Bibliothek dient.
- [Dateisuch-Tool](../../fs/tool-fs-search/README.de.md) — ein `ItemRetainer`-Consumer, der vollständige Ergebnisse für spill sammelt.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über die Retention-Consumer, die behaltenen Inhalt und Auslassungs-Metadaten rendern.

#### KV-Cache-Effekt

Keine direkte Invalidierung; die Retention-Consumer besitzen etwaige Änderungen des Request-Prefix.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was die Retainer bewusst nicht abdecken. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Item-Retention unterstützt nur `head`** — tail, head/tail, Paginierung, Gruppierung und Provider-Vollständigkeitssemantik bleiben im Besitz der Tools.
- **Text-Retention ist byteorientiert** — Zeilen- und Zeichenfenster wie die `read`-Paginierung erfordern einen separaten Renderer, und ein Schnitt kann partielle UTF-8-Randbytes verwerfen, um den zurückgegebenen Text gültig zu halten.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
