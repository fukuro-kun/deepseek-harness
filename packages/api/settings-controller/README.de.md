---
description: "Host-Remote-Owner für Settings- und Credential-Konfigurationsoberflächen, einschließlich redigierter Reads, Writes, Credential-Referenzen und nativem Dokument-Öffnen."
kind: "package-reference"
---
# Settings Controller

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`@deepseek-ai/dsh-api-settings-controller` stellt generierte `ctx.remote.settings`- und `ctx.remote.credentials`-Namespaces für Browser-Konfigurationsoberflächen bereit. Es gibt redigierte Settings- und Credential-Metadaten zurück, unterstützt Settings- und Credential-Writes ohne Rückgabe geheimer Werte und öffnet provider-eigene Settings- oder Agent-Preset-Orte auf dem Host-Desktop. Fehlt ein Provider, bleibt der Namespace registriert und liefert einen handhabbaren Konfigurationsfehler.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Konfiguration](#configuration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Hinweis für Entwickler](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounte dieses Paket als Loader-Entry in einem Profil, das Browser-Konfiguration bedient. Der Entry registriert beide Namespaces unabhängig von ihren Providern, sodass ein fehlender Provider beim Aufruf einen benannten Konfigurationsfehler erzeugt. Seine generierten Descriptoren gehen in die strikte Typert-Registry, während die Settings- und Credential-Definitions schlichte Cordis-Services ohne eigene Wire-Verpflichtungen bleiben.

`describe(refs)` beantwortet eine Map, gekeyt nach den angefragten Namen, sodass eine Settings-Seite, die jede Referenz ihrer Zeilen beschreibt, diese Zeilen gemeinsam settelt. Sie akzeptiert höchstens 64 Namen pro Call, meldet einen ungültigen Namen oder einen leeren Write-Wert als `bad-request` und kopiert jede Antwort Feld für Feld — ein Provider, der mehr zurückgibt als `CredentialInfo` deklariert, kann nicht erweitern, was die Grenze überquert. Gültige `set(ref, value)`- und `unset(ref)`-Calls melden eine Provider-Ablehnung als `credential-rejected` und tragen die Provider-Nachricht mit nur der Referenz in ihren Details. Geheime Werte überqueren die Grenze nur in dieser Richtung: Keine Methode hier gibt einen zurück.

`settings.describe()` liefert Deployment-Fakten und jeden Namespace unter `redactSecrets: true`. `settings.update`, `settings.replace` und `settings.mutate` exponieren die drei Write-Operationen des Settings-Service und geben die neue redigierte Ansicht des Namespace zurück; stale Writes nutzen `settings-conflict` und andere Provider-Ablehnungen `settings-rejected`.

`settings.openSettingsDocument()` bereitet das provider-eigene Dokument vor und öffnet es mit dem nativen Texteditor-Intent. `settings.canOpenAgentPresetDirectory()` meldet die Verfügbarkeit des nativen Öffnens, sobald die Preset-Seite sichtbar wird. `settings.openAgentPresetDirectory(id)` löst nur ein vom Nutzer verfasstes Preset auf und öffnet entweder sein Verzeichnis oder gibt den Pfad zurück, wenn natives Öffnen nicht verfügbar ist; keine der beiden Öffnen-Methoden akzeptiert ein vom Browser geliefertes Dateisystemziel.

-----

<a id="configuration"></a>
## Konfiguration

| Feld | Default | Bedeutung |
|---|---|---|
| `nativeOpen` | plattformerkannt | Ob Agent-Preset-Verzeichnisse an einen nativen Desktop-Öffner übergeben werden können |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-api-settings-controller) ist die erschöpfende Quelle für akzeptierte Felder und ihr JSDoc.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da Settings- und Credential-Konfiguration Browser- und Host-State sind und keinen Prompt, kein Tool und kein Session-Event registrieren.

#### KV-Cache-Effekt

Kein direkter Effekt; das Lesen oder Schreiben dieser Konfigurationswerte verändert keine bereits unterwegs befindlichen Model-Requests.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- Die Batch-Obergrenze ist fest auf 64 Referenzen gesetzt und kein deployment-konfigurierbares Feld.

<a id="dev-note"></a>
### Hinweis für Entwickler

<details>
<summary>Arbeitskontext für Maintainer — zum Ausklappen klicken</summary>

Keiner.

</details>

**Laufzeitinvariante:** Es wird kein Companion publiziert. Die Settings- und Credential-Seams besitzen Storage und Update-Events, während dieses Paket nur ihre Methoden auf die Leitung projiziert.
