# Agent Note: Pflicht-`User-Agent`-Attribuierung für provider-Anfragen

Status: implemented

[English](2026-06-21-mandatory-app-attribution-headers.md) | [中文](2026-06-21-mandatory-app-attribution-headers.zh.md) | Deutsch

## Problem

LLM-provider-Anfragen sollten das Produkt, das sie sendet, identifizieren. Das ist nützlich für provider-seitigen Support, Missbrauchsermittlung, Kompatibilitäts-Debugging und Traffic-Analyse. Vor dieser Agent Note tat der harness dies nur teilweise: der handgeschriebene DeepSeek-adapter sendete eine hand-kopierte `User-Agent`-Konstante (`packages/llm/llm-deepseek/src/adapter.ts`), während der pi-ai-basierte twin keinerlei harness-eigene header sendete (`packages/llm/llm-pi-ai/src/adapter.ts`). Neue adapter konnten daher die Attribuierung stillschweigend weglassen, und ein library-basierter adapter konnte sich vom handgeschriebenen adapter unterscheiden, obwohl [die twin-adapter Agent Note](2026-06-13-twin-llm-adapters.de.md) existiert, um den provider contract über beide Implementierungen hinweg ehrlich zu halten.

Der unmittelbare Auslöser kam aus OpenRouters [App Attribution](https://openrouter.ai/docs/app-attribution)-Dokumentation. OpenRouter erstellt app-Seiten und Rankings aus `HTTP-Referer` plus display/category-headern. Das ist wertvoll, aber es ist nicht der HTTP-Standard für application identity. Das Risiko besteht darin, OpenRouters exakten header-Satz so zu adoptieren, als wäre er universell, und dann provider-spezifische header zu direkten DeepSeek-Anfragen, zukünftigen OpenAI/Anthropic/Vertex-adaptoren, Testservern oder Proxys durchsickern zu lassen, die unbekannte Felder unbegrenzt lang protokollieren.

## Untersuchung

- **OpenRouters Mechanismus ist provider-spezifisch.** Ihre aktuelle Dokumentation besagt, dass app-Attribuierung über `HTTP-Referer` (erforderlich), `X-OpenRouter-Title` und `X-OpenRouter-Categories` verfolgt wird; `X-Title` wird nur aus Kompatibilitätsgründen akzeptiert. Ihr API-Reference bezeichnet die headern als optional und sagt, sie machen die app auf OpenRouter auffindbar. Dies ist ein konkreter OpenRouter contract, kein IETF- oder OpenAI-kompatibler API-Standard.
- **In agent tooling ist `HTTP-Referer` eine OpenRouter-bewusste Konvention, keine allgemeine agent-Konvention.** Er ist üblich genug, dass OpenRouter SDKs und OpenRouter-Beispiele ihn direkt exponieren, und Frameworks, die OpenRouter targeten, brauchen normalerweise eine Möglichkeit, ihn durchzureichen. Aber agent-Protokolle wie ACP verhandeln Namen, Versionen und capabilities in ihren eigenen initialize-messages, während model-provider-Anfragen weiterhin HTTP-Level-identity benötigen. „Akzeptiert in der agent-Welt" bedeutet daher „von OpenRouter-Integrationen erkannt", nicht „portabel über agent runtimes oder provider hinweg".
- **Coding agents identifizieren Produkt und Version in `User-Agent`.** Öffentliche Implementierungen variieren in Umgebungsdetail und provider-spezifischen Neben-headern, aber Produkt-identity ist der gemeinsame contract; es gibt kein universelles exaktes Format.
- **Der standards-track-allgemeine client-identity-header ist `User-Agent`.** RFC 9110 Abschnitt 10.1.5 definiert `User-Agent` als die user-agent-Software-identity, sagt, er wird für Interoperabilitätsberichte und Analytik verwendet, und sagt, ein user agent SHALL ihn in jeder Anfrage senden, es sei denn, er ist auf das Gegenteil konfiguriert. Dies ist der einzige Standard-header, der direkt auf „welches Produkt sendet diese HTTP-Anfrage" passt.
- **`Referer` ist Standard, aber OpenRouters `HTTP-Referer` ist nicht das Standardfeld.** RFC 9110 Abschnitt 10.1.3 definiert `Referer` als die URI, von der die Ziel-URI stammt, und widmet erheblichen Text den Datenschutzbeschränkungen. OpenRouter verlangt stattdessen `HTTP-Referer` und verwendet ihn als app-URL-Identifikator. Dieser Name und diese Bedeutung sind OpenRouter-spezifisch, obwohl er der CGI-Umgebungsvariablen-Form des Standard-`Referer`-headers ähnelt.
- **`From` ist Standard, aber nicht geeignet als verpflichtender Default.** RFC 9110 Abschnitt 10.1.2 definiert `From` als eine E-Mail-Adresse für die Person, die für einen user agent verantwortlich ist. Robotische agenten SHALL ihn senden, damit Server einen Operator kontaktieren können, aber nicht-robotische agenten sollten ihn nicht ohne explizite Benutzerkonfiguration senden, aus Datenschutz- und Security-Policy-Bedenken. Der harness kann einen Operator-Kontakt später unterstützen, darf aber keinen erfinden oder ihn global verlangen.
- **Request-body-`user`- oder `metadata`-Felder sind keine app-Attribuierung.** Einige model-APIs exponieren einen stabilen Endbenutzer-Identifikator, Request-Metadaten, Labels oder project/account-headern. Diese sind nützlich für Missbrauchsaufsicht, interne Abrechnung, Dashboards oder Trace-Korrelation, aber sie identifizieren entweder den Endbenutzer statt des Produkts, sind provider-spezifisches body-schema oder sind nicht garantiert durch OpenAI-kompatible Gateways weitergeleitet. Sie sind kein Ersatz für einen statischen application-identity-header.
- **SDK-Telemetrie-headern identifizieren das SDK, nicht die app.** Offizielle und Drittanbieter-SDKs senden häufig library/version-headern. Diese helfen dem SDK-Wartenden, ihren client zu debuggen, aber sie identifizieren den harness nicht als die application, es sei denn, die application liefert explizit eine Produkt-attribution-Schicht.
- **pi-ai hat einen first-class-header-hook.** `@earendil-works/pi-ai`'s `StreamOptions.headers` merged caller-headern zuletzt über provider-defaults, sodass ein library-basierter adapter denselben wire contract erfüllen kann wie der handgeschriebene, ohne wrapping oder upstream-Arbeit. Die mock-server-Suites behaupten das Eintreffen auf dem wire für beide adapter.

## Entscheidung

Provider-neutrale app-Attribuierung ist an der LLM-adapter-Grenze verpflichtend und verwendet nur den Standard-`User-Agent`-header. Die Regel: Jeder produkt-LLM-adapter sendet eine statische, nicht-geheime application identity in jeder provider-HTTP-Anfrage, und jeder adapter hat Tests, die beweisen, dass `User-Agent` den wire erreicht (ein mock server, der empfangene headern behauptet; für einen library-basierten adapter, der header-hook der library, der dieselbe mock-server-Behauptung speist). Diese Regel governs app-Attribuierung, nicht provider-spezifische request identity: [die DeepSeek request-identity decision](../feature/2026-08-11-deepseek-request-user-id-header.de.md) besitzt ihre user- und session-headern separat.

OpenRouter app-Attribuierung wird bewusst nicht implementiert. `HTTP-Referer`, `X-OpenRouter-Title`, `X-Title` und `X-OpenRouter-Categories` sind OpenRouter-spezifische product-surface-headern, keine provider-neutrale model-request-Attribuierung. Sie können später von einem OpenRouter-adapter oder einem expliziten OpenRouter-mode vorgeschlagen werden, mit ihrer eigenen privacy/product decision, Tests und Doku. Bis dahin senden selbst Anfragen, die auf OpenRouter zeigen, nur die geteilte `User-Agent`-Attribuierung aus dieser decision.

Die provider-neutrale identity wird von `dsh-llm` (`packages/llm/llm/src/attribution.ts`) besessen, nicht von einzelnen adapters. `AppIdentity` enthält nur öffentliche Produkt-facts, die zum Aufbau von `User-Agent` benötigt werden, und die Standard-`APP_IDENTITY`-Werte:

- Produkt-token für `User-Agent`: `deepseek-harness` (Kontinuität mit dem pre-Agent Note wire-Wert und der repo/org-identity)
- version: aus dem manifest des besitzenden Pakets per `createRequire` gelesen, nie eine hand-kopierte Konstante
- app URL: `https://github.com/deepseek-ai/deepseek-harness` — der repository-Home

Der Default ist verpflichtend und nicht leer. White-label-Deployment übergeben ihre eigene `AppIdentity` an `attributionHeaders(identity)` — der override-hook ist der Funktionsparameter, ohne deployment-config-Pipeline, bis ein consumer sie benötigt — und Auslassung fällt auf den harness-Default zurück, statt die Attribuierung zu unterdrücken. Es gibt keine per-request-API für das model, den user prompt, die session id, das cwd, die user-E-Mail, den API-key-Owner oder die lokale Maschinen-identity, diese Felder zu beeinflussen.

Wire-Mapping (`attributionHeaders`; header-Namen in Code kleingeschrieben — HTTP-Feldnamen sind auf dem wire case-insensitive):

| Ziel | Mapping |
|---|---|
| Alle HTTP-basierten adapter | `User-Agent: {product}/{version} (+{url})` — der Klammer-`+url`-Kommentar bleibt innerhalb der konservativen product/comment-Syntax von RFC 9110. |
| Direkter DeepSeek-Endpunkt | `User-Agent` für app-Attribuierung; `x-deepseek-harness-user-id` und bedingtes `x-deepseek-harness-session-id` sind separate request identity unter der DeepSeek-spezifischen decision. Sende keine nur-OpenRouter-headern, es sei denn, DeepSeek dokumentiert einen äquivalenten contract. |
| OpenRouter-Endpunkte | Nur `User-Agent`. Diese decision schließt `HTTP-Referer`, `X-OpenRouter-Title`, `X-Title` und `X-OpenRouter-Categories` aus. |
| Zukünftige provider | Nur `User-Agent`, es sei denn, eine spätere provider-spezifische Agent Note akzeptiert zusätzliche headern. Wiederverwende `HTTP-Referer` nicht per Analogie. |

Endpunkt-Erkennung ist kein Teil dieser Agent Note, weil hier keine endpunkt-spezifische Mapping akzeptiert wird. Wenn OpenRouter-Unterstützung später landet, muss die Erkennung explizit sein: entweder ein dediziertes OpenRouter-provider-Paket oder eine explizite `provider: 'openrouter'` / `attributionTarget: 'openrouter'`-config, keine willkürlichen Pfadfragmente oder model-Namen.

## Verifikation

Die gelandete contract:

- `dsh-llm` dokumentiert den verpflichtenden `User-Agent`-attribution-contract für `LlmAdapter`-autoren (`LlmAdapter` JSDoc, package README und den adapter-contract-Abschnitt von `docs/subsystems/llm-streaming.md`).
- Ein geteilter helper (`attributionHeaders` / `userAgent`) konstruiert die app identity und den Standard-`User-Agent`-Wert aus package-Metadaten, sodass adapter keine version-Konstanten hand-kopieren.
- `dsh-llm-deepseek` sendet den geteilten `User-Agent` in jeder Anfrage, und seine mock-server-Suite behauptet den exakten Wert.
- `dsh-llm-pi-ai` sendet denselben `User-Agent` durch pi-ais `StreamOptions.headers`-hook, und seine mock-server-Suite behauptet den exakten Wert.
- Kein adapter sendet OpenRouter-spezifische attribution-headern (`HTTP-Referer`, `X-OpenRouter-Title`, `X-Title`, `X-OpenRouter-Categories`) als Teil dieser decision.
- Kein app-attribution-Feld trägt secrets, lokale Pfade, session ids, prompt-Text, model-Output, user-E-Mail oder pro-user-stabile Identifikatoren.
- Die adapter-READMEs benennen die `User-Agent`-attribution-policy und vermeiden ausdrücklich, OpenRouter app-Attribuierung als implementiertes Verhalten zu dokumentieren.

## In Betracht gezogene Alternativen

- **OpenRouter app-Attribuierung jetzt.** Für diese decision abgelehnt. `HTTP-Referer` plus `X-OpenRouter-Title` zu senden, würde OpenRouter-Rankings erfüllen, aber diese headern sind ein provider-spezifisches Produkt-feature, nicht die provider-neutrale model-request-Attribuierung, die diese decision standardisiert. Sie zu unterstützen, sollte später eine explizite OpenRouter-adapter/mode decision sein, nicht in dem ersten geteilten attribution-helper versteckt.
- **OpenRouter-headern überall.** Abgelehnt. Es würde einen custom-OpenRouter-contract als universellen Standard behandeln und Felder mit irreführender Semantik an provider senden, die sie nicht verlangt haben. Es riskiert auch, `HTTP-Referer` als generisches app-URL-Feld zu verwenden, obwohl Standard-HTTP bereits `User-Agent` für Produkt-identity und `Referer` für ein anderes Browsing-Kontext-Konzept hat.
- **Nur provider account/project identity.** Abgelehnt. Organization/project-headern, API keys, Cloud-Accounts und Billing-projects identifizieren, wer zahlt oder die Anfrage besitzt, nicht welche application Traffic sendet. Sie exponieren auch keinen öffentlichen app-Titel/Kategorie und helfen Gateways wie OpenRouter nicht, app-Rankings aufzubauen.
- **Endbenutzer-`user`/`metadata`-Felder.** Für diese Agent Note abgelehnt. Diese sind wertvoll für Missbrauchsaufsicht und Kundensupport, beschreiben aber den Menschen oder Tenant hinter einer Anfrage. App-Attribuierung muss statische Produkt-identity sein und sicher in jeder Anfrage zu senden sein.
- **Nur config-opt-in-Attribuierung.** Abgelehnt. Eine default-off-Einstellung ist genau das, wie adapter weiter driftet. Die policy ist verpflichtende Default-Attribuierung mit übersteuerbaren öffentlichen Werten, keine optionale Attribuierung.
- **SDK-benanntes token (`deepseek-harness-sdk`).** Für das `User-Agent`-token in Betracht gezogen, weil der unterstützte runtime client stack den SDK-Namen verwendet. `deepseek-harness` gewann, weil es das DeepSeek Harness Produkt benennt, mit der org/repo-identity und dem package scope übereinstimmt und die wire-Attribuierung stabil hält, ohne das vollständige Produkt ein SDK zu nennen.

## Konsequenzen

- **Provider sehen, dass Traffic aus dem harness kommt.** Das ist der Punkt, aber es bedeutet, dass Deployment, die zuvor in generischen SDK-Traffic untergingen, identifizierbar werden. Milderung: nur statische öffentliche Produktdaten senden und forks/white-label-Deployment ihre eigene `AppIdentity` übergeben lassen.
- **Header-Unterstützung unterscheidet sich je nach client-library.** Der handgeschriebene adapter setzt headern direkt; der pi-ai-basierte adapter hängt davon ab, dass pi-ai `StreamOptions.headers` weiterhin ehrt (zuletzt über provider-defaults gemerged). Die wire-Level-mock-server-Tests sind die Wache: Wenn ein pi-ai-Upgrade aufhört, den header zu liefern, wird die suite rot. Das ist nützlicher Druck auf die Abstraktion: ein provider-adapter, der keine verpflichtenden headern setzen kann, kann den harness-LLM-contract nicht vollständig implementieren.
- **OpenRouter-Rankings profitieren noch nicht.** `User-Agent` ist die korrekte Baseline für provider-neutrale HTTP-identity, aber er wird keine OpenRouter-app-Seiten oder Rankings erstellen, weil OpenRouter `HTTP-Referer` für dieses Produkt-feature verlangt. Das ist absichtliche: Öffentliche app-marketplace-Teilnahme ist eine separate Produkt-decision, keine Voraussetzung für verpflichtende request-Attribuierung.
