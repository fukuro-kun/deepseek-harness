---
description: "Das modellseitige bash-Tool für Nutzer und Maintainer, die einmalige Kommandoausführung, Hintergrund-Jobs und Sandbox-Eskalation auswählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-bash

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-tool-bash` lässt einen Agent einmalige `bash`-Kommandos ausführen und stdout, stderr sowie Exit-Marker empfangen. Jeder Aufruf verwendet eine frische Shell, sodass cwd, Variablen und Funktionen nicht persistieren; `run_in_background` startet langlaufende Arbeit, die der Agent mit `job_output` inspizieren und mit `job_kill` stoppen kann. Kommandos erhalten die verwaltete `DSH_*`-Umgebung, und Sandbox-Ablehnungen können einmal mit weiteren `sandbox_permissions`, einer `justification` und Nutzer-Genehmigung wiederholt werden. Exit-Codes ungleich null werden als Ergebnisse gemeldet, sodass der Agent entscheidet, wie er reagiert; verwenden Sie einen Executor wie `dsh-bash-local` oder `dsh-bash-sandbox` und laden Sie `dsh-shell-env`.

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

Laden Sie dieses Plugin in jeder Komposition, in der der Agent bash-Kommandos ausführen soll: Es registriert das `bash`-Tool, sobald ein Executor-Provider und die `dsh-shell-env`-Registry gemountet sind, und bleibt ausstehend, bis die Services `tools`, `shell`, `systemPrompt` und `shellEnv` existieren.

### Minimale Konfiguration

Der übliche Pfad ist ein Executor-Provider, die Environment-Registry und dieses Tool; fügen Sie die Job-Laufzeit hinzu, wenn der Agent Kommandos im Hintergrund ausführen darf.

```yaml
- name: '@deepseek-ai/dsh-bash-local'
- name: '@deepseek-ai/dsh-shell-env'
- name: '@deepseek-ai/dsh-tool-bash'

# Optional: background jobs
- name: '@deepseek-ai/dsh-jobs-local'
- name: '@deepseek-ai/dsh-tool-jobs'
```

Das einzige Config-Feld schaltet die Hintergrund-Unterstützung um.

| Feld | Standard | Bedeutung |
|---|---|---|
| `enableRunInBackground` | `true` | `run_in_background` exponieren; bei `false` werden erzwungene Hintergrund-Aufrufe abgelehnt |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-bash) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc; der generierte [Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-bash) trägt das vollständige Argument-Schema.

### Ein Kommando ausführen

Das Tool führt `bash -c <command>` aus und gibt die kombinierte Ausgabe zurück. Kommandos laufen bei jedem Aufruf in einer frischen Shell, sodass Zustand nie persistiert — übergeben Sie `workdir` statt `cd`. Ein Exit ungleich null wird als `[exit code: N]` zur Interpretation durch den Agenten gemeldet, nicht als Tool-Fehler. Eine `description` im Aktiv (5–10 Wörter) beschriftet den Aufruf in der UI; `timeoutMs` überschreibt Standard und Obergrenze des Executors. Ausgabe jenseits der Stream-Caps des Executors wird auf ihr Ende gekürzt, wobei die vollständige Ausgabe in einer Spill-Datei gespeichert wird, deren Pfad gemeldet wird.

### Lange Kommandos im Hintergrund ausführen

`run_in_background: true` gibt sofort eine Job-ID zurück und kein Timeout gilt; das Kommando läuft weiter, während der Agent etwas anderes tut. Der Agent liest seine Ausgabe mit `job_output` (nicht blockierend, außer `wait: true`), listet Jobs mit `job_list` und stoppt es mit `job_kill`; ein fertiger Job benachrichtigt den besitzenden Agenten in der Session. Hintergrund-Unterstützung benötigt die generische Job-Laufzeit (`dsh-jobs-local`) und ihre Kontroll-Tools (`dsh-tool-jobs`) gemountet.

### Sandboxed Execution und Eskalation

Wenn der gemountete Executor Kommandos einschränkt (etwa `dsh-bash-sandbox`), wird eine blockierte Dateioperation als `[sandbox: file access denied under <mode> mode]` gemeldet — eine Policy-Ablehnung, kein Kommando-Fehler. Das Modell darf dann exakt dasselbe Kommando einmal im selben Turn mit `sandbox_permissions` (dem engsten weiteren Modus, der genügt) und einer ein-sätzigen `justification` wiederholen; der Genehmigungs-Prompt, den dieser Retry auslöst, ist die Art, wie der Nutzer zustimmt. Eskalation ist niemals spekulativ: Eine Anfrage ohne echte vorherige Ablehnung oder eine, die nicht strikt weiter ist als der aktuelle Modus, schlägt geschlossen fehl, ohne etwas auszuführen, und eine abgelehnte Eskalation ist für dieses Kommando endgültig.

### Was schiefgehen kann

Eine Komposition ohne Executor-Provider aktiviert das Tool nie. Hintergrund-Aufrufe ohne Job-Laufzeit scheitern mit `background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs`, und `sandbox_permissions` ohne sandboxenden Executor scheitert mit `sandbox_permissions is not available in this composition (no sandboxing executor to escalate)`. `enableRunInBackground: false` entfernt den Parameter und lehnt einen erzwungenen Hintergrund-Aufruf zur Ausführungszeit ab.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Design-Entscheidungen hinter dem Tool und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig behandelt.

### Design-Philosophie

- **Modellseitiger Consumer der Shell-Seam.** Das Tool ist die Consumer-Rolle der bash-Capability: Es registriert das `bash`-Schema, rendert Ergebnisse und löst Policy pro Aufruf auf, während die Executor-Seam die Prozessmechanik besitzt.
- **Request nur aus benannten Args.** Das Tool exponiert nie `stdin`, `env` oder `stdoutMaxBytes`; es baut jeden Request aus Kommando-/Workdir-/Timeout-/Signal-Feldern plus dem registry-gesammelten `dshEnv`, sodass modellgelieferte Schlüssel verwaltete Werte nicht ersetzen können.
- **Exit-Codes ungleich null werden gemeldet, nicht als Fehler.** Nur Infrastrukturfehler (Spawn-Fehler, Abbrüche) erscheinen als Tool-Fehler; das Modell interpretiert Exit-Codes und Marker.
- **Hintergrund-Arbeit gehört der Job-Laufzeit.** Ein Hintergrund-Aufruf registriert ein Prozess-Handle bei `ctx.jobs`; IDs, Eigentümerschaft, Abschluss-Benachrichtigungen und Disposal gehören der Laufzeit, und dieses Tool bildet nur bash-Exit- und Sandbox-Fakten auf Job-Ausgabe ab.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Tool-Registrierung, Prompt-Abschnitt, Arg-Validierung, Eskalation, Request-Assembly |
| [`src/background.ts`](src/background.ts) | Abgerechneten Hintergrund-Prozess auf generisches Job-Ergebnis-Vokabular abbilden |
| [`src/render.ts`](src/render.ts) | Modellseitiger Ergebnistext: Streams, Marker, Kürzungshinweise |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; die Environment-Registry validiert Eigentümerschaft und gesammelte Werte bei jeder Mutation/Lesung; sie publiziert keinen unabhängigen Snapshot, den ein Begleiter gegenprüfen könnte. |

### Request-Auflösung

Das Tool löst das workdir auf, bevor `ctx.shell.resolve()` läuft: Ein führendes `~` expandiert zum Home-Verzeichnis des Nutzers, ein relatives `workdir` wird gegen das Session-cwd aufgelöst, und die kanonische Workspace-Root einer Sandbox-Policy gewinnt, sodass Einschränkung und Start dieselbe Identität verwenden. Ein explizites workdir, das kein existierendes durchsuchbares Verzeichnis benennt, wird vor dem Spawn zurückgewiesen — Node würde das schlechte cwd sonst als `spawn <argv0> ENOENT` melden und die ausführbare Datei (etwa den Sandbox-Runner) fälschlich als fehlende Datei identifizieren. Sandbox-Policy wird pro Aufruf über `ctx.sandboxPolicy` aufgelöst; eine Eskalationsanfrage läuft vor jeder Ausführung über `ctx.approval`, und das Tool scheitert beim Laden, wenn der Executor einschränkt, aber kein Policy-Service gemountet ist.

### Rendering-Story

Der Ergebnistext ist stdout, dann ein markierter `[stderr]`-Abschnitt, dann bedingte Marker: Kürzungshinweis, Sandbox-Ablehnung (plus dem Eskalationshinweis im selben Turn, wenn die Komposition Eskalation anbietet), Timeout, Signal und Exit-Code — jeder in eigener Zeile. Der Exit-Marker dient gleichzeitig als Exit-Status-Pill der UI-Karte: Das gemeinsame `parseExitStatus` aus `dsh-shell` konsumiert ihn aus dem Ausgabekörper, sodass Replay den Pill zeigt, ohne den Marker zu duplizieren.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen von der Shell-Familie zur Executor-Seam, der Job-Laufzeit und den Entscheidungsnotizen hinter dem Verhalten.

- [Shell-Paketkarte](../README.de.md) — die bash-Capability-Familie und ihre Rollen.
- [Bash-Executor-Subsystem](../../../docs/subsystems/shell.de.md) — Request-/Spec-Vokabular, Ergebnisse und Hintergrund-Prozesse.
- [shell-env](../shell-env/README.de.md) — die verwaltete `DSH_*`-Umgebung, die jeder Aufruf erhält.
- [tool-jobs](../../jobs/tool-jobs/README.de.md) — `job_output`-, `job_list`- und `job_kill`-Kontrollen für Hintergrund-Läufe.
- [Sandbox-Agent-Note](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.de.md) — Begründung von Eskalation und Moduswechsel.
- [Generierter Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-bash) — das exakte `bash`-Argument-Schema.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-bash) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

### System-Prompt

#### Was das Modell sieht

Jeder Request im Registrierungs-Scope dieses Plugins enthält die untenstehende bash-Anleitung an First-Party-Position 1000. Der Policy-Owner trägt aktuellen Sandbox-Zustand über seinen cache-sicheren Laufzeitkontext bei, statt diesen Abschnitt zu ändern. Scoped Tool-Einschränkungen können das Schema verbergen, ohne diesen unabhängig registrierten Abschnitt zu entfernen.

##### Bash-Anleitung

```markdown
Check the [exit code: N] marker on every bash result; investigate failures before moving on.
```

#### Token-Effekt

Kleine feste Eingabekosten pro Request, solange das Plugin aktiv ist, unverändert durch Sandbox-Modus oder Moduswechsel.

#### KV-Cache-Effekt

Präfix-stabil, solange Registrierungs-Scope und Prompt-Text unverändert sind. Plugin-Aktivierung oder Disposal kann die Wiederverwendung ab diesem Prompt-Abschnitt ungültig machen; Sandbox-Moduswechsel nicht.

### Tool-Schemas

#### Was das Modell sieht

Das Modell sieht das generierte [`bash`-Schema](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-bash). `run_in_background` erscheint nur, wenn dieser Produzent es aktiviert; `sandbox_permissions` und `justification` erscheinen nur, wenn der gemountete Executor Sandboxing anbietet. Agent-scoped Tool-Einschränkungen können die Definition für diesen Agenten entfernen.

#### Token-Effekt

Feste Schema-Kosten bei jedem Request, bei dem die Tools sichtbar sind; Sandbox-Unterstützung fügt die Eskalationsfelder und ihren bedingten Beschreibungsparagraph hinzu.

#### KV-Cache-Effekt

Präfix-stabil, solange Sichtbarkeit, Hintergrund-Unterstützung und Executor-Sandbox-Fähigkeiten unverändert sind. Eine Einschränkung, Config-Änderung oder Executor-Änderung kann die Wiederverwendung ab der ersten geänderten Tool-Definition ungültig machen.

### Foreground-Ergebnis

#### Was das Modell sieht

Der Renderer gibt das datenabhängige stdout-Ende aus, dann optional `[stderr]` und das stderr-Ende. Ohne Ausgabe gibt er exakt `(no output)` aus. Bedingte Zeilen sind exakt `[output truncated; full output: <path-or-(unavailable)>]`, `[sandbox: file access denied under <mode> mode]`, `[timed out after <timeoutMs>ms]`, `[killed by signal: <signal>]` und `[exit code: <exitCode>]`; die Sandbox-Eskalations- und Runner-Fehler-Zeilen sind in [`dsh-bash-sandbox`](../bash-sandbox/README.de.md) zitiert.

#### Token-Effekt

Null Ergebnis-Tokens vor einem Aufruf. Ausgabe ist pro Stream begrenzt, während jede emittierte Zeile bis zur Compaction in der Historie bleibt.

#### KV-Cache-Effekt

Nur anhängend; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

### Hintergrund-Job-Kontext und Ergebnisse

#### Was das Modell sieht

Der Start gibt exakt `started background job <jobId>` zurück. Dieser Produzent liefert der generischen Job-Laufzeit inkrementelle Prozessausgabe, optional `[some output was dropped from memory; full output: <paths-or-(unavailable)>]`, Sandbox-Fakten und terminale Details wie `exit code: <exitCode>` oder `signal: <signal>`. [`dsh-tool-jobs`](../../jobs/tool-jobs/README.de.md) besitzt die sichtbare Statuszeile, Abschluss-Benachrichtigung, Auflistung und Abbruch-Antwort.

#### Token-Effekt

Die Start-Bestätigung ist klein und wird behalten; gesammelte Ausgabe ist datenabhängig und durch die Stream-Buffer des Executors begrenzt. Konsumierende Lesevorgänge wiederholen keine frühere Ausgabe.

#### KV-Cache-Effekt

Nur anhängend; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

### Tool-Fehler

#### Was das Modell sieht

Validierungs- und Policy-Fehler werden als `Error: <message>` normalisiert. Die stabilen Nachrichten dieses Pakets sind `invalid command: expected a non-empty string`, `invalid description: expected a non-empty string`, `invalid timeoutMs: expected a positive number, got <value>`, `invalid workdir: "<path>" is not an accessible directory`, die Eskalations-Pairing-Fehler, `run_in_background is disabled for this deployment (enableRunInBackground: false)`, `background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs`, `sandbox_permissions is not available in this composition (no sandboxing executor to escalate)`, die Genehmigungs-Verfügbarkeits-/-Ablehnungs-/-Abbruchvarianten und `tool call aborted`.

#### Token-Effekt

Nur der fehlschlagende Aufruf fügt diese behaltenen Tokens hinzu; eine abgelehnte Eskalation fügt keine Kommandoausgabe hinzu, weil das Kommando nicht läuft.

#### KV-Cache-Effekt

Nur anhängend; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Tool ungeeignet ist oder besondere Sorgfalt erfordert. Sie sind aktuelle Paket-Einschränkungen, kein Aufgabenstapel.

- **Replay-Exit-Pills werden aus Ergebnistext geparst** — Ausgabe, deren letzte Zeile zufällig exakt `[exit code: N]` / `[killed by signal: …]` ist, zeigt beim Session-Replay einen falschen Pill und verliert diese Zeile aus dem Kartenkörper, weil das Parsen sie als den zu konsumierenden Marker behandelt; ein nur die Anzeige betreffender bekannter Restfehler.
- **Das `bash`-Tool nimmt nicht an `timeout-policy`-Budgets teil** — es behält den executor-eigenen `BASH_TIMEOUT`-Pfad, gemäß der [Tool-Call-Timeout-Policy-Agent-Note](../../../.agents/notes/implemented/architecture/2026-07-07-tool-call-timeout-policy.de.md).
- **Hintergrund-Prozesse haben kein Executor-Timeout** — Aufrufer müssen `job_kill` verwenden oder sich auf Owner-/Service-Disposal verlassen, wenn Arbeit nicht mehr relevant ist.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
