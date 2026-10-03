# Agent Note: Ein Remote-Fehlervokabular für `ctx.remote`
[English](2026-08-28-ctx-remote-failure-vocabulary.md) | [中文](2026-08-28-ctx-remote-failure-vocabulary.zh.md) | Deutsch

Status: implemented


## Problem

Jedes Remote-Owner-Paket pflegte seine eigene Fehlerfläche: ein `XxxErrorDetailsMap`-interface, eine davon abgeleitete `XxxError`-Union und eine exit-mapping-Funktion, die Domänen-Fehlerklassen (`UnknownPresetError`, `PresetMountError`, `SessionTitleInvalidError` und ihre Geschwister) in einen wire-Fehlerwert übersetzte. `@deepseek-ai/dsh-typert-protocol` trug zwei Fehlerklassen zugleich — `TypertRemoteFailure` für einen Fehler, den ein Owner meldete, und `TypertLookupFailure` für einen, den ein lookup resolver erzeugte —, während `@deepseek-ai/dsh-client-connection` eine zweite typisierte Sicht hielt, `RpcErrorDetailsMap`, die Domänen-codes wie `agent-preset-not-found` und `session-not-found` in den carrier hartkodierte.

Ein code existierte daher an drei Stellen: in der Tabelle des Owners, in der typisierten Sicht des carriers und in jeder Union oder jedem cast, den ein consumer zum Narrowing schrieb (`result.error as SessionError`). Das Hinzufügen eines Domänen-codes bedeutete das Editieren aller drei, und das Relayen eines fremden Domänen-codes bedeutete, jenen code in die eigene Tabelle zu kopieren — `SessionErrorDetailsMap` hatte auf diesem Weg fünf fremde codes absorbiert, über `agent-preset-*`, `subagent-*` und `workspace-not-found` hinweg.

Fehlerinformation wurde außerdem an zwei Stellen plattgedrückt. Alle 17 eigenen Assembly-Fehler des Gateway (eine unmountete Methode, ein mehrdeutiger Endpunkt, ein lookup-provider-Mismatch, ein Ergebnis, das seinen codec nicht besteht) erreichten den wire als `code: 'internal'`, sodass ein client einen assembly-Fehler nicht von einer Business-Ablehnung trennen konnte; Owner foldeten fremde exceptions defensiv in ihre eigenen Domänen-codes vor, sodass ein echter Host-Bug beim caller als plausibel aussehender Domänen-Fehler ankam.

Feste Host-Fakten umgingen `ctx.remote` ebenfalls: das Host home kam aus `(ctx.get('connection') as ConnectionHandle).generation.getSnapshot()?.host.home`, sodass jede page, die einen festen Fakt brauchte, den carrier injizierte und seinen generation store verstehen musste.

## Entscheidung

`@deepseek-ai/dsh-typert-protocol` exportiert eine Fehlerklasse, `RemoteError<Code>`: ein echter `Error` mit readonly `code` und `details`, dem strukturellen Marker `isDSHRemoteError` und Standard-`ErrorOptions` (`cause` gilt nur in-process). Die Entsprechung zwischen codes und details lebt in einer merge-extensiblen `RemoteErrorDetailsMap`; `RemoteFailure` ist die nach code verteilte Union von Instanzen, und `RemoteResult<T>` behält seine Form.

```text
export class RemoteError<Code extends RemoteErrorCode = RemoteErrorCode> extends Error {
  readonly isDSHRemoteError: true = true
  constructor(readonly code: Code, message: string,
    readonly details: RemoteErrorDetailsMap[Code], options?: ErrorOptions)
}
export type RemoteFailure = { [C in RemoteErrorCode]: RemoteError<C> }[RemoteErrorCode]
export type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: RemoteFailure }
```

Eine Fehlerstelle wirft direkt: `throw new RemoteError(code, message, details)`. Eine Domäne baut keine Fehlerklassen-Familie und schreibt keine exit-mapping-Funktion; nur der Fall "jede provider-exception klassifizieren" behält ein `catch`, und darin `throw new RemoteError(code, messageOf(error), details, { cause: error })`. Eine bestehende exception-Klasse, die ein in-process-Fluss weiterhin konsumiert (`ApiSessionCwdConflict` und ihre Geschwister), bleibt eine nicht exportierte private Klasse und konvertiert am exit in einer Zeile zu einem `RemoteError`.

Ein code ist ein `<domain>/<reason>`-String: `session/not-found`, `gateway/cancelled`, `workspace/invalid-path`, `agent-preset/locked`. Das Präfix folgt dem wire-namespace-Stil, sodass der code selbst sagt, wem er gehört, und das Relayen eines fremden Domänen-codes keinen unhandlichen unpräfixierten Namen mehr braucht.

## Code-Ownership

Ein code hat exakt eine Deklarationsstelle, und die Stelle folgt daraus, wer ihn erzeugt und wer die Deklaration sehen kann — declaration merging gilt nur dort, wo die augmentierende Datei in das aktuelle Programm eintritt, daher muss das Zuhause ein Paket sein, das jeder producer bereits sieht:

- **Carrier-codes**: `gateway/bad-request`, `gateway/cancelled` und `gateway/internal` werden vom Protokoll deklariert und sind überall erreichbar.
- **Gateway-assembly-codes**: die 17 `gateway/*`-codes werden in `packages/api/gateway/src/remote-error-codes.ts` mit den einheitlichen `TypertGatewayFaultDetails { endpoint, field? }`-details deklariert; jenes Modul ist face-neutral, und jedes face importiert es, sodass beide Programme dieselben Einträge sehen.
- **Von mehreren Paketen erzeugt**: wenn zwei oder mehr Pakete denselben code werfen, landet die Deklaration in der untersten Schicht, von der beide bereits abhängen. `session/not-found` landet in `@deepseek-ai/dsh-session` (session-controller und workspace-controller hängen beide davon ab), und `workspace/not-found` landet in `@deepseek-ai/dsh-workspace` (zwischen den beiden API-Paketen existiert keine dependency-Kante, daher ist das capability-Paket ihre einzige geteilte Schicht).
- **Einzelner producer**: ein code, den nur ein Paket wirft, landet in diesem producer. `subagent/not-found` und `agent-preset/conflict` leben daher im session-controller — er ist ihr einziger Werfer im repository, und weder die subagent- noch die agent-presets-Tabelle deklariert sie.

Was zwei Domänen teilen, ist Validierungslogik, kein code. `session/invalid-time-zone` und `subagent/invalid-time-zone` sind zwei codes, die jeweils von ihrer eigenen Domäne deklariert und geworfen werden, und beide Endpunkte kanonisieren über `canonicalClientTimeZone()` aus `@deepseek-ai/dsh-util-time`; kein client verzweigt auf diesen code, sodass seine Trennung nichts kostet, während sein Merge das Erreichbarkeitsproblem wiedererzeugen würde.

## Diskriminierung nach code

Diskriminierung liest immer `code` und nutzt nie `instanceof`. Client und Host sind separat gebündelte Programme, und ein worker-Transport bündelt die page-Hälfte noch einmal, sodass mehrere Kopien derselben Klasse existieren und Prototyp-Identität über Kopien hinweg nicht gilt. Die mechanismus-Schicht liest den strukturellen Marker plus einen String-`code` über das `remoteErrorOf(value)` des Protokolls, und das Gateway-client-face exportiert zusätzlich `isRemoteFailure(error)` für die catch-Stelle eines consumers; beide lesen jene Felder, nie die Klasse — der Test verlangt nicht einmal `instanceof Error`, weil ein in einem anderen realm geworfener Error auch daran scheitert.

Business-Code braucht meist keine der beiden Funktionen: der `ok: false`-Zweig von `RemoteResult` ist bereits eine typisierte `RemoteFailure`, sodass `if (result.error.code === 'session/not-found')` die `details` ohne cast auf die Form jenes codes verengt. Eine Stelle, die den Fehler propagieren muss, schreibt `throw result.error` — es ist ein echter `Error`, mit funktionierendem stack und `message`.

Die client-Ebene konstruiert kein `RemoteError`; die eine Ausnahme ist das eigene client-face des Gateway, das eine Instanz aus wire-Daten in `invoke()` wieder aufbaut und carrier-Würfe an stream-Grenzen in dasselbe Vokabular foldet. Ein test double, das einen Fehlerwert braucht, nimmt `RemoteError` aus `@deepseek-ai/dsh-client-test-runtime`, statt ein client-Paket das Protokoll als Wert importieren zu lassen. Assertions matchen den code (plus details-Felder, wo sie zählen) mit `toMatchObject`: `RemoteError` ist ein `Error`, seine own-key-Menge unterscheidet sich vom früheren Literal, und `toEqual` scheitert daran.

## Feste Host-Fakten

`ctx.remote.$host` exponiert zwei feste Fakten: `home: string | undefined` und `isLoopback: boolean`. Es ist ein getter auf dem Client-Remote-service, der den bei der service-Konstruktion erfassten connection handle liest — `home` kommt aus dem ready frame im generation snapshot (`undefined` vor ready), `isLoopback` aus dem carrier. Es gibt keinen store, kein subscription und keinen generation-Zähler.

Refresh nach einem reconnect reitet auf dem bestehenden Signal: der Client Remote emittiert `connection/reset`, wenn er verbindet, und ein consumer, der neu lesen muss, lauscht darauf oder auf das remote event seiner eigenen Domäne, statt `$host` in ein subscribierbares Objekt zu verwandeln. Consumers injizieren daher `connection` nicht mehr: die consumer-allowlist von `@deepseek-ai/dsh-client-connection` schrumpft auf hmr, frontend-static, bundle/web-app, session-log-export, webworker-runtime sowie die gateway- und api-remotes-Assemblies.

## Was der wire trägt

Der Envelope ist unverändert: der wire trägt weiterhin `{ code, message, details }`-Daten, und `RemoteError` ist der in-process-carrier jeder Seite dafür. Auf dem Host kollabiert `rpcFailure()` auf zwei Zweige — ein strukturell identifizierter `RemoteError` wird unverändert kodiert, alles andere foldet in `gateway/internal` — und carrier-signal-Abbruch nutzt dasselbe Vokabular (die `RemoteInvocationCancelled`-Klasse ist gelöscht, und ihre vier Wurfstellen erheben `RemoteError('gateway/cancelled', …)`).

Drei wire-sichtbare Verhaltensweisen folgen. Die 17 assembly-codes des Gateway reisen als sie selbst, sodass ein client "method not mounted" getrennt von einer Business-Ablehnung behandeln kann. Owner folden keine fremden exceptions vor: ein unklassifizierter Wurf erreicht den Gateway, der ihn einmal in `gateway/internal` foldet und die Diagnostikkette in `message` bewahrt. Ein von seinem caller abgebrochener client-unary-Aufruf antwortet `gateway/cancelled` und matcht damit den code, den der Host erzeugt hätte, selbst wenn der lokale Wurf das race gegen den wire-round-trip gewinnt.

Der carrier behält nur die offene wire-Form. `ConnectionRpcFailure` und `ConnectionRpcResult` in `@deepseek-ai/dsh-client-connection` tragen kein Domänen-code-Wissen, und ihr `transportError()` erzeugt `gateway/internal`; das einzige Zuhause für die typisierte Sicht ist nun die `RemoteFailure` des Protokolls.

## Erwogene Alternativen

**Eine `RemoteFault`-Fehlerklassen-Familie pro Domäne.** Jeder Domäne (oder jedem code) eine eigene `Error`-Subklasse zu geben liest sich objektorientierter, spaltet aber einen Fakt — den code — auf Klassenidentität und ein Feld auf, und realm-übergreifende Diskriminierung muss ohnehin auf das Feld zurückfallen. Klassenidentität wird dann reiner Overhead: jede Domäne pflegt eine Subklasse, exportiert sie und erklärt sie in Prosa, während consumers weiterhin auf `code` verzweigen. Eine Klasse plus eine code-Tabelle tauscht dieses Gewicht gegen eine einzige Deklarationszeile.

**`attempt`- / `unwrap`- / `remoteFailureOf`-wrapper an den Aufrufstellen.** Ein wrapper spart ein `if` pro Aufrufstelle, verwandelt aber `RemoteResult` von der kanonischen Form in "erst durch eine Bibliotheksfunktion reichen", und beide Stile koexistieren dann auf Dauer; `unwrap` verwandelt zusätzlich "Fehler ist ein normales Ergebnis" zurück in einen exception-Fluss, gegen den contract des Remote face, nie zu rejecten. Das überlebende `remoteErrorOf` dient nur der mechanismus-Schicht und test-assertions — Business-Code hält entweder ein typisiertes `result.error` oder einen Fehler, den er selbst warf.

**Ein `host/updated`-event mit einem subscribed `$host`-store.** Ein subscription würde automatisch refreshen, wenn das Host home sich ändert, doch `home` und `isLoopback` sind für die Lebensdauer einer Verbindung fest, sodass ein store, eine generation und ein subscription-Lifecycle jede page belasten würden, die nur einen read will. Reconnection hat bereits ein Signal (`connection/reset`), und Business-Invalidierung reitet auf dem remote event jeder Domäne, daher bleiben feste Fakten plain reads.

**Lokale, nicht-wire-Fehler in die code-Tabelle aufnehmen.** ui-goals `no-current-goal` überschreitet nie eine Prozessgrenze; es aufzunehmen würde Einträge, die nur ein client-Paket interessieren, in ein geteiltes Vokabular mischen und wire-Semantik suggerieren. Lokale Fehler behalten ihre eigenen lokalen Typen, und die code-Tabelle beschreibt allein das Remote-Vokabular.

## Konsequenzen

Das Hinzufügen eines Domänen-codes ist ein declaration merge plus ein throw: keine mapping-Funktion, Fehlerklasse und carrier-typisierte Sicht, die im Gleichschritt gehalten werden müssen. Der Preis ist, dass das Zuhause nun ein Urteil verlangt — es muss von jedem producer erreichbar sein —, und dieses Urteil zeigt sich erst, sobald ein zweiter producer erscheint; `workspace/not-found` zog genau so vom workspace-controller in das capability-Paket, was `@deepseek-ai/dsh-workspace` zugleich eine type-only-Protokoll-dependency gab.

Das Präfixieren der code-Strings ändert die wire-Strings wholesale, sodass in connection fixtures eingebettete codes, assertions auf Host- und Client-Seite und spec-lokale Deklarationen alle in einem Durchgang ziehen. Die pre-release-Haltung akzeptiert diesen einen Schnitt; dieselbe Umbenennung nach einem Release bräuchte ein Kompatibilitätsfenster.

Der Typ von `details` folgt aus dem code, sodass ein code-und-details-Mismatch zur Compile-Zeit abgelehnt wird. Die andere Seite davon ist, dass jede Wurfstelle die erforderlichen detail-Felder des codes liefern muss: das Protokoll macht `issues` bei `gateway/bad-request` genau deshalb optional, damit eine Business-Validierungsstelle ohne codec-issues weiterhin `{}` schreibt.

`RemoteError` ist ein `Error`, behält daher `message` und `cause` durch jeden logger und durch `errorChain()`; doch `cause` gilt nur in-process, und der wire trägt exakt `code`, `message` und `details`. Realm-übergreifende Diskriminierung liest immer den strukturellen Marker, und jeder neue Transport (ein worker, ein bundle split) muss jenen Marker oder einen äquivalenten Marker-frame hinübertragen, sonst degradieren Fehlerwerte zu plain `Error`s.

Consumer-Signaturen für Remote-Methoden sind einheitlich `Promise<RemoteResult<T>>`, passend zur generierten Projektion, die in [der Methodenaufruf-Oberfläche](2026-08-02-typert-remote-method-calls.de.md) beschrieben ist; das ledger für die unary-Endpunkte ist [die unary-Endpunkt-Migration](../../archived/architecture/2026-08-10-unary-apiproxy-remote-migration.md).
