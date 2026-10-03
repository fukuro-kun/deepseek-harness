---
description: "Plan-Modus für Anwender und Maintainer, die das pro-Agent-Planungsfeature auswählen, konfigurieren oder debuggen — mit Deployment-Guidance, einem /plan-Befehl und einem vom Nutzer geprüften Exit."
kind: "package-reference"
---

# @deepseek-ai/dsh-plan-mode
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Der Plan-Modus lässt einen Agent vor der Ausführung erkunden und entwerfen und legt den fertigen Plan anschließend deiner Genehmigung vor. Eintritt mit `/plan`, optional mit einer Nachricht oder geordneten Bild- und Dateianhängen; Austritt mit `/plan off`, Genehmigung der Review zum Fortfahren oder Feedback für weitere Planung. Deployment-definierte Guidance steuert das Planungsverhalten, aber jedes Tool bleibt verfügbar — für erzwungene Grenzen nutze Sandbox-Modus und Approval-Prompts. Der aktive Zustand überlebt Session-Resume und Forks. Wähle ihn, wenn du einen geprüften Plan willst, bevor der Agent handelt.

## Inhalt

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Solange der Plan-Modus aktiv ist, arbeitet der Agent nach deinen Anweisungen und legt seinen Plan zur Review vor, statt sofort auszuführen. Der übliche Weg: den Guidance-Text konfigurieren, mit `/plan` in den Plan-Modus eintreten und den fertigen Plan prüfen, wenn der Agent `exit_plan_mode` aufruft.

### Wann es die richtige Wahl ist

Wähle den Plan-Modus, wenn der Agent vor dem Ausführen erkunden und entwerfen soll und du den Plan zuerst genehmigen willst. Er schränkt den Agent nicht ein: Jedes Tool bleibt aufrufbar, also nutze Sandbox-Modus und Approval-Prompts, wenn du erzwungene Grenzen brauchst. Überspringe ihn, wenn der Agent sofort auf deine Anfragen reagieren soll, ohne Planungsphase.

### Minimale Konfiguration

Die einzige erforderliche Konfiguration ist der Guidance-Text, dem der Agent während der Planung folgt; alles Weitere schlägt beim Laden fehl.

```yaml
- name: '@deepseek-ai/dsh-plan-mode'
  config:
    section: |
      You are in plan mode. Explore and design before presenting the complete
      plan through exit_plan_mode.
```

| Feld | Default | Bedeutung |
|---|---|---|
| `section` | erforderlich | Guidance, die bei aktivem Plan-Modus als Prompt-Sektion `plan:policy` gerendert wird |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-plan-mode) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

<a id="model-and-human-interactions"></a>
### Eintritt in und Austritt aus dem Plan-Modus

Tippe `/plan`, um in den Plan-Modus einzutreten, oder `/plan <message>`, um mit einer Anweisung einzutreten — die Nachricht wird dein nächster Request unter der Plan-Guidance. Tippe `/plan off`, um den Plan-Modus direkt zu verlassen; das bricht auch einen Eintritt ab, der noch nicht wirksam geworden ist.

Du kannst einer `/plan`-Nachricht Bilder und beliebige Dateien anhängen; sie werden in Auswahlreihenfolge mit deiner Anweisung übergeben. `/plan off` mit Anhängen wird abgelehnt, bevor sich der Modus ändert, sodass Entwurf und Karten verfügbar bleiben. Der Befehl `/plan` ist überall verfügbar, wo Slash-Commands unterstützt werden, etwa im Web-Client.

### Der geprüfte Exit

Wenn der Agent einen fertigen Plan hat, ruft er `exit_plan_mode` auf, mit dem als Markdown verfassten Plan, der mit einer Überschrift beginnt. Du prüfst genau diesen Plan und wählst `Approve`, um den Plan-Modus zu verlassen, oder `Keep planning`, um den Agent mit Feedback zurückzuschicken.

Die Wahl von `Keep planning` (optional mit Freitext-Feedback) schickt den Agent zurück, den Plan zu überarbeiten; die Review stattdessen zu schließen, um eine Nachricht zu tippen, sagt dem Agent, auf deine nächste Nachricht zu warten. Steht keine interaktive Review zur Verfügung, kann `exit_plan_mode` nicht laufen, und du kannst den Plan-Modus trotzdem mit `/plan off` verlassen.

### Plan-Zustand beobachten

Oberflächen können anzeigen, ob der Plan-Modus aktiv ist und ob eine von dir angeforderte Modusänderung noch auf ihr Wirksamwerden wartet. Der Zustand ist in jedem Tab derselbe und überlebt Neustarts.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Paket und zeigt auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designphilosophie

Der Plan-Modus ist ein Produktpaket, kein Capability-Seam: Es gibt kein austauschbares Backend, also leben Zustand, Guidance, Command und Exit-Tool an einem Ort. Der durable Zustand ist ein einzelnes log-only Event mit Ganzwert-Ersetzung, niemals ein Live-Spiegel, sodass Resume, Fork und Compaction ihn durch Falten des Logs wiederherstellen. Guidance ist eine weiche Schicht — das Paket registriert eine Prompt-Sektion und ein Tool und steuert über Text, statt Capabilities zu filtern.

### Durable Zustand und Step-Boundary-Appends

Das Paket persistiert ein einzelnes log-only Event mit Ganzwert-Ersetzung, `plan/mode`, und der zuletzt geloggte Wert ist der Zustand. Eine Modusänderung appended sofort, wenn kein Turn offen ist; während eines offenen Turns bleibt sie pending bis zum nächsten akzeptierten In-Turn-Pre-Step — dem einzigen Append-Punkt, solange ein Agent läuft — und ein Append-Fehlschlag darf den Turn nicht blockieren. Die Servicemethoden `set`/`get` und ihre exakten Rückgabezustände leben in [`src/index.ts`](src/index.ts) und lesen die registrierte `plan`-Projection; der erste abhängige Zugriff schlägt explizit fehl, wenn Registry oder Key fehlen.

### Der `/plan`-Command

Das Command-Child aktiviert sich nur, wenn ein Commands-Service komponiert ist. Es mappt ein nacktes `/plan` auf aktiv, das exakte Argument `off` auf inaktiv ohne Modell-Input und jedes andere nicht-leere Argument auf aktiv plus den getrimmten Text, der über `agent.steer()` als gewöhnliche geloggte User-Message des nächsten Steps eingereicht wird. Zugelassene Bild- und Dateiblöcke behalten in dieser Message ihre Auswahlreihenfolge; `/plan off` mit Anhängen schlägt vor jeder Modusänderung fehl. Andere Einstiegspunkte als der Command dürfen `ctx.planMode` direkt steuern; die exakte Branch-Behandlung steht in [`src/index.ts`](src/index.ts).

### Das Exit-Tool

`exit_plan_mode` bleibt registriert, solange der Plan-Modus inaktiv ist, sodass Eintritt oder Austritt nur die Prompt-Sektion ändern, niemals den Request-Tool-Katalog. Eine genehmigte Review zeichnet einen stillen Pending-Exit auf, den der nächste akzeptierte In-Turn-Pre-Step appended — die Plan-Guidance bleibt für den Rest des aktuellen Tool-Batches erhalten. Ohne User-Questions-Kanal, oder nach einem Service-Reload während die Review pending ist, schlägt der Call geschlossen fehl, und `/plan off` bleibt der manuelle Ausweg.

### Session-Projection-Einheit

Wenn `ctx.sessionProjections` komponiert ist, registriert das Paket die `plan`-Einheit per optionaler Injection. Die Einheit wandelt geloggte `/plan`-Command-Läufe in ein Kandidaten-Ziel um, committet den geloggten Zustand auf `plan/mode` und leitet `{ active, pending }` für `view` ab, wobei `pending` nur dann true ist, solange eine unsettled oder erfolgreiche Selektion vom geloggten Zustand abweicht — eine reine Replay-Größe, die aus dem Log allein wiederherstellbar ist. Der Key mergt sich aus [`src/types.ts`](src/types.ts) in die `SessionProjectionMap`; das Framework treibt die Einheit, und das Entladen des Plugin-Fibers deregistriert den Key. Plan-Modus-Lesevorgänge benötigen diese Einheit und die `turnBoundary`-Einheit und schlagen explizit fehl, wenn die Registry oder einer der Keys fehlt.

### Quelltextkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Config`-Schema, der `ctx.planMode`-Service, `plan:policy`-Sektion, `/plan`-Command, `exit_plan_mode`-Tool |
| [`src/types.ts`](src/types.ts) | Die Deklaration des `plan`-Projection-Keys und der `PlanProjection`-Wire-Wert |
| [`src/client.ts`](src/client.ts) | Client-Namespace-Re-Export des Types-Outlets |
| [`src/invariant.ts`](src/invariant.ts) | Invariant-Companion: validiert die `plan/mode`-Payload-Form |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht reicht. Sie bewegen sich von der Subsystem-Semantik zu den generierten Katalogen und zur Designentscheidung.

- [Plan-Modus-Subsystem-Referenz](../../../docs/subsystems/plan.de.md) — wie sich der Plan-Modus verhält, seine Konfiguration und der Vertrag des Exit-Tools.
- [plan/-Paketkarte](../README.de.md) — die Gruppe und ihr einziges Paket.
- [exit_plan_mode-Toolkatalog-Eintrag](../../../docs/tool-catalog.de.md#deepseek-aidsh-plan-mode) — das exakte Schema, das das Modell erhält.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-plan-mode) — jedes akzeptierte Config-Feld und seine Bedeutung.
- [Plan-spezifischer Collaboration-State](../../../.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.de.md) — die Designentscheidung hinter dem Plan-Modus.

-----

<a id="model-experience"></a>
## Model Experience

### Plan-Policy-System-Prompt

#### Was das Modell sieht

Solange der Plan-Modus aktiv ist, sieht das Modell den exakten `section`-Text des Deployments an First-Party-Prompt-Position 500; im inaktiven Modus wird kein Text beigesteuert.

##### Konfigurationsbeispiel

```markdown
You are in plan mode. Explore and design before presenting the complete plan through exit_plan_mode.
```

#### Token-Effekt

Der inaktive Modus fügt keine Tokens hinzu; der aktive Modus fügt jedem Request die konfigurierte Sektion hinzu.

#### KV-Cache-Effekt

Die Sektion ist innerhalb des Plan-Modus stabil, aber Eintritt oder Austritt ändern den System-Prompt ab First-Party-Position 500.

### Menschlicher Command

#### Was das Modell sieht

`/plan`, `/plan off` und ihre terminalen Ergebnisse bleiben außerhalb der Modell-History. Ein nicht-leeres Suffix ungleich dem exakten Argument `off` wird nach Auswahl des Plan-Modus über `agent.steer()` zu einer User-Message: zugelassene Bild- und Dateiblöcke in Auswahlreihenfolge, dann der getrimmte Textblock. Ein nacktes `/plan` mit zugelassenen Anhängen steuert eine User-Message, die nur diese Blöcke enthält. Eine aktive `/plan off`-Selektion steuert die Standard-Notice für geloggte User-Switches nur bei, wenn der letzte Request-Header den Plan-Modus beschrieb; der Abbruch eines Pending-Eintritts steuert keine bei, weil kein Request ihn beobachtet hat.

#### Token-Effekt

Die optionale Nachricht kostet dieselben History-Tokens wie das separate Einreichen dieses Inhalts. Nacktes `/plan` ohne Anhänge und `/plan off` fügen keine hinzu; nacktes `/plan` mit Anhängen hat die üblichen Bild- und File-Handle-Kosten. Ein narrativer aktiver Exit fügt die kleine gehaltene Switch-Notice hinzu.

#### KV-Cache-Effekt

Der User-Block ist append-only Konversationswachstum. Eintritt oder Austritt in den Plan-Modus ändert die frühere Policy-Sektion; eine narrative Exit-Notice wird hinter das wiederverwendbare Request-Präfix gehängt.

### Exit-Tool-Schema und Review-Austausch

#### Was das Modell sieht

Das [`exit_plan_mode`-Schema](../../../docs/tool-catalog.de.md#deepseek-aidsh-plan-mode) bleibt in beiden Zuständen verfügbar; Ausführung außerhalb des Plan-Modus schlägt fehl, während eine genehmigte Review im Modus den kanonischen Wert `{ approved: true }` zurückgibt und den bestehenden Bestätigungstext rendert. Ablehnung bleibt ein fehlgeschlagener Call mit Review-Feedback, eine verworfene Review ein fehlgeschlagener Call, der die Übernahme durch den Nutzer nennt.

#### Token-Effekt

Das stabile Schema wird je nach ToolRuntime-Modus bezahlt, und jedes Plan-Argument und Review-Ergebnis bleibt in der Konversations-History.

#### KV-Cache-Effekt

Modusübergänge ändern den Tool-Katalog nicht; Plan-Argumente und Review-Ergebnisse erweitern die Konversation normal.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen beschreiben, wann sich der Plan-Modus nicht so verhält, wie du es erwarten könntest, oder besondere Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, keine Roadmap.

- **Guidance, kein Enforcement** — der Plan-Modus steuert nur über Text; Deployments, die erzwungene Einschränkungen brauchen, konfigurieren Sandbox-Modus und Approval-Policy separat.
- **Pending-Selektionen sind prozesslokal** — eine Selektion nach dem letzten akzeptierten Pre-Step des Turns geht verloren, wenn der Prozess vor einem weiteren akzeptierten In-Turn-Pre-Step endet; die UI muss sie erneut anwenden.
- **Keine Plan-Option zur Erstellungszeit** — geforkte Agents erben den geloggten Plan-Zustand, neu gespawnte Agents beginnen inaktiv.
- **Lebende Children können die Review nicht öffnen** — ein Child, das einem anderen lebenden Agent gehört, lässt den `exit_plan_mode`-Call fehlschlagen und wird angewiesen, die ungelöste Entscheidung in sein Endergebnis aufzunehmen; durable Fork-Abstammung allein verhindert nicht, dass eine als Runtime-Root resumte Session die Review öffnet.
- **Ein spezialisierter Review-Renderer** — nur die Web-UI hat eine `plan-review`-Darstellung; ein anderer Interaction-Provider präsentiert denselben Request über seinen generischen Optionsfluss.

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Diese Dev-Notiz ist Arbeitskontext für Maintainer: offene Designfragen und unentschiedene Richtungen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen leben in den Abschnitten oben, im Paket-Code und in der verlinkten Agent Note.

#### Zukunft: ein zweiter Collaboration-Modus

Die Design-Note hat eine generische Registry für benannte Modi abgelehnt, weil das Produkt nur `plan` ausliefert; ein künftiger Collaboration-State würde einen geteilten Seam erst aus zwei konkreten Fällen etablieren, und jede Extraktion muss den log-only Fold von `plan/mode`, den Boundary-Append und den geprüften Exit intakt lassen.

</details>
