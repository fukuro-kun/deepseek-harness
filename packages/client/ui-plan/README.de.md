---
description: "Plan-Modus-Status-Chip für die Web-GUI: die Composer-Steuerung, die anzeigt, dass der Plan-Modus aktiv ist, und ihn abschaltet; für Benutzer und Maintainer des Plan-Modus."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-plan

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Dieses Paket rendert den Plan-Modus-Status-Chip in der Web-GUI: Ist das effektive Ziel der host-berechneten Projection der Plan-Modus, zeigt der Composer einen warn-gefarbenen „Plan ×"-Button, der den Plan-Modus abschaltet; andernfalls bleibt der Seat leer. Der Plan-Modus selbst — der `/plan`-Befehl, der festgehaltene `plan/mode`-Zustand, die Projection-Einheit und der Policy-Abschnitt — gehört zu `dsh-plan-mode`; dieses Paket rendert nur die Projection und sendet, was ein Benutzer gleich gut selbst tippen könnte. Das Modell verlässt den Plan-Modus über das stabile `exit_plan_mode`-Tool; seine Plan-Review läuft über den komponierten Web-Frage-Kanal.

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

Mounten Sie dieses Plugin zusammen mit `ui-conversation` und `dsh-plan-mode`; der Chip belegt dann den Plan-Seat des Composers rechts neben der Zugriffsmodus-Steuerung, immer wenn der Plan-Modus aktiv ist. Betreten Sie den Plan-Modus über den `/plan`-Befehls-Pfad — wählen Sie Plan aus dem `+`-Command-Menü des Composers oder tippen Sie `/plan` — und schalten Sie ihn über den Chip ab.

### Was das Chip zeigt

Während das effektive Ziel der Plan-Modus ist, rendert der Seat den warn-gefarbenen „Plan ×"-Status-Button, der `/plan off` ausführt. Andernfalls bleibt der Seat leer: Ein Host ohne Plan-Modus oder ein Draft ohne Session zeigt nichts. Während der Plan-Modus das effektive Ziel ist, wechselt der Placeholder des Composer-Textfelds zum Plan-Aufgaben-Hinweis — „describe your task to generate plan" — es sei denn, die besitzende Oberfläche stellt ihren eigenen Placeholder bereit.

### Fehler

Zulassungs-Fehler (`matched: false`, Business-Fehler, Transport-Fehler) erscheinen als Inline-Fehler, und der Chip bleibt, bis die Projection den Austritt bestätigt.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Der Chip belegt den von conversation deklarierten `conversation.input.plan`-Einzelsitz; die Node-Hälfte ist ein leeres apply (die Roster-Zeile). Reads laufen über das generische Projection-Paar durch den `useProjection` des Standard-Kits: Das effektive Ziel ist `pending ? !active : active` — ein gefalteter Host-Wert, kein Client-Optimismus, sodass ein eintreffender Frame den Chip in beide Richtungen korrigiert. Die injizierte Face des Seats trägt ein Verb, `exitPlanMode`, das `/plan off` über `ctx.remote.commands.execute` ausführt und Zulassungs-Fehler auf eine Inline-Fehler-Zeile abbildet. Der Placeholder- und Hinweistext leben im `conversation`-Locale-Namensraum von ui-conversation und werden wortgleich mit dem beanspruchten `/plan`-Befehlshinweis geteilt. Die barrierefreie Beschreibung lautet „Plan mode on, press to turn off".

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn die Plan-Fläche nicht ausreicht. Sie führen vom Chip in den Plan-Modus-Bereich und die Composer-Shell.

- [dsh-plan-mode](../../plan/plan-mode/README.de.md) — besitzt den Plan-Modus, den `/plan`-Befehl, die Projection und den Policy-Abschnitt.
- [ui-conversation](../ui-conversation/README.de.md) — deklariert den `conversation.input.plan`-Seat des Composers und die Placeholder-Locale-Keys.
- [Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-plan-mode) — das `exit_plan_mode`-Tool-Schema, mit dem das Modell den Plan-Modus verlässt.
- [Client-Paket-Karte](../README.de.md) — benachbarte Browser-UI-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über die `/plan off`-Befehlszeile, die der Chip dispatcht: `dsh-plan-mode` besitzt den modell-sichtbaren Policy-Abschnitt, das Exit-Tool-Schema und den protokollierten Zustand, den diese Zeile antreibt.

#### KV-Cache-Effekt

Das Betreten oder Verlassen des Plan-Modus ändert den aktiven `plan:policy`-System-Prompt-Abschnitt und damit das Request-Präfix; der Chip selbst fügt keinen Prompt-Inhalt hinzu.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren den aktuellen Plan-Chip. Sie sind aktuelle Paket-Einschränkungen, kein Plan-Modus-Vergleich und kein Aufgaben-Rückstau.

- **Der Plan-Modus ist Führung, keine Ausführungs-Sandbox** — Deployment, die erzwungenes Read-Only-Planen verlangen, müssen die unabhängigen Sandbox- und Approval-Policies komponieren.
- **Der Chip gehört zum Standard-Composer** — eine ausstehende ganze-Composer-Interaktion wie die Plan-Review ersetzt vorübergehend die InputBar und ihren Chip.
- **Keine inaktive Plan-Steuerung** — der Einstieg nutzt die geteilte Command-Quelle; eine Session mit der Capability, aber inaktivem Modus zeigt keine Plan-Affordanz in der Tool-Zeile.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>

**Runtime-Invariante:** Es wird kein Begleiter publiziert. Der Plan-Zustand und die Boundary-Eigentümerschaft werden von dsh-plan-mode auditiert, während die Kontrolle ein Slot-Effect ist, dessen Deklaration, Registrierung und Teardown von diesem Paket abgedeckt werden.
