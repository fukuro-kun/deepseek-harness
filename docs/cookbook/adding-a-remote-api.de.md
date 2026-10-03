# Cookbook: eine Remote API hinzufügen
[English](adding-a-remote-api.md) | [中文](adding-a-remote-api.zh.md) | Deutsch


Das Hinzufügen oder Ändern eines `ctx.remote`-Endpoints umfasst die fünf Schritte auf dieser Seite: Methode deklarieren, Fehler deklarieren, am Package registrieren, auf der Client-Seite konsumieren und testen. Decorator-Semantik, Lookup-Auflösung, die Generierungs-Pipeline und die `/api`-Route sind Mechanismus und gehören zur [API-Gateway-Referenz](../api-gateway.de.md); diese Seite gibt die Aktion für jeden Schritt und die Konventionen, die sie erfüllen muss. Warum die Programmierschnittstelle so aussieht, steht in der [Typert-Remote-Method-Calls-Agent-Note](../../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.de.md), und warum ein Fehler ein einzelner `RemoteError` plus eine Code-Tabelle ist, steht in der [Failure-Vocabulary-Agent-Note](../../.agents/notes/implemented/architecture/2026-08-28-ctx-remote-failure-vocabulary.de.md).

## 1. Die API deklarieren

Der Owner ist ein Host-seitiger Cordis-Service: erweitere `TypertRemoteService`, sodass der Service-Schlüssel und der Wire-Namespace zusammen gebunden werden, und markiere die exponierten Methoden mit `@Remote`. Markiere die Geschäftsmethode selbst, wenn ihre Signatur bereits den Wire-Konventionen genügt; schreibe einen `remoteExport*`-Adapter nur, wenn sich die Form ändern muss (`signal` hinzufügen, Parameter umordnen, einen anderen Namen exportieren), und lass diesen Adapter die unbenannte Geschäftsmethode aufrufen. Lookup-Objekte (`Agent`, `Session`) dürfen nur Top-Level-Parameterpositionen einnehmen, und eine Methode, die kooperative Cancellation unterstützt, nimmt `signal: AbortSignal` als letzten Parameter.

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

/** One stored note as a Client reads it. */
export interface NoteRow {
  readonly noteId: string
  readonly title: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    notesController: NotesController
  }
}

export class NotesController extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'notesController', { namespace: 'notes' })
  }

  /**
   * @param agent - lookup parameter the Gateway resolves from its wire identity.
   * @param signal - carrier cancellation, always the final parameter.
   * @returns the notes this Agent's session owns.
   */
  @Remote('list')
  async remoteExportList(agent: Agent, signal: AbortSignal): Promise<NoteRow[]> {
    return await this.list(agent, signal)
  }

  /** The in-process API the adapter above delegates to, unchanged by it. */
  async list(agent: Agent, signal: AbortSignal): Promise<NoteRow[]> {
    signal.throwIfAborted()
    return await Promise.resolve([{ noteId: `${agent.id}-1`, title: 'draft' }])
  }
}
```

## 2. Die Fehler deklarieren

Ein Remote-Fehler ist eine Klasse, `RemoteError`: merge die Domain-Codes per Declaration Merging in `RemoteErrorDetailsMap` und `throw new RemoteError(code, message, details)` an der Fehlerstelle. Baue keine Familie von Domain-Fehlerklassen und schreibe keine Exit-Mapping-Funktion; eine Ausnahme, die nicht zu diesem Endpoint gehört, wird nicht vorab klassifiziert, weil das Gateway sie zu `gateway/internal` faltet. Schreibe ein `catch` nur, um eine beliebige Provider-Ausnahme als einen Domain-Code zu klassifizieren, und hänge die ursprüngliche Ausnahme als `cause` an.

Ein Code liest sich als `<Domain>/<Grund>`, und seine Deklaration hat vier Platzierungsregeln:

- Ein Produzent: deklariere ihn im produzierenden Package, neben dem Throw.
- Mehrere Packages produzieren ihn: deklariere ihn im niedrigsten Domain-Package, von dem beide abhängen (`session/not-found` in `core/session`, `workspace/not-found` in `dsh-workspace`).
- Die Carrier-Codes `gateway/bad-request`, `gateway/cancelled` und `gateway/internal` sind in Protocol deklariert, und die Gateway-Infrastruktur-Codes in Gateway — verwende sie, kopiere sie nie.
- Ein lokaler Fehler, der nie den Wire kreuzt, bleibt aus der Code-Tabelle; drücke ihn mit dem Typ des Aufrufers aus.

```ts
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No stored note carries that id. */
    'note/not-found': { readonly noteId: string }
    /** The store refused an otherwise valid write. */
    'note/rejected': { readonly noteId: string }
  }
}

declare const stored: ReadonlyMap<string, string>
declare function persist(noteId: string, title: string): Promise<void>

export async function rename(noteId: string, title: string): Promise<void> {
  if (!stored.has(noteId)) {
    throw new RemoteError('note/not-found', `no note "${noteId}"`, { noteId })
  }
  try {
    await persist(noteId, title)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    throw new RemoteError('note/rejected', message, { noteId }, { cause: error })
  }
}
```

## 3. Am Package registrieren

`@Remote` muss in einem Loader-Entry-Plugin-Package leben; wenn der Owner ein abstrakter seam ist, kommt der Controller in das passende Package unter `packages/api/`. Das Manifest erhält die beiden generierten Entries und die Protocol-Peer-Dependency, während auf der Client-Seite die `@deepseek-ai/dsh-api-remotes`-Assembly den Beitrag mountet und das Typ-Vokabular re-exportiert, das Consumer benötigen. Welches generierte Artefakt jeder Entry referenziert und wie die Generierungs-Pipeline geordnet ist, steht in der [API-Gateway-Referenz](../api-gateway.de.md).

```json
{
  "exports": {
    "./typert": { "types": "./lib/typert.host.d.ts", "default": "./lib/typert.host.js" },
    "./remote": { "types": "./lib/typert.remote-client.d.ts", "default": "./lib/typert.remote-client.js" }
  },
  "peerDependencies": { "@deepseek-ai/dsh-typert-protocol": "workspace:^" },
  "devDependencies": { "@deepseek-ai/dsh-typert-protocol": "workspace:^" }
}
```

Nach einer Änderung an Signatur, Code-Tabelle, Namespace oder Export-Name `pnpm run build:lib` erneut ausführen, denn das übergibt dem Client seine neuen Deklarationen und Codecs; das Ändern nur eines Implementierungs-Bodies benötigt keine Regenerierung.

## 4. Auf der Client-Seite konsumieren

Das aufrufende Plugin deklariert sowohl `remote` als auch `remote.<namespace>` in seinem `inject`, und die Aufrufstelle schreibt `ctx.remote.<namespace>.<method>(...)` direkt: kein `Pick<ClientRemote, …>`-Narrowing, keine handgeschriebene Methodensignatur, kein Wire-Relay-Objekt. Das Ergebnis ist ein `RemoteResult<T>`, also verzweige `if (!result.ok)` vor Ort und diskriminiere nach `code` statt nach `instanceof` — ein Code-Zweig narrowed `details` selbst. Eine Exception-Flow-Stelle schreibt `throw result.error` (es ist ein echtes Error); wer es fängt, verwendet `isRemoteFailure`, um einen Remote-Fehler von einem lokalen Defekt zu unterscheiden, und wirft den Defekt weiter. Schreibe kein defensives catch: ein Remote-Aufruf rejected nicht, und ein Assembly-Fehler soll crashen.

Feste Host-Fakten kommen von `ctx.remote.$host`: `home` und `isLoopback` sind einfache Reads ohne Subscription und ohne Generation-Counter, und `home` ist `undefined` bis zum ersten Ready-Frame. Aktualisiere nach einem Reconnect über `ctx.on('connection/reset')` oder ein Domain-eigenes Remote-Event. Wenn der Aufrufer einen Unary-Call abbricht, ist das Ergebnis `gateway/cancelled` auf dem Error-Zweig statt eines Throw.

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import { isRemoteFailure } from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'

export const inject = ['remote', 'remote.notes']

declare const ctx: Context

/** Store-side read: the error branch is handled where the code is meaningful. */
export async function noteTitles(): Promise<readonly string[]> {
  const result = await ctx.remote.notes.list()
  if (!result.ok) {
    if (result.error.code === 'note/not-found') return []
    throw result.error
  }
  return result.value.map(row => row.title)
}

/** Action-side: a Remote failure becomes copy; a local fault keeps crashing. */
export async function renderTitles(): Promise<string> {
  try {
    return (await noteTitles()).join(', ')
  } catch (error: unknown) {
    if (!isRemoteFailure(error)) throw error
    return `unavailable (${error.code})`
  }
}

/** Fixed Host facts as plain reads. */
export function hostLabel(): string {
  const { home, isLoopback } = ctx.remote.$host
  return home ?? (isLoopback ? 'local host' : 'remote host')
}
```

## 5. Testen

Auf der Owner-Seite assertiere den Code, der geworfen wurde: hole den Fehler nach dem Catchen mit `remoteErrorOf` zurück und vergleiche `code` und die `details`-Felder, die dich interessieren, mit `toMatchObject` — niemals das Error-Objekt mit `toEqual` deep-vergleichen und niemals `instanceof` assertieren.

```ts
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { expect, it } from 'vitest'

declare function rename(noteId: string, title: string): Promise<void>

it('refuses an unknown note before writing', async () => {
  const failure = await rename('n-404', 'fresh title').catch((error: unknown) => error)

  expect(remoteErrorOf(failure)).toMatchObject({
    code: 'note/not-found',
    details: { noteId: 'n-404' },
  })
})
```

Ein Client-seitiges Double gibt echte Instanzen zurück: nimm die `RemoteError`- und `TestRemote`-Value-Imports von `@deepseek-ai/dsh-client-test-runtime`, weil ein Value-Import von der `api-remotes`-Facade die ungebauten Assembly-Kette laden würde. `TestRemote.$host` ist ein einfaches Feld, das eine Spec direkt zuweist.

```ts ignore-check
import { Context } from '@deepseek-ai/cordis'
import { RemoteError, TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { expect, it } from 'vitest'

it('renders the failure code the Host reported', async () => {
  const ctx = new Context()
  const remote = new TestRemote(ctx, {
    notes: {
      list: () => Promise.resolve({
        ok: false as const,
        error: new RemoteError('note/not-found', 'no note "n-404"', { noteId: 'n-404' }),
      }),
    },
  })
  remote.$host = { home: '/home/fixture', isLoopback: true }

  await expect(ctx.remote.notes.list()).resolves.toMatchObject({ error: { code: 'note/not-found' } })
})
```

## Verifizieren

1. `pnpm run build:lib`: zwingend, sobald eine Signatur, die Code-Tabelle, der Namespace oder ein Export-Name sich geändert hat, weil es die Client-Deklarationen und Codecs produziert.
2. `pnpm run typecheck`: sowohl das Host- als auch das Client-Programm, wo ein Code, der in ein unerreichbares Package gemergt wurde, rot wird.
3. Führe beide Seiten-Specs namentlich aus: `npx vitest run <owner spec> <client spec>`.
4. Füge einen Recorded-Session-Snapshot hinzu, wenn der Endpoint eine produkt-sichtbare Oberfläche erreicht, gemäß der [Teststrategie](../testing.de.md).
