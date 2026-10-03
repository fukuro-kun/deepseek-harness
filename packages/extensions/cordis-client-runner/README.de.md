---
description: "Browser-Hälfte dynamischer Cordis-Pakete für Nutzer und Maintainer, die wählen, komponieren oder debuggen, wie eine Seite Run-Requests beantwortet und Browser-Hälften-Code lädt."
kind: "package-reference"
---

# @deepseek-ai/dsh-cordis-client-runner
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-cordis-client-runner` lässt eine Seite die Browser-Hälfte eines dynamischen Cordis-Pakets ausführen: Sie beantwortet die Run-Requests des Hosts, lädt den Browser-Hälften-Quelltext als Live-Plugin in die Seite und entfernt ihn, wenn der Host den Run retracted. Eine Person genehmigt oder lehnt einen Run ab — oder startet einen direkt — und das Ergebnis, das dieses Paket zurückmeldet, wird zum `cordis_run`-Tool-Result, das das Modell liest. Bei Aktivierung lädt nichts, und nach einem Refresh wird nichts wiederhergestellt; eine Seite führt ein dynamisches Paket nur aus, wenn jemand einen Run-Request beantwortet oder ihn hier anfordert.

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

Mounte dieses Plugin in einem Web-Client, dessen Komposition auch den Host-Runner mountet — die Host-Hälfte läuft im Prozess, diese Browser-Hälfte in der Seite. Wenn ein dynamisches Paket mit Browser-Hälfte ausgeführt wird, erhalten die offenen Seiten einen Run-Request; dieses Paket führt das Laden auf dieser Seite aus, und das UI-Paket (`ui-cordis`) rendert das Panel und die Karten, mit denen eine Person antwortet. Host-only-Pakete brauchen keine Browser-Hälfte und damit keine Seite: Der Host führt sie selbst aus.

### Was die Seite tut

Eine Browser-Hälfte ist in plain JavaScript geschrieben — kein JSX, kein TypeScript, keine Modul-Imports — und läuft als Async-Funktion. Sie erhält eine feste Menge von Namen — `React`, `console`, `styles` und `host` —, während Browser-Globals wie `fetch` und `setTimeout` nicht verfügbar sind. Das Plugin, das sie zurückgibt, kann die Lifecycle-Verben und nur die Services nutzen, die es in seinem eigenen `inject` deklariert hat. Ein `host.call(method, args)` aus der geladenen Hälfte erreicht ihre eigene Host-Hälfte. Ein Crash, der während des React-Renderns der geladenen Hälfte passiert, wird dem Host mit dem Slot gemeldet, ob der Crash den Eintrag entfernt hat, und einer für den Autor geschriebenen Message.

### Was die Run-Surface bietet

Eine Run-Surface kann einen ausstehenden Host-Request beantworten — ihn genehmigen, optional zukünftige Versionen desselben Plugins abdecken, oder ihn ablehnen — und kann eine Definition auf eigene Geste des Nutzers starten, was sie autorisiert. Jede Definition hat höchstens eine In-Flight-Aktivität, sodass eine darauf gebaute Affordance ein Remount überlebt. Was die Surface über diese Seite zeigt, ist seitenlokal: der letzte Render-Crash pro Paket, warum der eigene Versuch dieser Seite fehlschlug, und ob ein Paket hier geladen ist — nie die Sicht des Hosts darauf, was läuft.

### Lifecycle-Grenzen

Laden ist idempotent: Eine Revision laden zu wollen, die diese Seite bereits ausführt, ändert nichts; eine neuere Revision ersetzt die geladene, und dieselbe Revision nach einem Retract lädt frisch. Operationen auf einer Definition serialisieren. Ein Refresh startet by design sauber — der Host hält die Definition weiterhin, diese Seite führt sie erst wieder aus, wenn sie erneut angefragt wird.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt das Design hinter der Browser-Hälfte; das beobachtbare Verhalten deckt [Dieses Paket verwenden](#use-this-package) vollständig ab.

### Designphilosophie

Die Browser-Hälfte baut auf einem Prinzip auf: Ein dynamisches Paket muss auf derselben Aktivierungs-Gating-, Fiber-Effect-Cleanup- und Status-Projektion reiten wie ein statisches. Das evaluierte Plugin wird in die Modul-Tabelle gesetzt und über `loader.create` gemountet; Unload ist Entry-Removal plus Factory-Invalidierung plus Style-Removal. Der Guard ist eine Whitelist — Lifecycle-Verben plus deklarierte Services —, die die hostseitige Sandbox-Fassade spiegelt, sodass ein Paket-Autor auf beiden Hälften einen Vertrag vorfindet. Ein Observer speist zwei Outlets: Die Entry-Error-Seam der Slot-Registry wird nur hier beobachtet, und ein Crash, der zu einem Paket gehört, das dieser Runner gesetzt hat, geht upstream zum Host für das Modell und auf das eigene `renderFailures` dieses Pakets für das Panel.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Plugin-Einstieg: Runner, Orchestrator, Inspect-Registry, Forwarded-Event-Subscription |
| [`src/client/runtime.ts`](src/client/runtime.ts) | Load-Engine: Konvergenz nach Run-Identity, Guard-Mount, Retract |
| [`src/client/orchestrator.ts`](src/client/orchestrator.ts) | Run-Orchestrierung: Host-Hälfte zuerst, Source-Fetch, Browser-Hälfte, eine Resolution |
| [`src/client/evaluator.ts`](src/client/evaluator.ts) | Closure-Evaluation: die Symbol-Surface und ihre Teaching-Traps |
| [`src/client/guard.ts`](src/client/guard.ts) | Die whitelistende `ctx`-Fassade für geladene Browser-Hälften |
| [`src/client/inspect-registry.ts`](src/client/inspect-registry.ts) | Client-Inspect-Provider und der Pending-Query-Router |
| [`src/client/providers.ts`](src/client/providers.ts) | First-Party-Client-Inspect-Provider (Slots, Theme, Events) |
| [`src/client/timer.ts`](src/client/timer.ts) | Der Client-Timer-Service, den dynamische Pakete injizieren |

### Wie ein Run ausgeführt wird

Ein `cordis/request-run`-Event fragt diese Seite, ob sie eine Definition ausführen soll. Wer antwortet — die Seite nach einer Genehmigung oder der Nutzer, der Run drückt — treibt die Orchestrierung: zuerst die Host-Hälfte (sodass ein Host-Hälften-Fehler short-circuitet, bevor sich der Browser bewegt hat), dann der Source-Fetch, dann die Browser-Hälfte, dann eine Resolution, die das Geschehene trägt. Der Quelltext der Browser-Hälfte wird als Async-Function-Body mit der Symbol-Surface als Parameter evaluiert, das zurückgegebene Plugin wird guard-wrapped und über den Loader gemountet, und die Resolution meldet die geladene Revision oder die fehlschlagende Stage mit der Message des Closures, Guards oder Fibers. `host.call` routet über den Remote-Namespace; ein weggelassenes Argument reist als `null`, und ein Payload, den der generierte Codec ablehnt, wird zu einem Teaching-Error, der den Call und den Vertrag benennt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Level-Vertrag nicht reicht. Sie bewegen sich von der Browser-Hälfte zum Host, der sie fragt, zu den Tools, deren Runs sie beantwortet, und zur Surface, die sie rendert.

- [Host-Runner](../cordis-host-runner/README.de.md) — die Registry und der Run-Round-Trip, den dieses Paket beantwortet.
- [Tool-Paket](../tool-cordis/README.de.md) — die modellseitigen Tools, deren Run-Requests diese Seite erreichen.
- [UI-Paket](../ui-cordis/README.de.md) — das Panel und die Karten, die diese Fläche bedienen.
- [Extensions-Subsystem](../../../docs/subsystems/extensions.de.md) — die generierte `ctx.dynamicCordisRunner`-API und `cordis/*`-Events.
- [Client-Shells-und-dynamische-Pakete-Agent-Note](../../../.agents/notes/implemented/architecture/2026-08-15-client-shells-and-dynamic-packages.de.md) — Paket-Platzierung und Build-Faces für die Client-Hälften.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

### Run-Resolution, wenn ein Modell den Run angefragt hat

#### Was das Modell sieht

Dieses Paket steuert selbst kein Tool, keinen Prompt und keinen Kontext bei; das Erste, was es verfasst und das ein Modell erreicht, ist die Resolution, die es für einen `cordis/request-run`-Round-Trip zurücksendet und die der Host zum blockierten `cordis_run`-Result macht. Ein Erfolg trägt die geladene Revision und, für eine Browser-Hälfte, die auf Services geparkt ist, die diese Seite nicht hat, deren Namen. Ein Fehler trägt einen Grund — `rejected`, wenn der Nutzer ablehnte, `host-half-failed` oder `client-half-failed` — und für die Browser-Hälfte den eigenen Text dieses Pakets: die fehlschlagende Stage (`evaluate`, `module-import` oder `activate`), gefolgt von der Message des Closures, Guards oder Fibers. Die Teaching-Errors des Guards (ein undeklarierter Service, ein verschattetes Browser-Global, ein Plugin, das kein `apply` zurückgab) erreichen das Modell über genau dieses Feld. Ein Crash, der später passiert, während React die geladene Hälfte rendert, reist über den separaten Post-Settle-Pfad unten.

#### Token-Effekt

Konditional und begrenzt: höchstens eine Resolution pro Run-Request, verbraucht im `cordis_run`-Tool-Result, das der Host ohnehin emittiert. Der Text ist datenabhängig (die eigene Fehlermeldung einer Definition), und dieses Paket behält nichts request-übergreifend — spätere Load-Fehler einer Seite sind seitenlokale Diagnostik ohne modellsichtbaren Carrier.

#### KV-Cache-Effekt

Append-only. Eine Resolution erreicht das Modell nur als Tool-Result für den bereits in-flight Request und verlängert den Historien-Tail; nichts, was dieses Paket verfasst, schreibt frühere Request-Tokens um oder ordnet sie neu, sodass ein sonst wiederverwendbares Präfix wiederverwendbar bleibt. Wiederholte Runs derselben Definition produzieren jeweils ihr eigenes Result, statt ein früheres zu ersetzen.

### Render-Fehler, nachdem der Run settled ist

#### Was das Modell sieht

Eine sauber geladene Browser-Hälfte kann trotzdem crashen, wenn React sie rendert, und dieser Crash landet, nachdem der Run bereits beantwortet wurde — das Modell würde sonst „ok“ gesagt bekommen und es nie erfahren. Jeder Entry-Boundary-Crash eines Pakets, das diese Seite gesetzt hat, wird dem Host gesendet (`reportRenderFailure`) und benennt den Slot, ob der Crash den Eintrag aus seiner Zelle retired hat (`abdicated`: die UI des Pakets ist weg, nicht nur kaputt), und eine für den Autor geschriebene Message. Der Host behält den letzten pro Paket, steuert die besitzende Session damit und exponiert ihn über `cordis_inspect_self`; nichts hiervon erreicht eine Run-Resolution.

#### Token-Effekt

Konditional und durch die Retention des Hosts begrenzt, nicht durch diese Seite: ein Report pro Crash, und der Host behält nur den neuesten pro Paket, sodass ein wiederholt crashender Eintrag das Modell eine Message kostet statt einer wachsenden Liste. Der Report geht nie in ein eigenes Tool-Result — das Modell zahlt ihn nur, wenn es gesteuert wird oder fragt.

#### KV-Cache-Effekt

Keiner eigenen. Reports reisen über RPC und werden gespeichert, nicht an die Konversation angehängt; das Modell liest sie über eine Steering-Message oder eine Inspection, die es selbst wählte, was den Tail wie jedes andere Tool-Result verlängert.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo die Browser-Hälfte besondere Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Eine abgelehnte Resolution wird nicht retried** — die Acknowledgement von `resolveRequestRun` wird nicht gelesen, sodass die Seite, wenn der Host einen stale Erfolg ablehnt (`accepted: false`, weil die Revision der Definition weiterging, während diese Seite lud), das Geladene behält und nicht erneut orchestriert. Der Request bleibt beantwortbar — die Antwort einer anderen Seite oder die Cancellation des Callers settlet ihn — und der Stop, der die Revision anhob, retracted den stale Load.
- **Das Plugin bleibt geparkt, bis der Host-Namespace existiert** — es deklariert `remote.dynamicCordisRunner` und lädt daher keine Browser-Hälfte, deren Host-Hälfte es nie erreichen könnte.
- **Slot-Admission hat keinen Carrier** — die dispatchen Rows deklarieren Services, nicht Ziel-Slots, sodass Per-Deployment-Allow- oder -Deny-Listen für Slot-Admission nirgends reiten können.
- **Guard-Whitelists sind handgespiegelte Zwillinge** — der Browser-Guard repliziert die hostseitige Sandbox-Fassade; eine geteilte Spezifikation ist zurückgestellt.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Keine.

</details>

**Runtime-Invariante:** Es wird kein Begleiter publiziert. Die besessene Relation (der Loader-Eintrag eines Live-Plugins existiert exakt, solange eine Plugin-Run-ID live ist) ist Browser-only-Zustand, erreichbar über den Service der Client-Hälfte, den der Node-Plane-Begleiter nicht beobachten kann. Die Relation wird stattdessen durch die eigene Load-/Teardown-Coverage des Pakets abgesichert.
