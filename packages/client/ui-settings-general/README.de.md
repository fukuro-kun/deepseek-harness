---
description: "Settings-Shell, ownerless Copy und durabler Product-Onboarding-Namespace für den dsh Web-Client: der Abschnitt „General“, Trigger-Chrome und die Onboarding-Ledger-Projektion."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-general

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Verwende dieses Paket, um dem dsh Web-Client ein Settings-Panel, eine Connection-Recovery-Kontrolle, von Features beigesteuerte Navigation und sequentielles First-Run-Onboarding zu geben. Nutzer können es aus der Sidebar öffnen, eine fehlgeschlagene Verbindung sofort erneut versuchen und auf eine lokale Konfigurationsdatei zugreifen, wenn der Host eine auf einem Loopback-Browser bereitstellt. Feature-Pakete liefern ihre eigenen Settings-Zeilen, Sections und Onboarding-Schritte; dieses Paket liefert ihre gemeinsame Präsentation und fügt weder Onboarding-Copy noch eingebaute General-Zeilen hinzu.

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

Nutzer erreichen die Shell über das Settings-Control am unteren Rand der Sidebar; Feature-Plugins steuern ihre Seiten und Onboarding-Schritte über die Slot-Ledger bei, die diese Shell projiziert. Sowohl in der expandierten Sidebar als auch in der eingeklappten Rail exponiert das Control das lokalisierte Settings-Label als seinen Accessible Name. Eine blassgelbe **Disconnected**-Aktion neben Settings signalisiert eine Browser-Offline-Suspension. Die automatische Recovery zeigt **Reconnecting** mit ein bis drei Punkten, die alle 500 ms weiterlaufen. Hover oder Tastaturfokus ändert eines der gelben Labels zu **Reconnect now**, ohne dessen Hintergrund zu ändern; das Press-Feedback bleibt innerhalb der Warning-Palette, und seine Auswahl startet Retry 1 sofort. Die Recovery ändert die Region für zwei Sekunden zu blassgrünem **Connected**, bevor sie verschwindet. Icon, linksbündiger Textursprung, Höhe und Breite bleiben über alle sichtbaren Zustände hinweg fixiert. Erststart und ununterbrochener gesunder Betrieb bleiben still. Die Shell rendert das modale Panel, die aus `settings.section`-Einträgen aufgebaute Navigation und jeweils genau einen gemounteten Onboarding-Schritt.

### Der Abschnitt „General“

Der Abschnitt „General“ enthält Zeilen, die von Feature-Paketen in `settings.general.item` registriert werden — er hat keine eingebauten Zeilen. Feature-Plugins besitzen Zeilen-Copy und -Verhalten; die Shell stellt nur die Section und ihren Slot bereit. Die Appearance-Zeile zum Beispiel liegt in ui-theme.

### Die Konfigurationsdatei öffnen

Auf einem Loopback-Browser rendert die Shell **Open configuration file** nur dann, wenn der Host bestätigt, dass ein Provider-eigenes lokales Dokument vorbereitet werden kann. Die Aktion öffnet dieses Dokument im nativen Texteditor (unter Umgehung der Browser-Dateizuordnung auf macOS). Remote-Browser registrieren die Aktion nie und führen den privilegierten Settings-Read nie aus.

### Onboarding-Schritte

Der Onboarding-Ledger projiziert in aufsteigender Reihenfolge und mountet jeweils genau einen Schritt. Registranten besitzen durable Completion, Capability-Readiness, Copy, Mutationen und ihren sichtbaren Wrapper, sodass unabhängig registrierte Flows nicht stapeln können und die Shell nicht zu einer zweiten Konfigurations-Faktenquelle wird. Sichtbare Schritte besitzen ihr Dialog-Chrome und den `inert`-Lifecycle der App-Root.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Die Shell besitzt das Chrome und die Projektionen; jedes Stück Content und Copy gehört einem Registranten.

### Ledger-Projektionen

Die Navigation ist eine Projektion des `settings.section`-Ledgers; Nav-Labels können locale-folgende Thunks sein, die über `resolveSlotLabel` aufgelöst und beim Section-Ledger-Bump oder der Locale-Revision neu gerendert werden (ein optionaler `ctx.get('locale')`-Read; keine harte Locale-Dependency). Der Onboarding-Ledger projiziert in aufsteigender Reihenfolge; der aktive Registrant erhält seine id, `complete()` und einen `openSection(id)`-Callback, und Abschließen oder Überspringen übergibt die Ownership an den nächsten Eintrag.

### Connection Recovery

Die Shell ist ein expliziter Recovery-Consumer, injiziert also Connection direkt, statt Lifecycle-Controls auf `ctx.remote` zu setzen. Ihr privates Hooks-Compartment bindet `ctx.connection.state`, während die Komponente nur den selektierten State und einen injizierten Callback für `ctx.connection.reconnect()` erhält. `ConnectionIndicator` besitzt die Inline-Präsentation und erhält alle sichtbare und Accessible Copy aus dem `settings`-Locale-Namespace; den Zwei-Sekunden-Timer des Recovered-State besitzt die Shell.

### Dokumentverfügbarkeit

Auf einer Loopback-Seite lädt der Client die `hasDocument`-Capability des Providers über `settings/describe` und rendert **Open configuration file** nur dann, wenn der Host bestätigt, dass ein Provider-eigenes lokales Dokument vorbereitet werden kann. Die Aktion ruft den pfadlosen, browser-authentifizierten `settings/openSettingsDocument`-Remote; der Host löst den Provider-Pfad erneut auf, materialisiert ein fehlendes Dokument und übergibt es an einen nativen Texteditor (`open -t` auf macOS, unter Umgehung einer Browser-Dateizuordnung; die Desktop-Dateizuordnung auf Linux und Windows; die Windows-Zuordnung nach `wslpath -w`-Übersetzung auf WSL). Open-Fehler halten die Aktion verfügbar und rendern einen lokalisierten Fehler. Das erneute Öffnen des Dialogs oder ein Reconnect frischt die Verfügbarkeit nach einem transienten Read-Fehler oder einer Host-Topologie-Änderung auf. Nicht-Loopback-Seiten behalten die Client-Policy, die diese native Aktion und ihren Settings-Read vorenthält.

### Host-Hälfte

Die Host-Hälfte registriert `ui-onboarding` im User-Settings-Seam. Der von ui-settings-models beigesteuerte Welcome-Schritt liest und schreibt seine `welcomeNoticeVersion` über die bestehende öffentliche Settings-Grenze; die Shell selbst bleibt policy-frei.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten behandeln die Settings-Oberflächen-Familie und das Kompositionsmodell.

- [ui-settings](../ui-settings/README.de.md) — die Domain-Basis, deren Slot-Typen und Scope-Service diese Shell nutzt.
- [ui-sidebar](../ui-sidebar/README.de.md) — die Sidebar-Shell, die den `sidebar.settings`-Seat hostet.
- [ui-settings-models](../ui-settings-models/README.de.md) — das Feature-Paket, das den DeepSeek-Onboarding-Schritt beisteuert.
- [settings](../../settings/README.de.md) — der durable User-Settings-Seam und sein File-Provider.
- [Slot-System-Standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.de.md) — das Kompositionsmodell hinter den Ledgern.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket eine browserseitige UI-Plugin-Schicht ist, die nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert weder einen Provider-Request noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was die Shell selbst bereitstellt gegenüber dem, was Features liefern müssen; sie sind aktuelle Paket-Constraints.

- **Der Abschnitt „General“ hat keine eingebauten Zeilen** — jede Zeile erscheint nur, wenn ihr besitzendes Feature-Plugin gemountet ist; die Shell kann die Section nicht allein füllen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Der Settings-Seam validiert und publiziert die durable Onboarding-Section, während Slot-Konflikte im Slot-Core laut fehlschlagen. Die Local-Document-Aktion ist Browser-State über typisierte RPC-Antworten und wird durch Store-/Komponententests abgedeckt statt durch eine Cordis-Runtime-Beziehung.
