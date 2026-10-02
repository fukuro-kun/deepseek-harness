---
description: "Der gebündelte 'powered by dsh'-Badge-skill für Nutzer und Maintainer, die den optionalen Badge-Provider aktivieren, verwenden oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-badge

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Agents können den offiziellen „powered by dsh“-Badge-skill von diesem gebündelten Provider laden und dessen Anweisungen folgen, um Attribution-Badges zu Dokumenten, pull requests und anderen mit DeepSeek Harness erzeugten Inhalten hinzuzufügen. Der Provider hat keine Konfiguration, und die ausgelieferte CLI-Komposition enthält das Plugin deaktiviert, sodass Deployments es explizit aktivieren. Der skill liefert sowohl Markdown-Snippets als auch ein paketiertes PNG für Systeme, die entfernte Bilder nicht zuverlässig importieren können.

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

Aktivieren Sie das Plugin, um den `dsh-badge`-skill im Session-skill-Katalog verfügbar zu machen; das Modell kann ihn dann wie jeden anderen skill laden und dessen Anweisungen zum Hinzufügen eines „powered by dsh“-Badge folgen.

### Wann ihn wählen

Wählen Sie diesen Provider, wenn mit DeepSeek Harness erzeugter Inhalt offizielle Attribution-Badges tragen soll und das Deployment den Badge-skill für agents verfügbar haben möchte, ohne ihn in einem lokalen skill-Verzeichnis zu speichern. Überspringen Sie ihn, wenn das Badge für das Deployment irrelevant ist — das Plugin ist standardmäßig deaktiviert und fügt nichts hinzu, bis es aktiviert wird.

### Das Plugin aktivieren

Das Plugin hat keine Konfiguration. Fügen Sie seine Kompositionszeile einer Komposition hinzu; die ausgelieferte CLI-Komposition trägt die Zeile als `disabled: true`, aktivieren Sie sie dort also explizit.

```yaml
- name: '@deepseek-ai/dsh-skill-badge'
```

Nach der Aktivierung erscheint `dsh-badge` in den verfügbaren skills des Session-Katalogs. Der skill deckt entfernte Markdown-Badges (auf Shields.io-Basis) und ein paketiertes PNG-Badge-Asset für Ziele ab, die entfernte Bilder nicht zuverlässig abrufen können.

### Was der Badge-skill bereitstellt

- **Markdown-Snippets.** Anweisungen zum Einbetten des offiziellen Badge-Markups in Dokumente, pull requests und merge requests.
- **Paketiertes PNG-Asset.** Eine `dsh-badge.png`-Ressource (726×120-Quelle, gerendert mit 121×20), die dort funktioniert, wo entfernte Bilder nicht importiert werden können.

### Beobachtbarer Erfolg und Fehler

Das Aktivieren des Plugins lässt `dsh-badge` im Katalog erscheinen und per Name ladbar werden; das Deaktivieren oder Weglassen der Zeile hält es aus jedem Katalog heraus. Weil der Provider immutable ist, gelingt die Discovery immer mit genau einem skill und meldet niemals Teilergebnisse.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie der gebündelte Provider verdrahtet ist; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designkonzept

Der Provider ist eine immutable, synchron registrierte skill-Quelle: Er registriert einen festen Kandidaten auf dem gebündelten skill-Rang (600) unter dem Provider-Namen `dsh-badge`, exponiert sein paketiertes `assets/`-Verzeichnis als Verzeichnis-Ressourcenbasis des skill und liest den skill-Body bei jedem Laden aus der paketierten `assets/dsh-badge.md`-Datei.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg und der immutable Provider: ein Kandidat, Ressourcenbasis, Body-Laden |
| — | Es wird kein Runtime-invariant-Begleitexport veröffentlicht; das Paket besitzt eine einzelne immutable Provider-Registrierung, während das skill registry Eindeutigkeit der Registrierung und Lifecycle-Prüfungen besitzt. |
| [`assets/`](assets/) | Paketierter skill-Body (`dsh-badge.md`) und PNG-Asset (`dsh-badge.png`) |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie führen vom registry, auf dem sich dieser Provider registriert, bis dazu, wie der skill das Modell erreicht.

- [Skill-Subsystem-Referenz](../../../docs/subsystems/skills.de.md) — der registry- und Provider-Vertrag, den dieser Provider implementiert.
- [skill-Paket](../skill/README.de.md) — das registry, auf dem sich der Provider registriert, und das gemeinsame Rendering geladener skills.
- [tool-skill-Paket](../tool-skill/README.de.md) — wie der Badge-skill den Session-Katalog und das Modell erreicht.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über `dsh-tool-skill`, das den Katalogeintrag des Providers und den gewählten skill-Body an das Modell rendert.

#### KV-Cache-Effekt

Standardmäßig deaktiviert, ändert das Plugin keine Anfrage. Aktiviert ändern sein Katalogeintrag und jeder geladene Body das Provider-KV-Präfix an ihren Einfügepunkten.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was der gebündelte Provider nicht tut. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Ein fester skill, keine Runtime-Anpassung** — der Provider trägt genau den `dsh-badge`-skill bei; Deployments, die eine andere Badge-Variante brauchen, schreiben stattdessen ihren eigenen skill.
- **Entferntes Markdown setzt auf Shields.io** — das entfernte Badge-Markup bettet ein Shields.io-Bild ein; verwenden Sie das paketierte PNG, wenn das Ziel entfernte Bilder nicht zuverlässig abrufen kann.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
