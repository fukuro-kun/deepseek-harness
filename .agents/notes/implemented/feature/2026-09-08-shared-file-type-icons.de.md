# Agent Note: Geteilte Dateityp-Icons

Status: implemented

[English](2026-09-08-shared-file-type-icons.md) | [中文](2026-09-08-shared-file-type-icons.zh.md) | Deutsch

## Problem

Client-Feature-Plugins können React-Komponenten nur über `@deepseek-ai/dsh-client-ui-primitives` teilen, aber Dateikarten hatten keine geteilte Dateityp-Präsentation. `LinkIcon` besaß die einzige Extension-Tabelle und faltete Pfade bewusst auf sechs Link-Kategorien, während Attachment-Karten, Anhänge gesendeter Nachrichten, Queued-Dateien und Workspace-Dateizeilen alle ein generisches Dokument-Glyph nutzten. Zwei dieser Consumer trugen zudem eigene Extension-Display-Helper. Ein präzises Datei-Icon an anderer Stelle hätte eine weitere Extension-Tabelle oder einen Runtime-Import zwischen Feature-Plugins erfordert.

## Entscheidung

`ui-primitives` besitzt eine Cordis-freie Dateiklassifikations- und Rendering-API. `fileExtension(path)` wendet die geteilte Basename- und Final-Dot-Semantik auf beide Pfadseparatoren an. `classifyFileType(path)` matcht ohne Groß-/Kleinschreibung und gibt die geschlossene `FileType`-Union zurück: die traditionellen Kategorien `code`, `excel`, `folder`, `html`, `image`, `markdown`, `other`, `pdf`, `ppt`, `video` und `word` plus die detaillierten `CodeFileType`-Kategorien, die `CodeFileIcon` rendert. Exakte Dateinamen, Dateinamen-Präfixe, Dateinamen-Suffixe, optionaler Projektkontext und Extensions laufen in dieser Reihenfolge. Der Pfadklassifikator gibt jedes Mitglied außer `folder` zurück; Caller nutzen das explizite `FileTypeIcon`-`kind`-Override, wenn sie wissen, dass ein Eintrag ein Verzeichnis ist. Unbekannte Extensions, fehlende Extensions und Trailing-Dots lösen zu `other` auf, außer dass die geteilte Tabelle benannte Dateien wie `Dockerfile`, `Makefile`, `package.json`, `.gitignore`, `README` und `CHANGELOG` erkennt.

`FileTypeIcon` akzeptiert einen Pfad, geteilte `IconProps`, das explizite `kind` und einen optionalen Projektdatei-Snapshot. Traditionelle Dateitypen rendern die gelieferten 28px-Dokument- und Ordner-Konturen als Inline-SVG. Die Vordergrundmarken von Excel, Markdown, PDF, PPT und Word skalieren auf 122 % um ihr visuelles Zentrum; die übrigen markierten traditionellen Glyphs nutzen 112 %, während Dateikörper und Knick-Ecke ihre Quellgeometrie behalten und die generische Datei keine erfundene Zentrummarke erhält. Das Blatt ist eine satte Kategoriefarbe, Vordergrundmarke und gewöhnliche Knick-Ecke sind weiß, und die generische Datei hat eine dunklere graue Ecke. CSS weist die gelieferte Kategorie-Palette über statische Design-Tokens zu: DeepSeek-Blau für Code/HTML/Markdown, das hellere DeepSeek-Blau für Word, Grün für Excel, zwei Amber-Stufen für Folder/PPT, Rot für PDF und neutrales Grau für unbekannte Dateien. Image und Video teilen sich das gelieferte Violett über eine komponentenlokale Variable, weil die Design-Plattform kein passendes Violett-Token hat. Ein Caller kann ein traditionelles Blatt über `--dsh-file-type-icon-color` überschreiben.

Erkannte Code- und Konfigurationsdateien rendern das entsprechende 20px-Quadrat-Artwork, auf die angeforderte Icon-Größe skaliert. Diese Technologie-Marken behalten ihre eingebetteten Mehrfarbfüllungen und sind die explizite Ausnahme von der gewöhnlichen Current-Color-Icon-Regel. Die Map wählt React vor TypeScript/JavaScript, Angular-Dateinamen-Suffixe vor ihrer Basis-Extension, Docker/Node/Git/Make/CMake nach Dateinamen-Regeln und Flutter nur, wenn der optionale Projekt-Snapshot ein `pubspec.yaml` enthält, dessen Text `flutter:` enthält. Markdown und SVG bleiben im Besitz der traditionellen Markdown- und Image-Kategorien. CSV und TSV nutzen das Code-Glyph in Dateikarten, Zeilen und Preview-Titeln; ihre klickbaren Links nutzen ebenfalls Code. Sowohl `.env` als auch Namen, die auf `.env` enden, nutzen das Environment-Glyph. Jedes traditionelle und Technologie-SVG ist `aria-hidden`, und die Karte, Zeile oder der Button, der die Dateiidentität besitzt, liefert den accessible name.

`LinkIcon` delegiert die Extension-Klassifikation an `classifyFileType` und faltet das detaillierte Ergebnis in sein bestehendes Link-Vokabular: Code und HTML nutzen `code`, Bilder `image`, PDF/Word/Excel/PPT `document`, und Markdown/Video/unbekannte Dateien `other`. Extensionslose Namen bleiben in Link-Kontexten `other`, sodass sich das vom [Clickable-Link-Entscheid](2026-09-04-web-clickable-link-styles.de.md) definierte 14px-Erscheinungsbild klickbarer Links nicht ändert.

Attachment-Upload-Karten, Dateikarten gesendeter Nachrichten, Queued-File-Zeilen und Workspace-Dateizeilen rendern `FileTypeIcon`. Der Files-Tab-Titel rendert sein explizites `folder`-`kind` bei 16px. Explizite Delivery-Karten nutzen ebenfalls `FileTypeIcon` bei 28px und `fileExtension` für ihre Fallback-Metadaten. Die zwei Metadatenzeilen nutzen `fileExtension` statt lokaler Parser; ein Basename mit führendem Punkt wie `.env` zeigt daher `ENV`, während ein fehlendes oder Trailing-Suffix kein Extension-Label anzeigt. Bildinhalte rendern weiterhin als Vorschau statt als Dateityp-Glyph, und Produced-File-Links sowie Markdown-Datei-Mentions nutzen weiterhin `LinkIcon`, weil sie Link-Flächen sind.

## Erwogene Alternativen

**`LinkIcon` für jede Dateifläche verwenden.** Abgelehnt. Seine sechs Kategorien und 14px-Outline-Zeichnungen kommunizieren Link-Ziele in Textgröße; eine 28px-Dateikarte hat Platz für die gelieferten HTML-, Markdown-, PDF-, Word-, Excel-, PPT- und Video-Identitäten.

**Eine zweite Extension-Tabelle neben `LinkIcon` behalten.** Abgelehnt. Derselbe Pfad könnte mit dem Wachsen einer der beiden Listen in unterschiedliche Kategorien driften. Eine detaillierte Tabelle plus ein expliziter Detailed-to-Link-Adapter bewahrt die Semantik beider Consumer.

**Die gelieferten Traditional-File-Farben direkt in jeden SVG-Pfad schreiben.** Abgelehnt. Traditionelle SVG-Geometrie bleibt wiederverwendbar und folgt der `currentColor`-Regel des Icon-Sets; das Komponenten-Stylesheet besitzt die Default-Kategoriepalette, und Render-Sites behalten ein CSS-Variablen-Override statt Pfad-Fills umzuschreiben. Das Technologie-Artwork ist ausgenommen, weil seine eingebetteten Mehrfarbmarken die Sprache oder das Tool identifizieren statt eine generische Datei-Silhouette zu dekorieren.

**Archive-, Audio- und Data-Kategorien aus Symmetriegründen hinzufügen.** Abgelehnt. Weder das gelieferte Artwork noch die aktuellen Consumer benötigen solche Glyphs. Neue `FileType`-Mitglieder erfordern eine ausgelieferte Render-Site und Artwork, das auf dem 28px-Platz lesbar bleibt.

## Tests

Die `ui-primitives`-Specs decken case-insensitive Suffixe, beide Pfadseparatoren, Leading-Dot-Dateien, fehlende und Trailing-Suffixe, verbreitete benannte Dateien, den Unknown-Fallback, alle detaillierten Code-Mappings, Regelpriorität, Flutter-Kontext, jedes gelieferte Technologie-SVG, instanzsichere Gradient-ids, `aria-hidden`, Sizing/Class-Forwarding, unterscheidbare Artworks, die 112%- und 122%-Vordergrundmarken-Transforms sowie die traditionellen Solid-Sheet/Contrast-Mark-Layer ohne literale SVG-Farben ab. Ein Stylesheet-Spec pinnt jedes traditionelle Kategorie-zu-Farbe-Mapping, das Caller-Override und den lokalen Violett-Wert. Die bestehende `LinkIcon`-Klassifikationstabelle pinnt ihre grobe Ausgabe, einschließlich `Makefile`, das `other` bleibt. Attachment-, Chat-, Queue- und Sidebar-Komponenten-Suites üben die migrierten Render-Pfade; ihre Accessibility-Ausgabe ändert sich nicht, weil die Glyphs dekorativ bleiben.

## Konsequenzen

- Client-Packages nutzen einen Dateinamen-Parser und eine detaillierte Dateityp-Tabelle statt feature-lokale Logik zu importieren oder nachzubauen.
- Ein neuer Suffix kommt nur dann in die detaillierte Tabelle, wenn ein bestehendes Glyph ihn wahrheitsgemäß darstellt. Weicht seine Link-Kategorie vom aktuellen Adapter ab, muss die Änderung auch entscheiden, ob sich das 14px-Link-Erscheinungsbild ändert.
- Code- und Konfigurations-Artwork bewahrt seine eingebettete Palette und akzeptiert das traditionelle `--dsh-file-type-icon-color`-Override nicht.
- Das Primitive besitzt keinen Text, aber die Default-Dateityp-Palette. Consumer besitzen weiterhin Accessible-Labels und umliegenden Text und können die Kategoriefarbe über `--dsh-file-type-icon-color` ersetzen.
- Die detaillierten Kategorienamen beschreiben Präsentation, nicht MIME-Validierung. Ein Suffix ist ein Anzeigehinweis und belegt weder Dateiinhalt noch Vertrauenswürdigkeit.
