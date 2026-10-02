# Postmortem 0001: ACP-Server stürzte beim Verbinden ab — `export default` verwirft `inject` des Plugins

[English](0001-acp-default-export-drops-inject.md) | [中文](0001-acp-default-export-drops-inject.zh.md) | Deutsch

Status: gelöst (Fix in PR #41 `feat/acp-2-bridge`)

## Executive summary

Zwei Integrationsfehler brachten ACP trotz voller Unit-Test-Abdeckung zum Absturz: ein Default-Export veranlasste den Loader, `inject` zu verwerfen, und eine verfolgte Optional-Service-Suche scheiterte an einer Shadow-Grenze. Hand-gemountete Tests umgingen beide Pfade. Die Fixes ergänzten keylose Real-Loader-Abdeckung und Package-Regeln für Plugin-Exporte und Optional-Service-Zugriff.

## Summary

Der ACP-Server (`dsh --profile acp`, `@deepseek-ai/dsh-acp`) stürzte in dem Moment ab, in dem ein echter Editor (Zed) sich verband: die erste `session/new`-Anfrage returned `Internal error: cannot get property "agents" without inject`, und `session/load` returned dasselbe für `sessionPersistence`. Die Bridge war in Produktion komplett nicht funktionsfähig trotz 178 grüner Unit-Tests und 100% Zeilenabdeckung. Zwei unabhängige Bugs versteckten sich hinter derselben Fehlermeldung, und die Test-Suite verpasste beide aus demselben Grund: jeder Test mountete das Plugin über einen Pfad, der weder seine tatsächliche Ladeweise noch die tatsächliche Service-Auflösung exerciseierte.

## Impact

Der ACP-Server konnte keine einzige Session erstellen oder laden — die beiden RPCs, die ein Editor zuerst aufruft. Jeder, der den Agent in Zed einband, erhielt sofort einen harten Fehler. Kein Datenverlust (nichts wurde vor dem Absturz persistiert); die Kosten bestanden vollständig aus „das Feature funktioniert nicht" plus der Debug-Zeit, um herauszufinden warum, zweimal.

## Timeline

- Die Bridge (RFC 010) landete mit einer vollständigen Unit-Suite für Codec, In-Memory-Transport, generierte Protokollnachrichten, Fehlerpfade und HMR; einem key-gated Real-API-e2e; und einem keylosen stdout-Purity-e2e. Alle grün, 100% Abdeckung.
- Eine echte Zed-Session scheiterte sofort bei `session/new` mit `cannot get property "agents" without inject`.
- Die Untersuchung verfolgte anfangs eine Cordis-„traceable/shadow"-Theorie (plausibel, und der Mechanismus ist real — siehe Bug #2), instrumentierte dann den tatsächlichen Fiber-Walk im vendored `reflect.ts` und führte den echten Subprocess aus. Der Trace zeigte den Throw in `apply()` Zeile 179 *zur Plugin-Ladezeit*, am ROOT-Fiber ohne Shadow — und widerlegte damit die Shadow-Theorie für `session/new`.
- Root cause #1 gefunden: ein versehentliches `export default apply`. Entfernen reparierte `session/new`.
- Entfernen offenbarte dann Bug #2: `session/load` warf weiterhin bei `sessionPersistence` — ein genuinely unterschiedlicher Mechanismus (der Shadow-Walk), bestätigt durch Isolieren des Fixes und erneutes Ausführen des echten Subprocess.

## Root cause #1 — `export default apply` verwirft `inject` des Plugins (brach `session/new`)

`packages/acp/acp/src/index.ts` ist ein *Namespace-Plugin*: es exportiert `name`, `inject`, `Config` und `apply` als separate Named Exports, wie jedes andere Plugin im Repo (`invariants`, `llm-deepseek`, `tool-bash`, `tui` …). Aber es *endete zusätzlich* mit einer Zeile, die kein anderes Plugin hatte:

```ts ignore-check
export const name = 'acp'
export const inject = ['agents', 'sessions', 'sessionPersistence']
export function apply(ctx: Context, config: AcpConfig): void { /* … */ }
// …
export default apply   // ← the bug
```

Wenn ein Plugin aus `cordis.yml` geladen wird, normalisiert der Cordis-Loader das importierte Modul durch `Loader.unwrapExports` (`vendor/loader/src/index.ts`):

```ts ignore-check
unwrapExports(exports: any) {
  if (isNullable(exports)) return exports
  exports = exports.default ?? exports        // ← prefers `.default`
  if (!exports.__esModule) return exports
  return exports.default ?? exports
}
```

Mit vorhandenem Default-Export resolved `exports.default ?? exports` zur **nackten `apply`-Funktion**. Eine nackte Funktion hat kein `inject`, kein `name`, keine `Config`-Eigenschaften — diese existierten als *Sibling*-Named-Exports im Modul-Namespace, und das Unwrap zu `.default` verwarf den Namespace. Der Loader baute dann den Plugin-Fiber aus einem leeren `inject`.

Folglich lief `apply` in einem Fiber **ohne injizierte Services**. Die allererste Zeile, `const agents = ctx.agents`, durchlief den Fiber-Baum (ROOT → Include → Loader → ROOT) und, da `agents` in keinem Fiber-Store gefunden wurde und der Root-Fiber erreicht wurde (`runtime === null`), warf `cannot get property "agents" without inject`. Der Absturz geschah zur *Ladezeit*, nicht in einem späteren Request-Handler — der Request war lediglich zufällig das, was den Load im fehlerhaften Trace auslöste.

**Fix:** `export default apply` löschen. Der Loader verwendet dann den Modul-Namespace, berücksichtigt `inject`/`name`/`Config`, und `apply` läuft in einem Fiber, der die deklarierten Services tatsächlich gewährt.

## Root cause #2 — Optional-Service-Lesezugriff triggert den Inject-Guard durch einen Traceable-Shadow (brach `session/load`)

Mit #1 repariert funktionierte `session/new`, aber `session/load` warf weiterhin `cannot get property "sessionPersistence" without inject`. Dieser *ist* der Cordis-Traceable/Shadow-Mechanismus, und es lohnt sich, ihn präzise zu verstehen.

`session/load` ruft `agents.resume(...)` auf, das an `AgentLoop.resume()` delegiert, welches `this.ctx.sessionPersistence` las. `AgentLoop`'s `static inject` schließt `sessionPersistence` bewusst NICHT ein — es zu injizieren würde nicht-persistente Demos für immer auf einen Backend warten lassen, der nie lädt. Der Service wird von einem separaten Sibling-Plugin/Fiber bereitgestellt und opportunistisch gelesen.

Service-Zugriff in Cordis erfolgt über einen Context-Proxy (`vendor/cordis/src/reflect.ts`). Wenn eine Service-Methode über einen *Traceable-Proxy* aufgerufen wird, der von einem fremden Fiber stammt (hier: das Bridge-Fiber ruft `ctx.agents.resume` auf, und die Registry returned `this.factory` — den `AgentLoop` — neu gewrappt als frischen Traceable-Proxy gebunden an den Aufrufer), rebindet `createShadowMethod` (`vendor/cordis/src/utils.ts`) `this` an ein *Shadow*-Objekt, dessen `ctx` `[symbols.shadow]` trägt, das auf `AgentLoop`'s eigenen Konstruktions-Context zeigt. Innerhalb von `resume` resolved dann `this.ctx.sessionPersistence` mit dem Proxy-Handler, der seinen Fiber-Walk beim Shadow-Fiber startet:

```ts ignore-check
// reflect.ts get handler
let fiber = (ctx[symbols.shadow] as Context ?? ctx).fiber   // ← starts at AgentLoop's fiber
while (true) {
  const impl = fiber.store?.[prop]
  if (impl) return getTraceable(ctx, impl.value)
  if (prop in fiber.inject) { /* inactive-context error */ }
  if (!fiber.runtime) throw error                            // ← reached root, throw
  if (fiber.parent[symbols.isolate][prop] !== key) throw error
  fiber = fiber.parent.fiber                                 // ← ancestor-only
}
```

Der Walk ist **nur-ancestor**. `sessionPersistence` ist weder in `AgentLoop`'s Fiber-Store (nicht in seinem `static inject`) noch in einem Ancestor auf dem Weg zum Root (es lebt auf einem *Sibling*-Branch), also erreicht der Walk den Root-Fiber und wirft.

Warum fingen die In-Memory-`AgentLoop`-Resume-Tests das nicht? Weil sie `ctx.agents.resume(...)` direkt aus dem Test-Code aufrufen — *außerhalb jedes Plugin-Fibers*. Dort ist `ctx.fiber.runtime` `null`, also nimmt der Proxy-Handler einen frühen Bypass:

```ts ignore-check
if (!ctx.fiber.runtime) return ctx.reflect.get(prop, false)   // ← direct global-store lookup, no fiber walk
```

`ctx.reflect.get(name, false)` ist ein direkter Lookup im globalen Service-Store, keyed nach dem Isolate-Symbol — er ignoriert die Fiber-Topologie vollständig und findet den Service. Von einem Top-Level-Test aus funktioniert der Lesezugriff; von innerhalb eines echten Plugin-Fibers, erreicht über einen Shadow, wirft er. Die Bridge ist exakt letzteres.

**Fix:** Den Optional-Service mit `ctx.get('sessionPersistence')` lesen, das den globalen Isolate-keyed-Store verwendet und gleichzeitig Active-State-Checks bewahrt. Direkte Eigenschafts-Lesezugriffe bleiben für Services in der deklarierten Injection-Set des Plugins angemessen.

## Warum jeder Test ihn verpasste (das eigentliche Versagen)

Beide Bugs teilen eine root-cause-Prozesslücke: **kein Test exerciseierte das Plugin über seinen echten Load-Pfad oder seine echte Aufruf-Topologie.**

- Die In-Memory-Harness mountet die Bridge durch manuelles Zusammenbauen eines Plugin-Objekts: `ctx.plugin({ name, inject, apply })`. Das liefert `inject` manuell, kann also Bug #1 nie reproduzieren — `unwrapExports` wird nur vom *Loader* aufgerufen, nie von `ctx.plugin`. Selbst `ctx.plugin(NamespaceImport)` hätte ihn nicht gefangen.
- Dieselbe Harness mountet alles flach auf einem Root-Context, also erreicht ein `AgentLoop`-Resume davon entweder Top-Level (der `!runtime`-Bypass) oder über einen Shadow, dessen Origin noch am Root resolved — was Bug #2's Ancestor-Walk-Fehler maskierte.
- Das einzige keylose e2e sendete `initialize` und prüfte stdout-Purity. `initialize` erreicht nie die Factory, also segelte es an beiden Bugs vorbei.
- Der einzige Test, der `session/new`/`session/load` antrieb, war key-gated, also übersprang CI (ohne Key) ihn — und lokal „passierte" er nur, weil ein veraltetes gebautes `lib/` (mit dem alten Code) zufällig die Modul-Auflösung befriedigte.

100% Zeilenabdeckung war die ganze Zeit erfüllt. Abdeckung beweist, dass Zeilen *liefen*; sie sagt nichts darüber, ob das Feature *so funktioniert, wie es ausgeliefert wird*.

## Hinzugefügte Guardrails

- **`export default apply` entfernt** (`packages/acp/acp/src/index.ts`) — der Bug-#1-Fix.
- **`AgentLoop.resume` liest `this.ctx.get('sessionPersistence')`** (`packages/core/agent-loop/src/index.ts`) — der Bug-#2-Fix, mit einem Kommentar, der die Shadow-Walk-Falle erklärt.
- **Keyloses `session/new`-e2e über echtes stdio** (`apps/cli/tests/profiles/acp/tests/acp.e2e.ts`): bootet das Profile als Subprocess durch den echten Loader und assertiert, dass `session/new` resolved. Das scheitert laut an Bug #1 ohne API-Key. Verifiziert, dass es scheitert, wenn `export default apply` wiederhergestellt wird.
- **`TSX_TSCONFIG_PATH` im e2e-Spawn**: der Subprocess läuft aus einem temporären cwd, in dem tsx die Repo-Root-tsconfig-`paths`-Map nicht durch Aufwärtssuchen finden kann — also fielen dsh-*-Imports lautlos zurück auf gebautes `lib/`. tsx auf die Repo-tsconfig zu pointen macht die Auflösung cwd-unabhängig und stellt sicher, dass der Test *Source* läuft, nicht ein möglicherweise veralteter Build.
- **[docs/testing.md](../testing.de.md)-Regel**: „teste den echten Entry-Pfad", Zeilenabdeckung ist keine Verhaltensabdeckung — kodifiziert die Lektion für jedes zukünftige Plugin.

## Lessons

- Ein Namespace-Plugin und ein Default-Export sind unter dem Cordis-Loader gegenseitig ausgeschlossen. Wähle die Namespace-Form (`name`/`inject`/`Config`/`apply`) und füge kein `export default` hinzu — `unwrapExports` verwirft den Namespace.
- Für einen Service, den ein Plugin opportunistisch liest aber NICHT in `static inject` deklariert, verwende `ctx.get(name)`, niemals `ctx.<name>`. Der Property-Proxy resolved durch einen nur-ancestor-Fiber-Walk, der über einen fremden Shadow scheitert; `ctx.get(name)` ist der Topologie-unabhängige Lookup (und standardmäßig strict — ein inaktiver Backend liest als `undefined` statt mid-teardown zurückgegeben zu werden).
- Ein Test, der ein Plugin von Hand konstruiert, kann nicht validieren, wie das Plugin lädt. Mindestens ein Test muss den echten Loader/Export-Pfad end-to-end treiben. Wenn die Kopf-Operation das Modell nicht aufruft, braucht dieser Test keinen API-Key — also gehört er ins CI, nicht hinter ein Key-Gate.
- Vertraue dem Trace, nicht der Theorie. Die elegante Shadow-Erklärung war real, aber sie war der *zweite* Bug; der *erste* war ein einzeiliger Export-Fehler, den ein `console.error` im Fiber-Walk in Minuten fand, nach Stunden plausibler aber falscher Argumentation.
