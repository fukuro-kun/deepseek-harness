---
description: "jsdom-Slot-Testruntime für Browser-Feature-Specs, für Testautoren, die Slots, Stores und Rendering gegen die Produktionsmaschinerie prüfen."
kind: "package-library"
---

# @deepseek-ai/dsh-client-test-runtime
[English](README.md) | [中文](README.zh.md) | Deutsch


## Überblick

`dsh-client-test-runtime` lässt Browser-Feature-Specs das produktive Slot-, Store-, Rendering-, Update- und Dispose-Verhalten in jsdom prüfen, ohne die UI-Runtime erneut zu implementieren. Testautoren können typisierte Session-, Workspace-, Projection- und Conversation-Fixtures veröffentlichen, slot-lokale DOM-Wurzeln abfragen und Remote-Antworten oder -Fehler skripten. Fehlende Services, nicht gestubbtes Session-Verhalten und unerwartete Datei-Uploads schlagen an der Aufrufstelle fehl, während das Dispose idempotent ist. Nur aus repository-internen, browserorientierten Vitest-Suites über `devDependencies` verwenden; es ist weder ein Produkt-Plugin noch ein allgemeines Node-Testharness.

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

Dieses Paket gibt einer Browser-Feature-Spec eine echte Runtime zum Mounten: die Bench erstellen, die Slots deklarieren, die das Feature belegt, das Feature-Plugin mounten, einen Slot rendern, auf der lokalen View asserten und disposen — ohne eine zweite Implementierung der Produktionslogik.

### Eine Feature-Spec aufsetzen

`SlotTestRuntime.create()` assembliert die Runtime, `declare(children)` registriert ein Auto-Frame, dessen pro-Key `<div data-slot>`-Wrapper zu Snapshot-Wurzeln werden, `mount(plugin)` führt das Feature auf einem echten Fiber aus, und `renderSlot(key, owner, opts?)` liefert die slot-lokale View mit eingeschränkten Queries und In-place-Updates:

```text
const runtime = await SlotTestRuntime.create()
await runtime.declare({ 'feature-slot': {} })
const handle = await runtime.mount(FeaturePlugin)
const view = runtime.renderSlot('feature-slot', { owner: props })
expect(view.container).toMatchSnapshot()
await runtime.dispose()
```

`mount` prüft benötigte Services vorab und schlägt laut fehl, wenn einer fehlt — `provide(name, value)` liefert vorher einen zusätzlichen Service. Die Runtime stellt einen nicht verfügbaren `fileUpload`-Stub bereit, damit Assemblies mounten können; ersetze `runtime.fileUpload.upload` vor dem Mounten, wenn ein Test Upload-Verhalten prüft. `storeOf(key, scopeKey)` liefert die Live-Store-Instanz, die der Renderer der Komponente eines Slots übergibt, für Identitäts- und aktionsgetriebene Schreib-Assertions.

Die optionalen Render-Optionen wählen mit `entryKey` einen Keyed-Eintrag oder mit `only` ein Listenelement; `view.update(owner)` behält diese Auswahl. `runtime.panelInfo` liefert die Standard-`usePanelInfo`-Quelle ohne ausgewähltes globales Panel. Gib sie mit `releasePanelInfoSource()` frei, bevor der produktive Layout-Owner gemountet wird. `dispose()` gibt sowohl den Standard-Workspace- als auch die Panel-Info-Root-Quelle frei; ein frühes Freigeben ist idempotent und entfernt keine Ersatz-Owner.

### Lokale DOM-Snapshots

Ein registrierter Snapshot-Serializer faltet CSS-Module-Klassenhashes (`_frame_a1b2c3` → `frame`), damit `.snap`-Dateien strukturell bleiben, und kollabiert `<svg>`-Inhalte zu einem `data-content`-Fingerprint. Suites, die einen eigenen Seiten-Frame brauchen, verwenden statt des Auto-Frames `root.declare(children, Frame)`; `dispose()` reißt Views, Feature-Fibers, gemintete Scopes und persistierten Store-State auf einer Achse ab und ist idempotent.

### Remote-Antworten und -Fehler skripten

`TestRemote` ist das Double für die `ctx.remote`-Seite: Es registriert sich selbst plus einen Service pro geskriptetem Namespace, sodass ein Plugin, das `remote.<name>` injiziert, aufgeht, treibt `$on`-Subscriptions über einen expliziten Test-Event-Treiber und exponiert `$host` als schlichtes mutierbares Feld, dem eine Spec direkt zuweist, um einen gehomten oder nicht-Loopback-Host zu skripten. Dieses Paket ist auch die Stelle, an der eine UI-Spec den `RemoteError`-Konstruktor als Wert bezieht — die `dsh-api-remotes`-Facade kann ihn nicht tragen, weil ein Value-Import aus einer Spec die noch nicht gebaute `/remote`-Artefaktkette dieser Assembly ziehen würde.

Skripte einen Fehler über den Code, mit dem der Host antworten würde, und assertiere so wie der Produktionscode diskriminiert — auf `code`, niemals auf die Klasse:

```text
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'

remote.goals.create.mockResolvedValue({
  ok: false,
  error: new RemoteError('goal/not-found', 'goal "g1" does not exist', { goalId: 'g1' }),
})
expect(view.getByRole('alert')).toHaveTextContent('goal/not-found')
```

### Wann verwenden

Nutze die Bench für Feature-Suites, die Slots, Stores, Rendering und Dispose unter einer echten Runtime prüfen — die produktive `SlotRegistry`, der Renderer und die Provide-Bundle-Materialisierung werden gemountet, nie neu implementiert. Es ist browserseitige Testinfrastruktur: Es erreicht nie einen Model-Request, und Feature-Pakete hängen nur über `devDependencies` davon ab.

### Was schiefgehen kann

- **Ein deklarierter Service wird nicht bereitgestellt** — `mount` schlägt laut mit den fehlenden Namen fehl; stelle sie vorher mit `provide()` bereit.
- **Ein Render wird vor `declare` versucht** — `renderSlot` schlägt laut fehl; deklariere den Key zuerst.
- **Eine Spec ruft ein nicht gestubbtes Verb auf einem Session-Behavior-Stub auf** — Fixture-Stubs schlagen by Design laut fehl, sodass ein fehlender Stub an der Aufrufstelle sichtbar wird statt still zu passieren.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design der Bench; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Design

Die Bench kopiert keine Produktionslogik: Sie mountet die produktive `SlotRegistry`, den produktiven Renderer und den `UiSession`-Adapter. `TestSessions` und `TestWorkspaces` implementieren die Owner-Interfaces, die Features über Cordis konsumieren, jede Fixture-Session implementiert `SessionFace`, und `stubSettingsScope` implementiert `SettingsScope`. `UiSession` leitet aus diesen Controller-Bindings die Standard-Renderer-Quellen ab. Nicht gestubbtes `ISession`-Verhalten schlägt mit dem fehlenden Methodennamen fehl.

### Source-Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `SlotTestRuntime`-Assembly, `TestRoot`, Auto-Frame, `mount`/`dispose` |
| [`src/sessions.ts`](src/sessions.ts) + [`src/workspaces.ts`](src/workspaces.ts) | `ISessions`/`IWorkspaces`-Testdoubles und `FixtureSession`-Behavior-Stubs |
| [`src/fixtures.ts`](src/fixtures.ts) | Schlichte Fixture-Builder: Conversation-Snapshots, Workspace-Listen-State |
| [`src/snapshot.ts`](src/snapshot.ts) | DOM-Snapshot-Serializer (Klassenhash-Faltung, `<svg>`-Fingerprint) |
| [`src/remote.ts`](src/remote.ts) | `TestRemote`-Double für Host-RPC, `RemoteError`-Wert-Re-Export |
| [`src/translate.ts`](src/translate.ts) + [`src/locale-env.ts`](src/locale-env.ts) | Übersetzungs- und Pinning-Browsersprache-Testhelper |
| [`src/settings-scope.ts`](src/settings-scope.ts) | `stubSettingsScope` mit testgetriebenen Publikationen und einem Write-Spy |
| — | Es wird kein Runtime-Invarianten-Companion veröffentlicht; dieses Test-Support-Paket besitzt keinen produktiven Event-Stream und keine mutierbaren Daten — es assembliert die Runtime-SlotRegistry und den Renderer (deren Pakete ihre Invarianten besitzen) um Testdoubles; sein eigenes Verhalten wird durch seine Paket-Tests geprüft. |

### Lifecycle

`create()` baut einen frischen Kontext, mountet die Slot- und Conversation-Registries, installiert den Renderer und stellt die Session-/Workspace-Doubles plus den laut-fehlschlagenden File-Upload-Stub bereit. `mount` prüft jede deklarierte Injection gegen den Kontext, bevor der Fiber startet, sodass ein fehlender Provider laut fehlschlägt statt ewig zu suspendieren. `dispose()` unmountet zuerst React-Bäume, disposiert dann Feature-Fibers, gibt die Root-Registrierung frei, disposiert gemintete Session-Scopes und leert persistierten Store-State; jeder öffentliche Mutator ist act-gewrappt, sodass Tests weder SlotCore-Microtask-Batching noch React-`act` selbst behandeln müssen.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der paketweite Vertrag nicht reicht. Sie führen von der Bench zu der Produktionsmaschinerie, die sie mountet, und zu den Tests, die sie nutzen.

- [ui-session](../../client/ui-session/README.de.md) — der produktive Adapter, der Standard-Slot-Quellen aus den Controller-Doubles ableitet.
- [UI-Slots-Paket](../../client/ui-slots/README.de.md) — der `SlotRegistry`-Vertrag, den die Bench mountet.
- [UI-Renderer-Paket](../../client/ui-renderer/README.de.md) — der Renderer, den die Bench installiert.
- [Teststrategie](../../../docs/testing.de.md) — die Coverage-Stufen und die Browser-Snapshot-Lane.
- [Test-Support-Gruppenkarte](../README.de.md) — Schwester-Harnesses und Support-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da dieses Paket browserseitige Testinfrastruktur ist; nichts hiervon erreicht einen Model-Request.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert weder einen Provider-Request noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wie die Bench konsumiert wird. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Nur Vitest und jsdom** — jeder Consumer ist eine repository-interne, browserorientierte Vitest-Suite. Das Paket ist kein Produkt-Plugin und kein allgemeines Node-Testharness.
- **Session-, Conversation- und Chat-Fixtures bleiben getrennt** — `sessionSnapshot` enthält nur Session-Controller-State, `conversationSnapshot` enthält target-neutralen Conversation-State, und `chatSnapshot` enthält Chat-Target-State. Assembly-Tests stellen Session-Event-Einträge bereit, statt `SessionSnapshot` um Conversation- oder Chat-Felder zu erweitern.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
