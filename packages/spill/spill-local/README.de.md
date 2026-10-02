---
description: "Das lokale Dateisystem-Spill-Backend: wie übergroßer Text in private, sitzungsgebundene Dateien gespeichert und per read oder grep abgerufen wird."
kind: "package-reference"
---

# @deepseek-ai/dsh-spill-local

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-spill-local` speichert übergroßen Text eines Aufrufers in eine private, sitzungsgebundene Datei auf dem Host-Dateisystem und gibt deren Pfad als Locator zurück; ein Retrieval-Hinweis sagt dem Modell, es zu lesen oder zu greppen. Es ist zu mounten, wann immer eine Komposition Spill-Speicher auf derselben Maschine braucht, auf der der Agent läuft. Dateien sind privat für den aktuellen Benutzer, Namen sind nicht vorhersagbar, und die Dateien jeder Session gruppieren sich unter einem stabilen Verzeichnis — so kann ein geteiltes Root weder Ausgaben leaken noch durch einen präparierten Symlink umgeleitet werden. Die Konfiguration wählt das Root und die Aufbewahrungsdauer für die Startup-Bereinigung; Previews und Spill-Entscheidungen leben in anderen Paketen.

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

Dieses Backend in einer Komposition mounten, die Text auf das lokale Dateisystem spillt. Es registriert sich als der `ctx.spillStore`-Service, den das `dsh-spill-policy`-Plugin und andere Aufrufer verwenden.

### Minimale Konfiguration

Das Plugin ohne Config zu laden ist sicher: Dateien landen in einem lazy erzeugten privaten (0700) Prozessverzeichnis unter dem OS-Temp-Verzeichnis. `root` setzen, wenn die Dateien an einem bekannten Ort liegen müssen.

```yaml
- name: '@deepseek-ai/dsh-spill-local'
  config:
    root: /absolute/path/to/spill
    cleanupPeriodDays: 30
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `root` | privates 0700-Temp-Verzeichnis | Root-Verzeichnis für Spill-Dateien; setzen, um sie an einem bekannten Ort zu halten |
| `cleanupPeriodDays` | `30` | Dateialter in Tagen, ab dem die einmalige Startup-Bereinigung sie löschen darf; `0` deaktiviert die Bereinigung |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-spill-local) ist die erschöpfende Quelle für jedes akzeptierte Feld.

### Was zurückkommt

Jeder `saveText`-Aufruf schreibt den vollständigen Text in eine frische Datei und gibt drei Felder zurück: `locator` (den Dateipfad), `bytes` (die exakte UTF-8-Bytezahl) und `retrievalHint` — "Use read with offset/limit, or grep this path to search within it." Ein Consumer zeigt diesen Hinweis dem Modell, das die Datei dann mit seinen gewöhnlichen Datei-Tools lesen oder durchsuchen kann.

### Wo Dateien landen

Dateien werden unter `<root>/session-<hash>/<random>-<safeName>` gespeichert, wobei `session-<hash>` ein kurzer Hash der besitzenden Session-ID ist (damit die Dateien einer Session gruppiert bleiben) und `<random>-<safeName>` ein nicht vorhersagbares Hex-Präfix mit dem auf ein sicheres Pfadsegment bereinigten Vorschlagsnamen des Aufrufers paart. Ein relatives `root` wird vom Arbeitsverzeichnis des Prozesses aufgelöst.

<a id="startup-cleanup"></a>
### Startup-Bereinigung

Ein Best-Effort-Sweep startet nach der Aktivierung, ohne die Service-Verfügbarkeit zu verzögern. Er scannt das konfigurierte Root und frühere `dsh-spill-*`-Standard-Roots unter dem OS-Temp-Verzeichnis, löscht reguläre Dateien, deren Änderungszeit strikt älter als der konfigurierte Cutoff ist, räumt leere Session-Verzeichnisse ab und entfernt nur leere frühere Standard-Roots. Ein langlebiger Prozess sweeped erst wieder nach einem Neustart. Die Disposal wartet auf den Sweep, und ein gleichzeitiger Schreibvorgang erzeugt ein Session-Verzeichnis neu, wenn die Bereinigung es entfernt.

Der Sweep löst Dateisystem-Identitäten auf, folgt Symlinks nie und löscht sie nie und überspringt fremde Einträge. Unter POSIX lässt er nur Roots und Session-Verzeichnisse zu, die dem aktuellen Benutzer gehören, weder für Gruppe noch für Andere beschreibbar sind und über ihren Ahnenpfad vor Ersetzung geschützt sind; beschreibbare Sticky-Temp-Verzeichnisse wie `/tmp` sind erlaubt. Unsichere Pfade erzeugen eine Warnung und bleiben unangetastet. Dateisystem- und Warnsinken-Fehler werden eingedämmt, sodass die Bereinigung weder die Aktivierung noch einen gleichzeitigen Spill-Write scheitern lassen kann.

### Fehler und Wiederherstellung

Ein echter Speicherfehler — Berechtigungen, kein Speicherplatz, ein unbeschreibbares Root — lässt den `saveText`-Aufruf ablehnen; der Aufrufer entscheidet, wie er degradiert. Die mitgelieferte Policy behandelt die Ablehnung als Best-Effort und behält das ursprüngliche Inline-Ergebnis.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Backend; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designphilosophie

Das Backend besitzt nur Speicherdetails, nach einem Prinzip: **Ein gespilltes Artefakt muss privat und nicht umleitbar sein.** Das Root ist privat (0700), das Session-Verzeichnis ist ein stabiler Hash, der Blattname ist nicht vorhersagbar, und der Schreibvorgang ist exklusiv und nur für den Owner. Die Speichermechanik lebt in einem Cordis-freien Modul, damit sie ohne Kontext unit-testbar ist.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Config`, der `LocalSpillStore`-Service, Bereinigungs-Lebenszyklus, Locator- und Retrieval-Hint-Zusammenbau |
| [`src/cleanup.ts`](src/cleanup.ts) | Einmaliger Alters-Sweep, Dateisystem-Identitätsprüfungen, Symlink- und Ownership-Schutz |
| [`src/store.ts`](src/store.ts) | Cordis-freie Speichermechanik: privates Root, Session-Verzeichnis, Safe-Name-Encoding, exklusiver Schreibvorgang |
| — | Es wird kein Runtime-Invariant-Begleitmodul veröffentlicht; dieses Paket legt keine unabhängige Event-Sequenz oder veränderbare Datenrelation jenseits der Contracts offen, die an seinem besitzenden Seam erzwungen werden. |

### Dateibenennung und Schreibvorgang

`suggestedName` ist nicht vertrauenswürdige Eingabe, daher escaped `encodeSegment` jedes Zeichen außerhalb `[A-Za-z0-9._-]` (und `~` selbst) in eine `~XXXX`-Form, wodurch die Abbildung über alle JS-Strings injektiv wird: Trennzeichen, `../`, NUL und absolute Pfade können nie ein Segment verlassen, und die ganzsegmentigen Token `.`/`..` werden ebenfalls escaped. Der Schreibvorgang ist `open(path, 'wx', 0o600)` — er schlägt bei jedem existierenden Pfad fehl, Symlink oder nicht, sodass ein vorab platziertes Ziel ihn nicht umleiten kann. Zwei Saves desselben Vorschlagsnamens erhalten unterschiedliche Zufallspräfixe.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der paketweite Contract nicht ausreicht.

- [Spill-Storage-Service](../spill/README.de.md) — der `saveText`-Contract und das Vokabular, die dieses Backend implementiert.
- [Spill-Paketkarte](../README.de.md) — die Drei-Paket-Familie und jede Rolle.
- [dsh-spill-policy](../spill-policy/README.de.md) — die Policy, die dieses Backend aufruft, wenn ein Ergebnis zu groß ist.
- [Spill-Subsystem](../../../docs/subsystems/spill.de.md) — das erschöpfende Vokabular und die Ownership.
- [Agent Note zur Tool-Output-Spill-Entscheidung](../../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.de.md) — die Capability-Grenze und die Designbegründung.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über Spill-Consumer, die den gespeicherten Dateipfad und die read/grep-Retrieval-Anleitung dem Modell rendern.

#### KV-Cache-Effekt

Keine direkte Invalidierung; der genannte Consumer besitzt alle Request-Prefix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen bestimmen, wann das lokale Backend ungeeignet ist oder besondere Betriebspflege braucht. Sie sind aktuelle Paketbedingungen.

- **Ein langlebiges Deployment wird erst beim Neustart gesweept** — der einmalige Sweep läuft nur nach der Aktivierung, sodass Dateien, die während eines Laufs den Alters-Cutoff überschreiten, beim nächsten Start zurückgeholt werden.
- **Locators erfordern einen Consumer auf demselben Dateisystem** — ein Remote- oder virtuelles Deployment braucht ein anderes `SpillStore`-Backend, dessen Locator und Retrieval-Hinweis dort eine Bedeutung haben.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Richtungen. Sie ist ausdrücklich nicht autoritativ.

#### Zukunft: Zusammenspiel mit Workspace-Confinement

Das Retrieval-Modell setzt voraus, dass die `read`/`grep`-Tools des Modells den zurückgegebenen Pfad prüfen können, auch wenn das Spill-Verzeichnis außerhalb des Session-Arbeitsverzeichnisses liegt. Eine künftige Workspace-Confinement-Policy muss lokale Spill-Pfade entweder explizit erlauben oder ein nicht dateibasiertes Spill-Backend verwenden.

</details>
