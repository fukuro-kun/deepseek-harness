# Wartung des dsh-code-review-Skills

[English](maintaining-dsh-code-review.md) | [中文](maintaining-dsh-code-review.zh.md) | Deutsch

Das [`dsh-code-review`](../../.agents/skills/dsh-code-review/SKILL.md)-Skill wird von einem einzelnen benannten Operator aktuell gehalten, der ein privates periodisches Wartungstool betreibt. Dieses Cookbook ist der Einstiegspunkt für diesen Operator — und für jeden, der die Rolle übernimmt — sowie für Repository-Beitragende, die verstehen wollen, warum Skill-Updates als kleine periodische PRs ankommen und nicht als Einmal-Audits. Der Workflow selbst ist in der [human-review skill-maintenance Agent Note](../../.agents/notes/proposed/process/2026-07-13-human-review-skill-maintenance.de.md) spezifiziert.

## Was der Maintainer erhält

Der Operator ruft den Wrapper manuell auf, täglich mit einem Überlapp von zwei UTC-Tagen; ein manueller wöchentlicher Recovery-Lauf verwendet ein Sieben-Tage-Fenster. Der Workflow:

1. Er wählt PRs, die im gewählten Fenster gemergt wurden (Standard zwei UTC-Tage für den täglichen Takt, sieben für den wöchentlichen) und deren Merge-Commit von `origin/master` aus erreichbar ist. PRs, deren Merge-Commit nicht erreichbar ist (gestapelte Branches, deren Parent gequashed wurde) oder die eine Erwerbsgrenze von 250 Commits überschreiten, werden in `skipped-pulls.json` protokolliert und übersprungen, statt den Lauf abzubrechen.
2. Er sammelt vor dem Merge menschliches Review-Feedback mit Commit-Ankern (Inline-Kommentare und Review-Submissions) und vergleicht dann Feedback-Zeitpunkt und final gelandeten PR-Patch. Er erwirbt keine PR-Konversations-Kommentare, weil der aktuelle GitHub-Zustand ihnen keine force-push-sichere Feedback-Zeit-Baseline geben kann, und schließt Änderungen, die nur im Ziel-Branch vorkommen, aus den Adoptions-Nachweisen aus.
3. Zwei unabhängig konfigurierte Reviewer-Adapter klassifizieren, wer jeden Eintrag geschrieben hat und ob die Änderung ihn übernommen hat, und klassifizieren dann die einvernehmlich übernommenen Einträge gegen das aktuelle Skill.
4. Der primäre Adapter entwirft eine vollständige überarbeitete `SKILL.md`; beide Adapter reviewen denselben Diff; blockierende Befunde loopen, bis beide zustimmen.
5. `pnpm run doc-sync` und `pnpm run lint` laufen gegen den Kandidaten, bevor das Tool Erfolg meldet.

Jeder Lauf speichert seine Artefakte auf der Maschine des Operators. Der gespeicherte Diff, die Kandidaten-`SKILL.md` und das Promotions-Manifest landen unter `~/dsh-code-review-outputs/` benannt nach Zeitstempel. Das Manifest protokolliert den Quell-master-Commit und den Skill-Blob, die Quell-Feedback-IDs und -URLs, die Range der gelandeten Nachweise, die Adapter-Entscheidungen und die Gate-Ergebnisse; die rohe pro-Adapter-I/O bleibt in einem privaten Temp-Verzeichnis, dessen Pfad in die Benachrichtigung und in das tägliche Log unter `~/Library/Logs/dsh-code-review-maintainer/` geschrieben wird. Der Wartungs-worktree selbst wird nach jedem Lauf wieder sauber hergestellt, damit der Operator nie versucht, die Wartungskopie direkt zu bearbeiten.

## Was der Operator mit einem Kandidaten-Diff macht

Erzeugt ein Lauf einen Kandidaten, kommt eine macOS-Benachrichtigung mit einem `dsh-code-review-promote <timestamp>`-Hinweis.

1. **Bewerte den Diff auf seine eigenen Verdienste.** Orientiere dich nicht an „die Reviewer haben zugestimmt"; der Maintainer-Vertrag ist, dass der Operator die finale Entscheidung trifft. Achte auf Checklisten-Aufblähung, historische Prosa, ungestützte Extrapolation aus einem einzelnen Vorfall und doppelte Abdeckung mit vorhandenem Skill- oder Autoritäts-Dokument-Inhalt.

   ```sh
   ls ~/dsh-code-review-outputs/                         # every candidate ever produced
   less ~/dsh-code-review-outputs/2026-07-16T02-00-00Z.diff
   less ~/dsh-code-review-outputs/2026-07-16T02-00-00Z.SKILL.md
   less ~/dsh-code-review-outputs/2026-07-16T02-00-00Z.manifest.json
   ```

2. **Abgleichen mit den Lauf-Artefakten.** Das Promotions-Manifest ordnet jede vorgeschlagene Regel Quell-Feedback und gelandeten Nachweisen zu; die detaillierte pro-Adapter-I/O, der Konsens und die übernommenen Beweise liegen im privaten Temp-Verzeichnis des Laufs (Pfad im Log). Prüfe mindestens einen Kandidaten stichprobenartig: Stützt der verlinkte menschliche Kommentar tatsächlich die hinzugefügte Regel? Übernimmt der verlinkte PR sie tatsächlich?

3. **Entscheide dich für eine von drei Optionen:**
   - **Verwerfen.** Lösche den gespeicherten Kandidaten. Das Tool berücksichtigt dasselbe Feedback im nächsten Lauf erneut, nach dem, was das aktuelle Skill dann sagt.

     ```sh
     rm ~/dsh-code-review-outputs/2026-07-16T02-00-00Z.{diff,SKILL.md,manifest.json}
     ```
   - **Stauen.** Halte den Kandidaten zurück, wenn die Aktualisierung klein ist und sich mit einer zukünftigen kombinieren ließe. Die Quell-Skill-Prüfung gilt weiterhin; führe die Analyse erneut aus oder rebase und reviewe den Diff manuell, wenn `master` zuerst geändert wird.
   - **Fördern.** Führe das Promotions-Hilfswerkzeug aus einem sauberen `master`-Checkout des Repositorys aus. Es aktualisiert `master`, verifiziert, dass das aktuelle Skill mit dem protokollierten Quell-Blob übereinstimmt, wendet den gespeicherten Diff an und öffnet einen Draft-PR, dessen Body die Quell-Feedback-URLs oder -IDs, den gelandeten Commit-Range, den Ursprungs-Lauf, die Prüfungen und die Operator-Bearbeitungen auflistet. Es stoppt bei Skill-Drift, statt neuere Führung zu überschreiben; der Operator reviewt den PR trotzdem auf GitHub und merged oder schließt ihn.

     ```sh
     cd ~/path/to/deepseek-harness   # clean master
     dsh-code-review-promote 2026-07-16T02-00-00Z
     ```

4. **Committe die Adapter-Ausgabe nicht wortgetreu.** Kleine Bearbeitungen während der Förderung — Wortwahl straffen, ein Beispiel entfernen, das nur mit dem Kontext des Quell-PRs Sinn ergibt, eine Regel in eine vorhandene eingliedern — sind erwartet und bewahren die „Reviewer-Entscheidung", von der der Workflow abhängt. Überarbeite den Branch vor dem Merge.

## Wenn ein Lauf keinen Kandidaten erzeugt

Das ist der übliche Fall, nachdem jede nicht-leere Klassifizierungsstufe mindestens ein gültiges Adapter-Ergebnis erzeugt hat. Das Tool protokolliert „kein Kandidat" im täglichen Log, sendet keine Benachrichtigung (um Alarmmüdigkeit zu vermeiden) und geht weiter. Tage ohne Skill-Aktualisierung sind der korrekt arbeitende Workflow, kein Stau.

## Unterbrechungen und Übergabe

Der Mechanismus lebt auf einer Maschine. Unterbrechungen behandelt der Operator, wenn sie auftreten:

- **Täglicher Lauf verpasst.** Das Überlapp-Fenster von zwei Tagen fängt einen übersprungenen Tag automatisch auf; längere Lücken stellt man wieder her, indem man den Wrapper manuell mit `DSH_CODE_REVIEW_SINCE=<Nd>` ausführt. Überlappende Fenster sind idempotent: Führung, die bereits im aktuellen Skill ist, wird als `covered` klassifiziert und tritt nicht erneut als Kandidat ein.
- **Adapter-Provider-Ausfall.** Das Tool verweigert die Ausführung, wenn die beiden Reviewer-Befehle auf byte-identische Executables auflösen. Ein einzelnes Batch, dessen Adapter-Antwort die Schema- oder ID-Validierung nicht besteht, wird auf Batch-Ebene fail-closed (jeder Eintrag im Batch als unklar markiert), und der Lauf fährt fort; die rohe Ausgabe wird zum Debuggen aufbewahrt. Wenn einer der Adapter für ein nicht-leeres Batch in einer Operation kein gültiges Ergebnis erzeugt, schlägt der Lauf fehl, schreibt einen Fehler-Record und benachrichtigt den Operator; er kollabiert einen vollständigen Provider-Ausfall nie zu „kein Kandidat".
- **Übergabe an einen anderen Maintainer.** Erstelle eine nachfolgende Agent Note, die die aktuelle ablöst: Entweder versetze den Mechanismus ins Repository oder protokolliere die private Einrichtung des neuen Operators. Übertrage das Tool nicht stillschweigend — der „Single-Maintainer-Bus-Faktor" im Risikokapitel der Agent Note ist der Grund, warum die Übergabe eine dokumentierte Entscheidung braucht.

## Wo die private Einrichtung des Operators lebt

Quellcode des Tools, Reviewer-Adapter, Provider-Credentials und Scheduler sind die private Infrastruktur des Operators und liegen per Design außerhalb dieses Repositorys (siehe den Abschnitt „Where the mechanism lives" der Agent Note). Dieses Cookbook und die Agent Note beschreiben, **was der Workflow garantiert**; **wie** diese Garantien implementiert sind, ist eine Angelegenheit der privaten Infrastruktur. Wenn du der neue Operator bist, sind die `## Proposal`-Abschnitte der Agent Note die Spezifikation, gegen die du baust.
