---
description: "Der LSP-Capability-Seam (ctx.lsp): Provider-Auswahl nach Dateiendung, vier normalisierte Code-Navigation-Operationen und strukturierte Fehler — für Benutzer und Maintainer, die Code-Navigation zusammensetzen oder erweitern."
kind: "package-reference"
---

# @deepseek-ai/dsh-lsp

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Verwende `dsh-lsp`, um Agenten Language-Server-Navigation für Definitionen, Referenzen, Implementierungen und Hover-Dokumentation zu geben. Queries wählen den konfigurierten Provider anhand der Dateiendung und liefern normalisierte Ergebnisse mit strukturierten Fehlern, sodass ein Backend-Wechsel weder die Navigationsanfrage noch die modellsichtbare Antwort verändert. Die Navigation ist read-only und schließt bewusst generischen JSON-RPC-Zugriff, Rename, Formatierung, Diagnostics und Symbol-Listen aus. Dieses Paket muss mit einem Provider wie `dsh-lsp-stdio` und dem modellseitigen `dsh-tool-lsp` kombiniert werden; allein bietet es keine Navigation.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Mounte einen Language-Server-Provider und das `lsp`-Tool, um Agenten semantikbasierte Code-Navigation zu geben, die Textsuche nicht zuverlässig liefern kann — gleichnamige Funktionen unterscheiden, Import-Aliasen folgen, ein Interface mit seinen Implementierungen verbinden oder inferierte Typen lesen. Dieses Paket ist der Service, bei dem sich jene Pakete registrieren; es definiert selbst keine UI, kein Tool und keinen Provider.

### Wann es zu wählen ist

Wähle diesen Service, wenn ein Deployment modellsichtbare Code-Navigation auf Basis von Language Servern will. Er deckt read-only-Navigation ab — Definitionen, Referenzen, Implementierungen und Hover — und lässt bewusst Mutationen (Rename, Code Actions, Formatierung), Symbol-Listen und Diagnostics weg. Der Service ist provider-neutral: lokale Stdio-Server, Remote-Server und sandbox-native Provider registrieren sich auf dieselbe Weise, sodass ein Backend-Wechsel weder ändert, was das Modell sieht, noch, wie es fragt.

### Einen Navigations-Stack komponieren

Der Seam braucht einen Provider und einen Consumer, um etwas zu tun. Eine minimale Komposition mountet den Service, einen Stdio-Provider und das Tool:

```yaml
- name: '@deepseek-ai/dsh-fs-local'
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-lsp'
- name: '@deepseek-ai/dsh-lsp-stdio'
- name: '@deepseek-ai/dsh-tool-lsp'
```

Server-Kommandos, Extension-Mappings und die Filesystem/Subprocess-Paarung werden in den Provider- und Tool-Paketen konfiguriert; siehe [dsh-lsp-stdio](../lsp-stdio/README.de.md) und [dsh-tool-lsp](../tool-lsp/README.de.md).

### Die vier Operationen

Jede Query stellt eine von vier semantischen Fragen an einer Cursorposition in einer Quelldatei; Ergebnisse sind normalisierte Locations oder Hover-Inhalte, niemals rohe Protokoll-Payloads.

| Operation | Was der Agent erhält |
|---|---|
| `goToDefinition` | Die Deklarationsstelle(n) des Symbols am Cursor |
| `findReferences` | Jede Referenz, immer einschließlich der Deklaration |
| `goToImplementation` | Die konkrete(n) Implementierungsstelle(n) |
| `hover` | Normalisierte Dokumentation zum Symbol oder keine |

`findReferences` schließt Deklarationen immer ein, sodass eine Impact-Analyse die definierende Stelle nie verliert. Positionen sind auf dem Wire zero-based UTF-16; das modellseitige Tool akzeptiert one-based Cursor-Koordinaten und konvertiert sie.

### Fehler und Recovery

Eine Query schlägt mit dem strukturierten Fehler `LSP_UNAVAILABLE` fehl, wenn kein registrierter Provider die Dateiendung behandelt — füge einen Provider für diese Extension hinzu oder frage eine unterstützte Datei ab. Ungültige oder konfligierende Provider-Registrierungen schlagen mit `LSP_INVALID_PROVIDER` oder `LSP_CONFLICT` fehl, bevor irgendeine Route veröffentlicht wird, und eine Query gegen einen disposed Provider schlägt mit `LSP_DISPOSED` fehl. Consumer fangen `LspError` und routen über dessen stabilen `code`; über das Tool erscheinen diese als Fehler-Ergebnisse, die das Modell lesen kann.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Seam und wo der Code sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Designphilosophie

- **Capability-Seam, Rolle Service Definition.** Das Paket besitzt `ctx.lsp` und die Provider-Registry; Provider registrieren Capabilities, keine Tools, und `dsh-tool-lsp` ist der einzige Owner der modellseitigen Oberfläche.
- **Atomare Registrierung.** `registerProvider()` validiert und konfliktprüft alles vor der Mutation: Eine ungültige oder konfligierende Registrierung veröffentlicht nichts, und ihr Disposer gibt die id und jede Extension-Reservierung gemeinsam frei.
- **Reihenfolgeunabhängige Auswahl.** `query()` routet über die letzte Extension der Datei, normalisiert zur Kleinbuchstabenform mit führendem Punkt; Registrierungs- und HMR-Reihenfolge ändern das Routing nie. Die language id synchronisiert nur das transiente Dokument und beteiligt sich nie an der Auswahl.
- **Geschlossenes Vokabular.** Die Union der vier Operationen ist geschlossen — das Hinzufügen einer Operation ist ein compile-erzwungener Umbau über Seam, Provider und Tool hinweg. Es gibt keinen JSON-RPC-Fluchtweg, und jedes Request-Feld ist erforderlich, sodass es keinen `resolve()`-Schritt gibt.
- **Provider-eigene Workspace-Koordinate.** Location-Ergebnisse tragen die kanonische Workspace-URI des Providers, sodass Consumer Datei-URIs im Namespace der Execution-World relativieren statt Host-Plattform-Pfadregeln anzuwenden.

### Source Map

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin-Einstieg: `Lsp`-Service, `registerProvider`/`query`, `finalExtension`, `LspError`-Codes |
| [`src/types.ts`](src/types.ts) | Seam-Vokabular: Request-, Result-, Provider- und Service-Verträge |
| [`src/brand.ts`](src/brand.ts) | `LspProviderId` Branded-ID-Typ und Factory |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; Provider-IDs und Extension-Routen sind privater, atomar aktualisierter Zustand; der Seam bietet weder einen enumerierbaren Snapshot noch Lifecycle-Events, die unabhängig verglichen werden könnten. |

### Registrierungs- und Auswahl-Lifecycle

Registrierung und Disposal laufen über `ctx.effect()`, sodass Provider-Routen mit der registrierenden Fiber leben und sterben. `finalExtension()` splittet an beiden Pfadtrennern und liefert `''` für Namen ohne Extension oder Dotfiles mit führendem Punkt, die keine Route matcht. `LspError` erweitert `HarnessError` um stabile Codes (`LSP_INVALID_PROVIDER`, `LSP_CONFLICT`, `LSP_UNAVAILABLE`, `LSP_DISPOSED`, `LSP_UNSUPPORTED_OPERATION`, `LSP_MALFORMED_RESPONSE`), auf die Aufrufer routen, statt `message` zu parsen.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paket-Vertrag nicht ausreicht. Sie führen vom gemeinsamen Navigationsmodell zum Provider und zum Tool.

- [LSP-Navigations-Subsystem](../../../docs/subsystems/lsp.de.md) — Operationen, Koordinaten, Requests und Results sowie `LspError`-Codes.
- [dsh-lsp-stdio](../lsp-stdio/README.de.md) — der Stdio-Provider, der sich an diesem Seam registriert.
- [dsh-tool-lsp](../tool-lsp/README.de.md) — das modellseitige Tool über diesem Seam.
- [lsp-Gruppenkarte](../README.de.md) — die Drei-Pakete-Familie und ihre zugehörige Dokumentation.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über `dsh-tool-lsp`, das die modellseitige `lsp`-Schema, Prompt-Guidance und gerenderte Ergebnisse besitzt, während diese Registry selbst weder Prompt noch Schema beisteuert.

#### KV-Cache-Effekt

Keine direkte Invalidierung; `dsh-tool-lsp` besitzt Änderungen am Request-Präfix.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren den aktuellen Umfang des Seam. Sie sind Paket-Constraints, kein Aufgabenrückstand.

- **Exklusiver Extension-Besitz innerhalb einer Runtime** — zwei Provider können nicht beide `.ts` beanspruchen, auch nicht mit unterschiedlichen language ids; Überlappungen lassen die Registrierung fehlschlagen. Ein deployment-konfigurierter Selector oberhalb der Registrierungen ist die vorgesehene Erweiterung, die exklusive Reservierung lockern kann, ohne dem Modell-Input eine Provider-Wahl hinzuzufügen.
- **Nur vier read-only-Operationen** — Symbole und Call Hierarchy sind zurückgestellt, weil sie andere Schemas brauchen; Diagnostics benötigen eigene Freshness- und Akkumulationsregeln; Mutationen (Rename, Code Actions, Formatierung) erfordern eigene Tools mit Preview-, Permission- und Write-Policy-Integration.
- **Keine Observation-API** — Verfügbarkeit wird nur beobachtet, indem `query()` ausgeführt und die geworfenen `LspError`-Codes geroutet werden; es gibt kein Provider-Change-Event und keine Capability-Status-Abfrage.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
