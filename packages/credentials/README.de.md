---
description: "Package map for the credential capability family: the credential-reference seam, the environment-and-file provider, the authorization flow registry, and how references keep secret values out of configuration."
kind: "package-group"
---

# credentials/ — Credentials und Autorisierung

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die Gruppe `credentials/` lässt die Konfiguration Secrets benennen, statt ihre Werte einzubetten. Verwende `credentials/` zum Speichern, Nachschlagen und Entfernen von Credentials, `credentials-local/` für private Ablage auf der Maschine mit umgebungsbezogenen Overrides pro Lauf, und `authorization/`, wenn das Beschaffen eines Credentials einen Menschen erfordert. Rotierte gespeicherte Werte gelten ab der nächsten Modellanfrage, während `DEEPSEEK_API_KEY=… dsh` für diesen Lauf Vorrang hat. Konfigurationsdateien enthalten nur Credential-Namen; lokale Secret-Werte bleiben nur für denselben OS-Benutzer lesbar.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Drei Pakete stellen das Credential-Feature bereit: eines speichert, schlägt nach und entfernt Secrets zur Laufzeit, während die Konfiguration sie nur benennt; das zweite ist der Standard-Speicher auf der Maschine; das dritte lässt Plugins Credentials beschaffen, die erfragt werden müssen. Ihre READMEs decken den Alltagsgebrauch ab; die Subsystem-Referenz besitzt die erschöpfenden Verträge.

| Paket | Rolle | ctx-Schlüssel |
|---|---|---|
| [`credentials/`](credentials/README.de.md) | Secrets zur Laufzeit speichern, nachschlagen und entfernen, während die Konfiguration sie nur benennt | `ctx.credentials` |
| [`credentials-local/`](credentials-local/README.de.md) | Der Standard-Speicher auf der Maschine: eine private YAML-Datei, Umgebungs-Overrides gewinnen | registriert `ctx.credentials` |
| [`authorization/`](authorization/README.de.md) | Plugin-eigene Flows, die ein Credential durch Fragen eines Menschen beschaffen | `ctx.authorization` |

-----

<a id="related-documentation"></a>
## Verwandte Dokumentation

Beginne mit der Subsystem-Referenz für das gemeinsame Vokabular, dann der Capability-seam-Tabelle und der Konfigurationsfläche des lokalen Speichers.

- [Credentials-Subsystem-Referenz](../../docs/subsystems/credentials.de.md) — `CredentialRef` und `CredentialKey`, Auflösung pro Operation, UI-sicheres `CredentialInfo`, Autorisierungsflows und die generierte Cordis-Fläche.
- [Capability seams](../../docs/capability-seams.de.md) — die Service-Definition-/Service-Provider-/Consumer-Aufteilung, der diese Familie folgt.
- [Generierter Konfigurationskatalog](../../docs/config-catalog.de.md#deepseek-aidsh-credentials-local) — jedes akzeptierte Feld des lokalen Speichers.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
