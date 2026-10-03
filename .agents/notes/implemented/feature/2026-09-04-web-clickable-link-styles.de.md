# Agent Note: Web-Klicklink-Sprache — Link-Alias, gepunktete Hover-Unterstreichung, Kategorie-Glyphen
[English](2026-09-04-web-clickable-link-styles.md) | [中文](2026-09-04-web-clickable-link-styles.zh.md) | Deutsch

Status: implemented


## Problem

Klickbare Artifact-Links im Chat-Transcript trugen vier verschiedene Kostüme: Markdown-Anker und Prosa-Datei-Erwähnungen waren business-primary-blau mit solider Hover-Unterstreichung, Web-Search-/Fetch-Links glichen diesem Paar, Produktions-Datei-Chips waren graue Pills (label-secondary-Text auf interactive-bg-hover, 96px Maximalbreite), und Workflow-Member-Links trugen eine ruhende solide Unterstreichung. Nichts markierte, was ein Link öffnet (Browser, Host-App, Finder, In-App-Ansicht), und die Linkfarbe war an `--dsw-alias-state-business-primary` gekoppelt, das auch Fokusringe und Statuspunkte steuert, sodass das Tunen der Linkfarbe unbeteiligte Oberflächen riskierte.

## Entscheidung

Eine Link-Sprache über die klickbaren Link-Oberflächen des Transcripts hinweg — Markdown-Anker (einschließlich Referenzlinks, mailto und zu URL hochgestuftem Inline-Code), Prosa-Datei-Erwähnungen, Web-Search-Quelllinks und die Fetch-URL, Produktions-Datei-Chips und Workflow-Member-Links:

- Die Farbe kommt über einen dedizierten `--dsw-alias-link`-Alias in `design-platform.css` (light `deepseek-500`, dark `deepseek-400`), entkoppelt von `state-business-primary`; Links rendern mit `font-weight: 500` ohne Unterstreichung im Ruhezustand und `underline dotted` mit 3px Offset bei Hover/Fokus.
- Ein führender Kategorie-Glyph — das neue `LinkIcon` in ui-primitives mit den Arten `url` (Globus), `folder`, `code`, `image`, `document` und `other` (Papier) — rendert nur `currentColor`; `classifyLinkPath` faltet die [geteilte detaillierte Dateityp-Klassifikation](2026-09-08-shared-file-type-icons.de.md) in diese sechs Link-Kategorien, und Code-, Web- und Daten-Erweiterungen teilen designbedingt den Code-Glyph. Zwei Ankerformen tragen keinen Glyph: Workflow-Member-Links (eine In-App-Member-Ansicht passt in keine Datei- oder URL-Kategorie) und Anker, die nur Bilder umschließen (ein Badge oder Thumbnail — ein freihängender Globus neben dem Bild führt keinen Text). Inline-Glyphen liegen bei 1.1em mit −0.25em Baseline-Offset; die flex-zentrierten Produktions-Datei-Glyphen rücken stattdessen 1.2px nach unten, weil die 22px-Textbox ihre Glyphen unter der Box-Mitte trägt.
- Produktions-Datei-Chips lassen die graue Pill und die 96px-Kappe fallen: schlichter linkblauer Text in natürlicher Breite, der nur dann mit Ellipsis schrumpft, wenn die Zeile überläuft; die Container-Query-Bänder budgetieren weiterhin 96px pro Chip, wenn sie wählen, wie viele Chips gezeigt werden.
- Bewusst unangetastet: ToolRows graue gepunktete Datei-Links und die graue „Im Ordner anzeigen"-Aktion (sie erhält den Ordner-Glyph, behält aber ihren grauen Stil).
- Im selben Durchgang zog der Inline-Code-Chip-Ton von `neutral-bluish-100` zu `neutral-50` (dark: `neutral-800`) um und erhielt eine 0.5px-l1-Border.

Abdeckung: eine LinkIcon-Unit-Spec (ein distinkter Glyph pro Art, Klassifikationstabelle), aktualisierte markdown-dom-Fixtures und das `clickable-links-gallery`-Web-e2e — eine settled keyless Runde, die jede klickbare Link-Form rendert — registriert im Host-Compiler-Face (`tsconfig.host.json`) wie seine anderen Scaffold-importierenden Geschwister.

## Erwogene Alternativen

- **Farbige Word/Excel/PPT/PDF-Link-Glyphen.** Verworfen: Feste Brand-Fills brechen die currentColor-only-Regel des Icon-Sets, also falten diese Erweiterungen in den einzelnen Outline-`document`-Glyph. Das größere File-Card-Primitive verwendet stattdessen distinkte current-color-Silhouetten.
- **Link-Icons pro Erweiterung.** Auf sechs Kategorien kollabiert: Mehr Glyphen, als das Auge bei 14px auflösen kann, fügen Rauschen hinzu. Das 28px-`FileTypeIcon` besitzt die detaillierteren Datei-Identitäten, und per-site Favicons bleiben später hinter derselben `url`-Kategorie möglich.
- **Links auf `state-business-primary` belassen.** Dunklere Link-Blautöne (blue-600/650/700 wurden anprobiert und zurückgenommen) hätten Fokusringe und Statuspunkte mitgezogen; der dedizierte Alias lokalisiert künftiges Tuning auf eine Zeile.
- **Glyphen auf ToolRow-Pfad-Links.** Verworfen: Tool-Rows behalten ihre ruhigere graue gepunktete Affordanz, und führende Glyphen würden dort in bereits dichten Zeilen Icons stapeln.

## Konsequenzen

- Eine neue klickbare Artifact-Oberfläche sollte `--dsw-alias-link` und das LinkIcon-Vokabular konsumieren, statt eine weitere Farbe oder Unterstreichungsform einzuführen; die Regel lebt in [docs/web-styling.md](../../../../docs/web-styling.de.md).
- Lange Produktions-Dateinamen nehmen ihre natürliche Breite; wenn eine Zeile überläuft, schrumpft flex alle Chips proportional, sodass mehrere lange Namen gemeinsam schrumpfen, statt dass der Letzte zuerst nachgibt.
- mailto-Links teilen derzeit den `url`-Globus; eine eigene Mail-Kategorie ist bei Bedarf eine Ein-Zeilen-Ergänzung.
