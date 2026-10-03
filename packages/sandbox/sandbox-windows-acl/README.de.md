---
description: "Das Windows-Backend für die Schreibbeschränkungs-Sandbox für Nutzer und Maintainer, die Prozess-Isolation per Restricted Token unter Windows wählen, konfigurieren oder debuggen."
kind: "package-library"
---

# @deepseek-ai/dsh-sandbox-windows-acl
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Unter Windows begrenzt dieses Paket Schreibzugriffe von Kindprozessen auf den Workspace und ein privates temporäres Verzeichnis. `workspace-write` gewährt beide Orte, `read-only` keinen von beiden. Das Mounten von `dsh-sandbox-local` wählt dieses Verhalten automatisch für eingeschränkte bash- und PowerShell-Kommandos; Aufrufer können auch die öffentliche `AclSandbox`-API direkt mit abgegriffenen Standardströmen nutzen. Jeder fehlgeschlagene Win32-Vorgang verhindert, dass das Kind uneingeschränkt startet. Die Garantie ist bewusst partiell, weil der Prozessstart den Everyone-Zugriff behält und NTFS-Hardlinks dieselbe Datei über einen anderen Pfad offenlegen können; Aufrufer erkennen diese Einschränkung am gemeldeten `partial`-Durchsetzungsgrad.

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

Unter Windows macht das Mounten des lokalen Sandbox-Providers dieses Backend zum Runner hinter `ctx.sandbox` — ohne weitere Konfiguration. Bette die `AclSandbox`-API direkt ein, wenn du eingeschränkte Kindprozesse außerhalb des Harness spawnst.

### Wann es gewählt wird

Wähle es für Windows-Kompositionen, die Dateieffekte von Subprozessen unter `read-only` oder `workspace-write` einschränken. Wähle einen anderen Mechanismus, wenn das Kind zusätzlich lese- oder netzwerkseitig beschränkt werden muss: `WRITE_RESTRICTED` schneidet nur Schreibzugriffe, also kombiniere dieses Backend mit einer Lese-Policy oder einem AppContainer-Capability-Token für stärkere Isolation.

### Direkte API

`AclSandbox` spawnt ein eingeschränktes Kind mit abgegriffenem stdio (oder geerbtem stdio für Runner-artige Nutzung). Es erfordert ein explizites privates temporäres Verzeichnis oder `tempDir: null`, um Temp-Schreibzugriffe abzuschalten — der Umgebungs-Temp-Root wird niemals implizit gewährt.

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AclSandbox, tempWriteSid, workspaceWriteSid } from '@deepseek-ai/dsh-sandbox-windows-acl'

const workspaceRoot = process.cwd()
const tempDir = mkdtempSync(join(tmpdir(), 'dsh-'))

// mode selects the token's restricting-SID list (see Modes below) and must
// match the grant shape. workspace-write requires distinct workspace and
// private-temp identities; pass tempDir: null to disable temp writes.
const sandbox = new AclSandbox({
  writableDirs: [workspaceRoot],
  tempDir,
  writeSid: workspaceWriteSid(workspaceRoot),
  tempWriteSid: tempWriteSid(tempDir),
  mode: 'workspace-write',
})
await sandbox.init() // throws on ANY Win32 failure — never spawns unrestricted

const child = sandbox.spawn({ command: 'pwsh', args: ['-NoProfile', '-Command', '...'], cwd: workspaceRoot })
const { stdout, stderr, exitCode } = await child.wait()

sandbox.dispose() // revokes the revocable (temp) grant, keeps the standing workspace ACE; reports every cleanup failure
rmSync(tempDir, { recursive: true, force: true })
```

Die Workspace-ACEs werden stehend gewährt — `dispose()` belässt sie, weil sie der instanzübergreifende Wiederverwendungs-Cache sind — während die eigene Temp-SID widerrufbar gewährt wird. Das serverseitige Gegenstück ist die Klasse `AclWriteGrant`: ein `add(path, standing)` pro Verzeichnis, und `dispose()` widerruft die widerrufbaren Pfade und gibt die SID frei.

### Was die Isolation dir bringt

Unter `workspace-write` darf das Kind in den Workspace und sein privates Temp-Verzeichnis schreiben; andere per ACL adressierbare Schreibzugriffe werden verweigert, abgesehen von den dokumentierten Everyone- und Hardlink-Grenzen. Unter `read-only` existieren keine expliziten Schreib-Grants, sodass Schreibzugriffe mit denselben dokumentierten Umgebungsgrenzen verweigert werden.

Die Temp-Isolation gilt pro lebendem Session/Workspace-Paar: Sessions, die einen Workspace teilen, teilen dessen Schreibautorität, können aber nicht in die Temp-Verzeichnisse der anderen schreiben. Ein frischer Provider wählt immer einen neuen Temp-Pfad und eine neue SID, sodass Crash-Rückstände eine wiederaufgenommene Session weder blockieren noch autorisieren können.

### Fehler und Wiederherstellung

`init()` wirft bei jedem Win32-Fehler — das Kind wird niemals uneingeschränkt gespawnt. Ein Runner, der vor Ausführung des Kommandos scheitert, gibt `windows-acl-run: <detail>` auf stderr aus und beendet mit 127, was die Runner-Fehler-Regeln des seam als defekte Sandbox statt als Verweigerung einordnen. Das Aufräumen ist bewusst best-effort: `dispose()` versucht jede Temp-Widerrufung und aggregiert Fehler in einen `AggregateError`.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsdetails — zum Aufklappen</summary>

Dieser Abschnitt erklärt den Restricted-Token-Mechanismus, die Token-Listen, den Runner-Vertrag und die verifizierten Grenzen; das beobachtbare Verhalten ist in [Dieses Paket verwenden](#use-this-package) vollständig beschrieben.

### Mechanismus

Das Token des Aufrufers wird zu einem `WRITE_RESTRICTED`-Token dupliziert, dessen restricting SIDs getrennte Workspace- und Private-Temp-Capabilities tragen. Windows führt die Zugriffsprüfung zweimal durch — einmal gegen die normalen SIDs, einmal gegen die restricting SIDs — und gewährt Schreibzugriff nur dort, wo beide Prüfungen bestehen. Die Workspace-SID wird deterministisch aus dem kanonischen Workspace-Pfad abgeleitet (`workspaceWriteSid`), sodass der Workspace-Root-ACE pro Workspace und Maschine genau einmal materialisiert und jede spätere Session, jeder Aufruf oder Neustart den Exakt-ACE-Skip trifft. Jedes lebende Session/Workspace-Paar erhält stattdessen ein zufälliges privates Temp-Verzeichnis und eine aus diesem Pfad abgeleitete SID (`tempWriteSid`), sodass Sessions die vorgesehene Workspace-Autorität teilen, ohne die Temp-Autorität der anderen zu erben. Jeder policy-spezifische Win32-Aufruf und jedes Prozess-Primitive aus [`dsh-win32-process`](../../subprocess/win32-process/README.de.md) wird geprüft; Fehler werfen einen `Win32Error` mit API-Name, exaktem Code, Systemtext und fehlgeschlagenem Kontext — konstruktiv fail-closed.

### Modi und Token-Listen

`workspace-write` (Logon-SID, Everyone, Workspace-SID, Temp-SID) gewährt dem Workspace und dem privaten Temp-Unterverzeichnis der Session getrennte Write-Grants; `read-only` (Logon-SID, Everyone — keine Write-SID) gewährt keine. Die Keep-alive-Gruppe (Logon-SID + Everyone) ist in beiden Modi vorhanden: Ohne sie stirbt die frühe DLL-Initialisierung mit `0xC0000142`, und CNG lässt pwsh mit `0xE0434352` abstürzen. Die Write-SID bleibt absichtlich außerhalb der Read-only-Liste: Der stehende Workspace-Grant aus einer früheren Workspace-write-Phase bleibt inert, weil die write-restricted Pass-2-Prüfung nur gewährt, was die restricting-Liste trägt, während der stehende ACE ein erneutes Hochstufen ohne erneute Propagierung ermöglicht.

NUL-Schreibzugriffe sind umgebungsbedingt, nicht gewährt: Die Geräte-DACL gewährt Everyone Lesen+Schreiben+Ausführen (`0x1201BF`), sodass Öffner, deren Maske hineinpasst (cmd `> NUL`, node `\\.\NUL`), in beiden Modi schreiben können. `Set-Content NUL` schlägt in beiden Modi fehl (ein PowerShell/.NET-Ebenen-Effekt, nicht die Geräte-DACL), während PowerShells `> $null`-Umleitung weiter funktioniert.

Authenticated Users fehlt in beiden Listen — die WMI-Namespace-Sicherheitsprüfung schlägt fehl (`0x80041003`), sodass CIM-Cmdlets und `Get-ComputerInfo` in jedem eingeschränkten Modus nicht verfügbar sind und die C:\-Root-Baumerzeugungsflucht geschlossen ist. INTERACTIVE/LOCAL fehlen ebenfalls: Der Public-Baum des Hosts gewährt INTERACTIVE Schreibzugriff, also werden Public-Schreibzugriffe verweigert.

### Der Isolation-Runner

Die seam-seitige Form ist der Runner-Eintrag (`./runner`): ein argv-Präfix-Wrapper, den `dsh-sandbox-local` an Stelle des Kommandos des Aufrufers spawnnt — dieselbe Architektur wie bwrap/landlock-run/sandbox-exec. Der Runner erzeugt das Restricted Token, spawnnt das verpackte argv darunter mit direkt durchgereichtem stdio des Aufrufers, hüllt das Kind in einen `KILL_ON_JOB_CLOSE`-Job, spiegelt den Exit-Code des Kindes und widerruft beim Exit seinen selbstverwalteten Temp-Grant. Jeder runner-seitige Fehler gibt `windows-acl-run: <detail>` auf stderr aus und beendet mit 127 — die Runner-Fehler-Regeln des seam erkennen diese Signatur.

```sh
node runner.js --workspace <dir> --temp <dir> --mode <read-only|workspace-write> [--write-sid <S-1-4-…> --temp-write-sid <S-1-4-…>] -- <argv...>
```

Der seam materialisiert den ACE der deterministischen Workspace-SID stehend (einmal pro Workspace und Server-Lebenszeit — der Wiederverwendungs-Cache), erzeugt dann ein zufälliges privates Temp-Verzeichnis und eine eigene widerrufbare SID für jedes lebende Session/Workspace-Paar und übergibt beide als das erforderliche `--write-sid`/`--temp-write-sid`-Paar; der Runner verifiziert jede gegen ihren zugehörigen Pfad und weder gewährt noch widerruft er (`manageDacls: false`). Ein fork erhält eine andere Temp-Capability, und ein frischer Provider gibt selbst derselben wiederaufgenommenen Session einen neuen Pfad und eine neue SID, sodass Crash-Rückstände inerter Müll sind. Ohne das Paar benennt `--temp` einen Root: Ein agentloser Workspace-write-Runner erzeugt ein zufälliges privates Kind, verwaltet seine Temp-SID selbst, schreibt TMP/TEMP um und entfernt das Kind beim Exit. Das erneute Gewähren des stehenden Workspace-ACE nach einem Neustart ist idempotent: `grantWrite` liest die aktuelle DACL und überspringt die erneute Propagierung, wenn der exakte ACE bereits steht. Ein Workspace, der dem Temp-Root entspricht oder ihn enthält, wird vor jedem Grant abgelehnt.

### Verifizierte Grenzen

- **Everyone-Grants bleiben Umgebungs-Schreibautorität** — Everyone muss in beiden restricting-Listen bleiben (das Entfernen bricht die frühe DLL-Initialisierung und CNG); ein externes NTFS-Objekt, dessen DACL Everyone ein angefordertes Schreibrecht gewährt, besteht beide Prüfungen und bleibt in beiden Modi beschreibbar.
- **Hardlinks sind Dateiobjekt-Aliase, keine Pfad-Aliase** — ein vererbbarer Workspace-ACE, der auf einen vorhandenen Hardlink propagiert, ändert den einen zugrunde liegenden Datei-Sicherheitsdeskriptor, sodass dasselbe Objekt über einen externen Alias beschreibbar ist; mehrfach verlinkte Dateien abzulehnen ist für gewöhnliche pnpm-Installationen nicht praktikabel.
- **Schreiben ist eingeschränkt; Lesen, Netzwerk und Prozess-Sichtbarkeit nicht** — `WRITE_RESTRICTED` schneidet nur Schreibzugriffe, sodass ein eingeschränktes Kind jede für den Aufrufer lesbare Datei lesen und Sockets öffnen kann; `read-only` braucht daher eine Lese-Policy, um ausdrückbar zu sein.
- **Konsolen-Isolation ist nicht verfügbar** — Kinder, die mit `CREATE_NO_WINDOW` / `CREATE_NEW_CONSOLE` erzeugt werden, sterben während der DLL-Initialisierung mit `STATUS_DLL_INIT_FAILED` (`0xC0000142`); Kinder teilen die Host-Konsole, und pipe-basierte stdio-Umleitung ist unberührt.
- **ACL-Grants sind stehende Verzeichnis-Mutationen** — Workspace-ACEs stehen by design (der Wiederverwendungs-Cache, nie widerrufen); Temp-ACEs werden von `dispose()` widerrufen; manuelles `icacls`-Aufräumen kann sie auf dieser Plattform nicht widerrufen (`ERROR_NONE_MAPPED`, 1332), also widerrufe über dieses Modul.
- **Gewährte Verzeichnisse müssen dem Aufrufer gehören** — das implizite `WRITE_DAC` des Besitzers ermöglicht der Sandbox, die DACL ohne Rechteerhöhung zu bearbeiten.
- **Der Umgebungs-Temp-Root wird niemals implizit gewährt** — direkte Aufrufer müssen ein vorhandenes privates `tempDir` plus dessen eigene `tempWriteSid` liefern oder Temp-Schreibzugriffe mit `tempDir: null` abschalten; das tatsächliche Temp-Verzeichnis muss von jedem beschreibbaren Root disjunkt sein.
- **Die Temp-Capability des eingeschränkten Kindes ist privat pro lebendem Session/Workspace-Paar** — der Runner schreibt TMP/TEMP vor dem Spawn auf dieses private Verzeichnis um; zwei Tokens mit derselben Workspace-SID können nicht in die Temp-Verzeichnisse des anderen schreiben.
- **`whoami` und Token-Inspektions-Cmdlets schlagen unter dem Restricted Token fehl** — `GetTokenInformation` auf dem Duplikat ist für das Kind teilweise nicht verfügbar, was Diagnose-Rauschen ist, kein Betriebsfehler.

### Header-Verifikation und Quellkarte

Die sandbox-eigenen SID-, ACL-, Token-, Datei- und Lock-Deklarationen werden von [`verify/abi-probe.cpp`](verify/abi-probe.cpp) gegen Windows-Header geprüft. Die gemeinsame Prozess-, stdio- und Job-ABI gehört zu [`@deepseek-ai/dsh-win32-process`](../../subprocess/win32-process/README.de.md#header-verification) und wird dort verifiziert.

| Datei | Rolle |
|---|---|
| [`src/index.ts`](src/index.ts) | `AclSandbox`: Restricted-Token-Policy, DACL-Grants, fail-closed Spawn und Dispose |
| [`src/runner.ts`](src/runner.ts) | Der Runner-Eintrag über gemeinsamen Win32-Prozess-Primitiven |
| [`src/grant.ts`](src/grant.ts) | `AclWriteGrant`: serverseitige Grant-Materialisierung und -Widerrufung |
| [`src/token.ts`](src/token.ts) + [`src/acl.ts`](src/acl.ts) | Win32-Token- und DACL-Primitive hinter der Sandbox |

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Beginne mit der Subsystem-Referenz für das gemeinsame Vokabular, dann dem Provider, der diese Stufe mountet, dessen Consumern und der Designentscheidung.

- [Prozess-Sandbox-Subsystem](../../../docs/subsystems/sandbox.de.md) — Modi, Policy pro Aufruf und Durchsetzungssemantik.
- [Lokale Sandbox-Backends](../sandbox-local/README.de.md) — der Provider, der dieses Backend als win32-Stufe mountet.
- [Sandbox-seam-Paket](../sandbox/README.de.md) — der Service-Vertrag, den dieses Backend implementiert.
- [Win32-Prozessbibliothek](../../subprocess/win32-process/README.de.md) — gemeinsame Primitiven für eingeschränkte Prozesse, stdio, Job, Warten und Handle-Aufräumen.
- [Bash-Sandbox-Executor](../../shell/bash-sandbox/README.de.md) und [pwsh-Sandbox-Executor](../../shell/pwsh-sandbox/README.de.md) — die eingeschränkten Executoren, die es konsumieren.
- [Windows-ACL-Restricted-Token-Sandbox-Entscheidung](../../../.agents/notes/implemented/feature/2026-08-08-windows-acl-restricted-token-sandbox.de.md) — warum rohe ACL-Restricted-Tokens statt mxc und AppContainer.

-----

<a id="model-experience"></a>
## Model Experience

Indirekt, über [`dsh-bash-sandbox`](../../shell/bash-sandbox/README.de.md), [`dsh-pwsh-sandbox`](../../shell/pwsh-sandbox/README.de.md) und ihre Tools, die die Partial-Enforcement- und Denial-Fakten dieses Backends rendern (das eingeschränkte stderr, das die Tool-Ebene über `denialSignatures` klassifiziert), während der [`dsh-sandbox`](../sandbox/README.de.md)-seam den `SANDBOX_UNAVAILABLE`-Text besitzt und `sandbox-local` die Runner-Auswahl besitzt.

#### KV-Cache-Effekt

Keiner direkt; die Denial-Fläche gehört der Tool-Ebene.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wann das Backend schlecht passt oder besondere Betriebssorgfalt braucht. Sie sind aktuelle Paket-Constraints, kein allgemeiner Windows-Vergleich und kein Aufgabenrückstand.

- **Eine Schreib-Allowlist pro Workspace** — die Write-SID ist die Einheit der Allowlist und IST die Workspace-Identität; die Wiederverwendung einer Sandbox-Instanz über zwei Workspaces weitet beide Grants auf beide Roots aus. Erzeuge eine Instanz pro Workspace-Root — der seam tut genau das, keyed am Workspace-Pfad.
- **Aufräumen ist bewusst best-effort** — `dispose()` versucht jede Temp-Widerrufung und aggregiert Fehler in einen `AggregateError`; ein Aufräumfehler kann das zufällige Verzeichnis und seinen Nur-Temp-SID-ACE zurücklassen. Sobald der Prozess endet, trägt kein zukünftiges Token diese SID, sodass der Rest inert bleibt, bis OS-Temp-Hygiene oder manuelles Entfernen ihn einzieht.
- **Stehende Workspace-ACEs sind unsichtbare Rückstände** — das Umbenennen eines Workspace leitet eine neue SID ab; die alten ACEs auf dem alten Pfad bleiben (inert, nur Write-SID), und ein zukünftiges Aufräumkommando kann sie einziehen.
- **NULL-DACL-Verzeichnisse sind unter grant+revoke nicht identitätserhaltend** — ein Verzeichnis mit NULL-DACL bedeutet „Vollzugriff für alle“; `grantWrite` baut die neue ACL aus diesem Null, und der Revoke-Roundtrip hinterlässt eine leere (Deny-all)-DACL statt der ursprünglichen NULL-DACL. Reale Workspace- und Temp-Verzeichnisse tragen reale DACLs, sodass dies ein dokumentierter Grenzfall bleibt.
- **Pipe-stdio-Capture ist für eingeschränkte Enkelprozesse unmöglich** — libuvs Pipe-stdio nutzt Named Pipes, deren Client-Ende-Open Schreibzugriff anfordert, den keine restricting SID gewährt bekommt (die Default-SD-Vorlage der Win32-Ebene, nicht die Token-Default-DACL), sodass `spawn(..., { stdio: 'pipe' })` innerhalb eines eingeschränkten Prozesses mit EPERM fehlschlägt; geerbte und ignorierte stdio-Spawns funktionieren, und anonyme Pipes (PowerShell-Pipelines) funktionieren, weil die Default-DACL des Restricted Token einen Full-access-ACE für die restricting SID trägt.
- **Grant-Materialisierung ist eine eifrige Vollbaum-Propagierung** — `SetNamedSecurityInfoW` auf einem Verzeichnis mit vererbbaren ACEs läuft sofort jeden Nachfahren ab (Dutzende Sekunden auf großen Workspace-Bäumen); die Pro-Workspace-Identität zahlt es einmal pro Workspace und Maschine, und der Exakt-ACE-Skip macht jede spätere Provisionierung billig.
- **Lese-seitige Isolation und Netzwerk-Policy sind out of scope** — `WRITE_RESTRICTED` schneidet nur Schreibzugriffe; kombiniere dieses Backend mit einer Lese-Policy für stärkere Isolation.
- **Warnungen für weite Verzeichnisse und FAT-Volumes sind zurückgestellt; FAT-artige Ziele bleiben beschreibbar** — die UI-seitigen Warnungen sind nicht implementiert, ein FAT-Volume als Grant-Root schlägt laut fehl, und ein FAT-artiges Ziel außerhalb der gewährten Roots hat keine Sicherheitsdeskriptoren und bleibt daher in beiden eingeschränkten Modi beschreibbar; FAT wird als Legacy-Rest behandelt.
- **Der PowerShell-Sprachmodus unterscheidet sich je nach eingeschränktem Modus** — unter `read-only` kann PowerShell seine AppLocker-Probedateien nicht im Temp-Verzeichnis erzeugen und startet konservativ in ConstrainedLanguage (`Add-Type`, nicht-core .NET-Statikaufrufe, COM und Reflection schlagen fehl); der ausgelieferte `workspace-write`-Pfad lässt die Probe zu Ende laufen, sodass pwsh in FullLanguage bleibt, sofern keine host-weite WDAC/AppLocker-Policy etwas anderes vorgibt, während ein direktes `AclSandbox` mit `tempDir: null` diese Garantie nicht hat. Diese Teilung ist PowerShell-Startverhalten, nicht Teil der ACL-Schreibgrenze.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen</summary>

Diese Dev Note ist Arbeitskontext für Maintainer: unentschiedene Richtungen und offene Fragen. Sie ist ausdrücklich nicht maßgeblich — ausgeliefertes Verhalten, Grenzen und angenommene Begründungen stehen in den Abschnitten oben, im Paketcode und in den verlinkten Agent Notes.

#### Zukunft: Warn- und Aufräumflächen

Die Warn-only-Haltung für ungewöhnlich weite Verzeichnisse und FAT-artige Volumes ist in den Einschränkungen oben dokumentiert, aber nicht implementiert, und ein Aufräumkommando, das stehende Workspace-ACEs von umbenannten Workspaces einzieht, ist unentschieden. Beides sind offene Richtungen, kein ausgeliefertes Verhalten.

</details>

**Runtime-Invariante:** Es wird kein Begleiter veröffentlicht. Dieses Paket exponiert keine unabhängige Ereignisfolge oder veränderbare Datenrelation jenseits der fail-closed-Verträge, die es an jeder Win32-Aufrufgrenze durchsetzt.
