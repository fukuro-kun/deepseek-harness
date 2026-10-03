# Agent Note: Gepflegte Abhängigkeiten der Eigenimplementierung vorziehen

Status: implemented

[English](2026-07-26-dependencies-over-hand-rolling.md) | [中文](2026-07-26-dependencies-over-hand-rolling.zh.md) | Deutsch

## Problem

Der Harness implementiert von Hand viel Infrastruktur, die ausgereifte externe Pakete längst bereitstellen. Einiges davon ist beabsichtigt — vendortes Cordis ([Vendoring-Entscheidung](../../archived/process/2026-06-11-vendor-cordis-as-source.md)), die [zwei LLM-Adapter](../architecture/2026-06-13-twin-llm-adapters.de.md), schemastery als Config-Schema-Standard — doch vieles sammelte sich aus einem unformulierten „keine neuen Abhängigkeiten"-Reflex an: Die repositoryweite Liste externer Abhängigkeiten blieb winzig, während die Pakete eigene SSE-Parser, Protokoll-Framer, Retry-Schleifen und Glob-Matcher ausbildeten. Nichts in `AGENTS.md` legte je eine Abhängigkeitsregel fest, also leiteten Agents eine aus dem bestehenden Muster ab — und die abgeleitete Regel („keine Deps hinzufügen") ist strenger, als irgendjemand beschlossen hat. Das ist die Not-Invented-Here-Fehlschluss im Default-Betrieb: Jeder handgeschriebene Klon einer gut gepflegten Bibliothek ist Code, den wir selbst testen, dokumentieren, reviewen und debuggen, ohne eine einzige der im Ökosystem angesammelten Edge-Case-Korrekturen.

## Entscheidung

Eine externe Abhängigkeit einzuführen ist eine legitime Vereinfachung, keine Policy-Ausnahme. Wenn ein gut gepflegtes Paket (oder ein Node-Builtin an unserer Engine-Untergrenze) eine handimplementierte Fläche abdeckt, ist das Ersetzen des Handcodes die bevorzugte Richtung — unter demselben Evidenzstandard wie jede andere Vereinfachung: Der Tausch muss das, was wir besitzen, tatsächlich verkleinern — Code, Tests und Vertragsfläche — statt Komplexität nur hinter einen Wrapper zu verlagern.

Die Latte für eine neue Abhängigkeit:

- **Netto-Löschung.** Die Abhängigkeit ersetzt realen eigenen Code (Implementierung + dedizierte Tests + Doku), nicht hypothetischen zukünftigen Code. Eine Dep, die nur Fähigkeiten hinzufügt, ist eine Feature-Entscheidung, keine Vereinfachung.
- **Gesundheit.** Aktiv gepflegt, weit verbreitet, vernünftiger transitiver Fußabdruck. Ein winziges ungepflegtes Paket tauscht unseren Code nur gegen jemandes aufgegebenen Code.
- **Passung an der Grenze.** Die Semantik des Pakets deckt unseren tatsächlichen Vertrag ab; Restsemantik, die wir weiterhin darum herum von Hand implementieren, geht gegen den Tausch.
- **Keine entschiedene Seam.** schemastery (Config-Schemas), vendortes Cordis, die `@earendil-works`-Zwillinge und andere in implementierten Agent Notes festgehaltene Entscheidungen werden durch diese Regel nicht wiedereröffnet; ein Tausch, der ein festgehaltenes Design einreißt, muss die festgehaltene Begründung schlagen, nicht nur diese Note zitieren.

Die „Null-Abhängigkeiten"-Charta von `packages/util/` beschreibt die *Export*-Disziplin dieser Gruppe — util-Pakete bleiben frei von Harness-Abhängigkeiten, damit jede Gruppe von ihnen abhängen kann — und verbietet keine externen Pakete, wo sie vereinfachen; ein util-Paket, dessen gesamte Aufgabe ein gepflegtes externes Paket besser erfüllt, sollte durch die Abhängigkeit ersetzt werden, nicht um der Charta willen bewahrt.

Abhängigkeits-Tauschvorschläge werden wie jede andere Entfernung als `proposed/simplification`-Agent-Notes festgehalten, mit Angabe des Kandidatenpakets, der löschbaren Fläche, der Restsemantik und der Supply-Chain-Aspekte. Der [Supply-Chain-Vorschlag](../../proposed/process/2026-06-11-supply-chain-and-vendor-drift.de.md) trägt Advisory-Scanning und Update-Kadenz für die Abhängigkeitsliste, die diese Regel wachsen lässt.

## Erwogene Alternativen

- **Die implizite Keine-neuen-Deps-Kultur beibehalten.** Abgelehnt: Sie war nie eine festgehaltene Entscheidung, und ihre Kosten sind konkret — handgeschriebener Protokoll- und Parsing-Code dupliziert kampferprobte Bibliotheken, bläht die Pro-Datei-Coverage-Last auf und bremst jeden Reviewer, der Edge-Cases neu herleiten muss, die das Ökosystem längst behoben hat.
- **Eine harte Allowlist genehmigter Pakete.** Abgelehnt: Das Repository ist pre-release und die Abhängigkeitsmenge klein; eine pro-PR-Evidenzlatte (Netto-Löschung, Gesundheit, Passung) plus Review hält das Urteil dort, wo der Kontext ist, ohne ein ständiges Komitee-Artefakt, das selbst gepflegt werden müsste.
- **Jede neue Abhängigkeit wie Cordis vendoren.** Abgelehnt: Vendoring ist für Pakete, die wir patchen oder gegen Upstream-Änderungen pinnen müssen ([Vendoring-Entscheidung](../../archived/process/2026-06-11-vendor-cordis-as-source.md)); es pauschal anzuwenden erschafft die Pflegelast neu, die die Abhängigkeit abwerfen sollte. Gewöhnliche npm-Abhängigkeiten mit Lockfile-Pinning sind der Standard.

## Konsequenzen

- Agents und Beitragende, die nach Vereinfachungen suchen, behandeln „ersetze handgeschriebenes X durch Paket Y" nun als legitimes Ergebnis; [dsh-find-simplifications](../../../skills/dsh-find-simplifications/SKILL.md) trägt die entsprechende Anleitung.
- Die Abhängigkeitsliste wird wachsen, und mit ihr die Supply-Chain-Angriffsfläche; die Gegenmaßnahmen stehen im [Supply-Chain-Vorschlag](../../proposed/process/2026-06-11-supply-chain-and-vendor-drift.de.md), den diese Regel dringlicher macht.
- Das Root-`AGENTS.md` trägt die Ein-Zeilen-Regel; diese Note trägt Begründung und Latte.
