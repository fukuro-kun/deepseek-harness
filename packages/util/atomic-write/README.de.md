---
description: "Atomarer Dateiersatz und prozessübergreifendes Writer-Locking für Pakete, die niemals partielle, symlink-gekaperte oder zu weit geöffnete Inhalte auf der Platte hinterlassen dürfen."
kind: "package-library"
---

# @deepseek-ai/dsh-atomic-write

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-atomic-write` verwenden, um eine Datei zu ersetzen, ohne partielle Inhalte zu exposieren oder einem auf einen temporären Pfad gesetzten Symlink zu folgen. Sein Writer-Lock serialisiert Read-Modify-Write-Zyklen über Prozesse hinweg, sodass konkurrierende Writer einander nicht mit stalem Zustand überschreiben. Jeder Ersatz verwendet vom Aufrufer gewählte Permission-Bits auf einem frischen Inode, was die Permissions einer existierenden Datei sicher verengt. Diese Zero-Dependency-Library akzeptiert Strings; sie stellt kein `cordis.yml`-Plugin und keine Crash-Durability bereit, weil sie kein `fsync` aufruft.

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

`writeFileAtomic` verwenden, wenn ein dateigestützter Store einen bereits gerenderten String ersetzen muss, ohne je einen partiellen, symlink-gekaperten oder weiter geöffneten Zustand zu exposieren, und `withFileLock`, wenn mehrere Prozesse dieselbe Datei read-modify-write bearbeiten. Der kleinste Pfad ist ein Aufruf mit dem finalen Inhalt und den Permission-Bits des Ersatzes.

### Eine Datei atomar schreiben

```ts
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

declare const text: string
await writeFileAtomic('/home/u/.dsh/settings.yaml', text, { mode: 0o600 })
```

Parent-Directories werden bei Bedarf angelegt, und Reader beobachten entweder den alten oder den neuen vollständigen Inhalt. Unter Windows wird transiente Ersetzungsinterferenz, die als `EACCES`, `EBUSY` oder `EPERM` gemeldet wird, für ein begrenztes Intervall retried; jeder verbleibende Fehler entfernt die Temp-Datei und lässt das Ziel unangetastet.

### Writer koordinieren

Für einen Read-Render-Commit-Zyklus, den ein bloßes atomares Commit allein nicht sicher machen kann, das Writer-Lock um die Operation halten:

```text
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

declare const render: (previous: string) => string
declare const readCurrent: () => Promise<string>

await withFileLock('/home/u/.dsh/settings.yaml', async () => {
  const previous = await readCurrent()
  await writeFileAtomic('/home/u/.dsh/settings.yaml', render(previous), { mode: 0o600 })
})
```

Nur Writer konkurrieren — Reader nehmen das Lock nie — und ein Konkurrent macht exponential Backoff und schlägt mit einem Timeout-Fehler fehl, statt ewig zu blockieren. Wie lange ein Konkurrent wartet, wird pro Aufruf über `waitMs` angegeben: Der Default ist nur für Dateiarbeit bemessen, sodass ein Holder, dessen Zyklus einen Netzwerk-Roundtrip enthält — eine Credential-Mutation, die ein abgelaufenes Token erneuert — einen längeren angibt, weil der Default sonst jeden anderen Writer dieser Datei für die Dauer scheitern ließe. Die Retry-Kadenz bleibt fix. Ein Konkurrent entfernt ein existierendes Lock nie, weil das Dateialter nicht beweisen kann, dass sein Owner gestoppt hat.

### Zu planende Fehler

Das Parent-Directory des Locks muss bereits existieren, daher rejectet `withFileLock` eine ungültige Parent-Hierarchie vor dem Ausführen der Operation. Ein Prozess, der mit gehaltenem Lock exited, lässt das Lock-Sibling zurück; spätere Writer laufen in den Timeout, und ein Operator entfernt es erst, nachdem er verifiziert hat, dass kein Writer es noch besitzt.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Das Paket baut auf einer Trennung auf: Das atomare Commit besitzt den Swap, und das Writer-Lock besitzt die prozessübergreifende Ordnung.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `writeFileAtomic` und `withFileLock`, die gesamte Oberfläche des Pakets |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; diese pure Filesystem-Primitive besitzt keinen Event-Stream und keine mutablen Runtime-Daten; ihr Replacement-Contract wird durch Unit-Tests erzwungen. |

### Schreibpfad

`writeFileAtomic` schreibt ein Sibling mit zufälligem Suffix, das mit exklusivem Create (`wx`) geöffnet wird, und renamed es dann über das Ziel. Das exklusive Open verweigert das Folgen eines Symlinks, der an einem ratbaren Temp-Pfad gepflanzt wurde; das Sibling im selben Directory hält das Rename auf einem Dateisystem; und das Rename ersetzt ein gesymlinktes Ziel selbst, statt zu seinem Referenten durchzuschreiben. Ein Windows-Retry behält dasselbe vollständige Sibling und nutzt begrenztes exponentielles Backoff, sodass temporäre Nutzung des Ziels durch Software außerhalb des kooperativen Writer-Locks eine sichere Ersetzung nicht in einen Sofortfehler verwandeln kann; der archivierte [Retry-Decision-Record](../../../.agents/notes/archived/bug-fix/2026-08-29-windows-atomic-replace-retry.md) dokumentiert die ursprüngliche Begründung und die verworfenen Alternativen.

`withFileLock` legt ein `<filename>.lock`-Sibling mit `wx` an. `EEXIST` identifiziert Konkurrenz direkt; `EPERM` tut dies nur, wenn ein frisches `lstat` bestätigt, dass der Lock-Pfad existiert — das deckt das Windows-Exclusive-Create-Verhalten ab, ohne einen unverwandten Permission-Fehler zu verdecken. Das Lock zeichnet die PID seines Erzeugers auf und wird vom Holder in einem `finally` entfernt; Konkurrenz macht exponential Backoff und schlägt fehl, wenn die pro-Aufruf-`waitMs`-Deadline (Default zwei Sekunden) verstreicht.

### Warum der Swap sicher bleibt

- **Frischer Inode, vom Aufrufer angegebener Mode** — die Temp-Datei trägt `mode` durch das Rename, sodass das Verengen einer weiter geöffneten Datei keine chmod-Race hat. `mode` ist Pflicht, damit die Permission-Entscheidung an jeder Call-Site sichtbar bleibt.
- **Reader konkurrieren nie** — das Rename-Commit ist atomar, also braucht ein Reader kein Lock.
- **Ein Konkurrent löscht nie ein Lock** — das Alter kann einen gecrashten Owner nicht von einem pausierten, lebenden Writer unterscheiden; Recovery ist eine Operator-Aktion.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn du die konsumierenden Stores oder die Familie brauchst, zu der diese Primitive gehört.

- [User-Settings-File-Store](../../settings/settings-file/README.de.md) — das Settings-Dokument, das jeder Write über dieses Paket ersetzt.
- [Credentials-Store](../../credentials/credentials-local/README.de.md) — die Credentials-Datei, die dieses Paket lockt und ersetzt.
- [Util-Gruppenkarte](../README.de.md) — die Zero-Dependency-Utility-Familie, zu der dieses Paket gehört.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da dies eine pure Filesystem-Write-Primitive ist, die nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Nichts hiervon betritt ein Request-Präfix, die Provider-Cache-Wiederverwendung bleibt also unberührt.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo das Paket nicht das richtige Werkzeug ist. Sie sind aktuelle Paket-Constraints, kein Aufgabenstau.

- **Atomar, nicht durable** — kein `fsync` der Datei oder ihres Directorys, sodass das Rename nach einem Crash als zurückgerollt beobachtet werden kann. Die dateigestützten Stores hier lesen beim Boot neu und publizieren neu; Durability bleibt die Policy des Aufrufers.
- **Nur String-Inhalt** — keine `Buffer`- oder Stream-Form, bis ein Consumer eine braucht.
- **Verwaiste Locks brauchen Operator-Recovery** — ein Prozess, der mit gehaltenem Lock exited, lässt das Sibling zurück; spätere Writer laufen in den Timeout, ohne es zu löschen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Ein Durability-Replacement, das die Datei und das Parent-Directory `fsync`t und unter Windows Owner-only-Permissions beibehält, bleibt offen (im Source als `settings-atomic-durability` getrackt).

</details>
