# 1. Dein erstes Plugin

[English](01-first-plugin.md) | [中文](01-first-plugin.zh.md) | Deutsch

In der in diesem Tutorial verwendeten Loader-Konfiguration exportiert ein Cordis-Plugin-Modul eine `apply`-Funktion als benannten Export. Wenn Cordis das Modul lädt, ruft es `apply` mit einem **Context** auf — dem `ctx`-Objekt, über das das Plugin alles registriert, was es beisteuert.

## Das Plugin schreiben

Erstelle in deinem `tmp/cordis-tutorial`-Verzeichnis (siehe [Setup](index.de.md#setup)) die Datei `hello.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('hello from my first plugin')
}
```

Der `name`-Export ist optionale Anzeigemetadaten; er beschriftet das Plugin in Diagnoseausgaben.

## Die App komponieren

Der Launcher dieses Tutorials setzt die Anwendung aus einer Konfiguration zusammen. Erstelle `cordis.yml`:

```yaml
- name: './hello.ts'
```

Die Datei ist eine Liste von Cordis-Konfigurationseinträgen. `name` ist ein Modulspezifizierer — ein relativer Pfad oder ein NPM-Paketname — und der Loader mountet jeden Eintrag. Einträge starten nebenläufig, daher garantiert die Position in der Liste nichts über die Lade-Reihenfolge; die Reihenfolge ergibt sich aus Service-Abhängigkeiten (`inject`, [Kapitel 3](03-services.de.md)), nicht aus der Position in der Datei.

## Ausführen

```sh
node --import tsx ../../vendor/cordis/bin.js
```

Erwartete Ausgabe:

```
hello from my first plugin
```

Der Prozess beendet sich selbst, sobald nichts mehr läuft. Was passiert ist:

1. Der Launcher erstellte einen Root-`Context` und mountete das **Loader**-Plugin.
2. Der Loader las `cordis.yml`, löste `./hello.ts` auf und mountete es als Child-Plugin.
3. Cordis rief dein `apply(ctx)` auf.

In deiner Datei steht kein Framework-Bootstrap-Code: Ein Plugin beschreibt, was es beisteuert, und `cordis.yml` komponiert die Anwendung. Die [`dsh`-Basis](../../packages/bundle/base/cordis.patch.yml) beispielsweise ist eine längere Plugin-Komposition, die von Deployment-Overlays gepatcht wird.

## Die zwei anderen Plugin-Formen

Eine Funktion ist die häufigste Form, aber Cordis akzeptiert drei:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

// 1. Function plugin (what you just wrote).
export function apply(ctx: Context) {}

// 2. Object plugin: an object with an `apply` method.
export const objectPlugin = {
  name: 'object-plugin',
  apply(ctx: Context) {},
}

// 3. Class plugin: a Service subclass (covered in chapter 3).
export class MyService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myTutorialService')
  }
}
```

Verwende die Funktionsform, bis du einen Service freigeben musst; [Kapitel 3](03-services.de.md) behandelt, wann die Klassenform ihren Platz verdient.

## Versuche, es zu brechen

Lass `apply` eine Exception werfen:

```ts ignore-check
export function apply(ctx: Context) {
  throw new Error('apply exploded')
}
```

Erneut ausführen: Der Prozess stirbt mit deinem Fehler. Ein Plugin, das nicht geladen werden kann, ist ein lauter Fehler, kein übersprungener Eintrag.

Eine Einschränkung, die man früh kennen sollte: Ein Konfigurationseintrag, dessen Modul nicht **aufgelöst** werden kann — ein Tippfehler im Pfad oder Paketnamen — wird über den Cordis-Logger-Service gemeldet, anstatt den Prozess abstürzen zu lassen. Beim Boot kann diese Meldung verloren gehen, bevor ein Console-Exporter aktiv wird. Wenn ein neu hinzugefügter Eintrag scheinbar nichts tut, prüfe zuerst die Schreibweise.

Nächstes Kapitel: [Lifecycle und Effects](02-lifecycle-and-effects.de.md) — was passiert, wenn ein Plugin entladen wird.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
