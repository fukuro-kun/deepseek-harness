---
description: "System-Prompt-Assembly für Nutzer und Maintainer, die Prompt-Abschnitte, Variablen, Tool-Schema-Quellen hinzufügen oder den modellseitigen Prompt konfigurieren."
kind: "package-reference"
---

# @deepseek-ai/dsh-system-prompt
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-system-prompt` lässt Agents pro Model-Schritt einen geordneten System-Prompt und die verfügbaren Tool-Schemas erhalten. Verwenden Sie es, um Prompt-Abschnitte, dynamische Runtime-Fakten, wiederverwendbare Variablen oder Tool-Schemas hinzuzufügen oder um die feste Harness-Identität, Deployment-Persona, den Runtime-Kontext und die modellseitige Tool-Reihenfolge zu steuern. Agent-scoped Beiträge überschreiben gleichnamige globale Defaults, ohne andere Agents zu beeinflussen. Ungültige Complete-Prompt-Kombinationen und unaufgelöste Variablen lassen die Assembly fehlschlagen, statt einen fehlerhaften Prompt zu senden.

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

Mounten Sie `dsh-system-prompt` überall dort, wo Agents laufen: Es stellt `ctx.systemPrompt` bereit, die Registry, in der jeder Prompt-Beitrag landet. Beiträge sind scoped — Registrierung über `agent.ctx` wirkt nur auf diesen Agent und shadowed ein gleichnamiges Globales.

<a id="configure-the-prompt"></a>
### Den Prompt konfigurieren

Die Config besitzt den festen Opener, den Runtime-Kontext, das Deployment-Persona-Präfix und -Suffix sowie die Tool-Reihenfolge; alles andere kommt aus registrierten Beiträgen.

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
  config:
    includeHarnessIdentity: true
    includeRuntimeContext: true
    personaPrefix: 'You are the deployment assistant.'
    toolOrder: ['<unlisted-tools>']
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `includeHarnessIdentity` | `true` | Den festen First-Party-Opener `You are an AI agent powered by DeepSeek Harness.` an Order −1000 aufnehmen. Nur dann auf false setzen, wenn ein Kompatibilitäts-Deployment den vollständigen System-Prompt besitzt. |
| `includeRuntimeContext` | `true` | Geordneten dynamischen Runtime-Kontext in die Assembly aufnehmen |
| `personaPrefix` | `''` | Globales Persona-Präfix-Template an Order `0`, vor der First-Party-Anleitung |
| `personaSuffix` | `''` | Globales `deployment:persona-suffix`-Template an Order `10200`, nach der First-Party-Anleitung |
| `toolOrder` | — | Explizite modellseitige Tool-Reihenfolge mit einem `'<unlisted-tools>'`-Rest-Eintrag |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-system-prompt) ist die erschöpfende Quelle für jedes akzeptierte Feld. Eine `toolOrder`-Liste ohne genau einen Rest-Eintrag oder mit Duplikaten schlägt beim Laden fehl; ein gelisteter Name ohne registriertes Tool weist jedes `assemble()` zurück.

### Einen Prompt-Abschnitt beitragen

Abschnitte tragen statischen oder kontextaufgelösten Text mit einer `order`; sie werden in aufsteigender Reihenfolge konkateniert, gleiche Orders nutzen Code-Unit-Namensreihenfolge. Repo-eigene Beitragende lösen zentral vergebene Positionen über `ctx.systemPrompt.getSectionOrder(name)` auf; Runtime-Context-Beitragende verwenden `getContextOrder(name)`. Externe Beiträge dürfen jede endliche Order verwenden. Ein `complete: true`-Abschnitt wird nach der Assembly zum exakten vollständigen Prompt; mehr als ein effektiver Complete-Abschnitt lässt die Assembly fehlschlagen.

```text
ctx.systemPrompt.section({
  name: 'tool:bash',
  order: 100,
  text: 'Prefer bash for file and process operations.',
})
```

### Eine Prompt-Variable beitragen

Variablen werden aus Abschnittstext als `{{name}}` referenziert und bei jeder Assembly aufgelöst; scoped Variablen shadowed ein gleichnamiges Globales für diesen Agent. Der Loop liefert `model` und `cwd`; jedes Plugin kann die Fakten registrieren, die es besitzt.

```text
ctx.systemPrompt.variable('cwd', ({ agent }) => agent?.session.header.cwd)
```

### Tool-Schemas beitragen

Tool-Schema-Provider werden pro Assembly ausgewertet und tragen die modell-sichtbare `ToolSchema`-Menge bei; `ToolRuntime` registriert sich selbst automatisch, sodass die meisten Tools hier keine manuelle Verdrahtung brauchen. Ein Provider gibt die sichtbare Menge nach der Restriktion zurück, plus das Namens-Universum vor der Restriktion, das `toolOrder` verwendet.

### Runtime-Kontext unterdrücken

`suppressRuntimeContext()` entfernt jeden dynamischen Runtime-Context-Beitrag für den aufrufenden Scope, ohne die Services zu deaktivieren, die die zugrundeliegenden Fakten besitzen; mehrere Suppressoren komponieren, und der Effekt stellt den Kontext wieder her, wenn keiner mehr übrig ist.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie das Paket das obige Verhalten umsetzt; der beobachtbare Vertrag ist in [Dieses Paket verwenden](#use-this-package) behandelt.

### Design-Konzept

Das Paket ist eine Registry plus eine kooperative Assembly-Pipeline. Ein `assemble()`-Aufruf merged den globalen Layer mit dem Layer des angefragten Scopes, löst Tool-Parameter ab, kanonisiert die Abschnittsreihenfolge nach Zahl und dann Name, führt den scope-gefilterten `system-prompt/assemble`-Waterfall aus, stellt einen effektiven Complete-Abschnitt als einzigen Prompt-Abschnitt wieder her und wendet jeden aktiven Runtime-Context-Suppressor an. Abschnitte und dynamische Kontexte sind getrennte Eingaben: Abschnitte werden Prompt-Text, während Kontexte unter dem Loop zu gesourcten User-Role-Snapshots in der Model-Historie werden. Tool-Schemas sind designbedingt Teil der Assembly — „was dem Modell gesagt wird, dass es tun kann" ist eine kohärente Sache, auch wenn Adapter Schemas als separates Wire-Feld übertragen.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `SystemPrompt`-Service, Config, Assembly-Pipeline, `renderPrompt` |
| [`src/invariant.ts`](src/invariant.ts) | Invarianten-Begleiter |

### Assembly und Rendering

Assembly löst und rendert in zwei Stufen: `assemble()` gibt Abschnitte mit aufgelöstem, aber nicht interpoliertem Text, die geordneten Tool-Schemas und jede registrierte, gegen den Kontext aufgelöste Variable zurück, während `renderPrompt()` `{{variable}}`-Referenzen interpoliert, leere Abschnitte entfernt und mit Leerzeilen verbindet — strikt: Eine unbekannte Referenz, eine registrierte, aber wertlose Referenz oder eine fehlerhafte Complete-Gruppe wirft, weil ein fehlerhafter Prompt schlimmer ist als ein lauter Fehlschlag. `toolOrder` kanonisiert die gesammelten Tools vor dem Waterfall (Registrierungsreihenfolge ist ein Plugin-Load-Artefakt); ein Waterfall-Listener, der die Liste mutiert, besitzt die Deterministik dessen, was er emittiert.

### Scoping

Scoped Abschnitte, Variablen und Tool-Provider shadowed Globales für einen Agent, und der Assembly-Waterfall dispatcht scope-gefiltert. Registry-Change-Benachrichtigungen (`system-prompt/change`) sind bewusst ungefiltert, weil eine globale Änderung jeden Scope betrifft.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Der Paketvertrag reicht für die meisten Consumer; lesen Sie diese Seiten, wenn Sie das umgebende Domain-Wissen brauchen.

- [System-Prompt-Subsystem](../../../docs/subsystems/system-prompt.de.md) — die exakten paketübergreifenden Typen und die generierte Service-API.
- [tools-Paket](../tools/README.de.md) — die Tool-Registry, deren Schemas in die Assembly fließen.
- [Prompt-Variablen-Agent-Note](../../../.agents/notes/implemented/architecture/2026-07-05-prompt-variables-and-tool-guidance-ownership.de.md) — wer welche Prompt-Fakten besitzt.
- [First-Party-Prompt-Order-Agent-Note](../../../.agents/notes/archived/architecture/2026-08-25-sparse-first-party-prompt-section-orders.md) — die sparse benannte Order-Vergabe.
- [Core-Gruppenkarte](../README.de.md) — wie die Core-Pakete komponieren.

-----

<a id="model-experience"></a>
## Model Experience

### System-Prompt

#### Was das Modell sieht

First-Party-Abschnitte rendern die Harness-Identität, das Deployment-Persona-Präfix (inklusive der Model-Name-Vorstellung), wiederverwendbare Anweisungen (inklusive der generierten Tools-SDK- und Structured-Output-Anleitung), dann das umgebungstragende Suffix: Harness-Quelle (`10000`), Web-Oberfläche (`10100`) und Deployment-Persona-Suffix (`10200`). Externe Abschnitts-Orders und Assembly-Listener bleiben autoritativ. `includeHarnessIdentity: false` lässt nur diesen festen Opener weg. Leere Abschnitte verschwinden; scoped Abschnitte und Variablen können Globales für einen Agent shadowed. Der `system-prompt/assemble`-Waterfall bestimmt den ausgelieferten Prompt und die Tool-Schemas, es sei denn, ein effektiver Abschnitt deklariert sich als complete — dieser exakte Abschnitt wird dann zum gesamten System-Prompt, während die Kontexte, Tools und Variablen des Waterfalls bestehen bleiben. Der gerenderte Prompt erreicht das Modell als System-Role-Nachricht abgeleiteter Historie — Surface-Knoten 0 oder der neueste System-Knoten nach einem In-History-Update —; weder der Loop-Request noch `request/header` tragen ein separates `system`-Feld. Wenn das vollständige Rendering leer ist, räumt der Loop jeden aktiven System-Knoten durch geloggte leere Ersetzungen auf, sodass kein älterer Prompt in der Model-Historie bleibt. Geordnete dynamische Kontexte sind von Abschnitten getrennt und werden nur dann zu gesourcten User-Role-Snapshots, wenn sie vorhanden sind; `includeRuntimeContext: false` oder ein scoped Suppressor entfernt sie alle.

##### Harness-Identität

```markdown
You are an AI agent powered by DeepSeek Harness.
```

#### Token-Effekt

Identität ist eine feste Kostenstelle pro Request, wenn aktiviert. Persona-Präfixe, -Suffixe und Plugin-Text werden pro Request wiederholt und skalieren mit ihrem gerenderten Inhalt.

#### KV-Cache-Effekt

Präfix-stabil, solange Identität, Persona, Variablen, Abschnittstext und Reihenfolge identisch rendern: Ein unverändertes Rendering lässt die System-Knoten unangetastet, es sei denn, eine unfähige Route oder eine neue Request-Serie muss zurückbehaltene In-History-Prompts konsolidieren. Ohne `systemPromptUpdate` wird nicht-leerer Prompt-Text am ersten System-Knoten durch geloggte pro-Knoten-Ersetzungen konsolidiert, sodass ein Head-Rewrite die Präfix-Wiederverwendung ab seinem ersten geänderten Token verliert; wenn der vorbereitete Call `systemPromptUpdate: 'in-history'` deklariert, hängt der Agent-Loop einen nicht-leeren geänderten Prompt innerhalb einer fortgesetzten Request-Serie hinter die gecachte Historie, sodass das Präfix durch diese Historie wiederverwendbar bleibt ([Entscheidungsregel](../agent-loop/README.de.md#understand-the-implementation)). Bei gleichem Modell, Persona-Präfix, Tools und vorangehenden Anweisungen lassen unterschiedliche Quell-Pfade, lokale Web-URLs oder Persona-Suffix-Werte das wiederverwendbare First-Party-Präfix unverändert. Persona-Präfix-Änderungen können das frühe Präfix ändern. Jede Änderung kann die Wiederverwendung ab dem ersten geänderten Token ungültig machen; Provider-Cache-Sharing und gemessene Hit-Rates sind nicht garantiert.

### Tool-Schemas

#### Was das Modell sieht

Bei ausgelieferten Tools erhält das Modell die pro-Agent-sichtbare Teilmenge der [generierten Tool-Schemas](../../../docs/tool-catalog.de.md#deepseek-aidsh-tools), nach Restriktionen und Assembly-Interception konfigurations- oder lexikografisch geordnet. Erweiterungen können über dieselbe Registry zusätzliche Definitionen beitragen. Abschnitte und Schema-Provider sind getrennte Assembly-Eingaben. Eine Restriktion entfernt keine Abschnitts-Registrierung: Tool-Anleitungs-Plugins verwenden `text({ scope })` und `ctx.tools.get(name, scope)`, um leeren Text zurückzugeben oder anwendbare Fragmente auszuwählen. Beliebige statische Abschnitte werden nicht automatisch umgeschrieben.

#### Token-Effekt

Schema-Tokens wiederholen sich bei jedem Request. Die Restriktion eines Tools entfernt seine gesamten Schema-Kosten für diesen Agent, aber nicht einen separaten Prompt-Abschnitt; Neuordnung ändert die Cache-Form, aber nicht den semantischen Inhalt.

#### KV-Cache-Effekt

Präfix-stabil, solange die sichtbare Schema-Menge, das Rendering und die Reihenfolge unverändert sind. Registrierung, Restriktion oder Neuordnung können die Wiederverwendung ab dem ersten geänderten Schema-Token ungültig machen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann Prompt-Assembly besondere Sorgfalt braucht. Sie sind aktuelle Paket-Einschränkungen, kein Aufgabenstapel.

- **Deployment-authored Prompt-Text ist nur Config/Komposition** — dieses Plugin besitzt die globalen Persona-Präfix- und -Suffix-Defaults, Creator-Plugins dürfen Agent-scoped Shadows registrieren, und andere Abschnitte kommen vom Plugin, das den Fakt besitzt; es gibt keine Endnutzer-Prompt-Editing-API.
- **Keine Escape-Syntax für literale `{{…}}`-Klammern** — jede vollständige Gruppe wird gegen registrierte Variablen interpoliert; ein Escape wird zurückgestellt, bis ein echter Prompt eines braucht.
- **`toolOrder`-Fehlkonfiguration taucht bei der Prompt-Assembly (dem ersten Turn) auf, nicht beim Boot** — nur Form-Verletzungen werfen beim Config-Load.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
