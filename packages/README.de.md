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
| [`core/`](core/README.md) | Product-API-Spine: Sessions, Prompts, Tools, Agent-Services und der konkrete Loop |
| [`api/`](api/README.md) | Remote-BFF-Assembly und Typert-RPC-Gateway |
| [`typert/`](typert/README.md) | Type-Graph-Generierung, Artifact-Loading und Runtime-Registry |
| [`goal/`](goal/README.md) | Same-Session-Goal-Persistenz und -Lifecycle |
| [`schedule/`](schedule/README.md) | Session-lokale geplante Follow-ups |
| [`feedback/`](feedback/README.md) | Human-Feedback-Erfassung und -Befehl |
| [`identity/`](identity/README.md) | Geteilte anonyme Identität |
| [`llm/`](llm/README.md) | LLM-Capability-Familie: abstrakter Service + Provider-Adapter |
| [`e2b/`](e2b/README.md) | E2B-Remote-Runtime-Provider |
| [`subprocess/`](subprocess/README.md) | Subprocess-Capability-Familie: Service Definition + lokaler Prozessbaum-Provider |
| [`shell/`](shell/README.md) | Bash-Capability-Familie: Executor-Seam, lokale Impl, modellseitige Tools |
| [`terminal/`](terminal/README.md) | Persistent-PTY-Capability-Familie: Owner-gescope-te Sessions, lokale Implementierung, modellseitige Tools |
| [`code-runtime/`](code-runtime/README.md) | Code-Execution-Capability-Familie: Service Definition + Worker-Thread-Provider + PTC-Mode-Consumer |
| [`sandbox/`](sandbox/README.md) | Process-Confinement-Seam; bwrap/Landlock/Seatbelt-Backends |
| [`fs/`](fs/README.md) | Filesystem-Capability-Familie: Seam, lokale Impl, modellseitige File-Tools, Discovery-Tools |
| [`lsp/`](lsp/README.md) | LSP-Capability-Familie: Seam, generischer Stdio-Provider und das `lsp`-Tool |
| [`skill/`](skill/README.md) | Skill-Capability-Familie: Provider-Registry, lokaler Provider, modellseitiger Katalog/Loader |
| [`compaction/`](compaction/README.md) | Compaction-Capability-Familie: Service Definition + Basic-Provider + Command-Consumer |
| [`context/`](context/README.md) | Modellsichtbarer Request-Kontext: Workspace-Instruktionen, Zeitkontext, Referenzen |
| [`subagent/`](subagent/README.md) | Subagent-Capability-Familie: Provider-Registry-Contract und modellseitige Delegation-Tools |
| [`jobs/`](jobs/README.md) | Generische Background-Job-Runtime und modellseitige Job-Control-Tools |
| [`experimental/`](experimental/README.md) | Private Prototypen und interne Plugins |
| [`workflow/`](workflow/README.md) | Workflow-Seam, Worker-Thread-Engine und modellseitige `workflow`/`ralph`-Tools |
| [`webhook/`](webhook/README.md) | Verifizierte externe Events, vertrauenswürdige Regeln und Fire-and-Forget-Workspace-Sessions |
| [`web/`](web/README.md) | Web-Capability-Familie: Seam, Search/Fetch-Provider, modellseitige Web-Tools |
| [`attachment/`](attachment/README.md) | Dauerhafte Attachment-Identität, Validierung, lokaler Content-Addressed-Storage |
| [`spill/`](spill/README.md) | Spill-Capability-Familie: Storage-Seam, lokale Impl, Tool-Result-Spill-Policy |
| [`todo/`](todo/README.md) | Das modellseitige `todo_write`-Tool |
| [`plan/`](plan/README.md) | Plan-Kollaborationszustand mit einem Direkteinstiegsbefehl und reviewed Exit |
| [`preset/`](preset/README.md) | Per-Session-Agent-Komposition aus Preset-`cordis.yml`-Dateien |
| [`guard/`](guard/README.md) | Loop-Hygiene-Guards: advisory Repeat-Call-Erinnerungen + der `tools/execute`-Deadline-Enforcer |
| [`bundle/`](bundle/README.de.md) | Installierbare `dsh --profile`-Patch-Layer |
| [`extensions/`](extensions/README.md) | Agent-Runtime-Selbstmodifikation: Live-Plugin/Service-Inspektion und modellgeschriebenes Mount/Unmount |
| [`hooks/`](hooks/README.md) | Hook-Bridges + die geteilte Claude-Code-/Codex-Wire-Protocol-Bibliothek |
| [`session/`](session/README.md) | Dauerhafte Session-Datenebene: Persistenz-Seam + Backends, Projektions-Seam, Log-gestützte Titel, Session-Reporting |
| [`session-query/`](session-query/README.md) | Session-Retrieval-Familie: logischer Korpus, begrenzte Reads, Lineage, semantische Filterung, SQLite-Volltextsuche |
| [`settings/`](settings/README.md) | User-Settings-Seam + file-backed Provider |
| [`credentials/`](credentials/README.md) | Credential-Reference- und Credential-Record-Seam + Env-over-`.env`-Provider + Autorisierungs-Flows, die einen Menschen fragen |
| [`storage/`](storage/README.md) | Non-Session-Storage-Hub + Backends + Domänenform |
| [`workspace/`](workspace/README.md) | Workspace-Entität |
| [`sdk/`](sdk/README.md) | Out-of-Process-SDK: JSON-RPC-Protokoll und TypeScript-Client/Server |
| [`acp/`](acp/README.md) | Nur-Automatisierungs-Agent-Client-Protocol-Server |
| [`interaction/`](interaction/README.md) | Human-Collaboration-Ebene: Approval/Interaction-Seams, Permission-Preset, Commands, Ask-User-Tool |
| [`boot/`](boot/README.md) | Geteilte App-Bin-Boot-Glue |
| [`host/`](host/README.md) | Web-GUI-Host-Hälfte: API-Gateway + HTTP-Route-Server |
| [`client/`](client/README.md) | Web-GUI-Browser-Hälfte: Shell, Wire, Object-Services, Slots, `ui-*`-Plugins |
| [`test-support/`](test-support/README.md) | Support-Infrastruktur (Testkits, Invariants, Replay, Loader-Smokes) |
| [`runtime-diagnostics/`](runtime-diagnostics/README.md) | Runtime-Diagnostik: paket-besessene Invariant-Checks und Reports |
| [`util/`](util/README.de.md) | Low-Level-Zero-Dependency-Utilities, gruppenübergreifend geteilt (`Branded<B>`, Home/Path-Helper, Timeout, Retention) |

-----

<a id="release-expectations"></a>
## Release-Erwartungen

Die meisten Gruppen sind Produkt — stabile API. Die Ausnahmen: `e2b/` ist ein POC, `experimental/` ist unveröffentlicht, und `test-support/`, `runtime-diagnostics/` und `util/` sind Support mit niedrigeren Kompatibilitätserwartungen.

-----

<a id="dependencies"></a>
## Abhängigkeiten

Der Dependency-Graph ist generiert: [docs/module-graph.md](../docs/module-graph.md) (`pnpm run gen-module-graph`, freshness-gated in CI).

**Extension-Plugins hängen von Service Definitions ab, niemals von konkreten Providern.** `dsh-agent-loop` ist austauschbar; UI-, Hook- und Tool-Plugins nutzen `dsh-agent`. Composition-Bundles dürfen von Spine-Plugins abhängen. Capabilities trennen Service-Definition-/Service-Provider-/Consumer-Rollen, wenn sie unabhängig evolvieren; siehe [Capability-Seams](../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md).

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
