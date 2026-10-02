---
description: "In-App-Browse-Backend der directory-picker seam: einstufige Verzeichnisauflistung und Unterverzeichnis-Erstellung für den Web-GUI-Host, die auch Remote-Clients bedient."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-directory-picker-browse

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Nutzer, die keinen OS-Chooser erreichen können, wählen ihr Workspace-Verzeichnis trotzdem über `dsh-host-directory-picker-browse`: Es stellt einstufige Verzeichnisauflistung und Unterverzeichnis-Erstellung über die Node-Standardbibliothek bereit, und nichts wird auf dem Host-Display gerendert — damit bedient es die Remote-Clients, die das native Backend nicht erreicht. Auflistungen liefern nur Verzeichnisse, nach Namen sortiert, mit Verfolgung von Symlinks auf Verzeichnisse und einem host-seitig bestimmten `hidden`-Flag; die Erstellung ist nicht rekursiv und validiert ein einzelnes Pfadsegment. Eine einzelne Kompositionszeile füllt außerdem die Verzeichnis-Lücken des Workspace-Flows mit dem In-App-Dialog **Select Workspace Directory**.

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

Komponieren Sie dieses Backend, wenn ein Workspace-Verzeichnis ohne OS-Chooser gewählt werden muss — Remote-Browser, SSH-weitergeleitete Sessions oder unbeaufsichtigte Hosts. Der Workspace-Flow steuert `directoryPicker/list` und `directoryPicker/createDirectory`; beide Primitive antworten aus dem Host-Dateisystem.

### Ein Verzeichnis auflisten

`list(path?)` liefert eine Verzeichnisebene: namenssortierte Unterverzeichnisse mit ihren absoluten Pfaden, ein `hidden`-Flag (punktpräfixiert unter POSIX), einen `home`-Anker und `crumbs` — die Ahnenkette von der Wurzel bis zum Ziel, in der jeder crumb ein Sprungziel ist und die Wurzel mit ihrem vollständigen Pfad beschriftet wird. Ein fehlender Pfad listet das Home-Verzeichnis des Host-Kontos. Ein Aufruf liefert höchstens `maxEntries` Zeilen (Konfiguration, Standard 1.000 — dieselbe Schranke, die GitHubs Web-UI auf Verzeichnisauflistungen anwendet), und eine abgeschnittene Ebene meldet `truncated: true`, damit der Client anzeigen kann, dass die Ebene unvollständig ist. Symlinks auf Verzeichnisse werden verfolgt; kaputte und zyklische Links werden übersprungen.

### Ein Verzeichnis erstellen

`createDirectory(path, name)` erstellt ein Unterverzeichnis unter einem bestehenden Elternverzeichnis. Es ist nicht rekursiv — ein fehlendes Elternverzeichnis ist ein echter Fehler, keine zu erfindende Ebene — und lehnt alles außer einem einzelnen nicht-leeren Pfadsegment ab (`name` darf keine Trennzeichen enthalten und nicht `.` oder `..` sein).

### Beobachtbare Fehler

Beide Primitive lehnen einen Pfad, der nicht vollqualifiziert ist — relative Formen sowie unter Windows die wurzelhaften laufwerklosen Formen (`\foo`, `/foo`) und unvollständige UNC-Präfixe, die `isAbsolute` akzeptiert — mit `directory-unreadable` oder `directory-create-failed` ab, statt ihn unter dem Arbeitsverzeichnis des Host-Prozesses aufzulösen. Das Erstellen eines bereits existierenden Unterverzeichnisses antwortet `directory-exists`. Das `AbortSignal` des Aufrufers stoppt einen laufenden Scan, sodass ein Disconnect oder Timeout den Scan nicht länger als den Aufrufer überleben lässt.

### Konfiguration

| Feld | Standardwert | Bedeutung |
|---|---|---|
| `maxEntries` | `1,000` | Vollständigkeits-Schranke einer Auflistungsebene; versteckte Zeilen zählen mit |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-host-directory-picker-browse) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

### Designkonzept

Das Backend streamt eine Verzeichnisebene durch ein begrenztes, namenssortiertes Fenster, sodass der Speicher unabhängig von der Anzahl der Kindelemente O(maxEntries) bleibt: Eine abgeschnittene Ebene behält den namenssortierten Kopf, versteckte Zeilen zählen gegen die Schranke, nur Fenster-Kandidaten werden geprüft, und die Ebene meldet `truncated: true`. Die Fenster-Einfügung ist binär mit einer O(1)-Ablehnung am Ende des vollen Fensters, sodass eine übergroße Ebene pro Kandidat hinter dem Kopf O(1) kostet statt eines Fenster-Scans.

### Die Vollqualifikations-Schranke

`fullyQualified` lehnt jeden Pfad ab, der nicht unabhängig vom Prozesszustand genau einen festen Dateisystem-Ort benennt: POSIX-absolut unter POSIX; unter Windows nur laufwerksqualifizierte (`C:\…`) oder vollständige UNC- (`\\server\share…`) Formen. Wurzelhafte laufwerklose Formen und unvollständige UNC-Präfixe bestehen `isAbsolute`, lösen sich aber trotzdem gegen das aktuelle Laufwerk des Prozesses auf, also lehnt das Backend sie ab, statt einen wire-Wert umzubasieren.

### Abbruch und Prüfung

Jedes Dateisystem-await läuft gegen das Signal des Aufrufers (`raceAbort`), sodass ein hängendes Netzwerk-Dateisystem die Anfrage eines abgereisten Aufrufers nicht am Leben hält; die späte Settlement eines abgebrochenen Reads wird geschluckt. Die Betretbarkeit eines Symlinks entscheidet ein `stat`-Probe — ein Fehlschlag bedeutet nicht betretbar — und ein kaputter Symlink im Fenster wird nicht aus jenseits des Fensters nachgefüllt, weil eine Verdrängung die Ebene bereits als abgeschnitten markiert hat.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `BrowseDirectoryPicker`-Service: Auflistung, Erstellung, begrenztes Fenster, Fehler-Mapping |
| — | Es wird kein Runtime-invariant-Begleitexport veröffentlicht; jedes list/create ist ein zustandsloser Dateisystem-Roundtrip; das Dateisystem selbst ist der autoritative Zustand. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Backend-Vertrag nicht ausreicht: zuerst die seam-Definition, dann der Entscheidungsrekord und die native Alternative.

- [Directory-picker seam](../directory-picker/README.de.md) — der `browse`-Capability-Vertrag und das typisierte Fehlervokabular.
- [Directory-picker Capability-Seam-Entscheidung](../../../.agents/notes/archived/architecture/2026-07-28-directory-picker-capability-seam.md) — die Policy-Entscheidungen hinter Auflistung und Erstellung.
- [Natives Backend](../directory-picker-native/README.de.md) — die OS-Chooser-Alternative für lokale Operatoren.
- [Adaptiver Chooser](../directory-picker-auto/README.de.md) — die Boot-Zeit-Auflösung zwischen den beiden Backends.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-host-directory-picker-browse) — jedes akzeptierte Konfigurationsfeld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das GUI-Host-Picking-Backend nichts Modell-seitiges registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket stellt weder eine Provider-Anfrage zusammen noch sendet es eine.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo die Browse-Interaktion unvollständig oder bewusst nicht abgegrenzt ist. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Windows-hidden-Attribut wird nicht gelesen** — Node-dirents exposieren `FILE_ATTRIBUTE_HIDDEN` nicht, also bedeutet `hidden` auf jeder Plattform punktpräfixiert, bis sich ein natives Probe lohnt.
- **Keine Aufzählung von Laufwerkswurzeln** — unter Windows endet die Ahnenkette an der Laufwerkswurzel; das Überschreiten von Laufwerken wartet auf die Pfad-Eingabe-Möglichkeit der Browser-UI statt auf ein Aufzählungs-Primitiv hier.
- **Gesamtdateisystem-Reichweite** — es gibt keine deployment-bezogene Browse-Root-Beschränkung; `workspace.create` akzeptiert beliebige Pfade, sodass eine Wurzel hier eine UX-Abgrenzung wäre, keine Sicherheitsgrenze.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
