# Agent Note: Lefthook-Installation worktree-lokal machen

Status: implemented

[English](2026-07-27-worktree-local-lefthook.md) | [中文](2026-07-27-worktree-local-lefthook.zh.md) | Deutsch

## Problem

Jedes `pnpm install` führt das Root-[`postinstall`](../../../../package.json) aus, dessen [`install-lefthook.mjs`](../../../../scripts/install-lefthook.mjs) `lefthook install --force` aufruft. Verknüpfte Git-worktrees teilen sich ansonsten das Standard-Hooks-Verzeichnis des gemeinsamen Repositories, sodass eine Installation in einem worktree die Hooks aller anderen worktrees umschreiben kann.

Von Lefthook erzeugte Hooks bevorzugen einen absoluten Binärpfad, der beim Installieren aus dem jeweiligen worktree erfasst wurde, bevor sie auf ihren aktuellen worktree-Fallback zurückgreifen. Geteilte Hooks können daher so lange die gepinnte Binärdatei eines anderen worktree ausführen, bis dieser verschwindet, während gleichzeitige Installationen dieselben Dateien schreiben.

## Entscheidung

Die Hook-Installation ist auf den worktree begrenzt. Mit `CI=true` oder `GITHUB_ACTIONS=true` kehrt der Installer zurück, bevor Git ausgelesen oder verändert wird, weil automatisierte Jobs keine Contributor-Hooks nutzen. Andernfalls verlangt er Git 2.26 oder neuer, damit `git config --show-scope` melden kann, aus welchem Scope ein Wert stammt; er hebt ein Repository von Format 0 auf Format 1, aktiviert `extensions.worktreeConfig` und weist dem aktuellen worktree einen absoluten `core.hooksPath` auf `$GIT_DIR/dsh-hooks` zu.

Vor dem Upgrade von Format 0 lehnt der Installer direkt in der gemeinsamen Config gesetzte `extensions.*` ab; ebenso direkt gesetzte `core.worktree` oder `core.bare=true` sowie nicht-leere ruhende worktree-Configs, die das Aktivieren der Extension aktivieren würde. Die Migration entfernt direkt gesetztes `core.bare=false`, weil false der Git-Default ist. Die gemeinsame Repository-Config und jede vorhandene `config.worktree` müssen reguläre Dateien sein. Diese Prüfungen deaktivieren die include-Auflösung, weil Gits Repository-Format-Parser include-Ziele ebenfalls ignoriert. Ein repositoryweiter Lock serialisiert Migration und Hook-Schreibzugriffe; seine Prozess-ID, sein Zufallstoken, seine Datei-Identität und sein exakter Inhalt müssen beim Freigeben noch übereinstimmen. Tote oder ungültige Locks erfordern eine manuelle Wiederherstellung statt automatischem Aufbrechen.

Jedes Hook-Verzeichnis trägt einen JSON-Ownership-Marker mit dem zuletzt in die worktree-Config geschriebenen absoluten Pfad. Nach dem Verschieben eines Checkouts erlaubt dieser Marker nur den Ersatz des exakten veralteten eigenen Werts. Git füllt die `config.worktree` eines neuen verknüpften worktree aus dem Haupt-worktree; enthält dieser Seed den marker-belegten reservierten Hook-Pfad eines registrierten worktree, ersetzt der Installer in der Config des neuen worktree nur dessen Pfad durch den eigenen. Bevor Lefthook läuft, müssen der Marker und jeder vorhandene generierte Hook reguläre, nicht aliasierte Dateien sein. Der Installer löst den wirksamen Scope, die Herkunft und den Wert von `core.hooksPath` auf, einschließlich aktiver `config.worktree`-Includes; er lehnt command-scoped Pfade, nicht eigene worktree-scoped Pfade und nicht eigene reservierte Verzeichnisse ab. Ein geerbter System-, Global- oder gemeinsamer Repository-Pfad erfordert `DSH_LEFTHOOK_ALLOW_HOOKS_PATH_OVERRIDE=1`, das nur den aktuellen worktree für Lefthook aktiviert. Inaktive `includeIf`-Ziele werden nicht rekursiv geprüft, weil sie die aktuelle Konfiguration nicht beeinflussen. Command-scoped Git-Konfiguration wird nach der Validierung aus der Umgebung des Lefthook-Subprozesses entfernt.

Schlägt Lefthook nach dem Ändern von `core.hooksPath` fehl, stellt der Installer den vorherigen worktree-Wert wieder her; ein fehlgeschlagener Rollback wird zusammen mit dem Installationsfehler gemeldet. Vorhandene Dateien in `$GIT_COMMON_DIR/hooks` werden niemals entfernt oder umgeschrieben. Gezielte Installer-Tests pinnen Isolation, die Behandlung kopierter Neu-worktree-Configs, Migrationsverweigerung, Ownership und Verlagerung, gleichzeitige Installation, eigene Pfade und Rollback.

## Erwogene Alternativen

**Die geteilten generierten Hooks behalten und auf ihren aktuellen worktree-Fallback vertrauen.** Der erfasste absolute Pfad gewinnt, solange sein worktree existiert; der Fallback bietet daher keine Versions- oder Lebenszyklus-Isolation.

**Jeden worktree auf ein eingechecktes `.githooks`-Verzeichnis zeigen lassen.** Ein versioniertes relatives Verzeichnis beseitigt generierte absolute Pfade, aber das Ändern des geteilten `core.hooksPath` kann Hooks in älteren worktrees deaktivieren, deren Branches dieses Verzeichnis nicht enthalten, und koppelt weiterhin jeden worktree an einen gemeinsamen Konfigurationswert.

**Eine allgemeine Hook-Manager-Verkettungsschicht bauen.** Reihenfolge, Argumentweitergabe, Fehlersemantik und Upgrades würden zu repositoryeigenem Verhalten, das nichts mit der Lefthook-Isolation zu tun hat. Stattdessen lehnt der Installer worktree-spezifische eigene Pfade ab und macht das engere Override geerbter Pfade explizit.

**Provider-spezifische CI-Credential-Include-Pfade whitelisten.** Contributor-Hooks werden in CI nicht genutzt; Pfad-Ausnahmen würden die Installer-Sicherheit also an Interna des Provider-Checkout-Prozesses koppeln und die strikte Validierung für Contributor-Installationen schwächen. Die CI-No-op vermeidet Repository-Mutationen ganz ohne Ausnahmen.

**Hooks nicht mehr automatisch installieren.** Manuelles Setup vermeidet geteilte Schreibzugriffe, macht aber die billigen Commit- und Push-Checks des Repositories versehentlich optional — besonders in kurzlebigen agent-worktrees.

## Konsequenzen

Das Installieren oder Entfernen eines worktree ändert nicht mehr die aktiven Hooks, den Binärpfad oder die generierten Hook-Bytes eines anderen worktree. Gleichzeitige Installationen werden serialisiert und wiederholte Installationen sind idempotent; die Job- und Latenzgrenze aus [Fast local Git hooks](../../archived/process/2026-07-22-fast-local-git-hooks.md) bleibt unverändert.

Das Repository wird nach der ersten Installation zu einem Git-Format-1-Repository. Der Installer benötigt Git 2.26 für `--show-scope`; die worktree-Config-Extension selbst ist älter als dieses Kommando. Eigene worktree-Hook-Manager erfordern eine explizite Integrationsentscheidung; geerbte Hook-Pfade können in anderen worktrees weiterbestehen, aber wenn der aktuelle worktree Lefthook aktiviert, laufen diese geerbten Hooks dort nicht, es sei denn, der Contributor verkettet sie über `lefthook.yml`.

Alte gemeinsame Hooks bleiben für nicht migrierte worktrees auf der Festplatte. Sie können veralten, aber ihr automatisches Entfernen würde einen registrierten worktree brechen, dessen Branch diesen Installer noch nicht übernommen hat.
