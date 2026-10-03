---
description: "Der lokale Filesystem-Skill-Provider für Nutzer und Maintainer, die lokale Skills authoren oder konfigurieren, wie Projekt-, Custom- und User-Skill-Roots entdeckt und beobachtet werden."
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-filesystem
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Agents können lokale Skills aus dem Repository, einem Custom-Verzeichnis oder der Agent-Konfiguration des Nutzers verwenden: authore einen Skill als Directory-Bundle mit einer `SKILL.md` oder als flache `<name>.md`-Datei unter einem beliebigen gescannten Root, und er erscheint im Session-Katalog. Der Provider entdeckt die Projekt-, Custom- und User-Roots, parsed das YAML-Frontmatter jedes Skills und beobachtet die Verzeichnisse, sodass neue, umbenannte oder gelöschte Skills ohne Restart bei den Agents ankommen. Wähle ihn, wenn Skills auf der Platte leben — die Registry (`dsh-skill`) akzeptiert jeden Provider, und ein anderer Provider kann Skills von anderswo liefern.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounte das Plugin, um lokale Skills für Agents verfügbar zu machen. Es scannt die untenstehenden Projekt-, Custom- und User-Skill-Roots, parsed das Frontmatter jedes Skills in einen Katalog-Eintrag und lädt den Body on demand; es beobachtet außerdem die Roots, sodass neue, umbenannte oder gelöschte Skills ohne Restart in den nächsten Katalog gelangen.

### Wann es die richtige Wahl ist

Verwende diesen Provider, wenn Skills auf der Platte leben — im Repository, einem Custom-Verzeichnis oder der Agent-Konfiguration des Nutzers. Vermeide ihn, wenn Skills aus einer Remote-Registry oder eingebetteten Plugin-Daten kommen: die Registry akzeptiert jeden Provider, und dieses Paket ist eine Implementierung.

### Skill-Format

Ein Skill ist entweder ein Directory-Bundle `<name>/SKILL.md` oder eine flache Datei `<name>.md` auf der Top-Ebene eines gescannten Root; verschachtelte `**/SKILL.md`-Dateien werden bewusst nicht entdeckt. Die Datei beginnt mit YAML-Frontmatter: erforderlich `name` und `description`, dazu optional `whenToUse`, `metadata`, `disable-model-invocation` und `user-invocable`.

`disable-model-invocation: true` hält den Skill aus model-facing Katalogen und Loadern heraus; `user-invocable: false` hält ihn aus user-facing Kommandos heraus, und ausgelassene Felder defaulten dazu, ihre Surface zu erlauben. Die beiden Keys akzeptieren YAML-Booleans plus die case-insensitive Formen `true`/`false`, `yes`/`no`, `on`/`off` und `1`/`0`; eine abgelehnte Schreibweise oder ein Nicht-Boolean-Wert verwirft den ganzen Skill mit einer Warnung, statt eine Surface still zu erlauben.

Katalog und Body haben getrennte Lifecycles: Discovery parsed Frontmatter in den Katalog-Eintrag, und jeder Load liest die aktuelle Datei erneut — ein Edit am Skill-Body braucht also weder Versionierung noch Cache-Invalidierung.

### Roots und Priorität

Default-Roots werden in der Rank-Reihenfolge dieses Providers gescannt:

| Rank | Quelle | Pfad |
|---|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` |
| 300 | `custom` | `Config.customSkillDirs` |
| 400 | `user-dsh` | `<dshHome>/skills` |
| 500 | `user-agents` | `<agentsHome>/skills` |

Der Projekt-Root ist der nächste Vorfahren, der `.git` enthält; ohne einen solchen wird das aktuelle cwd verwendet. Der User-DSH-Root überspringt sein `.system`-Kind. `includeDefaultRoots: false` lässt die Projekt- und User-Zeilen plus den `$DSH_BUNDLED_SKILL_DIR`-Default weg, sodass ein isolierter Provider nur seine eigenen konfigurierten Roots sieht; `bundledSkillDir` fügt einen Bundled-Root auf Rank 600 hinzu.

### Mounten und konfigurieren

Lade das Plugin zusammen mit der Skill-Registry; es benötigt `ctx.skills`.

```yaml

- name: '@deepseek-ai/dsh-skill'

- name: '@deepseek-ai/dsh-skill-filesystem'

```

| Feld | Default | Bedeutung |
|---|---|---|
| `providerName` | `filesystem` | Eindeutiger Provider-Name, registriert auf `ctx.skills` |
| `includeDefaultRoots` | `true` | Projekt- und User-Roots um `customSkillDirs` herum einbeziehen |
| `dshHome` | `$DSH_HOME` oder `~/.dsh` | Harness-Config-Root; dessen `skills`-Unterverzeichnis wird gescannt |
| `agentsHome` | `$DSH_AGENTS_HOME` oder `~/.agents` | Geteilter Agent-Config-Root, der nach kompatiblen Skills gescannt wird |
| `customSkillDirs` | `[]` | Zusätzliche lokale Skill-Roots, nach Projekt-Roots und vor User-Roots |
| `watch` | `true` | Lokale Roots beobachten und den Provider invalidieren, wenn sich der Katalog geändert haben könnte |
| `bundledSkillDir` | — | Bundled-Skill-Root, der bei Konfiguration auf Rank 600 gescannt wird |

Die übrigen `watch*`-Felder tunen das Chokidar-Verhalten — Polling, Stabilitätsfenster, Intervall, Projekt-Cap und Symlink-Following. Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-skill-filesystem) ist die erschöpfende Quelle für jedes Feld.

### Änderungserkennung

Existierende Roots werden beobachtet, sodass Hinzufügen, Umbenennen oder Löschen eines Skills (oder Editieren seines Frontmatters) einen Katalog-Refresh für den nächsten Model-Step auslöst; Edits unter `references`, `scripts`, `assets` und anderen Bundle-Ressourcen tun das nicht. Die First-Party-Tools `write` und `edit` invalidieren den Provider direkt, wenn ihr Ziel einen beobachteten Skill berühren könnte, sodass das Modell seine eigene Filesystem-Mutation beobachtet, ohne auf den Host-Watcher zu warten. Externe IDE-, Git- und Shell-Änderungen werden vom Host-Watcher aufgegriffen, und ein noch nicht existierender Root wird probed, bis er erscheint.

### Beobachtbare Erfolge und Fehler

Ein gültiger Skill unter einem beliebigen gescannten Root erscheint namens-sortiert im Session-Katalog, und sein Laden gibt den aktuellen Datei-Body zurück. Eine Datei ohne gültiges Frontmatter, mit ungültigem Namen oder ungültigem Invocation-Wert wird mit einer Warnung übersprungen, sodass der Modell-Katalog keine Pro-Skill-Diagnose erhält und einen fehlenden Skill nicht von einem ungültigen unterscheiden kann. Unerwartete Discovery- oder Read-Fehler lassen die Katalog-Beobachtung unvollständig, statt die Last-good-Sicht durch eine täuschende Löschung zu ersetzen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie Discovery und Watching organisiert sind; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designkonzept

Der Provider steht auf zwei Trennungen. Erstens Katalog versus Body: Discovery parsed Frontmatter zu Zusammenfassungen, während jeder Load die Datei erneut liest — Body-Edits brauchen also keinen Hash, keine Revision und keine Cache-Invalidierung. Zweitens Discovery versus Watching: `list()` scannt Roots und löst den Projekt-Root über `ctx.fs` auf, wenn ein Filesystem-Service vorhanden ist (mit Fallback auf abbrechbares Node-I/O), während ein separater Watch-Manager Chokidar-Handles, Missing-Root-Probes und Invalidierung besitzt.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Eintritt, Provider, Root-Auflösung, Frontmatter-Parsing, Watch-Manager |
| — | Es wird kein Runtime-Invarianten-Companion veröffentlicht; dieses Paket exponiert keine eigenständige Event-Sequenz oder mutable Datenrelation über die Contracts hinaus, die an seinem besitzenden Seam durchgesetzt werden. |

### Discovery-Ablauf

Discovery löst die Root-Liste für das Lookup-cwd auf, bittet den Watch-Manager, sich an jeden Root anzuhängen, und scannt dann die direkten Einträge jedes Root: Directory-Bundles lösen `<name>/SKILL.md` auf, flache Dateien `<name>.md`. Jede Datei wird auf Frontmatter geparsed — `name` muss kebab-case sein, `description` ist erforderlich, und die Invocation-Keys lösen über die strikte Boolean-Grammatik auf — und Kandidaten tragen das Source-Label und den Rank des Root, damit die Registry sie mit anderen Providern mergen kann. Bestätigt fehlende Pfade sind gültiger Leerzustand; malformed oder nicht-text Einträge warnen und werden übersprungen.

### Watching und Invalidierung

Existierende Roots werden von Chokidar auf Tiefe 1 beobachtet; ein nicht existierender Root wird von seinem nächsten existierenden Vorfahren aus verfolgt, ein fehlendes Segment nach dem anderen, über `fs.watchFile`. Relevante Events — direktes Bundle-Add/-Remove, flaches `.md`-Add/-Remove und direktes `SKILL.md`-Add/-Remove/-Change — koaleszieren zu einer Provider-Invalidierung pro Microtask-Batch, während Änderungen im Ressourcen-Subtree ignoriert werden. Der Watch-Manager ist durch `watchMaxProjects` begrenzt, loggt und wiederholt fehlgeschlagene Starts und schließt jedes Handle beim Teardown. First-Party-`write`/`edit`-Mutationen invalidieren synchron über das `fs/observed`-Event.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie bewegen sich vom Registry-Contract zum Consumer, der entdeckte Skills rendert, und zur Home-Pfad-Auflösung, die die Config-Defaults verwenden.

- [Skill-Subsystem-Referenz](../../../docs/subsystems/skills.de.md) — der Registry-Contract und die lokale Discovery-Prioritätstabelle.
- [skill-Paket](../skill/README.de.md) — die Registry, auf der sich dieser Provider registriert.
- [tool-skill-Paket](../tool-skill/README.de.md) — wie entdeckte Skills den Session-Katalog und das Modell erreichen.
- [home-paths-Paket](../../util/home-paths/README.de.md) — wie `dshHome` und `agentsHome` aufgelöst werden.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über `dsh-tool-skill`, das die invocablen Namen und gecappten Descriptions dieses Providers in den initialen oder Ersatz-Katalog rendert sowie einen ausgewählten aktuellen Instruction-Body plus Ressourcen-Basis-Guidance in die einbehaltene Tool-History, während Pfade, Provider-Ranks und deaktivierte Skills verborgen bleiben.

#### KV-Cache-Effekt

Watcher-Invalidierung kann dazu führen, dass der genannte Consumer einen Ersatz-Katalog an die bestehende Request-History anhängt. Reine Body-Edits lassen den Katalog-Digest unverändert.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Provider schlecht passt oder besondere Betriebsaufmerksamkeit braucht. Es sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Discovery ist eine Ebene tief** — nur `<root>/<name>/SKILL.md` und `<root>/<name>.md` werden erkannt; verschachtelte Skill-Bäume und Paket-Manifeste werden ignoriert.
- **Projekt-Scope ist der nächste `.git`-Vorfahre** — Workspaces ohne diesen Marker fallen auf das gelieferte cwd zurück, ohne alternativen Projekt-Root-Marker oder Monorepo-Subprojekt-Auswahl.
- **Malformed Einträge verschwinden mit einer Warnung** — der Modell-Katalog erhält keine Pro-Skill-Diagnose und kann einen fehlenden Skill nicht von einem ungültigen unterscheiden; unerwartete I/O-Fehler bewahren stattdessen den Last-good-Katalog.
- **Missing-Root-Beobachtung pollt ein Pfadsegment** — Roots, die beim Start fehlen, verwenden `fs.watchFile` mit `watchPollIntervalMs`, bis Chokidar anhängen kann; das tauscht begrenzte Erkennungslatenz gegen zuverlässige Erstellungs-Erkennung über IDE-, Git- und Shell-Workflows hinweg.
- **Kein Body-Revisions-Protokoll** — ein geladener Body ist gewöhnliche einbehaltene Tool-History; spätere Datei-Edits wirken auf spätere Aufrufe, schreiben aber weder alte Ergebnisse um noch kündigen sie an, dass sich der Body geändert hat.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer und ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten und Grenzen liegen in den Abschnitten oben und im Code. Ein TODO in `src/index.ts` schlägt vor, das Chokidar- und Missing-Root-Beobachten in einen Cordis-File-Watch-Service zu extrahieren und Skill-Filterung und Invalidierung hier zu behalten; der oben dokumentierte Missing-Root-Polling-Tradeoff ist Teil dieses offenen Designs.

</details>
