---
description: "Der Dateibaum-Tab-Typ der rechten Sidebar für den dsh-Web-Client: der Session-Workspace-Root, ebene für ebene über die Leitung gelistet, öffnet Dateien per Resource-Adresse in die Sidebar."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-files
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Der Navigator-Tab-Typ der rechten Sidebar: der Workspace-Root der Session als Baum, ebene für ebene über die Leitung gelistet, der Dateien in die Sidebar öffnet. Er ist ein über die Guide-Seite erreichbarer Page-Typ und beansprucht keine Adresse; er öffnet Dateien per Adresse, damit die `dsh-resource://file`-Viewer sie beanspruchen — nichts in `ui-sidebar-right` kennt dieses Paket.

## Inhaltsverzeichnis

- [Was es registriert](#what-it-registers)
- [Der Baum](#the-tree)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Hinweis für Entwickler](#dev-note)

-----

<a id="what-it-registers"></a>
## Was es registriert

- **Der Typ** — `ctx.sidebarRightTabs.register(...)` mit Kind `files`, Id `@deepseek-ai/dsh-client-ui-sidebar-files`, Band `builtin`, keine Patterns und ein Guide-Eintrag (Order 10, Titel und Beschreibung aus dem Namespace `sidebarFiles`, Glyph das geteilte Ordner-Icon), der den Typ öffnet.
- **Der Body** — der gekeyte `sidebar.right.pane.tab`-Seat unter dieser Id: eine Header-Zeile unter dem Strip, dann der Baum. Die Header-Zeile ist die der Dokumentvorschau (`ui-sidebar-documentpreview`): der Root-Pfad, seine Verzeichnisse abgeblendet und sein letztes Segment in voller Farbe, niemals ellipsiert (ein Pfad, der breiter als die Zeile ist, behält sein Ende und blendet seinen Anfang aus), mit dem einen Control, Reload, rechts. Die Zeile ist kopiert statt geteilt, weil ein Plugin-Bundle Laufzeitcode nur über die Plattform-Module teilt; sobald sich die Artefakt- und Slot-Oberflächen gesetzt haben, könnte eine Kopie in `ui-primitives` jedem Pane-Header dienen.
- **Der Chip-Titel** — der gekeyte `sidebar.right.pane.tab.title`-Seat unter dieser Id: ein geteiltes `FileTypeIcon`-Ordner-Glyph mit 16px vor dem Label des Typs. Die eigenen Zeilen des Baums zeichnen dieses Blatt nie.

Sieben Quelldateien unter `src/client/`: `definition.tsx` (der Typ), `store.ts` (was er hält), `face.ts` (wie er listet, inklusive Remote-Bindung), `FilesBody.tsx` (was er zeichnet, mit seinen Ordering- und Failure-Line-Helfern), `FilesTitle.tsx` (der Chip-Titel), `locales.ts` (was er sagt) und `index.ts` (die Verdrahtung).

<a id="the-tree"></a>
## Der Baum

Der Root ist das Arbeitsverzeichnis der Session, gelesen aus `useSessions().byId[sessionId].cwd`, und für die Header-Zeile durch `pathPartsOf` aus `@deepseek-ai/dsh-util-workspace-path` aufgeteilt. Jede Ebene ist per absolute path gekeyt; der Pfad eines Childs ist der seines Parents, mit `/` um den Eintragsnamen ergänzt. Eine Ebene wird beim ersten Expandieren gelistet, über `remote.workspaceFiles.list(sessionId, absolutePath)` auf dem Namespace `@deepseek-ai/dsh-api-workspace-files`; der Adapter behält die Einträge und das Truncation-Flag des Listings und verwirft dessen workspace-relativen Pfad. Zeilen sind Verzeichnisse zuerst geordnet, dann nach natürlichem, case-insensitive Namen; Dotfiles werden wie jeder andere Eintrag gezeigt.

| Eintragstyp | Zeile |
|---|---|
| `directory` | Togglet; die Ebene wird beim ersten Öffnen gefetcht und während des Zuklappens behalten. |
| `file` | Öffnet `dsh-resource://file/session/<sessionId>/<encoded path relative to the root>`, gebaut von `fileAddressFor` aus `@deepseek-ai/dsh-util-workspace-path` aus dem absoluten Pfad des Eintrags und dem Root des Baums, über `useTabInfo().tab.actions.openResource`, landend im eigenen Pane des Tabs. |
| `other` | Abgeblendet und nicht klickbar gezeigt, damit das Verzeichnis vollständig gemeldet wird. |

Eine vom Entry-Cap des Endpunkts geschnittene Ebene endet mit einem Marker; eine leere Ebene sagt das; eine fehlgeschlagene Ebene zeigt eine Zeile pro Code — `workspace-file/not-found`, `outside-workspace`, `not-directory` — und sonst die eigene Meldung des Transports. Reload verwirft jede gelistete Ebene und fragt die expandierten erneut ab; zugeklappte Ebenen werden beim nächsten Öffnen erneut gefetcht. Eine Session ohne Arbeitsverzeichnis zeigt eine einzelne Zeile statt eines Baums.

Der State lebt im eigenen Store des Typs, nach Tab-Id gebucketet: `root`, `levels` (loading / ready / failed pro absolutem Pfad) und `expanded`. Das `signal` des Owners beendet einen Bucket: Bei Abort wird der Tab vergessen, und ein danach settelndes Listing schreibt nichts.

<a id="model-experience"></a>
## Model Experience

Keine, da dieses Paket einen Workspace-Dateibaum im Browser zeichnet und nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; Verzeichnislistings laufen über den Remote und stellen keinen Model-Request zusammen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>
- **Nur Listing.** Keine Suche, kein Artefakt-Filter, kein Drag-and-Drop, kein Rename, kein Kontextmenü, kein Current-File-Highlight und kein Filesystem-Watching; eine Ebene ändert sich nur durch Reload.
- **Ein Root.** Der Baum wurzelt im Arbeitsverzeichnis der Session; es gibt keinen Weg, darüber zu browsen, und der Host verweigert ohnehin Pfade außerhalb des Workspace-Roots.

<a id="dev-note"></a>
### Hinweis für Entwickler

<details>
<summary>Arbeitskontext für Maintainer — zum Ausklappen klicken</summary>

Keiner.

</details>

**Laufzeitinvariante:** Es wird kein Companion publiziert. Der einzige Laufzeit-State des Baums ist ein Slot-Store pro Tab, geschrieben vom Body, der ihn besitzt, und vergessen beim Abort-Signal des Tabs; es gibt keine zweite Beobachtung, mit der man ihn vergleichen könnte.
