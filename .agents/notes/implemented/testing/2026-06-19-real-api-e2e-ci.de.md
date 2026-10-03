# Agent Note: Real-API e2e in CI gegen die externe DeepSeek-API

Status: implemented

[English](2026-06-19-real-api-e2e-ci.md) | [中文](2026-06-19-real-api-e2e-ci.zh.md) | Deutsch

## Problem

Der harness setzt per Policy stark auf Real-API-Tests: [docs/testing.md](../../../../docs/testing.de.md) argumentiert, dass eine Suite ohne Key nur das Plumbing beweist, nicht das Produkt, und das [ACP-inject-postmortem](../../../../docs/postmortem/0001-acp-default-export-drops-inject.de.md) ist der stehende Beweis — 178 keyless Tests blieben grün, während eine echte ACP-Client-Session sofort abstürzte. Die Real-API-e2e-Suite (`pnpm run test:e2e`, die `*.e2e.ts`-Dateien) existiert genau, um diese Lücke zu schließen: Sie treibt den agent gegen die live DeepSeek-API — echte Modellaufrufe, echte bash-Tools, multi-turn, resume, ACP-over-stdio.

Das Default-Gate ([.github/workflows/ci.yml](../../../../.github/workflows/ci.yml)) ist bewusst keyless: Es trägt kein Secret und läuft für Forks. `test:e2e` überspringt sich ohne Key selbst (`describe.skipIf(!process.env.DEEPSEEK_API_KEY)`), sodass seine Aufnahme dort grün melden würde, ohne die echte Suite auszuführen. Ein separater Secret-führender Workflow ist nötig, um Real-API-Abdeckung zu einem Merge-Signal zu machen.

## Entscheidung

Ein dedizierter Workflow, [.github/workflows/e2e.yml](../../../../.github/workflows/e2e.yml), getrennt von ci.yml, führt nur `pnpm run test:e2e` gegen die externe API aus — mit einem Repo-Secret, auf vertrauenswürdigen Events, mit einem Preflight, der ein fehlendes Secret in einen lauten Fehler statt in ein falsches Grün verwandelt. Der keyless Workflow bleibt getrennt, damit forkable Quality Gates und Secret-verbrauchende Real-API-Gates unterschiedliche Trigger- und Credential-Policies behalten.

### Ein separater Workflow, kein Job in ci.yml

Der Wert von ci.yml liegt darin, dass er keyless, forkable und immer grün ist: Jeder Contributor (einschließlich eines externen Forks) erhält ein vollständiges keyless Signal ohne Secret in der Auswirkungszone. Ein Secret-verbrauchender Job dort würde dieses immer-grüne Gate an Credential-Verfügbarkeit und eine andere Trigger-Policy koppeln. Die Secret-führende Arbeit in einer eigenen Datei zu halten isoliert Secret-, Trigger- und Concurrency-Policy und bewahrt die Eigenschaft von ci.yml für Forks. Unterschiedliche Lebenszyklen → unterschiedliche Dateien.

### Kosten sind nicht die Einschränkung; Zuverlässigkeit ist es

Die internen Inferenzkosten sind nicht die begrenzende Einschränkung, daher optimiert der Workflow auf Abdeckung und Signal. Er führt jede passende `*.e2e.ts`-Datei auf mehreren Triggern und auf jedem vertrauenswürdigen PR aus und setzt damit die With-key-Policy von [docs/testing.md](../../../../docs/testing.de.md) um.

### Trigger: nur vertrauenswürdige Events

`workflow_dispatch` + `push` auf `main`/`master` + nächtlicher `schedule` (`17 0 * * *`, 08:17 Asia/Shanghai) + `pull_request`. Push liefert ein Post-Merge-Signal; schedule fängt Drift der externen API auf; dispatch ist der manuelle Ausweg; und vertrauenswürdige Pull Requests erhalten ein Pre-Merge-Gate. Dieses Pre-Merge-Signal akzeptiert bewusst die größere Schlüssel-Expositionsfläche, die unter § Sicherheit beschrieben ist.

### Das Gate für nicht vertrauenswürdige PRs

GitHub hält Repo-Secrets von zwei PR-Arten zurück: solche von **Forks** und **Dependabot**-PRs (Branch im selben Repo, also `head.repo.fork == false`, aber Secrets werden trotzdem zurückgehalten). Ein Job-Level-`if:` überspringt für beide den gesamten Job:

```
github.event_name != 'pull_request'
  || !(github.event.pull_request.head.repo.fork || github.event.pull_request.user.login == 'dependabot[bot]')
```

Die Dependabot-Klausel prüft den PR-**Autor** (`pull_request.user.login`), nicht `github.actor` (den Auslöser des Laufs): Ein Maintainer, der einen Dependabot-PR erneut öffnet oder erneut ausführt, würde `github.actor` zu einem Menschen machen, während der PR weiterhin keyless ist; ein autor-basierter Test bleibt darüber korrekt. Ein durch ein **Job-Level**-`if:` übersprungener Job wird als *erfolgreicher* Check gemeldet (anders als ein Workflow-/Trigger-Level-Skip, der pending bleibt); dieser Workflow kann daher bei Bedarf gefahrlos als required status check markiert werden — der übersprungene, aber grüne Check eines Fork-/Dependabot-PRs blockiert den Merge nicht.

Das Gate ist eine *Clean-Skip-Annehmlichkeit*, nicht die Sicherheitsgrenze des Secrets (siehe § Sicherheit — die Grenze ist GitHubs eigenes Zurückhalten von Fork-Secrets unter `pull_request`). Ohne das Gate könnten Forks den Schlüssel immer noch nicht lesen; sie würden nur auf einen verwirrenden Preflight-Hard-Fail stoßen und Rechenzeit verschwenden.

### Preflight: laut scheitern, niemals falsch grün

Da der Job nur auf vertrauenswürdigen Events läuft, auf denen das Secret erwartet wird, ist der Preflight eine unbedingte Anwesenheitsprüfung: leerer Key → `exit 1` mit einer `::error::`-Annotation, die das zu konfigurierende Secret benennt. Das ist der Kern, der eine selbstüberspringende Suite sicher als Gate nutzbar macht. Ohne ihn würde ein gelöschtes/umbenanntes/falsch konfiguriertes Secret `test:e2e` jede echte Suite überspringen lassen und vollständig grün melden — eine stille Regression des gesamten Sicherheitsnetzes. Die Wache macht aus „Secret fehlt" einen sichtbaren Fehler statt eines unsichtbaren falschen Erfolgs. (Ihre Korrektheit wurde live verifiziert: Der Lauf vor Anlage des Secrets scheiterte exakt an diesem Schritt.)

### Secret-Mapping und Hygiene

Das Repo-Secret heißt `DEEPSEEK_API_KEY_EXTERNAL`; es wird auf die `DEEPSEEK_API_KEY`-Umgebungsvariable gemappt, die die Adapter und Tests lesen (`process.env.DEEPSEEK_API_KEY`). Der abweichende Secret-Name dokumentiert die Absicht (dies ist der Schlüssel der *externen* öffentlichen API, nicht eines internen Endpunkts) und lässt später einen internen Endpunkt-Key kollisionsfrei koexistieren. Hygiene-Entscheidungen, jeweils defensiv:

- **Step-scoped Secret.** `DEEPSEEK_API_KEY` wird nur im `env:` der Preflight- und e2e-Steps gesetzt, nie auf Job-Ebene — checkout/setup-node/install sehen es also nie. Ein kompromittiertes Install-Lifecycle-Script in einer Abhängigkeit kann kein Secret lesen, das nicht in seiner Umgebung liegt.
- **`permissions: contents: read`.** Der Job liest das Repo nur, um Tests auszuführen; er braucht keine Schreibscopes (keine PR-Kommentare, keine Status-Schreibzugriffe), sodass das `GITHUB_TOKEN` auf minimale Rechte fällt.
- **`DEEPSEEK_BASE_URL` auf `https://api.deepseek.com` gepinnt** im e2e-Step. Der Adapter würde dies bei fehlender Setzung defaulten ([packages/llm/llm-deepseek/src/index.ts](../../../../packages/llm/llm-deepseek/src/index.ts) `PUBLIC_BASE_URL`), aber das Pinnen ist selbstdokumentierend und hermetisch — eine verirrte `.env` im Repo-Root (die `vitest.e2e.config.ts` lädt, falls vorhanden) kann den Lauf nicht still auf einen anderen Endpunkt umleiten.
- **Kein Secret-Echo.** Der Preflight gibt nur `DEEPSEEK_API_KEY present.` aus — weder Wert noch Länge.

### Umfang, Laufzeitform

Der Job führt nur `test:e2e` auf Node 24 aus; keyless Gates und Versionskompatibilität gehören dem Haupt-CI-Workflow. Tests laufen ungebaut über die workspace-Paths-Map mit einem begrenzten konfigurierbaren worker-Pool, Retries pro Test und einem Job-Timeout. Die [Cancellation-Policy für überholte CI](../process/2026-09-09-cancel-superseded-ci.de.md) bricht ältere Läufe derselben Workflow-/Ref-Gruppe über PR-, Push-, Schedule- und manuelle Trigger hinweg ab; ein Post-Merge- oder Nightly-Trigger garantiert keinen Abschluss.

Die DeepSeek-native `web_search`-Probe ist registriert, wird aber übersprungen. Der live Anthropic-kompatible Endpunkt kann eine erfolgreiche Antwort ohne strukturierte source blocks liefern, sodass deren Positive-source-Assertion kein zuverlässiges Merge-Signal ist; die Unit-Abdeckung pinnt weiterhin das Response-Parsing, aber die CI beweist die live source-block wire shape nicht.

## Sicherheit

Das erste CI-Secret des Repos erfordert ein dokumentiertes Bedrohungsmodell, weil der Zugriff zwischen Same-repository-, Fork- und Dependabot-Pull-Requests verschieden ist und sich ändert, wenn das Repository öffentlich wird.

### Wer das Secret in einem privaten Repository erreichen kann

- **Kein Schreibzugriff (Fork-PRs): nein.** Zwei unabhängige Fakten blockieren es. Erstens nutzt der Workflow `pull_request`, **nicht** `pull_request_target` — GitHub reicht Repo-Secrets nicht an `pull_request`-Läufe von Fork-PRs weiter, sodass `secrets.DEEPSEEK_API_KEY_EXTERNAL` auf einem Fork-Runner leer auflöst. Zweitens überspringt das `if:`-Gate Fork-PRs vollständig. Das Zurückhalten ist die echte Grenze; das Gate ist Defense-in-Depth und UX.
- **Schreibzugriff (Push): ja.** Ein Same-Repo-Branch-PR erhält Secrets, also könnte ein Autor mit Schreibzugriff Testcode (oder ein Install-Lifecycle-Script oder das Workflow-YAML auf seinem Branch) so ändern, dass der Schlüssel exfiltriert wird. Das ist **GitHub Actions inhärent, nicht hier eingeführt**: Jeder mit Push-Zugriff auf ein Repo kann bereits jedes seiner Actions-Secrets exfiltrieren, indem er einen Workflow authored. Schreibzugriff ⇒ Secret-Zugriff, immer. Die Abschwächung liegt darin, wem Schreibzugriff gewährt wird, und in Branch Protection, nicht in dieser Datei.

„Jeder, der einen PR öffnen kann, kann ihn stehlen" ist daher falsch: Nur die Schreibzugriff-Menge kann es, und die konnte schon jedes Secret stehlen, das das Repo hält.

### Die zusätzliche Restexposition durch den `pull_request`-Trigger

Da PR-Läufe aktiviert sind, wird der Schlüssel vor dem Merge an **den Code auf dem PR-Branch eines Autors mit Schreibzugriff** ausgehändigt. Das ist eine größere Angriffsfläche als `push` + `schedule` + `workflow_dispatch` und wird für ein Pre-Merge-Signal innerhalb der vertrauenswürdigen Schreibzugriff-Menge akzeptiert. Ändert sich diese Abwägung, kann der `pull_request`-Trigger entfernt werden, während Post-Merge-, Nightly- und On-demand-Abdeckung bleiben.

### Was sich ändert, wenn das Repo öffentlich wird

Das Secret bleibt **durch diesen Workflow** vor der Öffentlichkeit geschützt: `pull_request` verhält sich auf einem öffentlichen Repo identisch — Fork-PRs (die dann jeder öffnen kann) erhalten weiterhin kein Secret, und auf öffentlichen Repos hängt GitHub Fork-PR-Läufe zusätzlich hinter Maintainer-Freigabe, wobei selbst ein freigegebener Lauf kein Secret erhält (den Lauf freizugeben heißt nicht, den Schlüssel auszuhändigen). Die Schreibzugriff-Menge ändert sich mit der Sichtbarkeit nicht, also ändert sich auch die Insider-Realität nicht.

Was sich verschlechtert, ist das *umgebende* Modell; folgende Punkte sind vor dem Umschalten der Sichtbarkeit anzugehen:

- **Logs werden weltweit lesbar.** Ein fahrlässiges Secret-Echo, das an Organisationsmitglieder leckt, würde an das gesamte Internet lecken und binnen Minuten gescraped. Disziplin im Secret-Umgang (keine Wert-/Längen-Echos — bereits umgesetzt) wird erheblich wichtiger.
- **Die `pull_request_target`-Falle wird katastrophal.** Wenn je jemand PR-Läufe „repariert", indem er den Trigger auf `pull_request_target` umstellt, würde der Workflow nicht vertrauenswürdigen Fork-Code im Base-Repo-Kontext **mit** Secrets ausführen — ein vollständiger Schlüssel-Leck-Vektor. Auf einem privaten Repo ist das halbwegs harmlos, auf einem öffentlichen desaströs. Ein `SECURITY —`-Kommentar am Trigger in e2e.yml verbietet die Änderung und verweist hierher.
- **Bei Umstellung rotieren.** Der Schlüssel lebte in der CI eines privaten Repos; das Going-public gilt als „assume exposed" — `DEEPSEEK_API_KEY_EXTERNAL` in diesem Moment rotieren.
- **Das Secret hinter Kontrollen legen.** Sicherstellen, dass Settings → Actions → *"Send secrets to workflows from fork pull requests"* **aus** bleibt (die eine Einstellung, die die Fork-Grenze tatsächlich brechen würde), und erwägen, den Schlüssel in ein GitHub-**Environment** mit required reviewers zu verschieben, damit selbst gemergter Code ihn nur unter kontrollierten Bedingungen nutzt und die Rotation ein einziges Zuhause hat.

Nichts davon erfordert eine Workflow-Änderung für das Going-public; es sind operative Schritte plus der bereits hinzugefügte `pull_request_target`-Schutzkommentar.

## Erwogene Alternativen

- **Ein Secret-verbrauchender Job innerhalb von ci.yml** — abgelehnt: Er würde das keyless, forkable, immer-grüne Gate an Credential-Verfügbarkeit und eine andere Trigger-/Concurrency-Policy koppeln; unterschiedliche Lebenszyklen, unterschiedliche Dateien.
- **Weglassen des `pull_request`-Triggers** (die kleinere Schlüssel-Expositionsfläche) — abgelehnt zugunsten des Pre-Merge-Signals; der Abschnitt Sicherheit trägt die akzeptierte Expositionsanalyse.

## Konsequenzen

Ein zweiter CI-Workflow und das erste zu pflegende Repo-Secret. Die Real-API-Suite gated jetzt Merges (pre-merge auf vertrauenswürdigen PRs, post-merge auf dem Hauptbranch) und läuft nächtlich, sodass ein echter Bruch in der Interaktion des agent mit der externen API in der CI sichtbar wird statt nur im lokalen Lauf eines Entwicklers — auf Kosten echter (aber intern freier) API-Aufrufe bei jedem vertrauenswürdigen PR und Merge. Der Preflight macht Secret-Fehlkonfiguration selbstmeldend statt das Netz still abzuschalten.

Das Design trägt eine dokumentierte Einschränkungsfläche: den Key-Exposition-Trade-off des `pull_request`-Triggers (zum Härten entfernen), die Abhängigkeit des `if:`-Gates vom autor-basierten Dependabot-Test und das harte Verbot von `pull_request_target`. Die Going-public-Checkliste oben ist der operative Begleiter — diese Agent Note ist die Stelle, die ein künftiger Maintainer erneut lesen sollte, bevor er die Trigger-Menge ändert oder die Repo-Sichtbarkeit umschaltet, statt das Fork-/Secret-Modell von Grund auf neu herzuleiten.

Der schedule-Trigger deaktiviert sich nach 60 Tagen Repo-Inaktivität selbst (ein GitHub-Verhalten); Push/PR/Dispatch sind Rückfänge, und ein aktives monorepo erreicht das nicht. Runner-Egress zu `https://api.deepseek.com` wird vorausgesetzt — GitHub-hosted `ubuntu-latest` hat ihn; ein egress-beschränkter self-hosted Runner müsste die Konnektivität bestätigen, bevor man sich auf den Nightly verlässt.
