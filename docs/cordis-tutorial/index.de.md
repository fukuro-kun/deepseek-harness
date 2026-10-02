# Cordis-Tutorial

[English](index.md) | [中文](index.zh.md) | Deutsch

Cordis ist das Plugin-Framework unter DeepSeek Harness: eine kleine Runtime, in der jede Capability — Tools, LLM-Adapter, Dateizugriff und der agent loop selbst — ein Plugin ist, das in einen geteilten Kontext gemountet wird. Dieses Tutorial lehrt Cordis praktisch: jedes Kapitel ist ein lauffähiges Beispiel, das Sie in einem Scratch-Verzeichnis innerhalb dieses Repositories aufbauen, und endet mit einem Plugin, das an echte Harness-Services angebunden ist.

Die Zielgruppe sind agent-Entwickler. Sie benötigen keine tiefen TypeScript-Kenntnisse; die [TypeScript-Hinweise](#typescript-notes) unten erklären die Syntax, die ungewohnt sein könnte, und jedes Kapitel zeigt die exakten Befehle und den erwarteten Output.

Wenn Sie lieber die kondensierte Konzeptreferenz statt einer Walkthrough lesen, lesen Sie den [Cordis-Primer](../cordis-primer.de.md). Die erschöpfende API-Referenz lebt in den generierten `cordis-surface`-Regionen auf den [Subsystem-Seiten](../subsystems/core.de.md) und den [Cordis-Core-API](../cordis-api/context.de.md)-Seiten.

Um Plugins für den Harness selbst zu schreiben — geladen aus einer `cordis.yml` und gesteuert aus der Web-UI statt über den untenstehenden Launcher — starten Sie bei [Ihrem ersten Harness-Plugin](../user/develop/basic/index.de.md).

## Einrichtung

Sie benötigen einen Clone dieses Repositories mit installierten Abhängigkeiten; der [Entwicklungshandbuch](../development.de.md#setup-tutorial) listet die Voraussetzungen. Für dieses Tutorial wird kein API-Key benötigt; jedes Beispiel läuft keyless.

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
```

Erstellen Sie das Scratch-Verzeichnis, in dem die Kapitel arbeiten. `tmp/` ist gitignored, sodass nichts, was Sie dort schreiben, die Versionskontrolle berührt:

```sh
mkdir -p tmp/cordis-tutorial
cd tmp/cordis-tutorial
```

Jedes Kapitel führt denselben Befehl aus diesem Verzeichnis aus:

```sh
node --import tsx ../../vendor/cordis/bin.js
```

Dieser Ein-File-Launcher (siehe [vendor/cordis/bin.js](../../vendor/cordis/bin.js)) erstellt einen Root-`Context`, mountet das Loader-Plugin und weist es an, `./cordis.yml` aus dem aktuellen Verzeichnis zu laden. Alles andere — welche Plugins existieren, wie sie konfiguriert sind — kommt aus dieser YAML-Datei, die Sie gleich schreiben werden. Das `--import tsx`-Flag lässt Node die TypeScript-Dateien, auf die die Config zeigt, ohne Build-Schritt laufen.

## Kapitel

1. [Ihr erstes Plugin](01-first-plugin.de.md) — ein Plugin ist eine Funktion; der Loader mountet es.
2. [Lifecycle und Effects](02-lifecycle-and-effects.de.md) — von Cordis verwaltete Registrationen werden zurückgewickt, wenn ihr Plugin entlädt.
3. [Services](03-services.de.md) — eine Capability auf `ctx` exponieren und über `inject` davon abhängen.
4. [Events](04-events.de.md) — typisierte Events, Broadcast-Dispatch und der Waterfall-Short-Circuit.
5. [Configuration](05-config.de.md) — validierte Config aus `cordis.yml`, die bei falschem Input laut fehlschlägt.
6. [Composition und HMR](06-composition-and-hmr.de.md) — die Config-Datei als Plugin-Baum, Hot-Reload und die Diagnose eines Plugins, das nie lädt.
7. [In den Harness](07-into-the-harness.de.md) — ein modell-callbares Tool gegen echte Harness-Services registrieren.

<a id="typescript-notes"></a>

## TypeScript-Hinweise

Die Beispiele verwenden drei TypeScript-Features jenseits von gewöhnlichem modernem JavaScript:

- **Type-Annotationen** beschreiben Werte, ohne das Runtime-Verhalten zu ändern: `ctx: Context` sagt, dass `ctx` die Cordis-Context-API hat, `who: string` akzeptiert Text, und `string[]` bedeutet ein Array von Strings.
- **`import type { Context } from '@deepseek-ai/cordis'`** importiert nur Typ-Information. Es verschwindet zur Runtime, sodass eine Plugin-Datei, die `Context` ausschließlich für Annotationen benötigt, keine Runtime-Dependency hinzufügt.
- **Declaration Merging** (`declare module '@deepseek-ai/cordis' { ... }`) fügt Ihre Einträge zu Interfaces hinzu, die Cordis bereits deklariert — zum Beispiel den Typ einer neuen `ctx.greeter`-Property oder eines Event-Namens. Es generiert kein Runtime-Wiring; das Plugin stellt separat den Service bereit oder emitted das Event. Kapitel 3 zeigt das Pattern in voller Länge.

Kapitel 5 verwendet außerdem ein `interface`, um die Felder eines Configuration-Objekts zu beschreiben, und einen generischen Typ wie `Schema<Config>`, um auszudrücken, welche Objektfelder ein Schema validiert. Sie können diese Deklarationen wie gezeigt kopieren; der umgebende Text erklärt, was jede verbindet.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
