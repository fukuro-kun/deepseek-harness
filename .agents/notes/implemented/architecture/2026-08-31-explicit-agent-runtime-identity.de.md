# Agent Note: Explizite Agent-Identität an Runtime-Grenzen

Status: implemented

[English](2026-08-31-explicit-agent-runtime-identity.md) | [中文](2026-08-31-explicit-agent-runtime-identity.zh.md) | Deutsch

## Problem

Der Cordis-Context eines Agents besitzt Registrierungen und deren Aufräumen. Agent-Identität wählt dagegen die Session, den Runtime-Owner, das Event-Subjekt, die Autoritätsentscheidung oder die Wire-Identität für eine Operation aus. Eine umgekehrte Agent-Property auf dem Context ließ diese beiden Fakten austauschbar erscheinen: Ein Aufrufer konnte einen Context für Effect-Ownership wählen und versehentlich diese Wahl die Domänenidentität bestimmen lassen.

Die umgekehrte Assoziation erforderte außerdem kompensierende Mechanismen nach der Type-Erasure. Host-Remote-Forwarding inspizierte ein geroutetes Subjekt auf seinen Context, die Erstellung leitete die Runtime-Elternschaft aus dem Aufrufer-Context ab, und Adapter pflegten umgekehrte Identitätsscans. Diese Mechanismen duplizierten Identität, die bereits in typisierten Requests vorhanden war, und verschleierten, welcher Aufrufer zur Laufzeit einen Agent besaß.

Ohne expliziten Owner erstellt und resumiert `SubagentContinuationManager` Kinder über seinen privaten Plugin-Context, sodass die Context-basierte Inferenz jedes fortsetzbare Kind als Runtime-Root klassifiziert, obwohl der Manager seinen exakten Elternteil hält. Root-only-Consumer könnten dann Scheduling-Tools anhängen, direkte menschliche Goal-Autorität gewähren oder User-Fragen so routen, als wäre das Kind top-level.

## Entscheidung

Runtime-Schnittstellen tragen die Agent-Identität an der Stelle, die sie besitzt. `AgentSetup` erhält `(agentCtx, agent)`; Agent-Erstellungs- und -Resume-Optionen tragen `parentAgent` für ein Runtime-Kind; gescopte Events tragen ihren Agent im Payload; Remote-Forwarding verifiziert, dass `request.agent` der Trägerschlüssel ist; und die Host-Typert-Context-Auflösung bildet die Wire-Identität auf einen lebenden Agent-Context ab, ohne umgekehrten Scan. `agent.ctx` bleibt der Registrierungs- und Lebenszyklus-Owner und exponiert keine umgekehrte Agent-Property.

Scope-aware Registries verwenden den opaken Scope-Schlüssel weiterhin nur für Registrierungsmitgliedschaft. Tool-Subagent klassifiziert diesen Schlüssel nicht und löst keinen Agent aus dem Context auf. Ein direktes `AgentSetup` übergibt die unpublizierte Session explizit und installiert über den gelieferten Context vor der Publikation. Für ein Settings-gestütztes stehendes Preset liefert das Event-Payload den Agent, dessen Session das Policy-Ziel, und dessen Context besitzt die Registrierungen.

`SubagentContinuationManager` setzt den exakten Elternteil sowohl in die Fresh-Creation- als auch in die Cold-Resume-Optionen. Ein lebendes fortsetzbares Kind ist daher von `AgentRegistry.roots()` ausgeschlossen und erfüllt `isOwnedBy(child.id, parent)`. Dauerhafte `parentSession`-Metadaten ersetzen diese Relation nicht: Ein Fork oder eine resumierte Session kann eine Runtime-Root sein, wenn kein lebender Agent sie besitzt.

Die [Agent-Registrierungs-Scope-Entscheidung](2026-07-08-agent-scope-contexts.de.md), ihr [Runtime-Design](2026-07-12-agent-scope-runtime-design.de.md) und die [Initiator-Scope-Entscheidung](2026-07-15-agent-initiator-scope.de.md) behalten ihre unabhängige Registrierungs-, Lebenszyklus- und Private-Chain-Begründung. Diese Entscheidung ersetzt nur die dort beschriebene umgekehrte Context-Assoziation und die implizite Runtime-Owner-Ableitung.

## Verifikation

Agent-Erstellungstests pinnen explizite Root- und Kind-Ownership. Continuation-Integrationstests halten ein echtes Kind lange genug am Leben, um sowohl den `roots()`-Ausschluss als auch die `isOwnedBy()`-Mitgliedschaft zu asserten. Bestehende Schedule-Tests verifizieren, dass Root-only-Registrierungen bei einem explizit besessenen Kind abwesend bleiben.

Remote-Event-Tests lehnen einen fehlenden oder nicht übereinstimmenden Agent ab, bevor sie einen gescopten Waterfall weiterleiten. Tool-Subagent-Tests verifizieren, dass das direkte Setup vor der Session-Publikation installiert; Standing-Preset-Tests verifizieren Policy-Sampling und -Vererbung pro Session.

## Erwogene Alternativen

**`Context.agent` beibehalten.** Ein umgekehrter Accessor lässt Registrierungs-Ownership wie Operationsidentität aussehen und verlangt, dass jede Context-Ableitung, jeder Adapter und jedes Test-Double eine Assoziation bewahrt, die nichts mit Cordis-Service-Auswahl oder Effect-Aufräumung zu tun hat.

**Runtime-Ownership aus dem Aufrufer-Context ableiten.** Ein privater Manager-Context, ein Agent-Context und ein Standing-Preset-Context können alle dieselbe Factory aufrufen. Die Context-Ahnenreihe sagt daher nicht aus, welcher lebende Agent das Ergebnis besitzt; der Ersteller muss den Elternteil, den er bereits kennt, in die Request-Optionen setzen.

**Agent-Scope-Schlüssel klassifizieren.** Ein opaker Scope-Schlüssel drückt Routing-Mitgliedschaft aus, nicht Domänenidentität. Ihn zu klassifizieren würde den Agent zum Zentrum der Komposition machen und würde den Effect-Owner eines Plugins trotzdem an die Session koppeln, deren Policy er braucht.

**Den initiierenden Agent als Erstellungs-Ownership verwenden.** Der Initiator-Scope zeichnet kausale asynchrone Ausführung auf, nicht Lifetime-Ownership. Ein Elternteil kann Arbeit initiieren, die absichtlich eine Root erstellt, und das Setup bleibt außerhalb der Driver-Grenze des Kindes.

**Dauerhafte Session-Abstammung verwenden.** `parentSession` zeichnet Konversations-Abstammung über Prozesslebenszeiten hinweg auf. Runtime-Ownership steuert lebende Roots und Teardown; beides gleichzusetzen würde verhindern, dass ein legitim resumierter Fork ein Top-Level-Agent wird.

## Konsequenzen

Lebenszyklus-Optionen, Events, Service-Requests und Transport-Requests tragen explizite Agent-Identitäten, sodass jede Operation die von ihr verwendete Identität benennt und TypeScript beide Seiten prüft. Der Context bleibt für Dependency-Zugriff und Effect-Ownership wiederverwendbar, ohne zu einem alternativen Domänenobjekt-Locator zu werden.

Fortsetzbare Kinder haben dieselbe Runtime-Elternrelation wie einmalige In-Process-Kinder. Root-only-Consumer schließen sie aus, der Eltern-Teardown kann aus einem lebenden Ownership-Graphen schließen, und die dauerhafte Abstammung bleibt frei, Geschichte zu beschreiben statt prozesslokale Lebensdauer.
