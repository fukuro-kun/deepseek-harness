---
description: "Neun Tools, mit denen das Modell teammates erstellt, benachrichtigt und koordiniert, für Compositionen, die die experimentellen Team-Plugins mounten."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-tool-agent-team

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Dieses Paket lässt das Modell benannte teammates erstellen, ihnen Nachrichten senden, ihre Verfügbarkeit prüfen, auf Fortschritt warten, festgefahrene Arbeit unterbrechen und über ein gemeinsames Aufgabenboard koordinieren. Jedes Teammitglied erhält dieselben neun Tools und eine Anleitung zur Koordination in einem geteilten Workspace. Wählen Sie es, wenn das Modell ein Team erst dann betreiben soll, nachdem Sie ausdrücklich eines angefordert haben. Es ersetzt die gleichnamigen Legacy-subagent-Steuerungen, sodass Compositionen, die beides benötigen, die Legacy-Definitionen deaktivieren müssen. Das Paket wird unter seinem experimentellen Namen veröffentlicht und bietet keine Stabilitätsgarantie.

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

Mounten Sie dieses Paket zusätzlich zu `@deepseek-ai/dsh-experimental-agent-team`, wenn das Modell ein Team über Tools betreiben soll. Nach dem Mounten erhält jedes Teammitglied — der Lead und jeder teammate — dieselben neun Tools plus einen Richtlinienabsatz, der seine eigene Rolle und seinen Namen nennt.

### Wann es wählen

Wählen Sie es, wenn das Modell teammates selbst erstellen und koordinieren soll statt dass ein Mensch die subagent-Steuerungen bedient. Vermeiden Sie es, wenn die gleichnamigen Legacy-globalen subagent-Tools verfügbar bleiben müssen: Die Team-Tools ersetzen sie für Teammitglieder, sodass eine Composition, die beides will, die Legacy-Definitionen deaktivieren muss. Die feste Richtlinie erstellt teammates nur, wenn Sie ausdrücklich ein Team oder teammates anfordern, sodass gewöhnliche Aufgaben niemals von selbst eine Delegation auslösen.

### Kleinstes funktionierendes Beispiel

Die kleinste Ergänzung einer bestehenden Composition ist das Zwei-Pakete-Fragment aus dem [agent-team README](../agent-team/README.de.md#smallest-working-setup): dauerhafter Session-Speicher, das Team-Domain-Paket und dieses Paket. Das Plugin selbst nimmt zwei optionale Einstellungen entgegen:

```yaml
- id: tool-agent-team
  name: '@deepseek-ai/dsh-experimental-tool-agent-team'
  config:
    freshProvider: spawn
    forkProvider: fork
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `freshProvider` | `spawn` | Provider, der fresh teammates startet |
| `forkProvider` | `fork` | Provider, der fork teammates startet |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-experimental-tool-agent-team) ist die erschöpfende Quelle für jedes akzeptierte Feld und dessen JSDoc.

Testen Sie es, indem Sie das Lead-Modell bitten: „Erstelle einen teammate namens reviewer, der den diff prüft, und schicke reviewer dann die Änderungszusammenfassung“. Das Modell ruft das Erstellungstool und dann das Nachrichtentool auf.

### Was das Modell kann

Die neun Tools gliedern sich in vier Fähigkeiten:

- **Einen teammate erstellen** — `spawn_teammate` nimmt einen Namen, eine Beschreibung und die initiale Aufgabe entgegen; nur der Lead kann es aufrufen.
- **Nachrichten senden** — `send_message` steuert ein laufendes Mitglied an seiner nächsten Schritt-Grenze, startet ein idle Mitglied und nimmt einen inaktiven teammate kalt wieder auf.
- **Sehen und warten** — `list_agents` zeigt das roster mit Live-Status; `wait_agent` wartet auf die nächste Team-Änderung; `interrupt_agent` stoppt den aktuellen Turn eines teammates (nur Lead).
- **Das Aufgabenboard verwalten** — `team_task_create`, `team_task_list`, `team_task_get` und `team_task_update` fügen geteilte Aufgaben hinzu, durchblättern, lesen und aktualisieren sie.

Jedes Mitglied kann jedem anderen Mitglied Nachrichten senden und das Aufgabenboard nutzen; nur der Lead erstellt und unterbricht teammates. Aufgabenaktualisierungen behalten die owner- und revision-Prüfungen der Domain bei, sodass eine veraltete Bearbeitung abgelehnt wird, statt neuere Arbeit zu überschreiben.

### Wie Erfolg und Misserfolg aussehen

Das Senden einer Nachricht ist erfolgreich, sobald sie sicher gespeichert ist: Das Ergebnis ist `accepted` (jetzt zugestellt) oder `queued` (wartend), und eine eingereihte Nachricht darf nicht erneut gesendet werden. `wait_agent` gibt sofort `noProgress` zurück, wenn kein anderes Mitglied läuft oder provisioniert wird, und weist den Aufrufer an, zuerst einen teammate zu wecken; andernfalls wartet es auf die nächste Änderung, und der Aufrufer liest den Zustand danach erneut. Aufgabenbearbeitungen auf Basis einer veralteten revision werden abgelehnt, statt neuere Arbeit zu überschreiben.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Design-Entscheidungen hinter dem Adapter und zeigt den Code, der sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Designphilosophie

Der Adapter beruht auf drei Verpflichtungen:

- **Scoped, nicht global.** Jede Registrierung lebt auf dem eigenen `ctx` des Mitglied-Agents; nichts wird für nicht-Team-subagents oder den Host installiert.
- **Deklarierte Ergebnisse, kompaktes JSON.** Jedes Tool deklariert sein vollständiges Ergebnis-schema und rendert diesen Wert als kompaktes JSON, sodass der Compiler `execute` gegen das prüft, was dem Modell versprochen wurde, und kein Ergebnis tokens für Einrückung verbraucht.
- **Die Domain besitzt die Autorität.** Die Tools delegieren an `ctx.agentTeams`, das Lead-Autorität und revision-Prüfungen durchsetzt; der Adapter fügt keinen schwächeren Pfad hinzu.

Der [Agent Teams Agent Note](../../../.agents/notes/implemented/feature/2026-08-05-agent-teams.de.md) besitzt die modellseitigen und Scoping-Entscheidungen.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Config, der feste Richtlinientext und die neun scoped Tool-Registrierungen |
| — | Es wird kein Runtime-invariant-Begleitexport veröffentlicht; der Team-Service besitzt die Persistenz- und Autorisierungsbeziehungen. |

### Richtlinie und Tools

Ein `team:policy`-Abschnitt im member scope bringt jedem Mitglied seine Rolle und die Koordinationsregeln bei; der feste Text und die neun Tool-Registrierungen sind in [`src/index.ts`](src/index.ts) deklariert. Die neun Tool-schemata erscheinen nur in Team-member-scopes, sodass nicht-Team-subagents den Standardkatalog behalten. Scoped Registrierungen mit denselben Namen wie die Legacy-globalen continuable-subagent-Steuerungen überdecken diese Globals nur für Teammitglieder.

### Scoped Registrierung und Teardown

`maybeInstall` läuft für jeden live Agent und abonniert `agent/created`; es überspringt Agents ohne Team-Mitgliedschaft. Das Disposal eines Agents führt den installierten disposer aus, und Plugin-HMR disposed jeden installierten scope vor der Neuinstallation. Jeder disposer wickelt Registrierungen in umgekehrter Reihenfolge ab, sodass eine fehlgeschlagene Installation keinen Teil-scope hinterlassen kann.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der paketweite Vertrag nicht ausreicht. Sie führen vom Domain-Service zu den exakten schemata und den Entscheidungen hinter dem Design.

- [agent-team-Paket](../agent-team/README.de.md) — der `ctx.agentTeams`-Domain-Service hinter diesen Tools.
- [Agent-Teams-Subsystem](../../../docs/subsystems/agent-team.de.md) — dauerhafte Team-Typen und Service-API.
- [Generierter Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-experimental-tool-agent-team) — jedes Tool-schema, das das Modell erhält.
- [Agent Teams Agent Note](../../../.agents/notes/implemented/feature/2026-08-05-agent-teams.de.md) — modellseitige, Scoping- und Isolationsentscheidungen.

-----

<a id="model-experience"></a>
## Model Experience

### Team-Richtlinie und Tools

#### Was das Modell sieht

Ein stabiler Richtlinienabschnitt nennt die exakte Team-Rolle/den Namen/die id, die explizite Delegationsanforderung, das shared-cwd-Verhalten, die stale-version-Wiederherstellung des Dateisystems, das Bash-/Formatter-/Codegen-Risiko, die task- und write-scope-Koordination, die Steer-Zustellung, die no-retry-mailbox-Regel und die Pflicht des Lead, vor dem Antworten zu warten. Die neun Team-schemata von `spawn_teammate` bis `team_task_update` erscheinen nur in Team-member-scopes.

#### Token-Effekt

Feste Richtlinien- und schema-Kosten bei jeder Team-member-Anfrage. Tool-Aufrufe fügen kompakte JSON-roster-, task-, wait- oder receipt-Ergebnisse hinzu. Peer-Inhalte bleiben durch die Team-Domain in der Historie des Ziels erhalten.

#### KV-Cache-Effekt

Präfix-stabil, solange Team-Plugin-Generation, Konfiguration, member-Rolle/Name und schemata unverändert bleiben. Die Identitätszeile pro Mitglied unterscheidet sich zwischen Agents. Tool-Ergebnisse und Peer-Nachrichten werden hinter dem wiederverwendbaren Anfrage-Präfix angehängt.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen beschreiben, was Richtlinie und Tools für ein Team nicht garantieren können. Sie sind aktuelle Paket-Constraints, kein Vergleich mit anderen Kollaborationsoberflächen.

- **Prompt-Richtlinie ist Koordination, nicht Confinement** — sie kann Bash oder externe Prozesse nicht davon abhalten, überlappende Dateien zu schreiben.
- **Keine autonome Team-Erstellung** — gewöhnliche Aufgaben lösen keine Delegation aus, außer der Nutzer fordert sie ausdrücklich an.
- **Keine Web-Steuerungen** — Browser-roster- und Aufgabenboard-Darstellung liegen außerhalb dieses Runtime-Pakets.
- **Experimenteller Prototyp ohne Stabilitätsversprechen** — das Paket ist öffentlich, aber seine schemata können sich während der Inkubation frei ändern.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
