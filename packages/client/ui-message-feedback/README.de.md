---
description: "Die Web-Feedback-Oberfläche: das Like/Dislike-Paar in der Aktionszeile der finalisierten Assistant-Nachricht, der Feedback-Dialog hinter Dislike und `/feedback` sowie der Bestätigungs-Toast; für Nutzer und Maintainer der Feedback-Erfahrung."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-message-feedback

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Dieses Paket ist die Feedback-Oberfläche der Web-GUI: das Like/Dislike-Paar im Aktionsstreifen der finalisierten Assistant-Nachricht, der Feedback-Dialog mit seinem Bestätigungs-Toast im Composer-Overlay und eine Dekoration, die den Dialog aus einem nackten `/feedback` öffnet. Like zeichnet sofort auf und zeigt den Toast; Dislike öffnet den Dialog, der eine Kategorie und eine optionale Beschreibung sammelt. Eine Oberfläche pro Session trägt jeden Eintrag, sodass ein einziger Listen-Lesezugriff das gesamte Transcript befüllt und ein Dialog die Session und ihre Nachrichten bedient. Bewertungen, Kategorien und Notizen sind reine Log-Session-Events, die niemals in den Modellkontext gelangen.

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

Dieses Plugin zusammen mit `ui-conversation` und `ui-commands` mounten; das Like/Dislike-Paar erscheint dann in der Aktionszeile der abschließenden Assistant-Nachricht jedes Turns, zwischen Kopieren und Branchen, und die Feedback-Zeile im Composer-Menü öffnet den Dialog. Eine aufgezeichnete Bewertung zeigt das gefüllte Symbol und bleibt ohne Hover sichtbar. Like zeichnet sofort auf, und der Toast dankt dem Nutzer für das Feedback. Dislike öffnet den Dialog: sieben Kategorie-Chips und ein Detailfeld, beide optional; Absenden zeichnet ein negatives Urteil mit den ausgefüllten Angaben auf, und das Konversationsprotokoll reist mit jedem Feedback-Event mit. Ein Klick auf die aufgezeichnete Bewertung nimmt sie zurück. Ein nacktes `/feedback`, aus dem Menü gewählt oder ohne Text getippt und abgesendet, öffnet denselben Dialog für die Session; `/feedback <text>` behält den Host-Kommando-Pfad und seine Bestätigungszeile.

### Fehler

Ein Fehler bei Bewertung oder Listenladen erscheint inline in der Zeile; ein Übermittlungsfehler erscheint im Dialog, der geöffnet bleibt, damit der Entwurf korrigiert werden kann. Nur finalisierte Nachrichten erreichen den Nachrichteneintrag — ein durch Unterbrechung eingefrorener Teilausgabe-Stand trägt keine `messageId` und daher keine Feedback-Controls.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Das Paket trägt den `feedback`-Eintrag (order 10) von `conversation.chat.assistant-actions` bei, der von ui-conversation deklariert und in der IconActions-Zeile der finalisierten Assistant-Nachricht gerendert wird, sowie den `feedback-dialog`-Eintrag (order 2) von `conversation.input.overlay`, der die Modal- und Toast-Primitive über body portals rendert und den Toast über der Composer-Karte zentriert, in der er mounted. Die `/feedback`-Dekoration ist eine über `ctx.commandUi.decorate` registrierte `action`, sodass ein Menü-Pick oder ein nacktes Enter das Trigger-Token konsumiert und den Dialog öffnet, während eine Zeile mit Argumenten weiterhin das Host-Kommando erreicht.

Pro Session trägt ein `MessageFeedbackController` jedes Nachrichten-Control, und ein `FeedbackDialogController` besitzt den Dialog-Entwurf, die Übermittlung und die Toast-Sequenz. Der Nachrichten-Controller liest `messageFeedback.list` nur einmal — auf den ersten Hover oder Focus verschoben statt beim Mount ausgelöst — und serialisiert Mutationen, sodass jede die zuletzt beobachtete Version trägt; eine `version-conflict`-Antwort trägt das autoritative Item und gleicht die Ansicht ohne erneutes Fetchen ab. `toggle` meldet die jetzt committete Bewertung, sodass die Zeile ein aufgezeichnetes Like bestätigt, nicht aber ein Zurücknehmen. Der Dialog-Controller sendet nach Ziel: Ein Nachrichtenziel schreibt ein negatives Urteil mit Notiz und Kategorie des Dialogs über den Nachrichten-Controller, und das Session-Ziel zeichnet über `ctx.remote.sessionFeedback` auf. Erfolg schließt den Entwurf und zeigt den Toast; ein später Erfolg eines ersetzten Entwurfs zeigt den Toast, ohne den neuen Entwurf zu schließen; ein Fehler lässt den Entwurf mit seinem Code geöffnet.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn die Feedback-Oberfläche nicht ausreicht. Sie führen vom Browser-Streifen zu den Session-Log-Backends und der Konversations-Shell.

- [dsh-message-feedback](../../feedback/message-feedback/README.de.md) — das Session-Log-Backend, das pro Item Compare-and-Set und Persistenz besitzt.
- [dsh-command-feedback](../../feedback/command-feedback/README.de.md) — das `/feedback`-Kommando, das `sessionFeedback`-Remote und die Kategorien-Taxonomie.
- [ui-commands](../ui-commands/README.de.md) — der Kommando-Dekorations-Vertrag, über den die `/feedback`-Zeile läuft.
- [ui-conversation](../ui-conversation/README.de.md) — deklariert den Assistant-Actions-Streifen und das Composer-Overlay.
- [Client-Paketkarte](../README.de.md) — benachbarte Browser-UI-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da Bewertungen, Kategorien und Notizen reine Log-Events sind, kein Modell-Input. Die optionale Session-Log-Zustellung nutzt Request-Metadaten statt Modellkontext.

#### KV-Cache-Auswirkung

Keine; Feedback-Mutationen verändern die modell-sichtbare History nicht.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die aktuelle Feedback-Oberfläche. Es sind aktuelle Paket-Constraints, kein allgemeiner Bewertungsvergleich und kein Aufgaben-Backlog.

- **Notizgröße ist Host-Policy** — die Deployment konfiguriert `maxNoteBytes` (8192 im Web-Bundle), und der Host lehnt eine übergroße Notiz mit `note-too-large` ab. Der Dialog prüft das Limit nicht vorab, sodass eine übergroße Beschreibung für eine Nachricht erst beim Absenden scheitert, nicht beim Tippen; eine Session-Anmerkung hat keine Schranke.
- **Keine Notiz bei einem Like** — nur der Dislike-Dialog sammelt Kategorie und Beschreibung; ein Like zeichnet nur das nackte Urteil auf.
- **Kein Cross-Tab-Push** — die Bewertung eines zweiten Tabs wird erst bei Reconnect oder der nächsten Konflikt-Antwort sichtbar, nicht sofort; der Controller konsumiert keine Feedback-Log-Events.
- **Nur Chat-Ansicht** — die Trajectory- und Waterfall-Ansichten rendern keine Feedback-Controls, obwohl ihre Assistant-Knoten dieselbe `messageId` tragen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Das Plugin besitzt zwei Slot-Registrierungen, eine Kommando-Dekoration und eine pro-Session Controller-Paar-Map, die alle von den Effect-Disposern des Plugin-Fibers freigegeben werden. Die Lifecycle-Spec beweist, dass die Registrierungen zurückgezogen und jedes Controller-Paar verworfen wird, wenn der besitzende Fiber disposed wird, sodass zur Laufzeit keine zweite prüfbare Autorität existiert.
