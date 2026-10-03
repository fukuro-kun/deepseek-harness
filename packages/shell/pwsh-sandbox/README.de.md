---
description: "Der sandbox-konsumierende PowerShell-Executor für Deployments und Maintainer, die eingeschränkte PowerShell-Kommandoausführung mit Ablehnungsfakten auswählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-pwsh-sandbox
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-pwsh-sandbox` ist der sandbox-konsumierende PowerShell-Executor: Jedes Kommando läuft als frischer `pwsh -Command`-Prozess, eingeschränkt durch die `ctx.sandbox`-Capability, mit dem gewählten Modus, der Durchsetzung und den Ablehnungsfakten auf jedem abgerechneten Ergebnis. Unter Windows löst die Sandbox-Seam zur ACL-Restricted-Token-Runner-Kette auf; unter Linux und macOS verwendet sie bwrap, Landlock oder Seatbelt. Wenn kein Runner einen eingeschränkten Modus durchsetzen kann, schlägt der Aufruf mit einem strukturierten `SANDBOX_UNAVAILABLE`-Fehler fehl (fail closed), statt uneingeschränkt zu laufen. Es ist der pwsh-Zwilling von `dsh-bash-sandbox` und spiegelt ihn Aufruf für Aufruf.

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

Mounten Sie diesen Executor statt `dsh-pwsh-local`, wenn PowerShell-Kommandos nicht mit der vollen Datei-Autorität des Harness-Prozesses laufen dürfen. Er registriert sich als `ctx.shell`, erbt die Prozessmechanik von `dsh-pwsh-local` und erfordert einen `ctx.sandbox`-Provider plus `ctx.sandboxPolicy`.

### Wann Sie es wählen

Wählen Sie es, wenn ein Deployment Datei-Level-Einschränkung für PowerShell-Kommandos braucht, typischerweise unter Windows. Die Einschränkungssubstanz ist plattformneutral: Die Sandbox-Seam wählt den Runner der Plattform — die ACL-Restricted-Token-Kette unter Windows, bwrap/Landlock/Seatbelt anderswo — während dieser Executor die pwsh-Seite besitzt. Die Sandbox-Policy (Modus plus Workspace-Root) ist nicht die Config dieses Pakets: Sie kommt pro Aufruf von `ctx.sandboxPolicy`, wobei Tool-Aufrufe die aufgelöste Policy der aufrufenden Session übergeben und direkte Aufrufe auf die Deployment-Policy zurückfallen.

### Modi und Datei-Effekte

| Modus | Datei-Effekte |
|---|---|
| `read-only` (Default) | Schreibzugriffe werden verweigert; die Grenze bleibt partiell, weil das Restricted Token Everyone behält |
| `workspace-write` | Schreibzugriffe unter der Workspace-Root der Policy plus einem privaten Temp-Verzeichnis; `TMP`/`TEMP` werden vor dem Spawn darauf umgeschrieben |
| `danger-full-access` | Keine Einschränkung; der Provider wird nie konsultiert, und Ergebnisse tragen `sandbox: { mode, denied: false }` |

### Minimale Konfiguration

Mounten Sie unter Windows den ACL-Restricted-Token-Provider; mounten Sie unter Linux und macOS stattdessen den lokalen Runner-Provider. Die eigene Config des Executors sind die Regler des lokalen pwsh-Executors, wörtlich; der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-pwsh-sandbox) ist die erschöpfende Quelle.

```yaml
- id: sandbox
  name: '@deepseek-ai/dsh-sandbox-windows-acl'
- id: sandbox-policy
  name: '@deepseek-ai/dsh-sandbox-policy'
  config:
    mode: read-only
    workspaceRoot: !!js process.cwd() # fallback for calls without a session cwd
- id: bash
  name: '@deepseek-ai/dsh-pwsh-sandbox'
```

### Ablehnungen und Eskalation

Ein abgelehntes Kommando wird als Fakt berichtet: Das Ergebnis trägt `sandbox: { mode, denied: true }`, und die Tool-Schicht wandelt es in die Standard-Oberfläche für verweigerte Berechtigung um — dieselbe, die das bash-Tool verwendet. Wenn Eskalation verfügbar ist, darf das Modell das exakte Kommando einmal mit dem engsten weiteren Modus und einer ein-sätzigen Begründung wiederholen; der Genehmigungs-Prompt fragt den Nutzer, und nichts wird vor der Genehmigung ausgeführt. Dieser Executor verhandelt niemals selbst Berechtigungen.

### Fehler und Wiederherstellung

Wenn kein Runner einen eingeschränkten Modus durchsetzen kann, schlägt der Foreground-Aufruf mit `SANDBOX_UNAVAILABLE` fehl, und ein Hintergrund-Prozess zeichnet einen Runner-Fehler-Fakt auf — niemals ein stiller uneingeschränkter Lauf. Eine Provider-Ablehnung wird dem Einschränkungs-Runner nur dann zugeordnet, wenn ihr `ENOENT`/`EACCES`-Pfad oder Syscall unabhängig `argv[0]` benennt; andernfalls behält sie die stage-neutralen Provider-Fehler-Semantik des lokalen Executors.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design des Executors und verweist auf den Code, der es umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig behandelt.

### Design-Konzept

Der Executor ist der pwsh-Zwilling von `dsh-bash-sandbox`: Er erbt die Prozessmechanik von `dsh-pwsh-local`, konsumiert deren argv-Level-Seam (`argv()`/`runArgv()`/`startArgv()`/`onProcessDone()`) und wrappt den exakten pwsh-Aufruf vor dem Spawn durch `ctx.sandbox.confine()`. Die Einschränkungssubstanz ist plattformneutral — die Sandbox-Seam löst zum Runner der Plattform auf — während dieses Paket nur die pwsh-Seite besitzt: den gewählten Modus, die Durchsetzungs-Vollständigkeit und die Ablehnungs-Klassifikation auf Ergebnissen.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `SandboxPwshExecutor`, pro-Prozess-Fakt-Retention, run/start-Wrapping |
| [`src/helpers.ts`](src/helpers.ts) | Ablehnungs-, Runner-Fehler- und Runner-Spawn-Fehler-Klassifikation |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; dieses Paket exponiert keine unabhängige Event-Sequenz oder mutable Datenrelation über die an seinen besitzenden Seams durchgesetzten Verträge hinaus. |
| `tests/` | Ausgeübtes Verhalten über die ACL- und Plattform-Runner |

### Hauptfluss

Für einen eingeschränkten Modus stempelt `resolve()` die pro-Aufruf-Policy; `run` und `start` wrappen das pwsh-argv durch den Provider und geben das eingeschränkte argv an den geerbten Subprocess-Pfad. Bei der Abrechnung klassifiziert der Executor das Ergebnis: Ein Runner-Fehler übertrumpft eine Ablehnung, weil das Kommando nie lief, ein fehlgeschlagener Lauf, dessen stderr den Ablehnungs-Dialekt des Runners trägt, wird als `denied: true` berichtet, und jeder eingeschränkte Lauf trägt seine Modus- und Durchsetzungsfakten. `danger-full-access` umgeht den Provider vollständig und stempelt `denied: false`.

### Invarianten

- **Fail closed** — ein eingeschränkter Modus ohne nutzbaren Runner wirft `SANDBOX_UNAVAILABLE`; uneingeschränkte Durchleitung passiert für eine eingeschränkte Policy nie.
- **Nur-Ablehnung an der Seam** — dieser Executor gewährt niemals Berechtigung; der Genehmigungsfluss lebt in der Tool-Schicht.
- **Pro-Prozess-Fakten** — Einschränkungsfakten werden pro Handle bis zur Abrechnung zurückbehalten, weil ein Provider die Durchsetzung zwischen überlappenden Aufrufen variieren kann.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Executor-Vertrag nicht ausreicht. Sie führen von der Seam zu den Einschränkungs-Backends und dem pwsh-Tool.

- [shell-Seam](../shell/README.de.md) — der Executor-Vertrag, den dieser Provider implementiert, inklusive des Request/Spec-Splits.
- [bash-sandbox](../bash-sandbox/README.de.md) — der bash-Zwilling dieses Executors, mit der geteilten Ablehnungs- und Eskalations-Oberfläche.
- [pwsh-local](../pwsh-local/README.de.md) — die Prozessmechanik, die dieser Executor erbt.
- [sandbox-windows-acl](../../sandbox/sandbox-windows-acl/README.de.md) — die Windows-Restricted-Token-Runner-Kette.
- [Bash-Executor-Subsystem](../../../docs/subsystems/shell.de.md) — Request/Spec-Vokabular, Ergebnisse und der Service-Vertrag im Ganzen.
- [pwsh-Executor- und Tool-Note](../../../.agents/notes/archived/feature/2026-08-01-pwsh-tool-and-executor.md) — die Entscheidung hinter dem pwsh-Executor- und Tool-Paar.

-----

<a id="model-experience"></a>
## Model Experience

### Einschränkung wirkt, Ablehnung erscheint als Kommando-Fehlschlag

#### Was das Modell sieht

Das eigene stderr des eingeschränkten Kommandos — zum Beispiel `Access to the path '...' is denied.` unter dem Windows-ACL-Runner; die Tool-Schicht wandelt klassifizierte Ablehnungen in die Standard-Oberfläche für verweigerte Berechtigung um, exakt wie beim bash-Tool.

#### Token-Effekt

Kein modellsichtbarer Text jenseits des stderr des Kommandos und der Standard-Ablehnungsoberfläche der Tool-Schicht.

#### KV-Cache-Effekt

Keiner direkt; die Ablehnungsoberfläche gehört der Tool-Schicht.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann dieser Executor unter Windows nur eine partielle Grenze ist. Sie sind aktuelle Paket-Einschränkungen, keine Roadmap.

- **Reads sind unter Windows uneingeschränkt** — der ACL-Runner beschränkt nur Schreibzugriffe; die Read-Grenze ist in `@deepseek-ai/dsh-sandbox-windows-acl` dokumentiert.
- **Die Windows-workspace-write-Temp-Autorität ist privat** — pro lebendem Session/Workspace-Paar; agent-lose Aufrufe erhalten pro Invokation ein frisches privates Verzeichnis; die Umgebungs-Temp-Root wird nie gewährt, und der Runner schreibt `TMP`/`TEMP` vor dem Spawn auf das private Verzeichnis um.
- **Windows read-only gewährt keine explizite schreibbare Root, bleibt aber partiell** — das Restricted Token muss Everyone behalten; Objekte, deren DACL Everyone Schreibzugriff gewährt — einschließlich kompatibler Opens des NUL-Device — bleiben Umgebungs-Autorität, während die `> $null`-Umleitung von PowerShell weiterhin funktioniert, ohne NUL zu öffnen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
