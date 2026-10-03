---
description: "Die Skill-Provider-Registry für Nutzer und Maintainer, die wählen, konfigurieren oder debuggen, wie Skills aus beliebigen Quellen gemergt, aufgelöst und geladen werden."
kind: "package-reference"
---

# @deepseek-ai/dsh-skill
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Verwende dieses Paket, um Agents und Nutzern einen Katalog wiederverwendbarer, aufgabenspezifischer Anweisungen zu geben, die aus lokalen Verzeichnissen, eingebetteten Plugin-Daten oder Remote-Services gesammelt werden. Es löst doppelte Namen vorhersagbar auf, validiert Einträge, toleriert nicht verfügbare Quellen, ohne nutzbare Ergebnisse zu verwerfen, und lädt die vollständigen Anweisungen des gewählten Skills on demand. Mounte es, wenn eine Komposition Skills aus mehreren oder nicht-dateisystembasierten Quellen braucht; kombiniere es mit `dsh-skill-filesystem` für lokale Discovery und `dsh-tool-skill` für Modell-Zugriff, denn es enthält selbst keinen Skill-Inhalt.

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

Mounte das Plugin, um einer Komposition eine Skill-Registry zu geben. Skill-Quellen (Provider) und Consumer (der model-facing Katalog und Loader oder dein eigener Code) sprechen alle mit `ctx.skills`; die Registry mergt alles, was irgendein Provider meldet, sodass ein Lookup Skills aus jeder Quelle sieht.

### Wann es wählen

Verwende `dsh-skill`, wenn Agents Skills aus mehr als einer Quelle über ein Interface laden sollen oder wenn die Skill-Quelle nicht das lokale Dateisystem ist. Vermeide es, wenn eine Komposition gar kein Skill-Loading braucht — das Plugin fügt einen Service und Discovery-Kosten pro Lookup hinzu. Der mitgelieferte lokale Provider (`dsh-skill-filesystem`) und der model-facing Consumer (`dsh-tool-skill`) sind separate Pakete; mounte sie mit, wenn das Deployment lokale Skills und Modell-Zugriff will.

### Mounten und konfigurieren

Lade das Plugin wie jedes Cordis-Plugin. Die einzige Konfiguration begrenzt, wie viele fertige Provider-Kataloge im Speicher gehalten werden; alles andere ist Provider-Verhalten.

```yaml
- name: '@deepseek-ai/dsh-skill'
```

| Feld | Default | Bedeutung |
|---|---|---|
| `collectCacheMaxEntries` | `128` | Fertige cwd-/Provider-Kataloge, die im Speicher gehalten werden |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-skill) ist die erschöpfende Quelle für jedes akzeptierte Feld.

### Was die Registry bietet

- **Ein gemergter Katalog.** Ein Consumer fragt den aktuellen Katalog eines Workspace ab und erhält jede gewinnende Skill-Summary jedes Providers, nach Namen sortiert — keine provider-spezifische Sortierung oder Dedup nötig.
- **On-demand-Loading.** Die Abfrage eines Skills per Name gibt den vollständigen Anweisungs-Body von dem Provider zurück, der den gewinnenden Kandidaten besitzt; die Registry re-validiert die geladene Definition und lehnt eine stale Auswahl ab, deren Name sich zwischen Discovery und Load geändert hat.
- **Eingebettete Skills.** Plugins registrieren einen In-Memory-Skill mit `ctx.skills.register(...)`; die Registry ergänzt eine Default-Invocation-Policy und das `runtime`-Provider-Label. Gleichnamige Runtime-Registrierungen in einer Ebene sind first-wins mit einer Warnung.
- **Provider-Registrierung.** Ein Provider trägt seinen Katalog mit `ctx.skills.registerProvider(...)` bei; die Registrierung ist synchron, und der zurückgegebene Disposer entfernt den Provider. `runtime` ist ein reservierter Provider-Name.

Eine Invocation-Policy auf jedem Skill entscheidet, welche Surfaces ihn bewerben und laden dürfen: `modelInvocable` für model-facing Tools und Kataloge, `userInvocable` für user-facing Kommandos. Die Registry behält alle vier Kombinationen, sodass ein Discovery-Ergebnis beide Surfaces bedienen kann, ohne ihre Kataloge zu vermischen.

| Policy | Modell | Nutzer |
|---|---|---|
| `{ modelInvocable: true, userInvocable: true }` | enthalten | enthalten |
| `{ modelInvocable: true, userInvocable: false }` | enthalten | ausgeschlossen |
| `{ modelInvocable: false, userInvocable: true }` | ausgeschlossen | enthalten |
| `{ modelInvocable: false, userInvocable: false }` | ausgeschlossen | ausgeschlossen |

### Beobachtbare Erfolge und Fehler

Ein Skill, den irgendein Provider meldet, erscheint im gemergten Katalog, und das Laden über seinen exakten Kebab-Case-Namen gibt den Body zurück; ein ungültiger Name gibt keinen Skill zurück statt zu werfen. Ein Provider, dessen Discovery fehlschlägt, wird geloggt und übersprungen, und die Observation wird als incomplete gemeldet, sodass Consumer ihren letzten guten Katalog behalten; eine explizit incomplete Observation trägt dennoch ihre Kandidaten bei. Ein malformed Kandidat fail-fastet — die Registry validiert Namen, Beschreibungen, Invocation-Booleans und Provider-Zugehörigkeit, bevor sie irgendetwas cached oder zurückgibt.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie die Registry Provider-Kataloge mergt, cached und invalidiert; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig abgedeckt.

### Designkonzept

Das Paket beruht auf einer Trennung: Die Registry besitzt Merging, Gewinner-Auflösung und Validierung, während Provider besitzen, woher Skills kommen. Ein Provider ist ein ausgeliehenes Same-Process-Objekt mit einem `list()`, das Kandidaten zurückgibt, und einem `get()`, das einen Body lädt; die Registry inspiziert Skill-Inhalt nie über die Validierung seiner semantischen Felder hinaus.

Die Registry ist host+per-scope geschichtet, die Form, die die Tools-Registry etabliert hat: Eine Registrierung landet in der Ebene des Scopes ihres aufrufenden Kontexts — Host-Rows und Repository-Plugins landen in der globalen Ebene, ein Plugin, das von der Standing Composition eines Agent-Presets gemountet wird, landet in dessen Ebene. Ein Read mergt die globale Ebene mit der Chain des betrachtenden Scopes; die nähere Ebene gewinnt einen doppelten Namen direkt, und innerhalb einer Ebene lösen Duplikate nach Rank, Provider-Registrierungsreihenfolge, dann provider-lokaler Reihenfolge auf.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Eintritt, `SkillRegistry`-Service, Kandidaten- und Definitions-Validierung, geteiltes model-facing Rendering |
| — | Es wird kein Runtime-Invarianten-Companion veröffentlicht; Provider-/Runtime-Maps und revisionierte Caches ändern sich atomar innerhalb der Registry, die kein unabhängiges Change-Event oder Snapshot zu deren Querprüfung exponiert. |

### Katalog-Collection

Ein Read (`list`/`snapshot`) sammelt die Kandidaten jeder Ebene: zuerst Runtime-Skills, dann das `list()`-Ergebnis jedes Providers, Provider werden sequenziell erwartet und Fehler eingedämmt. Kandidaten werden validiert, innerhalb der Ebene dedupliziert und über Ebenen gemergt; Summaries sortieren nach Namen. Fertige Collections werden pro cwd, Scope-Chain und Revision bis `collectCacheMaxEntries` gecacht; eine laufende Collection retried einmal, wenn eine Provider- oder Runtime-Mutation die Revision mitten im Read erhöht, und eine zweite Änderung gibt die neuesten Kandidaten als incomplete, ungecachte Observation zurück.

### Loading und Staleness

`get()` wählt den gewinnenden Kandidaten, raced den Provider-Load gegen das Abort-Signal des Lookups und prüft Cancellation nach Auswahl oder Cache-Treffer erneut. Die zurückgegebene Definition muss zum Namen des gewählten Kandidaten passen; ein Mismatch invalidiert die gecachten Kataloge, sodass der nächste Snapshot die Skills des Providers neu entdeckt. Definitionen werden nie gecacht — jeder Load fragt den Provider nach dem aktuellen Body.

### Invalidierung

Die Registry hat kein TTL: Nur ein Provider, der sein registrierungsgebundenes `invalidate()` aufruft, oder eine Runtime-Registrierung bzw. -Disposal löscht fertige Kataloge. Jede Invalidierung erhöht eine Revision, leert den Cache und emittiert das ungefilterte `skills/change`-Event; Consumer refetchen mit ihren eigenen Lookup-Optionen. `invalidate()` wirkt nur, solange die exakte Registrierung, die es erhalten hat, noch aktiv ist, sodass ein später Callback keinen Ersatz-Provider gleichen Namens stören kann.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie bewegen sich vom geteilten Skill-Vocabulary zum mitgelieferten Provider, zum model-facing Consumer und zur Design-Begründung.

- [Skill-Subsystem-Referenz](../../../docs/subsystems/skills.de.md) — die Registry, der Provider-Vertrag und die Priorität lokaler Discovery.
- [skill-filesystem-Paket](../skill-filesystem/README.de.md) — der mitgelieferte lokale Provider, der Skills von der Disk entdeckt.
- [tool-skill-Paket](../tool-skill/README.de.md) — der Consumer, der den Session-Katalog und das `skill`-Tool rendert.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-skill) — jedes Config-Feld und seine Quelldeklaration.
- [Skill-Invocation-Policy-Agent-Note](../../../.agents/notes/implemented/feature/2026-07-28-skill-invocation-policy.de.md) — die Begründung für die Modell- und Nutzer-Invocation-Kontrollen.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über `dsh-tool-skill`, das Provider-Summaries in persistente initiale oder Ersatz-Katalog-Messages rendert und geladene Anweisungs-Bodies in behaltene Tool-Results.

#### KV-Cache-Effekt

Kein direkter Prompt-Effekt. Der benannte Consumer besitzt den persistenten initialen Katalog und die append-only Ersetzungen nach Invalidierung.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die Registry schlecht passt oder besondere Betriebsaufmerksamkeit braucht. Es sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Invalidierung ist provider-getrieben** — die Registry hat kein TTL und kann nicht ableiten, dass sich eine beliebige Remote-Quelle geändert hat; jeder veränderliche Provider muss seine registrierungsgebundene `invalidate()`-Fähigkeit behalten und aus seinem eigenen Beobachtungsmechanismus aufrufen.
- **Provider werden sequenziell befragt** — ein langsamer Provider verzögert jeden danach registrierten Provider; Cancellation stoppt das Warten des Callers, kann aber Arbeit nicht terminieren, die ein unkooperativer Provider weiterlaufen lässt.
- **Incomplete Observations werden nicht behalten** — abgelehnte Provider werden weggelassen, und explizit gelieferte Kandidaten bleiben nur für den aktuellen Lookup verfügbar; die Registry besitzt weder einen last-good Katalog noch Pro-Provider-Diagnostik.
- **Duplikat-Auflösung ist first-wins** — spätere niedriger priorisierte Kandidaten innerhalb einer Ebene werden geloggt und verborgen, und eine nähere Ebene verdeckt eine entferntere still; es gibt keine API, um alle verdeckten Definitionen zu inspizieren.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer und ausdrücklich nicht autoritativ — ausgeliefertes Verhalten und Grenzen stehen in den Abschnitten oben und im Code. Eine offene Frage ist, ob die Registry einen last-good Katalog oder Pro-Provider-Diagnostik für fehlgeschlagene Provider behalten soll oder ob Consumer diesen Zustand besitzen sollen; die Limitation zu incomplete Observations hält die aktuelle Antwort fest.

</details>
