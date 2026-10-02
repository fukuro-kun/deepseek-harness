---
description: "Paketkarte für geteilte Utilities: atomare Dateischreibvorgänge, gebrandete Ids, Deques, JSON-Werte, Harness-Home-Pfade, Startumgebung, native Befehle, Ausgabeaufbewahrung, Zeitzonen und Timeouts."
kind: "package-group"
---

# util/ — geteilte Utilities

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Die Gruppe `util/` stellt capability-Paketen geteilte mechanische Primitive bereit, statt Implementierungen zu duplizieren. Sie deckt atomare Schreibvorgänge, gebrandete Ids, Deques, verlustfreie JSON-Werte, UUIDs, Harness-Home-Pfade, Startumgebungen, ausgehende Proxy-Politik, native Befehle, Ausgabeaufbewahrung, Zeitzonen-Kanonisierung und Timeout-Behandlung ab. Jeder Wurzel-Eintrag hier ist eine Bibliothek: Er registriert keinen Produkt-service und kein Ereignis, und die konsumierende capability behält die fachliche Semantik.

## Inhaltsverzeichnis

- [Pakete](#packages)
- [Zugehörige Dokumentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Pakete

Jedes Paket stellt ein Primitiv bereit; die jeweilige Paketseite erklärt die Verwendung.

| Paket | Aufgabe |
|---|---|
| [`brand/`](brand/README.de.md) | Nominale String-Typen und ihr zustandsloser Konstruktor |
| [`package-manifest/`](package-manifest/README.de.md) | Geteilte TypeScript-Deklarationen für Package-manifests |
| [`crypto/`](crypto/README.de.md) | Erzeugt RFC-9562-v4-UUIDs aus dem runtime-übergreifenden Primitiv `crypto.getRandomValues` |
| [`deque/`](deque/README.de.md) | Stellt amortisiert konstante Queue-Operationen mit begrenztem Leerspeicher bereit |
| [`chunked-list/`](chunked-list/README.de.md) | Hält unveränderliche Listenversionen mit begrenztem Anfüge-Kopieren und Checkpoint-Validierung vor |
| [`values/`](values/README.de.md) | Validiert, snapshotet, vergleicht und friert verlustfreie JSON-kompatible Werte ein |
| [`home-paths/`](home-paths/README.de.md) | Löst das eine Harness-Home auf und verbindet geteilte Benutzerdaten-Pfade |
| [`http-proxy/`](http-proxy/README.de.md) | Löst eine ausgehende Proxy-Politik auf und installiert sie für `fetch`, SDK-agents und gespawnte Kinder |
| [`launch-environment/`](launch-environment/README.de.md) | Eingefrorene Startumgebung, die sich merkt, welche Schicht jeden Wert geliefert hat |
| [`atomic-write/`](atomic-write/README.de.md) | Atomarer Dateiersatz und prozessübergreifendes Writer-Locking |
| [`native-command/`](native-command/README.de.md) | Führt host-native Befehle direkt aus, niemals über einen Shell-String |
| [`workspace-path/`](workspace-path/README.de.md) | Stellt browsersichere Workspace-Pfad- und Anzeige-Helfer bereit |
| [`output-retention/`](output-retention/README.de.md) | Begrenzt modell-seitige Ausgabe und meldet exakte Auslassungs-Metadaten |
| [`time/`](time/README.de.md) | Validiert und kanonisiert eine vom Aufrufer gemeldete IANA-Zeitzone |
| [`timeout/`](timeout/README.de.md) | Deadline-Arithmetik, Signal-Fusion und Timeout-gegen-Abbruch-Klassifikation |

-----

<a id="related-documentation"></a>
## Zugehörige Dokumentation

- [Root-Paketkarte](../README.de.md) — wo `util/` unter allen Paketgruppen sitzt.
- [Generierter Konfigurationskatalog](../../docs/config-catalog.de.md) — der Bibliotheks-Paket-Index, zu dem diese Gruppe gehört.
- [Cookbook „Paket hinzufügen"](../../docs/cookbook/adding-a-package.de.md) — wie ein neues geteiltes Primitiv in dieser Gruppe landet.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
