---
description: "OpenTelemetry-Session-Telemetry-Backend für Deployments, die einen Modus wählen, den Exporter konfigurieren oder nachvollziehen, was die Maschine verlässt."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-telemetry-otel

[English](README.md) | [中文](README.zh.md) | Deutsch

## Überblick

`dsh-session-telemetry-otel` exportiert Session-Records über das OTel-JS-SDK nur nach neuem explizitem Feedback, für alle Nutzer und Provider, einschließlich `deepseek-official`. `FEEDBACK_ONLY` gibt das kanonische Präfix bis zu diesem Feedback frei, einschließlich Kontext; spätere Records warten auf das nächste explizite Feedback. `DISABLED` konstruiert keinen Transport. SDK-Batching kann einen autorisierten Upload ohne weitere Nutzerinteraktion oder Modellaufruf abschließen. Deployments besitzen ihre Redaction-Regeln.

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

Mounte dieses Plugin, wenn ein Deployment Session-Records über OpenTelemetry-Logs exportieren soll. Wähle einen Modus, gib dem Exporter einen Endpoint und entscheide, ob Redaction-Regeln auf dem Seam gemountet werden.

### Modi

| `mode` | Verhalten |
|---|---|
| `FEEDBACK_ONLY` | Default. Text-Feedback, Rating-Erstellung/-Bearbeitung, Notiz-Bearbeitung und Widerruf geben das noch nicht übergebene Präfix über dieses kanonische Feedback-Event frei; spätere Records warten |
| `DISABLED` | Es werden weder Coordinator, Provider, Processor noch Exporter konstruiert; kein Telemetry-Record verlässt den Prozess. Live-Feedback warnt lokal; kalte Mutationen bleiben still |

Programmatische TypeScript-Konfiguration verwendet das exportierte `SessionTelemetryMode`-Enum; rohe String-Literale sind nicht zuweisbar. `FULL` wird zurückgewiesen, ist kein Alias. Die [`sharing`-Property](../session-telemetry/README.de.md#the-sharing-disclosure) meldet `feedback-only` oder `disabled`, keine Zustellquittung. Die `/feedback`-Bestätigung bestätigt nur die Aufzeichnung.

### Minimale Konfiguration

Upload-Modi benötigen eine Exporter-URL und akzeptieren die SDK-Optionsblöcke wörtlich:

```yaml
- id: sessionTelemetry-otel
  name: '@deepseek-ai/dsh-session-telemetry-otel'
  config:
    mode: FEEDBACK_ONLY       # optional; defaults to FEEDBACK_ONLY
    shutdownTimeoutMillis: 3000 # optional; defaults to 3000
    exporter:                # passed verbatim to the SDK's OTLP/HTTP log exporter
      url: https://collector.example.com/v1/logs
      headers:
        authorization: !!js `Bearer ${process.env.OTLP_TOKEN}`
    processor: {}            # optional; passed verbatim to BatchLogRecordProcessor
```

| Feld | Default | Bedeutung |
|---|---|---|
| `mode` | `FEEDBACK_ONLY` | Sharing-Policy: `FEEDBACK_ONLY` oder `DISABLED` |
| `exporter.url` | Pflicht in Upload-Modi | Vollständiger OTLP-Logs-Endpoint; muss als `http(s)` parsen |
| `exporter`, `processor` | — | Wörtlich an SDK-Exporter und Batch-Processor weitergereicht |
| `shutdownTimeoutMillis` | `3,000` | Äußere Frist für die vollständige Shutdown-Sequenz des SDK |

Direkte `ctx.sessionTelemetry.emit()`-Aufrufe sind in jedem Modus No-ops und können die Feedback-Autorisierung nicht umgehen. Geerbtes Parent-Feedback autorisiert keinen Child-Export: Das Child braucht neues eigenes Feedback. Sein autorisiertes Präfix enthält dann geerbten Kontext.

Model-Requests, Request-Header, Session-Erstellung oder -Adoption, Wiederherstellung und Plugin-Mount oder HMR autorisieren keine Capture. Gespeichertes Feedback allein triggert nichts. Geplante SDK-Flushes und Shutdown dürfen früher autorisierte Batches abschließen, aber niemals neue Records capturen.

### Was die Maschine verlässt

In Upload-Modi tragen Records das vollständige `event.data`, wie es das `sessionTelemetry/record`-Waterfall des Seams zurückgibt — Nachrichteninhalte, Tool-Argumente und -Ergebnisse, den System-Prompt und Tool-Schemas, Todo-Text, Compaction-Summaries, Feedback-Text und die Session-`cwd`. Provider-Credentials erscheinen nie: Adapter-API-Keys sind Konstruktorparameter, keine Session-Events, also strukturell im Log abwesend und damit auch in der Telemetrie. `DISABLED` konstruiert keine SDK-Pipeline und übergibt keine Capture an ein Backend.

### Fehler und Shutdown

Fehlkonfiguration schlägt beim Plugin-Load fehl: eine fehlende oder nicht-`http(s)`-`exporter.url`, ein nicht positiv-ganzzahliger `processor.maxExportBatchSize` (den das SDK akzeptiert, an dem es dann beim Shutdown hängt) und ein ungültiges `shutdownTimeoutMillis` werden alle abgelehnt, bevor irgendein Record exportiert wird. Während des Shutdowns wartet OTel `exporter.forceFlush()` ab, bevor das begrenzte Completion-Promise des Processors; setzt sich dieses Transport-Promise nie, gibt dieses Paket das Warten bei `shutdownTimeoutMillis` auf, loggt den eingedämmten Fehler und lässt den Anwendungs-Teardown weiterlaufen — dann noch ausstehende Records können beim Prozessende verloren gehen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Komposition des Backends; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designkonzept

Das Backend ist ein dünner Adapter über dem OTel-JS-SDK: Es besitzt Feedback-Autorisierung, Resource-Identität und eine äußere Shutdown-Frist. Kanonische Ledger-Records verwenden den Instrumentation-Scope `@deepseek-ai/dsh-session-telemetry-otel`; dieses Backend capturet keine operativen Records. Die Resource-Identität trägt `service.name`/`service.version` aus `APP_IDENTITY` von `dsh-llm` plus die anonyme `user.id` (aus `$DSH_HOME/.anonymous-user-id`), einmal pro Export-Batch statt pro Record.

### Source-Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: Modus-Auflösung, Fail-closed-Validierung, SDK-Pipeline-Verdrahtung, Coordinator-Komposition, Shutdown-Frist |

### Capture-Verdrahtung

Das Backend verwendet On-demand-Capture mit einbezogener gespeicherter History. Nur neue eigene `feedback/record`-, `feedback/message-put`- oder `feedback/message-delete`-Events triggern Live-Capture, begrenzt durch dieses Event. Eine kalte `feedback/committed`-Benachrichtigung liefert ihren committeten kanonischen Snapshot, ohne eine live Session oder einen Agent zu veröffentlichen. Same-Object-Handoff-Cursor unterdrücken wiederholte Capture. Das Backend implementiert kein `flush()`; das SDK besitzt Batching und Shutdown-Drain.

### Feld-Mapping

Jeder Telemetry-Record mappt auf einen SDK-Log-Record mit captured Timestamp, Severity, Body und Attributen. Feedback autorisiert das vollständige noch nicht übergebene Präfix, nicht nur die Feedback-Payload.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Backend-Vertrag nicht reicht. Sie führen von dem Seam, den es implementiert, zur Subsystem-Referenz und zur Identität, die es meldet.

- [Session-Telemetry-Seam](../session-telemetry/README.de.md) — der Capture-Vertrag, das Record-Vokabular und das Redaction-Waterfall.
- [Session-Telemetry-Subsystem](../../../docs/subsystems/session-telemetry.de.md) — die Capability-Aufteilung und Typdeklarationen.
- [Anonyme Nutzeridentität](../../identity/anonymous-user-id/README.de.md) — die als OTel-Resource `user.id` gemeldete ID.
- [Generierter Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-session-telemetry-otel) — jedes akzeptierte Config-Feld und seine Quelldeklaration.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Backend Seam-Records in die OTel-SDK-Pipeline weiterleitet und nichts Model-zugewandtes registriert.

#### KV-Cache-Effekt

Keiner; das Paket assembliert weder einen Provider-Request noch sendet es einen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo SDK-Verhalten dominiert und wo Export-Garantien enden. Sie sind aktuelle Paket-Constraints.

- **Upstream-experimenteller Baum** — `@opentelemetry/sdk-logs` wird aus dem experimentellen Upstream-Baum veröffentlicht; SDK-API-Drift landet hier und nur hier, während der Seam-Vertrag sich nicht bewegt.
- **Live-Collector-Verhalten gehört dem SDK-Exporter** — Authentifizierung, TLS, Throttling und sonstiges reales OTLP-Deployment-Verhalten folgen dem Upstream-SDK statt einer paketseigenen Kompatibilitätsschicht.
- **Best-effort-Handoff** — neue kalte Snapshots und eine neue Feedback-Einreichung nach Restart können Präfixe wiederholen; Receiver deduplizieren nach Session-ID, Formatversion und Event-Seq. Es gibt kein dauerhaftes Outbox, keine Delivery-Watermark, kein automatisches Retry-Versprechen und keine Collector-Akzeptanz-Garantie. OTel und der Opt-in-DeepSeek-API-Pfad können sich überlappen. Widerruf exportiert ein Lösch-Event, keine Remote-Löschung.

- **Backend-Verfügbarkeit** — Feedback, das eingereicht wird, während dieses Plugin deaktiviert oder entladen ist, wird lokal aufgezeichnet, aber bei seiner Rückkehr nicht automatisch nachgespielt. Capture setzt voraus, dass der Subscriber gemountet bleibt, bis er die Einreichung beobachtet; Entladen während eines ausstehenden kalten Schreibvorgangs kann dessen Post-Flush-Benachrichtigung verpassen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Die Moduswahl ändert Capture-Handoff, SDK-Setup und lokale Diagnostik, ohne Session- oder Service-State zu mutieren, den ein unabhängiger Companion vergleichen könnte. Der Export bleibt innerhalb des SDK jenseits der Backend-Grenze.
