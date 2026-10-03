# Agent Note: Nested terminal cards

Status: implemented

[English](2026-09-05-nested-terminal-cards.md) | [中文](2026-09-05-nested-terminal-cards.zh.md) | Deutsch

## Problem

Ein über `run_code` dispatches Shell-Kommando trägt die Argumente und den gerenderten Output, die für eine Terminal-Karte nötig sind, aber jedes Block mit `parentCallId` abzulehnen verbirgt diese Präsentation allein wegen der Verschachtelung des Calls. Die Ablehnung betrifft auch Running-Prompts und die Details ausgewählter Children.

## Decision

`terminalCardModel` wendet dieselben Eligibility-Checks auf Root- und Code-Dispatch-Calls an, ohne `parentCallId` abzulehnen. Unterstützte laufende und gesettlete `bash`-, `pwsh`- und `terminal_send`-Calls nutzen die bestehende Terminal-Karte. Background-Calls, Tool-Fehler, malformed Inputs, fehlende Call-Heads und nicht unterstützter Result-Content behalten den generischen Fallback. Persistente Shells bleiben während des Laufs eligible und sind gesettlet generisch; ein Nonzero-Prozess-Exit bleibt Terminal-Result-Daten statt eines Tool-Fehlers.

Dies ersetzt partiell nur das Terminal-Child-Card-Verbot in [Client-derived tool presentation](../architecture/2026-08-23-client-derived-tool-presentation.de.md). Jene Note bleibt für Client-Präsentations-Ownership und die diff/read/search/web-Child-Restriktionen aktiv. Keine Änderung an Host-Presenter, Event, Schema, Metadaten, Call-Tree oder Modellkontext ist erforderlich. Die Metadaten- und Execution-local-Value-Entscheidungen in [canonical tool output](../architecture/2026-07-20-canonical-tool-output-contract.de.md) und [PTC typed returns](../feature/2026-07-20-ptc-typed-tool-returns.de.md) bleiben intakt; Metadaten-Auslassung verbietet keine Client-abgeleiteten Terminal-Karten.

Shell-Output, der mit einer erkannten Spill-Policy-Notiz endet, nutzt generischen Output: expandierbar in `BashRow`, Raw-Fallback in Details. Die Notiz kann dem Exit-Marker folgen oder ihn ersetzen, sodass ihre Abwesenheit am Ende keinen erfolgreichen Terminal-Status rechtfertigt. Der browsersichere Eintrag `@deepseek-ai/dsh-spill-policy/notice` besitzt die Textkonvention: Der Producer ruft `formatSpillNotice(omitted, ref)` und der Client ruft `hasSpillNotice(text)`. Beide teilen Delimiter, und Omission-Validierung verwendet `describeOmitted` wieder statt dessen Prosa zu duplizieren. Der Formatter bewahrt die persistierte Schreibweise Byte für Byte; bestehende Session-Result-Bytes bleiben unberührt, ohne Session-Format-Änderung oder Migration.

## Alternatives considered

**Die pauschale Nested-Call-Ablehnung beibehalten.** Verworfen, weil Verschachtelung die rohen Fakten nicht entfernt, die das Terminal-Model bereits konsumiert. Es verbirgt nutzbaren Shell-Output, während derselbe Call am Root als Terminal rendert.

**Jede verschachtelte strukturierte Karte aktivieren.** Verworfen, weil andere Card-Models unabhängige Metadatenanforderungen und Child-Restriktionen haben. Dieser Fix ändert nur die Terminal-Eligibility.

**Exit-Marker um Spill-Suffixe herum parsen.** Verworfen, weil Truncation den echten Status entfernen kann; konservativer generischer Output vermeidet das Erraten von Erfolg aus einem unvollständigen Result.

**Eine separate UI-Notice-Regex pflegen.** Verworfen, weil sie die Textkonvention des Producers dupliziert und vom persistierten Output driften kann. Der geteilte browsersichere Owner hält Formatierung und Erkennung zusammen, ohne das Host-Plugin im Browser zu laden.

## Consequences

Rows und Details teilen die Terminal-Ableitung für verschachtelte Calls ohne zweiten Renderer oder Präsentationshinweis. Generischer Fallback und das Settled-Persistent-Verhalten bleiben von der Terminal-Karten-Eligibility getrennt. Die Parent-Child-Beziehung steuert weiterhin die Baumplatzierung, nicht das Terminal-Rendering. Texterkennung kann Output nicht authentifizieren: Ein Tool kann dieselbe Notiz drucken. Ein Match wählt konservative generische Präsentation, keinen Beweis von Spill-Provenance oder Prozessstatus.

## Verification

Die [Terminal-Card-Specs](../../../../packages/client/ui-tool/tests/terminal-card.client.spec.tsx) decken Root-/Child-Eligibility, Running- und Settled-Details sowie Fallback-Fälle ab. Die [assemblierten Code-Dispatch-Specs](../../../../packages/client/ui-tool/tests/chat-code-subcalls.client.spec.tsx) decken verschachteltes Terminal-Rendering durch den Conversation-Tree ab. Die [Notice-Specs](../../../../packages/spill/spill-policy/tests/notice.spec.ts) pinnen die historische Schreibweise mit einem literalen Fixture, das unabhängig vom Formatter ist. Die [Spill-Policy-to-UI-Specs](../../../../packages/client/ui-tool/tests/spill-policy-terminal.client.spec.ts) üben echte Root- und PTC-Spill-Produktion, unveränderten Volltext und programmatische Werte, Byte-Caps, Notice-only-Output und Terminal-Fallback. Browser-Replay besitzt die sichtbare Nested-Card-Änderung; Nicht-Terminal-Child-Verhalten bleibt außerhalb dieses Fixes.
