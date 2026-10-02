---
description: "Persistente Terminal-Sessions für Deployments und Consumer, die den owner-gescopten ctx.terminals-Service auswählen, komponieren oder erweitern."
kind: "package-reference"
---

# @deepseek-ai/dsh-terminal

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-terminal` stellt dem Harness persistente, owner-gescopte Terminal-Sessions bereit: Eine Session hält Shell- oder REPL-State über Tool-Aufrufe hinweg, und jede Operation ist auf den exakten agent begrenzt, der sie erstellt hat. Es stellt den `ctx.terminals`-Service bereit, der opaque Session-IDs erzeugt, Session-Erzeugung über registrierte Backends routet und auf ruhiggestellte Aufräumarbeiten wartet, wenn ein Owner oder der Service disposed wird. Es definiert selbst keine Terminal-Mechanik: Backends wie das ausgelieferte `dsh-terminal-bash` besitzen Spawning und Readiness, und die modellseitigen Tools in `dsh-tool-terminal` besitzen die Präsentation. Sessions sind prozess-lokal: Sie überleben keinen Harness-Neustart.

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

Mounten Sie `@deepseek-ai/dsh-terminal` immer dann, wenn eine Komposition Terminal-Sessions braucht, deren State über Tool-Aufrufe hinweg überlebt. Der Service allein tut nichts Nützliches: Kombinieren Sie ihn mit einem Backend wie `@deepseek-ai/dsh-terminal-bash` und einem Tool-Paket wie `@deepseek-ai/dsh-tool-terminal`, und laden Sie alle drei in einer Komposition.

### Wann Sie es wählen

Wählen Sie persistente Terminals für Arbeit, deren State im Terminal statt in einer Datei lebt: einen Debugger schrittweise ausführen, in einer Python- oder Node-REPL explorieren oder nach Unterbrechen seines Foreground-Kommandos zu einer Shell zurückkehren. Wählen Sie die One-Shot-Tools bash, read, write und edit für begrenzte Operationen — sie halten stärkere Validierungs-, Approval-, Output-Bound- und Replay-Verträge. Sessions sind prozess-lokal: Sie verschwinden, wenn der Harness-Prozess endet, daher gehört durable Arbeit in Dateien oder ein anderes persistentes System.

### Komposition

Laden Sie den Session-Service zusammen mit einem Backend und einem Tool-Paket:

```yaml
- name: '@deepseek-ai/dsh-terminal'
- name: '@deepseek-ai/dsh-terminal-bash'
- name: '@deepseek-ai/dsh-tool-terminal'
```

Ein Backend stellt einen stabilen Typ bereit — das ausgelieferte Shell-Backend stellt `shell` bereit — und die Tools öffnen Sessions nach diesem Typ. Das Shell-Backend erfordert zusätzlich die Sandbox-, Sandbox-Policy- und Subprocess-Provider; siehe sein [README](../terminal-bash/README.de.md) für die vollständige Komposition.

### Was Sessions bieten

Sobald eine Session existiert, können Consumer eine Session öffnen und ihre ID und begrenzte Start-Ausgabe erhalten, Text senden (optional mit Enter-Abschluss) und warten, bis die Shell wieder bereit ist oder der Send in einen Timeout läuft, begrenzte zurückbehaltene Ausgabe lesen, ein erlaubtes Signal an die Foreground-Prozessgruppe zustellen, eine Session schließen und auf das Ende ihres Prozessbaums warten sowie die Sessions auflisten, die ein Aufrufer besitzt. Pro Session kann genau ein Send gleichzeitig aktiv sein; ein zweiter Send schlägt fehl, bis der erste abgerechnet ist.

### Ownership und Isolation

Jede Session gehört dem exakten agent, der sie geöffnet hat. Operationen, die eine Session benennen, werden abgelehnt, wenn der Aufrufer nicht dieser agent ist, sodass das Modell das Terminal eines anderen agent nicht erreichen kann, selbst wenn es die ID erfährt. Ein optionaler Session-`name` ist owner-lokale Anzeige-Metadaten — Labels wie `main` oder `gdb` — und nur innerhalb seines Owners eindeutig.

### Beobachtbare Ergebnisse und Fehler

Ein erfolgreiches Öffnen liefert Session-ID, Typ, PID, wenn das Backend eine hat, Status und eine begrenzte Start-Meldung. Sends rechnen mit einem Wait-Reason ab: `stdin_read` (die Shell wartet auf Eingabe), `inferred_idle` (Ausgabe-Stille), `timeout` oder `session_exit` (die Top-Level-Shell wurde beendet). Fehler tragen stabile maschinell routbare Codes: ein fehlender Backend-Typ (`NO_BACKEND`), eine unbekannte Session (`NO_SESSION`), die Session eines anderen agent (`FOREIGN_SESSION`), ein zweiter nebenläufiger Send (`SEND_ACTIVE`) oder ein nicht mehr lebender Owner (`OWNER_NOT_LIVE`). Backend-Setup-Fehler lehnen das Öffnen ab, bevor irgendetwas publiziert wird, und ein fehlgeschlagener Cleanup lehnt das Schließen ab, statt Erfolg zu behaupten.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design hinter dem Service und verweist auf den Code, der es umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) behandelt.

### Design-Konzept

Der Service besitzt alles außer Terminal-Mechanik: Session-Identität, Publikation, Autorisierung und Cleanup. Backends besitzen, wie eine Session startet, Readiness erkennt, Ausgabe zurückbehält und herunterfährt; der Service publiziert eine Session erst, nachdem das Backend-Setup erfolgreich war. Der Split hält eine Registry mit verschiedenen Terminal-Substraten nutzbar.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `TerminalSessionService`: Backend-Registry, spawn/send/read/signal/kill/list, Owner-Cleanups, Disposal |
| [`src/types.ts`](src/types.ts) | Geteilte Verträge: Backend-Interface, Session-Typen, Wait-Reasons, Signal-Set, Fehlercodes |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; Backend- und owner-gescopte Session-Registries sind privater mutabler State, und der Service exponiert weder einen unabhängigen Lifecycle-Stream noch einen ungescopten Snapshot. |

### Datenmodell und Lifecycle

Jede publizierte Session ist ein Record aus ihrer ID, ihrem Owner, optionalem Namen, Backend-Typ und Backend-Session, plus dem einen aktiven Send. Unpublizierte Spawns werden pro Owner als Reservations mit einem service-eigenen Abort-Signal verfolgt. Disposal bricht ausstehende Spawns ab, wartet deren Abrechnung und Rollback, schließt dann jede eigene Session und wartet auf Quiescence, bevor Owner-Detacher laufen; ein Cleanup-Fehler lehnt den Lifecycle ab, statt Erfolg zu behaupten.

### Ownership- und Cleanup-Regeln

- Fencing verwendet das exakte `Agent`-Objekt: `hasOwnerActivity(owner)` spannt vom unpublizierten Setup bis zum finalen Close ohne Publikationslücke, sodass die Lifecycle-Policy den Owner präzise begrenzen kann.
- Ein Backend, das partielle Startup-Ressourcen nicht aufräumen kann, lehnt mit `TerminalBackendCleanupError` ab; der Service behält diesen Fehler als verfolgte Owner-Aktivität zurück, bis Owner- oder Service-Disposal ihn konsumiert und berichtet.
- Aufrufer-Abbruch behält seinen exakten `AbortSignal.reason`; `kill()` und Disposal resolvieren erst, nachdem der vom Backend erfasste Prozessbaum quiescent ist.

### Send-Reservation

Der Service reserviert eine Session synchron für einen aktiven Send, bevor die Operation zurückkehrt, einschließlich bevor eine Background-Job-ID sichtbar wird; ein zweiter Send schlägt mit `SEND_ACTIVE` fehl, sodass Ausgabe und Abbruch niemals Operations-Ownership überschreiten.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie führen vom geteilten Terminal-Modell zum ausgelieferten Backend, den Tools und den Design-Nachweisen.

- [Terminal-Subsystem-Referenz](../../../docs/subsystems/terminal.de.md) — geteilte Typen, Backend- und Session-Verträge und die generierte `ctx.terminals`-Oberfläche.
- [terminal/-Paketkarte](../README.de.md) — die Drei-Pakete-Familie und wie sie komponiert.
- [terminal-bash-Backend](../terminal-bash/README.de.md) — das ausgelieferte Shell-Backend, das den Typ `shell` bereitstellt.
- [tool-terminal-Tools](../tool-terminal/README.de.md) — die sechs modellseitigen Tools, die Sessions bedienen.
- [Persistente-PTY-Agent-Note](../../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.de.md) — Design-Begründung, Alternativen und zurückgestellte Grenzen.

-----

<a id="model-experience"></a>
## Model Experience

### Indirekter Consumer

#### Was das Modell sieht

Nichts direkt. Dieses Paket registriert keinen Prompt und kein Tool; `@deepseek-ai/dsh-tool-terminal` besitzt sichtbare Schemas und Ergebnistext.

#### Token-Effekt

Keiner direkt. Live-Session-State bleibt prozess-lokal, bis ein Consumer ein begrenztes Ergebnis zurückgibt.

#### KV-Cache-Effekt

Keine direkte Invalidierung; `@deepseek-ai/dsh-tool-terminal` besitzt Request-Präfix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Service schlecht passt. Sie sind aktuelle Paket-Einschränkungen, kein Aufgaben-Backlog.

- **Prozess-lokale Sessions** — Sessions und rohes Scrollback leben nur in diesem Prozess und überleben keinen Harness-Neustart; durable Arbeit muss in Dateien oder ein anderes persistentes System committed werden.
- **Kein agent-übergreifendes Teilen** — Sessions sind absichtlich Single-Owner, ohne Weg, eine Session zu teilen oder zu übertragen.
- **Kein deklarativer Auto-Start** — Sessions werden nur während agent-Tool-Aufrufen erstellt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer und explizit nicht autoritativ: Ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen leben in den obigen Abschnitten, dem Paket-Code und den verlinkten Agent Notes.

#### Unentschiedene Richtungen

- Ein Shared-Session-Design bräuchte einen separaten Authority-Vertrag.
- Ein deklaratives Auto-Start-Feature würde über unpubliziertes agent-Setup komponiert.

</details>
