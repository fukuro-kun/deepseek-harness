---
description: "Host- und Client-Session-Steuerung: Sessions erstellen, fortsetzen, prompten, History folgen und Live-Session-Zustand projizieren."
kind: "package-reference"
---
# Session Controller
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`@deepseek-ai/dsh-api-session-controller` besitzt den Host-Service `ctx.sessionController` und die generierten Client-Remote-Namespaces `session`, `skills` und `fileReferences`. Er bedient Session-Lifecycle und History, den Host-generierten Modellkatalog, das Öffnen von Workspace-Pfaden, die user-invocable Skill-Discovery und Agent-gescopede Dateireferenzen. Über das API Gateway verwenden, wenn ein Client Operationen braucht, die an eine Session adressiert sind.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Session-Medienreferenzen](#session-media-references)
- [Konfiguration](#configuration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Entwicklerhinweis](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

History-Seiten und Follow-Opening-Snapshots tragen pro durablem Session-Event genau einen `{ type: 'event', event: SessionWireEvent }`-Record. Der Client behält jeden akzeptierten Record als einen durable `SessionEventLikeEntry`; Assistant-Token-Grenzen bleiben innerhalb des kompakten Streams auf `assistant/message` oder `assistant/attempt`. Tool-Argumente, Ergebnisinhalt, Fehlschläge und `tool/result.data.meta` gehen unverändert durch; der Controller löst keine Tool-Definition auf, führt keinen Presenter aus und hängt keine UI-Daten an.

Das Client-Journal validiert exakte V3-Event-Envelopes, bevor es Follow-Snapshots, Live-Einträge oder History-Seiten veröffentlicht. Es verwendet die browser-sicheren Session-Validatoren für erforderliche Surface-Marker, exakte Replacement-Endpunkte, frühere eindeutige Source-Seqs, eingebettete Assistant-Provenance, Request-Header-Auslassungen und Tool-Error-Konsistenz wieder. Ungültige Records scheitern ohne Feldstripping oder Normalisierung; Range-Zugehörigkeit und Source-Existenz bleiben Durable-Log-Prüfungen auf dem Host.

Jeder Endpoint benennt seine Aktivierungspolitik. List liest nur gespeicherte Header und Projection-Cache-Zeilen: Sie ruft niemals ein per-Session-Stat auf und öffnet nie einen kalten Session-Body. Eine Cache-Identität im aktuellen Format kann jeden List-Hint liefern; ein lifecycle-passender Vorgänger-Cache darf nur seinen version-kompatiblen Titel als stales Anzeigefaktum liefern, niemals als autoritativen Fold-Seed. Suche, Attachments, History-Seiten, Log-Following, Skill-Discovery und Workspace-Pfad-Öffnen können die Persistenz prüfen, ohne einen Agent zu aktivieren; `canOpenWorkspacePath()` meldet die Verfügbarkeit des nativen Öffnens, ohne eine Session zu adressieren. Queue-Mutation und Cancellation erfordern Live-Zustand; Modell-, Rename-, Prompt- und Dateireferenz-Operationen dürfen eine gewöhnliche Session auflösen oder fortsetzen. Prompt lehnt Content ohne nicht-leeren Text und ohne Attachment ab, bevor es den Agent auflöst oder Session-Events anhängt; Queue-Edits akzeptieren nur nicht-leeren Text-Content. Die Prompt-Aufnahme konsumiert opake Belege des injizierten [`fileUploads`](../../client/file-upload/README.de.md)-Host-Services und löst jeden Beleg desselben Agents auf, bevor sie die vollständige geordnete Content-Liste über `ctx.attachments` sendet. Prompt-Retries, deren `requestId` bereits gequeued oder geloggt ist, geben die ursprüngliche Annahme zurück, ohne eine weitere Message einzufügen. Create und Fork sind die einzigen Operationen, die direkt einen neuen Agent erzeugen. Der Service wendet eine preset-bewusste Resume-Policy und Subagent-Ownership-Fence auf seine eigenen Methoden und auf die Typert-Agent- und -Session-Lookups an, die andere Remote-Namespaces nutzen. Queue-Mutation hat eine schmale Ausnahme: Ein lebendes Child, dessen aktuell projizierte Identität fortsetzbar ist und aus seinem eigenen Nicht-Seed-Suffix stammt, akzeptiert die gewöhnlichen Edit-, Remove- und QueueDock-Steer-Actions über beide Inbox-Ziele. One-Shot-, fehlende, unbekannte, korrupte, nur-seed- oder kalte Children bleiben ohne Resume abgelehnt. Der Skill-Katalog nutzt einen lebenden Agent, wenn vorhanden, sonst den stehenden Scope des aufgezeichneten Presets, sodass ein Listing niemals einen Agent startet. Die authentifizierten Zustellrouten nutzen `workspaceDesktop()` für den Hostnamen der Servierinstanz und das Dateimanager-Verhalten. `openWorkspacePath({ path, action: "reveal" })` delegiert die Dateimanager-Navigation an den nativen Adapter; das Weglassen von `action` öffnet die Standardanwendung.

Der Client-Adapter stellt `SessionEventStream` bereit, einen Gateway-`RemoteJournalStream`, der an eine gewöhnliche oder Direct-Subagent-Adresse gebunden ist. Er öffnet Follow vor der ersten Seite, veröffentlicht nur zusammenhängende `replace`-, `prepend`-, `append`- und `settle-assistant`-Änderungen und repariert Reconnect- oder Sequenzlücken über eine Tail-Page. Rückwärts-Paging hat zwei Verben: `loadOlder()` zieht eine 50-Message-Seite, und `loadThrough(seq)` — der Turn-Jump-Loader — loopt 200-Message-Seiten, bis das Fenster die Ziel-Seq abdeckt, senkt bei wiederholten Aufrufen ein geteiltes Ziel, stoppt bei einer Seite ohne Fortschritt und meldet Beschäftigung über dasselbe `loadingOlder`-Snapshot-Bit. Der Web-Adapter entscheidet sich explizit für cursorlose Assistant-Frames: Jedes Opening trägt `startedAfterSeq`, `nextIndex` und den kompakten Stream des aktiven Attempts, und jedes Stream-Mitglied wird ein nur-Client-`assistant/live-chunk`-Eintrag, der zwischen durable Cursorn einsortiert ist. Der Host erfasst mit dieser Baseline eine follower-lokale Ankunftsordinalzahl und unterdrückt gebufferte Frames am oder vor dem Schnitt; ein Ersatz-Agent darf die Frame-Revision bei eins neu beginnen. Ein durable `assistant/message` oder `assistant/attempt`, das nach einem aktiven Opening eintrifft, bleibt nur dann vorgemerkt, wenn seine Seq auf `startedAfterSeq` folgt und Turn und Step passen; der passende End-Typ, Seq und Index veröffentlicht ein benanntes Settlement-Delta, das die transienten Zeilen des Attempts abräumt und den durable Eintrag hinzufügt, während frühere Retries desselben Steps sichtbar bleiben. Revisions-, Dense-Index- oder Settlement-Lücken eines bekannten Attempts öffnen Follow erneut, während ein Controller, der den Start verpasst hat, Unknown-Attempt-Frames ignoriert und deren durable Settlement normal veröffentlicht. Ein abgebrochener End-Frame veröffentlicht ein Settlement-Delta ohne durable Eintrag, sodass seine transienten Zeilen sofort abräumen. Eine durable Gap-Repair-Seite hat keine Assistant-Baseline, deshalb öffnet ihre gehaltene Notification Follow einmal für eine gepaarte Seite und Baseline erneut. Jeder History-Record deckt exakt seine Event-Seq ab. Ein Geschäfts-, Persistenz- oder ungelöster Kontinuitätsfehler beendet den Stream, während nur der Verlust des physischen Carriers automatische Wiederaufnahme wählt. `SessionControlStream` ist ein Gateway-`RemoteSnapshotStream`; jede Generation eröffnet mit einer vollständigen prozesslokalen Baseline, sodass ein Reconnect Queue-, Jobs- und Projektionszustand ersetzt, statt transiente Werte wie durable Events zu behandeln. Bei jeder Inbox-Änderung veröffentlicht der Host zuerst den Projektions-Frame und leitet den Queue-Ersatz aus demselben validierten Post-Fold-Wert ab, sodass die Listener-Registrierungsreihenfolge keinen staleness Queue-Frame erzeugen kann. Client-Agent-Kontexte liefern die Identität, die der unabhängige [`fileUpload`](../../client/file-upload/README.de.md)-Service nutzt; Session-Objekte exponieren Lifecycle-, Prompt-, Queue- und History-Operationen statt Dateitransfer.

Das Session-Objekt trägt außerdem lokale Submit-Echos: `session.beginSubmission` fügt synchron eines in `SessionSnapshot.pendingSubmissions` ein, bevor der Aufrufer serialisiert und promptet, sodass eine Konversations-UI die Message schon im Frame des Submit-Klicks zeigen kann. Das Echo speichert geordnete Bildvorschauen und durable Dateireferenzen. Session leitet seine Platzierung `transcript`, `queued` oder `steering` aus dem aktuellen Laufzustand und dem angeforderten Zustellmodus ab und behält diese Platzierung, solange die Serialisierung unterwegs ist. Die `requestId` des Prompts ist die Korrelationsidentität: Der Host echot sie als `rpcId` der durable User-Source, und Queue-Vorkommen projizieren sie als `SessionQueuedItem.rpcId`. Ein Echo geht einen Animationsframe nach Beobachtung seines durable Events oder Queue-Vorkommens in Rente, sofort, wenn sein identifizierter Prompt scheitert oder verworfen wird, und als failed bei Dispose. Jeder Ruhestand feuert `onRetire` genau einmal; ein beobachteter Ruhestand enthält die geordneten durable Attachment-Referenzen, sodass der Composer erfolgreiche Cards freigeben und fehlgeschlagene Drafts bewahren kann. Echos sind reiner Client-Speicher; Reload und Reconnect bauen die Konversation allein aus durable Events neu auf.


<a id="session-media-references"></a>
## Session-Medienreferenzen

`SessionMediaReferences` mountet `GET|HEAD /api/file?path=<absoluter Pfad>` auf dem authentifizierten `connection.fetch`-Kanal, wenn `connection`, `fs` und `attachments` komponiert sind. Es liest gewöhnliche Dateien über `ctx.fs`, einschließlich temporärer Pfade außerhalb registrierter Workspaces und Dateien in Remote-Providern. Weder Verzeichnis-Containment noch MIME-Kategorien beschränken den Zugriff; `mime-types` liefert den Response-Typ, mit `application/octet-stream` für unbekannte Erweiterungen. GET nutzt `readBytes` für Preflight- und laufende Byte-Limits; HEAD liest nur Metadaten. Alle Dateien verwenden `ctx.attachments.imageLimits.maxImageBytes` (normalerweise 20 MiB); Überschreitung liefert 413. Responses enthalten die vollständige Datei, ignorieren Range und tragen `private, no-store`, `nosniff` sowie eine Sandbox-CSP, sodass direkt geöffnetes HTML/SVG nicht mit dem API-Origin ausgeführt werden kann. Das Client-Rewrite lebt in `ui-chat` (`AssistantMarkdown`); Audio-/Video-Responses sind verfügbar, während Audio-/Video-Player-Knoten in Markdown getrennte Arbeit bleiben.

-----

<a id="configuration"></a>
## Konfiguration

| Feld | Standard | Bedeutung |
|---|---:|---|
| `nativeOpen` | plattformerkannt | Ob Session-Workspace-Pfade an einen nativen Desktop-Öffner übergeben werden können |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-api-session-controller) ist die erschöpfende Quelle für akzeptierte Felder und ihr JSDoc.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da aufgerufene Agent-Commands jede modellsichtbare Wirkung besitzen.

#### KV-Cache-Effekt

Kein direkter Effekt; Model-Requests bleiben im Besitz der Agent- und LLM-Pakete.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- Das Bild-Byte-Limit validiert weder dekodierte Abmessungen noch die Pixelzahl.
- Control-Baselines repräsentieren prozesslokalen Zustand und können Jobs nach einem Host-Neustart daher nicht rekonstruieren.
- Eine fehlgeschlagene Follow-Wiederaufnahme bleibt für den Aufrufer sichtbar, statt unbegrenzt zu retryen.
- Der rohe Browser-Upload ist ein einzelner HTTP-Streaming-Request ohne fortsetzbare Offsets; ein Retry sendet die Datei wieder ab Byte null.
- Dateireferenz-Vervollständigung nutzt den geteilten Agent-Lookup und kann eine kalte Session fortsetzen; der `skills/list`-Katalog ist die nicht-aktivierende Alternative für Skill-Metadaten.


<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Laufzeit-Invariante:** Es wird kein Companion veröffentlicht. Jede Seite und jeder Frame wird gegen die adressierte durable Session geprüft.
