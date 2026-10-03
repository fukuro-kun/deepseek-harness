---
description: "Der geteilte dsh-Kern: Modellzugriff, Tools, dauerhafte Sessions und Sicherheits-Defaults für jede dsh --profile-Oberfläche, für Benutzer, die ein Profil zusammensetzen oder anpassen."
kind: "package-bundle"
---

# @deepseek-ai/dsh-base
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Jede auf base gestützte `dsh --profile`-Oberfläche läuft auf `dsh-base`, sodass diese Oberflächen eine Modellverbindung, den vollständigen Tool-Satz, dauerhafte Session-History und Workspace-Sicherheits-Defaults teilen. Das ausgelieferte `sdk-minimal`-Profil verwendet bewusst stattdessen einen vollständigen eigenständigen Baum. Du berührst dieses Bundle selten direkt — ausgelieferte base-gestützte Profile enthalten es bereits, und ein eigenes base-gestütztes Profil nennt es zuerst. Wenn du andere Defaults brauchst, ändere dein Profil-Patch oder füge ein späteres Bundle hinzu; dieses Paket ist keine Bibliothek, die du importierst.

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

Du erhältst den dsh-Kern automatisch: Die ausgelieferten `web`-, `headless`-, `sdk`- und `acp`-Profile enthalten ihn bereits, und ein eigenes Profil nennt ihn als sein erstes Bundle. Danach funktioniert alles ohne weitere Konfiguration.

### Ein minimales eigenes Profil

Um ein Profil auf dem geteilten Kern zu bauen, erstelle ein Profil mit einer `package.json`, die `@deepseek-ai/dsh-base` zuerst nennt:

```json
{
  "name": "my-profile",
  "private": true,
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base"]
    }
  }
}
```

Führe `dsh --profile my-profile "your task"` aus und du erhältst einen funktionierenden agent mit Modellzugriff, Tools, Persistenz und der Standard-Berechtigungspolicy. Die ausgelieferten `web`-, `headless`-, `sdk`- und `acp`-Profile werden bei der ersten Verwendung für dich erstellt. Um weitere Bundles hinzuzufügen, führe `dsh plugin --profile <name> add <package>` aus; im Lieferumfang enthaltene Bundles werden aus der dsh-Installation aufgelöst. Der Profilvertrag ist im [app-boot-Profilabschnitt](../../boot/app-boot/README.de.md) dokumentiert.

### Was du erhältst

Out of the box stellt jedes auf diesem Kern gebaute Profil bereit: eine DeepSeek-Modellverbindung (provider und model sind konfigurierbar, und du kannst zusätzliche Provider in deinen Einstellungen aktivieren), den vollständigen Tool-Satz — Dateibearbeitung, Shell-Befehle, Websuche, öffentlichen HTTP(S)-Fetch, subagents, Aufgaben- und Zielverfolgung — dauerhafte Sessions, die Neustarts überstehen, und die Standard-Berechtigungspolicy, die Dateischreibvorgänge auf deinen Workspace eingrenzt und vor riskanten Aktionen fragt. Web-Fetch läuft ohne Genehmigung pro Aufruf; sein Provider lehnt nicht-öffentliche Ziele ab. Feedback bleibt im Session-Log. [OTel-Session-Upload](../../session/session-telemetry-otel/README.de.md) verwendet standardmäßig `FEEDBACK_ONLY` für alle Benutzer, einschließlich `deepseek-official`: Neues Textfeedback, Nachrichtenbewertungen, Bearbeitungen und Widerrufe geben das vollständige kanonische Präfix bis zu diesem Event frei, einschließlich Kontext. Spätere Einträge warten auf das nächste explizite Feedback; das Senden eines autorisierten Batchs erfordert keine weitere Interaktion oder Modellanfrage. `DISABLED` verhindert die OTel-Erfassung. Der Opt-in-[DeepSeek-Session-Log-Contributor](../../session/session-log-deepseek/README.de.md) bleibt ein separater Request-Pfad.

Die Standard-Dateibearbeitung verwendet `read`, `write` und `edit`. Das `str_replace_editor`-Tool bleibt als explizites Opt-in verfügbar. Um es zu einem base-gestützten Profil hinzuzufügen, setze diesen Eintrag in das Profil-, Home- oder Invocation-Patch:

```yaml
- insert:
    - id: tool-str-replace-editor
      name: '@deepseek-ai/dsh-tool-str-replace-editor'
      config:
        maxOutputChars: 16000
```

### Shell-Tools pro Plattform

Auf macOS und Linux erhältst du die bash-Shell-Tools; auf Windows erhältst du stattdessen die PowerShell-Zwillinge, sodass pro Maschine genau ein Shell-Stack verfügbar ist. Das Sicherheitsverhalten ist auf jeder Plattform identisch. Ein Windows-Host, der den unbeschränkten PowerShell-Executor bevorzugt, kann die Shell-Zeilen in seinem Profil-Patch umschalten — die Umschaltung muss beide PowerShell-Zeilen deaktivieren und beide bash-Zeilen wieder aktivieren, sonst lädt das Profil nicht.

### Die Defaults ändern

Um zu ändern, was ein auf diesem Kern gebautes Profil bereitstellt — ein anderes Standardmodell, einen strengeren Berechtigungsmodus, zusätzliche oder weniger Tools — bearbeite die `cordis.patch.yml` deines Profils oder füge ein späteres Bundle hinzu. Jeder Patch-Eintrag ersetzt die gesamte Konfiguration des Ziels, also wiederhole jede Einstellung, die du behalten willst. Behalte den sandboxed Filesystem-Provider als einzigen Datei-Schreibpfad: Das Hinzufügen des einfachen Filesystem-Providers darüber lässt das Profil beim Laden fehlschlagen.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Das Bundle ist ein statisches Patch-Dokument: eine `insert`-Liste, die über den leeren Profil-Root angewendet wird. Es mountet keinen Service, emittiert keine Events und hält keinen veränderlichen Zustand; das Paket jeder eingefügten Zeile besitzt deren Verhalten und Invarianten.

### Kompositionsmechanik

Ein Patch ersetzt die gesamte `config` der anvisierten Zeile, statt in sie zu mergen. Spätere Bundle-Layer und die `cordis.patch.yml` des Benutzerprofils überschreiben Zeilen nach id, wobei der letzte Schreibvorgang pro Zeile gewinnt. Zeilen, deren Wert sich nach Modus unterscheidet, leben nicht hier: Jedes Modus-Bundle wiederholt seine vollständige Konfiguration, sodass jede einzelne Zeile auf einen Bundle-Layer plus dem des Benutzers bleibt. Der vollständige Zeilensatz und seine Begründung sind inline in [`cordis.patch.yml`](cordis.patch.yml) dokumentiert; der [generierte Kompositionsgraph](../../../apps/cli/composition.md) rendert ihn.

### Plattform-Gating

Der Patch gated die beiden Shell-Stacks auf seinen eigenen Zeilen nach Plattform: `bash-sandbox` und `tool-bash` tragen `disabled: !!js process.platform === 'win32'`, und ihre Zwillinge `pwsh-sandbox` und `tool-pwsh` mounten nur auf win32 mit dem invertierten Ausdruck. Die Berechtigungsoberfläche bleibt identisch zu POSIX: Die Sandbox-Policy führt dieselbe File-Effect-Policy über den Windows-ACL-Restricted-Token-Runner aus (`dsh-sandbox-local` → `@deepseek-ai/dsh-sandbox-windows-acl`), und `fs-sandbox` zäunt `ctx.fs`-Schreibvorgänge weiter ein — das Mounten von `dsh-fs-local` daneben würde `ctx.fs` doppelt registrieren und den Laden fehlschlagen lassen.

### Quellkarte

| Datei | Rolle |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Die Substanz des Bundles: die Basis-Plugin-Zeilen, mit Begründung pro Zeile als Inline-Kommentare |
| [`src/index.ts`](src/index.ts) | Paketeinstieg; trägt keine Runtime-API |
| — | Es wird kein Runtime-Invarianten-Begleiter veröffentlicht; das Paket ist ein statischer Patch-Listen-Träger (ein YAML-Dokument von Loader-Zeilen, die anderen Paketen gehören); es mountet keinen Service, emittiert keine Events und besitzt keine prüfbare veränderliche Beziehung. Das Paket jeder eingefügten Zeile trägt deren Invarianten. |
| [`tests/base.spec.ts`](tests/base.spec.ts) | Manifest-Deklaration und Plattform-Gating-Prüfungen |

### Invarianten-Ownership

Es wird kein Invarianten-Begleiter veröffentlicht, weil das Paket ein statischer Patch-Listen-Träger ist: Das Paket jeder eingefügten Zeile besitzt deren Invarianten, und das Bundle besitzt keine prüfbare veränderliche Beziehung.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Lies diese Seiten, wenn du tiefer in Profile, die auf diesem Kern gebauten Oberflächen oder die exakte Komposition einsteigen willst.

- [app-boot-Profilabschnitt](../../boot/app-boot/README.de.md) — wie Profile aufgelöst, geschichtet und angepasst werden.
- [Bundle-Paketkarte](../README.de.md) — die auf diesem Kern gebauten Oberflächen.
- [Generierter Kompositionsgraph](../../../apps/cli/composition.md) — der exakte Plugin-Satz, den jedes ausgelieferte Profil verwendet.
- [Profile-Plugin-Bundles-Notiz](../../../.agents/notes/implemented/architecture/2026-08-05-profile-plugin-bundles.de.md) — das Profil- und Bundle-Kompositionsdesign.
- [Codex- und Claude-Code-Provider-Bundles](../../subagent/README.de.md) — optionale Provider-Bundles, die du obendrauf installieren kannst.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über das Paket jeder eingefügten Zeile, das das modellseitige Verhalten dieser Zeile besitzt.

#### KV-Cache-Wirkung

Das Bundle selbst fügt kein Request-Präfix hinzu; das Paket jeder eingefügten Zeile besitzt jede Cache-Wirkung.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen sagen dir, wann der Kern besondere Sorgfalt braucht oder wo eine Überschreibung hingehört. Sie sind aktuelle Paketbeschränkungen, kein allgemeiner Vergleich oder Aufgabenrückstand.

- **Überschreibungen ersetzen ganze Einstellungsblöcke** — ein Patch-Eintrag ersetzt die gesamte Konfiguration des Ziels, also muss deine Überschreibung jede Einstellung wiederholen, die du behalten willst; nichts mergt automatisch.
- **Pro-Oberfläche-Einstellungen gehören zum Bundle der Oberfläche** — ein Default, der zwischen der Web-GUI und dem Headless-Modus abweicht, lebt im Bundle dieser Oberfläche, nicht im geteilten Kern.
- **Windows-Temp-Grants sind private, pro-Session-Unterverzeichnisse** — `workspace-write` grenzt Schreibvorgänge auf den Workspace plus das eigene Temp-Unterverzeichnis der Session ein (`<temp>\dsh-<hash>`, TMP/TEMP für eingegrenzte Kinder umgeschrieben); `read-only` gewährt nichts. Siehe `@deepseek-ai/dsh-sandbox-windows-acl`.
- **Das Hinzufügen des einfachen Filesystem-Providers oben auf den sandboxed lässt das Profil fehlschlagen** — beide registrieren denselben Service, also verweigert das Profil das Laden; verwende den einen oder den anderen.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keine.

</details>
