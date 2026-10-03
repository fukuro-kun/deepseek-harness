# Agent Note: Plan-spezifischer Collaboration-State
[English](2026-07-22-plan-specific-collaboration-state.md) | [中文](2026-07-22-plan-specific-collaboration-state.zh.md) | Deutsch

Status: implemented


## Problem

Die erste Plan-Mode-Implementierung führte eine generische Named-Mode-Registry ein, obwohl das Produkt nur `plan` auslieferte. `ModeConfig.modes`, Definition-Name-Validierung, `ctx.modes.list()`, Retired-Definition-Fallback und ein synthetischer `review`-Mode in Tests existierten nur, um hypothetische künftige Collaboration-Modes zu unterstützen. Das produktionsspezifische Verhalten — Plan-Guidance, `/plan` und `exit_plan_mode` — lebte weiterhin im selben Package, sodass die generische API keinen wiederverwendbaren Mechanismus von der Plan-Policy isolierte.

Das Wort „mode" umspannt außerdem unverbundene Domänen. Sandbox-Mode ist eine durchsetzende Policy im Besitz von `ctx.sandboxPolicy`, geloggt als `sandbox/mode`; Plan-Mode ist eine Collaboration-Haltung, die Guidance und einen reviewed Exit beiträgt. Beide als Instanzen einer Named-Mode-Abstraktion zu behandeln, würde ihr unabhängiges Ownership verschleiern. Das generische Vokabular eines Transports ist kein Beleg dafür, dass der Harness eine generische Mode-Domäne braucht.

Plan-Mode braucht außerdem eine durable Haltung, ein reviewbares Plan-Artefakt, eine explizite menschliche Grenze und Request-Rekonstruktion über Resume und Fork. Diese Anforderungen gehören zum Plan-Feature, auch nachdem die generische Registry und die interaktiven ACP-Projektionen entfernt sind.

## Entscheidung

Plan-Mode besitzt ein plan-spezifisches Produkt-Package: `@deepseek-ai/dsh-plan-mode` unter `packages/plan/plan-mode/`. Der durable Fakt ist `plan/mode: { active: boolean }`, gefoldet von der `plan`-Projection-Unit des Packages — `planProjectionDefinition.apply` über committed Events, wobei das leere Log zu inactive foldet (`active: false`) — und jede Projection-Unit wird jetzt einheitlich persistiert; die `persist`-Option wurde entfernt. Host-Logik liest den Fold über `ctx.sessionProjections.stateOf(session, 'plan')`; die Client-View ist `{ active, pending }`. `ctx.planMode.get(agent)` gibt `{ active, pending? }` zurück, und `set(agent, active)` zeichnet die an der Boundary angewendete Auswahl auf. Die Pre-Step-, Retry-, Append-Failure- und Disposal-Fences bewahren dasselbe State-Transition-Ownership.

Die Konfiguration ist exakt `{ section: string }`. Das Package registriert die feste `plan:policy`-Section, `/plan [message]`, die exakte `/plan off`-Direct-Exit-Form und `exit_plan_mode` selbst. Nacktes `/plan` wählt active; ein anderes nicht-leeres Argument wählt es zuerst und sendet dann den getrimmten Text über `agent.steer()`, wodurch der Text eine gewöhnliche geloggte User-Message im betroffenen Step wird. `/plan off` wählt inactive ohne Modell-Input und kann einen Entry canceln, der an der Boundary noch pending ist. Das Exit-Tool bleibt registriert, während Plan-Mode inactive ist, damit der Request-Tool-Katalog stabil bleibt.

Menschenzugewandte Compositions besitzen Plan-Auswahl und -Review. Diese Note behielt ursprünglich ACPs `default`/`plan`-Picker auf Protokollebene als Adapter über dem Boolean-Service; [ACP as an automation-only protocol](2026-07-23-acp-automation-only-protocol.de.md) supersedet diese Wire-Projektion, sodass die ACP-Composition jetzt weder Plan-Mode noch ein Mode-Selection-Protokoll mountet.

Sandbox-Mode und Approval-Policy bleiben separate Durchsetzungsachsen. Plan-Mode liest und schreibt keine von beiden, und die Vereinfachung führt keinen Shared-Base-Type, keine Registry und keine Preset-Abstraktion über diese Konzepte hinweg ein.

### Boundary- und Modell-Contract

`plan/mode` ist Log-only und non-surface, sodass Resume, Fork und Compaction den State ohne Live-Mirror wiederherstellen. Ein gespawnter Agent beginnt inactive, weil es keine Creation-Time-Plan-Option gibt. Pending User-Auswahlen werden vor der betroffenen Request-Assembly beim initialen oder Continuation-Pre-Step geflusht, oder bei einem Request-Recovery-Retry; ein fehlgeschlagener durabler Append lässt den Intent für eine spätere Boundary pending.

Der aktive State trägt die Section des Deployments an First-Party-Prompt-Order 500 bei. Der inactive State trägt keine Section bei, während `exit_plan_mode` in beiden Zuständen registriert bleibt, sodass ein Transition den geloggten Request-Header ändert, aber nicht die nativen Tool-Schemas oder das PTC-Mode-SDK. Ein user-getriebener Transition hängt nur dann eine Plugin-sourced Notice an, wenn der letzte Request-Header den gegenteiligen State beschrieb; eine Pre-First-Request- oder Netto-Null-Auswahl fügt keine hinzu, und ein approved Tool-Exit verlässt sich auf sein Tool-Result statt auf eine zweite Notice.

### Reviewed Exit

`exit_plan_mode` erfordert einen aufrufenden Agent im aktiven Plan-Mode und einen nicht-leeren Markdown-Plan, der mit einer Heading beginnt. Die User-Questions-Frage trägt genau diesen Plan als Detail und bietet `Approve` oder `Keep planning` plus Freitext-Feedback. Nur eine `Approve`-Auswahl ohne Custom-Text stimmt zu; jede andere Antwort bleibt im Plan-Mode und gibt korrigierendes Feedback an das Modell zurück. Ein approved Exit wird eine stille pending Selection, lässt die Plan-Guidance für den Rest des aktuellen Tool-Batches aktiv und entfernt sie vor dem nächsten Request.

Das Tool rendert den eingereichten Plan als generische Card mit dessen erster Heading als Titel. Ein fehlender oder fehlschlagender User-Questions-Provider, ein fehlgeschlagener Review oder Plugin-Disposal während ein Review pending ist, schlägt fail-closed fehl und lässt manuelles `/plan off` als menschlichen Escape-Pfad.

## Gelöschte API

- Die beliebige Definition-Map, Mode-Name-Regex, Reserved-Name-Regeln und der Per-Definition-Command-Loop.
- `ModeDefinition`, die resolved Definition-Map, `ctx.modes.list()`, String-wertiger Get/Set-State und die Behandlung unbekannter oder retired Modes.
- Nur-für-Tests-`review`-Mode-Fälle und Behauptungen, dass zusätzliche Modes per Konfiguration hinzugefügt werden können.
- Generische `mode/set`- und `mode:policy`-Namen; das Plan-Package besitzt jetzt `plan/mode` und `plan:policy`.

## Erwogene Alternativen

**Eine private generische Registry behalten und nur Plan exponieren.** Abgelehnt, weil die ungenutzte Name-/Config-Machinerie weiterhin gewartet und getestet würde, ohne einen zweiten Produktions-Consumer. Ein künftiger Collaboration-State kann den richtigen Shared-Seam aus zwei konkreten Fällen etablieren.

**Sandbox- oder Approval-Policy in den Plan-State folden.** Abgelehnt, weil Collaboration-Guidance, Execution-Confinement und Permission-Entscheidungen verschiedene Owner, Lifecycle-Semantiken und Consumer haben. Ein Mode-besessenes Sandbox-Cap lässt außerdem die explizite Sandbox-Auswahl eines Users erfolgreich erscheinen, während sie still nichts tut.

**Einen Presentation-Transport den Plan-State besitzen lassen.** Abgelehnt, weil TUI, Web, Resume, Fork, Prompt-Assembly und das Exit-Tool denselben geloggten Fakt unabhängig von jedem einzelnen Transport brauchen. Presentation-Adapter besitzen nur ihre Projektionen.

**Ein Capability-Seam-Trio splitten oder den State in den Agent-Loop legen.** Abgelehnt, weil Plan-Mode kein austauschbares Backend hat, während bestehende Session-, Prompt-, Tool-, Command- und Lifecycle-Extension-Points bereits jeden benötigten Hook liefern.

**Flips in Surface-Messages legen oder Pläne in Dateien speichern.** Abgelehnt, weil die Haltung ein Log-only-Fakt ist und das Tool-Argument den reviewbaren Plan bereits aufzeichnet. Surface-Duplikation verbraucht Modell-Context, während ein Plan-Verzeichnis ein zweites durables Zuhause erzeugt.

**Tools über eine Per-Plan-Name-Allowlist oder einen globalen Policy-Stack filtern.** Abgelehnt, weil Mutabilität eine Eigenschaft jedes einzelnen Tools ist, einschließlich künftiger und MCP-Tools, und keine Liste, die jedes Plan-Deployment pflegen muss. Effects-Metadaten können eine Shared-Policy nur etablieren, wenn ein konkreter Consumer existiert; bis dahin ist Plan-Mode Guidance, keine Security-Boundary.

**Review über den Approval-Seam oder Prosa.** Abgelehnt, weil ein Plan-Review keine Permission-Entscheidung ist, das exakte Artefakt und korrigierenden Freitext braucht und einen geloggten Tool-Call als strukturierten Transition haben muss. Der User-Questions-Seam liefert diesen Contract.

## Verifikation

- Package-Tests behalten Boundary-Ordering, Retry, Append-Failure, HMR-Disposal, Prompt-Assembly, stabile native und PTC-Mode-Schemas, Review-Outcomes und Invariant-Coverage über den Boolean-Service.
- Command-Tests decken nacktes `/plan`, `/plan <message>`, aktives `/plan off`, Pending-Entry-Cancellation, Inactive-Idempotenz, Abwesenheit von `/mode` und `/review` sowie Effect-scoped-Entfernung ab.
- Die keyless TUI-Szenarien treten über `/plan <message>` ein, verlassen über `/plan off` und beweisen, dass jeder committed `plan/mode` dem Request-Header vorausgeht, den er ändert, dass die Entry-Message unter Plan-Guidance geloggt wird und dass der Post-Exit-Request diese Guidance weglässt.
- Der vollständige `exit_plan_mode`-Review-Bogen ist package-getestet, hat aber keinen Assembled-Application-Snapshot, nachdem die interaktiven ACP-Szenarien retired wurden; die aktuellen keyless TUI-Szenarien decken nur Command-Entry und Direct-Exit ab.

## Konsequenzen

Die Implementierung hat ein Vokabular für ein ausgeliefertes Feature. Eine weitere Collaboration-Haltung hinzuzufügen ist eine explizite Design-Entscheidung statt eines Config-Eintrags, und Automation-Clients erwerben über ACP keine menschlichen Mode-Controls. Die gefrorene v0-to-v1-Session-Edge lehnt alte `mode/set`-Events explizit ab; das Config-Parsing lehnt unabhängig die retired `modes.plan.section`-Form ab.

Der Plan-State bleibt rekonstruierbar und die Tool-Schemas bleiben stabil, aber eine idle pending Selection geht verloren, wenn der Prozess vor der nächsten Boundary exitet. Das Betreten oder Verlassen des Plan-Modes ändert den Prompt ab First-Party-Order 500, und ein Modell, das die Guidance ignoriert, kann trotzdem mutieren, es sei denn, das Deployment konfiguriert unabhängig Sandbox-, Approval- oder Filesystem-Policy.
