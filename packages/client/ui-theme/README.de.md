---
description: "Theme- und Schriftgrößen-Einstellungen für den dsh Web-Client: --dsw-*-Token-Stylesheets, ThemeRuntime-State, Einstellungszeilen im Abschnitt „General“ und das Pre-Plugin-Bootstrap."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-theme
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh-client-ui-theme` lässt Web-GUI-Nutzer in den Einstellungen `light`, `dark` oder `system` wählen und die Schriftgröße des Konversationsinhalts auf 12 bis 17 px setzen. Ein Loopback-Client speichert beide Werte im `ui-theme`-Settings-Namespace, den der lokale Provider standardmäßig in `$DSH_HOME/settings.yaml` persistiert. Das Plugin löst `system` über `prefers-color-scheme` auf und publiziert immutable `ThemeSnapshot`s; ui-layout wendet jeden Snapshot auf das Dokument an. Das Paket liefert außerdem die `--dsw-*`-Token-Stylesheets und injiziert ein synchrones Bootstrap, damit die gewählte Palette und Schriftgröße vor dem Laden der Shell greifen. Drittanbieter-Themes können Alias-Token-Overrides über `ctx.theme` registrieren.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Nutzer wechseln Farbschema und Schriftgröße über zwei Zeilen in den Einstellungen (Abschnitt „General“); auf einem Loopback-Browser persistieren beide Wahlen über Neustarts hinweg. Feature-Plugins konsumieren den aktuellen Snapshot über `ctx.theme` und lesen die `--dsw-*`-Tokens im CSS; sie verwalten den Theme-State nicht selbst.

### Erscheinungsbild und Schriftgröße

Das Plugin registriert Appearance-Präferenzkacheln und einen Schriftgrößen-Stepper im Abschnitt „General“. Der Stepper akzeptiert Ganzzahlen von 12 bis 17 px und hat den Default 14 px. Er ändert Konversationsüberschriften und Grundtext um dasselbe Inkrement, einschließlich der User-Bubble und des Composer-Entwurfs; Flow-Row-Titel, -Zusammenfassungen und -Tabellen folgen eine Stufe unter der Grundgröße, während Kleintext und Code feste Größen behalten. Jede akzeptierte Änderung wird über die Host-Settings-API geschrieben. Schnell aufeinanderfolgende Änderungen serialisieren in Gestenreihenfolge mit Namespace-Revisionen, und ein verworfener letzter Write lädt die durable Werte neu. Nicht-Loopback-Seiten halten beide Wahlen prozesslokal.

### Ein Theme registrieren

Eine Komposition kann über `ctx.theme` eine Drittanbieter-Theme-id mit Alias-Token-Overrides registrieren; die Override-Schicht faltet sich in Registrierungsreihenfolge in die Tokens des aktiven Snapshots. Das Entfernen eines Eintrags überschreibt niemals die letzte durable eingebaute Präferenz. Drittanbieter-Theme-ids bleiben eine In-Process-Extension und überschreiten das eingebaute Settings-Schema nicht.

### Pre-Plugin-Palette

Enthält die Host-Komposition einen HTTP-Server, bettet die Host-Hälfte die registrierten `ui-theme`-Settings oder die Schema-Defaults in jede Index-Antwort ein. Bevor die ladende Seite rendert, setzt der Browser `color-scheme`, `body[data-ds-dark-theme]` und `--dsh-content-font-size`, sodass der erste Paint die gewählte Palette und Textgröße verwendet.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Der Service besitzt Theme- und Schriftgrößen-State und publiziert Snapshots. Der ui-layout-Presenter wendet diese Snapshots an, und die Token-Stylesheets besitzen die Farb- und Konversationstext-Skalen.

### Stylesheets

`src/styles/` enthält sechs Stylesheets, die der dynamische Client-Entry von ui-theme der Reihe nach importiert: `base.css`, `corner-shape.css`, `design-platform.css`, `scrollbar.css`, `gradient-shadow-text.css` und `shiki.css`. Das Client-Bundle kompiliert und injiziert sie als plugin-eigene globale Styles, sodass Unload und HMR sie zusammen mit ui-theme entfernen. `scrollbar.css` ist der einzige Consumer der `--dsw-alias-scrollbar-*`-Tokens und muss auf `design-platform.css` folgen, das sie deklariert.

`corner-shape.css` glättet jede abgerundete Ecke: Innerhalb von `@supports (corner-shape: superellipse(1.5))` definiert es `--dsw-corner-shape` und wendet es über den Universalselektor auf alle Elemente und ihre `::before`/`::after` an, sodass Engines ohne `corner-shape` kreisförmige Ecken behalten. Vollrunde Formen — `border-radius: 50%`-Kreise und Pill-Radien — paaren `corner-shape: round` mit ihrem Radius im Stylesheet der besitzenden Komponente, weil eine Superellipse sie verformt; die corner-shape-Stylesheet-Spec erzwingt diese Paarung über alle Paket-Stylesheets hinweg.

`gradient-shadow-text.css` leitet `--dsh-content-font-delta` von `--dsh-content-font-size` ab und verschiebt die Markdown-Überschriften- und Grundtext-Leiter um dieses Inkrement. Es leitet außerdem die Sekundärstufe `--dsh-content-font-size-secondary` ab (Einstellung −1 bei ≤14, Einstellung −2 darüber; 13px beim Default) mit ihrem eigenen `--dsh-content-font-delta-secondary` für die Tabellenvarianten und die Flow-Rows eine Stufe unter dem Grundtext. Kompakte Klein- und Code-Varianten bleiben fest. Außerhalb der Leiter lesen User-Bubble und Composer-Entwurf das Grundpaar direkt, und Flow-Row-Titel und -Zusammenfassungen lesen das Sekundärpaar. Das Stylesheet besitzt außerdem die Schattenskala (`--dsw-shadow-lv*`) und die Elevation-Tokens: `--dsw-elevation-stroke` zeichnet eine 0,5-px-Haarlinie über die rebindbare `--dsw-elevation-stroke-color`, und `--dsw-elevation-panel`/`--dsw-elevation-prominent`/`--dsw-elevation-soft` (die Stufe des Composers mit größerem Blur und niedrigerem Alpha) legen zwei feine weiche Schatten über diesen Stroke, sodass erhöhte Flächen `border: 0` setzen und keine layoutverbrauchende Outline tragen; die abgeleiteten Tokens werden pro Element neu deklariert, damit das Stroke-Color-Rebind einer Fläche wirkt.

### Scrollbar-Rebinding

`scrollbar.css` bindet `--dsh-scrollbar-thumb` und `--dsh-scrollbar-thumb-hover` auf `body` an die l1-Grundflächen-Tokens; eine erhöhte Fläche (Menü, Popover, Dialog) rebindet sie auf ihrem eigenen Container an die l2-Tokens, und das andere legale Ziel des Paars ist `transparent` (ui-sidebar rebindet seine Spalte so, solange der Zeiger woanders ist). `--dsh-scrollbar-width` spiegelt die Layout-Breite des WebKit-Balkens für Flächen, die neben einem platzverbrauchenden Balken ausgerichtet werden müssen. Die beiden Rendering-Pfade schließen sich konstruktionsbedingt gegenseitig aus: Firefox nimmt die Standard-Properties innerhalb von `@supports not selector(::-webkit-scrollbar)`, und WebKit-basierte Engines nehmen die Pseudoelemente, sodass das Hover-Token stets nur über den Pseudoelement-Pfad rendert.

### Präferenz-Persistenz

Der Service stellt sich auf einem Loopback-Browser sofort mit den Schema-Defaults bereit, lädt dann den `ui-theme`-Namespace und schreibt jede akzeptierte Theme- oder Schriftgrößen-Änderung über die Host-Settings-API. Gepushte Settings-Änderungen und Reconnects holen den Namespace erneut. Nicht-Loopback-Seiten erzeugen diesen Host-backed Scope nicht. Die Persistenzgrenze gehört der [Host-backed-Preferences-Note](../../../.agents/notes/implemented/bug-fix/2026-08-06-host-backed-web-preferences.de.md).

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten behandeln den Layout-Presenter, die Token-Consumer und die Styling-Regeln.

- [ui-layout](../ui-layout/README.de.md) — der Presenter, der den aufgelösten Theme-Snapshot anwendet.
- [ui-sidebar](../ui-sidebar/README.de.md) — ein Consumer des Scrollbar-Rebinding-Vertrags.
- [ui-conversation](../ui-conversation/README.de.md) — ein Consumer von `--dsh-scrollbar-width` für den Composer-Seat.
- [Web-Styling](../../../docs/web-styling.de.md) — die autoritativen Styling-Regeln für Web-Client-Komponenten.
- [Host-backed-Präferenzen](../../../.agents/notes/implemented/bug-fix/2026-08-06-host-backed-web-preferences.de.md) — die Persistenzgrenzen-Entscheidung.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket eine browserseitige UI-Plugin-Schicht ist, die nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert weder einen Provider-Request noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die Theme-Extension-Oberfläche und die Farbautorität; sie sind aktuelle Paket-Constraints.

- **Drittanbieter-Themes sind ein Extension Point, kein Produkt** — eines zu registrieren bedeutet, gleichnamige Alias-Variablen zu überschreiben; es existiert keine Validierung, dass ein Override-Set vollständig ist.
- **Die Token-Stylesheets sind die alleinige Farbautorität** — Werte, die im Designsystem fehlen, werden bewusst nicht angehängt; das nächstliegende semantische Token gewinnt, und vom Design-Owner genehmigte Ergänzungen kommen als statische Stufe plus semantischem Alias im selben Change herein.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Der Settings-Scope validiert und publiziert die durable Theme-Section, während die Registry `theme/change` synchron zu ihren eigenen Mutationen emittiert. Store/Registry-Übereinstimmung wird direkt durch die Host-, Scope- und Service-Verhaltensspecs dieses Pakets abgedeckt.
