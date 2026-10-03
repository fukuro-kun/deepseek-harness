---
description: "Aktive Loader-Paketinventar-Metadaten für Deployments, die offizielle DeepSeek-Requests senden."
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-package-inventory-deepseek

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Vollständiges aktives Loader-gestütztes Plugin-Paketinventar für offizielle DeepSeek-LLM-API-Requests. Dieses Function-Plugin injiziert den Loader, die Live-Agent-Registry und `ctx.deepseekLlmApiExtensions` und besitzt dann das Feld `dsh_plugin_packages`. Aktiviere es, wenn die offizielle API die aktive Paketliste zur Request-Diagnose braucht.

## Inhaltsverzeichnis

- [Konfiguration](#configuration)
- [Sammlung](#collection)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Hinweis für Entwickler](#dev-note)

-----

<a id="configuration"></a>
## Konfiguration

| Schlüssel | Default | Bedeutung |
|---|---:|---|
| `enabled` | `true` | Registriert den `dsh_plugin_packages`-Beitrag. Auf `false` setzen, um Paket-Metadaten wegzulassen. |

Ausgelieferte Profiles nutzen den Default, sodass jeder offizielle DeepSeek-Request das Paketinventar trägt, solange die Vorbereitung gelingt.

<a id="collection"></a>
## Sammlung

Jeder Request liest die aktiven Nicht-Gruppen-Einträge des Host-Loader-Baums neu. Ist das optionale `ctx.agentPresets` vorhanden und löst `sessionId` zu einem live Agent auf, der einem stehenden Preset beigetreten ist, tritt der separate Loader-Baum dieses Presets derselben Sammlung bei; Deployments ohne den Service melden nur den Host-Baum. Einträge werden nur aufgenommen, solange ihr Root-Fiber `ACTIVE` ist und ihr effektiver Loader-Status enabled ist.

Bare-Package- und Package-Subpath-Spezifizierer werden über Nodes Paketsuchpfade aufgelöst, ohne einen `./package.json`-Export zu benötigen. Jeder gewöhnliche Eintrag nutzt die Base seines besitzenden Loader-Baums. Die Root-Einträge eines stehenden Presets nutzen die Harness-Base, passend zum bewussten Bare-Package-Override des Preset-Loaders; verschachtelte Includes behalten ihre eigenen Bases. Relative und absolute Module steigen zu ihrem nächsten Manifest auf; ein Manifest ohne `name` markiert ein loses Modul und trägt keine Paketidentität bei. Ein benanntes Paket-Manifest muss außerdem eine nicht-leere `version` deklarieren, und fehlerhafte Paket-Metadaten lassen die Request-Vorbereitung scheitern. Exakte Name-/Version-Paare werden dedupliziert und mit einem locale-unabhängigen Vergleich sortiert, während gleichzeitig aktive verschiedene Versionen getrennt bleiben.

Das Feld `dsh_plugin_packages` der Version 1 enthält nur `{ name, version }`-Paare. Ausgeschlossen werden deaktivierte, pendende, gescheiterte, disposed, unloadende, strukturelle `cordis:`-Zeilen, gewöhnliche Abhängigkeiten, lose Dateien ohne besitzende Paketidentität, programmatisch gemountete Child-Fibers und In-Memory-Dynamic-Plugins.

<a id="model-experience"></a>
## Model Experience

### Paketinventar-Metadaten

#### Was das Modell sieht

Nichts. `dsh_plugin_packages` ist Provider-Metadatum außerhalb der Messages, des System-Prompts und der Tool-Schemas des Modells.

#### Token-Effekt

Null Model-Input-Tokens; das vollständige Inventar fügt nur HTTP-Request-Bytes hinzu.

#### KV-Cache-Effekt

Keiner; Paket-Lifecycle-Änderungen verändern das modellseitig sichtbare Präfix nicht.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Nur Loader-Paket-Herkunft** — programmatische Child-Fibers und In-Memory-Dynamic-Plugins haben keine autoritative npm-Name-/Versions-Herkunft und bleiben außerhalb dieses Inventars.
- **Lose Module werden ausgelassen** — eine relative Datei ohne benanntes und versioniertes besitzendes Manifest ist ein Plugin-Modul, kein Plugin-Paket.
- **In-place-Paket-Ersatz erfordert Neustart** — Manifest-Identitäten werden für die Prozesslebensdauer gecacht. Loader-Enable, -Disable, -Mount und -Unmount sowie gewöhnliches Source-HMR aktualisieren die aktive Eintragsmenge weiterhin, aber das Ersetzen des Manifests eines gemounteten Pakets durch eine andere Version im selben Prozess ist kein unterstützter Upgrade-Pfad.


<a id="dev-note"></a>
### Hinweis für Entwickler

<details>
<summary>Arbeitskontext für Maintainer — zum Ausklappen klicken</summary>

Keiner.

</details>

**Laufzeitinvariante:** Es wird kein Companion publiziert. Jeder Request liest autoritativen Loader-Fiber-Status und Paket-Manifeste direkt; das Plugin hält kein unabhängig mutierbares Inventar vor.
