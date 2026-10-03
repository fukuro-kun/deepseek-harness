---
description: "Die modellseitigen Tools read, read_image, write und edit für Nutzer und Maintainer, die Dateisystemzugriff für agents komponieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-fs
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Nutze `dsh-tool-fs`, damit ein Modell UTF-8-Dateien mit Zeilennummern liest, unterstützte Bilder einliest, Dateien erstellt oder atomar ersetzt und gezielte Literal-Edits anwendet. Ergebnisse sind begrenzt, und Fehlschläge liefern stabile Fehlercodes mit Wiederherstellungsanweisungen. Ergänze `dsh-fs-observation-policy`, wenn Schreiben und Editieren ein erfolgreiches Lesen voraussetzen müssen; ohne sie bleiben Mutationen atomar, aber bedingungslos. Bild-Lesevorgänge brauchen einen durable Attachment-Store und ein bildfähiges geroutetes Modell. Für Glob- oder Grep-Suchen wähle das Schwester-Discovery-Paket.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Modell-Erfahrung](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounte die Tools nach einem `ctx.fs`-Backend und, für Read-before-Write/Edit-Verhalten, nach dem Policy-Plugin. Das Modell bekommt dann zeilennummerierte Reads, atomare Writes und Edits und — mit gemountetem Attachment-Store — Bild-Reads; jedes Ergebnis ist begrenzt, und Fehlschläge tragen stabile Codes mit Wiederherstellungsanweisungen.

### Minimale Komposition

Ein Backend, das Policy-Plugin, dann die Tools; der Attachment-Store ist optional und aktiviert `read_image`.

```yaml
- name: '@deepseek-ai/dsh-fs-local'
- name: '@deepseek-ai/dsh-fs-observation-policy'
- name: '@deepseek-ai/dsh-tool-fs'
```

Das Policy-Plugin ist optional: Ohne es laufen die Tools gegen den nackten Provider (bedingungsloses Schreiben, Überschreiben und Editieren ohne beobachteten Zustand). Von einem Deployment, das diese Tools lädt, wird erwartet, dass es das Plugin ebenfalls lädt, sodass das Verhalten Read-before-Write/Edit ist. `read_image` registriert sich nur, solange ein durabler `ctx.attachments`-Service gemountet ist; die Ausführung verweigert zusätzlich auf einer Route, deren exaktes Modell keinen Bild-Input deklariert, sodass die durable Historie einer Text-Route frei von Bildblöcken bleibt.

### Die Tools

| Tool | Argumente | Verhalten |
|---|---|---|
| `read` | `file_path`, `offset?`, `limit?` | Zeilennummerierter UTF-8-Inhalt mit Paginierungs-Footer; `offset` ist 1-basiert, und `limit` defaultet auf das konfigurierte `readLimit` und wird durch es gedeckelt |
| `read_image` | `file_path` | Liest und persistiert eine PNG/JPEG/WebP/GIF-Quelle; ein Pfad ohne Extension (einschließlich normalisierter Attachment-Objektpfade) wird an seiner Dateisignatur erkannt; Normalisierung kann das Bild vor dem nächsten Modell-Request verkleinern, sodass das Modell nicht zuerst ein Thumbnail erstellen muss |
| `write` | `file_path`, `content` | Erstellt oder ersetzt eine Datei vollständig; mit dem Policy-Plugin erfordert Überschreiben ein vorheriges `read` auf der unveränderten Version, Erstellen nicht |
| `edit` | `file_path`, `old_string`, `new_string`, `replace_all?` | Literal-Ersetzung, die einen eindeutigen Treffer erfordert, es sei denn `replace_all` ist true; mit dem Policy-Plugin erfordert sie ein vorheriges `read` und eine unveränderte Datei |

Feldnamen sind snake_case, passend zu Claude Code und den bestehenden Harness-Tool-Schemas. Erfolge liefern kompakte Envelopes — ein Read-Fenster, eine Bildreferenz oder eine `Created file`/`Updated file`-Bestätigung — und `write`/`edit` leiten replayfähige Diff-Card-Metadaten für die UI-Präsentation ab.

### Konfiguration

Alle Keys sind optional; die Defaults sind die ausgelieferten Read-Limits.

| Key | Default | Bedeutung |
|---|---|---|
| `readLimit` | `2000` | Default und Maximum der Zeilen, die ein `read`-Aufruf zurückgibt |
| `readMaxLineLength` | `2000` | Pro Zeile vor Kürzung behaltene Zeichen |
| `readMaxBytes` | `51200` | Byte-Obergrenze der ausgewählten Zeilen eines `read`-Aufrufs; Überschuss beendet das Fenster mit einem Capped-Footer |
| `readStreamMinSize` | `10485760` | Dateien ab dieser Größe (oder unbekannter Größe) werden gestreamt statt ganz in den Speicher geladen |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-fs) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Policy- und Sandbox-Verhalten

Die Pfad-Autorisierung für `read` und `read_image` liegt vollständig bei `ctx.fs`; Medientyp-Deklarationen und Dateisignaturen entscheiden nur, ob `read_image` die von diesem Backend zurückgegebenen Bytes akzeptiert.

Mit gemountetem Policy-Plugin beziehen `write` und `edit` ihre Absicherung aus den `fs/*`-Intent-Slots, sodass ein ungelesenes Ziel oder eine stale Observation mit `FS_NOT_OBSERVED` oder `FS_STALE_VERSION` und einer Wiederherstellungsanweisung fehlschlägt. Unter einem einschränkenden Backend (`fs-sandbox`) bewerben `write`/`edit` zusätzlich `sandbox_permissions` und `justification`; eine abgelehnte Mutation gibt die Markierung `[sandbox: file access denied under <mode> mode]` mit dem Eskalationshinweis desselben Turns zurück, und ein genehmigter Retry darf für genau diesen Aufruf einen strikt weiteren Modus stempeln.

### Fehlschläge und Wiederherstellung

Fehlschläge werden als `Error: <message>` normalisiert, mit einem für Aufrufer erhaltenen strukturierten Code. Stabile Meldungen umfassen `file_path must be a non-empty string`, `limit must be less than or equal to <max>`, `cannot read "<path>": not found`, `cannot read "<path>": not a regular file` und die Bildrouten-Verweigerung `cannot read "<path>" as an image: model "<model>" does not declare image input; switch to an image-capable model to read images`. `FS_NOT_OBSERVED` wird zu `cannot modify "<path>": file has not been read — read the file, then retry` normalisiert, unabhängig davon, ob Policy oder Provider die Operation abgelehnt hat; `FS_STALE_VERSION` behält die Provider-Begründung und hängt `— re-read the file, then retry` an. Nachdem das erneute Lesen das Fehlen bestätigt, meldet `edit` `FS_NOT_FOUND`, statt ein stale Remedy zu wiederholen, während `write` die abgesicherte Erstellung nutzt.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter der Tool-Suite und zeigt auf den Code, der sie umsetzt; das beobachtbare Verhalten deckt [Dieses Paket verwenden](#use-this-package) vollständig ab.

### Designkonzept

Die Tools sind der Executor; die Policy ist ein Event-Gate. Die Tools injizieren keinen Policy-Service und inspizieren keinen Cache — jede Mutation fragt den einzigen Intent-Slot über `ctx.waterfall` nach seiner Absicherung, und jede Operation emittiert `fs/observed` erst nach ihrem Erfolg. Reads führen genau ein Provider-`stat` aus (Typ- und Größen-Routing plus die beobachtete Version); Mutationen führen keines aus, weil die Absicherung aus dem Intent-Slot kommt und der Provider unter seinem Lock erneut prüft.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Config`, Tool-Komposition, `read_image`-Attachments-Gate |
| [`src/read.ts`](src/read.ts) | `read`-Executor: ein stat, Streaming-Entscheidung, Fensteraufbau, Observation |
| [`src/read-image.ts`](src/read-image.ts) | `read_image`-Executor: Routen- und Medientyp-Gates, begrenzte Bytes, Attachment-Speicherung |
| [`src/write.ts`](src/write.ts) | `write`-Executor: Intent-Waterfall, atomarer Write, Observation |
| [`src/edit.ts`](src/edit.ts) | `edit`-Executor: Intent-Waterfall, Literal-Edit, Observation |
| [`src/read-render.ts`](src/read-render.ts) | Cordis-freie Fensterung und Envelope-Formatierung |
| [`src/sandbox.ts`](src/sandbox.ts) | Eskalations-API, geteilt von `write`/`edit`: Policy-Auflösung und Denial-Marker-Mapping |
| [`src/error.ts`](src/error.ts) | Stabile modellseitige Diagnostik für Fehlschläge abgesicherter Mutationen |

### Ablauf pro Tool

Alle vier Tools teilen eine Ablaufform: den Pfad mit dem cwd der aufrufenden Session auflösen, das anwendbare Gate ausführen, genau eine Provider-Operation ausführen und `fs/observed` erst nach Erfolg emittieren. `read` und `read_image` bezahlen ein `stat` für Typ- und Größen-Routing; `write` und `edit` bezahlen keines, weil ihre Absicherung aus dem Intent-Slot kommt, und Provider-Fehlschläge erscheinen als typisierte `FsError`-Ergebnisse. Die Executoren pro Tool liegen in `src/read.ts`, `src/read-image.ts`, `src/write.ts` und `src/edit.ts`.

### Observation und Nebenläufigkeit

`fs/observed` feuert nach dem Erfolg der Operation über ein einfaches `ctx.emit`; ein Listener ist vertraglich ein synchroner, rein nebenwirkender Recorder, sodass asynchrone oder fehlschlagfähige Observation nicht auf dieses Event gehört. `read` entscheidet sich für nebenläufige Scheduling, weil seine einzige Mutation der synchrone Versions-Recorder ist; Recorder-Races schlagen fail-closed fehl, wenn ein späteres `write` oder `edit` die Version unter seinem Ziel-Lock erneut prüft, und beide Mutations-Tools bleiben exklusiv.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Level-Vertrag nicht reicht. Sie bewegen sich von den Tools zum Vertrag, den Backends und der Policy, mit denen sie komponieren.

- [Filesystem-Subsystem](../../../docs/subsystems/filesystem.de.md) — erschöpfender Provider-Vertrag, Policy-Events und Fehlertaxonomie.
- [dsh-fs](../fs/README.de.md) — der `ctx.fs`-Vertrag, den diese Tools konsumieren.
- [fs-local](../fs-local/README.de.md) — das Host-Filesystem-Backend, gegen das diese Tools laufen.
- [fs-sandbox](../fs-sandbox/README.de.md) — das Sandbox-erzwingende Backend, das die Eskalationsfelder hinzufügt.
- [fs-observation-policy](../fs-observation-policy/README.de.md) — das Policy-Plugin, das Mutationen über die `fs/*`-Events absichert.
- [Generierter Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-fs) — die erschöpfenden Schemas, die dieses Paket registriert.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

### System-Prompt

#### Was das Modell sieht

Zur Assemblierungszeit prüft jeder Anleitungsabschnitt `ctx.tools.get(name, scope)` und rendert nur, solange sein Tool für diesen agent sichtbar ist. Der Write-Absatz empfiehlt edit nur, solange edit sichtbar ist. Der untenstehende Text bleibt unverändert, wenn alle drei Tools verfügbar sind; Beschränkungen, ihre Aufhebung und Tool-Registrierungsänderungen wirken bei der nächsten Assemblierung. Derselbe Check funktioniert für direkte agent-Beschränkungen und den `toolFilter` von subagents, einschließlich PTC-Capabilities hinter `run_code`. Die Read-before-Mutation-Sätze in write/edit beschreiben die Observation-Policy, nicht eine Pflicht, das Tool namens `read` aufzurufen. Sie bleiben, wenn `read` versteckt ist: Die Policy sichert Mutationen weiterhin ab, und eine andere observierende Operation wie `str_replace_editor` mit `command: view` kann dieselbe Datei-Observation herstellen. Tool-Sichtbarkeit deaktiviert diese Vorbedingung nicht.

##### Read-Anleitung

```markdown
Use the read tool — not shell commands like cat — to inspect text files. Results include line numbers. Use offset and limit to continue reading large files.
```

##### Write-Anleitung

```markdown
Use the write tool to create files or completely replace file contents. Existing files are overwritten, so read an existing file first (the default fs-observation-policy requires it) and prefer edit for targeted changes.
```

##### Edit-Anleitung

```markdown
Use the edit tool for targeted changes to existing UTF-8 text files. It replaces literal old_string with new_string; by default old_string must appear exactly once. If old_string appears multiple times, provide a more specific old_string or set replace_all to true. Read the file first (the default fs-observation-policy requires it), unless you just created or edited it in this session.
```

#### Token-Effekt

Die Anleitungskosten folgen den sichtbaren Tools und ihren anwendbaren toolübergreifenden Empfehlungen.

#### KV-Cache-Effekt

Präfixstabil, solange das sichtbare Toolset, der Plugin-Scope und der Anleitungstext unverändert sind. Beschränkungen oder Plugin-Lifecycle-Änderungen können die Wiederverwendung ab dem ersten geänderten Abschnitt ungültig machen.

### Tool-Schemas

#### Was das Modell sieht

Das Modell sieht die generierten [`read`-, `read_image`-, `write`- und `edit`-Schemas](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-fs) mit snake_case-Argumenten. Das Bild-Tool erscheint nur, solange ein durabler Attachment-Store gemountet ist; sein Schema ist routenunabhängig, und das strikte Gate verweigert bei der Ausführung. Scoped Tool-Beschränkungen können jede Definition für einen agent entfernen.

#### Token-Effekt

Feste Schema-Kosten bei jedem Request in dieser Tool-Sicht.

#### KV-Cache-Effekt

Präfixstabil, solange die sichtbaren Tool-Definitionen und ihre Reihenfolge unverändert sind. Registrierungs-Lifecycle oder Scoped-Beschränkungen können die Wiederverwendung ab dem ersten geänderten Schema-Token ungültig machen.

### Read-Ergebnis

#### Was das Modell sieht

Ein erfolgreicher Read ist exakt `<path><displayPath></path>`, Newline, `<type>file</type>`, Newline, `<content>`, nummerierte Zeilen als `<lineNumber>: <text>`, eine Leerzeile, ein Footer und `</content>`. Der Footer ist exakt `(Output capped. Showing lines <start>-<end>. Use offset=<next> to continue.)`, `(Showing lines <start>-<end> of <total>. Use offset=<next> to continue.)` oder `(End of file - total <total> lines)`. Eine lange Zeile endet exakt mit `... (line truncated to <max> chars)`. Ein fehlendes Read-Ziel liefert weiterhin `FS_NOT_FOUND`, zeichnet aber das bestätigte Fehlen für die aufrufende Session auf; nachdem eine extern gelöschte Datei erneut gelesen wurde, kann ein wiederholtes `write` sie über die No-Replace-Absicherung des Providers sicher neu erstellen.

#### Token-Effekt

Die Read-Ausgabe ist durch `readLimit`, `readMaxLineLength` und `readMaxBytes` begrenzt; der behaltene Aufruf und das Ergebnis werden bis zur Compaction erneut gesendet.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

### Bild-Read-Ergebnis

#### Was das Modell sieht

Ein erfolgreiches `read_image` liefert `<path><displayPath></path>`, `<type>image</type>` und einen `<content>`-Envelope, der Medientyp, normalisierte Maße und Byte-Größe nennt, gefolgt vom Bild selbst als nativem Bildblock. Das Ergebnis wird mit seiner durablen Referenz geloggt, bevor der nächste Modell-Request läuft.

#### Token-Effekt

Das Bild wird bei jedem späteren Request bis zur Compaction berechnet. Jeder Aufruf ist unabhängig durch `maxImageBytes`/`maxImagePixels`/`maxImageDimension` des Attachment-Stores begrenzt; wiederholte erfolgreiche Aufrufe akkumulieren Historie, und Content-Adressierung dedupliziert nur die gespeicherten Bytes, nicht die Token-Kosten pro Request.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

### Write- und Edit-Ergebnisse

#### Was das Modell sieht

Write liefert den exakten Fünf-Zeilen-Envelope `<path><displayPath></path>`, `<type>file</type>`, `<content>`, `Created file` oder `Updated file`, dann `</content>`. Edit liefert exakt `The file <displayPath> has been updated successfully.` oder, für `replace_all`, `The file <displayPath> has been updated. All occurrences were successfully replaced.` Der vollständige Write- oder Ersetzungstext bleibt in den Assistant-Tool-Call-Argumenten.

#### Token-Effekt

Der Erfolgstext ist klein, aber große Mutationsargumente und jedes Ergebnis werden bis zur Compaction erneut gesendet.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

### Tool-Fehler

#### Was das Modell sieht

Fehlschläge werden als `Error: <message>` normalisiert. Die stabilen Validierungs- und Read-Meldungen dieses Pakets sind `file_path must be a non-empty string`, `limit must be less than or equal to <max>`, `old_string must be a non-empty string`, `old_string and new_string must differ`, `cannot read "<path>": not found`, `cannot read "<path>": not a regular file`, `offset <offset> is out of range for "<path>" (<total> lines)`, `cannot read "<path>": the <ext> extension does not declare a supported image format; read_image accepts PNG/JPEG/WebP/GIF files, including extension-less files in those formats`, `cannot read "<path>": the file content is not a supported image format; read_image accepts PNG/JPEG/WebP/GIF`, `cannot read "<path>": the bytes do not decode as a supported PNG/JPEG/WebP/GIF image; the file may be truncated or corrupt`, `cannot read "<path>" as an image: model "<model>" does not declare image input; switch to an image-capable model to read images` und die Mismatch-Reparatur `cannot read "<path>": the <ext> extension declares <type>, but the bytes use a different image format; rename the file to match its actual format if it is PNG/JPEG/WebP/GIF, or convert it to one of those formats` (ein Mismatch ohne Extension meldet `cannot read "<path>": the file signature claims <type>, but the bytes decode as a different image format; the file may be corrupt`). Eine fehlgeschlagene 16-Bit-Konvertierung meldet `cannot read "<path>": the 16-bit PNG could not be converted to the normalized 8-bit sRGB form; convert it to an 8-bit PNG/JPEG/WebP and retry`. Provider- und Policy-Templates stehen wörtlich in den READMEs ihrer Pakete. Der modellseitige Fehler-Wrapper normalisiert jede `FS_NOT_OBSERVED`-Quelle zu `cannot modify "<path>": file has not been read — read the file, then retry`; `FS_STALE_VERSION` behält die Provider-Begründung und fügt `— re-read the file, then retry` hinzu. Beide behalten den strukturierten Fehlercode und die ursprüngliche Ursache. Nachdem jenes erneute Lesen das Fehlen bestätigt, meldet `edit` `FS_NOT_FOUND`, statt ein stale Remedy zu wiederholen, während `write` die abgesicherte Erstellung nutzt.

#### Token-Effekt

Nur ein fehlschlagender Aufruf fügt diese behaltenen Tokens hinzu.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die Tool-Suite schlecht passt oder besondere Betriebsvorsicht braucht. Sie sind aktuelle Paket-Constraints, kein allgemeiner Filesystem-Vergleich und kein Aufgabenstau.

- **Es wird kein modellseitiges Verzeichnislisting ausgeliefert** — `ctx.fs.listDir` bedient Provider-Code wie Skill-Discovery, während das Schwesterpaket `dsh-tool-fs-search` ripgrep-gestützte `glob`- und `grep`-Tools liefert, statt die Filesystem-Seam zu erweitern.
- **`read` verarbeitet nur UTF-8-Textdateien** — Bilder nutzen das separate `read_image`-Tool; PDF, Audio und Video bleiben zurückgestellt. Ein Verzeichnisziel ist `FS_NOT_REGULAR_FILE`.
- **Medientyp per Extension deklariert** — eine Extension wählt den deklarierten Typ, und die Magic-Byte-Validierung des Attachment-Stores bleibt maßgeblich; ein korrekt formatiertes Bild unter falscher Extension wird mit dem Rename-Remedy abgelehnt statt gesnifft. Nur ein Pfad ohne Extension wird an seiner Dateisignatur erkannt.
- **Objektpfade durchlaufen die Quellzulassung erneut** — `read_image` auf einem normalisierten Attachment-Objekt lässt dessen Bytes als neue Quelle wieder zu, sodass ein Deployment, dessen `maxImageBytes`/`maxMessageImageBytes` unter dem Byte-Budget normalisierter Bilder liegen, einen Objektpfad ablehnen kann, den `ctx.attachments.readImage` noch bedient; die ausgelieferten Defaults halten das Normalisierungs-Budget (4 MiB) weit unter den Quell-Limits (20 MiB).
- **Die Inline-Bildvorschau hängt an der UI-Komposition** — die Tool-Ergebniskarte rendert das Bild über den `tool.call.images`-Slot des Browsers, den das Attachment-Präsentations-Plugin füllt; eine UI ohne dieses Plugin zeigt stattdessen den Envelope-Text des Ergebnisses.
- **Kein Attachment-Region-Tool** — ein agent kann ein Bild über ein anderes verfügbares Tool zuschneiden, wenn er einen Filesystem-Pfad hat; ein eingefügtes oder gezogenes Bild ohne Pfad kann nicht in höherer Auflösung erneut gelesen werden.
- **Keine Timeout-Oberfläche** — `read`/`write`/`edit` nehmen kein Timeout-Argument und deklarieren kein Timeout-Budget; Abbruch läuft nur über `exec.signal` ([Provider-Begründung](../README.de.md)).

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Keine.

</details>

**Runtime-Invariante:** Es wird kein Begleiter publiziert. Dieser modellseitige Adapter hat keinen eigenen Lifecycle-Stream; die Ausführungsbeziehungen gehören der Capability-Seam, die er aufruft.
