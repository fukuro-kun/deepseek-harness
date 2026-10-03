---
description: "Dokumentvorschauen in der rechten Sidebar: gemeinsames Dateiladen und Bedienelemente, auswählbare Markdown-, Code-, Bild-, PDF- und HTML-Renderer sowie Plaintext-Fallback; bearbeitbare Text- und Code-Dateien öffnen direkt in einen Puffer, der Plattenänderungen live folgt und unter einem Versionswächter zurückschreibt."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-documentpreview

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Lesbare Dateien in der rechten Sidebar anzeigen und zwischen registrierten Renderern wechseln, ohne einen weiteren Tab zu öffnen. Markdown und Code erhalten kumulierte Textseiten; PDF, HTML und gängige Bilder erhalten vollständige Bytes; unbekannte Dateierweiterungen verwenden Plaintext. Der Tab besitzt Laden, Dateistatus, Renderer-Auswahl, Zeilenumbruch, Neu laden und — für Textviewer, die sich anmelden — einen editierbaren Puffer, der Plattenänderungen live verfolgt und unter einem Versionswächter zurückschreibt. Dokumentkörper registrieren sich über dieselbe Metadaten-Registry und denselben Child-Slot. Der Sidebar-Tab-Kind ist `text`.

## Inhaltsverzeichnis

- [Was registriert wird](#what-it-registers)
- [Adressen](#addresses)
- [Wie gelesen wird](#how-it-reads)
- [Bearbeiten](#editing)
- [Navigation](#navigation)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="what-it-registers"></a>
## Was registriert wird

- **Der Typ** — `ctx.sidebarRightTabs.register(...)` mit der id `@deepseek-ai/dsh-client-ui-sidebar-documentpreview` (die Identität dieser Implementierung im Tab-System und der Schlüssel, unter dem sich ihr Körper registriert), kind `text`, pattern `dsh-resource://file/**`, Band `fallback`. `canOpen` akzeptiert nur Session-Adressen, deren Pfade relativ oder absolut sein dürfen; nackte `absolute`-Adressen werden nicht beansprucht. Ein Typ, der auf dem Band `extension` oder `builtin` für ein engeres Muster (etwa `*.png`) registriert ist, übernimmt diese Adressen; andere unterstützte Dateien landen hier. Die gesamte Adresse ist die Inhaltsidentität, daher sind zwei Dateien gleichen Namens in verschiedenen Verzeichnissen oder ein Pfad unter zwei Sessions zwei Tabs; der dekodierte Basename ist der Tab-Titel, und der keyed-Slot `sidebar.right.pane.tab.title` platziert sein erweiterungsspezifisches `FileTypeIcon` vor diesem Titel.
- **Der Körper** — der keyed-Slot `sidebar.right.pane.tab` unter der id des Typs. Sein fester Kopf zeigt den absoluten Host-Pfad, wenn verfügbar, sonst den angeforderten Pfad; Verzeichnisse verwenden die tertiäre, der Name die primäre Labelfarbe, und ein abgeschnittener Pfad behält sein letztes Segment bei und blendet zu ihm hin aus, während sein Tooltip den vollständigen Wert zeigt. Ein Dropdown wählt zwischen passenden Renderern und Plaintext. Ein Umbruchschalter erscheint nur, wenn der gewählte Renderer `wrap: true` deklariert; sein Symbol beschreibt den Modus, den der Klick auswählt, und die pro-Tab-Präferenz beginnt eingeschaltet. Neu laden bleibt in diesem Kopf, nicht in der Tab-Leiste der Sidebar. Der Körper reicht an jede Pane-Kante; jeder Renderer besitzt seinen eigenen Inhaltseinstand und darf einen inneren Scrollport besitzen. Dies unterscheidet sich bewusst vom 2px-Scrollbar-Versatz des Files-Tabs: Vorschauen behalten die volle Pane-Breite, damit kantenfüllende HTML- und Code-Scrollports an der Pane-Kante enden.
- **Geteilter Lade- und Ansichtszustand**, session-scoped und nach Tab-id gebucktet. Der Store hält kumulierte Seiten oder vollständige Bytes, gelesene und beobachtete Versionen, Lade-/Fehlerzustand, Renderer-Wahl, Scroll-Offset, Umbruch, die beantwortete Navigations-Revision sowie Draft- und Konfliktzustand einer offenen Edit-Session. Das normale inject-Face ruft Remote-Reader auf und schreibt über deklarierte Store-Actions. Reloads und Wechsel des Lademodus verwerfen ältere Anfragen; das Abort-Signal des Tabs vergisst seinen Zustand.

Dokumentimplementierungen registrieren Metadaten mit `ctx.documentPreviews.register({ id, extensions, priority, title, loading, wrap?, editable? })` und einen Körper unter derselben `id` im keyed, Session-scoped Child-Slot `sidebar.right.tab.document`. Beide Registrierungen gehören Effects, und der Child-Slot wird über `ctx.slots.inject` abgewartet. Körper erhalten `resourceAddress`, vorbereiteten `content`, `wrap`, `scrollportRef` und die Standard-Hooks `useTabInfo`/`useResource`; sie erhalten keinen eigenen Resource-Loader. Ein Renderer, der ein inneres Scrollelement besitzt, hängt `scrollportRef` daran, und der Owner kehrt zum geteilten Körper zurück, sobald dieses Element unmounted. Metadaten deklarieren `loading: 'text-pages'` oder `'bytes-complete'`. Die Registry behält alle passenden Alternativen: `extension` (der Standard) rangiert über `builtin`, dann rangieren längere Suffixe zuerst, dann die Registrierungsreihenfolge. Das Dropdown bewahrt eine gewählte Implementierung, solange sie verfügbar bleibt; ihre Entfernung wählt den nächsten Kandidaten. Eingebaute Körper nutzen dieselben Registrierungen.

<a id="addresses"></a>
## Adressen

Ein Tab verwendet die von `fileAddressFor` gebaute Session-Adresse mit relativem oder absolutem Pfad. `hostFileOf(address)` nimmt die Session nur aus dieser Adresse, ohne externes Session-Argument; weder die aktuelle noch die Tab-Session wird entlehnt. Der Host löst Datei- und zugehörige Pfade über das Session-Dateisystem auf, dessen Backend die Leseberechtigung kontrolliert. Metadaten für dieselbe vollständige Adresse werden von jeder UI geteilt, einschließlich Global-Komponenten. Das [Workspace-Files-README](../../api/workspace-files/README.de.md) besitzt diese Regeln; die Renderer-Auswahl ändert die Navigationsadresse nicht.

<a id="how-it-reads"></a>
## Wie gelesen wird

Der Körper liest seinen Datensatz, Navigation und Lebenszeit über `useTabInfo().tab`. `useResource<'file'>(tab.contentId)` liefert Metadaten; normale inject-Callbacks liefern Inhaltslesungen:

- Der Resource-Snapshot enthält nur `status`, `value` und `failure`; `value` sind `WorkspaceFileStat`-Metadaten. Inhaltslesungen warten nicht auf den ersten Metadaten-Frame, sobald der Provider verfügbar ist. Ein Beobachtungsfehler zeigt eine Leiste über dem geladenen Inhalt; eine neuere gemeldete Version gilt sofort — die Vorschau liest neu und ein offener Puffer folgt.
- **Textseiten** — Plaintext, Markdown und Code lesen über einen inject-Callback auf `remote.workspaceFiles.read(sessionId, path, { offset }, signal)`. Der erste Mount liest Seite eins; Scrollen ans Körperende oder **Load more** fordert die nächste Seite bis `eof`. Der Owner liefert das kumulierte Präfix als `{ kind: 'text', text, pages, eof }` einschließlich Quell-Offsets und Zeilenzahlen. Markdown und Code rendern dieses Präfix inkrementell; sie rendern nicht jede Seite als eigenes Dokument. Eine neuere Versionsseite hinter Seite eins startet von vorn, statt Versionen zu mischen. Ein Fehler vor jedem Inhalt füllt den Körper mit Dateityp-Icon, Erklärung und Wiederholen; ein späterer Fehler behält geladenen Inhalt und fügt das Wiederholen darunter an.
- **Vollständige Bytes** — PDF, HTML und gängige Bilder verwenden einen inject-Callback auf `remote.workspaceFiles.readAll(sessionId, path, signal)`. `rpc.ts` dekodiert das Wire-Base64 zu `data: Uint8Array<ArrayBuffer>` für `{ kind: 'bytes', data }`. Das `maxFileBytes`-Limit des Hosts lehnt zu große Dateien ab, statt sie abzuschneiden. PDF kopiert gehaltene Bytes vor der Worker-Übergabe, damit der Vorschau-Puffer nutzbar bleibt. Bytes bleiben im transienten Ansichtszustand, niemals in persistierten Layouts oder Session-JSONL. Wechsel des Lademodus verwerfen frühere Ergebnisse.
- **Neu laden** — nur der aktuelle Vorschau-Tab liest über seine Remote-Callbacks neu, bewahrt seine Scroll-Präferenz und verwirft ältere Anfragen. Die Änderungsverfolgung reagiert nur auf eine Metadaten-Version, die der Tab noch nicht übernommen hat: eine bereits beobachtete Version oder eine, die der eigene Schreibvorgang des Tabs erzeugt hat, gilt nicht als neue Änderung. Lesevorgänge aktualisieren weder geteilte Metadaten noch erzwingen sie den Zustand eines anderen Tabs.

HTML füllt den Körper Kante an Kante in einem Blob-iframe mit exakt `sandbox="allow-scripts"`, ohne `allow-same-origin`; Skripte können weder auf den Origin der Elternanwendung noch auf den File-Reader zugreifen. Der Renderer lädt direkt deklarierte relative `.js`-Classic-Skripte und `.css`-Stylesheets über seinen normalen inject-Callback auf `remote.workspaceFiles.readRelated`, mit festen Sicherheitsgrenzen von 4 MiB pro Asset, 32 MiB insgesamt und 64 verschiedenen Assets. Host-Code löst den zugehörigen Pfad auf; `rpc.ts` dekodiert die zurückgegebenen Bytes. Innerhalb des Renderers dient Base64 nur dazu, die iframe-Bootstrap-Payload in Skripttext einzubetten. Ein `<base href>` überlässt die Abhängigkeitsauflösung dem Browser, ebenso HTTPS-Ressourcen. Lokale Modul-Imports, CSS `url()`/`@import` und dynamisches `fetch` nutzen keinen Host-Dateizugriff. Lesefehler, ungültiges UTF-8 oder überschrittene Limits lassen die Vorschau fehlschlagen, statt ein teilweises Asset-Paket zu veröffentlichen. Das Ersetzen oder Unmounten des Dokuments gibt seine Blob-URL frei.

PNG, JPEG, GIF, WebP, BMP, ICO und SVG rendern über Blob-URLs in einem `<img>`-Kontext für statische Bilder. Das Bild behält seine intrinsischen CSS-Pixel-Maße; ein kleineres Bild zentriert sich im geteilten Scroller, größere Maße scrollen auf beiden Achsen. Der Renderer bietet weder Zoom noch Drag-to-Pan. SVG-Markup gelangt niemals in das Anwendungs-DOM oder einen iframe, sodass seine Skripte weder ausgeführt werden noch die Elternseite erreichen können. Das Ersetzen oder Unmounten des Bildes widerruft seine Blob-URL.

Geteilte Texte kommen aus `sidebarDocumentPreview`; jeder eingebaute Renderer besitzt seine lokalisierten Labels.

Erste Lesevorgänge, weitere Seiten und die HTML/PDF/Bild-Vorbereitung teilen einen Ladeindikator, der Reduced-Motion-Präferenzen respektiert. Geladene Seiten bleiben sichtbar, während eine weitere Seite lädt. PDF-Seiten bilden eine vertikale, breitenangepasste Sequenz und rendern lazy nahe dem Viewport. Code-Vorschauen zeigen standardmäßig Quellzeilennummern, ohne sie in kopierten Text aufzunehmen; Plaintext verwendet dieselbe Schriftgröße und Zeilenhöhe wie Code. Code liegt auf dem eigenen Hintergrund der Pane statt auf der Füllung der Chat-Karte; seine Leiste liegt an einem inneren Scrollport voller Höhe an, sodass beide Scrollbars unterhalb des Kopier-Controls beginnen.

<a id="editing"></a>
## Bearbeiten

Renderer, die `editable: true` in ihren Metadaten deklarieren — die eingebauten Plaintext- und Code-Viewer —, stellen die Datei selbst als Editierfläche dar; es gibt keinen Modus, den man betreten muss. Bearbeiten braucht die vollständige Datei, daher dürfen sich nur `text-pages`-Renderer anmelden; Markdown und jeder `bytes-complete`-Renderer bleiben schreibgeschützt. Das Öffnen des Tabs liest die ganze Datei über `readAll`, dekodiert sie als UTF-8 und rüstet einen Draft pro Tab im geteilten Store; der Puffer überlebt das Unmounten des Körpers wie der übrige Ansichtszustand. Eine Datei, die sich nicht zum Bearbeiten öffnen lässt — fehlgeschlagener Lesevorgang, Nicht-UTF-8-Bytes oder NULs — fällt auf die paged preview zurück, bis ein Reload es erneut versucht. Der Editor legt eine Textarea über das hervorgehobene Underlay des Code-Viewers (Plaintext verwendet stattdessen einen unsichtbaren Sizer), und das Zurücksetzen eines geänderten Puffers fragt einmal, bevor verworfen wird.

Eine Version, die der Host meldet, während der Puffer sauber ist, wird sofort übernommen — die Fläche folgt der Datei. Solange der Draft dirty ist, behält der Puffer den Text des Nutzers und meldet, dass sich die Platte bewegt hat; der bewachte Schreibvorgang löst die Differenz, statt die Bearbeitung zu überschreiben. Eine Aktualisierung, die fehlschlägt, Nicht-Text findet oder mitten im Flug durch Speichern oder Neueröffnen verworfen wird, zeichnet die gemeldete Version trotzdem auf, sodass der Puffer dem Leser weiterhin meldet, hinter der Datei zu liegen.

Speichern ruft `remote.workspaceFiles.write` mit dem Draft und der Basisversion als `expectedVersion` auf. Eine `workspace-file/stale-version`-Ablehnung liest die Datei neu und öffnet den Konfliktlöser: ein zeilengranularer Diff zwischen dem Draft (`mine`) und dem frischen Platteninhalt (`theirs`), bei dem jeder Hunk eine Seite behält und das gemergte Ergebnis den Schreibvorgang unter der frischen Version wiederholt. Andere Schreibfehler landen als Fehlerzeile auf der Edit-Session. Ein erfolgreicher Schreibvorgang rebasiert die Session auf den geschriebenen Text unter der Post-Write-Version, sodass die Fläche weiterhin das bearbeitet, was tatsächlich gelandet ist, und das eigene Change-Feed-Echo des Schreibvorgangs nicht als externe Änderung gilt.

<a id="navigation"></a>
## Navigation

`ctx.sidebarRight.openResource(address, { params: { line } })` trägt eine 1-basierte Quellzeile durch die `file`-Parameter. Im `text-pages`-Modus lädt der Owner sequentielle Seiten bis zu dieser Zeile oder EOF. Plaintext- und Code-Renderer bieten Quellzeilen-Anker; Markdown nicht. Eine Navigation bleibt ausstehend, solange ihr gewählter Renderer keinen Anker hat, und läuft, wenn der Nutzer zu Plaintext oder Code wechselt. Code-Navigation scrollt den inneren Quell-Viewport direkt. Byte-Modus-Renderer konsumieren keine Quellzeilen-Navigation. Jede abgeschlossene Navigations-Revision wird einmal beantwortet. Das Öffnen derselben Datei ohne `revealIfOpened: false` fokussiert ihren bestehenden Tab und liefert eine neue Revision.

<a id="model-experience"></a>
## Model Experience

Keine, da die Vorschau ein reines Browser-Viewer ist, der kein Tool, keinen Prompt-Abschnitt und kein Session-Event registriert.

#### KV-Cache-Auswirkung

Keine direkte Auswirkung; was der Nutzer hier liest, gelangt niemals in eine Modellanfrage.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>
- **Bearbeiten ist ganzpufferhaft und rein textuell.** Nur `text-pages`-Renderer dürfen `editable` deklarieren; Markdown-, PDF-, HTML- und Bild-Viewer bleiben schreibgeschützt. Der Editor lädt die vollständige Datei, sodass das `maxFileBytes`-Limit des Hosts gilt, und `write` erstellt nie eine Datei — es ersetzt den Text einer bestehenden regulären Datei und meldet bei einer konkurrierenden Änderung einen Versionskonflikt, statt zu überschreiben. Eine Verzeichnisadresse scheitert mit `not-regular-file`. Eine zwischen sauberen Lesevorgängen gemeldete Plattenversion ersetzt den Puffer, während ein dirty Draft dem bewachten Schreibvorgang überlassen bleibt. Die Viewer bieten keine geteilte Suchoberfläche; unbekannte Erweiterungen nutzen den Plaintext-Reader und unterliegen dessen UTF-8/NUL-Prüfungen.
- **Sequentieller Text und begrenzte vollständige Dateien.** Tiefe Quellzeilen erfordern die vorangehenden Seiten; PDF, HTML und Bilder erfordern ein vollständiges Ergebnis innerhalb des `maxFileBytes`-Limits des Hosts.
- **Scrollzustand der Byte-Ansicht wird nicht wiederhergestellt.** PDF, HTML und Bilder können an den Anfang zurückkehren, wenn ihr Renderer remountet oder neu lädt; die horizontale Bildposition wird nie wiederhergestellt, und das Scrolling des HTML-iframe gehört seinem opaken Browsing-Kontext.
- **Endliche lokale HTML-Abhängigkeiten.** Nur direkte Classic-`.js`- und Stylesheet-`.css`-Referenzen werden gepackt. Vom Browser aufgelöste Ressourcen behalten Browser-Origin- und Netzwerkbeschränkungen; dem iframe wird keine Runtime-Dateilesebrücke bereitgestellt.
- **Paketlokale Umbruch-Symbole.** `IconWrapFill16` und `IconNowrapFill16` leben in `src/client/icons.tsx`, bis das geteilte Icon-Set sie führt; ihre Props entsprechen bereits dem geteilten Icon-Vertrag.
- **Scroll-Schreibvorgänge sind ungedrosselt.** Jedes Scroll-Event zeichnet seinen Offset im Store auf; die Zeilenblöcke sind memoized, sodass das resultierende Re-Rendering React dieselben Elemente zurückgibt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Renderer-Metadaten, Dokumentladen und Ansichtszustand gehören der lokalen Registry und den deklarierten Slot-Stores, ohne unabhängige Runtime-Quelle zum Abgleich; Registrierungs-Disposal und Tab-Lebenszeiten sind durch Verhaltenstests abgedeckt.
