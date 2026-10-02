---
description: "Der Background-Job-Registry-Contract für Nutzer und Maintainer, die Background-Arbeit komponieren, implementieren oder debuggen: ids, Ownership, Lifecycle und Completion-Listener."
kind: "package-reference"
---

# @deepseek-ai/dsh-jobs

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-jobs` lässt Tools langlaufende Arbeit aktiv halten, während ein Agent weiterarbeitet. Jeder Job erhält eine stabile `<kind>-N`-id, und sein besitzender Agent kann Output lesen, mit einem Timeout warten oder Cancellation anfordern. Ownership ist auf die Agent-Session gescoped, sodass andere Agents den Job weder inspizieren noch stoppen können; Completion kommt als In-Session-Notice ohne Polling an. Background-Jobs können nur starten, wenn das Deployment Job-Ausführung bereitstellt.

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

Dieses Paket verwenden, wenn du eine Background-Job-Capability komponierst oder einen Producer schreibst, der lange Arbeit registriert. Das Paket selbst definiert den Contract; eine Komposition erhält das Feature, indem sie eine Implementierung wie `dsh-jobs-local` lädt und, für die Modellseite, `dsh-tool-jobs`.

### Was ein Background-Job liefert

Ein Producer registriert Arbeit mit einem Kind und einem Ein-Zeilen-Label; die Registry gibt eine `<kind>-N`-id wie `bash-1` zurück. Jeder, der den Job besitzt, kann Output lesen, Jobs listen, bis zu einem Timeout auf Settlement warten und Cancellation anfordern — jeder Aufruf gibt einen frischen Snapshot des Job-Status zurück, von `running` und `stopping` bis zu den terminalen `completed`, `killed` oder `failed`. Wenn ein Job settelt, wird der besitzende Agent über den Completion-Listener benachrichtigt, den `dsh-tool-jobs` in eine In-Session-Notice verwandelt — Polling ist also nicht nötig. Ein Producer kann ein optionales Byte-Cap anhängen, damit jedes vollständige modellseitige Output-Read oder jede Completion-Notice bounded bleibt.

### Die Ownership-Grenze

Ein Job gehört der Agent-Session, die ihn gestartet hat: Ein anderer Agent kann ihn weder lesen noch stoppen. Ids wie `bash-1` sind vorhersagbar, daher ist dieser Zaun Autorisierung, nicht Geheimhaltung. Ein ohne Owner gestarteter Job steht jedem Aufrufer offen und lebt, bis der Service disposed wird.

### Background-Arbeit starten braucht einen Controller

Ein Producer kann Arbeit nur starten, solange ein Controller attached ist, der den Owner bedient — das Laden von `dsh-tool-jobs` attacht einen. Ein Agent, dessen Komposition keinen Controller lädt, kann keine Background-Arbeit starten; `start()` schlägt mit einer Message fehl, die den fehlenden Controller nennt, statt Arbeit zu starten, die der Agent nie einsammeln oder stoppen könnte.

### Kleinste funktionierende Komposition

```yaml
- name: '@deepseek-ai/dsh-jobs-local'
- name: '@deepseek-ai/dsh-tool-jobs'
```

Diese zwei Plugins auf einer Harness-Basis zu laden, die bereits die Agent-, Tools- und System-Prompt-Services bereitstellt, ergibt das volle Feature: `dsh-jobs-local` stellt die In-Process-Background-Job-Registry, und `dsh-tool-jobs` stellt die Tools `job_output`, `job_list` und `job_kill` sowie die Zustellung der Completion-Notices.

### Was schiefgehen kann

Jedes Preflight-Rejection hinterlässt weder eine job id noch registrierte Arbeit. Jobs, die von der mitgelieferten In-Process-Registry verwaltet werden, sterben mit dem Harness-Prozess; durable Ausführung über Restarts hinweg braucht ein anderes Backend, das diesen Contract implementiert.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Contract und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designphilosophie

- **Contract und Implementierung sind separate Pakete.** `JobRegistry` ist ein abstrakter Cordis-Service; das direkte Laden der Klasse wirft, sodass eine fehlkonfigurierte Komposition beim Laden fehlschlägt, statt ein leeres `ctx.jobs` zu registrieren.
- **Eine Registry pro Prozess, owner-relative Antworten.** Eine Instanz bedient jede Komposition im Prozess, daher sind Registrierungen und Zustellungen relativ zum registrierenden Scope: Ein Controller oder Listener, der aus einem ungescoped Kontext registriert wird, bedient jeden Owner; einer, der unter dem Scope einer Agent-Komposition registriert wird, bedient exakt die unter ihr komponierten Agents.
- **Der Zugriff ist durch die Session-id des Owners gezäunt.** Ids sind vorhersagbar, daher ist Autorisierung — nicht Geheimhaltung — die Grenze.
- **Settlement ist first-wins, und Completion wird zuletzt angekündigt.** Ein terminaler Record, freigegebene Waiter und eine Runde contained Listener-Notification; die Completion wird angekündigt, nachdem der Record committet ist und jeder andere Beobachter ihn gesehen hat, weil ein Reporter synchron einen Model-Turn öffnen kann.
- **Registrierungen überleben Producer- und Controller-Fibers.** Owner- und Service-Disposal canceln laufende Arbeit und awaiten compliant Producer; ein werfender Teardown-Cancel force-failed nur den Record.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: der abstrakte `JobRegistry`-Service und sein Contract |
| [`src/types.ts`](src/types.ts) | Geteiltes Vokabular: `JobKindMap`, `JobStart`, `JobHooks`, `JobSnapshot`, Listener-Typen |
| [`src/brand.ts`](src/brand.ts) | `JobId`-Branded-Identifier, importierbar ohne die Agent-Dependency |
| [`src/invariant.ts`](src/invariant.ts) | Invariant-Companion: validiert Snapshot-Identität, Status, Timestamps und Owner-Felder |

### Service-Operationen

Jede Operation ist eine dünne Projektion über die registrierten Jobs: `get` und `list` geben nicht-konsumierende Snapshots zurück, `read` schiebt den einzelnen Stream-Cursor voran, `kill` ruft die Producer-Cancellation vor der Statusänderung auf, `wait` blockiert bis zu einem Timeout, und `start()` prüft Zugriff, Validierung und Admission im Preflight, bevor es das `run()` des Producers einmal aufruft, und verweigert dabei jeden Owner, den kein attacher Controller bedient; Listener beobachten terminale Records und Visible-Set-Änderungen mit Owner-Granularität, und `attachController` scopt die Controller-Verfügbarkeit auf seine Effect-Lifetime. Genaue Signaturen und Verhalten stehen im JSDoc auf [`src/index.ts`](src/index.ts) und der generierten [`ctx.jobs`-Cordis-Oberfläche](../../../docs/subsystems/jobs.de.md).

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der paketweite Contract nicht ausreicht. Sie bewegen sich von den Job-Typen zur mitgelieferten Implementierung, den modellseitigen Kontrollen und den Design-Records.

- [Subsystem Background-Job-Runtime](../../../docs/subsystems/jobs.de.md) — die Job-Typen, Snapshot-Felder und die `ctx.jobs`-Cordis-Oberfläche.
- [Jobs-Gruppenkarte](../README.de.md) — die Schwester-Gruppenseite und ihre Pakettabelle.
- [Prozess-lokale Registry](../jobs-local/README.de.md) — die mitgelieferte Implementierung, die Jobs in diesem Prozess laufen lässt.
- [Modellseitige Job-Kontrollen](../tool-jobs/README.de.md) — die Tools `job_output`, `job_list` und `job_kill` sowie Completion-Notices.
- [Agent Note zur generischen Langlauf-Tool-Runtime](../../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.de.md) — das Design hinter der Background-Job-Runtime.
- [Agent Note zum Job-Registry-Seam](../../../.agents/notes/archived/architecture/2026-07-26-job-registry-seam.md) — der owner-gezäunte Registry-Contract und seine Begründung.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über Producer- und Controller-Plugins, die das gesamte Modell-Rendering über der Job-Registry besitzen.

#### KV-Cache-Effekt

Keine direkte Invalidierung; die genannten Consumer besitzen etwaige Request-Präfix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Contract schlecht passt. Sie sind aktuelle Paket-Constraints, kein Aufgabenstau.

- **Der Contract ist in-process** — `JobStart.run()` übergibt Callbacks und exakte `Agent`-Objekte; ein durable oder prozessübergreifendes Backend muss Identitäts-, Restart-, Ownership- und Beobachtungssemantik umbauen, bevor es diesen Seam implementieren kann.
- **Stream-Output hat einen einzigen konsumierenden Cursor** — unabhängige Beobachter brauchen eine Cursor- oder Snapshot-API.
- **Foreground-Arbeit kann nicht hochgestuft werden** — Producer wählen Foreground oder Background vor dem Start.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
