---
description: "Der Credential-seam für Nutzer und Maintainer, die Credentials auflösen, beschreiben oder speichern — Referenzwerte und dauerhafte Datensätze — ohne Geheimwerte in die Konfiguration zu schreiben."
kind: "package-reference"
---

# @deepseek-ai/dsh-credentials

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-credentials` hält Geheimwerte aus der Konfiguration heraus, indem Settings und `cordis.yml` auf Schlüsselnamen wie `DEEPSEEK_API_KEY` verweisen. Es speichert außerdem dauerhafte Credential-Datensätze pro Plugin, einschließlich Authorization-Grants und Provider-Umgebungswerten. Ein rotierter gespeicherter Schlüssel gilt ab der nächsten Anfrage — ohne Neustart und ohne Konfigurationsänderung. Konfigurations-UIs können melden, ob ein Schlüssel oder Datensatz gesetzt ist, woher er stammt und ob er schreibbar ist, ohne Werte offenzulegen. Leere Schlüsselwerte gelten als nicht vorhanden, während ein leerer Datensatz ein bewusst gespeicherter Credential bleibt.

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

Dieses Paket ist der Teil des Produkts, der Geheimwerte speichert und nachschlägt: Ein Schlüssel wird einmal gespeichert, überall per Name referenziert und kann jederzeit gelesen, geprüft oder entfernt werden. Es hält außerdem dauerhafte Credential-Datensätze, sodass ein Plugin die Credentials, die es für seine eigenen ids besitzt, speichern, aktualisieren und entfernen kann. Die Standardkomposition des Produkts enthält bereits einen Credential-Speicher; eine eigene Komposition lädt das lokale Speicherpaket mit einem Dateipfad.

### Wann es verwendet wird

Verwende einen Credential-Speicher immer dann, wenn die Konfiguration frei von Geheimwerten bleiben muss: Settings-Dateien, die synchronisiert, geteilt oder in einer Konfigurations-UI gerendert werden, oder Teams, die Schlüssel rotieren, ohne die Konfiguration zu bearbeiten. Verwende Datensätze, wenn ein Plugin Credentials ohne eine einzelne Umgebungsvariable halten muss — einen Authorization-Grant aus einem Anmeldefluss oder Provider-Umgebungswerte — und wenn eine Konfigurations-UI auflisten soll, wofür ein Nutzer autorisiert ist. Eine Konfigurations-UI kann anzeigen, ob ein Schlüssel oder Datensatz gesetzt ist, woher er stammt und ob er geändert werden kann — niemals den Wert selbst. Wenn du nur eine feste Umgebungsvariable brauchst, lies diese Variable direkt und verzichte auf den Speicher.

### Zur Komposition hinzufügen

Lade das lokale Speicherpaket mit einem Dokumentpfad:

```yaml
- name: '@deepseek-ai/dsh-credentials-local'
  config:
    path: /absolute/path/to/.credentials.yaml
```

Die README des lokalen Speichers besitzt die vollständige Konfigurationsfläche; der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-credentials-local) ist die erschöpfende Feldliste.

### Schlüssel speichern, prüfen und entfernen

```ts
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'

declare const ctx: Context

const ref = credentialRef('DEEPSEEK_API_KEY')          // POSIX shell identifier, branded
const hit = await ctx.credentials.resolve(ref)         // { value, source } | undefined
const info = await ctx.credentials.describe(ref)       // { configured, source?, writable } — never the value
await ctx.credentials.set(ref, 'sk-…')                 // rejects while a read-only source shadows the ref
await ctx.credentials.unset(ref)                       // no-op when absent; same shadowing rule
```

Speichere einen Schlüssel mit `set`, entferne ihn mit `unset`, prüfe seinen Status mit `describe` und lies den aktuellen Wert mit `resolve`, wenn eine Operation ihn braucht. `describe` meldet, ob der Schlüssel gesetzt ist, woher er stammt und ob er beschrieben werden kann — es gibt niemals den Wert zurück.

### Datensätze speichern, aktualisieren und entfernen

Ein Plugin adressiert jeden Datensatz über `<scope>/<id>` — seinen eigenen registrierten Namen plus eine selbst gewählte id, etwa einen Provider-Routenschlüssel — und liest, verändert oder entfernt, was es besitzt:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'

declare const ctx: Context

const key = credentialKey('llm-pi-ai', 'openai-codex')   // <owner>/<id>, branded
const hit = await ctx.credentials.readRecord(key)        // CredentialRecord | undefined
await ctx.credentials.describeRecord(key)                // { configured, kind?, writable } — never the value
await ctx.credentials.listRecords()                      // [{ key, kind }] — never values
await ctx.credentials.modifyRecord(key, async () => ({ kind: 'grant', payload: { token: '…' } }))
await ctx.credentials.deleteRecord(key)                  // no-op when absent
```

`modifyRecord` ist der einzige Schreibpfad: Es übergibt deiner Mutation den Datensatz so, wie er in dem Moment steht, in dem der Schreibzugriff exklusiv ist; die Rückgabe von `undefined` lässt den Eintrag unverändert. Datensätze haben keine Leerwert-Regel — ein Datensatz, der weder einen Schlüssel noch Umgebungswerte trägt, drückt aus, dass sein Besitzer die Umgebungsauthentifizierung bestätigt hat — und eine Konfigurations-UI kann jeden Datensatz aufzählen, um anzuzeigen, wofür du autorisiert bist, und Datensätze zu finden, die ein entferntes Plugin zurückgelassen hat.

### Einen Schlüssel in der Konfiguration verwenden

Ein Settings-Abschnitt oder ein `cordis.yml`-Eintrag nennt einen Schlüssel, statt ihn zu enthalten — ein LLM-Adapter zum Beispiel akzeptiert `apiKeyEnv`:

```yaml
apiKeyEnv: DEEPSEEK_API_KEY
```

Anfragen, die den Schlüssel brauchen, verwenden seinen aktuell gespeicherten Wert, sodass eine Rotation des Schlüssels bereits bei der nächsten Anfrage wirkt — ohne Neustart und ohne Konfigurationsänderung.

### Was schiefgehen kann

- **Ein von der Startumgebung gelieferter Schlüssel kann nicht überschrieben werden** — `DEEPSEEK_API_KEY=… dsh` (oder ein CI-Secret, ein Container-`-e`) gewinnt für diesen Lauf und wird als schreibgeschützt gemeldet; lösche die Variable in der startenden Shell, bevor du einen anderen Wert speicherst.
- **Ein leerer Wert kann nicht gespeichert werden** — das Speichern eines leeren Strings wird abgelehnt; entferne den Schlüssel stattdessen.
- **Schlüsselwerte erscheinen niemals in Konfigurations-UIs oder Diagnosen** — die UI zeigt, ob ein Schlüssel gesetzt ist, woher er stammt und ob er geändert werden kann; der Wert selbst bleibt im Speicher.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt die Designentscheidungen hinter dem Paket und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Designphilosophie

Eine Leitlinie und vier Konsequenzen:

- **Die Konfiguration trägt Referenzen, niemals Geheimnisse.** Ein Settings-Abschnitt oder `cordis.yml`-Eintrag nennt einen Credential; der Wert hinter der Referenz liegt bei einem Provider. Das Settings-Dokument bleibt sicher zu synchronisieren und zu rendern, `describe()` antwortet, ohne einen Wert zu halten, und das Rotieren eines Geheimnisses berührt keine Konfigurationsdatei.
- **Consumer lösen pro Operation auf.** Die Auflösung ist ein Lesevorgang pro Aufruf ohne operationsübergreifenden Cache; dieser Lesevorgang ist der Hot-Update-Mechanismus.
- **Ein leerer gespeicherter Wert ist nicht vorhanden.** `resolve` überspringt ihn, `describe` meldet ihn als nicht konfiguriert — eine Leerstelle kann sich niemals als konfiguriertes Geheimnis ausgeben.
- **Datensätze sind dauerhaft, und das Vorhandensein ist die Tatsache.** Ein Datensatz wird pro `<scope>/<id>` gespeichert und überlebt Neustarts; die Leerwert-Regel gilt nicht, sodass ein `api-key`-Datensatz ohne Schlüssel und Umgebungswerte eine bewusste Aussage ist, keine Leerstelle.
- **Listener-Fehler bleiben eingedämmt.** `notifyUpdated` verteilt `credentials/reference-updated` so, dass jeder Listener läuft; ein synchroner Throw oder eine asynchrone Ablehnung wird geloggt, ohne das Ergebnis der committeten Operation zu ändern — mit Ausnahme von `INVARIANT`-codierten Fehlern, die nach dem Lauf aller Listener erneut geworfen werden.

### Das credentials/reference-updated-Ereignis

`credentials/reference-updated (ref)` feuert nach einer committeten Änderung an einer provider-verwalteten Quelle — ein `set`, ein `unset` oder eine im Speicher beobachtete externe Änderung. Änderungen an der Prozessumgebung sind nicht beobachtbar und feuern nie. Consumer brauchen das Ereignis nicht (sie lösen pro Operation erneut auf); es existiert für Konfigurations-UIs, die ein „konfiguriert“-Badge aktualisieren.

`credentials/record-updated (key)` feuert nach einer committeten Änderung an einem gespeicherten Datensatz — ein schreibendes `modifyRecord`, ein entfernendes `deleteRecord` oder eine im Speicher beobachtete externe Änderung. Es bleibt ein eigenes Ereignis, weil die beiden Schlüsselgrammatiken disjunkt sind: Ein Listener, der beide Räume auf einem Ereignis empfinge, könnte nicht erkennen, zu welchem ein Subjekt gehört.

### Schreib- und Lesepfade für Datensätze

`modifyRecord` ist der einzige Schreibpfad für Datensätze, weil ein korrekter Schreibvorgang vom aktuellen Wert abhängt: Ein Token-Refresh ist Lesen–Entscheiden–Ersetzen, und die Mutation sieht den Datensatz so, wie er in dem Moment steht, in dem der Schreibzugriff exklusiv ist — die Rückgabe von `undefined` lässt den Eintrag unverändert. Die Exklusivität gilt über Prozesse hinweg, wo der zugrunde liegende Speicher sie unterstützt; genau das verhindert, dass zwei Prozesse, die dasselbe Refresh-Token rotieren, das zuerst geschriebene verlieren. Lesevorgänge spiegeln die Referenzseite, schichten aber nie: Nichts kann einen Datensatz verdecken, und ein `grant`-Payload wird genau so zurückgegeben, wie sein Besitzer ihn geschrieben hat, weil nur das besitzende Plugin ihn interpretieren kann.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Service Definition: die `credentialRef`/`credentialKey`-Brands, `ResolvedCredential`/`CredentialRecordInfo`, der abstrakte Provider über beide Schlüsselräume, eingedämmtes Fan-out |
| [`src/types.ts`](src/types.ts) | Client-sichere Typfläche: die `CredentialRef`- und `CredentialKey`-Brands, die Datensatz-Union, die `CredentialInfo`-Referenzansicht, die `credentials/reference-updated`- und `credentials/record-updated`-Deklarationen |
| [`src/invariant.ts`](src/invariant.ts) | Invariant-Begleiter: `credentials/reference-updated` feuert nur, solange ein Credentials-Service lebt |

### Client-sichere Typen

Der `./types`-Subpath-Export hält die Ereignisdeklarationen zusammen mit den `CredentialRef`- und `CredentialKey`-Brands, der Datensatz-Union, die sie benennen, und der `CredentialInfo`-Referenzansicht, die eine Konfigurationsfläche liest; der Paketstamm re-exportiert sie. Ein Consumer außerhalb der Host-Kompilierungsfläche liest daher genau die Signatur, die der Host emittiert, statt sie erneut zu formulieren.

### Lebenszyklus

Der Service ist ein vom Provider registrierter Cordis `Service`: Das Disposen des mountenden fiber entfernt `ctx.credentials`. Der Invariant-Begleiter prüft, dass `credentials/reference-updated` niemals ohne lebenden Service feuert — eine Emission nach dem Dispose bedeutet, dass ein Provider Arbeit über seine Teardown-Quiescence hinaus durchsickern ließ.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der Paketvertrag nicht ausreicht. Sie führen vom gemeinsamen Subsystem-Vokabular zum ausgelieferten Speicher und zur Capability-Architektur.

- [Credentials-Subsystem-Referenz](../../../docs/subsystems/credentials.de.md) — `CredentialRef`/`CredentialKey`, Auflösung pro Operation, UI-sichere Informationen, Provider-Schichten und die generierte cordis-Fläche.
- [Lokaler Credential-Speicher](../credentials-local/README.de.md) — der Standard-On-Machine-Speicher: wo Schlüssel und Datensätze liegen und wie die Umgebungsschichten rangieren.
- [Capability-seams](../../../docs/capability-seams.de.md) — die Service Definition / Service Provider / Consumer-Aufteilung, der dieses Paket folgt.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über den konsumierenden Adapter, der jede Credential-Referenz auflöst und jede modellseitige Verwendung besitzt, die ein Wert autorisiert.

#### KV-Cache-Effekt

Keine direkte Invalidierung; aufgelöste Werte gelangen niemals in ein Anfragepräfix.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann dieses Paket schlecht passt oder besondere Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgabenrückstand.

- **Referenzen haben keine Aufzählung** — der seam beantwortet Fragen zu Referenzen, die er bekommt; Konfigurationsflächen erfahren sie aus Settings-Schemas, sodass ein `list()` über diese Hälfte keinen aktuellen Consumer hat. Datensätze können aufgezählt werden, weil es kein Schema gibt, aus dem sie entdeckt werden könnten.
- **Referenzen sind umgebungsvariablenförmig** — ein flacher POSIX-Bezeichner-Namensraum, weil eine Referenz zugleich der Umgebungsname ist, über den sie aufgelöst wird. Datensätze tragen die reichere `<owner>/<id>`-Adressierung.
- **Änderungen an der Prozessumgebung sind unsichtbar** — für eine in der startenden Shell geänderte Variable kann keine Benachrichtigung feuern; eine UI liest `describe()` nur bei eigener Navigation erneut.
- **Der Besitzer eines Datensatzes ist sein scope, und nichts verifiziert, dass der scope gemountet ist** — der seam speichert, was ihm gegeben wird, und meldet, was er speichert; einen verwaisten Datensatz zu erkennen ist das Join des Aufrufers zwischen `listRecords()` und der Registry, die diesen scope besitzt — der seam hat keine eigene Registry, gegen die er prüfen könnte.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und unentschiedene Richtungen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten und Grenzen stehen in den Abschnitten oben und im Paketcode.

Die seam-Form lässt Raum für Keyring-, Helper-Command- und KMS-basierte Provider; ein entfernter Settings-Provider muss niemals Geheimnisse tragen. Keiner davon wird ausgeliefert, und kein aktueller Consumer benötigt einen.

</details>
