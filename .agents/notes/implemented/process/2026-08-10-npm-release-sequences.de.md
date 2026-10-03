# Agent Note: Private npm-Publikation als drei unabhängige Sequenzen

Status: implemented

[English](2026-08-10-npm-release-sequences.md) | [中文](2026-08-10-npm-release-sequences.zh.md) | Deutsch

## Problem

Dieses Repository hielt drei unverbundene Gruppen publizierbarer Pakete und keinen Kanal, der eine davon zu einer Registry schickte.

`packages/*/*` und `apps/*` bilden die Runtime-Fläche von `@deepseek-ai/dsh`; `vendor/*` hält neun rescopte Cordis-Framework-Pakete, jedes mit seiner Upstream-Version; `native/system/packages/*` hält Linux-Plattform-Pakete mit eigenem Workflow. Die drei unterscheiden sich in Versionsbaseline, Änderungsrate und Build-Anforderungen: dsh bewegt sich mit dem Produkt, vendor bewegt sich nur bei einem Upstream-Re-Sync oder einer Änderung an einer lokalen Modifikation, und native braucht eine musl-Toolchain und einen Build pro Architektur. Sie durch eine Pipeline zu zwingen, bedeutet, dass jedes Produkt-Release das Framework und die nativen Binaries erneut publiziert.

Zwei harte Blocker standen im Weg. Alle 217 Workspace-Manifests setzten `private: true`, was npm zu publizieren verweigert. Der subtilere waren 933 handgeschriebene `peerDependencies: "^0.0.1"`-Einträge zwischen dsh-Sibling-Paketen: `pnpm pack` substituiert das `workspace:`-Protokoll, lässt aber Semver-Ranges unberührt, und `^0.0.1` bedeutet `>=0.0.1 <0.0.2` — es schließt `0.0.2` aus, und Semver schließt Prereleases aus einem Range ohne eigenen Prerelease aus, sodass es auch `0.0.1-rc.1` ausschloss. Diese Einträge schlugen nur deshalb nie fehl, weil die Version `0.0.1` nie verließ.

`scripts/publish-npm-baseline.ts` ist ein lokales Publikationsskript: Es packt und publiziert in einem Prozess, braucht einen Menschen zum Authentifizieren und Retryen auf seiner eigenen Maschine und schließt vendor aus seinem Release-Set aus. Es kann nicht die Basis für CI-Publikation sein, obwohl seine Tarball-Payload-Validierung und Installed-Artifact-Probes verifizierte Teile sind.

## Entscheidung

### Drei unabhängige Sequenzen

`packages/`, `vendor/` und `native/` haben je eine Bump-Sequenz und eine Publikation, teilen keine Version, keinen Trigger und kein Warten. dsh zu releasen publiziert vendor nicht erneut; vendor zu releasen publiziert native nicht erneut.

| Sequenz | Mitglieder | Versionsbaseline | Tag | Workflow |
|---|---|---|---|---|
| dsh | Publish-Set: nicht-experimentelle `packages/*/*` + `apps/*`; private experimentelle Pakete treten nur dem geteilten Versions-Bump bei | eine Version für Publish-Set, private dsh-Pakete und Workspace-Root, `0.0.x` | `dsh-v<version>` | `release.yml` (pack) / `release-publish.yml` (publish) |
| vendored framework | die neun `vendor/*`-Pakete | jedes Paket auf eigener Versionslinie | `vendor-<package>-v<version>` (einer pro Paket) | `release-vendor.yml` (pack) / `release-vendor-publish.yml` (publish) |
| native | `native/system/packages/*` | sein eigenes `0.0.x` | `node-addon-system-v<version>` | `node-addon-system-release.yml` |

Alle drei publizieren in den `@deepseek-ai`-Scope auf npmjs.com, und Access gilt pro Sequenz statt pro Scope: Das vendored Framework und die nativen Pakete sind `public`, und die dsh-Familie ist `public`, seit ihre eigene Sequenz am 2026-08-13 öffentlich ging ([Begründung](../../archived/process/2026-08-13-public-vendor-and-native-sequences.md)). Kein Publish-Pfad übergibt `--access`, weil ein Flag keine Sequenzen bedienen kann, die sich widersprechen, und das Manifest überschreiben würde, das die Stufe besitzt.

### Versionen landen von einem lokalen Befehl aus im Repository; CI prüft und lädt nur hoch

Jede Sequenz hat einen Bump-and-Commit-Befehl: Er leitet die Zielversion ab, schreibt sie in die relevanten Manifests, führt `pnpm install --lockfile-only` aus und committet die Manifests mit dem Lockfile. Die publizierte Version ist daher aus dem Repository ablesbar. Ein Mensch erstellt den Tag, nachdem der Commit zu master gemergt ist; CI schreibt nie ins Repository und braucht keine Schreibberechtigung.

`release:dsh` akzeptiert `major`, `minor`, `patch` oder eine explizite Version und schreibt eine Version über die publizierbare Familie, jedes private Paket unter `packages/*/*` **und den Workspace-Root**. Private Pakete erhalten keinen Release-Tag und bleiben außerhalb von Pack und Publish; sie folgen der Version, weil das [statische Version-Coherence-Gate](../../archived/process/2026-09-03-workspace-version-coherence-gate.md) verlangt, dass die Version jedes dsh-Pakets der des Roots gleicht. Der Root-Check akzeptiert ein Prerelease-Segment, sodass explizite Versionen wie `0.0.1-alpha.1`, `0.0.1-canary.1` und `0.0.1-rc.1` denselben Pack-, Installed-Artifact-Probe- und Publikationspfad fahren. Die `dsh`-Publikation mappt `alpha` und `canary` auf ihre passenden npm-dist-tags, mappt andere Prereleases einschließlich `rc` auf `next` und überlässt stabile Versionen npms `latest`-Default. Andere Release-Familien behalten ihre eigene Dist-Tag-Policy.

Bei gleichen Release-Nummern vergleicht SemVer alphanumerische Prerelease-Identifier lexikalisch: `alpha` ist kleiner als `canary`, `canary` ist kleiner als `rc`, und jeder Prerelease ist kleiner als die stabile Version. npm-dist-tags sind mutable Aliase und nehmen nicht an der Version-Precedence teil.

### vendor: publizieren, was sich änderte, und Tags als Ledger nutzen

Die vendored Pakete sind durch ihren Scope vom Upstream entkoppelt, behalten aber ihre eigenen Versionslinien. Die publizierte Version ist die höhere aus Manifest-Version und zuletzt publizierter Version, mit inkrementiertem Patch — was auch ein Upstream-Prerelease-Segment fallen lässt. Die ersten publizierten Versionen:

| Paket | Upstream-Version | Erste publizierte Version |
|---|---|---|
| `@deepseek-ai/cordis` | 4.0.0-rc.7 | 4.0.1 |
| `@deepseek-ai/cordis-plugin-loader` | 1.0.0-rc.5 | 1.0.1 |
| `@deepseek-ai/cosmokit` | 1.8.1 | 1.8.2 |
| `@deepseek-ai/schemastery` | 3.18.0 | 3.18.1 |
| `@deepseek-ai/cordis-plugin-hmr` | 1.0.15 | 1.0.16 |
| `@deepseek-ai/cordis-plugin-include` | 1.0.4 | 1.0.5 |
| `@deepseek-ai/cordis-plugin-timer` | 1.1.2 | 1.1.3 |
| `@deepseek-ai/cordis-plugin-group` | 1.0.0 | 1.0.1 |
| `@deepseek-ai/cordis-plugin-logger-console` | 1.0.0 | 1.0.1 |

Die zuletzt publizierte Version als Baseline zu nehmen, ist das, was einen Re-Sync übersteht: Würde Upstream `4.0.0-rc.8` wiederherstellen, nachdem dieses Repository `4.0.1` publiziert hat, würde sonst wieder `4.0.1` berechnet und kollidieren. `--prerelease rc.1` publiziert stattdessen eine Probe, die `--tag next` nimmt und die Release-Nummern frei lässt: Ein Prerelease hat niedrigere Precedence als das Release, dem er vorangeht, sodass `4.0.1` weiterhin auf `4.0.1-rc.1` folgt. Diese Ordnung wird hier berechnet statt aus `git tag --sort=v:refname` gelesen, das einen Prerelease über sein Release stellt.

Nur geänderte Pakete publizieren, und das Change-Judgement fügt keine State-Datei hinzu: **Jedes Paket hat seinen eigenen Tag, und dieser Tag zeichnet den Commit auf, von dem es zuletzt publiziert hat.** Für jedes Paket liest Bump den neuesten `vendor-<package>-v*`-Tag und difft das Paketverzeichnis dagegen. Ein Pfad zählt, wenn das `files` des Manifests ihn auswählt, wenn npm ihn ohnehin publiziert (`package.json`, `README*`, `LICENSE*`) oder — für ein Paket, dessen `files` `lib/` auswählt — wenn er ein Build-Input ist (`src/**`, `tsconfig*.json`, eine Build-Config). Diese letzte Regel existiert, weil ein gebauter Payload nicht von git getrackt wird: Ohne sie liest eine echte Source-Änderung als „nichts geändert", und die nächste Publikation scheitert an einer Version, deren Bytes sich bewegten.

Ein Tag ist ein Commit-Pointer, kein Publikationsbeweis. Bump fragt die Registry, ob die Version existiert, die sein neuester Tag nennt, und schlägt zur menschlichen Auflösung fehl, wenn nicht, weil ein für eine Publikation gepushter Tag, die dann fehlschlug, sonst als „bereits publiziert" läse und das Paket auf unbestimmte Zeit überspringe. Das Abfragen eines privaten Pakets braucht Credentials, sodass eine unauthentifizierte Maschine die Lücke meldet statt zu scheitern.

`vendor/cordis` publiziert auch `src`. Seine Export-Map deklariert `"./src/*"`, sodass ein Tarball ohne diese Dateien Consumers auf abwesende Pfade zeigt, und `files`, das nur Build-Output auswählt, ließ dem Change-Judgement keinen getrackten Pfad zum Matchen.

### Publikation läuft nur auf GitHub, und die Registry entscheidet, was rausgeht

Publikation läuft nur von GitHub Actions; es gibt keinen lokalen Publikationspfad. Publish liest keinen Tag und kein Manifest von „was dieses Release enthält". Für jeden gepackten Tarball vergleicht es die Version mit der Registry, in drei Zuständen:

| Zustand | Aktion |
|---|---|
| die Registry hat diese Version nicht | publizieren |
| die Registry hat sie, und das sha512 des Tarballs gleicht dem aufgezeichneten `dist.integrity` | überspringen: das ist ein Re-Run über ein Artifact |
| die Registry hat sie, und die Integrity weicht ab | fehlschlagen, mit Meldung Content geändert ohne Versions-Bump |

Der dritte Zustand fängt Code ab, der sich ohne Versions-Bump änderte. Die ersten beiden liefern Idempotenz — ein Re-Run von Publish über ein Artifact republiziert nichts und braucht keine manuelle Paketauswahl. Dieselbe Regel löst die Spannung zwischen einem Vendor-Release, das mehrere Tags trägt, und einem Workflow, der nur von einem Ref laufen kann: Der Workflow leitet nie ab, welche Pakete zu publizieren sind, aus dem Tag, von dem er lief.

Alle drei Sequenzen entscheiden so, einschließlich der nativen: Sie publiziert über ihr eigenes Skript statt einer Shell-Loop, weil eine Schleife blöder `npm publish`-Aufrufe nicht retrybar ist — die Registry beantwortet eine Wiederholung einer existierenden Version permanent, sodass ein Fehlschlag auf halbem Weg keinen Weg vorwärts ließ.

Zwei Registry-Verhalten formen, wie ein Publish versucht wird. Schreibvorgänge sind um mindestens zwei Sekunden beabstandet und werden mit Backoff retryt, weil das hintereinander Publizieren mehrerer Pakete die eigene Verarbeitung der Registry überholt und `E409 Failed to save packument` einbringt. Und jeder Retry liest die Registry zuerst neu: Ein gemeldeter Fehlschlag kann einen Schreibvorgang beantworten, der doch landete, sodass eine Version, die jetzt mit der Integrity dieses Tarballs existiert, als publiziert zählt statt als erneut zu platzierende Version.

### Workspace-interne Referenzen nutzen das `workspace:`-Protokoll

Jede Referenz auf ein Workspace-Member nutzt `workspace:^`, sodass `pnpm pack` einen Range substituiert, der zur Zielversion passt: Sibling-`peerDependencies` folgen der Familienversion, und eine Referenz auf ein vendored Paket folgt dessen eigener Linie. Die Landlock-Plattform-Pakete behalten `workspace:*`, was die exakte Version publiziert, weil ein Plattform-Paket und sein Entry exakt übereinstimmen müssen.

`scripts/check-workspace-constraints.ts` verlangt das Protokoll, sodass ein neues Paket keinen handgeschriebenen Range wieder einführen kann; die Invariant-Companion-Regel verlangt `workspace:^` für `@deepseek-ai/dsh-invariants` aus demselben Grund.

### Publizierte Dependency-Faces nutzen eine explizite Policy

[`verify-package-dependencies`](../../../../scripts/verify-package-dependencies.ts) klassifiziert Workspace-Beziehungen nach ihrer publizierten Client- und Host-Nutzung, behält nur Cordis als Peer in abgedeckten Paketen und wendet ein kleines explizites Host-Roster an. [Publizierte Dependency-Faces und begrenzte Peer-Relays](2026-08-26-published-dependency-faces.de.md) besitzt die Auswahlregeln und -begründung.

`pnpm run benchmark:npm-resolution` misst diesen Graphen manuell mit dem installierten npm-Executable. `pnpm run benchmark:npm-resolution:next` probiert zusätzlich jedes erreichbare unkonfigurierte Host-Paket und misst die führenden Kandidaten seriell neu. Beide Befehle nutzen eine Loopback-Metadata-Registry und lehnen Archive-Requests ab, sodass ihre Dauer Paket-Downloads ausschließt. Kein Befehl ist ein Aggregat-Gate, weil Scheduler-Last und Metadata-Completion-Reihenfolge Wall-Clock-Schwellen nichtdeterministisch machen.

### Eine optionale Dependency wird nie auf Module-Scope geladen

Eine Dependency in `optionalDependencies`, oder ein Peer mit `peerDependenciesMeta.<name>.optional`, darf in einem installierten Tree fehlen — diese Abwesenheit ist das ganze Versprechen von „optional". Ein statischer Import wird beim Laden des importierenden Moduls evaluiert, sodass ein fehlendes Paket aufhört, „diese Capability ist nicht verfügbar" zu sein, und zu einem Ladefehlschlag für alles wird, was das importierende Modul erreicht. Der Fehlschlag erscheint nur in einem installierten Tree, dem das Paket fehlt, und kein Test hier konstruiert einen solchen: Ein Workspace-Install hat immer jedes Paket, sodass die Unit-Tests, die Snapshots und die Packed-Install-Probe alle bestehen, während das publizierte Paket für den Consumer gebrochen ist, der den optionalen Peer ablehnte.

[`verify-optional-dependency-imports`](../../../../scripts/verify-optional-dependency-imports.ts) schließt dieses Loch. Es liest das eigene Manifest jedes Pakets, was dieses Paket abwesend sein darf, und scannt dann die Dateien, die ausgeliefert werden — `packages/*/*/src/` und `apps/*/src/` — über beide Compiler-Faces. `vendor/` liegt außerhalb des Scopes als gepinnte Upstream-Source unter der [Vendoring-Policy](../../../../vendor/README.md). Value-versus-Type wird gegen ein gebundenes Program entschieden statt gegen die Import-Syntax, weil `verbatimModuleSyntax` aus ist: Der Compiler erased bereits einen Import, dessen Bindings zu Typen auflösen, sodass `import type {}`, `import {}`, ein Inline-`type`-Specifier und ein Named-Binding, das zu einem Typ auflöst, alle nichts emittieren und erlaubt sind, während ein Bare-Import, ein Value-Binding und ein Star-Re-Export behalten und rejected werden. Nur die Type-Phase erased einen Import: `import defer` löst weiterhin auf und linkt sein Modul, verschiebt nur die Evaluation, sodass das Gate es als Load zählt.

Ein Verstoß nennt das Paket, die Deklaration, die es optional machte, und der Reihe nach den Ausweg — es als Typ zu importieren, was alles ist, was Declaration Merging braucht, oder so umzustrukturieren, dass Module-Scope das Paket nicht braucht. Ein dynamisches `import()` verschiebt den Fehlschlag nur zur ersten Nutzung, gehört also zu einem Caller, der das Paket wirklich benötigt und seine Abwesenheit behandelt; danach zu greifen, ist ein Zeichen, dass die Dependency nicht optional ist, und das Gate bietet es nicht als Mittel an.

### Release-Family-Objekte

Die Entität in dieser Domäne ist eine **Release-Familie**: eine Menge von Paketen, die eine Versionsbaseline und Tag-Namensgebung teilt und als Einheit publiziert. Eine Familie hinzuzufügen bedeutet, eine Subklasse und eine Workflow-Lane hinzuzufügen, nicht den Core zu ändern.

| Objekt | Verantwortung |
|---|---|
| `ReleaseFamily` | die Identität einer Familie: Member-Discovery, Versionsbaseline, Tag-Präfix, Packed-Payload-Regel, installierter Entry |
| `ReleaseMember` | ein publizierbares Paket: Verzeichnis, Name, Version, Manifest |
| `publishOrder` | topologische Ordnung über die Sektionen, die npm installiert, plus Peer-Deklarationen, Gleichstände per Paketname gebrochen; ein Zyklus unter installierten Dependencies wird gemeldet statt willkürlich aufgelöst, und eine Peer-Kante, die keine Ordnung einhalten kann, wird fallengelassen und benannt |
| `pack` | packt eine ganze Familie in ein Verzeichnis und zeichnet die Upload-Reihenfolge auf |
| `verify` | die Versionsbaseline der Familie, die Publish-Order, die sie vollständig druckt, und — beim Publizieren — dass der Run vom Tag dieser Familie kommt und ihre Members publizierbar sind |
| `verify-packed-install` | installiert die Tarballs eines oder mehrerer Pack-Verzeichnisse in einen Wegwerf-Consumer und führt die installierte Executable |
| `publish` | die drei Registry-Zustände oben |
| `process` / `tarball` | das eine Zuhause zum Spawnen von Befehlen und zum Lesen eines gepackten Tarballs, einschließlich des Entry-Guards, der jedes Skript importierbar hält |

Die dsh-Familie wendet die Publikations-Payload-Policy des Repositories an, die Quellen und Deklarations-Maps ablehnt. Die vendored Familie behält Upstreams Payload, weil diese Manifests `./src/*` exportieren und das Fallenlassen von `src` eine Export-Map publizieren würde, die auf abwesende Dateien zeigt.

### Workflow-Form: Pack auf PR/Push, Publish aus einem manuellen Dispatch-Workflow

Der `pack`-Job läuft das ganze Release-Set einmal durch, packt jedes Member in ein Verzeichnis, schreibt die Upload-Reihenfolge und lädt dieses Verzeichnis als ein Artifact hoch; er lebt in `release.yml` / `release-vendor.yml`. Das Release-Set ist eine Einheit — die Hälfte der Pakete kann nie die Registry erreichen, während die andere Hälfte noch baut.

`pack` trägt keine Credentials und läuft bei jedem Pull Request und Master-Push, sodass ein Pull Request beweist, dass das Release-Set noch packt. Publikation lebt in einem separaten `release-publish.yml` / `release-vendor-publish.yml`-Workflow, der nur `workflow_dispatch` ist (und so nie als PR-Check erscheint): Er packt den aktuellen Tree neu und publiziert dann jeden Eintrag der Reihe nach, hinter der `npm-publish`-Environment für menschliche Freigabe. Pack-Runs sind pro Ref gruppiert, sodass konkurrierende Pull Requests sich nicht verdrängen; der `publish`-Job trägt die globale `Release-publish`-Gruppe, weil Dist-Tags geteilter Registry-State sind. Nachdem eine dsh-Publikation erfolgreich war, verifiziert der Release-Operator dessen Session-Writer gegen den [Release-Record](../../../../docs/session-format-status.de.md#updating-the-record) und aktualisiert diesen Record, wenn ein höheres Session-Format ausgeliefert wurde.

Eine dsh-Verifikation installiert auch den Pack-Output der vendored Familie. Die Harness-Pakete deklarieren das vendored Framework als Peer, diese Pakete leben in einer anderen Sequenz, und der credential-freie Job kann sie nicht von einer privaten Registry holen — der dsh-`pack`-Job packt also die vendored Familie zur Verifikation, während nur das dsh-Set publiziert wird. Der Publish-Workflow (`release-publish.yml`) packt den aktuellen Tree neu und publiziert nur das dsh-Set.

Die Verifikation packt auch den Landlock-Entry, den `dsh-sandbox-local` als plain Dependency deklariert, und lässt optionale Dependencies weg. Die Plattform-Pakete hinter diesen optionalen Einträgen brauchen eine musl-Toolchain und einen Build pro Architektur, sodass ein Job auf einem Runner sie nicht erzeugen kann; ein Consumer, der sie nicht installieren kann, muss trotzdem starten, was optional hier bedeutet. Die Verifikation liest daher ein Verzeichnis nach seinem Inhalt statt nach einer Pack-Order, weil ein Verzeichnis Tarballs enthalten kann, die nur gepackt wurden, um eine Cross-Sequence-Dependency zu erfüllen.

Die Installed-Consumer-Probe erfasst npms HTTP-Diagnostik und gibt sie mit aus, wenn die Installation fehlschlägt. Registry-Response-Codes und Cache-Status bleiben sichtbar, selbst wenn npm einen fehlgeschlagenen Peer-Manifest-Fetch als `ERESOLVE` mit undefined Version meldet.

### Repository-Änderungen, die dies mitbrachte

| Punkt | Inhalt |
|---|---|
| Release-Set-Manifests | `private: true` entfernt; `publishConfig.access` pro Sequenz und `repository` mit dem `directory` jedes Pakets hinzugefügt |
| Release-Set-Grenze | jedes Member von `packages/*/*`, `apps/*` und `vendor/*` |
| Dependency-Protokoll | Workspace-interne Referenzen sind `workspace:^`, mit `check-workspace-constraints.ts` und der Invariant-Companion-Regel, die es verlangen |
| Root-`AGENTS.md` | die Konvention, dass vendored Pakete `private: true` sind, gilt nicht mehr |
| `vendor/README.md` | zeichnet `src` als lokale Modifikation auf, die `cordis`' `files` beitrat |
| die drei nativen Pakete | `publishConfig.access: public`, und ihr Workflow übergibt kein `--access` |

### Verhältnis zum früheren Vorschlag

Diese Agent Note ersetzt das Versionsschema und die Release-Set-Grenze in [Artifact-first-npm-Baseline-Publikation](../../rejected/process/2026-08-04-artifact-first-npm-baseline-publication.de.md): deren `<base>-<timestamp>-<short SHA>`-Prerelease-Versionen und `dev-<base>`-Dist-Tag werden nicht übernommen, und vendor wird nicht aus dem Release-Set ausgeschlossen. Worin beide übereinstimmen, steht: Pack und Publish sind getrennt, Publish konsumiert nur verifizierte Tarballs, und die Payload- und Installed-Artifact-Probes sind Release-Gates.

## Berücksichtigte Alternativen

**Eine `<base>-<timestamp>-<short SHA>`-Version.** Für kontinuierliche Dev-Publikation geplant. Sie kollidiert damit, die publizierte Version im Repository zu halten: Die Version bettet einen Commit-SHA ein, und das Zurückschreiben der Version erzeugt einen neuen Commit, sodass der SHA nur den Parent-Commit benennen kann, der publiziert wurde, und die Verbindung eine Konvention zum Erklären braucht. Mit nummerierten Versionen deckt ein Prerelease wie `0.0.1-rc.1` bereits „erst verifizieren, dann releasen" ab.

**Ein `vendor/published.json`-Ledger, das publizierte Version und Commit jedes Pakets aufzeichnet.** Dies ging dem Tag-Design voraus. Es fügt eine State-Datei hinzu, die nicht von der Registry driften darf. Ein Per-Package-Tag liefert denselben Commit-Pointer, und der Tag muss ohnehin existieren, führt also keine zweite Kopie des Zustands ein.

**Event-Level-Tags (`vendor-r1`, `vendor-r2`).** Vorbereitet für ein Release-Event, das mehrere Paketversionen trägt. Sobald die Registry entscheidet, was publiziert, leitet der Workflow das Set nicht mehr vom Tag ab, sodass Per-Package-Tags genügen — und jeder nennt die echte Version seines eigenen Pakets.

**Die neun vendored Pakete auf eine `4.0.x`-Linie stellen.** Es entfernt Change-Detection, aber cosmokit würde von `1.8.1` auf `4.0.1` springen und seine Upstream-Linie verlieren; die Upstream-Ranges innerhalb der neun (`^1.8.1` und Freunde) würden sofort nicht mehr matchen und ein Rewrite der vendored Manifests erzwingen.

**Jedes vendored Paket bei jedem Vendor-Release inkrementieren, ohne Change-Detection.** Die geringste Machinerie zum Preis neuer Versionsnummern für Pakete, deren Inhalt byte-identisch zum vorherigen Release ist. Tags reduzieren Change-Detection auf das Lesen eines Tags und das Fahren eines Diffs — das ist es nicht wert, gegen aufgeblähte Versionsnummern einzutauschen.

**„Bereits publiziert" nur aus der Version entscheiden, ohne Inhalt zu vergleichen.** Der Referenz-Flow fragt keine Registry: Publish lädt jeden Tarball hoch, und npm lehnt eine doppelte Version ab. Nur anhand der Version zu überspringen verfehlt Code, der sich ohne Bump änderte — der einzige Fehlschlag, der still veraltete Bytes auf der Registry hinterlässt. Der Preis ist eine Registry-Abfrage und eine Abhängigkeit von reproduzierbaren Builds.

**Nur den Packed-Install verifizieren, ohne lokale Registry.** Der Referenz-Flow entpackt Tarballs in einen Tree und führt ihn mit plain Node, was Version-Range-Resolution umgeht. Eine lokale Registry in CI für diese Schicht laufen zu lassen, wurde abgelehnt: Artifact-Korrektheit ist durch bestehende Tests abgedeckt, der Publikationspfad wird durch die Master-Rehearsal ausgeübt, und ein Pull Request muss nur beweisen, dass das Release-Set packt. Installieren aus `file:`-Specifiers übt weiterhin Range-Resolution für jede interne Dependency.

**Ein Subset per Entry-Closure wählen.** `dependencies` von `@deepseek-ai/dsh` und `@deepseek-ai/dsh-web-frontend` zu crawlen ergibt 156 Pakete, 61 weniger als das ganze Set. Aber die Plugins dieses Repositories werden per Name aus `cordis.yml` gemountet statt importiert: `vendor/cordis-plugin-group` und `vendor/cordis-plugin-logger-console` fallen außerhalb der Dependency-Closure, sind aber zur Laufzeit erforderlich. Auswahl nach Code-Dependency scheitert als „der Consumer installiert es und es startet nicht" und bräuchte einen dauerhaften Beweis, dass kein gemountetes Paket verfehlt wurde. Unter einem privaten Scope sind die zusätzlichen Pakete außerhalb der Organisation unsichtbar. `python/`, `docs/` und `website/` sind keine Release-Family-Members.

**`scripts/publish-npm-baseline.ts` erweitern.** Es ist ein lokales Publikationsskript, das in einem Prozess packt und publiziert — das Gegenteil der Trennung von credential-freiem Packen und geschützter Publikation. Seine verifizierten Teile — Payload-Validierung und Installed-Artifact-Probes — werden wiederverwendet, sodass `pnpm run duplication` keine Klone meldet.

**Ein Workflow mit `family`-Input.** Zwei Versionsmodelle in einer Datei gabeln die Concurrency-Gruppe, das Tag-Präfix und die Rehearsal-Trigger in bedingte Ausdrücke. Eine Datei pro Familie ist sowohl kürzer als auch leichter lesbar.

**Dependency-Ranges zur Publikationszeit umschreiben.** Verglichen mit dem Protokoll läuft das Rewrite nur in CI, ein lokales `pnpm install` kann nicht zeigen, ob es korrekt ist, und es wiederholt sich bei jedem Release.

**Bump in CI ausführen und die Version zurückpushen.** Braucht Repository-Schreibberechtigung für den Workflow, und ein Versions-Commit auf dem Release-Branch raced menschliche Commits. Bump und Commit bleiben lokal; CI prüft und lädt hoch.

## Konsequenzen

Die Release-Skripte sind importierbare Module hinter einem geguardeten Entry-Point, und ihre Judgements tragen Unit-Tests: Tag-Naming, Publish-Order und Cycle-Reporting, Versionsbaseline-Arithmetik, das Payload-Change-Judgement und die Payload-Policy jeder Familie. Zwei Defekte, die der erste Entwurf trug — ein Publish-Befehl, der den Pack-Befehl beim Import ausführte, und ein Change-Judgement, das gegen `vendor/cordis`-Source-Edits blind war — sind genau das, was ein Test an dieser Naht fängt.

Ein Pull Request führt den vollen Pack für beide Sequenzen ohne Credentials aus und installiert die gepackten dsh-Tarballs in einen Wegwerf-Consumer, wo plain Node `dsh --version` fährt. Diese Probe ist bewusst ein Befehl: Sie beweist, dass `files` einen vollständigen Payload auswählte und dass die publizierten Ranges auflösen, und sagt nichts über interaktives Verhalten.

Was das kostet:

- **Tags können von der Registry driften.** Ein für eine Publikation gepushter Tag, die dann fehlschlug, wird durch Bumps Registry-Check gefangen, aber nur wo Credentials existieren; eine unauthentifizierte Maschine meldet die Lücke und fährt fort.
- **Das Change-Judgement hängt von sichtbaren Tags ab.** Ein Shallow Clone oder ein Checkout ohne Tags degradiert das vendored Judgement zu „alles zum ersten Mal publizieren". `fetch-depth: 0` ist Vorbedingung, keine Optimierung.
- **Das Protokoll-Rewrite berührte 1504 Dependency-Deklarationen.** Es ändert lokale Resolution nicht — pnpm löst ohnehin aus dem Workspace auf —, ändert aber die Ranges, die rausgehen.
- **Private Pakete brauchen Credentials zum Installieren.** Jeder Consumer — CI, Sandbox-e2e, externe Nutzer — braucht Scope-Credentials, einschließlich für die Landlock-Pakete, die nie publiziert wurden und so keinen bestehenden anonymen Pfad abschneiden.
- **`repository` nennt eine andere Organisation als die, welche die Workflows fährt.** Token-basierte Publikation ist unbetroffen; npm provenance (OIDC) verlangt, dass beide übereinstimmen, sodass dessen Übernahme bedeutet, entweder `repository` umzubiegen oder aus der Organisation zu publizieren, die es nennt.
- **Byte-Reproduzierbarkeit ist angenommen, nicht gemessen.** Der Skip-on-Identical-Integrity-Zustand ruht darauf, dass zweimaliges Packen desselben Commits dieselben Bytes ergibt. Nichts misst das bisher: Wenn der Build absolute Pfade oder Timestamps einbettet, meldet ein Re-Run einen falschen Fehlschlag. Vor der ersten Publikation messen, der ein Re-Run folgen könnte, und bei Nicht-Zutreffen auf Vergleich per-File-Content-Hashes zurückfallen.
- **Ein Re-Run von Publish über ein älteres Artifact kann `latest` zurückbewegen.** Publikation wird pro Version entschieden, sodass ein älteres Set, das nach einem neueren republiziert wird, den Stable-Dist-Tag wieder nimmt. Die Rehearsals laufen von einer Prerelease-Version, die `latest` nie nimmt.
- **Die erste Publikation ist ein großer Schritt.** Neun vendored Pakete und das ganze dsh-Set publizieren auf einmal, sodass jeder Payload-Defekt in einem einzelnen Release aufkommt — genau darum fährt eine Prerelease-Version den kompletten Pfad zuerst.
