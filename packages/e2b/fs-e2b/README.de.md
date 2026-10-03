---
description: "Dateioperationen innerhalb der gemeinsamen Remote-Sandbox: was der agent dort mit Dateien tun kann, wann man es einsetzt und was man erwarten darf — für Deployments und Maintainer der E2B-Familie."
kind: "package-reference"
---

# @deepseek-ai/dsh-fs-e2b
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh-fs-e2b` führt die Dateioperationen des agent innerhalb der Remote-Sandbox aus: Der agent kann Dateien lesen, Verzeichnisse auflisten, neue Dateien schreiben, vorhandene überschreiben oder bearbeiten und erhält genaue Metadaten — alles in derselben Remote-Welt, in der auch seine Befehle laufen. Es braucht keine Konfiguration; das Mounten verlagert die Dateiarbeit von der Host-Maschine. Zusammen mit `dsh-e2b` und `dsh-subprocess-e2b` einsetzen, damit Dateien und Befehle ein gemeinsames Remote-Arbeitsverzeichnis teilen. Die Dateien der Host-Maschine werden nie berührt, und die Ergebnisse sehen für das Modell exakt wie lokale Dateiergebnisse aus. Wenn Dateien auf dem Host liegen sollen, wähle stattdessen das lokale Dateisystem-Paket.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Verwende dieses Paket, wenn die Dateiarbeit des agent — Lesen, Schreiben, Bearbeiten, Auflisten — in der Remote-Sandbox statt auf deiner Maschine stattfinden soll. Es ist die Dateisystem-Hälfte der E2B-Familie: Was der agent hier schreibt, können seine Befehle in derselben Sandbox lesen.

### Wann es die richtige Wahl ist

Wähle es, wenn eine composition bereits die E2B-Sandbox nutzt und Dateioperationen dort laufen sollen. Wähle das lokale Dateisystem-Paket, wenn Dateien auf dem Host bleiben sollen. Es gibt keine Konfiguration, die man tunen müsste.

### Mounten

Lade zuerst den Sandbox-Owner, dann dieses Paket; danach arbeiten die Dateifunktionen auf der Sandbox:

```yaml
- name: '@deepseek-ai/dsh-e2b'
- name: '@deepseek-ai/dsh-fs-e2b'
```

Das Mounten kopiert oder spiegelt keine lokalen Dateien — das Arbeitsverzeichnis der Sandbox startet leer und füllt sich, während der agent arbeitet.

### Dateien lesen

Der agent kann den gesamten Inhalt einer Datei lesen, große Dateien streamen oder rohe Bytes bis zu einer Größenobergrenze bzw. als ein Byte-Fenster lesen. Binärdateien und Dateien, die kein gültiger UTF-8-Text sind, werden mit einer klaren Meldung abgelehnt statt verstümmelt ausgegeben; Lesevorgänge jenseits der Größenobergrenze schlagen mit einer Meldung fehl, die das Limit nennt.

### Dateien schreiben und bearbeiten

Der agent kann Dateien anlegen, überschreiben oder bearbeiten, indem er ein literales Textstück ersetzt (optional jedes Vorkommen), und kann verlangen, dass eine Datei nur erstellt wird, wenn sie noch nicht existiert. Ein Schreibvorgang landet vollständig oder gar nicht — ein fehlgeschlagener Schreibvorgang hinterlässt nie eine Teildatei. Hat sich die Datei seit dem letzten Lesen durch den agent geändert, wird der Schreibvorgang abgelehnt, statt den neueren Inhalt zu überschreiben, sodass zwei Prozesse einander nicht unbemerkt die Arbeit überschreiben können.

### Pfade in der Sandbox

Relative Pfade werden gegen das Arbeitsverzeichnis des Aufrufers oder das gemeinsame Arbeitsverzeichnis der Sandbox aufgelöst und als die POSIX-Pfade gemeldet, die sie in der Sandbox sind — was der agent liest und schreibt, stimmt exakt mit dem überein, was seine Befehle sehen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem provider und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Designphilosophie

- **Eine Remote-Welt.** Pfade und Inhalte bleiben in der Sandbox; der Host-Workspace wird nie kopiert, gemountet oder abgeglichen.
- **Atomare Veröffentlichung.** Jede Mutation committet über ein rename im selben Dateisystem oder einen abgesicherten Link, und die zurückgegebene Version stammt vom committeten Eintrag, sodass nach dem Commit-Punkt keine fehlschlaganfällige Metadatenanfrage mehr folgt.
- **Strenge Transport-Framing.** Kanonische Pfade und Inhalte queren das SDK als ASCII-base64 mit NUL-Framing, sodass Zeilenumbrüche und Multibyte-Daten beliebige Decodierungsgrenzen überstehen.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `E2BFileSystem`-Provider, Kanonisierung, Lesevorgänge, atomare Schreibvorgänge, Fehlermapping |
| — | Es wird kein Runtime-Invariant-Begleiter veröffentlicht; jede Operation liefert direkt das committete Ergebnis des E2B-Controllers, ohne unabhängiges Event oder Cache zum Gegenprüfen. |

### Kanonische Pfade und Transport-Framing

Relative Pfade werden als POSIX-Pfade gegen das `cwd` des Aufrufers oder `ctx.e2b.cwd` aufgelöst; GNU `realpath -mz` liefert kanonische Zielidentität, ohne dass die Zieldatei existieren muss, und ASCII-base64 plus striktes NUL-Framing bewahrt Pfade mit Zeilenumbrüchen und Multibyte-Zeichen über den dekodierten SDK-Transport. `stat`, nicht-folgendes `lstat` und stabile einstufige Verzeichnislistings projizieren E2B-Metadaten in den seam; kanonische Ziele geben absolute POSIX-Prozesspfade, prozentkodierte `file:`-URIs und provider-seitige Containment-Prüfungen frei.

### Schreibpfad

Schreibvorgänge erzeugen ein zufälliges Staging-Geschwisterverzeichnis, setzen dessen Modus vor dem Hochladen des Inhalts auf `0700` und bewahren den POSIX-Modus einer vorhandenen Datei; Ersetzungen werden über das atomare rename von E2B im selben Dateisystem veröffentlicht, und ein abgesichertes `createIfAbsent` veröffentlicht per `ln -T`, sodass der Commit atomar nicht-ersetzend ist, selbst wenn am Ziel ein Verzeichnis erscheint. Das erweiterte Attribut `dsh-version` plus die Metadaten des committeten Eintrags bilden die zurückgegebene Version; literale Edits normalisieren zum Abgleich auf LF und stellen den dominanten CRLF-Stil wieder her, und Mutationen serialisieren pro kanonischem Ziel. Staging-Aufräumfehler nach dem Commit machen einen erfolgreichen Schreibvorgang nie zu einem Fehlschlag.

### Fehler und Abbruch

E2B-Nicht-gefunden-, Berechtigungs-, Abbruch- und sonstige Controller-Fehler werden auf die bestehenden `FsError`-Codes (`FS_NOT_FOUND`, `FS_PERMISSION_DENIED`, `FS_ABORTED`, `FS_IO_ERROR`) abgebildet, während Text- und Byte-Lesevorgänge `FS_NOT_TEXT` und `FS_TOO_LARGE` hinzufügen. Abbrüche werden an SDK-Anfragegrenzen und unmittelbar vor der Veröffentlichung geprüft, aber das Signal wird nie in den rename- oder guarded-link-Commit weitergegeben, sodass ein Abbruch die atomare Veröffentlichung weder unterbrechen noch einen committeten Schreibvorgang als Fehlschlag melden kann.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen von der Familien-composition zur Dateisystem-seam-Oberfläche und zu den Tools, die sie rendern.

- [E2B-Provider-Familienkarte](../README.de.md) — der Sandbox-Owner und die Drei-Pakete-composition.
- [Dateisystem-Subsystem](../../../docs/subsystems/filesystem.de.md) — der Dateisystem-seam-Vertrag und die generierte Cordis-Oberfläche.
- [Dateisystem-Provider-Vertrag](../../fs/fs/README.de.md) — das `FileSystem`-Interface, das dieser provider implementiert.
- [Datei-Tools](../../fs/tool-fs/README.de.md) — die Tools, die Dateisystem-Ergebnisse fürs Modell rendern.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über [`dsh-tool-fs`](../../fs/tool-fs/README.de.md), das Remote-UTF-8-Inhalte, Verzeichnisergebnisse, Mutationsbestätigungen und provider-Fehler rendert, während E2B-Identität und -Transport intern bleiben.

#### KV-Cache-Effekt

Keine direkte Invalidierung: `dsh-tool-fs` besitzt alle Request-Prefix-Änderungen; der E2B-Transport erreicht nie einen Request.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der provider ungeeignet ist oder besondere Betriebsaufmerksamkeit braucht. Es sind aktuelle Paketconstraints, kein Aufgabenstapel.

- **Keine Host-Synchronisation** — ein leeres E2B-cwd bleibt leer, bis ein Tool, Befehl oder externer Prozess es befüllt; lokale Dateien werden weder hochgeladen noch zurückgespiegelt.
- **Mutationskoordination ist host-prozesslokal** — `createIfAbsent` bewahrt einen Remote-Erzeuger, der mit der Veröffentlichung raced, aber eine andere harness-Verbindung oder ein Befehl kann dennoch mit einer Ersetzung racen; Versionsguards erkennen nur Änderungen, die als E2B-Metadaten repräsentiert werden.
- **Lesevorgänge öffnen kanonische Ziele per Pfad erneut** — ein gleichzeitiger Remote-Pfadersatz zwischen Auflösung und Stream-Öffnen wird nicht durch ein stabiles Dateihandle abgezäunt; kein beobachteter Produktdefekt rechtfertigt in diesem POC ein provider-eigenes Protokoll für begrenzte Lesevorgänge.
- **Kosten für Ganzdatei-Mutationen bleiben** — Überschreib-Diffs und literale Edits lesen vollständige Dateien in den Host-Speicher, und jede Operation verursacht E2B-Controller-Latenz.
- **Der POC zielt auf das Standard-Linux-Image von E2B** — er setzt GNU `realpath`/`base64`/`chmod`, rename im selben Dateisystem, gestreamte Lesevorgänge und erweiterte Metadaten-Attribute voraus; eigene Templates liegen außerhalb dieses POC.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
