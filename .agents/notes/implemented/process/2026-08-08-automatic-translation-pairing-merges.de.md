# Agent Note: Übersetzungs-Pairing-Records automatisch zusammensetzen

Status: implemented

[English](2026-08-08-automatic-translation-pairing-merges.md) | [中文](2026-08-08-automatic-translation-pairing-merges.zh.md) | Deutsch

## Problem

Ein Pairing-Konsistenz-Record enthält die exakten Blob-Hashes der Owner-Dateien — zwei für ein pending zweisprachiges Paar, drei für ein trilinguales Paar. Zwei Zweige, die unabhängig voneinander unterschiedliche Teile desselben bestätigten Paares aktualisieren, konfligieren daher auf beiden Hashzeilen, selbst wenn Git beide Markdown-Owner sauber zusammensetzt. Die Auswahl einer Seite lässt veraltete Hashes, während die manuelle Neu-Generierung des Records eine deterministische Operation wiederholt und einen andernfalls automatischen Merge verhindert.

## Decision

`*.i18n.yaml` verwendet den repository-eigenen `dsh-translation-pairing`-Merge-Treiber. Der worktree-lokale Git-Installer registriert seinen Befehl neben der Lefthook-Installation; die Git-Konfiguration bleibt lokal, weil ein getracktes Attribut einen Treiber benennen kann, aber nicht seinen ausführbaren Befehl trägt.

Der Installer lädt den exakten Node/tsx-Einstiegspunkt, bevor er die worktree-Integration veröffentlicht. Git ruft einen eingecheckten Shell-Launcher auf, der Node nicht benötigt und diese Prüfung vor jeder Treiberausführung wiederholt. Wenn die Runtime oder der Einstiegspunkt nicht verfügbar ist, materialisiert der Launcher das gewöhnliche dreiseitige Textergebnis von Git in der Sidecar-Datei, gibt aber einen Konflikt zurück, selbst wenn dieser Text-Merge sauber ist, damit Git die unmergeden Index-Stadien behält und nie unverifizierte Metadaten akzeptiert.

Der Treiber parst die Vorfahren-, aktuellen und anderen Records und lädt die Owner-Blobs, die von ihren Hashes benannt werden. Er führt für jedes aufgezeichnete Owner-Blob-Tripel unabhängig den Git-Standard-dreiseitigen Text-Merge aus, lehnt einen Merge ab, der einen Zwei-Hash-Record mit einem Drei-Hash-Record vermischt, verlangt, dass jeder Merge sauber ist, verifiziert die Sprache-Switcher und die Pairing-Struktursignatur, speichert die gemergten Blobs und schreibt ihre Hashes als den kanonischen Record. Dies setzt Bestätigungen zusammen, die bereits in beiden Eltern vorhanden sind; es zeichnet nie eine gewöhnliche einseitige Dokumentänderung auf.

Der Treiber schlägt mit einem gewöhnlichen ungelösten Sidecar fehl, wenn ein Record fehlerhaft ist, ein Objekt fehlt, ein Owner eine andere Merge-Strategie verwendet (einschließlich eines nicht-textuellen `merge.default`, den ein andernfalls unbestimmter Pfad erbt), einer der Owner Inhaltskonflikte hat, oder das gemergte Paar strukturelle Prüfungen verletzt. Add/Delete- und Rename-Formen bleiben manuell, weil ihre Pfad-Ownership nicht derselbe Drei-Record-Vorgang ist.

`pnpm run resolve-translation-pairing-conflicts` wendet denselben Algorithmus an, nachdem ein Merge bereits gestoppt hat. Bevor es eine Sidecar-Datei schreibt, beweist es, dass die Sidecar-Datei noch das unveränderte Konfliktergebnis von Git enthält und dass die gestagten Owner-Blob-IDs und die Worktree-Bytes seinen unabhängigen Merges entsprechen. Es schreibt und staged jeden sicheren Record als einen Batch, selbst wenn ein anderes Paar noch manuelle Arbeit braucht, meldet dann die verbleibenden Pairing-Konflikte und beendet sich fehlerhaft, damit Aufrufer eine partielle Auflösung nicht für einen abgeschlossenen Merge halten können.

`pre-merge-commit` und `pre-commit` verifizieren gestagte `.i18n.yaml`-Dateien gegen die exakten Index-Bytes ihrer Owner. Sie validieren die Treiberausgabe, regenerieren aber keine Records, daher kann das Umgehen eines Hooks keine Übersetzungsdrift nicht sichtbar bestätigen; die corpusweite `doc-sync`-Prüfung bleibt in CI die Autorität.

<a id="failure-contract"></a>

## Failure contract

| Failure während eines normalen `git merge` | Beobachtbarer Zustand | Recovery |
|---|---|---|
| Eine frische Installation kann den Treiber nicht prüfen oder Lefthook nicht installieren | Es wird keine neue Treiber- oder Hook-Pfad-Konfiguration veröffentlicht; jede neu hinzugefügte Integration wird auf die vorherige Hook-Nachschaltung zurückgerollt. | Stellt die Abhängigkeiten wieder her und führe `node scripts/install-lefthook.mjs` erneut aus. |
| Node, tsx oder der Treiber-Einstiegspunkt wird nach der Installation nicht verfügbar | Der Merge stoppt mit der Sidecar-Datei bei `UU`, Index-Stadien 1/2/3 bleiben, die Worktree-Sidecar-Datei enthält das Textergebnis von Git, `MERGE_HEAD` existiert, und es wird kein Commit erstellt. | Stellt die Abhängigkeiten wieder her und führe `pnpm run resolve-translation-pairing-conflicts` aus, oder führe `git merge --abort` aus. |
| Der repository-wissende Treiber lehnt die Records ab | Der Merge stoppt mit der ungelösten Sidecar-Datei und ohne Commit; der Treiber druckt den Owner-Reparatur- und expliziten-Resolver-Pfad. | Repariere den Owner-Konflikt oder Record und führe dann den gedruckten Resolver-Workflow aus, oder breche ab. |
| Der Treiber-Prozess crash't mit einem Status über 128 | Git bricht die Merge-Strategie ab, ohne `MERGE_HEAD` oder unmergede Index-Stadien zu veröffentlichen. | Repariere die Runtime und führe den Merge erneut aus. |
| `pre-merge-commit` lehnt einen andernfalls sauberen Dateimerge ab | Es bleiben keine unmergeden Einträge, das vollständige Ergebnis ist gestaggt mit `MERGE_HEAD`, und es wird kein Merge-Commit erstellt. | Repariere den Hook-Fehler und führe `git commit` aus, oder führe `git merge --abort` aus. |

Ein Installer-Rollback-Fehler meldet sowohl den ursprünglichen Installationsfehler als auch jeden Rollback-Fehler. Weil die Worktree-Konfiguration dann teilweise sein kann, repariert oder inspiziert der Beiträger sie vor dem Merge, anstatt auf einen stillen Fallback zu vertrauen.

## Verification

Skript-Tests üben die saubere Zusammensetzung durch den installierten Launcher, den Text-Fallback bei fehlender Runtime und beschädigtem Einstiegspunkt, den Installer-Prüfungs-Rollback, einen ablehnenden `pre-merge-commit`-Hook, die explizite Recovery aus einem ungelösten Index, gemischte sichere und owner-konfliktbehaftete Paare, bearbeitete Sidecars, nicht-textuelle Standard-Merge-Konfiguration, Record-Parsing und die worktree-lokale Installation. Der bestehende Korpus-Verifikator beweist weiterhin, dass ein committeter Record seinen Ownern entspricht.

## Alternatives considered

**Take ours oder Git's union driver verwenden.** Jeder Eltern-Record benennt den Pre-Merge-Inhalt, während union duplizierte oder unsortierte Hash-Keys erzeugt. Keines repräsentiert die gemergten Owner.

**In `post-merge` oder nur in einem Commit-Hook regenerieren.** `post-merge` läuft nicht nach einem konfliktbehafteten Merge und kann sein Ergebnis nicht beeinflussen. Commit-Hooks werden nur erreicht, nachdem der Index keine ungelösten Einträge mehr hat, daher kann ein Hook allein den generierten Konflikt nicht beseitigen.

**Jeden Merge mit einem Repository-Befehl umwickeln.** Ein Wrapper kann den Konflikt aus dem befüllten Index auflösen, und der explizite Resolver behält diesen Recovery-Pfad bei, aber rohes Git, Stack-Tooling, Rebases und Cherry-Picks würden davor immer noch stoppen. Der Merge-Treiber ist der Datei-Ebene-Extension-Point, den diese Operationen teilen.

**Auf GitHub durch Actions oder eine App auflösen.** Gehostete Automatisierung könnte PR-Zweige aktualisieren, aber sie fügt Credentials, Konfliktsteuerung und Zweig-Mutation hinzu. Lokale und agent-gesteuerte Merge-Forward-Workflows haben bereits eine Checkout- und Push-Autorität; das Repository hält Remote-Automatisierung aus diesem Mechanismus heraus.

## Consequences

Installierte Worktrees entfernen automatisch Pairing-Record-eigene Konflikte, während menschliche Urteilsfähigkeit für Owner-Konflikte und Übersetzungsqualität erhalten bleibt. GitHub's gehostete Mergeability-Berechnung führt den worktree-lokalen ausführbaren Befehl nicht aus, daher muss ein Beiträger oder Agent die Basis noch mergen und den resultierenden Commit pushen, bevor das Remote-Konflikt-Badge verschwindet.

Der Installer reserviert `merge.dsh-translation-pairing.*` in der Worktree-Konfiguration und lehnt einen konfliktbehafteten benutzerdefinierten Wert ab. Die automatische Zusammensetzung hängt von den installierten Node-Abhängigkeiten ab, wie die Beiträger-Hooks des Repositories; ein Runtime-Verlust erzeugt ein sichtbares ungelöstes Textergebnis, statt veraltete Metadaten auszuwählen.
