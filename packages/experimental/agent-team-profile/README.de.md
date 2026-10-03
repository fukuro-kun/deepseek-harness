---
description: "Veröffentlichter experimenteller Agent-Teams-Profile-Layer über dsh-base mit Team-scoped Koordinations-Tools und One-Shot-Delegation."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-agent-team-profile
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh-experimental-agent-team-profile` ist ein veröffentlichter experimenteller Profile-Layer, der [Agent Teams](../agent-team/README.de.md) über `@deepseek-ai/dsh-base` aktiviert. Sein Patch fügt die Team-Domain und Team-scoped Tools ein, deaktiviert die überlappenden globalen Continuable-Child-Controls und behält die gewöhnlichen Fresh- und Fork-Delegation-Tools als One-Shot-Operationen. Füge ihn explizit einem initialisierten Profile hinzu; kein ausgeliefertes Profile aktiviert ihn standardmäßig.

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

### In ein Profile installieren

Füge das Paket einem initialisierten Profile hinzu und führe dann einen Task aus, der den Lead bittet, Arbeit zu delegieren:

```sh
dsh plugin --profile headless add @deepseek-ai/dsh-experimental-agent-team-profile
dsh --profile headless "Use Agent Teams to split this task between two teammates, wait, and summarize."
```

Das Profile muss bereits `@deepseek-ai/dsh-base` enthalten, dessen Subagent-Services und Provider-Zeilen dieser Layer konsumiert. Das Entfernen des Pakets mit `dsh plugin --profile <name> remove @deepseek-ai/dsh-experimental-agent-team-profile` entfernt das Bundle aus der geordneten Layer-Liste des Profiles.

### Was du bekommst

Der Layer fügt die Agent-Teams-Domain und ihre scoped Creation-, Roster-, Messaging-, Interruption-, Waiting- und Task-Board-Tools hinzu. Er deaktiviert die globalen Continuable-Child-Control-Zeilen, deren Tool-Namen sich mit Team-Controls überschneiden, während `subagent` und `subagent_fork` als One-Shot-Delegation-Tools verfügbar bleiben.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Der Runtime-Inhalt des Pakets ist [`cordis.patch.yml`](cordis.patch.yml). Nach `dsh-base` angewendet, deaktiviert der Patch `tool-subagent-control` und `tool-subagent-list-agents`, setzt die Fresh- und Fork-Subagent-Zeilen auf `one-shot` und fügt die Team-Service- und Tool-Zeilen mit expliziten Providers und Limits ein.

| Datei | Rolle |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Geordneter Patch über `dsh-base` |
| [`src/index.ts`](src/index.ts) | Leerer Module-Entry; der Patch ist der Runtime-Inhalt |
| — | Es wird kein Runtime-Invarianten-Companion veröffentlicht; das Paket trägt nur einen statischen Profile-Patch. Die Team-Domain- und Tool-Pakete besitzen die mutablen Relationen, die er aktiviert. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

- [Experimentelle Pakete](../README.de.md) — Incubation-Status und Publication-Policy.
- [Agent-Teams-Service](../agent-team/README.de.md) — Durable Roster-, Messaging- und Task-Board-Verhalten.
- [Agent-Teams-Tools](../tool-agent-team/README.de.md) — die Team-scoped Model-Tool-Oberfläche.
- [Base-Bundle](../../bundle/base/README.de.md) — der Profile-Layer, den dieser Patch erweitert.

-----

<a id="model-experience"></a>
## Model Experience

### Team-Policy und Tools

#### Was das Modell sieht

Die Team-Policy und die Schemas gehören [`@deepseek-ai/dsh-experimental-tool-agent-team`](../tool-agent-team/README.de.md). Dieses Bundle ändert nur die Composition: Team-scoped `list_agents`, `send_message` und `interrupt_agent` ersetzen die deaktivierten globalen Continuable-Child-Controls. `subagent` und `subagent_fork` bleiben als One-Shot-Delegation-Tools verfügbar, deren Children das Continuable-Child-`report`-Tool nicht erhalten.

#### Token-Effekt

Das Bundle fügt die von `dsh-tool-team` beschriebene Team-Policy und Tool-Schemas hinzu; es fügt keinen eigenen Prompt-Text hinzu.

#### KV-Cache-Effekt

Die Composition des Bundles bleibt prefix-stabil, solange Patch, Team-Identität und konfigurierte Tool-Schemas unverändert bleiben.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Nur Opt-in** — das Paket ist public, aber kein ausgeliefertes CLI-, Web-, SDK-, ACP- oder Python-Profile aktiviert es.
- **Geteilter Checkout** — jeder Teammate beobachtet dasselbe Working Directory; dieses Bundle fügt weder Worktree-Isolation noch Filesystem-Locking hinzu.
- **Base-Profile erforderlich** — der Patch hängt von Row-Ids und Subagent-Providers ab, die `dsh-base` liefert; er ist kein eigenständiges Profile.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
