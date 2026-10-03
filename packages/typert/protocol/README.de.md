---
description: "Das geteilte Typert-Remote-Protokoll: Decorators, Wire-Deskriptoren, Codecs und Provider-Verträge, die von Business-Paketen, generierten Artefakten, dem Host-Gateway und der Client-API genutzt werden."
kind: "package-library"
---

# @deepseek-ai/dsh-typert-protocol
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Mit `dsh-typert-protocol` können Business-Pakete Host-Methoden für Remote-Clients exponieren: Markiere eine Methode mit `@Remote` (oder `@RemoteScope` für Scoped-Receiver), binde den Service an einen Wire-Namespace und assoziiere Host-Objekte und Scoped-Contexts über die merge-extensible Protocol-Maps mit Wire-Identitäten. Generierte Artefakte, das Host-Gateway und die Client-API konsumieren dieselben Invocation-Deskriptoren, Codecs und Provider-Verträge, sodass ein Deklarationssatz über alle Faces synchron bleibt. Das Paket registriert keinen Cordis-Service und führt keine TypeScript-Analyse aus; es deklariert nur Typen und Decorator-Marker.

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

Dieses Paket ist für Maintainer von Business-Paketen und Assemblies, die Host-Capabilities für Remote-Clients exponieren. Es ist eine Deklarations-Library: Methoden markieren, Services binden und den Rest der generierten Pipeline und dem Gateway überlassen.

### Eine Host-Methode exponieren

Ein Business-Paket markiert eine öffentliche Instanzmethode mit `@Remote` (oder `@RemoteScope(key)`, wenn der Receiver aus einem Scoped-Context kommt), und der besitzende Service erweitert entweder `TypertRemoteService` oder deklariert eine `typertRemote`-Bindung über `bindTypertRemote()`:

```text
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

export class GoalService extends TypertRemoteService {
  @Remote
  async create(agentId: string, objective: string): Promise<GoalResult> {
    ...
  }
}
```

Die Generierung macht die Methode zu einem Wire-Endpoint unter dem Namespace des Services; Clients rufen sie als typisierte Methode über `ctx.remote` auf (siehe die [API-Gateway-Referenz](../../../docs/api-gateway.de.md)). Eine Methode entscheidet sich für kooperative Cancellation, indem sie `signal: AbortSignal` als letzten Parameter deklariert — das Signal wird injiziert, nie ein JSON-Parameter oder Lookup-Feld.

### Host-Objekte und Contexts mit Wire-Identitäten assoziieren

Komplexe Host-Objekte können den Wire nicht direkt überqueren. Ein Business-Paket deklariert die Assoziation über die merge-extensiblen `TypertLookupMap` und `TypertContextMap`. Ein Host-Context-Adapter besitzt die stabile Wire-Deklaration und löst Wire-Identitäten zu Live-Contexts auf. Ein Client-Context-Adapter mappt in beide Richtungen, weil Scoped-Calls von einem Client-Context ausgehen und weitergeleitete Host-Events dort ihre explizite Wire-Identität auflösen. Die Host-Komposition kann ihren synchronen oder asynchronen Resolver überschreiben. Ein Resolver, der aus Policy-Gründen ablehnt, wirft `RemoteError` mit seinem eigenen Code, der den Caller unverändert erreicht.

### Einen Remote-Fehler melden und lesen

Eine Klasse trägt jeden Remote-Fehler: `RemoteError`, mit einem stabilen `<domain>/<reason>`-Code und den für diesen Code typisierten Details. Dieses Paket deklariert die universellen Carrier-Codes (`gateway/bad-request`, `gateway/cancelled`, `gateway/internal`) und besitzt `RemoteErrorDetailsMap`, die merge-extensible Tabelle, die jedes andere Paket neben seinem eigenen werfenden Code erweitert:

```text
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'goal/not-found': { readonly goalId: string }
  }
}
throw new RemoteError('goal/not-found', `goal "${id}" does not exist`, { goalId: id })
```

Ein Owner wirft am Fehlerpunkt; kein Paket schreibt eine Fehlerklassen-Familie oder eine Exit-Mapping-Funktion. Ein Caller diskriminiert per `code` — niemals per `instanceof` —, und ein `code`-Branch narrowed `details` ohne Cast, weil `RemoteFailure` die code-diskriminierte Union von `RemoteError`-Instanzen ist. Infrastruktur, die einen über eine Modul- oder Realm-Kopie der Klasse getragenen Fehler erkennen muss, ruft `remoteErrorOf(value)` auf, das einen strukturellen Marker statt der Prototypenkette liest.

### Weitergeleitete Host-Events auf dem Client empfangen

Die Host-Assembly erweitert `TypertRemoteEventSelection` mit den Cordis-Events, die sie an Consumer weiterleitet, was die `ctx.remote.$on`-Key-Menge verengt. `TypertForwardableEvent` akzeptiert unscoped `void`-Notifications und scoped async Waterfalls, deren finaler `next()`-Callback den Ergebnistyp des Events zurückgibt. `TypertClientEventListener` leitet den Client-Listener aus demselben `Events`-Member ab und bewahrt dabei Signale, optionale und readonly Felder, Arrays, Callbacks und Ergebnistypen. `TypertClientRemote` exponiert nur `$mount()` und `$on()`; der Event-Transport bleibt privat beim Gateway.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie die Deklarationen compiler-unabhängig bleiben und wo jeder Vertrag erzwungen wird; das Programmiermodell ist in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designkonzept

Das Paket hält strikte Reflection im Compiler: Decorator-Initialisierer behalten minimale Marker in einem versionierten Deskriptor auf dem Service-Prototyp. Der Deskriptor nutzt einen stabilen String-Property-Namen, sodass eine andere installierte Kopie des Protokoll-Pakets dieselben Marker lesen kann. Vollständige Parameter-, Ergebnis-, Lookup- und Schema-Reflection ist Aufgabe der Typert-Build-Pipeline, geliefert über `InvocationDescriptor`.

### Remote-Marker

`@Remote` und `@RemoteScope` schedulen einen Initialisierer, der Methodenname, einen optionalen Export-Namen und den Invocation-Mode an den Prototyp-Deskriptor anhängt; `remoteMethods(service)` validiert seine Version und gibt einen losgelösten Snapshot in Deklarationsreihenfolge zurück, den der Source-Mode-Fallback des Gateways liest. Marker erfordern öffentliche, nicht-statische Instanzmethoden mit String-Namen, und konfligierende Marker auf einer Methode werden abgelehnt.

### Protocol-Maps und Deskriptoren

Die merge-extensiblen Protocol-Maps halten statische Assoziationen im Typsystem, während Runtime-Provider die Auflösung bei `ctx.typert` registrieren; die Map-Namen und -Formen liegen in [`src/types.ts`](src/types.ts). `InvocationDescriptor` ist die geteilte Runtime-Form, die von Registry, Gateway und Client-Remote konsumiert wird und direkte und Context-Receiver, JSON- und Lookup-Parameter, Scope-Projektionen, Cancellation und Ergebnis-Codecs abdeckt.

### Wire-Identity-Grammatik

Jedes Namespace-, Methoden-, Lookup- und Context-Segment muss `isTypertRemoteSegment()` erfüllen, damit generierte Namen den geteilten RPC-Carrier unverändert überqueren. Strikte Codecs tragen generierte Schemas; `src-json`-Codecs identifizieren den schwächeren Source-Launch-Pfad.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Decorators, Gateway-Bindungen, `remoteMethods`, Segment-Validierung |
| [`src/remote-error.ts`](src/remote-error.ts) | `RemoteError` und der strukturelle `remoteErrorOf`-Recognizer |
| [`src/types.ts`](src/types.ts) | Protocol-Maps, `RemoteErrorDetailsMap`, `RemoteResult`, `InvocationDescriptor`, Codecs, Provider-Verträge, Registry-Interfaces, `TypertClientRemote` |
| — | Es wird kein Runtime-Invarianten-Companion veröffentlicht; Decorators behalten private unveränderliche Deklarationen, und Bindungen sind eingefrorene Werte ohne unabhängigen Event-Stream zum Querprüfen. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht ausreicht; sie bewegen sich von den Deklarationen zur Runtime und zum Call-Pfad.

- [API-Gateway-Referenz](../../../docs/api-gateway.de.md) — wie die Deklarationen zu laufenden Host-zu-Client-Calls werden.
- [Typert-Subsystem-Referenz](../../../docs/subsystems/typert.de.md) — die wörtlichen öffentlichen Verträge aus Protocol- und Gateway-Typen.
- [Typert-Registry](../registry/README.de.md) — wo Deskriptoren und Provider zur Runtime gespeichert werden.
- [Typert-Generator](../generator/README.de.md) — was die consumer-seitigen Deklarationen und Deskriptoren generiert.
- [Remote-Call-Agent-Note](../../../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.de.md) — die Architektur- und Transport-Entscheidungen hinter Remote-Calls.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da compiler-unabhängige Remote-Protokoll-Deklarationen nichts Model-facing registrieren.

#### KV-Cache-Effekt

Kein direkter Effekt; die deklarierten Verträge erreichen einen Request nur, wenn eine Assembly sie in einen platziert.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was die Deklarationen repräsentieren können; es sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Decorator-Marker sind minimal** — Marker enthalten nur den Methodennamen und den direkten oder Context-Invocation-Mode; Parameter-, Ergebnis-, Lookup- und Schema-Reflection erfordern die Typert-Build-Pipeline.
- **Remote-Signaturen sind eingeschränkt** — Decorators akzeptieren nur öffentliche, nicht-statische Instanzmethoden mit String-Namen, und Source-Mode-Ausführung kann keine überladenen, destrukturierten, default- oder Rest-Parameter-Signaturen repräsentieren.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
