---
description: "Deutsches Sprachpaket für das Web-GUI: registriert die `de`-Locale und ihre Namespace-Dictionaries über den Locale-Service, für Betreiber, die eine Installation lokalisieren."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-locale-de
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Mounte `dsh-client-locale-de`, um Deutsch in der Sprachauswahl des Webclients anzubieten. Das Plugin veröffentlicht die Sprachdefinition `{ id: 'de', label: 'Deutsch', fallback: 'en' }` und trägt `de`-Dictionaries für die ausgelieferten `dsh-client-ui-*`-Namespaces plus `common`/`conversation` bei — alles über die öffentliche `ctx.locale`-Oberfläche. Das Paket ist fork-lokal: Es fügt eine Locale von außen hinzu, statt die eingebauten `LOCALE_IDS` anzufassen, sodass das Upstream-Locale-Plugin unverändert bleibt.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounte es überall dort, wo ein Deployment eine deutsche UI will; zur Laufzeit ist nichts weiter nötig als das Laden des Plugins — die Sprachwahl selbst bleibt unter Settings → General.

### In einer Komposition mounten

Füge die Plugin-Zeile in die `cordis.patch.yml` des Zielprofils ein und deklariere eine `link:`-Abhängigkeit in der `package.json` desselben Profils, damit der Loader den Paketnamen auflöst:

```yaml
- insert: [{"id": "client-locale-de", "name": "@deepseek-ai/dsh-client-locale-de"}]
```

Das Paket akzeptiert keine Konfigurationsfelder; die Sprache wird wählbar, sobald der Client-Tree aktiviert.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Der Client-Plugin-Body deklariert `inject: ['locale']` und läuft mit `immediately: true`: Er registriert die `de`-Sprachdefinition und jedes übersetzte Namespace-Dictionary als eigene Effects über `ctx.locale.addLanguage` und `ctx.locale.register(ns, 'de', dict)`. Die Registrierungsreihenfolge ist irrelevant, weil der Locale-Service Namespace-Maps pro Sprache unabhängig von den `zh`/`en`-Registrierungen des besitzenden Pakets akkumuliert; ein fehlender `de`-Key löst über die deklarierte `en`-Fallback-Kette auf.

| Datei | Rolle |
|---|---|
| `src/index.ts` | Typschnittstelle |
| `src/client/index.ts` | Client-Plugin-Body |
| `src/client/dicts.ts` | Dictionary-Daten (extrahiert aus den generierten Runtime-Dictionaries, die zuvor als Hand-Patch in `release/dsh/node_modules` lagen) |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies den besitzenden Service und die Oberflächen, die dieses Paket lokalisiert:

- [Locale-Service](../locale/README.de.md) — die `ctx.locale`-API, in die dieses Plugin registriert.
- [Client-Gruppenlandkarte](../README.de.md) — die Browser-Hälfte, zu der dieses Paket gehört.
- [Webclient-Architektur](../../../docs/subsystems/web-client.de.md) — wie Client-Plugins in die Shell mounten.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket ein browserseitiges Sprachpaket ist und nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert oder sendet keinen Provider-Request.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>

Diese Einschränkungen beschreiben, was das Paket nicht übersetzt und wo die Abdeckung driftet; sie sind aktuelle Paket-Einschränkungen, kein Aufgabenrückstand.

- **Nur `web`-Plattform-Client-Dictionaries sind abgedeckt** — hostseitige Strings (CLI-Ausgabe, Log-Meldungen, host-gerenderte Prompts) werden nicht übersetzt.
- **Dictionary-Keys driften, wenn Upstream-UI-Pakete Keys hinzufügen** — fehlende Keys fallen per Design auf `en` zurück, sodass eine Upstream-Textänderung still Englisch rendert, bis das Dictionary nachzieht.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Fork-lokales Paket ohne Upstream-Gegenstück; es wird veröffentlicht, indem ein Tarball gepackt und über `overrides` in `release/dsh/package.json` referenziert wird. Nach dem Editieren von `dicts.ts` neu bauen und neu packen — die Laufzeit liefert das kompilierte Bundle aus, und ein stale Build hat zuvor ein Bundle ausgeliefert, in dem eine referenzierte Konstante dem Tree-Shaking zum Opfer gefallen war.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Das Paket trägt nur Dictionaries bei; Key-Abdeckung und Fallback-Auflösung werden durch die Verhaltensspecs des Locale-Service und dieses Pakets abgesichert.
