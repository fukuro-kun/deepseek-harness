---
description: "Das Sandbox-erzwingende ctx.fs-Backend für Deployments und Maintainer, die Dateiänderungen des Modells auf einen Session-Workspace beschränken."
kind: "package-reference"
---

# @deepseek-ai/dsh-fs-sandbox
[English](README.md) | [中文](README.zh.md) | Deutsch


## Zusammenfassung

`dsh-fs-sandbox` beschränkt Schreib- und Bearbeitungsoperationen des Modells auf Dateien entsprechend dem Sandbox-Modus der jeweiligen Session und behält dabei das Leseverhalten des lokalen Dateisystems bei. In `read-only` lehnt es jede Änderung ab; in `workspace-write` erlaubt es Ziele nur innerhalb des Session-Workspace oder eines plattformeigenen temporären Wurzelverzeichnisses; in `danger-full-access` schränkt es Änderungen nicht ein. Verwenden Sie es anstelle von `fs-local` zusammen mit `ctx.sandboxPolicy`, wenn Sessions workspace-beschränkte Dateiänderungen benötigen. Abgelehnte Operationen liefern `FS_SANDBOX_DENIED`; die Dateisystem-Tools zeigen dabei den aktiven Modus und einen Hinweis auf eine Eskalation im selben Turn an.

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

Mounten Sie dieses Backend anstelle von `fs-local`, wenn Schreib- und Bearbeitungsoperationen des Modells durch den Sandbox-Modus der Session beschränkt werden müssen, während Lesevorgänge unbeschränkt bleiben. Die Begrenzung greift pro Aufruf: Die Tool-Ebene löst Modus und Workspace-Wurzel der aufrufenden Session in dieselbe Policy auf, die auch der Bash-Runner erhält, sodass die Dateisystem- und Shell-Familien niemals auf unterschiedliche Wurzeln beschränken.

### Minimale Komposition

Laden Sie zuerst den gemeinsamen Policy-Service, dann dieses Backend, dann die Tools; das Read-before-Edit-Policy-Plugin bleibt optional.

```yaml
- name: '@deepseek-ai/dsh-sandbox-policy'
- name: '@deepseek-ai/dsh-fs-sandbox'
  config:
    cwd: /absolute/path/to/workspace
- name: '@deepseek-ai/dsh-tool-fs'
```

Die Konfiguration des Backends ist die unveränderte Konfiguration des lokalen Backends (`cwd`-Auflösungsstandard und `diffBasisMaxBytes`-Obergrenze für Überschreibungen); der [Konfigurationskatalog](../../../docs/config-catalog.de.md#deepseek-aidsh-fs-sandbox) ist die erschöpfende Quelle.

### Wie sich die Begrenzung verhält

Der wirksame Modus stammt aus dem Override oder der Eskalationserteilung der aufrufenden Session und fällt auf den Deployment-Standard zurück, wenn keines von beiden in Kraft ist. `read-only` lehnt jede Änderung mit dem strukturierten `FS_SANDBOX_DENIED` ab. `workspace-write` erlaubt eine Änderung nur, wenn das Ziel nach der Kanonisierung unter der Workspace-Wurzel oder einem plattformeigenen Temp-Bereich (`/tmp`, `os.tmpdir()`) liegt — dieselbe schreibbare Menge, die das Seatbelt-Profil gewährt. `danger-full-access` delegiert unbegrenzt.

### Beobachtbare Erfolge und Fehler

Lesevorgänge, Listings und Metadaten funktionieren exakt wie bei `fs-local`. Eine abgelehnte Änderung liefert einen `FS_SANDBOX_DENIED`-Fehler, der den wirksamen Modus trägt; über die Tools sieht das Modell `[sandbox: file access denied under <mode> mode]` plus den Hinweis auf einen einmalig genehmigten Wiederholungsversuch mit weiterem Modus — identisch mit den Ablehnungen von bash. Eine Session mit genehmigter Eskalation darf dieselbe Operation für diesen einen Aufruf in einem strikt weiteren Modus wiederholen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erläutert die Designentscheidungen hinter dem Sandbox-Backend und verweist auf den Code, der sie umsetzt; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Designkonzept

Die Begrenzung ist eine Policy-Prüfung in vertrauenswürdigem Code über einem modellkontrollierten Pfad — keine Kernel-Grenze. Die Operationen gehören zum eigenen seam (open, rename); nur der Zielpfad ist nicht vertrauenswürdig, daher ist »kanonisieren, dann Enthaltensein prüfen« die vollständige Antwort auf diese Oberfläche. Isolation nicht vertrauenswürdigen Codes auf Kernel-Niveau bleibt Aufgabe von `ctx.shell`.

### Quellcode-Übersicht

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `SandboxedFileSystem`: Modus-Begrenzung auf `writeText`/`editText`, `sandboxMode`-Fakt |
| [`src/containment.ts`](src/containment.ts) | Enthaltenseinsprüfung über Vorfahren mit lexikalischem Schnellpfad und identitätsbasierter Ausweichprüfung |

### Wie eine Änderung begrenzt wird

Jede Änderung löst zunächst die aufrufbezogene Policy auf (`danger-full-access` gibt das Ziel des Aufrufers unverändert zurück; `read-only` wirft `FS_SANDBOX_DENIED`); bei `workspace-write` kanonisiert sie das Ziel unmittelbar erneut und verlangt Enthaltensein unter einer der schreibbaren Wurzeln, die aus der einzigen `writableRoots`-Funktion abgeleitet werden — derselben Menge, die das Seatbelt-Profil gewährt, sodass die fs-Begrenzung und der Bash-Runner nicht auseinanderlaufen können. Mutiert wird das frisch kanonisierte Ziel, sodass ein seit der Auflösung durch das Tool ausgetauschter Symlink-Vorfahre erkannt wird.

### Bedrohungsmodell

Das verbleibende Resolve-to-Syscall-TOCTOU wird durch die unmittelbare Neukanonisierung vor dem Schreiben verkleinert und für dieses Bedrohungsmodell akzeptiert; eine kerneldichte Grenze erforderte Primitive der `openat2`-Klasse, deren Portabilitätskosten sich hier nicht lohnen. Eine Ablehnung ist ein strukturierter `FsError`, keine stderr-Inferenz — eine prozessinterne Begrenzung weiß genau, was sie verweigert hat.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lesen Sie diese Seiten, wenn der Vertrag auf Paketebene nicht ausreicht. Sie führen von diesem Backend zur gemeinsamen Policy-Heimat und zu den dahinterliegenden Begrenzungsentscheidungen.

- [Dateisystem-Subsystem](../../../docs/subsystems/filesystem.de.md) — erschöpfender Provider-Vertrag, Policy-Ereignisse und Fehlertaxonomie.
- [dsh-fs](../fs/README.de.md) — der `ctx.fs`-Vertrag, den dieses Backend implementiert.
- [fs-local](../fs-local/README.de.md) — das lokale Backend, das dieses erweitert.
- [sandbox-policy](../../sandbox/sandbox-policy/README.de.md) — der gemeinsame sessionbezogene Policy-Resolver, den dieses Backend benötigt.
- [Prozess-Sandbox-Subsystem](../../../docs/subsystems/sandbox.de.md) — Modi, aufrufbezogene Policy und Fail-Closed-Fehler.
- [Familienübergreifende fs-Sandbox-Entscheidung](../../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.de.md) — die gemeinsame Modus-Begrenzung und ihre Eskalationschoreografie.

-----

<a id="model-experience"></a>
## Model Experience

### Dateisystem-Policy und Ablehnungen

#### Was das Modell sieht

Der Policy-Eigentümer steuert capability-neutrale `sandbox:policy`-Kontexte bei. Indirekt rendert `dsh-tool-fs` die `FS_SANDBOX_DENIED`-Ablehnungen dieses Backends als `[sandbox: file access denied under <mode> mode]`-Markierung plus den Eskalationshinweis im selben Turn.

#### Token-Effekt

Die Klausel zur aktuellen Policy fügt eine kleine Runtime-Context-Nachricht hinzu, solange dieses Backend gemountet ist; eine Ablehnung fügt die begrenzte Markierung und den Eskalationshinweis dem Konversationsverlauf hinzu.

#### KV-Cache-Effekt

Eine Änderung der stehenden Policy hängt einen vom Eigentümer gerenderten, ersetzenden Runtime-Context-Snapshot hinter dem erhaltenen Verlauf an; Operationsergebnisse bleiben append-only.

## Bekannte Einschränkungen und zurückgestellte Arbeiten

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen bestimmen, wann das Sandbox-Backend schlecht passt oder besondere betriebliche Sorgfalt benötigt. Es sind aktuelle Paketbeschränkungen, kein allgemeiner Sandbox-Vergleich und kein Aufgabenrückstand.

- **Eine Policy-Begrenzung, keine Kernel-Grenze** — die Prüfung ist vertrauenswürdiger Code über einem modellkontrollierten Pfad; das verbleibende Resolve-to-Syscall-TOCTOU wird durch die In-place-Neukanonisierung verkleinert, aber nicht beseitigt; adversarielle Host-Prozesse liegen außerhalb des Geltungsbereichs. Isolation nicht vertrauenswürdigen Codes auf Kernel-Niveau bleibt bei `ctx.shell`.
- **Begrenzungs-Runner-Parität wird aus einem Eigentümer abgeleitet** — die schreibbare Menge stammt aus `writableRoots`, geteilt mit dem Seatbelt-Profil; ein Runner-Profil, das seine schreibbare Menge andernorts definiert, würde auseinanderlaufen.
- **Erfordert `ctx.sandboxPolicy`** — Tools nutzen es zum Auflösen der Policy jeder Session, das Backend für agentlose Aufruffallbacks; ohne komponierten Service beschränkt das Backend nicht.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Dieser zustandslose Adapter delegiert Policy- und Dateisystem-Beziehungen an ihre zuständigen seams.
