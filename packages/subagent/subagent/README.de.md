---
description: "Die Subagent-Delegations-Seam für Nutzer und Maintainer, die ein Provider-Backend auswählen, Delegations-Tools zusammenstellen oder Child-Agent-Läufe debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

Verwenden Sie `dsh-subagent`, um Arbeit an benannte Child-Agents zu delegieren, ihre Ergebnisse einzusammeln und unterstützte Child-Konversationen über Turns hinweg fortzusetzen. Eine Komposition kann In-Process-, ACP-, SDK-, Codex- oder Claude-Code-Children nebeneinander anbieten. Wählen Sie One-Shot-Children für ein einzelnes Ergebnis oder fortsetzbare Children für spätere Nachrichten und Unterbrechung. Sie können verfügbare Children, ihren Modus, ihre Aktivität und ihre Abstammung auch inspizieren, ohne sie zu laden oder fortzusetzen. Aktivieren Sie mindestens ein unterstütztes Child-Backend und ein Delegations-Tool.

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

Dieses Paket ist der Vertrag, den jedes Delegations-Setup teilt. Sie aktivieren es, indem Sie den Service zusammen mit einem oder mehreren Provider-Backends und dem modellseitigen Delegations-Tool mounten; danach kann ein Agent Arbeit delegieren, und der Service routet jeden Request zum benannten Provider.

### Delegation aktivieren

Mounten Sie den Service mit einem Provider und dem Delegations-Tool. Der Provider registriert sich unter dem von Ihnen konfigurierten Namen (das In-Process-Spawn-Backend ist standardmäßig `spawn`); die Tool-Zeile benennt diesen Provider, sodass das Modell ein statisches Tool sieht. Ein minimales One-Shot-Setup:

```yaml
- name: '@deepseek-ai/dsh-subagent'
- name: '@deepseek-ai/dsh-subagent-spawn-in-process'
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: subagent
```

Ein Agent, der das Tool aufruft, erhält die finale Antwort des Childs als Tool-Ergebnis. Den Service allein zu mounten ändert nichts: Es kann nichts delegiert werden, bis ein Provider und ein Tool komponiert sind.

### One-Shot- und fortsetzbare Children

One-Shot-Children laufen einmal und rechnen mit einem einzelnen Ergebnis ab, plus optionaler strukturierter Ausgabe und einer sicheren Diagnose bei Fehlschlag. Ein Start-Request kann Provider, Modell, Reasoning-Effort und Output-Token-Limit des Child-Agents über `agentOptions` überschreiben; jede angeforderte Option erfordert die passende Capability des Providers. Fortsetzbare Children behalten eine dauerhafte Session und akzeptieren spätere Nachrichten in Reihenfolge: Der Aufrufer erhält eine stabile Child-ID, sendet Adjacent-Agent-Nachrichten und kann den aktuellen Turn unterbrechen, ohne das Child zu zerstören. Die `backgroundMode`-Option der Tool-Zeile wählt die Form (standardmäßig `one-shot` oder `continuable` auf Providern, die es unterstützen).

### Nachrichten, Unterbrechen und Discovery

Jeder exakte live Agent kann `sendMessage()` mit einem direkten fortsetzbaren Child verwenden; ein residentes fortsetzbares Child kann es auch mit seinem direkten Parent verwenden. Ein arbeitendes Ziel empfängt die Agent-Nachricht über Steer an seinem nächsten Schritt; ein idle Ziel startet einen Turn, und nur ein direktes Child kann kalt fortgesetzt werden. Der Parent kann außerdem jederzeit einen laufenden Nachkommen unterbrechen oder seine Children auflisten. Ein Browser-Continuation-Prompt wählt unabhängig Queue oder Steer und kann Bildteile tragen: Der Host lässt jeden Bildstapel über den Attachment-Store zu und persistiert ihn, bevor die Child-Inbox die Nachricht akzeptiert, und verweigert die Zustellung, wenn das deklarierte Modell des Childs keine Bildeingabe akzeptiert. Discovery deckt beide Formen ab: Der Service listet direkte Children und den vollständigen Nachkommenbaum — Modus, Aktivität und Abstammung —, liest live Session-Zustand und optionale Persistenz, ohne ein Child zu laden.

### Fehlschlag und Recovery

Requests, die eine Capability benötigen, die dem gewählten Provider fehlt, schlagen beim Start laut fehl, statt still ignoriert zu werden. Ein fehlgeschlagener Child-Lauf gibt einen Stop-Grund zurück, und Provider-Backends fügen eine sichere Diagnose hinzu; ein abgebrochener Request rechnet als `aborted` ab. Children sind isoliert: Ein abgestürztes oder fehlverhaltendes Child kann die Session des Parents nicht korrumpieren.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie der Service gebaut ist und woher das beobachtbare Verhalten kommt; der vollständige Vertrag lebt in [Dieses Paket verwenden](#use-this-package).

### Design-Konzept

- **Ein Service, viele Provider.** Der Service ist eine Named-Provider-Registry; jedes Backend registriert sich unter einem eindeutigen Namen, und ein Request wählt einen namentlich aus.
- **Zwei Child-Formen.** One-Shot-Läufe übertragen Eigentümerschaft bei der Publikation; fortsetzbare Children behalten eine dauerhafte Session und höchstens eine prozess-lokale Activation.
- **Erfüllung ist Publikation.** Das `start()` eines Providers erfüllt erst, wenn ein echtes Child existiert, sodass der Aufrufer immer einen live Lauf besitzt oder nichts.
- **Vertrauenswürdige Same-Process-Werte.** Requests, Deskriptoren und Ergebnisse werden unveränderlich geborgt; Serialisierung und Feindlichkeits-Validierung gehören an Prozess- und Wire-Grenzen.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Service-Einstieg: Provider-Registry, Start- und Continuation-API, Lifecycle-Events |
| [`src/continuation.ts`](src/continuation.ts) | Fortsetzbare Orchestrierung: Identitätsreservierung, Provider-Vorbereitung, kalte Fortsetzung, Autorisierung, Routing |
| [`src/continuation-activation.ts`](src/continuation-activation.ts) | Prozess-lokaler Activation-Graph, Zulassung, Abrechnung und Child-first-Disposal |
| [`src/continuation-messages.ts`](src/continuation-messages.ts) | Adjacent-Agent-Nachrichten, Return-Guidance und Abrechnungs-Benachrichtigungen |
| [`src/internal.ts`](src/internal.ts) | Host-only-Queue- und -Steer-Adapter plus Standard-Adjacent-Agent-Messaging-Marker |
| [`src/inbox.ts`](src/inbox.ts) | Activation-lokale Queue- und Steer-Zulassung plus die synchrone Closing-Grenze |
| [`src/types.ts`](src/types.ts) | Öffentliche Request-, Ergebnis- und Provider-Verträge |
| [`src/descriptor.ts`](src/descriptor.ts) | Versioniertes `subagent/descriptor`-Session-Event-Vokabular |
| [`src/child-agent.ts`](src/child-agent.ts) | Child-Komposition, delegierte Policy, Tiefen-Helfer |
| [`src/list-children.ts`](src/list-children.ts) | Discovery über den live Session-Store und optionale Persistenz |
| [`src/control.ts`](src/control.ts) | Browser-Control-Assembly: Katalog-Aktivitäts-Sampling, Browser-Zonen-Validierung, Fehlercodes |
| [`src/control-types.ts`](src/control-types.ts) | Client-sichere Katalogzeile, Control-Requests, -Quittungen und -Fehler |

### One-Shot-Ablauf

Ein Request wird gegen die ausgewiesenen Capabilities des Providers validiert, ein dauerhafter Deskriptor wird gesnapshottet, und der Provider baut das Child. Beide In-Process-Provider werben `agentOptions` an: Die Child-Erstellung mergt angeforderte Felder über Provider, Modell und Reasoning-Effort im letzten geloggten Request des Parents, fällt vor dem ersten Request auf Erstellungsoptionen zurück und behält das konfigurierte Token-Limit. Ein Routen-Wechsel ohne explizites Effort löscht das geerbte routen-eigene Effort, sodass das gewählte Modell seinen Standard auflöst. DSH SDK wirbt ebenfalls für diese Capability und publiziert unveränderliche `agentRouteDefaults`, die seine Instanz-Provider-/Modell-Defaults vor dem Exact-Route-Preflight liefern; `start()` besitzt weiterhin direkte Aufrufer und das Output-Limit. ACP, Codex und Claude Code weisen Agent-Routen-Overrides zurück statt sie still zu ignorieren. Bei Erfolg wird der Lauf publiziert und Eigentümerschaft geht an den Aufrufer; bei Fehlschlag rollt der Provider jede unpublizierte Ressource zurück. Das Ergebnis trägt die finale Ausgabe des Childs, einen optionalen strukturierten Wert, einen Stop-Grund und eine optionale sichere Diagnose.

### Fortsetzbarer Ablauf

Der Manager reserviert eine Child-Identität, löst den dauerhaften Deskriptor auf, erstellt (oder setzt kalt fort) den Child-Agent, installiert ihn in einer Activation und übermittelt den Prompt. Modellgeschriebene Nachrichten überqueren eine Parent/Child-Kante durch festes Steer-Scheduling; Browser-Mensch-Prompts wählen Queue oder Best-Effort-Steer über einen internen Adapter, während andere Host-Protokolle Queue für eigenständige Turns behalten dürfen. Ein Session-Queue-Kommando lässt einen live subagent-eigenen Agent nur aus seinem eigenen fortsetzbaren Deskriptor zu. Abrechnung wartet, bis Agent-Aktivität endet, eine leere Inbox und keine besessenen Children, dann flusht sie finalen Session-Zustand mit offener Zulassung. Unter dem Child-Lock revalidiert der Manager die Wake-Generation, die Session-Sequenz, die Inbox und besessene Children; der synchrone Task-Eintrag von `Agent.runMaintenance()` claimt die Idle-Phase und schließt die private Subagent-Inbox im selben JavaScript-Turn vor dem Disposal des Handles. Eine fehlende Direct-Child-Activation wird aus der persistierten Session kalt fortgesetzt. Wenn eine residente Activation abrechnet, teilt der Manager es dem direkten Parent des Childs im eigenen Turn-Stream des Parents mit.

Erfolgreiche lokale Child-Erstellung hängt eine `subagent/catalog`-Tatsache an die Parent-Session. One-Shot-Erstellung zeichnet sie auf, nachdem der Provider zurückkehrt; fortsetzbare Erstellung zeichnet sie nach der initialen Inbox-Zulassung und vor der Rückgabe der Child-ID auf. Fehlschlag gibt das Child frei, ohne ein kompensierendes Katalog-Event zu publizieren. Ein One-Shot-Katalog-Append-Fehler behandelt die Ergebnis-Rejection des Laufs und bewahrt den Katalogfehler; Disposal-Fehler werden separat geloggt. Die `subagentCatalog`-Projektion schließt fork-geerbte Tatsachen aus und stellt eine Direct-Child-Liste über `projections.values.subagentCatalog` in Session-Beobachtungen und Client-Snapshots bereit. Ungültige eigene Katalog-Payloads, einschließlich nicht unterstützter Versionen, lassen die Projektions-Wiederherstellung fehlschlagen. Ihr unveränderlicher Speicher und ihre Checkpoint-Validierung verwenden [`dsh-chunked-list`](../../util/chunked-list/README.de.md). Ihre View bewahrt die Parent-Katalog-Event-Reihenfolge in O(D)-Zeit für D Tatsachen. Die [Parent-Katalog-Entscheidung](../../../.agents/notes/implemented/architecture/2026-09-01-parent-owned-subagent-catalog.de.md) trägt Reihenfolge, Persistenzkosten und Alternativen.

### Eigentümerschaft und Invarianten

- **Publikation ist die Grenze** — davor besitzt der Provider das Setup und muss bei Fehlschlag zurückrollen; danach besitzt der Aufrufer den Lauf und muss ihn disposen.
- **Registrierung ist effect-scoped** — das Entfernen eines Providers blockiert neue Starts, widerruft aber nie akzeptierte Läufe.
- **Agent-Nachrichten-Autorität ist exakte Adjazenz** — `sendMessage()` erfordert den exakten live Sender; jeder Sender darf ein direktes fortsetzbares Child adressieren, während nur ein Sender mit einer residenten fortsetzbaren Activation seinen direkten Parent adressieren darf.
- **Der Deskriptor ist nur Log** — ein Session-Event, das nicht in der Modell-Historie steht und über Compaction hinweg bewahrt wird; ein fortsetzbarer Deskriptor zeichnet den aufgelösten Child-Provider, das Modell und das Reasoning-Effort explizit für die kalte Fortsetzung auf.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen von der gemeinsamen Seam zu den Backends, den modellseitigen Tools und den Design-Entscheidungen.

- [Subagent-Subsystem](../../../docs/subsystems/subagent.de.md) — der Service-Vertrag, der Provider-Vertrag und die Semantik terminaler Ergebnisse.
- [Subagent-Capability-Seam](../../../.agents/notes/implemented/feature/2026-06-21-subagent-capability-seam.de.md) — der Design-Datensatz für die Delegations-Capability-Familie.
- [Fortsetzbare Subagents](../../../.agents/notes/implemented/feature/2026-07-28-continuable-subagent-conversations.de.md) — dauerhafte Children, die Folge-Turns akzeptieren.
- [In-Process-Spawn-Backend](../subagent-spawn-in-process/README.de.md) — der am einfachsten zu komponierende Provider.
- [Out-of-Process-ACP-Backend](../subagent-acp/README.de.md) — Children mit eigener Laufzeit über das Agent Client Protocol.
- [tool-subagent-control README](../tool-subagent-control/README.de.md) — die Oberfläche für Folge-Nachrichten, Unterbrechen und Auflisten.

-----

<a id="model-experience"></a>
## Model Experience

### Abrechnungs-Benachrichtigung

#### Was das Modell sieht

Eine User-Rollen-Parent-Nachricht, die mit dem Ergebnis eröffnet — `Background subagent <child-id> finished and will do no further work unless you send it more.`, oder die passende Zeile für ein Child, das gestoppt wurde, keinen Platz mehr hatte, ablehnte oder fehlschlug — gefolgt von `Its closing message:` und dem finalen Assistant-Inhalt des Childs, oder `It left no closing message.`, wenn es keinen produzierte. Diese runtime-eigene Benachrichtigung unterscheidet sich von modellgeschriebenen Parent/Child-Nachrichten, die `sendMessage()` und `AgentMessageSource` verwenden; Delegations-Schemas und Modell-Kontrollen gehören den Consumer-Paketen.

#### Token-Effekt

Eine Benachrichtigung pro abgerechneter Activation im Request des Parents, dimensioniert nach der finalen Nachricht des Childs. Ein Child, das seine eigene Nachricht sendet und dann abrechnet, kostet den Parent beides.

#### KV-Cache-Effekt

Nur anhängend im Parent: Die Benachrichtigung folgt seinem wiederverwendbaren Request-Präfix. Einen idle Parent zu erreichen startet einen unabhängigen Modell-Request; einen beschäftigten nicht.

### Child-Delegations-Scope-Erklärung

#### Was das Modell sieht

Jeder Laufzeitkontext-Snapshot eines In-Process-Childs trägt die untenstehende `subagent:delegation`-Erklärung, nach den Sätzen zu Sandbox-Policy und Approval-Policy.

##### Die Delegations-Scope-Erklärung

```markdown
You are a delegated subagent: your permission scope was fixed when you were started and cannot be widened from inside this session — operations that require approval are rejected automatically. When the job needs access beyond that scope, do not retry the denied operation; state the limitation in your reply so the delegating agent can handle it.
```

#### Token-Effekt

Eine feste Erklärung im Laufzeitkontext-Snapshot jedes Childs; keine in den Requests des Parents.

#### KV-Cache-Effekt

Präfix-stabil innerhalb eines Childs: Die Erklärung ändert sich während der Lebensdauer des Childs nie, sodass sie einmal in den ersten Laufzeitkontext-Snapshot geschrieben wird. Parent-seitig keine direkte Invalidierung; die benannten Tool-Consumer besitzen etwaige Request-Präfix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die Seam ungeeignet ist oder besondere betriebliche Sorgfalt erfordert. Sie sind aktuelle Paket-Einschränkungen, kein allgemeiner Delegations-Vergleich und kein Aufgabenstapel.

- **ACP-Children bleiben One-Shot und sind nicht trace-aufzählbar** — ein ACP-Lauf hat keine lokale Child-Session im Session-Korpus des Parents, und Remote-Provider benötigen einen Activation-Ownership-Vertrag, bevor sie fortsetzbare Children unterstützen können.
- **Nur adjazente Modell-Nachrichten** — `sendMessage()` erfordert einen exakten live Sender; jeder Sender darf ein direktes fortsetzbares Child adressieren, während nur ein Sender mit einer residenten fortsetzbaren Activation seinen direkten Parent adressieren darf. Browser-Prompts verwenden einen separaten menschlichen Queue-oder-Steer-Control-Pfad.
- **Ein direkter Parent muss für Child-zu-Parent-Zustellung live bleiben** — der Service hat keine dauerhafte Parent-Mailbox; ein fehlender Parent weist die Nachricht zurück, statt Arbeit anzunehmen, die er nicht aufwecken kann.
- **Wake-Lücke während der Cancellation-Konvergenz** — eine nach einem Interrupt-Signal akzeptierte, aber vor dem Idle-Werden des Treibers angenommene Folge-Nachricht bleibt eingereiht, bis ein weiterer weckender Send eintrifft.
- **Ausstehender injizierter Kontext hält eine Activation** — die Abrechnung behandelt konservativ jedes Inbox-Vorkommnis als unerledigt. Kontext, der geparkt wird, nachdem der Agent idle wurde, hält das Child und seine live Vorfahren resident, bis eine weckende Zustellung es claimt, eine Queue-Mutation es entfernt oder Manager-Teardown es verwirft.
- **Prozess-lokale Residenz** — die Activation-Inbox und der Ownership-Graph koordinieren keine zwei Harness-Prozesse; gleichzeitiger Zugriff auf einen Persistenz-Store benötigt eine dauerhafte Mailbox und ein prozessübergreifendes Lease-Protokoll.
- **Kein Replay akzeptierter, aber nicht geloggter Nachrichten** — ein Absturz kann einen akzeptierten Prompt verlieren, der nie das Session-Log des Childs erreichte; die verlorene Nachricht wird nicht automatisch replayed.
- **Keine dauerhafte Parent-Mailbox** — Child-zu-Parent-Nachrichten erfordern ein residentes fortsetzbares Child und einen live direkten Parent und bieten Annahme-Identität statt Exactly-once-Zustellung.
- **Lifecycle-Events sind nur beobachtend** — eine lauf-beeinflussende `subagent/end`-Continuation oder Entscheidungs-API wartet auf einen konkreten Consumer.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und unentschiedene Richtungen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten und Grenzen leben in den Abschnitten oben und im Paket-Code.

- **Prozessübergreifende Fortsetzung** — eine dauerhafte Mailbox und ein Lease-Protokoll würden zwei Harness-Prozesse einen Persistenz-Store teilen lassen.
- **Fortsetzbare ACP-Children** — erfordert die Persistierung der Remote-Session-ID und eine Per-Child-Continuation-Werbung.
- **Host-User-Zustellung** — ein zukünftiger Host-Adapter benötigt eine konkrete authentifizierte Interaktion, bevor die Seam eine User-Zustellungs-Capability erhält.

</details>
