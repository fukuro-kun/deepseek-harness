# Agent Note: Projekt-lokale Issue-Planungsfelder
[English](2026-09-02-project-local-issue-planning-fields.md) | [中文](2026-09-02-project-local-issue-planning-fields.zh.md) | Deutsch

Status: implemented


## Problem

Der Issue-Lebenszyklus-Workflow braucht strukturierte Planungsmetadaten, doch Organisations-Issue-Felder erfordern eine andere GitHub-App-Berechtigung als Organisations-Projects. Ein Workflow-Token mit Project-Schreibzugriff kann Project-Custom-Fields lesen und aktualisieren, während GitHub Issue-Feld-Lesevorgänge ablehnt; die Nutzung beider Speichersysteme macht eine Policy also von zwei unabhängig verwalteten Berechtigungssätzen abhängig.

Priorität, Auswirkungsfläche, Lösungsaufwand und Termine dienen der Arbeitsplanung in `DSH Issue Management`. Diese Werte zusätzlich am Issue zu halten macht sie auch außerhalb dieses Projects sichtbar, doch das Repository hat keinen Workflow, der projektübergreifende Werte braucht.

## Entscheidung

Das `DSH Issue Management`-Project besitzt `Priority`, `Severity`, `Cost`, `Start Date` und `Target Date` als Project-Custom-Fields. `Severity` verwendet die Optionsbedeutungen des Organisationsfelds `影响面`, `Cost` die von `解决代价`.

Die Repository-Policy löst `Priority` und `Start Date` aus dem konfigurierten Project auf. Sie lehnt ein Issue-gestütztes Feld oder den falschen Datentyp ab, liest Priority aus dem Project-Item und schreibt Start Date über `updateProjectV2ItemFieldValue`. Organisations-Issue-Felder bleiben nur als `Legacy ...`-Migrationsquellen erhalten und werden von Repository-Workflows nicht gelesen.

Der Pull-Request-Policy-Workflow verwendet den Repository-`GITHUB_TOKEN` für REST-Issue- und Pull-Request-Lesevorgänge sowie ein GitHub-App-Token, das auf Leserechte für Repository-Issues und Organisations-Projects beschränkt ist, für ProjectV2-Abfragen. Lebenszyklus-Mutationen verwenden weiterhin das schreibberechtigte App-Token.

Der Issue-Lebenszyklus-Workflow initialisiert `Start Date` nur bei `pull_request.opened`. Er liest den Live-Body des Pull Requests, behält jede Referenz im selben Repository, die zu einem Issue aufgelöst wird, wandelt `created_at` in der konfigurierten Project-Zeitzone in ein Kalenderdatum um, stellt sicher, dass der Issue ein Project-Item ist, und schreibt das Datum nur, wenn der aktuelle Project-Wert leer ist.

Die [Organisationsfeld-Implementierung](../../archived/process/2026-08-31-pr-opened-issue-start-dates.md) hält die überholte Entscheidung zur projektübergreifenden Eigentümerschaft und ihre Begründung zum Ereigniszeitpunkt fest. Ereignisgesteuerte Status-Übergänge bleiben im Eigentum der [Lebenszyklus-Entscheidung](2026-08-10-event-directed-pr-review-status.de.md).

## Verifikation

Die [Issue-Management-Tests](../../../../.github/issue-management/policy.test.mjs) verlangen Project-Custom-Fields für Priority und Start Date, beweisen, dass Repository- und Project-Lesevorgänge getrennte Anmeldedaten verwenden, decken die Shanghai-Datumsgrenze, das Nur-bei-opened-Dispatch, Schreiben bei leerem Wert, Erhalt bestehender Werte und fehlende Project-Items ab und fixieren `updateProjectV2ItemFieldValue`. Workflow-Tests fixieren die Nur-Lesen-Berechtigung des Project-Tokens. Das Entfernen eines Organisationsfelds erfordert den Vergleich jedes Legacy-Werts mit seinem Project-Wert, einschließlich archivierter Project-Items.

## Erwogene Alternativen

**Organisations-Issue-Felder beibehalten.** Sie machen einen Wert projektübergreifend sichtbar, doch der Workflow braucht diesen Geltungsbereich nicht, und die GitHub App erforderte einen separaten Zugriff auf Organisations-Issue-Fields.

**Issue- und Project-Felder doppelt schreiben.** Gespiegelte Felder behalten projektübergreifende Sichtbarkeit, doch jeder Schreiber und jede manuelle Bearbeitung kann Drift erzeugen und erfordert eine Abgleichs-Policy.

**Jedes abonnierte Pull-Request-Ereignis verarbeiten oder Start Date überschreiben.** Spätere Ereignisse könnten fehlende Daten nachziehen, würden aber Termine erst nach Arbeitsbeginn vergeben oder einen manuellen Plan ersetzen. Der Initialisierer behält daher das Nur-bei-opened-, Nur-bei-leerem-Wert-Verhalten.

## Konsequenzen

Planungsmetadaten sind auf eine Project-Mitgliedschaft begrenzt. Derselbe Issue kann in einem anderen Project andere Werte haben, und ein Issue außerhalb von `DSH Issue Management` hat keine projekt-lokalen Planungswerte.

Die GitHub App braucht Project-Zugriff statt Organisations-Issue-Fields-Zugriff für Policy-Metadaten. Feldumbenennungen oder Typänderungen lassen den Workflow fehlschlagen, statt auf Legacy-Felder zurückzufallen.

Das Lesen bei leerem Wert macht gewöhnliche Wiederholungen idempotent. Project-Feldaktualisierungen haben keine Compare-and-set-Vorbedingung, daher können gleichzeitige Pull Requests beide ein leeres Start Date beobachten und die letzte Mutation gewinnen.
