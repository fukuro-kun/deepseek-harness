---
description: "The process-sandbox package group: the confinement seam, per-platform backends, the shared policy resolver, and the Windows write-restriction rung."
kind: "package-group"
---

# packages/sandbox
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die Gruppe `sandbox/` beschränkt die Subprozessausführung auf eine Dateieffekt-Policy: Befehle laufen `read-only`, schreiben nur unter dem Session-Workspace (`workspace-write`) oder laufen uneingeschränkt (`danger-full-access`). Vier Pakete liefern sie: den Confinement-Service (`sandbox/`), die Plattform-Backends für Linux, macOS und Windows (`sandbox-local/`), den gemeinsamen Policy-Resolver (`sandbox-policy/`) und das Windows-Schreibrestriktions-Backend (`sandbox-windows-acl/`). Ein von einer Policy abgelehnter eingeschränkter Aufruf kann über eine vom Benutzer genehmigte einmalige Eskalation wiederholt werden. Confinement gilt nur same-world: Es teilt Kernel und Dateisystem des Hosts; Container, MicroVMs und entfernte Executoren ersetzen stattdessen ganze Capabilities, statt sich hier zu registrieren.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Vier Pakete übernehmen die Confinement-Rollen; die Subsystem-Referenz besitzt die erschöpfenden Verträge und die Policy-Semantik pro Aufruf.

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`sandbox/`](sandbox/README.de.md) | Confinement-Service-Vertrag: Modi, Durchsetzung, Policy pro Aufruf und das Eskalationsvokabular | `ctx.sandbox` |
| [`sandbox-local/`](sandbox-local/README.de.md) | Plattform-Confinement-Backends: Linux bwrap dann Landlock, macOS Seatbelt, Windows-Restricted-Token | registriert auf `ctx.sandbox` |
| [`sandbox-policy/`](sandbox-policy/README.de.md) | Gemeinsame Policy-Heimat: Deployment-Defaults und Session-weite Modus-Overrides für jede durchsetzende Familie | `ctx.sandboxPolicy` |
| [`sandbox-windows-acl/`](sandbox-windows-acl/README.de.md) | Windows-Schreibrestriktion: eingeschränkte Kinder dürfen nur in den Workspace und ein privates Temp-Verzeichnis schreiben | — (von `sandbox-local` als win32-Backend gemountet) |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Beginne mit der Subsystem-Referenz für das gemeinsame Vokabular, dann die Confinement-Entscheidung und ihre familienübergreifende Erweiterung.

- [Prozess-Sandbox-Subsystem](../../docs/subsystems/sandbox.de.md) — Modi, Policy pro Aufruf, Wrapped-argv-Dialekte und fail-closed-Fehler.
- [Die Subprozess-Sandbox-Entscheidung](../../.agents/notes/implemented/feature/2026-07-06-sandbox.de.md) — die Capability-Grenze, Eskalationschoreografie und verschobene Phasen.
- [Entscheidung zur familienübergreifenden Datei-Sandbox](../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.de.md) — die gemeinsame Policy-Heimat und der sandboxed Filesystem-Provider.
- [Windows-ACL-Restricted-Token-Sandbox-Entscheidung](../../.agents/notes/implemented/feature/2026-08-08-windows-acl-restricted-token-sandbox.de.md) — warum rohe ACL-Restricted-Token statt mxc und AppContainer.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
