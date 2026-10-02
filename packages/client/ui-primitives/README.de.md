---
description: "Geteilte React-UI-Atoms für den dsh-Web-Client: Controls, Icons, Markdown- und Mathe-Rendering sowie die Terminal-/Read-/Diff-/Search-/Web-Output-Cards (zero cordis)."
kind: "package-library"
---

# @deepseek-ai/dsh-client-ui-primitives

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Verwende `dsh-client-ui-primitives`, um Web-Client-Controls zu bauen und Agent-Output mit geteilter React-UI zu rendern. Es enthält Standard-Controls, Icons, anchored Overlays und Renderer für Markdown mit TeX, Terminal-Output, File-Reads, Diffs, Search, Web-Retrieval und JSON. Die Renderer handhaben unvertrauenswürdigen Modell-Output, indem sie rohes HTML verwerfen, Links einschränken und ANSI-Escape-Sequenzen parsen. Die Komponenten importieren keine Cordis-Runtime; Aufrufer liefern lokalisierte Labels, und Theme-seitige Farben nutzen `--dsw-*`-Design-Tokens.

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

Dieses Paket ist ein Build-Input der Web-Shell. Sein statisches ESM behält Third-Party-Imports und Styles für Vite; unabhängige Consumer stellen seine Development-Dependencies bereit ([Dependency-Regeln](../AGENTS.md#dependency-declaration)).

Komponiere Feature-UI aus diesen Atoms, wann immer der Web-Client ein Standard-Control oder einen Agent-Output-Renderer braucht. Sie rendern ausschließlich über React und beziehen `--dsw-*`-Design-Tokens aus dem Theme — sie passen daher in jedes Plugin, ohne das Theme oder das Slot-System zu importieren.

<a id="component-catalog"></a>
### Komponenten-Katalog

Prüfe diese Tabelle, bevor du ein Control in einem Feature-Paket schreibst. Ein Plugin kann keine Komponente eines anderen Plugins importieren, also ist dieses Paket der einzige Ort, an dem ein Control geteilt werden kann: nutze wieder, was passt, und hebe einen bewussten visuellen Unterschied in ein Prop, statt eine zweite Kopie anzulegen.

| Export | Was es ist |
|---|---|
| `Button` | Klickbare Aktion; `variant` wählt `primary`, `ghost`, `outline` oder `toolbar`. |
| `Switch` | Zweistelliger Toggle, 36×20. `label` ist erforderlich, sodass das Control nicht unbenannt ausgeliefert werden kann. |
| `Input` | Einzeilige Texteingabe für Search-Boxen und Inline-Forms. |
| `Menu` | Dropdown aus Items, Separatoren und Gruppen-Labels, mit verschachtelten Submenüs. |
| `Pill` | Wählbarer Capsule-Button für View-Switcher und Filter; nimmt `active` und `onClick`. |
| `Tag` | Read-only-Capsule-Badge; `tone` wählt eine von acht Paletten. |
| `StateDot` | Status-Markierung: `done`, `warning`, `ongoing`, `error` oder `idle`. `aria-hidden`, sodass die Render-Stelle den Namen besitzt. |
| `ConnectionIndicator` | Inline-Connection-Recovery-Control über die Zustände Ausfall, Retry und Recovered. |
| `DisclosureRow` | 24px-kompakte Disclosure, die Titel und Content nebeneinander anordnet. |
| `Modal` | Zentrierter Dialog über einer Page-Mask. |
| `RiskConfirmation` | Sensitive Aktion hinter einer expliziten Checkbox. |
| `OnboardingSurface` | First-run-Bühne, die den Application-Root inert hält. |
| `Tooltip` | Hover-Text auf einem geklonten Anchor, platziert rechts, unten oder oben. |
| `HoverCard` | Hover-Preview, auf dem der Pointer ruhen und aus der er auswählen kann; optionaler Copy-Button. |
| `Toast` | Transienter Top-Center-Banner, gehalten für die `holdMs` des Owners. |
| `JsonTree`, `JsonBlock` | Read-only-JSON-Inspektion. |
| `MarkdownText`, `CodeBlock` | Unvertrauenswürdiges GFM mit TeX-Mathe sowie highlighted Code. `CodeBlock` akzeptiert opt-in `lineNumbers`; kopierte Quelle schließt den Gutter aus, und `contentRef` exponiert seinen stabilen Source-Wrapper an einen Owner, der ihn als Scrollport verwendet. |
| `TerminalBlock`, `ReadBlock`, `DiffBlock`, `SearchBlock`, `WebBlock` | Die Agent-Output-Card passend zu jeder Tool-Result-Intent. |
| `icons/*`, `FishLogo`, `BrandWordmark`, `ReferenceIcon`, `LinkIcon` | Glyphen und Brand-Marks. `LinkIcon` für 14px-Clickable-Link-Kategorien verwenden. |
| `FileTypeIcon`, `classifyFileType`, `fileExtension` | Eine kategorien-gefärbte 28px-Datei- oder Ordner-Glyphe und das geteilte case-insensitive Dateinamen-Mapping dahinter. Code- und Konfigurationsdateien nutzen detaillierte vollfarbige Technologie-Glyphen; für link-führende Glyphen `LinkIcon` und für Bild-Content Bild-Previews verwenden. |

Drei Paare sind leicht zu verwechseln:

- **`Tag` gegen `Pill`.** Greife zu `Tag` für ein Read-only-Badge in 11px-Capsule-Größe und zu `Pill`, wenn die Capsule wählbar ist (`active` und `onClick`, wie View-Switcher und Filter sie nutzen) oder wenn sie auf einer 24px-Textzeile sitzen muss — `TerminalBlock` rendert seinen Exit-Status genau aus diesem Grund als statisches `Pill`. Hier entscheidet die Größe ebenso wie die Interaktivität; die beiden sind nicht austauschbar.
- **`DisclosureRow` gegen eine Card.** Die Zeile legt Titel und Content auf fixen 24px nebeneinander. Eine Card, die einen Namen über eine Beschreibung stapelt, ist ein anderes Layout und gehört ins Feature-Paket — `ui-settings-plugins`' `PluginCard` ist der Präzedenzfall und dokumentiert das Warum.
- **`FoldToggle` gegen die exportierte Surface.** Er ist paket-intern und nicht exportiert; die Output-Cards nutzen ihn für ihren Head-Tail-Fold.

Eine eigene Komponente im eigenen Paket zu schreiben ist in Ordnung, wenn der Bedarf wirklich spezifisch ist. Nicht in Ordnung ist, ein Control zu kopieren, das hier bereits existiert — und sobald ein zweites Paket dasselbe Control braucht, gehört es in dieses Paket ([Entscheidung](../../../.agents/notes/implemented/architecture/2026-09-05-shared-client-control-primitives.de.md)).

### Controls und Icons

Der Katalog oben listet, wofür jeder Export da ist; dieser Abschnitt deckt das Verhalten ab, das Props allein nicht zeigen. Das `ic_ds_*`-Icon-Set und die `FishLogo`/`BrandWordmark`-Marks füllen Brand- und Inline-Icon-Slots. `FileTypeIcon` rendert die traditionellen 28px-Glyphen Excel, Folder, HTML, Image, Markdown, Generic, PDF, PPT, Video und Word und nutzt für erkannte Code- und Konfigurationsdateien das vollfarbige quadratische Technologie-Artwork. `classifyFileType` wendet exakte Dateinamen-, Prefix-, Suffix-, optionale Projekt-Kontext- und Extension-Regeln in dieser Reihenfolge an; React-Namen gewinnen über TypeScript/JavaScript, Angular-Suffixe gewinnen über ihre Basis-Extension, und eine Dart-Datei wird nur dann zu Flutter, wenn die gelieferten Projektdateien ein `pubspec.yaml` mit `flutter:` enthalten. Markdown und SVG bleiben traditionelle Markdown- bzw. Bild-Dateien. Office-Mappings umfassen XLSM/Numbers als Excel, KEY als Slides und RTF/ODT/Pages als Dokumente. `fileExtension` exponiert dasselbe Basename- und Final-Dot-Parsing für benachbarte Metadaten-Labels. Traditionelle Glyphen nutzen ein deckendes kategorien-gefärbtes Blatt mit weißem Zeichen und transluzenter weißer Ecke; die generische Datei nutzt ein graues Blatt und eine dunkelgrauere Ecke. Aufrufer dürfen die Blattfarbe über `--dsh-file-type-icon-color` überschreiben. Das vollfarbige Technologie-Artwork ist die bewusste Ausnahme und behält seine eingebettete Palette. Alle Glyphen sind dekorativ und tragen kein Label. `LinkIcon` bleibt die kleinere führende Glyphe für klickbare Artifact-Links — Globus, Folder, Code, Image, Document oder schlichtes Papier —, während `classifyLinkPath` die geteilten Dateitypen in dieses bestehende Sechs-Kategorien-Vokabular faltet. `ConnectionIndicator` rendert eine warn-gefärbte Disconnected-Aktion, ein Connecting-Label, dessen ein bis drei Punkte unabhängig vom Retry-Timing alle 500ms fortschreiten, oder einen erfolgs-gefärbten Recovered-Status. Hover oder Keyboard-Focus zeigt nur das Reconnect-Action-Label, auch während die Connecting-Punkte animieren. Jeder Zustand reserviert das breiteste gelieferte Label und nutzt feste Icon- und Text-Spalten, sodass Textänderungen das Control weder verschieben noch seine Breite ändern. Sein Owner liefert Sichtbarkeit, Recovery-Hold-Dauer, lokalisierte Labels und den Immediate-Reconnect-Callback; das Primitive nutzt keinen nativen Title-Tooltip. `useAnchoredPosition` und `useAnchoredMaxHeight` halten Floating-Panels und bottom-anchored Overlays am Viewport geklemmt und ihrem Anchor folgend. `HoverCard` hält seine portalierte Preview über die Anchor-Lücke hinweg erreichbar und kann über das `copyText`-Prop einen Copy-Button exponieren. `Toast` hält für das Fenster, das sein Owner über `holdMs` benennt, denn wie lange ein Banner stehen bleiben muss, hängt davon ab, wie viel zu lesen ist; derselbe Wert treibt seinen Unmount-Timer und die Fade-Verzögerung des Stylesheets, sodass die beiden nicht auseinanderlaufen können. `rankByName` ist der geteilte Kandidaten-Ranker des `/`-Menüs für die Command- und Skill-Quellen: die Query muss eine case-insensitive geordnete Subsequenz des Namens sein; Prefix-Treffer ranken zuerst, dann Alignment-Score, dann Quellreihenfolge. `Menu.autoFocus` fokussiert sein erstes aktiviertes Item, unterstützt Arrow-Up/Down- und Home/End-Navigation und fokussiert bei Escape den ersten Button im Anchor; es ist opt-in für Action-Menüs.

### Agent-Output rendern

`MarkdownText` rendert unvertrauenswürdiges GFM und TeX-Mathe, blockiert unsichere Links und Bilder und kann aufgelöste File-Mentions in explizite Controls verwandeln. Wenn der Owner ein `pathImages`-Vokabular übergibt, werden Bild-Destinations, die lokale Media-Pfade sind, nur bei gesettelten Renders zu anzeigbaren URLs umgeschrieben (das gleiche Streaming-Gate wie bei File-Mentions); ohne Vokabular bleiben lokale Destinations inerter Alt-Text. Ein Lade- oder Decode-Fehler ersetzt das Bild durch seinen authored Alt-Text oder — wenn alt leer ist — durch die Original-Destination. Das Ändern der Bildquelle erlaubt einen frischen Load. Während eine Antwort streamt, friert es abgeschlossene Blöcke ein, schiebt einen Top-Level-Offenen-Fence um abgeschlossene Zeilen voran und highlighted diesen Fence aus gespeichertem Shiki-Grammar-State. Abgeschlossene Token-Zeilen wandern in React-Gruppen fixer Größe, sodass spätere Chunks nur die wachsende Gruppe reconcilieren; ein unveränderter Fence behält dieses DOM, wenn das finale Full-Parse dokumentübergreifende Syntax auflöst. `TerminalBlock`, `ReadBlock`, `DiffBlock`, `SearchBlock` und `WebBlock` rendern die passende Tool-Result-Intent mit Copy-Controls, Overflow-Handling und — wo anwendbar — ANSI-Verarbeitung. `JsonTree` und `JsonBlock` inspizieren JSON-Werte read-only, während `projectUserText` gesendeten User-Text in Inline-Plain-Runs und Reference-Chips für die Message-Bubble und Queue-Rows projiziert.


### Copy lokalisieren

Die Atoms können die Application-Locale nicht lesen, also kommt jede user-facing Copy über erforderliche Label-Props an. `HoverCard`, `TerminalBlock`, `JsonTree`, `CodeBlock`, `MarkdownText`, `JsonBlock`, `ConnectionIndicator`, `Modal`, `DiffBlock`, `ReadBlock`, `SearchBlock` und `WebBlock` akzeptieren vollständige lokalisierte Labels. Das Paket besitzt kein Language-Fallback; Auslassen schlägt das Typechecking fehl, und jedes Feature bildet seinen getypten `t`-Sitz auf das Label-Interface des Primitives ab.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Das Paket ist eine Trennung: präsentationale React-Atoms mit zero Cordis und zero Slot-Wissen, ausschließlich über `--dsw-*`-Tokens gestylt, während jedes Feature-spezifische Anliegen (Locale, Session-Daten, Komposition) im komponierenden Plugin bleibt.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Öffentliche Atom-Exports |
| [`src/markdown/`](src/markdown/) | Markdown- und Mathe-Pipeline: micromark-Parsing, KaTeX-Typesetting, inkrementeller Streaming-Renderer, `CodeBlock`/`JsonBlock` |
| [`src/TerminalBlock.tsx`](src/TerminalBlock.tsx) | ANSI-Escape-Parsing (`anser`) und Terminal-Card-Rendering |
| [`src/ReadBlock.tsx`](src/ReadBlock.tsx) / [`src/DiffBlock.tsx`](src/DiffBlock.tsx) | Read- und Diff-Cards |
| [`src/SearchBlock.tsx`](src/SearchBlock.tsx) / [`src/WebBlock.tsx`](src/WebBlock.tsx) | Search- und Web-Retrieval-Cards |
| [`src/icons/`](src/icons/) | `ic_ds_*`-Glyph-Komponenten und Brand-Marks |
| [`src/useAnchoredPosition.ts`](src/useAnchoredPosition.ts) / [`src/useAnchoredMaxHeight.ts`](src/useAnchoredMaxHeight.ts) | Floating-Panel- und Overlay-Geometrie-Hooks |

### Streaming-Markdown

Während eine Antwort streamt, parsed `MarkdownText` inkrementell: alle außer den letzten zwei Blöcken frieren als gecachte React-Elemente ein, und nur der Source-Tail re-parsed pro Chunk — die Pro-Chunk-Arbeit folgt also dem Tail statt der ganzen Antwort. Ein finaler ungeschlossener Top-Level-Fence behält seinen geparsten Code-Node und schickt nur die letzte abgeschlossene Zeile plus die aktuelle Partial-Zeile durch dieselbe GFM-Grammar; ein schließender Fence oder ein ambiger Parse kehrt zum gewöhnlichen Tail-Pfad zurück. Highlighting setzt ebenfalls aus gespeichertem Shiki-Grammar-State fort und publiziert nur neu abgeschlossene Zeilen plus den mutablen Tail. `CodeBlock` versiegelt abgeschlossene Zeilen in React-Gruppen fixer Größe, nutzt frühere Gruppen wieder und behält den ganzen highlighted Tree über das Settlement hinweg, wenn Code und Sprache unverändert sind. Das gesettelte Full-Parse löst weiterhin Referenzen auf, die die Freeze-Grenze überschritten.

### Geometrie und Overflow

Die Output-Cards teilen ein Geometrie-Modell: `white-space: pre` mit horizontalem Scrollen, damit spalten-ausgerichteter Content seine Ausrichtung behält, und ein Head-plus-Tail-Slice hinter einem Expand-Button ab `maxLines` (Default 16), sodass ein langer Body die Card nie streckt. `TerminalBlock` parsed ANSI in React-Spans mit einem Pro-Zeilen-Spalten-Buffer für Cursor-Bewegung und beachtet Erase-in-Line, Tab-Stops und Zeichenbreite.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten ordnen die Atoms im Client-Stack und im Design-System ein.

- [ui-renderer](../ui-renderer/README.de.md) — der React-Renderer, der die assemblierte Anwendung mountet und Slot-Daten bindet.
- [ui-tool](../ui-tool/README.de.md) — die Tool-Call-Präsentationsschicht, die diese Output-Cards komponiert.
- [ui-conversation](../ui-conversation/README.de.md) — die Chat-Surface, die Markdown-Antworten und Tool-Cards rendert.
- [ui-theme](../ui-theme/README.de.md) — das `--dsw-*`-Token-System, über das diese Atoms gestylt werden.
- [Web-Styling](../../../docs/web-styling.de.md) — die maßgeblichen Styling-Regeln für Web-Client-Komponenten.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket eine Browser-seitige UI-Plugin-Schicht ist, die nichts Model-facing registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert oder sendet keinen Provider-Request.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wie sich die Atoms an den Rändern verhalten; es sind aktuelle Paket-Constraints, keine Komponenten-Roadmap.

- **Streaming verschiebt die Auflösung grenzüberschreitender Referenzen** — ein Reference-Style-Link oder eine Fußnote, deren Definition auf der anderen Seite der inkrementellen Freeze-Grenze liegt, rendert als literaler Text, während die Antwort streamt; das gesettelte Full-Parse beim Finalisieren löst sie auf.
- **Ein langer highlighted Fence behält sein komplettes Token-DOM** — Streaming vermeidet Re-Parsing, Re-Tokenizing und Reconciling des abgeschlossenen Prefix, verwirft aber weder alte Farben noch virtualisiert es Token-Spans. Die finale DOM-Kardinalität folgt daher weiterhin der Token-Anzahl des Fences; verschachtelte/Container-Fences und eine pathologische einzelne lange Zeile bleiben auf dem allgemeinen Tail-Pfad.
- **Glyph-Level-Icons sind neu gezeichnete Annäherungen** — das Fisch-Logo und das Sparkle-Mark stammen aus Font-Glyphen, deren Vektorgeometrie aus den lokalen Design-Daten nicht exportierbar ist; handgezeichnete Nachbildungen stehen ein, bis ein exakter Export-Pfad existiert.
- **`Pill` und `Input` haben keine Design-Quelle** — beide Atoms sind selbst definiert; das Sidebar-Search-Feld und der View-Tab-Strip, die ihnen ähneln, sind consumer-owned Kompositionen, nicht diese Atoms.
- **Keine `Active`-`StateDot`-Variante** — die unterstützten Zustände sind done, warning, ongoing, error und idle.
- **User-facing Copy ist an der Render-Stelle erforderlich** — die Atoms sind zero-Cordis und erreichen `ctx.locale` nicht; jedes Feature muss vollständige lokalisierte Labels über die getypten Props des Primitives liefern ([Entscheidung](../../../.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.de.md)).
- **`TerminalBlock` ist kein Terminal-Emulator** — es rendert gesettelten oder noch laufenden Kommando-Output, keine interaktive Session: SGR-Farben, Carriage Return, Backspace, Erase-in-Line, Tab-Stops und Zeichenbreite werden beachtet; absolute Cursor-Positionierung, Screen-Clearing und Alternate-Screen-Sequenzen werden entfernt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Pure Props-in-React-Atoms ohne Cordis-API — keine Events, keine Services, kein mutabler Cross-Plugin-State; Rendering-Contracts werden direkt durch die Komponenten-Specs dieses Pakets abgesichert.
