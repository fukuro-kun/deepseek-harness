---
description: "Models-Einstellungs- und Produkt-Onboarding-Plugin für den dsh-Webclient: Provider-Zeilen, API-Key-Verwaltung, Modellisten und die DeepSeek-First-Run-Dialoge."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-models

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-client-ui-settings-models` ist die Models-Einstellungsseite des dsh-Webclients: Benutzer konfigurieren API-Keys (write-only unter der Credential-Referenz des Profils gespeichert), bearbeiten die Modelliste jedes Providers und deklarieren manuell eigene pi-ai-Routen — als Provider-Zeilen mit jeweils einer offenen Editor-Karte. Die Seite verbindet das Provider-Verzeichnis, das Settings-Dokument und die Credential-Beschreibungen zu einem gemeinsamen Snapshot, sodass der Zustand einer Zeile über alle drei hinweg konsistent bleibt. Außerdem führt sie First-Run-Benutzer durch zwei geordnete Dialoge — einen versionierten Internal-Testing-Hinweis und den bedingten Credential-Schritt für offizielles DeepSeek.

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

Öffne die Models-Seite über die Settings-Navigation, um jeden konfigurierten Provider als Zeile zu sehen. Ein ganze Sektion umfassender Provider, dessen Key nirgends konfiguriert ist, rendert stattdessen als offene Setup-Karte — aber nur in der First-Run-Haltung und nur, bis der Benutzer diese Karte schließt. Jede Kartenart besitzt ihren eigenen Open-State, sodass das Schließen einer Karte niemals einen Entwurf in einer anderen verwirft.

Ein Provider mit gespeichertem Katalogfehler bleibt mit seiner Diagnose und den Edit-/Delete-Aktionen sichtbar. Add-Aktionen werden nur für registrierte Settings-Namespaces angeboten, sodass ein nicht verfügbarer Namespace keinen Button hinterlassen kann, der keinen Editor öffnet. Ein abgelehnter Speichervorgang lässt den Editor offen und zeigt die Host-Diagnose an.

### API-Keys

Das Primärfeld auf einer Editor-Karte ist ein einzelnes **API-Key**-Eingabefeld — die Seite fragt nie nach einem Umgebungsvariablennamen. Ein getippter Key wird write-only über `credentials.set` unter der Referenz des Profils gespeichert; hat das Profil keine, wird `<ROUTE>_API_KEY` abgeleitet, und das pi-ai-Profil zeichnet diese Ableitung als `apiKeyEnv` auf, sodass `settings.yaml` niemals einen Key-Wert trägt. Ein leer gelassener Key bei einem neuen pi-ai-Provider speichert ein referenzfreies Profil und bewahrt die provider-native Authentifizierung (zum Beispiel die Bedrock-Credential-Kette oder Vertex ADC). Eine Zeile kennzeichnet den API-Key-Zustand nur dann mit einem grünen Punkt, wenn eine referenzierte Credential bestätigt konfiguriert ist, und nur dann mit einem roten Punkt, wenn eine benannte Referenz bestätigt fehlt. Ein erfolgreiches Apply sendet eine lokale barrierefreie Statusmeldung, ohne geheimes Material zu echoen.

### Provider bearbeiten

Der eingeklappte 自定义设置-Fold trägt die kuratierten Extras: `baseURL` für beide Familien (der deepseek-Platzhalter zeigt den öffentlichen Endpunkt), den Modellkatalog jedes Adapters sowie **Anzeigename** und **API-Protokoll** einer pi-ai-Route, die der Adapter nicht mitliefert. Profil-`headers` bleiben Deployment-Konfiguration in `settings.yaml` oder Cordis-Config und haben keinen Models-Seiten-Editor. Die Provider ID bleibt fest: Sie ist der Settings-Key, der Name, auf den jeder andere Namespace und jede geloggte Session verweist, und der Stamm einer Credential-Referenz, die die Seite nicht zurücklesen und daher nicht verschieben kann. Reasoning-Effort ist bewusst nicht unter den editierbaren Feldern: Es ist eine Capability pro Modell, ein provider-weites Steuerfeld könnte daher nur auf einen Wert gesetzt werden, den manche Modelle ablehnen. Jede DeepSeek-Zeile bearbeitet `id`, optionalen Anzeige-`name` und optionales `contextWindow`/`maxTokens`; vorhandene Felder außerhalb dieses kuratierten Satzes überleben Edits.

### Provider hinzufügen und löschen

Der Add-Flow ist eine Karte mit dem Provider-Select aus dem dormant-Verzeichnis — ein nackt gemountetes `llm-pi-ai` bietet seinen gesamten installierten Katalog an, bevor irgendeine Route existiert. **Add a custom provider** deklariert eine Route, die pi-ai nicht mitliefert; die Create-Karte fragt nach einer eindeutigen **Provider ID**, einem Endpunkt, einem Protokoll und mindestens einem eindeutig identifizierten Modell, weil nichts diese Werte defaulten kann. Der Endpunkt muss eine parsebare HTTP- oder HTTPS-URL sein; localhost, IPv4- und IPv6-Literale sowie eigene Ports bleiben gültig. Ein Syntaxfehler blockiert Discovery und Anlage direkt am Feld, während ein Request-Fehler ein separater Provider-Fehler bleibt. **Fetch available models** fragt das `llm/discoverModels`-Remote über den Endpunkt, den das Formular zeigt — ein Provider lässt sich so in einem Durchgang hinzufügen statt mit Speichern-und-Zurück; die Antwort öffnet einen durchsuchbaren Picker statt geschrieben zu werden. Neue Modelle und konfigurierte Modelle mit abweichend gemeldeten Kapazitäten sind vorausgewählt, und der Picker zeigt Kontextfenster und Output-Token-Obergrenze jedes Kandidaten an, sofern bekannt gegeben. **Apply selected** fügt neue Zeilen hinzu und aktualisiert nur die gemeldeten `contextWindow`/`maxTokens`-Felder auf ausgewählten vorhandenen Zeilen; vorhandene Namen und alle anderen Felder bleiben erhalten. Benutzer können jede Auswahl vor dem Anwenden zurücknehmen. Die Suche matcht Modell-ids und optionale Anzeigenamen, ohne versteckte Auswahlen zu löschen. **Select all** nimmt die sichtbaren Ergebnisse auf, während **Deselect all** die gesamte Auswahl löscht, damit versteckte Ergebnisse nicht versehentlich übernommen werden. Eine Zeile ist nur löschbar, wenn die User-Schicht sie allein trägt (das Entfernen stellt die Kompositionsbasis wieder her), und ihr Bestätigungsdialog nennt den Provider.

### First-Run-Dialoge

Nachdem der versionierte Notice-Schritt abgeschlossen ist, projiziert der DeepSeek-Schritt die First-Run-Bereitschaft aus demselben verknüpften Snapshot. JEDER Provider, den der Benutzer bereits erreichen kann, beendet ihn ohne Rendering; nur ein Benutzer ohne einen einzigen wird nach dem offiziellen DeepSeek-Key gefragt. „Configure later" vollendet nur diesen Coordinator-Durchlauf, und ein fehlender Adapter, eine inaktive Route, ein fehlgeschlagener Join, ein Read-only-Deployment oder eine unbrauchbare Capability vollendet den Schritt ohne Rendering — Models bleibt die Diagnose-Oberfläche.

### Erweiterungs-Slots

Die Sektion deklariert zwei Plätze für Plugins, die außerhalb dieses Repositorys verteilt werden, typisiert in [`src/client/slot-contract.ts`](src/client/slot-contract.ts) und exportiert aus `./client`. `settings.models.provider-card` (keyed) rendert innerhalb jeder Karte, die eine Verzeichniszeile zeigt — die Karte einer gespeicherten Zeile, ihre First-Run-Setup-Haltung und der Add-Provider-Entwurf — dispatched mit `entryKey = settingsNs` und Owner-Props, die `ConfigurableProviderView` der Zeile, ihren Configured-Status und den bestätigten API-Key-Credential-Status tragen; eine Registrierung unter dem Namespace einer Adapter-Familie erhält also jede Karte dieser Familie, manuell deklarierte Routen eingeschlossen; die manuell deklarierte Entwurfskarte hat noch keine Verzeichniszeile und dispatcht vor dem Speichern nichts. `settings.models.footer` (list) rendert nach den Zeilen und den Add-Controls. Ein Registrierender aktiviert sich über `ctx.slots.inject` mit einem type-only-Import des `/client`-Einstiegs dieses Pakets; ohne Registrierende rendern beide Plätze nichts.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Die Seite hält niemals eine vollständige Settings-Sektion: Sie hält nur den REDACTED-Deskriptor, sodass jeder Edit als `settings.mutate`-Pfadoperation auf der gespeicherten Sektion landet — ein Set pro geändertem Feld, ein Unset pro gelöschtem und ein einzelnes Unset für eine gelöschte Provider-Zeile.

### Validierung

Ein getippter API-Key wird an seinem eigenen Feld beurteilt: Nach dem Trimmen muss er nicht-leer sein und jedes Zeichen muss druckbares ASCII sein (`[\x21-\x7E]`) — genau das, was ein HTTP-Header-Wert tragen kann — das Gegenstück zu `normalizeApiKey` in `@deepseek-ai/dsh-llm`, hier gespiegelt, weil die Source-Plane-Trennung den Import verbietet. Ein Wert, der einer eingefügten `NAME=value`-Umgebungszeile entspricht oder in passende Quotes gehüllt ist, wird als derselbe Formatfehler abgelehnt. Leere ids, doppelte ids, leere explizite Namen sowie nicht lesbare, nicht positive oder gebrochene Kapazitäten scheitern vor jedem Schreibzugriff. DeepSeeks `models` ist ein einzelnes Replace-by-Value-Array: Der Editor zeigt geerbte effektive Zeilen, bis der erste Modelledit das komplette Array in der User-Schicht materialisiert, während Reset dieses Override zurücksetzt.

### Nebenläufigkeit und Credentials

Jeder Settings-Write trägt die aktuelle `revision` der Karte, sodass ein nebenläufiger Write aus einem anderen Tab oder einem externen `settings.yaml`-Edit als `settings/conflict` abgelehnt wird. Nach dem Settings-Commit übernimmt die Karte den zurückgegebenen redacted User-Subtree und die Revision, bevor sie die Credential speichert, sodass eine fehlgeschlagene Credential-Phase nur diese Phase wiederholt. Das Löschen entfernt eine konfigurierte, schreibbare Credential nur, wenn das Profil das von der Seite abgeleitete `<ROUTE>_API_KEY`-Ziel benennt, und unset danach das Profil; beide Operationen sind idempotent. Nach dem Laden abonniert die Seite die weitergeleiteten Owner-Events `settings/document-updated`, `credentials/reference-updated` und `llm/adapters-updated` plus das lokale `connection/reset`, sodass externe Edits ohne Polling konvergieren.

### Onboarding-Coordinator

Der Notice-Schritt besitzt seinen exakten Text in `src/client/locales.ts` und seine Bestätigungsversion in `src/onboarding-copy.ts`; auf Loopback vergleicht und schreibt er `ui-onboarding.welcomeNoticeVersion` über die bestehende Settings-API, und nur ein explizites Continue zeichnet die aktuelle Version auf. Ein Nicht-Loopback-Browser kann diesen Host-only-Namespace nicht nutzen, daher bleibt die Bestätigung prozesslokal und der Hinweis kehrt nach einem Reload zurück. Der DeepSeek-Schritt rendert den bestehenden `ProviderEditor` im Credential-only-Modus innerhalb des gemeinsamen Onboarding-Modals; `credentials.set` bleibt der einzige Secret-Write, und keine Provider-Settings werden geändert.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten decken die Settings-Basis, die von dieser Seite verknüpften seams und die Designbegründung ab.

- [ui-settings](../ui-settings/README.de.md) — die Domain-Basis, auf deren Scope- und Schema-Services diese Seite aufbaut.
- [settings](../../settings/README.de.md) — der dauerhafte User-Settings-seam und sein File-Provider.
- [credentials](../../credentials/README.de.md) — der Credential-Referenz-seam, über den diese Seite Keys schreibt.
- [llm](../../llm/README.de.md) — die Adapter-Registratur, deren Provider diese Seite konfiguriert.
- [Web-Config-Plane](../../../.agents/notes/archived/architecture/2026-07-30-web-config-plane.md) — die Designbegründung des handgeschriebenen Editors.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket eine browserseitige UI-Plugin-Schicht ist und nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert oder sendet keinen Provider-Request.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die Feldabdeckung des Editors und die Reichweite der Seite; sie sind aktuelle Paket-Einschränkungen, keine Settings-Roadmap.

- **Auf der Karte sind nur der API-Key und die kuratierten Fold-Felder editierbar** — der handgeschriebene Editor hat schema-generische Feldabdeckung gegen das Mockup-Layout getauscht. Retry-Policy, Timeouts, DeepSeek-Modellbeschreibungen und andere fortgeschrittene Felder bleiben in `settings.yaml`; vorhandene Modellfelder, die der Editor nicht zeigt, werden bewahrt.
- **Credential-Bereinigung ist bewusst eng** — das Löschen einer Zeile entfernt die konfigurierte, schreibbare Credential nur, wenn ihre Referenz exakt das von dieser Seite abgeleitete `<ROUTE>_API_KEY`-Ziel ist. Eigene Referenzen, Umgebungs-Credentials und nicht identifizierbare Ziele bleiben erhalten, weil die Zeile ihren Besitz nicht beweisen kann.
- **Nur pi-ai-Routen können manuell deklariert werden** — die Custom-Provider-Karte schreibt in `llm-pi-ai`, den einen Namespace, dessen Profile einen ganzen Provider beschreiben. Eine `llm-deepseek`-Route ist eine Kompositionstatsache, nicht etwas, das diese Seite anlegen kann.
- **Die Abfrage deckt OpenAI-kompatible und Anthropic-Messages-Endpunkte ab** — OpenAI-Protokolle akzeptieren ein Standard-`data`-Array oder eine angereicherte `models`-Map, während Anthropic seine native Modelllisting-Route nutzt; jedes andere Protokoll meldet, dass es nicht befragt werden kann, und seine Modelle werden manuell eingetragen.
- **Nicht deklarierte Live-Routen rendern nirgends** — eine ohne Configurable-Provider-Deklaration registrierte Route hat keine Settings-Adresse; sie bleibt in Pickern sichtbar, aber nicht in den Zeilen dieser Seite.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Ein reines Nav-Entry-Sektions-Plugin, das eine feste leere Content-Spalte rendert — es emittiert keine cordis-Events und besitzt keine pluginübergreifende mutable Relation.
