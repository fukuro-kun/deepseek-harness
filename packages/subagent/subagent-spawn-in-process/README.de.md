---
description: "In-Process-Spawn-Subagent-Backend für Nutzer und Maintainer, die Fresh-Child-Delegation auswählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent-spawn-in-process
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-subagent-spawn-in-process` ist ein In-Process-Subagent-Backend: Es führt jede delegierte Aufgabe in einem frischen Child-Agent aus, der diesen Prozess und seine Agent-Factory-, LLM- und Tool-Services teilt. Das Child startet mit einer leeren Konversation, deshalb muss ein Task-Prompt für sich allein stehen; es erbt Arbeitsverzeichnis, Session-Lineage, Provider, Modell, Reasoning-Effort und das Output-Token-Limit des Parents, sofern `request.agentOptions` sie nicht überschreibt. Ein Delegation-Tool oder API-Aufruf erreicht es unter dem Provider-Namen `spawn`. Wählen Sie es für den billigsten Delegation-Transport; wählen Sie das Fork-Backend, wenn das Child auf den abgeschlossenen Konversations-Turns des Parents aufbauen muss.

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

Mounten Sie dieses Backend in einer Komposition, die Arbeit an frische In-Process-Children delegiert. Der übliche Weg ist explizit: Laden Sie den Subagent-Service und dieses Backend und richten Sie dann ein Delegation-Tool wie `dsh-tool-subagent` auf den `spawn`-Provider.

### Wann Sie es wählen

Wählen Sie das Spawn-Backend, wenn das Child keine Parent-Konversation braucht und das Laufen in diesem Prozess akzeptabel ist. Vermeiden Sie es, wenn das Child auf abgeschlossenen Parent-Turns aufbauen muss — das Fork-Backend seedet diese Historie — oder wenn das Child außerhalb dieses Prozesses laufen muss, was die Out-of-Process-Backends bereitstellen. Weil das Child per Default Arbeitsverzeichnis und LLM-Auswahl des Parents erbt, verhält sich ein in sich geschlossener Prompt exakt wie geschrieben.

### Minimale Konfiguration

Laden Sie den Subagent-Service und dieses Backend und konfigurieren Sie dann ein Delegation-Tool pro Ziel. Dies ist die kleinste Komposition, die ein durch Spawn gestütztes `subagent`-Tool exponiert:

```yaml
- name: '@deepseek-ai/dsh-subagent'
- name: '@deepseek-ai/dsh-subagent-spawn-in-process'
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
```

| Feld | Default | Bedeutung |
|---|---|---|
| `providerName` | `spawn` | Auf `ctx.subagents` registrierter Provider-Name |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-subagent-spawn-in-process) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Was eine Delegation tut

Ein Tool-Aufruf startet ein Child und wartet auf sein Ergebnis: Das Child arbeitet in seiner eigenen Session, und der Parent erhält nur seine finale Ausgabe oder ein fehlerhaftes Tool-Ergebnis, wenn der Lauf abgebrochen, verweigert, durch sein Token-Limit abgeschnitten oder beim Start rejected wird. Ein rejected Start hinterlässt kein veröffentlichtes Child; ein abgeschlossener Lauf wird disposed, nachdem sein Ergebnis eingesammelt ist.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie das Backend gebaut ist und woher das Verhalten in [Dieses Paket verwenden](#use-this-package) kommt; die geteilte Mechanik gehört dem In-Process-Driver.

### Design-Konzept

Eine Trennung: Dieses Backend trägt nur die Provider-Registrierung und die Entscheidung zum frischen Start bei, während jede Lauf-Mechanik — Depth-Checking, Child-Erzeugung, pro-Child-Anpassung, strukturierte Ausgabe, Abbruch, Ergebnis-Read und Disposal — in `dsh-subagent-in-process-driver` lebt. Die Creation-Transaction der Agent-Factory besitzt das unveröffentlichte Setup-Fenster und seinen Rollback; nach der Veröffentlichung besitzt der Aufrufer den Lauf.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Provider-Registrierung: `Config`-Schema, Capability-Deklaration, `start()` |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; dieses Paket exponiert keine unabhängige Event-Sequenz oder mutable Datenrelation über die an seiner besitzenden Seam durchgesetzten Verträge hinaus. |

### Lauf-Fluss

Eine Start-Anfrage resolved über den Subagent-Service, dann validiert der geteilte Driver die Tiefe, mintet eine Child-Session-Id, erzeugt das Child über die Host-Agent-Factory mit dem Signal des Aufrufers, wendet Persona, Tool-Filter und strukturierte Ausgabe innerhalb des Creation-Fensters an, veröffentlicht das Child, treibt einen Task, liest die eigene finale Ausgabe des Childs und disposed den Handle quiescent.

### Ownership und Scope

Das Child erhält einen frischen flachen Registrierungs-Scope: Parent-Tool-Restriktionen und -Autorität werden nie importiert, und der Filter, den das Tool anwendet, ist Komposition, kein vom Parent abgeleiteter Grant. Das Backend advertisiert alle fünf Start-Zeit-Capabilities, einschließlich `agentOptions`, weil es das Creation-Fenster des Childs kontrolliert und jede einzelne durchsetzen kann.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paket-Vertrag nicht ausreicht; sie führen vom geteilten Subagent-Modell zu den Geschwister-Backends und zur erschöpfenden Konfiguration.

- [Subagent-Subsystem](../../../docs/subsystems/subagent.de.md) — Start-Anfragen, Ergebnisse, Live-Läufe und der Provider-Vertrag.
- [dsh-subagent-in-process-driver](../subagent-in-process-driver/README.de.md) — der geteilte Lauf-Driver, den dieses Backend aufruft.
- [dsh-subagent-fork-in-process](../subagent-fork-in-process/README.de.md) — das Geschwister-Backend, das abgeschlossene Parent-Turns seedet.
- [dsh-tool-subagent](../tool-subagent/README.de.md) — das modellseitige Delegation-Tool, das diesen Provider erreicht.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-subagent-spawn-in-process) — jedes akzeptierte Config-Feld und seine Quell-Deklaration.

-----

<a id="model-experience"></a>
## Model Experience

### Child-Agent-Request

#### Was das Modell sieht

Das frische Child erhält den Task-Inhalt wörtlich als seine einzige User-Message in einer neuen leeren Konversation, per Default mit Provider, Modell, Reasoning-Effort, Output-Token-Limit und Arbeitsverzeichnis des Parents. Eine konfigurierte Persona verdeckt globalen Prompt-Text im Scope des Childs; ein Tool-Filter entfernt benannte globale Tools aus seinen Schemas, der Executable-Lookup und den PTC-Mode-SDK-Bindings, lässt aber unabhängig registrierte Guidance bestehen. Keine Parent-Konversations-Message ist enthalten; der Filter ist Komposition, kein vererbter Authority-Grant.

#### Token-Effekt

Das Child bezahlt für einen neuen unabhängigen Kontext und Historie, und kein Parent-Historie-Token wird dupliziert. Eine Persona ändert die wiederholten Prompt-Kosten des Childs; ein Tool-Filter ändert seine Schema- oder Generated-SDK-Kosten.

#### KV-Cache-Effekt

Der Request-Cache des Childs ist unabhängig vom Parent. Die Child-Historie wächst append-only, während Persona-, Tool-Filter-, Generated-SDK-, Provider- oder Modell-Änderungen ein anderes Child-Präfix etablieren.

### Parent-Tool-Ergebnis, indirekt

#### Was das Modell sieht

Über `dsh-tool-subagent` erhält der Parent nur die finale Ausgabe des Childs oder ein fehlerhaftes Ergebnis für einen nicht abgeschlossenen Stop-Reason; intermediäre Child-Arbeit erreicht es nie.

#### Token-Effekt

Der Parent-Input wächst um ein datenabhängiges Ergebnis, das bis zur Compaction behalten wird.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Request-Präfix und macht bestehende KV-Cache-Einträge nicht ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Backend die falsche Wahl ist; sie sind aktuelle Paket-Einschränkungen.

- **Frisch heißt kein Parent-Transcript** — das Child erbt cwd, Lineage, Provider, Modell, Reasoning-Effort, Output-Token-Limit und explizit konfigurierte Persona- oder Tool-Restriktionen, aber nichts von der Konversation des Parents; verwenden Sie das Fork-Backend, wenn Completed-Turn-Kontext erforderlich ist.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
