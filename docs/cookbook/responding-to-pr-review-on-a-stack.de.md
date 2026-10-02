# Auf Review-Kommentare in einer gestapelten PR-Kette antworten

[English](responding-to-pr-review-on-a-stack.md) | [中文](responding-to-pr-review-on-a-stack.zh.md) | Deutsch

Review-Kommentare können mehrere PRs in einer abhängigen stack (`A ← B ← C …`) betreffen. Diese Kette über die offizielle GitHub-Stacked-PR-Funktion verknüpft halten. Dieser Leitfaden verantwortet Platzierung und Propagation von Review-Fixes; der [dsh-merging-stacked-prs](../../.agents/skills/dsh-merging-stacked-prs/SKILL.md) skill verantwortet Verknüpfungsprüfungen und Landing.

## Grundregeln

1. **Ein worktree pro PR-Branch.** Die Fixes jedes PRs erfolgen in dessen eigenem worktree; parallele Fixes teilen nie einen checkout.
2. **Das GitHub-stack-Objekt ist autoritativ.** Base-Branches etablieren die erwartete Abhängigkeitsreihenfolge, während `PullRequest.stack` und `stackEntry.position` beweisen, dass GitHub sie erkennt. Eine übereinstimmende Branch-Kette nicht ohne Prüfung dieser Felder als offiziellen stack behandeln.
3. **Ein Fix landet auf dem PR, der das Problem EINGEFÜHRT hat, dann propagiert er den stack hinauf.** Wenn ein Kommentar auf PR `B` auf Code verweist, den `B` eingeführt hat, auf `B` fixen und `B` nach `C` propagieren — selbst wenn `C` die Datei ebenfalls enthält. Einen Fix Downstream zu beginnen lässt `B` den ungefixten Code ausliefern und versteckt den Fix vor dem Reviewer von `B`.
4. **Jeder Review-Fix bleibt ein eigener commit.** Ein späterer rebase kann die OID ändern, aber ein bereits reviewter Fix darf nicht per amend aus der Branch-Historie entfernt werden. Nur eigene, noch nicht gepushte und noch nicht reviewte Arbeit darf amendet werden.
5. **Merge-forward oder rebase bewusst wählen.** Beide Historien sind nach Review erlaubt. Ein umgeschriebener Push muss lease-geschützt sein und muss abbrechen statt einen konkurrierend fortgeschrittenen Remote-Head zu überschreiben; raw `--force` ist verboten.

## Kommentare durch den stack auflösen

1. Jeden Kommentar inhaltlich prüfen, bevor gehandelt wird: die Behauptung gegen den Code verifizieren — ein Reviewer, der das richtige Symptom markiert, kann dennoch die Ursache falsch diagnostizieren.
2. Jede akzeptierte Feststellung auf ihren ursprünglichen PR mappen und dort fixen.
3. Die fixte Schicht der Reihe nach durch jedes betroffene Kind propagieren:
   - **Merge-forward:** den fixten Parent-Branch in seinen Child-Branch mergen, den Child validieren und weiter den stack hinauf gehen. Jeden in-progress-Checkpoint bewahren.
   - **Nativer kaskadierender rebase:** `gh stack rebase` verwenden, die umgeschriebenen Schichten validieren, dann mit `gh stack push` veröffentlichen; oder `gh stack sync` verwenden, das möglicherweise zuerst veröffentlicht und daher eine sofortige Post-Sync-Validierung gemäß [dsh-pre-push-checks](../../.agents/skills/dsh-pre-push-checks/SKILL.md) erfordert.
4. Delegierte Fixes als trust-but-verify behandeln: der Bericht eines subagent beschreibt Intent, nicht zwingend das, was gelandet ist. Die gates selbst auf dem tatsächlichen Baum neu ausführen und für eine Regression-Guard beweisen, dass sie auf dem ungefixten Code FEHL schlägt (Regression einführen, rot beobachten, reverten) — eine Guard, die beide Male besteht, bewacht nichts. Ein subagent, der ein Problem als bereits behandelt umformuliert, ist ein Signal, selbst nachzugraben.
5. Im Review-Thread antworten (`gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies`), nicht als Top-Level-Kommentar; den Fix und den aktuellen commit oder Head angeben, der ihn trägt.
6. Nach jedem umgeschriebenen Push ungelöste Threads, Approvals, Mergeability und checks neu lesen. Eine per force-push geänderte commit-OID oder ein veralteter Inline-Anker ist kein aktueller Beweis dafür, dass die Feststellung noch gelöst ist.
7. Nur über das offizielle stack-Verfahren landen. Wenn die PRs noch nicht verknüpft sind, verknüpft der Landing-skill automatisch eine Same-Author-Kette, fragt vor dem Verknüpfen gemischter Autoren und stoppt hart, wenn native stack-Unterstützung nicht verfügbar ist.

## Verifizieren

- Der aktuelle diff jedes fixten PRs enthält die beabsichtigte Korrektur auf der Schicht, die das Problem eingeführt hat.
- GraphQL meldet genau einen offiziellen stack in der erwarteten Reihenfolge, und jeder Child-diff gegen seinen Parent zeigt nur die Änderungen des Childs.
- Ungelöste Threads, Approvals, Mergeability und checks wurden nach jedem umgeschriebenen Push neu auditiert.
- Die relevanten gates bestehen auf jedem betroffenen PR im stack, nicht nur auf dem obersten.
