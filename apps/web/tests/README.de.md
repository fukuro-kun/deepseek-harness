# apps/web Browser-e2e

[English](README.md) | [中文](README.zh.md) | Deutsch

Diese Tests booten die echte Web-Komposition in-process und steuern sie mit einem echten Chromium über echtes HTTP. Die Mechanik der Lane — Modi, Fixtures, Goldens und die bewussten Kompositionsabweichungen von `dsh web` — ist in [`scaffold.ts`](scaffold.ts) und im [Browser-e2e-Agent-Note](../../../.agents/notes/implemented/testing/2026-07-24-web-gui-browser-e2e-lane.de.md) dokumentiert.

## Completion-Beobachtungen

Zustandsabhängige Fälle verwenden Workspace-, Admission-, Attachment- und Modell-Stream-Barrieren, um sichtbare Zwischenzustände von abgeschlossenen Operationen zu trennen. Details-Close wartet auf Frame-Transitions; die Archiv-Verifikation vergibt einen expliziten Titel an die geseedete Session und verfolgt diese Identität über einen Reload hinweg. Siehe die [CI-Fixture-Synchronisationsentscheidung](../../../.agents/notes/implemented/testing/2026-09-08-ci-completion-observations.de.md).

## Das sind Host-seitige Tests

Sie werden im Root-`tsconfig.host.json` typegecheckt, nicht im Client-Aggregat, weil sie Host-Services direkt lesen: `ctx.connection`, den Host-`SessionStore` und `ctx.sessionProjectionCache`. Einen Browser zur Laufzeit zu steuern macht eine Datei nicht zum Teil des Client-Programms — die beiden Faces mergen den cordis-`Context` unter denselben Keys mit unterschiedlichen Services, sodass ein einzelnes Programm nicht beide sehen kann. Diese Dateien in das Client-Aggregat zu verschieben lässt jeden Host-Service-Zugriff beim Kompilieren scheitern.

## Hier kein `@deepseek-ai/dsh-client-*` importieren

Der Import eines Client-Pakets — ob Wert oder Typ — zieht dessen gesamtes TypeScript-Projekt und jedes referenzierte Projekt in den **Host-Build-Graphen**. Das hat diese Lane schon einmal gebissen: Vier Client-Consumer-Pakete referenzieren die Client-Face von `api/remotes`, die erst kompilieren kann, wenn Host-tsdown `@deepseek-ai/dsh-goal/remote` generiert hat — die Host-Build-Phase wartete am Ende auf ein Artefakt, das sie selbst erzeugt.

Braucht ein Szenario eine Client-eigene Konstante oder reine Funktion, spiegle sie stattdessen hier, direkt neben dem auskommentierten Import, der das Quellmodul nennt. Drift zeigt sich dann als verfehlter Selektor oder veralteter Spiegelwert — ein lauter Fehlschlag, niemals ein stiller Pass. `scaffold.ts` folgt dieser Regel für den Welcome-Notice-Namespace, das Acknowledgement-Feld, die Version und den assertierten chinesischen Text.

Eine Art von Client-Import bleibt bestehen. `assembled-boot.ts` treibt die Shell selbst und importiert daher `AppWebEntry` aus `@deepseek-ai/dsh-client-web` sowie den Boot-Manifest-Typ aus `@deepseek-ai/dsh-client-modules/client`: Die echte Shell zu booten ist genau der Zweck dieses Harness, und beide Pakete sind bereits im Host-Graph. Die Chat-Szenarien spiegeln stattdessen `conversationContextKey` in `support.ts`, statt dessen Client-Owner zu importieren.

Nichts erzwingt diese Regel mechanisch; sichere sie im Review ab.
