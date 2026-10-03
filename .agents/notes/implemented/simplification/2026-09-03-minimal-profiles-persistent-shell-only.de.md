# Agent Note: Minimal-Profiles stellen nur eine persistente Shell bereit
[English](2026-09-03-minimal-profiles-persistent-shell-only.md) | [中文](2026-09-03-minimal-profiles-persistent-shell-only.zh.md) | Deutsch

Status: implemented


## Problem

Das ausgelieferte Web-`minimal`-Preset und das standalone `sdk-minimal`-Profile stellten neben ihrer persistenten Shell `str_replace_editor` bereit. Der Editor fügte jedem Minimal-Model-Request eine zweite File-Mutation-Schnittstelle samt ihrem vollständigen Schema hinzu, obwohl die Shell Datei-Inspektion und -Mutation bereits bereitstellt. Er erforderte außerdem einen dedizierten `fs-local`-Service, den keine andere Zeile in beiden Minimal-Kompositionen konsumierte.

Eine einzige persistente Shell gibt dem Modell eine konsistente File-Operation-Schnittstelle und hält die Harness-Komposition auf diese Schnittstelle ausgerichtet. Den Editor gemountet zu lassen, aber über einen Presentation-Filter zu verstecken, würde eine inaktive Capability bewahren, die bei einer Änderung der Presentation-Konfiguration wieder auftauchen könnte.

## Decision

Die ausgelieferten Minimal-Kompositionen stellen genau eine plattformgewählte persistente Shell bereit: `bash` auf Linux und macOS oder `pwsh` auf Windows. Keine der Kompositionen mountet `@deepseek-ai/dsh-tool-str-replace-editor`, ein Filesystem-Tool oder den `fs-local`-Service, der den Editor stützte. Die feste complete Persona, das Fehlen von Runtime-Kontext und Compaction, der Shell-Timeout und die launch-spezifischen Host-Services bleiben unverändert.

Das standalone Editor-Package bleibt für explizite Custom-Kompositionen verfügbar. Ein vertrauenswürdiges user-geschriebenes Preset oder ein höherrangiges Profile-Patch muss den Editor mit einem Filesystem-Provider im selben Service-Scope in den Cordis-Tree einfügen; die ausgelieferten `minimal`- und `sdk-minimal`-Defaults fügen ihn nie ein. Der [Python-SDK-Guide](../../../../docs/user/guide/python-sdk.de.md#opt-in-to-str_replace_editor) liefert ein ausführbares Patch-Beispiel.

Der geteilte [Persistent-Bash-Consumer](../../../../packages/shell/tool-bash-persistent/README.de.md#model-experience) übernimmt die Command-Status-Formulierung der One-Shot-Shell und behält dabei seinen persistenten State. Abgeschlossene Commands hängen `[Command finished with exit code N]` an, einschließlich Erfolg; Timeout-Output enthält `[Command timed out or OOM]` und den Shell-Reset-Hinweis. Abschließende Newlines werden vor dem Status-Trailer entfernt. Beide Minimal-Bash-Beschreibungen geben an, dass Netzwerkzugriff von der Task-Umgebung abhängt. Explizite Kompositionen, die diesen Consumer nutzen, teilen sein Output-Verhalten; die Persistent-PowerShell-Beschreibung und -Ausgabe bleiben unverändert.

Exakte Kompositionstests assertieren das einzelne Tool und die Abwesenheit eines preset-lokalen Filesystem-Service. Der `sdk-minimal`-Bundle-Test und der Built-Config-Dump assertieren, dass weder `fs-local` noch `dsh-tool-str-replace-editor` in dessen Zeilen- und Dependency-Allowlists enthalten sind. Web- und Packaged-Python-Model-visible-Snapshots pinnen das One-Tool-Schema-Roster. SDK-Profile-Smoke-Tests führen das Editor-Patch des Guides aus und verifizieren File-Creation und -Viewing.

Diese Entscheidung ersetzt teilweise die Tool-Auswahl in [der Bare-Minimal-Runtime](../feature/2026-08-11-minimal-profiles-bare-two-tool-runtime.de.md) und die Minimal-Ausnahme in [der Base-Editor-Entscheidung](2026-09-05-base-default-file-editor.de.md). Diese Notes behalten die Autorität für Prompt-Ownership, No-Compaction-Verhalten und base-gestütztes File-Editing. Die [Anwendungsarchitektur](../../../../docs/architecture.de.md) besitzt Profile-Launch und Bundle-Layering.

## Alternatives considered

**Die Editor-Zeile behalten und ihr Schema verstecken.** Abgelehnt, weil ein Presentation- oder Restriction-Layer die Capability in der Minimal-Komposition belassen und ihr Fehlen von einer weiteren Einstellung abhängig machen würde.

**Das Editor-Package aus der Distribution entfernen.** Abgelehnt, weil explizite Custom-Kompositionen gültige Consumer bleiben. Die Anforderung betrifft die zwei ausgelieferten Minimal-Defaults.

**Den Editor nur in `sdk-minimal` behalten.** Abgelehnt, weil die beiden Minimal-Pfade derselben Modellklasse unterschiedliche Tool-Verträge zeigen würden und der Packaged-SDK-Pfad die Schema-Kosten und den ungenutzten Filesystem-Service behalten würde.

## Consequences

Minimal-Agents inspizieren und modifizieren Dateien über ihre persistente Shell. Ihre Model-Requests tragen ein Tool-Schema, und ihre Kompositionen besitzen keinen Filesystem-Service. Das Editor-Package und explizite Editor-Kompositionen bleiben verfügbar. Web- und SDK-Replay-Fixtures pinnen die Persistent-Bash-Status-Trailer neben Shell-State und File-Effekten.
