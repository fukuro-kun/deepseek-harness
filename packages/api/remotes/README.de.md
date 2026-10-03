---
description: "Application-Remote-Assembly: wählt typisierte Host-Fähigkeiten und weitergeleitete Events für Client-Consumer aus."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-remotes

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Zweiseitiges BFF für die von dieser Anwendung ausgewählten Host-Remote-Fähigkeiten. Der Host-Entry besitzt die Auswahl weitergeleiteter Events und registriert ihre Application-Event-Quelle beim API Gateway; der Client-Entry importiert die generierten `/remote`-Artefakte als Laufzeitwerte, mountet jeden Beitrag über `ctx.remote.$mount()` und re-exportiert deren Deklarations-Merges. Client-Geschäftspakete hängen von dieser Fassade ab, nicht von der Gateway-Implementierung oder einzelnen Remote-Runtime-Entries.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Weitergeleitete Host-Events](#forwarded-host-events)
- [Build-Grenze](#build-boundary)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Entwicklerhinweis](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

[`@deepseek-ai/dsh-api-session-controller`](../session-controller/README.de.md) besitzt die Agent- und Session-Identitätspolitik, einschließlich der Typert-Lookup-Resolver, die andere Namespaces verwenden. Dieses Paket wählt den generierten Session-Beitrag nur aus und mountet ihn; es dupliziert keine Aktivierungspolitik.

Die Client-Assembly mountet die Beiträge für Commands, Credentials, Settings, Goal, dynamisches Cordis, Datei- und Session-Referenzen, schreibgeschütztes Host-Plugin-Inventar, Message-Feedback, Session Controller und Workspace Controller. Die Cordis-Effect-Eigentümerschaft zieht jeden Beitrag zurück, wenn diese Assembly entlädt, während `@deepseek-ai/dsh-api-gateway/client` Deskriptor-Validierung, getrackte Namespace-Services, direkte und gescopte Methoden, Invocation, Streams und Cancellation besitzt. Der Client-Entry konsumiert das geteilte `TypertClientRemote`-Interface über Cordis und importiert das konkrete Gateway nicht. Er re-exportiert die Deklarations-Merges der Gateway-Client-Face rein typseitig, sodass ein Consumer, der das Vokabular weitergeleiteter Events über diese Fassade erreicht, keine Laufzeitkante zur Gateway-Implementierung gewinnt.

Diese Fassade ist außerdem die Eingangstür für das Wire-Typvokabular, das ein Client-Paket benennt. Sie re-exportiert — rein typseitig — das Remote-Fehlervokabular (`RemoteResult`, `RemoteFailure`, `RemoteErrorCode`, `RemoteErrorDetailsMap`), die Host-Fakten (`RemoteHostFacts`) und die client-sicheren Payload-Typen jeder ausgewählten Domäne, sodass ein Client-Feature-Paket einen einzigen Specifier importiert, statt in `dsh-typert-protocol`, das Gateway oder den Host-Entry eines Owners zu greifen. Zwei Paketarten umgehen diese Tür bewusst: die api-layer-Pakete, die diese Assembly selbst auswählt — ein Rückimport würde einen Dependency-Zyklus schließen — und deren Tests, die das Fehlervokabular direkt aus `dsh-typert-protocol` nehmen. Die Tests eines UI-Pakets nehmen dagegen den `RemoteError`-Konstruktor aus [`dsh-client-test-runtime`](../../test-support/client-runtime/README.de.md).

Dieses Paket besitzt weder physischen Transport noch Host-Service-Discovery. Es projiziert die Anwendungsauswahl in generierte Remote-Beiträge und eine unabhängige Host-Event-Quelle pro Client; das API Gateway besitzt Endpoints, Carrier, Cancellation und Reconnect. Seine Client-Face kann von der Web-UI oder einer künftigen TUI wiederverwendet werden, solange sie denselben React-freien `ctx.remote`-Vertrag bereitstellt.

-----

<a id="forwarded-host-events"></a>
## Weitergeleitete Host-Events

`src/remote-events.ts` hält `API_REMOTE_FORWARDED_EVENTS`, die Allowlist der Host-Cordis-Events, die diese Anwendung ohne Umbenennung weiterleitet — und damit die legale Schlüsselmenge von `ctx.remote.$on`; jeder Eintrag wählt zudem zwischen gewöhnlicher Emission und Agent-gescopter Waterfall-Zustellung. Das rein typseitige `src/types.ts` leitet daraus seine Auswahl-Face ab. Ein weiteres Event weiterzuleiten erfordert genau einen Eintrag in diesem Array: Typprojektion, Consumer-Schlüssel-Face und die Host-Weiterleitungsschleife leiten sich alle daraus ab.

Die Listener-Signatur wird hier nicht wiederholt. Die Cordis-`Events`-Deklaration jedes allowlisteten Events lebt im client-sicheren `./types`-Export seines Owner-Pakets, und beide Faces dieses Pakets ziehen diese Deklarationen herein. Die Host-Face assertet zusätzlich jeden Eintrag gegen `TypertForwardableEventEntry`: Ein `emit`-Eintrag muss ein deklariertes Einweg-Event sein, ein `waterfall`-Eintrag ein deklarierter Agent-gescopter Waterfall, dessen letzter Parameter sein `next()`-Callback mit gleichem Ergebnistyp ist.

Der Host-Entry registriert für jeden Client-Stream eine unabhängige Menge von Allowlist-Listenern samt Queue. Er weist Nicht-JSON-Argumente gewöhnlicher Events vor dem Einreihen ab. Bei einem Waterfall projiziert er nur die Agent-Identität der obersten Ebene und die JSON-Request-Felder; auch ein Client-Ergebnis muss verlustfreies JSON sein, während `next()` an den folgenden Host-Listener delegiert. Jeder gescopte Waterfall-Request muss seinen gerouteten Agent direkt als `request.agent` mitführen; der Host weist eine fehlende oder nicht passende Identität vor dem Weiterleiten ab. Die Quelle hängt alle Listener synchron an, bevor `ctx.typertGateway.registerRemoteEvents()` den internen logischen `$events`-Stream des Gateways freigibt, sodass ihr erstes `ready`-Item beweist, dass inkrementelle Zustellung aktiv ist, und das Host-Home für die Client-Pfadanzeige mitführt. Das Zurückziehen der Registrierung bricht aktive Streams ab.

<a id="build-boundary"></a>
## Build-Grenze

Die meisten Repository-Pakete gehören zu genau einer TypeScript-Face: Host-Pakete sind in der Wurzel-`tsconfig.host.json` registriert, Client-Pakete in der Wurzel-`tsconfig.client.json`. Dieses Paket spaltet sich, weil sein Host-Entry am Host-Typert-Graph teilnehmen muss, während `src/client/index.ts` erst kompilieren kann, wenn Host-tsdown die `/remote`-Deklarationen der Geschäftspakete generiert hat.

Die Wurzel-`tsconfig.json` dieses Pakets ist nur eine Solution, die `tsconfig.host.json` und `tsconfig.client.json` referenziert. Das Host-Aggregat und direkte Host-Consumer referenzieren erstere, das Client-Aggregat und direkte Client-Consumer letztere; die Paketwurzel-Solution darf in keinen Dependency-Graphen der Aggregate eintreten. Die beiden Projekte besitzen disjunkte Quelldateien und `.tsbuildinfo`-Dateien, teilen sich aber das Ausgabeverzeichnis `lib/types` — mit einer bewussten Ausnahme: `src/remote-events.ts` und `src/types.ts` stehen in den `files` BEIDER Faces, weil die Allowlist weitergeleiteter Events der einzige Kontrollpunkt darüber ist, was ein Consumer empfangen kann, und die Host-Weiterleitungsschleife wie die Client-`ctx.remote.$on`-Schlüssel-Face eine gemeinsame Deklaration lesen müssen statt zweier, die auseinanderdriften könnten.

Diese Ausnahme ist nicht nur ein `files`-Eintrag. Die Wurzel-`tsconfig.base.json` mappt `@deepseek-ai/dsh-api-remotes/types` auf `src/types.ts` — die Source-Ebene, wie jeder andere Workspace-Subpfad und anders als die generierten `/remote`-Artefakte, die keinen `paths`-Eintrag haben und über `exports` in die gebaute Ausgabe auflösen. Beide Faces nehmen daher dieselbe Allowlist und Typprojektion in ihre eigenen Programme auf und emittieren byte-identische `remote-events`- und `types`-Ausgaben nach `lib/types`; die `.tsbuildinfo`-Dateien bleiben unabhängig. Kein Gate erzwingt die Quelldatei-Disjunktheit der Faces — `scripts/project-reference-faces.ts` prüft nur, dass eine Referenz in ein gesplittetes Projekt die passende Face benennt —, deshalb hält dieser Absatz fest, warum die Doppellistung beabsichtigt ist.

Das paketlokale `clientBundle(..., { hostPhase: true })` lässt Host-tsdown den Host-Entry bündeln und das spätere Client-tsdown nur den Browser-Entry bündeln. Gewöhnliche Client-Plugins bleiben einzelne Client-Projekte und erzeugen während des Client-tsdown sowohl ihren Node-Loader-Entry als auch das Browser-Bundle; nur splitten, wenn die beiden Quellmengen unterschiedliche Compiler-Faces erfordern.

<a id="model-experience"></a>
## Model Experience

Keine, da dieses BFF Remote-Application-Methoden und weitergeleitete Events auswählt, aber nichts Modellseitiges registriert.

#### KV-Cache-Effekt

Kein direkter Effekt; gemountete Host-Fähigkeiten besitzen jedes modellsichtbare Verhalten, das sie auslösen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- Die Fähigkeitenmenge ist durch explizite Build-Time-Wertimporte festgelegt; der Client entdeckt die aktiven Services oder Remote-Definitionen des Hosts nicht zur Laufzeit.
- Zusätzliche Fähigkeiten erfordern einen expliziten `/remote`-Wertimport und ein Mount in dieser Assembly.
- Gewöhnliche weitergeleitete Events werden nicht nachgespielt; Zustand, der zuverlässige Wiederherstellung braucht, benötigt eine vom Owner bereitgestellte Query, einen Cursor oder eine Eröffnungs-Baseline.


<a id="dev-note"></a>
### Entwicklerhinweis

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Laufzeit-Invariante:** Es wird kein Companion veröffentlicht. Typert und die Agent-/Session-Registries besitzen die beobachteten Beziehungen.
