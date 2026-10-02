---
description: "Kooperative Zeitgrenze für cancellation-aware Tool Calls, die ein eingetretenes Timeout auf einen klaren Modellfehler abbildet, für Anwender und Maintainer, die das Plugin wählen oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-call-timeout-policy

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Dieses Paket verwenden, um Tool Calls ihre konfigurierten kooperativen Zeitgrenzen zu geben und dem Modell nach dem Settlement der Cancellation einen klaren Timeout-Fehler zurückzugeben. Calls, die rechtzeitig fertig werden, bleiben unverändert. Ein Tool, das Cancellation ignoriert oder langsam behandelt, kann den Aufrufer weiter warten lassen, weil das Paket nachgelagerte Arbeit nicht hart stoppen kann. Jedes Tool liefert sein eigenes Limit; das Paket hat keine Konfiguration und ist im `dsh`-Base-Bundle aktiviert.

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

Der übliche Weg ist eine Zeile: das Plugin zur Komposition hinzufügen — das `dsh`-Base-Bundle enthält es bereits. Tools mit konfiguriertem Limit sind automatisch geschützt; jedes andere Tool bleibt unberührt.

### Wann es die richtige Wahl ist

Es ist zu wählen, wenn das Modell Tools aufruft, die lange dauern können, diese Tools `exec.signal` beachten und nach dem Settlement der Cancellation eine vorhersagbare Timeout-Antwort gewünscht ist. Zu vermeiden ist es, wenn ein Tool an seinem Limit hart gestoppt werden muss — das Plugin kann ein Tool nur zum Stoppen auffordern, sodass ein Tool, das Cancellation ignoriert, weiterläuft und den Aufrufer warten lässt — und wenn ein einheitliches Default-Limit für jedes Tool gewünscht ist, weil das Limit jedes Tools aus dessen eigener Konfiguration kommt.

### Einrichtung

Das Plugin ohne Konfiguration mounten:

```yaml
- name: '@deepseek-ai/dsh-tool-call-timeout-policy'
```

Das Limit wird dort gesetzt, wo das Tool konfiguriert ist. Zum Beispiel setzen `dsh-tool-web`s `fetchTimeoutMs`/`searchTimeoutMs`-Einstellungen (Standard 30.000 ms) das Limit auf `web_fetch` und `web_search`. Tools ohne Limit — die mitgelieferten `bash`, `read`, `write` und `edit` — werden nie abgeschnitten. Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-web) listet die Tool-Einstellungen, die Limits erzeugen.

### Was man bekommt

Wenn die Deadline feuert, abortet das Plugin das abgeleitete `exec.signal`. Nachdem der nachgelagerte Code die Cancellation beachtet und `next()` settled, erhält das Modell `Error: tool call timed out after <ms>ms` als Error-Result, sodass es entscheiden kann, zu wiederholen, anzupassen oder aufzugeben. Ein Tool, das das Signal ignoriert oder langsam behandelt, lässt den Aufrufer warten und produziert kein Timeout-Result, bis es settled; Calls, die rechtzeitig fertig werden, bleiben unverändert.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie das Plugin um jeden Dispatch eine Deadline armiert und sie auf das `TOOL_TIMEOUT`-Result abbildet, und verweist auf den Code, der das umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designphilosophie

Der Wrapper steht auf vier Zusagen:

- **Enforcement-Heimat, keine Library.** `dsh-timeout` besitzt Timing und Klassifikation (`deadline`, `timeoutOf`); dieses Plugin besitzt die Per-Call-Verdrahtung über `tools/execute`; jede Capability besitzt die Termination. Die Aufteilung ist in der [Timeout-Deadline-Library-Agent-Note](../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.de.md) festgehalten.
- **Das Tool deklariert sein eigenes Budget.** `timeoutMs` liegt auf der `ToolDefinition` des Tools, gelesen aus der Registry (`ctx.tools.get(exec.name, exec.agent)?.timeoutMs`), sodass ein falsch getippter Tool-Name unmöglich ist und nicht deklarierte Tools unberührt delegieren.
- **Scoped Klassifikation.** `TOOL_TIMEOUT` dient als interner `deadline`-Klassifikationscode und als strukturierter Error-`code`; das Scopen von `timeoutOf` darauf verhindert, dass eine verschachtelte äußere Deadline (der Timer eines anderen Wrappers, der zuerst feuerte) als Timeout dieses Plugins fehlinterpretiert wird — sie liest sich als gewöhnlicher Upstream-Cancel.
- **Signal tauschen, dann zurücksetzen.** Cordis `next()` ignoriert übergebene Argumente, daher mutiert der Wrapper das geteilte `exec` in place: Er tauscht das abgeleitete Deadline-Signal für den Dispatch auf `exec` und stellt das Signal des Aufrufers in einem `finally` wieder her, sodass `tools/post-execute`-Listener das möglicherweise abgebrochene Signal dieses Plugins nie sehen.

### Wie eine Deadline armiert und gemappt wird

Ein `tools/execute`-Listener liest das deklarierte Limit des dispatched Tools aus der Registry (`ctx.tools.get(exec.name, exec.agent)?.timeoutMs`); ein Tool ohne Limit delegiert unberührt. Für ein limitiertes Tool baut `deadline(exec.signal, timeoutMs, TOOL_TIMEOUT)` ein fusioniertes Signal, das der Wrapper für den Dispatch auf `exec` tauscht und in einem `finally` zurücksetzt, sodass `tools/post-execute`-Listener das abgeleitete Signal nie sehen. Wenn der eigene Timer des Wrappers feuerte — `timeoutOf(d.signal, 'TOOL_TIMEOUT')` per Code gescoped, sodass eine verschachtelte äußere Deadline als gewöhnlicher Upstream-Cancel gelesen wird — wird das dispatched Result, bereits durch den Dispatch in ein Error-Result normalisiert, durch das strukturierte Result ersetzt: `isError: true`, Inhalt `Error: tool call timed out after <ms>ms` und Error-Info `{ name: 'ToolTimeoutError', code: 'TOOL_TIMEOUT' }`.

### Komposition mit anderen Wrappern

Mehrere `tools/execute`-Listener komponieren nach Cordis-Registrierungsreihenfolge, die die Semantik wählt: Der außen registrierte Timeout deckt eine ganze Retry-Operation ab, der innen registrierte deckt jeden Versuch ab.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `TOOL_TIMEOUT`, `name`/`inject`/`apply`, der `tools/execute`-Wrapper |
| — | Es wird kein Runtime-Invariant-Begleitmodul veröffentlicht; dieses zustandslose Policy-Plugin besitzt keine paketlokale Event-Historie oder veränderbare Datenrelation jenseits des Seam, den es abfängt. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der paketweite Contract nicht ausreicht. Sie führen von der Tool-Call-Pipeline zur Timeout-Library-Aufteilung, den durchgesetzten Limits und der Guard-Gruppenkarte.

- [Tools-Subsystem-Referenz](../../../docs/subsystems/tools.de.md) — der `tools/execute`-Waterfall und die Decision-Shapes, an die dieser Wrapper hakt.
- [Agent Note zur Timeout-Deadline-Library](../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.de.md) — die Timing/Termination-Aufteilung und warum die Deadline nur benachrichtigt.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-web) — `dsh-tool-web`s `fetchTimeoutMs`/`searchTimeoutMs`-Budgets, die die Policy durchsetzt.
- [Guard-Gruppenkarte](../README.de.md) — die Schwester-Guard-Pakete und die Loop-Hygiene-Familie.

-----

<a id="model-experience"></a>
## Model Experience

### Bedingtes Tool-Result

#### Was das Modell sieht

Dieses Plugin fügt keinen Prompt und kein Schema hinzu. Wenn eine deklarierte Deadline gewinnt und die nachgelagerte Cancellation settled, ersetzt es das Ergebnis des Providers durch `Error: tool call timed out after <ms>ms` plus den strukturierten `TOOL_TIMEOUT`-Fehler; sonst geht das ursprüngliche Result unverändert durch. Ein nachgelagerter Call, der nie settled, kann kein Timeout-Result erzeugen.

#### Token-Effekt

Null Tokens bei Nicht-Timeout-Calls. Ein Timeout fügt ein kleines, gehaltenes Error-Result hinzu und kann verhindern, dass ein größeres spätes Provider-Result in den Kontext gelangt.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Prefix und invalidiert keine bestehenden KV-Cache-Einträge.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen bestimmen, wann die Policy ungeeignet ist. Sie sind aktuelle Paketbedingungen, kein Aufgabenrückstand.

- **Kooperativ, nie ein harter Kill** — die Deadline benachrichtigt nur über `exec.signal`; ein Tool, das das Signal ignoriert, stoppt beim Timeout nicht, der Wrapper bleibt innerhalb von `await next()`, und das Modell erhält kein Timeout-Result, bis die nachgelagerte Arbeit settled.
- **Kein Blanket-Budget** — nur Tools, die `timeoutMs` auf ihrer `ToolDefinition` deklarieren, bekommen eine Deadline; nicht deklarierte Tools (die mitgelieferten `bash`, `read`, `write` und `edit` deklarieren keins) haben keinen registry-weiten Default.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und Richtungen, die nicht entschieden sind. Sie ist ausdrücklich nicht autoritativ — geliefertes Verhalten, Grenzen und akzeptierte Begründungen leben in den Abschnitten oben, dem Paket-Code und den verlinkten Agent Notes.

Das FIXME in `src/index.ts` verlangt, eine Umbenennung zu `@deepseek-ai/dsh-timeout-guard` zu klären; das [Naming-Ledger](../../../.agents/notes/archived/architecture/2026-08-11-repository-naming-contract-and-rename-ledger.md) hält `@deepseek-ai/dsh-tool-call-timeout-policy` bereits als den beschlossenen Namen fest, sodass das FIXME bis zu einem Code-Cleanup veraltet ist.

</details>
