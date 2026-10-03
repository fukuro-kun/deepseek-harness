---
description: "Offizielle DeepSeek-Harness-Markenbesetzungen für die Sidebar, nur in offiziellen Builds aktiv; für Nutzer und Maintainer, die die Markendarstellung wählen oder ersetzen."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Dieses Paket versieht einen `official`-Client-Build in der Sidebar mit dem DeepSeek-Harness-Zeichen und -Namen. Andere Build-Profile behalten das Fisch-Zeichen und das Local-Build-Label der Shell, während der Conversation-Hero immer den animierten Fisch verwendet. Für Deployments mit der Marke DeepSeek Harness wählen; Deployments mit einer anderen Identität sollten ein Ersatz-Markenpaket bereitstellen. Es hat keinen Laufzeitzustand und beeinflusst keine Model-Requests.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Entwicklerhinweis](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Dieses Plugin im Browser-Roster eines Deployments mounten, dessen Identität die von DeepSeek selbst ist, und den Client anschließend mit dem `official`-Profil bauen, damit sich die Besetzungen registrieren.

### Das Profil wählen

`DSH_CLIENT_BUILD_PROFILE` bestimmt, welche Marke gerendert wird. Ein `official`-Build zeigt das offizielle Zeichen und den Namen in der Sidebar; jeder andere Wert belässt die Shell-Fallbacks — das Fisch-Zeichen und das Local-Build-Label — an Ort und Stelle. Der Conversation-Hero zeigt unabhängig vom Profil den animierten Hero-Fisch aus `dsh-client-ui-conversation`, da dieser Fallback bereits das offizielle Zeichen ist. Das Plugin lädt und validiert in beiden Fällen; nur die Registrierung ist profil-gesteuert.

### Die Marke ersetzen

Ein Deployment mit eigener Identität lässt dieses Paket weg und komponiert stattdessen ein anderes Paket, das die Sidebar-Slots besetzt — sowie den Hero-Slot, den dieses Paket auf seinem Fallback belässt. Das Besetzen eines Slots ist der einzige Kompositionsweg; eine Marken-Konfigurationsoberfläche gibt es hier nicht.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Die beiden Besetzungen installieren sich als ein deklarationsbewusster Registrierungssatz: Verschachtelte `ctx.slots.inject()`-Aufrufe warten auf die Sidebar-Deklaration, sodass der Satz funktioniert, egal ob diese Zeile vor oder nach dem Deklarierer aktiviert wird; beide Besetzungen werden zurückgezogen, wenn die Deklaration zusammenbricht, und es bleibt während HMR keine partielle Markenmischung zurück. Die Browser-Hälfte ist [`src/client/index.ts`](src/client/index.ts); die Node-Hälfte ist ein leerer Loader-Sitz. Der Browser-Titel ist eine Build-Umgebungs-Angelegenheit (`DSH_CLIENT_TITLE`), außerhalb des Slot-Systems.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn die Markenoberfläche nicht ausreicht. Sie führen von den Slots, die dieses Paket besetzt, zur Shell, die sie rendert.

- [ui-sidebar](../ui-sidebar/README.de.md) — deklariert `sidebar.brand.mark` und `sidebar.brand.name` und rendert deren Fallbacks.
- [ui-conversation](../ui-conversation/README.de.md) — deklariert `conversation.hero.brand.mark` im Hero.
- [Web-Client-Architektur](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.de.md) — wie Browser-Plugin-Zeilen laden und Slots registrieren.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket nur Browser-Präsentation beiträgt; nichts davon erreicht einen Model-Request.

#### KV-Cache-Effekt

Keiner; dieses Paket stellt weder einen Provider-Request zusammen noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wie die Markendarstellung geliefert wird. Sie sind gegenwärtige Paket-Constraints, kein Markendesign-Vergleich und kein Aufgabenrückstand.

- **Ein Besetzungssatz** — alternative Darstellung gehört in ein anderes Cordis-Paket, das dieselben Slots besetzt.
- **Der Browser-Titel ist unabhängig** — `DSH_CLIENT_TITLE` wählt den Titeltext zur Build-Zeit statt über einen UI-Slot.

<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Laufzeit-Invariante:** Es wird kein Companion veröffentlicht. Das Paket hält keinen veränderlichen Zustand, und seine drei Slot-Besetzungen installieren und entfernen sich über einen einzigen transaktionalen Effekt.
