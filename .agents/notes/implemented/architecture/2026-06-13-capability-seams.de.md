# Agent Note: Capability seams — Service Definition / Service Provider / Consumer-Rollen

Status: implemented

[English](2026-06-13-capability-seams.md) | [中文](2026-06-13-capability-seams.zh.md) | Deutsch

## Problem

Der harness hat austauschbare capabilities, darunter shell-Ausführung und model providers. Eine capability hat drei concerns, die mit unterschiedlichen Raten und aus unterschiedlichen Gründen ändern: der *contract* (was die capability ist), die *implementation* (wie sie läuft) und die *consumer API* (wogegen das model und andere plugins programmieren). Sie in einem package zu bündeln, koppelt diese Änderungsraten — der Austausch eines lokalen executors gegen einen sandboxed executor würde die tool schemas, die das model sieht, in Unruhe versetzen, obwohl sich der model-facing contract nie geändert hat.

Das unterscheidet sich von "wer liefert zur Laufzeit eine capability, wer braucht sie", was Cordis bereits mit services + `inject` beantwortet (ein provider registriert `ctx.shell`; ein consumer deklariert `inject: ['bash']`, und seine fiber pendet, bis der service existiert). Dieser Mechanismus ist nötig, bestimmt aber keine package-Grenzen; das tut dieser Agent Note.

## Entscheidung

Eine austauschbare capability hat **drei Rollen**:

1. **Service Definition** — der Cordis `Service` und die vocabulary-Typen, die `ctx.<key>` besitzen und nur von der vocabulary abhängen, die der contract braucht (z. B. `dsh-shell`: `ShellExecutor`, `ShellRunResult`, `ShellProcess`). Eine Definition kann eine abstrakte Klasse oder ein konkretes registry service sein; niemals ein TypeScript `interface`.
2. **Service Provider** — ein plugin, das eine implementation liefert oder registriert (z. B. `dsh-bash-local`: subprocesses, provider-verwaltete range termination, spill-file-Truncation). Die [native-containment decision](2026-08-28-subprocess-native-containment.de.md) besitzt die OS-spezifischen range mechanics des lokalen providers. Sandboxte und remote providers sind sibling packages, die gegen dieselbe Service Definition implementieren oder registrieren.
3. **Consumer** — wogegen das model und plugins programmieren (z. B. `dsh-tool-bash`: das `bash` schema, mit background handles, die in die generische job runtime registriert werden). Consumers injizieren den service key und importieren nie provider-spezifische Typen.

Die Rollennamen verwenden Title Case: **Service Definition**, **Service Provider** und **Consumer**. Generische Verwendungen von `provider` und `consumer` bleiben klein.

Service Providers und Consumers entwickeln sich dann unabhängig: ein sandboxter executor ersetzt `dsh-bash-local`, ohne ein tool schema anzufassen.

Rollen verwenden normalerweise separate packages, wenn sie sich unabhängig entwickeln, aber die Aufteilung ist nicht obligatorisch, wenn die Rollen genuinely ein einziger concern sind: der LLM seam faltet Service Definition und Consumer in `dsh-llm` zusammen (der Consumer ist der loop selbst, keine austauschbare schema-surface) mit adapters als Service Provider packages. Nicht vorsorglich aufteilen — eine capability mit einem denkbaren provider und einem Consumer bleibt ein package, bis ein zweiter erscheint.

## Terminologie: "seam" benennt das Trio, nicht die interface

Ein **seam** ist die gesamte capability — die drei Rollen zusammen: eine **Service Definition** (der Cordis `Service`, der `ctx.<key>` und die vocabulary besitzt), einen oder mehrere **Service Providers** und einen oder mehrere **Consumers**. `packages/shell` ist das kanonische Beispiel — `dsh-shell` / `dsh-bash-local`+`dsh-bash-sandbox` / `dsh-tool-bash`. Ein package kann mehrere Rollen besitzen, aber eine Rolle allein ist nicht das seam. Der Begriff "seam" ist dieser vollständigen capability vorbehalten; benenne eine Komponente nach ihrer Rolle, Klasse, ihrem service, contract oder extension point. Das [Glossar](../../../../docs/glossary.de.md#capability-seam) ist der kanonische Eintrag.

## In Betracht gezogene Alternativen

- **Die Rollen immer zusammenfassen** — abgelehnt, weil es unabhängig ändernde Service Definitions, providers und Consumers wieder koppelt.
- **`@cordisjs/plugin-capability`** — eine ganz andere Achse: es ist ein permission/capability-*security*-service (benannte permissions mit Vererbung, getestet gegen eine session über `ctx.capability.test`), ein Kandidat für die verschobene permissions/sandbox-Arbeit am `tools/pre-execute`-deny/ask-gate, KEIN Mechanismus zum Austausch von implementations. Die Verwechslung der beiden ("capability") ist die Falle, die dieser Agent Note benennt.

## Konsequenzen

Die Trennung der Rollen fügt packages und Boilerplate hinzu (`package.json`, `tsconfig`, README und injection wiring). Im Gegenzug shippen und versionieren Service Providers und Consumers unabhängig, und ein neues backend gefährdet den model-facing contract nie. [AGENTS.md](../../../../AGENTS.md) und [architecture.md](../../../../docs/architecture.de.md) tragen die Regel; das bash-Trio ist das Referenztemplate. Dieser Agent Note hält fest, warum unabhängig ändernde Rollen normalerweise aufgeteilt werden, während genuinely geteilte concerns zusammengefalten bleiben dürfen.
