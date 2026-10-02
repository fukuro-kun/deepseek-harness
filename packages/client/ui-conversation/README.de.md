---
description: "Zielneutrale Conversation-Assembly und Browser-Shell: Event- und View-Registries, Session-weise bindings, Eingabezustand, slots und temporäre Composer-Übernahmen."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-conversation

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`ui-conversation` besitzt die zielneutrale Conversation-Assembly und die geteilte Browser-Shell. Es konsumiert `SessionEventLikeEntry`-Feeds des Session Controllers, stellt React-freie Registries und Session-weise bindings über `ctx.uiConversation` bereit und trägt die Standard-props `useConversation`, `useInput` und `inputActions` über `ctx.uiSession` bei. Es besitzt außerdem den Session-weisen dauerhaften Bild-URL-Cache: `ctx.uiConversation.imageUrl(sessionId, attachment)` löst pro attachment eine session-autorisierte Browser-URL auf und widerruft sie mit dem Session-binding, sodass jedes Conversation-Ziel denselben `session.attachment`-Lesevorgang teilt. Konkrete Ziele wie Chat sind eigene Pakete, die ihre eigenen Definitions, Snapshot-Builder, Views und Renderer registrieren.

## Inhaltsverzeichnis

- [Conversation-Assembly](#conversation-assembly)
- [Shell und Standard-props](#shell-and-standard-props)
- [Temporäre Composer-Einträge](#temporary-composer-entries)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="conversation-assembly"></a>
## Conversation-Assembly

`UiConversation.events` ist die einzige Registry für Event-Definitions, und `UiConversation.views` ist die einzige Registry für Ziel-Snapshot-Builder. Beide Registries lehnen doppelte Schlüssel ab, bewahren die Registrierungsreihenfolge, liefern idempotente disposers und bauen bestehende bindings neu, wenn sich ihr Beitragsbestand ändert. `UiConversation.binding(bindingOrSessionId)` liefert ein identitätsstabiles Conversation-binding für das aktuelle Session-Controller-binding. Es öffnet keine weitere Eventquelle.

Der adapter reicht jeden `SessionEventLikeEntry` direkt an den Assembler weiter. Sein äußerer `type` unterscheidet dauerhafte Events von Client-only-transienten Events, während sein inneres `event` stets `type`, `seq`, `time` und `data` offenlegt; Definitions erhalten dieses innere `SessionEventLike`. Ersetzungsfenster dürfen beide Eintragsvarianten enthalten, während historische prepends dauerhafte Einträge tragen und live-appends beide tragen dürfen. Jede Definition nutzt dieselben `match`- und `update`-Methoden für beide Eventformen, während `start` nur ein dauerhaftes Event erhält und der Assembler einen transienten Start ablehnt. Definitions, die keine Assistant-Deltas konsumieren, liefern `null` für `assistant/live-chunk`. Ersetzungsfenster und Revisionslücken bauen aus dem vollständigen geladenen Fenster neu auf; zusammenhängende append-, prepend- und Assistant-Settlement-Revisionen nutzen inkrementelle Assembly. Settlement entfernt nur die transienten Treffer des benannten Versuchs, wendet seinen optionalen dauerhaften Eintrag an und replayed die betroffenen Contexts und Abhängigen, ohne unverwandte Zielknoten zu ersetzen. Der Assembler besitzt Context-Matching, Turn/Step-Positionen, Zielknoten-Materialisierung, Zielaktivität und stabile Zielquellen. `ConversationSnapshot` enthält nur zielneutrale Views und active-target-Fakten; der Session-Lifecycle-Zustand bleibt in `SessionSnapshot`.

Ein Ziel wird aktiv, wenn die Shell-Auswahl es auflöst oder wenn seine Quelle einen ersten Subscriber erhält. Der Assembler ersetzt dieses Ziel einmal aus den aktuellen Contexts und hält es für spätere inkrementelle Flushes aktiv; das Erstellen einer Quelle aktiviert sie nicht, und das Deabonnieren deaktiviert sie nicht.

Zielpakete mergen ihre Snapshot- und Location-Datenmaps per Deklaration und registrieren sich dann mit `ctx.uiConversation.events.register(...)` und `ctx.uiConversation.views.register(...)`. Ein Ziel liest seine Session-eigene Quelle mit `ctx.uiConversation.binding(binding).target(targetId)`. Registrierungen sind Cordis effects, und ihre zurückgegebenen disposers entfernen den Beitrag aus derselben Registry. Die geteilte Request-Inspektion bedient jedes Ziel: `ctx.uiConversation.inspectSystemPrompt(previous, event)` interpretiert Systemnachrichten und positionelle Ersetzungen als unveränderlichen geladenen Oberflächenzustand. Es wählt den letzten nichtleeren überlebenden Systemknoten in Oberflächenreihenfolge, behält für verkettete Rewrites nur überlebende Ersetzungspositionen und hält den Prompt nach einem unindizierten älteren Endpunkt zurück, bis das prepend-Replay seine Ordnung liefert. Zieleigene Definitions bewahren historische Karten unabhängig auf. `ctx.uiConversation.inspectRequestPrompt(previous, header, system)` klassifiziert Request-Änderungen gegen jenen effektiven Prompt; gewöhnliche Nachrichten und Stream-Chunks erfordern keine Systemzustandsarbeit.

<a id="shell-and-standard-props"></a>
## Shell und Standard-props

Die Workspace-Auswahl nutzt `uiWorkspace.openWorkspace`, um das Ziel vorzubereiten und die Navigation zu committen. Entwurfstext und attachments wandern nur in dessen synchronem Vorbereitungs-Callback, solange jener Request aktuell ist; spätere Navigation oder Eigentümer-Entsorgung lässt den ursprünglichen Entwurf intakt.

Das Paket belegt den root-gescope-ten `main`-Schlüssel `conversation`, dessen wrapper die optional-Session-`main.conversation`-Shell deklariert. Es registriert strikte Session-Header-/Body-Einträge, die View-Liste, Composer-Chain und -Bar, Eingaberegionen, Hero-Regionen, Queue-Dock, Entwurfspersistenz und Phasenberechnung. `ctx.uiSession.provide()` materialisiert die Conversation- und Eingabequellen aus demselben Session-binding und liefert `inputActions` als stabiles Standard-prop.

Die View-Auswahl ist deterministisch: eine registrierte persistierte Auswahl gewinnt, sonst gewinnt das registrierte `chat`, sonst rendert keine View. Es wählt niemals die erste registrierte View. Die Shell-Phase kombiniert den Session-Lifecycle mit der Active-Target-Menge; die Shell liest keinen zielspezifischen Snapshot.

Die Shell liest die persistierte View-Präferenz vor dem Rendern, wenn eine Session erstmals bindet oder eine gecachte Session aktuell wird, aktiviert die registrierte bevorzugte View oder den Chat-Fallback und aktiviert spätere Tab- oder Fokus-Auswahlen, bevor sie diese in den Store committet. Eine leere Session lässt den `conversation.view`-slot weiterhin aus; kein unausgewähltes Ziel wird aktiviert.

Der residente Composer überlebt Übergänge zwischen keiner Session und Session. Whitespace blendet seinen Platzhalter aus; ein reiner Whitespace-Entwurf ohne attachments kann nicht gesendet werden. Der Zustand ohne Session hält dieselbe Composer-Oberfläche gemountet, aber inert, während der Workspace-Picker eine leere Session verbindet. Die Oberfläche ist ein Shell-eigener Lexical-Editor: Referenz-Chips sind atomare Decorator-Knoten, die die Serialisierungsidentität des Eigentümers tragen (die Übermittlung expandiert sie über den Owner-Codec), beanspruchte Slash-Befehle bleiben gestylter führender Text, Ordner-Textreferenzen tragen die Ordner-Glyphe als Icon-Präfix, und die Clipboard-Projektion des Entwurfs wird in den Session-weisen Conversation-Store gespiegelt. Queue-Operationen adressieren exakte Queue-Vorkommen über den gescope-ten `ctx.conversation`-Service; Queue-Vorschauen rendern gesendeten Text über die geteilte Inline-Referenzprojektion aus `ui-primitives` (wire-Session-Formen falten auf ihr Label) und zeigen lokale oder dauerhafte Bilder und Dateien in ursprünglicher attachment-Reihenfolge. Bilder nutzen Thumbnails; Dateien nutzen kompakte Name-und-Größe-Karten. Eine Bearbeitung legt den wörtlich gesendeten Text offen, und dauerhafte Thumbnails lösen über den Session-Bild-URL-Cache auf. Das Busy-Enter-Verhalten liegt im Host-gestützten `ui-conversation`-Settings-Namensraum.

Standard-Sendevorgänge committen optimistisch: Enter leert Entwurf, Vorkommenstabelle und Undo-Historie in derselben Transaktion, hält den Composer in `plain` und führt den Send als losgelösten Versuch aus, sodass Tippen und weitere Sends während des Flugs weiterlaufen. `sendSession` registriert vor dem Serialisieren ein Session-Übermittlungsecho (`session.beginSubmission`) mit dem Zustellmodus und bewahrt die gewählte Bild- und Dateireihenfolge in `pendingSubmissions`; die Session leitet die Platzierung aus jenem Modus und ihrem aktuellen Laufzustand ab, sodass Idle-Sends ins transcript gehen, Busy-Queue-Sends ins QueueDock und Busy-Steer-Sends auf die Pending-Steering-Fläche. Anschließend weicht es einen Frame, kodiert Bilder über den nativen `FileReader`-Data-URL-Pfad des Browsers und zitiert bereitgestellte Dateibelege. Befehlsübermittlungen nutzen dieselben Belege für generische Dateien, sodass das Senden von `/goal` oder `/plan` diese Browser-Dateien nie erneut liest. Der Prompt verwendet die Übermittlungs-`requestId` wieder; Queue- und Historien-Beobachtung über jene `rpcId` pensioniert das Echo einmal. Nebenläufige Fehler werden in Übermittlungsreihenfolge gemeinsam wiederhergestellt, bis der Benutzer den wiederhergestellten Inhalt bearbeitet; Befehlsübermittlungen behalten die eingefrorene `submitting`-Phase. Losgelöste Versuche behalten ihre attachment ids durch Aufnahme und Session-Scope-Entsorgung. Eine beobachtete Pensionierung legt jede Bildvorschau sofort über den dauerhaften Cache offen, ersetzt sie nach dem Abruf des aufgenommenen attachment durch die kanonische URL, widerruft jede URL nach Ende ihrer Nutzung und gibt Dateikarten frei. Ausgewählte generische Dateien treten in eine FIFO-Hintergrund-Upload-Queue; `maxConcurrentFileUploads` standardmäßig zwei aktive Worker-Transports, der Conversation-Service behält wartende und aktive Operationen plus Byte-Fortschritt über Session-Navigation hinweg, und das Entfernen eines Entwurfs überspringt seinen wartenden Transfer oder bricht seinen aktiven Transport ab. Fortsetzbare subagents deaktivieren die attachment-Aufnahme und überspringen lokale Echos, weil ihr Transport die Browser-Request-id nicht bewahrt.

Echoes wartender Übermittlungen zeigen „Sending…" neben deaktivierten Edit-, Remove- und Steer-Schaltflächen; ein eingeklapptes Dock behält den Sendestatus in seinem Header. Eine passende Host-Queue-Zeile ersetzt das Echo und aktiviert jede Aktion gemäß ihren normalen Textinhalt- und Laufzustandsanforderungen. Die Prompt-Bestätigung allein aktiviert keine Queue-Aktionen. Eine fehlgeschlagene Übermittlung entfernt ihr Echo und zeigt einen Fehler an; der Composer stellt den fehlgeschlagenen Entwurf wieder her, wenn er leer ist oder noch die vorherige automatische Wiederherstellung enthält, und bewahrt nachträglich getippten Text.

Deaktivierte Send- und Stop-Schaltflächen unterdrücken ihre Tooltips, einschließlich einer Stop-Schaltfläche, die zu einer deaktivierten Send-Schaltfläche wird, wenn der Turn endet. Während ein normaler Composer läuft, bleibt seine primäre Zeigeraktion Stop, wenn der Entwurf leer ist oder keine Eingabe verfügbar ist. Einreichbarer Text oder attachments schalten denselben Sitz auf Send um; Leeren oder erfolgreiches Übermitteln des Entwurfs stellt Stop wieder her. Die Busy-Enter-Einstellung wählt die Queue- oder Steer-Zustellung für gewöhnliche Sessions und fortsetzbare Kinder, und die laufende Send-Schaltfläche liefert über denselben Modus, zu dem plain Enter auflöst; solange sie über einem einfachen Nachrichtenentwurf aktiviert ist (kein Upload ausstehend), benennt ihr Label jenen Modus (Queue-Nachricht oder Steer-Nachricht), sodass die Einstellung Enter und Schaltfläche gemeinsam regiert, während Cmd/Ctrl+Enter weiterhin den anderen Modus nutzt, und Idle-Sessions, leere Entwürfe und `/`-Befehlszeilen behalten das einfache Send-Label ([Entscheidung](../../../.agents/notes/implemented/bug-fix/2026-09-04-busy-send-button-follows-enter-setting.de.md)). Ihre QueueDock-Zeilen teilen Edit, Remove und Steer, und ein leerer Entwurf teilt das steer-all-Tastenkürzel. One-Shot-Kinder bleiben schreibgeschützt. Plan-Modus und aktive Ziele ändern die attachment-Aufnahme nicht. Fortsetzbare Kinder behalten getrennte Send- und Stop-Aktionen, bieten aber keine Büroklammer-, Einfüge- oder Drop-Aufnahme; ist ihr Elternteil offline, sperren Send und die Composer-Gesten, während QueueDock-Kontrollen für die live inbox verfügbar bleiben ([Entscheidungen](../../../.agents/notes/archived/bug-fix/2026-08-20-running-draft-primary-send.md), [inbox-Kontrollen](../../../.agents/notes/implemented/feature/2026-08-27-continuable-subagent-human-inbox-control.de.md)).

<a id="temporary-composer-entries"></a>
## Temporäre Composer-Einträge

`conversation.composer` ist eine generische chain. Ihre vollständige owner currency ist:

```ts type-equiv
/** Owner values used to elect a composer takeover. */
interface ComposerChainProps {
  /** Current Session identity used by temporary business-owned entries. */
  sessionId: SessionId | undefined
  /** Current Session lifecycle state, absent without a selected Session. */
  session: SessionSnapshot | undefined
  /** Effective business-owned interaction awaiting the user in this Session. */
  pendingInteraction: SessionPendingInteraction | undefined
}
```

Ein Geschäftspaket darf einen Eintrag nur installieren, solange ein Remote-waterfall-Request aussteht:

```tsx
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChainSelect, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

interface Request {
  readonly sessionId: SessionId
}

type RequestComposerProps =
  PropsRuntime<'conversation.composer'> & { matched: Request }

const select: ChainSelect<ComposerChainProps, Request> = owner =>
  owner.sessionId === request.sessionId ? request : null

const dispose = ctx.slots.register(
  { name: 'conversation.composer', select },
  RequestComposer,
)

try {
  return await request.result
} finally {
  dispose()
}
```

Der Selektor muss eine reine Funktion der owner currency sein. Sein nicht-null-Rückgabewert wird der Komponente als `matched` geliefert; `PropsRuntime<'conversation.composer'>` liefert die Standard-Session- und globalen props. Die chain-Reihenfolge bleibt aufsteigende `priority`, dann Registrierungsreihenfolge, und der erste nicht-null-Selektor gewinnt. Die Shell hält den Standard-Composer unter einer Übernahme gemountet. Request-Zustand, Listener, Response-Encoding und alle request-spezifischen Kind-slots gehören dem Geschäftspaket; sie werden weder von `SessionSnapshot` getragen noch von diesem Core-Paket deklariert.

<a id="model-experience"></a>
## Model Experience

Keine, da dieses Paket Browser-Zustand rendert und benutzerfreigegebene Eingaben über Session-Controller-APIs sendet, ohne Modell-Requests zu konstruieren.

#### KV-Cache-Auswirkung

Keine; Conversation-Assembly und Browser-Eingabezustand verändern das providerseitige Prompt-Caching nicht.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Nur registrierte Ziele können rendern** — die Shell hat bewusst kein implizites Fallback-Ziel jenseits der registrierten `chat`-Präferenz.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Laufzeitinvariante:** Es wird kein Begleiter veröffentlicht. Conversation-Definitions, Ziel-Builder und Views werden bereits von ihren besitzenden Registries und dem Slot-Ledger validiert.
