# Client-Ressourcen

[English](client-resources.md) | [中文](client-resources.zh.md) | Deutsch

Das Client-Ressourcenmodell verwandelt eine Adresse in Live-Daten für jede Web-Client-Komponente. [`dsh-client-resources`](../../packages/client/resources/README.de.md) stellt den `ctx.resources`-Service und den globalen Standard-Hook `useResource` bereit; ein Paket, das eine Inhaltsart besitzt, registriert einen **Provider** für sein **Protokoll**, und eine Komponente liest den aktuellen Zustand des Inhalts über die **Adresse**, ohne die Laufzeit des Owners zu importieren. Die Tabs der rechten Sidebar sind der erste Consumer des Modells ([rechte Sidebar](sidebar-right.de.md)); der Entscheidungsrekord ist der [Agent Note zum Client-Ressourcenmodell](../../.agents/notes/implemented/architecture/2026-09-05-client-resource-model.de.md).

Diese Seite ist die Entwicklerreferenz: wie man eine Adresse schreibt, wie man einen Provider registriert, wie man eine Ressource liest, was die Zustände und Fehler bedeuten und wie das Modell eine Ressource hält und freigibt.

## Adressen

Eine Ressourcenadresse ist eine `dsh-resource://<type>/…`-URL. Der Host benennt das Protokoll und muss ein Schlüssel von `ResourceProtocolMap` sein; der Pfad gehört dem Protokoll selbst, und dessen Owner percent-encodet jedes Segment. Ein Protokoll, das einen Scope braucht, legt ihn in den Pfad: Adressen des `file`-Protokolls lauten `dsh-resource://file/session/<sessionId>/<path>`, wobei der Pfad workspace-relativ oder absolut mit erhaltenen führenden Slashes ist, mit `fileAddressFor(sessionId, cwd, path)` gebaut und mit `parseFileAddress(address)` aus [`dsh-util-workspace-path`](../../packages/util/workspace-path/README.de.md) zurückgelesen wird. Das Modell selbst liest nur Scheme und Host: `protocolOf(address)` gibt den kleingeschriebenen Host einer `dsh-resource://`-URL zurück und `undefined` für alles andere. Adressen unter jedem anderen Scheme — das `sidebar://guide` der Sidebar — benennen keine Ressource und lesen sich als `none`.

| Adresse | Protokollschlüssel | Liest sich als |
|---|---|---|
| `dsh-resource://file/session/s1/notes/a.md` | `file` | die Metadaten von `notes/a.md` unter dem Workspace-Root der Session `s1`, wenn der `file`-Provider registriert ist |
| `dsh-resource://file/absolute/home/me/notes.md` | `file` | parsbar, schlägt aber mit `workspace-file/unknown-workspace` fehl: keine autorisierende Session, und weder aktuelle noch Tab-Session wird entliehen |
| `DSH-RESOURCE://File/session/s1/a` | `file` | ein eigener Datensatz: Adressen werden als Strings verglichen, und `openResource` akzeptiert nur die kanonische Kleinschreibung, die `fileAddressFor` erzeugt |
| `sidebar://guide` | — | `none`: eine Navigationsadresse |
| `/home/me/notes.md` | — | `none`: keine URL |

## Provider registrieren

Der Owner eines Protokolls deklariert seinen Werttyp auf `ResourceProtocolMap` und registriert einen Provider innerhalb seines eigenen `ctx.effect`, sodass das Protokoll genau so lange lebt wie das Plugin ([Protokoll bereitstellen](../../packages/client/resources/README.de.md#provide-a-protocol)). `open(address, { signal })` gibt einen Stream von `RemoteResult`-Frames zurück — zuerst den aktuellen Zustand, dann einen Frame pro Änderung — und muss stoppen, wenn `signal` abbricht. Ein Fehler ist ein `ok: false`-Frame, das einen `RemoteFailure` trägt; ein Wurf innerhalb des Streams ist ein Programmierfehler und wird nicht abgefangen.

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-client-resources/client'

interface NoteView { readonly title: string; readonly updatedAt: string }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap { note: NoteView }
}

export const inject = ['resources', 'remote']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.resources.register<'note'>({
    protocol: 'note',
    async *open(address, { signal }): AsyncIterable<RemoteResult<NoteView>> {
      const id = new URL(address).pathname.slice(1)
      yield await ctx.remote.notes.read(id, signal)
      for await (const change of ctx.remote.notes.follow(id, signal)) yield change
    },
  }), 'my-notes: note resource provider')
}
```

Ein Protokoll hat genau einen Provider; eine zweite Registrierung wirft. Wird registriert, während Adressen des Protokolls bereits gehalten werden, öffnen sich deren Streams sofort; das Disposen des Providers beendet diese Streams, und die Adressen lesen sich als `none`, bis ein Provider zurückkehrt.

## Ressource lesen

Jede Slot-Komponente erhält `useResource` in ihren Props, unabhängig von ihrem Scope ([Slots](slots.de.md)). `useResource<P>(address)` benennt das Protokoll als Typargument und gibt den aktuellen Snapshot der Adresse zurück; das Abonnieren ist es, das die Ressource offen hält, und eine Komponente, die mountet, während ein anderer Halter die Ressource am Leben hält, liest sofort den neuesten Wert, ohne den Stream neu zu öffnen ([Ressource lesen](../../packages/client/resources/README.de.md#read-a-resource)).

| `status` | Bedeutung | `value` | `failure` |
|---|---|---|---|
| `none` | Für das Protokoll der Adresse ist kein Provider registriert, oder die Adresse ist keine Ressourcenadresse | `undefined` | `undefined` |
| `loading` | Der Stream des Providers ist offen und hat noch nichts geliefert | `undefined` | `undefined` |
| `live` | Der neueste Frame war erfolgreich | der neueste `ok`-Wert | `undefined` |
| `failed` | Der neueste Frame meldete einen Fehler | der letzte `ok`-Wert, beibehalten | der `RemoteFailure` des Frames |

```tsx ignore-check
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-api-workspace-files/client'

type Props = PropsRuntime<'sidebar.right.pane.tab'>

export function FileHeader({ useTabInfo, useResource, t }: Props) {
  const { tab } = useTabInfo()
  const meta = useResource<'file'>(tab.contentId)
  if (meta.status === 'failed') return <p role="alert">{t('failed', { code: meta.failure.code })}</p>
  return (
    <header>
      {tab.title}
    </header>
  )
}
```

Ein Consumer stellt `failed` selbst dar: Das Modell behält den letzten Wert neben dem Fehler, sodass ein Body veralteten Inhalt mit einem Hinweis statt einer Leere zeigen kann, und der nächste `ok`-Frame löscht den Fehler. Nichts im Modell erzeugt benutzersichtbaren Text.

## Halten und Freigeben

Eine Ressource lebt, solange sie einen Halter hat: ein abonniertes `useResource` oder einen Pin. `ctx.resources.pin(address, signal)` hält eine Ressource ohne Subscription offen, bis `signal` abbricht, und ein bereits abgebrochenes Signal pint nichts; die rechte Sidebar pint die Adresse jedes offenen Tab-Datensatzes für dessen Lebensdauer, sodass ein Tab-Wechsel einen Body unmountet, ohne dessen Stream zu schließen. Der erste Halter öffnet den Stream des Providers; die letzte Freigabe bricht ihn ab, verwirft den Wert und setzt den Snapshot auf `loading` (Provider vorhanden) oder `none` (abwesend) zurück. Ein Frame, den der Provider nach dieser Freigabe liefert, wird verworfen, und der Iterator wird zurückgegeben. `ctx.resources.source(address)` ist das nackte Observable hinter dem Hook, referenzstabil pro Adresse, für Aufrufer außerhalb von React; das Lesen seines Snapshots hält die Ressource nicht ([Lebenszyklus](../../packages/client/resources/README.de.md#lifecycle)).

Streams tragen Metadaten, nicht Inhalt. Der Wert des `file`-Providers ist `WorkspaceFileStat { absolutePath, version, bytes? }`: Der erste Frame kommt vom Host-`stat`, spätere Beobachtungen aktualisieren die Version. Ein Consumer liest Inhalt über den Workspace-Files-Remote-Namespace; Preview besitzt das Refresh unabhängig pro Tab ([`dsh-api-workspace-files`](../../packages/api/workspace-files/README.de.md)).

## Grenzen

Datensätze leben für die Seitenlebensdauer: Der Datensatz einer Adresse bleibt, nachdem sein letzter Halter geht, ohne Stream und ohne Wert, sodass der Speicher mit der Zahl jemals gelesener unterschiedlicher Adressen wächst. Ein Provider, der `signal` ignoriert, läuft bis zu seinem nächsten Frame weiter. Der Fehlertyp ist der `RemoteFailure` des Remote-Face, sodass ein Provider, dessen Quelle kein Remote-Aufruf ist, selbst einen erzeugen muss. Ein falsch geschriebenes Protokoll oder eine missformte Adresse liest sich als `none` ohne weitere Diagnose.
