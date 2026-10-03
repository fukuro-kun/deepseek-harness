---
description: "Die modellseitigen glob- und grep-Discovery-Tools für Benutzer und Maintainer, die Workspace-Suche für agent komponieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-fs-search
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Verwenden Sie `dsh-tool-fs-search`, um Modellen `glob`-Dateidiscovery und `grep`-Inhaltssuche über einem lokalen Workspace zu geben. Suchen benötigen keine Host-`rg`-Installation und keinen Dateisystem-Provider, liefern workdir-relative Ergebnisse und schließen versteckte und ignorierte Dateien ein, während VCS-Metadaten ausgeschlossen werden. Konfigurierbare Obergrenzen begrenzen die Inline-Ausgabe; mit einem optionalen spill-Store bleiben gekappte Ergebnisse vollständig wiederherstellbar. Wählen Sie das Schwesterpaket `dsh-tool-fs` zum Lesen, Schreiben oder Editieren von Dateien.

## Inhaltsverzeichnis

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Das Paket verwenden

Mounten Sie die Tools nach einem `ctx.subprocess`-Backend; keine Host-`rg`-Installation nötig, und kein Dateisystem-Provider erforderlich. Das Modell erhält dann nach Änderungszeit sortierte Dateidiscovery und zeilenorientierte Inhaltssuche, beide begrenzt und timeout-geschützt.

### Minimale Komposition

Ein Subprocess-Backend, dann die Tools; das spill-Backend ist optional und macht gekappte Ergebnisse vollständig wiederherstellbar.

```yaml
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-tool-fs-search'
  config:
    sampleOverCapGlobResults: false
- name: '@deepseek-ai/dsh-spill-local'
```

`sampleOverCapGlobResults` ist erforderlich und hat keinen Fallback: Deployments wählen den Ordnungsvertrag für Überschreitungen explizit. Bei erfolgreichem formatiertem spill bewahren beide Modi die vollständige sortierte Liste im spill-Artefakt.

### Die Tools

| Tool | Argumente | Verhalten |
|---|---|---|
| `glob` | `pattern`, `path?` | Findet Dateien, deren Pfade einem Glob-Pattern entsprechen, einschließlich versteckter und ignorierter Dateien, aber ohne VCS-Metadaten; ein Pattern ohne `/` matcht Basenames in beliebiger Tiefe, sodass `*` den ganzen Tree matcht; vollständige Ergebnisse bleiben nach Änderungszeit sortiert |
| `grep` | `pattern`, `path?`, `include?` | Durchsucht Dateiinhalte mit einer ripgrep-Regex und gibt Matches gruppiert nach Datei als `Line N: <preview>` zurück; `include` ist ein positiver Glob-Filter, kommagetrennte Listen und negierte Werte werden vorn abgelehnt |

Routine-Budgets bleiben aus dem modellseitigen Schema heraus: Ein Modell, das Umgebungskontext braucht, liest die gematchte Datei mit `read`, und eines, das spätere Ergebnisse braucht, folgt dem Retrieval-Hinweis des zurückgegebenen spill-Locators.

### Konfiguration

`sampleOverCapGlobResults` ist erforderlich; die übrigen Keys sind optionale Suchobergrenzen mit den folgenden Defaults.

| Key | Standard | Bedeutung |
|---|---|---|
| `sampleOverCapGlobResults` | keiner (erforderlich) | `true` sampelt eine über der Obergrenze liegende `glob`-Seite über Top-Level-Einträge; `false` behält den nach Änderungszeit sortierten Kopf |
| `globMaxResults` | `100` | Maximale Pfade, die ein `glob`-Aufruf inline anzeigt |
| `grepMaxMatches` | `250` | Maximale flache Matches, die ein `grep`-Aufruf inline behält; spätere Matches gehen in das formatierte spill-Artefakt |
| `grepMaxLineBytes` | `2000` | Byte-Obergrenze pro gematchter Zeilenvorschau, unter Wahrung von UTF-8-Grenzen |
| `rawOutputMaxBytes` | `20000000` | Maximales vollständiges rohes `rg`-stdout, das eine Suche parst; größere Rohausgabe schlägt mit `SEARCH_RAW_OUTPUT_OVERFLOW` fehl |
| `timeoutMs` | `30000` | Kooperatives Tool-Call-Budget auf beiden Tools, durchgesetzt über `exec.signal` |
| `graceMs` | `3000` | Terminate-Eskalationsfrist, die die Subprocess-Seam über `timeoutMs` hinaus gewährt |
| `stderrMaxBytes` | `65536` | Diagnose-Endstück-Budget für `rg`-stderr |
| `searchMetaMaxBytes` | `65536` | Maximale Bytes des serialisierten `presentationMeta` einer Suche; darüber hinaus werden hintere Gruppen/Pfade verworfen |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-fs-search) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Deployment-Anforderung

Node-Deployments erhalten das `@vscode/ripgrep`-Plattformpaket auf unterstützten macOS-, Linux- und Windows-Zielen; Python-SDK-Wheels kopieren die zielnative Binärdatei neben die Single-File-Runtime als `-rg`-Begleitdatei. Kein Träger erfordert ein Host-`rg`. Zurückgegebene Pfade werden relativ zum aufgelösten workdir angezeigt (das cwd der aufrufenden Session, sofern vorhanden) und sind nur dann mit `read` weiterlesbar, wenn dieses workdir und das Dateisystem-Root denselben Workspace bezeichnen.

### Fehler und Wiederherstellung

Suchfehler tragen die paketeigenen Codes `SEARCH_INVALID_PATTERN` (ripgrep hat die Regex oder das Glob abgelehnt), `SEARCH_FAILED` (fehlgeschlagener Start, unzugängliches Ziel, Signal-Kill oder fehlerhafte `--json`-Ausgabe), `SEARCH_RAW_OUTPUT_OVERFLOW` (Rohausgabe über der Obergrenze) und `SEARCH_ABORTED` (kooperativer Timeout oder Caller-Abbruch). Exit 0 ist Erfolg mit Ergebnissen und Exit 1 eine erfolgreiche leere Suche; Argumentfehler des Modells bleiben gewöhnliche Tool-Argumentfehler.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter den Suchtools und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig unter [Das Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Lokale Workspace-Discovery ist naturgemäß ein prozessgestützter `rg`-Workflow, und Suche auf `ctx.fs` zu legen würde jedes Dateisystem-Backend zwingen, eine Such-API anzubauen. Die Subprocess-Seam besitzt Spawn-Ausführung, Prozessbaum-Terminierung, Umgebungsbereinigung und begrenzte Ausgabeerfassung; dieses Paket besitzt Schemas, Argumentvalidierung, argv-Konstruktion, Parsing, Retention, formatierten Ergebnis-spill und Timeout-Deklaration. Die Tools exponieren nie einen Background-Job — der Aufruf kehrt erst zurück, nachdem `rg` beendet ist, vom kooperativen Timeout terminiert wurde, abgebrochen oder fehlgeschlagen ist.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Config`, Tool-Komposition, Obergrenzenvalidierung |
| [`src/glob.ts`](src/glob.ts) | `glob`-Schema, argv, Parsing, Inline-Sampling, Formatierung |
| [`src/grep.ts`](src/grep.ts) | `grep`-Schema, argv, `--json`-Parsing, Preview-Retention, Formatierung |
| [`src/search-core.ts`](src/search-core.ts) | Gemeinsamer Spawn-Helper, `SEARCH_*`-Fehler, spill-Übergabe, workdir-relative Anzeige |
| [`src/presentation.ts`](src/presentation.ts) | Metadatenprojektion der Suchkarte |
| [`src/direct-call.ts`](src/direct-call.ts) | Direct-Call-Ergebnisannahme für spill-Nachbearbeitung |

### Wie eine Suche läuft

Jeder Aufruf löst die paketierte Binärdatei auf (`@vscode/ripgrep` oder die `-rg`-Begleitdatei der Executable in einer pkg-Single-File-Runtime), stellt `--no-config` voran, damit ein Host-`RIPGREP_CONFIG_PATH` keinen `--pre`-Präprozessor in den unbeschränkten Spawn injizieren kann, und übergibt jeden modellkontrollierten Wert als einfaches argv-Element — es gibt keine Shell-Schicht, also gilt kein Quoting. Collect-Modus-Budgets begrenzen vollständiges stdout und ein stderr-Endstück; ein verlustbehafteter stdout-Read schlägt als `SEARCH_RAW_OUTPUT_OVERFLOW` fehl, statt einen still partiellen Stream zu parsen. Die Tools lesen nie einen rohen spill-Pfad.

### Zwei Budgets, zwei Artefakte

Rohes stdout und stderr sind interne Transportdetails; die Tools sammeln das vollständige Ergebnis immer im Speicher, und nur die Inline-Seite ist gekappt. Liefert ein Aufruf mehr logische Ergebnisse als die Inline-Obergrenze, speichert ein best-effort-spill die vollständige formatierte Vorschau im spill-Store, und die Seite trägt seinen Locator, während Dispatches, deren voller Wert nie in den Modellkontext gelangt, den spill überspringen. Fehlender oder fehlgeschlagener spill behält die Inline-Seite und meldet, dass das vollständige Ergebnis nicht gespeichert werden konnte — nie ein Fehler. Sammlung und spill-Übergabe liegen in `src/search-core.ts` und `src/presentation.ts`.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen von den Tools zur Subprocess-Seam, zum spill-Store und zur Dateisystem-Familie.

- [Filesystem-Subsystem](../../../docs/subsystems/filesystem.de.md) — erschöpfender Provider-Vertrag, Policy-Events und Fehlertaxonomie.
- [tool-fs](../tool-fs/README.de.md) — die Schwester-`read`/`write`/`edit`-Tools für Folge-Reads.
- [Subprocess-Fähigkeit](../../../docs/subsystems/subprocess.de.md) — die Spawn-Seam, über die diese Tools ausführen.
- [Spill-Store](../../spill/spill/README.de.md) — das optionale Backend, das gekappte Ergebnisse vollständig wiederherstellbar macht.
- [Timeout-Utility](../../util/timeout/README.de.md) — die `MAX_TIMER_DELAY_MS`-Grenze der Terminate-Grace.
- [Generierter Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-fs-search) — die erschöpfenden Schemas, die dieses Paket registriert.

-----

<a id="model-experience"></a>
## Model Experience

### System-Prompt

#### Was das Modell sieht

Zur Assemblierungszeit prüft jede Sektion `ctx.tools.get(name, scope)` und rendert nur, solange ihr Tool sichtbar ist. Der grep-Absatz enthält seinen read-Folgesatz nur, solange read sichtbar ist. Der Originaltext und die Sektionsreihenfolge bleiben für denselben unterstützten Tool-Satz unverändert, einschließlich PTC-Fähigkeiten hinter `run_code`. Diese scope-abhängige Textauswahl gilt für System-Prompt-Sektionen. Tool-Schema-Beschreibungen bleiben Registrierungstext; insbesondere empfiehlt das grep-Schema read weiterhin, selbst in einem Scope, der read verbirgt. Scope-abhängige Schema-Formulierung ist nicht implementiert.

##### Glob-Anleitung mit `sampleOverCapGlobResults: true`

```markdown
Use the glob tool — not shell find — to discover files by path pattern. A pattern with no "/" matches basenames at any depth, so "*" matches every file in the tree rather than its top level. Results are files only, never directories, and include hidden and ignored files: a result that fits comes back in modification-time order, while a larger one is sampled across top-level entries, so it spans the tree instead of one subtree.
```

##### Glob-Anleitung mit `sampleOverCapGlobResults: false`

```markdown
Use the glob tool — not shell find — to discover files by path pattern. A pattern with no "/" matches basenames at any depth, so "*" matches every file in the tree rather than its top level. Results are files only, never directories, and include hidden and ignored files: a result that fits comes back in modification-time order, while a larger one keeps the modification-time-ordered head.
```

##### Grep-Anleitung

```markdown
Use the grep tool — not shell grep or rg — to search file contents. Use read on a matched file when you need surrounding context.
```

#### Token-Effekt

Die Anleitungskosten folgen den sichtbaren Tools; die erforderliche Sampling-Wahl wählt eine glob-Variante.

#### KV-Cache-Effekt

Präfix-stabil, solange sichtbarer Tool-Satz, Plugin-Scope, Sampling-Wahl und Anleitungstext unverändert sind. Restriktionen, Aktivierung, dispose oder Änderung der Wahl können die Wiederverwendung ab der ersten geänderten Sektion invalidieren.

### Tool-Schemas

#### Was das Modell sieht

Die glob-Beschreibung nennt die konfigurierte Ordnung bei Überschreitung. Die generierten [`glob`- und `grep`-Schemas](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-fs-search) verwenden `sampleOverCapGlobResults: true`; die Tools werden bedingungslos registriert.

#### Token-Effekt

Feste Schema-Kosten bei jeder Anfrage, in der die Tools sichtbar sind.

#### KV-Cache-Effekt

Präfix-stabil, solange Tool-Sichtbarkeit und -Definitionen unverändert sind. Registrierungs-Lifecycle oder Scoped-Restriktionen können die Wiederverwendung ab dem ersten geänderten Schema-Token invalidieren.

### Ergebnisse und spill-Hinweise

#### Was das Modell sieht

`glob` gibt einen Pfad pro Zeile zurück; `grep` gruppiert `Line <line>: <preview>`-Matches unter jedem Pfad. Leere Suchen geben `No files found` oder `No matches found` zurück. Ein gekapptes Ergebnis endet mit seiner Auslassungsanzahl plus spill-Locator und Retrieval-Hinweis des Backends, oder sagt, dass das vollständige Ergebnis nicht gespeichert werden konnte. Mit `sampleOverCapGlobResults: true` nimmt eine über der Obergrenze liegende `glob`-Seite Pfade im Round-Robin über die Einträge unmittelbar unter dem tatsächlichen Such-Root, und der Footer nennt die Sampling-Basis und wie viele Top-Level-Einträge erreicht wurden; mit `false` ist die Seite der nach Änderungszeit sortierte Kopf und behält den schlichten Capped-Result-Footer. Das spill-Artefakt hält immer die vollständige Liste in Änderungszeit-Reihenfolge.

#### Token-Effekt

Inline-Pfade und -Matches sind durch `globMaxResults`, `grepMaxMatches` und `grepMaxLineBytes` begrenzt; Aufruf und retained Ergebnis bleiben bis zur compaction in der Historie.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und invalidiert keine bestehenden KV-Cache-Einträge.

### Tool-Fehler

#### Was das Modell sieht

Fehler werden als `Error: <message>` normalisiert, mit strukturierten `SEARCH_INVALID_PATTERN`-, `SEARCH_FAILED`-, `SEARCH_RAW_OUTPUT_OVERFLOW`- oder `SEARCH_ABORTED`-Metadaten für Aufrufer.

#### Token-Effekt

Nur ein fehlschlagender Aufruf fügt diese retained Token hinzu.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und invalidiert keine bestehenden KV-Cache-Einträge.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die Suchtools ungeeignet sind oder besondere betriebliche Sorgfalt brauchen. Es sind aktuelle Paket-Constraints, kein allgemeiner Suchvergleich und kein Aufgabenrückstand.

- **Suche und Dateizugriff haben keinen Shared-Workspace-Nachweis** — zurückgegebene Pfade sind nur dann weiterlesbar, wenn workdir und Dateisystem-Root denselben Workspace bezeichnen; das Paket führt keine Laufzeit-Quer-Service-Validierung durch.
- **Die paketierte Binärdatei ist auf die Dependency-Version fixiert** — Node-Deployments verwenden die von `@vscode/ripgrep` gewählte Version; Python-Single-File-Runtimes kopieren diese zielnative Version in die erforderliche `-rg`-Begleitdatei. Eine nicht unterstützte Plattform oder eine beschädigte Installation schlägt mit `SEARCH_FAILED` fehl, während das Python-Runtime-Paket eine fehlende Begleitdatei vor dem Start ablehnt. Remote- oder virtuelle Dateisysteme brauchen einen co-located Workspace oder einen anderen Such-Consumer.
- **Die Schemas exponieren eine begrenzte Seite** — Offset-Paginierung, Case-Mode-Schalter, alternative Ausgabemodi und provider-gestützte Discovery bleiben außerhalb dieses Pakets; gekappte vollständige Ausgabe erfordert ein spill-Backend.
- **Sampling, falls aktiviert, gruppiert nur nach dem ersten Pfadsegment unter dem Such-Root** — eine über der Obergrenze liegende `glob`-Seite balanciert über diese Top-Level-Einträge, sodass ein tiefer konzentriertes Ergebnis unterhalb dieser Ebene weiterhin ungleichmäßig dargestellt wird; rekursive Balancierung ist zurückgestellt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Dieser modellseitige Adapter hat keinen eigenen Lifecycle-Stream; Ausführungsbeziehungen gehören der Capability-Seam, die er aufruft.
