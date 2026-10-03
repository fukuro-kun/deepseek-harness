---
description: "Der modellseitige skill-Katalog und das Loader-Tool für Nutzer und Maintainer, die verstehen wollen, was agents sehen, oder den Session-skill-Katalog konfigurieren."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-skill
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Agents können skills während einer Session entdecken und laden. Vor der ersten Anfrage erhalten sie einen dauerhaften Katalog der verfügbaren skill-Namen mit beschreibungen begrenzter Länge und können mit dem `skill`-Tool die vollständigen Anweisungen laden. Nutzer können einen skill mit `/name` aufrufen; das injiziert dieselben Anweisungen in diesen Schritt. Katalogänderungen hängen einen vollständigen Ersatz an, einschließlich eines leeren Katalogs, der alte Namen ausrangiert; `catalogDescriptionMaxLength` begrenzt die Länge jeder Beschreibung.

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

Mounten Sie das Plugin zusammen mit der skill-Registry, um agents einen Session-skill-Katalog und das `skill`-Loader-Tool zu geben. Es benötigt `ctx.agents`, `ctx.tools` und `ctx.skills`.

### Wann es verwenden

Verwenden Sie es, wenn agents skills während einer Session entdecken und laden sollen. Lassen Sie es weg, wenn das Laden von skills von einem anderen Consumer übernommen wird oder gar nicht benötigt wird — ohne es funktionieren Provider und Registry weiterhin, aber nichts rendert einen Katalog oder ein Tool für das Modell.

### Mounten und konfigurieren

Laden Sie das Plugin zusammen mit der skill-Registry und mindestens einem Provider. Die einzige Konfiguration begrenzt die normalisierte Beschreibungslänge, die im Katalog gerendert wird.

```yaml
- name: '@deepseek-ai/dsh-skill'
- name: '@deepseek-ai/dsh-skill-filesystem'
- name: '@deepseek-ai/dsh-tool-skill'
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `catalogDescriptionMaxLength` | `500` | Maximale normalisierte Beschreibungslänge im Session-Katalog; Minimum 3 |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-skill) ist die erschöpfende Quelle für jedes akzeptierte Feld.

### Was das Modell erhält

- **Ein Session-Katalog.** Wenn model-invocable skills existieren und das `skill`-Tool sichtbar ist, erhält der agent vor seiner ersten Anfrage eine dauerhafte Nachricht mit user-Rolle, die den Namen und eine längenbegrenzte Beschreibung jedes skills auflistet; die Nachricht weist das Modell an, einen skill vor dem Handeln über das Tool zu laden und niemals Anweisungen allein aus der Zusammenfassung abzuleiten.
- **Ein Loader-Tool.** Das Modell ruft `skill` mit dem exakten skill-Namen auf und erhält den vollständigen Anweisungskörper plus Ressourcen-Hinweise in einem kanonischen `<skill_content>`-Block; das Ergebnis bleibt als gewöhnliche Tool-Historie erhalten.
- **Expliziter Nutzer-Aufruf.** Ein `/name`-Token in direkter Nutzereingabe, das einen user-invocable skill benennt, injiziert die Anweisungen dieses skills in den Schritt, ohne dass das Modell ihn laden muss.
- **Live-Katalogaktualisierungen.** Spätere Änderungen an Mitgliedschaft, Beschreibung oder Sichtbarkeit hängen einen vollständigen Ersatzkatalog an; das Entfernen aller skills hängt einen leeren Katalog an, der ältere Namen ausrangiert.

### Beobachtbare Erfolge und Fehler

Das Laden eines gelisteten skills liefert seine vollständigen Anweisungen; das Modell sieht dieselbe kanonische Form, ob das Laden vom Tool oder von einem expliziten Nutzer-Aufruf kam. Ein ungültiger Name meldet `Error: invalid skill name "<name>"`, ein unbekannter Name meldet, dass der skill unbekannt oder nicht mehr verfügbar ist, und ein für den Modellaufruf deaktivierter skill meldet, dass er nicht für den Modellaufruf verfügbar ist. Der Katalog wird nur dann vollständig weggelassen, wenn keine model-invocable skills existieren und nie einer veröffentlicht wurde; ein späterer Sichtbarkeitsverlust — das `skill`-Tool wird verborgen oder von einem gleichnamigen scoped Tool überschattet — hängt stattdessen einen leeren Außerdienststellungs-Katalog an, wie beim Entfernen aller skills.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie der Katalog und die Aufrufgrenze aufgebaut werden; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) und im Abschnitt Model Experience unten vollständig abgedeckt.

### Designkonzept

Das Paket beruht auf zwei Ideen. Erstens ist der Katalog eine dauerhafte Projektion, die über einen Digest der veröffentlichten Einträge verglichen wird statt über die gerenderte Prosa, sodass das `<system-reminder>`-Framing niemals eine Neuveröffentlichung erzwingen kann und Consumers den `<available_skills>`-Block niemals neu parsen müssen. Zweitens bedient eine kanonische Renderform beide Ladepfade — das Tool-Ergebnis und die nutzerexplizite Injektion — über das von `dsh-skill` geteilte `renderSkillContent`, sodass das Modell unabhängig vom Auslöser dieselbe `<skill_content>`-Form sieht.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Tool-Registrierung, Katalog- und Gesture-pre-step-Listener, Rendering und Digest |
| — | Es wird kein runtime-invariant-Begleiter veröffentlicht; dieser modellseitige Adapter hat keinen eigenen Lifecycle-Stream; die Ausführungsbeziehungen gehören dem capability seam, den er aufruft. |

### Katalog-Lebenszyklus

Bei jedem berechtigten `agent/pre-step` macht das Plugin einen Snapshot des skill-Katalogs der aufrufenden Session, wendet die exakte `skill`-Tool-Sichtbarkeit an, filtert auf model-invocable skills und vergleicht einen Digest der Einträge mit der neuesten sichtbaren `skill-catalog`-Nachricht im Session-Log. Bei geändertem Digest übergibt es der `enter`-Entscheidung eine dauerhafte user-Rollen-Nachricht mit dem vollständigen Ersatzkatalog; ein leerer Ersatz rangiert frühere Namen explizit aus. Ein unvollständiger Provider-Snapshot sendet nichts und bewahrt die letzte gültige Sicht für den nächsten pre-step. Die Sichtbarkeitsprüfung vergleicht mit der exakten Tool-Definition, die dieses Plugin registriert hat, sodass ein scoped gleichnamiger Schatten sowohl das schema als auch seine Anleitung entfernt; das Plugin funktioniert global gemountet oder innerhalb der Komposition eines einzelnen agents.

### Aufrufgrenze

Der `/name`-Gesture-Listener durchsucht nur beanspruchte Nutzernachrichten: Ein whitespace-begrenztes Token, das einen user-invocable skill im Workspace-Katalog benennt, injiziert dieselbe `<skill_content>`-Renderform als `user`-Rollen-Anweisungskontext, der nach allen anderen Injektionen angehängt wird. Unbekannte Namen und vom Nutzer deaktivierte skills bleiben gewöhnliche Prosa. Dies ist der einzige Einstiegspunkt für `disable-model-invocation`-skills, die der Katalog und das `skill`-Tool niemals offenlegen.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der paketweite Vertrag nicht ausreicht. Sie führen vom Registry-Vokabular hinter dem Katalog zum exakten Tool-schema und zur Designbegründung.

- [Skill-Subsystem-Referenz](../../../docs/subsystems/skills.de.md) — das Registry- und Provider-Vokabular hinter dem Katalog.
- [skill-Paket](../skill/README.de.md) — die Registry und das geteilte `renderSkillContent`-Rendering.
- [Generierter Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-skill) — das exakte `skill`-schema, das das Modell erhält.
- [Agent Note zum nutzerexpliziten skill-Aufruf](../../../.agents/notes/archived/feature/2026-08-08-user-explicit-skill-invocation.md) — das Design der `/name`-Gesture.

-----

<a id="model-experience"></a>
## Model Experience

### Session-Katalog

#### Was das Modell sieht

Wenn model-invocable skills existieren und genau dieses `skill`-Tool sichtbar ist, erhält der agent vor der ersten Anfrage die untenstehende Katalogvorlage als dauerhafte user-Rollen-Nachricht, mit einem datenabhängigen Eintrag pro sortiertem skill. Spätere Änderungen an Mitgliedschaft, Beschreibung oder Sichtbarkeit hängen einen vollständigen Ersatz mit demselben `<available_skills>`-Umschlag an; das Löschen aller skills hängt einen leeren Umschlag mit expliziter Anweisung an, ältere Namen nicht zu verwenden. Der Schluss-Satz der Vorlage ist die Regel gegen Doppelladen: Die nutzerexplizite Gesture-Grenze (der pre-step-Listener unten) injiziert dieselbe `renderSkillContent`-Ausgabe (geteilt von `@deepseek-ai/dsh-skill`) inline, und der Katalog weist das Modell an, diesem Block zu folgen statt den skill erneut über das Tool zu laden; die Ersatzkatalog-Vorlage trägt dieselbe Anti-Doppellade-Regel in beiden Zweigen, einschließlich des geleerten Katalogs.

##### Skill-Katalog-Vorlage

```markdown
<system-reminder>
A skill is a reusable set of task-specific instructions. The following skills are available in this session:

<available_skills>
- `<name>`: <normalized-and-capped-description>
</available_skills>

If the user names a skill, or the task clearly matches a skill's description, call the `skill` tool with the exact skill name before taking task actions. Load all applicable skills, then follow their full instructions. This catalog contains summaries only; do not infer or follow a skill's instructions until it has been loaded.
A user may also invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the `skill` tool again for that skill.
</system-reminder>
```

#### Token-Effekt

Die wiederholten Eingabekosten skalieren mit der skill-Anzahl und `catalogDescriptionMaxLength`; bei leerer Liste oder verborgenem/überschattetem Tool werden keine initialen Katalog-Tokens gesendet. Jede tatsächliche Katalogänderung fügt eine beibehaltene vollständige Ersatznachricht hinzu.

#### KV-Cache-Effekt

Der initiale dauerhafte Katalog wird hinter dem bestehenden wiederverwendbaren Präfix angehängt. Dynamische Änderungen sind append-only-Historie nach diesem Katalog, sodass frühere wiederverwendbare Tokens intakt bleiben, während jeder neu angehängte Katalog und spätere Turns ein neues Suffix bilden. Eine neue oder wiederaufgenommene Instanz mit geändertem Digest kann die Cache-Wiederverwendung ab der Position des neu angehängten Katalogs beeinflussen.

### Tool-schema

#### Was das Modell sieht

Das Modell sieht das generierte [`skill`-schema](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-skill).

#### Token-Effekt

Feste schema-Kosten pro Anfrage, solange das Tool sichtbar ist.

#### KV-Cache-Effekt

Präfix-stabil, solange Tool-Definition und Sichtbarkeit unverändert sind. Überschattung, Restriktionen oder Plugin-Lifecycle-Änderungen können die Wiederverwendung ab diesem schema ungültig machen.

### Tool-Ergebnis

#### Was das Modell sieht

Ein erfolgreicher Aufruf verwendet die Ergebnisvorlage und die provider-verwaltete, Verzeichnis-, URL- oder opake Ressourcen-Anleitung unten.

##### Skill-Ergebnisvorlage

```markdown
<skill_content name="<escaped-name>">
<skill_resources>
<resource-guidance>
</skill_resources>

<skill_instructions>
<provider-owned-instruction-body>
</skill_instructions>
</skill_content>
```

##### Provider-verwaltete Ressourcen-Anleitung

```markdown
Resources for this skill are managed by provider "<provider>".
Load referenced resources only as needed.
```

##### Verzeichnis-Ressourcen-Anleitung

```markdown
Base directory for this skill: <path>
Resolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.
```

##### URL-Ressourcen-Anleitung

```markdown
Base URL for this skill: <url>
Resolve relative URLs mentioned by this skill against the base URL before using them. Load referenced resources only as needed.
```

##### Opake Ressourcen-Anleitung

```markdown
Resources for this skill: <description>
Load referenced resources only as needed.
```

#### Token-Effekt

Geladene Anweisungen sind datenabhängige Tool-Ergebnis-Tokens, die bei späteren Schritten erneut gesendet werden, bis die compaction sie entfernt; es wird keine doppelte `agent.inject()`-Kopie erstellt.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Anfrage-Präfix und macht keine bestehenden KV-Cache-Einträge ungültig.

### Tool-Fehler

#### Was das Modell sieht

Ungültige oder veraltete Auswahlen liefern exakt `Error: invalid skill name "<name>"`, `Error: skill "<name>" is unknown or no longer available` oder `Error: skill "<name>" is not available for model invocation`. Vom Provider geworfener Lookup-Text ist datenabhängig und erhält dieselbe `Error: <message>`-Hülle.

#### Token-Effekt

Nur ein fehlschlagender Aufruf fügt diese beibehaltenen Tokens hinzu.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Anfrage-Präfix und macht keine bestehenden KV-Cache-Einträge ungültig.

### Nutzerexplizite Aufruf-Injektion

#### Was das Modell sieht

Ein whitespace-begrenztes `/name`-Token an beliebiger Stelle in einer beanspruchten Nutzernachricht, das einen user-invocable skill im Workspace-Katalog benennt, injiziert die vollständige `<skill_content>`-Renderform dieses skills (exakt die Ergebnisvorlagen-Form oben) als `user`-Rollen-Anweisungskontext, der nach jeder anderen Injektion dieses Schritts angehängt wird — Hintergrund zuerst, das zu bearbeitende Material zuletzt. Nur direkte Nutzereingabe wird gescannt, die Prüfung läuft auf der geladenen Definition, und unbekannte oder vom Nutzer deaktivierte Namen bleiben gewöhnliche Prosa. Dies ist der einzige Einstiegspunkt für `disable-model-invocation`-skills, die der Katalog und das `skill`-Tool niemals offenlegen; der Schluss-Satz des Katalogs weist das Modell an, dem injizierten Block zu folgen statt ihn erneut zu laden.

#### Token-Effekt

Jede Gesture fügt diesem Turn einen gerenderten skill-Körper als injizierten Kontext hinzu — dieselbe Größe wie das Tool-Ergebnis für denselben skill, deterministisch auf Wunsch des Nutzers gezahlt statt nach Ermessen des Modells. Wiederholte Gestures für einen skill innerhalb eines Schritts injizieren nur einmal.

#### KV-Cache-Effekt

Append-only; die Injektion landet nach dem wiederverwendbaren Anfrage-Präfix innerhalb des Nachrichten-Batches des Schritts und macht keine bestehenden KV-Cache-Einträge ungültig.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Katalog oder der Loader schlecht passt. Es sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Der Katalog lässt `whenToUse`, Quelle und Provider-Metadaten weg** — das Routing basiert nur auf Name und längenbegrenzter Beschreibung; `whenToUse` bleibt Provider-Metadatum und wird auch vom geladenen Wrapper nicht gerendert.
- **Geladene Anweisungskörper haben keine Größenbegrenzung** — ein Provider kann einen skill zurückgeben, der genug Kontext des nächsten Schritts verbraucht; nur Katalogbeschreibungen werden gekürzt.
- **Ressourcen sind Anleitung, keine Anhänge** — das Tool meldet ein Basis-Verzeichnis/URL/opaken Hinweis, zählt aber referenzierte Dateien weder auf noch holt es sie für das Modell.
- **Laden ist einmaliger Text** — es gibt kein partielles, gestreamtes oder gecachtes Inhalts-Handle, wenn ein Remote-Provider langsam ist oder ein skill-Körper groß ist.
- **Katalogersatz ist ganze Liste** — ein geänderter Name oder eine geänderte Beschreibung hängt jede sichtbare Zusammenfassung an; das hält die Außerdienststellung veralteter Namen explizit, kostet aber Tokens proportional zum Katalog.
- **Körper sind nicht versioniert** — reine Körper-Änderungen verändern weder den Katalog-Digest noch benachrichtigen sie das Modell; ein späterer Tool-Aufruf liest den aktuellen Provider-Inhalt, während frühere Tool-Ergebnisse historische Fakten bleiben.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
