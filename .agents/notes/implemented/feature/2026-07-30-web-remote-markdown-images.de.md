# Agent Note: Remote-Web-Markdown-Bilder

Status: implemented

[English](2026-07-30-web-remote-markdown-images.md) | [中文](2026-07-30-web-remote-markdown-images.zh.md) | Deutsch

## Problem

Assistant-Markdown kann Diagramme und Screenshots mit der üblichen Bild-Syntax benennen, doch der Web-Renderer ersetzt jedes Bild durch kursiven Alt-Text. Selbst absolute HTTP(S)-Ziele verlieren damit das normale Markdown-Verhalten.

## Entscheidung

`MarkdownText` rendert absolute HTTP(S)-Bildziele als lazy, responsive `<img>`-Elemente mit asynchronem Decoding und `referrerPolicy="no-referrer"`. Relative Pfade, absolute lokale Pfade, `file:`-URLs und nicht unterstützte Schemes behalten den bestehenden Alt-Text-Fallback. Rohes HTML bleibt deaktiviert, sodass ein Assistant die Markdown-Bildkomponente nicht mit einem handgeschriebenen `<img>` umgehen kann.

Die Bildkomponente nutzt die Absolute-URL-Policy des Renderers wieder, ohne Host-Proxy, Local-File-Route, Session-Abhängigkeit, Sanitizer oder Bild-Fetcher hinzuzufügen. Abgeschlossene Historie, Streaming-Ausgabe, abgebrochene Partials und jeder andere `MarkdownText`-Consumer erhalten dasselbe Verhalten.

## Erwogene Alternativen

**Alle Bilder als Alt-Text belassen.** Das hält die kleinste Netzwerkgrenze, verfehlt aber den Produktbedarf, im Netz gehostete visuelle Artefakte inline zu prüfen.

**Remote-Bilder über den Host proxien.** Ein Proxy könnte die Netzwerkadresse des Browsers vor der Bildquelle verbergen, würde aber den Host beliebige ausgehende Abrufe ausführen lassen und eine eigene Redirect-, DNS-, Größen- und Inhalts-Policy erfordern. Direktes HTTP(S)-Laden hält diese Anfrage für die Browserkontrollen sichtbar; das Weglassen des Referrers begrenzt die Preisgabe des Gesprächsurspungs.

**Lokale Pfade in derselben Änderung unterstützen.** Web-Origins können Host-Dateien nicht direkt laden. Eine sichere Umsetzung braucht eine separat geprüfte Autoritätsgrenze, daher bleiben relative Pfade, absolute lokale Pfade und `file:`-URLs deaktiviert.

**`data:`-Bilder erlauben.** Große Data-URLs duplizieren Binärinhalte in den dauerhaften Transkripttext. Die Nur-HTTP(S)-Policy deckt den aktuellen Bedarf ohne Vergrößerung der Session-Logs.

## Folgen

Assistant-Antworten zeigen Remote-Bilder während Streaming und Replay an, ohne Session-Events oder Host-Protokolle zu ändern. Remote-Origins sehen weiterhin die Bildanfrage, die Netzwerkadresse des Clients und alle Credentials, die die Browser-Policy für diesen Origin erlaubt. Lokale und nicht unterstützte Ziele bleiben inerter Alt-Text.
