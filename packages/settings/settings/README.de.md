---
description: "Der User-Settings-Service für Plugin-Autoren und Maintainer, die konfigurierbare Namespaces registrieren, aufgelöste Werte lesen oder Konfigurations-Oberflächen verdrahten."
kind: "package-reference"
---

# @deepseek-ai/dsh-settings
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Verwende dieses Paket, wenn Nutzer die Konfiguration eines Plugins zur Laufzeit ändern müssen, ohne neu zu starten oder `cordis.yml` erneut zu lesen. Jeder Namespace kombiniert Schema-Defaults, Deployment-Konfiguration und User-Overrides; Leser erhalten einen tief eingefrorenen aufgelösten Snapshot und können committed Änderungen beobachten. Writes betreffen nur User-Overrides, sind pro Namespace serialisiert und dürfen stale Revisionen ablehnen, statt neuere Änderungen zu überschreiben. Dauerhafte Laufzeit-Edits erfordern konfigurierten Settings-Storage; ohne ihn läuft das Plugin mit seiner komponierten Konfiguration weiter.

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

Plugins und Konfigurations-Oberflächen nutzen `ctx.settings`, um Konfiguration zur Laufzeit zu lesen und zu ändern. Der übliche Weg: einen Provider mounten, einen Namespace mit einem Schema registrieren, den aufgelösten Wert lesen und beobachten und über den Owner-Scope schreiben.

### Wann es die richtige Wahl ist

Wähle Settings, wenn die Konfiguration eines Plugins zur Laufzeit änderbar sein soll — durch den Nutzer, der ein Dokument editiert, oder durch eine Konfigurations-UI — ohne Restart oder erneutes Lesen von `cordis.yml`. Es passt, wenn mehrere Plugins jeweils einen eigenen Konfigurations-Namespace besitzen und wenn eine Konfigurations-Oberfläche Schemas rendern, vom Nutzer überschriebene Felder markieren und Edits persistieren muss. Es ist unnötig, wenn die Konfiguration zum Ladezeitpunkt fix ist: ohne gemounteten Provider ändert sich nichts, und die Konfiguration bleibt exakt wie komponiert.

### Einen Provider mounten

Der Service speichert selbst nichts; mounte einen Provider wie den mitgelieferten dateibasierten:

```yaml

- name: '@deepseek-ai/dsh-settings-file'

  config:

    path: /absolute/path/to/settings.yaml

```

`ctx.settings` erscheint, sobald der Provider live ist. Das Provider-README besitzt die vollständige Konfigurations-Oberfläche; der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-settings-file) listet jedes akzeptierte Feld.

### Einen Namespace registrieren

Ein Plugin registriert seinen eigenen Namespace mit einem schemastery-Schema und kann optional den Kompositions-Eintrag als `base`-Layer übergeben, damit der aufgelöste Wert von dem startet, was das Deployment bereits konfiguriert hat:

```text

const scope = ctx.settings.register('ui-theme', ThemeSchema, {

  base: config,   // composition entry config; the user layer resolves above it

})

const theme = scope.get()              // deep-frozen resolved snapshot

scope.update({ density: 'compact' })   // merges into the user section and persists

```

Literale Namespace-Argumente prüft TypeScript gegen die Grammatik aus Kleinbuchstaben, Ziffern und Bindestrich; dynamisch übergebene Strings erhalten zur Laufzeit dieselbe Validierung. `ctx.settings.installSection(owner, ns, schema, entry, hooks)` bündelt die Verdrahtung des optionalen Services für ein Consumer-Plugin: solange ein Settings-Service existiert, registriert es den Namespace mit dem Kompositions-Eintrag des Plugins als `base`; wenn der Service verschwindet, fällt das Plugin auf seine Entry-Config zurück und arbeitet exakt wie komponiert weiter.

### Werte lesen und beobachten

`get(ns)` gibt den aufgelösten Wert als tief eingefrorenen Snapshot zurück, `undefined` solange der Namespace unregistriert ist. `watch(callback)` ruft den Callback nach jeder committed Änderung mit `(next, prev)` auf: Aufrufe eines Callbacks laufen einzeln in Commit-Reihenfolge, und Fehler werden eingedämmt und geloggt, sodass ein langsamer oder werfender Observer niemals andere Observer blockiert oder zerstört.

### Werte schreiben

`update(ns, patch)` merged einen Plain-Object-Patch tief nur in die User-Sektion — niemals in `base` —, validiert den aufgelösten Kandidaten, persistiert über den Provider und committet dann. `replace(ns, section)` setzt die User-Sektion als Ganzes — das ist der Entfernungs-/Reset-Pfad: `replace({})` erbt `base` und Schema-Defaults erneut. `mutate(ns, ops)` wendet geordnete `{ op: 'set' | 'unset', path }`-Edits auf die Sektion in dem Stand an, den sie hat, wenn der Write die Queue-Spitze erreicht — der Entfernungspfad für einen Caller, der eine unvollständige (etwa redigierte) Sicht hält, denn eine Sektion aus dem, was eine Wire-Oberfläche zurückgab, neu aufzubauen und als Ganzes zu ersetzen, würde jedes Feld löschen, das die Wire nie zurückgeschickt hat.

Jeder Write lehnt nicht-JSON-kompatible Daten ab (ein `Date`, `Map`, `BigInt`, eine nicht-finite Zahl oder eine zirkuläre Referenz schlägt mit ihrem `$`-wurzelnden Pfad fehl, bevor irgendetwas persistiert), lehnt auf einem Read-only-Provider ab und akzeptiert ein optionales `expectedRevision`: gib die `revision` aus einem Descriptor zurück, und ein Namespace, der darüber hinausgelaufen ist, verweigert den Write mit `SettingsConflictError`, statt den zuerst gelandeten Writer zu überschreiben.

### Konfigurations-Oberflächen

`describe()` gibt einen Descriptor pro registriertem Namespace zurück: das serialisierte Schema, den aufgelösten Wert, die abgetrennten `base`- und `user`-Layer (die Anwesenheit eines Felds in `user` markiert es als user-overridden), das Effect-Timing und die Revision des Namespace. Übergib `redactSecrets: true` auf jeder Wire-Oberfläche: es entfernt `role('secret')`-Felder aus jedem Layer und enumeriert sie als `{ path, set }`-Slots, sodass eine Seite Write-only-Inputs rendern kann, ohne je ein Secret zu empfangen. `documentPath` und `prepareDocument()` exponieren die user-editierbare Datei des Providers an einen nativen Editor, falls eine existiert.

### Events und Fehler

`settings/updated (ns, next, prev, source)` feuert nach jeder committed Änderung — einem In-Process-Write (`source: 'update'`) oder einem extern beobachteten Edit (`source: 'provider'`) — und niemals, wenn der aufgelöste Wert deep-equal ist. `settings/document-updated (ns, revision)` feuert, wann immer sich die rohe User-Sektion geändert hat, selbst wenn der aufgelöste Wert es nicht tat — genau das, was ein offener Editor braucht, um zu erfahren, dass ein Feld von geerbt zu überschrieben wurde. Eine gespeicherte Sektion, die das Schema ablehnt, behält den letzten guten Wert des Namespace und warnt beim Reload; bei der Registrierung lässt derselbe Fehler die Registrierung selbst fehlschlagen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Service und zeigt auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designphilosophie

- **Geschichtete Auflösung, ein User-Layer.** Der Wert eines Namespace ist Schema-Defaults, dann die `base` des Registranten aus der Komposition, dann die User-Dokument-Sektion; Writes berühren nur den User-Layer, also ist `replace({})` ein echter Reset.
- **Commits sind deep-equal-gated.** `settings/updated` feuert nur, wenn sich der aufgelöste Wert bewegt hat; das Raw-Sektion-Event ist separat, weil Konfigurations-Oberflächen auch „geerbt wurde überschrieben" erfahren müssen.
- **Writes sind gequeued und revisions-geprüft.** Pro-Namespace-Write-Queues serialisieren in Aufrufreihenfolge, und `expectedRevision` wird an der Queue-Spitze beurteilt — dort kann der Service einen frischen Writer von einem mit stalem Snapshot unterscheiden.
- **Observer- und Listener-Fehler werden eingedämmt.** Watcher-Aufrufe und Event-Fan-out isolieren synchrone Throws und async Rejections, sodass ein kaputter Observer weder Commits noch die Reload-Schleife eines Providers blockieren kann; `INVARIANT`-codierte Fehler werden erneut geworfen, nachdem jeder Listener gelaufen ist.
- **Registrierungen sind Fiber-Effects.** Einen Namespace zu registrieren ist ein Effect auf der Fiber des aufrufenden Plugins: das Disposen dieser Fiber entfernt den Namespace und seine Observer.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Service Definition: Namespace-Validierung, Registrierung, Auflösung, Write-Queue, describe/Redaction, Events, `installSection` |
| [`src/redact.ts`](src/redact.ts) | `redactSecrets`-Walker: `role('secret')`-Felder entfernen und ihre Slots enumerieren |
| [`src/types.ts`](src/types.ts) | Client-sichere Type-Surface: Event-Deklarationen, `SettingsNamespace`, `SettingsUpdateSource` |
| [`src/invariant.ts`](src/invariant.ts) | Invariant-Companion: `settings/updated` feuert nur für einen registrierten Namespace, nur bei einer Änderung des aufgelösten Werts, mit dem maßgeblichen Wert |

### Auflösungs- und Write-Pfade

Jeder Write snapshotet seinen Input zur Aufrufzeit (detachiert und validiert JSON-förmige Daten) und reiht sich dann in die serialisierte Kette des Namespace ein. An der Queue-Spitze liest der Service die Sektion im aktuellen Stand erneut, prüft `expectedRevision`, merged/ersetzt/mutiert, löst den Kandidaten über das Schema plus das optionale `validate` des Owners auf und validiert ihn, persistiert über den Provider und committet und emittiert erst dann. Ein Write, dessen Registrant-Fiber mitten im Flug disposed wurde, erreicht den Storage noch, committet und benachrichtigt aber niemanden; Teardown verweigert neue Writes und entleert gequeuete Writes und gestartete Watcher-Aufrufe, bevor das Disposal abschließt.

### Änderungserkennung und Events

`commit` vergleicht aufgelöste Werte mit dem `deepEqualJson`-Prädikat des Seam und fächert `settings/updated` einen Listener nach dem anderen aus. `bumpRevision` vergleicht rohe Sektionen und emittiert `settings/document-updated` mit der neuen Revision; es läuft unabhängig von der Resolved-Value-Prüfung. Beide Fan-outs dämmen Listener-Fehler auf dieselbe Weise ein.

### Client-sichere Typen

Der `./types`-Subpath-Export hält die Event-Deklarationen zusammen mit den Typen `SettingsNamespace` und `SettingsUpdateSource`, die ihre Signaturen benennen, und der Paket-Root re-exportiert diese Typen. Ein Consumer außerhalb der Host-Compilerfläche liest so exakt die Signatur, die der Host emittiert, statt sie erneut zu formulieren.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Service-Vertrag nicht ausreicht. Sie bewegen sich vom gemeinsamen Subsystem-Vokabular zum ausgelieferten Provider und zur Capability-Architektur.

- [Settings-Subsystem-Referenz](../../../docs/subsystems/settings.de.md) — Namespaces, Registrierung, Owner-Scope, Descriptoren, Change-Commits und die generierte Cordis-Surface.
- [Dateibasierter Settings-Provider](../settings-file/README.de.md) — der ausgelieferte YAML/JSON-Provider: Konfiguration, Hot-Reload, kommentar-erhaltende Writes.
- [Settings-Paketkarte](../README.de.md) — die beiden Pakete der User-Settings-Capability und ihre Rollen.
- [Capability Seams](../../../docs/capability-seams.de.md) — die Service-Definition-/Service-Provider-/Consumer-Aufteilung, der dieser Service folgt.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über Consumer-Plugins, die jeglichen model-facing Content besitzen, der von einem Settings-Wert gespeist wird; der Service speichert und löst nur User-Settings auf und registriert selbst nichts Model-facing.

#### KV-Cache-Effekt

Keine direkte Invalidierung; ein Consumer, der einen Settings-Wert in das Request-Präfix faltet, besitzt diese Änderung.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Service schlecht passt oder besondere Aufmerksamkeit braucht. Es sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Ein einziger User-Layer** — die Auflösung kennt Schema-Defaults, eine Kompositions-`base` und ein User-Dokument; sie zeichnet nicht auf, welcher Layer jeden aufgelösten Wert geliefert hat.
- **`redactSecrets` ist keine bewiesene Wire-Grenze** — der Walker folgt `object`/`dict`/`array`-Containern, sodass ein `role('secret')`-Feld, das nur über eine Union, Intersection oder Transform erreichbar ist, wörtlich mit einer leeren `secrets`-Liste zurückgegeben wird, und das serialisierte Schema trägt den Default eines Secret-Felds zu jedem Client. Keiner der beiden Fälle wird abgelehnt; ein Schema, dessen Secrets nicht über die gewalkten Container erreichbar sind, darf nicht auf einem wire-exponierten Namespace registriert werden. Ein fail-closed `describeForWire()` — eines, das ein Schema ablehnt, dessen Sicherheit es nicht beweisen kann, und die serialisierte Hülle und Fehlertexte sanitisiert — ist die zurückgestellte Antwort.
- **Prozessübergreifende Concurrency ist provider-definiert** — der Service serialisiert Writes pro Namespace nur im Prozess; gleichzeitige Prozesse konvergieren über Provider-Verhalten (der File-Provider führt Read-Modify-Write unter einem Writer-Lock aus, sodass Namespaces gleichzeitige Writer überstehen und Same-Namespace-Konflikte last-write-wins aufgelöst werden).

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Design-Richtungen, die nicht entschieden sind. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen liegen in den Abschnitten oben und im Paket-Code. Offene Richtungen, in Code-TODOs verfolgt: den öffentlichen `ns`-Parameter überall in der API, im Provider-Vertrag, in Implementierungen, Tests und Consumern zu `namespace` umbenennen; Watcher zu deaktivieren und ihre Tails bei der Registrierungs-Disposal abzuwarten, damit Callbacks die Registrant-Fiber nicht überleben; eine Ersatz-Registrierung aus ihrer persistierten Sektion neu aufzulösen, damit ein in-flight alter Write sie nicht stale hinterlässt; und property-sichere Objektkonstruktion zu verwenden, damit gültige JSON-Keys wie `__proto__` eigene Daten bleiben. Der fail-closed `describeForWire()`-Sanitizer ist die zurückgestellte Antwort auf die Redaction-Einschränkung oben.

</details>
