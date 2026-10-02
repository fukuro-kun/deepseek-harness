---
description: "Modell-seitige Cordis-Runtime-Tools für agents und Maintainer, die dynamische-Paket-Workflows auswählen, zusammenstellen oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-cordis

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-tool-cordis` lässt ein Modell die laufende Cordis-Runtime inspizieren und temporäre dynamische Pakete mit Host-Code, Browser-Code oder beidem erstellen, ausführen, stoppen, aktualisieren oder entfernen. Paketversionen sind unveränderlich; ein fehlgeschlagenes Paket lässt sich korrigieren, indem eine neue Version hinzugefügt und die aktive aktualisiert wird. Definitionen existieren nur im Prozessspeicher und verschwinden bei einem Neustart von DSH; das Paket schreibt keine Repository-Dateien, installiert keine Abhängigkeiten und ändert `cordis.yml` nicht. Es bringt dem Modell außerdem diesen Workflow bei. Kombiniere es mit `@deepseek-ai/dsh-cordis-host-runner`, der die Sandbox und den Run-Roundtrip bereitstellt.

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

Mounte dieses Plugin, wenn eine session ihre eigene Runtime temporär erweitern können soll — etwa ein modellgeschriebenes tool, ein service oder eine Browser-UI, die der aktuellen Arbeit hilft, aber kein Repository-Plugin werden soll. Kombiniere es mit dem Host-Runner; ohne den Runner aktivieren sich die tools nie, und kein ausgeliefertes bundle mountet dieses toolset (das Web-Profil mountet bereits den Host-Runner und die Browser-Seiten), also füge die tool-Zeile explizit hinzu.

### Minimale Komposition

```yaml
- name: '@deepseek-ai/dsh-cordis-host-runner'
  config:
    vmTimeoutMs: 5000
- name: '@deepseek-ai/dsh-tool-cordis'
```

Das CLI-Beispiel [`apps/cli/config/examples/cordis/cordis.yml`](../../../apps/cli/config/examples/cordis/cordis.yml) komponiert beide. Ein Paket mit Browser-Hälfte braucht zusätzlich den Browser-Runner und das UI-Paket in der Client-Komposition; ein reines Host-Paket braucht beides nicht.

### Was die tools tun

Die drei Inspect-tools sind nur lesend; die vier Lifecycle-tools definieren und verwalten Pakete. Alle Ergebnisse sind als Text gerendertes JSON.

- `cordis_inspect_list` — listet die Inspect Providers (Host und Client) und ihre Abfragemethoden.
- `cordis_inspect_query` — führt eine Provider-Abfrage aus: exakte service-Methoden, Event-Modi, builtin-Signaturen, tool schemas, Theme-tokens oder live slot-Bäume.
- `cordis_inspect_self` — die dynamischen Plugins dieser session: Versionszeiger, letzter Lauf und — für ein exaktes Paket — dessen Quelltext und Runtime-Diagnose.
- `cordis_define` — registriert ein Paket: ein neues Plugin (`plugin.kind: "new"` mit einem `idPrefix` aus 3–6 Buchstaben) oder eine neue Version eines bestehenden Plugins (`plugin.kind: "existing"` mit seiner `pluginId`). Es validiert nur Parameter und Syntax; nichts läuft, und es wird keine Freigabe angefragt.
- `cordis_run` — aktiviert ein Paket (`mode: "run"` für die erste Aktivierung oder den Neustart, `mode: "update"` zum Versionswechsel). Ein Paket mit Browser-Hälfte kann `awaiting-approval` zurückgeben, bis ein Mensch es erlaubt; das tool wartet nie auf das Endergebnis.
- `cordis_stop` — stoppt den aktuellen Lauf und bricht jede ausstehende Freigabe ab; Plugin und alle Paketversionen bleiben erhalten.
- `cordis_undefine` — stoppt und entfernt ein Plugin mit all seinen Paketen endgültig.

### Ein typischer Workflow

Erst inspizieren, dann definieren, dann ausführen: `cordis_inspect_query` liest den exakten contract des service oder slot, den das Paket nutzen wird, `cordis_define` speichert den Quelltext (und die Unterhaltung zeigt eine define-Karte, die auf das Panel mit der Laufsteuerung verweist), und `cordis_run` aktiviert ihn. Tippt der Nutzer `@pluginId`, injiziert dieses Paket eine Kontextnachricht, die das referenzierte Plugin, sein Basispaket und den Update-Pfad festpinnt. Nach einem technischen Fehler liest du die Diagnose mit `cordis_inspect_self`, hängst ein korrigiertes Paket an dasselbe Plugin an und aktualisierst darauf.

### Grenzen für die Planung

Definitionen sind an die session gebunden und prozesslokal: Ein Paket ist nur in der session sichtbar und steuerbar, die es definiert hat, bleibt über spätere turns hinweg aktiv und kann während des Laufs andere sessions im selben Prozess beeinflussen. Stoppen, Entfernen, das Entladen des toolset oder ein DSH-Neustart löschen es. Die Sandbox isoliert Globals, ist aber keine Sicherheitsgrenze — behandle ein dynamisches Paket wie bash-Zugriff, und mounte dieses Plugin mit derselben Überlegung, mit der du eines gewähren würdest.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design hinter den tools; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig abgedeckt.

### Designphilosophie

Das toolset baut auf einer Trennung auf: Die tools sind eine dünne, modell-seitige Schicht über dem Runner-service. Inspect-Daten kommen aus generierten Katalogen, geschnitten mit dem live service store; Definitions- und Lifecycle-Verben delegieren an `ctx.dynamicCordisRunner`, der registry, vm-Sandbox und Browser-Roundtrip besitzt. Die tools liefern die modell-seitigen Urteile: nur aufrufbare Methoden werden gezeigt, nur keys, die eine Host-Hälfte erreichen kann, werden genannt, und jede Ablehnung ist ein lehrreicher Fehler, auf den das Modell reagieren kann.

### Quelltext-Karte

| Datei | Aufgabe |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: tool-Registrierung, system-prompt-Abschnitt, `@pluginId`-Kontextinjektion |
| [`src/inspect.ts`](src/inspect.ts) | Berichtsrendering: verbindet den generierten API-Katalog mit dem live service store |
| [`src/api-catalog.ts`](src/api-catalog.ts) | Generierte Projektion der Cordis-Deklarationen des Workspace (regeneriert durch `pnpm run gen-cordis-api`, abgesichert durch `verify-cordis-api`) |
| [`src/prompt.ts`](src/prompt.ts) | Der system-prompt-Abschnitt `tool:cordis` |
| [`src/providers.ts`](src/providers.ts) | First-party Host Inspect Providers: Service, Event, Builtin, Tool |
| [`src/present.ts`](src/present.ts) | Replay-sichere generische Karten-Render-Intents |

### Wie ein Aufruf fließt

Ein inspect-Aufruf fragt `ctx.cordisInspect` ab: Host-Provider laufen lokal, Client-Provider warten auf die erste gültige Seitenantwort. Define prüft die Syntax jeder Hälfte vorab, indem es sie in demselben wrapper kompiliert, den die Sandbox verwendet, sodass nicht parsebarer Code abgelehnt wird, bevor eine id existiert. Run delegiert an den Runner, der reine Host-Pakete im Prozess aktiviert und Pakete mit Browser-Hälfte auf einem `cordis/request-run`-Roundtrip suspendiert; das tool gibt die Quittung des Runners zurück (`awaiting-approval`, `starting` oder `running`). Schreibt der Nutzer `@pluginId`, liest ein `agent/pre-step`-Handler die Referenz und injiziert eine Kontextnachricht mit user-Rolle, die Basispaket und nötige nächste Schritte nennt.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-vertrag nicht ausreicht. Sie führen vom geteilten toolset zu den Runner-Interna, den generierten schemas und der Subsystem-Oberfläche.

- [Host runner](../cordis-host-runner/README.de.md) — die registry, Sandbox und der Run-Roundtrip, an die diese tools delegieren.
- [Client runner](../cordis-client-runner/README.de.md) — die Browser-Hälfte, die Run-Anfragen beantwortet und Browser-Hälften-Code lädt.
- [UI-Paket](../ui-cordis/README.de.md) — das Panel und die tool-Karten, mit denen Nutzer Definitionen bedienen.
- [Generierter Tool-Katalog](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-cordis) — die exakten schemas, die das Modell erhält.
- [Extensions-Subsystem](../../../docs/subsystems/extensions.de.md) — die generierte `ctx.cordisInspect`- und `ctx.dynamicCordisRunner`-API.
- [Agent Note zum selbstreferenziellen Cordis-toolset](../../../.agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.de.md) — Design-Heimat: Sandbox-Semantik, dynamischer Paket-Lifecycle und Komposition.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schemas

#### Was das Modell sieht

Das Konversationsmodell sieht die generierten [`cordis_inspect_list`-, `cordis_inspect_query`-, `cordis_inspect_self`-, `cordis_define`-, `cordis_run`-, `cordis_stop`- und `cordis_undefine`-schemas](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-cordis), wann immer dieses Plugin sichtbar ist.

#### Token-Wirkung

Feste schema-Kosten bei jeder Anfrage in dieser tool-Sicht.

#### KV-Cache-Wirkung

Prefix-stabil, solange diese tool-Sicht unverändert bleibt. Scoping- oder Plugin-Lifecycle-Änderungen, die diese Definitionen ausblenden, können die Wiederverwendung ab dem ersten geänderten schema-token ungültig machen.

### System-prompt-Abschnitt

#### Was das Modell sieht

Dieses Paket registriert einen system-prompt-Abschnitt (`tool:cordis`, order 115), der lehrt, wann und wie der dynamische-Plugin-Workflow zu verwenden ist, die empfohlene tool-Reihenfolge und die zu vermeidenden Hochfrequenzfehler; der vollständige Text liegt in [`src/prompt.ts`](src/prompt.ts). Der Abschnitt beginnt mit:

##### Abschnittsanfang

```markdown
# Dynamic Cordis Plugins

Dynamic Cordis plugins temporarily extend the current DSH process. A Plugin uses apply(ctx) to consume Services, listen to Events, provide Services, register model Tools, or register browser UI in Slots.
```

#### Token-Wirkung

Der gerenderte Text des Abschnitts wiederholt sich bei jeder Anfrage, solange dieses Plugin sichtbar ist.

#### KV-Cache-Wirkung

Prefix-stabil, solange Abschnittstext und -reihenfolge unverändert bleiben; das Bearbeiten des prompt oder das Ändern seiner Reihenfolge kann die Wiederverwendung ab dem ersten geänderten token ungültig machen.

### Tool-call-Verlauf und Ergebnisse

#### Was das Modell sieht

Inspect-Ausgaben sind als Text gerendertes JSON: `cordis_inspect_list` liefert das Provider-Verzeichnis, `cordis_inspect_query` die abgefragten Daten und `cordis_inspect_self` eine Plugin-, Versions- und Paket-Zusammenfassung mit Quelltext und Diagnose für ein exaktes Paket. Define antwortet, dass das Paket definiert und noch nicht laufend ist, mit den ids zum Starten. Run meldet `awaiting-approval`, `starting` oder `running` mit der Run-id und Versionszeigern. Stop und undefine quittieren in einer Zeile. Jede Ablehnung ist ein tool-Fehler mit dem Lehr-Text des Runners, und das eingereichte Programm bleibt im assistant-tool-call-Verlauf.

#### Token-Wirkung

Inspect-Ausgabe und eingereichter Paket-Code sind datenabhängig und werden bis zur compaction erneut gesendet; Lifecycle-Bestätigungen sind klein.

#### KV-Cache-Wirkung

Append-only; neu sichtbarer Inhalt folgt dem wiederverwendbaren Anfrage-Prefix und macht bestehende KV-Cache-Einträge nicht ungültig.

### Spätere Anfragen nach cordis_run

#### Was das Modell sieht

Ein laufendes Paket kann tools, prompt-Beiträge oder Listener registrieren, die spätere Anfragen für die betroffenen scopes verändern; `cordis_stop` und `cordis_undefine` entfernen diese Beiträge nach quiescence. Tippt der Nutzer `@pluginId`, fügt der injizierte Referenzkontext außerdem eine Nachricht mit user-Rolle hinzu, die Basispaket und nächste Schritte nennt.

#### Token-Wirkung

Die indirekte token-Wirkung entspricht den Beiträgen des laufenden Pakets und dauert nur für dessen prozesslokale Lebenszeit.

#### KV-Cache-Wirkung

Das Starten oder Stoppen eines prompt- oder tool-Beitrags ändert spätere Anfrage-Prefixe und kann die Wiederverwendung ab dem ersten geänderten Beitrag ungültig machen; ein unverändert laufender Satz bleibt Prefix-stabil.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das toolset ungeeignet ist oder besondere Sorgfalt braucht. Es sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Die Sandbox begrenzt ehrlichen Code, sie ist keine Sicherheitsgrenze** — host-realm-Helfer auf dem Sandbox-Global sind erreichbar, sodass Paket-Code Node erreichen kann; mounte dieses Plugin mit derselben Überlegung, mit der du ein bash-tool gewähren würdest.
- **Nur reines JavaScript** — dynamischer Paket-Code wird nicht transformiert: kein TypeScript, JSX oder imports, und die Sandbox entzieht Node-Globals wie `require`, `setTimeout` und `fetch` und lenkt Dateisystem-, Netzwerk- und Prozessarbeit auf Cordis-services um.
- **Die vm- und Freigabe-Grenzen gehören dem Runner** — siehe seine [bekannten Einschränkungen](../cordis-host-runner/README.de.md#known-limitations-and-deferred-work); ein async Host-Hälften-Rumpf entkommt `vmTimeoutMs`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein companion veröffentlicht. Dieser modell-seitige adapter hat keinen eigenen Lifecycle-stream; Ausführungsrelationen gehören der capability seam, die er aufruft.
