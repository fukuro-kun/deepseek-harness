---
description: "Der spill-Speicherdienst: Übergroßen Tool-Text oder erfasste Session-Referenzen speichern und einen abrufbaren Locator zurückgeben."
kind: "package-reference"
---

# @deepseek-ai/dsh-spill

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

`dsh-spill` lässt Plugins und Tools übergroßen Text über die öffentliche `ctx.spillStore`-API speichern und gibt einen undurchsichtigen Locator, die exakte Byteanzahl und Abrufhinweise zurück. Wähle es, wenn vollständige Ergebnisse abrufbar bleiben müssen, ohne den Modellkontext zu füllen. Konfiguriere `dsh-spill-local` für lokale Persistenz und füge `dsh-spill-policy` hinzu, wenn übergroße Tool-Ergebnisse zu begrenzten Vorschauen werden sollen. Die API bietet keine Retention-, Ersetzungs-, Abruf- oder Suchoperationen. Ein Speichern lehnt bei einem Speicherfehler ab und überlässt es dem Aufrufer, den Inhalt inline zu behalten oder fehlzuschlagen.

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

Eine Komposition, die spill-Artefakte speichert, mountet ein Backend — dieses Paket allein speichert nichts. `dsh-spill-policy` entscheidet, wann Tool-Ergebnisse spillen; `dsh-session-reference` speichert gekürzte Referenz-Transkripte direkt, ohne diese Policy zu benötigen. Aufrufer verwenden `ctx.spillStore.saveText()` mit einem expliziten Owner; optionale Consumer entdecken das Backend über `ctx.get("spillStore")`.

### Wann man es wählt

Wähle spill-Speicher, wenn ein Deployment den Volltext abrufbar halten muss, nachdem das Modell eine begrenzte Vorschau gesehen hat — etwa einen abgerufenen Seitenbody oder ein erfasstes Session-Referenz-Transkript. Voraussetzung ist ein Backend, dessen Locator und Abrufhinweis im Deployment nutzbar sind; lokaler Dateisystemzugriff ist keine Dienstvoraussetzung.

### Kleinste funktionierende Komposition

Mounte ein Backend und die Policy zusammen; mit gesetztem `maxInlineBytes` wird jedes übergroße Plain-Text-Tool-Ergebnis automatisch zu einer Vorschau plus Locator.

```yaml
- name: '@deepseek-ai/dsh-spill-local'
- name: '@deepseek-ai/dsh-spill-policy'
  config:
    maxInlineBytes: 50000
```

### Text speichern

Mit gemountetem Backend rufst du `ctx.spillStore.saveText()` mit der besitzenden Session, einer Quellbeschreibung, einem vorgeschlagenen Dateinamen und dem Volltext auf:

```text
const ref = await ctx.spillStore.saveText({
  owner: { sessionId: 'session-1' },
  source: { kind: 'tool', toolName: 'web_fetch', callId: 'call-1', label: 'result' },
  suggestedName: 'web_fetch.txt',
  content: fullText,
})
```

Der zurückgegebene `SpillRef` trägt drei Felder: `locator`, ein undurchsichtiges modellseitiges Handle, das das Backend erzeugt (für `dsh-spill-local` ein lokaler Dateipfad, für ein anderes Backend möglicherweise eine URI oder ein Schlüssel); `bytes`, die exakte geschriebene UTF-8-Byteanzahl; und `retrievalHint`, die Anleitung, die ein Consumer dem Modell zeigt — für das lokale Backend: den Pfad lesen oder grepen. Consumer rendern den Locator mit dem Hinweis und parsen den Locator selbst nie.

### Besitz und Grenzen

Der Speicher ist nach der besitzenden Session gruppiert: Geforkte Sessions erben bestehende Locators aus dem Seed-Log, ohne sie zu kopieren oder neu zu besitzen, und neue Spills nach einem Fork verwenden die Kind-Session-ID. Ein Session-Referenz-Artefakt gehört der Zielsession, die den Kontext empfängt, nicht der referenzierten Quellsession. `suggestedName` ist nur ein Hinweis — Backends bereinigen ihn zu einem einzigen sicheren Segment und vertrauen ihm nie als Pfad. Consumer besitzen Vorschau- und spill-Entscheidungen; das Backend besitzt Speicher und Artefakt-Ablauf.

### Fehler und Wiederherstellung

`saveText` lehnt nur bei einem echten Speicherfehler ab — fehlende Berechtigungen, kein Speicherplatz oder ein ausgefallenes Backend. Der Aufrufer entscheidet, wie er degradiert: Die ausgelieferte Policy behandelt eine Ablehnung als best-effort, protokolliert eine Warnung und behält das ursprüngliche Inline-Ergebnis, sodass ein spill-Fehler nie einen erfolgreichen Tool-Aufruf in einen Fehler verwandelt oder Inhalt verbirgt. Ist kein Backend gemountet, gibt es nichts zu speichern; lade `dsh-spill-local` oder ein anderes Backend in der Komposition.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Dienst; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designphilosophie

Das Paket baut auf einer Trennung und einem bewussten Minimum auf:

- **Vertrag, Implementierung und Policy bleiben getrennt.** Dieses Paket definiert, was ein Backend tut (`saveText`); `dsh-spill-local` implementiert es; `dsh-spill-policy` entscheidet, wann. Jeder Aspekt entwickelt sich und tauscht unabhängig.
- **Eine Methode, sonst nichts.** Der seam besitzt keine Retention-Policy, keine Ergebnisersatz und keine Abruf- oder Such-API — dafür gibt es eigene Pakete.
- **Am seam ablehnen, nie still degradieren.** Der Aufrufer besitzt die Degradierung; der seam meldet echte Speicherfehler.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: der abstrakte `SpillStore`-Dienst und sein `saveText`-Vertrag |
| [`src/types.ts`](src/types.ts) | Vokabular: `SaveTextSpill`, `SpillRef`, gebrandeter `SpillLocator`, `SpillOwner`, `SpillSource` |
| — | Es wird kein Runtime-Invariant-Begleiter veröffentlicht; dieses Paket legt keine unabhängige Ereignisfolge oder veränderliche Datenbeziehung über die an seinem eigenen seam erzwungenen Verträge hinaus offen. |

### Datenmodell

`SaveTextSpill` trennt Speicherbesitz von beschreibender Herkunft. `SpillSource` akzeptiert entweder die Tool-Quelle `{ kind: "tool", toolName, callId, label }` oder `{ kind: "session-reference", sessionId, label }`, deren ID die erfasste Quellsession benennt. Session-Referenzen fabrizieren nie Tool-Call-IDs. Weder Herkunft noch der Owner-Namensraum gewähren Lesezugriff. Consumer behandeln den zurückgegebenen Locator als undurchsichtig und präsentieren ihn mit seinem Abrufhinweis.

### Lebenszyklus

Ein Backend beerbt `SpillStore` und lädt als Plugin, registriert als `ctx.spillStore`; eine Implementierung pro Kontext, und ein zweiter Ladevorgang schlägt fehl. Das Disposal gibt den Dienst frei. Die abstrakte Klasse selbst registriert nichts — dieses Paket liefert nur Vertrag und Vokabular.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen vom gemeinsamen Vokabular zum ausgelieferten Backend, zur Policy und zur Designbegründung.

- [spill-Subsystem](../../../docs/subsystems/spill.de.md) — das erschöpfende Vokabular, Besitzverhältnisse und Backend-Beziehungen.
- [spill-Paketkarte](../README.de.md) — die Drei-Pakete-Familie und jede Rolle.
- [dsh-spill-local](../spill-local/README.de.md) — das ausgelieferte lokale Dateisystem-Backend.
- [dsh-spill-policy](../spill-policy/README.de.md) — die Policy, die entscheidet, wann ein Endergebnis zu groß ist.
- [dsh-output-retention](../../util/output-retention/README.de.md) — die Vorschau-Mechanik hinter der Policy.
- [Tool-Output-spill-Entscheidung](../../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.de.md) — die Capability-Grenze und Designbegründung.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt über spill-Consumer, die den Locator und die Abrufhinweise des Backends dem Modell darstellen.

#### KV-Cache-Wirkung

Keine direkte Invalidierung; der genannte Consumer besitzt alle Request-Präfix-Änderungen.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen beschreiben, wann der spill-Speicherdienst allein unvollständig ist. Sie sind aktuelle Paketbedingungen.

- **Keine Abruf- oder Lösch-API** — Consumer können nur den Locator und die Hinweise des Backends rendern; Lebenszyklus- und Zugriffssemantik bleiben backend-spezifisch.
- **Speicher ist keine Zugriffskontrolle** — die Owner-Session namespacet Schreibvorgänge, autorisiert aber keine Lesevorgänge über einen Locator; jedes Backend und jeder Abruf-Consumer muss seine eigene Grenze durchsetzen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: unentschiedene Richtungen und offene Fragen. Sie ist ausdrücklich nicht maßgeblich.

#### Zukunft: Executor-spill-Datei-Integration

Der seam hat nur `saveText`; ein Save-File- oder Link/Copy-Pfad für bestehende Executor-spill-Dateien (zum Beispiel das Normalisieren von Bash-Temp-Dateien) und tool-eigener spill für Subagent-Rollouts bleiben zurückgestellt, siehe die [Tool-Output-spill-Entscheidung](../../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.de.md).

#### Zukunft: Nicht-lokale Backends und Bereinigung

Entfernte oder Datenbank-Backends bleiben offen. Das lokale Backend wendet seine [Startup-Cleanup-Policy](../spill-local/README.de.md#startup-cleanup) an; der Dienst definiert keine Pro-Session-Bereinigung oder Locator-Refresh-API.

</details>
