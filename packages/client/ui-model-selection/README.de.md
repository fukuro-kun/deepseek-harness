---
description: "Model selection für die Web-GUI: das /model-Popup und der Composer-Modellsitz über einem pro-Session, nach Provider gruppierten Verzeichnis; für Nutzer und Maintainer des Modell-Routings."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-model-selection
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Die Web-GUI lässt Nutzer Modell und Reasoning-Effort einer bestehenden Session entweder über das `/model`-Popup oder über das Modell-Control des Composers wechseln. Beide Oberflächen präsentieren dieselben provider-gruppierten Auswahlmöglichkeiten, und das gewählte Modell bestimmt die verfügbaren Effort-Namen und den Default. Eine vollständige Auswahl gilt für den nächsten Request; ein laufender Schritt behält Modell und Effort, mit denen er gestartet wurde. Wenn kein Adapter die Route der Session bedienen kann, bleibt der Composer deaktiviert, bis Routing wieder verfügbar ist.

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

Dieses Plugin zusammen mit `ui-conversation` und dem Commands-Paket mounten; der Composer zeigt dann den Modellsitz neben dem Pending-Indikator, und `/model` öffnet dasselbe Verzeichnis als Popup. Beide Oberflächen zeigen die vom Host gemeldete aktuelle Auswahl, wenn das exakte Provider/Modell-Paar in den beworbenen Gruppen verbleibt; eine fehlende Katalogzeile lässt die routable Auswahl intakt, während der Trigger `Select model` anzeigt.

### Modell und Effort

Modelle bleiben nach Provider gruppiert. Das Composer-Menü zeigt nur Modell- und Effort-Namen. Das `/model`-Popup zeigt Provider-Namen und Katalogbeschreibungen; es lokalisiert die zwei eingebauten DeepSeek-Beschreibungen und lässt externe Provider-Beschreibungen unverändert. Das Popup wendet den Default-Effort des gewählten Modells an; der Composer kann danach jeden beworbenen Effort wählen. Ein Adapter ohne Reasoning-Metadaten lässt die Effort-Zeile aus; es gibt keine freie Effort-Eingabe.

### Nicht routbare Sessions

Wenn der Host meldet, dass kein Adapter die Route der Session bedient, setzt dieses Plugin einen Composer-Block und der Input geht mit eigenem Wortlaut in einen inerten Zustand; eine Wiederherstellung hebt ihn ohne Reload auf. Ein `null` vor dem ersten Laden oder nach einem Fehlschlag blockiert nie, und Katalog-Mitgliedschaft blockiert ebenfalls nie — eine Route, die ein nicht beworbenes Modell bedient, fehlt in den Gruppen und bleibt dennoch nutzbar.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Zwei Einträge über EINEM pro-Session-Verzeichnis, das `ModelDirectoryResolver` (`ctx.modelDirectories`) besitzt: Der `/model`-popupSelect-Beitrag (registriert über `ctx.commandUi`) und der benannte `conversation.input.model`-Sitz des Composers laden das Advisory-Verzeichnis der Session über `session.models` und senden über `session.selectModel` durch dieselbe `ModelDirectory`-Instanz, sodass ein Wechsel in einem Eintrag genau das ist, was der andere als Nächstes anzeigt. Directory-Loads und Auswahlen teilen einen Generationszähler, sodass eine ältere Antwort nie eine neuere überschreibt; ein Connection-Reset verwirft jede residente Projektion und zieht die vom Host wiederhergestellte Auswahl erneut. Verzeichnisse sind pro Session, werden lazy aufgelöst und mit dem Session-Scope disposed; adressierte Subagent-Sessions exponieren keinen der beiden Einträge. Jedes residente Verzeichnis refetcht direkt auf weitergeleitete `llm/adapters-updated`- und `settings/document-updated`-Owner-Events.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn die Modell-Oberfläche nicht ausreicht. Sie führen von den Browser-Oberflächen zur Kommando-Popup-Shell und zum Selection-Vertrag.

- [ui-commands](../ui-commands/README.de.md) — die popupSelect-Shell, in die sich der `/model`-Beitrag registriert.
- [ui-conversation](../ui-conversation/README.de.md) — deklariert den `conversation.input.model`-Sitz des Composers und den Composer-Block.
- [dsh-agent-default-model](../../core/agent-default-model/README.de.md) — der Default-Model-Service für Sessions, die nie wählen.
- [Client-Paketkarte](../README.de.md) — benachbarte Browser-UI-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über die `session.selectModel`-Auswahl, die beide Einträge senden: Der Host snapshotet die vollständige `ModelSelection` an der nächsten Prompt-Assembly-Grenze und besitzt die modell-sichtbare Auswirkung, während ein laufender Schritt seine assemblierte Auswahl behält.

#### KV-Cache-Auswirkung

Ein Routenwechsel kann die providerseitige Cache-Wiederverwendung für folgende Requests verringern oder invalidieren; das Prompt-Präfix selbst bleibt unberührt.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die aktuelle Modell-Oberfläche. Es sind aktuelle Paket-Constraints, kein allgemeiner Modell-Router-Vergleich und kein Aufgaben-Backlog.

- **Keine Auswahl zur Erstellungszeit oder für adressierte Subagents** — beide Einträge erfordern den Agent einer bestehenden gewöhnlichen Session; es gibt keine Draft-Phase-Modellwahl, die in die Session-Erstellung einfließen könnte, und die Subagent-Fortsetzung exponiert bewusst keinen eigenen Model-Selection-Vertrag.
- **Verzeichnisnamen sind reine Darstellung** — Auswahl und Persistenz verwenden Provider-/Modell-/Effort-IDs; ein Provider, dessen Katalog- oder Exaktmodell-Metadaten-Lookup fehlschlägt, wird bis zum Reload als nicht wählbare Fehlerzeile gelistet.
- **Keine freie Effort-Eingabe** — der Composer bietet nur die adapter-beworbenen Stufen des exakten Modells; ein Adapter ohne Reasoning-Metadaten lässt die Effort-Zeile aus.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Eine einzige Command-Contribution-Registrierung, deren Disposal durch die HMR-Safety-Spec bewiesen ist — sie emittiert keine Cordis-Events und besitzt keinen pluginübergreifenden mutablen Zustand.
