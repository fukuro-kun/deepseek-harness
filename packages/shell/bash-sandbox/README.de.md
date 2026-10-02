---
description: "Der sandbox-konsumierende Bash-Executor für Deployments und Maintainer, die eingeschränkte Kommandoausführung mit Ablehnungs- und Eskalationsfakten auswählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-bash-sandbox

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Verwenden Sie `dsh-bash-sandbox`, um jedes Bash-Kommando mit Dateizugriffs-Einschränkung statt mit der vollen Autorität des Harness-Prozesses auszuführen. Ergebnisse berichten den gewählten Modus, abgelehnte Dateioperationen und ob der Runner diesen Modus vollständig durchgesetzt hat. Wenn kein Runner einen eingeschränkten Modus durchsetzen kann, schlägt das Kommando mit `SANDBOX_UNAVAILABLE` fehl, statt uneingeschränkt zu laufen. Wählen Sie es, wenn Deployments Datei-Isolation brauchen; Netzwerkzugriff und Prozess-Sichtbarkeit bleiben außerhalb seiner Garantien.

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

Mounten Sie diesen Executor statt `dsh-bash-local`, wenn Kommandos nicht mit der vollen Datei-Autorität des Harness-Prozesses laufen dürfen. Er registriert sich als `ctx.shell` und erfordert einen `ctx.sandbox`-Provider plus `ctx.sandboxPolicy`; das modellseitige `bash`-Tool arbeitet unverändert darüber und offeriert die Eskalationsfelder `sandbox_permissions`/`justification`.

### Wann Sie es wählen

Wählen Sie es, wenn ein Deployment Datei-Level-Einschränkung für Bash-Kommandos braucht: Die konfigurierte Policy entscheidet den Default-Modus und die Workspace-Root, und jede Session kann pro Aufruf über den Eskalationsfluss des Tools unter einem anderen Modus laufen. Die Modi regeln nur Datei-Effekte — Netzwerk bleibt uneingeschränkt, und Prozess-Sichtbarkeit ist backend-spezifisch. Für uneingeschränkte Ausführung, oder wenn auf der Plattform kein Sandbox-Backend verfügbar ist, mounten Sie stattdessen `dsh-bash-local`.

### Modi und Datei-Effekte

| Modus | Datei-Effekte |
|---|---|
| `read-only` (Default) | Keine Schreibzugriffe nirgends; von `/dev` ist nur der `/dev/null`-Knoten schreibbar, sodass `>/dev/null` weiter funktioniert |
| `workspace-write` | Schreibzugriffe nur unter der Workspace-Root der Policy plus `/tmp` (ephemer unter bwrap, das Host-`/tmp` unter Landlock, `/private/tmp` plus das Per-User-Temp-Verzeichnis unter Seatbelt) |
| `danger-full-access` | Keine Einschränkung; der Provider wird nie konsultiert, und Ergebnisse tragen `sandbox: { mode, denied: false }` |

### Minimale Konfiguration

Der Executor nimmt keine eigene Sandbox-Konfiguration: Der Default-Modus und die Workspace-Root kommen von `ctx.sandboxPolicy`, und die Runner-Wahl gehört dem `ctx.sandbox`-Provider. Seine eigene Config sind die Regler des lokalen Executors, wörtlich; der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-bash-sandbox) ist die erschöpfende Quelle.

```yaml
- id: sandbox
  name: '@deepseek-ai/dsh-sandbox-local'
- id: sandbox-policy
  name: '@deepseek-ai/dsh-sandbox-policy'
  config:
    mode: read-only
    workspaceRoot: !!js process.cwd() # fallback for calls without a session cwd
- id: bash
  name: '@deepseek-ai/dsh-bash-sandbox'
```

### Ablehnungen sind Ergebnisfakten

Ein abgelehntes Kommando wird berichtet, nicht still wiederholt: Das Ergebnis trägt `sandbox: { mode, denied: true }`, und das modellseitige Tool hängt den Ablehnungsmarker an. Wenn Eskalation verfügbar ist, darf das Modell das exakte Kommando einmal mit dem engsten weiteren Modus und einer ein-sätzigen Begründung wiederholen; der Genehmigungs-Prompt fragt den Nutzer, und nichts wird vor der Genehmigung ausgeführt. Dieser Executor verhandelt niemals selbst Berechtigungen — die Tool-Schicht treibt die Übersteuerung.

### Fehler und Wiederherstellung

Wenn kein Runner einen eingeschränkten Modus durchsetzen kann, schlägt der Foreground-Aufruf mit `SANDBOX_UNAVAILABLE` fehl, und ein Hintergrund-Prozess zeichnet einen Runner-Fehler-Fakt auf — niemals ein stiller uneingeschränkter Lauf. Eine Provider-Ablehnung wird dem Einschränkungs-Runner nur dann zugeordnet, wenn ihr `ENOENT`/`EACCES`-Pfad oder Syscall unabhängig `argv[0]` benennt; andernfalls behält sie die stage-neutralen Provider-Fehler-Semantik des lokalen Executors.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design des Executors und verweist auf den Code, der es umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig behandelt.

### Design-Konzept

Der Executor ist der sandboxing Service Provider der `ctx.shell`-Seam: Er erbt die Prozessmechanik von `dsh-bash-local` und wrappt das exakte `['bash', '-c', command]`-argv jedes Kommandos durch `ctx.sandbox.confine()`, um das zurückgegebene argv direkt zu spawnen. Welcher Plattform-Runner das Kommando einschränkt — und ob überhaupt einer nutzbar ist — ist Sache des Providers; dieses Paket besitzt nur die bash-Seite: den gewählten Modus, die Durchsetzungs-Vollständigkeit und die Ablehnungs-Klassifikation auf Ergebnissen.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `SandboxBashExecutor`, pro-Prozess-Fakt-Retention, run/start-Wrapping |
| [`src/helpers.ts`](src/helpers.ts) | Ablehnungs-, Runner-Fehler- und Runner-Spawn-Fehler-Klassifikation |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; dieses Paket exponiert keine unabhängige Event-Sequenz oder mutable Datenrelation über die an seiner besitzenden Seam durchgesetzten Verträge hinaus. |
| `tests/` | Ausgeübtes Verhalten über die bwrap-, Landlock- und Seatbelt-Runner |

### Hauptfluss

Für einen eingeschränkten Modus stempelt `resolve()` die pro-Aufruf-Policy (den Modus-Override der Session oder den Deployment-Fallback); `run` und `start` wrappen das bash-argv durch den Provider und geben das eingeschränkte argv an den geerbten Subprocess-Pfad. Bei der Abrechnung klassifiziert der Executor das Ergebnis: Ein Runner-Fehler übertrumpft eine Ablehnung, weil das Kommando nie lief, ein fehlgeschlagener Lauf, dessen stderr den Ablehnungs-Dialekt des Backends trägt, wird als `denied: true` berichtet, und jeder eingeschränkte Lauf trägt seine Modus- und Durchsetzungsfakten. `danger-full-access` umgeht den Provider vollständig und stempelt `denied: false`.

### Invarianten

- **Fail closed** — ein eingeschränkter Modus ohne nutzbaren Runner wirft `SANDBOX_UNAVAILABLE`; uneingeschränkte Durchleitung passiert für eine eingeschränkte Policy nie.
- **Nur-Ablehnung an der Seam** — dieser Executor gewährt niemals Berechtigung; der Genehmigungsfluss lebt in der Tool-Schicht.
- **Pro-Prozess-Fakten** — Einschränkungsfakten werden pro Handle bis zur Abrechnung zurückbehalten, weil ein Provider die Durchsetzung zwischen überlappenden Aufrufen variieren kann.
- **Nur Datei-Effekte** — das Modus-Vokabular beansprucht nur Datei-Effekte.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Executor-Vertrag nicht ausreicht. Sie führen von der Seam zur Sandbox-Capability, die dieser Executor konsumiert.

- [shell-Seam](../shell/README.de.md) — der Executor-Vertrag, den dieser Provider implementiert, inklusive des Request/Spec-Splits.
- [bash-local](../bash-local/README.de.md) — die Prozessmechanik, die dieser Executor erbt.
- [sandbox-Seam](../../sandbox/sandbox/README.de.md) — die Einschränkungs-Capability, ihre Modi und ihr Fail-Closed-Vertrag.
- [sandbox-policy](../../sandbox/sandbox-policy/README.de.md) — der pro-Session-Modus und die Workspace-Root, die dieser Executor beachtet.
- [sandbox-local](../../sandbox/sandbox-local/README.de.md) — die ausgelieferten Runner-Backends: bwrap, Landlock und Seatbelt.
- [tool-bash](../tool-bash/README.de.md) — das modellseitige `bash`-Tool und seine Eskalations-Oberfläche.
- [Sandbox-Agent-Note](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.de.md) — das Sandbox-Design, die Eskalation und der Wechsel-Vertrag.

-----

<a id="model-experience"></a>
## Model Experience

### Bash-Tool-Schema, indirekt

#### Was das Modell sieht

Die generierten [`dsh-tool-bash`-Schemas](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-bash) sind die Basis. Durch das Offerieren eines einschränkenden `sandboxMode` erweitert dieses Backend `bash` um `sandbox_permissions` (Enum `workspace-write` | `danger-full-access`) und `justification`. Der Policy-Owner trägt separat den aktuellen capability-neutralen `sandbox:policy`-Kontext bei.

#### Token-Effekt

Kleines festes Schema-Inkrement auf Requests, bei denen `bash` sichtbar ist, plus der Current-Policy-Klausel, die `dsh-sandbox-policy` besitzt.

#### KV-Cache-Effekt

Eine Standing-Policy-Änderung hängt einen vollständigen, vom Owner gerenderten Kontext-Snapshot hinter die zurückbehaltene Historie und bewahrt das bestehende System-/Historie-Präfix Byte für Byte. Das Ändern von Executor-Capabilities ändert das `bash`-Schema.

### Bash-Tool-Ergebnis, indirekt

#### Was das Modell sieht

Nach gewöhnlicher begrenzter Ausgabe hängt ein abgelehnter Aufruf exakt `[sandbox: file access denied under <mode> mode]` an. Wenn Eskalation verfügbar ist, hängt es als Nächstes `[sandbox: escalation available — retry this exact command once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]` an. Ein abgerechneter Hintergrund-Runner-Fehler hängt stattdessen `[sandbox: the sandbox runner itself failed under <mode> mode — the command did not run; this is a sandbox problem, not a command failure]` an.

#### Token-Effekt

Null zusätzliche Tokens bei einem unauffälligen erlaubten Lauf jenseits der gewöhnlichen Ausgabe. Ablehnung oder Fehlschlag fügt den zitierten bedingten Marker hinzu, der bis zur Compaction behalten wird.

#### KV-Cache-Effekt

Nur anhängend; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

### Bash-Tool-Fehler, indirekt

#### Was das Modell sieht

Wenn kein Runner einen eingeschränkten Modus durchsetzen kann, propagiert der Foreground-Aufruf den `SANDBOX_UNAVAILABLE`-Fehler aus der Sandbox-Seam. Eine Provider-Ablehnung mit `ENOENT`/`EACCES`-Pfad- oder Syscall-Evidenz, die `argv[0]` benennt, liefert den Originalfehler als Runner-Fehler-Detail; eine andere Ablehnung bleibt ein stage-neutraler Provider-Fehler. Ein abgerechneter Runner-Fehler liefert die gematchte fatale stderr-Zeile und bewahrt die originale stderr-Sammlung; das angehängte `Runner failure: <detail>` ist die autoritative Diagnose vor dem generischen `SANDBOX_UNAVAILABLE`-Präfix.

#### Token-Effekt

Der bedingte Fehlertext ist für diesen Aufruf sichtbar und bleibt bis zur Compaction in der Historie.

#### KV-Cache-Effekt

Nur anhängend; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann dieser Executor keine allgemeine Sicherheitsgrenze ist. Sie sind aktuelle Paket-Einschränkungen, keine Roadmap.

- **Einschränkung deckt nur Datei-Effekte ab** — Netzwerk-Restriktion und eine einheitliche Prozess-Sichtbarkeits-Garantie fehlen, sodass die Modi keine Allzweck-Sicherheits-Sandbox sind.
- **Ablehnungen werden aus dem stderr fehlgeschlagener Kommandos abgeleitet** — Backend-Signaturen machen die Ableitung portabel, aber ein passender Anwendungsfehler kann als Ablehnung klassifiziert werden, und eine Ablehnung, die nicht im zurückbehaltenen Tail steht, kann übersehen werden.
- **Ein asynchron beobachteter Hintergrund-Runner-Fehler hat keinen sofortigen Fehlerkanal** — er wird am abgerechneten Prozess aufgezeichnet und taucht auf, wenn der Aufrufer den generischen Task mit `job_output` liest; ein synchroner Subprocess-Wurf, der den Runner-Pfad benennt, lässt stattdessen `start()` sofort fehlschlagen.
- **`danger-full-access` umgeht `ctx.sandbox` absichtlich** — es ist ein explizit uneingeschränkter Modus, kein weiteres Sandbox-Profil.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
