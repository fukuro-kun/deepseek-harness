# Agent Note: Web-Anzeige von Hintergrund-Tasks
[English](2026-08-08-web-background-job-display.md) | [中文](2026-08-08-web-background-job-display.zh.md) | Deutsch

Status: implemented


## Problem

`ctx.jobs` führt bereits jede langlebige Arbeit aus, die das Harness im Hintergrund startet — `bash`, `pwsh`, `pty-send` und einmalige Hintergrund-Subagents — aber sein einziger Leser war das Modell. [`dsh-tool-jobs`](../../../../packages/jobs/tool-jobs/README.de.md) stellt `job_list`, `job_output` und `job_kill` bereit, und nichts sonst beobachtete die Registry.

Ein Mensch am Web-Client konnte daher nicht sehen, dass ein Build lief, konnte eine fertige Aufgabe nicht von einer hängenden unterscheiden und konnte keine stoppen. Die einzige Spur war die `run_in_background`-Toolkarte, die irgendwo früher im Transkript eine Job-ID ausgab und sich danach nie mehr aktualisierte.

Der Session-Header war bereits der Ort für sitzungsbezogene Hintergrundaktivität: [`dsh-client-ui-subagent`](../../../../packages/client/ui-subagent/README.de.md) steuert den Subagent-Katalog zu `conversation.session.header.actions` bei. Die Platzierung war geklärt. Was fehlte, war jeglicher Kanal, der Task-Zustand an einen Browser überträgt.

## Entscheidung

Der Task-Zustand erreicht den Browser als **ein Voll-Snapshot-Steuerframe pro Session**, der an jedem Registry-Commit-Punkt gepusht wird, der das sichtbare Bild dieser Session ändert. Der Client hält ein Last-Wins-Spiegelbild; eine Header-Aktion rendert es. Es gibt kein RPC, kein Polling und keine clientseitige Buchführung über veraltete Zustände.

Dieser Schritt liefert nur die Liste. Pro-Task gestreamte Ausgabe und ein menschlich ausgelöster Abbruch sind eigene Phasen, und der Kanal ist so geformt, dass keine davon ihn zurückbauen muss.

### Protokollformat

Ein Frame im Control-Stream des Session Controllers:

```ts ignore-check
| { type: 'jobs'; sessionId: SessionId; jobs: SessionJob[] }
```

`SessionJob` ist browsersicher und liegt neben den anderen Session-Remote-Verträgen in [`packages/api/session-controller/src/types.ts`](../../../../packages/api/session-controller/src/types.ts):

```ts
import type { JobId } from '@deepseek-ai/dsh-jobs/brand'

export interface SessionJob {
  id: JobId
  kind: string
  label: string
  status: 'running' | 'stopping' | 'completed' | 'killed' | 'failed'
  detail?: string
  startedAt: number
  finishedAt?: number
}
```

`JobId` kommt aus dem cordis-freien Leaf [`@deepseek-ai/dsh-jobs/brand`](../../../../packages/jobs/jobs/src/brand.ts) — dieselbe Anordnung wie der `@deepseek-ai/dsh-llm/brand`-Import, den `api/subagents.ts` bereits nutzt, denn die `dsh-jobs`-Wurzel zieht `dsh-agent` mit und ist selbst als Typ aus einem Client-Programm unerreichbar. Wie jeder andere Nicht-Wurzel-Subpath in diesem Workspace trägt er einen expliziten `tsconfig.base.json`-`paths`-Eintrag; ohne ihn löst der Typert-Analyzer den Specifier nach `lib/types/` auf und weist die Referenz als nicht exportiert zurück.

`kind` ist auf der Leitung `string` statt `JobKind`. Die Kind-Map ist durch produzierende Plugins merge-erweiterbar, sodass ein Client-Build die geschlossene Menge nicht aufzählen kann; die Darstellung fällt bei einer unbekannten Kind über einen dokumentierten Default durch.

Drei `JobSnapshot`-Felder fehlen bewusst: `ownerSession` (die `sessionId` des Frames trägt es bereits), `reported` (ein internes Benachrichtigungs-Zustellbit ohne Benutzerbedeutung) und `outputLimitBytes` (produzenteneigene Modell-Darstellungspolitik).

Der Frame trägt einen Voll-Snapshot statt eines Deltas, damit Start, Kill, Abrechnung, Reconnect und ein zweiter Browser-Tab alle über einen autoritativen Wert konvergieren. Die Task-Menge einer Session ist einstellig; der Frame ist klein.

### Der Änderungsfeed der Task-Registry

`JobRegistry` besitzt genau eine Beobachtungsmethode:

```ts ignore-check
abstract onJobsChanged(listener: JobsChangedListener): () => void
```

Sie feuert **nach** jedem Commit, der ändert, was `list(owner)` zurückgibt: Registrierung am Ende von `start()`, der `stopping`-Übergang in `kill()`, die Abrechnung und die Entfernung durch `disposeOwner()`. Ein `undefined`-Owner bedeutet, dass sich ein unowned Task geändert hat und damit die Sicht jedes Aufrufers.

Der Listener ist owner-granular statt task-granular. Der einzige Consumer pusht Voll-Snapshots, sodass ein Datensatz pro Job bei Ankunft verworfen würde — und ein Pro-Task-Feed kann die Entfernung bei Owner-Disposal gar nicht ausdrücken, ohne einen Tombstone-Status zu erfinden, den sonst nichts braucht.

`onJobDone` ist keine Teilmenge davon. Es liefert den Enddatensatz mit dem exakten Owner-`Agent` unter First-Wins-Semantik, die `dsh-tool-jobs` an `reported` koppelt; `onJobsChanged` ist reine Beobachtung ohne Zustellbedeutung und markiert nichts als gemeldet. Exceptions im Listener werden abgefangen und nie awaited — wie bei `onJobDone` —, und jede Registrierung ist ein Effect auf der aufrufenden Fiber.

Die Service-Disposal meldet bewusst nichts. Jede `onJobsChanged`-Registrierung ist ein Effect auf der eigenen Fiber der Registry, sodass die Listener längst weg sind, wenn der Teardown den Store leert; ein Beobachter erfährt das Verschwinden der Registry über seine eigene Disposal, nicht über eine finale leere Menge.

### Der Session-Controller-Träger

[`SessionControlController.control()`](../../../../packages/api/session-controller/src/control.ts) emittiert eine vollständige Host-weite Baseline vor den späteren `jobs`-Ersetzungsframes. Jeder physische Reconnect öffnet eine neue Generation, sodass der Client sein prozesslokales Spiegelbild ersetzt, bevor er weitere Änderungen anwendet.

Vier Regeln, die der Träger einhält:

- **Niemals resume.** Ein Change-Push liest `jobs.list(owner)` mit genau dem `Agent`, den der Listener geliefert hat — das bleibt korrekt, selbst während der Scope dieses Owners abgerissen wird und eine Lookup per ID schon ins Leere liefe. Die Baseline liest dagegen `ctx.jobs.list(ctx.agents.get(session.id))`, wobei eine Session ohne Live-Agent korrekt nur unowned Tasks liefert. Kein Pfad ruft den [Session-Controller-Agent-Resolver](../../../../packages/api/session-controller/src/agent.ts) auf, denn das Auflisten darf niemals eine Session wiederbeleben, an der der Nutzer nur vorbeigescrollt ist.
- **Unowned-Änderungen auffächern.** Ein `undefined`-Owner pusht einen frischen Snapshot an jede angehängte Session, denn unowned Tasks sind für jeden Aufrufer sichtbar.
- **Optional bleiben.** Der Träger liest `ctx.get('jobs')`. Eine Komposition ohne die Registry meldet leere Task-Mengen, und der Client rendert keinen Einstiegspunkt.
- **Leere explizit darstellen.** Die Eröffnungs-Baseline enthält einen Eintrag für jede angehängte Session, einschließlich `[]`; eine spätere Änderung, die eine Liste leert, pusht ebenfalls `[]`. Der Client kann eine leere Menge dann als fehlenden Schlüssel normalisieren, ohne veraltete Zeilen zu behalten.

### Das Client-Spiegelbild

`SessionListState` trägt `jobsBySession: Readonly<Record<SessionId, readonly JobView[]>>`, im Besitz von `SessionManager` und Last-Wins aus dem Frame gefaltet; eine geleerte Menge wird als fehlender Schlüssel gespeichert, sodass Abwesenheit und `[]` dieselbe Darstellung sind.

Es liegt aus drei Gründen auf dem Listen-Spiegel statt auf `Session`: Die Header-Aktion liest den Listenzustand bereits über `useSessions`, nichts braucht die Vor-Instanziierungs-Pufferung, die `session/queue` benötigt (kein Composer-Verhalten hängt von Tasks ab), und ein späterer Sidebar-Indikator bekommt die Daten ohne einen zweiten Kanal.

Zwei Ersetzungspunkte halten es ehrlich. Jede Control-Stream-Generation leert das komplette Jobs-Spiegelbild, bevor sie die nicht-leeren Mengen der neuen Baseline installiert. Ein `api-session/removed`-Event verwirft den Eintrag dieser Session ebenfalls, unabhängig von der Reihenfolge der Disposal-Benachrichtigung der Job-Registry.

### Die Header-Aktion

[`@deepseek-ai/dsh-client-ui-jobs`](../../../../packages/client/ui-jobs/README.de.md) registriert einen Eintrag in `conversation.session.header.actions`, geordnet nach dem Subagent-Katalog. Der Darstellungsvertrag gehört dem eigenen README; die hier festzuhaltenden Entscheidungen sind, dass das Control gar nicht rendert, bis die Session einen Task hat, dass das Live-Badge bei Null weggelassen wird, damit eine rein historische Session einen ruhigen Einstiegspunkt behält, und dass abgerechnete Zeilen sichtbar bleiben, weil das `detail` eines fehlgeschlagenen Tasks der einzige Ort ist, an dem sein Scheitern lesbar ist.

Ein laufender einmaliger Hintergrund-Subagent erscheint daher sowohl dort als auch im Subagent-Katalog. Die beiden beantworten unterschiedliche Fragen — der Katalog navigiert in das Transkript des Kindes, diese Liste ist der einzige Handle, an den ein Abbruch je andocken kann — und `kind: 'subagent'` hier zu unterdrücken würde der Abbruchphase genau für diese Tasks den Einstiegspunkt nehmen.

### Was dies bewusst nicht tut

**Kein Web-Pfad ruft `ctx.jobs.read()` auf.** Es konsumiert den einzigen Ausgabe-Cursor, sodass ein Browser-Read still Bytes nähme, die das `job_output` des Modells nie sehen wird. Das ist eine Invariante, die einen Test verdient statt einer Konvention, weil der Fehler an der Aufrufstelle unsichtbar ist.

**Kein Abbruch.** Diese Phase schuldet eine Entscheidung, die der Seam derzeit nicht beantwortet: `kill()` markiert die Endzustellung als gemeldet, sodass ein menschlicher Interrupt, der gegen den `kill()`-Vertrag geschrieben wäre, das Modell glauben ließe, sein Task laufe noch.

**Kein Ausgabe-Wasserzeichen auf dem Frame.** Der Delta-Kanal der Ausgabephase ist der Ort, an dem ein Ankerfeld seinen Platz verdient; eines, das jetzt hinzukäme, hätte keinen Leser.

## Erwogene Alternativen

**Signalframe plus RPC-Pull, die Form des Subagent-Katalogs.** Ein payloadfreies `jobs-changed`-Signal pushen, debouncen, dann den autoritativen Zustand über ein unäres RPC neu lesen. Genau das tut der Subagent-Katalog, und die Kosten sind in [`SessionManager`](../../../../packages/api/session-controller/src/client/sessions/manager.ts) sichtbar: `catalogInflight` für Single-Flight, `catalogStale` für einen nachgezogenen Re-Pull, wenn ein Membership-Frame mitten in der Anfrage landet, `updateCatalogActivity`, das geladene Zeilen in-place patcht *und* in die laufende Anfrage hineinschreibt, damit eine Antwort, die älter als der Frame ist, überschrieben wird, `parentAvailableOverride`, das ein veraltetes `false` wiederholt, und ein Reconnect-Pfad, der jeden offenen Katalog neu lädt. Dieser Apparat existiert, weil die Autorität des Katalogs gespalten ist — dauerhafte Abstammung aus einer Projektion, Lebendigkeit zum Antwortzeitpunkt abgetastet —, und Tasks haben keine dauerhafte Hälfte, die das Erben rechtfertigte. Er versagt außerdem genau in dem Moment, um den es der Ausgabephase geht: Ein Task rechnet ab, sein Ausgabestream schließt sofort, aber der Status kommt erst nach Debounce plus Roundtrip an, sodass die UI in diesem Fenster einen laufenden Task mit totem Stream zeigt.

**Popoverscoped-Polling ohne Seam-Änderung.** Am billigsten zu bauen und die einzige Option, die `JobRegistry` unangetastet lässt. Sie kann keinen residenten Zähler auf dem Trigger ohne residente Abfrage stützen, und beide späteren Phasen brauchen ohnehin einen echten Änderungsfeed — sie spart also eine Woche und gibt sie gleich wieder aus.

**Eine Session-Projektionseinheit über dauerhafte Task-Events.** Projektionseinheiten falten über committed Session-Events, also müsste hier zuerst der Task-Lebenszyklus dauerhaft werden — `job/started` … `job/settled` als eigenständiges Open/Close-Klammerpaar, wobei der letzte [`session/end-seed`](../../../../packages/core/session/src/types.ts) jede ungepaarte öffnende Klammer als tote Historie markiert, exakt wie es die Compaction-Klammer bereits tut. Auf dem Client wäre es wirklich billiger: `dsh-tool-todo` zeigt das ganze Muster in einer fünfzehnzeiligen Einheit, und die vorhandenen `session/projection`-Frames, der History-Tail-Block und der persistierte Checkpoint-Cache hätten die Daten ohne neue Protokollfläche, ohne Träger-Subscription und ohne Manager-State getragen. Verworfen wurde es, weil es dies mit einer Änderung am dauerhaften Format im Dienst einer Browser-Liste erkauft und weil es nicht in die Phase reicht, die es am nötigsten bräuchte: [`spill/`](../../../../packages/spill/README.de.md) existiert gerade, damit überdimensionale Tool-Ausgaben aus dem Log herausbleiben, sodass gestreamte Job-Ausgabe ohnehin nicht auf dauerhaften Events reiten kann. Nichts hier versperrt, es erneut aufzugreifen, falls dauerhafte Task-Historie aus eigener Kraft wertvoll wird.

**`PublicJobSnapshot` aus `dsh-tool-jobs` wiederverwenden.** Fast die richtigen Felder, aber es gehört zur modellseitigen Steuerfläche. Ein Protokolltyp, den ein Browser-Programm aus einem Tool-Package importiert, koppelt die Client-Darstellung an promptgerichtete Entscheidungen und zieht ein host-only Package in einen Client-Build.

**Tasks als ein „Aktivitäts"-Panel in den Subagent-Katalog falten.** Ein Einstiegspunkt statt zwei. Verworfen, weil `SubagentCatalogAction` bereits 605 Zeilen hat und dessen Gegenstand ein dauerhafter Session-Abstammungsbaum samt beendeter Kinder ist; prozessgebundene Tasks sind ein zweites Datenmodell mit anderer Identität, Lebensdauer und anderen Affordanzen, und die lazy-expandierten Zweig-, Dauer- und Token-Verträge des Katalogs müssten alle umgeschrieben werden, um sie aufzunehmen.

**Eine host-globale Task-Liste über alle Sessions.** Die wörtliche Lesart von „zeige alle laufenden Tasks". Verworfen, weil der Authorization-Zaun der Registry pro Owner-Session steht — ein globaler Read bräuchte eine neue Zugriffsregel — und eine globale Liste im Header einer Session nichts zu suchen hat: Sie bräuchte ein eigenes Zuhause in der Sidebar. Nichts in diesem Design blockiert, sie später hinzuzufügen; die pro-Session-Frames sind dieselben Daten.

## Tests

Das [Web-e2e-Szenario](../../../../apps/web/tests/background-job-list.e2e.ts) ist der End-to-End-Beweis und läuft schlüssellos: Ein echter `run_in_background`-Bash-Aufruf registriert sich bei `ctx.jobs`, Header-Zähler und -Zeile erscheinen ohne Nutzerinteraktion, und das Töten des Tasks über die Registry kippt die offene Liste auf ihr Producer-Detail. Es prüft den ganzen Zustellpfad statt einer einzelnen Schicht.

Darunter pinnen [`jobs-local`](../../../../packages/jobs/jobs-local/tests/jobs.spec.ts) den Änderungsfeed an allen vier Commit-Punkten, seine Isolation eines werfenden Beobachters und sein Entfernen sowohl bei expliziter Disposal als auch bei Fiber-Teardown; [`control-jobs`](../../../../packages/api/session-controller/tests/control-jobs.host.spec.ts) pinnt die vollständige Baseline, drei Change-Pushes, verworfene interne Felder, Unowned-Fan-Out, die No-Resume-Garantie, die Komposition ohne Registry und das Verbot, Modellausgabe zu konsumieren; und die Client-Suiten pinnen Baseline-Ersetzung, die Last-Wins-Faltung, die Missing-Key-Darstellung, Removal-Cleanup sowie Ordnung, Dauer und Dismissal-Verhalten der Komponente.

## Konsequenzen

**Ein verpasster Commit-Punkt verliert Zeilen.** Falls die `disposeOwner()`-Entfernung je aufhört, den Feed zu feuern, behält der Client Tasks, die nicht mehr existieren, bis die Session verschwindet. Die Voll-Snapshot-Form macht das behebbar statt korrumpierend — die nächste legitime Änderung repariert die Liste —, aber der Disposal-Pfad ist der am leichtesten vergessene, also trägt er seinen eigenen Test.

**Das Unowned-Task-Fan-Out lässt sich leicht zu knapp implementieren.** Nur an die Session des geänderten Owners zu pushen ist für owned Tasks korrekt und für unowned still falsch, denn diese sind überall sichtbar. Der Bug würde nur in Kompositionen sichtbar, die unowned Tasks erzeugen — deshalb deckt die Träger-Suite ihn direkt ab.

**Die UI-Menge ist nicht die Registry-Menge.** Der Header zeigt, was eine Session sehen kann, sodass ein Task einer anderen Session dort nie erscheint, obwohl die Registry ihn hält — und weil die Registry prozesslokal ist, leert ein Neustart jede Liste, während das Transkript weiterhin die `run_in_background`-Karten zeigt, die sie starteten. Unowned Tasks sind der Gegenfall: Sie erreichen die Liste jeder Session, genau wie `list(caller)` sie jedem Aufrufer meldet.

**Abgerechnete Zeilen sammeln sich.** Die Registry hält abgerechnete Tasks bis zur Owner-Disposal, sodass eine lange Session mit vielen Hintergrundbefehlen eine lange Liste aufbaut. Den abgerechneten Schwanz zu deckeln wäre eine Darstellungsänderung, keine Protokolländerung, falls es zu einer echten Beschwerde wird.

**`stopping` ist selten sichtbar.** Nur das `job_kill` des Modells erzeugt es, sodass der Zustand gerendert wird, aber bis zur menschlichen Abbruchphase kaum zu sehen ist. Er steht jetzt schon in der Union, weil das Weglassen eines Status diese Phase zu einer Protokolländerung gemacht hätte.

**Zwei Einstiegspunkte für einen laufenden Subagent.** Bewusst akzeptiert und auf einmalige Hintergrund-Delegationen begrenzt. Liest es sich in der Praxis als Rauschen, ist der Fix darstellerisch — die Katalogzeile kann den Task zitieren, statt dass die Task-Liste die Kind verbirgt.

**Ein neuer Nicht-Wurzel-Subpath braucht seinen `paths`-Eintrag.** `@deepseek-ai/dsh-jobs/brand` musste in `tsconfig.base.json` registriert werden, bevor der Typert-Analyzer die Referenz akzeptierte. Der Fehlermodus ist eine verwirrende „not exported by"-Meldung eines Generators fern der Änderung, sodass der Eintrag Teil des Subpath-Hinzufügens ist, keine Optimierung.
