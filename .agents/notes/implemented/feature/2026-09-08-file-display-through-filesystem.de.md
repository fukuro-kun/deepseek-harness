# Agent Note: Authentifizierte Dateianzeige nutzt Dateisystem-Byte-Reads wieder
[English](2026-09-08-file-display-through-filesystem.md) | [中文](2026-09-08-file-display-through-filesystem.zh.md) | Deutsch

Status: implemented


## Problem

Session-Prosa kann Screenshots in temporären Verzeichnissen oder Dateien eines entfernten Dateisystem-Providers referenzieren. Eine Host-lokale Workspace-Allowlist kann diese Pfade nicht bedienen. Eine Bildantwort ohne Byte-Limit kann außerdem den Browser ein 1-GiB-Bild herunterladen lassen, bevor er es dekodiert.

## Entscheidung

Die authentifizierte Route `/api/file` liest gewöhnliche Dateien über `ctx.fs`. Authentifizierung und die Lese-Policy des komponierten Providers regeln den Zugriff; Verzeichnis- und MIME-Allowlisten tun es nicht. Dies ersetzt die Serving-Policy aus der [Notiz zur lokalen Medienanzeige](2026-09-07-session-prose-local-media-display.de.md), die die Renderer-Zuständigkeit und ihre Begründung behält.

GET ruft das bestehende `readBytes(target, signal, maxBytes)` auf: Provider lehnen bekannte übergroße Dateien vor dem Inhalts-I/O ab und setzen das Limit während des Lesens durch. HEAD nutzt Metadaten ohne Inhaltslesevorgang. `FS_TOO_LARGE` wird zu 413. Die MIME-Auflösung liefert Antwort-Metadaten, ohne Dateiinhalte zu sniffen; unbekannte Erweiterungen verwenden `application/octet-stream`. Eine Sandbox-CSP verhindert, dass direkt geöffnetes HTML/SVG mit dem authentifizierten API-Origin ausgeführt wird.

Alle Dateien verwenden das aufgelöste `ctx.attachments.imageLimits.maxImageBytes`-Limit, normalerweise 20 MiB. Der Attachment-Service besitzt diese Deployment-Einstellung. Alle Antworten enthalten vollständige Dateien; Range wird ignoriert und keine Range-Unterstützung angekündigt.

## Erwogene Alternativen

**Workspace- und Medien-Allowlists.** Sie begrenzen, welche authentifizierten Bytes gelesen werden können, schließen aber übliche Screenshot-Orte und entfernte Dateien aus. Die gewählte Policy erlaubt jede reguläre Datei, die der komponierte Provider lesen kann.

**Eine neue Dateisystem-Byte-Stream-API.** Effiziente Auslieferung großer Dateien und Audio-/Video-Seeking erforderten Implementierungen in jedem Provider, einschließlich entfernter Range-Behandlung. Vollständige begrenzte Reads decken den aktuellen Anzeige-Scope ab, ohne diese Schnittstelle zu erweitern. Streaming und Range können ergänzt werden, wenn die Anwendungsfälle die Provider-Arbeit rechtfertigen.

**Größenprüfungen in der Route duplizieren.** GET braucht keine zusätzliche stat/read-Schleife: `readBytes` besitzt bereits Preflight-Limits, Wachstumserkennung und Abbruch. HEAD prüft die Größe separat, weil es den Body nicht lesen darf.

## Konsequenzen

Temporäre und entfernte Dateien nutzen denselben Dateisystem-Provider wie `read_image`, ohne modellzugewandte Events hinzuzufügen. Der lokale Sandbox-Provider beschränkt Mutationen und erlaubt Reads; ein authentifizierter Client hat daher weitergehenden Zugriff als registrierte Workspace-Roots. Dateien unterliegen weiterhin den Provider-Berechtigungen und den Byte-Limits der Route.

Jedes GET puffert die vollständige Datei im Host-Speicher. Audio/Video funktionieren als vollständige Antworten ohne inkrementelle Übertragung oder garantiertes Seeking. Kodierte Byte-Limits begrenzen nicht die dekodierten Pixelmaße. Fehlgeschlagene Bildladevorgänge zeigen den verfassten Alt-Text oder bei leerem Alt das ursprüngliche Ziel.

## Testing

Routen-Tests decken die Ablehnung einer sparsamen 1-GiB-Datei vor dem Inhalts-I/O, Wachstum nach dem stat, das geteilte Attachment-Byte-Limit, übliche MIME-Typen, temporäre Pfade und Symlinks, opake Remote-Ziele, Provider-Fehler, nur-Metadaten-HEAD, ignoriertes Range und Disposal ab. Browser-Erwartungen decken gerenderte Bilder, 413/404- und Korruptbild-Fallbacks sowie ein Bild außerhalb des Workspace ab. Entfernte Byte-Übertragung bleibt im Besitz der bestehenden Dateisystem-Provider-Tests.
