# Agent Note: Publizierte Dependency-Faces und begrenzte Peer-Relays

Status: implemented

[English](2026-08-26-published-dependency-faces.md) | [中文](2026-08-26-published-dependency-faces.zh.md) | Deutsch

## Problem

Ein Paket kann ein Browser-Bundle, einen Host-Entry, geteilte TypeScript-Deklarationen und Cordis-Injection-Metadaten enthalten. All diese Beziehungen als erforderliche npm-Peers zu kodieren, machte den publizierten CLI teuer zu installieren: npm installiert Peers automatisch und evaluiert Placement wiederholt über tiefe, konvergierende Peer-Pfade. Ranges zu ändern oder die Peers optional zu machen, beseitigte diese Traversierung nicht.

Das Paket, das einen Client-Build-Input wählt, ist das ausgelieferte Profil, während ein Host-Value-Import von Node aus dem importierenden Paket geladen wird. Diese Beziehungen brauchen verschiedene npm-Sektionen. Eine Regel auf jedes Host-Paket anzuwenden, würde den Graphen verkleinern, aber auch eine große Migration ohne entsprechenden Installationsgewinn erzeugen.

## Entscheidung

### Paketauswahl

[`verify-package-dependencies`](../../../../scripts/verify-package-dependencies.ts) besitzt die Dependency-Section-Policy. Es deckt immer Pakete unter `packages/client/` ab und jedes nicht-experimentelle Paket, das `dsh.client` deklariert. Innerhalb des Verzeichnisses markiert `dsh.client` ein Client/Host-Paket, dessen Host-Entry gescannt wird; ein Paket ohne diese Deklaration ist ein Client-only statischer Build-Input. Außerhalb des Verzeichnisses wählt `dsh.client` denselben Client/Host-Scan. Ein `"./client"`-Export allein ist eine API und wählt keine npm-Dependency-Policy.

[`package-dependency-policy.ts`](../../../../scripts/package-dependency-policy.ts) liefert explizite Client-Face-Include- und -Exclude-Listen. Ein Include behandelt ein Ausnahmepaket ohne `dsh.client`, während ein Exclude ein automatisch entdecktes Dual-Face-Paket außerhalb von `packages/client/` entfernt. Der Verifier lehnt unbekannte, stale, redundante, doppelte, überlappende und wirkungslose Einträge ab. Die Include-Liste ist leer; die Exclude-Liste enthält `@deepseek-ai/dsh-api-session-controller` und `@deepseek-ai/dsh-api-workspace-controller`. Session Controller zurückzunehmen würde neun weitere Host-Kanten migrieren, während sein Fünf-Run-Kandidaten-Retest die Median-Resolution nur um 0,15 Sekunden verbesserte.

Host-only-Pakete treten derselben Policy über eine separate explizite Liste bei. Die Liste enthält `@deepseek-ai/dsh-llm` und `@deepseek-ai/dsh-session`; Source-Imports erweitern sie nicht.

### Dependency-Sektionen

Jedes abgedeckte Paket hält `@deepseek-ai/cordis` in matchenden `peerDependencies` und `devDependencies`. Cordis ist die geteilte Plugin-Runtime, deren Identität die Anwendung kontrolliert.

Ein Workspace-Paket, das über einen Runtime-Value-Import aus der Host-Entry-Closure erreicht wird, gehört nur dann ausschließlich in `dependencies`, wenn sein vollständiger Runtime-Entry in `duplicateSafePackages` gelistet ist oder jeder importierte Runtime-Export in `safeHostDependencyExports` steht. Die Paket-Level-Liste enthält `@deepseek-ai/dsh-brand`, `@deepseek-ai/dsh-typert-protocol`, `@deepseek-ai/dsh-util-crypto` und `@deepseek-ai/dsh-util-values`: Ihre Werte sind zustandslos, strukturell erkannt oder über versionierte interoperable Deskriptoren gespeichert. Die Export-Tabelle behandelt reviewte Werte aus Paketen, deren übrige Exports dieselbe Garantie nicht geben können.

Ein Export, dessen Konstruktor-Identität oder Modulzustand geteilt werden muss, steht in `peerRequiredHostExports`; der Import eines solchen Exports hält die gesamte Paketkante in matchenden `peerDependencies` und `devDependencies`. Jeder Export-Table-Key ist ein exakter Module-Specifier und jeder Wert ein reviewtes Export-Set. Der Verifier folgt Runtime-Local-Imports vom Host-Entry, zeichnet Named- und Default-Imports und Re-Exports auf und lehnt Exports ab, die weder die Paketliste noch eine Export-Tabelle abdecken; Namespace-, Dynamic- und Side-Effect-Imports bleiben unbegrenzt, es sei denn, der vollständige exakte Entry ist paket-klassifiziert.

Workspace-Imports, die das Client-Bundle nutzt, Type-only-Imports, Module-Augmentations, `dsh.client.inject` und bestehende Metadata-only-Peers gehören ausschließlich in `devDependencies`. Host-Runtime-Imports, einschließlich zusätzlicher Node-Entries, folgen der Host-Klassifikation. [Browser-Third-Party-Build-Inputs](2026-09-08-browser-third-party-build-inputs.de.md) regelt gewöhnliche Third-Party-Deklarationen; es ersetzt teilweise deren Bewahrung in dieser Entscheidung. Workspace-Referenzen nutzen `workspace:^`.

Manche Development-Beziehungen existieren nur in `dsh.client.inject` oder TypeScript-Project-References. Die `configurationOnlyDevDependencies`-Tabelle der Policy nennt nur diese reviewten Kanten und hält sie in `devDependencies`.

Der Verifier liest Source-Manifests und Source-Dateien, läuft also auf einem sauberen Tree ohne gebautes `lib/`. Jedes gewählte Host-Face muss ein `src/index.ts` haben. Ein unklassifizierter Host-Runtime-Export ist ein Policy-Verstoß, der alle `--fix`-Schreibungen blockiert; ein Maintainer muss den Export reviewen und klassifizieren, die Source-Beziehung ändern oder die Paketauswahl ändern. Sobald die Source-Safety besteht, führt `--fix` nur die von der Klassifikation implizierten Section- und Range-Änderungen aus und entfernt stale Peer-Metadaten.

### Maintainer-Workflow

Den Verifier ohne `--fix` laufen lassen gibt einen Read-only-Check von Paketauswahl, Export-Klassifikationen, Dependency-Sektionen, Workspace-Ranges und Peer-Metadaten. Ein unklassifizierter Runtime-Import meldet eine klickbare `path:line:column`-Diagnose pro importiertem Export.

```sh
pnpm run verify-package-dependencies
```

Jeden neuen Host-Runtime-Export in [`package-dependency-policy.ts`](../../../../scripts/package-dependency-policy.ts) klassifizieren, bevor Manifests generiert werden. `duplicateSafePackages` erlaubt jedem Runtime-Export eines exakten Root-Entry eine gewöhnliche Dependency; `safeHostDependencyExports` erlaubt nur gelistete Exports; `peerRequiredHostExports` hält die gesamte Provider-Paketkante in matchenden Peer- und Development-Sektionen. Ein Export darf nur eine Klassifikation erhalten. Nach dem Entfernen einer paketweiten Identity- oder State-Anforderung dessen Root-Entry auf Paketebene klassifizieren; nach dem Ändern eines Exports in einem gemischten Paket die exakte Export-Tabelle aktualisieren. Eine Kante wird erst dann eine gewöhnliche Dependency, wenn keiner ihrer importierten Exports mehr peer-required ist.

Die verwalteten Manifests und jedes direkt abgeleitete Artifact mit einem Befehl generieren. `--fix` schreibt nichts, solange ein Policy-Verstoß besteht; nach Erfolg refreshed es `pnpm-lock.yaml`, regeneriert beide Module-Graph-Sprachen und deren Pairing-Record und druckt die Ordinary-Dependency- und Peer-Required-Edge-Listen.

```sh
pnpm run verify-package-dependencies -- --fix
git diff -- packages pnpm-lock.yaml docs/module-graph.md docs/module-graph.zh.md docs/module-graph.i18n.yaml
```

Den Working-Tree-Graphen und einen Git-Ref über die lokale Metadata-only-Registry messen. Jeder Run erzeugt einen frischen Consumer und npm-Cache, ersetzt geerbte npm-Konfiguration durch explizite Peer-, Hoisting- und Registry-Einstellungen, führt `npm install --package-lock-only` aus, lehnt Archive-Downloads ab und lässt das Repository unverändert. `--runs` steuert Wiederholungen, `--timeout-ms` terminiert den npm-Prozessbaum nach seiner Deadline, und optionales `--max-ms` lässt den Befehl fehlschlagen, wenn der langsamste Run eine Schwelle überschreitet.

```sh
pnpm run benchmark:npm-resolution -- --runs=5 --timeout-ms=300000
pnpm run benchmark:npm-resolution -- --ref=origin/master --runs=5 --timeout-ms=300000
```

Paket-Placement über zwei inkompatible synthetische DSH-Releases verifizieren. Der Verifier kopiert jedes aktuelle DSH-Manifest in `0.1.0` und `0.2.0`, fragt npm nur nach einem Package-Lock und lehnt Cross-Release-DSH-Resolution, unerwartete DSH-Locations, ungleiche Release-Inventare, mehrere Cordis-Installationen und Package-Archive-Requests ab. Der lokale Index enthält nur installierte Current-Platform-Metadaten, sodass npm-akzeptierte Probes für nicht verfügbare optionale Pakete gemeldet werden, ohne den Check zu scheitern.

```sh
pnpm run verify-npm-install-layout
```

Das nächste Host-Paket ranken, indem die aktuelle Policy im Speicher angewendet, eine Baseline gemessen, jedes erreichbare unkonfigurierte Paket probiert und die schnellsten groben Kandidaten seriell regetestet werden. Positives `gainSeconds` ist `baseline median - candidate median`; `--candidates` begrenzt das Roster, `--jobs` steuert grobe Concurrency, und keine Phase schreibt Manifests. Ein gewählter Kandidat braucht weiterhin Export-Klassifikation, bevor er `hostPackages` beitritt.

```sh
pnpm run benchmark:npm-resolution:next -- --runs=1 --finalist-runs=5 --finalists=5 --jobs=8 --timeout-ms=120000
```

### Performance-Verifikation

[`verify-npm-install-layout`](../../../../scripts/verify-npm-install-layout.ts) ist ein deterministischer Package-Path- und Versions-Check im `Release (dsh)`-Workflow bei jedem Pull Request und Master-Push; er erzwingt keine Resolver-Dauer. [`benchmark-npm-resolution`](../../../../scripts/benchmark-npm-resolution.ts) und [`benchmark-next-package-dependency`](../../../../scripts/benchmark-next-package-dependency.ts) bleiben manuell, weil Resolver-Zeit mit Maschinenlast und Metadata-Completion-Reihenfolge variiert. Ihre Fresh-Consumer-, Metadata-only-Runs isolieren npms Dependency-Tree-Berechnung von Registry-Latenz und Archive-Downloads, sodass relative Ergebnisse Peer-Relays identifizieren, ohne ein Release-Time-Performance-Versprechen zu erzeugen.

Die generierte Policy hinterlässt derzeit 27 verwaltete Host-Runtime-Kanten in `dependencies` über 13 Pakete. Zwei Kanten bleiben in `peerDependencies`: `dsh-api-remotes → dsh-scope` für `carrierKeyOf` und `dsh-session → dsh-scope` für `scopeOf` und `scopeTarget`.

## Berücksichtigte Alternativen

**Interne Beziehungen als Peers behalten.** npm muss jeden erforderlichen Peer entlang konvergierender Ancestry-Pfade platzieren und validieren, was den gemeldeten Install-Time-Fehlschlag selbst dann reproduziert, wenn alle internen Versionen kompatibel sind.

**Den `"./client"`-Export als Client-Face-Roster verwenden.** Ein Paket kann Client-facing Types oder eine Browser-API publizieren, ohne eine dynamisch geladene Row beizutragen. Dieses Paket zu wählen weitet die Migration auf unverbundene Host-Pakete wie Goal, Session Title und Todo aus. `dsh.client` identifiziert dynamische Rows, während das `packages/client/`-Verzeichnis unabhängig statische Client-Inputs abdeckt.

**Jedes Host-Paket abflachen.** Entfernt mehr Peer-Arbeit, weitet die Migration aber auf Pakete aus, deren individuelles Benchmark-Ergebnis vernachlässigbar ist. Die explizite Host-Liste bewahrt die verbleibenden Peer-Contracts, bis Messungen einen weiteren Eintrag rechtfertigen.

**Jede Client-bezogene Deklaration nach Development-only verschieben.** Die Host-Value-Imports eines Dual-Face-Pakets bleiben echte Node-Loads. Sie aus dem publizierten Dependency-Graph zu lassen, macht das Paket von zufälligem Hoisting durch ein Profil abhängig.

**Eine Wall-Clock-Schwelle in CI erzwingen.** Resolver-Zeit variiert mit Maschinenlast und Metadata-Completion-Reihenfolge. Deterministische Manifest-Klassifikation gehört in CI; Timing bleibt ein Maintainer-Benchmark.

## Konsequenzen

Der publizierte Dependency-Graph folgt Artifact-Ownership statt Source-Directory-Kopplung. Client-Bundles und ausgelieferte Profile liefern Browser-Identities, Host-Module installieren duplicate-safe Werte, die sie laden, und Cordis plus explizit peer-required Host-Exports behalten geteilte Paketinstanzen.

Eine öffentliche Type-only-Beziehung nach `devDependencies` zu verschieben, bedeutet, dass ein standalone TypeScript-Consumer das referenzierte Typ-Paket installieren muss, wenn er diese Deklaration konsumiert. Die ausgelieferten Profile installieren die vollständige unterstützte Paketfamilie; unabhängig assemblierte TypeScript-Consumer zu unterstützen, würde eine andere Policy erfordern.

Die expliziten Overrides, Host-Liste, Paketklassifikationen und Export-Klassifikationen sind reviewbare Entscheidungen. Von `instanceof` genutzte Class-Konstruktoren, private Symbole und modul-lokale Registries erfordern Peers, wenn Identität oder unzugänglicher Zustand Paketgrenzen überschreitet. Ein stabiler struktureller Marker oder ein versionierter Prototype-Deskriptor kann einen bestimmten Wert interoperabel machen, aber ein Value-Import allein zu sein tut es nicht. Eine Klassifikation zu ändern, ändert den installierten Graphen und erfordert die fokussierten Verifier-Tests, den Two-Release-Layout-Check und einen frischen Next-Package-Benchmark. Der Metadata-only-Benchmark ist diagnostische Evidenz, kein Release-Time-Performance-Versprechen.
