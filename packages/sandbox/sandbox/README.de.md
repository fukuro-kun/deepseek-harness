---
description: "Der Prozess-Sandbox-Service-Vertrag für Nutzer und Maintainer, die Same-World-Subprocess-Einschränkung komponieren, nutzen oder erweitern."
kind: "package-reference"
---

# @deepseek-ai/dsh-sandbox
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Verwenden Sie `dsh-sandbox`, um einen Subprocess und alles, was er spawnt, unter einer pro-Aufruf-Dateizugriffs-Policy laufen zu lassen. Ein Kommando kann ohne Schreibzugriffe (`read-only`), nur innerhalb seines Workspace schreibend (`workspace-write`) oder uneingeschränkt (`danger-full-access`) laufen. Wenn der angefragte Modus nicht durchsetzbar ist, schlägt der Aufruf mit `SANDBOX_UNAVAILABLE` fehl, statt uneingeschränkt zu laufen. Nach einem abgelehnten Aufruf kann das Modell einen strikt weiteren Modus zur menschlichen Genehmigung anfragen. Dies ist Same-World-Einschränkung: Der Prozess teilt weiterhin Kernel und Dateisystem des Hosts; verwenden Sie einen Container, eine microVM oder einen Remote-Executor, wenn die gesamte Umgebung isoliert sein muss.

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

Komponieren Sie diesen Service mit einem Backend und einem eingeschränkten Consumer, und jedes Kommando, das der Consumer ausführt, läuft unter der Policy, die Sie auflösen — Sie sehen nur das Einschränkungsergebnis und seine Durchsetzungs-Vollständigkeit, niemals den Plattform-Runner.

### Wann Sie es wählen

Wählen Sie dieses Paket, wenn eine Komposition Subprocesses auf dem Host einschränkt: Es ist der Vertrag, den die lokalen Backends und die eingeschränkten Executors beide implementieren, sodass `sandbox-local` hinter `ctx.sandbox` und ein eingeschränkter Executor hinter `ctx.shell` jedem bash- oder pwsh-Aufruf einen eingeschränkten Default geben. Wählen Sie etwas anderes, wenn der Prozess in einer isolierten Umgebung laufen muss — ein Container, eine microVM oder ein Remote-Executor ersetzt die gesamte `ctx.shell`/`ctx.fs`-Capability, statt hier ein Backend hinzuzufügen.

### Ein Kommando einschränken

Mounten Sie den Service mit einem Backend und einem eingeschränkten Executor; das [Base-Bundle](../../bundle/base/cordis.patch.yml) besitzt die ausgelieferte Komposition.

```yaml
- id: sandbox
  name: '@deepseek-ai/dsh-sandbox-local'     # the per-platform backend provider (ctx.sandbox)
- id: sandbox-policy
  name: '@deepseek-ai/dsh-sandbox-policy'    # the deployment default mode and workspace-write root
  config:
    mode: workspace-write                    # the deployment default every session starts from
    workspaceRoot: !!js process.cwd()        # the boundary workspace-write may write under
- id: bash
  name: '@deepseek-ai/dsh-bash-sandbox'      # the confined executor behind ctx.shell
```

Mit dieser Komposition läuft ein bash-Aufruf eingeschränkt unter `workspace-write`: Schreibzugriffe innerhalb des Workspace gelingen, Schreibzugriffe außerhalb werden abgelehnt, und das Modell kann über den Eskalationsfluss unten wiederherstellen.

### Modi und Durchsetzung

Der Modus benennt die Datei-Effekte, die ein Kommando ausführen darf; die Durchsetzungs-Vollständigkeit berichtet, wie vollständig das Backend sie abdeckt.

| Modus | Effekt |
|---|---|
| `read-only` | Lehnt Schreibzugriffe ab, außer erforderlichen Sinks wie `/dev/null` |
| `workspace-write` | Erlaubt Schreibzugriffe unter der Workspace-Root plus einem backend-definierten Temp-Bereich |
| `danger-full-access` | Umgeht die Einschränkung; der Consumer spawnt sein originales argv |

Durchsetzung wird pro Aufruf berichtet: `full` bedeutet, das Backend deckt jeden versprochenen Datei-Effekt ab, während `partial` bedeutet, ein aktives Backend oder eine ältere Kernel-ABI deckt nur eine Teilmenge ab — die Windows-ACL-Stufe und ältere Landlock-ABIs sind die aktuellen Partial-Fälle, sodass ein Consumer, der die absolute Grenze braucht, sie ablehnen oder hochreichen kann.

### Abgelehnte Aufrufe und Eskalation

Wenn ein eingeschränkter Aufruf abgelehnt wird, berichtet die Operation einen Ablehnungsmarker, der den Modus benennt — `[sandbox: file access denied under <mode> mode]` — und, wenn die Komposition Eskalation anbietet, einen Eskalationshinweis. Das Modell darf den exakten Aufruf einmal mit `sandbox_permissions` (dem engsten weiteren Modus, der genügt) plus einer `justification` wiederholen; der Nutzer sieht einen Genehmigungs-Prompt und kann einmal erlauben, ablehnen oder abbrechen. Die Eskalation muss strikt weiter sein als der effektive Modus des Aufrufs und gilt nur für diesen einen Aufruf.

### Fail-Closed-Verhalten

Wenn kein Backend den angefragten Modus durchsetzen kann, schlägt der Aufruf mit `SANDBOX_UNAVAILABLE` fehl, statt uneingeschränkt zu laufen; der Fehlertext benennt den fehlenden Plattform-Runner. Ein Backend, das nach dem Start fehlschlägt, meldet zusätzlich eine strukturierte Runner-Fehler-Signatur, sodass eine defekte Sandbox von einem Kommando-Fehler unterscheidbar ist.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Design-Entscheidungen hinter dem Vertrag und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig behandelt.

### Design-Philosophie

- **Same-World per Vertrag.** `ctx.sandbox` wrappt argv unter einer Host-Pfad-Datei-Policy; Container, microVMs und Remote-Ausführung ersetzen stattdessen die umgebende Capability-Seam.
- **Policy reitet auf dem Aufruf.** `SandboxPolicy` wird pro Aufruf getragen, niemals am Provider fixiert: Zwei Consumer können im selben Moment unter verschiedenen Policies eingeschränkt sein, und ein eskalierter Retry ist ein neuer Aufruf mit einer weiteren Policy. Defaulting und Auflösung sind explizite Consumer-Schritte.
- **Fail closed.** `confine()` gibt durchgesetztes argv zurück oder wirft `SandboxUnavailableError`; stille uneingeschränkte Durchleitung ist verboten, und funktionale Probes schlichten Multi-Runner-Ketten.
- **Ein Vokabular für Ablehnung und Eskalation.** Die Marker- und Hinweistexte sowie die strikt-weitere Leiter leben hier, damit die bash- und fs-Familien nicht auseinanderdriften.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `SandboxProvider`-Service, Modus-/Durchsetzungs-/Policy-Typen, Fail-Closed-Fehler |
| [`src/escalation.ts`](src/escalation.ts) | Eskalationsvokabular: Weiter-Modus-Leiter, Argument-Validierung, Ablehnungs- und Hinweismarker, Genehmigungs-Choreografie |
| [`src/roots.ts`](src/roots.ts) | Writable-Root-Ableitung, geteilt vom Seatbelt-Profil und dem In-Process-fs-Fence |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; dieses Paket exponiert keine unabhängige Event-Sequenz oder mutable Datenrelation über die an seiner besitzenden Seam durchgesetzten Verträge hinaus. |

### Eskalations-Choreografie

Die Leiter ist eine geschlossene Tabelle — `read-only` darf zu `workspace-write` oder `danger-full-access` eskalieren, `workspace-write` nur zu `danger-full-access` — geprüft zur Ausführungszeit, niemals in ein Tool-Schema gebacken, dessen Enum das geschlossene Ziel-Vokabular bleibt. [`approveEscalation`](src/escalation.ts) validiert das `sandbox_permissions`/`justification`-Pairing, lehnt nicht-erweiternde Anfragen ab, ohne einen Menschen zu fragen, und bildet jedes Genehmigungsergebnis auf seinen eigenen Fehler ab, bevor irgendetwas ausgeführt wird.

### Writable Roots

`workspace-write` bedeutet „die Workspace-Root plus die Host-Temp-Bereiche": `writableRoots` leitet diese Allow-List kanonisch ab, löst Symlinks auf und dedupliziert, sodass das Seatbelt-Profil und der In-Process-fs-Fence exakt dieselben Roots gewähren.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Beginnen Sie mit der Subsystem-Referenz für den erschöpfenden Vertrag, dann die Backends, Consumer und die Policy-Quelle, die ihn umsetzen.

- [Prozess-Sandbox-Subsystem](../../../docs/subsystems/sandbox.de.md) — das vollständige Vokabular, die pro-Aufruf-Policy und die Klassifikations-Dialekte.
- [Die Subprocess-Sandbox-Entscheidung](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.de.md) — Capability-Grenze, Eskalationsdesign und zurückgestellte Phasen.
- [Lokale Sandbox-Backends](../sandbox-local/README.de.md) — die Plattform-Runner hinter `ctx.sandbox`.
- [Bash-Sandbox-Executor](../../shell/bash-sandbox/README.de.md) — der eingeschränkte bash-Consumer.
- [Sandbox-Policy-Paket](../sandbox-policy/README.de.md) — woher der pro-Aufruf-Modus und die Workspace-Root kommen.

-----

<a id="model-experience"></a>
## Model Experience

### Einschränkungsfehler, indirekt

#### Was das Modell sieht

Über [`dsh-bash-sandbox`](../../shell/bash-sandbox/README.de.md) und [`dsh-tool-bash`](../../shell/tool-bash/README.de.md) erzeugt ein angefragter eingeschränkter Modus ohne nutzbares Backend den Code `SANDBOX_UNAVAILABLE` und den exakten Fehler unten; ein Ausführungszeit-Runner-Fehler hängt ` Runner failure: <detail>` an.

##### Exakter Fehler

```markdown
sandbox mode "<mode>" is requested but no sandbox backend is usable on this host; refusing to run the command unconfined. Install bubblewrap or run a Landlock-enforcing kernel (Linux), ensure sandbox-exec is usable (macOS), or ensure the ACL restricted-token runner can start (Windows) — otherwise switch the consumer to danger-full-access.
```

#### Token-Effekt

Der bedingte Fehlertext ist für diesen Aufruf sichtbar und bleibt bis zur Compaction in der Historie.

#### KV-Cache-Effekt

Nur anhängend; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

### Eskalationsanfrage und -ergebnis

#### Was das Modell sieht

Ein abgelehnter Aufruf zeigt den Marker `[sandbox: file access denied under <mode> mode]` und, wo die Komposition Eskalation anbietet, den Hinweis `[sandbox: escalation available — retry this exact <subject> once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]`. Der Retry trägt `sandbox_permissions` und eine `justification`; die `allowed-once`-/`rejected`-/`cancelled`-Entscheidung des Nutzers wird zum Ergebnistext des Aufrufs.

#### Token-Effekt

Nur der Fehler des abgelehnten Aufrufs und etwaiger Eskalations-Ergebnistext sind sichtbar; beide bleiben bis zur Compaction in der Historie.

#### KV-Cache-Effekt

Nur anhängend; Eskalationstext folgt dem zurückbehaltenen Präfix und macht gecachte Einträge nicht ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die Seam ungeeignet ist oder besondere betriebliche Sorgfalt braucht. Sie sind aktuelle Paket-Einschränkungen, kein allgemeiner Sandbox-Vergleich oder Aufgabenstapel.

- **Datei-Effekte sind das gesamte Policy-Vokabular** — die Seam drückt keine Netzwerk-, Prozess-, Syscall-, Geräte- oder Credential-Restriktionen aus.
- **Nur Same-World-Einschränkung** — Container, microVMs und Remote-Ausführung erfordern den Ersatz von Capability-Implementierungen, statt hier einen Provider hinzuzufügen.
- **Ablehnungs-Meldung ist ein stderr-Dialekt** — die Seam gibt Backend-Signaturen statt eines typisierten Runtime-Ablehnungskanals zurück, sodass Consumer, die Klassifikation brauchen, sie aus der Ausgabe des Kindprozesses ableiten müssen.
- **Runner-Diagnostik ist in-band** — Exit-Status plus stderr-Evidenz kann nicht beweisen, welcher Prozess eine passende Zeile geschrieben hat, sodass ein eingeschränkter Kindprozess, der seinen Runner absichtlich imitiert, eine falsche Verfügbarkeits- oder Diagnose-Attribution verursachen kann; dies kann die Einschränkung nicht umgehen, und ein Out-of-Band-Runner-Status-Kanal ist zurückgestellt.
- **Ein Provider pro Kontext** — das gleichzeitige Komponieren verschiedener Sandbox-Mechanismen erfordert eine Provider-Level-Leiter oder separate Cordis-Kontexte; Aufrufer wählen die Policy pro Aufruf, nicht die Backend-Identität.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: unentschiedene Richtungen und offene Fragen. Sie ist explizit nicht autoritativ — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen leben in den obigen Abschnitten, dem Paket-Code und den verlinkten Agent Notes.

#### Zukunft: Consumer und Umgebungen

Die [Sandbox-Entscheidung](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.de.md) listet zurückgestellte Phasen — ein optionaler `subagent-acp`-Consumer, der Kind-Agents einschränkt (uneingeschränkt als Default), und umgebungskohärente Capability-Gruppen-Beispiele. Beides ist unentschieden; die Windows-Kette, die jene Note als zurückgestellt listete, wurde inzwischen über die ACL-Restricted-Token-Stufe von `sandbox-local` ausgeliefert.

</details>
