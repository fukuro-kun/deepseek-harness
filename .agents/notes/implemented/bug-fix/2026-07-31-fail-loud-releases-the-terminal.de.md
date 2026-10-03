# Agent Note: fail-loud releases the terminal before exiting

Status: implemented

[English](2026-07-31-fail-loud-releases-the-terminal.md) | [中文](2026-07-31-fail-loud-releases-the-terminal.zh.md) | Deutsch

## Problem

Ein `dsh`-Start, dessen Config die Validierung nicht bestand, gab seine Diagnose aus und ließ den Benutzer mit einer kaputten Shell zurück. Eingaben waren unsichtbar, und der nächste Befehl wurde von verstreutem Text verstümmelt:

```
dsh: fatal load failure: ValidationError: invalid config:
  - $.providers expected object but got [object Object] (at providers)
$ 1;2;4cecho hello
zsh: command not found: 4cecho
```

Der Loader mountet Einträge nebenläufig, daher entspricht die Fehlerreihenfolge der Einträge nicht der Startreihenfolge. `ui-tui` aktiviert sich und ruft pi-tuis `ProcessTerminal.start()` auf, das stdin in den Raw-Modus versetzt, Bracketed Paste aktiviert und die Probe für das Kitty-Keyboard-Protokoll schreibt — eine Sequenz, die mit einer Device-Attributes-Abfrage (`ESC [ c`) endet. Ein Geschwistereintrag (hier `llm-pi-ai`) lehnt anschließend wegen seiner eigenen Config ab. Damals trat diese Ablehnung als unhandled Rejection hervor, und `installFailLoud` schrieb eine stderr-Zeile und rief sofort `process.exit(1)` auf. (Der transaktionale Loader lässt Config-Tree-Fehler inzwischen über `boot()` absettle, das den teilweise aufgebauten Kontext selbst dispost; der Release-Hook bleibt die Absicherung für Rejections, die `boot()` nicht sehen kann — lose gekoppelte asynchrone Arbeit eines Plugins, die während oder nach dem Mounten fehlschlägt.)

Nichts disposte den Baum, also lief `ProcessTerminal.stop()` nie: Raw-Modus, Bracketed Paste und das Keyboard-Protokoll blieben auf der Shell gesetzt, die den Prozess überlebte. Die Antwort des Terminals auf die Device-Attributes-Abfrage (`1;2;4c`) traf nach dem Exit ein und wurde von der Shell als getippte Eingabe gelesen — der wörtliche Text oben.

Der `/exit`-Pfad war nie betroffen, weil er den Baum dispost und den eigenen `shutdown()` der TUI erreicht, der `drainInput()` aufruft (was die ausstehende Antwort absorbiert) und danach `ui.stop()`. Der Defekt bestand darin, dass ein *fehlgeschlagener Boot* keinen Pfad zu eben diesem Teardown hatte.

## Decision

`installFailLoud` nimmt einen optionalen `release`-Teardown entgegen, der zwischen Diagnose und Exit awaited wird:

- Die Diagnose wird **vor** dem Release geschrieben, damit ein hängender oder fehlschlagender Disposer den Grund nicht verschlucken kann.
- Ein Latch, kein Uninstall, sorgt dafür, dass die erste Rejection die gemeldete bleibt. Das Entfernen des Listeners während des Teardowns würde eine zweite nebenläufige Rejection uncaught werden lassen, und Node würde den Prozess mitten im Teardown töten — genau der Terminal-Zustand bliebe zurück, den dies wiederherstellt. Spätere Rejections, einschließlich der des Release selbst, fallen in den anstehenden Exit durch.
- Der Release ist durch `FAIL_LOUD_RELEASE_TIMEOUT_MS` (2 s) begrenzt, und seine Rejection wird verschluckt. Ein verklemmter oder fehlschlagender Disposer verzögert den fatalen Exit; er kann ihn nie abbrechen. Dieser Timer bleibt **referenced**: ein `unref()`ter Timer lässt Node einen leeren Event Loop erreichen und genau bei dem Fehler, der gemeldet wird, mit 0 exiten, weil ein `unhandledRejection`-Listener den standardmäßigen fatalen Exit unterdrückt.
- Das Weglassen von `release` behält das bisherige Verhalten exakt bei, sodass die ACP-, JSON-RPC- und Demo-Bins unverändert bleiben.

Der TUI-Launcher von `dsh` übergibt einen Release, der den Root-Kontext dispost, was den vorhandenen `shutdown()` der TUI ausführt und das Terminal zurückgibt.

Der Launcher erfasst den Root-Kontext im `prepare`-Hook von `boot()` statt über dessen Rückgabewert. Die Rejection trifft ein, während `boot()` noch in flight ist, sodass `app.current`, das erst nach dem `await` zugewiesen wird, genau in dem Moment, in dem der Hook es braucht, noch `undefined` wäre. `prepare` läuft, nachdem der Loader installiert ist und bevor irgendein Config-Tree-Eintrag mountet, und deckt damit das gesamte Fenster ab, in dem ein Eintrag rejecten kann.

## Alternatives considered

**Das Terminal aus dem Fail-Loud-Handler zurücksetzen** (`ESC [ ? 2004 l` schreiben, das Keyboard-Protokoll poppen, den Raw-Modus löschen). Das dupliziert pi-tuis Teardown in einem Package, das kein Terminal besitzt, und würde driften, wenn sich pi-tuis Startup-Sequenz ändert. Es kann außerdem die in-flight Device-Attributes-Antwort nicht absorbieren, die den nächsten Prompt verdirbt — das schafft nur das Drainen von stdin, solange er noch raw ist.

**Einen `process.on('exit')`-Terminal-Reset in der TUI registrieren.** Exit-Handler sind synchron, können also `drainInput()` nicht awaiten; die verirrte Antwort würde trotzdem eintreffen. Außerdem verlagert es den Teardown auf einen globalen Hook statt auf den bereits vorhandenen Disposal-Pfad.

**Die TUI sich weigern lassen zu starten, bis der Baum gesettlet ist.** Das serialisiert einen absichtlich nebenläufigen Loader und verzögert den ersten Paint jedes gesunden Starts, um einen Fehlerpfad zu reparieren.

**Die Config-Einträge so umordnen, dass `llm-pi-ai` vor `ui-tui` mountet.** Reihenfolge ist keine Garantie, die der Loader zusichert, und jeder künftige Eintrag könnte fehlschlagen, nachdem die TUI mountet.

## Consequences

Ein fehlgeschlagener Boot kostet jetzt einen Baum-Disposal (begrenzt auf 2 s) vor dem Exit, und der Exit-Code bleibt 1. Im Gegenzug gibt ein falsch konfiguriertes `dsh` eine nutzbare Shell zurück statt einer, die `stty sane` oder `reset` braucht.

Die Garantie gehört dem Bin, der das Terminal besitzt: eine Oberfläche, die sich Terminal-Zustand aneignet und `release` nicht übergibt, führt diesen Defekt wieder ein. `installFailLoud` kann das nicht selbst erkennen, da es keinen Einblick hat, was ein gemountetes Plugin mit dem Prozess angestellt hat.

## Testing

`packages/boot/app-boot/tests/app-boot.spec.ts` deckt den Release-Vertrag ab: Der Hook wird awaited, bevor der Exit committed; ein rejectender Hook exited dennoch mit 1; ein nie settlender Hook exited nach `FAIL_LOUD_RELEASE_TIMEOUT_MS`; und eine Salve von Rejections meldet nur die erste, während der Release trotzdem zu Ende läuft.

Diese Fake-Process-Tests können die zwei wichtigsten Fehlerbilder nicht beobachten — den Prozess-Exit-Code unter einem echten Event Loop und den Terminal-Zustand nach dem Exit —, daher lebt die Regression in `apps/cli/tests/tui-keyless-smoke.e2e.ts`. Er bootet den ausgelieferten Baum in einem echten PTY über `fixtures/tui-invalid-provider.cordis.yml` (ein listenförmiges `providers`, der Fehler, den Benutzer tatsächlich machen), erwartet Exit 1 und assertiert, dass die aufgezeichneten Bytes sowohl die gelabelte Boot-Rejection (`dsh: plugin tree failed to load:`) als auch `ESC[?2004l` enthalten. Derselbe Fall pinnt den Boot-Pfad Ende zu Ende: Er hat den [HMR-Initial-Scan-Boot-Deadlock](../../archived/bug-fix/2026-08-03-hmr-initial-scan-boot-deadlock.md) gefangen, der still mit 13 exitete und das Terminal gestrandet zurückließ.

Der `/exit`-Pfad behält seine bestehende Assertion, dass derselbe Reset bei einem sauberen Exit erscheint.
