---
description: "Workspace-Anweisungskontext für Benutzer und Maintainer, die das Laden und Aktualisieren von AGENTS.md/CLAUDE.md aktivieren, dimensionieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-instructions

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-agent-instructions` versorgt agent mit Workspace-Anleitung aus benutzerglobalen und projektbezogenen `AGENTS.md`-kompatiblen Dateien. Es lädt die zutreffende Kette für die erste Anfrage. Es überwacht externe Änderungen nicht kontinuierlich: Erfolgreiche Dateisystem-Operationen entdecken neu relevante verschachtelte Dateien und machen spätere Änderungen oder Entfernungen sichtbar, während ein Session-Resume die Baseline abgleicht. `dsh-base` aktiviert dieses Verhalten standardmäßig, Profile können es deaktivieren. Ein Byte-Budget begrenzt den injizierten Kontext: Breitere Dateien werden ausgelassen, bevor die spezifischste Datei gekürzt wird, und eine leere Kette fügt nichts hinzu.

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

Mounten Sie dieses Plugin, wenn agent aus den eigenen Anweisungsdateien des Workspace arbeiten sollen. `dsh-base` enthält es bereits mit einem Budget von 65.536 Bytes, daher müssen base-basierte Profile die Zeile nur ersetzen, wenn sie ein anderes `maxBytes` wünschen; Trees ohne Provider laden nichts, bis ein Dateisystem-Provider vorhanden ist.

### Was der agent erhält

Die erste Anfrage enthält eine durable Baseline-Nachricht mit dem benutzerglobalen `$DSH_HOME/AGENTS.md`, gefolgt von der Projektkette — jede existierende Kandidatendatei vom Projektroot bis zum Arbeitsverzeichnis der Session, in der Reihenfolge von breit nach spezifisch. Geschwisterdateien, deren Inhalt nach dem Trimmen übereinstimmt, werden nur einmal gerendert, sodass ein `CLAUDE.md`, das sein `AGENTS.md` dupliziert, nicht wiederholt wird. Nachdem ein erfolgreicher `read`-, `write`- oder `edit`-Aufruf ein tieferes Verzeichnis erreicht, enthält die nächste Anfrage die neu zutreffende Anweisungsdatei; eine geänderte Datei ersetzt ihren Inhalt, und eine Datei, die verschwindet oder einen früheren Kandidaten dupliziert, erzeugt eine Entfernungsnotiz.

### Konfiguration

Die Defaults passen zu einem typischen Checkout: `.git` markiert das Projektroot, `AGENTS.md` und `CLAUDE.md` sind die Basiskandidaten, und `AGENTS.local.md` sowie `CLAUDE.local.md` sind additive lokale Overlays. Nur `maxBytes` ist erforderlich — es begrenzt die vollständig gerenderte Baseline, sodass jedes Deployment sein Prompt-Budget explizit wählt.

Die Root-Erkennung steigt nur auf, wenn ein Marker-Probe bestätigt, dass der Marker fehlt. Ein Berechtigungs- oder I/O-Fehler stoppt die Erkennung und gibt den Host- oder Dateisystem-Provider-Fehler weiter, statt ein Vorfahren-Projekt zu wählen. Die [Root-Marker-Metadaten-Entscheidung](../../../.agents/notes/implemented/bug-fix/2026-09-03-root-marker-metadata-failures.md) dokumentiert, warum die Erkennung fehlschlägt, statt ein anderes Root zu substituieren.

```yaml
- name: '@deepseek-ai/dsh-agent-instructions'
  config:
    maxBytes: 65536
```

Die akzeptierten Felder im Überblick:

```ts
export interface Config {
  dshHome?: string
  projectRootMarkers?: string[]
  maxBytes: number
  maxSourceBytes?: number
  instructionFileCandidates?: string[]
  localInstructionFileCandidates?: string[]
}
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `maxBytes` | erforderlich | Obergrenze für die vollständig gerenderte Baseline-Nachricht, in Bytes |
| `maxSourceBytes` | `1048576` | Obergrenze für eine Quell-Anweisungsdatei vor dem Rendern |
| `projectRootMarkers` | `['.git']` | Verzeichnisnamen, die das Projektroot markieren |
| `instructionFileCandidates` | `['AGENTS.md', 'CLAUDE.md']` | Basisdateinamen, die in jedem Projektverzeichnis geladen werden |
| `localInstructionFileCandidates` | `['AGENTS.local.md', 'CLAUDE.local.md']` | Lokale Overlay-Dateinamen, die nach den Basisdateien geladen werden |
| `dshHome` | `$DSH_HOME` oder `~/.dsh` | Verzeichnis mit dem benutzerglobalen `AGENTS.md` |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.md#deepseek-aidsh-agent-instructions) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Das Budget beobachten

Das Rendering behält die spezifischsten Dateien zuerst: Es verwirft ganze breitere Dateien, bevor die spezifischste Datei gekürzt wird, und gibt eine sichtbare `Workspace instruction budget ...`-Notiz aus, die die ausgelassenen und gekürzten Pfade benennt. Die gerenderten Bytes überschreiten `maxBytes` nie. Eine über Budget liegende breite Datei wird ignoriert; während eines Refresh gilt sie als vorübergehend nicht verfügbar, nicht als entfernt.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Plugin; das beobachtbare Verhalten ist unter [Das Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Das Plugin beruht auf einem Prinzip: Workspace-Anweisungen sind durable Konversationsinhalte, die pro agent und pro Session gehören. Baseline- und Refresh-Nachrichten sind gewöhnliche `user/message`-Events mit Quelle, sodass sie wie andere Historie replayed, compacted und resumed werden können, und der modellsichtbare Zustand ist immer aus dem Session-Log rekonstruierbar. Das Plugin besitzt den gesamten `<system-reminder>`-Rahmen, und jede injizierte Nachricht erreicht das Modell wortgetreu.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: pre-step-Listener, `tools/result`-Touch-Tracking, Inbox-Komposition |
| [`src/config.ts`](src/config.ts) | `Config`-Schema, Budget-Auflösung, Baseline-Identität |
| [`src/files.ts`](src/files.ts) | Kandidatenerkennung, Projektroot-Suche, begrenzte Streaming-Reads |
| [`src/render.ts`](src/render.ts) | Anweisungs-Rendering, Budget-Kürzung, Änderungsdatensätze |
| [`src/state.ts`](src/state.ts) | Durable Nachrichtenquellen, Versions-/Digest-Cache, Abgleich |
| [`src/digest.ts`](src/digest.ts) | SHA-1-Inhaltsidentität und Duplikatschlüssel pro Verzeichnis |
| — | Es wird kein Runtime-Invariant-Begleiter veröffentlicht; Replay toleriert absichtlich unbekannte oder fehlerhafte Workspace-Quellen, während fokussierte Pipeline-Tests die privaten Pending-/Cache-Zustandsübergänge abdecken. |

### Hauptablauf

Beim ersten berechtigten `agent/pre-step` einer Session komponiert das Plugin die Baseline und faltet sie in den eingehenden Batch direkt nach den beanspruchten Nachrichten. Erfolgreiche First-Party-`read`-, `write`- und `edit`-Aufrufe liefern Touches, die über übergeordnete Execution-Token nach oben wandern; sobald der umschließende Step durable ist, gleicht eine Projektion den sichtbaren Session-Zustand mit der Inbox ab und reiht Hinzufügungen, Ersetzungen oder Entfernungen ein. Ein unveränderter Pfad mit unverändertem Digest wird nie erneut injiziert. Die Erkennung folgt strukturierter Dateisystemaktivität statt Shell-Navigation, weil jeder lokale Shell-Aufruf einen frischen Prozess startet und das Parsen beliebiger Shell-Syntax keine zuverlässige Dateisystem-Seam ist.

### Invarianten

Jede injizierte Nachricht trägt eine typisierte Quelle mit ihrer Änderungsliste; eine vollständige Baseline trägt zusätzlich eine aus normalisierter Erkennung, Präzedenz, Projektroot und Budget-Konfiguration abgeleitete Identität, und eine passende durable Nachricht bestätigt eine eingereihte Baseline. Modellsichtbarer Text enthält keine versteckten Zustandsmarker, und literaler `</system-reminder>`-Text in Anweisungsinhalten oder modellsichtbaren Metadaten wird escaped, sodass repo-kontrollierter Text den plugin-eigenen Rahmen nicht schließen kann.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen vom Anweisungsdateiformat zur Designentscheidung und zur erschöpfenden Konfiguration.

- [Dokumentationsstandard](../../../docs/AGENTS.md) — was `AGENTS.md`-Anweisungsdateien enthalten und wie sie gepflegt werden.
- [Workspace-Kontext-Entscheidungsdokument](../../../.agents/notes/archived/feature/2026-06-24-workspace-context.md) — Begründung für Isolation und Lifecycle pro agent/Session.
- [Context-Gruppenkarte](../README.md) — benachbarte Request-Kontext-Pakete.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.md#deepseek-aidsh-agent-instructions) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a> <a id="prompt-shape"></a>
## Model Experience

### Baseline-Kontext

#### Was das Modell sieht

Bei der ersten Anfrage enthält die abgeleitete Historie eine durable Nachricht mit User-Rolle, die die begrenzte benutzerglobale und Projekt-Anweisungskette in der Reihenfolge von breit nach spezifisch enthält. Resume verwendet diese Nachricht wieder, wenn ihre sichtbare Baseline kompatibel ist.

##### Baseline-Anweisungstemplate

```markdown
<system-reminder>
Workspace instructions follow as guidance where applicable. More specific instructions take precedence; they never override system, developer, or direct user instructions.

Instructions from: ~/.dsh/AGENTS.md

<user-global-instructions>

Instructions from: AGENTS.md

<project-instructions>
</system-reminder>
```

#### Token-Effekt

Die gerenderte Baseline wird einmal angehängt und bleibt in der abgeleiteten Historie bis zur compaction. `maxBytes` begrenzt die vollständige Nachricht, breitere Dateien werden ausgelassen, bevor die spezifischste Datei gekürzt wird, und eine leere Kette trägt null Token bei.

#### KV-Cache-Effekt

Append-only nach dem bestehenden wiederverwendbaren Präfix. Resume erhält die Wiederverwendung, wenn die sichtbare Baseline-Identität kompatibel ist; eine inkompatible Identität hängt einen vollständigen Ersatz an, sodass Änderungen an Erkennung, Präzedenz, Projektroot oder Budget die Wiederverwendung nur ab dieser Historienposition beeinflussen.

### Neu entdeckter Scope-Kontext

#### Was das Modell sieht

Nachdem ein erfolgreicher First-Party-Dateisystemaufruf ein tieferes Verzeichnis erreicht, enthält die nächste Anfrage eine retained `user/message` mit Quelle, die die neu zutreffende Anweisungsdatei enthält.

##### Zusätzliches Anweisungstemplate

```markdown
<system-reminder>
Additional instructions from: packages/app/AGENTS.md

Scoped guidance for work under `packages/app`. More specific instructions take precedence; they never override system, developer, or direct user instructions.

<nested-instructions>
</system-reminder>
```

#### Token-Effekt

Jeder entdeckte Scope fügt begrenzte Historien-Token bis zur compaction hinzu. Unveränderte Inhalte werden durch sichtbaren Session-Zustand plus Versions-/Digest-Vergleich unterdrückt, und der PTC-Modus verschiebt dieselbe Nachricht bis nach dem äußeren `run_code`-Ergebnis und seinem umschließenden durable Step.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und invalidiert keine bestehenden KV-Cache-Einträge.

### Geänderter oder entfernter Anweisungskontext

#### Was das Modell sieht

Eine geänderte Datei erzeugt `Updated instructions from: <path>` plus ihren Ersatzinhalt. Ein Kandidat, der verschwindet oder zum Verzeichnis-Duplikat eines früheren Kandidaten wird, erzeugt die unten stehende Entfernungsnotiz.

##### Entfernungsnotiz

```markdown
<system-reminder>
Instructions removed: packages/app/AGENTS.md

They no longer apply.
</system-reminder>
```

#### Token-Effekt

Jede bestätigte Änderung oder Entfernung ist eine retained Historiennachricht, begrenzt durch `maxBytes`. Provider-Fehler fügen keine Nachricht hinzu, und ein durch das Budget ausgelassenes Update bleibt für einen späteren Dateisystem-Touch berechtigt.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und invalidiert keine bestehenden KV-Cache-Einträge.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Laden von Anweisungen ungeeignet ist oder betriebliche Aufmerksamkeit erfordert. Es sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Erkennung folgt strukturierten fs-Tools, nicht Shell-Navigation** — ein `bash`-Befehl, der Verzeichnisse wechselt, löst keine verschachtelte Anweisungserkennung aus, weil Shell-Syntax und pro-Aufruf-Shell-Zustand keine zuverlässige Dateisystem-Seam sind.
- **Refresh ist touch-getrieben** — es gibt keinen Watcher; externe Änderungen werden beim nächsten erfolgreichen First-Party-`read`, `write` oder `edit` sichtbar, wenn ein Resume eine sichtbare Baseline abgleicht, oder wenn ein eingehender pre-step eine überschattete Baseline wiederherstellt.
- **Kandidatensemantik bleibt bewusst klein** — kleingeschriebene Namen, `.claude/rules/` und `@path`-Imports werden nicht interpretiert; Projekt-Scopes laden `AGENTS.local.md`/`CLAUDE.local.md`-Overlays standardmäßig, aber der benutzerglobale `$DSH_HOME`-Scope hat kein lokales Overlay, und andere eigene Namen erfordern explizite Kandidatenkonfiguration.
- **Deduplizierung pro Verzeichnis ist inhaltsbasiert** — Geschwisterkandidaten kollabieren nur, wenn sie nach dem Trimmen führender und nachfolgender Whitespace byteweise identisch sind; ein `CLAUDE.md`, das auf sein Geschwister-`AGENTS.md` symlinkt, löst zum selben Inhalt auf und kollabiert wie jedes Duplikat, während eine eigenständige, von `AGENTS.md` abgewichene echte Kopie vollständig daneben geladen wird.
- **Symlink-Anweisungsdateien werden über die Vertrauensgrenze hinweg verfolgt** — ein Kandidat, dessen letzte Komponente ein Symlink ist, wird aufgelöst und sein Ziel geladen, sodass ein geklontes Repository Dateiinhalte außerhalb des Trees als Workspace-Anleitung mit geringerer Autorität einblenden kann (sie überschreiben nie System-, Developer- oder direkte Benutzeranweisungen). Begrenzen Sie `ctx.fs` mit dem Dateisystem-Policy-Gate oder einer OS-Sandbox, wenn Sie nicht vertrauenswürdige Repositories laden.
- **Anweisungsinhalte sind begrenzt, nicht zusammengefasst** — über Budget liegende breite Dateien werden ausgelassen und die spezifischste Datei kann gekürzt werden; das Plugin bittet ein Modell nie, Anweisungsprosa zu komprimieren.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
