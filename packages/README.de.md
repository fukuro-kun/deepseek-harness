---
description: "Der DeepSeek-Harness-Paket-Workspace: wie die npm-Pakete unter packages/ gruppiert sind, was jede Gruppe besitzt und die Konventionen, die sie binden."
kind: "package-group"
---

# Pakete
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Der Harness wird aus npm-Paketen unter `packages/` zusammengesetzt, gruppiert nach Capability-Familie: Sessions und der Agent-Loop, modellseitige Tools, Shell- und Filesystem-Ausführung, Web-Zugriff, Subagents und der Rest. Nutzen Sie diese Seite als Top-Level-Karte: Finden Sie die besitzende Gruppe, dann öffnen Sie deren README für die Paketliste. Jedes Paket ist mit `@deepseek-ai/dsh-*` gescoped und lebt in genau einer Gruppe; jedes Gruppen-README ist die autoritative Paketkarte für seine Familie.

## Inhaltsverzeichnis

- [Paketgruppen](#package-groups)
- [Release-Erwartungen](#release-expectations)
- [Abhängigkeiten](#dependencies)
- [Paket-README-Contracts](#package-readme-contracts)
- [Dev Note](#dev-note)

-----

<a id="package-groups"></a>
## Paketgruppen

Jedes Paket lebt in genau einer Gruppe; neue Pakete treten bestehenden Gruppen bei, und eine neue Gruppe aktualisiert ihr eigenes README und diese Tabelle.

| Gruppe | Aufgabe |
|---|---|
| [`core/`](core/README.de.md) | Product-API-Spine: Sessions, Prompts, Tools, Agent-Services und der konkrete Loop |
| [`api/`](api/README.de.md) | Remote-BFF-Assembly und Typert-RPC-Gateway |
| [`typert/`](typert/README.de.md) | Type-Graph-Generierung, Artifact-Loading und Runtime-Registry |
| [`goal/`](goal/README.de.md) | Same-Session-Goal-Persistenz und -Lifecycle |
| [`schedule/`](schedule/README.de.md) | Session-lokale geplante Follow-ups |
| [`feedback/`](feedback/README.de.md) | Human-Feedback-Erfassung und -Befehl |
| [`identity/`](identity/README.de.md) | Geteilte anonyme Identität |
| [`llm/`](llm/README.de.md) | LLM-Capability-Familie: abstrakter Service + Provider-Adapter |
| [`e2b/`](e2b/README.de.md) | E2B-Remote-Runtime-Provider |
| [`subprocess/`](subprocess/README.de.md) | Subprocess-Capability-Familie: Service Definition + lokaler Prozessbaum-Provider |
| [`shell/`](shell/README.de.md) | Bash-Capability-Familie: Executor-Seam, lokale Impl, modellseitige Tools |
| [`terminal/`](terminal/README.de.md) | Persistent-PTY-Capability-Familie: Owner-gescope-te Sessions, lokale Implementierung, modellseitige Tools |
| [`code-runtime/`](code-runtime/README.de.md) | Code-Execution-Capability-Familie: Service Definition + Worker-Thread-Provider + PTC-Mode-Consumer |
| [`sandbox/`](sandbox/README.de.md) | Process-Confinement-Seam; bwrap/Landlock/Seatbelt-Backends |
| [`fs/`](fs/README.de.md) | Filesystem-Capability-Familie: Seam, lokale Impl, modellseitige File-Tools, Discovery-Tools |
| [`lsp/`](lsp/README.de.md) | LSP-Capability-Familie: Seam, generischer Stdio-Provider und das `lsp`-Tool |
| [`skill/`](skill/README.de.md) | Skill-Capability-Familie: Provider-Registry, lokaler Provider, modellseitiger Katalog/Loader |
| [`compaction/`](compaction/README.de.md) | Compaction-Capability-Familie: Service Definition + Basic-Provider + Command-Consumer |
| [`context/`](context/README.de.md) | Modellsichtbarer Request-Kontext: Workspace-Instruktionen, Zeitkontext, Referenzen |
| [`subagent/`](subagent/README.de.md) | Subagent-Capability-Familie: Provider-Registry-Contract und modellseitige Delegation-Tools |
| [`jobs/`](jobs/README.de.md) | Generische Background-Job-Runtime und modellseitige Job-Control-Tools |
| [`experimental/`](experimental/README.de.md) | Private Prototypen und interne Plugins |
| [`workflow/`](workflow/README.de.md) | Workflow-Seam, Worker-Thread-Engine und modellseitige `workflow`/`ralph`-Tools |
| [`webhook/`](webhook/README.de.md) | Verifizierte externe Events, vertrauenswürdige Regeln und Fire-and-Forget-Workspace-Sessions |
| [`web/`](web/README.de.md) | Web-Capability-Familie: Seam, Search/Fetch-Provider, modellseitige Web-Tools |
| [`attachment/`](attachment/README.de.md) | Dauerhafte Attachment-Identität, Validierung, lokaler Content-Addressed-Storage |
| [`spill/`](spill/README.de.md) | Spill-Capability-Familie: Storage-Seam, lokale Impl, Tool-Result-Spill-Policy |
| [`todo/`](todo/README.de.md) | Das modellseitige `todo_write`-Tool |
| [`plan/`](plan/README.de.md) | Plan-Kollaborationszustand mit einem Direkteinstiegsbefehl und reviewed Exit |
| [`preset/`](preset/README.de.md) | Per-Session-Agent-Komposition aus Preset-`cordis.yml`-Dateien |
| [`guard/`](guard/README.de.md) | Loop-Hygiene-Guards: advisory Repeat-Call-Erinnerungen + der `tools/execute`-Deadline-Enforcer |
| [`bundle/`](bundle/README.de.md) | Installierbare `dsh --profile`-Patch-Layer |
| [`extensions/`](extensions/README.de.md) | Agent-Runtime-Selbstmodifikation: Live-Plugin/Service-Inspektion und modellgeschriebenes Mount/Unmount |
| [`hooks/`](hooks/README.de.md) | Hook-Bridges + die geteilte Claude-Code-/Codex-Wire-Protocol-Bibliothek |
| [`session/`](session/README.de.md) | Dauerhafte Session-Datenebene: Persistenz-Seam + Backends, Projektions-Seam, Log-gestützte Titel, Session-Reporting |
| [`session-query/`](session-query/README.de.md) | Session-Retrieval-Familie: logischer Korpus, begrenzte Reads, Lineage, semantische Filterung, SQLite-Volltextsuche |
| [`settings/`](settings/README.de.md) | User-Settings-Seam + file-backed Provider |
| [`credentials/`](credentials/README.de.md) | Credential-Reference- und Credential-Record-Seam + Env-over-`.env`-Provider + Autorisierungs-Flows, die einen Menschen fragen |
| [`storage/`](storage/README.de.md) | Non-Session-Storage-Hub + Backends + Domänenform |
| [`workspace/`](workspace/README.de.md) | Workspace-Entität |
| [`sdk/`](sdk/README.de.md) | Out-of-Process-SDK: JSON-RPC-Protokoll und TypeScript-Client/Server |
| [`acp/`](acp/README.de.md) | Nur-Automatisierungs-Agent-Client-Protocol-Server |
| [`interaction/`](interaction/README.de.md) | Human-Collaboration-Ebene: Approval/Interaction-Seams, Permission-Preset, Commands, Ask-User-Tool |
| [`boot/`](boot/README.de.md) | Geteilte App-Bin-Boot-Glue |
| [`host/`](host/README.de.md) | Web-GUI-Host-Hälfte: API-Gateway + HTTP-Route-Server |
| [`client/`](client/README.de.md) | Web-GUI-Browser-Hälfte: Shell, Wire, Object-Services, Slots, `ui-*`-Plugins |
| [`test-support/`](test-support/README.de.md) | Support-Infrastruktur (Testkits, Invariants, Replay, Loader-Smokes) |
| [`runtime-diagnostics/`](runtime-diagnostics/README.de.md) | Runtime-Diagnostik: paket-besessene Invariant-Checks und Reports |
| [`util/`](util/README.de.md) | Low-Level-Zero-Dependency-Utilities, gruppenübergreifend geteilt (`Branded<B>`, Home/Path-Helper, Timeout, Retention) |

-----

<a id="release-expectations"></a>
## Release-Erwartungen

Die meisten Gruppen sind Produkt — stabile API. Die Ausnahmen: `e2b/` ist ein POC, `experimental/` ist unveröffentlicht, und `test-support/`, `runtime-diagnostics/` und `util/` sind Support mit niedrigeren Kompatibilitätserwartungen.

-----

<a id="dependencies"></a>
## Abhängigkeiten

Der Dependency-Graph ist generiert: [docs/module-graph.md](../docs/module-graph.de.md) (`pnpm run gen-module-graph`, freshness-gated in CI).

**Extension-Plugins hängen von Service Definitions ab, niemals von konkreten Providern.** `dsh-agent-loop` ist austauschbar; UI-, Hook- und Tool-Plugins nutzen `dsh-agent`. Composition-Bundles dürfen von Spine-Plugins abhängen. Capabilities trennen Service-Definition-/Service-Provider-/Consumer-Rollen, wenn sie unabhängig evolvieren; siehe [Capability-Seams](../.agents/notes/implemented/architecture/2026-06-13-capability-seams.de.md).

-----

<a id="package-readme-contracts"></a>
## Paket-README-Contracts

Jedes Paket-README deckt Zweck, Konfiguration, Extension-Points und [Model Experience](../docs/cookbook/adding-a-package.de.md#4-write-the-package-readme) ab, es sei denn, die modell-agnostische [Omission-Allowlist](../scripts/verify-package-readme-model-experience.ts) befreit es. Es trägt außerdem `## Known Limitations and Deferred Work` oder nutzt seine [Allowlist](../scripts/verify-package-readme-limitations.ts). Paket-Konventionen — Exports, Service-Zugriff, Invariants, Tests — leben in [packages/AGENTS.md](AGENTS.md).

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
