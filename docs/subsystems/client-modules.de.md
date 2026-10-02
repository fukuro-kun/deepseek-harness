# Client Modules

[English](client-modules.md) | [中文](client-modules.zh.md) | Deutsch

Die Web-Plugin-Tabelle: die Node-Hälfte des Client-Modulsystems in [dsh-client-modules](../../packages/client/modules), bereitgestellt als `ctx.clientModules` (`ClientModuleRegistry`). Sie scannt die Entries des Host-Loader nach Packages, die `dsh.client` deklarieren, komponiert den `window.__DSH_BOOT__`-Entry-Graphen, serviert versionierte Ein-oder-mehrere-Ressourcen-Combo-Skripte unter `/plugins` und beantwortet jede Index-Injection-Sammlung mit den Boot-Protokoll-Zeilen — die vier Faces eines einzigen Service. Sie ist eine optionale Fähigkeit des Web-GUI-Stacks, nicht Teil der agent-loop-Spine, und sie ist Consumer von [dsh-host-webserver](../../packages/host/webserver): Der in [web-server.md](web-server.de.md) beschriebene Carrier liefert die Prefix-Route und das `webserver/index-inject`-Event, das dieser Service beantwortet. Die Browser-Hälfte desselben Packages (`ctx.modules`, die lazy-CJS-Modultabelle, die diese Bundles fetched und materialisiert) ist Kernel-Machinerie, die im [Package-README](../../packages/client/modules/README.de.md) dokumentiert ist, nicht hier.

Quelle: [`packages/client/modules/src/client/manifest.ts`](../../packages/client/modules/src/client/manifest.ts)

## Der Wire

Der Graph ist die alleinige Wire-Quelle zwischen Node- und Browser-Hälfte. Der Host komponiert `WebBootEntry`-Zeilen und `WebBootBatch`-Deskriptoren aus den gescannten Packages und trägt dann vor dem Vite-Entry die Registration-Facade, die Application-Preloads, die Bootstrap-Skripte und das Graph-Global in die strukturierte Index-Injection-Tabelle ein. Die `global`-Zeile rendert als `globalThis["__DSH_BOOT__"]` mit escaped `<`, damit Plugin-kontrollierte Strings nicht aus dem script-Element ausbrechen können. Eine Seite ohne gültiges Manifest kann nicht booten: Der Browser-Parser weist malformed Zeilen oder Batches, unbekannte Member und Entries zurück, die nicht genau einem initialen Combo-Deskriptor zugehören.

```ts type-equiv
/**
 * One composed client entry pushed by the host (a graph row). Wire
 * single source: the host node half (package root) produces this same shape.
 * `immediately` marks stage-one prefetch. `inject` names package rows whose
 * factories must arrive before this row materializes, while Cordis separately
 * uses the same package edges to compose entries. `external` carries exact
 * non-inject module requests (see {@link WebBootGraph.entries}).
 */
interface WebBootEntry {
  /** Entry name == package name. */
  id: string
  /** Revisioned single-resource combo endpoint used by HMR. */
  url: string
  /** Opaque plugin-artifact revision used for HMR cache busting. */
  rev: string
  /** Package-name dependency edges used for factory arrival and plugin composition. */
  inject?: string[]
  /** Stage-one prefetch mark: load the script for factory registration during module-face boot. */
  immediately?: boolean
  /** Non-baseline module specifiers this row requests; omitted when it requests none. */
  external?: string[]
}
```

```ts type-equiv
/** Initial scheduling phase for one content-addressed combo script. */
type WebBootBatchPhase = 'bootstrap' | 'application'
```

```ts type-equiv
/** One initial combo script; a scheduling phase may span several descriptors. */
interface WebBootBatch {
  /** Parser-blocking bootstrap or preloaded application scheduling. */
  phase: WebBootBatchPhase
  /** Content-addressed combo script endpoint. */
  url: string
  /** Revision over the combined plugin script bytes and indexed source map. */
  rev: string
  /** Graph entry ids whose factories the script registers, in execution order. */
  entries: string[]
}
```

```ts type-equiv
/** The composed client entry graph the host injects as `window.__DSH_BOOT__`. */
interface WebBootGraph {
  /** Consistency anchor over the whole graph (content + bundle hashes). */
  rev: string
  /**
   * Composed entries in module-graph order — a dynamic package row precedes
   * rows whose `external` requests that package. Cordis activation order is
   * unrelated and remains owned by fiber service waiting.
   */
  entries: WebBootEntry[]
  /** Initial combo descriptors; every entry belongs to exactly one descriptor. */
  batches: WebBootBatch[]
}
```

Das `rev` jeder initialen Zeile ist ein opaker Prozess-Nonce plus Sequenz, sodass die Graph-Komposition nicht jedes Plugin-Artefakt hasht. Nachdem HMR eine Änderung beobachtet, wird die Revision dieser Zeile zum Hash ihres neuen Bundles und der verfügbaren Sourcemap. Die initialen Deskriptoren partitionieren die Zeilen in die Scheduling-Phasen bootstrap und application, und jede Phase kann mehrere Deskriptoren enthalten. Ihre URLs enthalten nur die geordnete Package-Ressourcenliste und die Revision; Phasennamen gehen nicht in die Route ein. Die Graph-Komposition erhält die Zeilenreihenfolge und splittet greedy, bevor die Map-Form-URL 3 KiB überschreitet. Startup-Combo-Revisionen hashen die kombinierten Plugin-Skript-Bytes und die indexed Sourcemap, und die Graph-Revision hasht sowohl Zeilen als auch Deskriptoren. `immediately` markiert die Stage-one-Registrierungsbarriere; Zeilen innerhalb eines Combo teilen dessen Skript-Transport, während getrennte Combos unabhängig laden.

## Der Scan

Ein Package tritt der Tabelle bei, indem es `dsh.client` (`platform: 'web'`, optionale `inject`-Kanten, optionales `immediately`) in seiner package.json deklariert und sein gebautes Bundle unter `exports["./client"]` exportiert. Jede Live-Zeile resolved aus ihrem eigenen Loader-Specifier und der `baseUrl` des besitzenden Tree — über dieselbe `loader.internal.resolveSync`-Implementierung, die auch ihr Host-Face importiert, falls verfügbar. Das nächstgelegene besitzende Package-Manifest liefert die Browser-Modul-Id, sodass relative Quell- und Built-Overlays die Package-Identität behalten. Unterschiedliche aktive Loader-Quellen, die auf denselben Package-Namen resolven, lassen die Komposition fehlschlagen; nach dem Unload einer Quelle liefert die überlebende Quelle die Zeile ohne Fiber-Restart.

Der Scan ist incremental pro Package; es gibt keinen Full-Rescan-Codepfad. Jede cordis-`internal/plugin`-Emission (Fiber-Konstruktion oder -Disposal) markiert den Entry-Namen der Fiber als dirty, und ein Microtask-Flush rekonkiliert jeden dirty Namen gegen die live Loader-Entries. Der Aktivierungs-Durchlauf seedet dieselbe Dirty-Menge mit allen aktuellen Entries und flusht synchron, sodass Erstscan und Steady-State eine Implementierung teilen — mit entgegengesetzter Fehlerhaltung. Bei der Aktivierung aggregiert eine malformed Deklaration oder ein fehlendes Bundle unter den bereits geladenen Entries zu einem lauten `AggregateError`, der jedes kaputte Package auflistet: Die Fiber geht auf FAILED und der Fail-loud-Sweep des Boots meldet es. Im Steady-State loggt ein kaputtes Package eine Warnung und darf die anderen nicht vergiften.

Package-Metadaten — einschließlich des negativen Urteils „kein Client-Package" — werden pro Loader-Specifier und besitzender Tree-Base-URL bis zum Restart gecacht. Ein Fiber-Restart aus derselben Quelle verwendet Zeile und rev unverändert wieder; Bundle-Inhaltsänderungen erreichen den Graphen nur über `rebuilt()`.

## Die Bundle-Route und Index-Injection

`GET`/`HEAD /plugins/??<package-a>/client.js,<package-b>/client.js&rev=<rev>` serviert ein exakt generiertes Combo-Skript; eine Ein-Ressourcen-Anfrage nutzt dieselbe Form und ist der HMR-Pfad. Ihre absolute `sourceMappingURL` ändert jedes Ressourcen-Suffix parallel und ergibt `/plugins/??<package-a>/client.js.map,<package-b>/client.js.map&rev=<rev>`. Die Map ist Indexed Source Map v3, auch bei nur einer Ressource. Eine mitgelieferte Komponenten-Map liefert ihre Section; eine Komponente ohne Map erhält eine Identity-Section, deren `sourcesContent` das generierte Bundle ist und deren Source-Name dessen gepackte `sourceURL` oder Plugin-Route ist. Jede Startup-Request-URL ist als UTF-8-Bytes gemessen höchstens 3 KiB; die Partitionierung rechnet mit der längeren Map-Form. Alle Application-URLs werden preloaded, und alle Bootstrap-URLs führen vor dem Graph-Global und dem Vite-Entry aus. Alle angebotenen Responses nutzen langlebiges immutable Caching. Unbekannte oder veränderte Ressourcenlisten, fehlende Revisionen und stale Revisionen antworten mit 404, statt andere Bytes auszuliefern oder den SPA-Fallback HTML als JavaScript zurückgeben zu lassen; andere Methoden sind 405. Die Injection-Zeilen tragen den aktuellen Graphen bei jedem Index-Render, sodass ein Reload immer gegen die Live-Komposition bootet.

## Der Service

```ts type-equiv
/** Filesystem baseline captured before a client artifact snapshot is read. */
interface ClientArtifactBaseline {
  /** Absolute path of the client bundle. */
  readonly path: string
  /** Bundle modification time in milliseconds. */
  readonly mtimeMs: number
  /** Bundle size in bytes. */
  readonly size: number
}
```

`ClientModuleRegistry` (`ctx.clientModules`, definiert in [`packages/client/modules/src/index.ts`](../../packages/client/modules/src/index.ts)) stellt die Reads und das Rebuild-Face bereit; Signaturen stehen im generierten [Service-Katalog](#ctxclientmodules--clientmoduleregistry). `graph()` gibt den aktuell komponierten Graphen zurück (ein stabiles Objekt zwischen Änderungen), `clientPath(id)` den absoluten Pfad des Bundles und `artifactBaseline(id)` die Bundle-stat-Werte, die vor dem Lesen des aktuellen Snapshots erfasst wurden. `rebuilt(id)` ist der einzige Einstiegspunkt, über den geänderter Bundle-Inhalt den Graphen erreicht: Es hasht das Bundle zusammen mit seiner aktuellen Sourcemap neu, und nur eine echte rev-Änderung rekomponiert den Graphen und benachrichtigt. `onRebuilt` feuert pro geändertem Bundle mit dem neuen rev; `onGraphChanged` feuert nach jedem Flush, der den Graphen rekomponiert hat (Zeile hinzugefügt oder entfernt oder eine rebuilt-rev-Änderung), und ist Pull-Modell — Listener lesen `graph()` erneut. Beide Notification-Pfade fangen Listener-Exceptions ab, sodass ein throwender Subscriber spätere Subscriber nicht überspringen und nicht den Auslöser des Flush killen kann.

In der Entwicklung ist [dsh-client-hmr](../../packages/client/hmr/README.de.md) der Watch-Treiber der Registry: Seine Node-Hälfte stat-pollt das Bundle jeder Graph-Zeile ab der vom Module-Host vor dem Lesen erfassten Baseline, ruft `rebuilt(id)` nur für eine geänderte oder dirty Zeile auf, resynct ihre Watch-Menge über `onGraphChanged` und broadcastet rev-Änderungen per SSE an die Browser-Hälfte. Sourcemap-Änderungen allein lösen keinen Reload aus; die aktuelle Map wandert in den Snapshot, wenn eine Bundle-Änderung es tut. Produktions-Graphen lassen die HMR-Zeile ganz weg; der Module-Host selbst watched niemals Dateien.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxclientmodules--clientmoduleregistry"></a>

### `ctx.clientModules` — `ClientModuleRegistry`

The web plugin table service: incremental `dsh.client` scan + wire composition + bundle route + index injection rows. Construction runs the activation scan synchronously — a malformed declaration or missing bundle among the already-loaded entries aggregates into one loud throw (FAILED fiber; the boot activation audit reports it).

```ts cordis-catalog
/**
 * Current composed entry graph (stable object between changes).
 * @returns the graph served as `window.__DSH_BOOT__`.
 */
graph(): WebBootGraph

/**
 * Absolute path of an entry's client bundle.
 * @param id - entry id (package name).
 * @returns the path, or undefined for an unknown id.
 */
clientPath(id: string): string | undefined

/**
 * Serve an advertised revisioned bundle or source map without a Web server.
 * Unknown URLs return 404, unsupported methods return 405, and `HEAD`
 * returns the same immutable headers without a body.
 * @param request - shell-carrier request for a `/plugins` resource.
 * @returns the exact response also exposed by the optional Web route.
 */
fetchBundle(request: Request): Response

/**
 * Filesystem baseline captured before an entry's current bytes were read.
 * HMR compares it with the live files when installing a watch, so a write
 * between startup composition and watch installation cannot disappear into
 * the watcher's initial state.
 * @param id - entry id (package name).
 * @returns the path and baseline, or undefined for an unknown id.
 */
artifactBaseline(id: string): ClientArtifactBaseline | undefined

/**
 * Re-hash one bundle (the HMR watch's registration hook — the only entry
 * point through which bundle content changes reach the graph).
 * @param id - entry id (package name).
 * @returns the new rev, or undefined for an unknown id.
 */
rebuilt(id: string): string | undefined

/**
 * Subscribe to bundle rebuilds; fires only when the re-hash changed the rev.
 * @param listener - receives the entry id and its new bundle rev.
 * @returns the unsubscriber.
 */
onRebuilt(listener: (id: string, rev: string) => void): () => void

/**
 * Fires after any flush that recomposed the graph (row added/removed, or a
 * rebuilt rev change). Pull model: listeners re-read {@link graph}.
 * @param listener - notified with no payload.
 * @returns the unsubscriber.
 */
onGraphChanged(listener: () => void): () => void
```

Source: [`packages/client/modules/src/index.ts`](../../packages/client/modules/src/index.ts)
<!-- END GENERATED cordis-surface -->
