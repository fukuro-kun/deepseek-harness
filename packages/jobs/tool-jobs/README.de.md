---
description: "Die model-zugewandten Hintergrund-Job-Steuerungen für Benutzer und Maintainer, die job_output, job_list, job_kill und Abschluss-Benachrichtigungen auswählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-jobs

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Mit `dsh-tool-jobs` lassen sich Hintergrund-Befehle, PTY-Arbeit und Subagents über `job_output`, `job_list` und `job_kill` prüfen und steuern. Lesevorgänge können innerhalb eines konfigurierten Timeouts warten, Listenergebnisse nennen Art und Status jedes Jobs, und eine Cancellation gilt erst nach dem tatsächlichen Stopp der Arbeit als abgerechnet. Wenn zugeordnete Arbeit endet, erhält der Agent eine In-Session-Benachrichtigung: Beschäftigte Agents erhalten sie in ihrem nächsten Schritt, während inaktive Agents durch eine begrenzte Folge-Turn geweckt werden können. Die Konfiguration steuert Warte-Limits, Zustellung der Abschlussmeldung und aufeinanderfolgende Wakeups. Stream-Ausgabe wird von genau einem Leser verbraucht, und ausstehende Benachrichtigungen überleben das Dispose des Owners nicht.

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

Dieses Plugin in jeder Komposition laden, in der der Agent Hintergrund-Jobs starten, beobachten und stoppen soll: Es registriert die drei Tools, hängt den von Produzenten benötigten Controller an und stellt Abschluss-Benachrichtigungen zu. Es benötigt die Services `ctx.tools`, `ctx.jobs` und `ctx.systemPrompt` aus dem komponierten Harness.

### Die drei Tools

- `job_output(job_id, wait?, timeout_ms?)` — die Ausgabe eines Jobs lesen. Stream-Jobs liefern nur die Ausgabe seit dem letzten Lesen; Final-Output-Jobs liefern ihr Ergebnis nach Abrechnung. Jede Antwort endet mit `[status: ...]`. Lesevorgänge sind nicht-blockierend, es sei denn `wait: true`, das bis zum konfigurierten Limit wartet und einen noch laufenden Job bei Timeout am Leben lässt.
- `job_list()` — die eigenen Hintergrund-Jobs mit ihren ids, Arten und Status auflisten, einer pro Zeile: `<id> [<kind>] <status> — <label>`.
- `job_kill(job_id, reason?)` — die Cancellation eines laufenden Jobs sofort anfordern; der Job wird als `killed` abgerechnet, sobald seine Arbeit tatsächlich stoppt. Ein terminierter Job liefert seinen aktuellen Snapshot zurück, und der optionale Grund wird aufgezeichnet und an den Job weitergeleitet.

Die drei Tools geben `{ text, job }`, `PublicJobSnapshot[]` bzw. `{ outcome: 'cancellation-requested' | 'already-finished', job }` zurück. Ein öffentlicher Snapshot trägt id, kind, label, status/detail sowie Start- und Endzeiten und lässt Besitz- und Benachrichtigungs-Buchhaltung weg. Alle drei rendern über generische UI-Cards: `read` für Output und List, `execute` für Kill.

### Abschluss-Benachrichtigungen

Wenn ein Job endet, erhält der besitzende Agent `background job <id> (<kind>: <label>) finished [status: ...]. Read its output with job_output.` als In-Session-Nachricht. Einem beschäftigten Agent wird die Benachrichtigung in seinen nächsten Schritt injiziert — die Turn kann nicht schließen, solange die Inbox sie hält, sodass mehrere gleichzeitig abgerechnete Jobs einen Schritt statt je einer Turn kosten. Ein inaktiver Agent wird stattdessen mit einer Folge-Turn geweckt, weil eine unabgeholte Benachrichtigung ein Abschluss ist, von dem das Model nie erfährt. Ein Kill oder ein Lesen/Warten auf einen terminierten Job markiert den Abschluss als gemeldet und unterdrückt die redundante Benachrichtigung, ebenso wie die Teardown-Cancellation, die einen Owner oder den Service leert.

Das Wecken ist begrenzt: Jeder Owner darf höchstens `maxConsecutiveWakes`-mal geweckt werden, bevor weitere Benachrichtigungen auf Injektion herabgestuft werden, und das Abholen einer beliebigen benutzerverfassten Nachricht stellt das Budget wieder her. Die Grenze existiert, weil die Kette sich selbst anregt — eine geweckte Turn kann den Hintergrund-Job starten, dessen Abschluss sie erneut weckt. `completionDelivery: quiet` hält auch inaktive Owner auf der Injektionsspur, was deterministische Transkripte benötigen.

### Minimale Konfiguration

Das Plugin ohne Config zu laden ist der übliche Weg; ein `waitTimeoutMs` über `maxWaitTimeoutMs` schlägt beim Laden fehl.

```yaml
- name: '@deepseek-ai/dsh-tool-jobs'
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `waitTimeoutMs` | `30,000` | Wartezeit, wenn `wait: true` `timeout_ms` weglässt |
| `maxWaitTimeoutMs` | `600,000` | Obergrenze für model-gelieferte Wartezeiten; größere Werte werden darauf gekappt |
| `completionDelivery` | `wakeup` | `wakeup` öffnet eine Turn auf einem inaktiven Owner; `quiet` lässt die Benachrichtigung ausstehend |
| `maxConsecutiveWakes` | `3` | Turns, die ein Owner durch Wecken öffnen darf, bevor Benachrichtigungen auf Injektion herabgestuft werden |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-jobs) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Was schiefgehen kann

Ein Agent, dessen Komposition `tool-jobs` nicht lädt, kann keine Hintergrund-Arbeit starten: Der Controller dieses Plugins aktiviert das `ctx.jobs.start()` der Produzenten. Eine model-gelieferte Wartezeit über `maxWaitTimeoutMs` wird auf das Limit gekappt, und ein abgelaufenes Warten liefert `[status: running]` und lässt den Job am Leben, statt zu scheitern. Eine auf einem inaktiven Owner ausstehende Abschluss-Benachrichtigung überlebt das Dispose dieses Owners nicht.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter den Tools und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) behandelt.

### Designphilosophie

- **Art-unabhängige Steuerungen.** Dieselben drei Tools lesen, listen und canceln Jobs jeder Produzenten-Art — bash, subagent, PTY —, weil alle über die generische `ctx.jobs`-Runtime registrieren.
- **Zustellung gehört hierher; Empfänger gehören der Registry.** Das Plugin entscheidet, wie ein nicht gemeldeter Abschluss den Owner erreicht — injiziert in einen beschäftigten Schritt oder als geweckte Turn auf einem inaktiven Owner —, während die Registry jede Abrechnung an die Listener routet, die die Scope-Kette ihres Owners erreicht, sodass ein Mount unter einem Preset nie die Agents eines anderen Presets sieht und ein Agent pro Abschluss genau eine Benachrichtigung liest, egal wie viele Presets gemountet sind.
- **Produzenten-eigene Ausgabelimits.** Liefert ein Produzent `outputLimitBytes`, wird das vollständige model-sichtbare Ergebnis — Ausgabe-Lesen, terminierter Kill-Snapshot oder Abschluss-Benachrichtigung — gekappt, nachdem Status- und Benachrichtigungs-Metadaten hinzugefügt wurden; Produzenten, die es weglassen, behalten unbegrenztes Verhalten.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Tool-Registrierungen, Abschluss-Listener, Prompt-Abschnitt, Ausgabe-Kappung |
| — | Es wird kein Runtime-Invarianten-Companion veröffentlicht; dieser model-zugewandte Adapter hat keinen eigenen Lifecycle-Stream; die Ausführungsbeziehungen gehören dem Capability-Seam, den er aufruft. |

### Ausgabe-Kappung

`job_output` und `job_kill` erfassen den für den Aufrufer sichtbaren Job in einem vorangestellten Pre-Execute-Listener, bevor die Policy läuft, sodass das Produzenten-Limit auf das vollständige gerenderte Ergebnis gilt. `job_output` bewahrt seine Output/Status-Aufteilung, wenn die Policy das Standard-Rendering intakt ließ, und begrenzt den Ausgabe-Schwanz sowie das `[status: ...]`-Suffix; andere Einzel-Text-Ergebnisse — Ablehnungen, Kurzschlüsse, normalisierte Tool- oder Pipeline-Fehler, Ersetzungen und Blockierungen — werden als ein Text begrenzt, während strukturierte Multi-Block-Policy-Ergebnisse ihre Form behalten. Eine begrenzte Abschluss-Benachrichtigung reserviert zuerst Platz für das stabile `background job <id>`-Präfix und die `job_output`-Abholanweisung, bevor die verbleibenden Bytes auf variable kind, label, status, detail und Trunkierungs-Marker verteilt werden, sodass die Benachrichtigung auch beim von PTY unterstützten 64-Byte-Minimum handlungsfähig bleibt; ein vorhandener Produzenten-Trunkierungs-Marker wird wiederverwendet statt dupliziert.

### Benachrichtigungs-Zustellspuren

`onJobDone` überspringt bereits gemeldete oder owner-lose Jobs. Eine `wakeup`-Zustellung öffnet eine Turn auf einem inaktiven Owner, solange das Budget reicht, pro exaktem `Agent` in einer `WeakMap` verfolgt; das Abholen einer benutzerverfassten Nachricht (`agent/inbox/claimed`) setzt das Budget dieses Owners zurück. Ein beschäftigter Owner — oder jede Benachrichtigung jenseits des Budgets oder `quiet`-Zustellung — wird stattdessen in die Next-Step-Inbox injiziert. Teardown-Abrechnungen kommen bereits als `reported` an, sodass ein Dispose nie eine Model-Anfrage dafür ausgibt, eine Benachrichtigung anzukündigen, die niemand lesen kann.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der Paket-Vertrag nicht ausreicht. Sie führen von den Job-Typen zum Registry-Vertrag und zu den generierten Schemas.

- [Hintergrund-Job-Runtime-Subsystem](../../../docs/subsystems/jobs.de.md) — die Job-Typen, Snapshot-Felder und die `ctx.jobs`-Cordis-Oberfläche.
- [Jobs-Gruppenkarte](../README.de.md) — die Geschwister-Gruppenseite und ihre Paket-Tabelle.
- [Registry-Vertrag](../jobs/README.de.md) — der abstrakte `ctx.jobs`-Service hinter den Tools.
- [Prozess-lokale Registry](../jobs-local/README.de.md) — wo Jobs in diesem Prozess laufen.
- [Generierter Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-jobs) — die exakten `job_output`-, `job_list`- und `job_kill`-Schemas.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-jobs) — jedes akzeptierte Config-Feld und seine Quell-Deklaration.
- [job-registry-seam-Agent-Note](../../../.agents/notes/archived/architecture/2026-07-26-job-registry-seam.md) — der owner-abgegrenzte Registry-Vertrag und seine Begründung.

-----

<a id="model-experience"></a>
## Model Experience

### System-Prompt

#### Was das Model sieht

Jede Anfrage im Registrierungs-Scope dieses Plugins enthält diese Guidance. Agent-bezogenes Tool-Filtering kann die Tools verbergen, ohne den unabhängig registrierten Prompt-Abschnitt zu entfernen.

##### Hintergrund-Job-Guidance

```markdown
Track every background job id you start. You are notified in-session when a job finishes — do not busy-poll or sleep on one; keep working on independent steps and do not duplicate a running job's work. Before giving a final answer, collect every still-relevant job with job_output (set wait: true only when you are genuinely blocked on it), and job_kill jobs that stopped mattering.
```

#### Token-Auswirkung

Geringe feste Eingabekosten pro Anfrage, solange aktiv.

#### KV-Cache-Auswirkung

Präfix-stabil, solange Plugin-Scope und Guidance-Text unverändert sind. Aktivierung oder Dispose kann die Wiederverwendung ab diesem Prompt-Abschnitt ungültig machen.

### Tool-Schemas

#### Was das Model sieht

Die generierten [`job_output`-, `job_list`- und `job_kill`-Schemas](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-jobs), solange dieser Tool-Satz sichtbar ist.

#### Token-Auswirkung

Feste Schema-Kosten bei jeder Anfrage, in der die Tools sichtbar sind.

#### KV-Cache-Auswirkung

Präfix-stabil, solange Tool-Definitionen und -Sichtbarkeit unverändert sind. Registrierungs-Lifecycle oder Scoped-Restriktionen können die Wiederverwendung ab dem ersten geänderten Schema-Token ungültig machen.

### Ergebnisse und Benachrichtigungen

#### Was das Model sieht

Lesevorgänge liefern Ausgabe oder `(no new output)`, gefolgt von `[status: <status>]` und optionalem Detail. Eine leere Liste liefert `(no background jobs)`. Kill liefert `requested cancellation of job <id>` oder den vorhandenen terminalen Status. Ein nicht gemeldeter, zugeordneter Abschluss verwendet die obige Benachrichtigung.

#### Token-Auswirkung

Ergebnisse und Benachrichtigungen bleiben bis zur Compaction in der Eltern-History. Stream-Lesevorgänge wiederholen keine verbrauchte Ausgabe; ein produzenten-geliefertes `outputLimitBytes` begrenzt jedes vollständige Lesen oder jede Benachrichtigung. Unter `wakeup` kauft eine Benachrichtigung an einen inaktiven Owner zusätzlich eine Model-Anfrage, um die der Benutzer nicht gebeten hat, pro Owner durch `maxConsecutiveWakes` gedeckelt; eine Benachrichtigung an einen beschäftigten Owner fügt nur einen Schritt zu der Turn hinzu, für die er bereits zahlt.

#### KV-Cache-Auswirkung

Append-only; neu sichtbarer Inhalt folgt auf das wiederverwendbare Anfrage-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die Tools schlecht passen. Sie sind aktuelle Paket-Einschränkungen, kein Aufgaben-Backlog.

- **Eine Abrechnung innerhalb des Ruhestands-Fensters des Drivers lässt ihre Benachrichtigung stranden** — zwischen dem letzten Inbox-Check der Turn-Schleife und dem Eintritt des Drivers in die Idle-Phase gilt der Owner noch als beschäftigt, sodass die Benachrichtigung injiziert wird und nichts weckt. Steering hat dasselbe Loch; es zu schließen gehört zu `agent-loop`.
- **Ein aufgebrauchtes Weck-Budget wird nicht mit der Zeit wiederhergestellt** — nur benutzerverfasste Eingabe füllt es wieder auf, sodass ein unbeaufsichtigter Agent mit leerem Budget seine restlichen Benachrichtigungen in der nächsten Turn einsammelt, die etwas anderes öffnet.
- **Eine auf einem inaktiven Owner ausstehende Benachrichtigung überlebt das Dispose dieses Owners nicht** — die Dispose-Cancellation leert die unabgeholte Inbox, und das Log behält das Insert/Cancel-Paar als Aufzeichnung.
- **Stream-Lesevorgänge haben einen einzigen Verbraucher** — unabhängige Beobachter brauchen eine andere Runtime-API.
- **Owner-lose Jobs haben keine Session-Abgrenzung** — externe Aufrufer müssen Policy liefern oder sie vermeiden.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
