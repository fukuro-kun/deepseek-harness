---
description: "Lokalisierung für die Web-GUI: die zh/en-Präferenz, Browser-abgeleiteter Fallback, typisierte Namespace-Dictionaries und der Framework-Übersetzungssitz — für Benutzer und Plugin-Autoren."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-locale
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Nutze `dsh-client-locale`, um die Web-GUI zwischen den ausgelieferten englischen und chinesischen Locales oder von Client-Plugins hinzugefügten Sprachen umzuschalten. Benutzerwahlen greifen sofort; Loopback-Seiten persistieren sie in `$DSH_HOME/settings.yaml`, während Nicht-Loopback-Seiten sie nur für den laufenden Prozess behalten. Neue Browser nutzen die erste unterstützte Sprache, die der Browser anfordert, bis eine erlaubte gespeicherte Präferenz eintrifft. Plugin-Autoren fügen typisierte Namespace-Dictionaries hinzu und übersetzen über die öffentliche Locale-API; über Slots gerenderte Texte aktualisieren sich ohne Reload.

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

Nutze es überall, wo die Web-GUI einen Sprachwechsel oder übersetzte Texte braucht: Die ausgelieferte Settings-Zeile deckt Benutzer ab, und Plugin-Autoren registrieren eigene Dictionaries. Zum Mounten ist keine Konfiguration nötig — das Paket aktiviert sich mit dem Client-Baum.

### Eine Sprache wählen

Öffne Settings → General und wähle eine registrierte Sprache. Die aktive Locale wird sofort angewendet: Der UI-Text wechselt, `<html lang>` zeigt auf die externe ID oder den eingebauten Dokument-Tag, und die Wahl wird in die dauerhafte Settings-Sektion geschrieben. Ein Browser ohne explizite Host-Präferenz wählt die erste registrierte Sprache, die `navigator` per vollem Tag und dann per Primary-Subtag matcht, mit Fallback auf Englisch. Eine gespeicherte externe Locale wartet auf die Registrierung ihrer Definition, statt aktiv zu werden, solange sie unverfügbar ist.

### Ein Dictionary registrieren

Rufe `ctx.locale.register(ns, { zh, en })` mit einem Namespace auf, der in `LocaleNamespaceMap` gemerged ist; der Compiler prüft jeden Key gegen die typisierte Key-Union des Namespaces und verlangt beide ausgelieferten Locales. Consumer übersetzen über `ctx.locale.bind(ns)` oder den vom Framework injizierten `t`-Sitz. Ein Dictionary, das registriert wird, nachdem die UI bereits gemountet ist, wird ohne Remount aufgenommen.

### Ein Language Pack registrieren

Ein externes Client-Plugin registriert die Sprachdefinition und jeden übersetzten Namespace als eigene Effects; Definitionen und Dictionaries können in beliebiger Reihenfolge registriert werden:

```js
export const inject = ['locale']

export function apply(ctx) {
  ctx.effect(
    () => ctx.locale.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' }),
    'my-locale: language',
  )
  ctx.effect(
    () => ctx.locale.register('common', 'ja', {
      cancel: 'キャンセル',
      close: '閉じる',
    }),
    'my-locale: common dictionary',
  )
}
```

Eine externe ID ist ein nicht-leerer ASCII-Tag im BCP-47-Stil. Sein Fallback muss bereits registriert sein, und die Kette muss bei `en` enden; unbekannte Ziele, doppelte IDs und Zyklen schlagen bei der Registrierung fehl. Die Suche durchläuft die Fallback-Kette im angeforderten Namespace, wiederholt sie in `common` und zeigt dann den Key an. Das Entladen einer Definition entfernt sie aus der Auswahl und lässt eine aktive Wahl auf die verfügbare Browser-/Default-Locale zurückfallen.

### Was die Host-Hälfte tut

Der Host persistiert die Präferenz über den Settings-Service auf Loopback-Seiten. Der Client entzieht Nicht-Loopback-Seiten diesen Settings-Scope bewusst, sodass ihre Locale-Wahl prozess-lokal bleibt, obwohl Connection jede API-Methode authentifiziert.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie der Locale-Service gebaut ist; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Ein `LocaleRuntime` besitzt die Präferenz und die Dictionary-Registry und ist selbst das `LocaleFace` des Slot-Systems: `getSnapshot`/`subscribe` tragen den vom Framework injizierten `t`-Sitz über `ctx.slots.installLocale`. Der immutable Snapshot trägt die aktive Locale, die wählbaren Locales und eine monotone Revision; Dictionary-Registrierung und Locale-Wechsel schieben die Revision voran, aber nur ein Wechsel emittiert das `locale/change`-Event. Produktseitig verfasster Client-UI-Text muss über diese typisierten Dictionaries oder ein bereits lokalisiertes Primitive-Prop eingehen; `verify-client-ui-i18n` erzwingt diese Quell-Eigentümerschaft ([Entscheidung](../../../.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.de.md)).

### Präferenz-Auflösung

Die provisorische Locale kommt vom Browser (`navigator.languages`, gematcht per vollem Tag und dann per Primary-Subtag, Englisch als Fallback) und steht ein, bis der erlaubte Host-gestützte Settings-Scope seine gespeicherte Präferenz liefert. Das Host-Lesen läuft nach der Plugin-Aktivierung, sodass ein unverfügbarer oder vorenthaltener Settings-Scope die Seite nicht blockieren kann, und das Ergebnis ersetzt den provisorischen Wert live. Eine gespeicherte externe Locale wartet auf die Registrierung ihrer Definition. `setLocale` ist der einzige Schreib-Einstieg; es persistiert selbst dann, wenn die ID bereits mit der aktiven Locale übereinstimmt, weil der aktive Wert provisorisch sein kann und einen anderen Browser überleben muss, der dasselbe Home teilt.

### Dictionary-Suche

Die typisierte Objektform verlangt vollständige Dictionaries für beide eingebauten Locales. Die Per-Locale-Form erlaubt Language Packs, jeden Namespace unabhängig zu registrieren. Pro Key durchläuft die Suche die deklarierte Fallback-Kette der aktiven Sprache im angeforderten Namespace, wiederholt diese Kette in `common` und zeigt dann den Key selbst an. Gebundene Übersetzungsfunktionen behalten eine stabile Identität pro Namespace, sodass sie auf Inject-Oberflächen mitfahren können, ohne Memoization zu brechen.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | `LocaleRuntime`, Dictionary-Registry, Language-Zeilen-Registrierung, `locale/change`-Event |
| [`src/index.ts`](src/index.ts) | Node-Hälfte: registriert den `locale`-Settings-Namespace |
| [`src/locale-settings.ts`](src/locale-settings.ts) | Das dauerhafte Schema für `locale.preference` |
| [`src/locales/`](src/locales/) | Die ausgelieferten `zh`/`en`-Dictionaries |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Locale-Contract nicht ausreicht: das Slot-Face, das er implementiert, die Settings-Oberfläche, auf der er reitet, und die Persistenz-Entscheidung hinter der Präferenz.

- [Client-Slot-System](../ui-slots/README.de.md) — das Slot-Modell und der `LocaleFace`-Sitz, den dieses Paket implementiert.
- [Host-gestützte-Präferenzen-Entscheidung](../../../.agents/notes/implemented/bug-fix/2026-08-06-host-backed-web-preferences.de.md) — warum die Präferenz in den Host-Settings statt im Browser persistiert.
- [Settings-Gruppenkarte](../../settings/README.de.md) — der Settings-Service, der die Präferenz speichert.
- [Client-Gruppenkarte](../README.de.md) — die Browser-Hälfte, zu der dieses Paket gehört.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da der Locale-Service eine browserseitige UI-Plugin-Schicht ist, die nichts Model-zugewandtes registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket stellt weder einen Provider-Request zusammen noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo die Lokalisierung unvollständig oder zur Registrierungszeit eingefroren ist. Sie sind aktuelle Paket-Constraints, kein Aufgabenstapel.

- **Registry-gehaltener Text liest seine Übersetzung einmal** — Text, der zur Registrierungszeit außerhalb des Slot-Render-Pfads erfasst wird (z. B. die `/model`-Befehlsbeschreibung in der Command-Registry), behält die Sprache, unter der er registriert wurde, bis zur erneuten Registrierung; über Slots gerenderter Text folgt Wechseln live.
- **Language Packs besitzen sprachspezifisches Verhalten** — die Registry liefert Auswahl, Persistenz, Browser-Matching, Key-Fallback und `<html lang>`; sie fügt keine Pluralregeln oder bidirektionales Layout hinzu.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Der Locale-Katalog und die Dictionaries haben keine unabhängige Laufzeitquelle zum Vergleichen; Registrierungs-Disposal, Präferenz-Auflösung und Fallback-Suche werden durch Behavior-Specs abgesichert.
