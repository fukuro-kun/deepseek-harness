---
description: "Die boot-Paketgruppe: wie dsh-App-Bins starten — Environment-Laden, Profile- und Patch-Layer, klare Startfehler und app-seitige Kommandozeilen."
kind: "package-group"
---

# boot/ — gemeinsamer Boot-Klebstoff für App-Bins

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die boot-Gruppe stellt bereit, was jeder dsh-App-Bin zum Starten braucht: `app-boot` verwandelt ein `cordis.yml` samt Environment und Patch-Layern in eine laufende App mit klaren Fehlermeldungen, und `cmdline` lässt die App ihre Kommandozeilen-Flags und `--help` selbst besitzen. Mit diesen Paketen kannst du `dsh` ausführen oder eine neue Anwendung oder ein Test-Fixture schreiben, die auf dieselbe Weise startet. Beide sind Bibliotheken, die von `apps/cli` und Test-Loader-Fixtures importiert werden — niemals Plugins, die eine Komposition lädt. Diese Seite kartiert die Gruppe; das pro-Paket-Vertrag regelt das jeweilige Paket-README.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Zugehörige Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`app-boot`](app-boot/README.de.md) | Startet eine dsh-App aus einem `cordis.yml`: lädt `.env`, wendet Profile- und Patch-Layer an und meldet Startfehler klar | (Bibliothek für die Bins) |
| [`cmdline`](cmdline/README.de.md) | Lässt die App ihre Flags, `--help` und den Exit-Code besitzen; reicht alles nach den Flags des Launchers unverändert durch | `cmdlineArgs`, `appExit` |

<a id="related-documentation"></a>
## Zugehörige Dokumentation

- [dsh-App](../../apps/cli/README.de.md) — der `dsh`-Bin, der diese Helfer für seine Boot-Sequenz nutzt.
- [Profile-Bundles](../bundle/README.de.md) — installierbare Patch-Layer, die `dsh --profile`-Kompositionen einhängen.
- [dsh-home-paths](../util/home-paths/README.de.md) — der Harness-Home-Resolver, auf dem beide Pakete aufbauen.
- [dsh-cmdline](cmdline/README.de.md) — wie eine App ihre Flag-Familie statt dem Launcher besitzt.

<a id="dev-note"></a>
## Dev Note

Keine.
