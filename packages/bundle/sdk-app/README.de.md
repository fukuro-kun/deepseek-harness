---
description: "SDK-stdio-Anwendungsprofil für Nutzer und Maintainer, die eine JSON-RPC-Harness-Runtime starten."
kind: "package-bundle"
---

# `@deepseek-ai/dsh-sdk-app`
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Die SDK-stdio-Anwendung als `dsh`-Profile-Bundle über [`dsh-base`](../base/README.de.md). Sie erbt die deaktivierte Modul-HMR-Policy der Basis; ihr Patch setzt die Coding-Agent-Persona, mountet einen app-eigenen Command-Provider ohne Optionen und startet [`dsh-sdk-jsonrpc-server`](../../sdk/server/README.de.md) erst, nachdem dieser Provider den Aufruf akzeptiert. `dsh --profile sdk --help` schreibt daher die Hilfe und beendet sich, ohne stdin oder stdout zu belegen. Das eigenständige [`sdk-minimal`](../sdk-minimal/README.de.md)-Bundle nutzt denselben Startup-Provider mit seinem eigenen Profilnamen wieder.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Hinweis für Entwickler](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Der Startup-Provider bindet stdin-EOF an den begrenzten erfolgreichen Shutdown des Launchers. SDK-Protokoll-`shutdown`, SIGINT und SIGTERM behalten ihre besitzenden Server- oder Launcher-Pfade; Disposal drainet den Root-Profile-Baum und die Persistence. Stdout ist für newline-delimited JSON-RPC-Frames reserviert. Das Bundle deaktiviert modellgenerierte Session-Titel, weil das SDK keine Titeloberfläche bereitstellt; deterministische Fallback-Titel bleiben ohne zusätzlichen Model-Request durable. Der geerbte Projektions-Cache checkt SDK-erstellte Sessions für spätere Consumer ein; seine Durability-Barriere flusht jedes abgedeckte Log-Präfix, bevor sie die Cache-Zeile publiziert, und kann ansonsten zusammengefasste JSONL-Läufe aufteilen. Ein Deployment wählt eine andere vollständige Composition über Profile-Bundles und Patch-Dateien, nicht über ein anderes App-Bin.

| Config | Default | Verhalten |
|---|---|---|
| `profile` | `sdk` | Profilname, der in der Command-Hilfe gerendert wird; ein Bundle, das diesen Provider mountet, setzt seinen eigenen ausgelieferten Profilnamen. |

`DSH_MAX_TOKENS_AS_SUCCESS` behält das SDK-Deployment-Mapping: unset oder JSON `true` meldet token-limitierte Subagent-Completion als akzeptiert, JSON `false` meldet sie als Fehler. Provider/Modell und Workspace-cwd kommen über den SDK-Initialisierungs-Request herein; das Basisprofil besitzt Adapter, Tools, Persistence, Policy, Settings und Credentials.

Das SDK nutzt die Basis-Defaults `read`, `write` und `edit`. Um `str_replace_editor` hinzuzufügen, nutze den expliziten Einfüge-Patch im [Basis-Konfigurationsleitfaden](../base/README.de.md#use-this-package). Das eigenständige `sdk-minimal`-Profil besitzt seine separate Tool-Auswahl.

-----

<a id="model-experience"></a>
## Model Experience

### SDK-Coding-Agent-Persona

#### Was das Modell sieht

Das Profil liefert `You are a coding agent powered by the {{model}} model.` vor der First-Party-Anleitung und `Your working directory is {{cwd}}.` in einem separaten Persona-Suffix. Die exakte SDK-Initialisierungsroute und das Session-cwd lösen die Platzhalter auf. Die Default-File-Tool-Schemas umfassen `read`, `write` und `edit`; sie lassen `str_replace_editor` weg.

#### Token-Effekt

Eine kurze stabile Persona plus die datenabhängigen Base-Prompt-Abschnitte und ausgewählten Tool-Schemas.

#### KV-Cache-Effekt

Stabil für ein fixes Profil, Provider, Modell und Tool-Repertoire. Profiländerungen greifen beim nächsten Prozess, weil das ausgelieferte SDK-Profil Startup-only-Patches verwendet.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Ein Profil kann den SDK-Server weglassen** — ein vom TypeScript-Client gewähltes eigenes Profil muss dieses Bundle oder eine andere `dsh-sdk-jsonrpc-server`-Zeile behalten; die Client-Initialisierung schlägt fehl, wenn kein Peer antwortet.
- **User-Plugins können die stdout-Reinheit verletzen** — Profil- und Per-Launch-Patches sind vertrauenswürdige Anwendungs-Composition. Das ausgelieferte Bundle schreibt kein nicht-protokollgemäßes stdout, kann aber ein beliebiges eingefügtes Plugin nicht eindämmen.
- **Konfigurationsänderungen erfordern Neustart** — das ausgelieferte `sdk`-Profil nutzt `patchReload: startup`, sodass eine stdio-Verbindung niemals einen ersetzten Server oder eine Agent-Abhängigkeit beobachtet.


<a id="dev-note"></a>
### Hinweis für Entwickler

<details>
<summary>Arbeitskontext für Maintainer — zum Ausklappen klicken</summary>

Keiner.

</details>

**Laufzeitinvariante:** Es wird kein Companion publiziert. Das Bundle fügt einen Prozess-Transport und einen Startup-Latch hinzu; Quell-/Built-stdio-Tests besitzen Frame-Reinheit, Help-Ausschluss und Shutdown.
