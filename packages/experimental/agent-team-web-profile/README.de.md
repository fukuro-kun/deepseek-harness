---
description: "Das veröffentlichte experimentelle Agent-Teams-Panel nach der Host-Team-Schicht zu einem Web-Profil hinzufügen."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-agent-team-web-profile
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-experimental-agent-team-web-profile` ist die veröffentlichte experimentelle Web-Schicht für [Agent Teams](../agent-team/README.de.md). Es wird nach `@deepseek-ai/dsh-web-app` und [`@deepseek-ai/dsh-experimental-agent-team-profile`](../agent-team-profile/README.de.md) hinzugefügt, um Team-Roster, Task-Board und Teammate-Navigation im Browser anzuzeigen. Das Entfernen einer der beiden experimentellen Schichten lässt die stabile Base- und Web-Komposition unverändert. Kein ausgeliefertes Web-Profil aktiviert es standardmäßig.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

### In ein Profil installieren

Die Host- und Web-Agent-Teams-Schichten in dieser Reihenfolge zu einem initialisierten `web`-Profil hinzufügen:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-agent-team-profile
dsh plugin --profile web add @deepseek-ai/dsh-experimental-agent-team-web-profile
```

Der erste Befehl liefert die Team-Domain, generierte Remote-Methoden und Model-Tools. Der zweite Befehl aktiviert den deklarierten Patch dieses Pakets und seine Browser-Präsentation. Das Entfernen des Pakets mit `dsh plugin --profile web remove @deepseek-ai/dsh-experimental-agent-team-web-profile` entfernt die Web-Schicht aus der geordneten Bundle-Liste des Profils.

### Was man bekommt

Der Konversations-Header erhält das Team-Roster, das geteilte Task-Board und die Teammate-Navigation. [`@deepseek-ai/dsh-experimental-client-ui-agent-team`](../client-ui-agent-team/README.de.md) besitzt diese Browser-Interaktionen und mountet den generierten Client-Remote-Namespace, über den der Host-Team-Service erreicht wird.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Der Runtime-Inhalt des Pakets ist [`cordis.patch.yml`](cordis.patch.yml). Nach `dsh-web-app` und der Host-Agent-Teams-Schicht angewendet, fügt sein einzelner `insert`-Eintrag die `ui-agent-team`-Zeile für `@deepseek-ai/dsh-experimental-client-ui-agent-team` hinzu. Das eingefügte Client-Plugin besitzt die generierte Remote-Assembly und die Team-UI; dieses statische Bundle hält keinen veränderlichen Zustand und installiert keine Runtime-Invariante.

| Datei | Rolle |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Geordneter Web-Patch mit der `ui-agent-team`-Zeile |
| [`src/index.ts`](src/index.ts) | Leerer Modul-Einstieg; der Patch ist der Runtime-Inhalt |
| — | Es wird kein Runtime-Invarianten-Companion veröffentlicht; das Paket trägt nur einen statischen Profil-Patch. Die Remote-Assembly und die Team-UI besitzen ihre eigenen Aktivierungsanforderungen. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [Experimentelle Pakete](../README.de.md) — Inkubationsstatus und Veröffentlichungsregeln.
- [Agent-Teams-Host-Profil](../agent-team-profile/README.de.md) — die benötigte Domain-, Remote- und Model-Tool-Schicht.
- [Agent-Teams-Browser-UI](../client-ui-agent-team/README.de.md) — Verhalten von Roster, Task-Board und Teammate-Navigation.
- [Web-Bundle](../../bundle/web-app/README.de.md) — die stabile Browser-Schicht, die dieser Patch erweitert.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über das zusammen mit dieser Web-Schicht gewählte Host-seitige Agent-Teams-Profil.

#### KV-Cache-Auswirkung

Dieses Web-Bundle fügt keinen Model-Anfrage-Inhalt hinzu; die Host-seitigen Team-Tools besitzen Prompt-, Schema- und Cache-Auswirkungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Geordnete Komposition** — `dsh-base`, `dsh-web-app`, `dsh-experimental-agent-team-profile` und dieses Paket müssen in dieser Reihenfolge bleiben.
- **Preset-scoped Legacy-Steuerungen** — stabile Web-Presets mounten weiterhin fortsetzbare Subagent-Steuerungen im Preset-Scope. Top-Level-Host-Profil-Overrides ersetzen diese Scoped-Registrierungen nicht, sodass Team-Roster und Legacy-Kind-Steuerungen beide erscheinen können, bis Web ein Team-bewusstes Preset hat. Die [Web-Agent-Teams-Entscheidung](../../../.agents/notes/archived/feature/2026-08-06-agent-teams-web.md) hält diese zurückgestellte Kompositionsarbeit fest.
- **Nur Opt-in** — das Paket ist öffentlich, aber kein ausgeliefertes Web-Profil aktiviert eine der beiden Agent-Teams-Schichten.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
