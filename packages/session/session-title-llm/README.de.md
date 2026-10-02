---
description: "Geteilte modellgestützte Titelgenerierungs-Policy für Nutzer und Maintainer, die Titel-Provider konfigurieren oder auxiliary LLM-Requests debuggen."
kind: "package-library"
---

# @deepseek-ai/dsh-session-title-llm

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-session-title-llm` generiert prägnante Session-Titel aus ausgewählten Human-Messages mit einer konsistenten Model-Request-Policy. Aufrufer wählen, welche Messages zu jeder Revision beitragen, und können entweder eine Provider- und Model-Route gemeinsam liefern oder die für die aktuelle Session aufgezeichnete Route verwenden. Pflicht-Limits begrenzen den geframten Input, die generierte Ausgabe und die End-to-End-Dauer, während Caller-Cancellation während des gesamten Streamings wirksam bleibt. Ungültige, leere, verspätete, Tool-Call- oder anderweitig nicht-textuelle Ergebnisse werden rejected, bevor sie einen Titel ersetzen können.

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

Als Deployment diese Policy über das [first-prompt](../session-title-first-prompt-llm/README.de.md)- oder [all-prompts](../session-title-all-prompts-llm/README.de.md)-Provider-Plugin konfigurieren. Als Provider-Autor über den geteilten Helper registrieren statt Generierung von Hand zu bauen.

### Einen Provider registrieren

Ein Provider-Plugin ruft `registerSessionTitleLlmProvider(ctx, config, id, automatic, selectMessages)`; der Helper validiert die geteilte Config, registriert den Provider auf `ctx.sessionTitle` und lässt jede Generierung durch die geteilte Policy laufen. Die zwei mitgelieferten Plugins registrieren die `first-prompt`- und `all-prompts`-Kadenzen mit ihren Message-Selektoren, und eine zweite Registrierung auf dem Service wirft.

### Route- und Failure-Contract

Die `provider`- und `model`-Overrides sind optional, müssen aber gemeinsam als nicht-leere Strings geliefert werden. Ohne dieses Paar nutzt der Helper die exakte Provider-/Model-Route, die aus dem geloggten `request/header` der aktuellen Session erfasst wurde, sodass ein explizites Refresh, bevor irgendeine Route existiert, Overrides braucht. Der Helper misst den finalen JSON-geframten User-Prompt gegen `maxInputBytes`, bevor er loggt oder dispatched, statt ihn zu truncaten, und prüft Timeout und Caller-Cancellation während des Stream-Konsums und nach dessen Abschluss erneut — ein verspätetes Erfolgsergebnis kann also nicht akzeptiert werden, selbst wenn ein Interceptor oder Adapter das Abort ignoriert. Malformed oder leerer Output, Tool-Calls und nicht-stop Finish-Reasons rejecten; der Session-Title-Service entscheidet, ob dieses Rejection eine automatische Warnung oder ein expliziter Caller-Failure ist.

### Konfiguration

<a id="configuration"></a>

Jedes Feld ist Pflicht außer dem gepaarten Route-Override; es gibt keine Library-Defaults.

| Key | Default | Bedeutung |
|---|---|---|
| `targetWords` | Pflicht | Ziel-Wortzahl für nicht-CJK-Titel |
| `targetCjkCharacters` | Pflicht | Ziel-Zeichenzahl für chinesische, japanische oder koreanische Titel |
| `maxInputBytes` | Pflicht | UTF-8-Byte-Obergrenze für den finalen JSON-geframten User-Prompt |
| `maxOutputTokens` | Pflicht | Token-Cap der auxiliary Generierung |
| `timeoutMs` | Pflicht | End-to-End-Deadline innerhalb des Runtime-Timer-Limits |
| `provider`, `model` | optional | Explizite Route; beide oder keines |

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt den Generierungspfad; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Eine geteilte Policy, damit Provider-Plugins nicht driften können: Config-Validierung, Route-Auflösung, Prompt-Framing, Budget-Enforcement, Cancellation und Output-Validierung leben alle hier, parametrisiert nur über Kadenz und Message-Selektor des Providers.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Config-Schema und -Validierung, Provider-Registrierungs-Helper, Request-Framing, Dispatch und Output-Validierung |

### Request-Fluss

Eine Generierung validiert die Config einmal bei der Registrierung; jede Revision framet die ausgewählten Messages als JSON, misst die UTF-8-Bytes des geframten Prompts gegen `maxInputBytes`, löst die Route auf (das explizite Paar oder das geloggte `request/header`), hängt ein nur-geloggtes `session/title-llm-request`-Event mit dem exakt dispatchbaren Request an und streamt dann über `ctx.llm` unter einer komponierten Timeout- und Cancellation-Deadline. Das dispatche Envelope trägt `purpose: 'session-title'` und enthält bewusst nicht die prozesslokale Request-Identität des Agent-Loops; der DeepSeek-Adapter bildet diesen Purpose auf thinking-disabled ab, damit das kleine Output-Budget für sichtbaren Titeltext reserviert bleibt, und andere Adapter besitzen ihr purpose-spezifisches Verhalten. Output assemblt nur zu Text-Blocks; Tool-Calls, malformed oder leerer Output und nicht-stop Finish-Reasons rejecten, und ein späterer Modellfehler lässt den Request-Record intakt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn die Generierungspolicy nicht ausreicht. Sie bewegen sich vom Service, in den sie sich einhängt, zu den Provider-Plugins, die sie konsumieren.

- [Session-Title-Service](../session-title/README.de.md) — der Title-Service, Fallback-Verhalten und der Provider-Registrierungs-Contract.
- [Session-Title-Subsystem](../../../docs/subsystems/session-title.de.md) — persistenter Titelzustand und der auxiliary Request-Record.
- [First-Message-Titel-Provider](../session-title-first-prompt-llm/README.de.md) — Titel aus der ersten zulässigen Human-Message.
- [All-Messages-Titel-Provider](../session-title-all-prompts-llm/README.de.md) — Titel aus jeder zulässigen Human-Message.
- [Session-Paketkarte](../README.de.md) — benachbarte Persistence-, Projection-, Title- und Telemetry-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

### Auxiliary Title-Request

#### Was das Modell sieht

Das Titelmodell erhält eine fixe System-Instruktion, einen prägnanten, unverzierten Titel in der Eingabesprache zurückzugeben, einschließlich der konfigurierten Wort- und CJK-Zeichen-Ziele. Seine eine User-Message enthält ein JSON-Array der exakt ausgewählten Human-Messages und ihrer seqs.

#### Token-Effekt

Der auxiliary Request verbraucht Tokens entsprechend der ausgewählten Input-Größe und `maxOutputTokens`. Er ist vom Haupt-Agent-Request getrennt und fügt der Agent-History weder Titeltext noch Framing hinzu. DeepSeek-Titel-Calls deaktivieren Thinking; die Hauptkonversation behält ihren konfigurierten Thinking-Modus.

#### KV-Cache-Effekt

Keine Invalidierung des Haupt-Requests. Die auxiliary Cache-Wiederverwendung ist provider-spezifisch; die fixe Instruktion ist wiederverwendbar, während sich das JSON-Message-Array mit jeder Revision ändert.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die akzeptierten Generierungsformen. Sie sind aktuelle Paket-Constraints.

- **Nur Text-Output** — der Helper akzeptiert Text-Output und rejectet Tool-Calls; Structured-Output-Adapter und provider-spezifische Prompt-Varianten werden nicht exponiert.
- **Ganz-Prompt-Byte-Obergrenze** — er erzwingt eine Byte-Obergrenze für den gesamten geframten User-Prompt, statt einzelne Messages zu stutzen oder eine Retention-Policy anzuwenden.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariant:** Es wird kein Companion veröffentlicht. Dieser zustandslose Helper validiert und friert jeden auxiliary Request vor dem Dispatch ein; Deadline, Stream, zitierte Message-seqs und Provider-/Model-Felder werden synchron und durch Tests geprüft.
