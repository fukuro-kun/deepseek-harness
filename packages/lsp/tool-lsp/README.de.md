---
description: "Das modellseitige lsp-Tool: vier schreibgeschützte Code-Navigationsoperationen mit 1-basierten UTF-16-Cursor-Koordinaten, begrenzten Ergebnissen und Hover-Text, für Benutzer und Maintainer, die Modell-Code-Navigation zusammenstellen."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-lsp

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-tool-lsp` lässt ein Modell über ein einziges schreibgeschütztes `lsp`-Tool durch Code navigieren: die Definition eines Symbols öffnen, Referenzen und Implementierungen finden oder Hover-Dokumentation lesen. Anfragen verwenden 1-basierte UTF-16-Zeilen- und Zeichenpositionen. Navigationsergebnisse sind begrenzt, nach Datei gruppiert und markiert, wenn Positionen weggelassen oder Text gekürzt wird; Hover-Ergebnisse werden normalisiert und unterscheiden fehlende Informationen von Fehlern. Das Paket benötigt einen konfigurierten LSP-Provider und einen Workspace-Root der Session. Wählen Sie es, wenn Textsuche mehrdeutig ist oder eine Änderung präzise Symbolbeziehungen braucht; für gewöhnliche Navigation bleiben `search` und `read` zuständig.

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

Ein agent verwendet `lsp`, wenn Texttreffer mehrdeutig sind oder vor einer Änderung, die präzise Definitionen, Implementierungen oder Referenzen braucht; die Prompt-Anleitung des Tools weist es an, für gewöhnliche Navigation `search`/`read` zu bevorzugen.

### Das Tool

`lsp` nimmt `operation` (`goToDefinition`, `findReferences`, `goToImplementation` oder `hover`), `file_path`, `line` und `character` entgegen. `line` und `character` sind positive 1-basierte UTF-16-Cursor-Koordinaten; eine Position neben einem Symbol kann keine Ergebnisse liefern. `findReferences` schließt die Deklaration immer ein, sodass eine Impact-Analyse die Definitionsstelle nie verfehlt. Provider-Wahl, language id, Workspace-Root, Limits, Timeout und ausführbare Datei bleiben außerhalb der Modelleingabe.

### Was das Modell zurückbekommt

Navigation liefert `path:line:character`-Positionen, nach Datei gruppiert (1-basiert); Hover liefert normalisierten Text oder einen Hinweis, dass kein Hover vorliegt. Leere Positionen und fehlender Hover sind erfolgreiche Leer-Antworten. Ergebnisse werden zuerst durch `maxLocations` und dann durch `maxResultChars` begrenzt, wobei Auslassungs- und Kürzungsmarker innerhalb der Gesamtobergrenze mitzählen; die Begrenzungen betreffen nur die Darstellung, nicht den kanonischen Ergebniswert.

### Konfiguration

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `maxLocations` | `100` | Größte Anzahl gerenderter Positionen vor einem Auslassungsmarker |
| `maxResultChars` | `16000` | Größtes vollständig gerendertes Ergebnis, einschließlich Kürzungsmetadaten |
| `timeoutMs` | `60000` | Timeout-Budget des Tool-Aufrufs, durchgesetzt von `dsh-tool-call-timeout-policy`; deckt den vollständigen Lebenszyklus aus Queue-Öffnen, Abfrage und Schließen ab und ist nicht modellkonfigurierbar |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-tool-lsp) ist die erschöpfende Quelle für jedes akzeptierte Feld.

### Fehler und Wiederherstellung

Das Tool benötigt einen Workspace-Root der Session (`header.cwd`) ohne Fallback; bei Fehlen schlägt es vor jeder Abfrage mit `LSP_WORKSPACE_REQUIRED` fehl. Wenn kein Provider die Dateiendung verarbeitet, schlägt die Abfrage mit `LSP_UNAVAILABLE` fehl; fehlerhafte Provider-Payloads bleiben strukturierte `LSP_MALFORMED_RESPONSE`-Fehler. Diese erscheinen dem Modell als Fehler-Tool-Ergebnisse, die es lesen und darauf reagieren kann.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Tool und wo der Code sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) behandelt.

### Design-Notizen

- **Nur Consumer.** Das Tool injiziert zur Laufzeit nur `tools`, `lsp` und `systemPrompt`, importiert keinen Provider und reicht nur `exec.signal` an den seam weiter.
- **Koordinatenkonvertierung.** `parseLspArgs` validiert, dass `line` und `character` positive Ganzzahlen sind, und konvertiert sie in die 0-basierten Positionen des seam; gerenderte Positionen werden zurück in die 1-basierte Form konvertiert.
- **Kanonische Ergebnisdurchreichung.** Das Tool gibt die geschlossene Union des seam zurück (`{ kind: 'locations', locations, resolvedWorkspaceUri }` oder `{ kind: 'hover', hover }`), sodass native Renderer jede erlangte Position und jeden 0-basierten Range direkt prüfen können.
- **URI-Rendering in der Ausführungswelt.** `renderUri` löst eine `file:`-URI gegen die kanonische Workspace-URI des Providers auf — workspace-relativ innerhalb, URI-abgeleitet absolut außerhalb, wortwörtlich bei fehlerhafter oder nicht-`file:`-URI — und wendet niemals Host-Plattform-Pfadregeln auf das Session-cwd an.
- **Begrenzungen nach dem Rendering.** `maxLocations` begrenzt zuerst die Anzahl der Einträge, dann begrenzt `maxResultChars` den vollständigen gerenderten Text einschließlich seines Auslassungs- oder Kürzungsmarkers.
- **Generische Suchkarten-Darstellung.** `presentLspCall` rendert eine `{ card: 'generic', kind: 'search', title, locations: [{ path, line }] }`-Ansicht; der aus den args abgeleitete Titel trägt Operation und 1-basierten Cursor, und Follow-along fokussiert die abgefragte Zeile, während der Titel die Spalte erhält.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: config schema, Tool-Registrierung, System-Prompt-Abschnitt, Ausführung |
| [`src/render.ts`](src/render.ts) | Reine Formatierung, Koordinatenkonvertierung, URI-Auflösung, Ergebnisbegrenzungen, UI-Darstellung |
| [`src/session-cwd.ts`](src/session-cwd.ts) | Workspace-Root aus dem Session-`header.cwd` |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; dieser zustandslose adapter steuert ein Tool und einen Prompt-Abschnitt bei, während Abfragelebenszyklus und Ergebnisbeziehungen bei den Tool- und LSP-seams bleiben, die er komponiert. |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen von der modellseitigen Oberfläche zum seam und zum Provider.

- [LSP-Navigations-Subsystem](../../../docs/subsystems/lsp.de.md) — Operationen, Koordinaten, Anfragen und Ergebnisse sowie `LspError`-Codes.
- [dsh-lsp](../lsp/README.de.md) — der seam, den dieses Tool abfragt.
- [dsh-lsp-stdio](../lsp-stdio/README.de.md) — der stdio-Provider, der diese Abfragen beantwortet.
- [lsp-Gruppenkarte](../README.de.md) — die Drei-Pakete-Familie und ihre zugehörige Dokumentation.

-----

<a id="model-experience"></a>
## Model Experience

### System prompt

#### Was das Modell sieht

Ein System-Prompt-Abschnitt (first-party-Reihenfolge 2200) positioniert LSP als Präzisionshilfe mit folgendem Text:

##### Wörtliche Anleitung

```markdown
Use search/read for ordinary navigation. Use lsp when textual matches are ambiguous or before a change requires precise definitions, implementations, or references. Positions are one-based line and character (UTF-16) at the cursor; an off-symbol position may return no results. findReferences always includes the declaration.
```

#### Token-Effekt

Feste Anleitungskosten bei jeder Anfrage, solange das Plugin aktiv ist.

#### KV-Cache-Effekt

Präfixstabil, solange Plugin-Scope und Anleitungstext unverändert sind; Aktivierung oder dispose kann die Wiederverwendung ab diesem Abschnitt ungültig machen.

### Tool schema

#### Was das Modell sieht

Das Modell sieht das generierte [`lsp`-Schema](../../../docs/tool-catalog.de.md#deepseek-aidsh-tool-lsp).

#### Token-Effekt

Feste Schema-Kosten bei jeder Anfrage, solange aktiviert; das `timeoutMs`-Budget wird nie an das Modell gesendet.

#### KV-Cache-Effekt

Präfixstabil, solange die sichtbare Tool-Definition und -Reihenfolge unverändert sind; Registrierungslebenszyklus oder Scope-Einschränkungen können die Wiederverwendung ab dem ersten geänderten Schema-Token ungültig machen.

### Ergebnisse

#### Was das Modell sieht

Nach Datei gruppierte `path:line:character`-Positionszeilen oder normalisierter Hover-Text, zuerst durch `maxLocations` und dann durch `maxResultChars` begrenzt; Auslassungs- und Kürzungsmarker zählen innerhalb der Gesamtzeichenbegrenzung mit. Diese Begrenzungen betreffen nur die Native-/Modell-Darstellung, nicht den kanonischen Wert. Leere Ergebnisse verwenden die eigenen Zeilen `No results.` / `No hover information.`.

#### Token-Effekt

Pro Tool-Ergebnis durch `maxResultChars` begrenzt, wobei `maxLocations` zusätzlich die Anzahl der Navigationseinträge begrenzt.

#### KV-Cache-Effekt

Tool-Ergebnisse werden hinter dem gecachten Anfragepräfix angehängt und machen es nicht direkt ungültig.

### UI-Darstellung

#### Was das Modell sieht

Nichts. Der Client rendert eine generische Suchkarte — `{ card: 'generic', kind: 'search', title, locations: [{ path, line }] }` — deren aus den args abgeleiteter Titel Operation und 1-basierten Cursor trägt; Follow-along fokussiert die abgefragte Zeile, während der Titel die Spalte erhält.

#### Token-Effekt

Null direkter Token-Effekt, da das Rendering nur clientseitig stattfindet.

#### KV-Cache-Effekt

Keiner; die UI-Darstellung liegt außerhalb der Modellanfrage.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Tool schlecht passt. Sie sind aktuelle Paketbeschränkungen, kein Aufgabenrückstand.

- **UTF-16-Cursor-Koordinaten** — Spalten sind für das Protokoll exakt, aber für ein Modell schwer um Nicht-BMP-Zeichen herum zu zählen; eine Position neben einem Symbol kann leere Ergebnisse liefern, deshalb erklärt der Prompt die Konvention, ohne breite LSP-Nutzung zu empfehlen.
- **Keine serverübergreifende Vollständigkeitszusage** — unterstützte Server können je nach Indexierungsbereitschaft leere oder Teilergebnisse liefern; das Tool verspricht keine Vollständigkeit über Sprachen oder Server hinweg.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
