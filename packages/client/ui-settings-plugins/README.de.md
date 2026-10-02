---
description: "Der Settings-Abschnitt „Plugins“ des dsh Web-Clients: von Features besessene Tabs, die konfigurierbaren Plugin-Karten der Host-Ebene und der Extension Point settings.plugin.item."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-plugins

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Verwende den Settings-Abschnitt **Plugins**, um die Plugins zu konfigurieren, die das aktuelle Deployment exponiert, und um feature-spezifische Plugin-Seiten zu öffnen. Der Tab **Plugin-Konfiguration** zeigt für jedes unterstützte Plugin eine aufklappbare Karte, markiert, welche Werte der Nutzer überschrieben hat, und lässt ihn sie auf die Deployment-Defaults zurücksetzen. Karten halten Änderungen lokal, bis gespeichert wird. Hat sich die Konfiguration nach dem Laden der Karte geändert, wird das Speichern abgelehnt, statt die neueren Werte zu überschreiben.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Öffne den Abschnitt „Plugins“ in den Settings und wähle den Tab **Plugin-Konfiguration**, um die Host-Ebenen-Plugins zu bearbeiten, die dieses Deployment komponiert. Die Karten erscheinen in dieser Reihenfolge: der Shell-Executor (`bash`), die Tool-Call-Parallelität des Agent Loop (`agent-loop`), die Subagent-Modellauswahl (`subagent-model-selection`) und der DeepSeek-Search-Provider (`web-search-deepseek`).

### Was hier erscheint

Der Tab liest, welche Settings-Namespaces der Host bedient, und dispatcht einen Slot-Key pro Namespace; gerendert wird also die Schnittmenge zweier Ledger: die Namespaces, die ein laufendes Host-Plugin registriert hat, und die unter diesen Keys registrierten Karten. Ein bedienter Namespace, den keine Karte beansprucht, rendert nichts, und eine Karte, deren Namespace dieses Deployment nicht bedient, wird nie dispatcht. Der leere Zustand wartet auf die erste Antwort des Hosts, sodass ein unbeantworteter Read nie als „dieses Deployment konfiguriert kein Plugin“ gelesen wird.

### Bearbeiten und Speichern

Eine Karte staged, was der Nutzer tippt, und schreibt es erst beim Speichern. Jedes Control rendert den gestagten Text, sodass auf dem Bildschirm genau das steht, was ein Speichern ablegen würde; **Verwerfen** lässt die Entwürfe fallen, und eine Karte mit ungespeicherten Änderungen zeigt das im Header an, auch im eingeklappten Zustand. Ein erfolgreiches Speichern klappt die Karte ein, nachdem der Re-Read die Writes bestätigt hat; ein fehlgeschlagenes Speichern hält die Karte offen, meldet den Fehler und behält die Entwürfe zur Korrektur. Ein Reset staged den komponierten Default, statt sofort zu schreiben, und ein Entwurf, den das Feld nicht akzeptiert, blockiert das Speichern, statt verworfen zu werden. Der Host ist die einzige Autorität darüber, ob ein Wert akzeptiert wurde.

Die Subagent-Karte staged ihren Permission-Schalter und die exakten Modell-Checkboxen gemeinsam. Das Aktivieren erfordert mindestens eine ausgewählte Adapter-Route. Das Speichern übermittelt `enabled` und `allowedModels` in einer einzigen Mutation, die mit der Revision umzäunt ist, bei der der Entwurf begann; eine neuere Host-Revision markiert den Entwurf als fehlgeschlagen, statt eine widerrufene Route wiederherzustellen. Das Deaktivieren behält die ausgewählten Routen zur späteren Wiederverwendung. Verfügbare Modelle sind nach Provider gruppiert, während gespeicherte Routen, die im aktuellen Katalog fehlen, zuletzt erscheinen und weiterhin entfernbar bleiben. Adapter-Namen und Modellbeschreibungen bleiben Live-Directory-Metadaten und werden nicht gespeichert; die Karte frischt sie nach Adapter-Änderungen, Settings-Commits und Reconnects auf.

### Felder mit Secret-Rolle

Ein Key-Control startet leer, meldet nur, ob einer konfiguriert ist, und schreibt über die Credentials-Domain statt über den Settings-Abschnitt; ein leerer Entwurf schreibt nichts und behält den gespeicherten Key.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Der Abschnitt ist ein Extension Point plus eine Dispatch-Regel: Feature-Plugins besitzen ihre Karten; der Tab paart bediente Namespaces mit registrierten Karten per Slot-Key.

### Der Tab-Extension-Point

Der Abschnitt deklariert `settings.plugins.tab`, einen Root-Listen-Slot, dessen Labels zu geordneten Tabs werden; ein Tab bleibt nach seiner ersten Auswahl gemountet, sodass lokale Entwürfe und Read-only-Snapshots Tab-Wechsel überleben. Das Paket registriert seinen eigenen `configurable`-Beitrag, der den verschachtelten Slot `settings.plugin.item` deklariert — keyed auf den Settings-Namespace, den eine Karte bearbeitet. Ein Plugin mit Browser-Hälfte registriert seine eigene Karte unter seinem eigenen Namespace und besitzt jeden Teil davon: Chrome, Controls und Copy. Tabs folgen dem `order` des Beitrags; Karten folgen der Registrierungsreihenfolge.

### Der Write-Pfad

Das Speichern schreibt gestagte Felder über den Client-Settings-Scope, der jeden Write oder jede geordnete Mutation mit der Namespace-Revision umzäunt, die der Entwurf gelesen hat, sodass ein vom Dokument abgedriftetes Formular abgelehnt wird, statt eine konkurrierende Änderung zu überschreiben. Die Anwesenheit eines Felds im rohen User-Layer — nicht sein Wert — markiert es als überschrieben; ein Reset löscht dieses Feld, sodass es den Composition-Layer erneut erbt. Felder mit Secret-Rolle reisen nie auf einer Response mit; die Karte re-readet, wenn das weitergeleitete Event `credentials/reference-updated` die Referenz meldet, die sie beobachtet.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten behandeln die Settings-Basis, den Inventory-Tab und die durable Seams hinter den Karten.

- [ui-settings](../ui-settings/README.md) — die Domain-Basis, die `settings.plugins.tab` und den Settings-Scope deklariert.
- [ui-settings-plugin-inventory](../ui-settings-plugin-inventory/README.md) — der Read-only-Tab „Plugin-Liste“ im selben Abschnitt.
- [settings](../../settings/README.md) — der durable User-Settings-Seam und sein File-Provider.
- [credentials](../../credentials/README.md) — der Credential-Reference-Seam, über den Secret-Felder schreiben.
- [ui-settings-general](../ui-settings-general/README.de.md) — die Settings-Shell, die diesen Abschnitt hostet.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket eine browserseitige Settings-Oberfläche ist, die keine Modell-Oberfläche registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert weder einen Provider-Request noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, welche Plugins erscheinen und wie frisch die Liste ist; sie sind aktuelle Paket-Constraints.

- **Nur Plugins der Host-Ebene erscheinen** — ein Plugin, das ein Agent-Preset mountet, trägt seine Konfiguration inline in der `agent.cordis.yml` dieses Presets und kann überhaupt keinen Settings-Namespace registrieren, sodass dieser Abschnitt nichts für es auflistet. Diese Werte zu bearbeiten bleibt Aufgabe des Preset-Editors.
- **Eine Karte braucht weiterhin ein Browser-Bundle** — die Browser-Hälfte muss ein `dsh.client`-Paket sein, das im Lazy-CJS-Factory-Format des Client-Modulsystems gebaut ist, und das `clientBundle`-Preset, das es emittiert, liegt in `../../../packages/client/tsdown.client.ts` statt in einem veröffentlichten Paket, sodass ein Plugin außerhalb dieses Repositorys diesen Build selbst nachbilden muss.
- **Die bedienten Namespaces re-readen nur auf zwei Signale** — das Wire-Protokoll kündigt Settings-Dokument-Commits und Connection-Resets an, nicht Registrierungen, sodass ein Namespace, dessen Owner sich nach dem Read des Tabs registriert, beim nächsten Dokument-Commit oder Reconnect in die Liste eintritt.
- **Die Shell-Karte folgt dem komponierten Executor** — die POSIX- und PowerShell-Executor-Familien teilen sich den `bash`-Namespace, weil ein Host genau eine von ihnen komponiert, sodass das bediente Schema je nach Plattform abweicht (PowerShell fügt `pwshPath` hinzu), obwohl die Karte auf beiden dieselben zwei Felder bearbeitet.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Dies ist eine browserseitige Settings-Oberfläche, deren Node-Hälfte keinen Event-Stream und keine mutablen Runtime-Daten besitzt; das Layering und die Write-Refusals sind Host-Verträge, die von den besitzenden Plugins und dem api-proxy abgedeckt werden.
