# Agent Note: Architektur-Konformität — Dependency-Regeln und das Adapter-Kit
[English](2026-06-11-architectural-conformance.md) | [中文](2026-06-11-architectural-conformance.zh.md) | Deutsch

Status: rejected — premise gone: plugins depend on dsh-agent-loop by design; dsh-llm/invariant and the hygiene dependency gates own conformance


## Problem

Zwei Architekturgarantien leben derzeit nur in Prosa: (1) Nichts hängt vom konkreten Loop-Paket ab ([das Mikrokernel-Versprechen](../../implemented/architecture/2026-06-11-microkernel-event-taxonomy.de.md)), und (2) jeder LlmAdapter spricht das Chunk-Protokoll korrekt. Beide sollten mechanisch sein ([das Quality-Gates-Prinzip](../../implemented/process/2026-06-11-quality-gates.de.md)).

## Proposal

**dependency-cruiser** mit Regeln:

- `packages/*` (außer agent-loops eigenen Tests und examples/) darf `@deepseek-ai/dsh-agent-loop` nicht importieren.
- Keine paketübergreifenden Deep Imports (`@deepseek-ai/dsh-*/src/...`-Pfade) — nur öffentliche Entry Points.
- Keine Import-Zyklen irgendwo in packages/.
- `vendor/*` darf nicht aus `packages/*` importieren.
- Layering: dsh-llm importiert nichts aus anderen dsh-Paketen; dsh-session nur dsh-llm; usw. (die Dependency-Tabelle in packages/README.md, erzwungen).

**Adapter-Konformitätskit** in dsh-llm (`@deepseek-ai/dsh-llm/conformance`): eine wiederverwendbare vitest-Suite, parametrisiert über eine Adapter-Factory, die den Chunk-Protokoll-Vertrag assertet — Index-Monotonie pro Block, keine Deltas nach `block-end` für einen Index, genau ein `finish`, usage höchstens einmal, jedes `tool-call-delta` trägt die Call-ID, Abort wird prompt honoriert. Jetzt gegen die Mocks laufen lassen; der DeepSeek-V4-Adapter erbt sie ab Tag eins. Optional ein Dev-Mode-`strictAdapter()`-Wrapper, der dasselbe zur Laufzeit hinter einem Debug-Flag erzwingt (passt zu [den Dev-Mode-Invarianten](../../implemented/architecture/2026-06-11-dev-invariants-over-deep-readonly.de.md)).

## Plan

Zuerst dependency-cruiser-Konfiguration + CI-Schritt (eine Stunde Arbeit, permanente Garantie); das Konformitätskit landet mit seinem ersten Consumer-Test gegen MockAdapter und ist Voraussetzung für die V4-Adapter-Phase.

## Acceptance criteria

- dependency-cruiser läuft in CI mit den obigen Regelfamilien; ein verletzender Import lässt den Build fehlschlagen.
- Das Konformitätskit läuft gegen den Mock-Adapter und beide ausgelieferten Adapter, und ein neues Adapter-Paket erbt die Suite, indem es sie mit seiner Factory aufruft.

## Risks

Dep-Cruiser-Regelpflege beim Hinzukommen neuer Pakete — Regeln pattern-basiert halten (`dsh-*`) statt aufzuzählen.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
