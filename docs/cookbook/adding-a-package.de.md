# Cookbook: Hinzufügen eines Workspace-Pakets

[English](adding-a-package.md) | [中文](adding-a-package.zh.md) | Deutsch

Die Datei-für-Datei-Checkliste für ein neues `@deepseek-ai/dsh-<name>`-Paket. Diese Checkliste wird gegen das bash- und das Adapter-Paket als Vorlagen validiert; wenn sie von diesen abweicht, hier korrigieren.

## 1. Paket erstellen

```
packages/<group>/<pkg>/
  package.json     # copy from packages/core/tools, adjust name/description/deps
  tsconfig.json    # extends ../../../tsconfig.base.json, rootDir src,
                   # outDir lib/types, references: ../../../vendor/cosmokit,
                   # ../../../vendor/cordis (+ ../../../vendor/schemastery if
                   # you use Config, + ../../<group>/<dep> for each dsh dep)
  src/index.ts     # service default export or plugin (name/inject/apply/Config)
  README.md        # service API, events, extension points, design notes,
                   # + gated Model Experience context blocks or short form
                   # + the gated "Known Limitations and Deferred Work" section
                   # (or a whitelist entry in scripts/verify-package-readme-limitations.ts)
```

Eine bestehende Gruppe wählen, wenn eine der Paketrolle entspricht (`core`, `llm`, `shell`, `compaction`, `subagent`, `todo`, `session`, `client`/`host`, `util` oder `test-support`). Eine neue Gruppe ist erlaubt, aber sie ist ein reiner Container: keine `package.json`, keine Quelldateien, und Pakete bleiben genau eine Ebene darunter.

package.json-Invarianten (erzwungen durch `pnpm run constraints` / `scripts/check-workspace-constraints.ts`): `private: true`, eine `version`, die mit der Root-`package.json` übereinstimmt, `type: module`, `main: "lib/index.js"`, `types: "lib/types/index.d.ts"`, `exports["."].types: "./lib/types/index.d.ts"`, `exports["."].default: "./lib/index.js"`, `@deepseek-ai/cordis` in SOWOHL peerDependencies als auch devDependencies (gleiche Range). Jede dsh-Peer-Dependency in devDependencies spiegeln. `@deepseek-ai/schemastery` gehört in `dependencies` (es ist ein Runtime-Validator), übereinstimmend mit agent-loop. Die `files`-Liste enthält exakt `lib/index.js`, `lib/types/**/*.d.ts` und paketspezifische Runtime-Artefakte, die das Gate anerkennt; ein Paket, das `./invariant` veröffentlicht, schließt zusätzlich `lib/invariant.js` ein. Ein Paket, dessen Runtime-Export in den emittierten Tree zeigt, schließt zusätzlich `lib/types/**/*.js` ein. Nicht `src`, Declaration Maps, JS Maps oder veraltete Root-Declaration-Dateien veröffentlichen. CLI-App-Pakete mit einem `bin`-Eintrag führen `lib/bin.js` unmittelbar nach `lib/index.js` in `files` auf.

Paketinterne relative Imports verwenden in der Quelle explizite `.ts`-Spezifizierer (beispielsweise `export * from './types.ts'`). Der Compiler schreibt diese in emittiertem JS zu `.js` um und belässt explizite `.ts`-Spezifizierer in Deklarationen, die Standard-NodeNext/Node16-TypeScript-Consumer zur sibling-`.d.ts`-Datei auflösen.

## 2. In den Root-Konfigurationen registrieren

| Datei | Änderung |
|---|---|
| `tsconfig.base.json` | bei bestehender Gruppe keine Änderung; bei einer neuen Gruppe einen `./packages/<group>/*/src`-Kandidaten zum `@deepseek-ai/dsh-*`-Wildcard hinzufügen |
| `tsconfig.host.json` (Host-Paket) oder `tsconfig.client.json` (Client-Paket) | `{ "path": "./packages/<group>/<pkg>" }` zu `references` hinzufügen — ein gewöhnliches Paket gehört zu genau einem Aggregate, niemals zu beiden. `api/remotes` verwendet ein repositoryspezifisches Split, weil der Host einen Vertrag generiert, den der Client in einer späteren Phase konsumiert; neue Pakete dürfen dies nicht kopieren ([Layout](../development.de.md#typescript-project-layout)) |

Ein `packages/client/*`-Paket extends zusätzlich `tsconfig.base.client.json` statt `tsconfig.base.json`, und ein Client-Plugin-Paket deklariert `dsh.client` in package.json, exportiert `./client` und ruft die gemeinsame tsdown-Preset (`packages/client/tsdown.client.ts`) auf — siehe [packages/client/AGENTS.md](../../packages/client/AGENTS.md) für den Client-seitigen Vertrag.

Automatisch durch Globs oder Package-Manifest-Discovery abgedeckt — keine Änderungen erforderlich: Root-`package.json`-Workspaces, `scripts/publint-all.ts`, `tsdown.config.ts`, `.oxlintrc.json`, `scripts/check-workspace-constraints.ts`.

## 3. Paket-Topologie festlegen

Für eine austauschbare Capability trenne Service Definition / Service Provider / Consumer in separate Pakete, wenn sie sich unabhängig voneinander weiterentwickeln (siehe docs/architecture.md § „Capability seams" — das shell-Trio ist die Vorlage). Ein Plugin mit einzelnem Zweck bleibt ein Paket.

### Die existierende Rolle benennen

Benenne die stabile aktuelle Verantwortung. Nicht die erste Implementierung, eine mögliche zukünftige Erweiterung oder die Cordis-Basisklasse benennen. Ein Schnittstellen-Paket benennt die Capability. Ein Implementierungspaket fügt den Mechanismus, das Protokoll, die Umgebung oder den Vendor hinzu, der es unterscheidet. `local` nur verwenden, wenn Same-Host-Ausführung Teil des Vertrags ist.

Einen singulären `ctx`-Key für ein Engine, Runtime, Policy, Controller, Resolver, Store oder eine aktuelle Konfiguration verwenden. Einen pluralen Key für eine Registry oder einen Service mit mehreren benannten Mitgliedern verwenden. Klassenrolle und Key-Anzahl müssen übereinstimmen. Einen Cordis-`Context`-Key nicht für inkompatible Host- und Client-Deklarationen wiederverwenden. TypeScript Declaration Merging sieht beide Faces, selbst wenn sie separate Runtime-Contexts verwenden. Den Rollen-Suffix hinzufügen, wenn der natürliche Plural bereits zu einem anderen Face gehört.

| Begriff | Verwenden, wenn | Nicht verwenden, wenn |
|---|---|---|
| `Controller` | Es nimmt Befehle oder Benutzerintentionen entgegen und verändert einen bestehenden Domain- oder Präsentationszustand. | Es führt beliebige Arbeit aus, besitzt eine Provider-Flotte oder konvertiert nur Werte für die Anzeige. |
| `Store` | Es besitzt einen Datenbestand und bietet hauptsächlich CRUD-, Snapshot- oder Subscription-Operationen für diese Daten an. | Es validiert eine Zustandsmaschine, schlichtet Autorität, dispatcht Arbeit oder besitzt Provider-Rangfolge. Eine Map macht eine Klasse noch nicht zu einem Store. |
| `Directory` | Es exponiert Einträge und Metadaten zur Discovery oder Auswahl. | Producer registrieren beliebige Implementierungen darin, oder Aufrufer führen Arbeit darüber aus. |
| `Presenter` | Es ist eine reine Konvertierung von Domain-Werten oder Tool-Argumenten zu Render-Intents. | Es führt I/O aus, abonniert, mutiert Zustand oder besitzt Lifecycle. |
| `Registry` | Es besitzt ein dynamisches Set benannter Registrierungen, einschließlich Lookup, Duplikat- oder Rangfolgeregeln, Lebensdauer und Disposal. | Sein Hauptvertrag ist Dispatch, Ausführung, Cancellation, Policy oder Orchestrierung. |
| `Runtime` | Es führt Live-Arbeit aus und besitzt Dispatch, Cancellation, Provider-Koordination oder Operations-Lifecycle über Aufrufe hinweg. | Es speichert nur Datensätze, gibt einen Katalog zurück, löst einen Wert auf oder hält Konfiguration. |
| `Resolver` | Es berechnet oder lokalisiert eine Antwort aus gelieferten Eingaben, ohne den Lifecycle dieser Antwort zu besitzen. | Es besitzt eine veränderliche Collection oder eine lange laufende Ausführung. |
| `Binder` | Es bindet eine deklarierte Schnittstelle an einen Aufrufer-Context oder -Lifecycle und gibt den gebundenen Wert zurück. | Es besitzt den Wert als Collection, kontrolliert seinen Domain-Zustand oder konvertiert nur Daten. |
| `Engine` | Es implementiert einen Domain-Algorithmus oder ein zustandsbehaftetes Ausführungsmodell. | Es wählt nur einen Provider aus oder leitet über eine Protokollgrenze weiter. |
| `Policy` | Es entscheidet, was erlaubt, ausgewählt, limitiert oder beobachtet wird. | Es führt den Mechanismus aus, den die Entscheidung erlaubt. |
| `Executor` | Es führt eine explizite Anfrage oder aufgelöste Spezifikation in einer Capability aus. | Es besitzt einen breiten Applikations-Lifecycle oder Provider-Katalog. |
| `Gateway` | Es adaptiert eine Prozess-, Netzwerk-, RPC- oder API-Grenze. | Es registriert nur Same-Process-Services oder speichert Metadaten. |
| `Provider` | Es liefert eine Implementierung einer Capability-Definition. Einen Mechanismus- oder Vendor-Qualifizierer hinzufügen, wenn mehrere existieren können. | Es ist die Capability-Definition, die Provider-Registry oder die Consumer-Runtime. |
| `Backend` | Es implementiert austauschbare niedrigere Persistenz, Transport oder Ausführung hinter einer definierten Schnittstelle. | Es ist ein benutzerseitiger Service oder eine zurückgegebene Live-Ressourcen-Referenz. |
| `Handle` | Es referenziert eine Live-Ressource und kontrolliert oder beobachtet diese Ressource. | Es erstellt und verwaltet den vollständigen Ressourcen-Pool. |
| `Config` | Es besitzt einen aufgelösten Konfigurationswert oder einen strikt begrenzten Record und dessen Update-Vertrag. | Es speichert eine allgemeine Collection, führt Arbeit aus oder exponiert unabhängige Einstellungen. |
| `Service` | Es besitzt einen kohäsiven Domain-Service, den keine schärfere Rolle oben ehrlich beschreibt. | Der Name existiert nur, weil die Klasse Cordis `Service` erweitert. |

`SDK` nur für das JSON-RPC-Client/Server-Protokoll verwenden, das von den unterstützten Python- und TypeScript-SDKs genutzt wird. DeepSeek Harness selbst ist ein agent harness, kein SDK-Projekt. Die kanonische Produkt-Schreibweise `Typert` verwenden, niemals `TypeRT` oder `typeRT`.

## 4. Das Paket-README schreiben

Paketspezifische Service-API, Config, Events, Erweiterungspunkte und Design-Notizen zuerst platzieren. Den Frontmatter-`kind` aus den vier Kind-Labels in der [dsh-doc-Metadatenreferenz](../../.agents/skills/dsh-doc/references/metadata-links-i18n.md#the-kind-system) wählen — group, reference, library oder bundle — passend zur Repository-Position und Entry-Shape des Pakets; jeder Kind wählt eine README-Vorlage. Der Limitations-Abschnitt dokumentiert dauerhafte Consumer-Lücken und nicht offensichtliche Maintainer-Constraints, die dieses Paket besitzt; übliche Bereinigung bleibt in seinem Source-TODO oder Agent Note. Ein indirekter Model-Experience-Satz darf den Consumer nennen, der den Beitrag dieses Pakets an die Oberfläche bringt, aber er restated nicht die Implementierung jenes Consumers. Ein Paket-README mit dieser kanonischen Sequenz beenden:

````markdown
## Model Experience

### Request context and condition

#### What the model sees

The exact data-dependent fields, an anchored generated-catalog link, or an introduction to the verbatim literal below.

##### Verbatim text for this field, when needed

```markdown
Stable system-prompt prose of any length, or another long non-generated literal, copied exactly from source.
```

#### Token effect

Fixed, conditional, retained, replaced, capped, or zero-direct token effect.

#### KV Cache effect

Append-only, prefix-stable, replacing, or independent behavior, including the exact conditions that may invalidate reuse.

## Known Limitations and Deferred Work

- **Consumer-visible gap** — exact missing operation or case, its consequence, and any maintainer constraint.
````

Model Experience aus der Implementierung ausfüllen. Pro direktem, bedingtem, gedeckeltem, Lifecycle- oder auxiliarem Model-Context-Eintrag ein H3 verwenden, mit den drei geordneten H4-Feldern wie oben gezeigt und je einem Prosa-Absatz darunter. Vom Paket besessenen stabilen Text zitieren: System-Prompt-Prosa gehört in ein betiteltes H5 plus `markdown`-Fence unter dem Feld, das sie einführt — normalerweise `What the model sees` —; andere kurze Literale bleiben inline mit benannten Platzhaltern, andere lange Literale verwenden dieselbe verschachtelte Form. Nur datenabhängigen oder provider-besessenen Text zusammenfassen. Ein Tool-Schema-Eintrag linkt seinen verankerten Abschnitt im generierten [Tool-Katalog](../tool-catalog.de.md) und gibt nur Deltas an, die dort fehlen. Prompt- und Schema-Einträge getrennt halten, wenn Scoping eines ohne das andere verbergen kann. In `KV Cache effect` zwischen Append-only-Wachstum, einem stabilen wiederholten Prefix, Replacement früherer Request-Tokens und einem unabhängigen Model-Request unterscheiden, dann die paketbesessenen Änderungen nennen, die Reuse invalidieren können. „Invalidiert nicht" bedeutet, dass das Paket ein bereits reusbares Prefix erhält; Provider-Cache-Verfügbarkeit und -Eviction bleiben außerhalb des Paket-Vertrags. Der [Prose-Standard](../../.agents/skills/dsh-prose-standard/SKILL.md) regelt Vollständigkeit und Ownership; der Verifier erzwingt die erforderliche Abschnittsstruktur.

Ein Paket ohne Context-Effekt oder mit einem Consumer-besessenen Pfad verwendet den geprüften `None, as `- oder `Indirectly, through `-Satz in [`SENTENCE_MODEL_EXPERIENCE`](../../scripts/verify-package-readme-model-experience.ts), gefolgt von einem `KV Cache effect`-H4 und einem nicht leeren Absatz; ein modellagnostisches generisches Paket kann stattdessen `NO_MODEL_EXPERIENCE_SECTION` beitreten. Keinen der beiden Fälle zu einer Beschreibung der Arbeit eines anderen Pakets ausweiten. Die Limitations-[Allowlist](../../scripts/verify-package-readme-limitations.ts) ist unabhängig. Die [Model Experience Agent Note](../../.agents/notes/implemented/process/2026-07-12-package-model-experience-contract.de.md) dokumentiert die Rationale.

## 5. Verifizieren

```sh
pnpm install        # registers the workspace
pnpm run doc-sync
pnpm run constraints && pnpm run typecheck && pnpm run lint
pnpm run build && pnpm run hygiene
```

Der [Repository-Testing-Policy](../testing.de.md) für die verhaltensspezifischen Checks und die Coverage folgen, die das neue Paket erfordert.
