---
description: "Session-Feedback: der `/feedback`-Befehl, der `sessionFeedback` Host Remote hinter dem Web-Feedback-Dialog und die feste Kategorie-Taxonomie; für Nutzer und Maintainer, die Feedback-Erfassung auswählen, zusammensetzen oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-command-feedback

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-command-feedback` lässt einen Nutzer dem harness mitteilen, was er von einer Session hält. `/feedback` plus eine Bemerkung einzutippen zeichnet sie auf und quittiert die Session- und anonymen Nutzer-ids; der Web-Feedback-Dialog zeichnet eine Kategorie und eine optionale Beschreibung über den `sessionFeedback` Host Remote auf. Die Aufzeichnung ist sofortig und startet niemals Modell-Arbeit: Das Modell sieht die Bemerkung weder noch wird es durch sie unterbrochen. Das Paket besitzt außerdem die feste Kategorie-Taxonomie, unter der jede Feedback-Oberfläche ablegt. Es wird mit der Standard-`dsh`-Basis ausgeliefert und braucht keine Konfiguration; Headless-, ACP- und JSON-RPC-Einstiegspunkte bieten keine Slash-Befehle.

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

Nutzer können Feedback sofort aus dem Web-Client heraus aufzeichnen: Der `/feedback`-Befehl wird mit der Standard-`dsh`-Basis ausgeliefert, braucht keine Konfiguration und funktioniert in jeder Unterhaltung. Eine eigene App erhält denselben Befehl, indem sie das command registry und dieses Plugin gemeinsam mountet.

### Der `/feedback`-Befehl

Tippen Sie `/feedback` gefolgt von Ihrer Bemerkung und senden Sie sie ab. Ein erfolgreicher Eintrag wird mit der empfangenden Session-id und der anonymen Nutzer-id quittiert:

| Eingabe | Ergebnis |
|---|---|
| `/feedback the diff view is unreadable` | Zeichnet die Bemerkung auf und quittiert mit zwei Zeilen: `Feedback recorded for session {sessionId}` und `Anonymous user: {userId}.` |
| `/feedback` | Ein Nutzungsfehler: `Feedback text is required. Usage: /feedback <text>`. Eine nur aus Leerraum bestehende Eingabe gilt als leer. |

Umgebender Leerraum wird getrimmt, aber die Bemerkung bleibt ansonsten exakt wie getippt erhalten: kein Abschneiden, keine Groß-/Kleinschreibungs-Normalisierung, kein Command-Parsing — `/feedback /plan felt slow` zeichnet genau diesen wörtlichen Text auf. Jede Befehlsausführung zeichnet ihren eigenen Eintrag auf; nichts wird zusammengeführt oder ersetzt.

<a id="the-web-feedback-dialog"></a>
### Der Web-Feedback-Dialog

Im Web-Client öffnet ein nacktes `/feedback` — aus dem Composer-Menü gewählt oder ohne Text getippt und gesendet — den Feedback-Dialog statt des Nutzungsfehlers. Der Dialog bietet die sieben Kategorien unten und ein Freitextfeld; jedes Feld ist optional, und eine leere Übermittlung wird akzeptiert, und das Konversationslog reist wie bei jedem Feedback-Event mit dem aufgezeichneten Event mit. Er zeichnet über `sessionFeedback.record` auf, was dasselbe `feedback/record`-Event ohne Befehls-Buchführung und ohne Bestätigungszeile anhängt; der Dialog zeigt stattdessen einen Toast.

| Kategorie-id | Bedeutung |
|---|---|
| `task-result` | Das Ergebnis der Aufgabe |
| `instruction-following` | Verstehen und Befolgen von Anweisungen |
| `product-interaction` | Produktfunktionen und Interaktion |
| `service-stability` | Dienst-Stabilität |
| `resource-cost` | Ressourcennutzung und Kosten |
| `security-privacy-permission` | Sicherheit, Datenschutz und Berechtigungen |
| `other` | Alles andere |

Die ids sind dauerhaftes Log-Vokabular, das mit dem per-message-Feedback geteilt wird; jede Oberfläche besitzt ihre eigenen lokalisierten Labels.

### Feedback aus eigener UI aufzeichnen

Feedback muss nicht vom Slash-Befehl oder dem Dialog kommen: Jede UI, jeder hook oder jede Host-Integration kann eine Bemerkung direkt über `recordFeedback` oder den `sessionFeedback` Remote aufzeichnen, mit denselben Garantien und ohne Modell-Turn. Eine eigene App, die den Slash-Befehl will, mountet den Session-store, das command registry und dieses Plugin; der Session-store ist es, aus dem der `sessionFeedback` Remote live Sessions auflöst:

```yaml
- id: session
  name: '@deepseek-ai/dsh-session'
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: command-feedback
  name: '@deepseek-ai/dsh-command-feedback'
```

Der Web-Client liefert den Befehl mit. Headless-Modus, ACP-Automatisierung und JSON-RPC bieten keine Slash-Befehle, daher ist `/feedback` dort nicht verfügbar.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

### Designkonzept

Die Bemerkung ist eine einzelne append-only-Tatsache im Session-Log, die dem Event gehört und nicht dem Auslöser, der sie erzeugte: Feedback kann vom Befehl, vom Dialog oder von einer beliebigen Integration ankommen, also darf die Tatsache nicht vom Slash-Befehl abhängen. Der Befehl hält seine eigene Buchführung payload-frei, sodass der Bemerkungstext an genau einer Stelle im Log existiert, und das Event taucht niemals beim Modell auf.

### Wie eine Bemerkung aufgezeichnet wird

Der Produzent trimmt den Text, zeichnet leeren Text als abwesend auf und schreibt ein Event in das Session-Log, selbst wenn der Eintrag weder Text noch Kategorie trägt; der `/feedback`-Handler lehnt leere Eingaben selbst ab und ist ansonsten eine dünne Hülle über demselben Produzenten, und der `sessionFeedback.record` Remote löst die live Session per id auf und ruft ihn ebenfalls auf, mit der Antwort `session-not-found`, wenn kein live Besitzer die id trägt. Keiner der beiden Pfade startet Modell-Arbeit. Der Schreibvorgang ist eifrig, aber nicht geflusht: Die Bestätigung bedeutet, dass der Eintrag das Log erreicht hat, nicht die Platte. Die erste akzeptierte Befehlsbemerkung für ein harness home prägt außerdem die anonyme Nutzer-id, die die Bestätigung meldet. Der exakte Produzenten-Vertrag liegt in [`src/index.ts`](src/index.ts); das Event-Payload, die Taxonomie und das Remote-Vokabular liegen in [`src/types.ts`](src/types.ts).

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `recordFeedback`-Produzent, der `sessionFeedback` Remote-Service, `/feedback`-Befehlsregistrierung |
| [`src/types.ts`](src/types.ts) | `feedback/record`-Event-Deklaration, die Kategorie-Taxonomie und die Remote-Request- und Result-Typen |
| — | Es wird kein Runtime-invariant-Begleitexport veröffentlicht; jeder `feedback/record` ist eine unabhängige append-only-Tatsache ohne cross-event- oder mutable-data-Beziehung. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der paketweite Vertrag nicht ausreicht. Sie decken das command registry, die Persistenz und die Identitäts-Fakten ab, auf die dieser Erfassungspfad aufbaut.

- [dsh-commands](../../interaction/commands/README.de.md) — das registry, das den globalen Befehl und seine `recordInput`-Semantik entdeckt.
- [Session-Persistenz-Subsystem](../../../docs/subsystems/persistence.de.md) — wie angehängte Events dauerhaft werden und was eine flush-Barriere bedeutet.
- [Anonyme Nutzeridentität](../../identity/anonymous-user-id/README.de.md) — die id, die die Bestätigung meldet.
- [ui-message-feedback](../../client/ui-message-feedback/README.de.md) — der Web-Feedback-Dialog, der über den `sessionFeedback` Remote aufzeichnet.
- [Feedback-Paketkarte](../README.de.md) — wo log-only-Erfassung neben per-message-Feedback liegt.

-----

<a id="model-experience"></a>
## Model Experience

### Menschliche `/feedback`-Erfassung

#### Was das Modell sieht

Nichts. Die Slash-Eingabe, der Dialog, `feedback/record` und die Bestätigung fehlen in Modell-Anfragen. Das Feedback-Event und die registry-Lifecycle-Einträge sind log-only und tragen kein `surfaceOp`, sodass sie niemals die geordnete surface, `deriveMessages()` oder einen System-Prompt erreichen. Feedback während eines Turns aufzuzeichnen ändert die verbleibenden Anfragen dieses Turns nicht.

#### Token-Effekt

Kein direkter Token-Effekt. Weder ein akzeptierter Eintrag noch ein Nutzungsfehler fügt Modell-tokens hinzu, weder im aufzeichnenden Turn noch in einem späteren.

#### KV-Cache-Effekt

Unabhängig vom Modell-Anfragepfad. Die Aufzeichnung hängt nur an das Session-Log an und lässt ein bereits wiederverwendbares Anfrage-Präfix unberührt. Nichts, was dieses Paket beiträgt, kann Cache-Wiederverwendung ungültig machen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wo Session-Feedback schlecht passt oder sich anders verhält, als ein Nutzer erwarten könnte. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Keine Feedback-Abruf- oder Verwaltungs-surface** — es gibt keinen Abruf, keine Aggregation und kein modellseitiges Tool für `feedback/record`.
- **Nur Kategorie und Text** — ein Eintrag trägt höchstens eine Kategorie und einen Freitext-String, ohne Schweregrad oder Verweis auf ein referenziertes Event.
- **Nur live Sessions über den Remote** — `sessionFeedback.record` antwortet `session-not-found` für eine Session, die kein live Besitzer trägt; der Web-Dialog meldet diesen Fehler, wenn seine Session ausläuft, während er offen ist.
- **Kein Ändern oder Zurückziehen** — das Session-Log ist append-only, und dieses Paket fügt keinen tombstone hinzu, sodass ein falscher Eintrag aufgezeichnet bleibt und nur durch einen späteren ersetzt werden kann.
- **Keine explizite Durability-Barriere** — die Bestätigung folgt dem Append, nicht einem flush, sodass ein unmittelbar vor einem Absturz aufgezeichneter Eintrag mit jedem anderen ungeflushten Rest verloren gehen kann. Ein Consumer, der eine Barriere braucht, wartet `ctx.sessions.flush(session)` ab.
- **Keine sichtbare Bestätigung in einer frischen Session** — das Web-transcript rendert Befehlszeilen erst, sobald eine Session aktiv ist, sodass ein getipptes `/feedback <text>` in einer noch leeren Session das Event aufzeichnet, aber keine Bestätigungszeile zeigt; der Toast des Dialogs hängt nicht vom transcript ab.
- **Nur Web unter den ausgelieferten Einstiegspunkten** — Headless-Modus, ACP-Automatisierung und JSON-RPC bieten keinen Befehls-Adapter, sodass `/feedback` dort nicht verfügbar ist.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer; sie ist ausdrücklich nicht autoritativ. Ausgeliefertes Verhalten, Grenzen und Begründungen liegen in den Abschnitten oben und im Paket-Code.

- Die Bestätigungssätze und die Kategorie-Reihenfolge sind durch [`tests/command-feedback.spec.ts`](tests/command-feedback.spec.ts) fixiert; sie zu ändern ändert nutzersichtbaren Text.
- Eine Abruf-surface bleibt die offene Richtung hinter der ersten Einschränkung; nichts im aktuellen Vertrag reserviert ein Format dafür.

</details>
