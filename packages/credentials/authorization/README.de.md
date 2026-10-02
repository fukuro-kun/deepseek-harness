---
description: "Die Authorization-Flow-Registry für Benutzer und Maintainer, die Credentials beschaffen, die die Konfiguration nicht liefern kann, weil deren Beschaffung eine Unterhaltung mit einem Menschen erfordert."
kind: "package-reference"
---

# @deepseek-ai/dsh-authorization

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-authorization` ermöglicht einer Konfigurations-UI oder einem anderen Aufrufer, Credentials über eine menschlich geführte Anmeldung, Code-Eingabe oder Frage zu beschaffen. Jeder Versuch sendet Notices und Prompts nur an die Oberfläche, die ihn gestartet hat. Er meldet `authorized` erst, nachdem das neue Credential gespeichert wurde; eine Ablehnung oder ein Widerruf meldet `cancelled`, während Fehlschläge Fehler bleiben. Wähle es für Credentials, die nicht über die Konfiguration bereitgestellt werden können. Es benötigt den Credential-Store und eine Integration, die die verfügbaren Authorization-Methoden definiert; das Paket selbst stellt keine Provider-spezifischen Methoden bereit.

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

Dieses Paket ist der Teil des Produkts, der Credentials beschafft, die ein Mensch herausgeben muss: Ein Plugin registriert den Flow, der weiß, wie es sein eigenes Credential bekommt, und jede Oberfläche kann einen Versuch starten und dem Menschen zeigen, was zu tun ist. Der übliche Weg ist explizit — registriere einen Flow für jedes Credential, das dein Plugin hält, und starte Versuche dann von der Oberfläche, die der Mensch gerade sieht.

### Wann es verwenden

Verwende es, wann immer ein Credential nur im Gespräch mit einem Menschen beschafft werden kann — eine OAuth-artige Anmeldung, ein Einmalcode, eine Kontoauswahl — und nicht in der Konfiguration gespeichert werden kann. Wenn ein Credential ein fester Schlüssel ist, den ein Deployment liefern kann, speichere es stattdessen über den Credential-Seam. Eine headless- oder ACP-Komposition kann dieses Paket sicher mounten: Es bietet selbst keine Flows an, also fragt nichts einen Menschen zur Anmeldung, solange kein Plugin einen Flow registriert hat.

### Einen Flow registrieren

Dein Plugin deklariert einen Flow pro Credential, den es hält, keyed auf den `<scope>/<id>`-Credential-Record, den der Flow schreibt — der Scope benennt dein Plugin, die Id benennt ein Credential, das es besitzt:

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { AuthorizationSession } from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'

declare const ctx: Context
declare const exchangeCode: (code: string, signal: AbortSignal) => Promise<{ token: string }>

const key = credentialKey('llm-pi-ai', 'openai-codex') // <scope>/<id> — your plugin / this credential

const dispose = ctx.authorization.registerFlow({
  key,
  label: 'ChatGPT (Codex)',
  methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }, { id: 'api-key', label: 'Paste a key' }],
  async run(session: AuthorizationSession) {
    session.notify({ message: 'Continue in your browser', url: 'https://auth.example/start' })
    const code = await session.prompt({ kind: 'text', message: 'Paste the code' })
    const { token } = await exchangeCode(code, session.signal)
    await ctx.credentials.modifyRecord(key, () => Promise.resolve({ kind: 'grant', payload: { token } }))
  },
})

ctx.authorization.list()          // every registered flow, with inFlight
ctx.authorization.describe(key)   // the entry above, or undefined
dispose()                         // unregister; withdraws any running attempt
```

Ein Flow deklariert den Credential-Record, den er schreibt, ein nutzerseitiges Label und die Anmeldemethoden, die er anbietet, die bevorzugteste zuerst. `run()` spricht über die Session mit dem Menschen — einseitige Notices und Fragen, die der Flow nicht selbst beantworten kann — und muss den Record über `ctx.credentials` committen, bevor er resolved: Der Seam verweigert einen Flow, der ohne Commit resolved hat. `list()` und `describe()` lassen eine Oberfläche zeigen, was autorisiert werden kann und ob ein Versuch läuft; `dispose()` hebt die Registrierung des Flows auf und widerruft einen noch laufenden Versuch.

### Einen Versuch ausführen

Eine Oberfläche führt pro Credential jeweils einen Versuch aus. Die Interaktion reist mit der Anfrage statt in einer Registry zu liegen, sodass Prompts genau die Seite erreichen, die gefragt hat; ein headless-Aufrufer liefert eine Interaction, die ablehnt. `begin()` meldet `{ status: 'authorized' }`, wenn der Record während des Versuchs committed und beobachtet wurde, und `{ status: 'cancelled' }`, wenn der Mensch ablehnte oder der Aufrufer widerrief. `cancel(key)` widerruft den laufenden Versuch aus einem zweiten Aufruf, für das Request/Response-Transportmittel, das einen Cancel-Button beantwortet, ohne das Signal des ersten Aufrufs zu halten.

### Was schiefgehen kann

- **Ein Credential ohne Flow ist inert** — `begin()` auf einem Key, den kein Flow beansprucht, wirft `NO_FLOW`; ein Record, das ein deinstalliertes Plugin hinterließ, kann gelöscht, aber nicht erneut autorisiert werden.
- **Ein Versuch pro Credential zur Zeit** — ein zweites `begin()`, während einer läuft, wirft `ALREADY_IN_FLIGHT`; `inFlight` auf dem Eintrag lässt eine UI den Button vorab deaktivieren.
- **Ein Flow, der ohne Commit resolved, wird verweigert** — `NOT_COMMITTED`, sodass `authorized` immer bedeutet, dass der Record wirklich gespeichert ist.
- **Eine Methode zu nennen, die der Flow nicht anbietet, wirft `UNKNOWN_METHOD`** — keine zu nennen lässt die erste Methode des Flows laufen.
- **„Nein" ist ein Ergebnis, kein Defekt** — ein abgelehnter Prompt schließt den Versuch als `cancelled` ab, genauso wie ein widerrufenes Signal; jeder andere Fehlschlag erreicht den Aufrufer als geworfenen Fehler.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Design-Entscheidungen hinter dem Seam und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designphilosophie

- **Der Seam besitzt das Gespräch, nie das Protokoll.** Ein Plugin, das weiß, wie es sein eigenes Credential beschafft, registriert einen Flow, keyed auf den Record, den es schreibt; ein zweites Authorization-Protokoll kommt als weiterer Flow statt als weiterer Seam, und eine Oberfläche, die einen Flow rendern kann, rendert alle.
- **Der Flow besitzt den Schreibvorgang.** `run()` resolved zu bedeuten heißt, der Record ist bereits über `ctx.credentials` committed; der Seam bestätigt einen Commit, den er während des Versuchs beobachtet hat — reine Anwesenheit würde bei einer Re-Autorisierung einen stale Record als frisch durchgehen lassen — und verweigert einen Flow, der ohne einen resolved hat. Das Commiten innerhalb des Flows erlaubt einer Bibliothek, die über ihren eigenen Store-Adapter persistiert, der einzige Schreiber zu bleiben, statt herauskopiert und ein zweites Mal geschrieben zu werden.
- **Die Interaktion reist mit der Anfrage, nicht mit einer Registry.** Wer eine Authorization startet, ist derjenige, der mit dem Menschen darüber sprechen kann, sodass Prompts genau die Oberfläche erreichen, die gefragt hat, und ein headless-Aufrufer eine Interaction liefert, die ablehnt. Es gibt keinen ambienten Provider, der fehlen könnte, und keine Frage, welcher von zwei offenen Seiten ein Prompt gehört.
- **Das „Nein" eines Menschen ist ein Ergebnis, kein Defekt.** Eine Interaction, die ablehnt, rejectet ihren Prompt mit `AuthorizationDeclinedError`, und der Versuch schließt als `cancelled` ab, genau wie ein widerrufenes Signal; jede andere Prompt-Rejectung bleibt ein Flow-Fehlschlag, der den Aufrufer erreicht.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Service Definition: Flow-Registry, Ein-Versuch-pro-Key-Lifecycle, Interaction-Routing, Commit-Bestätigung |
| [`src/types.ts`](src/types.ts) | Wire-sicheres Vokabular: Methoden, Notices, Prompts, Ergebnisse, Einträge |
| [`src/invariant.ts`](src/invariant.ts) | Invariant-Begleiter: `authorization/settled` nennt immer einen freigegebenen Key |

### Lifecycle

Ein Versuch pro Key zur Zeit. `begin()` validiert Key und Methode, verweigert einen zweiten Versuch für einen belegten Key und führt den Flow mit einer `AuthorizationSession` aus, die die gewählte Methode, ein Cancellation-Signal und die `notify`/`prompt`-Callbacks trägt, die zur Interaction der Anfrage geroutet sind. Ein widerrufener Versuch schließt sofort ab, selbst wenn der Flow nie auf sein Signal reagiert — der verwaiste Lauf bleibt sich selbst überlassen, und ein Record, den er noch zu committen schafft, ist ein Record, den der Mensch autorisiert hat. Der Key wird freigegeben, bevor `authorization/settled` feuert, sodass ein Listener, der mit dem Start des nächsten Versuchs reagiert, nicht verweigert wird; Listener-Fehlschläge werden nach den Regeln des Credentials-Seams eingedämmt.

### Das Interaction-Vokabular

Ein Notice ist einseitig und trägt nie ein Secret: eine Nachricht, optional die Seite, die der Mensch öffnen muss, und den Code, den er dort eingeben muss. Ein Prompt ist eine Frage, die der Flow nicht selbst beantworten kann — `text`, `secret` oder `select` — wobei sich `secret` von `text` nur in der Darstellung unterscheidet. Ein Prompt trägt sein eigenes Signal, sodass ein Flow, der einen getippten Code gegen einen Browser-Callback racen lässt, die verlierende Frage zurückziehen kann, während der Versuch weiterläuft; das Signal der Anfrage widerruft stattdessen den ganzen Versuch. Das Vokabular ist bewusst kleiner als das jedes einzelnen Providers: Es beschreibt, was eine Oberfläche rendern muss, sodass eine Oberfläche, die einen Flow rendert, alle rendert.

### Commit-Bestätigung

Während des Versuchs beobachtet der Seam `credentials/record-updated` für den Key des Flows, und nach dem Resolve von `run()` liest er `describeRecord` erneut — er bestätigt, dass der Commit jetzt geschah, weil bei einer Re-Autorisierung der Record bereits existiert und reine Anwesenheit ein stale Credential als frisch autorisiert durchgehen ließe. Ein Flow, der ohne Commit resolved oder der seinen Record löschte statt einen zu committen, wirft `NOT_COMMITTED`.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Contract nicht reicht. Sie gehen vom gemeinsamen Credential-Vokabular über zum Record-Store, durch den die Flows schreiben, und den Entscheidungsbelegen hinter dem Seam.

- [Credentials-Subsystem-Referenz](../../../docs/subsystems/credentials.de.md) — die beiden Key-Spaces und die generierte Cordis-Oberfläche beider Seams.
- [Credentials-Paketkarte](../README.de.md) — die Pakete credential-reference, local-store und authorization.
- [Credential-Reference-Seam](../credentials/README.de.md) — der Record-Store, durch den jeder Flow committet.
- [Capability-Seams](../../../docs/capability-seams.de.md) — die Service-Definition-/Service-Provider-/Consumer-Aufteilung, der dieser Seam folgt.
- [Credential Records und Authorization Flows](../../../.agents/notes/implemented/architecture/2026-08-13-credential-records-and-authorization-flows.de.md) — die Rationale und Entscheidungen hinter der Record-Hälfte und diesem Seam.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da Authorization ein Konfigurations-Gespräch mit einem Menschen ist und kein Flow, Notice oder Prompt eine Modellanfrage erreicht.

#### KV-Cache-Effekt

Keine Invalidierung; kein Authorization-Status gelangt in einen Request-Prefix.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann dieses Paket schlecht passt oder besondere Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Kein Flow ist wiederaufsetzbar** — ein Versuch lebt in dem Prozess, der ihn gestartet hat, sodass ein Browser-Reload während eines Logins ihn verwirft und der Mensch von vorn beginnt; dauerhafte Versuche brauchen einen Store, den dieser Seam nicht hat.
- **Nichts widerruft** — Abmelden ist `ctx.credentials.deleteRecord(key)`, das den lokalen Record vergisst, ohne den Issuer zu informieren; ein Provider, der ein serverseitiges Revoke braucht, hat keine Stelle, es zu deklarieren.
- **Ein Key ohne Flow ist inert** — der Seam meldet, was registriert ist, sodass ein Record, das ein deinstalliertes Plugin hinterließ, gelöscht, aber nicht erneut autorisiert werden kann; diesen verwaisten Record zu erkennen, ist Aufgabe des Aufrufers, wie bei `listRecords()`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und unentschiedene Richtungen. Sie ist explizit nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und akzeptierte Rationale liegen in den Abschnitten oben, dem Paket-Code und der verlinkten Agent Note.

Die obigen Einschränkungen benennen die offenen Richtungen — wiederaufsetzbare Versuche, serverseitiges Revoke, Erkennung verwaister Records — jede braucht vor der Landung eigenes Design und eigenen Store. Der Invariant-Begleiter ist die einzige tragende Runtime-Prüfung: Settlement muss den Key stets freigegeben vorfinden, weil ein verklemmter Key von einem belegten nicht zu unterscheiden ist und nur ein Neustart ihn befreit.

</details>
