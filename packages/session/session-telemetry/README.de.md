---
description: "Session-Telemetry-Capture-Seam für Deployments und Backend-Autoren, die ein Reporting-Backend wählen, Redaction-Regeln mounten oder den Backend-Vertrag implementieren."
kind: "package-library"
---

# @deepseek-ai/dsh-session-telemetry
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Session-Telemetry lässt Deployments geordnete Kopien der Sitzungsaktivität zur Berichterstattung versenden, während das kanonische Session-Log erhalten bleibt. Deployments wählen ein Reporting-Backend und können jede ausgehende Kopie vor der Zustellung redigieren; ohne Redaction-Regeln verlassen erfasste Daten den Prozess unverändert. Die Übergabe ist nicht blockierend, sodass Reporting die Session-Verarbeitung nicht verzögert. Die Zustellung ist best effort; wartende Records können bei einem Prozessabsturz verloren gehen.

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

Als Deployment wählen und mounten Sie ein Backend und fügen Redaction-Regeln hinzu, wenn Records nicht wie erfasst den Prozess verlassen dürfen. Als Backend-Autor implementieren Sie den Drei-Mitglieder-Vertrag und komponieren den Koordinator mit einem Capture-Modus.

### Backend wählen und mounten

Laden Sie genau ein Backend-Plugin; es registriert `ctx.sessionTelemetry` mit dem Capture-Koordinator und seiner Zustell-Pipeline. Ein doppeltes Laden wirft. Das erforderliche [`sharing`-Mitglied](#the-sharing-disclosure) meldet den Deployment-Modus, nicht die Session-Zulassung oder -Zustellung. Ein Consumer darf nur dann „nicht konfiguriert" melden, wenn kein Telemetry-Service gemountet ist. Der `/feedback`-Befehl bestätigt die Aufzeichnung, ohne diese Policy zu lesen.

### Der Backend-Vertrag

Ein Backend implementiert drei Mitglieder: `emit(record)` muss ein nicht blockierendes Enqueue sein, da es synchron auf dem Session-Event-Pfad läuft; das optionale `flush()` ist ein fire-and-forget-Hinweis nach Turn-Ende, den die meisten Backends zugunsten des eigenen Batching-Zeitplans ihres SDK weglassen; `shutdown()` entleert wartende Records und resolved, wenn das SDK stoppt, und die Entsorgung erwartet es. Ein Backend, das `flush()` implementiert, muss nebenläufige Flushes mit dem abschließenden `shutdown()`-Drain ordnen.

### Was erfasst wird

Capture läuft in einem von zwei Modi. `live`-Capture folgt Session-Events beim Anhängen, replayed bereits laufende Sessions beim Mounten und zeichnet Lifecycle-Marker auf; `on-demand`-Capture liest das kanonische Session-Log nur, wenn das Backend über `captureSession(session, throughSeq?)` ein Präfix anfordert. Koordinator-Optionen wählen, ob gespeicherte Historie einbezogen wird. Jedes kanonische Session-Event bildet der Reihe nach auf einen ledger-Record ab. Ein `assistant/message`- oder `assistant/attempt`-Record trägt seinen kompletten eingebetteten kompakten Stream, einschließlich fehlgeschlagener und wiederholter Ausgaben. Jeder ledger-Record trägt außerdem `session.id`, `session.format_version`, die numerische Event-Identität, optionale Header-Fakten und eine vorab gemappte Severity (`error` für `tool/result.isError`, `turn/end`-Fehlergründe und `agent-error`; sonst `info`).

### Die Sharing-Offenlegung

<a id="the-sharing-disclosure"></a>

Jedes Backend legt seinen Deployment-Modus über `sharing` offen: `full`, `feedback-only` oder `disabled`. Ein Backend kann zusätzlich berechtigte Sessions einschränken. Diese Eigenschaft ist keine Zustellquittung; die Übergabe ist ein nicht blockierendes Enqueue, und Batching-, Retry- und Verlust-Policy gehören dem Backend-SDK.

### Records redigieren

<a id="the-redact-waterfall"></a>

Jeder ausgehende Record durchläuft den `sessionTelemetry/record`-waterfall, nachdem der Koordinator sein kanonisches Event kopiert hat. Dieses Paket liefert keine Regeln: ohne gemounteten Listener erreichen Records das Backend genau wie erfasst — exportierte Daten sind also nur so sauber wie die Regeln, die ein Deployment mountet. Listener stapeln sich, indem sie den Rückgabewert von `next()` transformieren; ein werfender Listener hält diesen einen Record fail-closed zurück. Redaction gilt nur für die ausgehende Kopie — das kanonische Session-Log wird nie umgeschrieben.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Capture-Design; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Designkonzept

Der seam beruht auf einer Grenze: der Anteil des harness endet bei `emit()`. Vollständige Event-Erfassung, Redaction und der Handoff-Cursor leben hier; Batching, Retry, Queueing und Verlust-Policy gehören dem Reporting-SDK und werden bewusst nicht modelliert oder umhüllt. Design und verworfene Alternativen sind in der [Revival-Agent-Note](../../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.de.md) festgehalten.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Service Definition: `SessionTelemetryBackend`/`SessionTelemetrySink`-Vertrag, Record-Vokabular, `session-telemetry/record`-waterfall-Deklaration |
| [`src/coordinator.ts`](src/coordinator.ts) | Capture: live-Listener, lifecycle-lokales on-demand-Replay, Redaction, Handoff-Cursor, Fehlerisolation |

### Capture-Ablauf

Live-Capture registriert Session-Events, Flush-Hinweise, Shutdown-Marker und agent/error-Observer über die effects der komponierenden fiber. On-demand-Capture registriert nur den Entsorgungs-effect und liest das angeforderte kanonische Log-Präfix unter seiner Historien-Policy. Synchrone Handler isolieren Fehler, damit sie weder den agent loop noch andere Listener beeinflussen können.

### Der Handoff-Cursor

Ein modulweites `WeakMap<Session, seq>` hält die höchste übergebene — nicht zugestellte — Sequenz fest. Die Wiederadoption desselben Objekts setzt hinter diesem Cursor fort. Capture beginnt normalerweise bei `firstLiveSeq`; explizites `includeHistory: true` startet ein unbehandeltes Objekt bei seq 0, einschließlich wiederhergestellter oder fork-Historie. Das Backend besitzt die Capture-Autorisierung. Gespeicherte Historie autorisiert Capture nicht selbst; das OTel-Backend wartet auf neues explizites Feedback. Empfänger deduplizieren wiederholte Records nach `(session.id, session.format_version, event.seq)`.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der seam-Vertrag nicht reicht. Sie führen vom ausgelieferten Backend zur Subsystem-Referenz und zum Entscheidungsnachweis.

- [OpenTelemetry-Telemetry-Backend](../session-telemetry-otel/README.de.md) — das ausgelieferte Backend, das Deployments laden, mit Modus- und Exporter-Konfiguration.
- [Session-Telemetry-Subsystem](../../../docs/subsystems/session-telemetry.de.md) — die Capability-Aufteilung und Typdeklarationen.
- [Session-Telemetry-Revival-Entscheidung](../../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.de.md) — Begründung, Abwägungen und verworfene Alternativen.
- [Session-Paketkarte](../README.de.md) — benachbarte Persistenz-, Projektions-, Titel- und Telemetry-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da der seam den Session-Strom beobachtet und redigierte Kopien nach außen reicht; er registriert nichts Modellzugewandtes.

#### KV-Cache-Auswirkung

Keine; das Paket stellt weder einen Provider-Request zusammen noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren die Zustell- und Datenschutzgarantien, die ein Deployment erhält. Sie sind aktuelle Paketrestriktionen.

- **Best-effort-Zustellung** — der Cursor markiert übergeben, nicht zugestellt; eine Session, die innerhalb eines Reload-Fensters abgebaut wird, kann nicht wieder adoptiert werden, und was zum Absturzzeitpunkt in einer Backend-Queue liegt, geht verloren. Eine dauerhafte Outbox (spool, Cursor pro sink, at-least-once) wird zurückgestellt, bis ein Deployment ein Absturzverlust-Anforderung formuliert.
- **Keine eingebauten Redaction-Regeln** — ohne gemounteten `sessionTelemetry/record`-Listener verlassen Records den Prozess wie erfasst, einschließlich aller Credentials in Dateiinhalten oder Befehlsausgaben; ein Deployment, das an einen geteilten Collector exportiert, besitzt sein Regelset.
- **On-demand-Redaction nutzt den aktuellen Zustand** — nicht erfasste Events existieren nur im kanonischen Session-Log; ein späteres `captureSession()` kopiert und redigiert deren damalige Werte tief mit der dann gemounteten Policy, und es gibt weder einen Capture-Zeitpunkt-Telemetry-Snapshot noch einen dauerhaften Pre-Capture-spool.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Laufzeitinvariante:** Es wird kein Begleiter veröffentlicht. Die gesamte Ausgabe des Pakets ist der Backend-Handoff — ein synchroner `emit()`-Aufruf außerhalb jedes autoritativen Event-Stroms —, und seine Capture-Seite hängt nie Session-Events an; es existiert also keine Event-/Datenbeziehung, die ein unabhängiger Begleiter beobachten könnte.
