---
description: "Das Read-before-Edit-Filesystem-Policy-Plugin für Deployments und Maintainer, die abgesichertes Write- und Edit-Verhalten wählen oder debuggen."
kind: "package-reference"
---

# @deepseek-ai/dsh-fs-observation-policy

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-fs-observation-policy` verlangt von Filesystem-Tools, dass ein agent eine Datei liest, bevor er sie überschreibt oder editiert. Es lehnt außerdem eine Mutation ab, wenn die Datei seit diesem Read geändert wurde, und liefert eine klare Anweisung zum erneuten Lesen und Wiederholen. Das Lesen eines fehlenden Pfads autorisiert eine guarded Creation, während nebenläufige Creation weiterhin geschützt bleibt. Wähle es für Deployments, die Read-before-Write-Sicherheit wollen; resumed Sessions müssen Ziele erneut lesen, weil Observations nicht persistiert werden.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Modell-Erfahrung](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeiten](#known-limitations-and-deferred-work)
- [Dev-Notiz](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Lade dieses Plugin zusammen mit einem `ctx.fs`-Backend und den `dsh-tool-fs`-Tools, wenn ein Deployment vom Modell verlangen soll, eine Datei zu lesen, bevor es sie überschreiben oder editieren kann. Das Plugin braucht keine Konfiguration und injiziert keinen Service; es lauscht nur auf die `fs/*`-Events, die die Tools dispatchen.

### Minimale Komposition

Lade ein Backend, dann dieses Plugin, dann die Tools. Der Policy-Listener sollte der erste registrierte Entscheider auf den `fs/*`-Intent-Slots sein.

```yaml
- name: '@deepseek-ai/dsh-fs-local'
- name: '@deepseek-ai/dsh-fs-observation-policy'
- name: '@deepseek-ai/dsh-tool-fs'
```

### Was sich für das Modell ändert

Mit gemounteter Policy erzeugt `write` neue Dateien, verweigert aber das Überschreiben einer existierenden Datei, die die Session nicht gelesen hat; `edit` verlangt einen vorherigen Read des Ziels, und eine Datei, die seit ihrem Read geändert wurde, schlägt mit `FS_STALE_VERSION` fehl. Abwesenheit wird ebenfalls aufgezeichnet: Das Lesen einer fehlenden Datei markiert sie als bestätigt abwesend, sodass ein späteres `write` sie über den guarded-Create-Fluss neu erzeugen darf. Eine Session resumed ohne Observation-State und muss Dateien daher erneut lesen, bevor guarded Mutations wieder gelingen.

### Fehlschläge und Wiederherstellung

Ein Edit ohne vorherige Observation schlägt mit dem Code `FS_NOT_OBSERVED` und dem Policy-Reason `edit requires reading "<path>" first` fehl; das Editieren eines als abwesend observierten Ziels schlägt mit `FS_NOT_FOUND` fehl. Die Tools normalisieren Policy- und Provider-Fehlschläge wegen fehlendem Read zu `cannot modify "<path>": file has not been read — read the file, then retry` und bewahren dabei Code und ursprüngliche Ursache. Das Befolgen der Abhilfe bei einer extern gelöschten Datei zeichnet Abwesenheit auf, sodass der nächste guarded Write sie neu erzeugen kann, ohne einen nebenläufigen Erzeuger zu überschreiben.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt die Design-Entscheidungen hinter dem Policy-Plugin und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) abgedeckt.

### Designkonzept

Das Plugin baut auf zwei Ideen auf:

- **Event-Gate, kein Methoden-Service.** Das Plugin beeinflusst die Welt ausschließlich über die `fs/*`-Events, registriert daher keinen `ctx.fsPolicy`-Service und hat keine öffentlichen Methoden. Sein Entfernen kann `dsh-tool-fs` an keiner Service-Injection-Grenze brechen — das Tool fällt auf den nackten Provider durch.
- **Observed State ist eine Prior-Observation-Aufzeichnung.** Eine schwache Owner-zu-Ziel-Map hält drei logische Zustände — ungesehen, bestätigt abwesend oder vorhanden auf einer Version. Das Plugin führt selbst kein Filesystem-I/O aus; es wandelt den aufgezeichneten Zustand in den optionalen Guard des Providers um, und der Provider führt den atomaren Freshness-Check durch.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Die drei `fs/*`-Listener und das Observed-State-Gate |
| [`src/types.ts`](src/types.ts) | Die opake Event-Actor-Form, aus der die Owner-Session abgeleitet wird |

### Entscheidungsfluss

`fs/write-intent` löst ungesehen oder bestätigt abwesend zu `{ kind: 'createIfAbsent' }` auf und observiert vorhanden zu `{ kind: 'replaceIfVersion', version: vObserved }`. `fs/edit-intent` lehnt ein ungesehenes Ziel mit `FS_NOT_OBSERVED` ab, ein bestätigt abwesendes Ziel mit `FS_NOT_FOUND`, und liefert sonst die observierte Version als Compare-and-Swap-Basis. `fs/observed` zeichnet `{ kind: 'present', version }` oder `{ kind: 'absent' }` für Owner und Ziel auf — ein synchroner, nur nebenwirkender `WeakMap.set`, weil erfolgreiche Mutationen bereits committed sind.

### Single-Slot, First-Wins

Jeder Intent-Slot hält genau einen Entscheider: Dieses Plugin entscheidet vollständig und ruft nie `next()`. Der Slot ist First-Wins nach Registrierungsreihenfolge — dass dieses Plugin ihn besitzt, ist die Konvention des Default-Deployments, keine vom Event erzwungene Invariante. Geschichtete Permission-, Audit- oder Sandbox-Interception gehört stattdessen auf den `tools/execute`-Waterfall.

### Lebenszyklus

Der Observed State wird beim Disposal des Plugins verworfen (HMR-Sicherheit) und niemals über Sessions hinweg persistiert — eine resumed Session startet ohne Observations.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn der paketweite Vertrag nicht ausreicht. Sie führen von der Policy zum Vertrag, den Tools und den Backends, mit denen sie komponiert.

- [Filesystem-Subsystem](../../../docs/subsystems/filesystem.de.md) — erschöpfender Provider-Vertrag, Policy-Events und Fehlertaxonomie.
- [dsh-fs](../fs/README.de.md) — der `ctx.fs`-Vertrag und das `fs/*`-Event-Vokabular.
- [tool-fs](../tool-fs/README.de.md) — die modellseitigen Tools, die die `fs/*`-Events dispatchen.
- [fs-local](../fs-local/README.de.md) — das Host-Filesystem-Backend, das diese Policy absichert.
- [fs-sandbox](../fs-sandbox/README.de.md) — das Sandbox-erzwingende Backend, mit dem diese Policy komponiert.
- [Fsspec-artige Seam-Split-Notiz](../../../.agents/notes/implemented/simplification/2026-06-26-fsspec-style-fs-seam.de.md) — warum die Policy ein Event-Plugin statt einer Provider-Methode ist.

-----

<a id="model-experience"></a>
## Modell-Erfahrung

### Filesystem-Tool-Ergebnis

#### Was das Modell sieht

Dieses Plugin fügt keinen Prompt und kein Schema hinzu. Es lehnt einen Edit ohne vorherige Observation mit dem Code `FS_NOT_OBSERVED` und dem Policy-Reason `edit requires reading "<path>" first` ab; das Editieren eines als abwesend observierten Ziels liefert `FS_NOT_FOUND`. Guarded Mutations, deren positive Observation stale ist, propagieren den provider-eigenen `FS_STALE_VERSION`-Fehler. [`dsh-tool-fs`](../tool-fs/README.de.md) besitzt den modellseitigen Error-Wrapper: Es normalisiert jede `FS_NOT_OBSERVED`-Quelle zu `cannot modify "<path>": file has not been read — read the file, then retry`, während `FS_STALE_VERSION` den Provider-Reason behält und `— re-read the file, then retry` anhängt; beide bewahren Code und ursprüngliche Ursache. Das Befolgen der Stale-Abhilfe bei einem extern gelöschten Ziel zeichnet Abwesenheit auf: Der nächste guarded Write darf es mit `createIfAbsent` neu erzeugen, während der Provider einen etwaigen nebenläufigen Erzeuger atomar bewahrt.

#### Token-Effekt

Null Tokens bei erlaubten Operationen über das gewöhnliche Tool-Ergebnis hinaus. Eine Ablehnung fügt das kleine zurückbehaltene Fehlerergebnis hinzu und vermeidet jede Erfolgs-Payload.

#### KV-Cache-Effekt

Append-only; neu sichtbarer Inhalt folgt auf das wiederverwendbare Request-Präfix und invalidiert keine bestehenden KV-Cache-Einträge.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann die Policy ungeeignet ist oder besondere betriebliche Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein allgemeiner Filesystem-Vergleich und kein Aufgabenrückstand.

- **Observed State überlebt kein Session-Resume** — die Persistenz der Aufzeichnung ist zurückgestellt, daher muss eine resumed Session Dateien vor guarded Writes und Edits erneut lesen.
- **Actors ohne agent Session können die Policy nie erfüllen** — ihre Edits werfen `FS_NOT_OBSERVED`, und ihre Writes lösen immer zu `createIfAbsent` auf, sodass ein Nicht-Agent-Aufrufer keine existierende Datei durch das Gate überschreiben kann.
- **Direkte `ctx.fs`-Reads emittieren kein `fs/observed`** — eine außerhalb des `read`-Tools gelesene Datei bleibt unobserviert, und ein späterer guarded Edit lehnt mit `FS_NOT_OBSERVED` ab, bis das Tool sie liest.
- **Autorisierung ist Versions-Freshness, nicht View-Vollständigkeit** — jeder fensterte Read autorisiert ein Full-File-Overwrite einer unveränderten Datei, bewusst schwächer als eine Full-View-Regel ([Seam-Split-Notiz](../../../.agents/notes/implemented/simplification/2026-06-26-fsspec-style-fs-seam.de.md)).

<a id="dev-note"></a>
### Dev-Notiz

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Keine.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Dieses Paket exponiert keine unabhängige Event-Sequenz oder mutable Datenrelation über die an seinem owning Seam erzwungenen Verträge hinaus.
