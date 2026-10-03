# Agent Note: Environment facts follow reusable prompt instructions
[English](2026-09-06-environment-prompt-suffix.md) | [中文](2026-09-06-environment-prompt-suffix.zh.md) | Deutsch

Status: implemented


## Problem

Die lokale Web-URL, der Harness-Checkout-Pfad und das Session-cwd unterscheiden sich je Benutzer und Maschine. Diese Fakten vor den wiederverwendbaren Tool-Instruktionen zu platzieren lässt ansonsten identische Prompts nahe ihrem Anfang divergieren und begrenzt das für Same-Model-Cache-Reuse verfügbare Präfix. Die Modellnamen-Vorstellung identifiziert den Agent und kann früh bleiben.

## Decision

Die [System-Prompt-Registry](../../../../packages/core/system-prompt/README.de.md) hält die feste Harness-Identität an erster Stelle und `DEPLOYMENT_PERSONA_PREFIX` bei `0`. First-party wiederverwendbare Instruktionen bis einschließlich `STRUCTURED_OUTPUT` stehen vor dem Environment-Suffix: `HARNESS_SOURCE` bei `10000`, `WEB_SURFACE` bei `10100` und `DEPLOYMENT_PERSONA_SUFFIX` bei `10200`.

Die globale System-Prompt-Config akzeptiert `personaPrefix` und `personaSuffix`, beide standardmäßig leer. Die [gescopte Persona-Zeile](../../../../packages/preset/persona/README.de.md) verlangt `prefix` und akzeptiert `suffix`, standardmäßig leer. Sie registrieren `deployment:persona-prefix` und `deployment:persona-suffix` über die exportierten Namen `PERSONA_PREFIX_SECTION` und `PERSONA_SUFFIX_SECTION`. Ein ausgelassener oder leerer gescopter `suffix` schattiert das globale Suffix weg. Die ausgelieferten Web-, Headless-, SDK- und ACP-Bundles sowie die Standard-, PTC- und Cordis-Presets halten die Modellvorstellung im Präfix und platzieren nur `Your working directory is {{cwd}}.` im Suffix. Diese Namen spezifizieren Platzierung, keine Klassifikation des Textes; es werden weder Persona-Parsing noch ein OS-Feld ergänzt.

Die [Prompt-Variables- und Tool-Guidance-Ownership-Note](../architecture/2026-07-05-prompt-variables-and-tool-guidance-ownership.de.md) behält ihre Identity-first-Persona-Platzierung, Single-Owner-Regel, strikte Interpolation und Tool-Guidance-Zuständigkeiten.

## Alternatives considered

**Die gesamte Persona nach hinten verschieben.** Das verschiebt die Modellnamen-Vorstellung vom Anfang weg, ohne der Same-Model-Reuse zu helfen. Das Separieren von cwd bewahrt Vorstellung und wiederverwendbare Instruktionen zusammen.

**Nur Source-Pfad und Web-URL verschieben.** Lässt man cwd in der frühen Persona, bricht das wiederverwendbare Präfix weiterhin über Workspaces hinweg.

**Environment-Fragmente aus Persona-Text inferieren.** Deployment-verfasste Prosa zu parsen macht die Platzierung von Wortlaut abhängig. Explizite Templates geben ausgelieferten Kompositionen und benutzerdefinierten Deployments direkte Kontrolle.

**Diese Fakten in Runtime-Context-Messages verschieben.** Das ändert ihre Message-Rolle und Persistenzplatzierung statt nur System-Sektionen zu trennen.

## Consequences

Byte-identische Präfixe erfordern dieselbe Modellvorstellung, dasselbe Persona-Präfix, dieselben Tools, Konfiguration und vorausgehenden Sektionstexte. Beliebige Extension-Reihenfolgen und Assembly-Listener bleiben autoritativ; dies ist eine First-party-Platzierungs-Policy, keine universelle Stable-Prefix-Garantie. Provider-Cache-Sharing und Hit-Rate-Verbesserungen werden weder gemessen noch versprochen.

Environment- und Web-/Source-Guidance folgen den Structured-Output-Instruktionen. Eine `complete: true`-Persona nutzt nur das gerenderte Präfix und ignoriert das Suffix, unterdrückt jede andere System-Sektion, ohne Tool-Schemas oder Runtime-Kontext zu deaktivieren. Source- und Web-Fakten behalten ihre Unterscheidung zwischen Harness-Checkout, Session-Workspace und aktuellem Arbeitsverzeichnis.

## Testing

[Registry-Tests](../../../../packages/core/system-prompt/tests/system-prompt.spec.ts) vergleichen wiederverwendbare Präfixe bei gleichem Modell und geänderten Checkout-Pfaden, URLs und cwd-Werten; sie decken außerdem strikte Interpolation und Complete-Overrides ab. [Loop-Tests](../../../../packages/core/agent-loop/tests/loop.spec.ts) pinnen frühe Modellidentität und Session-cwd-Interpolation. [Persona-Tests](../../../../packages/preset/persona/tests/persona.spec.ts) decken Scoped-Suffix-Ersetzung, Empty-Shadowing und Complete-Personas ab. [Aufgezeichnete Prompt-Snapshots](../../../../docs/testing.de.md) decken emittierte Prompts in Native-Tool- und Generated-SDK-Kompositionen ab; sie messen keine Provider-Cache-Hits.
