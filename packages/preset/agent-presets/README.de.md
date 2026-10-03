---
description: "Pro-session-agent-Komposition aus preset-cordis.yml-Dateien, für Nutzer und Maintainer, die agent-presets auswählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-presets
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Verwende `dsh-agent-presets`, um jeder session die tools, prompt-Abschnitte und skills zu geben, die das `agent.cordis.yml` eines presets benennt. Ein Prozess kann sessions mit verschiedenen presets laufen lassen, während ihre Zustände getrennt bleiben. Die preset-Liste kombiniert mitgelieferte Definitionen mit konfigurierten und Nutzer-roots, meldet, warum ein preset nicht starten kann, und kann ein lokales preset durch Kopieren eines vorhandenen erstellen. Deployments und Nutzer können Standardwerte wählen; nur eine leere session darf das preset wechseln. Behandle jedes verfasste preset als vertrauenswürdige Konfiguration, denn es gewährt die capabilities der Plugins, die es auswählt.

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

Mounte dieses Paket in eine Komposition, die jeder agent-session eigene tools, prompt-Abschnitte und skills aus einer preset-Datei geben soll. Jede session nennt ein preset — explizit oder über den konfigurierten Standard — und wird daraus komponiert; ohne das Paket fallen sessions auf das zurück, was die Host-Komposition mountet.

Die mitgelieferten Web-presets `standard`, `ptc` und `cordis` enthalten [explizite Dateizustellung](../../client/ui-deliverables/README.de.md#explicit-deliveries). Das `minimal`-preset behält seine feste Zwei-tool-Trainingskonfiguration.

### Was ein preset einer session gibt

Eine aus einem preset komponierte session führt die Plugins aus, die dessen `agent.cordis.yml` benennt: dessen tools, prompt-Abschnitte und skills. Sessions, die demselben preset beitreten, teilen eine installierte Komposition, und der Zustand jeder session bleibt getrennt. Ein child-agent (subagent) tritt der Komposition seines parents bei und sieht daher dieselben tools und prompt-Abschnitte wie der agent, der ihn gespawnt hat.

Die wählbaren presets stammen aus zwei Orten: den mit diesem Paket unter `presets/` ausgelieferten presets und deinen eigenen presets unter `<dshHome>/.agent-presets`. Die Auswahl zeigt Anzeigename und Beschreibung jedes presets; ein preset, dessen Komposition nicht laden kann, wird mit Grund aufgelistet statt versteckt, sodass du sehen kannst, was zu reparieren oder zu löschen ist.

### Minimale Konfiguration

Das Plugin braucht eine `default`-preset-id und scannt `roots` nach presets:

```yaml
- name: '@deepseek-ai/dsh-agent-presets'
  config:
    default: standard
    roots:
      - path: ~/company-presets
        trust: system
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `default` | erforderlich | preset-id, die komponiert wird, wenn eine session keine nennt |
| `roots` | `[]` | Gescannte Verzeichnisse in Vorrangreihenfolge; jedes liefert `path` (ein führendes `~` wird expandiert) und `trust` (Standard `user`) |
| `includeShippedRoot` | `true` | Stellt die gebündelten presets des Pakets als `system`-root vor jede konfigurierte root |
| `includeUserRoot` | `true` | Hängt `<dshHome>/.agent-presets` als `user`-root hinter jede konfigurierte root an |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-agent-presets) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

Die mitgelieferte root wird vor jede konfigurierte root gestellt, sodass der eingebaute Satz verfügbar bleibt und doppelte ids gewinnt, selbst wenn ein patch die roster-Konfiguration ersetzt. `includeShippedRoot: false` entfernt diesen eingebauten Satz für Deployments, die alle presets selbst liefern. `includeUserRoot: false` entfernt die abgeleitete beschreibbare root; Tests, die einen exakten roster pinnen, deaktivieren beide abgeleiteten roots.

### Das Standard-preset wählen

Die `default`-config setzt den Deployment-Standard. Ist ein settings-Provider komponiert, registriert dieses Plugin den Namespace `agent-presets` mit `config.default` als Basis, sodass ein Nutzerdokument einen pro-Nutzer-Standard über den des Deployments schichtet:

```yaml
agent-presets:
  default: minimal
```

Der Wert wird beim Erstellen einer session gelesen, sodass ein geänderter Standard nur danach erstellte sessions betrifft; laufende sessions bleiben auf dem preset, aus dem sie komponiert wurden. Das Leeren des Nutzerfelds erbt den Kompositions-Standard erneut.

### Presets verfassen

Verfassen ist nur Kopieren: Das Erstellen eines presets kopiert das gesamte Verzeichnis eines vorhandenen presets — Komposition, Anzeige-Metadaten, skill-Verzeichnisse, Assets — in die erste `user`-root. Die Kopie behält die Beschreibung der Quelle, bekommt aber eine eigene id und einen optionalen Anzeigenamen, sodass kein Aufrufer Kompositionstext liefert und eine Kopie nichts gewährt, was der roster nicht bereits trug. Nach dem Erstellen geschieht alles in den eigenen Dateien des presets.

Eine Kopie wird abgelehnt, wenn die id nicht `[a-z0-9][a-z0-9-]*` ist (die id wird ein Verzeichnisname), wenn die id bereits vergeben ist (eine Kopie überschreibt nie) oder wenn die Quelle unbekannt ist. Löschen entfernt nur lokal verfasste presets; mit dem Deployment ausgelieferte presets sind nicht entfernbar. Eine session, die bereits auf einem gelöschten preset läuft, läuft darauf weiter.

### Das preset einer session wechseln

Eine session kann nur zu einem anderen preset wechseln, solange sie nichts produziert hat — keine Nachrichten oder tool calls. Danach ist die Komposition für die Lebenszeit der session fixiert, weil ein Werkzeugwechsel mitten im Gespräch geloggte tool calls hinterließe, die die neue Komposition nicht ausführen kann. Ein committeter Wechsel emittiert `tools/change`, weil sich die aufgelöste tool-Menge ohne registry-Eingriff geändert hat. Der Wechsel wird auch im session-Log vermerkt, sodass eine resumed oder geforkte session unter der Komposition neu aufgebaut wird, mit der sie lief.

### Fehler und Wiederherstellung

Ein preset, dessen Komposition fehlt, nicht parsebar ist, keine Liste benannter Plugin-Zeilen ist oder ein nicht auflösbares Modul nennt, wird mit einem Grund als broken gelistet, der die fehlerhaften Zeilen nennt; das Komponieren eines solchen presets wird vornherein abgelehnt, sodass eine session nie halb komponiert startet. Was bis zur session-Erstellung überlebt, ist eine Zeile, deren Modul lädt und dann ablehnt — ein Plugin, das wirft, oder eines, das auf einen service wartet, den die Komposition nie liefert — was die Erstellung scheitern lässt und zurückrollt und jede fehlgeschlagene Zeile nennt, einschließlich derer in einer Gruppe. Repariere die preset-Datei oder lösche sie, dann versuche es erneut.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design hinter dem roster und dem standing-mount; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig abgedeckt.

### Designphilosophie

- **Eine standing-Komposition pro preset.** Ein preset wird einmal pro Prozess unter einem standing-scope gemountet; agents treten bei, indem sie ihren scope-key dem mount unterordnen, sodass die Registrierungen und Listener des mounts jeden beigetretenen agent abdecken und keinen eines Schwester-presets.
- **Generationen, auf die Kompositionsdatei gekeyed.** Der mount zeichnet den Stempel (mtime und Größe) der Kompositionsdatei auf; eine session, die den Stempel als stale vorfindet, startet die nächste Generation, während bereits beigetretene sessions die Generation behalten, auf der sie laufen — eine laufende session überlebt, dass sich ihre Datei ändert oder verschwindet.
- **Die preset-Datei ist ein Eingang, nie ein Persistenz-Ziel.** Der gemountete Teilbaum überschreibt `write()` als no-op, sodass ein loader-initiiertes Zurückschreiben nie eine geteilte preset-Datei umschreibt.
- **Discovery besitzt die Gesundheit.** Ein Verzeichnis, dessen Komposition fehlt oder nicht ladbar ist, ist eine broken-roster-Zeile mit Grund, kein Übersprung — ein übersprungenes Verzeichnis belegte weiterhin seine id, während keine Oberfläche etwas zum Löschen zeigt.

### Quelltext-Karte

| Datei | Aufgabe |
|---|---|
| [`src/index.ts`](src/index.ts) | service-Einstieg: `Config`-schema, settings-Namespace, roster-API, standing-mount-Koordination |
| [`src/discovery.ts`](src/discovery.ts) | Dateisystem-Discovery: root-Scanning, Gesundheitsprüfungen, id-Validierung, Sortierung |
| [`src/composition-inventory.ts`](src/composition-inventory.ts) | Abgeflachte Kompositionszeilen für Plugin-Listing-Oberflächen: Datei-Lesevorgänge mit ausgewerteten disabled-Gates, mount-Lesevorgänge mit fiber-Zuständen |
| [`src/preset.ts`](src/preset.ts) | vocabulary: preset-id-Regel, `AgentPreset` und `PresetRoot`, Fehlertypen |
| [`src/mount.ts`](src/mount.ts) | Teilbaum-Mounting, Host-base-URL-Behandlung, mount-Audit, `write()`-Unterdrückung |
| [`src/authoring.ts`](src/authoring.ts) | Kopieren/Löschen/Lesen lokal verfasster presets, Berechtigungs-Verschärfung |
| [`src/metadata.ts`](src/metadata.ts) | `preset.yml`-Anzeige-Metadaten |
| [`src/session.ts`](src/session.ts) | `agent-preset/selected`-Ereignis und die `agentPreset`-Session-Projektion |
| [`src/types.ts`](src/types.ts) | Client-sichere wire-Nutzlasten und cordis-Ereignisdeklaration |
| [`src/invariant.ts`](src/invariant.ts) | Invariant-companion: service-Leak-Nachprüfung nach dem mount, Nicht-beigetretener-agent-Fehlschlag |

### Der standing-mount

`ensureStanding` hält ein ausstehendes Promise pro preset-id, single-flight, sodass zwei agents, die um die erste Verwendung eines presets konkurrieren, eine Komposition teilen. Ein abgerechneter Fehlschlag wird entfernt, damit eine spätere session ein preset erneut versucht, dessen Datei repariert wurde. Der mount läuft im eigenen ungetracten Kontext des roster-service — ein aus einem getracten Kontext geprägter Teilbaum würde services über die shadow-fiber des Aufrufers auflösen —, sodass er jeden agent überlebt und sich nur mit dem Teardown des ganzen Baums abwickelt. `serviceForAgent` liest die Instanz eines agents von einem service, den sein preset hinter einem `isolate`-realm gemountet hat, der außerhalb der Gruppe sonst unsichtbar ist.

### Das Kompositions-Inventar

`compositionInventory()` beantwortet Plugin-Listing-Oberflächen mit den abgeflachten Zeilen jedes presets neben seiner roster-Identität (id, trust, Anzeigename, Standard-Markierung): Ein preset mit lebendem standing-mount — innerhalb der eigenen root dieser Runtime gematcht, sodass eine zweite Cordis-Runtime im selben Prozess nie für es antwortet — antwortet aus den Loader-Einträgen seiner neuesten Generation, selbst wenn seine Datei seither broken geworden ist, denn der mount ist das, was sessions ausführen, und das broken-Urteil gilt nur für ein preset, das nichts komponiert hat; ein seit dem Boot nie komponiertes antwortet aus seiner Kompositionsdatei, wobei `!!js`-disabled-Gates gegen den Loader-Kontext ausgewertet werden, sodass beide Antworten denselben Host widerspiegeln. Lesen mountet nie ein preset — eine settings-Seite, die jede Komposition listet, aktiviert keine davon. Ein Gate, das der Evaluator ablehnt, bleibt `'conditional'`, und eine Datei, die zwischen dem Gesundheitsurteil der Discovery und dem Zeilen-Lesevorgang aufhörte, als Komposition zu lesen, wird mit dem erlebten Grund als broken gemeldet statt fallengelassen. Der Subpfad `./display` exportiert das `presetDisplayText`-fold, das mitgelieferte preset-ids auf ihre Wörterbuch-Textschlüssel abbildet; es hat keine imports, Browser-bundles inlinen es, und es ist die eine Heimat dafür, welche mitgelieferte id welchen Text trägt.

### Der mount-Audit

Ein direkt eingehängter Teilbaum fehlt in `ctx.loader.entries()`, sodass kein Boot-Audit ihn abdeckt; `mountPreset` beweist selbst, dass das Ergebnis benutzbar ist, und lehnt drei Formen ab: ein ungescopptes Ziel (die tools des presets würden sich global registrieren), eine Zeile, die noch auf einen service wartet, den die Komposition nie liefert, und eine Zeile, die einen service in den root-realm veröffentlicht hat (prozessglobal, sodass das zweite preset, das denselben Namen veröffentlicht, kollidiert). Der invariant-companion prüft die letzte Regel bei jeder service-Benachrichtigung erneut, weil eine Zeile, die aus einem Timer oder einer asynchronen Fortsetzung veröffentlicht, den einmaligen Audit umginge.

### Verfassungsmechanik

Eine Kopie dereferenziert Symlinks, damit sie in sich geschlossen ist, verschärft den Baum auf nur-Eigner (`0o600`-Dateien behalten ihr Eigner-Ausführungsbit, `0o700`-Verzeichnisse) und erstellt die root beim ersten Kopieren. Das kopierte `preset.yml` wird umgeschrieben: Die Beschreibung der Quelle bleibt zur Bearbeitung durch den Autor erhalten, Name und roster-`order` werden fallen gelassen, sodass der roster die Kopie weiterhin von ihrer Quelle unterscheidet. Entfernen lehnt mit dem Deployment ausgelieferte presets ab und löscht einen Nutzer-Standard, der das gerade gelöschte preset nannte.

### Der session-Datensatz

Der Erstellungs-Header nennt das preset, mit dem eine session gestartet ist; die `agentPreset`-Session-Projektion nennt das preset, auf dem sie läuft. Ein Wechsel hängt ein `agent-preset/selected`-Ereignis an, nachdem der Tausch committet ist, weil das preset die tool schemas und prompt-Abschnitte bestimmt, die das Modell sieht. Der service emittiert diese committed-Tatsache als ungescopptes cordis-Ereignis `agent-preset/selected(sessionId, agentPreset)` erneut. Die Rekonstruktion konsumiert die Projektion, die beim Erstellungs-Header beginnt und die neueste Auswahl anwendet; sie faltet das Log nie eigenständig.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-vertrag nicht ausreicht; sie führen vom Kompositionsmodell zu den scope- und prompt-Mechanismen, auf die der mount sich stützt, und zur Entscheidungsevidenz.

- [persona-Paket](../persona/README.de.md) — die komponierbare Zeile, die ein preset mountet, um einer session eine eigene persona zu geben.
- [Scope-Subsystem](../../../docs/subsystems/scope.de.md) — scope-keys und die parent-Kette, über die agents beitreten.
- [System-prompt-Subsystem](../../../docs/subsystems/system-prompt.de.md) — wie preset-prompt-Abschnitte sich registrieren und zusammensetzen.
- [Session-Paketkarte](../../session/README.de.md) — der dauerhafte session-Datensatz, an den ein preset-Wechsel anhängt.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-agent-presets) — jedes akzeptierte config-Feld und seine Quelldeklaration.
- [Pro-session-agent-presets-Notiz](../../../.agents/notes/implemented/architecture/2026-08-03-per-session-agent-presets.de.md) — Design-Begründung und Alternativen.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über die Plugins, die die standing-Komposition eines presets installiert und die jedes tool schema, jeden prompt-Abschnitt und jeden skill besitzen, den das preset den ihm beigetretenen agents sichtbar macht.

#### KV-Cache-Wirkung

Prefix-stabil für die Lebensdauer eines agents: Eine Komposition wird einmal installiert, bevor der agent veröffentlicht wird und damit vor seiner ersten Anfrage, und wird während des Laufs des agents nie erneut gelesen. Die Wahl eines anderen presets für eine neue session etabliert ein anderes Prefix nur für diese session und kann die Wiederverwendung für keine bereits laufende session ungültig machen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der roster ungeeignet ist oder besondere betriebliche Sorgfalt braucht. Es sind aktuelle Paket-Constraints, kein allgemeiner Kompositionsvergleich und kein Aufgabenrückstand.

- **Ein preset außerhalb der beschreibbaren root ist auffindbar, aber nicht löschbar** — `remove()` lehnt alles ab, was nicht unter der ersten `user`-root liegt, sodass ein Deployment, das eine eigene beschreibbare root konfiguriert und `includeUserRoot` eingeschaltet lässt, die harness-home-presets listet, mountet und bei jedem Löschen mit „liegt nicht unter der beschreibbaren preset-root" antwortet. Ein Deployment, das nur eigene presets will, setzt `includeUserRoot: false`.
- **Eine session kann das preset nicht mehr wechseln, sobald sie etwas produziert hat** — ein Wechsel verknüpft den parent-scope einer leeren session mit einem anderen standing-mount neu, und nur eine leere: Tools mitten im Gespräch zu tauschen würde tools stranden, die das Modell bereits aufgerufen hat.
- **Eine Generation ist allein auf die Kompositionsdatei gekeyed** — die Stempelprüfung bemerkt, dass sich `agent.cordis.yml` ändert, nicht eine Änderung an einer skill-Datei oder einem Asset daneben; die erreichen neue sessions erst, wenn sich die Kompositionsdatei selbst bewegt oder der Prozess neu startet.
- **Eine abgelöste Generation wird nie zurückgefordert** — bereits beigetretene sessions behalten die Generation, auf der sie laufen, und der roster hält keine Beitrittszahl, die sagen könnte, wann die letzte gegangen ist, sodass der ganze Teilbaum bis zum Prozessende gemountet bleibt. Die Kosten fallen pro Generation an statt pro session, aber sie sind nicht null: `dsh-skill-filesystem` beobachtet seine roots standardmäßig, sodass jeder Bearbeiten-dann-Erstellen-Zyklus einen Satz lebender watcher hinzufügt.
- **Eine Kopie wird zur Validierung nie gemountet** — sie ist bytidentisch mit ihrer Quelle, sodass eine auf der Platte defekte Quelle eine exakt ebenso defekte Kopie liefert; die Gesundheitsprüfung der Discovery markiert beide Zeilen beim nächsten roster-Lesen, statt den Fehlschlag auf einen session-Start zu verschieben.
- **Gesundheit fragt, was installiert ist, nicht was importieren würde** — Discovery beweist, dass die Komposition im loader-Dialekt parst, benannte Zeilen enthält und dass jede Zeile, von der sie beweisen kann, dass sie startet, ein Paket oberhalb der harness-Basis oder eine existierende Datei nennt; sie importiert nie eine, sodass ein Paket mit fehlender Einstiegsdatei, ein Plugin, das bei apply wirft, und eines, das ewig auf einen service wartet, alle noch bei der ersten session scheitern. `disabled` ist das einzige Eintragsfeld, das der Loader interpoliert, sodass eine Zeile mit einem Ausdruck dort ungeprüft bleibt statt aus der Datei beurteilt zu werden.
- **Eine Kopie ist ein driftender snapshot** — ein Upgrade des Deployments aktualisiert Kopien mitgelieferter presets nicht, und es gibt auf dieser Schicht keine patch-Semantik, um „standard plus eine Änderung" auszudrücken; der mitgelieferte Satz selbst nimmt denselben Preis in Kauf — `cordis` und `code` duplizieren jeweils die volle Zusammenstellung von `standard` und bearbeiten sie dann —, damit die gesamte Zusammenstellung in einer Datei lesbar bleibt.
- **Root-Scans werden nicht beobachtet** — jeder Lesevorgang trifft stattdessen das Dateisystem, was den roster frisch hält, aber bei jedem `list()` ein `readdir` pro root verursacht.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Design-Fragen und unentschiedene Richtungen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und akzeptierte Begründungen stehen in den Abschnitten oben, im Paket-Code und in den verlinkten Agent Notes.

#### Zukunft: abgelöste Generationen zurückfordern

Das Zurückfordern eines abgelösten standing-mounts braucht eine Zählung beigetretener agents auf `StandingMount`, inkrementiert in `mount`/`composeFrom`/`recompose` und dekrementiert, wenn der scope-key des agents stirbt — das `TODO` bei `ensureStanding`. Der Teilbaum ist nicht inert: `dsh-skill-filesystem` beobachtet seine roots, sodass eine nicht zurückgeforderte Generation einen Satz lebender watcher bis zum Prozessende am Leben hält.

</details>
