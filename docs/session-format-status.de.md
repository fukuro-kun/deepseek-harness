# Session-Format-Version und Release-Status

[English](session-format-status.md) | [中文](session-format-status.zh.md) | Deutsch

## Summary

Diese Referenz unterscheidet die Session-Writer-Version des Checkouts vom neuesten veröffentlichten Session-Format. Die Code-Konstante besitzt die Writer-Version; der Release-Record unten besitzt das neueste veröffentlichte Format und seine Veröffentlichungsevidenz. Andere Dokumentation verlinkt hierauf, anstatt zu wiederholen, welche Version aktuell, als nächstes oder unveröffentlicht ist.

## Table of Contents

- [Sources of truth](#sources-of-truth)
- [Release record](#release-record)
- [Updating the record](#updating-the-record)
- [Dev Note](#dev-note)

<a id="sources-of-truth"></a>
## Sources of truth

- **Checkout-Writer:** `SESSION_FORMAT_VERSION` in [core Session types](../packages/core/session/src/types.ts) ist die einzige handgewartete aktuelle Writer-Nummer im Code. Der [Catalog-Generator](../scripts/gen-session-format-catalog.ts) leitet Codec-Sortierung ab und prüft, dass benachbarte Migrationen ihn erreichen. Eine Paketversion, ein Codec-Export-Name, ein Fixture-Dateiname oder eine Projektions-Cache-Version sind nicht die Writer-Autorität.
- **Neuestes veröffentlichtes Format:** `latestReleasedVersion` im folgenden Record identifiziert das veröffentlichte Session-Format. `evidenceTag` benennt ein veröffentlichtes Produkt-Release, dessen getaggter Writer diesen Wert hat; es muss nicht das erste Release sein, das das Format trägt. Die zweisprachige Kopie wird gegen denselben Record geprüft, nicht als separate Entscheidung gepflegt.
- **Release-Status:** Vergleiche die Writer-Konstante mit dem verifizierten Release-Record. Gleichheit bedeutet, dass das Writer-Format veröffentlicht wurde. Eine höhere Writer-Version ist ein Entwicklungsziel jenseits des aufgezeichneten Releases. Beim Vergleich eines älteren Checkouts gegen den verifizierten Record eines neueren Branchs identifiziert eine niedrigere Writer-Version ein älteres Writer-Format; das lokale Konsistenz-Gate lehnt diese Reihenfolge innerhalb eines Checkouts ab. Es wird keine separate Released-Boolean gepflegt. Bevor eine höhere Version als unveröffentlicht deklariert wird, verifiziere, dass kein veröffentlichtes Release den Record fortgeschritten hat.

Eine Alpha-, Beta- oder Release-Candidate-Produktveröffentlichung begründet veröffentlichte Session-Format-Verpflichtungen. GitHubs Prerelease-Flag macht persistierte Nutzerdaten nicht verwerfbar. Ein fehlender Release-Record ist kein Beweis für Nicht-Veröffentlichung. Die [Versioning-and-Authority-Entscheidung](../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.de.md) besitzt Kompatibilitätsentscheidungen; [Released-Format-Migration](../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.de.md) besitzt unveränderliche Generationen und benachbarte Konvertierung.

<a id="release-record"></a>
## Release record

```yaml session-format-release
latestReleasedVersion: 3
evidenceTag: dsh-v0.1.5-alpha.1
```

Evidenz: [veröffentlichtes Release](https://github.com/deepseek-harness/deepseek-harness/releases/tag/dsh-v0.1.5-alpha.1) und [dessen getaggte Writer-Quelle](https://github.com/deepseek-harness/deepseek-harness/blob/dsh-v0.1.5-alpha.1/packages/core/session/src/types.ts).

<a id="updating-the-record"></a>
## Updating the record

Wenn eine strukturelle Writer-Änderung implementiert wird, aktualisiere die Code-Konstante und den benachbarten Catalog zusammen; rücke diesen Release-Record nicht vor der Veröffentlichung vor. Wenn ein Produkt-Release erstmals ein höheres Session-Format veröffentlicht, bestätige die Veröffentlichung und deren getaggten Writer, rücke dann diesen Record und beide Evidenz-Links in derselben zweisprachigen Aktualisierung vor. Spätere Produkt-Releases, die dasselbe Format tragen, erfordern keine Änderung des Records. Senke ihn niemals auf dem Development-Trunk.

Der [Dokumentationsstandard-Test](../scripts/doc-standard.spec.ts) prüft Record-Struktur, zweisprachige Gleichheit, Evidenz-Link-Konsistenz und dass das dokumentierte Release den Checkout-Writer nicht überschreitet. Dieser schlüssellose Check fragt GitHub nicht ab und beweist nicht, dass der Record aktuell ist; Veröffentlichungsverifikation bleibt Teil des Release-Updates.

Verwende „current format" und „next adjacent version" für allgemeines Verhalten. Behalte explizite Nummern für feste Migrations-Inputs und -Outputs, Wire-Schemas, historische Evidenz und Tests dieser bestimmten Versionen. Das [Format-Version-Cookbook](cookbook/adding-a-session-format-version.de.md) verwendet N für das verifizierte neueste veröffentlichte Format und N+1 für seinen Nachfolger.

<a id="dev-note"></a>
## Dev Note

None.
