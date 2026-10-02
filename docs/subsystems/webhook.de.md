# Webhook runtime

[English](webhook.md) | [中文](webhook.zh.md) | Deutsch

Das Webhook-Subsystem wandelt authentifizierte externe Zustellungen in optionale gewöhnliche Root-Sessions um. Provider-Adapter besitzen Authentifizierung und generische JSON-Aufnahme; vertrauenswürdige programmatische Regeln besitzen Bedingungen und externe Aufrufe; `ctx.webhookRuntime` besitzt den Callback-Lebenszyklus sowie die Workspace-basierte Session-Erstellung. Die [implementierte Entscheidung](../../.agents/notes/implemented/feature/2026-08-22-fire-and-forget-webhook-sessions.md) dokumentiert, warum die Runtime keinen Zustellungs- oder Abschlusszustand speichert.

## Gemeinsame Werte

`WebhookRuleId`, `WebhookSourceId` und `WebhookDeliveryId` sind opake Strings. Eine Delivery-ID dient nur der Provenienz: die Runtime speichert sie weder noch dedupliziert sie.

`WebhookEventMap` ist nach Provider-Art merge-erweiterbar. `WebhookEventOf<K>` wählt ein bekanntes Provider-Ereignis und lässt andernfalls generisches verlustfreies JSON zu, sodass ein Adapter außerhalb des Baums ohne Änderung des Runtime-Pakets funktioniert.

`VerifiedWebhookDelivery<K>` enthält `kind`, die konfigurierte `source`, die Provider-`deliveryId`, das normalisierte `event` und eine nicht-negative Safe-Integer-`receivedAt`. Die Runtime validiert, löst und friert den gesamten Wert ein, bevor sie ihn an mehr als eine Regel weiterleitet.

`WebhookRule<K>` enthält eine eindeutige ID, die Provider-Art und `run(delivery, signal)`. Der Callback kann beliebigen vertrauenswürdigen Code ausführen. Er gibt `null` oder einen `WebhookSessionRequest` zurück und muss bei asynchroner Arbeit, die beim Entladen der Registrierung gestoppt werden soll, das Signal beobachten.

`WebhookSessionRequest` erfordert einen absoluten `workspacePath`, Titel, Text-Prompt, Agent-Preset und Permission-Preset. Das optionale `model` benennt eine explizite Provider/Model-Route mit optionaler Output-Token-Obergrenze und verwendet den Reasoning-Standardwert dieses Adapters. Weglassen erstellt einen Snapshot der vollständigen aktuellen Deployment-Auswahl einschließlich Reasoning-Effort, bis die erste Anfrage ihren dauerhaften Header aufzeichnet.

## Fire-and-Forget-Dispatch

`dispatch()` erstellt einen Snapshot der übereinstimmenden Regeln, plant jede unabhängig und kehrt zurück, bevor ein Callback abgeschlossen ist. Exceptions und Rejections werden pro Regel eingegrenzt. Die Registrierungs-Disposition entfernt die Regel, bevor sie ihre aktiven Aufrufe abbricht und entleert, sodass keine spätere Zustellung in Code eintreten kann, der gerade entladen wird.

Die Runtime hat keine Queue, keinen Retry, keine Deduplizierung, keinen Ausführungsstatus, kein Crash-Replay, keinen Agent-Status-Listener und kein Abschluss-Ergebnis. Wiederholte Zustellungen können wiederholte Sessions erzeugen. Die einzige Tabelle aktiver Operationen ist private Teardown-Buchführung und verschwindet mit dem Prozess.

## Session-Erstellung

Ein nicht-null Ergebnis wird vor der asynchronen Vorprüfung als Snapshot erfasst. Die Runtime validiert Permission- und Agent-Presets, löst den kanonischen Workspace auf oder erstellt ihn, erzeugt einen Agent, dessen Session-cwd dem Workspace-Pfad entspricht, bindet das ausgewählte Agent-Preset vor der Veröffentlichung ein und fügt die Session dauerhaft an, bevor Permission, Titel und der initiale Follow-up angewendet werden.

Der Follow-up ist eine gewöhnliche dauerhafte User-Role-Message mit `source.kind: "webhook"` und Provenienz für Provider/Source/Delivery/Rule. Seine akzeptierte Inbox-Einfügung schließt die Webhook-Operation ab. Die Runtime führt kein spezielles Flush aus und wartet nicht auf den Turn; anschließend gelten die gewöhnliche Session-Persistenz und der Agent-Lebenszyklus.

Fehlgeschlagenes Anhängen disposed den neuen Agent, bevor ein Prompt existiert. Ein Fehler zwischen Anhängen und Prompt-Akzeptanz versucht Workspace-Detach und Agent-Disposal, ohne den ursprünglichen Fehler zu ersetzen. Ein während der Vorprüfung automatisch erstellter Workspace bleibt erhalten, da ein anderer gleichzeitiger Aufrufer ihn bereits verwenden könnte.

## GitHub-Adapter

`@deepseek-ai/dsh-webhook-github` registriert eine exakte Route auf einem injizierten WebServer, löst seine Credential-Referenz für jede Anfrage, verifiziert den unveränderten `application/json`-Body vor dem Parsen und gibt `202` sofort nach der In-Memory-Dispatch zurück. Sein normalisiertes Ereignis garantiert ein signiertes, verlustfreies JSON-Objekt; Regeln validieren die ereignisspezifischen Felder, die sie konsumieren.

Der [GitHub-Review-Leitfaden](../user/guide/github-review.de.md) bindet diese Route auf einen isolierten zweiten WebServer ein, sodass das Freigeben des Webhook-Eingangs nicht die Browser-API freigibt.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.de.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxwebhookruntime--webhookruntime"></a>

### `ctx.webhookRuntime` — `WebhookRuntime`

Fire-and-forget rule runtime. Session creation is the only built-in action.

```ts cordis-catalog
/**
 * Register one trusted programmatic rule.
 * @param rule - unique id, provider kind, and arbitrary callback.
 * @returns awaitable effect disposer that aborts and drains this rule's active callbacks.
 */
register<K extends string>(rule: WebhookRule<K>): () => Promise<void>

/**
 * Start every currently matching rule and return before any callback settles.
 * @param delivery - authenticated provider data; snapshotted before dispatch.
 * @throws synchronously when the runtime is closing or the delivery is malformed.
 */
dispatch<K extends string>(delivery: VerifiedWebhookDelivery<K>): void
```

Source: [`packages/webhook/webhook/src/index.ts`](../../packages/webhook/webhook/src/index.ts)
<!-- END GENERATED cordis-surface -->
