---
description: "Der Retry-Executor für Nutzer und Maintainer, die provider-geroutete Wiederherstellung von Modell-Requests an persistenten Agent-Step-Grenzen konfigurieren."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-retry

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Mounte `@deepseek-ai/dsh-llm-retry`, um fehlgeschlagene Modell-Requests an persistenten Agent-Step-Grenzen zu wiederholen. Provider-`retryPolicy`-Einstellungen wählen begrenzte Normal-Mode-Retries oder unbegrenzte Always-Mode-Retries; geplante Versuche erreichen das Session-Log vor dem Backoff, und Cancellation hinterlässt eine konsistente History. Retries führen den fehlgeschlagenen Step im selben offenen Turn erneut aus, während direkte `ctx.llm.stream()`-Aufrufe einmalig bleiben. Jeder Retry ist ein weiterer abgerechneter Provider-Request, und der Always-Mode läuft bis zum Erfolg, zur Cancellation oder zum Disposal.

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

Mounte dieses Plugin, wenn Agent-Runs von transienten Modell-Request-Fehlern — Rate-Limits, Server-Fehlern, Timeouts, Transport-Fehlern — wiederherstellen sollen, statt den Turn zu beenden. Es ist der Executor: Die Retry-Policy selbst liegt in der Konfiguration des jeweiligen Provider-Adapters, und dieses Paket hat keine eigene Konfiguration.

### Wann es wählen

Wähle es, wenn eine Komposition den Agent-Loop ausführt und persistente Request-Wiederherstellung will. Das Plugin ist ein Function-Plugin ohne Config; Provider-Adapter wie `dsh-llm-deepseek` und `dsh-llm-pi-ai` besitzen die `retryPolicy` für ihre Routen, und Multi-Provider-Adapter platzieren sie in jedem Provider-Profil. Überspringe es, wenn Aufrufe ohne den Agent-Loop direkt über `ctx.llm.stream()` laufen: Diese Consumer bleiben single-attempt, weil ein roher Stream bereits emittierte Chunks nicht persistent trennen kann.

### Minimale Konfiguration

```yaml
- name: '@deepseek-ai/dsh-llm-deepseek'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
    retryPolicy:
      mode: always
      backoff:
        initialDelayMs: 1000
        maxDelayMs: 30000
        jitterRatio: 0.2

- name: '@deepseek-ai/dsh-llm-retry'
```

Weicht `retryPolicy` aus, gilt der Normal-Mode: fünf Retries für `EMPTY_RESPONSE`, `RATE_LIMIT`, `SERVER`, `TIMEOUT` und `TRANSPORT`, mit begrenztem exponentiellem Backoff von 500 ms bis 10 Sekunden und 10 Prozent Jitter. Der Normal-Mode kann sein endliches Budget, die zulässigen Codes und den Backoff ändern; der Always-Mode fragt zuerst die Downstream-Wiederherstellung ab und wiederholt dann jeden Modell-Request-Fehler ohne Versuchslimit — er stoppt nur bei Erfolg, Cancellation oder Plugin-Disposal.

### Was du beobachten kannst

Jeder geplante Retry ist vor seinem Warten persistent: Das Plugin hängt ein non-surface `llm/retry`-Event an, das Retry-ID, Provider, Mode, Policy-Key, Fehler und geplante Verzögerung trägt, dann ein `llm/retry-started`-Event unmittelbar bevor der Retry beginnt. Ein gültiges `Retry-After` des Providers ersetzt den lokalen Backoff, wenn es in die Policy-Grenzen passt. Nach dem Warten führt der Loop den fehlgeschlagenen Step im selben offenen Turn über derselben persistenten History erneut aus, sodass der wiederholte Request genau wie das Original aus dem Session-Log rekonstruierbar ist. Cancellation oder Plugin-Disposal bricht aktiven Backoff ab, lässt aktive delegierte Wiederherstellung auslaufen und lässt einen vor dem Disposal erfassten Callback fail-closed scheitern.

### Fehler und Wiederherstellung

Ein Fehler, bevor ein finaler Adapter gewählt ist, hat keine Provider-Policy und delegiert unverändert downstream. Im Normal-Mode delegiert ein Fehlercode außerhalb der zulässigen Menge oder ein erschöpftes Budget; im Always-Mode nutzt eine über dem Limit liegende Provider-Verzögerung den konfigurierten lokalen Backoff, sodass die Policy an dieser Anweisung nicht terminieren kann. Nichts davon ist modell-sichtbar: Kein Retry-Event, keine Verzögerung, kein Provider-Fehler und keine fehlgeschlagene Teilausgabe erreicht das Modell oder abgeleitete Messages.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design hinter dem Executor; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig abgedeckt.

### Designphilosophie

Der Executor folgt einer Regel: **Persistent vor dem Warten, offene Step-Grenzen.** Ein Retry wird über das Session-Log geplant, bevor irgendein Timer startet, sodass ein Crash oder eine Cancellation niemals einen unsichtbaren schwebenden Retry hinterlässt. Die Wiederherstellung läuft auf dem `agent/request-error`-Waterfall des Agent-Loops, dem Extension Point für offene Steps, statt `ctx.llm.stream()` zu wrappen — ein roher Stream kann bereits emittierte Chunks nicht persistent trennen, während der Loop den fehlgeschlagenen Step im selben offenen Turn erneut ausführen kann.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Das Function-Plugin: Waterfall-Listener, Policy-Lookup, Backoff, persistente Event-Appends |
| [`src/history.ts`](src/history.ts) | Persistenter Retry-History-Lookup aus dem Session-Log |
| [`src/types.ts`](src/types.ts) | Browser-sichere `llm/retry`- und `llm/retry-started`-Event-Payload-Typen |
| [`src/brand.ts`](src/brand.ts) | Das von den Event-Payloads geteilte `RetryId`-Brand |

### Wiederherstellungsfluss

Ein fehlgeschlagener Step erreicht den Waterfall mit seinem Provider und der aufgelösten Policy. Der Always-Mode lässt die Downstream-Wiederherstellung zuerst auslaufen und folgt einer Downstream-`retry`-Entscheidung; der Normal-Mode prüft zuerst, ob der Fehlercode zulässig ist und das Budget nicht erschöpft. Das Plugin berechnet die Verzögerung — Provider-`Retry-After`, wenn gültig und innerhalb der Grenzen, sonst lokaler begrenzter exponentieller Backoff mit symmetrischem Jitter —, hängt das `llm/retry`-Event an, wartet auf einem abbrechbaren Timer, hängt `llm/retry-started` an und gibt `{ kind: 'retry' }` zurück. Der Loop führt den fehlgeschlagenen Step dann im selben offenen Turn über derselben persistenten History erneut aus.

### Waterfall-Komposition

Das Plugin ist ein Listener im `agent/request-error`-Waterfall. Die „Downstream zuerst"-Haltung des Always-Mode bedeutet, dass eine spätere Policy, die Cancellation ignoriert und nie ausläuft, auch verhindert, dass Fallback, Turn-Quiescence und Plugin-Disposal abschließen; Erfolg, Cancellation oder Disposal stoppt den Always-Mode, nachdem die aktive delegierte Wiederherstellung Quiescence erreicht hat.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie bewegen sich vom Service-Vertrag zu den Adaptern, die Retry-Policies besitzen.

- [dsh-llm-Service](../llm/README.de.md) — der provider-neutrale Service, dessen Adapter `retryPolicy` besitzen.
- [llm-deepseek-Adapter](../llm-deepseek/README.de.md) — ein Provider-Adapter mit routenweiser `retryPolicy`.
- [llm-pi-ai-Adapter](../llm-pi-ai/README.de.md) — ein Multi-Provider-Adapter mit `retryPolicy` pro Profil.
- [Terminale LLM-Stream-Fehler](../../../.agents/notes/implemented/architecture/2026-07-29-terminal-llm-stream-failures.de.md) — wie Fehler als terminale Chunks die Service-Grenze erreichen.
- [LLM-Streaming-Subsystem](../../../docs/subsystems/llm-streaming.de.md) — das `StreamChunk`-Protokoll und der Adapter-Vertrag.

-----

<a id="model-experience"></a>
## Model Experience

### Wiederherstellung von Modell-Requests

#### Was das Modell sieht

Kein Retry-Event, keine Verzögerung, kein Provider-Fehler und keine fehlgeschlagene Teilausgabe ist modell-sichtbar. Der wiederholte Step rekonstruiert denselben expliziten Provider-/Modell-Request aus der persistenten Surface-History, es sei denn, eine Downstream-Wiederherstellungspolicy ändert diese Surface absichtlich; fehlgeschlagene Chunks gelangen niemals in abgeleitete Messages.

#### Token-Effekt

Jeder Retry ist ein neuer Provider-Request und kann die Input-Token-Abrechnung wiederholen. Der Normal-Mode hat ein endliches Budget; der Always-Mode kann bis zum Erfolg oder zur Cancellation unbegrenzt Requests verbrauchen. `llm/retry` selbst trägt keine Tokens bei.

#### KV-Cache-Effekt

Der rekonstruierte Request erhält das vorherige Präfix und kommt unter den Regeln des jeweiligen Providers für Cache-Wiederverwendung infrage. Das non-surface Retry-Event ändert die Cache-Identität nicht.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo der Executor aufhört und künftige Arbeit beginnt. Es sind aktuelle Paket-Constraints, kein allgemeiner Retry-Vergleich und kein Aufgabenrückstand.

- **Agent-Turns sind die einzige Retry-Grenze** — direkte `ctx.llm.stream()`-Consumer bleiben single-attempt, weil ein roher Stream bereits emittierte Chunks nicht persistent trennen kann.
- **Always-Mode wiederholt permanente Fehler** — Authentifizierungs-, Quota-, Invalid-Request-, Protokoll- und nicht wiederherstellbare Kontext-Fehler laufen bis zum Erfolg, zur Cancellation oder zum Disposal; Deployments besitzen provider-spezifische Kosten- und Latenzkontrollen.
- **Endliche Plugin-Budgets addieren sich** — der Normal-Mode zählt nur seine konfigurierten Codes und die exakte Provider-Policy, während Context-Overflow-Compaction ein eigenes Budget besitzt. Jede überlappende Policy muss Verhalten bei der Registrierungsreihenfolge definieren.
- **Wiederherstellungspolicies komponieren in Waterfall-Reihenfolge** — der Always-Mode akzeptiert einen Downstream-Retry, bevor er seinen Fallback anwendet. Eine spätere Policy, die Cancellation ignoriert und nie ausläuft, verhindert auch, dass Fallback, Turn-Quiescence und Plugin-Disposal abschließen.
- **`llm/retry` zeichnet die Planung auf, nicht den Abschluss** — spätere Step- und Turn-Events etablieren Erfolg, Erschöpfung oder Cancellation.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist nicht-autoritativer Arbeitskontext: Hinweise für Maintainer und offene Fragen. Ausgeliefertes Verhalten und akzeptierte Begründungen stehen in den Abschnitten oben, im Paket-Code und in den verlinkten Agent Notes.

- Retry-Nummern laufen nur über Events mit demselben Provider und vollständigem Policy-Key weiter, sodass ein Routenersatz mit anderen Limits, Code-Mitgliedschaften oder Backoff eine eigene History eröffnet; der Key enthält jedes verhaltensrelevante Feld und sortiert Normal-Mode-Codes, weil die Zulässigkeit Mengen-Mitgliedschaft nutzt.
- Der separat veröffentlichte `./invariant`-Companion validiert jeden geplanten Retry gegen das Session-Log — er nennt den aktuellen offenen Turn und den letzten geschlossenen Step, gleicht den persistenten Provider des fehlgeschlagenen Requests ab und verlangt, dass jedes `llm/retry-started`-Event einen früheren geplanten Versuch mit derselben Retry-ID, demselben Turn, Step und derselben Retry-Nummer nennt.

</details>
