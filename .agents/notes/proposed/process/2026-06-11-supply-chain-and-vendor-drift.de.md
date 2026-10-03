# Agent Note: Supply-Chain-Prüfungen und Vendor-Drift-Verifikation

Status: proposed

[English](2026-06-11-supply-chain-and-vendor-drift.md) | [中文](2026-06-11-supply-chain-and-vendor-drift.zh.md) | Deutsch

## Problem

Das Vendor-Manifest ([die Vendoring-Entscheidung](../../archived/process/2026-06-11-vendor-cordis-as-source.md)) wird zum Commit-Zeitpunkt in *vorwärts* Richtung erzwungen (Vendored-Änderung ⇒ Manifest-Update), aber nichts verifiziert die *Aussagen* des Manifests: dass vendor/ tatsächlich dem upstream-at-SHA plus exakt den protokollierten Modifikationen entspricht. Und die Handvoll echter npm-Abhängigkeiten hat weder Advisory-Monitoring noch einen Update-Rhythmus.

## Vorschlag

1. **Vendor-Drift-Check** (nächtliche CI): die upstream-Repos auf den Manifest-SHAs (shallow) klonen, die entsprechenden Package-Quellen kopieren und mit `vendor/*/src` diffen. Der Job schlägt fehl, es sei denn, der Diff entspricht den protokollierten lokalen Modifikationen (als eingecheckte Patch-Datei pro Modifikation aufbewahrt — die Log-Einträge werden zu verifizierbaren Artefakten statt zu Prosa).
2. **Abhängigkeits-Advisories**: osv-scanner- (oder `pnpm audit`-)Job auf dem Lockfile, geplant + auf PRs, die das Lockfile berühren.
3. **Lizenz-Inventar**: ein Skript, das assertet, jedes vendorierte Package trägt seine LICENSE und dass die package.json-`license`-Felder dem Inventar in vendor/README.md entsprechen (wir mischen vendoriertes MIT mit unserem BSD-3) — CI-Schritt.
4. **Renovate** (oder ein geplanter agent-Auftrag), der npm-Abhängigkeits-Updates in kleinen PRs vorschlägt, die die volle Gate-Suite durchlaufen; vendorierte Packages sind ausgeschlossen (deren Updates folgen dem Manifest-Sync-Verfahren, idealerweise als halbautomatisierter agent-Workflow: upstream holen, Patches neu anwenden, Gates ausführen, PR mit aktualisiertem Manifest-Tabellenstand öffnen).

## Plan

3 ist trivial — zuerst tun. 1 erfordert Netzwerkzugriff von CI auf die upstream-Repos (privat — benötigt ein Token) und die Umwandlung der beiden bestehenden protokollierten Modifikationen in Patch-Dateien. 2 und 4 sind Konfiguration.

## In Erwägung gezogene Alternativen

- **`pnpm audit` statt osv-scanner** — beide erfüllen die Advisory-Scanning-Form; die Wahl wird auf die Implementierung verschoben.
- **Ein geplanter agent-Auftrag statt Renovate** — äquivalent für das Vorschlagen kleiner Update-PRs, die die volle Gate-Suite durchlaufen; vendorierte Packages bleiben in beiden Fällen ausgeschlossen (deren Updates folgen dem Manifest-Sync-Verfahren).

## Akzeptanzkriterien

- Das Lizenz-Inventar-Skript läuft in CI und schlägt fehl bei fehlender LICENSE oder einem `license`-Feld, das dem Inventar in `vendor/README.md` widerspricht.
- Der nächtliche Drift-Job rekonstruiert `vendor/` aus den Manifest-SHAs plus eingecheckten Patch-Dateien und schlägt fehl bei jedem unerklärten Diff.
- Advisory-Scanning läuft auf dem Lockfile nach Plan und auf PRs, die das Lockfile berühren.

## Risiken

Upstream-Repos sind private Spiegel; CI-Credentials und Verfügbarkeit sind der Hauptwiderstand für den Drift-Check. Falls blockiert, als lokaler geplanter agent-Auftrag statt CI ausführen.
