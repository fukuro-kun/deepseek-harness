---
description: "Laufzeitübergreifende UUID-Erzeugung für Maintainer, die secure-context-only `crypto.randomUUID`-Aufrufe ersetzen."
kind: "package-library"
---

# dsh-util-crypto
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Abhängigkeitsfreie, browserfähige UUID- und Byte-Encoding-Helfer. Die UUID-Erzeugung nutzt `crypto.getRandomValues`, das eine Zufallsprimitiv, das jeder ausgelieferte Kontext bereitstellt. `crypto.randomUUID` ist eine Secure-Context-Web-API: eine Seite oder ein worker, die über plain HTTP auf einer LAN-Adresse ausgeliefert wird (das Browser-Preview-Deployment), hat diese Methode nicht — Code, der dort laufen muss, kann sie also nicht aufrufen. Die repoweite `no-restricted-properties`-lint-Regel verweist `crypto.randomUUID`-Aufrufer hierher; reiner Node-Code, der `randomUUID` aus `node:crypto` importiert, bleibt wie er ist.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [API](#api)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Es ist eine **Bibliothek, kein Service und kein Plugin**: kein `ctx`, registriert nichts, hält keinen Zustand.

-----

<a id="api"></a>
## API

```ts
import { bytesToBase64, randomUUID, type Uuid } from '@deepseek-ai/dsh-util-crypto'
```

| Export | Rolle |
|---|---|
| `bytesToBase64(data)` | Kanonisches base64 für ein Byte-Array, in begrenzten Chunks kodiert. |
| `randomUUID()` | Zufälliger RFC-9562-v4-UUID-String, erzeugt aus `crypto.getRandomValues`. Drop-in für `crypto.randomUUID()`. |
| `Uuid` | Der fünfgruppige UUID-String-Typ, passend zur deklarierten Rückgabeform von `crypto.randomUUID`. |

<a id="model-experience"></a>
## Model Experience

Indirekt, über Consumer, die damit Request-, Session- und Attachment-Identifikatoren erzeugen, von denen keiner als semantischer Inhalt in Prompts gelangt.

#### KV-Cache-Auswirkung

Keine direkte Invalidierung; identifikator-erzeugende Consumer besitzen etwaige Request-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Nur v4** — keine anderen UUID-Versionen, Namensräume oder Parsing; Consumer mit größerem Bedarf sollten eine echte UUID-Abhängigkeit nehmen.
- **Eindeutigkeit ist probabilistisch** — 122 Zufallsbits, dieselbe Garantie wie `crypto.randomUUID`; hier geschieht keine Kollisionserkennung.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Laufzeitinvariante:** Es wird kein Begleiter veröffentlicht. Dieses reine Utility besitzt keinen Event-Strom und keine veränderlichen Laufzeitdaten; seine Wertalgebra wird durch Unit-Tests abgesichert.
