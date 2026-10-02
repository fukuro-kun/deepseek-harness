# Agent Note: Interactive side sessions and merge-back

Status: proposed

[English](2026-07-08-interactive-side-sessions.md) | [中文](2026-07-08-interactive-side-sessions.zh.md) | Deutsch

## Problem

Ein User kann ein Anliegen aus einer Live-Session erkunden wollen, ohne ihren Hauptkontext zu verändern. Die vorhandenen Primitive exponieren diese Produktform nicht: [Session-Store-Fork](../../archived/feature/2026-06-30-session-store-fork-api.md) erstellt eine ungebundene Session, während [Fork-Subagent](../../implemented/feature/2026-06-21-subagent-capability-seam.de.md) modellgetriebene Aufgaben sind, deren Transcript sich in ein einzelnes Tool-Result aufstaut. Keines davon gibt dem User ein separates Gespräch, und keines recordet eine Schlussfolgerung im Parent zusammen mit der Side-Session, die sie hervorgebracht hat.

## Proposal

Eine **Side-Session** ist eine gewöhnliche Live-Session, geforkt am letzten abgeschlossenen Turn der Quelle, an ihren eigenen Agent gebunden, als read-only-Berater gerahmt und in der Lage, eine verdichtete Notiz **zurückzumergen**.

- **Fork and attach:** Erzeuge das Child mit dem balancierten Completed-Turn-Präfix des Parents, `parentSession`, `meta.isSeeded: true` und der exakten Sibling-`inheritedEventCount`. Das komponiert `ctx.agents.create({ seed, inheritedEventCount, meta })`; es fügt keinen Core-Service oder Session-Store-Method hinzu.
- **Advisor framing:** Spritze nach der Erstellung eine plugin-stammende `context/message` ein, die dem Child mitteilt, es solle erklären, ohne die Aufgabe zu mutieren oder fortzusetzen. Das System-Prompt byte-identical zu halten erhält den Provider-Präfix-Cache über der geerbten Historie.
- **Merge-back:** Fordere vom Child ein längenbegrenztes Handback an, und injiziere dann eine plugin-stammende `context/message` in den Parent. Der nächste Parent-Request sieht es an seiner geloggten Position, wodurch Replay und [Request-Rekonstruierbarkeit](../../implemented/architecture/2026-07-05-reconstructable-requests.de.md) ohne ein neues Session-Event erhalten bleiben.
- **Presentation:** Aufruf, Session-Umschaltung und Handback-Rendering gehören zur ersten Client-UI. Diese Agent Note spezifiziert nur die client-unabhängigen Mechaniken.

Rewind-Produktisierung, Session-Tree-Views, ein model-facing Side-Session-Tool und `forkName`/`mergedInto`-Metadaten sind out of scope. Ein Live-Adapter-Spike hat Source-Log-Isolation, geerbten Kontext, einen Multi-Turn-Child-Austausch und Merge-Back-Sichtbarkeit im nächsten Turn des Parents verifiziert.

## Alternatives considered

- **Die subagent-Seam nutzen:** abgelehnt, weil Side-Sessions user-getrieben, client-sichtbar sind und einen Parent-Turn überleben können; Subagent sind model-getriebene Runs, die ein einzelnes Tool-Result zurückgeben.
- **Das Child-System-Prompt ändern:** standardmäßig abgelehnt, weil jede Byte-Änderung den Präfix-Cache ab Token null invalidiert. Deployments können diese stärkere Trennung dennoch bevorzugen.
- **`sidechat/*`-Events hinzufügen:** aufgeschoben, weil eine sourced `context/message` den Inhalt, den Producer und den Replay-Input bereits dauerhaft recordet. Ein dediziertes Event ist nur durch einen Client gerechtfertigt, der ein differenziertes Rendering braucht.
- **Jetzt eine Protokoll-API binden:** abgelehnt, weil aktuelle UIs client-eigen sind. Die Live-Präsentation muss schließlich aus der dauerhaften Nachricht abgeleitet werden, damit Replay denselben Datensatz rendert.

## Acceptance criteria

- Forking lässt die Quelle unberührt und erstellt ein Child mit dem balancierten Completed-Turn-Präfix, `parentSession`, `isSeeded: true`, der exakten `inheritedEventCount` und einem byte-identical System-Prompt.
- Advisor framing fügt genau eine plugin-stammende `context/message` an der Spitze der angehängten Historie des Childs hinzu, statt dessen System-Prompt zu ändern.
- Merge-back fügt genau eine längenbegrenzte `context/message` mit Source `plugin: sidechat` hinzu; der nächste Parent-Request und Replay sehen sie an derselben Position.
- Parent und Child laufen koncurrent, ohne Log- oder Stream-Crosstalk.
- Unit-Tests decken fork/attach und merge-back ab; Snapshot-Coverage landet mit der ersten gebundenen UI.

## Risks

- Read-only-Verhalten ist beratend, bis ein `tools/pre-execute`-Deny-Gate es erzwingt; [der Interception-Point](../../implemented/feature/2026-06-30-interception-extension-points.de.md) kann dieses Gate hinzufügen, ohne diese Mechaniken zu ändern.
- Eine komprimierte Quelle forkt ihre komprimierte Ansicht, also sollte eine gebundene UI offenlegen, dass das Child Zusammenfassungen erbt statt ersetzter Turns.
- Wiederholte Handbacks konsumieren Parent-Kontext. Die Längen-Cap pro Merge begrenzt jede Notiz; spätere Konsolidierung gehört zur Kompaktion.
