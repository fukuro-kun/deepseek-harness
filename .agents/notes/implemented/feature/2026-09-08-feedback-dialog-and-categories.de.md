# Agent Note: Feedback-Dialog, Kategorien und der Bestätigungs-Toast

Status: implemented

[English](2026-09-08-feedback-dialog-and-categories.md) | [中文](2026-09-08-feedback-dialog-and-categories.zh.md) | Deutsch

## Problem

Der Web-Client hatte zwei unverbundene Feedback-Pfade ohne sichtbares Ergebnis. `/feedback <text>` zeichnete eine Session-Anmerkung auf und renderte eine Bestätigungszeile im Transcript; das Like/Dislike-Paar zeichnete sofort eine Bewertung auf, mit einem unter der Zeile verankerten Notiz-Popover für Freitext. Keiner der beiden Pfade sagte dem Nutzer, was eingereicht wurde oder wohin es ging, keiner sammelte eine Kategorie, und ein Dislike — der Fall, in dem ein Nutzer am ehesten erklärt — fragte nichts. Issue #3515 und das dazugehörige Design-Dokument fordern einen Dialog, erreichbar aus dem Composer-Menü, aus einem nackten `/feedback` und aus Dislike, mit sieben festen Kategorien, einer optionalen Beschreibung, einem Erfolgs-Toast und einem gefüllten Glyph für eine aufgezeichnete Bewertung, während Like weiterhin sofort aufzeichnet.

## Entscheidung

`command-feedback` besitzt die Kategorie-Taxonomie als `FeedbackCategory`-Union und das `FEEDBACK_CATEGORIES`-Tupel in seinem client-safe `./types`-Export, und `feedback/record` wird zu `{ text?, category? }`: Leerer Text wird als abwesend aufgezeichnet, und ein Eintrag ohne beide Member zeichnet trotzdem auf, weil die Log-Lieferung, die das Feedback autorisiert, der Inhalt ist. Dasselbe Paket publiziert den `sessionFeedback.record`-Remote über `TypertRemoteService`, löst die live Session per id auf und ruft den bestehenden `recordFeedback`-Producer, sodass der Dialog dasselbe Event wie das Kommando ohne Kommando-Buchführung aufzeichnet. `message-feedback` ergänzt das optionale `category` auf `MessageFeedbackItem` und `MessageFeedbackPutRequest`, validiert gespeicherte Werte gegen das Tupel und zählt eine Kategorie-Änderung als materielle Bearbeitung.

`ui-message-feedback` wird die Web-Feedback-Oberfläche. Eine per-Session-`FeedbackSurface` besitzt den Message-Feedback-Controller, einen `FeedbackDialogController` für den Entwurf, die Einreichung und die Toast-Sequenz sowie das Routing dazwischen: Ein Nachrichten-Ziel setzt ein negatives Urteil mit der Kategorie und Notiz des Dialogs über den Message-Controller, das Session-Ziel zeichnet über `ctx.remote.sessionFeedback` auf. Ein `FeedbackDialog`-Eintrag von `conversation.input.overlay` rendert die Modal- und Toast-Primitives aus dem Dialog-Store. Eine Dekoration auf dem `feedback`-Kommando des Hosts öffnet den Dialog für die Session aus einer Menüauswahl oder einem nackten Enter, während `/feedback <text>` weiterhin den Host erreicht; sie nutzt die `action`-Art, die dieser PR zu `CommandUiSpec` hinzufügt — eine nackte Invokation, die das Trigger-Token konsumiert und einen Client-Callback ausführt, ohne etwas einzureichen. Dislike öffnet denselben Dialog für die Nachricht. Like ruft `toggle`, das nun die Bewertung meldet, die es committet hat, sodass die Zeile ein aufgezeichnetes Like bestätigt und bei einem Widerruf schweigt. Das Notiz-Popover, `clearNote` und `clear` sind entfernt: Der Dialog ist der einzige Notiz-Editor, ein Bewertungswechsel speichert das nackte Urteil, und ein Klick auf eine aufgezeichnete Bewertung zieht sie zurück.

Der Dialog ist die geteilte Modal-Karte in der Breite des Designs; die Checkbox des Designs zum Einschließen des Konversations-Logs wird nicht gebaut, weil das Log mit jedem Feedback-Event reist und nicht optional ist. Eine übergroße Beschreibung schlägt beim Submit weiterhin mit `note-too-large` fehl; der Dialog bleibt mit dem Code geöffnet.

## Erwogene Alternativen

**Die Kategorie in den Notiztext kodieren.** Ein Präfix im Freitext ist ohne Parsing nicht filterbar und würde in die wörtliche Notiz leaken, die Telemetrie hochlädt; eine durable id im Payload ist das, wonach ein Consumer gruppieren kann.

**Den Dialog über die Kommando-Ebene als `/feedback <text>` einreichen.** Das Kommando lehnt leeren Text ab, kann keine Kategorie tragen und schreibt eine Bestätigungszeile, die das Design durch einen Toast ersetzt; der Remote zeichnet dasselbe Event ohne beide Beschränkungen auf.

**Das Notiz-Popover neben dem Dialog behalten.** Zwei Editoren für eine Notiz mit unterschiedlicher Erreichbarkeit ließen die Zeile bei manchen Breiten zweizeilig werden — der Defekt, den das Popover einführen sollte, zu vermeiden —, und das Design zeigt nur die Daumen.

**Ein Toast pro Message-Control.** Das Composer-Overlay mountet bereits einmal pro Session, und der Dialog besitzt die Toast-Sequenz, sodass ein Owner den Like-Pfad und den Dialog-Pfad gleichermaßen bedient.

**Eine Dialog-Art in `CommandUiSpec`.** Eine Action, die das Token konsumiert und einen Client-Callback ausführt, ist alles, was der Dialog braucht; PR #3745 führt dieselbe `action`-Art für seine File-Zeile ein, sodass der später landende PR eine Definition behält.

## Konsequenzen

Eine Kategorie hinzuzufügen bedeutet, sie zur Union, zum Host-Tupel, zum Chip-Record des Dialogs und zu den `feedback`-Dictionaries hinzuzufügen; das Client-Bundle-Purity-Gate verbietet einen Value-Import aus einem Host-Paket, also formuliert der Dialog die Taxonomie als `Record<FeedbackCategory, true>` nach, dessen Schlüsselreihenfolge die Chip-Reihenfolge ist und dessen Vollständigkeit der Compiler prüft. Das eingefrorene Released-v2-Payload-Inventar listet `feedback/record` weiterhin als nur `text`: Es regiert Artifacts, die aus älteren Generationen migriert wurden und die neuen Member nicht tragen können, während gleichversions-Wiederherstellung das installierte Vokabular anwendet. Das `message-feedback-layout`-Web-Szenario, das die Geometrie des Popovers fixierte, wird mit dem Popover gelöscht. Die message-feedback- und feedback-release-Web-Goldens und das Feedback-Subsystem-Dokument änderten sich im selben PR; der SDK-Feedback-Producer zeichnet eine kategorisierte Session-Anmerkung und einen kategorisierten Dislike auf, sodass beide SDK-Expected-Outputs die neuen Member tragen.
