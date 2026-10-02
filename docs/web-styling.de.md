# Web-UI-Stilreferenz

[English](web-styling.md) | [中文](web-styling.zh.md) | Deutsch

Diese Referenz definiert die Zuständigkeiten für das Styling und die Komponentenregeln für Browser-Client-Packages. Die aktuellen Token-Werte liegen in [`packages/client/ui-theme/src/styles/`](../packages/client/ui-theme/src/styles/); dieses Dokument dupliziert dieses aus dem Quellcode generierte Verzeichnis nicht.

## Zuständigkeit

[`ui-theme`](../packages/client/ui-theme/README.de.md) besitzt die `--dsw-*`-Statische Skala, semantische Aliase, Typografie, Bewegung, Verläufe, Schatten, Scrollbar-Stile sowie die Hell/Dunkel-Präferenz. [`ui-layout`](../packages/client/ui-layout/README.de.md) wendet den aufgelösten Theme-Snapshot auf das Dokument an. Feature-Packages verwenden semantische Aliase und definieren kein weiteres globales Theme.

Globale Stylesheets gehören in `ui-theme/src/styles/`. Komponentenstile liegen als CSS Modules neben der jeweiligen Komponente. Eine Komponente darf eine lokale Custom Property definieren, wenn ihr Wert Teil des Layout- oder Darstellungsvertrags dieser Komponente ist; gemeinsame Farben, Typografie, Elevation und Bewegung gehören in das Theme-Package.

## Komponentenregeln

- Wiederverwenden vor Neugestalten: Der [ui-primitives Komponentenkatalog](../packages/client/ui-primitives/README.de.md#component-catalog) ist der einzige Kanal, der Feature-Packages übergreift, und eine bewusste visuelle Differenz gehört dort als Prop hin statt als zweite Kopie ([Entscheidung](../.agents/notes/implemented/architecture/2026-09-05-shared-client-control-primitives.de.md)).
- Verwende CSS Modules und `clsx`; füge keine Komponentenbibliothek oder Tailwind hinzu.
- Verwende in Feature-Komponenten die semantischen Tokens `--dsw-alias-*`. Kopiere keine statischen Palettenwerte und schreibe dort keine Literalfarben.
- Halte Theme-Selektoren aus dem Feature-Komponenten-CSS heraus. Hell/Dunkel-Overrides gehören dem Theme-Eigentümer.
- Paare Schriftgrößen mit Zeilenhöhen und verwende die Theme-Typografie-Variablen, wenn eine bestehende Rolle passt.
- Lasse Quelltext, Terminal-Ausgabe und Diff-Zeilen unumgebrochen, wenn der Komponentenvertrag Spaltenerhalt verlangt; verwende die gemeinsamen Scrollbar-Stile statt komponentenspezifischer Scrollbar-Selektoren.
- Lege Darstellung in CSS ab. Inline-React-Styles dürfen komponentenlokale Custom-Property-Werte übergeben, aber keine Theme-Verzweigungen kodieren.
- Erhalte die Sichtbarkeit des Tastaturfokus und das Reduced-Motion-Verhalten, wenn du Übergänge oder reine Hover-Steuerungen hinzufügst.
- Abgerundete Ecken erben die globale Superellipse-Glättung aus `corner-shape.css` von ui-theme auf unterstützenden Engines. Paare `corner-shape: round` mit jedem vollrunden `border-radius` (`50%`, `100%` oder einer Pill-Radius), damit Kreise und Kapseln kreisförmige Bögen behalten; die ui-theme corner-shape-Spezifikation erzwingt diese Paarung.
- Erhöhte Oberflächen (Menüs, Popovers, Modals, Panels, schwebende Buttons, der Composer) setzen `border: 0` und nehmen `box-shadow: var(--dsw-elevation-panel)`, `var(--dsw-elevation-prominent)` oder den Composer-Wert `var(--dsw-elevation-soft)` (größerer Blur bei niedrigerem Alpha): Der 0.5px-Hairline-Strich ist die erste Schattenlage, und `--dsw-elevation-stroke-color` bindet ihn pro Oberfläche oder Zustand neu oder unterdrückt ihn. Paare niemals einen `--dsw-alias-border-*`-Border mit einem lv/elevation-Schatten — die ui-theme elevation-Spezifikation lehnt die Paarung ab; zustandsgefärbte Borders (warn-Panels) bleiben echte Borders.
- Flache Borders und Trennlinien, die einen neutralen `--dsw-alias-border-*`-Token verwenden, zeichnen bei `0.5px` — Buttons, Inputs, Cards, Zeilentrenner und als gefüllte Boxen gezeichnete Trennlinien (Menü-Trennlinien, die Naht des Konversations-Headers, markdown `hr`, vertikale Rails) teilen das Hairline-Gewicht, das Chromium als ein Gerätepixel malt. Gestrichelte Affordanzen und zustandsgefärbte Borders behalten 1px; Spinner-Ring-Tracks behalten ihre Breite durch die explizite Allowlist der Spezifikation. Die ui-theme elevation-Spezifikation lehnt breitere neutrale solid-Borders ab.
- Klickbare Artifact-Links (markdown-Anker, Prosa-Dateierwähnungen, Web-Quell- und Fetch-Links, Produced-File-Chips, Workflow-Member-Links) färben über `--dsw-alias-link` bei `font-weight: 500`, ohne Unterstrich in Ruhe und mit einem gepunkteten, 3px-versetzten Unterstrich bei Hover/Focus. Textführende Anker führen außerdem mit dem `LinkIcon`-Kategorie-Glyph von ui-primitives auf `currentColor`; Workflow-Member-Links und bild-only-Anker tragen keinen Glyph, und Datei-Links in Tool-Zeilen behalten ihre graue gepunktete Affordanz ([clickable-link Agent Note](../.agents/notes/implemented/feature/2026-09-04-web-clickable-link-styles.de.md)).

## Das System ändern

Füge einen gemeinsamen Token im zuständigen `ui-theme`-Sheet hinzu oder ändere ihn, dann verwende sein semantisches Alias aus Feature-Packages. Aktualisiere die zuständige Package-Referenz, wenn sich ein öffentlicher Styling-Vertrag ändert. Visuelles Verhalten folgt der [Test-Policy](testing.de.md); die [styling-system Agent Note](../.agents/notes/implemented/process/2026-07-19-web-styling-system.de.md) hält die Framework-Begründung fest.
