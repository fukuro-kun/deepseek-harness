# Agent Note: Was auf der Host-Ebene bleibt, sobald Presets die Agent-Ebene besitzen
[English](2026-08-10-host-plane-ownership-after-presets.md) | [中文](2026-08-10-host-plane-ownership-after-presets.zh.md) | Deutsch

Status: implemented


## Problem

[Per-Session-Agent-Presets](2026-08-03-per-session-agent-presets.de.md) verschoben jede model-seitige Zeile auf die Agent-Ebene, und jeder spätere Fix war ein Leser, der die Welt vor der Verschiebung annahm. `tasks` kehrte zum Host zurück, weil eine Preset-Zeile außerhalb ihres Realm es auflöste; `goals` verließ den Host aus demselben Grund nie; der `toolFilter` eines Child-Agents wurde repariert, sobald jedes model-seitige Tool ein Beitrag der Vorfahren statt eines globalen wurde ([Child-Agents treten dem Preset ihres Elternteils bei](../bug-fix/2026-08-10-child-agents-join-their-parent-preset.de.md)).

Zwei weitere Leser standen noch auf der falschen Seite dieser Linie.

`dsh-token-meter` war auf dem Host deaktiviert und innerhalb des `compaction`-Realm jedes Presets gemountet. Es nimmt keine Konfiguration entgegen, keyt jeden Fold nach `Session` und registriert weder Tool noch Prompt-Abschnitt — besitzt aber die Projektionseinheiten `tokenUsage`, `contextPressure` und `contextBreakdown`, und `sessionProjections` ist eine prozessweite Tabelle ohne Scope-Layering. Eine Einheit, die aus einem Preset heraus registriert wird, antwortet daher für jede Session: Ob eine `minimal`-Session einen Kontext-Meter anzeigte, hing davon ab, ob eine *andere* Session seit Boot `standard` gemountet hatte, und ein Prozess, der nur `minimal` lief, zeigte gar keinen.

Nichts benannte einen Agent, der keinem Preset beitrat. Der Beitritt ist ein Scope-Parent-Link; ohne ihn lösen die `tools`-, `system-prompt`- und `skill`-Views die leere globale Ebene auf, und das Modell erhält nichts — kein Fehler, kein leerer Katalog, nur ein Agent, der nicht handeln kann. So liefen delegierte Subagents, solange Presets existierten, und dieselbe Lücke ist an jedem Einstiegspunkt offen, der älter ist als sie.

## Entscheidung

**Der Meter gehört auf die Host-Ebene.** `dsh-token-meter` kehrt in die Host-Komposition zurück und verlässt die `isolate`-Map der Presets, sodass `compaction-basic` und `tool-result-pruner` die eine Host-Instanz aus ihrem Realm heraus auflösen. Die Presets behalten das Realm und das Backend — was ein Preset wählt, ist, ob sein Agent kompaktiert, nicht, ob seine Tokens gezählt werden. Das ist das Kriterium, nach dem `tasks` und `goals` bereits gelesen werden, angewandt auf einen Service, dessen *Projektions*-Reichweite die Preset-Ownership falsch machte: Eine Einheit, deren leerer Wert von einem echten nicht unterscheidbar ist, kann nicht pro Komposition sein, solange die Tabelle, in die sie sich registriert, pro Prozess ist.

**Ein nicht beigetretener Agent wird an zwei verschiedenen Punkten zweimal benannt.** `AgentPresets` loggt eine Warnung pro Agent, der mit einer Scope-Kette der Länge eins publiziert wird, während ein Roster konfiguriert ist. Das Companion-Invariant schlägt stattdessen fehl — und zwar bei `system-prompt/assemble`, nicht bei der Publikation, weil ein nicht beigetretener Agent legal ist, bis er ein Modell adressiert: `recompose` bindet genau solch einen Agenten als erstes Glied, und die Prompt-Assemblierung ist der einzige Aufrufer, der einen Agent-Scope liefert, sodass eine Host-Assemblierung und ein stehender Mount beide korrekt außerhalb des Bereichs liegen.

Drei Grenzen bleiben offen und sind dort dokumentiert, wo sie beißen, statt hier behoben zu werden: Das Vorhandensein eines Projektions-Keys ist kein Per-Session-Capability-Signal ([`dsh-session-projection`](../../../../packages/session/session-projection/README.de.md)); eine abgelöste stehende Generation wird nie zurückgefordert, was der Autoren-Flow der Einstellungsseite in Kosten pro Speichern verwandelt ([`dsh-agent-presets`](../../../../packages/preset/agent-presets/README.de.md)); und ein temporäres Plugin, das über `cordis_mount` gemountet wird, gehört zur Komposition statt zur Session, die es gemountet hat ([`dsh-tool-cordis`](../../../../packages/extensions/tool-cordis/README.de.md)).

## Tests

`apps/cli/tests/web-agent-presets.e2e.ts` liest `ctx.get('tokenMeter')` auf der gebooteten Web-Komposition, bevor irgendein Preset in der Datei mountet — ein Preset-seitiger Meter sitzt hinter einem `isolate`-Realm und ist für `ctx.get` unsichtbar, sodass das Lesen eine Ownership-Assertion ist statt eines Mount-Reihenfolgen-Zufalls — und assertiert dann, dass der Snapshot einer `minimal`-Session alle drei Einheiten trägt.

`packages/preset/agent-presets/tests/mount.spec.ts` assertiert, dass die Warnung für einen nackten Agent genau einmal feuert und für einen beigetretenen gar nicht. `tests/invariant.spec.ts` trägt die Negativkontrolle: Die Assemblierung eines nicht beigetretenen Agents wird abgelehnt, während die Assemblierung eines beigetretenen Agents und eine scopelose Host-Assemblierung beide bestehen.

## Betrachtete Alternativen

**Den Meter im Preset behalten und die Projektions-Registry scope-schichten.** Der präzise Fix, und deutlich größer: `snapshot`, `checkpoint` und der eager drive bräuchten jeweils eine Session→Scope-Auflösung, die ein kalter Read ohne das `presenterScopeFor` des api-proxy nicht hat. Abgelehnt als unverhältnismäßig für einen Service ohne jeglichen Per-Preset-State; die allgemeine Regel ist stattdessen auf der Registry dokumentiert.

**Die Publikation eines nicht beigetretenen Agents verweigern.** Laut schlägt still, und die Registry unterstützt es — ein synchroner `agent/created`-Listener, der wirft, rollt die Erstellung zurück. Abgelehnt, weil das Komponieren eines Agents außerhalb des Rosters legal ist: `recompose` dokumentiert den nackten Agenten, den es dann bindet, und die ACP-Bridge, der SDK-Server und das headless-Bundle erzeugen alle einen. Ein Veto würde eine Capability-Lücke in einen Ausfall verwandeln.

**Den Beitritt im Companion ebenfalls bei `agent/created` prüfen.** Abgelehnt: Die Publikation kann einen verpassten Beitritt nicht von einem Agent unterscheiden, der später gebunden wird, sodass die Prüfung einen dokumentierten Pfad ablehnen würde. Die Prompt-Assemblierung kann sie unterscheiden.

**`plan-mode` und `tool-todo` aus demselben Projektionsgrund von der Agent-Ebene nehmen.** Abgelehnt: Beide sind echt Per-Preset-Capabilities, und ihre Einheiten berechnen einen leeren Wert für eine Session, die sie nie nutzt, den Clients bereits wertbasiert lesen (`plan.active`, eine leere Liste). Nur eine Einheit, deren leerer Wert von einem echten nicht unterscheidbar ist — der Meter — erzwingt Host-Ownership.

## Konsequenzen

Der Kontext-Meter wird eine Per-Session-Tatsache statt einer Funktion der Mount-Historie. Ein Preset kann die Token-Erfassung nicht mehr abwählen; kein ausgeliefertes Preset tat das, und `minimal` sagt nun, dass es Auto-Compaction fallen lässt statt der Erfassung.

Die Warnung ist beratend, sodass ein Deployment, das den ACP- oder SDK-Server-Einstiegspunkten ein Roster hinzufügt, weiterhin Agents ohne Tools startet — es sagt es nur einmal pro Agent statt stillschweigend. Das Invariant erreicht nur Kompositionen, die `dsh-invariants` laden, was Package-Tests und Entwicklungs-Hosts abzäunt, nicht ein ausgeliefertes.
