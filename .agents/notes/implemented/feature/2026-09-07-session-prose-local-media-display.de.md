# Agent Note: Lokale Medienpfade in Session-Prosa werden über eine Same-Origin-Dateiroute angezeigt

Status: implemented

[English](2026-09-07-session-prose-local-media-display.md) | [中文](2026-09-07-session-prose-local-media-display.zh.md) | Deutsch

## Problem

Assistant-Prosa kann ein Bild über seinen Dateisystempfad referenzieren, aber Browser können keine Host-Dateien lesen. Ein Renderer, der auf absolute HTTP(S)-Ziele beschränkt ist, lässt diese Referenzen als inerten Alt-Text zurück. Issue #3662 dokumentiert diese Anzeigelücke.

## Entscheidung

Lokale Medienpfade in Session-Prosa rendern über eine Same-Origin-Dateiroute. Dieses Note besitzt das Renderer-Vokabular und seine Platzierung; [authentifizierte Filesystem-Reads](2026-09-08-file-display-through-filesystem.de.md) besitzen die aktuelle Serving-Policy und ersetzen die unten beschriebenen Workspace-/Medien-Beschränkungen.

`ui-primitives` besitzt das `MarkdownPathImages`-Vokabular auf `MarkdownText`. Wie `fileMentions` greift es erst, nachdem eine Nachricht settled ist, damit eingefrorene Streaming-Blöcke keinen Vokabular-Handler cachen können. Der Settled-Pass schreibt Bildziele außerhalb der Remote-URL-Allowlist um und emittiert nur absolute `http(s)`-, `blob`- oder `data`-Ergebnisse. Ohne Vokabular behalten lokale Ziele inerten Alt-Text. Fehlgeschlagene Loads ersetzen das Bild durch den verfassten Alt-Text oder — bei leerem Alt — durch sein ursprüngliches Ziel; eine andere Quelle kann erneut laden.

`ui-chat` liefert ein seitenstabiles `localPathMediaUrl`-Vokabular über `AssistantMarkdown`. Es bildet absolute POSIX-Pfade auf `/api/file?path=…` auf dem Origin der Seite ab. Relative und protokoll-relative Pfade, Pfade im Windows-Stil sowie Nicht-HTTP-Seitentransporte wie Electron `file://` bleiben inert.

`session-controller` besitzt den `SessionMediaReferences`-Beitrag neben `SessionFileReferences`. Er registriert sich über `connection.fetch`, das dieselben Browser-Authentifizierungs- und Vertrauensprüfungen wie `/api`-RPC anwendet. Der feste Same-Origin-Endpoint gibt dem synchronen Renderer eine stabile URL ohne asynchrone Capability-Aushandlung.

## Erwogene Alternativen

**Ownership durch Typert-Gateway oder Workspace-Controller.** Das Gateway besitzt Remote-RPC-Dispatch, der Workspace-Controller den Registry-Lifecycle. Keines besitzt Datei-Byte-Präsentation; Session Controller ist der Consumer, der Session-Prosa ausliefert.

**Session-RPC gefolgt von blob/data-URLs.** Attachment-Bilder können einen asynchronen Fetch nutzen, aber dieses Markdown-Vokabular muss ein Ziel während eines memoized Render-Passes synchron auflösen.

**Nur-Bilder-Endpoints.** Eine Dateiroute kann Bilder, Audio und Video ohne separate URL-Vokabulare ausliefern. Die aktuelle Implementierung liefert vollständige bounded Dateien; Markdown-Audio/Video-Player-Nodes bleiben eigenständige Arbeit.

**Byte-Signatur-Validierung in der Route.** Das modellzugewandte `read_image`-Tool besitzt die Bild-Zulassungsprüfungen. Display-Antworten beschreiben Inhalt per MIME-Lookup und lassen die Browser-Dekodierung korrupte Payloads ablehnen — ein doppelter Signatur-Checker entfällt.

**Nur-Workspace/Medien-Zugriff (ersetzt).** Die ursprüngliche Policy beschränkte kanonische Pfade auf registrierte Workspace-Roots und erlaubte die MIME-Kategorien image/video/audio außer SVG. Regular-File-Checks vor dem Öffnen wiesen Pipes und Devices zurück; ein Identity-Vergleich des geöffneten Handles verengte Replacement-Races. Diese Beschränkungen begrenzten den authentifizierten Zugriff und vermieden einen interaktiven Autorisierungsfluss pro Request. Sie schlossen aber auch temporäre Screenshots und Remote-Dateien aus; das Nachfolge-Note hält die Ersatz-Policy fest und warum diese Beschränkungen nicht beibehalten werden.

## Konsequenzen

Das Client-Vokabular kann weder Host-Authentifizierung noch den Filesystem-Provider umgehen. Die ursprüngliche eingeschränkte Route unterschied einen existierenden Pfad außerhalb des Workspace von einem fehlenden Pfad und legte so Existenz offen, selbst während sie die Bytes verweigerte; die Nachfolge-Policy erlaubt stattdessen gewöhnliche provider-lesbare Dateien.

Pfade im Windows-Stil bleiben vom Client-Vokabular ununterstützt. Trajectory- und Tool-Card-Markdown-Consumer liefern dieses Vokabular nicht, und Audio/Video-Markdown-Nodes rendern keine Player. Das sind Renderer-Beschränkungen, unabhängig von den lesbaren MIME-Typen der Dateiroute.

Das archivierte [modelllesbare Bildpfade](../../archived/feature/2026-08-21-model-readable-image-paths.md)-Note besitzt das modellzugewandte Verhalten; dieses Note besitzt die nutzerzugewandte Anzeige und ersetzt es nicht.

## Tests

Renderer-Tests decken Settled- und Streaming-Gates, Referenz-Stil-Bilder, Protokoll-Nachprüfungen, Failed-Load-Fallback und Ersatzquellen ab. Chat-Tests decken Vokabular und Komponentenverdrahtung ab. Das Browser-Szenario in `apps/web/tests/markdown-images.e2e.ts` bootet die ausgelieferte Web-Komposition mit einer geseedeten Session und prüft tatsächliches Laden und Fallback-Text. Ein modellgetriebener recorded-Session-Roundtrip bleibt von dieser UI-Erwartung getrennt; das Nachfolge-Note benennt die aktuelle Route-Coverage.
