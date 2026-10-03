---
description: "Host-Hälfte dynamischer Cordis-Pakete für Agents und Maintainer, die Registry, Sandbox und den Run-Roundtrip wählen, komponieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-cordis-host-runner
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-cordis-host-runner` macht dynamische Pakete in diesem Prozess lauffähig: Definitionen, die das Modell mit `cordis_define` aufzeichnet, bleiben hier, Host-Hälften laufen in einer `node:vm`-Sandbox, ein Paket mit einer Browser-Hälfte wartet darauf, dass ein Mensch es auf einer Seite genehmigt oder ablehnt, und das Modell kann hier die Live-Runtime und ihre Definitionen inspizieren. Die modellseitigen Tools leben in `@deepseek-ai/dsh-tool-cordis`, und die Browser-Hälfte lädt über `@deepseek-ai/dsh-cordis-client-runner`. Definitionen leben nur im Prozessspeicher, sodass ein DSH-Neustart sie löscht und nichts auf die Festplatte geschrieben wird. Ein Config-Feld, `vmTimeoutMs`, begrenzt synchrone Sandbox-Auswertung.

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

Mounte dieses Plugin in jeder Komposition, die dynamische Pakete unterstützen soll — es treibt die `cordis_*`-Tools des Modells an, und Pakete mit einer Browser-Hälfte benötigen zusätzlich den Client-Runner plus das UI-Paket, komponiert auf der Client-Seite. Der übliche Weg ist explizit: Lade dieses Paket, setze optional `vmTimeoutMs`, und lass die Tools und den Browser den Rest erledigen.

### Minimale Konfiguration

```yaml
- name: '@deepseek-ai/dsh-cordis-host-runner'
  config:
    vmTimeoutMs: 5000
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `vmTimeoutMs` | `5000` | Millisekunden, die der synchrone Teil einer Host-Hälfte in der vm laufen darf, bevor die Auswertung abgebrochen wird |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-cordis-host-runner) ist die erschöpfende Quelle für jedes akzeptierte Feld.

### Was ein Run tut

Eine Definition wird von `cordis_define` aufgezeichnet und von `cordis_run` aktiviert. Ein Paket mit nur einer Host-Hälfte aktiviert direkt in diesem Prozess: Sein Code läuft in der Sandbox. Ein Paket mit einer Browser-Hälfte wird zu einer Anfrage: Es wartet, bis ein Mensch es auf einer Seite erlaubt oder ablehnt oder der anfragende Turn abgebrochen wird; die antwortende Seite lädt dann zuerst die Host-Hälfte und danach die Browser-Hälfte. `mode: "run"` startet das aktuelle Paket oder startet es neu, `mode: "update"` wechselt zu einer anderen Paketversion. `cordis_stop` beendet den Live-Run — entfernt die Handler des Pakets und jede geladene Browser-UI — während die Definition lauffähig bleibt; `cordis_undefine` stoppt und vergisst sie.

### Was mit Definitionen passiert

Definitionen sind Session-scoped und prozesslokal: Ein Paket ist nur für die Session sichtbar, die es definiert hat, andere Sessions lesen es als abwesend, und alles verschwindet bei einem DSH-Neustart. Das Session-Log behält die Argumente des define-Aufrufs — einschließlich des eingereichten Codes — und den Beleg; nur die In-Memory-Registry hält die geparste Definition. Eine Browser-Hälfte erreicht eine Seite nur über einen Run, sodass eine neu geladene Seite nichts hält, bis jemand das Paket erneut ausführt.

### Vertrauenshaltung

Die Sandbox isoliert Globals, ist aber keine Sicherheitsgrenze: Node-Globals fehlen oder leiten auf Cordis-Services um (`ctx.fs`, `ctx.web`, `ctx.bash`, die Timer-Helper), und eine Host-Hälfte erhält eine Fassade ohne Framework-Interna, doch die Services, die sie deklariert, erreichen die Live-Runtime. Behandle ein dynamisches Paket wie bash-Zugriff — siehe die [self-referential-toolset-Agent-Note](../../../.agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.de.md).

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design hinter dem Runner; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) behandelt.

### Designphilosophie

Der Runner baut auf zwei Trennungen. **Registry und Sandbox sind ein Service.** Der `DynamicCordisRunnerService` besitzt die Definitions-Registry, die vm-Sandbox, den Fiber-Lifecycle der Host-Hälfte und die Invoke-Handler-Tabelle, sodass das gesamte Leben einer Definition einen Owner hat. **Versionen sind unveränderliche Pakete.** Ein Plugin hält Pakete, die sich nach `define` nie ändern; `currentPackageId` und `nextPackageId` zeigen auf die laufende und die Zielversion, und `mode: "run"` gegenüber `"update"` kodiert, ob das Ziel der aktuellen Version entspricht. Der Browser-Roundtrip existiert, weil eine Browser-Hälfte nur von einer Seite ausgeführt werden kann: Der Service emittiert eine Anfrage, suspendiert und wird durch das Urteil der Seite settled, mit dem `AbortSignal` des Aufrufers als einzigem anderen Ausgang.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Service-Einstieg: `Config`, Registry-Verdrahtung, Lifecycle-Verben, steer-Nachrichten |
| [`src/registry.ts`](src/registry.ts) | Definitions-Speicher: Plugin- und Paket-Identitäten, Run-Versuche, Genehmigungsanfragen |
| [`src/sandbox.ts`](src/sandbox.ts) | `node:vm`-Auswertung: Globals, Node-API-Fallen, Syntax-Vorprüfung zur Define-Zeit |
| [`src/guard.ts`](src/guard.ts) | Registrierungsgrenze: schema-Normalisierung, die Sandbox-`ctx`-Fassade, Plugin-Form-Prüfungen |
| [`src/lifecycle.ts`](src/lifecycle.ts) | Start einer Host-Hälfte unter der `cordis-dynamic`-Fiber-Gruppe |
| [`src/inspect-registry.ts`](src/inspect-registry.ts) | Die `ctx.cordisInspect`-Registry: Host-Provider plus das gespiegelte Client-Manifest |
| [`src/types.ts`](src/types.ts) | Client-sichere Payload-Formen für den `dynamicCordisRunner`-Remote-Namespace und weitergeleitete Events |

### Wie ein Run fließt

`define` trimmt und erfordert die Metadaten, prüft die Syntax jeder Hälfte durch Kompilieren vor (ohne etwas auszuführen), prägt die Plugin- und Paket-ids und zeichnet die Definition gegen die anfragende Session auf. `run` löst das Ziel gegen `currentPackageId` und `nextPackageId` auf; ein reines Host-Paket wird in der Sandbox ausgewertet und committet sofort, während ein Browser-Hälften-Paket eine Genehmigungsanfrage aktiviert, `cordis/request-run` emittiert und suspendiert. Die antwortende Seite durchläuft `runHostHalf`, `getClientCode`, dann `resolveRequestRun`; ein Erfolg, der die Live-Revision nennt, committet die Aktivierung und setzt `currentPackageId`, und `cordis/request-run-resolved` lässt die ausstehende Affordance auf jeder anderen Seite fallen. `stop` zieht den Live-Dispatch zurück — Handler-Disposer, Fiber-Dispose und der `cordis/dynamic-retract`-Broadcast — und lässt die Definition lauffähig. Vier weitergeleitete Events (`cordis/request-run`, `cordis/request-run-resolved`, `cordis/dynamic-package`, `cordis/dynamic-retract`) sind auf dem client-sicheren `./types`-Subpath deklariert und von `@deepseek-ai/dsh-api-remotes` für die Zustellung allowlistet, wodurch ein Browser sie über `ctx.remote.$on` erreichen kann.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen vom Runner zu den Tools, die ihn aufrufen, der Browser-Hälfte, die ihn beantwortet, und der generierten Oberfläche.

- [Tool-Paket](../tool-cordis/README.de.md) — die modellseitigen Tools, die diesen Service aufrufen.
- [Client-Runner](../cordis-client-runner/README.de.md) — die Browser-Hälfte, die Run-Anfragen beantwortet und Browser-Hälften-Code lädt.
- [UI-Paket](../ui-cordis/README.de.md) — das Panel, mit dem Benutzer Runs genehmigen und bedienen.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-cordis-host-runner) — jedes akzeptierte Config-Feld.
- [Extensions-Subsystem](../../../docs/subsystems/extensions.de.md) — die generierte `ctx.cordisInspect`- und `ctx.dynamicCordisRunner`-API und `cordis/*`-Events.
- [Self-referential-Cordis-Toolset-Agent-Note](../../../.agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.de.md) — Sandbox-Semantik, Lifecycle und Kompositionsbegründung.

-----

<a id="model-experience"></a>
## Model Experience

### Run-Ergebnisse, Ablehnungen und Diagnosen, die an die besitzende Session weitergeleitet werden

#### Was das Modell sieht

Nichts direkt: Dieses Paket registriert kein Tool und injiziert keinen Prompt. Es steuert die besitzende Session, wenn ein Run settled — ein Erfolg nennt das aktuelle Paket und sagt, fortzufahren, eine Benutzer-Ablehnung sagt, dieselbe Aktivierung nicht erneut anzufragen, und ein technischer Fehlschlag nennt den Grund, die Versionszeiger und den Inspect-then-correct-and-update-Pfad. Es steuert auch Post-Settle-Render-Fehlschläge (Slot, ob der Eintrag entfernt wurde), Host-Guard-Ablehnungen und Host-Handler-Fehlschläge. Panel-Stopp- und Entfernen-Gesten injizieren eine User-Rollen-Nachricht, die benennt, was der Benutzer tat. Ablehnungen von `run` oder `stop` erreichen das Modell auch über das Ergebnis des aufrufenden Tools.

#### Token-Wirkung

Bedingt und datenabhängig: Nachrichten kommen nur an, wenn ein Event auftritt, und jede trägt eine begrenzte Beschreibung dessen, was passiert ist; es gibt keine festen Kosten pro Request.

#### KV-Cache-Wirkung

Keine eigene. Eine Host-Hälfte, die Tools registriert, ändert die Tool-Ansicht des nächsten Requests, was die Präfix-Wiederverwendung ab dem ersten geänderten Schema-Token ungültig macht; das Ausführen oder Stoppen eines Pakets ohne Tool-Registrierungen ist präfix-neutral.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Runner besondere Sorgfalt braucht. Sie sind aktuelle Paketbeschränkungen, kein Aufgabenrückstand.

- **Ein erfolgreicher Run bedeutet nicht, dass die UI gerendert wurde** — `run` kehrt zurück, sobald die antwortende Seite die Browser-Hälfte geladen hat; React rendert danach, sodass eine Komponente, die wirft, nicht im Run-Beleg erscheinen kann. Der Fehlschlag taucht über Steering und `cordis_inspect_self`-Diagnosen auf.
- **Ein Browser-Hälften-Paket suspendiert dort, wo keine Seite verbunden ist** — Headless- und ACP-Deployments halten den Run, bis der anfragende Turn abgebrochen wird; reine Host-Pakete sind unbetroffen.
- **Eine suspendierte Run-Anfrage hat keinen Timeout** — sie wartet auf einen Menschen, bis der anfragende Turn abgebrochen wird, sodass unbeaufsichtigte Automatisierung keine Pakete mit einer Browser-Hälfte verwenden kann.
- **`vmTimeoutMs` begrenzt nur synchrone Auswertung** — ein async-Host-Hälften-Rumpf entkommt ihr, was der kooperativen Vertrauenshaltung des Toolsets entspricht.
- **Eine Stale-Success-Ablehnung lässt die Anfrage suspendiert** — wenn die antwortende Seite eine Revision nennt, die die Registry überholt hat, wird die Auflösung abgelehnt (`accepted: false`) und die Anfrage bleibt beantwortbar, bis eine andere Seite antwortet oder der Aufrufer abbricht; die Browser-Hälfte liest die Bestätigung nicht.
- **Die Run-Ankündigung trägt keine Service-Deklarationen** — das deklarierte `inject` einer Browser-Hälfte wird vom Plugin gelesen, das sie in der Seite zurückgibt, sodass `cordis/request-run` nur Metadaten trägt, nie Code oder Service-Listen.
- **`zod` ist eine Runtime-Abhängigkeit der generierten Typert-Faces, nicht von `src`** — `./typert` und `./remote` lösen auf ungebündelte `lib`-Dateien mit einem nackten `import { z } from 'zod'` auf, sodass das Paket sie deklariert, obwohl nichts in `src` zod importiert.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>

**Laufzeitinvariante:** Es wird kein Begleiter veröffentlicht. Die Definitions-Registry ist Prozessspeicher ohne zu beobachtende Event-Sequenz, und ihre eine eigene Beziehung (eine laufende Definition besitzt einen settled Host-Hälften-Fiber und ihre Handler-Tabelle) wird innerhalb einzelner awaited Verben aufgebaut und abgewickelt, sodass Pakettests sie direkt assertieren.
