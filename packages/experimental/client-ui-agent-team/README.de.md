---
description: "Das experimentelle Web-Agent-Teams-Roster, das geteilte Task-Board und das Teammate-Navigationspanel verwenden und debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-agent-team

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Dieses Paket fügt dem Web-Conversation-Header eine Agent-Teams-Aktion hinzu, über die ein Nutzer das aktuelle Roster einsehen, das geteilte Task-Board verwalten und in die Conversation eines Teammates navigieren kann. Es liest den autoritativen Team-Zustand über den generierten `ctx.remote.agentTeams`-Beitrag und hält die gewöhnliche Child-History-Navigation auf dem stabilen addressed-subagent-Pfad. Gewählt wird es über das veröffentlichte experimentelle Agent-Teams-Web-Profil. Die Browser-Projektion erweitert weder den stabilen API-Proxy noch speichert sie Team-Zustand oder registriert modellseitigen Input.

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

Installiere das Paket über [`@deepseek-ai/dsh-experimental-agent-team-web-profile`](../agent-team-web-profile/README.de.md) nach dem stabilen Web-Bundle und dem Host-seitigen Agent-Teams-Profil. Der Web-Client-Loader mountet den `/client`-Export; der Root-Host-Export ist inert, und das Paket hat keine Nutzer-Konfigurationsfelder.

### Roster einsehen und navigieren

Das Öffnen des Panels ruft `agentTeams/view` auf. Roster-Zeilen zeigen dauerhafte Namen, Laufzeitstatus, Modell und Diagnosen. Das Auswählen eines gesunden Teammates aktualisiert den bestehenden Direkt-Child-Katalog und öffnet die gewöhnliche `{ parentSessionId, childSessionId, mode: 'continuable' }`-Adresse. Historie und spätere menschliche Prompts laufen weiter über den stabilen addressed-subagent-Conversation-Pfad; dieses Paket fügt kein Team-spezifisches Adressfeld hinzu.

### Das Task-Board verwalten

Das Task-Board zeigt Task-Identität, Owner, Blocker, Bereitschaft, beratende Write-Scopes und Overlap-Warnungen. Ein Nutzer kann Tasks über `agentTeams/createTask` und `agentTeams/updateTask` erstellen, bearbeiten, zuweisen oder die Zuweisung aufheben, abschließen, wieder öffnen und löschen. Jedes Update sendet die angezeigte Revision, und Create- oder Update-Ablehnungen bleiben explizite Geschäftsergebnisse.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Der Client-Export mountet den generierten `ctx.remote.agentTeams`-Beitrag aus [`@deepseek-ai/dsh-experimental-agent-team/remote`](../agent-team/README.de.md) und registriert dann seine Locale-Dictionaries und einen Conversation-Header-Slot durch Cordis-Effects. Das Disposen der Plugin-Fiber entfernt beide Registrierungen.

Das Starten eines Create oder Update invalidiert ältere Refreshes. Bei Erfolg wird die vollständige Team-Ansicht neu geladen, damit die abgeleiteten Felder jeder Task aktuell bleiben. Ein `team-task-conflict`-Ergebnis zeigt einen Stale-State-Hinweis erst, nachdem dieses Neuladen gelingt; ein Neulade-Fehler bleibt stattdessen sichtbar. Das Bearbeiten von Task-Text oder Scopes und das Ändern von Abhängigkeiten verwenden zwei sequentielle Compare-and-Set-Mutationen, weil der Team-Dienst sie als separate Aktionen exponiert.

| Datei | Rolle |
|---|---|
| [`src/client/mount.ts`](src/client/mount.ts) | generiertes Remote-, Locale-, Navigations- und Slot-Registrierungen |
| [`src/client/TeamAction.tsx`](src/client/TeamAction.tsx) | Roster- und Task-Board-Interaktionszustand |
| [`src/client/locales.ts`](src/client/locales.ts) | englische und chinesische Panel-Texte |
| [`src/index.ts`](src/index.ts) | inerter Host-Eintrag |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [Agent-Teams-Web-Profil](../agent-team-web-profile/README.de.md) — das veröffentlichte Opt-in-Bundle, das dieses Client-Plugin mountet.
- [Agent-Teams-Dienst](../agent-team/README.de.md) — autoritatives Roster-, Task- und Remote-Verhalten.
- [Conversation-UI](../../client/ui-conversation/README.de.md) — der stabile Header-Slot und die addressed-subagent-Navigationsoberfläche.
- [Experimentelle Pakete](../README.de.md) — Inkubationsstatus und Veröffentlichungsrichtlinie.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da diese Browser-Projektion und Task-Steuerungsoberfläche keinen modellseitigen Input registriert.

#### KV-Cache-Auswirkung

Keine direkte Auswirkung; die Team-Tools und die gewöhnliche Conversation-Einreichung besitzen jede spätere modellsichtbare Verwendung.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Snapshot-Refresh** — das Panel aktualisiert sich beim Öffnen, bei explizitem Refresh und bei Mutationen; es hat keine Live-Event-Subscription oder Mailbox-Timeline.
- **Gewöhnliche Child-Fortsetzung** — eine nach der Navigation gesendete menschliche Nachricht nutzt den stabilen addressed-subagent-Prompt-Pfad, nicht die Team-Peer-Mailbox.
- **Keine Lifecycle- oder Workspace-Steuerungen** — das Panel kann Teammates weder spawnen, umbenennen, löschen noch unterbrechen, und Write-Scopes bleiben beratende Metadaten.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. RPC ist autoritativ, und das Paket besitzt nur eine disponible Slot-Registrierung.
