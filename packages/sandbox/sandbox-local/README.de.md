---
description: "Lokale plattformspezifische Sandbox-Backends für Benutzer und Maintainer, die Prozess-Eingrenzung auf Linux, macOS oder Windows wählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-sandbox-local
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-sandbox-local` grenzt Befehle und ihre Nachkommen auf Linux, macOS und Windows ein, während es Host-Kernel und Dateisystem teilt. Es wählt automatisch einen unterstützten Plattform-Runner und schlägt mit `SANDBOX_UNAVAILABLE` fehl, wenn keiner nutzbar ist, sodass Befehle nie still ohne Eingrenzung laufen. Jede Ausführung meldet `full`- oder `partial`-Durchsetzung plus Denial- und Runner-Failure-Signaturen, sodass Aufrufer eine nicht verfügbare oder kaputte Sandbox von einer Policy-Ablehnung unterscheiden können. Wähle es für host-lokale bash- oder pwsh-Ausführung; verwende einen Container- oder Remote-Executor, wenn der Prozess eine isolierte Umgebung braucht.

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

Mounte diesen Provider hinter `ctx.sandbox` und einem eingegrenzten Executor, und jeder Befehl, den der Executor spawnt, läuft unter der Policy, die du auflöst, eingegrenzt. Das ausgelieferte [Base-Bundle](../../bundle/base/cordis.patch.yml) besitzt die Standard-Policy- und Executor-Verdrahtung.

### Wann es zu wählen ist

Wähle es, wenn Befehle eingegrenzt auf dem Host laufen müssen: Es ist das Standard-Backend für Linux-, macOS- und Windows-Kompositionen, die `ctx.sandbox` mounten. Wähle einen anderen Mechanismus, wenn der Prozess in einer isolierten Umgebung laufen muss — ein Container- oder Remote-Executor ersetzt ganze Fähigkeiten, und dieser Provider teilt Host-Kernel und Dateisystem.

### Minimale Konfiguration

Lade den Sandbox-Service und mounte den Provider; die Defaults unten sind die Auswahlpolicy.

```yaml
- id: sandbox
  name: '@deepseek-ai/dsh-sandbox-local'
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `runnerCommand` | `[]` | Eigenes Runner-argv; bwrap-kompatible Profil-Argumente werden angehängt, volle Durchsetzung wird angenommen, und eingebaute Auswahl und Probes werden übersprungen |
| `runnerFailureSignatures` | `[]` | Groß-/Kleinschreibung-unempfindliche stderr-Teilstrings, die den eigenen Failure-Dialekt des benutzerdefinierten Runners identifizieren; erforderlich mit `runnerCommand` |
| `probeTimeoutMs` | `5,000` | Timeout für jeden funktionalen Probe eines konkurrierenden Runner-Kandidaten |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-sandbox-local) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Eingegrenzte Ausführung und Durchsetzung

Mit dem Provider gemountet läuft ein Befehl unter dem Modus, den du pro Aufruf auflöst. Durchsetzung ist ein gemeldeter Fakt, kein Versprechen: `full` bedeutet, das Backend regiert jeden versprochenen File-Effect, während `partial` bedeutet, es regiert nur eine Teilmenge — die Windows-ACL-Stufe (Everyone- und Hard-Link-Grenzen) und ältere Landlock-ABIs sind die aktuellen Partial-Fälle, sodass ein Consumer, der eine absolute Grenze erfordert, sie ablehnen oder aufzeigen kann. Abgelehnte File-Effects tauchen über den Denial-Dialekt des Backends auf, und ein Runner, der vor der Ausführung des Befehls scheitert, meldet eine strukturierte Runner-Failure-Signatur.

### Fehlschläge und Wiederherstellung

Eine nicht unterstützte Plattform oder ein unbrauchbarer Runner schlägt closed fehl: `confine()` wirft `SANDBOX_UNAVAILABLE` und nennt die Runner-Optionen für die Plattform, und der Consumer zeigt diesen Fehler, statt den Befehl uneingegrenzt zu fahren. Ein Runner, der startet, aber sein Profil ablehnt, wird anhand seiner fatalen stderr-Signatur und Exit-Codes identifiziert, sodass eine kaputte Sandbox nicht mit einem abgelehnten Befehl verwechselt wird. Das `runnerCommand`-Override ist eine Operator-Zusicherung: Es überspringt funktionale Probes und nimmt an, dass der konfigurierte Runner das bwrap-kompatible Profil ehrlich implementiert.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Runner-Auswahl, die plattformspezifischen Profile und die Failure-Dialekte; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) behandelt.

### Runner-Auswahl

Die Auswahl ist zuerst nach Plattform, dann nach Probes: Jede Plattform hat eine Runner-Kette (`linux`: `bwrap` dann Landlock; `darwin`: Seatbelt; `win32`: der ACL-Restricted-Token-Runner). Ein einziger Kandidat wird ohne Probe ausgewählt; konkurrierende Kandidaten werden einmal in Kettenreihenfolge funktional geprobt, und das erste brauchbare Urteil wird für die Lebensdauer des Providers gecacht. Eine Plattform ohne Kette oder eine Kette, in der jeder Probe fehlschlägt, ist nicht verfügbar und schlägt closed bei `confine()` fehl.

### Plattform-Profile

Das bwrap-Profil kombiniert einen schreibgeschützten Host-Root, ein frisches `/dev` und `/proc` aus einem privaten PID-Namespace — Befehle verwalten ihre Nachkommen, können aber keine Host-Prozesse sehen, sodass procfs-Magic-Links die Mounts nicht umgehen können; `workspace-write` fügt ein flüchtiges `/tmp` und ein beschreibbares Workspace-Bind hinzu. Die [private-PID-Notiz](../../../.agents/notes/implemented/bug-fix/2026-08-06-bwrap-private-pid-namespace.de.md) zeichnet die Grenze auf.

Die `@deepseek-ai/node-addon-system/landlock-run`-API liefert den Plattform-Launcher, den funktionalen Probe und das Grant-Vokabular; dieser Provider mappt Modus nur auf Grants und belässt Pfadauflösung und Probe-Parsing beim versionierten Binary.

Das Seatbelt-Profil ist allow-default mit `(deny file-write*)` plus Schreib-Allow-Listen, abgeleitet vom geteilten `writableRoots`-Helper, sodass genau die versprochenen File-Effects des Modus regiert werden; jeder Root wird kanonisiert, weil Seatbelt aufgelöste Pfade matcht (`/tmp` IST `/private/tmp`).

Die Windows-Stufe behält eine deterministische Write-SID und stehende ACE pro Workspace, während jedes lebende Session/Workspace-Paar ein zufälliges privates Temp-Verzeichnis mit eigener SID und widerrufbarer ACE erhält — Sessions, die einen Workspace teilen, teilen seine vorgesehene Schreibberechtigung, ohne die Temp-Berechtigung der anderen zu erben. Ein frischer Provider wählt immer einen neuen Temp-Pfad und SID, sodass Crash-Reste eine wiederaufgenommene Session nicht blockieren oder autorisieren können. Die Stufe meldet `partial`-Durchsetzung, weil das Restricted-Token Everyone behalten muss und NTFS-Hard-Links ein Dateiobjekt über Pfade hinweg aliasen.

### Denial- und Runner-Failure-Dialekte

Jeder Runner-Kernel spricht seinen eigenen Denial-Dialekt, der bei jedem Wrap als `denialSignatures` mitgetragen wird, und `runnerFailureRules` geben die fatale Signatur jedes Runners, sodass Consumer eine Runner-Ablehnung vor dem Prüfen der Denial-Signaturen klassifizieren. Die exakten Strings und Exit-Codes leben in [`src/index.ts`](src/index.ts).

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Runner-Ketten-Auswahl, funktionale Probes, Wrap pro Aufruf, ACL-Grant-Lifecycle |
| [`src/profiles.ts`](src/profiles.ts) | Plattformspezifische Profil-Builder: bwrap-Mounts, Landlock-Grants, Seatbelt-SBPL |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; dieses Paket exponiert keine unabhängige Event-Sequenz oder veränderliche Datenbeziehung über die an seinem besitzenden seam erzwungenen Verträge hinaus. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Beginne mit der Subsystem-Referenz für das geteilte Vokabular, dann der seam-Vertrag, die Consumer und die win32-Stufe.

- [Prozess-Sandbox-Subsystem](../../../docs/subsystems/sandbox.de.md) — Modi, Policy pro Aufruf und Klassifikationsdialekte.
- [Sandbox-seam-Paket](../sandbox/README.de.md) — der Service-Vertrag, den dieser Provider implementiert.
- [Bash-Sandbox-Executor](../../shell/bash-sandbox/README.de.md) — der eingegrenzte bash-Consumer.
- [Windows-ACL-Restricted-Token-Stufe](../sandbox-windows-acl/README.de.md) — das win32-Backend, das dieser Provider mountet.
- [Die Subprozess-Sandbox-Entscheidung](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.de.md) — Capability-Grenze und Runner-Auswahl-Semantik.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über [`dsh-bash-sandbox`](../../shell/bash-sandbox/README.de.md) und [`dsh-tool-bash`](../../shell/tool-bash/README.de.md), die die Durchsetzungs- und Denial-Fakten dieses Providers rendern, während der [`dsh-sandbox`](../sandbox/README.de.md)-seam den `SANDBOX_UNAVAILABLE`-Text besitzt und dieser Provider die Runner-Auswahl besitzt, und Profile bleiben außerhalb des Kontexts.

#### KV-Cache-Wirkung

Keine direkte Invalidierung; die benannten Consumer besitzen alle Request-Prefix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Provider ungeeignet ist oder besondere operative Sorgfalt benötigt. Sie sind aktuelle Paketbeschränkungen, kein allgemeiner Plattformvergleich oder Aufgabenrückstand.

- **Windows-ACL-Durchsetzung ist partial** — das Restricted-Token muss Everyone für die Prozessinitialisierung behalten, sodass externe Objekte, die Everyone Schreibzugriff gewähren, beschreibbar bleiben; NTFS-Hard-Links aliasen zudem ein Dateiobjekt über Workspace- und externe Pfade. Der Provider meldet `enforcement: 'partial'`, statt diese Grenze als voll zu übertreiben.
- **Landlock kann partial sein** — ältere unterstützte Kernel-ABIs grenzen nur die Zugriffsklassen ein, die sie exponieren, gemeldet als `enforcement: 'partial'` statt als voll übertrieben.
- **Seatbelt hängt vom veralteten `sandbox-exec` ab** — macOS liefert es noch aus, aber dieser Provider kann diese private Policy-Engine nicht ersetzen oder proben, wenn Apple sie entfernt.
- **Runner-Auswahl wird für die Provider-Lebensdauer gecacht** — das Installieren, Entfernen oder Reparieren eines Runners erfordert ein Neuladen des Plugins, bevor sich die Auswahl ändert.
- **`runnerCommand` ist eine Operator-Zusicherung** — ein konfigurierter benutzerdefinierter Runner überspringt funktionale Probes und wird angenommen, das bwrap-kompatible Profil ehrlich zu implementieren; ist er selbst ein Bash-Skript, läuft sein Interpreter-Start vor dem Anwenden der Eingrenzung durch dieses Skript.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: unentschiedene Richtungen und offene Fragen. Sie ist explizit nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und angenommene Begründungen leben in den Abschnitten oben, dem Paketcode und den verlinkten Agent Notes.

#### Zukunft: umgebungskohärente Gruppen

Die [Sandbox-Entscheidung](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.de.md) listet ein Beispiel einer umgebungskohärenten Capability-Gruppe (etwa bash plus fs gegen einen Container) als zurückgestellte Phase; sie ist nicht entschieden.

</details>
