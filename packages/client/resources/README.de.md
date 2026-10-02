---
description: "Client-Resource-Modell: protokollregistrierte Provider machen URL-Adressen zu Live-Werten, die jedes Slot-Component über den useResource-Standard-Hook liest."
kind: "package-reference"
---
# @deepseek-ai/dsh-client-resources

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Verwenden Sie Client-Resources, wenn ein Component Live-Daten nur über die URL-Adresse kennt — etwa eine Tab-Record, einen Link oder eine Mention — und ein anderes Client-Paket die Daten besitzt. Resource-Adressen verwenden `dsh-resource://<type>/…`; Protokolle, die einen Scope brauchen, kodieren ihn in den Pfad. Components erhalten den aktuellen Wert und spätere Updates über den öffentlichen `useResource`-Hook. Nicht unterstützte Protokolle und Nicht-Resource-Schemes, wie `sidebar://guide`, lösen zu keiner Resource auf.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
  - [Eine Resource lesen](#read-a-resource)
  - [Ein Protokoll bereitstellen](#provide-a-protocol)
  - [Eine Resource offen halten](#hold-a-resource-open)
- [Die Implementierung verstehen](#understand-the-implementation)
  - [Lebenszyklus](#lifecycle)
  - [Fehler](#failures)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Zum Mounten ist keine Konfiguration nötig: Das Plugin stellt `ctx.resources` bereit und trägt den `resource`-Root-keyed-Hook über `ctx.slots.provideRoot` bei, sodass jedes Slot-Component ihn erhält, unabhängig von seinem Scope.

<a id="read-a-resource"></a>
### Eine Resource lesen

Jedes Slot-Component erhält `useResource` in seinen Props. `useResource<P>(address)` benennt das Protokoll als Typargument und liefert `{ status, value, failure }`: `none`, wenn für das Protokoll der Adresse kein Provider registriert ist (oder die Adresse keine `dsh-resource://`-URL ist), `loading`, solange der Provider noch nichts geliefert hat, `live` mit dem Wert des letzten `ok`-Frames und `failed`, wenn der letzte Frame eine Fehlermeldung gemeldet hat — mit diesem Fehler neben dem letzten Wert. Das Abonnieren über den Hook ist, was die Resource offen hält; ein Component, das mountet, während ein anderer Holder die Resource am Leben hält, liest sofort den neuesten Wert.

<a id="provide-a-protocol"></a>
### Ein Protokoll bereitstellen

Das Client-Paket, dem das Protokoll gehört, erklärt seinen Wertetyp in `ResourceProtocolMap` und registriert einen Provider als eigenen Effect. `open` liefert `RemoteResult`-Frames: zuerst der aktuelle Inhalt, dann ein Frame pro späterer Änderung, wobei ein Fehler als `ok: false`-Frame und nicht als Throw auftritt; es muss stoppen, wenn `signal` abgebrochen wird:

```ts ignore-check
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap { note: NoteView }
}

export const inject = ['resources']

export function apply(ctx) {
  ctx.effect(() => ctx.resources.register<'note'>({
    protocol: 'note',
    async *open(address, { signal }) {
      yield await readNote(address, signal)
      for await (const change of followNote(address, signal)) yield change
    },
  }), 'my-notes: note resource provider')
}
```

Ein Protokoll hat genau einen Provider; eine zweite Registrierung wirft. Registriert man einen Provider, während Adressen seines Protokolls bereits gehalten werden, öffnet er sie; sein dispose beendet ihre Streams und bringt sie zurück auf `none`.

<a id="hold-a-resource-open"></a>
### Eine Resource offen halten

`ctx.resources.pin(address, signal)` hält eine Resource ohne Abonnement offen, bis `signal` abgebrochen wird. Die rechte Sidebar pinnt die Adresse jedes offenen Tabs für die Lebensdauer der Tab-Record, sodass ein Tab-Wechsel den Body unmountet, ohne seinen Stream zu schließen, und ein Zurückwechseln den neuesten Wert liest. `ctx.resources.source(address)` ist das nackte Observable hinter dem Hook, für Aufrufer außerhalb von React.

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<a id="lifecycle"></a>
### Lebenszyklus

Pro Adresse hält eine Record einen Snapshot-Store, eine Holder-Zählung (Hook-Abonnenten plus Pins) und den `AbortController` des laufenden Streams. Der erste Holder öffnet den Stream des Providers; jeder spätere Holder teilt ihn; die Freigabe des letzten Holders bricht den Stream ab und setzt den Snapshot auf idle zurück (`loading` mit Provider, `none` ohne). Records werden für die Seitenlebensdauer aufbewahrt, sodass `source()` über das render-then-subscribe-Fenster von React und ein StrictMode-Remount referenzstabil bleibt.

<a id="failures"></a>
### Fehler

Ein Fehler ist ein Frame, kein Throw: Ein Provider liefert `{ ok: false, error }`, und die Resource wird `failed` mit diesem Fehler neben dem letzten Wert; der nächste `ok`-Frame räumt ihn auf. Ein Stream, der von selbst endet, behält seinen letzten Zustand. Frames, die nach der Freigabe ankommen, die den Stream abgebrochen hat, werden verworfen, und der Iterator wird zurückgegeben. Ein Throw innerhalb des Streams eines Providers ist ein Programmierfehler und wird nicht gefangen.

<a id="model-experience"></a>
## Model Experience

Keine, da dieses Paket Werte zwischen Browser-Plugins bewegt und nichts Modell-zugewandtes registriert.

#### KV-Cache-Effekt

Keiner; Resource-Streams stellen keine Modell-Anfragen zusammen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Records überleben die Seitenlebensdauer** — die Record einer Adresse bleibt nach dem Weggang ihres letzten Holders in der Registry; nur ihr Zustand wird verworfen. Der Speicher wächst mit der Anzahl der je gelesenen verschiedenen Adressen, nicht mit den Lesungen.
- **Provider tragen die Abort-Compliance** — die Registry verwirft, was ein freigegebener Stream noch liefert, aber ein Provider, der `signal` ignoriert, arbeitet bis zu seinem nächsten Frame weiter.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>

**Runtime-Invariante:** Es wird kein Begleiter publiziert. Provider-Eigentümerschaft und Holder-Zählungen haben genau einen Besitzer, die Registry, ohne unabhängige Runtime-Quelle zum Abgleich; das Dispose der Registrierung und der Open/Close-Lebenszyklus werden von Verhaltens-Specs assertiert.
