---
description: "Paketkarte der Text-spill-Capability-Familie: was der Storage-Service, das lokale Backend und die Ergebnis-Policy jeweils bereitstellen."
kind: "package-group"
---

# spill/ — Text-spill-Capability-Familie

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die Gruppe `spill/` speichert vollständigen Text außerhalb des Modell-Kontexts und gibt einen Locator mit Abruf-Anleitung zurück. Die Familie teilt sich in den Storage-Service in `spill/`, das lokale Dateisystem-Backend in `spill-local/` und die tool-Ergebnis-Policy in `spill-policy/`. Tool-Ergebnis-spill ist über `maxInlineBytes` opt-in und behält bei Storage-Fehlern das Originalergebnis. [Session-Referenzen](../context/session-reference/README.de.md) konsumieren den Storage auch direkt für gekürzte aufgezeichnete Transkripte, mit eigenen Vorschau- und Fehler-Hinweisen; sie benötigen die tool-Ergebnis-Policy nicht.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Drei Pakete spielen die spill-Rollen; die Subsystem-Referenz besitzt das erschöpfende Vokabular und die Contracts.

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`spill/`](spill/README.de.md) | Storage-Service: speichert übergroßen Text und gibt einen Locator plus Abruf-Anleitung zurück | `ctx.spillStore` |
| [`spill-local/`](spill-local/README.de.md) | Speichert spill-Text in private Session-scoped Dateien auf diesem Rechner | registriert auf `ctx.spillStore` |
| [`spill-policy/`](spill-policy/README.de.md) | Ersetzt übergroße Plain-Text-tool-Ergebnisse durch eine Vorschau und einen Locator | hört auf `ctx.tools` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Beginne mit der Subsystem-Referenz für das gemeinsame Vokabular, dann mit der Designentscheidung.

- [spill-Subsystem](../../docs/subsystems/spill.de.md) — das `SaveTextSpill`/`SpillRef`-Vokabular, Ownership und Backend-Beziehungen.
- [Entscheidung zu tool-Output-spill](../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.de.md) — die Capability-Grenze zwischen Storage, Retention und tool-eigener Output-Behandlung.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
