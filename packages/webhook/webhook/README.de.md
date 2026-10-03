---
description: "Webhook-Rule-Runtime für Maintainer, die vertrauenswürdige External-Event-Policies registrieren, die Workspace-Sessions erstellen."
kind: "package-reference"
---

# @deepseek-ai/dsh-webhook
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

`dsh-webhook` stellt den Host-`ctx.webhookRuntime` bereit: eine Registry für vertrauenswürdige programmatische Webhook-Regeln plus die eine eingebaute Action, die eine gewöhnliche Root-Session in einem Web-Workspace erstellt. Das Interface bleibt bei `register(rule)` und `dispatch(delivery)`; Provider-Authentifizierung gehört zu Adapter-Paketen. Zu verwenden, wenn eine vertrauenswürdige Regel ein externes Event in eine neue Agent-Session verwandeln muss.

## Inhaltsverzeichnis

- [Rule-Interface](#rule-interface)
- [Session-Request](#session-request)
- [Komposition](#composition)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Entwicklerhinweis](#dev-note)

-----

<a id="rule-interface"></a>
## Rule-Interface

`WebhookRule<K>` hat eine gebrandete eindeutige `id`, ein Provider-`kind` und `run(delivery, signal)`. Ein Callback darf beliebigen vertrauenswürdigen Code ausführen und gibt entweder `null` oder einen `WebhookSessionRequest` zurück. Regeln desselben Kinds starten unabhängig, und ein Throw oder eine Rejection wird geloggt, ohne die Geschwister auszuhungern.

`VerifiedWebhookDelivery` trägt Provider-Kind, konfigurierte Source-id, Provider-Delivery-id, normalisiertes verlustfreies JSON und Empfangszeit. Die Runtime snapshotet und friert den vollständigen Wert ein, bevor sie ihn teilt. `deliveryId` ist reine Provenance; eine wiederholte Zustellung lässt die Regeln erneut laufen.

Registrierung ist ein Effect. Ihr awaitbarer Disposer blendet die Regel zuerst aus, dann bricht er aktive Callbacks ab und leert sie. Callbacks müssen das gelieferte Signal beachten; Same-Process-Code, der Cancellation ignoriert, kann nicht sicher zwangsbeendet werden.

<a id="session-request"></a>
## Session-Request

`WebhookSessionRequest` verlangt `workspacePath`, `title`, `prompt`, `agentPreset` und `permissionPreset`; das optionale `model` benennt eine explizite Provider-/Modell-Route plus eine Output-Token-Obergrenze. Eine explizite Route nutzt den Reasoning-Default ihres Adapters. Eine Auslassung snapshotet die vollständige aktuelle Deployment-Auswahl einschließlich Reasoning-Effort, bis der erste Request seinen durable Header aufzeichnet; spätere Web-Modelländerungen behalten das gewöhnliche Session-Verhalten.

Die Runtime validiert Presets vor der Mutation, löst den kanonischen Workspace auf oder erstellt ihn, erstellt einen Agent mit diesem Workspace-Pfad als `SessionHeader.cwd`, mountet das Agent-Preset vor der Publikation und attach't die Session, bevor sie Permissions, Titel und Prompt anwendet. Ein fehlgeschlagener Attach disposed die unveröffentlichte Aktion. Ein späterer Fehlschlag vor dem Prompt detached den Workspace und disposed den Agent als Best-Effort-Rollback.

Erfolgreiches `Agent.followup()` ist der Commit-Punkt der Webhook-Operation. Die Message nutzt `source.kind: "webhook"` mit Provider-, Source-, Delivery- und Rule-Provenance. Die Runtime wartet nicht auf Idle, flusht nicht besonders, inspiziert die Antwort nicht und veröffentlicht keinen Completion-Status; das gewöhnliche Agent- und Session-Verhalten besitzt alles danach.

<a id="composition"></a>
## Komposition

Die Runtime auf der Web-Host-Ebene laden, nach Agents, Modell-Defaults, Agent-Presets, Permission-Presets, Titeln und der Workspace-Registry. Vom Nutzer verfasste Rule-Plugins injizieren `webhookRuntime` und geben den von `register()` zurückgegebenen Disposer über ihren eigenen Effect ab.

Der [GitHub-Review-Guide](../../../docs/user/guide/github-review.de.md) zeigt ein Rule-Modul, einen dedizierten Ingress-Port, Secret-Setup und Workspace-Routing.

<a id="model-experience"></a>
## Model Experience

### Vom Regelautor verfasster Initial-Prompt

#### Was das Modell sieht

Für jede passende Regel sieht das Modell exakt den nicht-leeren Text, der als `WebhookSessionRequest.prompt` zurückgegeben wird. Die generische Runtime fügt kein eigenes Framing hinzu; eine Regel, die externen Text einbaut, besitzt dessen Vertrauenskennzeichnung. Das ausgelieferte GitHub-Beispiel kennzeichnet ausgewählte PR-Felder als nicht vertrauenswürdige JSON-Metadaten.

#### Token-Effekt

Eine datenabhängige User-Role-Message wird in der neuen Session gehalten und trägt Tokens bei, bis die gewöhnliche Compaction diese History ersetzt oder entfernt.

#### KV-Cache-Effekt

Der Initial-Prompt beginnt eine neue Session und etabliert daher das wiederverwendbare Request-Präfix dieser Session, statt es zu invalidieren.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Nur prozesslokales Fire-and-Forget** — ein Crash verliert Regelaufrufe, die noch keinen Prompt angenommen haben; es gibt keine Queue, kein Replay und keinen Retry.
- **Keine eingebaute Deduplizierung** — wiederholte Provider-Zustellungen können wiederholte Sessions erzeugen; Regeln, die Idempotenz brauchen, besitzen sie selbst.
- **Kein Completion-Ergebnis** — HTTP-Annahme und Regel-Abrechnung melden weder Agent-Erfolg noch Idle noch Output.
- **Vertrauenswürdige Callbacks müssen bei Cancellation mitwirken** — das Runtime-Teardown bricht sie ab und wartet sie ab, kann aber beliebigen Same-Process-Code nicht beenden.
- **Workspace-Erstellung kann einen fehlgeschlagenen Session-Versuch überleben** — ein leerer Workspace bleibt erhalten, weil ein anderer nebenläufiger Aufrufer ihn bereits nutzen könnte.


<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
