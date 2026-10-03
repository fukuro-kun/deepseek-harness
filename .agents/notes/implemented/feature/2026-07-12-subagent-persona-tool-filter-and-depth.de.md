# Agent Note: Subagent-Persona, Tool-Sichtbarkeit und Tiefe konfigurieren

Status: implemented

[English](2026-07-12-subagent-persona-tool-filter-and-depth.md) | [中文](2026-07-12-subagent-persona-tool-filter-and-depth.zh.md) | Deutsch

## Problem

Ein wiederverwendbarer Subagent-Provider beantwortet die Frage, wie ein Child läuft, aber verschiedene Delegation-Tools brauchen unterschiedliches Child-Verhalten. Ein Deployment mag eine Reviewer-Persona wollen, ein reines Recherche-Tool-Set oder eine harte Rekursionsgrenze — ohne für jede Kombination einen neuen Provider zu bauen.

Diese Controls wirken auf den ersten Model-Request des Child und können daher nicht mehr installiert werden, sobald das Child sichtbar ist. Außerdem brauchen sie ehrliche Provider-Unterstützung: Ein ACP-Backend kann einen rein prozessinternen Tool-Filter nicht stillschweigend akzeptieren, und ein Filter darf nicht als Sicherheitsgrenze beschrieben werden, wenn alle Plugins im selben vertrauenswürdigen Prozess laufen.

## Entscheidung

Subagent-Starts haben drei unabhängige Composition-Controls: `persona`, `toolFilter` und `maxDepth`. Ein Provider bewirbt die Unterstützung jedes Controls, der Service lehnt nicht unterstützte Requests vor dem Start eines Runs ab, und ein In-Process-Provider installiert die angeforderte Composition, solange das Child noch unveröffentlicht ist.

Die Controls beantworten verschiedene Fragen:

| Control | Frage | Ergebnis |
|---|---|---|
| `persona` | Welche Rollenanweisungen ersetzen die Deployment-Persona für dieses Child? | Ein Child-lokaler Prompt-Abschnitt überschattet `deployment:persona-prefix` |
| `toolFilter` | Welche deployment-globalen Tools gelangen in die sichtbare Tool-Sicht dieses Child? | Eine gescopte Restriktion filtert die globalen Tools, bevor Child-lokale Tools hinzugefügt werden |
| `maxDepth` | Wie tief darf dieser Delegationsbaum wachsen? | Ein Start, dessen Child-Tiefe die absolute Obergrenze überschreitet, wird abgelehnt |

`dsh-tool-subagent` legt die Controls als Plugin-Konfiguration offen und kopiert sie in jeden Request, den es erzeugt. Direkte `SubagentRuntime`-Aufrufer dürfen sie pro Request wählen. Der Capability-Descriptor des Providers bleibt die Source of Truth dafür, ob ein Backend jedes Feld einlösen kann.

### Persona ist ein gescopter Schatten

Das Persona-Control ändert ein Child, ohne die deployment-weite Prompt-Assembly zu ändern. Während des unveröffentlichten Setups registriert ein In-Process-Provider einen Child-gescopten Abschnitt namens `deployment:persona-prefix`; die gewöhnliche Most-Specific-Wins-Auflösung ersetzt den globalen Abschnitt nur in den Assemblies dieses Child.

Der Wert hat dieselbe strenge Template-Semantik wie die Deployment-Persona. Wird er weggelassen, erbt er den Deployment-Abschnitt über die globale Ebene; ein explizit leerer String überschattet die globale Persona mit einem leeren Abschnitt. Eltern- und Geschwister-Personas gelangen nie in den flachen Scope des Child.

Dies nutzt den normalen System-Prompt-Registrierungsmechanismus statt eines zweiten Persona-Kanals. Der erste Prompt sieht daher denselben benannten Beitrag, den spätere Prompts und Prompt-Inspection-Tools sehen.

<a id="tool-filtering-is-one-live-global-view-rule"></a>

### Tool-Filterung ist eine einzige Live-Global-View-Regel

Der Tool-Filter steuert Capability-Sichtbarkeit und ausführbares Lookup gemeinsam. Ein In-Process-Provider installiert `ToolRuntime.restrict()` im Scope des Child vor der Veröffentlichung, und der einzige Resolver der Registry wendet dasselbe Ergebnis auf Wire-Tool-Schemas, Lookup, Ausführung und die SDK-Erzeugung im PTC-Modus an. Unabhängig registrierte System-Prompt-Abschnitte bleiben im Besitz ihrer Plugins. Die Dateisystem-, Such- und Web-Tool-Plugins nutzen den bestehenden `PromptSection.text({ scope })`-Callback und `ctx.tools.get(name, scope)`, um Guidance für nicht verfügbare Tools wegzulassen und anwendbaren Tool-übergreifenden Text auszuwählen. So bleiben ursprüngliche Formulierung und Reihenfolge für ein unterstütztes Tool-Set erhalten, und es funktioniert für jeden Agent-Scope, einschließlich zugrunde liegender PTC-Capabilities, deren Wire-Präsentation `run_code` ist. Es fügt weder Abschnitts-Ownership-Metadaten noch einen Assembly-Pass hinzu; nicht verwandte statische Prosa wird von `restrict()` nicht automatisch umgeschrieben.

Die Auflösung folgt diesen Regeln:

1. Jede Restriktion wendet `allow` vor `deny` auf die live deployment-globale Tool-Registry an.
2. Mehrere Restriktionen schneiden sich, sodass jede installierte Restriktion ein globales Tool zulassen muss.
3. Child-gescopte Tools werden nach der globalen Filterung hinzugefügt und dürfen ein zugelassenes globales Tool überschattet.
4. Reservierte `run_code`-Präsentation und andere scope-lokale Protokollbeiträge liegen außerhalb des globalen Filters.

Die Konfiguration schlägt laut fehl, wenn ein Filter weder `allow` noch `deny` liefert oder etwas außerhalb des aktuellen global einschränkbaren Sets benennt, einschließlich eines nur-scope-lokalen oder reservierten Namens. `allow: []` ist gültig und blendet absichtlich jedes globale Tool aus. Diese Prüfungen fangen Tippfehler ab und verhindern, dass eine Konfiguration wirksam erscheint, obwohl sie den benannten Eintrag nicht beeinflussen kann.

Die globale Registry bleibt live. Ein Nur-Deny-Filter lässt einen später registrierten globalen Namen zu, sofern er ihn nicht explizit denyt; eine Allow-Liste schließt einen späteren globalen Namen aus, sofern sie ihn nicht explizit allowt. Das Entfernen eines globalen Tools entfernt es aus jeder aufgelösten Sicht. Diese Semantik erhält Hot-Registration und macht zugleich den Unterschied zwischen Allow und Deny explizit.

### Tiefe ist eine absolute Baum-Obergrenze

Das Tiefenlimit begrenzt rekursive Delegation unabhängig von der Tool-Sichtbarkeit. Ein Top-Level-Agent hat Tiefe null; ein In-Process-Child hat die validierte Tiefe seines Elternteils plus eins. `maxDepth` ist eine absolute nicht-negative Safe Integer, und ein Start wird abgelehnt, bevor das Child-Ownership beginnt, wenn die abgeleitete Child-Tiefe die Obergrenze überschreitet.

Die wirksame Elterntiefe ist das Maximum aus durable `SessionHeader.delegationDepth` und Runtime-`AgentOptions.subagentDepth`. Ein In-Process-Child zeichnet seine abgeleitete Tiefe im Session-Header auf, und Resume stellt diesen Header wieder her, sodass ein Restart den Rekursionszähler nicht senken kann.

Jeder öffentliche Einstieg validiert die Domäne, statt sich auf einen einzigen modellzugewandten Konfigurationspfad zu verlassen. Negative Werte, Brüche, negative Null, nicht-endliche Werte, unsichere Integer, fehlerhaft gespeicherte Elterntiefe und abgeleiteter Überlauf werden allesamt abgelehnt. Ein direkter `SubagentStartRequest` darf die Obergrenze weglassen, um die Tiefe unbegrenzt zu lassen; loader-aufgelöste `dsh-tool-subagent`-Konfiguration verwendet stattdessen den Standard `3`, akzeptiert ein numerisches Override und nutzt das explizite `'provider-managed'`, um die Obergrenze für einen Out-of-Process-Provider wegzulassen, dessen Deployment sein Rekursionsbudget selbst besitzt. Drei ist ein kleiner endlicher Default, der weiterhin einen Root plus drei Nachkommen-Generationen erlaubt, und das [base profile](../../../../packages/bundle/base/cordis.patch.yml) folgt dieser allgemeinen Policy. Eine numerische Tool-Obergrenze schlägt beim Provider-Mount fehl, wenn dem Provider `depthLimit` fehlt.

Ein Deployment kann Tiefe und Filterung kombinieren, aber die numerische Obergrenze synthetisiert keinen Filter. Das Delegation-Tool bleibt an der Obergrenze sichtbar, weil die Autorisierung vom Runtime-Zustand abhängen kann; jeder Startversuch prüft die aktuelle durable und Runtime-Tiefe des aufrufenden Agent, und ein abgelehnter Start liefert ein Tool-Result mit Fehler, ohne ein Child zu veröffentlichen. Ein Deployment mit statischer Sichtbarkeits-Policy kann Delegation-Tools in Childs zusätzlich separat denyen. Keine der beiden Entscheidungen ändert das Konversations-History-Verhalten des Providers.

### Capability-Gating hält Provider ehrlich

Capabilities trennen ein angefordertes Feature von einer Provider-Implementierung. `SubagentCapabilities` bewirbt `persona`, `toolFilter` und `depthLimit`; `SubagentRuntime.start()` prüft jedes vorhandene Request-Feld gegen diese Flags, bevor es den Provider aufruft.

So können Spawn- und Fork-Provider die In-Process-Implementierung teilen, während externe Provider nur bewerben, was sie durchsetzen können. Ein Request degradiert niemals still: Die Wahl eines nicht unterstützten Controls erzeugt `UNSUPPORTED_CAPABILITY`, und es existiert weder ein Run noch ein Lifecycle-Event.

### Unveröffentlichtes Setup macht den ersten Request korrekt

Alle Child-lokale Composition ist abgeschlossen, bevor das Child beobachtbar wird. Der In-Process-Provider gibt der Agent-Erzeugung einen Setup-Callback; dieser Callback installiert Persona-, Tool-Restriktions- und Structured-Output-Beiträge im Scope des Child. Erst wenn das Setup gelingt, veröffentlicht die Erzeugung die Session und den Agent und erlaubt dem Driver zu starten.

Ein Setup-Fehler rollt das private Child zurück. Kein Observer kann ein Child erhalten, dessen erster Prompt die Deployment-Persona oder das ungefilterte Tool-Set verwendete und dessen spätere Prompts die angeforderte Konfiguration verwenden.

## Sichtbarkeit ist keine Autorität

Diese Controls komponieren vertrauenswürdiges Same-Process-Verhalten; sie autorisieren es nicht. `toolFilter` ändert die von der Tool-Registry aufgelöste Child-Sicht, erzeugt aber keinen Eltern-zu-Kind-Grant-Verbund, verlangt nicht, dass ein Child eine Untermenge seines Elternteils ist, sandboxt keine Plugins und hindert Code mit einem anderen Cordis-Kontext nicht daran, Services direkt aufzurufen.

Insbesondere wird ein Child-lokales Tool nach dem globalen Filter hinzugefügt und kann in der Elternsicht fehlen. Ein Nur-Deny-Child sieht zudem spätere globale Tools, die die Deny-Liste nicht benennt. Das sind bewusste Live-Composition-Semantiken, keine Non-Escalation-Garantien.

Ein Sicherheitsdesign bräuchte eine separate Autoritätsrepräsentation, Propagationsregel und einen Enforcement-Punkt zur Ausführungszeit. Creation-Time-Grant-Snapshots, Parent-Subset-Grants, explizite Future-Grant-APIs und generische Capability-/Output-/Termination-Tags liegen außerhalb dieses Features.

## Erwogene Alternativen

**Einen Provider pro Persona oder Tool-Set anlegen.** Das vervielfacht Provider, die sich Transport- und Lifecycle-Implementierung teilen, macht dynamische Deployment-Konfiguration unhandlich und braucht dennoch einen Rekursionsmechanismus. Provider bleiben für den Ausführungstransport zuständig; Requests tragen die Per-Child-Composition.

**Die vollständige Tool-Sicht des Elternteils kopieren.** Der Registrierungsscope ist per Design flach, und Lifetime-Ownership impliziert keine Sichtbarkeitsvererbung. Das Kopieren einer aufgelösten Sicht würde zudem dynamische globale Registrierungen einfrieren und Composition mit Autorität vermengen, ohne einen der beiden Verträge vollständig zu definieren.

**Erlaubte globale Tools bei der Child-Erzeugung snapshoten.** Ein eingefrorenes Allow-Set macht künftige Registrierungen einheitlich unverfügbar, ändert aber die Hot-Registration-Semantik und eröffnet ein Autorisierungsdesign. Der implementierte Filter bleibt ein Live-Registry-Prädikat und dokumentiert das Allow-gegen-Deny-Verhalten direkt.

**Nur Tool-Schemas verbergen.** Eine rein präsentationsseitige Filterung lässt das Modell über den PTC-Modus oder einen gefälschten Call ein Tool ausführen, das laut Prompt nicht existiert. Stattdessen regiert ein Resolver Präsentation und Ausführung gemeinsam.

**Die Tiefen-Obergrenze als automatischen Tool-Filter kodieren.** Ein Creation-Time-Filter würde eine Entscheidung snapshotten, die vom Runtime-Zustand abhängen kann, wirkt nur auf einen konfigurierten Tool-Namen und schützt weder direkte Service-Aufrufer noch alternative Delegation-Tools. Der Provider setzt stattdessen die absolute Obergrenze bei jedem Start durch.

## Konsequenzen

Contributors können Child-Rolle, sichtbare globale Tools und Rekursion konfigurieren, ohne neue Provider zu definieren. Capability-Checks schlagen fehl, bevor Ownership beginnt, unveröffentlichtes Setup macht den ersten Request konsistent, und ein einziger Tool-Resolver verhindert Präsentations-/Ausführungsdrift.

Der Preis ist, dass Deployments das Live-Allow/Deny-Verhalten und den Unterschied zwischen Sichtbarkeit und Autorität verstehen müssen. Ein Modell kann ein sichtbares Delegation-Tool aufrufen, nachdem die aktuelle Tiefen-Policy ein weiteres Child verbietet, und einen Fehler erhalten. Provider-Autoren müssen jedes unterstützte Control korrekt bewerben, und In-Process-Provider müssen jeden angeforderten Beitrag vor der Veröffentlichung installieren. Die Controls lösen bewusst weder Sicherheits-Confinement noch Eltern-zu-Kind-Non-Escalation.
