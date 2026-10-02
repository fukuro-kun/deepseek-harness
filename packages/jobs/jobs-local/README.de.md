---
description: "Die prozesslokale Background-Job-Registry für Anwender und Maintainer, die in-process Jobs komponieren, dimensionieren oder debuggen: Admission, Lebenszyklus und Teardown pro Owner."
kind: "package-reference"
---

# @deepseek-ai/dsh-jobs-local

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-jobs-local` führt Background Jobs innerhalb des Harness-Prozesses aus: Die Arbeit läuft weiter, während der Agent voranschreitet, und der besitzende Agent kann sie lesen, abwarten, auflisten und abbrechen; bei ebenfalls gemountetem `dsh-tool-jobs` wird der Abschluss als sitzungsinterne Benachrichtigung zugestellt. Es implementiert den `dsh-jobs`-Contract mit In-Memory-Records, die ausschließlich als frische Snapshots herausgegeben werden, niemals als Live-State. Ein Concurrency-Limit pro Owner (Standard 10) begrenzt, wie viele Jobs ein Agent gleichzeitig im Zustand `running` oder `stopping` haben darf; Jobs sterben mit dem Harness-Prozess und überdauern keinen Neustart.

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

Dieses Plugin laden, wenn eine Komposition In-Process-Background-Jobs benötigt: Langlaufende Tools registrieren ihre Arbeit, und der besitzende Agent liest, wartet, listet und bricht sie ab, ohne seinen eigenen Turn zu blockieren. Es implementiert den [`dsh-jobs`](../jobs/README.de.md)-Contract; die modellseitigen Tools `job_output`, `job_list` und `job_kill` stammen aus [`dsh-tool-jobs`](../tool-jobs/README.de.md).

### Wann es die richtige Wahl ist

Es ist die richtige Wahl, wenn Jobs im Harness-Prozess leben und mit ihm sterben sollen. Zu vermeiden ist es, wenn Arbeit einen Neustart überdauern oder Prozesse überspannen muss: Die Records liegen im Speicher, ein dauerhaftes oder prozessübergreifendes Backend muss denselben Contract anders implementieren.

### Minimale Konfiguration

Das Laden des Plugins registriert `ctx.jobs`; `maxConcurrentJobsPerOwner` ist optional und steht standardmäßig auf `10`.

```yaml
- name: '@deepseek-ai/dsh-jobs-local'
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `maxConcurrentJobsPerOwner` | `10` | Maximale Anzahl von Jobs im Zustand `running` plus `stopping` pro exaktem Owner oder im gemeinsamen ownerlosen Bucket |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-jobs-local) ist die erschöpfende Quelle für das akzeptierte Feld.

### Was jeder Owner bekommt

Das Limit zählt die `running`- und `stopping`-Records des exakten Owners; alle ownerlosen Jobs teilen sich einen separaten Service-Bucket. Die Historie abgeschlossener Jobs belegt keine Kapazität, und nur das `done`-Settlement des Producers gibt den Platz eines stoppenden Jobs frei. Bei voller Kapazität schlägt `start()` fehl, bevor der Producer läuft, mit einem Fehler, der das Limit nennt und den Agenten auffordert, einen nicht benötigten Job zu beenden, auf dessen Ende zu warten und es erneut zu versuchen — die Registry weder queued noch präemptiert sie.

### Lebenszyklus

Jobs gehören ihrem Owner und Backend, nicht dem Producer-Tool, daher stoppen Producer- oder Controller-Reloads sie nicht. Wird ein Agent mit eigenen Jobs disposed, werden seine Jobs abgebrochen, ihre Producers abgewartet und ihre Snapshots entfernt; die Disposal des Services tut dasselbe für jeden verbleibenden Job. Ein Cancel, das während des Teardowns wirft, markiert den Record als fehlgeschlagen und warnt, dass die Arbeit verwaist sein könnte — so kann der Teardown nie deadlocks erzeugen.

### Was schiefgehen kann

Der Start von Arbeit schlägt ohne einen Controller fehl, der den Owner bedient — `dsh-tool-jobs` hängt einen an, und `start()` verweigert sonst mit einer Meldung, die ihn benennt. Ein Producer-Cancel, das zurückkehrt, ohne `done` zu settlen, bleibt von einem langsamen Stopp ununterscheidbar und kann den Teardown aufhalten, während es einen Kapazitätsplatz belegt. Jeder Record verschwindet, wenn der Harness-Prozess endet.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter der Registry und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designphilosophie

- **In-Memory-Records, frische Snapshots.** `LocalJobRegistry` hält ein `TrackedTask` pro Job und projiziert pro Aufruf einen neuen Read-Only-Snapshot; Aufrufer erhalten niemals Live-State.
- **Owner-relative Schichten, eine prozessweite Registry.** Controller, Completion-Listener und Change-Observer werden in den Scope der registrierenden Stelle einsortiert (`ScopedLayers`), und Reads vereinigen die globale Schicht mit der Scope-Kette des Owners — so halten die Job-Kontrollen eines Presets `start()` niemals für einen Agenten offen, dessen eigene Komposition keine lädt, und ein Settlement erreicht nur die Listener, die dessen Komposition registriert hat.
- **Preflight vor dem Start.** `start()` prüft Controller-Service, Spec-Validität, bestehende Ownership und Kapazität, bevor es den Producer aufruft, sodass eine Ablehnung weder job id noch Ausführungsressource hinterlässt; die Registrierung committet ohne einen später fälhbaren Schritt.
- **First-wins-Settlement, Completion zuletzt.** Das früheste terminale Ergebnis wird einmal aufgezeichnet, gibt die Waiter frei und benachrichtigt die Listener einmal mit per-Listener-Containment; die Completion wird nach dem Commit des Records und der Veröffentlichung der Visible-Set-Änderung angekündigt, weil ein Reporter synchron einen Model-Turn öffnen kann.
- **Teardown deadlockt nie.** Ein werfendes Cancel markiert den Record als fehlgeschlagen und meldet einen möglichen Verwaisten, statt die Disposal zu blockieren.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Config`-Schema, `LocalJobRegistry`, Admission, Lebenszyklus, Teardown |
| — | Es wird kein Runtime-Invariant-Begleitmodul veröffentlicht; `@deepseek-ai/dsh-jobs/invariant` besitzt die per-Snapshot-Prüfungen von Identität, Status, Timestamp und Owner. Die Admission-Entscheidung dieses Providers nutzt private Konfiguration und muss fehlschlagen, bevor ein Backend-Starter läuft; `LocalJobRegistry.start()` erzwingt das synchron für aktuelle Producers. Ein Aggregat nach der Veröffentlichung zu wiederholen würde private Konfiguration allein diesem Begleitmodul offenbaren und die Fail-Closed-Garantie vor dem Start nicht verifizieren. |

### Scope-Schichten

`attachController`, `onJobDone` und `onJobsChanged` registrieren sich in die Scope-Schicht des aufrufenden Kontexts. Die Controller-Frage (`servesOwner`) und die Listener-Zustellung (`listenersFor`, `changedFor`) durchlaufen dieselbe Kette: zuerst die globale Schicht, dann jede Scoped-Schicht entlang der Owner-Kette. Registrierungen sind anonyme Token, sodass doppelte Labels unabhängig disposable bleiben.

### Admission und Settlement

`activeTaskCount` zählt autoritative Records pro exaktem Owner oder im gemeinsamen ownerlosen Bucket. `settle` markiert einen Job als gemeldet, wenn Waiter ausstehen, löst jeden Waiter auf, zeichnet den terminalen Snapshot auf, kündigt die Visible-Set-Änderung an und benachrichtigt dann die Completion-Listener. Ausstehende Waits markieren den Job als gemeldet, bevor die Listener laufen, damit Completion-Reporter keine doppelten Meldungen erzeugen; ein Teardown-Cancel markiert aus demselben Grund — niemand wird eine Meldung lesen, die an einen gerade zerstörten Owner adressiert ist.

### Teardown

Die Owner-Disposal (`disposeOwned`) bricht die Jobs des Owners ab, wartet ihr Settlement ab, entfernt ihre Records und kündigt die Entfernung an — die eine Visible-Set-Änderung, die kein per-Job-Record trägt. Die Service-Disposal (`disposeAll`) schließt die Listener, bricht alle laufenden Jobs ab, wartet das Settlement ab, leert den Store, kündigt das Leeren den einzelnen Ownern an und löst dann die fiberübergreifenden Owner-Cleanup-Effects ab.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der paketweite Contract nicht ausreicht. Sie führen vom Registry-Contract zu den modellseitigen Kontrollen und den Designaufzeichnungen.

- [Subsystem Background-Job-Runtime](../../../docs/subsystems/jobs.de.md) — die Job-Typen, Snapshot-Felder und die `ctx.jobs`-Cordis-Oberfläche.
- [Jobs-Gruppenkarte](../README.de.md) — die Schwester-Gruppenseite und ihre Pakettabelle.
- [Registry-Contract](../jobs/README.de.md) — der abstrakte `ctx.jobs`-Service, den dieses Paket implementiert.
- [Modellseitige Job-Kontrollen](../tool-jobs/README.de.md) — die Tools `job_output`, `job_list` und `job_kill` sowie die Completion-Benachrichtigungen.
- [Agent Note zur generischen Langlauf-Tool-Runtime](../../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.de.md) — das Design hinter der Background-Job-Runtime.
- [Agent Note zum Job-Registry-Seam](../../../.agents/notes/archived/architecture/2026-07-26-job-registry-seam.md) — der owner-abgegrenzte Registry-Contract und seine Begründung.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über Producer-Plugins und `dsh-tool-jobs`, an die das Registry-Backend das gesamte Model-Rendering delegiert.

#### KV-Cache-Effekt

Keine direkte Invalidierung; die genannten Consumer besitzen alle Request-Prefix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen bestimmen, wann die Registry ungeeignet ist. Sie sind aktuelle Paketbedingungen, kein Aufgabenrückstand.

- **Jobs sind prozesslokal** — Records sterben mit dem Harness-Prozess; dauerhafte oder neustartübergreifende Ausführung braucht ein separates Backend, das den Seam implementiert.
- **Ein still wirkungsloses Cancel kann den Teardown aufhalten und Kapazität belegen** — wenn `cancel` zurückkehrt, ohne `done` zu settlen, kann die Registry es nicht von einem langsamen Stopp unterscheiden; der Job belegt für den Rest der Service-Lebensdauer einen Bucket-Platz, und nur ein explizites Werfen kann sicher als fehlgeschlagen erzwungen werden.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
