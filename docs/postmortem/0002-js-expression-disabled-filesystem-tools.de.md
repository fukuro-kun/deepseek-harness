# Postmortem 0002: Filesystem-Snapshot-Tools wurden dauerhaft deaktiviert
[English](0002-js-expression-disabled-filesystem-tools.md) | [中文](0002-js-expression-disabled-filesystem-tools.zh.md) | Deutsch


Status: resolved

## Executive summary

Das ACP-Beispiel versuchte, Filesystem-Plugins bedingt mit `disabled: !!js ...` zu aktivieren, aber Cordis wertet JavaScript-Ausdrücke nur innerhalb von Plugin-`config` aus. Das rohe Ausdrucksobjekt war truthy, daher war der Filesystem-Stack immer deaktiviert. Die Snapshot-Aktualisierung akzeptierte daraufhin `UNKNOWN_TOOL`-Ergebnisse als neue expected outputs. Der Fix verwendet ein explizites Filesystem-Overlay und fügt static-config- und snapshot-result-Guards hinzu.

## Summary

Die Standard-ACP-Komposition ist bewusst nur bash, weil ihre Sandbox in-process-Filesystem-Provider nicht eingrenzen kann. Filesystem-Snapshot-Szenarien benötigen weiterhin `read`, `write` und `edit`, daher wurden diese Plugins in die Standard-`cordis.yml` mit einem `disabled`-Ausdruck aufgenommen, der sie nur für Full-Access-Starts und Snapshots aktivieren sollte.

Cordis Include parste jeden `!!js`-Skalar in ein Ausdrucksobjekt. Der Loader interpolierte rekursiv die `config` des Plugins, verarbeitete aber Entry-Metadaten wie `disabled` direkt. Jeder Filesystem-Eintrag sah daher ein truthy-Objekt und blieb in jedem Modus deaktiviert.

## Impact

Sieben Filesystem-Szenarien und das gemischte Workspace-Edit-Szenario riefen Tools auf, die nicht in der Registry vorhanden waren. Ihre strukturierten Session-Logs enthielten `ToolNotFoundError` mit Code `UNKNOWN_TOOL`, während stdout generische fehlgeschlagene Tool-Karten renderte. Die Snapshot-Suite bestand, weil beide Ausgaben mit den aktualisierten Fixtures übereinstimmten; sie bewies deterministischen Replay der Regression statt korrektem Filesystem-Verhalten.

Die live laufende beschränkte Standardkonfiguration erhielt keinen unerwünschten Filesystem-Zugriff. Ein naiver Interpolations-Fix hätte dieses Risiko erzeugt: Permission-Presets aktualisieren Bash-Sandbox und Approval-Status zur Laufzeit, können aber den Filesystem-Stack nicht mounten, unmounten oder eingrenzen.

## Timeline

- PR #261 konsolidierte ACP-Kompositionen und aktualisierte die Filesystem-Snapshots, während es bedingte Filesystem-Einträge einführte.
- Alle Unit-, Coverage-, Snapshot-, Dokumentations-, Build- und Hygiene-Checks bestanden.
- Die Überprüfung der aktualisierten Filesystem-expected-outputs fand generische fehlgeschlagene Karten und strukturierte `UNKNOWN_TOOL`-Ergebnisse.
- Ein echter Loader-Boot bestätigte, dass jeder `disabled`-Wert ein Ausdrucksobjekt blieb und jeder Filesystem-Fiber fehlte.

## Root cause

Die Implementierung nahm an, dass `!!js` für einen gesamten Loader-Eintrag gilt. Es gilt nur für `entry.options.config`: `Entry._resolveConfig()` interpoliert dieses Feld, während `Entry.disabled` `entry.options.disabled` ohne Interpolation prüft. Der YAML-Tag war syntaktisch gültig, daher erzeugte das Laden keine Diagnose.

Das Snapshot-Framework behandelte jedes deterministische Transcript als gültiges Verhalten. Header-Pins verifizierten die zusammengesetzten Tool-Schemas, aber die Filesystem-Szenarien teilten sich einen Pin aus der Standardkomposition und bewiesen daher nicht unabhängig, dass ihre benötigten Tools registriert waren. Die Aktualisierung schrieb die erwarteten stdout- und Session-Logs um, bevor eine semantische Assertion fehlende Tools ablehnte.

## Guardrails added

- Filesystem-Szenarien booten `fs.cordis.yml`: ein explizites, festes Full-Access-Overlay mit einer gepaarten Replay-Konfiguration und eigener Request-Header-Klasse.
- [`AGENTS.md`](../../AGENTS.md) und der [Cordis-Primer](../cordis-primer.de.md#loader-configuration) stellen fest, dass `!!js` unter Plugin-`config` und Entry-`disabled` gültig ist; andere Entry-Metadaten bleiben literal, daher verwendet bedingte Komposition Overlays.
- `verify-cordis-config` parst Repository-Cordis-YAML und lehnt Ausdrucks-Knoten in Loader-Entry-Metadaten ab, einschließlich Include-Patches und eingefügter Einträge.
- `dsh-session-snapshot` lehnt strukturierte `UNKNOWN_TOOL`-Ergebnisse in frischen Runs und committeten Session-Fixtures ab, bevor sie als expected outputs committet werden können.

## Lessons

- Ein syntaktisch akzeptierter Konfigurationswert wird nicht notwendigerweise an dieser Stelle ausgewertet; dokumentiere und verifiziere genau, welche Felder interpoliert werden.
- Eine Snapshot-Aktualisierung ist Fixture-Produktion, keine Korrektheitsprüfung. Semantische Unmöglichkeiten wie ein fehlendes registriertes Tool benötigen Assertionen unabhängig vom expected output.
- Permission-Controls dürfen nur die Capabilities beschreiben, die sie tatsächlich verwalten. Composition-Time-Filesystem-Zugriff kann nicht sicher einem Runtime-Bash-only-Preset folgen.
