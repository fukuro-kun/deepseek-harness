---
description: "Das Host-Dateisystem-Backend für ctx.fs für Deployments und Maintainer, die lokalen Dateizugriff wählen oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-fs-local

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Verwende `dsh-fs-local`, um Dateien auf dem Host-Dateisystem zu lesen, aufzulisten, atomar zu schreiben und zu bearbeiten. Relative Pfade werden gegen ein konfigurierbares Basisverzeichnis aufgelöst, während absolute Pfade und Parent-Traversal uneingeschränkt bleiben. Pfade und Symlinks, die dieselbe Datei erreichen, teilen eine Identität. Schreibvorgänge erhalten Dateiberechtigungen, und optionale Versionswächter weisen veraltete Überschreibungen zurück. Wähle dieses Paket für direkten Host-Zugriff; verwende `fs-sandbox` für eingegrenzte Mutationen oder `fs-e2b` für Dateien in einer entfernten Ausführungswelt.

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

Mounte dieses Backend, wenn eine Komposition ein vom echten Host-Dateisystem gestütztes `ctx.fs` benötigt und eine prozesslokale Implementierung akzeptiert. Der übliche Weg ist explizit: Lade das Backend, gib ihm ein Basisverzeichnis, und die modellseitigen Tools (`dsh-tool-fs`) oder deine eigenen Plugins können Dateien lesen, schreiben und bearbeiten.

### Wann es zu wählen ist

Wähle `fs-local` für gewöhnlichen Host-Dateizugriff in einem einzigen Prozess. Wähle [`fs-sandbox`](../fs-sandbox/README.de.md), wenn Schreibvorgänge und Bearbeitungen einer Session auf ihren Workspace und ihre Temp-Roots eingegrenzt werden müssen — es erweitert dieses Backend und fügt nur den Modus-Zaun hinzu. Wähle [`fs-e2b`](../../e2b/fs-e2b/README.de.md), wenn Dateien in einer mit Subprozessen geteilten entfernten Ausführungswelt liegen müssen. `config.cwd` ist ein Auflösungs-Default, keine Eingrenzungsgrenze: Absolute Pfade und `..` entkommen ihr.

### Minimale Konfiguration

Lade das Backend mit einem Basisverzeichnis; relative Pfade werden dagegen aufgelöst, und absolute Pfade ignorieren es.

```yaml
- name: '@deepseek-ai/dsh-fs-local'
  config:
    cwd: /absolute/path/to/workspace
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `cwd` | `process.cwd()` | Basisverzeichnis für relative Pfade |
| `diffBasisMaxBytes` | `10 MiB` | UTF-8-Byte-Limit pro Überschreib-Diff-Seite; größere Überschreibungen geben `before: null` zurück |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-fs-local) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Was du tun kannst

Lies jede reguläre UTF-8-Textdatei ganz oder als Stream, lies Rohbytes bis zu einer von dir gewählten Obergrenze oder als ein Byte-Fenster, und liste eine Verzeichnisebene in stabiler Namensreihenfolge. Erstelle oder ersetze eine Datei atomar und wende eine Litera­ltext-Bearbeitung atomar an; beide Mutationen serialisieren pro Datei, sodass sich gleichzeitige Schreiber nie überlappen. Der Versionswächter ist optional: Lasse ihn für unbedingtes Erstellen-oder-Überschreiben weg oder gib ihn an, um zu scheitern, wenn sich die Datei seit deiner letzten Beobachtung geändert hat.

Fehler sind typisierte `FsError`s mit stabilen Codes — `FS_NOT_FOUND`, `FS_NOT_TEXT` (Binärinhalt), `FS_STALE_VERSION` (seit Beobachtung geändert), `FS_EDIT_NOT_FOUND` oder `FS_AMBIGUOUS_EDIT` (kein eindeutiges Literal-Match) und andere — sodass Aufrufer nach dem Code verzweigen, nie nach dem Meldungstext. Ein fehlendes Ziel bei einer bewachten Bearbeitung meldet in jedem Fall `FS_STALE_VERSION`.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem lokalen Backend und zeigt auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) behandelt.

### Designkonzept

Das Backend baut auf drei Ideen:

- **Realpath-Identität.** Der `targetKey` ist der `realpath` der Datei, sodass zwei Eingabepfade, die dieselbe Datei über Symlinks erreichen, eine Identität teilen, und Schreibvorgänge auf dem Link-Ziel landen, während der Link erhalten bleibt.
- **Atomare Veröffentlichung.** Schreibvorgänge gehen in eine exklusive Temp-Datei in einem privaten Staging-Verzeichnis neben dem Ziel, fsync, dann veröffentlichen; der Modus einer bestehenden Datei bleibt erhalten und Windows-DACLs überleben die Ersetzung.
- **Ein Mutations-Kritischer-Abschnitt.** Ein FIFO-Lock pro Ziel serialisiert Lesen→Wächter→Schreiben-Fenster, sodass gleichzeitige Schreibvorgänge und Bearbeitungen deterministisch geordnet sind — einer gewinnt, der Rest sieht die neue Version und wird als veraltet zurückgewiesen.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Service-Verdrahtung: `LocalFileSystem`, `Config`, Mutations-Lock pro Ziel |
| [`src/fsio.ts`](src/fsio.ts) | Cordis-freie Roh-I/O: Probe, Lesen, atomares Schreiben, Literal-Bearbeitung, Zeilenenden-Behandlung |
| [`src/win32.ts`](src/win32.ts) | Windows-spezifische DACL-Erhaltung für atomare Ersetzung |

### Schreibpfad

Jeder Schreibvorgang probiert das Ziel, erzwingt den optionalen Wächter (`createIfAbsent` oder `replaceIfVersion`), erfasst eine begrenzte `before`-Diff-Basis, wenn beide Seiten klein genug sind, lagert den neuen Inhalt neben dem Ziel, fsyncs und veröffentlicht atomar. Bewachte Erstellung verwendet eine Hard-Link-Veröffentlichung, die einen gleichzeitigen Ersteller nie ersetzt, und weist ihn stattdessen mit `FS_NOT_OBSERVED` zurück.

### Bearbeitungspfad

Jede Bearbeitung probiert, verifiziert den Versionswächter vor dem Literal-Matching (sodass veraltete Bearbeitungen `FS_STALE_VERSION` melden, nie ein irreführendes No-Match), liest die Datei, wendet die Literal-Ersetzung mit LF-Normalisierung an, stellt den dominanten Zeilenenden-Stil der Datei wieder her und veröffentlicht erneut — alles innerhalb des Pro-Ziel-Locks.

### Ownership und Invarianten

Roh-I/O ist Cordis-frei und in `src/fsio.ts` unabhängig unit-getestet; `src/index.ts` bleibt dünne Verdrahtung. `config.cwd` ist nur ein Auflösungs-Default — Eingrenzung ist die Aufgabe von `fs-sandbox` oder eines `tools/execute`-Berechtigungsplugins. Abbruch ist ein Best-Effort-`AbortSignal`, das vor und nach jedem asynchronen Probe geprüft wird.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen vom Vertrag zu den benachbarten Backends, Tools und Policies.

- [Filesystem-Subsystem](../../../docs/subsystems/filesystem.de.md) — erschöpfender Provider-Vertrag, Policy-Events und Fehlertaxonomie.
- [dsh-fs](../fs/README.de.md) — der `ctx.fs`-Vertrag, den dieses Backend implementiert.
- [fs-sandbox](../fs-sandbox/README.de.md) — das sandbox-erzwingende Backend, das dieses erweitert.
- [tool-fs](../tool-fs/README.de.md) — die modellseitigen Tools, die `ctx.fs` konsumieren.
- [fs-observation-policy](../fs-observation-policy/README.de.md) — das Policy-Plugin, das Mutationen über die `fs/*`-Events bewacht.
- [Windows-DACL-Erhaltungsnotiz](../../../.agents/notes/archived/bug-fix/2026-07-19-windows-atomic-write-dacl-preservation.md) — warum atomare Ersetzung die Zugriffspolicy des Ziels kopiert.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über `dsh-tool-fs`, das die zeilenfened UTF-8-Inhalte, Mutationsbestätigungen und exakten Provider-Meldungen dieses Providers in begrenzten Retained-Results rendert, während Versionen, Atomar-Schreibmechanik und Verzeichnismetadaten intern bleiben.

#### KV-Cache-Wirkung

Keine direkte Invalidierung; der benannte Consumer besitzt alle Request-Prefix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das lokale Backend ungeeignet ist oder besondere operative Sorgfalt benötigt. Sie sind aktuelle Paketbeschränkungen, kein allgemeiner Dateisystemvergleich oder Aufgabenrückstand.

- **`config.cwd` ist keine Sandbox** — es ist ein Auflösungs-Default, keine Eingrenzung: Absolute Pfade und `..` entkommen ihr. Erzwinge Eingrenzung mit einem strengeren `ctx.fs`-Backend oder einem Berechtigungsplugin auf dem `tools/execute`-Waterfall.
- **Versionstoken hängen von Dateisystem-Metadaten ab** — sie kombinieren Device, Inode, Größe, Nanosekunden-Mtime und Nanosekunden-Ctime; eine Speicherschicht, die keine dieser Fakten für ein Rewrite aktualisieren kann, kann den Stale-Wächter trotzdem überwinden.
- **`editText` hält die gesamte Datei (plus die bearbeitete Kopie) im Speicher** — Streaming existiert nur auf dem Lesepfad.
- **Ein Überschreiben unter dem Limit puffert noch eine Kontextbasis** — `writeText` kann bis zu knapp unter `config.diffBasisMaxBytes` an bisherigem Text zusätzlich zum Aufrufer-eigenen Ersatz behalten; die Grenze deckelt weder den zurückgegebenen `after`-Wert noch den Ganze-Datei-Präsentations-Fallback.
- **Binärerkennung ist asymmetrisch** — Lesen sampelt nur die ersten 8192 Bytes nach NUL, während Bearbeitungen den gesamten Buffer scannen, sodass eine Datei mit einem späten NUL gut liest, aber Bearbeitungen ablehnt.
- **Der Pro-Ziel-Mutations-Lock gilt nur prozessintern** — bewachte Erstellung verwendet weiterhin eine atomare No-Replace-Veröffentlichung über Prozesse hinweg, aber Ersatzschreiber in einem anderen Prozess werden nur erkannt, wenn der optionale Versionswächter ihre Metadatenänderung beobachtet; sie werden nie serialisiert.
- **Bewachte Erstellung erfordert Hard-Link-Unterstützung** — Dateisysteme oder Mounts, die Hard-Link-Veröffentlichung ablehnen, können `createIfAbsent` nicht bedienen; das Backend erhält das fehlende Ziel und meldet `FS_IO_ERROR`.
- **Post-Commit-Aufräumen ist Best Effort** — eine erfolgreiche Veröffentlichung bleibt erfolgreich, wenn das Entfernen ihres Owner-Only-Staging-Verzeichnisses fehlschlägt, und hinterlässt private Rückstände für spätere Operator-Bereinigung.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>

**Laufzeitinvariante:** Es wird kein Begleiter veröffentlicht. Dieses Paket exponiert keine unabhängige Event-Sequenz oder veränderliche Datenbeziehung über die an seinem besitzenden seam erzwungenen Verträge hinaus.
