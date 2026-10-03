# Agent Note: pwsh-Tool auf Bash-Parität
[English](2026-08-02-pwsh-tool-bash-parity.md) | [中文](2026-08-02-pwsh-tool-bash-parity.zh.md) | Deutsch

Status: implemented


## Problem

Die erste Windows-native Grundlage lieferte `dsh-tool-pwsh` als bewusst minimales Profil aus — nur Vordergrund (ein frischer Prozess pro Aufruf, keine persistente PTY-Sitzung), keine Parität der verwalteten Umgebung über drei hartkodierte `DSH_*`-Schlüssel hinaus und eine Marker-Regel („immer `[exit code: N]`"), die undeclariert vom Rendering des Bash-Tools abwich. Der modellsichtbare Vertrag driftete von der Implementierung weg: Die Beschreibung versprach eine Meldung von spill-Pfaden, die der Renderer nie ausführte, die README behauptete nicht existierende Exports und ein Rendering, das das Tool nicht leistete, und die eigenen Tests des Tools fixierten das verlustbehaftete Verhalten. Das minimale Profil ließ außerdem die `DSH_*`-Contributor-Seam durch Abwesenheit dupliziert: Plugins, die Umgebungsfakten zu `ctx.shellEnv` beisteuerten, wirkten auf pwsh-Aufrufe nicht.

## Entscheidung

`dsh-tool-pwsh` spiegelt `dsh-tool-bash` nun Aufruf für Aufruf, und sein modellsichtbarer Text beschreibt exakt dieses Verhalten:

- **Das Rendering übernimmt die Bash-Regel wörtlich**: stdout, ein markierter `[stderr]`-Abschnitt, Truncation-Hinweise mit spill-Pfaden, `(no output)` für einen leeren Body und Exit-Marker nur bei Nicht-Null-Exits — ein sauberer Exit erzeugt keinen Marker. Die Beschreibung und der `tool:pwsh`-Prompt-Abschnitt stellen das präzise dar („Non-zero exits are reported as `[exit code: N]` markers") und kopieren bewusst nicht die „every result"-Formulierung des Bash-Prompts, die dessen eigener Renderer widerlegt.
- **`run_in_background` ist über die generische Job-Laufzeit verdrahtet**, exakt wie beim Bash-Tool: Preflight, Owner-Registrierung, `job_output`/`job_kill`-Steuerung und dieselbe Ergebnis-Abbildung. Der bereits gespiegelte `start()`-Handle von `pwsh-local` trägt sie.
- **Die `DSH_*`-Umgebung wird geteilt statt dupliziert**: `ShellEnvRegistry` zog aus `dsh-tool-bash` in ein neues tool-unabhängiges Paket `@deepseek-ai/dsh-shell-env` um (`ctx.shellEnv` + Built-ins + der Session-Persistenz-Contributor), und beide Shell-Tools injizieren es. Contributors gelten für pwsh-Aufrufe exakt wie für Bash-Aufrufe; die Verantwortung für die geteilte Umgebung liegt damit außerhalb beider modellzugewandten Shell-Tools.
- **Windows-Realität ist dort fixiert, wo Bash kein Analogon hat**: Jeder Befehl läuft unter einer UTF-8-Ausgabe-Präambel, damit der Windows-PowerShell-5.1-Fallback Nicht-ASCII-Ausgabe nicht über den UTF-8-dekodierenden Collector verstümmeln kann, und die Prompts lehren, dass erzwungene Windows-Terminierung als Exit 1 ohne Signal-Marker abgerechnet wird.
- **Außerhalb des Scopes, unverändert**: persistente PTY-Shells (Backends sind Linux/macOS-only; ConPTY ist Roadmap-Arbeit). Sandbox-Eskalation wurde später mit der [Windows-ACL-Sandbox-Entscheidung](2026-08-08-windows-acl-restricted-token-sandbox.de.md) geliefert — das pwsh-Tool trägt jetzt das Sandbox-Denial-Rendering und die `sandbox_permissions`-Eskalationsfläche derselben Runde plus den Windows-ConstrainedLanguage-Vertrag in seiner Beschreibung. Die pwsh-spezifische Terminal-Karte mit Exit-Pill wurde separat mit der Entscheidung [pwsh-UI-Präsentation auf Bash-Niveau](../../archived/feature/2026-08-05-pwsh-ui-bash-parity.md) geliefert.

## Erwogene Alternativen

**Das minimale Profil behalten und nur die Behauptungen korrigieren.** Verworfen: Von Bash kopierte Textverträge driften ohne die zugehörige Implementierung; ein minimales Tool mit korrekten Behauptungen ließe pwsh-Aufrufe weiterhin ohne Hintergrundausführung, ohne Contributor-Parität und mit einer divergenten Marker-Regel, die ewig neu begründet werden müsste.

**Einen nicht passenden Executor-Dialekt beim Laden ablehnen.** Vor dem Merge versucht und zurückgenommen: ein `ShellDialect`-Marker (`bash` | `powershell`) auf `ShellExecutor`, bei dem beide Shell-Tools werfen, wenn der gemountete Executor eine andere Shell spricht. Er zwang jede Executor-Implementierung — einschließlich jedes Test- und Beispiel-Fake —, einen Dialekt zu deklarieren, und fügte jedem Shell-Tool-Test Rauschen für eine Schutzvorrichtung hinzu, die weder im Repo noch in plausiblen Deployments etwas abfängt (ausgelieferte Kompositionen paaren tool-pwsh immer mit `dsh-pwsh-local` und tool-bash mit `dsh-bash-local`). Der Pairing-Vertrag bleibt stattdessen in der README jedes Tools dokumentiert.

**Eine vollständig geteilte Tool-Implementierungsbasis extrahieren (abstrakter Shell-Dialekt, zwei dünne Blätter).** Erwogen und vertagt: Die Shell-Env-Extraktion und der strukturelle Spiegel (`render.ts`/`background.ts`-Zwillinge) sind das Fundament, auf dem sie ruhen würde; eine vollständige Basis wartet, bis ein dritter Dialekt oder der persistente PTY-Zwilling die Form der Abstraktion beobachtbar macht.

## Konsequenzen

- Bash- und pwsh-Tool sind für Vordergrund-, Hintergrund- und Sandbox-Shell-Arbeit verhaltensgleich austauschbar (die Sandbox-Oberfläche gehört der Windows-ACL-Sandbox-Entscheidung), und die Renderer-Abdeckung fixiert jeden pwsh-Prompt- und Beschreibungssatz.
- Die Parität lief einmal in BEIDE Richtungen: Der strukturierte Vordergrund-Abort des pwsh-Tools (`HarnessError('tool call aborted', TOOL_ABORTED)` mit Name `AbortError`) wurde in das Bash-Tool zurückportiert und ersetzte dessen uncodiertes `Error('command aborted')` — eine modellsichtbare/geloggte Änderung, fixiert durch Exact-Shape-Tests auf beiden Seiten und durch die cancel-tool-calls-Fixture.
- `@deepseek-ai/dsh-shell-env` ist ein neues ausgeliefertes Paket; die `dshHome`-Config von `dsh-tool-bash` zog dorthin um, sodass Kompositionen, die die Shell-Tools mounten, auch `shell-env` mounten müssen (die Spine-Bundles tun es).
- Windows-spezifische Semantik (CRLF-Normalisierung, erzwungene-Terminierung Exit-1/Signal-null, POSIX-only Self-Signal) bleibt wie bisher testfixiert.
- Das per-file Coverage-Gate des pwsh-Tools ruht auf der skriptbaren Fake-Executor-Suite (`tests/tools.spec.ts`); die echten pwsh-Integrations- und Loader-Kompositions-Suites skippen selbstständig, wo `pwsh` fehlt — gespiegelt zur Arbeitsteilung der Bash-Suites.
- Die Paritätsstufe des Roadmap-Vorschlags ist geliefert; die Terminal-Karten-Präsentationsstufe wurde mit der Entscheidung [pwsh-UI-Präsentation auf Bash-Niveau](../../archived/feature/2026-08-05-pwsh-ui-bash-parity.md) ausgeliefert (die TUI selbst wurde entfernt); verbleibende Stufe ist die Windows-Default-Komposition.
