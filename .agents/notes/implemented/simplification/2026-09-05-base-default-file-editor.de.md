# Agent Note: Geteilte Base-Default-Auswahl des File-Editors
[English](2026-09-05-base-default-file-editor.md) | [中文](2026-09-05-base-default-file-editor.zh.md) | Deutsch

Status: implemented


## Problem

Die geteilte Base wählt sowohl `read`/`write`/`edit` als auch `str_replace_editor` aus — überlappende File-Editing-Schnittstellen. [Issue #3599](https://github.com/deepseek-harness/deepseek-harness/issues/3599) fordert eine Default-Schnittstelle für base-gestützte Profile bei Bewahrung der dedizierten Minimal-Kompositionen.

## Decision

Der [Base-Patch](../../../../packages/bundle/base/cordis.patch.yml) wählt `read`, `write` und `edit` für das File-Editing. Er fügt `tool-str-replace-editor` nicht ein; SDK- und Web-Application-Patches brauchen daher kein deaktivierendes Override. Das Editor-Package bleibt für Kompositionen verfügbar, die es explizit einfügen.

Web-Minimal und das standalone `sdk-minimal`-Bundle besitzen ihre Tool-Auswahl unabhängig von der Base. Die [Persistent-Shell-only-Entscheidung](2026-09-03-minimal-profiles-persistent-shell-only.de.md) besitzt ihre Ein-Tool-Defaults.

Dies verfeinert die geteilten Tool-Defaults in [one dsh launcher](../architecture/2026-08-22-single-dsh-application-launcher.de.md). Jener Note bleibt aktiv für Launch-Ownership, geteilte Services und Patch-Precedence; kein aktiver Note ist vollständig ersetzt.

## Alternatives considered

**Den Editor in jeder Application separat deaktivieren.** Das belässt überlappende Defaults in der Base und verlangt von jedem Consumer ein Opt-out. Die Base besitzt die geteilte Wahl direkt.

**Das Tool-Package löschen.** Explizite Custom-Kompositionen nutzen diese Schnittstelle weiterhin. Die Base-Default-Auswahl entfernt das Package nicht und beschränkt nicht die unabhängig besessenen Minimal-Defaults.

## Consequences

Base-gestützte SDK-, Headless-, ACP- und Custom-Profile lassen das Editor-Schema standardmäßig weg. Web-Standard lässt es ebenfalls weg. Ein Profile-, Home- oder Invocation-Patch kann das Tool mit `insert` hinzufügen; ein Patch, das nur `disabled: false` setzt, braucht eine existierende Zeile und kann keine erzeugen. Diese Entscheidung macht nicht alle SDK- und Web-Tools identisch.

## Verification

Die [SDK-Prozess-Tests](../../../../apps/cli/tests/profiles/sdk/keyless-smoke.e2e.ts) erfassen tatsächliche Model-Requests für Default-File-Tools, explizites Editor-Einfügen und das standalone Minimal-Roster. Der [Headless-Prozess-Test](../../../../apps/cli/tests/profiles/headless/tests/keyless-smoke.e2e.ts) prüft den geteilten Default über seine Application. Die aufgezeichneten [Headless](../../../../snapshots/session/headless.snapshot.ts)-, [SDK](../../../../snapshots/sdk/sdk.snapshot.ts)- und [ACP](../../../../snapshots/acp/acp.snapshot.ts)-Sessions pinnen die assemblierten model-sichtbaren Ausgaben, einschließlich der SDK-Fixture, die den Editor explizit einfügt.
