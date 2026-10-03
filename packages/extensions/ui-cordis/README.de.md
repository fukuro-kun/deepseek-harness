---
description: "Cordis-Oberflächen für dynamische Plugins im Browser — für Benutzer und Maintainer, die das Panel, die Tool Cards und die @pluginId-Eingabe wählen, komponieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-cordis
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-client-ui-cordis` fügt einem Web-Client ein frame-weites Kontrollpanel, Tool Cards in der Konversation und `@pluginId`-Vervollständigung für dynamische Cordis-Pakete hinzu. Eine Person kann einen blockierten Model-Request aus jeder Session heraus genehmigen oder ablehnen, Definitionen ausführen, stoppen oder entfernen und ihren Live-Status einsehen. Konversationskarten spielen aufgezeichnete Calls und Results ab. Das Paket fügt keinen model-sichtbaren Inhalt und keine Session-Events hinzu, und Definitionen müssen nach einem Seiten-Reload erneut gestartet werden.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Komponiere dieses Paket in einem Web-Client, der auch den Browser-Runner und den Host-Runner mountet, und es fügt das Panel, die Tool Cards und die `@`-Vervollständigung hinzu. Eine Person hat dann alles für den Lifecycle: den Run-Request eines Models genehmigen oder ablehnen, jede Definition ausführen, stoppen oder entfernen und den Live-Zustand eines Pakets in denselben Zeilen wechseln sehen.

### Was das Panel zeigt

Ein `sidebar.footer.action`-Sitz zeigt einen Badge, der Laufendes plus Wartendes zählt; beim Öffnen listet er jede Definition mit ihren Run-Controls. Die Liste wird nie nach Session gefiltert: Die Zeilen der aktuellen Session gruppieren zuerst, die aller anderen bleiben darunter gelistet. Die Zeilen kommen aus dem aktuellen Inventar des Hosts und aktualisieren sich, wann immer eine Announcement ändert, was existiert. Ein ausstehender Run-Request, dessen Definition der letzte Read nicht abdeckt, bekommt trotzdem eine Zeile — gerendert aus Session, Label, Zweck und Identität des Requests selbst. Jede Zeile zeigt zwei unabhängige Fakten — was der Host laufen lässt und was diese Seite geladen hat —, sodass eine neu geladene Seite vor dem globalen Stopp „zurück auf diese Seite laden“ anbietet, während eine Host-only-Definition schlicht als laufend erscheint und nur den Stopp anbietet. Die Zeile trägt zudem den letzten Render-Fehler dieser Seite inline — an derselben Stelle wie ein Ladefehler: Das eine heißt „es wurde nie geladen“, das andere „es lud und warf dann“.

### Was die Tool Cards zeigen

Die `cordis_define`-Karte ist ein Record: Name und Zweck, die das Model schrieb, der von ihm geschriebene Source und ob die Definition läuft — kein Schalter, keine Genehmigung, nur ein Verweis auf das Panel. Die `cordis_run`-Karte zeigt Modus, Plugin-, Paket- und Run-IDs und das Ergebnis und bietet über den Slot `tool.view.cordis` die eigene Fachansicht des Pakets, wenn das Paket eine registriert hat. `cordis_stop` und `cordis_undefine` rendern kompakte Aktionszeilen. Alle Karten rendern aus dem aufgezeichneten Call und Result, sodass ein Replay dieselbe Karte zeigt.

### Die @pluginId-Eingabequelle

`@` im Eingabefeld bietet die in der aktuellen Session definierten Plugins; die Wahl eines Eintrags emittiert `@pluginId`, das das Tool-Paket in einen angepinnten Referenzkontext für das Model verwandelt.

### Grenzen, mit denen geplant werden muss

Definitionen sind prozess-lokal: Eine neu geladene Seite hält nichts, bis jemand ein Paket erneut ausführt, und das Panel liest das Inventar bei jeder Announcement neu. Genehmigungen sind by design frame-weit, sodass eine Person in einem Tab einen Run genehmigen kann, den das Model angefragt hat, während ein anderer Tab die definierende Session zeigt; die erste Antwort gewinnt, der Rest konvergiert.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design hinter den Oberflächen; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designphilosophie

Die Oberflächen stehen auf einer Regel: Keine hält Run-State im Component-State, weil das Settlen eines Define-Calls seine Karte im Chat-Fluss verschiebt und remountet. Fakten leben in Observables, die dem gehören, der sie schließen kann — der Browser-Runner besitzt offene Requests, Orchestrierungsergebnisse, das Live-Set dieser Seite und ihre Render-Fehler, während dieses Paket das Inventar besitzt, das es gelesen hat, und die Announcements, die es gefaltet hat. Das Panel ist global, weil ein Run-Request das Model blockiert und eine Definition benennen kann, die zu einer Session gehört, die niemand ansieht; eine Genehmigung, die nur im Transcript dieser Session erreichbar wäre, wäre genau dann unerreichbar, wenn sie das Model blockiert.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Plugin-Einstieg: Slot-Registrierungen, Inventory-Verdrahtung, `@pluginId`-Quelle |
| [`src/client/CordisPanel.tsx`](src/client/CordisPanel.tsx) | Das frame-weite Panel und seine Run-Controls |
| [`src/client/CordisDefineRow.tsx`](src/client/CordisDefineRow.tsx) | Die schreibgeschützte `cordis_define`-Karte |
| [`src/client/CordisRunRow.tsx`](src/client/CordisRunRow.tsx) | Die `cordis_run`-Karte und ihr Fachansichts-Sitz |
| [`src/client/CordisActionRow.tsx`](src/client/CordisActionRow.tsx) | Die `cordis_stop`-/`cordis_undefine`-Zeilen |
| [`src/client/card-model.ts`](src/client/card-model.ts) | Replay-stabile View-Models aus eingefrorenen Call/Result-Slices |
| [`src/client/inventory.ts`](src/client/inventory.ts) | Der Single-Flight-Inventory-Read und sein Reconnect-Handling |
| [`src/client/status.ts`](src/client/status.ts) | Die sichtbaren Statusablesungen über Inventar und Live-Set der Seite |
| [`src/client/slots.ts`](src/client/slots.ts) | Injizierte Faces und die paketeigene `tool.view.cordis`-Slot-Deklaration |
| [`src/client/run-card-index.ts`](src/client/run-card-index.ts) | Per-Session-Index der jüngsten geeigneten `cordis_run`-Karte |

### Wie das Panel aktuell bleibt

Announcements (`cordis/dynamic-package`, `cordis/dynamic-retract`, `cordis/request-run`, `cordis/request-run-resolved`) lösen einen Inventory-Neu-Read aus statt einem Patch-in-place-Update, weil sie keine Labels tragen und eine Definition zwischen ihnen auftauchen oder verschwinden kann. Reads sind Single-Flight, sodass mehrere gleichzeitig settlende Announcements den Call nicht vervielfachen können; ein Connection-Reset verwirft den laufenden Read und gibt den Platz für einen neuen frei, sodass ein Reconnect nie die Zeilen des alten Hosts veröffentlicht.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Contract nicht ausreicht. Sie führen von den Oberflächen zu dem Face, den sie bedienen, und den Tools, deren Calls sie rendern.

- [Client-Runner](../cordis-client-runner/README.de.md) — das Browser-Face, das das Panel liest und aufruft.
- [Host-Runner](../cordis-host-runner/README.de.md) — Inventar und Lifecycle-Verben hinter dem Panel.
- [Tool-Paket](../tool-cordis/README.de.md) — die model-zugewandten Tools, deren Calls diese Karten rendern.
- [Extensions-Subsystem](../../../docs/subsystems/extensions.de.md) — die generierte `ctx.dynamicCordisRunner`-API und weitergeleitete `cordis/*`-Events.
- [Slots-Subsystem](../../../docs/subsystems/slots.de.md) — wie slot-registrierte Browser-UI ihrem Paket gehört.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über die Run- und Stop-Verben, die diese Oberflächen antreiben — die Orchestrierung eines Runs durch den browserseitigen Runner und die Stop- und Remove-Verben des Hosts, dieselben Host-Verben, die die `cordis_run`- und `cordis_stop`-Tools des Models erreichen —, sodass alles, was eine laufende Definition dann beiträgt, der Effekt des Runners ist, während nichts Model-Sichtbares aus diesem Paket stammt: Es rendert geloggte Call- und Result-Slices und einen Host-Inventory-Read, fügt keinen Prompt-Inhalt hinzu, schreibt kein Session-Event und hinterlässt bewusst keine Session-Log-Spur davon, dass eine Person etwas genehmigt, abgelehnt, gestartet oder gestoppt hat.

#### KV-Cache-Effekt

Keiner: Es entsteht hier kein Prompt-Input, und die Beantwortung eines Run-Requests verlängert oder überschreibt das History-Ende nicht.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo die Oberflächen besondere Sorgfalt brauchen. Sie sind aktuelle Paket-Constraints, kein Aufgabenstapel.

- **Ein offenes Panel sieht keine Registry-Änderungen, die nichts announcen** — `cordis_define` und ein Undefine einer Definition, die nicht lief, ändern die Registry ohne Dispatch-Announcement; ein Panel, das über eine solche Änderung hinweg offen bleibt, behält seine Zeilen, bis es geschlossen und wieder geöffnet wird. Ein Run-Request ist die Ausnahme: Er blockiert das Model, rendert also seine eigene Zeile und löst einen Read aus.
- **Eine reine Request-Zeile ist beantwortbar, aber nicht bedienbar** — sie bietet nur Genehmigen und Ablehnen, weil die Run- und Stop-Controls die Registry-Zeile brauchen, die der Read noch nicht geliefert hat.
- **Eine Zeile kann für die Dauer eines Reads verschwinden** — der orchestrierende Arm der Aktivität trägt die Session, aber bewusst kein Label; ein genehmigter Request, dessen Registry-Read noch nicht gelandet ist, hinterlässt bis dahin keine Zeile. In der Praxis wird der Read beim Eintreffen des Requests ausgelöst.
- **Ein Render-Fehler ist die eigene Messung dieser Seite und kommt zu spät für den Run-Beleg** — das Panel zeigt den letzten Crash, den der Runner hier gesehen hat; ein Paket, das in diesem Tab sauber rendert, zeigt also nichts, selbst wenn es in einem anderen abstürzt, und das Model erfährt davon durch Nachfragen (`cordis_inspect_self`) statt aus dem Call, den es bereits gemacht hat.
- **Ein Ladefehler einer zweiten Seite ist für die anderen unsichtbar** — der Host settlet einen Dispatch beim ersten Load-Report, sodass eine Seite, deren Browser-Hälfte nach der Bestätigung einer anderen Seite fehlschlug, auf den anderen Seiten weiterhin als laufend erscheint.
- **Jede Seite darf jeden Request beantworten** — Genehmigungen sind by design frame-weit, sodass eine Person in einem Tab einen Run genehmigen kann, den das Model angefragt hat, während ein anderer Tab vor der definierenden Session steht; ein Eingrenzen, wer antworten darf, ist zurückgestellt.
- **Eine Karte, deren Call-Head das Event-Fenster verlassen hat, verliert ihre Labels** — die Define-Karte leitet Name und Zweck aus den Call-Argumenten ab; eine Session, die lang genug ist, um sie zu trunkieren, lässt die Karte sich mit ihrer Call-ID benennen. Das Panel ist unbetroffen, weil das Host-Inventar die Labels trägt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Eine einzelne gekeyte Toolview-Registrierung, deren Disposal durch die HMR-Sicherheits-Spec bewiesen ist. Die einzige mutable Relation, die dieses Paket besitzt — das Per-Definition-Run-State-Observable —, lebt im Browser-Prozess, außerhalb der Reichweite des Host-Invariant-Service, und die Node-Hälfte emittiert keine cordis-Events und hält keinen plugin-übergreifenden State.
