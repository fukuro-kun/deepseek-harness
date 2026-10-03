---
description: "Web-@file- und @session-Referenz-Source für den Composer: Kandidaten, Ordering und atomare Inline-Referenzen (einheitliches File/Session-Picking)."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-reference
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Verwende `dsh-client-ui-reference`, wenn Web-Nutzer Dateien, Ordner oder Sessions aus einem einzigen `@`-Completion-Menü erwähnen müssen. Es listet Dateien vor Sessions und hält jede Gruppe verfügbar, wenn die andere nicht laden kann. Das Auswählen einer Datei, eines Ordners oder einer Session fügt eine atomare Referenz mit stabiler Clipboard-Form ein; Ordner-Rows lassen Nutzer außerdem absteigen, ohne die Completion zu schließen. Datei-Rows lassen redundante Root-Locations weg, und Session-Rows zeigen einen Workspace nur, wenn er vom aktuellen abweicht. Session-Mentions werden validiert, bevor Modell-Kontext erfasst wird, während das Durchsehen von Kandidaten keinen Model-Effekt hat.

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

Die Source ist aktiv, sobald die Komposition dieses Paket mountet und ein Host-`ctx.fileReferences`-Provider verfügbar ist. Tippe `@` gefolgt von einem unquotierten Token, um zuerst Dateien, dann Sessions zu sehen; öffne `@"…`, um nur Dateien zu suchen. Die Kandidatenliste ist ein Completion-Menü, keine Suchergebnisseite: einmal wählen und weitertippen.

### Was ein Pick einfügt

Eine Datei schließt die Completion als atomare Inline-Referenz, angezeigt mit Datei-Glyph und Dateiname in Business-Farbe. Eine Directory-Row trägt zwei Verben: der settlende Pick (Row-Klick oder Enter) löst den Ordner selbst als dieselbe Art atomarer Referenz auf — Ordner-Glyph, Label mit Trailing-Slash, kanonisches `@dir/`-Mention als serialisierte Form — während die Drill-Aktion (Tab oder das Chevron der Row) editierbaren Pfad-Klartext mit Ordner-Glyph behält und das Menü am Trailing-Slash aktiv lässt, sodass du eine weitere Ebene absteigen kannst. Pfade mit Whitespace verwenden `@"path with spaces"`, und ein Quote, das der Nutzer explizit geöffnet hat, bleibt gequotet.

Ein Session-Pick fügt eine atomare Inline-Referenz ein, deren versteckte `ref` und Clipboard-Repräsentation das kanonische `@[label](dsh-session:…)`-Mention ist, das der Host zurückgibt; ihre sichtbare Form ist ein Chat-Bubble-Glyph plus der Session-Titel. Das Senden trägt das Mention über `session.prompt`, und der Session-Reference-Service validiert es und erfasst Modell-Kontext an `agent/pre-step`.

### Fehlerverhalten

Eine nicht verfügbare oder fehlgeschlagene Kandidaten-Domain liefert keine Rows für diese Domain, während die andere weiter listet. Ein Session-Reference-Preparation-Fehler tritt nach der Prompt-Akzeptanz auf und beendet diesen Agent-Turn.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Die Source hält die Kandidaten-Kodierung intern zum Registrierungs-Effect: der `/client`-Export ist nur der Plugin-Body (`apply`/`inject`).

### Kandidatenfluss

Für ein unquotiertes Token startet der Browser die Remote-Calls `fileReferences/list` und `sessionReferenceResolver/candidates` gemeinsam und ordnet dann deterministisch Dateien vor Sessions, mit locale-registrierten Folder/File/Session-Labels. Rows rendern unter nicht-selektierbaren File- und Session-Abschnittsüberschriften, ohne einen redundanten rohen `reference`-Source-Titel. Eine Session-Row wird über das `updatedAt` der Host-Session-Liste datiert, durch denselben Relative-Time-Bucket, den diese Liste nutzt, sodass eine Session auf beiden Oberflächen dasselbe Alter liest; eine Session, die die Liste nicht trägt, fällt auf die Erstellungszeit des Kandidaten zurück. Eine gedrillte Query publiziert einen Breadcrumb vom Workspace-Root zum gelisteten Verzeichnis; jeder Crumb trägt das Drill-Payload, das eine Ordner-Row tragen würde, sodass „zu einem Schritt zurückkehren“ und „in eine Ebene absteigen“ ein Ergebnis sind.

### Serialisierung

Datei-Picks bewahren den natürlichen Text, den die geteilte `@path`-Grammatik definiert, als versteckte serialisierte und Clipboard-Form. Session-Picks verwenden das kanonische `@[label](dsh-session:…)`-Mention; die Serialisierung rekonstruiert Identität nie aus dem sichtbaren Titel.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten behandeln die Suggestion-Maschinerie, die Referenz-Seams und die Input-Pipeline.

- [ui-input-trigger](../ui-input-trigger/README.de.md) — die Inline-Suggestion-Maschinerie, in die sich die Source registriert.
- [file-reference](../../context/file-reference/README.de.md) — der `@file`-Seam und sein Provider-Vertrag.
- [session-reference](../../context/session-reference/README.de.md) — der `@session`-Seam und die Prepared-Snapshot-Semantik.
- [Web-Input-Machine und Slash-Pipeline](../../../.agents/notes/archived/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md) — wie Referenzen und Commands die Input-Machine teilen.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über Host-owned Provider, denen dieses Paket die File-Guidance und Session-Snapshot-Preparation seiner Referenz-Auswahl delegiert.

#### KV-Cache-Effekt

Das Durchsehen von Kandidaten hat keinen Model-Effekt. Eine ausgewählte Datei oder Session ändert nur den Suffix der neuen User-Message und den Host-prepared Session-Reference-Kontext, der dieser Message folgt; frühere Ziel-History bleibt unverändert.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die Referenz-Source nicht helfen kann; sie sind aktuelle Paket-Constraints.

- **Kandidaten-Fehlschlag ist bewusst still** — ein nicht verfügbarer oder fehlgeschlagener Remote-Discovery-Call liefert keine Rows für diese Domain. Ein Session-Reference-Preparation-Fehler tritt nach der Prompt-Akzeptanz auf und beendet diesen Agent-Turn.
- **Kein browserseitiger File-Scan** — die Web-Completion erfordert einen gemounteten Host-`ctx.fileReferences`-Provider; der Browser kann nicht auf sein eigenes Dateisystem zurückfallen.
- **Session-Suche bleibt metadata-only** — die Discovery filtert Session-Id, cwd und den neuesten log-backed Titel über `ctx.sessionReferenceResolver`; Message-Bodies und vollständige Transcripts werden nicht durchsucht.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Eine einzelne Slash-Source-Registrierung, deren Disposal die HMR-Safety-Spec beweist — sie emittiert keine Cordis-Events und besitzt keinen plugin-übergreifenden mutablen Zustand.
