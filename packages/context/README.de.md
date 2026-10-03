---
description: "The context group map: request-context plugins that add durable, model-visible context without defining tools, for users and maintainers navigating the group."
kind: "package-group"
---

# context/ — Request-Context-Plugins

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die context-Gruppe stellt Plugins bereit, die jeder Anfrage modellsichtbaren Kontext hinzufügen, ohne ein tool zu definieren: Workspace-Anweisungsdateien werden zu Leitlinien, `@file`-Mentions bieten Pfadvervollständigung, andere Sessions können als begrenzte Snapshots referenziert werden, und das Modell sieht die aktuelle Zeit und den tmux-Ort des agent. Alle sind opt-in, außer `agent-instructions`, das `dsh-base` standardmäßig enthält und ein Profile-Patch deaktivieren kann. Kontext ist persistent: injizierte Anweisungen und Referenzen gehen als user-Rollen-Nachrichten in die Session-Historie ein, persistieren, replayen und compactieren also wie anderer Gesprächsinhalt. Diese Seite bildet die Gruppe ab; jede Paket-README besitzt den paketbezogenen Vertrag.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`agent-instructions/`](agent-instructions/README.de.md) | Lädt `AGENTS.md`/`CLAUDE.md`-Workspace-Anweisungen in den Kontext und aktualisiert sie nach Dateiedits | — |
| [`session-reference/`](session-reference/README.de.md) | Referenziert andere Sessions: erwähnt man eine, wird ihr begrenzter schreibgeschützter Snapshot zu Kontext | `ctx.sessionReferenceResolver` |
| [`file-reference/`](file-reference/README.de.md) | `@file`-Mention-Erkennung und die gemeinsame Mention-Grammatik für host-gestützte UIs | `ctx.fileReferences` |
| [`file-reference-local/`](file-reference-local/README.de.md) | Lokaler Workspace-Vervollständigungs-Provider für `@file`-Mentions | — |
| [`time-context/`](time-context/README.de.md) | Aktuelle Zeit, Browser-Zone und verstrichene Zeit pro Schritt | — |
| [`tmux-context/`](tmux-context/README.de.md) | Die tmux-Session-, Fenster- und Pane-Position des agent | — |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [Session-Referenz-Subsystem](../../docs/subsystems/session-reference.de.md) — kanonische Mention-URIs, Snapshot-Semantik und die stabile Fehlertaxonomie.
- [Entscheidungsprotokoll zum Workspace-Kontext](../../.agents/notes/archived/feature/2026-06-24-workspace-context.md) — warum Anweisungskontext pro agent/pro Session gilt und persistent protokolliert wird.
- [Generierter Konfigurationskatalog](../../docs/config-catalog.de.md) — jedes Konfigfeld, das die Pakete der Gruppe akzeptieren.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
