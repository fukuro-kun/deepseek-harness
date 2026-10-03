---
description: "Der Subprocess-Dienst (ctx.subprocess) für Kompositions-Autoren und Capability-Consumer, die verwaltete Kindprozesse und Terminalsitzungen starten, beobachten und beenden."
kind: "package-reference"
---

# @deepseek-ai/dsh-subprocess
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`ctx.subprocess` löst ausführbare Dateien auf, startet explizit angegebene Kindprozesse oder echte Terminalsitzungen, streamt oder sammelt begrenzte Ausgabe und beendet den gesamten verwalteten Prozessbereich. Konfiguriere eine Subprocess-Implementierung pro Komposition und wähle lokale oder entfernte Ausführung je nachdem, wo Befehle laufen müssen. Jede Anfrage setzt argv, Arbeitsverzeichnis, stdio, Umgebungsüberschreibungen, Beendigungsnachfrist und Abbruch — ohne Shell-Interpretation oder versteckte Ausführungsvorgaben. Kindumgebungen entfernen umgebungsseitige Credentials und `DSH_*`-Werte, bevor explizite Überschreibungen angewendet werden; Aufrufer besitzen Deadlines, Teardown-Policy und modellseitige Darstellung, während gesammelte Ausgabe nach dem Exit lesbar bleibt.

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

Mounte einen Subprocess-Provider in jeder Komposition, die Kindprozesse ausführen muss, und rufe `ctx.subprocess` aus der Capability auf, die den Befehl besitzt. Der übliche Pfad ist explizit: die ausführbare Datei auflösen, mit einer vollständig spezifizierten Anfrage spawnen, die angeforderte Ausgabe lesen und den verwalteten Bereich beenden, wenn die Arbeit getan ist.

### Den Dienst mounten

Ein Provider registriert `ctx.subprocess` pro Komposition; lade ihn neben den Consumern, die über ihn spawnen — den Bash-Executoren, dem LSP-Host, dem PTY-Shell-Backend oder einem Out-of-Process-Subagent-Backend. Das Laden eines zweiten Providers schlägt laut fehl (ein Dienst pro Kontext, Cordis-Standard).

```yaml
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-bash-local'
```

### Einen verwalteten Prozess starten

Die Anfrage ist vollständig explizit: Programm und Argumente, Arbeitsverzeichnis, eine stdio-Disposition pro Stream, eine Beendigungsnachfrist, ein optionales Abort-Signal und optionale Umgebungsüberschreibungen. Ziel- und Bereichsidentitäten bleiben provider-privat. `done` löst mit den Exit-Fakten des direkten Befehls (`exitCode` und `signal`) auf und lehnt bei Spawn- oder Provider-Fehlern ab; gesammelte Ausgabe bleibt nach dem Exit lesbar.

```text
const executable = await ctx.subprocess.resolveExecutable('bash')
const handle = ctx.subprocess.spawn({
  argv: [executable, '-c', 'echo hello'],
  cwd: '/workspace',
  stdio: { stdin: 'ignore', stdout: { maxBytes: 64 * 1024 }, stderr: 'inherit' },
  graceMs: 5000,
})
const { exitCode, signal } = await handle.done
const output = handle.collected.stdout?.readFrom(0)
```

### Auswählen, wie Ausgabe zugestellt wird

- `'pipe'` übergibt dir den rohen Stream für dein eigenes Protokoll-Framing — JSON-RPC für den LSP-Host, ndjson für das ACP-Backend.
- `'inherit'` lässt das Kind in den eigenen Stream des Elternteils schreiben, für Durchleitungsdiagnostik.
- Ein Collect-Objekt puffert einen begrenzten In-Memory-Tail; füge ein `spill`-Limit hinzu und der vollständige Stream lässt sich zusätzlich aus einer spill-Datei wiederherstellen.

Lesevorgänge sind offsetbasiert und nicht konsumierend: Ein Hintergrundleser und ein abschließender Batch-Read können denselben Stream teilen, ohne sich gegenseitig Bytes wegzunehmen.

### Prozesslebensdauer verwalten

Beenden und Warten nutzen einen provider-verwalteten Bereich. `terminate()` startet das dokumentierte Verfahren des Providers, ist idempotent und wird zum No-op, sobald dieser Bereich leer ist; das Abort-Signal der Anfrage startet dasselbe Verfahren. `waitForExit()` beobachtet denselben Bereich und löst erst auf, nachdem der Provider ihn als vollständig stillstehend nachgewiesen hat, sodass die Beendigung des direkten Befehls keinen überlebenden Nachkommen verdeckt. Es lehnt ab, wenn der ausgewählte Owner keine Ruhe mehr nachweisen kann. Provider dokumentieren ihre nativen Owner und schwächere Fallbacks; Aufrufer besitzen Deadlines, Teardown-Leitern und Ursachenklassifizierung.

### Eine Terminalsitzung ausführen

Für interaktive Programme alloziert `spawnTerminal` ein echtes PTY: Text schreiben, UTF-8-Ausgabe lesen, die aktuelle Vordergrund-Prozessgruppe prüfen und signalisieren sowie ein `terminate()` erwarten, das jedes noch beobachtbare Sitzungsmitglied abrechnet. Bereitschaft, Scrollback und Prompt-Policy bleiben beim PTY-Consumer.

### Die Umgebung, mit der jedes Kind startet

Kinder erben nie die umgebungsseitigen Geheimnisse des Harness: Credential-artige Namen und umgebungsseitige `DSH_*`-Fakten werden entfernt, und das explizite `env` des Aufrufers wird erst nach diesem Scrub gemerged. Ein bewusst weitergeleitetes Credential oder ein aktuelles `DSH_*`-Deployment-Fakt erreicht das Kind weiterhin; ein expliziter `undefined`-Tombstone entfernt einen gewöhnlichen Umgebungseintrag.

### Was schiefgehen kann

Eine nicht auflösbare ausführbare Datei schlägt mit einem stabilen Fehler laut fehl. Ein Spawn, der nie startet, lässt `done` ablehnen; für einen Prozess, der nie lief, gibt es keine gepufferte Ausgabe. `waitForExit()` lehnt ebenfalls ab, wenn der Provider nicht nachweisen kann, dass sein ausgewählter Bereich leer ist, und ein Provider-Fallback besitzt möglicherweise keine Nachkommen, die seiner Prozessgruppe oder beobachteten Session entkommen. Wenn ein Transport seinen eigenen Spawn besitzt (der SDK-Client, MCP), route um den Dienst herum und importiere `scrubbedParentEnv` direkt, damit die Umgebungs-Policy aus einer einzigen Quelle stammt.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem seam und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Der seam baut auf einer Trennung auf: Der Dienst besitzt Prozesskoordinaten und Lebensdauer; Consumer besitzen, was ein Prozess bedeutet, und jede Vorgabe, die ihn formt. Deshalb ist die Spawn-Anfrage vollständig explizit — keine versteckte Subprocess-Service-Vorgabe — und deshalb trägt `SubprocessOutcome` nur Exit-Fakten: Aufrufer besitzen Deadlines, Teardown-Leitern und Ursachenklassifizierung. Der `dsh-shell`-Request/Spec-Split ist die zuständige Vorlage.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: abstrakte `SubprocessRuntime`, `ctx.subprocess`-Registrierung, der gemeinsame `scrubbedParentEnv`-Scrub |
| [`src/types.ts`](src/types.ts) | Vokabular: Spawn-Spec, stdio-Modi, Handles, Reader, Outcomes, `DSH_*`-Namensraum |
| — | Es wird kein Runtime-Invariant-Begleiter veröffentlicht; diese zustandslose Service Definition besitzt Spawn-Spec/Handle-Typen, während Service Providers Beobachtungen besitzen. |

### Datenmodell und Ablauf

Ein Spawn gibt sofort ein Live-Handle zurück, ohne die Zielidentität offenzulegen. `done` meldet unabhängig das Ergebnis oder den Fehler des direkten Befehls, während `waitForExit()` die Ruhe des verwalteten Bereichs meldet. Das Abort-Signal der Anfrage treibt dasselbe Beendigungsverfahren wie `terminate()`. Collect-Reader sind cursorlos: Offsets sind aufrufergeführte Ganzstrom-Byte-Koordinaten, sodass unabhängige Leser sich nicht gegenseitig Ausgabe wegnehmen können, und ein Lesevorgang, dessen Offset aus dem In-Memory-Tail gerutscht ist, ist `lossy` und zeigt bei Vorhandensein auf die spill-Datei. `spawnTerminal` ist ein einziges tiefes Primitiv, weil gewöhnliche Pipes weder ein steuerndes Terminal allozieren noch Terminal-Sitzungsmitglieder bereinigen können.

### Lebenszyklus und Invarianten

Pro Kontext registriert sich eine Implementierung; das Laden einer zweiten wirft (Cordis-Standard). Das Disposal des Dienstes beendet jeden noch laufenden verwalteten Prozess und wartet auf seinen Exit, sodass die Prozesslebensdauer Consumer-Reloads überlebt. `argv` wird nie shell-interpretiert; ein Consumer, der eine Shell will, übergibt selbst `['bash', '-c', command]`. Der Abbruch der Terminal-Allozierung (das Spec-Signal) ist vom Lebenszyklus des veröffentlichten Handles getrennt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen von der erschöpfenden Typreferenz zu den Providern und zur Entscheidungsbegründung hinter dem seam.

- [Subprocess-Subsystem](../../../docs/subsystems/subprocess.de.md) — Spawn-Specs, Output-Reader, Outcomes und die `DSH_*`-Umgebung vollständig.
- [dsh-subprocess-local](../subprocess-local/README.de.md) — der lokale Host-Provider, der diesen Vertrag implementiert.
- [dsh-subprocess-e2b](../../e2b/subprocess-e2b/README.de.md) — der entfernte E2B-Provider für denselben seam.
- [dsh-bash-local](../../shell/bash-local/README.de.md) — der größte Consumer: Bash-Befehle über diesen Dienst.
- [Subprocess-seam-Agent-Note](../../../.agents/notes/archived/architecture/2026-07-26-subprocess-seam.md) — warum die Prozesshälfte ein eigener seam wurde und was mit ihr zog.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt über Consumer-seams wie die Bash-Executor-Familie, die die gesamte modellseitige Darstellung von Prozessausgabe und Lebenszyklus besitzen.

#### KV-Cache-Wirkung

Keine direkte Invalidierung; die genannten Consumer besitzen alle Request-Präfix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen beschreiben, wann der seam ungeeignet ist oder Arbeit an seine Consumer abgibt. Sie sind aktuelle Paketbedingungen, kein Vergleich und kein Backlog.

- **SDK-verwaltete Spawns bleiben außerhalb** — ein Transport, der seinen internen Spawn besitzt (der SDK-Client, MCP), kann diesen Aufruf nicht durch diesen Dienst routen; er kann trotzdem `scrubbedParentEnv` importieren, damit die Umgebungs-Policy aus einer einzigen Quelle stammt.
- **Teardown-Leitern sind Consumer-Sache** — der seam liefert Signalverben und das Warten auf den verwalteten Bereich, keine fertige Stilllegungssequenz; jeder Out-of-Process-Consumer kodiert die Kooperationsform seines Kindes selbst (die stdin-EOF-zuerst-Leiter des ACP-Backends ist die Vorlage im Repo).
- **Beobachtbarkeit ist provider-spezifisch** — native Provider können entkommene Nachkommen über systemd-Scopes oder Windows-Jobs besitzen, während Fallback-Provider schwächere Prozessgruppen-, Baum- oder Session-Sichtbarkeit bieten. Der seam fügt keinen kontinuierlichen Prozesstabellen-Monitor hinzu.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Designfragen und unentschiedene Richtungen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen stehen in den Abschnitten oben, im Paketcode und in den verlinkten Agent Notes.

Zukunft: Nicht-Shell-Runner. Der seam wurde geteilt, damit ein Direct-argv-Executor oder Worker-Supervisor ihn konsumieren kann, ohne in Bash-Interna zu greifen; noch ist keiner ausgeliefert, und das Terminal-Primitiv belässt die Bereitschafts-Policy bei seinem Consumer.

</details>
