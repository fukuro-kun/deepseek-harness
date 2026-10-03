---
description: "Subagent-Konversationskatalog, Continuation-Routing-UI und '@'-Referenzquelle für den dsh Web-Client."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-subagent
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

Verwenden Sie dieses Paket, um jede subagent-Konversation unterhalb einer Parent-Session zu durchsuchen, jeden Descendant zu öffnen und zu sehen, ob er läuft, samt Token-Nutzung und Dauer des aktiven Turns. Abgeschlossene One-Shot-Konversationen öffnen sich als schreibgeschützte Ausführungsaufzeichnungen. Fortsetzbare Konversationen nehmen Folge-prompts in Einreichreihenfolge an, während sie laufen, und bieten Stop unabhängig an. Die gewöhnliche Session-Seitenleiste lässt subagent-Konversationen aus, sodass der Katalog im Parent-Header ihr Navigationseinstieg ist. Die separate `@`-Quelle fügt das Label eines laufenden Child in eine Nutzer-Nachricht ein, ohne es in eine Continuation-Adresse aufzulösen.

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

Der Session-Header behält den aktuellen Session-Titel als Lineage-Breadcrumb und hängt, wenn die Session subagent-Descendants hat, einen `/`-Zähler-Trigger vor der Aktionszeile des Headers an; der Trigger öffnet den Descendant-Katalog, zählt die vollständige, nur aus subagents bestehende Lineage, stoppt an gewöhnlichen forks und zeigt laufende Aktivität, wenn irgendein gezählter Descendant läuft. Wählen Sie eine beliebige Tiefe, um die Konversation dieses Child mit seiner exakten `{parentSessionId, childSessionId, mode}`-Adresse zu öffnen.

### Den Baum durchsuchen

Zeilen zeigen mode plus `running`/`inactive`-Aktivität und einen optionalen, aus dem Log gespeisten Titel; die letzte Spalte stapelt die gesamte durable Provider-Nutzung über der aktiven-Turn-Dauer. Tastaturnavigation funktioniert mit ArrowRight/ArrowLeft zum Auf- und Zuklappen von Branches sowie ArrowUp/ArrowDown, Home, End und Escape zum Navigieren oder Schließen des Baums. Eine unbeschriftete One-Shot-Zeile fällt auf ihre Session-id zurück; korrupte, nicht unterstützte oder nicht verfügbare Zeilen bleiben lesbar, aber deaktiviert.

### Eine Konversation fortsetzen

Ein fortsetzbares Child mit lebendigem Parent behält das gewöhnliche Eingabe-Chrome: Tippen und Send bleiben verfügbar, während das Child läuft, weil jede Folge-Nachricht in die FIFO-inbox des Child eintritt, und ein unabhängiges Stop über `subagents/interruptByParent` routet. Ein fortsetzbares Child, dessen exakter Parent nicht verfügbar ist und das nicht läuft, wählt einen schreibgeschützten Composer, der den Wiederherstellungspfad erklärt; solange ein solches Child noch läuft, weicht der Selektor dem gewöhnlichen Composer mit deaktivierter Eingabe und deaktiviertem Send, aber nutzbarem unabhängigem Stop.

### Die `@`-Referenzquelle

Die `@`-Quelle bleibt bewusst separat und inert: Kandidaten sind laufende Children aus `ctx.sessions.list` ganz ohne RPC; das Auswählen fügt wörtlichen `@label `-Text ein, und der Codec projiziert `@label`. Sie hat keine Command-Adjudication-Hooks und löst keine Labels in Continuation-Adressen auf.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Katalog- und Composer-Verhalten sind durch die [Web-subagent-Konversationen-Notiz](../../../.agents/notes/implemented/feature/2026-07-27-web-subagent-conversations.de.md) und die [Current-Turn-Interrupt-Notiz](../../../.agents/notes/implemented/feature/2026-08-06-continuable-subagent-interrupt.de.md) spezifiziert.

### Katalog-Ableitung

Der Header-Lineage-Renderer liest `subagentsByParent` und Session-Zusammenfassungen über den Standard-`useSessions`-Hook. Der kompakte Baum bleibt Direktkatalog-autoritativ: Der `hasChildren`-Hinweis jeder gesunden Zeile entscheidet vor der Interaktion über die Disclosure; eine Katalogebene reserviert die Disclosure-Spalte nur, wenn mindestens eine gesunde Zeile ein Branch ist; und das Aufklappen eines Branch reserviert sofort eine deaktivierte Ladezeile pro bekanntem direktem Descendant, bevor sie lazy durch den autoritativen Katalog dieses Child ersetzt werden. Jeder sichtbare Branch wird der Runtime gemeldet, sodass Membership-Frames nur dort einen entprellten Refresh auslösen, wo der Baum konsumiert wird.

### Dauer und tokens

Token-Summen addieren die vier disjunkten `tokenUsage`-Buckets. Die Dauer summiert abgeschlossene `subagentTiming`-Turns, läuft nur für einen offenen Turn auf einem laufenden Child einmal pro Sekunde weiter und friert ein, sobald das Child inaktiv wird; ein unterbrochener offener Turn ist durch sein gleichschnittiges `active.through` begrenzt, niemals durch neuere Session-Metadaten.

### Composer-Wahl

One-Shot-Children wählen immer einen schreibgeschützten Composer. Ein fortsetzbares Child wählt einen nur, wenn sein exakter Parent nicht verfügbar ist und das Child nicht läuft; andernfalls routet die Session des gewöhnlichen Composers prompts über `subagents/prompt`. Dieses Paket erhält niemals Host-Kontext und ruft kein modellseitiges Tool auf.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten decken die Konversations-Oberfläche, die Host-seam und die Design-Notizen ab.

- [ui-conversation](../ui-conversation/README.de.md) — die Chat-Oberfläche, die die Header-Aktion und die Composer-Kette beherbergt.
- [ui-input-trigger](../ui-input-trigger/README.de.md) — die Suggestion-Machinerie, die die `@`-Quelle beherbergt.
- [subagent](../../subagent/subagent/README.de.md) — die Host-seitige capability seam hinter fortsetzbaren Children.
- [Web-subagent-Konversationen](../../../.agents/notes/implemented/feature/2026-07-27-web-subagent-conversations.de.md) — die Katalog- und Composer-Spezifikation.
- [Current-Turn-Interrupt](../../../.agents/notes/implemented/feature/2026-08-06-continuable-subagent-interrupt.de.md) — die Semantik des unabhängigen Stop.

-----

<a id="model-experience"></a>
## Model Experience

### Subagent-Label-Text im Nutzer-prompt

#### Was das Modell sieht

Nur die `@`-Referenzquelle beeinflusst die Modelleingabe: Ein gewählter Kandidat erreicht die gewöhnliche Nutzer-Nachricht als wörtliches `@label`, ohne dedizierten Block oder Host-seitige Auflösung. Katalog-Durchsuchen, Child-Navigation und das Betrachten persistierter transcripts fügen keine prompt-Sektion hinzu; akzeptierter Continuation-Inhalt wird über den Host-subagent-Adapter eine normale FIFO-Nutzer-Nachricht.

#### Token-Effekt

Konditional und append-only: Das wörtliche `@label` oder eine menschliche Folge-Nachricht fügt nur ihrer neuen Nutzer-Nachricht tokens hinzu. Katalog- und transcript-Operationen fügen null Modell-tokens hinzu.

#### KV-Cache-Effekt

Append-only. Dieses Paket bearbeitet niemals frühere Anfrage-tokens.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, was der Katalog zeigen kann und was `@`-Referenzen bedeuten; sie sind aktuelle Paket-Constraints.

- **Der Katalog hat kein durable Ergebnis** — Aktivität und Timing unterscheiden nicht zwischen Abschluss, Fehlschlag oder Cancellation, und die UI exponiert keine Activation-Identität; das Stoppen ist auf das Current-Turn-Stop des Composers für ein laufendes fortsetzbares Child beschränkt.
- **`@`-Referenzen bleiben Anzeigetitel-Text** — doppelte oder umbenannte Labels sind mehrdeutig, sodass sie absichtlich keine Continuation-Semantik erhalten.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-invariant:** Es wird kein Begleitexport veröffentlicht. Eine einzelne Slash-Quellen-Registrierung, deren Disposal die HMR-Safety-Spec beweist — sie emittiert keine cordis-Events und besitzt keinen plugin-übergreifenden mutable State.
