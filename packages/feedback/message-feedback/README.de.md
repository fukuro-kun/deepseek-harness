---
description: "Bewertungen, Kategorien und Notizen für finalisierte Assistant-Nachrichten im kanonischen Session-Log."
kind: "package-reference"
---

# @deepseek-ai/dsh-message-feedback
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Dieser Dienst zeichnet für finalisierte Assistant-Nachrichten positive oder negative Bewertungen, eine optionale Kategorie aus der festen Feedback-Taxonomie und optionale wörtliche Notizen auf. Jede Erstellung, Bearbeitung und Löschung liegt im kanonischen Session-Log; `list`, `put` und `delete` liefern das aktuelle Feedback, ohne einen Agent zu konstruieren oder zu wecken. Feedback ist reine Log-Daten und gelangt nicht in die Modellhistorie.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Dieses Paket verwenden

`dsh-message-feedback` zusammen mit `sessions` und `sessionPersistence` mounten. Es benötigt keinen storage-domain-Dienst. Das Web-Bundle liefert den Browser-Consumer und ein Notizlimit von 8192 Bytes.

### Konfiguration

| Feld | Standard | Bedeutung |
|---|---|---|
| `maxNoteBytes` | erforderlich | Positives Safe-Integer-Maximum an UTF-8-Bytes in einer optionalen Notiz. |

Eine übergebene Notiz muss ein Nicht-Whitespace-Zeichen enthalten und das konfigurierte Byte-Limit einhalten. Leere Notizen liefern `note-blank`; zu große Notizen liefern `note-too-large`. Akzeptierter Text bleibt exakt erhalten, einschließlich umgebender Whitespace. Eine weggelassene Notiz wird gelöscht. Die Notizvalidierung erfolgt vor dem Session-Lookup. Eine übergebene Kategorie muss eine der [festen Feedback-Kategorien](../command-feedback/README.de.md#the-web-feedback-dialog) sein; das Remote-Schema lehnt jeden anderen Wert ab, und das Weglassen der Kategorie löscht sie.

### Feedback lesen und ändern

| Operation | Anfrage | Erfolg | Geschäftliche Fehler |
|---|---|---|---|
| `list` | Session-ID | Aktuelle Einträge in Erstellungsreihenfolge | Session nicht gefunden |
| `put` | Session, Nachricht, Bewertung, optionale Notiz, optionale Kategorie, erwartete Version | Aktueller Eintrag | Session oder Ziel nicht gefunden, Versionskonflikt, ungültige Notiz |
| `delete` | Session, Nachricht, erwartete Version | Eintrag nicht vorhanden | Session nicht gefunden, Versionskonflikt |

Zum Erstellen `ifVersion: null` übergeben; zum Bearbeiten oder Löschen die zurückgegebene Version verwenden. Veraltete Mutationen liefern `version-conflict` und den aktuellen Eintrag. Jedes inhaltliche put erzeugt ein neues Token und behält die ursprüngliche Erstellungszeit. Ein put, das gespeicherte Bewertung, Notiz und Kategorie wiederholt, ist eine No-op: Es gibt denselben Eintrag zurück, ohne ein Event anzuhängen. Das Löschen eines nicht vorhandenen Eintrags gelingt unabhängig von der übergebenen Version und ohne Event. Das erneute Anlegen eines gelöschten Eintrags beginnt eine neue Erstellungszeit und Sortierposition.

Ziele müssen nicht-leere Assistant-Nachrichten sein, die von append-origin-Events stammen. User-Nachrichten, leere Assistant-Platzhalter und replacement-origin-Nachrichten liefern `target-not-found`. Feedback übersteht einen Neustart; ein fork beginnt ohne eigenes Feedback, auch wenn sein geerbtes Präfix Feedback des Elternteils enthält.

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

### Kanonisches Log und Persistenz

`feedback/message-put` speichert die besitzende Session-ID und den vollständigen Eintrag einschließlich Version und Zeitstempeln. `feedback/message-delete` speichert Besitzer und Nachrichten-ID. Der aktuelle Zustand wird aus diesen Events abgeleitet; Events anderer Session-Besitzer werden ignoriert. Persistierte Payloads werden vor der Verwendung validiert. Es existiert kein zweiter Feedback-Speicher und kein Cache.

Operationen auf einer lebenden Session hängen über `Session.append` an und warten auf `sessions.flush`, dann verifizieren sie den erfassten Log-Endpunkt und den Session-Header über ein persistence read handle, bevor sie Erfolg melden. Cold-Mutationen halten ein persistence write handle über Lesen, Validieren, Vergleichen, Append, Flush und Schließen hinweg. Cold-Lesevorgänge verwenden ein read handle. Keiner der beiden Pfade konstruiert eine Session oder hängt Lebenszyklus-Events an.

Eine Warteschlange pro Session serialisiert Operationen innerhalb einer Dienstinstanz; das persistence write handle schließt konkurrierende Cold-Writer aus. Dispose stoppt die Aufnahme und leert aufgenommene Operationen, bevor der Dienst freigegeben wird. Persistenzfehler werden abgelehnt statt zu geschäftlichen Fehlern zu werden. Ein fehlgeschlagener flush rollt ein akzeptiertes Event nicht zurück; Aufrufer können es auflisten und mit seiner Version erneut versuchen. Erfolgreiche No-op-Mutationen flushen ebenfalls das aktuelle Präfix.

Cold-Mutationen mit Inhalt melden nach dem flush über `feedback/committed` ein geliehenes, schreibgeschütztes kanonisches Präfix; Beobachter müssen es vor einer Eigentumsübertragung tief kopieren. Beobachter sind fertig, bevor die Schreib-Eigentümerschaft freigegeben wird, dürfen keine weitere Feedback-Operation für diese Session abwarten und können eine bereits committete Mutation nicht ablehnen. Live-Consumer beobachten `session/event`.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Remote-Dienst, Payload-Validierung, Event-Projektion und Persistenz-Eigentümerschaft |
| [`src/types.ts`](src/types.ts) | Anfragen, Ergebnisse und Session-Event-Deklarationen; nur Typen |

Es wird kein Runtime-Invariant-Begleiter veröffentlicht: Der Dienst leitet Feedback direkt aus validierten kanonischen Events ab und besitzt keine unabhängig veränderbare Projektion.

Die jeweiligen APIs beschreiben das [Feedback-Subsystem](../../../docs/subsystems/feedback.de.md), die [Session-Persistenz](../../../docs/subsystems/persistence.de.md) und der [Browser-Consumer](../../client/ui-message-feedback/README.de.md).

<a id="model-experience"></a>
## Model Experience

### Nachrichten-Feedback

#### Was das Modell sieht

Nichts. `feedback/message-put` und `feedback/message-delete` tragen weder eine Surface-Platzierung noch ein Tool, einen Prompt-Abschnitt oder modellseitigen Kontext. Log-Export- und Zustellungsrichtlinien gehören ihren Consumern.

#### Token-Auswirkung

Null. Bewertungen, Notizen und Dienstergebnisse gelangen nicht in Modellanfragen.

#### KV-Cache-Auswirkung

Unabhängig. Feedback verändert das Modellanfrage-Präfix nicht.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Nur das Log ist maßgeblich:** vorhandene `message_feedback`-Sidecar-Daten werden weder gelesen noch migriert. Diese Dateien bleiben unverändert, aber ihr Feedback ist über diesen Dienst nicht verfügbar.
- **Löschen behält die Historie:** delete entfernt das aktuelle Feedback, nicht frühere Bewertungen oder Notizen aus dem Append-only-Log; es ist kein Privacy-Erasure-Vorgang.
- **Writer-Eigentümerschaft:** Hält ein anderer Prozess ein Session write handle, lehnen Cold-Mutationen ab. Der Dienst weckt diesen Besitzer nicht und koordiniert keine prozessübergreifenden Remote-Aufrufe.
- **Vertrauenswürdige Aufrufer:** Anfragen enthalten keinen authentifizierten Actor und keine Audit-Identität. Deployments müssen das Host-Gateway schützen.
- **Telemetrie-Export:** Für alle Nutzer und Provider, einschließlich `deepseek-official`, gibt das mitgelieferte OTel-Backend im Modus `FEEDBACK_ONLY` das vollständige kanonische Präfix erst nach neuem explizitem Textfeedback, Bewertungs-/Notizbearbeitungen oder einem Widerruf frei. Das Präfix enthält Kontext und wörtliche Notizen; spätere Datensätze warten auf das nächste Feedback, und `DISABLED` verhindert die Erfassung. Deployments sind für die Redaktion verantwortlich; siehe die [OTel-Exportrichtlinie](../../session/session-telemetry-otel/README.de.md).
- **Scan-Kosten:** Jedes `list`, `put` oder `delete`, das eine existierende Session erreicht, scannt ihr vollständiges Event-Log, um das aktuelle Feedback abzuleiten; Cold-Operationen lesen zusätzlich das vollständige Log aus der Persistenz. Der Aufwand wächst mit der gesamten Session-Historie, nicht nur mit der Zahl der Feedback-Einträge.
- **Aufbewahrungsumfang:** `maxNoteBytes` begrenzt eine einzelne Notiz, nicht die Gesamt-Loggröße oder Mutationsanzahl.

<a id="dev-note"></a>
### Dev Note

Die [Paket-Tests](tests/message-feedback.spec.ts) decken die Semantik des aktuellen Zustands und der dauerhaften Historie ab; die [Loader-Komposition](tests/loader-composition.spec.ts) verifiziert Live- und Cold-JSONL-Operationen über einen Neustart hinweg.
