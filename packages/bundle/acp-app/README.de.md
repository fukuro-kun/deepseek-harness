---
description: "Automation-only-ACP-stdio-Anwendungsprofil für Nutzer und Maintainer, die persistente Harness-Agents starten."
kind: "package-bundle"
---

# `@deepseek-ai/dsh-acp-app`

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die automation-only-ACP-stdio-Anwendung als `dsh`-Profile-Bundle über [`dsh-base`](../base/README.de.md). Sie erbt die deaktivierte Modul-HMR-Policy der Basis; ihr Patch setzt die Coding-Agent-Persona und die Default-Model-Route, mountet einen app-eigenen Command-Provider ohne Optionen und startet [`dsh-acp`](../../acp/acp/README.de.md) erst, nachdem dieser Provider den Aufruf akzeptiert. `dsh --profile acp --help` schreibt daher die Hilfe und beendet sich, ohne stdin oder stdout zu belegen.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Standard-Automatisierungsworkflow](#standard-automation-workflow)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Hinweis für Entwickler](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Der Startup-Provider bindet stdin-EOF an den begrenzten erfolgreichen Shutdown des Launchers. ACP-Verbindungsschluss, SIGINT und SIGTERM drainen die bridge-eigenen Agents und den Root-Profile-Baum vor dem Exit. Stdout ist für newline-delimited ACP-JSON-RPC-Frames reserviert. Das Bundle deaktiviert modellgenerierte Session-Titel, weil ACP keine Titeloberfläche bereitstellt; deterministische Fallback-Titel bleiben ohne zusätzlichen Model-Request durable. Der geerbte Projektions-Cache checkt ACP-erstellte Sessions für spätere Consumer ein; seine Durability-Barriere flusht jedes abgedeckte Log-Präfix, bevor sie die Cache-Zeile publiziert, und kann ansonsten zusammengefasste JSONL-Läufe aufteilen. Ein Deployment wählt eine andere vollständige Composition über Profile-Bundles und Patch-Dateien, nicht über ein anderes App-Bin.

Die ausgelieferte Zeile erstellt Sessions mit `deepseek-official` und `deepseek-v4-flash`; ein späterer Patch kann die vollständige Config dieser Zeile ersetzen. Das Basisprofil besitzt Adapter, Tools, Persistence, Policy, Settings, Credentials und den vom ACP-Client gelieferten Per-Session-Workspace.

-----

<a id="standard-automation-workflow"></a>
## Standard-Automatisierungsworkflow

Ein ACP-v1-SDK-Client initialisiert `dsh --profile acp`, erstellt eine Session mit absolutem `cwd` und optionalen standardmäßigen stdio-/HTTP-MCP-Deklarationen, wählt ein angebotenes `model` oder `reasoning_effort`, promptet unter Beobachtung standardmäßiger semantischer Updates und ruft dann `session/close`. Ein anderer Prozess kann `session/list` und `session/resume` gegen dieselbe Profile-Persistence-Root verwenden; resume verbindet die von diesem Request gelieferten MCP-Deklarationen neu und spielt keine Historie ab.

Die vollständige unterstützte Methodenmatrix, das MCP-Trust-Modell, das Update-Mapping und die Stop-Gründe liegen im [`dsh-acp`-Protokollvertrag](../../acp/acp/README.de.md#standard-acp-v1-surface). Dieses Profil fügt keine private Methode, Capability, kein `_meta`, keine Umgebungsvariable und kein Transportfeld hinzu. Der keyless Control-Surface-Konformitätstest treibt das echte Profil über das öffentliche ACP-SDK.

<a id="model-experience"></a>
## Model Experience

### ACP-Coding-Agent-Persona

#### Was das Modell sieht

Das Profil liefert `You are a coding agent powered by the {{model}} model.` vor der First-Party-Anleitung und `Your working directory is {{cwd}}.` in einem separaten Persona-Suffix. Die Route der ACP-Zeile und das cwd jedes `session/new` lösen die Platzhalter auf.

#### Token-Effekt

Eine kurze stabile Persona plus die datenabhängigen Base-Prompt-Abschnitte und ausgewählten Tool-Schemas.

#### KV-Cache-Effekt

Stabil für ein fixes Profil, Provider, Modell und Tool-Repertoire. Profiländerungen greifen beim nächsten Prozess, weil das ausgelieferte ACP-Profil Startup-only-Patches verwendet.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Ein Profil kann die ACP-Bridge weglassen** — ein eigenes ACP-Launch-Profil muss dieses Bundle oder eine andere `dsh-acp`-Zeile behalten; andernfalls antwortet kein Peer dem Client.
- **User-Plugins können die stdout-Reinheit verletzen** — Profil- und Per-Launch-Patches sind vertrauenswürdige Anwendungs-Composition. Das ausgelieferte Bundle schreibt kein nicht-protokollgemäßes stdout, kann aber ein beliebiges eingefügtes Plugin nicht eindämmen.
- **Konfigurationsänderungen erfordern Neustart** — das ausgelieferte `acp`-Profil nutzt `patchReload: startup`, sodass eine stdio-Verbindung niemals eine ersetzte Bridge oder Agent-Abhängigkeit beobachtet.


<a id="dev-note"></a>
### Hinweis für Entwickler

<details>
<summary>Arbeitskontext für Maintainer — zum Ausklappen klicken</summary>

Keiner.

</details>

**Laufzeitinvariante:** Es wird kein Companion publiziert. Das Bundle fügt einen Prozess-Transport und einen Startup-Latch hinzu; Quell-/Built-stdio-Tests besitzen Frame-Reinheit, Help-Ausschluss und Shutdown.
