---
description: "Package map for the code-execution capability family: what program execution does for you, and which package owns each part."
kind: "package-group"
---

# code-runtime/ — Code-Ausführungs-Capability-Familie
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die Gruppe `code-runtime/` lässt ein Modell ein Programm schreiben, das vom Host bereitgestellte Funktionen wie gewöhnliche Async-Aufrufe aufruft, und gibt dann nur die gedruckte Ausgabe und den Rückgabewert des Programms zurück. Wähle das TypeScript-Backend für Ausführung in einem isolierten Node-Worker oder das experimentelle Python-Backend, wenn ein CPython-Prozess erforderlich ist. Jeder Lauf startet ohne Zustand früherer Programme. Fehler werden als Ergebnisse zurückgegeben, damit Aufrufer sie diagnostizieren oder dem Modell übergeben können.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Diese drei Pakete stellen gemeinsam die Programmausführung bereit; jede README beschreibt, was ihr Teil tut.

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`code-runtime/`](code-runtime/README.de.md) | Definiert, was eine Code-Runtime tut: ein Programm gegen host-bereitgestellte Bindings ausführen und melden, was es ausgegeben und zurückgegeben hat | `ctx.codeRuntime` |
| [`code-runtime-worker-thread/`](code-runtime-worker-thread/README.de.md) | Führt TypeScript-Programme jeweils in einem frischen Node-Worker-Thread aus | registriert `ctx.codeRuntime` |
| [`experimental/code-runtime-python/`](../experimental/code-runtime-python/README.de.md) | Das experimentelle Python-Backend: besitzt das fd-3-Protokollformat zwischen einem Node-Host und einem CPython-Subprozess sowie die CPython-Runtime-Implementierung | — |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Beginne mit der Subsystem-Referenz für den Service-Vertrag, dann dem PTC-Mode-Design, das diese Capability nutzt, und dem Capability-seam-Modell, dem sie folgt.

- [Code-Runtime-Subsystem-Referenz](../../docs/subsystems/code-runtime.de.md) — Anfrage-/Ergebnis-Vokabular, Bindings und die `ctx.codeRuntime`-Cordis-Fläche.
- [PTC-Mode-Agent-Note](../../.agents/notes/implemented/feature/2026-06-15-ptc.de.md) — wie die Tool-Registry `run_code` dem Modell präsentiert.
- [Capability seams](../../docs/capability-seams.de.md) — die Service-Definition-/Service-Provider-/Consumer-Aufteilung, der diese Familie folgt.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
