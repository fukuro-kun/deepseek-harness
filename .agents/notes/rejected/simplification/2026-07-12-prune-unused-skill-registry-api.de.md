# Agent Note: Ungenutzte Skill-Registry-API beschneiden
[English](2026-07-12-prune-unused-skill-registry-api.md) | [中文](2026-07-12-prune-unused-skill-registry-api.zh.md) | Deutsch

Status: rejected — direkte Runtime-Skill-Registrierung ist ein bewusster Erweiterungspfad für Drittanbieter-Plugins.


## Problem

Das Embedded-Runtime-Subsystem des Skill-Service hat keinen einzigen Produktionsaufrufer von `ctx.skills.register()`. Es fügt einen reservierten `runtime`-Providernamen, eine Runtime-Map/-Rank/-Source, eine Duplikat-Policy, eine zweite Revision in Cache-Schlüsseln, Normalisierung, Disposer und Tests hinzu — neben dem Provider-Vertrag, den jeder ausgelieferte Skill bereits nutzt. `SkillSummary.whenToUse` und `path` auf Candidate/Definition werden geparst und kopiert, aber nie von einem Produktions-Consumer gelesen: Der Modellkatalog rendert Name/Description, das Laden von Ressourcen nutzt `resourceBase`, und Provider besitzen ihren Locator. Der bewusst offene `metadata`-Erweiterungspunkt bleibt.

## Vorschlag

`SkillRegistry.register()`, `SkillRegistration`, den Runtime-Pseudo-Provider samt Reserved-Name-Regeln, Runtime-Revisionen/-Cache-Zweige und die nur für die Runtime bestimmte Source/Rank-Normalisierung entfernen. Tests, die einen eingebetteten Skill brauchen, registrieren einen kleinen echten Provider. `providerRevision` bleibt als Epoche für laufende Discovery, doch fertige Kataloge werden allein über cwd gekeyt: Jede Provider-Mutation leert den Cache synchron, und der Revision-Vergleich nach dem Await verhindert bereits das Einfügen veralteter Arbeit. `whenToUse`, `SkillCandidate.path` und `SkillDefinition.path` aus dem Skill-Vertrag und den Kopien des lokalen Providers entfernen, während die Locator-/Root-Pfade der Provider erhalten bleiben; `metadata`, `disableModelInvocation`, `source`, `provider`, `locator` und `resourceBase` bleiben als bewusstes Erweiterungsvokabular bzw. produktiv konsumierte Felder.

Die Skill-System-Agent-Note, README, JSDoc, Kataloge und Tests anpassen. Agent-scoped System-Prompt-Abschnitte, Tool-Provider und Variablen liegen ausdrücklich außerhalb dieses Vorschlags: Der [Agent-Scope-Contributor-Vertrag](../../implemented/architecture/2026-07-08-agent-scope-contexts.de.md) erlaubt bewusst, dass alle drei während `setup(agentCtx)` über den agent-eigenen Kontext registriert werden; das Fehlen einer festen in-repo Scoped-Registrierung ist daher kein Beweis für Nichtkonsum.

## In Betracht gezogene Alternativen

**Runtime-Skill-Registrierung für Embedder behalten.** Sie ist eine bewusste synchrone Direktdefinitions-Bequemlichkeit in der implementierten Skill-Agent-Note. Ein kleiner Provider-Wrapper kann dieselben eingebetteten Daten unter effect-besessener Lebensdauer anbieten, muss aber asynchrone `list()`/`get()` implementieren, eine Provider-Identität tragen und die Duplikat-Semantik der Provider akzeptieren. Der Vorschlag wählt diesen einen regulären Pfad statt einer zweiten Pfadlandschaft für Ranking, Validierung, Cache-Invalidierung und Lookup.

## Akzeptanzkriterien

- Die Skill-Sammlung hat genau einen provider-gestützten Pfad, einen nur-cwd-Cache-Schlüssel für abgeschlossene Kataloge und eine Revision-Epoche nur zur Invalidierung laufender Discovery; die verbleibenden Skill-Felder haben einen Produktionsleser oder einen dokumentierten, bewussten Erweiterungsvertrag.
- Agent-scoped Prompt-Abschnitte, Variablen, Tool-Provider, Tool-Guards und das Structured-Output-Commit-Verhalten im nativen und im PTC-Modus bleiben unverändert.
- Typecheck, Coverage, Snapshots, doc-sync, Module-Graph-Verifikation, Build und Hygiene bestehen.

## Risiken

Dies ist eine kompilierbare Kontraktion der Pre-Release-Skill-Registry. Externe programmatische `list()`/`get()`-Consumer verlieren `whenToUse`-Routing-Hinweise und `path` auf Candidate/Definition; der ausgelieferte Modellkatalog rendert sie nie, und die Ressourcenauflösung behält ihr explizites `resourceBase` plus den provider-eigenen opaken Locator, doch diese Felder sind nicht beobachtbar identisch. Das skill-lokale Frontmatter-Parsing muss das unterstützte Metadata-Schema weiter bewahren und validieren, und externe Provider können weiterhin eingebettete, Dateisystem-, Remote- oder sonstige Skill-Quellen liefern.
