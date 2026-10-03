---
description: "Workspace-Dateiservice für die Web-GUI: begrenzte Datei-Reads und abgesicherte Volltext-Writes über das komponierte Filesystem, plus Directory-Listing und instrumentierte Filesystem-Beobachtung innerhalb des Session-Workspace-Roots."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-workspace-files
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Verwende dieses Paket, um Dateien, die über das Filesystem einer Session lesbar sind, vom Web-Client aus als Vorschau zu lesen. Es liest UTF-8-Text seitenweise, liest begrenzte Bytefenster oder komplette Dateien, löst verwandte Dateien aus dem Verzeichnis einer Basisdatei auf und meldet Datei-Metadaten. Datei-Reads dürfen auf Pfade außerhalb des Workspace zielen; Directory-Listing und instrumentierte Filesystem-Beobachtungen bleiben auf den Workspace beschränkt. Ein abgesichertes `write` ersetzt den kompletten Text einer Datei über dieselbe Pfad-Reichweite, weil der Mensch an der UI — nicht der eingehegte Agent — ihr Principal ist.

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

Mounte das Paket neben `dsh-fs`, `dsh-sandbox-policy`, dem Session-Store und dem Typert-Gateway; das Bundle tut dies direkt nach dem Session-Controller. Jede Methode nimmt die Session-Identität auf der Leitung entgegen, sodass ein Client `remote.workspaceFiles.read(sessionId, path, range, signal)`, `stat(sessionId, path, signal)`, `readBytes(sessionId, path, range, signal)`, `list(sessionId, path, signal)` oder `changes(sessionId, signal)` aufruft und nie selbst ein Root benennt. Der Host liest einen live Session-Header oder nutzt Persistence-`stat` für eine kalte Session; er aktiviert keinen Agent, liest keinen Event-Body und leiht kein Root einer Parent-Session. Session-Persistence ist für live Reads optional, aber ohne sie kann eine kalte Session nicht aufgelöst werden und das Gateway gibt `gateway/lookup-not-found` zurück.

| Methode | Rückgabe | Zweck |
|---|---|---|
| `stat(path)` | `WorkspaceFileStat { absolutePath, version, bytes? }` | Identität, Version und Größe einer regulären Datei, ohne Inhalt |
| `read(path, { offset?, limit? })` | `WorkspaceFileText` = stat + `{ offset, text, lines, eof }` | Ein Zeilenfenster aus einer UTF-8-Textdatei; `lines` zählt sie, sodass eine leere Zeile und eine Seite jenseits des Endes unterschiedlich lesen |
| `readBytes(path, { offset?, length? })` | `WorkspaceFileBytes` = stat + `{ offset, data, eof }` | Ein Fenster roher Bytes aus jeder regulären Datei, base64-kodiert |
| `readAll(path)` | `WorkspaceFileBytes` mit `offset: 0`, `eof: true` | Komplette rohe Bytes unter `maxFileBytes`; überdimensionierte Dateien schlagen fehl statt gekürzt zu werden |
| `readRelated(path, relativePath)` | `WorkspaceFileBytes` | Komplette Bytes einer Datei, aufgelöst aus dem Verzeichnis der Basisdatei auf dem Host |
| `write(path, edit)` | `WorkspaceFileWriteResult` = stat + `{ operation }` | Volltext-Ersetzung einer regulären Datei, durch `edit.expectedVersion` gegen eine parallele Änderung abgesichert |
| `list(path)` | `WorkspaceDirectoryListing { path, entries, truncated }` | Direkte Kinder eines Verzeichnisses |
| `changes()` | Stream von `WorkspaceFileWatchFrame` | Subscription-Bereitschaft, dann Filesystem-Beobachtungen innerhalb des Workspace-Roots |

### Adressierung und Pfade

`read`, `readBytes`, `readAll`, `readRelated` und `stat` akzeptieren einen absoluten Pfad oder einen relativ zum Workspace-Root der gewählten Session. Das komponierte Filesystem entscheidet, ob der Pfad lesbar ist; der Service erzwingt keine Workspace-Eingrenzung für Datei-Reads. `readRelated` löst einen relativen Filesystem-Pfad aus dem Verzeichnis der Basisdatei auf, auch wenn eine der Dateien außerhalb des Workspace liegt. Diese Methoden melden den absoluten Pfad der Datei in der Ausführungswelt des Filesystems. `list` bleibt auf den Workspace beschränkt und meldet das gelistete Verzeichnis relativ zu diesem Root. `changes` meldet ebenfalls nur instrumentierte Filesystem-Beobachtungen innerhalb des Workspace-Roots.

### Seiten

`read` gibt ein Zeilenfenster zurück, nie die ganze Datei. `range.offset` ist die 1-basierte erste Zeile und defaultet auf 1; `range.limit` ist die größte Zeilenzahl auf der Seite und defaultet auf `maxLines`, die es nicht überschreiten darf — ein größeres Limit oder ein Offset oder Limit, das keine positive Ganzzahl ist, ist ein `gateway/bad-request`. Zeilen enden an `\n`, und ein finales `\n` terminiert die letzte Zeile statt eine leere zu beginnen, sodass eine Zweizeilen-Datei zwei Zeilen hat. Der `text` der Seite verbindet ihre Zeilen mit `\n` und trägt nach der letzten keinen Terminator; `eof` ist true, wenn die Seite die letzte Zeile der Datei enthält, und ein Offset jenseits des Endes gibt eine leere Seite mit `eof` true zurück. Jede Seite trägt außerdem die `version` der Datei aus dem vorausgegangenen stat, sodass ein Consumer eine frische Seite von einer stale unterscheiden kann, und `bytes`, die Größe der kompletten Datei, wenn das Backend sie meldet. Der Service liest die Datei nur bis zum ersten Zeichen hinter der Seite, sodass eine sehr große Datei eine Seite Speicher pro Anfrage kostet.

### Bytefenster

`read` paginiert nach Zeilen und nie nach Bytes; ein Bytefenster ist `readBytes`. `range.offset` ist das 0-basierte erste Byte und defaultet auf 0; `range.length` ist die größte Bytezahl im Fenster und defaultet auf `maxBytes`, die es nicht überschreiten darf — ein längeres Fenster schlägt mit `too-large` fehl statt gekürzt anzukommen, und ein Offset oder Length, das keine Ganzzahl im Bereich ist, ist ein `gateway/bad-request`. Das Fenster kommt als base64-`data` zurück, kürzer als `length` am Dateiende und leer bei oder jenseits davon; `eof` ist true, wenn das Fenster das letzte Byte der Datei enthält. Nichts wird dekodiert und nichts als binär abgelehnt, sodass ein Bild oder eine NUL-beladene Datei dort lesbar ist, wo `read` mit `not-text` fehlschlägt. Dieselbe `version` und `bytes` kommen mit wie auf einer Seite.

### Datei-Read- und Verzeichnis-Checks

Jede Operation nutzt zuerst `lstat`, um einen fehlenden Pfad, einen finalen Symlink oder die falsche Dateiart abzulehnen. Datei-Operationen lösen danach auf und lesen durch das komponierte Filesystem ohne zusätzlichen Workspace-Containment-Check. Nur `list` verlangt, dass das aufgelöste Verzeichnis innerhalb des Workspace-Roots bleibt. Die konfigurierten Seiten-, Fenster-, Komplettdatei- und Listing-Obergrenzen gelten weiterhin. Textseiten lehnen zusätzlich ungültiges UTF-8 und NUL-Bytes ab; Byte-Reads dekodieren keinen Inhalt. Ein leerer Pfad ist ein `gateway/bad-request`.

### Der Change-Feed

`changes` ist ein `stream`-Remote. Eine Generation registriert ihre Beobachtungs-Queue und löst den Session-Workspace-Root auf, bevor sie `{ kind: 'ready' }` yielded. Sie yielded dann `{ kind: 'change', change }`, wobei `change` `{ absolutePath, version }` für eine vorhandene Datei oder `{ absolutePath, absent: true }` für eine als verschwunden beobachtete ist. Die Quelle ist `fs/observed`, gefiltert auf Ziele innerhalb dieses Roots; das Betriebssystem wird nicht beobachtet. Beobachtungen nach dem ersten Pull der Generation werden gequeuet, auch während das Root aufgelöst wird. Die Generation endet bei Cancellation oder Plugin-Disposal.

### Writes

`write` ersetzt den kompletten Text einer regulären Datei durch `edit.text`, gedeckelt durch `maxFileBytes` wie ein kompletter Read, und gibt den Post-Write-stat zurück. `edit.expectedVersion` trägt das Version-Token, das ein Read zurückgab: Solange es noch übereinstimmt, wird der Write angewendet; eine Abweichung schlägt mit `workspace-file/stale-version` fehl und schreibt nichts, sodass eine parallele Änderung — ein Agent-Edit zwischen Load und Save des Lesers — nie still überschrieben wird. Das Weglassen des Tokens überschreibt bedingungslos. Der Write löst seine Sandbox-Policy als `danger-full-access` auf, passend zur Pfad-Reichweite des Reads für den Menschen, der die UI bedient; dieselben `lstat`-Gates gelten, sodass ein fehlender Pfad, ein finaler Symlink oder eine nicht-reguläre Datei weiterhin abgelehnt wird und `write` nie eine Datei erzeugt. Ein erfolgreicher Write meldet `fs/observed` mit der gelandeten Version und ohne Actor, sodass `changes`-Consumer — darunter Sibling-Previews — den Write wie jede instrumentierte Mutation sehen, während Agent-Intent-Guards ihn ignorieren.

### Konfiguration

| Feld | Default | Bedeutung |
|---|---|---|
| `maxBytes` | `2097152` (2 MiB) | Inklusive Byte-Obergrenze auf den Text einer Seite und auf ein Bytefenster; eine größere Seite oder Fenster schlägt fehl |
| `maxFileBytes` | `33554432` (32 MiB) | Inklusive Komplettdatei-Obergrenze für `readAll` und `readRelated`; größere Dateien schlagen mit `too-large` fehl |
| `maxLines` | `5000` | Default und größte Seitengröße in Zeilen; ein größeres `limit` wird abgelehnt |
| `maxEntries` | `2000` | Obergrenze auf zurückgegebene Verzeichniseinträge; der Rest wird verworfen und als gekürzt gemeldet |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-api-workspace-files) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Fehlschläge

Jeder Fehlschlag ist ein `RemoteError`-Code mit typisierten Details, deklariert in [`src/types.ts`](src/types.ts): `workspace-file/not-found`, `workspace-file/outside-workspace` (nur Directory-Listing), `workspace-file/too-large` (mit `limit`, der anwendbaren Seiten-, Fenster- oder Komplettdatei-Obergrenze), `workspace-file/not-text`, `workspace-file/not-regular-file` (`kind`: `directory`, `symlink` oder `other`) und `workspace-file/not-directory` (`kind`: `file`, `symlink` oder `other`), `workspace-file/stale-version` und `workspace-file/write-failed`. Aufrufer verzweigen auf den Code, nie auf den Nachrichtentext.

### Client-Datei-Ressourcen

Der Browser-Export registriert den `file`-Provider in `ctx.resources` und erfordert `resources`, `remote` und `remote.workspaceFiles`. Die einzelne `workspace-files`-Zeile des Bundles liefert beide Faces; der Client hat keine separate Konfiguration. Eine Komponente liest `WorkspaceFileStat { absolutePath, version, bytes? }`-Metadaten über `useResource<'file'>(address)` und holt Inhalt separat über Remote-Reads. Jede UI, einschließlich Global-Komponenten, teilt die Beobachtung für dieselbe komplette Adresse.

Eine `session/<sessionId>/<path>`-Adresse trägt die autorisierende Session und einen relativen oder absoluten Pfad; führende Slashes bleiben erhalten, wie in `dsh-resource://file/session/s//etc/hosts`. Der Host empfängt den Pfad unverändert und besitzt Auflösung und Zugriffs-Checks; der Client braucht kein Session-`cwd`. `absolute/<path>` bleibt parsebar, hat aber keine autorisierende Session und schlägt mit `workspace-file/unknown-workspace` fehl, ohne aktuelle oder Tab-Session zu leihen. Nicht unterstützte Adressen schlagen mit `workspace-file/unsupported-address` fehl. [Workspace-path](../../util/workspace-path/README.de.md) besitzt die Grammatik; der generische Resource-Layer kennt nur die Adresse und `signal`.

Der Provider wartet auf den `ready`-Frame des Hosts vor seinem ersten `stat`, queuet Changes während des Reads und bindet den Follower dann an `stat.absolutePath`. Sowohl gequeuete als auch live Changes matchen auf diesen vom Host zurückgegebenen Pfad. Eine neue Write-Version aktualisiert Metadaten und behält die letzte Byte-Größe; doppelte Versionen werden ignoriert. Eine Absent-Notice stat-ett die Datei erneut. Ein fehlgeschlagener stat hält die Adresse verfolgt; ein späterer Write kann sie wiederherstellen, und jeder Session-Write kann einen Retry auslösen, bevor die erste erfolgreiche Pfad-Bindung erfolgt. Frames sind `RemoteResult`-Werte, und Programmier-Exceptions bleiben ungefangen.

Ein überwachter `changes`-Stream bedient jede verfolgte Datei in einer Session. Follower matchen absolute Pfade mit zu Slashes normalisierten Backslashes. Carrier-Verlust verbindet durch den Gateway-Supervisor neu; ein vom Host beendeter oder terminal fehlgeschlagener Feed beendet seine Follower und lässt ihre letzten Metadaten lesbar, bis er neu geöffnet wird. Der letzte Follower beim Verlassen disposed den Stream, ein Nachfolger wartet auf diese Disposal, und Plugin-Teardown wartet auf alle ausstehenden Closes. Der Provider deklariert `ResourceProtocolMap.file`; die Text-Preview deklariert ihre Sidebar-Zeilennavigations-Parameter.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

### Designkonzept

Reads über `ctx.fs` nutzen die Read-Autorität des Backends; das Sandboxing-Backend hegt Writes und Edits ein, nicht Reads. Ein Typert-Lookup leitet `WorkspaceFileScope` aus einem live Session-Header oder dem header-only-`stat` des Persistence-Service ab, sodass kalte Subagent-Sessions weder Agent-Aktivierung noch Event-Body-Reads brauchen. Der Service fügt Regular-File-Checks und begrenzten Transfer hinzu, während Workspace-Containment nur zum Directory-Listing und zur Change-Beobachtung gehört. `write` verwendet die Read-Gates wieder und fragt die Sandbox-Policy nach dem `danger-full-access`-Scope des menschlichen Principals, dann lässt es das Filesystem-Backend seinen abgesicherten atomaren Replace ausführen. Eine Seite wird aus `streamText` geschnitten, das Chunk für Chunk dekodiert und Nicht-UTF-8 ablehnt: Der Cutter zählt Zeilen vor dem Fenster, ohne sie zu behalten, lässt jedes In-Window-Segment gegen die Byte-Obergrenze prüfen, bevor er es puffert, und kehrt beim ersten Zeichen hinter dem Fenster zurück. Ein `stat` vor dem Stream benennt Version und Größe, die die Seite meldet.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `WorkspaceFiles`: der `workspaceFiles`-Service und Remote-Namespace, `Config`, die Gates, der Seiten-Cutter, `read`, `readBytes`, `readAll`, `readRelated`, `stat`, `list`, `write` |
| [`src/changes.ts`](src/changes.ts) | `WorkspaceChangeFeed`: `fs/observed`-Subscription und eine Queue pro offener `changes`-Generation |
| [`src/types.ts`](src/types.ts) | Wire-Typen und die `RemoteErrorDetailsMap`-Codes, veröffentlicht als `./types` für Client-Pakete |
| [`src/client/index.ts`](src/client/index.ts), [`provider.ts`](src/client/provider.ts), [`change-feed.ts`](src/client/change-feed.ts) | Browser-Plugin, Datei-Metadaten und Pro-Session-Change-Feed |
| [`src/client/types.ts`](src/client/types.ts), [`remote.ts`](src/client/remote.ts) | Resource-Werte, Parameter, Client-Fehlercodes und generierte Remote-Typen |
| — | Es wird kein Runtime-Invariant-Begleiter veröffentlicht; jede Host-Antwort wird zur Aufrufzeit aus `ctx.fs` und der Sandbox-Policy abgeleitet. |

Typert generiert die Host- und Client-Remote-Artefakte, die `./typert` und `./remote` exponieren.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [Filesystem-Capability](../../fs/fs/README.de.md) — der `ctx.fs`-Contract, durch den dieser Service liest, einschließlich `fs/observed` und `readByteRange`.
- [Sandbox-Policy](../../sandbox/sandbox-policy/README.de.md) — woher das Workspace-Root der Session kommt.
- [Remote-Assembly](../../api/remotes/README.de.md) — wie Client-Pakete den `workspaceFiles`-Namespace erreichen.
- [Client-Resources](../../client/resources/README.de.md) — das Resource-Modell, `useResource`, Pins und Provider-Lifetime.
- [Workspace-Pfad-Helpers](../../util/workspace-path/README.de.md) — `fileAddressFor` und `parseFileAddress`, die `dsh-resource://file/…`-Adressgrammatik, die beide Enden teilen.
- [Sidebar-Text-Preview](../../client/ui-sidebar-documentpreview/README.de.md) — der Tab-Typ, der eine Datei über den `file`-Provider verfolgt und ihre Seiten liest.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da dieses Paket kein Tool registriert, keine Prompt-Sektion beiträgt und kein Session-Event anhängt.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert und sendet keine Provider-Anfrage.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Nur instrumentierte Operationen** — `changes` leitet `fs/observed`-Emissionen weiter; eine Datei, die von einem Subprozess, einem Shell-Befehl oder dem Editor des Benutzers geändert wird, erzeugt keinen Frame.
- **Nur Replace-Writes** — `write` schreibt den kompletten Text einer bestehenden regulären Datei unter der Full-Access-Policy des menschlichen Principals neu; es erzeugt nichts, folgt keinem Symlink und umgeht das `workspace-write`-Heging des Agents by design.
- **Nur Directory-Scope** — `list` und `changes` bleiben innerhalb des Session-Workspace, obwohl Datei-Preview-Reads jeden vom Filesystem-Backend lesbaren Pfad nutzen dürfen.
- **Keine Gesamt-Zeilenzahl** — eine Seite meldet `eof`, nicht wie viele Zeilen folgen; ein Consumer, der die Gesamtzahl braucht, paginiert bis zum Ende oder schätzt aus `bytes`.
- **Eine Riesenzeile hat keine Seite** — eine einzelne Zeile über `maxBytes` schlägt mit `too-large` in jedem Fenster fehl, das sie enthält, weil Seiten nach Zeilen geschnitten werden, nicht nach Bytes.
- **Reads sind nicht transaktional** — Ergebnis-Metadaten kommen aus dem stat, bevor Inhalt gelesen wird; ein paralleler Write kann dafür sorgen, dass gemeldete Version und zurückgegebener Inhalt abweichen.
- **Unbegrenzte Generation-Queue** — eine `changes`-Generation puffert jede enthaltene Beobachtung, bis ihr Consumer pullt; ein gestallter Consumer lässt Host-Speicher für die Lebensdauer des Streams wachsen.
- **`maxEntries` begrenzt die Antwort, nicht das Listing** — `list` fragt `ctx.fs.listDir` nach jedem Kind und schneidet das Array danach, sodass ein Verzeichnis weit über der Obergrenze den Host trotzdem das ganze Listing kostet (bei `fs-local` ein stat pro Kind); diese Arbeit zu begrenzen braucht ein Limit auf dem `listDir` der Filesystem-Seam.
- **Tote Feeds behalten Metadaten** — nachdem der Host `changes` beendet oder der Stream terminal fehlschlägt, behalten offene Werte ihren letzten Zustand bis zum Wiederöffnen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
