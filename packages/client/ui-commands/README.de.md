---
description: "Client-Command-API für die Web-GUI: die /-Command-Quelle, drei Dispatch-Arten, das sessionbezogene Command-Verzeichnis sowie popupSelect- und Action-Registrierung für Geschäftspakete; für Nutzer und Maintainer von Slash-Commands."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-commands
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Das Tippen eines `/`-Befehls im Composer öffnet die passende Oberfläche — ein registriertes Popup, die Eingabe eines Host-Befehls oder eine direkte Ausführung — und eine Befehlszeile wird niemals still zu einem einfachen Prompt herabgestuft. Geschäftspakete tragen Command-Oberflächen über `ctx.commandUi` bei: ein popupSelect-Spec (`/model`, `/permission`) oder eine Action (`/feedback`), registriert als Befehl oder als Dekoration eines bestehenden Host-Befehls, während der Host seine Katalogzeile und seinen Argumentanspruch behält. Leertaste und Enter lösen die Zeile gegen das Verzeichnis der Session auf: Ein Host-Deskriptor mit `input` ist `leadingInput`, eine registrierte `CommandUiSpec` ist ihre Art, und alles andere ist `execute`.

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

Dieses Plugin zusammen mit `ui-input-trigger` und `ui-conversation` mounten; die `/`-Quelle erscheint dann im Trigger-Menü, und Geschäftspakete registrieren ihre Command-Oberflächen über `ctx.commandUi`. Das Tippen von `/model` öffnet das registrierte Popup; ein Host-Befehl mit Argumentanspruch öffnet seine Eingabe oder führt direkt aus.

### Arten und Dekorationen

Ein Beitrag ist ein client-eigener Befehl — eine Kollision mit einem Host-Namen schlägt laut fehl. Eine Dekoration fügt einem BESTEHENDEN Host-Befehl ein Popup für den nackten Aufruf hinzu: Der Host-Befehl behält seine Katalogzeile, seinen Argumentanspruch und sein Lifecycle-Logging, und ein dekorierter Name ohne Host-Zeile im Verzeichnis der Session feuert nie. Menüanfragen matchen per Fuzzy-Match geordnete, groß-/kleinschreibungsunempfindliche Teilfolgen von Befehlsnamen; Präfixe ranken zuerst.

### Submits mit Anhängen

Wenn der Composer mit Bildern oder generischen Dateien absendet, kommt nur ein Host-Befehl weiter, der `input.attachments` deklariert. Jede andere Befehlsroute wirft die lokalisierte `attachmentsUnsupported`-Ablehnung, die als kurzlebiger Toast gerendert wird, während Draft und Attachment-Cards an Ort bleiben. Fehler des Handlers bewahren denselben Draft-Zustand für einen Wiederholungsversuch.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

`src/client/contract.ts` ist der feste Geschäftsvertrag: `CommandUiContract.register(name, spec)` und `decorate(name, spec)` sind alles, was ein Geschäftspaket konsumiert. `CommandDirectory` ist der einzige wire-abgeleitete Cache, per Session gekeyed: Gewöhnliche Sessions fetchen über `command.list({sessionId})`, Einträge werden durch das weitergeleitete `commands/change`-Owner-Event soft-invalidiert und durch `connection/reset` hart invalidiert, epoch-geschützt, sodass ein überholter Pull niemals einen neueren überschreiben kann. `matchSpace` antwortet synchron nur aus diesem Cache; `matchEnter` wartet ihn am SubmitAttempt-Signal strikt ab und lehnt bei Warmup-Fehlschlag ab. Nachdem `command.execute` ein gematchtes Ergebnis zurückgibt, emittiert der Browser eine lokale `command/executed`-Bestätigung; andere Clients erhalten die dauerhaften Command-Knoten über den Host-Eventstream, aber niemals diese Bestätigung. `PopupSelectController` ist der headless Shell-State; `PopupSelectView` registriert sich selbst in `conversation.input.overlay` mit Auflösung pro Session.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn die Command-Oberfläche nicht ausreicht. Sie führen von der Command-API zur Trigger-Pipeline und zur Host-Command-Registry.

- [ui-input-trigger](../ui-input-trigger/README.de.md) — die Pipeline, in die sich die `/`-Quelle registriert.
- [ui-conversation](../ui-conversation/README.de.md) — deklariert den Input-Overlay-Slot und besitzt den Composer.
- [Client-Paketübersicht](../README.de.md) — benachbarte Browser-UI-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über den Host-`command.execute`-RPC, den die Dispatch-Pfade auslösen: Das Host-Paket jedes Command-Handlers besitzt jede modellsichtbare Wirkung (der `/plan`-Handler kippt den Plan-Modus, dessen besitzendes Paket seinen Policy-Abschnitt injiziert), während die Befehlszeile, das losgelöste Ergebnis und jede Menü- und Notice-Darstellung clientseitig bleiben und niemals ins Session-Log gelangen.

#### KV-Cache-Effekt

Keiner direkt; dieses Paket stellt weder einen Provider-Request zusammen noch sendet es einen. Command-Handler, die es auslöst, können ändern, was die besitzenden Host-Pakete zum System-Prompt des nächsten Requests beitragen — ein erscheinender oder verschwindender Abschnitt ersetzt frühere Request-Tokens und invalidiert den Provider-Präfix ab diesem Punkt —, aber diese Wirkung gehört dem Host-Paket des jeweiligen Befehls und ist dort dokumentiert.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die aktuelle Command-Oberfläche. Sie sind gegenwärtige Paket-Constraints, kein allgemeiner Command-Line-Vergleich und kein Aufgabenrückstand.

- **Notices zu losgelösten Ergebnissen fallen außerhalb der Session auf die Konsole zurück** — die Fire-and-forget-Pfade routen Ergebnisse über `SessionInput.notify` zum Composer der auslösenden Session; nach dem Session-Teardown ist die Konsolenzeile die einzige verbleibende Oberfläche.

<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Laufzeit-Invariante:** Es wird kein Companion veröffentlicht. Eine browserseitige Quelle über dem Wire-Command-Verzeichnis — sie emittiert keine Cordis-Events und besitzt keinen pluginübergreifenden veränderlichen Zustand; Dispatch- und Cache-Verhalten werden durch die Specs dieses Pakets abgesichert.
