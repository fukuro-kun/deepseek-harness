---
description: "Der dateigestützte Credentials-Provider für Nutzer und Maintainer, die den lokalen Credential-Store und seine Umgebungs-Schichtung auswählen, konfigurieren oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-credentials-local

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-credentials-local` hält API-Schlüssel und andere Geheimnisse in einer privaten Datei unter Ihrem Harness-Home. Sie können Credentials über die Konfigurations-UI speichern oder die Datei direkt bearbeiten; Änderungen laden automatisch neu und gespeicherte Werte überstehen Neustarts. Die Credential-Auflösung folgt einer festen Rangfolge: Die Start-Umgebung gewinnt, gefolgt von der gespeicherten Datei, der `.env` des Projekts und der `.env` des Harness-Home; ein neu gespeicherter Wert überschreibt sofort ältere `.env`-Werte. Nur Ihr OS-Benutzer kann die Datei lesen, aber Agent-Tool-Prozesse laufen als derselbe Benutzer, sodass dieser Store Geheimnisse nicht vom Agenten isolieren kann.

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

Dieses Paket gibt einer Komposition einen lokalen Credential-Store: API-Schlüssel und andere Geheimnisse einmal speichern, und jeder Request, der sie benennt, verwendet sie. Der übliche Pfad ist explizit: Den Store laden, Schlüssel über die Konfigurations-UI oder `ctx.credentials` speichern und das Produkt sie bei Bedarf auflösen lassen.

### Wann es verwenden

Verwenden Sie es als Standard-Local-Store: Die Basis-Komposition des Produkts lädt es, und ein über die Konfigurations-UI gespeicherter Schlüssel wirkt sofort. Wählen Sie einen anderen Store, wenn ein Deployment Provider-Schlüssel vom eigenen Agenten fernhalten muss — Dateiberechtigungen können das nicht leisten, weil die Tool-Prozesse des Agenten als Ihr OS-Benutzer laufen (siehe „Wer kann die Datei lesen").

### Einrichtung

```yaml
- name: '@deepseek-ai/dsh-credentials-local'
  config:
    path: /absolute/path/to/.credentials.yaml
```

| Feld | Standard | Bedeutung |
|---|---|---|
| `path` | `<harness home>/.credentials.yaml` | Wo die Credential-Datei liegt |
| `dshHome` | `$DSH_HOME` oder `~/.dsh` | Verwendetes Harness-Home, wenn `path` fehlt |
| `watch` | `true` | Die Datei bei Änderung auf der Platte automatisch neu laden |
| `debounceMs` | `100` | So lange nach einer Änderung warten, bevor neu geladen wird, in Millisekunden |

Der generierte [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-credentials-local) ist die erschöpfende Quelle für jedes akzeptierte Feld und sein JSDoc.

### Schlüssel speichern und entfernen

Speichern Sie einen Schlüssel mit `set`, entfernen Sie ihn mit `unset` und prüfen Sie mit `describe`, ob ein Schlüssel konfiguriert ist — dieselben Operationen, die die Credential-API bereitstellt:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'

declare const ctx: Context

const ref = credentialRef('DEEPSEEK_API_KEY')
await ctx.credentials.set(ref, 'sk-…')          // save
await ctx.credentials.describe(ref)             // { configured, source?, writable } — never the value
await ctx.credentials.unset(ref)                // remove
```

Ein gespeicherter Schlüssel ist für den nächsten Request verwendbar, der ihn benennt, und `describe` meldet, ob er gesetzt ist, woher er kommt und ob Sie schreiben können — niemals den Wert selbst. Records persistieren in derselben Datei, adressiert über `<owner>/<id>` und verwaltet mit den Record-Operationen der Seam (`readRecord`, `describeRecord`, `listRecords`, `modifyRecord`, `deleteRecord`).

### Woher Schlüssel kommen

Schlüssel werden in einer festen Reihenfolge aufgelöst — die erste Stelle mit einem Wert gewinnt:

| Stelle | Schreibbar? | Gewinnt über |
|---|---|---|
| Die Umgebung, in der Sie gestartet haben (`DEEPSEEK_API_KEY=… dsh`) | nein | alles |
| Die gespeicherte Datei | ja (`set`/`unset`) | beide `.env`-Dateien |
| Die `.env` Ihres Projekts (`<invocation cwd>/.env`) | nicht hier | Ihre Home-`.env` |
| Ihre Home-`.env` (`$DSH_HOME/.env`) | nicht hier | nichts |

Die Start-Umgebung gewinnt, weil ein pro-Lauf-Override — `DEEPSEEK_API_KEY=… dsh`, ein CI-Geheimnis, ein Container `-e` — die explizite Absicht dieses Laufs ist; sie kann nicht aus dem Produkt heraus bearbeitet werden, wird also als schreibgeschützt gemeldet und Schreibzugriffe werden verweigert. Alles andere verliert gegen die gespeicherte Datei, weshalb ein gespeicherter Schlüssel sofort wirkt, selbst wenn ein älterer Schlüssel in einer `.env` liegt; diese beiden `.env`-Schichten lösen auf, wenn nichts gespeichert ist. Die Umgebungs-Schicht ist der beim Start aufgenommene Snapshot des Launchers ([Environment-Snapshot](../../util/launch-environment/README.de.md)), sodass eine nach dem Start exportierte Variable nicht gesehen wird.

### Die Credential-Datei

Ein versioniertes YAML-Dokument mit einem Abschnitt pro Schlüsselraum und sonst nichts:

```yaml
version: 1

refs:
  DEEPSEEK_API_KEY: sk-…
  OPENAI_API_KEY: sk-…

records:
  llm-pi-ai/openai-codex:
    kind: grant
    payload:                    # written verbatim; this provider does not interpret it
      type: oauth
      access: eyJhbGciOi…
      refresh: rft_9f8e7d…
      expires: 1786000000000
  llm-pi-ai/amazon-bedrock:
    kind: api-key               # environment values, no key: this route uses an AWS profile
    env:
      AWS_PROFILE: prod
  llm-pi-ai/amazon-bedrock-dev:
    kind: api-key               # neither: the owner confirmed the ambient credential chain
```

Sie können die Datei direkt bearbeiten — der Store lädt sie automatisch neu und übernimmt die Änderung, einschließlich eines von Ihnen gelöschten Schlüssels oder Records. `refs` hält Schlüsselwerte unter dem Namen der Umgebungsvariable; `records` hält Plugin-Credentials unter `<owner>/<id>`, jeweils als `api-key` oder `grant` getaggt, deren Grant-Payload der Store wörtlich bewahrt, weil nur sein Owner sie interpretieren kann. Kommentare und die Formatierung unberührter Einträge überleben Produkt-Schreibzugriffe; ein Kommentar direkt über einem Eintrag ist die Notiz dieses Eintrags und wird mit ihm entfernt. Die Datei hält nur Credentials, also wird alles andere laut abgelehnt statt still ignoriert: Ein nicht-Mapping-Root, ein unbekannter Top-Level-Key, ein in seinem Raum nicht adressierbarer Key, ein falsch typisierter oder leerer Wert, ein unbekanntes Record-Tag oder -Feld, doppelte Keys und fehlerhaftes YAML scheitern alle beim Start, und bei einem Live-Reload bedient der letzte gute Inhalt weiter mit einer Warnung.

Der Wert eines Schlüssels kann beliebiger Text sein, einschließlich mehrzeiliger Werte — keine Quoting-Tricks nötig. Ein leerer Wert bedeutet „kein Schlüssel", weshalb ein leerer String in der Datei zurückgewiesen wird: Einen Schlüssel entfernen löscht ihn, er wird nicht geleert. Ein `grant`-Payload muss einen JSON-Roundtrip überstehen, erzwungen beim Hinein- und Herausschreiben, sodass der Store einen Wert ablehnt, den er nicht exakt wie geschrieben zurücklesen könnte. Lässt sich die Datei auf der Platte nicht mehr parsen, scheitert das Speichern, statt Inhalt zu überschreiben, den das Produkt nicht lesen könnte.

### Wer kann die Datei lesen

Nur Ihr OS-Benutzer kann die Datei lesen: Das Produkt legt sie mit Owner-only-Berechtigungen an und verweigert unter POSIX das Laden einer Datei, die ein anderer Benutzer lesen kann — der Fehler weist auf `chmod 600` hin. Windows hat keinen zu prüfenden Mode, daher wird die Prüfung dort übersprungen statt vorgetäuscht. Der Agent ist kein anderer Benutzer: Seine Tool-Prozesse laufen als Sie und können die Datei lesen wie jede andere Datei, die Ihnen gehört. Das Produkt gibt dem Agenten niemals den Pfad der Datei und lädt die Datei niemals in die Umgebung, sodass das Erreichen eines Werts ein bewusstes Lesen eines Pfads erfordert, der dem Agenten nicht gegeben wurde. Das ist Umsicht, keine Grenze: Ein Deployment, das Provider-Schlüssel vom eigenen Agenten fernhalten muss, kommt mit Dateiberechtigungen nicht ans Ziel.

### Was schiefgehen kann

- **Ein Schlüssel aus der Start-Umgebung ist schreibgeschützt** — `DEEPSEEK_API_KEY=… dsh` gewinnt für diesen Lauf; Speichern oder Entfernen wird verweigert. Löschen Sie die Variable zuerst in der startenden Shell.
- **Ein leerer Wert kann nicht gespeichert werden** — Einen leeren String zu speichern wird verweigert; entfernen Sie den Schlüssel stattdessen.
- **Der Store verweigert eine Datei, der er nicht trauen kann** — Eine Datei, die ein anderer Benutzer lesen kann, fehlerhaftes YAML oder ein unerreichbarer Pfad scheitert beim Start; bei einem Live-Reload bedient der letzte gute Inhalt weiter mit einer Warnung.
- **Gleichzeitige Änderungen werden beide behalten** — Wenn Sie die Datei bearbeiten, während das Produkt schreibt, wird Ihre Änderung eingefaltet statt überschrieben.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt die Design-Entscheidungen hinter dem Provider und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig behandelt.

### Design-Philosophie

- **Eine ehrliche Rangfolge.** Die geerbte Umgebung gewinnt, weil sie die explizite Absicht dieses Laufs ist und nicht von innen bearbeitet werden kann; alles darunter verliert gegen den verwalteten Store, sodass ein gespeicherter Schlüssel nie von einer veralteten `.env` verdrängt wird.
- **Das Dokument hält nur Credentials.** Ein versioniertes Dokument mit `refs`- und `records`-Abschnitten statt einer Dotenv-Datei: Ein Store, den der Harness besitzt und der nie in die Umgebung materialisiert wird, kann nicht zugleich als Umgebungs-Schicht des Nutzers dienen, die nicht-geheime Einträge hinter ihrer Rangfolge verdecken würde.
- **Schreibzugriffe patchen, Reloads ersetzen.** Zeilen-Edits bewahren Kommentare und unberührte Einträge unter dem prozessübergreifenden Writer-Lock; Reloads tauschen den geparsten Snapshot vollständig aus, sodass ein gelöschter Eintrag nie im Speicher verweilt.
- **Laut fehlschlagen, wo Vertrauen auf dem Spiel steht.** Boot und Reload weisen ein Dokument zurück, das unlesbar, ungültig oder über seinen Owner hinaus lesbar ist; ein fehlschlagender Live-Reload behält den letzten guten Snapshot und warnt, statt den Prozess abzuschießen.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Provider: Schicht-Auflösung, striktes Dokument-Parsen, Referenz- und Record-Schreibpfade unter dem Writer-Lock, Watcher-Lifecycle, Berechtigungsprüfung |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; der Service-Definition-Begleiter (`dsh-credentials/invariant`) besitzt den `credentials/reference-updated`-Lifecycle-Vertrag; die Datei-/Umgebungs-Schichtung dieses Providers ist asynchrones I/O, das von seiner Unit-Suite abgesichert wird. |

### Auflösungs- und Schreibpfade

`resolve` und `describe` lesen den geerbten Umgebungs-Snapshot, den geparsten Dokument-Snapshot und die `.env`-Fallbacks in Rangfolge. `set`/`unset` reihen sich in eine exklusive Operationskette ein: Eingangsprüfungen lehnen früh ab (disposed, leerer Wert, umgebungsverdeckt), und die Warteschlange beurteilt sie zur Laufzeit erneut, bevor ein Read-Modify-Write unter dem Writer-Lock committet und `credentials/reference-updated` exakt einmal auslöst.

`modifyRecord` läuft auf derselben Kette und demselben Lock: Es liest das Dokument neu, zeigt der Mutation den Record im aktuellen Stand, lässt das Ergebnis zu — ein nicht-leerer API-Key, ein Grant-Payload, der einen JSON-Roundtrip übersteht —, rendert den Record vollständig und committet, wobei `credentials/record-updated` einmal ausgelöst wird. Eine Komposition, die das Produkt-CLI nicht gebootet hat, hat nur die geerbte Umgebung als ihre Schicht.

### Reload-Lifecycle

Ein Watcher-Event oder der Ready-Abgleich reiht einen Refresh hinter derselben Kette ein. `reconcileFromDisk` prüft Berechtigungen erneut, liest den Text neu, ersetzt beide Snapshots vollständig, wenn der Text abweicht, und publiziert ein Event pro geänderter Referenz oder Record; Inhalt gleich dem Text-Cache — einschließlich der eigenen Schreibzugriffe des Providers — ist ein No-op. Disposal setzt das Closed-Flag, nimmt keine Events mehr an, schließt den Watcher und wartet eingereihte Operationen ab, sodass nach dem Teardown nichts mehr publiziert wird.

### Dokumentversionierung

Das Dokument trägt `version: 1`, bei jedem Schreiben gestempelt. Ein Boot, der das Pre-Release-Flat-Layout erkennt — ein nacktes Mapping von Referenznamen ohne `version` —, aktualisiert das Dokument in-place unter dem Writer-Lock und verschachtelt die ursprünglichen Zeilen unter `refs:`, sodass Werte, Kommentare und Schreibweisen Byte für Byte überleben; jede andere unversionierte Form wird namentlich abgelehnt statt als leerer Store gelesen. Ein Live-Reload migriert nie: Ein mitten im Lauf wiederhergestelltes Flat-Dokument behält den letzten guten Snapshot bis zum nächsten Boot.

### Diagnosen zitieren niemals einen Wert

Die eigene Meldung des YAML-Parsers zitiert die beanstandete Quellzeile, die in diesem Dokument das Geheimnis selbst ist. Jede Diagnose trägt daher nur Fehlercode und Position — ein Schlüsselname ist sicher zu drucken, ein Wert nicht.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Provider-Vertrag nicht ausreicht. Sie führen vom Seam-Vertrag zum Umgebungs-Snapshot, dem Atomic-Write-Primitiv und den Boot-Zeit-Umgebungsschichten.

- [Credential-Reference-Seam](../credentials/README.de.md) — `resolve`, `describe`, `set`, `unset`, die Record-Operationen und die Update-Events der Seam.
- [Credentials-Subsystem-Referenz](../../../docs/subsystems/credentials.de.md) — `CredentialRef`, Auflösung pro Operation, UI-sicheres `CredentialInfo`, Provider-Schichten.
- [Launch-Environment-Snapshot](../../util/launch-environment/README.de.md) — der eingefrorene Schicht-Snapshot, den die Auflösung statt `process.env` liest.
- [Atomic Write](../../util/atomic-write/README.de.md) — das Writer-Lock und der atomare Austausch, den jeder Schreibvorgang nutzt.
- [App-Boot und Harness-Home-Schichten](../../boot/app-boot/README.de.md) — wie das Produkt-CLI `.env` in den Snapshot und `process.env` lädt.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über die Consumer von `ctx.credentials`, die jedes modellseitige Verhalten besitzen, das ein gespeicherter Wert ermöglicht.

#### KV-Cache-Effekt

Keine direkte Invalidierung; gespeicherte Werte treten nie in ein Request-Präfix ein.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann der Provider ungeeignet ist oder besondere betriebliche Sorgfalt erfordert. Sie sind aktuelle Paket-Einschränkungen, kein Aufgabenstapel.

- **Gleichzeitige Schreibzugriffe auf dieselbe Referenz sind Last-Write-Wins** — das Writer-Lock und Read-Modify-Write verhindern, dass gleichzeitige Schreiber einander Einträge verlieren, aber zwei Schreiber, die eine Referenz bearbeiten, lösen sich immer noch zum späteren Schreiben auf; es gibt keine Revisionsprüfung.
- **Ein Same-UID-Prozess kann das Dokument lesen** — die File-Effect-Sandbox-Modi verweigern Lesen nicht, und ein OS-Keychain-Provider ist zurückgestellt.
- **Umgebungsänderungen sind unsichtbar** — der Snapshot ist beim Start eingefroren, sodass eine nach dem Start exportierte Variable weder die Auflösung noch `describe` erreicht; ein Umgebungs-Credential zu ändern erfordert einen Neustart.
- **Atomar, nicht absturz-dauerhaft** — geerbt von `dsh-atomic-write`; der Store liest beim Boot neu.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: offene Fragen und unentschiedene Richtungen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten und Grenzen leben in den Abschnitten oben und im Paket-Code.

Ein OS-Keychain-Provider — ein Store, den die Prozesse des Modells nicht lesen können — ist die zurückgestellte Antwort auf die Same-UID-Einschränkung und gehört neben diesen Provider als Geschwisterpaket. Die Seam-Form lässt auch Raum für Helper-Command- und KMS-gestützte Provider; keiner wird ausgeliefert.

</details>
