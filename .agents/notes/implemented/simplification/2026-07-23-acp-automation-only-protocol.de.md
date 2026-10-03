# Agent Note: ACP als Automation-only-Protokoll
[English](2026-07-23-acp-automation-only-protocol.md) | [中文](2026-07-23-acp-automation-only-protocol.zh.md) | Deutsch

Status: implemented


> Die Automation-only-Grenze bleibt aktuell. [Standard ACP v1 automation controls](../feature/2026-08-22-standard-acp-automation-controls.de.md) supersedet nur das Prompt-only-Methoden-, Konfigurations-, MCP-, Update- und Lifecycle-Inventar dieser Note; sie stellt ACP nicht als UI wieder her.

## Problem

Die ACP-Bridge war zu einer zweiten interaktiven Produkt-UI geworden. Sie übersetzte durable Events in Editor-Cards, Terminal-Metadaten, Diffs, Plans, Titles, Reasoning, Commands, Modes, Model- und Permission-Picker, Session-Navigation und menschliche Elicitation. Diese Verantwortlichkeiten duplizierten die TUI und den Web-Client, während sie einen Automation-Transport an UI-Services, Persistenz-Queries, Presentation-Policy und Editor-spezifische Konventionen koppelten.

ACP hat noch eine nützliche Rolle: Ein anderer Agent oder ein automatisierter Controller kann einen Harness-Prozess starten, eine isolierte Session erzeugen, Text oder ein eng unterstütztes Inline-Image senden, die committed Text-/Image-Antwort empfangen, Arbeit canceln und einen Permission-Request beantworten. Das Out-of-Process-ACP-Subagent-Backend hängt von dieser Standard-Protokollgrenze ab.

Die Snapshot-Suite erschwert die Entfernung. Die meisten ACP-Szenarien üben das assemblierte Agent-Backend statt der ACP-Präsentation, sodass das Löschen der Suite mit der Editor-Bridge breite keyless Behavior-Coverage wegwerfen würde.

## Entscheidung

`@deepseek-ai/dsh-acp` ist ein Automation-Transport unter [`packages/acp/acp`](../../../../packages/acp/acp/README.de.md), außerhalb der `ui`-Package-Gruppe. Sein öffentliches Protokoll enthält Standard-Automation-Controls statt Präsentation: persistente Session-Creation/List/Resume/Close, ein In-Flight-Prompt pro Session, Model-Konfiguration, stdio/HTTP-MCP-Mounting, committed semantische Updates, Cancellation, konkurrierende Sessions und One-Shot-Permission-Requests. Prompts bewahren Text und unterstützte Raster-Images in Wire-Reihenfolge, während Resource-Links zu eckig-klammerten Text-Referenzen flach werden; die Bridge lehnt weiterhin zusätzliche Directories, Audio, Embedded Resources, malformed oder leere Prompts, unbekannte Sessions und überlappende Prompts ab.

Die Image-Capability ist wahrheitsgemäß statt strukturell: `initialize` bewirbt sie nur, wenn ein durabler Attachment-Store existiert und die konfigurierte exakte Provider/Model-Route mit explizitem Image-Input resolved. Jeder Prompt snapshotet seine exakte Route vor der asynchronen Admission, dekodiert strikt jeden Image-Block und delegiert den vollständigen Batch an `AttachmentStore.saveImages()`, bevor das User-Event publiziert wird. Derselbe Snapshot treibt den zugelassenen Turn, selbst wenn sich die Next-Turn-Konfiguration konkurrierend ändert. Cancellation reserviert und abortet den Admission-Slot vor jeder asynchronen Arbeit, wartet, bis bereits gestartete Writes quiescieren, bevor der Prompt settlet, und publiziert nie eine späte Message; bevor der Prompt die Agent-Inbox betritt, cancelt oder wartet er weder auf unverbundene Agent-Arbeit. Ein vollendeter Content-Addressed-Write kann unerreichbar bleiben, weil destruktives Rollback für einen deduplizierten Store nicht gültig ist. Caller-korrigierbare Image-Policy-Fehler mappen auf Invalid-Parameters, während Route-Lookup, Storage-Corruption und Persistenz-Fehler interne Faults bleiben.

Die Bridge emittiert nur committed semantische Fakten. Eine Per-Session-Promise-Chain bewahrt Reasoning-, Assistant-Block-, Tool-Lifecycle-, Konfigurations- und Usage-Update-Reihenfolge, während Assistant-Image-Referenzen asynchron nachgelesen und integritätsverifiziert für die ACP-Base64-Auslieferung werden; ein fehlendes oder korruptes Objekt lässt die Prompt-Auslieferung fehlschlagen statt zu einem Placeholder zu werden. Raw Chunks, Todos, Plans, Titles, Retry-Marker, Terminal-Metadaten, Diffs, Locations und Präsentationsprojektionen bleiben vom ACP-Wire fern. Standard-Model- und -Reasoning-Optionen, List/Resume/Close und stdio/HTTP-MCP sind Automation-Controls; Session-Load/Delete/Fork, Commands, Modes, Plan-Review, Terminals, Client-Filesystem-Operationen und menschliche Elicitation bleiben nicht unterstützt.

One-Shot-`session/request_permission` bleibt. Es ist ein Machine-Policy-Channel für Bridge-besessene Agents, keine menschliche Approval-UI: Der Answerer akzeptiert nur ein exaktes Agent-Objekt in der Live-Session-Map der Bridge, delegiert fremde oder call-lose Requests und mappt fehlgeschlagene RPCs auf das Fail-Closed-`unavailable`-Outcome. Der Client wählt Allow-Once, Reject-Once oder Cancel, und die Bridge verwandelt diese Antwort nie in einen durablen Grant. Die Asking-Policy bleibt im Approval-Seam und seinen Producern; [`dsh-subagent-acp`](../../../../packages/subagent/subagent-acp/README.de.md) nutzt diesen Channel programmatisch.

Die App-Composition enthält den obligatorischen Agent-Core, Persistenz, Checkpoint-Policy, Derived-Session-Query und den ACP-Transport. Die ACP-Bridge liest die Persistenz direkt für Standard-Resumable-Summaries; sie exponiert keine Command-, Session-Reference-, Plan-Mode-, Permission-Picker- oder User-Question-Präsentationsoberflächen.

Der Transport programmiert Interface-Level-Agent-, -Session- und -Approval-Services statt den konkreten Agent-Loop. Tool-Ausführung bleibt im Harness; ACP delegiert Shell-Ausführung nie an einen Editor. stdout trägt nur geframte JSON-RPC, sodass die App keinen stdout-Logger mountet und die Bridge den Prozess-Output nicht monkey-patcht.

Disconnect und Plugin-Disposal teilen eine memoisierte Quiescence-Grenze. Sowohl erfolgreiche als auch fehlgeschlagene Transport-Schließung canceln Prompt-Admission und Agents, drainen geordneten Output, settlen pending Prompts als cancelled, disposen jeden Bridge-besessenen Agent und awaiten Loop- und Session-Cleanup. Ein Create, das das Close-Race verliert, dispost seinen unveröffentlichten Handle.

<a id="snapshot-boundary"></a>

## Snapshot-Grenze

Die ACP-Snapshot-Suite bootet weiterhin das assemblierte ACP-Beispiel und behält Szenarien, die Backend-Verhalten pinnen. Nur Szenarien, die über gelöschte UI-Methoden getrieben werden, verlassen die Suite. Standard-Resume stellt einen persistierten Agent wieder her, ohne Transcript-UI zu replayen, während Semantic-Checkpoint-Recovery-Coverage weiterhin das Headless-SDK-Beispiel nutzen kann, wenn dieses Protokoll das Subjekt ist.

Protokoll- und Lifecycle-Tests pinnen Stop-Reason-Codecs, Versions-Negotiation, wahrheitsgemäße Image-Capability, Fresh-Session-Creation, geordnete Text-/Image-Admission, Resource-Link-Flattening, All-Member-Validierung vor Writes, Abwesenheit von Inline-Base64 in durable Events, Ablehnung leerer oder nicht unterstützter Prompts, Exact-Agent-Permission-Ownership, Multi-Session-Isolation, Prompt-Settlement nach geordnetem Output, verifizierte Assistant-Image-Auslieferung, Cancellation während Admission ohne spätes Followup oder Cancellation unverbundener Agent-Arbeit, Ausschluss unverbundener Pre-Inbox-Fehler, fehlgeschlagene Transport-Schließung, ACP-only-Reload-Cleanup und Teardown-Quiescence. Ein assemblierter keyless Snapshot sendet ein echtes Inline-PNG durch das lauffähige ACP-Beispiel und pinnt nur dessen durable Referenz im Session-Log. Gebaute und echte stdio-Smokes lehnen streunenden stdout ab. Der `session/new`-Branch, der ein echtes stdio-Close-Race verliert, bleibt Coverage-befreit, weil der In-Memory-Transport diese Reihenfolge nicht reproduzieren kann; er dispost den unveröffentlichten Handle, während die umgebenden Disposal-Tests die No-Orphan-Invariante pinnen.

## Erwogene Alternativen

**ACP als Editor-UI behalten, bis Web Parität erreicht.** Abgelehnt, weil es zwei zu entwickelnde interaktive Contracts hinterlässt und Editor-Konventionen in der Automation-Grenze hält.

**Die frühere Editor-Bridge hinter disziplinierten Service-Grenzen behalten.** Abgelehnt, obwohl diese Bridge Interface-Services, Tool-besessene Render-Intents, Approval- und User-Questions-Answerer, Harness-besessene Ausführung und eine stdout-reine Composition korrekt nutzte. Ihre Terminal-Cards waren capability-gegate, reine Display-Zed-`_meta`-Projektionen mit Text-Fallback statt ACP `terminal/create`, sodass Shell-Ausführung den Harness nie verließ. Die Projektion leitete jede Display-Terminal-ID von der stabilen Per-Call-ID ab, um Kollisionen zu verhindern, und gewann Exit-Code oder Signal aus den gerenderten Status-Markern zurück, weil der reine Result-Presenter Content-Blocks statt eines strukturierten Exits erhielt; Marker-Roundtrip-Tests und ein expliziter No-Capability-`console`-Fallback-Test pinnten beide Contracts. Diese Grenzen waren kohärent, konnten aber nicht bewirken, dass Editor-Cards, Session-Navigation, Konfigurations-Picker und menschliche Elicitation in ein Automation-Protokoll gehören.

**ACP durch einen privaten Subagent-RPC ersetzen.** Abgelehnt, weil ACP bereits ein typisiertes, interoperables Prozess-Protokoll liefert und vom Out-of-Process-Subagent-Backend genutzt wird.

**Maschinelle Permission-Requests mit den anderen Interaktions-Features entfernen.** Abgelehnt, weil ein automatisierter Parent die One-Shot-Policy-Entscheidung eines Child-Agents beantworten muss; dies ist Control-Flow zwischen Agents, nicht Präsentation.

**Die ACP-Snapshot-Suite löschen oder jedes Szenario in dieser Änderung migrieren.** Abgelehnt, weil die meisten Szenarien das Backend testen und wertvoll bleiben, während eine vollständige Harness-Migration eine unabhängige Testing-Änderung ist. Nur Szenarien, deren Treiber eine gelöschte UI-Methode war, verlassen diese Suite.

**Image-Support bewerben, wann immer das ACP-SDK einen Image-Block hat.** Abgelehnt, weil Protokoll-Vokabular nicht beweist, dass dieses Deployment Bytes persistieren kann oder dass die konfigurierte exakte Route visuellen Input akzeptiert. Unbekannte Capability ist bei der Initialisierung false; die Prompt-Admission prüft die Live-Route nach.

**Inline- und Assistant-Images zu Markern flach machen oder ACP-Base64 in Session-Events persistieren.** Abgelehnt, weil Marker still Modell-/User-Intent verlieren und Base64 durable Logs zum Binär-Store macht. ACP übersetzt an der Transport-Grenze zwischen seinem Wire-Block und der bestehenden durablen `ImageBlock`-Referenz.

**Einen generischen RichContent-Service für ACP, MCP und Web erzeugen.** Abgelehnt, weil Core-`ContentBlock` plus der Attachment-Seam bereits den Shared-Contract besitzen. Jede Fronttür behält nur Protokoll-Parsing, Capability-Beweis und Lifecycle-Orchestrierung; geteilte Batch-Limits und Image-Validierung bleiben in `AttachmentStore.saveImages()`.

## Konsequenzen

ACP hat einen schmalen Contract, der für Agents und Automation geeignet ist, während TUI und Web menschliche Interaktion und Präsentation besitzen. Das Package hat weniger injizierte Services, Dependencies, Protokoll-Branches und Lifecycle-States und beansprucht nicht mehr, ein genereller Editor-Einstiegspunkt zu sein.

Automation-Clients empfangen committed Message-, Reasoning-, generische Tool-, Konfigurations- und Usage-Fakten statt Token-Deltas oder strukturierter Tool-UI. Standard-List/Resume/Close und Session-Konfiguration decken den Automation-Lifecycle ab, ohne Navigation, Transcript-Replay, Titles oder andere menschliche Präsentation hinzuzufügen.

Die Backend-Snapshot-Coverage bleibt daher an den ACP-Transport gekoppelt, obwohl dieser Transport für das getestete Verhalten nebensächlich ist.
