# Agent Note: DeepSeek-Request-Header für Nutzer- und Session-Identität

Status: implemented

[English](2026-08-11-deepseek-request-user-id-header.md) | [中文](2026-08-11-deepseek-request-user-id-header.zh.md) | Deutsch

## Problem

Direkte DeepSeek-Requests trugen bereits `x-deepseek-harness-session-id`, wenn der Aufrufer `GenerateOptions.sessionId` lieferte; damit können providerseitiger Support und Diagnose die Turns einer Unterhaltung korrelieren. Es fehlte jedoch eine sessionsübergreifend stabile Identität, obwohl der Harness bereits eine anonyme User-id für Telemetrie und Feedback persistiert. Eine separate id würde die Korrelation brechen; sie in den providerneutralen Attributions-Helper zu legen, würde einen stabilen Per-User-Identifier über jeden HTTP-Adapter senden.

Die User-id ist Transport-Metadatum, nicht Modelleingabe. Sie darf weder in den Request-Body, den Prompt, die Token-Abrechnung, die KV-Cache-Identität noch in das Session-Log gelangen. Das Ziel ist die vom Adapter aufgelöste `baseURL` — DeepSeek selbst oder ein konfiguriertes Gateway —, daher muss die Datenschutzgrenze explizit sein.

## Entscheidung

`dsh-llm-deepseek` sendet `x-deepseek-harness-user-id` auf jedem Provider-Request, der nach erfolgreicher Credential-Auflösung abgeht. Der Wert stammt aus `@deepseek-ai/dsh-anonymous-user-id` und stimmt daher mit der OpenTelemetry-Resource `user.id` und der `/feedback`-Bestätigung desselben `$DSH_HOME` überein. Der Adapter sendet `x-deepseek-harness-session-id` weiterhin nur, wenn `GenerateOptions.sessionId` vorhanden ist; der agent loop liefert die aktuelle durable `Session.id` für normale agent-, Titelgenerierungs- und Compaction-Requests.

Das Plugin löst die User-id nach erfolgreicher Credential-Auflösung lazy auf und memoisiert sie für diese Plugin-Instanz. Ein fehlendes Credential erzeugt daher keine `.anonymous-user-id`, während der erste autorisierte Provider-Request sie auch dann erzeugen kann, wenn `DSH_TELEMETRY_DISABLED` gesetzt ist. Der Konstruktor des Direct-Adapters akzeptiert eine `resolveUserId`-Dependency, damit das Wire-Verhalten in Unit-Tests deterministisch bleibt.

Beide Header sind modellverborgene HTTP-Metadaten an die aufgelöste `baseURL`. Die Identitätswerte fehlen im JSON-Request-Body und werden weder modellsichtbare Eingaben noch Session-Events. Ein konfiguriertes Gateway empfängt sie. Providerspezifische Body-Erweiterungen gehören separat zur [DeepSeek-LLM-API-Erweiterungsentscheidung](../architecture/2026-08-21-deepseek-llm-api-request-extensions.de.md). Das Teilen des SessionTelemetryBackend steuert nur den Telemetrie-Export und deaktiviert die Provider-Request-Identität nicht.

## Verifikation

- Der mock provider assertiert, dass ein autorisierter Request dieselbe User-id trägt, die `getOrCreateAnonymousUserId()` zurückgibt, und den Session-Header auslässt, wenn keine Session-id geliefert wird.
- Der Session-Identitäts-Wire-Test assertiert beide Header und bewahrt die exakt gelieferte Session-id.
- Ein Direct-Adapter-Test assertiert, dass die User-id-Auflösung einmal pro Stream geschieht, während der keyless-Konfigurationstest beweist, dass ein Credential-Fehler keine `.anonymous-user-id` erzeugt.
- Der echte Loader-Kompositionstest assertiert, dass das assemblierte Plugin das geteilte User-id-Package nutzt statt eines Testwerts.
- Kein keyless snapshot ändert sich, weil die Header weder modellsichtbar noch nutzersichtbarer transcript-Inhalt sind.

## Erwogene Alternativen

| Abgelehnt | Grund |
|---|---|
| Die id in das generische `attributionHeaders()` aufnehmen | Dieser Helper ist providerneutral und statisch; ein Per-User-Wert würde dort unbeteiligte Provider erreichen und seinen App-Identitäts-Datenschutzvertrag verletzen |
| Einen festen Custom-Header in `cordis.yml` konfigurieren | Deployment-Konfiguration kann die aktuelle Session-id nicht ableiten und würde eine stabile Identität als veränderbare Config exponieren, statt ihren zuständigen Runtime-Vertrag zu nutzen |
| Eine DeepSeek-spezifische User-id prägen | Provider-Requests ließen sich dann nicht mit Telemetrie und Feedback desselben harness home korrelieren |
| Den Header mit dem Telemetrie-Sharing deaktivieren | Provider-Request-Identität und Telemetrie-Export haben unterschiedliche Empfänger und Zwecke; ein einziger Schalter würde die tatsächliche Datenschutzgrenze verdecken |
| Die id in OpenAI-kompatible `user`- oder `metadata`-Request-Felder legen | Body-Felder können Provider-schema, Logging, Caching, Tokenisierung oder modellsichtbare Rekonstruktion beeinflussen; HTTP-Metadaten bewahren die beabsichtigte Grenze |

## Konsequenzen

- DeepSeek-Support kann Requests über eine anonyme harness-home-id sessionsübergreifend und über die durable session id innerhalb einer Unterhaltung korrelieren.
- Der erste autorisierte DeepSeek-Request kann `$DSH_HOME/.anonymous-user-id` unabhängig vom Telemetrie-Export erzeugen.
- Custom-DeepSeek-Gateways empfangen die stabile User-id und eine etwaige Session-id; Betreiber müssen die konfigurierte `baseURL` daher als Identitätsempfänger behandeln.
- Die Identitäts-Header verändern weder Request-Body, Prompt, Token-Zahl, KV-Cache-Identität noch Session-Log; separat registrierte DeepSeek-Body-Erweiterungen behalten ihre eigenen Verträge.
