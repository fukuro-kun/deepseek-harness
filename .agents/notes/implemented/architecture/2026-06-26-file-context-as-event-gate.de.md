# Agent Note: `dsh-fs-observation-policy` als Event-Gate-Plugin, nicht als Methoden-Interface

Status: implemented

[English](2026-06-26-file-context-as-event-gate.md) | [中文](2026-06-26-file-context-as-event-gate.zh.md) | Deutsch

## Problem

Die [split-fs-seam Agent Note](../simplification/2026-06-26-fsspec-style-fs-seam.de.md) hat `ctx.fileContext` zwischen die modellzugewandten Tools und den `ctx.fs`-Provider gesetzt: `dsh-tool-fs` injiziert `fileContext` und leitet jedes `read`/`write`/`edit` über dessen Methoden. Das macht `fileContext` **zwingend im Pfad**. Das Tool kann `ctx.fs` ohne es nicht erreichen, die Policy-Schicht besitzt den fs-I/O und das Read-Windowing, und ein Deployment, das keine Observed-State-Policy will, kann das Paket nicht einfach weglassen — `dsh-tool-fs` könnte `ctx.fileContext` dann nicht auflösen.

Das koppelt drei Dinge, die trennbar sein sollten:

1. **Was das Tool tut** — einen Pfad auflösen, ein Fenster lesen, eine Datei schreiben/editieren. Das ist die Aufgabe des Tools und braucht nur `ctx.fs`.
2. **Die Freshness-/Observation-Policy** — „edit erfordert einen vorherigen read", „write/edit muss auf der gelesenen Version aufsetzen". Das ist die Aufgabe des `dsh-fs-observation-policy`-Plugins.
3. **Die Aufzeichnung des Observed-State** — ein Seiteneffekt, der das Tool niemals an der Funktion hindern darf.

Weil das Tool `fileContext`-Methoden aufruft, ist das Entfernen der Policy-Schicht ein Breaking Change statt eines sauberen Verlusts eines *Add-ons*. Die Policy ist tragend dafür, dass das Tool überhaupt läuft — keine opt-in-Verschärfung.

## Entscheidung

Den Kontrollfluss umkehren. **`dsh-tool-fs` wird der Executor und ruft `ctx.fs` direkt**; **`dsh-fs-observation-policy` wird ein Gate- + Recorder-Plugin**, das über Events teilnimmt — niemals über eine Methode, die das Tool aufruft, und niemals durch Registrierung eines `ctx.fileContext`-Service.

```text
tool          dsh-tool-fs       executor: resolves, reads windows, writes/edits via ctx.fs;
                                emits fs policy events; renders results
policy        dsh-fs-observation-policy  plugin: listens to fs/write-intent +
                                fs/edit-intent (single-slot waterfall) and fs/observed
                                (emit) events; adds observed-state + freshness.
provider contract dsh-fs            ctx.fs: text IO + ATOMIC mutation primitives whose version
                                guard is OPTIONAL; owns the fs policy event vocabulary
provider      dsh-fs-local      local implementation of ctx.fs
```

Das Modell ist additiv: Ein nackter `ctx.fs` führt atomare, unbeschränkte Text-I/O aus, während `dsh-fs-observation-policy` Observed-State, Read-before-Edit und Versions-Guards hinzufügt. Ohne die Policy bleiben die Tools daher benutzbar, aber unbeschränkt. Ausgelieferte Agent-Configs laden die Policy; der Bare-Modus existiert, um die Policy an der Service-Grenze optional zu halten — nicht als normale Deployment-Haltung.

Die [Follow-up-Note zur Filesystem-Absence-Observation](../../archived/bug-fix/2026-08-09-filesystem-absence-observation.md) verfeinert das Recording-Payload von einer Nur-Erfolg-Version zu explizitem present/absent-State und verlangt, dass ein guarded Create ohne Ersetzung publiziert. Die Event-Gate-Eigentümerschaft und die No-I/O-Policy-Grenze bleiben unverändert.

`dsh-tool-fs` injiziert `fileContext` nicht mehr. Es injiziert `fs` sowie `tools`/`systemPrompt`.

## Die Policy wird durch Provider-CAS erzwungen, nicht durch ein `stat` von `dsh-fs-observation-policy`

`dsh-fs-observation-policy` erzwingt „write/edit muss auf der gelesenen Version aufsetzen" **ohne jemals selbst `stat` aufzurufen oder Versionen zu vergleichen**. Es liefert die beobachtete Version als CAS-Basis und überlässt die Staleness-Erkennung dem kritischen Mutationsabschnitt des Providers:

- „Was hat dieser Owner zuletzt beobachtet?" ist das Einzige, was `dsh-fs-observation-policy` lokal entscheidet — ein `WeakMap`-Lookup, kein I/O. Kein Eintrag heißt unseen; ein absent-Eintrag erlaubt nur ein guarded Create; ein present-Eintrag trägt die Basis für Ersetzung/Edit.
- „Ist die Version noch aktuell, oder ist das Create-Target noch absent?" wird **innerhalb der atomaren Mutationsgrenze des Providers** entschieden. `dsh-fs-observation-policy` liefert `replaceIfVersion` oder `createIfAbsent`; der Provider meldet `FS_STALE_VERSION` bei einer veralteten Version und `FS_NOT_OBSERVED`, wenn ein guarded Create gegen einen anderen Erzeuger verliert.

Das ist absichtlich so. Würde `dsh-fs-observation-policy` in seinem Waterfall-Handler `stat` aufrufen und Versionen vergleichen, gäbe es eine TOCTOU-Lücke zwischen dieser Prüfung und dem eigentlichen Write des Tools — die Datei könnte sich dazwischen ändern, sodass die Prüfung eine falsche Garantie wäre, die der Provider-Lock ohnehin absichern muss. Die Versionsprüfung im kritischen Abschnitt des Providers zu halten ist sowohl race-frei als auch ohne zusätzliches `stat`. `dsh-fs-observation-policy` führt also **kein** Filesystem-I/O aus; die „muss auf dem letzten Read aufsetzen"-Garantie wird durch CAS *realisiert*, und `dsh-fs-observation-policy` wählt nur die Basis (`vObserved`) und gate-t auf vorherige Observation.

## Provider-Contract-Änderung: Der Versions-Guard ist optional

Damit der Bare-Provider unbeschränkt ist, wird der Versions-Guard seiner beiden Mutationen **optional** — vorhanden ⇒ guarded, abwesend ⇒ unbedingt:

```ts ignore-check
// writeText: expected is now optional. The FsWriteIntent union is UNCHANGED.
writeText(target: FsTarget, content: string, expected?: FsWriteIntent, signal?: AbortSignal): Promise<FsWriteOutcome>
//   undefined          → unconditionally create-or-overwrite (bare default)
//   createIfAbsent     → create only, reject an existing file (dsh-fs-observation-policy, unobserved)   [unchanged]
//   replaceIfVersion   → overwrite only at the observed version, else FS_STALE_VERSION    [unchanged]

// editText: expected becomes optional (was the required { version: FsVersion }).
editText(target: FsTarget, edit: FsEditRequest, expected?: { version: FsVersion }, signal?: AbortSignal): Promise<FsEditOutcome>
//   undefined    → unconditionally replace literal text in the current content (bare default);
//                  a missing target still reports FS_STALE_VERSION
//   { version }  → edit only at that version, else FS_STALE_VERSION (the current behavior)
```

Die `FsWriteIntent`-Union selbst ändert sich nicht — der dritte „unbedingte" Zustand wird durch *Weglassen* von `expected` ausgedrückt, sodass beide Mutationen eine symmetrische Form teilen (`expected?`: weglassen = kein Guard, vorhanden = guarded). Das hält volle Rückwärtskompatibilität für die guarded Pfade, die `dsh-fs-observation-policy` nutzt; neu ist nur der bisher unmögliche „kein Guard"-Fall, und der ist der Bare-Provider-Default. Die Mutation läuft in beiden Fällen innerhalb des Per-Target-Locks des Backends, sodass ein unbedingter Write/Edit weiterhin atomar ist (keine zerrissenen Dateien); „unbedingt" lässt die *Versions*-Vorbedingung fallen, nicht die Atomarität. `editText` meldet ein fehlendes Target auf dem guarded wie auf dem unguarded Pfad als `FS_STALE_VERSION` und hält so einen einzigen Edit-Fehlercode für „das Target kann gerade nicht editiert werden".

## Event-Vokabular (im Besitz von `dsh-fs`)

Die Events leben in `@deepseek-ai/dsh-fs`, nicht in `dsh-fs-observation-policy`. Das wird durch den Entkopplungs-Contract erzwungen: `dsh-tool-fs` ist der Emitter, muss also die Event-Typen referenzieren und muss weiter kompilieren, obwohl `dsh-fs-observation-policy` keinen Methoden-Service mehr bereitstellt. `dsh-fs` ist das Paket, von dem `dsh-tool-fs` und `dsh-fs-observation-policy` bereits abhängen — der einzige Ort, an dem Emitter und Policy-Listener ein Vokabular teilen können, ohne dass der Emitter vom Policy-Plugin abhängt.

Diese Events tragen vorhandenes `dsh-fs`-Vokabular (`FsTarget`, `FsVersion`, `FsObservation`, `FsWriteIntent`) plus einen opaken Actor — keine modellzugewandten Konzepte (keine Zeilenfenster, nummerierten Zeilen oder gerenderten Footer sickern herunter).

**Die beiden `fs/*`-Entscheidungsevents sind Single-Slot-Waterfalls mit First-wins-Semantik.** `dsh-fs-observation-policy` returnt ohne `next()` aufzurufen und besitzt damit den Slot im Default-Deployment; ein früher oder mit `prepend` registrierter Listener würde diese Policy ersetzen. Permission-, Audit- und Sandbox-Belange bleiben auf dem komponierbaren `tools/execute`-Waterfall.

Der Actor ist in `dsh-fs` als `object` typisiert — ein reiner opaker Träger, den der Provider-Contract niemals liest oder einschränkt. Die Owner-Ableitung (`actor.agent?.session`) und die strukturelle Form `{ agent?: { session? } }` bleiben vollständig in `dsh-fs-observation-policy`, das den `object`-Actor in seinen Listenern auf diese Form einschränkt. `dsh-fs` besitzt die Event-Namen und das fs-Vokabular; es besitzt NICHT die Laufzeit-Owner-Struktur der Policy-Schicht.

```ts
import type { FsObservation, FsTarget, FsVersion, FsWriteIntent } from '@deepseek-ai/dsh-fs'

interface Events {
  /**
   * Single-slot decision: produce the write expectation for the next
   * ctx.fs.writeText. The default returns undefined (unconditional create-or-
   * overwrite — the bare provider). The policy listener returns createIfAbsent
   * (unobserved) or { kind: 'replaceIfVersion', version: vObserved } (observed).
   * The listener does NOT call next(): one decision, not a composable chain. @mode waterfall
   */
  'fs/write-intent'(target: FsTarget, actor: object | undefined, next: () => FsWriteIntent | undefined | Promise<FsWriteIntent | undefined>): Promise<FsWriteIntent | undefined>
  /**
   * Single-slot decision: produce the optional version guard for the next
   * ctx.fs.editText. The default returns undefined (unconditional edit of the
   * current content — the bare provider; no stat). The policy listener returns
   * { version: vObserved }, or throws FS_NOT_OBSERVED if the actor is unset or
   * has not observed the target. Does NOT call next(): one decision. @mode waterfall
   */
  'fs/edit-intent'(target: FsTarget, actor: object | undefined, next: () => { version: FsVersion } | undefined | Promise<{ version: FsVersion } | undefined>): Promise<{ version: FsVersion } | undefined>
  /**
   * Record that an actor observed a target as present at a version or absent.
   * Fire-and-forget (plain emit). Listeners MUST be
   * synchronous, side-effect-only recorders (`dsh-fs-observation-policy`'s is a WeakMap
   * write); the tool does not guard the emit, so a throwing listener surfaces as
   * the tool's isError result. No listener ⇒ nothing recorded.
   * @mode emit
   */
  'fs/observed'(target: FsTarget, observation: FsObservation, actor: object | undefined): void
}
```

Die `fs/*`-Entscheidungsevents sind **ungebundene Waterfalls, die vom Tool dispatched werden** (wie `agent/request`, das der Loop ohne `this` dispatcht), keine service-gebundenen Waterfalls (wie `llm/stream`). Der Dispatcher ist das `dsh-tool-fs`-Plugin, das kein Service ist.

## Tool-Contract (`dsh-tool-fs`)

Das Tool behält seine modellzugewandten Schemas (`read`/`write`/`edit`, Byte für Byte unverändert) und Prompt-Sections. Die Prompt-Guidance bleibt Policy-first, weil von einem Deployment, das die fs-Tools lädt, erwartet wird, dass es auch `dsh-fs-observation-policy` lädt: Dem Modell wird weiterhin gesagt, es solle vor dem Überschreiben oder Editieren lesen, und diese Anforderung gehört dem fs-observation-policy-Plugin, nicht dem Backend. Der Bare-Provider-Fallback ändert die Prompt-Haltung nicht.

`dsh-tool-fs` übernimmt die Executor-Aufgaben, die aus dem alten `fileContext`-Methoden-Service heraus verlagert wurden, einschließlich des **Read-Renderings** (`read-render.ts`: `buildWindow` + `formatReadOutput`, `READ_MAX_BYTES`, `READ_MAX_LINE_LENGTH`, `FileReadOutcome`/`FileTextLine`, plus `STREAM_MIN_SIZE` in `read.ts`), das jetzt das Rendering-Detail des Tools ist, da das Tool den Read besitzt. Diese Read-Rendering-Typen und -Helper wandern in `dsh-tool-fs`; das Policy-Plugin darf keine Typ-Abhängigkeit des Tools bleiben.

`dsh-tool-fs` ist ein einzelnes Root-Plugin, das alle drei Tools (`read`/`write`/`edit`) registriert — wie `dsh-tool-bash`. Es injiziert `fs` (plus `tools`/`systemPrompt`), niemals `fileContext`. (Der ursprüngliche Vorschlag hatte jedes Tool zusätzlich als `/read`-/`/write`-/`/edit`-Subpath-Plugin für fokussierte Deployments exponiert; das wurde bei der Implementierung gestrichen — kein Consumer brauchte ein Ein-Tool-Deployment, und das Subpath-Publishing erzwang maßgeschneiderte `tsdown`-/`tsconfig`-/`files`-/Workspace-Constraint-Behandlung, die kein Schwester-Tool-Paket trägt. Die Per-Tool-Registrierungshelfer (`applyReadTool`/`applyWriteTool`/`applyEditTool`) bleiben interne Module, die das Root-Plugin komponiert.)

Das `stat`-Budget wird minimiert, indem der Waterfall die Erwartung lazy erzeugt — der Bare-Default returnt `undefined` (kein Guard) und stat-t nie:

- **read** — ein `stat`; ein Metadata-Miss emittiert `{ kind: 'absent' }`, bevor `FS_NOT_FOUND` returnt wird, während eine Datei über `readText`/`streamText`, `buildWindow` läuft und dann `{ kind: 'present', version: info.version }` emittiert. Das bestätigende Post-Read-`stat` aus dem alten `fileContext.read` bleibt gestrichen; ein Writer, der zwischen dem Routing-`stat` und dem Read racet, kann schlimmstenfalls einen späteren guarded Edit unberechtigt stale machen.
- **write** — `expectation = await ctx.waterfall('fs/write-intent', target, exec, () => undefined)`, dann `ctx.fs.writeText(target, content, expectation)`, dann die present-Outcome-Version emittieren. **Null `stat` im Tool** — mit oder ohne `dsh-fs-observation-policy`.
- **edit** — `expectation = await ctx.waterfall('fs/edit-intent', target, exec, () => undefined)`, dann `ctx.fs.editText(target, edit, expectation)`, dann die present-Outcome-Version emittieren. **Null `stat` im Tool** in beiden Fällen: Der Bare-Default ist `undefined` (unbedingter Edit), sodass das Tool nie stat-t, um eine Basis zu fabrizieren. Ist das Target auf dem Bare-Pfad absent, meldet der Provider `FS_STALE_VERSION`; die Policy returnt `FS_NOT_FOUND` direkt, wenn sie bereits eine absent-Observation hält.

Das Tool übergibt `exec` (den Tool-Ausführungskontext) bei jedem Dispatch als `actor`-Argument, damit `dsh-fs-observation-policy` seinen Observed-State-Owner ableiten kann. Das Tool weiß nicht, ob das Policy-Plugin vorhanden ist: Es stellt im `next`-Thunk immer das Bare-Default-Verhalten bereit, und `dsh-fs-observation-policy` kurzschließt den Thunk im Default-Deployment, bevor er läuft.

**`fs/observed` feuert nach einer erfolgreichen Operation und nachdem eine Metadata-Probe Abwesenheit bestätigt hat.** Seine Listener müssen synchrone, nicht-werfende Recorder sein; das Tool guarded das einfache emit nicht, sodass ein werfender Listener einen anstehenden Read-Fehler ersetzen oder einen Fehlschlag melden kann, nachdem eine Mutation bereits erfolgte. Asynchrone oder fehlerbehaftete Observation braucht einen eigenen Event-Contract.

## Policy-Plugin-Contract (`dsh-fs-observation-policy`)

`dsh-fs-observation-policy` ist ein Plugin, kein Service. Es registriert kein `ctx.fileContext`, hat keine öffentliche Methodenfläche und exponiert keine `read`/`write`/`edit`/`resolve`-Methoden. Es hängt drei Listener über `ctx.on()`-Registrierungen an (jede returnt einen Disposer für HMR). Es hält weiter die Observed-State-`WeakMap<owner, Map<targetKey, FsObservation>>` und die strukturelle Owner-Ableitung (die den opaken `object`-Actor des Events auf die eigene `{ agent?: { session? } }`-Form einschränkt), injiziert aber kein `fs` — jeder Handler arbeitet nur auf der eigenen `WeakMap`, niemals auf `ctx.fs`.

- `fs/write-intent`-Listener: unseen/absent ⇒ `createIfAbsent`; present ⇒ `replaceIfVersion`. Er ruft `next()` NICHT auf: Er besitzt den einzelnen Entscheidungsslot vollständig.
- `fs/edit-intent`-Listener: unseen ⇒ `FS_NOT_OBSERVED`; absent ⇒ `FS_NOT_FOUND`; present ⇒ sein Versions-Guard. Er ruft `next()` NICHT auf.
- `fs/observed`-Listener: den present/absent-Diskriminatorwert aufzeichnen.

Ein Observed-State-Eintrag ist die **Prior-Observation-Aufzeichnung**, aber sein Diskriminator zählt. Ein erfolgreicher Read/Write/Edit zeichnet present auf einer Version auf und erlaubt Create-then-Edit oder Edit-then-Edit ohne dazwischenliegenden Read. Ein Read/View, der Abwesenheit bestätigt, ersetzt jede alte positive Version durch absent und erlaubt nur noch ein guarded Create; ein späteres erfolgreiches Create ersetzt sie durch die neue present-Version. Ein fehlender Eintrag allein heißt unseen und erzeugt `FS_NOT_OBSERVED` für edit. Der Owner wird strukturell aus `{ agent?: { session? } }` abgeleitet; dispose verwirft allen State (HMR-Sicherheit).

`dsh-fs-observation-policy` ist jetzt ein reines Policy-/Recording-Plugin ohne Service-API — es beeinflusst die Welt nur über das Event-Gate. Genau das entfernt die Methoden-Kopplung aus `dsh-tool-fs`.

## Bare-Provider-Verhalten (ohne `dsh-fs-observation-policy`)

Das ist nicht die vorgesehene Deployment-Haltung — von einer Config, die die fs-Tools lädt, wird erwartet, dass sie auch `dsh-fs-observation-policy` lädt. Es ist der unbeschränkte Provider-Boden, der existiert, sobald das Tool nicht mehr an einen Policy-Methoden-Service gekoppelt ist. Ohne `dsh-fs-observation-policy` fällt jeder `fs/*`-Waterfall auf seinen `undefined`-Default durch, und `fs/observed` hat keinen Listener:

- **read** ist identisch (brauchte nie Policy; es emittiert nur ein jetzt ungehörtes `fs/observed`).
- **write** erzeugt oder überschreibt unbedingt: `expected` ist `undefined`, sodass `writeText` schreibt, ob die Datei existiert oder nicht, und unabhängig von ihrer aktuellen Version. Keine Read-first-Anforderung, keine Versionsprüfung.
- **edit** ersetzt unbedingt literalen Text im aktuellen Inhalt der Datei: `expected` ist `undefined`, sodass `editText` ohne Versions-Guard oder Read-first-Anforderung matcht und umschreibt (`FS_EDIT_NOT_FOUND`/`FS_AMBIGUOUS_EDIT` gelten weiterhin — die betreffen das literale Match, nicht die Freshness). Ein fehlendes Target meldet weiterhin `FS_STALE_VERSION`, passend zum „dieses Target kann gerade nicht editiert werden"-Code des guarded Edit-Pfads.

Beide Mutationen bleiben atomar (der Per-Target-Lock des Backends ist unbedingt). Was schlicht *fehlt* — nicht verloren ist — ist die Policy, die `dsh-fs-observation-policy` hinzufügen würde: Observed-State, Read-before-Edit und versions-guarded Write/Edit. Das Laden von `dsh-fs-observation-policy` legt diese Constraints auf, indem seine Listener guarded `expected`-Werte statt `undefined` returnen; am Bare-Provider ändert sich nichts.

## Supersedes

Diese Note ändert — nicht kehrt um — die [split-fs-seam Agent Note](../simplification/2026-06-26-fsspec-style-fs-seam.de.md). Der Vier-Schichten-Split, der Provider-Contract und die Freshness-*Policy* bleiben alle erhalten. Was sich ändert, ist die **Kopplung zwischen dem Tool und der Policy-Schicht**: Ein zwingender Methoden-Service wurde ein plugin-besessenes Event-Gate, und der fs-I/O plus Read-Windowing zog von `fileContext` hinauf in `dsh-tool-fs`. Die Beschreibung der split-fs-seam Agent Note, dass `dsh-tool-fs` `fileContext` injiziert und `fileContext` `read`/`write`/`edit` besitzt, wurde im selben Change angepasst.

## Verifikation

Tests pinnen beide Pfade: Ohne `dsh-fs-observation-policy` bootet das Root-Tool-Plugin gegen `dsh-fs-local`, und read, create, overwrite sowie unread edit gelingen; mit der Policy returnt unread edit `FS_NOT_OBSERVED` und unread overwrite wird über `createIfAbsent` ge-gate-t. Ein späterer Intent-Listener wird nach der Entscheidung der Policy nicht mehr erreicht. Stale Edits schlagen über Provider-CAS fehl, während die Policy kein `stat` ausführt; die Tool-Budgets bleiben ein `stat` für read und null für write oder edit auf beiden Pfaden. Der Deletion-Recovery-Pfad ist ebenfalls zusammengesetzt: stale Mutation, fehlender Reread, guarded Recreation. Die modellzugewandten Schemas bleiben Byte für Byte unverändert, während sich der recovered-Result-Transcript ändert.

## Erwogene Alternativen

- **`ctx.fileContext` als in-path Methoden-Service behalten** — die Form, die [die split-fs-seam Agent Note](../simplification/2026-06-26-fsspec-style-fs-seam.de.md) zuerst brachte; verworfen, weil das Tool ohne die Policy-Schicht nicht laufen konnte und die Policy damit für den Basisbetrieb tragend wurde statt eine opt-in-Verschärfung.
- **Policy-seitige Versionsprüfung** (`dsh-fs-observation-policy` stat-t und vergleicht in seinem Waterfall-Handler) — verworfen wegen der TOCTOU-Lücke zwischen dieser Prüfung und dem eigentlichen Write des Tools; der kritische Mutationsabschnitt des Providers ist der einzige race-freie Ort, also wählt die Policy nur die CAS-Basis und gate-t auf vorherige Observation.
- **Per-Tool `/read`-/`/write`-/`/edit`-Subpath-Plugins** — bei der Implementierung gestrichen: Kein Consumer brauchte ein Ein-Tool-Deployment, und das Subpath-Publishing erzwang maßgeschneiderte `tsdown`-/`tsconfig`-/`files`-/Workspace-Constraint-Behandlung, die kein Schwester-Tool-Paket trägt; die Per-Tool-Registrierungshelfer bleiben interne Module, die das Root-Plugin komponiert.

## Konsequenzen

- **Event-Indirektion statt eines Methodenaufrufs.** Ein Waterfall + emit ist weniger direkt als `await ctx.fileContext.edit(...)`. Der Gewinn ist das Entfernen der Tool-zu-Policy-Methodenabhängigkeit bei Beibehaltung des Default-Policy-Plugins; der Preis ist ein weiteres zu lernendes Event-Vokabular. Gemildert durch drei schmale Events und dokumentierte Default-Thunk-Semantik auf jedem.
- **Policy-Events im Storage-Seam.** `dsh-fs` erhält zwei Versions-Entscheidungsevents plus ein Recording-Event, obwohl es „nur Storage" ist. Das ist der Preis der Entkopplung (der Emitter kann nicht vom Policy-Plugin abhängen). Die Events tragen nur `dsh-fs`-Vokabular plus einen opaken `object`-Actor und keine modellzugewandten Konzepte, sodass der Seam frei von Zeilenfenster-/Observation-Policy-Typen und von der Agent/Session-Owner-Struktur bleibt.
- **Ein Policy-Besitzer, First-wins per Konvention.** Die `fs/write-intent`-/`fs/edit-intent`-Slots halten genau einen Entscheider; der zuerst (oder per `prepend`) registrierte Listener gewinnt, der Rest wird kurzgeschlossen. Dass `dsh-fs-observation-policy` den Slot besitzt, ist eine Deployment-Konvention, kein event-erzwungenes Invariant — ein früher registrierter zweiter Entscheider würde sie umgehen. Das ist akzeptabel, weil ein zweiter fs-Versions-Policy-Entscheider eine Fehlkonfiguration ist, kein Feature. Sollte je ein Bedarf an *geschichteter* fs-Versions-Policy auftreten, ist das eine neue Agent Note (ein komponierbarer werteweiterreichender Waterfall), kein stiller zweiter Listener auf diesen Events. Geschichtete Permission-/Audit-/Sandbox-Interception hat bereits ihr Zuhause auf `tools/execute`.
- **Streichung des bestätigenden Post-Read-`stat`** lässt einen nachfolgenden *guarded* Edit unter einer Read/Write-Race gelegentlich fail-closed scheitern (`FS_STALE_VERSION` → erneut lesen). Das ist eine verlorene UX-Annehmlichkeit, niemals ein Korrektheitsloch; der Provider-Lock verhindert weiterhin Writes auf falscher Version.
- **Der Bare-Provider macht kein Read-before-Write/Edit und keine Versionsprüfung.** Ein Deployment ohne `dsh-fs-observation-policy` lässt das Modell jede vorhandene Datei unbedingt überschreiben oder editieren. Das ist die bewusste Bedeutung der Tool-Unabhängigkeit von einem Policy-Service: Die Sicherheitsdisziplinen leben im `dsh-fs-observation-policy`-Plugin. Ein Deployment, das es weglässt, entscheidet sich bewusst für ein unbeschränktes Filesystem; das ist nicht die vorgesehene Haltung für eine Config, die die fs-Tools ausliefert.
