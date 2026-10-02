---
description: "Signierter GitHub-Webhook-Adapter für Deployments, die authentifizierte JSON-Events in die Webhook-Runtime routen."
kind: "package-reference"
---

# @deepseek-ai/dsh-webhook-github

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-webhook-github` registriert eine exakte HTTP-Route auf dem injizierten `ctx.webServer`. Er begrenzt und verifiziert GitHubs rohen JSON-Body, projiziert eine providerneutrale Zustellung, ruft `ctx.webhookRuntime.dispatch()` und antwortet mit `202`, ohne auf Rules oder Sessions zu warten. Einsetzen, wenn ein Deployment authentifizierten GitHub-Ingress für die generische Webhook-Runtime braucht.

## Inhaltsverzeichnis

- [Konfiguration](#configuration)
- [HTTP-Contract](#http-contract)
- [Composition mit dediziertem Listener](#dedicated-listener-composition)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="configuration"></a>
## Konfiguration

| Key | Bedeutung |
|---|---|
| `source` | Nicht-leere Adapter-Instanz, die an Rules weitergetragen wird, etwa `primary-github`. |
| `path` | Exakter, nicht-root Pfadname ohne Trailing Slash, Query oder Fragment. |
| `secretEnv` | Credential-Referenz, die das GitHub-Webhook-Secret enthält. |
| `maxBodyBytes` | Positive Safe-Integer-Obergrenze für den unveränderten Request-Body. |

Alle Felder sind erforderlich. Die Secret-Referenz wird für jeden Request aufgelöst, sodass eine Rotation mit der nächsten Zustellung greift, ohne das Plugin neu zu laden.

<a id="http-contract"></a>
## HTTP-Contract

Nur `POST application/json` wird akzeptiert. Der Adapter liest einen begrenzten UTF-8-Body, verlangt `X-Hub-Signature-256`, `X-GitHub-Delivery` und `X-GitHub-Event`, löst das Secret auf, verifiziert HMAC vor dem JSON-Parsing und verlangt ein Top-Level-Objekt in lossless JSON. Er loggt niemals Secret, Signatur oder Payload.

| Status | Bedeutung |
|---|---|
| `202` | Verifiziertes JSON wurde im Speicher dispatched. |
| `400` | Erforderlicher Header, UTF-8, JSON oder Top-Level-Objekt war ungültig. |
| `401` | Signatur war ungültig. |
| `405` | Methode war nicht `POST`. |
| `413` | Deklarierter oder gestreamter Body überschritt `maxBodyBytes`. |
| `415` | Media Type war nicht `application/json`. |
| `503` | Credential oder Webhook-Runtime war nicht verfügbar. |

`202` sagt nicht aus, dass eine Rule matchte oder dass eine Session erstellt wurde. GitHub-event-spezifische Feldvalidierung gehört jeder Rule; der Adapter garantiert nur authentifiziertes generisches JSON.

<a id="dedicated-listener-composition"></a>
## Composition mit dediziertem Listener

Das normale Web-Profil besitzt `ctx.webServer` bereits. Ein weiteres `dsh-host-webserver` und diesen Adapter innerhalb einer Gruppe mounten, die nur `webServer` isoliert; der Adapter erbt weiterhin Credentials und `webhookRuntime`. Die [GitHub-Review-Anleitung](../../../docs/user/guide/github-review.de.md) verwendet `127.0.0.1:3081/github` hinter einem TLS-Reverse-Proxy, während die UI auf Port 3080 bleibt.

<a id="model-experience"></a>
## Model Experience

Indirekt, über `dsh-webhook`: Dieser Adapter trägt weder Prompt noch Tool Schema bei; eine matchende Rule besitzt den Session-Request und den modellsichtbaren Text.

#### KV-Cache-Effekt

Unabhängig. Authentifizierung und HTTP-Dispatch berühren keinen Model-Request; jedes neue Session-Prefix gehört der konsumierenden Rule und der Runtime.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Kein TLS** — der injizierte Development-WebServer ist normalerweise loopback-only hinter einem TLS-Reverse-Proxy oder Tunnel.
- **Nur generische Payload-Validierung** — Rules besitzen die Validierung der GitHub-Event-Felder, die sie konsumieren.
- **Keine Provider-Bestätigung für Downstream-Arbeit** — `202` geht beliebigen Rule-Calls und Session-Erstellung voraus.
- **Kein Form-Encoding** — GitHub muss `application/json` senden; `application/x-www-form-urlencoded` wird abgelehnt.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Authentifizierung und Input-Validierung geschehen an der exakten HTTP-Operation; dsh-host-webserver besitzt die Route/Disposer-Symmetrie.
