---
description: "Die lsp-Gruppenkarte: Language-Server-Code-Navigation über den LSP-seam, seinen stdio-Provider und das modellseitige lsp-Tool, für Nutzer und Maintainer, die die Gruppe durchsehen."
kind: "package-group"
---

# lsp/ — Language-Server-Code-Navigation

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die lsp-Gruppe lässt agents über konfigurierte Language Server durch Code navigieren: zu Definitionen springen, Referenzen und Implementierungen finden und Hover-Dokumentation lesen. Verwende `lsp-stdio`, um lokale stdio-Language-Server-Commands und Extension-Mappings anzubinden, und `tool-lsp`, um diese Operationen dem Modell verfügbar zu machen. Das gemeinsame `lsp`-Paket hält Provider-Auswahl und normalisierte Ergebnisse konsistent, sodass ein Serverwechsel die Modell-Requests nicht verändert. Deployments müssen ihre Language Server selbst bereitstellen und konfigurieren; diese Gruppe liefert keinen mit.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`lsp/`](lsp/README.de.md) | Definiert den Code-Navigation-Service: Provider-Auswahl nach Datei-Extension, vier normalisierte Read-only-Operationen und strukturierte Fehler | `ctx.lsp` |
| [`lsp-stdio/`](lsp-stdio/README.de.md) | Treibt konfigurierte stdio-Language-Server-Commands als Provider über `ctx.fs` und `ctx.subprocess` | registriert auf `ctx.lsp` |
| [`tool-lsp/`](tool-lsp/README.de.md) | Exponiert präzise Code-Navigation dem Modell über das `lsp`-Tool | registriert auf `ctx.tools` |

Provider registrieren Capabilities, keine Tools: `tool-lsp` ist der einzige Owner des modellseitigen Namens, des Schemas, der Prompt-Anleitung und der Präsentation, sodass ein Provider-Wechsel nie ändert, wie das Modell Navigation anfordert.

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [LSP-Navigation-Subsystem](../../docs/subsystems/lsp.de.md) — Operationen, Koordinaten, Requests und Ergebnisse sowie `LspError`-Codes.
- [Generierter Tool-Katalog](../../docs/tool-catalog.de.md#deepseek-aidsh-tool-lsp) — das `lsp`-Schema, das das Modell erhält.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
