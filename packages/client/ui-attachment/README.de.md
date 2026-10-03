---
description: "Attachment-Präsentation für die Konversations-UI: gemischte Draft-Attachment-Rail, Document-Drop-Target, History-Image-Gallery und Original-Image-Lightbox; für Nutzer und Maintainer der Web-Attachment-Erfahrung."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-attachment

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Dieses Paket rendert alles, was die Konversations-UI über Attachments zeigt: eine geordnete Draft-Rail unter dem Composer, eine Full-Viewport-Drop-Einladung, durable Images in Chat, Trajectory und Tool Results sowie eine Lightbox für das Originalbild. Attachment-Daten, Upload-Zustand, Image-Loading und Callbacks kommen von den deklarierten Slot-Ownere. Wähle es für die Attachment-Erfahrung im DeepSeek-Chat-Stil.

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

Mounte dieses Plugin zusammen mit [`ui-conversation`](../ui-conversation/README.de.md) und [`ui-tool`](../ui-tool/README.de.md), wenn Tool Results eine Image-Gallery brauchen. Es wartet auf deren Slot-Deklarationen und registriert seine Komponenten in sie. Nutzer sehen dann die gemischte Draft-Attachment-Rail, DeepSeek-Web-Dateikarten mit Upload-Controls, das Drop-Overlay mit seiner Limits-Zeile, nach Anzahl bemessene Message-Images, die Gallery der Tool Card und die Escape/Mask/Close-Lightbox.

### Draft-Attachments

Images und generische Dateien behalten ihre Auswahlreihenfolge in einer nicht-umbrechenden horizontalen Rail. Jedes Item ist 64px hoch: ein Image ist ein 64px-Quadrat-Thumbnail, während eine generische Datei eine 240px breite DeepSeek-Web-Card mit 16px-Radius, Dokument-Glyph mit blauem Verlauf, Dateiname sowie Extension in Großbuchstaben und Byte-Größe ist. Kantenpfeile blättern versteckten Overflow, die Scrollbar bleibt versteckt, und ein neu hinzugefügtes Item wird am Ende der Rail sichtbar gemacht. Beim Upload ersetzt ein Spinner den Datei-Glyph und zeigt Byte-Fortschritt, sobald der Carrier ihn meldet, mit einem indeterminierten Balken vor der ersten Meldung; bei Fehlschlag erscheint Retry, und Entfernen-Controls erscheinen bei Hover oder Tastaturfokus, bleiben auf Touch-Geräten aber sichtbar. Ein Klick auf ein Image öffnet das Original.

### Message-Images und die Lightbox

Im Chat präsentiert eine User-Message Dateien und Images in einem rechtsbündigen umbrechenden Fluss, der die Quellreihenfolge bewahrt. Ein einzelnes Image ohne weiteres Attachment rendert mit 240px an der längeren Kante (Seitenverhältnis auf [0.25, 4] geklemmt, nie hochskaliert); hat die Message mehr als ein Attachment, ist jedes Image ein festes 64px-Quadrat neben 240×64px-Dateikarten. Ein geladenes Image öffnet per Klick die Document-Level-Lightbox; ein fehlgeschlagener Load zeigt stattdessen ein Retry-Control. Die Lightbox schließt per Escape, Mask-Press oder ihrem Close-Control und gibt den Fokus an ihren Opener zurück.

### Drop-Overlay

Solange ein Datei-Drag über der Seite schwebt, verkündet das Full-Viewport-Overlay den Drop: Illustration, Titel und eine Limits-Zeile, wenn Drops akzeptiert werden. Das Overlay zeigt nur Zustand — die Document-Level-Listener des Owners entscheiden über Akzeptieren oder Ablehnen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Das Plugin wartet über `ctx.slots.inject` auf `conversation.input.attachments`, `conversation.message.images`, `conversation.trajectory.images` und `tool.call.images`. Es registriert dann die Composer-Rail, das Document-Drop-Target, die geteilte History-Gallery für Chat, Trajectory und Tool Results sowie die Original-Image-Lightbox. Die Präsentationskomponenten sind reine Props: der Slot-Owner liefert Attachment-Daten, Image-Loading, Callbacks und den Locale-Translator; der Paket-Einstieg exportiert keine Komponenten.

| File | Rolle |
|---|---|
| [`src/client/ComposerAttachments.tsx`](src/client/ComposerAttachments.tsx) | Geordnete Image/File-Rail + Drop-Overlay-Assemblierung |
| [`src/AttachmentRail.tsx`](src/AttachmentRail.tsx) | Horizontaler Attachment-Overflow, Wheel-Translation, Kantenpfeile |
| [`src/client/MessageImages.tsx`](src/client/MessageImages.tsx) | Per-Message-Gallery + Lightbox-Assemblierung |
| [`src/MessageImage.tsx`](src/MessageImage.tsx) | Single-Image-Sizing, Load/Retry, Click-to-Open; lokale Submission-Echo-Previews rendern ihre Object-URL direkt |
| [`src/ImageLightbox.tsx`](src/ImageLightbox.tsx) | Document-Level-Modal-Preview über der geteilten Mask |
| [`src/DropOverlay.tsx`](src/DropOverlay.tsx) | Pointer-inertes Drag-Einladungs-Portal |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn die Attachment-Oberfläche nicht genügt. Sie führen von den Slots, die dieses Paket füllt, zur Conversation-Shell, die den Input-Flow besitzt.

- [ui-conversation](../ui-conversation/README.de.md) — deklariert die Attachment-Slots und besitzt Composer und Image-Intake.
- [Web-Client-Architektur](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) — wie Browser-Plugin-Rows laden und Slots registrieren.
- [Client-Paket-Karte](../README.de.md) — benachbarte Browser-UI-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Plugin nur Attachment-Zustand rendert, den die Konversations-UI liefert, und keinen modell-sichtbaren Input beiträgt.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert weder einen Provider-Request noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die aktuelle Attachment-Oberfläche. Sie sind Paket-Constraints, kein allgemeiner Image-Viewer-Vergleich und kein Aufgabenstapel.

- **Kein Zoom oder Download in der Lightbox** — die Preview rendert das Original nur in Fit-to-Viewport-Größe.
- **Die Lightbox fängt den Fokus nicht ein** — sie setzt `aria-modal` und gibt den Fokus beim Schließen zurück, aber Tab erreicht weiterhin die Seite dahinter.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Das Paket trägt nur effect-owned Slot-Entries bei; die Slot-Registry besitzt deren Lebenszyklus und validiert ihre Deklarationen.
