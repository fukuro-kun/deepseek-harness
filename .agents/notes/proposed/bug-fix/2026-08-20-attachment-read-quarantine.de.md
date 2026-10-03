# Agent Note: Quarantäne für unlesbare historische Anhänge

Status: proposed

[English](2026-08-20-attachment-read-quarantine.md) | [中文](2026-08-20-attachment-read-quarantine.zh.md) | Deutsch

## Problem

Ein zugelassener `ImageAttachmentRef` bleibt in der dauerhaften Historie und nimmt daher an jedem späteren Request teil, bis ihn eine Kompaktion ersetzt. `AttachmentStore.readImage()` schlägt mit `ATTACHMENT_NOT_FOUND`, `ATTACHMENT_CORRUPT` oder `ATTACHMENT_READ_FAILED` fehl, wenn das referenzierte Objekt verschwindet, die Integritätsprüfung fehlschlägt oder es nicht gelesen werden kann. Die unveränderte Historie lässt dann jeden späteren Modell-Request am selben Objekt fehlschlagen und macht die Session unfähig, fortzufahren — obwohl die verbleibenden Nachrichten nutzbar sind. Dies ist der Fall des nicht verfügbaren Objekts, den [rekonstruierbare Requests](../../implemented/architecture/2026-07-05-reconstructable-requests.de.md) bewusst fail-loud belassen.

## Vorschlag

Eine session-gestützte Image-Request-Projektion zeichnet unlesbare Referenzen vor der Provider-Dispatch auf. `ATTACHMENT_NOT_FOUND` und `ATTACHMENT_CORRUPT` fügen sofort `attachment/quarantine` an; `ATTACHMENT_READ_FAILED` erhält einen Lese-Retry, der den Abbruch berücksichtigt, und fügt bei Fehlschlag denselben Event mit einem wiederholbaren Grund an. Abbruch und unklassifizierte Fehler setzen keine Daten in Quarantäne.

Das Quarantäne-Event identifiziert den Anhang und die Fehlerklasse. Die Projektion ersetzt jedes in Quarantäne gestellte Bild durch deterministischen Text, der seinen Anzeigenamen (sofern vorhanden), den attachment-id-Präfix und die Fehlerklasse enthält. Spätere Requests leiten dieselbe Ersetzung aus dem Log ab und überspringen `readImage()` für diese Referenz, während der ursprüngliche Bild-Block in der nur-anfügbaren Historie bleibt. Ein Request, der eine Quarantäne entdeckt und aufzeichnet, projiziert neu, bevor er den Provider aufruft, sodass das fehlgeschlagene Lesen nicht zu einem terminalen Modell-Request-Versuch wird.

Die explizite Recovery ruft `readImage()` auf und fügt `attachment/recovered` nur an, nachdem Digest- und Metadaten-Verifikation erfolgreich waren. Die Projektion stellt dann die ursprüngliche Bild-Referenz wieder her. Fehlende oder beschädigte Bytes werden nie automatisch überschrieben, und das Aufheben der Quarantäne ohne Verifikation ist ungültig.

Der gemeinsame Request-Projektions-Consumer ist für diese Politik zuständig. Die Anhang-Speicherung berichtet weiterhin exakte Lese-Fehler, und Provider-Adapter erfinden keine unabhängigen Platzhalter oder Recovery-Zustände.

## In Betracht gezogene Alternativen

- **Jeden Request weiter fehlschlagen lassen.** Das erhält die strikte Fehlerberichterstattung, macht aber eine ansonsten nutzbare dauerhafte Session nach einem einzigen Speicherfehler dauerhaft nicht verfügbar.
- **Den historischen Bild-Block löschen oder umschreiben.** Das verliert Beweise, verletzt die nur-anfügbare Historie und verhindert, dass ein repariertes content-addressed-Objekt den ursprünglichen Request wiederherstellt.
- **Den Fehler unabhängig in jedem Adapter abfangen.** Ein nicht protokollierter Platzhalter würde das Replay davon abhängig machen, welcher Adapter und welcher Speicherzustand zufällig vorlagen, während sich die duplizierte Politik voneinander entkoppeln würde.
- **Fehlende oder beschädigte Bytes automatisch ersetzen.** Die Referenz benennt verifizierten unveränderlichen Inhalt; die Ersetzung durch andere Bytes unter dieser Identität würde die Integritätsprüfung zunichtemachen.

## Akzeptanzkriterien

- Ein fehlendes oder beschädigtes historisches Bild erzeugt genau einen dauerhaften Quarantäne-Übergang und einen stabilen Platzhalter; spätere Modell-Requests lesen dieses Objekt nicht und scheitern nicht daran.
- Ein allgemeiner Lese-Fehler wird einmal wiederholt, ohne den Abbruch zu ignorieren, und folgt dann dem wiederholbaren Quarantäne-Pfad.
- Neustart und fork rekonstruieren denselben in Quarantäne gestellten Request aus dem Session-Log.
- Die Recovery stellt die Bild-Projektion nur wieder her, nachdem die ursprüngliche Referenz die vollständige Lese-Verifikation besteht.
- Paket-Tests decken Fehlerklassifikation, idempotente Quarantäne, Abbruch, Retry, Recovery und verschachtelte tool-result-Bilder ab; ein ohne Schlüssel ausführbarer Snapshot pinned den modell-sichtbaren Platzhalter und die dauerhaften Events.

## Risiken

Quarantäne und Recovery ändern den Provider-Präfix jeweils einmal. Die Implementierung muss die genau fehlgeschlagene Referenz vor der Zustandsaufzeichnung identifizieren und parallele Requests so koordinieren, dass doppelte Fehler einen einzigen wirksamen Übergang erzeugen. Hilfsaufrufe ohne eine lebende Session können keinen Recovery-Zustand aufzeichnen; ihre Fehlerpolitik bleibt expliziter Implementierungsumfang statt eines Adapter-Fallbacks.
