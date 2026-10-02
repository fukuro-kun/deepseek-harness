---
description: "Geteiltes Subprocess- und Direct-Agent-Harness für schlüssellose Beispiel-Smoke-Tests, für Testautoren, die echte Loader-Kompositionen booten."
kind: "package-library"
---

# @deepseek-ai/dsh-loader-smoke

[English](README.md) | [中文](README.zh.md) | Deutsch

## Übersicht

`dsh-loader-smoke` verwenden, um ein Application-Fixture aus seinem echten Bin und seiner `cordis.yml` in einem isolierten temporären Directory zu booten — mit captured Output und Cleanup. `runFixtureTurn` treibt einen Task durch den konfigurierten Root-Agent und gibt den finalen Assistant-Text plus Token-Usage zurück. Tests können zwischen Zero-Build-Source-Ausführung und Built-Package-Ausführung wählen, sodass lokale und CI-Smoke-Tests jeweils den vorgesehenen Consumer-Pfad der Umgebung nutzen. Diese Support-Tier-Library ist für Testautoren, nicht für Produkt-Integrationen.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Lektüre](#further-exploration)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

Dieses Paket bootet ein Application-Fixture so, wie es ein installierter Consumer täte, und lässt einen Test das Ergebnis beobachten: Source- oder Built-Mode wählen, das Bin mit seiner Config aus einem isolierten cwd starten und entweder auf einen sauberen Exit warten oder einen Task durch den Root-Agent treiben.

### Ein Application-Fixture booten

`runLoaderSmoke` nimmt Bin- und Config-Pfade, optionale vollständige Bin-Argumente, Environment-Overrides, stdin, Pre-Run-Setup und Pre-Cleanup-Inspektion entgegen. Es besitzt das isolierte cwd, die DSH-Homes, Diagnostik, Deadline, Termination, EOF und Cleanup und gibt beide Streams nach einem Zero-Exit zurück oder rejected mit beiden Streams bei einem Fehlschlag:

```text
const result = await runLoaderSmoke({
  label: 'acp-agent',
  tempDirPrefix: 'acp-smoke-',
  binScript: '/abs/path/to/src/bin.ts',
  configPath: '/abs/path/to/cordis.yml',
  tsconfigPath: '/abs/path/to/tsconfig.json',
})
```

`expectedExitCode` setzen, wenn das Szenario eine designte Failure-Surface festschreibt — ein One-Shot-Turn, der in einem Error-Result endet — und ein Run, der auf irgendeine andere Weise exited, einschließlich Erfolg, lässt den Smoke trotzdem fehlschlagen.

### Ein Shipped-Profile testen

Profile-Integration-Driver verwenden den Repository-only-Helper `tests/fixtures/production-profile.ts`. Er lädt das benannte Shipped-Profile und seine Bundle-Patches über `loadProfile`, gleicht den Module-Fallback des Profils ab und reicht die Bundle-Patches gefolgt von den `*.patch.yml`-Dateien des Tests an das root `cordis:include` weiter, das `boot` mountet. Diese Patches sollten nur den Test-Provider oder das Test-Model, isolierte Persistence-Pfade und subjectspezifische Änderungen enthalten. Paket-Level-Unit-Tests, die einen Agent-Loop ohne Profile-Integration brauchen, mounten stattdessen lokal `dsh-agent-loop-testkit`.

### Einen Fixture-Turn treiben

`runFixtureTurn(ctx, options)` treibt einen Task durch exakt einen konfigurierten Root-Agent: Es wartet, bis der Task die durable Inbox erreicht, forwarded kanonische Events an deinen Observer, flusht die Session und gibt den finalen Assistant-Text plus akkumulierter Usage zurück. Beispiel-lokale Driver behalten die Ownership für Konfiguration, Rendering und Assertions.

### Source- oder Built-Mode

`resolveExampleLaunch` wählt das Artefakt, von dem ein Beispiel-Bin bootet. Der `src`-Mode läuft das Bin unter tsx mit gesetztem `TSX_TSCONFIG_PATH`, sodass Workspace-Imports über die tsconfig-`paths`-Map auflösen — der Zero-Build-Dev-Pfad. Der `lib`-Mode läuft das gebaute `lib/`-Bin unter plain Node, sodass Bare-Package-Plugins über echte Package-`exports` auflösen, exakt wie ein installierter Consumer sie auflöst. Der Mode kommt aus einem expliziten Wert oder `DSH_EXAMPLE_MODE` (CI setzt `lib`, Dev lässt ihn unset); alles andere schlägt laut fehl.

### Was schiefgehen kann

- **Der Prozess exited nie** — der Smoke erzwingt eine Deadline und meldet die captured Streams im Failure; ein fehlerhaftes Fixture, das einen eigenen Prozessbaum spawnt, kann den Smoke überleben und braucht externes Cleanup.
- **Built-Mode braucht einen vorherigen Build** — vor dem Wählen von `DSH_EXAMPLE_MODE=lib` `pnpm run build` ausführen; das besitzende Package-Manifest muss außerdem jedes von der Config benannte Paket deklarieren.
- **Captured Output ist durch execas Default-`maxBuffer` von 100 MB begrenzt** — ein ausufernder Child wird an dieser Obergrenze terminiert, nicht an einem vom Smoke gewählten Budget.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt das Design des Harness; das beobachtbare Verhalten ist vollständig in [Dieses Paket verwenden](#use-this-package) beschrieben.

### Design

Das Harness baut auf einer Trennung auf: Der Smoke läuft in einem Child-Prozess unter einer isolierten Welt, und der Testprozess beobachtet und assertet nur. `runLoaderSmoke` legt ein temporäres cwd an, bereitet dort den Weltzustand vor, spawnt das resolved Bin mit isolierten DSH-Homes (`DSH_HOME`, `DSH_AGENTS_HOME` unter dem Temp-cwd), schließt stdin sofort und awaitet einen sauberen Exit innerhalb der Deadline, bevor es bei jedem Ausgang inspiziert und aufräumt. `runFixtureTurn` bleibt in-process: Es schlägt den einzelnen Root-Agent der Komposition nach, verfolgt den Task von seinem durable Inbox-Receipt bis zum Gesamt-Agent-Idle, summiert die Per-Step-Usage und flusht die Session vor der Rückkehr.

### Quellcode-Karte

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | Mode-Resolver, `runLoaderSmoke`-Subprocess-Harness, Options- und Result-Typen |
| [`src/agent-turn.ts`](src/agent-turn.ts) | `runFixtureTurn`-Direct-Agent-Driver und Result-Envelope |
| — | Es wird kein Runtime-Invariant-Companion veröffentlicht; dieses Test-Support-Paket besitzt keinen Produktions-Event-Stream und keine mutablen Daten; konsumierende Test-Suiten üben sein Verhalten aus. |
| [`tests/fixtures/production-profile.ts`](tests/fixtures/production-profile.ts) | Repository-only Shipped-Profile-Kompositions-Helper für Integrations-Fixtures |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten lesen, wenn der paketweite Contract nicht ausreicht. Sie bewegen sich vom Harness zu der Komposition, die es bootet, und den Fixtures, die es bedient.

- [llm-replay](../llm-replay/README.de.md) — das schlüssellose Model-Fixture, das Smoke-Kompositionen mounten, um ohne Provider-Key zu laufen.
- [Agent-Paket](../../core/agent/README.de.md) — der Root-Agent, den `runFixtureTurn` treibt.
- [Testing-Policy](../../../docs/testing.de.md) — die schlüssellosen Snapshot- und Smoke-Tiers.
- [Test-Support-Gruppenkarte](../README.de.md) — Schwester-Harnesses und Support-Pakete.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Test-Harness nur den gewöhnlichen User-Task des konsumierenden Tests einreicht und Prompt- und Tool-Komposition an den geladenen Baum delegiert.

#### KV-Cache-Effekt

Keiner über den geladenen Baum hinaus; der Helper ändert weder das Request-Präfix noch hält er State über Runs hinweg.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Harness besondere Sorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein Aufgabenstau.

- **Built-Mode erfordert einen vorherigen Build** — das besitzende Package-Manifest muss außerdem jedes von der Config benannte Paket deklarieren.
- **Captured stdout und stderr sind nur durch execas Default-`maxBuffer` von 100 MB begrenzt** — ein ausufernder Child wird an dieser Obergrenze terminiert, nicht an einem vom Smoke gewählten Budget.
- **Ein Timeout killt nur den direkten Child** — ein von einem fehlerhaften Fixture gespawnter Prozessbaum kann den Smoke überleben und braucht externes Cleanup.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>
