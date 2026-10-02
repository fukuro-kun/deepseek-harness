---
description: "Der menschenseitige /goal-Slash-Command für Nutzer und Maintainer, die Goal-Kontrolle in UI-Command-Planes wählen, komponieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-command-goal

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-command-goal` gibt Nutzern den `/goal`-Befehl, um das aktuelle Goal direkt in einer interaktiven UI zu erstellen, zu editieren, zu pausieren, zu resumen, zu löschen und zu inspizieren. Befehle und ihre direkte Ausgabe bleiben in der UI und gelangen nicht in Model-Requests. Akzeptierte Änderungen werden persistiert, und geordnete Bild- oder Datei-Attachments an einem Create oder Edit werden zu einer gewöhnlichen User-Message, die spätere Goal Rounds lesen können. Verwende dieses Paket in interaktiven Deployments mit einem Command-Adapter; Headless- und Automation-Apps ohne einen solchen brauchen es nicht.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Modell-Erfahrung](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Verwende `dsh-command-goal` in interaktiven Deployments, die einen Command-Adapter mounten — der mitgelieferte Web-Client ist die Referenz. Er gibt Nutzern direkte Kontrolle über den Goal-Lifecycle ohne einen Model-Turn: Befehle laufen in der UI-Command-Plane, und der Adapter rendert ihre Ergebnisse direkt.

### Befehlsreferenz

Jeder Sub-Befehl läuft gegen das aktuelle Goal des aufrufenden Agents; ein nacktes `/goal` zeigt die Usage, wenn kein Goal existiert.

| Eingabe | Ergebnis |
|---|---|
| `/goal` | Zeigt das aktuelle Objective, die durable Phase, Round-Anzahl und -Cap, die prozesslokale Aktivierung und die gültigen nächsten Befehle; ein geblocktes Goal zeigt zusätzlich seinen Policy-Code und dessen Erklärung |
| `/goal <objective>` | Erstellt und armt ein Goal oder ersetzt ein abgeschlossenes Goal durch eine frische Identität |
| `/goal edit <objective>` | Editiert das aktuelle Objective, ohne Phase oder Aktivierung zu ändern |
| `/goal pause` | Pausiert ein aktives Goal und entarmt die Continuation |
| `/goal resume` | Resumt ein gestopptes Goal oder rearmt ein aktives Goal nach Session-Resume oder Fork, vorbehaltlich seines verbleibenden Round-Caps |
| `/goal clear` | Löscht das aktuelle Goal und bewahrt dabei seine durable History |

### Eingabegrammatik

Kontrollwörter (`clear`, `pause`, `resume`, `edit`) werden nur erkannt, wenn sie die gesamte Eingabe ausfüllen; jedes andere nicht-leere Suffix ist ein Objective, sodass `/goal pause after verification` genau dieses literale Objective erstellt. `edit` nimmt seinen Ersatz inline und verweigert, ein unvollendetes Goal direkt zu ersetzen. Erwartete Domain-Ablehnungen werden zu stabilen, direkten Command-Fehlern, ohne gebrandete IDs oder Revisionen zu exponieren; unerwartete Implementierungsfehler lassen den Dispatch weiterhin fehlschlagen, damit Adapter sie als Command-Fehlschläge melden können.

### Attachments

`/goal` deklariert Attachment-Unterstützung. Attachments begleiten nur ein Objective: Nach einem erfolgreichen Create oder Edit submittet der Befehl ein User-Followup, das die zugelassenen Image- und File-Blocks in Auswahlreihenfolge trägt, gefolgt vom festen Text `Reference attachments for the goal objective.` Spätere Goal Rounds lesen diese gewöhnliche Session-History; die Goal-Domain speichert keinen Attachment-State. Jeder andere Sub-Befehl und jeder verweigerte Create oder Edit liefert einen direkten Fehler vor einer Domain-Mutation und lässt Draft und Cards des dispatchenden Composers unversehrt.

### Komposition

Der Befehl injiziert die Commands-Registry und den Goal-Service. Eine eigene App mountet deren Owner plus dieses Plugin; automatische Continuation bleibt eine unabhängige Wahl:

```yaml
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: goal
  name: '@deepseek-ai/dsh-goal'
- id: command-goal
  name: '@deepseek-ai/dsh-command-goal'
```

Die mitgelieferte `dsh`-Base aktiviert den Persisted-Goal-Stack und diesen Befehl. Das Web-Bundle hält Goal-Service und Driver auf dem Host, deaktiviert den Base-Command-Producer und mountet den Producer in den `standard`-, `code`- und `cordis`-Agent-Presets; `minimal` lässt ihn weg. Die ACP-Automation-App aktiviert die Domain und die Model-Tools ohne Command-Adapter. Das eigenständige `sdk-minimal`-Profil lässt den kompletten Goal-Stack weg, damit seine Result-API weiterhin genau einen korrelierten physischen Turn abschließt.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt, wie der Befehl Eingaben parst und Ausgaben rendert; der beobachtbare Vertrag ist in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Design

- **Grammatik, kein Freitext.** Der Parser erkennt die exakten Kontrollwörter (`clear`, `pause`, `resume`, `edit`) nur, wenn sie die gesamte Eingabe ausfüllen; jedes andere nicht-leere Suffix ist ein Objective. `edit` allein ist ungültig, und `edit` verweigert, ein unvollendetes Goal direkt zu ersetzen.
- **Domain-Ablehnungen werden stabile Fehler.** `GoalError`-Ergebnisse werden in direkte Command-Fehler mit fester Meldung umgewandelt; unerwartete Fehlschläge werden erneut geworfen, sodass Adapter einen Command-Fehlschlag statt eines Domain-Ergebnisses melden. Gerenderte Ausgabe exponiert niemals gebrandete IDs oder Revisionen.
- **Attachments begleiten das Objective.** Bei erfolgreichem Create oder Edit submittet der Befehl ein User-Followup, das die zugelassenen Image- und File-Blocks in Auswahlreihenfolge trägt, gefolgt vom festen Text `Reference attachments for the goal objective.` Jeder andere Pfad submittet nichts, sodass der dispatchende Composer Draft und Cards behält.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Befehlsgrammatik, Status-Rendering, Attachment-Submission |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; dieser Command-Adapter besitzt keinen Event-Stream und keine State-Projection; akzeptierte Mutationen werden von der Goal-Domain geprüft, und das Command-Dispatch-Verhalten ist durch Paket-Tests abgedeckt. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Der Befehl ist ein dünner Adapter über der Goal-Domain; lies diese Seiten für den State, den er mutiert, und die Registry, in die er sich einhängt.

- [Goal-Service](../goal/README.de.md) — der State und Lifecycle, den der Befehl mutiert.
- [Commands-Service](../../interaction/commands/README.de.md) — der Command-Registry-Vertrag und der Dispatch.
- [Agent Note zur Harness-Level-Goal-Ausführung](../../../.agents/notes/implemented/feature/2026-07-16-harness-level-loop.de.md) — die UX- und Kompositionsentscheidungen.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

### Menschliche `/goal`-Kontrolle

#### Was das Modell sieht

Die Slash-Eingabe, die Mutation und die direkte Status-/Fehlerausgabe fehlen in Model-Requests. Die Goal-Domain zeichnet die Mutation als `goal/change` auf; ein aktivierter Same-Session-Driver kann den resultierenden State in einem späteren Continuation-Prompt exponieren. Präsentationstext wird niemals geloggt. Wenn ein Create oder Edit Attachments trägt, sieht das Modell eine gewöhnliche User-Message: die geordneten Image- und File-Blocks gefolgt vom Text `Reference attachments for the goal objective.` Sie steht in der Session-History vor der nächsten Goal Round.

#### Token-Effekt

Status lesen, ein Goal mutieren oder einen direkten Command-Fehler empfangen fügt keine Model-Tokens hinzu. Ein aktivierter Same-Session-Driver kann spätere Goal-Round-Prompts hinzufügen. Die Attachments eines Objective fügen eine gewöhnliche User-Message mit den normalen Text-, Bild- und File-Handle-Kosten hinzu.

#### KV-Cache-Effekt

Command-Discovery, Mutationen und direkte Ausgabe beeinflussen den Cache nicht. Spätere Continuation-Prompts folgen der gewöhnlichen Request-History des Drivers.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Befehl ungeeignet ist oder besondere Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Nur Plain-Text-Interaktion** — die generische Command-Registry hat kein modales Edit-Formular und keinen Replacement-Confirmation-Callback; Inline-Edit und explizites Clear halten destruktive Absicht über Adapter hinweg deterministisch.
- **Kein per-Command-Round-Cap-Argument** — `defaultMaxGoalRounds` bleibt Deployment-Konfiguration, während eine direkte menschliche Anfrage das Modell bitten kann, `max_goal_rounds` über das separat autorisierte Goal-Tool zu editieren.
- **Kein kontinuierliches Status-Widget** — nacktes `/goal` ist die portable Observation-API; adapter-spezifische Badges oder reconnectbare Command-Ausgabe werden nicht bereitgestellt.
- **Nur der Web-Command-Adapter in den mitgelieferten Apps** — Headless-, ACP-Automation- und JSON-RPC-Adapter konsumieren `ctx.commands` nicht. Gewöhnliche Prompts können weiterhin modellseitige Goal-Tools autorisieren, wenn diese komponiert sind.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Diese Dev-Notiz ist Arbeitskontext für Maintainer; sie ist explizit nicht autoritativ. Offen und unentschieden: ein kontinuierliches Status-Widget und eine per-Command-Round-Cap-Eingabe; beides ist zurückgestellte UI- und Konfigurationsarbeit.

</details>
