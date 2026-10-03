# Agent Note: Dokumentenvorschau und Dateiadressen
[English](2026-09-08-document-preview-operations.md) | [中文](2026-09-08-document-preview-operations.zh.md) | Deutsch

Status: implemented


## Problem

Datei-Viewer benötigen unterschiedliche Lade-Policies und können mehrere Implementierungen für eine Erweiterung anbieten. Ein Change-Stream kann nicht zugleich einen On-Demand-Read ausdrücken, ohne Live-Daten mit aufrufbaren Fähigkeiten zu mischen. HTML-Abhängigkeiten benötigen zusätzlich die Dateisystem-Autorisierung und Pfadauflösung des Host, nicht das aktuelle Verzeichnis des Browsers.

## Entscheidung

Document Preview trennt Resource-Beobachtung von Inhalts-Reads. Das [Resource-Modell](2026-09-05-client-resource-model.de.md) teilt Beobachtungen allein über die Adresse: `source(address)`, `pin(address, signal)` und Provider-`open(address, { signal })` tragen keine konsumierende Session. Provider geben `AsyncIterable<RemoteResult<ResourceProtocolMap[P]>>` zurück; `useResource` exponiert nur `{ status, value, failure }`. Holds starten und stoppen die Beobachtung, nicht die zugrunde liegende Datei oder Session. Inhalts-Reads nutzen gewöhnliche injizierte Preview-Callbacks.

[Workspace Files](../../../../packages/api/workspace-files/README.de.md) behält Host-Zeilen-Reads, Byte-Fenster, begrenzte vollständige Reads und begrenzte Reads relativ zum Verzeichnis einer anderen Datei. Sein Client-Provider `file` beobachtet nur `stat` und `changes`, wobei `ResourceProtocolMap.file` direkt `WorkspaceFileStat` benennt. Der Host löst jeden Pfad über das Session-Dateisystem auf; Datei-Reads erben die Read-Authority dieses Backend, während Verzeichnis-Listing und Change-Beobachtung workspace-begrenzt bleiben.

Lesbare Dateien nutzen `dsh-resource://file/session/<sessionId>/<path>`. Der Pfad darf workspace-relativ oder absolut sein; ein kodierter absoluter Pfad behält seinen führenden Schrägstrich. `fileAddressFor` emittiert stets diese Session-Adressform. Der Provider und die Preview-RPC entnehmen die Session nur dieser Adresse, niemals der aktuellen Auswahl, dem ersten Holder oder dem besitzenden Tab. Eine Session-lose `absolute`-URI kann nicht gelesen werden; der Provider meldet `workspace-file/unknown-workspace`. Die Session-Autorisierung ist eine Regel des Datei-Protokolls, keine zusätzliche Resource-Identität.

[Document Preview](../../../../packages/client/ui-sidebar-documentpreview/README.de.md) besitzt Formatauswahl und Lade-Policy. Metadaten registrieren sich bei `ctx.documentPreviews`; Komponenten registrieren sich separat in den gekennzeichneten `sidebar.right.tab.document`-Slot. Erweiterungs-Registrierungen gehen Builtins voran, dann entscheiden längere Suffixe und Registrierungsreihenfolge. Die Toolbar listet passende Alternativen und merkt sich eine manuelle Wahl pro Tab; Plaintext ist der Fallback. Das Child erhält akkumulierten Text oder vollständige native Bytes, die ursprüngliche Resource-Adresse und die Standard-Hooks `useResource` und `useTabInfo`. Preview ruft die vorhandenen `read`, `readAll` und `readRelated` über gewöhnliche Injection auf und dekodiert Bytes in seinem eigenen `rpc.ts`. Refresh bleibt pro Tab, ohne Resource-Reload, gemeinsames `changed`-Acknowledgement, zusätzlichen Resource-Wrapper oder Content-Session.

Markdown und Code nutzen die inkrementellen Primitives mit kumulativem seitenweisem Text wieder. HTML, PDF und Bilder lesen vollständige `Uint8Array<ArrayBuffer>`-Daten; der Host-Transport bleibt base64. Veröffentlichte Buffer sind read-only geliehen und persistieren niemals in Layout- oder Session-JSON. PDF.js läuft in einem eigenen Worker mit versionsgleichen gebündelten Font- und Decoder-Daten und kopiert die Eingabe vor dem Transfer, um den von Preview gehaltenen Buffer zu erhalten. HTML läuft in einem Blob-iframe mit `sandbox="allow-scripts"`, ohne Same-Origin-, Popup-, Formular-, Download- oder Top-Navigation-Privilegien. Der Browser behält seine normalen External-Network-Regeln. Begrenzte statische lokale JS-/CSS-Reads bleiben im Parent; der opaque Frame erzeugt seine eigenen Asset-Blobs, weil er Blobs des Parent-Origin nicht laden kann. PNG, JPEG, GIF, WebP, BMP, ICO und SVG nutzen bildspezifische Blob-URLs in einem `<img>`-Static-Image-Kontext. Sie behalten intrinsische CSS-Pixel-Dimensionen; Auto-Margins zentrieren Bilder, die kleiner als der gemeinsame Scroller sind, während größere Dimensionen dessen horizontalen oder vertikalen Scrollbereich erweitern. Der Renderer bietet kein Zoom und kein Drag-to-Pan. SVG-Markup gelangt niemals in das Anwendungs-DOM oder ein iframe, sodass Scripts inert bleiben und die Parent-Seite nicht erreichen können. Das Ersetzen von HTML oder eines Bildes widerruft dessen Root-Blob-URL.

## Betrachtete Alternativen

**Methoden an einem Iterator oder seinen Werten.** Das vermengt Beobachtung mit Kommandos und wiederholt die Fähigkeits-Identität in Daten-Frames. Frames tragen Daten und Fehler; explizite Preview-RPC-Callbacks führen Reads aus.

**Eine Core-Public-Projection-Factory oder dieselbe Assembly innerhalb von `open`.** Getrennte Stream-Werte, Operations-Bundles und öffentliche Interfaces fügen Assembly hinzu, ohne einen weiteren aktuellen Consumer, der sie benötigt. Der geteilte RPC-Adapter von Preview hält Session-Dekodierung und base64 bereits aus den Renderern heraus. Resource bietet weder ein provider-agnostisches Kommando-Interface noch eine ans Öffnen gebundene Kommando-Lebensdauer; beides hinzuzufügen erfordert Consumer-Evidenz jenseits der Dateivorschau.

**UI-Session als zusätzliche Resource-Identität oder Autorisierung vom ersten Holder oder der aktuellen Auswahl.** Ein gehaltener Tab kann zu einer anderen Session gehören als der ausgewählten, und die UI-Position identifiziert die adressierte Datei nicht. Das Kodieren der benötigten Session in der Dateiadresse erhält die Host-Autorisierung und lässt zugleich alle Leser einer Adresse die Beobachtung teilen.

**Datei-Lese-Methoden auf jeder Resource.** Chat- und Terminal-Resources haben unabhängige Daten- und Operations-Semantik; nur Beobachtungs-Registrierung und -Lebensdauer sind gemeinsam.

**Ein Preview-Resource-Wrapper, eine Content-Session oder ein zweiter Resource-Hook.** Diese duplizieren Adressierung, Cancellation, Subscriptions und Ownership, die Resource und Workspace Files bereits bereitstellen. Die Lade-Policy gehört dem Preview-Eigentümer.

**Ein lokaler Server, ein virtueller Host oder ein `file:`-iframe.** Diese erfordern zusätzliches Hosting oder Dateisystem-Authority. Die Vorschau ist für statische generierte Seiten gedacht, nicht für eine vollständige Anwendungs-Runtime; Module, dynamische Dateisystem-Anfragen und beliebige verschachtelte Asset-Graphen liegen außerhalb ihres Supports.

**SVG in das Anwendungs-DOM oder ein iframe sanitisieren.** Ein Sanitizer würde einen zweiten SVG-Parser und eine evolvierende Active-Content-Policy hinzufügen, bevor nicht vertrauenswürdiges Markup in einem interaktiven Dokument platziert wird. Der `<img>`-Static-Image-Kontext erhält natives SVG-Rendering und intrinsische Dimensionen, ohne dem Markup ein skriptfähiges DOM zu geben.

## Konsequenzen

Renderer können ersetzt werden, ohne das Tab- oder Datei-Protokoll zu ändern. Vollformats zahlen begrenzten Ganzdatei-Speicher, und PDF fügt gebündelte Worker-/Font-/Decoder-Bytes hinzu. Formatauswahl und View-Zustand sind seitenlokal, keine durable Session-Daten. Preview besitzt RPC-Cancellation und native Buffer unabhängig von der Metadaten-Beobachtung. Ein Tab behält seine gelesene Version und die beim Beginn des Reads erfasste Beobachtungsversion; sein Refresh verwirft weder den Inhalt eines anderen Tabs noch löscht es dessen Change-Notice. Datei-Reads bleiben nicht-transaktional, und opaque Versionen werden auf Gleichheit verglichen, nicht auf Reihenfolge. Das [aufgezeichnete Browser-Szenario](../../../../apps/web/tests/document-preview.e2e.ts) prüft die gemeinsame Toolbar, inkrementellen Text, isolierte HTML-Abhängigkeiten, intrinsisches Raster- und SVG-Rendering mit Zwei-Achsen-Scrolling, inerte SVG-Scripts und lazy kontinuierliches PDF-Worker-Rendering.
