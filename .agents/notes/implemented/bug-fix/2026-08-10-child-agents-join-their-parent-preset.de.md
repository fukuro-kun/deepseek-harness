# Agent Note: Child agents join their parent's preset composition
[English](2026-08-10-child-agents-join-their-parent-preset.md) | [中文](2026-08-10-child-agents-join-their-parent-preset.zh.md) | Deutsch

Status: implemented


## Problem

Tool- und Prompt-Sektions-Sichtbarkeit wird entlang der Parent-Kette von `dsh-scope` vererbt, und der Scope-Key eines Agents wird ohne Parent geprägt. [Per-Session Agent Presets](../architecture/2026-08-03-per-session-agent-presets.de.md) haben jede modellzugewandte Zeile auf die Agent-Ebene verschoben und `AgentPresets.mount()` zur einzigen Stelle gemacht, die dieses Parent-Binding setzt — von den Session-Create-, Resume- und Fork-Pfaden des api-proxy aus. Die beiden in-process Subagent-Treiber komponieren ihre Children über `applyChildComposition()`, das nur das per-Child Persona und den Tool-Filter installierte, sodass die Scope-Kette eines Childs die Länge eins hatte und dessen Registry-View nur die globale Schicht auflöste.

Diese Schicht ist in jedem Deployment mit einem Preset-Roster nun leer: Der web-app-Patch-Layer deaktiviert jede Host-Ebenen-Tool-Zeile. Ein One-Shot-Child erreichte das Modell daher mit null Tools, ein continuable Child nur mit dem Host-Ebenen-`report`, und keines trug das Persona, den Workspace-Kontext, die Plan-Mode-Sektion oder den Skill-Katalog seines Parents. Der Fork-Pfad hatte aus demselben Grund bereits dieselbe Behandlung erhalten; die Delegation nicht.

Der durable Header des Childs verschärfte das noch. `childSessionMeta()` zeichnete kein Preset auf, sodass ein kalter Read einer Child-Session den Deployment-Default auflöste — ein Tool-Set, unter dem das Child nie lief; genau das, wogegen die Regel "modellsichtbar ⟺ geloggt" existiert.

## Decision

`AgentPresets.composeFrom(agentCtx, parentCtx)` fügt einen Agent der stehenden Komposition hinzu, auf der ein anderer bereits läuft, und gibt die gejointe Preset-Id zurück. Es lokalisiert den Mount des Parents über `standingMountFor()` — der Key des Agents ist dem Standing-Key seines Presets untergeordnet, dieselbe Relation, die `serviceForAgent()` liest — und bindet den Key des Childs an denselben Standing-Key, wobei das Binding unter der alleinigen Re-Link-Autorität des Rosters bleibt. Ein Parent, der keinem Preset beigetreten ist, ergibt keinen Join und keinen Fehler; das ist das rosterlose Deployment: Seine modellzugewandten Zeilen liegen in der Host-Komposition, wo das Child sie bereits über die globale Schicht auflöst.

Das ist ein Bind, kein Mount, und beide Unterschiede sind tragend. Das Child erhält exakt die Generation seines Parents, sodass eine seit dem Start des Parents editierte Kompositionsdatei dem Child keine andere Generation geben kann als die, unter der die Historie seines Parents erzeugt wurde, und ein seither gelöschtes Preset kein Child failen lassen kann, dessen Parent weiterläuft. Es ist außerdem synchron — genau das erlaubt den Child-Erzeugungsfenstern, es zu nutzen: Beide in-process Treiber komponieren innerhalb eines synchronen `setup`.

`applyChildComposition(childCtx, parent, composition)` nimmt den Parent entgegen und führt den Join durch, bevor es die eigenen Registrierungen des Childs anwendet. Der Parameter ist der Kern: Er macht das Komponieren eines Childs ohne den Join an den Call-Sites undarstellbar, statt jeden neuen Treiber an einen zweiten Schritt erinnern zu lassen. `childSessionMeta()` zeichnet die gejointe Id über `AgentPresets.composedPreset()` auf, gelesen aus der lebenden Scope-Kette des Parents statt aus seinem Header, denn ein Parent, der das Preset gewechselt hat, während es blank war, läuft auf der neueren Komposition, während sein Header noch die ältere nennt.

`dsh-subagent` erreicht das Roster über `ctx.get('agentPresets')` mit einem reinen Typ-Import und einer optionalen Peer-Dependency — das dokumentierte Muster opportunistischen Konsums, das es bereits für `sandboxPolicy` und `approval` verwendet.

Dem Child die Tools seines Parents zu geben, legte einen zweiten Defekt frei, den derselbe Agent-Ebenen-Umzug eingeführt hatte: `ToolRuntime` befreite SCOPED-Registrierungen von einer Restriktion und filterte nur die globale Schicht, sodass — sobald jede modellzugewandte Zeile zu einem Ancestor-Beitrag geworden war — der `toolFilter` eines Childs nichts mehr einschränkte; und mit leerer globaler Schicht wies `restrict()` jeden übergebenen Namen als unbekannt zurück und ließ das Child direkt fehlschlagen. Die Exempt-Menge ist die Menge der Tools, die ein Scope SELBST registriert, nicht die Tools, die zufällig in der globalen Schicht liegen; die zweite Lesart galt nur, solange diese beiden Mengen zusammenfielen. `view()` filtert nun alles, was ein Scope erbt — die globale Schicht und jede Ancestor-Schicht — und befreit nur die eigene. Die Eigen-Schicht-Befreiung ist tragend, nicht beiläufig: Die Delegations-Runtime registriert das Structured-Output-Tool eines Childs in die eigene Schicht des Childs, und ein Filter, der die Capabilities benennt, die das Child nutzen darf, darf nicht die Maschinerie entfernen, über die es antwortet.

## Alternatives considered

**Das Preset des Parents im Setup des Childs per Id neu mounten.** Sowohl semantisch als auch mechanisch verworfen. Es liest das Roster neu und stat-tet die Kompositionsdatei erneut, sodass ein Edit seit dem Start des Parents das Child auf eine andere Generation forkt und ein seither gelöschtes Preset das Child failen lässt, während sein Parent weiterläuft. `mount()` ist außerdem asynchron, was die synchronen Erzeugungsfenster ohne Umbau beider Treiber nicht akzeptieren können.

**Den Key des Childs an den Key des PARENTS binden statt an den Standing Mount.** Verworfen, weil es ändert, was ein Child erbt: Die eigene Scope-Schicht des Parents trägt seine per-Agent-Restriktionen, die sich dann in jeden Descendant schneiden würden, und ein Child, das seinen Parent überlebt, würde am Key eines disposten Agents hängen. Der Join auf den Standing Mount gibt dem Child die Komposition seines Parents und nichts weiter.

**Eine gemeinsame Child-Setup-Registry für beide Treiber einführen.** Verworfen, weil ein synchroner, widerrufbarer Beitrag Deployment-Capabilities modelliert, die kommen und gehen, während ein Preset-Join ein einmaliger Bind ohne eigenes Widerrufen ist. Die Komposition über eine optionale Registry zu routen, würde die Auslassung für jeden Treiber, der sie überspringt, wieder möglich machen.

**`dsh-subagent` `resolveSessionPreset` importieren lassen und nach der aufgelösten Id mounten.** Verworfen, weil es das Preset-Roster zu einer harten Modulgrenze für ein Package macht, das ohne eines funktionieren muss, und es landet wieder bei der Remount-Semantik oben.

**Jede Schicht der Kette filtern, einschließlich der eigenen des Scopes.** Verworfen, weil ein per-Child-Capability-Filter dann das Structured-Output-Tool dieses Childs löschen würde, das die Delegations-Runtime in die eigene Schicht des Childs registriert — ein `allow`, das die Capabilities benennt, die ein Child nutzen darf, würde es unfähig machen, das angeforderte Ergebnis zu produzieren.

**Den durable Header unangetastet lassen und nur den Live-Join reparieren.** Verworfen, weil das lebende Child und dasselbe Child bei kaltem Read sich dann uneinig wären, welche Komposition seine Historie erzeugt hat — dieselbe Defektklasse, nur verlagert statt behoben.

## Testing

`packages/preset/agent-presets/tests/mount.spec.ts` deckt den Join gegen reale Fixture-Kompositionen ab: Das Child sieht die Tools und Prompt-Sektionen seines Parents, keine zweite Generation wird gemountet, der Join überlebt den Disposal des Parents (ein Background-Child, das seinen Parent überlebt), die gemeldete Id stimmt, ein Parent ohne Preset joint nichts, und ein unscopeter Kontext wird abgewiesen.

`packages/core/tools/tests/scoped.spec.ts` deckt die Restriktionsregel direkt ab: Der Filter eines Childs entfernt ein von einem Ancestor-Scope geerbtes Tool, die eigenen Registrierungen des Childs überleben seinen eigenen Filter, und die Restriktion eines Ancestors erreicht weiterhin jeden in ihm verschachtelten Scope.

`packages/subagent/subagent-in-process-driver/tests/preset-inheritance.spec.ts` assertiert das modellsichtbare Ergebnis über `startInProcessRun()` auf einer Host-Komposition ohne modellzugewandte Zeilen: die Schemas im eigenen Request des Childs, die Prompt-Sektion seines Parents, das aufgezeichnete Header-Preset, ein über die geerbten Preset-Tools angewandter `toolFilter` und ein Parent, der das Preset gewechselt hat, während es blank war — zu einem ANDEREN Preset, sodass die Assertion das Lesen der lebenden Scope-Kette des Parents vom Lesen seines Erzeugungs-Headers unterscheidet.

Die Assembled-Transcript-Ebene ist das e2e der ausgelieferten Web-Komposition statt eines schlüssellosen Snapshots. Kein ausführbares Beispiel, das dieses Repo ausliefert, komponiert ein Preset-Roster, daher ist der Defekt im Snapshot-Harness überhaupt nicht beobachtbar: Ein Snapshot-Szenario bräuchte zuerst ein Beispiel, das ein Roster mountet UND delegiert. Das Web-e2e bootet die echten `base`- + `web-app`-Patch-Layer mit beiden ausgelieferten Presets; das ist die Assembled-Evidenz, die die Testpolitik verlangt. Die Subagent-Goldens der Web-Browser-Lane tragen die sichtbare Konsequenz, denn ein Child, das sein Preset aufzeichnet, zeigt jetzt den Preset-Badge, den sein Parent zeigt.

## Consequences

Delegation kostet jetzt einen Scope-Parent-Bind pro Child und sonst nichts — keine zusätzlichen Plugin-Instanzen, kein Roster-Read, keinen neuen Fehlermodus. Die Capabilities eines Childs sind exakt die seines Parents, minus was sein eigener `toolFilter` entfernt; ein per-Subagent-Preset ("Agent-Typen") bleibt ungebaut und wäre ein neues Request-Feld statt einer Änderung an diesem Join.

`applyChildComposition()` hat seine Form geändert, daher muss jeder künftige out-of-tree in-process Treiber den Parent liefern. Das ist der beabsichtigte Preis: Die vorherige Signatur ließ einen Aufrufer ein capability-loses Child komponieren, ohne dass ein Fehler kam.

Ein kalt resumtes continuable Child joint die AKTUELLE Komposition seines Parents statt der, die sein eigener Header aufzeichnet. Das Fenster ist schmal — der Parent muss das Child erzeugen, blank bleiben, das Preset wechseln und es erst dann wecken, da ein residentes Child nie neu joint und ein One-Shot-Child nie resumt —, und die Alternative ist schlechter: Das Auflösen der selbst aufgezeichneten Id des Childs würde das Roster erneut lesen und den Fehlermodus "Preset gelöscht" zurückbringen, den dieser Join vermeiden soll. Der Header des Childs zeichnet weiterhin auf, worunter es startete, sodass die Divergenz beobachtbar statt still ist.

`ToolRuntime` liest die Exempt-Menge einer Restriktion nun als "was dieser Scope selbst registriert" statt als "die globale Schicht", was ein dokumentiertes Verhalten jenseits der Delegation ändert: Ein Tool, das ein ANCESTOR-Scope beiträgt, unterliegt jetzt dem Filter eines Descendants, wo vorher nur Tools der globalen Schicht es taten. Nichts weiter auf der Kette verliert seine Befreiung — die eigenen Registrierungen eines Scopes bleiben außerhalb seines eigenen Filters; das ist die Eigenschaft, auf die sich die Delegations-Runtime verlässt.
