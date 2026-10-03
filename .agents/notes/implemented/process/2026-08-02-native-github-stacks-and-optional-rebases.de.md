# Agent Note: Native GitHub-Stacks und optionale PR-Rebases
[English](2026-08-02-native-github-stacks-and-optional-rebases.md) | [中文](2026-08-02-native-github-stacks-and-optional-rebases.zh.md) | Deutsch

Status: implemented


## Problem

Eine abhängige PR-Kette, die nur durch Basis-Branches repräsentiert wird, hat keine offizielle Stack-Identität. Sie zu landen erfordert, jeden PR einzeln manuell zu mergen, Zwischenbranches zu erhalten, jedes Kind umzuzielen und zu rekonstruieren, ob die Kette unversehrt geblieben ist. GitHubs natives Stacked-PR-Feature trägt dagegen die Reihenfolge, wendet Trunk-Regeln und CI auf jede Ebene an und übernimmt Bottom-up-Merges und das Umzielen.

Ein pauschales Verbot, geprüfte Branches umzuschreiben, schließt außerdem den nativen `gh stack`-Synchronisationsworkflow aus, dessen kaskadierender Rebase jede aktive Ebene aktualisiert und mit Lease-Schutz veröffentlicht. Würde dieses Verbot nur außerhalb von Stacks gelten, hätten eigenständige und gestapelte PRs uneinheitliche Historienoptionen.

## Entscheidung

Jede Kette von zwei oder mehr abhängigen PRs im selben Repository verwendet vor dem Landen GitHubs offizielles Stack-Objekt. Die Live-Felder `PullRequest.stack` und `stackEntry.position` sind maßgeblich. Eine ungestapelte Kette, deren PRs einen einzigen Autor haben, wird mit `gh stack link` automatisch in Bottom-to-top-Reihenfolge verknüpft; gemischte oder nicht ermittelbare Autoren erfordern eine Nutzerbestätigung. Fehlende native Unterstützung und Fork-übergreifende Ketten stoppen hart. Bestehende Mitgliedschaft in widersprüchlichen Stacks oder eine offizielle Reihenfolge, die der Branch-Topologie widerspricht, erfordert eine Nutzeranweisung, bevor ein Stack aufgelöst oder neu aufgebaut wird.

„Den Stack landen" mergt den vollständigen offiziellen Stack über `gh stack merge <stack-number> --yes --merge`. Eine Teillandung erfordert einen expliziten Grenz-PR und mergt das untere Präfix bis einschließlich dieses PRs. Der Workflow fällt niemals auf pro-PR `gh pr merge` und manuelles Umzielen zurück. Ein direkter nativer Merge ist alles-oder-nichts; eine Merge-Queue kann die ausgewählten PRs in getrennten Gruppen verarbeiten, daher muss jeder ausgewählte PR unabhängig `MERGED` erreichen, bevor die Landung abgeschlossen ist.

Merge-forward und Rebase sind beide zulässige Auffrischungshistorien für eigenständige und offiziell gestapelte PRs, auch nach dem Review. Ein Umschreiben der Remote-Historie verwendet ein exaktes Lease oder den lease-geschützten `gh stack`-Push-Pfad und bricht ab, wenn sich der Remote bewegt hat; ein rohes `--force` ist verboten. Die [Entscheidung zum inkrementellen Basis-Umzielen](../../archived/process/2026-07-26-incremental-pr-base-retargeting.md) bleibt Eigentümer der Merge-forward-Option.

Relevante Prüfungen laufen normalerweise vor der Veröffentlichung. `gh stack sync` ist die explizite Ausnahme, weil es Fetch, kaskadierenden Rebase und Push als einen Vorgang ausführt: Jede umgeschriebene Ebene wird unmittelbar danach validiert, und kein betroffener PR mergt, bevor dieser Nachweis bestanden ist. Nach jedem umschreibenden Push werden aktuelle Heads, offene Review-Threads, Genehmigungen, Mergefähigkeit und Checks erneut geprüft, weil frühere Commit-OIDs und Inline-Anker veraltet sein können.

## Verifikation

Der [Stack-Lande-Skill](../../../skills/dsh-merging-stacked-prs/SKILL.md) verifiziert native Unterstützung, Branches im selben Repository, Live-Autoren, offizielle Mitgliedschaft und Reihenfolge, Merge-Bereich und den endgültigen Merge-Zustand. Der [Stack-Review-Leitfaden](../../../../docs/cookbook/responding-to-pr-review-on-a-stack.de.md) hält Korrekturen auf ihrer einführenden Ebene und deckt beide Ausbreitungshistorien ab. Der [Pre-Push-Workflow](../../../skills/dsh-pre-push-checks/SKILL.md) trägt Lease-Schutz und den unmittelbaren Post-Sync-Nachweis.

## Erwogene Alternativen

**Branch-Ketten als einzige Stack-Repräsentation beibehalten.** Das bewahrt das manuelle Verfahren, gibt GitHub aber kein Stack-Objekt, über das es die Reihenfolge anzeigen, Trunk-Regeln über alle Ebenen durchsetzen oder einen Bereich atomar mergen könnte.

**Native Stacks übernehmen, aber ihre Rebase-Befehle nach dem Review verbieten.** Das hält Commit-OIDs stabil, deaktiviert aber den offiziellen Synchronisationspfad, solange ein Stack im Review ist, und stellt eigenständige PRs unter eine andere Regel.

**Für jede PR-Auffrischung einen Rebase verlangen.** Eine lineare Historie ist nützlich, aber Merge-Checkpoints bleiben eine gültige Wahl, wenn die Bewahrung abgeschlossener Konfliktlösungen und ihres Wiederherstellungspunkts wichtiger ist als eine kompakte Historie.

**Widersprüchliche Stacks automatisch auflösen.** Das ließe lokale Branch-Schlussfolgerungen gemeinsame GitHub-Metadaten überstimmen und könnte PRs oder Autoren außerhalb der angeforderten Kette beeinträchtigen; gemergte und in der Queue befindliche Einträge lassen sich nicht immer entfernen.

## Konsequenzen

- Reviewer und Automatisierung erhalten GitHubs Stack-Karte, stackweite Regeln, CI und nativen Merge-Zustand.
- Eine Bestandskette mit einem einzigen Autor wird ohne zusätzliche Rückfrage offiziell, während gemischte Eigentümerschaft und widersprüchliche Metadaten eine menschliche Entscheidungsgrenze behalten.
- Rebase kann Commit-Hashes, Genehmigungen oder Kommentaranker nach dem Review ungültig machen, daher trägt jeder umschreibende Push ein Audit des Live-Review- und Check-Zustands.
- `gh stack sync` kann kurzzeitig Code veröffentlichen, dessen lokaler Nachweis noch aussteht; die betroffenen PRs bleiben für den Merge gesperrt, bis die unmittelbare Post-Sync-Validierung besteht.
- Merge-forward bleibt verfügbar und bewahrt abgeschlossene Checkpoints, zum Preis zusätzlicher Merge-Commits.
