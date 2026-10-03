---
description: "Der geteilte Pro-Call-Sandbox-Policy-Resolver und aktuelle Modellkontext für Nutzer und Maintainer, die Dateieffekt-Policy über durchsetzende Capabilities hinweg komponieren, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-sandbox-policy

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Verwende dieses Paket, um eine Dateieffekt-Policy auf jeden eingeschränkten Bash-, Dateisystem- und Terminal-Aufruf anzuwenden. Deployments wählen einen Default-Modus und eine Fallback-Workspace-Root, während jede Session den Modus unabhängig wechseln kann. Session-Entscheidungen überleben einen Neustart, und alle durchsetzenden Capabilities verwenden für einen Aufruf denselben Modus und Workspace. Vor jedem Modellrequest erhält das Modell die effektive Policy und den Workspace, ohne ein Inventar der gemounteten Capabilities.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounte dieses Paket in jeder Komposition, in der sandbox-durchsetzende Capabilities laufen: Es besitzt den Deployment-Default und die Pro-Session-Overrides, die diese Capabilities konsumieren, und trägt die aktuelle Policy zum Runtime-Context-Snapshot des Modells bei.

### Wann es wählen

Wähle es für jede Komposition mit eingeschränkten Capabilities (Bash, Dateisystem, Terminal), damit ein Policy-Zuhause sie daran hindert, in unterschiedliche Modi oder Workspace-Roots auseinanderzudriften. Überspringe es nur, wenn nichts Sandbox-Policy durchsetzt — ohne Consumer hat die resolved Policy keine Wirkung.

### Minimale Konfiguration

Lade das Paket mit einem Default-Modus; der Fail-Safe-Default ist `read-only`, und ein Deployment, das einen workspace-schreibbaren agent will, entscheidet sich explizit für `workspace-write`.

```yaml
- name: '@deepseek-ai/dsh-sandbox-policy'
  config:
    mode: workspace-write
    workspaceRoot: /absolute/path/to/workspace
```

| Feld | Default | Bedeutung |
|---|---|---|
| `mode` | `read-only` | Der Deployment-Default-Modus, von dem eine Session ausgeht, beim Laden validiert |
| `workspaceRoot` | `process.cwd()` | Die Fallback-Root, unter die `workspace-write` für agentlose Aufrufe oder Sessions ohne cwd schreiben darf; normale agent-Aufrufe verwenden stattdessen das unveränderliche cwd der Session |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.md#deepseek-aidsh-sandbox-policy) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Den Modus einer Session wechseln

Der Modus einer Session kann zur Laufzeit über ein UI-Policy-Control oder einen expliziten Switch gewechselt werden; der Switch wird im Session-Log aufgezeichnet und greift beim nächsten eingeschränkten Aufruf der Session. Der Switch überlebt einen Neustart durch Replay, und jede Session behält ihren eigenen Modus — zwei Sessions sehen nie den State der anderen. Eine geswitchte Session behält ihr unveränderliches Workspace-cwd als schreibbare Grenze.

### Fehler und Wiederherstellung

Ein ungültiger konfigurierter Modus wird beim Laden des Plugins abgelehnt, sodass ein Tippfehler laut fehlschlägt, statt die Policy still zu ändern. Eine Session ohne cwd und agentlose Aufrufe fallen auf die konfigurierte Workspace-Root zurück; ein Aufruf mit einem genehmigten expliziten Modus verwendet diesen Modus für genau diesen Aufruf.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt Policy-Auflösung, den Pro-Session-Store und den modellsichtbaren Beitrag; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Auflösungs-Priorität

`resolve({ session, mode })` gibt eine vollständige Pro-Call-Policy zurück: Ein genehmigter expliziter Modus schlägt das letzte `sandbox/mode`-Event der Session, das wiederum den Deployment-Default schlägt. Das unveränderliche `cwd` der Session wird mit Dateisystem-Semantik kanonisiert, bevor es zur Workspace-Root wird, sodass `symlink/..` mit der Prozess-Arbeitsverzeichnis-Auflösung übereinstimmt; andernfalls gilt der konfigurierte Fallback.

### Der Pro-Session-Store

Ein Runtime-Switch ist ein einzelnes log-only `sandbox/mode`-Event auf der Session, für die es gilt — der Switch IST sein Event, und nichts mutiert den Modus-State out of band. `effective = explicit grant ?? fold(events) ?? deployment default`, sodass ein Override einen Neustart per Replay überlebt und zwei Sessions nie den State der anderen sehen. Workspace-Identität braucht kein Event: Das bei der Erstellung aufgezeichnete unveränderliche `SessionHeader.cwd` ist die Root für jeden Aufruf in dieser Session. Das Event bleibt log-only; vor jedem Request trägt der Owner den aktuellen Fakt zum vollständigen Runtime-Context-Snapshot bei, und der agent loop loggt diesen Snapshot als sourced `user/message`.

### Modellsichtbarer Text

Der `sandbox:policy`-Beitrag benennt den capability-neutralen Dateieffekt-Contract des Modus und den kanonischen Session-Workspace unter `workspace-write`. Er zählt gemountete Capabilities nicht auf; Tool-Plugins behalten operationsspezifische Denial- und Escalation-Guidance, Approval-Policy trägt separat zum selben Snapshot bei, und Plan-Guidance bleibt `dsh-plan-mode`s System-Sektion. Der optionale `./invariant`-Companion lehnt ein gefälschtes dauerhaftes `sandbox/mode`-Event ab, dessen Wert außerhalb des geschlossenen Modus-Vokabulars liegt.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `SandboxPolicyService`, `Config`-Schema, Policy-Auflösung und Kontextbeitrag |
| [`src/session-mode.ts`](src/session-mode.ts) | Das `sandbox/mode`-Event, sein Fold und der Schreibpfad |
| [`src/invariant.ts`](src/invariant.ts) | Invariant-Companion: lehnt `sandbox/mode`-Werte außerhalb des geschlossenen Vokabulars ab |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Beginne mit der Subsystem-Referenz für das gemeinsame Vokabular, dann mit dem Seam-Contract und der familienübergreifenden Entscheidung.

- [Prozess-Sandbox-Subsystem](../../../docs/subsystems/sandbox.de.md) — Modi, Pro-Call-Policy und Durchsetzungssemantik.
- [Sandbox-Seam-Paket](../sandbox/README.de.md) — der Confinement-Contract, den jede durchsetzende Capability implementiert.
- [Familienübergreifende Datei-Sandbox-Entscheidung](../../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.de.md) — warum ein geteiltes Policy-Zuhause existiert.

-----

<a id="model-experience"></a>
## Model Experience

### Aktuelle Datei-Sandbox-Policy

#### Was das Modell sieht

Ein `sandbox:policy`-Beitrag im aktuellen Runtime-Context-Snapshot für jede agent-Session. Er zählt gemountete Capabilities nicht auf. Tool-Plugins behalten Operations- und Escalation-Guidance, Approval-Policy trägt separat zum selben Snapshot bei, und Plan-Guidance bleibt `dsh-plan-mode`s System-Sektion.

##### Read-only

```markdown
Current DSH file policy: read-only. Any available operation enforced by the DSH file sandbox cannot modify files in the standing mode. Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns.
```

##### Workspace-write

```markdown
Current DSH file policy: workspace-write. Any available operation enforced by the DSH file sandbox may modify files under the session workspace: "<workspace root>". Some platform temporary areas may also be writable.
```

##### Danger-full-access

```markdown
Current DSH file policy: danger-full-access. The DSH file sandbox does not restrict file modifications by available operations.
```

#### Token-Effekt

Eine prägnante dauerhafte Kontextnachricht beim ersten Request und bei jeder effektiven Policy-Änderung; unveränderte Requests fügen nichts hinzu. `workspace-write` trägt nur den kanonischen Session-Workspace-Pfad; plattformspezifische Temp-Pfade werden zusammengefasst, ohne host-abhängige Bytes hinzuzufügen.

#### KV-Cache-Effekt

Der stabile System Prompt bleibt über Moduswechsel hinweg byte-identisch. Ein geänderter vollständiger Kontext-Snapshot wird nach der zurückbehaltenen History angehängt und bewahrt den vorherigen gecachten Präfix; nachfolgende unveränderte Requests verwenden diesen Snapshot wieder.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die Policy-Oberfläche, die dieses Paket bereitstellt. Sie sind aktuelle Paket-Constraints, kein allgemeiner Sandbox-Vergleich und kein Aufgabenstapel.

- **Eine primäre Workspace-Root pro Session** — die Policy resolved `SessionHeader.cwd`; zusätzliche schreibbare Roots sind nicht Teil von `SandboxExecutionPolicy`.
- **Nur Dateieffekt-Modi** — `SandboxMode` regelt Dateieffekte; Netzwerk- und Prozess-Policy liegen außerhalb seines Vokabulars, sodass kein Regler hier sie einschränkt.
- **Temp-Bereiche werden bewusst zusammengefasst** — durchsetzende Backends gewähren unterschiedliche Plattform-Temp-Bereiche, die nach der Policy-Auflösung gewählt werden und daher im aktuellen Kontext nicht wahrheitsgemäß aufgezählt werden können.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
