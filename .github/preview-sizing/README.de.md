# PR-Vorschau-Runner-Größen

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Der [Vorschau-Workflow](../workflows/build-preview-cloudflare.yml) baut Pull-Request-Vorschauen auf standardmäßigen GitHub-hosted `ubuntu-24.04`. Runner-Größenvergleich vergleicht die vollständige Job-Kosten, nicht nur den Preis pro Minute oder die Kernanzahl allein.

## Inhaltsverzeichnis

- [Vergleichsanforderungen](#vergleichsanforderungen)
- [Veröffentlichungssemantik](#veröffentlichungssemantik)
- [Dev-Notiz](#dev-notiz)

<a id="vergleichsanforderungen"></a>

## Vergleichsanforderungen

Ein Größenexperiment hält Checkout-SHA, Lockfile, Node- und pnpm-Versionen, Workspace-Build und Vorschau-/VFS-Packing-Befehle konstant. Jeder Runner startet ohne Build-Artefakte. Kalte Installationen stellen keine Abhängigkeits-Caches wieder her; pnpm-Bootstrap-Dateien können bereits existieren. Warme Installationen stellen denselben exakten Cache ohne Prefix-Fallback wieder her. Dokumentieren Sie das tatsächliche Runner-Image, CPU, RAM, Disk, Cache-Ergebnis, Phasen-Dauer, Exit-Status und Peak-Speicher. GNU time Maximum RSS berichtet ein Prozess-Maximum, nicht den gleichzeitigen aggregierten Speicher über den Build-Prozessbaum hinweg.

Berechnen Sie die geschätzten Bruttorechenkosten als Summe der verstrichenen Minuten jedes abgeschlossenen Jobs, aufgerundet, multipliziert mit dem Satz des Runners. Schließen Sie Setup, Cache-Wiederherstellung, Bereinigung, Fehler und Messungs-Upload-Overhead ein. Berichten Sie Seed-Jobs separat. Warteschlangenverzögerung ist eine Latenzbeobachtung, keine ausgeführte Job-Zeit. Diese Schätzungen sind keine Rechnungssummen; Standard-Runner-einbezogene Minuten und Speicher sind separat.

Ein nur-Build-Benchmark deployt nicht, greift nicht auf Cloudflare-Zugangsdaten zu und postet keine Pull-Request-Kommentare. Seine Kosten belegen keine vollständige Vorschau-Veröffentlichungskosten. Bestätigen Sie den ausgewählten Runner durch den tatsächlichen Vorschau-Workflow, bevor Sie Deploy-Latenz und geschütztes-Image-Liefering als verifiziert betrachten.

<a id="veröffentlichungssemantik"></a>

## Veröffentlichungssemantik

Die Runner-Auswahl ändert keine Pull-Request-Ereignisse, pro-PR-Stornierung, unveränderliche Installation, nur-Wiederherstellungs-Abhängigkeits-Caching, vollständigen Workspace-Build, Vorschau-Packing, Sourcemap-Entfernung oder die Vorschau-Seite, die in den Deployment-Root kopiert wird. Cloudflare lädt nur die gebaute Site auf den PR-Branch-Alias hoch. Der geschützte-Image-Check erfordert HTTP 200, keine Transport-Inhaltskodierung und gzip-Magic-Bytes; der URL-Kommentar bleibt idempotent. Dependabot und andere PR-Autoren bleiben auf GitHub-hosted-Maschinen.

<a id="dev-notiz"></a>

## Dev-Notiz

Die [Runner-Entscheidung](../../.agents/notes/implemented/process/2026-09-06-preview-hosted-runner-sizing.de.md) dokumentiert Messungen, Kostenschätzungen und Image-/CPU-Variation. Das nur-Build-Experiment verifiziert keine Produktions-Deployment.
