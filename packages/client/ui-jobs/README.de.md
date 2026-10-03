---
description: "Web-Background-Job-Oberfläche: die Session-Header-Action, die die für diese Session sichtbaren Jobs auflistet; für Nutzer und Maintainer der Background-Job-Erfahrung."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-jobs

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Dieses Paket rendert die Background-Job-Oberfläche der Web-GUI: eine Session-Header-Action, die ein Popover öffnet, das die für diese Session sichtbaren Jobs auflistet. Es liest den host-berechneten Registry-Zustand über den `jobsBySession`-Mirror der Runtime und stellt selbst keinen RPC. Der Trigger erscheint nur, wenn die Session mindestens einen Job hat, mit einem Badge, das laufende und stoppende Jobs zählt; abgerechnete Zeilen bleiben sichtbar und abgeschwächt, bis die Registry sie fallen lässt. Die Sicht des Modells auf dieselben Jobs gehört `dsh-tool-jobs`; dieses Paket ist eine schreibgeschützte Projektion für den Menschen.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Entwicklerhinweis](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Dieses Plugin zusammen mit der Runtime mounten; die Job-Action erscheint dann im Session-Header, sobald die Session mindestens einen Job hat. Ein Klick öffnet das Popover: zuerst die Live-Zeilen nach Startzeit, dann die abgerechneten Zeilen nach Endzeit, jeweils mit Produzenten-Kind, Label, Status und einer abgelaufenen Dauer, die im Live-Zustand einmal pro Sekunde tickt und bei Abschluss einfriert.

### Schließen und Grenzen

Escape schließt die Liste und gibt den Fokus an den Trigger zurück, ebenso ein Zeigerdruck außerhalb. Die Liste zeigt, was eine Session über die Wire-Sicht sehen kann, sodass ein Job einer anderen Session hier nie erscheint; ein Prozessneustart leert die Liste, während der Transcript die `run_in_background`-Cards behält, die diese Jobs gestartet haben.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Das Paket trägt einen Eintrag zu `conversation.session.header.actions` bei (`JobListAction`), und die Daten kommen vollständig über den `jobsBySession`-Listen-Mirror, den das Session-Controller-Binding aus `session/jobs`-Frames faltet — kein RPC und kein Zustand außer der Popover-Sichtbarkeit. Das Badge zählt `running` plus `stopping` und wird bei null weggelassen. Die Zeilenordnung stellt Live-Zeilen zuerst nach `startedAt` aufsteigend, dann abgerechnete nach `finishedAt` absteigend; ein Gleichstand auf dieselbe Millisekunde wird über die Startreihenfolge gebrochen, eine abgerechnete Zeile ohne `finishedAt` liest sich als null statt als negativer Wert, und eine Dauer über einer Stunde bleibt in Stunden. Abgerechnete Zeilen bleiben sichtbar, weil das `detail` eines fehlgeschlagenen Jobs die einzige Stelle ist, an der sein Fehlschlag lesbar ist. Das Verhalten ist durch die [Notiz zur Web-Background-Job-Anzeige](../../../.agents/notes/implemented/feature/2026-08-08-web-background-job-display.de.md) festgelegt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn die Job-Oberfläche nicht ausreicht. Sie führen von der Browser-Liste zur Registry und zum modellseitigen Tool.

- [dsh-tool-jobs](../../jobs/tool-jobs/README.de.md) — das modellseitige Jobs-Tool über derselben Registry.
- [Session Controller](../../api/session-controller/README.de.md) — faltet den `jobsBySession`-Mirror, den dieses Paket liest.
- [ui-subagent](../ui-subagent/README.de.md) — der Subagent-Katalog, in dem ein laufender einmaliger Background-Subagent ebenfalls erscheint.
- [Web-Client-Architektur](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.de.md) — wie Browser-Plugin-Zeilen laden und Slots registrieren.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da dieses Paket host-berechneten Registry-Zustand für einen Menschen rendert und weder Prompt, Message, Schema, Stream noch Tool-Ergebnis berührt.

#### KV-Cache-Effekt

Keiner; das Paket stellt niemals Provider-Requests zusammen oder sendet sie.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die aktuelle Job-Liste. Sie sind gegenwärtige Paket-Constraints, kein allgemeiner Job-Management-Vergleich und kein Aufgabenrückstand.

- **Zeilen sind schreibgeschützt** — die gestreamte Ausgabe eines Jobs und ein vom Menschen ausgelöster Abbruch sind getrennte Phasen. Ein Abbruch schuldet zusätzlich eine modellseitige Entscheidung, die der Seam nicht beantwortet: `kill()` markiert die Endzustellung als gemeldet, sodass ein gegen den aktuellen Vertrag geschriebener Interrupt das Modell glauben ließe, sein Job laufe noch.
- **Die Liste ist nicht die eigene Menge der Registry** — sie zeigt, was eine Session über die Wire-Sicht sehen kann, sodass ein Job einer anderen Session hier nie erscheint, und ein Prozessneustart leert die Liste, während der Transcript die `run_in_background`-Cards behält, die diese Jobs gestartet haben. Ein herrenloser Job (einer, der ohne lebenden `Agent` gestartet wurde) erreicht umgekehrt die Liste jeder Session — passend zu dem, was `list(caller)` jedem Aufrufer meldet.

<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Laufzeit-Invariante:** Es wird kein Companion veröffentlicht. Dieses Paket ist eine schreibgeschützte Projektion des `jobsBySession`-Mirrors auf einen Header-Slot-Eintrag. Es emittiert keine Cordis-Events, besitzt keinen pluginübergreifenden veränderlichen Zustand, und seine einzige Slot-Registrierung beweist die Freigabe durch die HMR-Sicherheits-Spec.
