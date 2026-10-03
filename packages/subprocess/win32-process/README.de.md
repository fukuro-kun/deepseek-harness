---
description: "Low-Level-Win32-Prozess-Primitive für Maintainer, die die Windows-ACL-Sandbox und den gewöhnlichen Subprocess-Job-Runner implementieren oder debuggen."
kind: "package-library"
---

# @deepseek-ai/dsh-win32-process

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Diese Low-Level-Win32-Prozessbibliothek wird von der Windows-ACL-Sandbox und dem gewöhnlichen Subprocess-Job-Runner konsumiert. Sie besitzt die eine Koffi-Binding-Tabelle des Repositorys für wiederverwendbare Process-, Stdio- und Job-Object-Operationen; sie ist kein Cordis-Service und wählt weder Sandbox-Policy noch öffentliches Child-Verhalten. Lies diese Seite, wenn du einen der beiden nativen Prozesspfade wartest oder seine Handle-Lifetime-Grenzen prüfst.

## Inhaltsverzeichnis

- [Verhalten](#behavior)
- [Header-Verifikation](#header-verification)
- [Model Experience](#model-experience)
- [Bekannte Einschränkungen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="behavior"></a>
## Verhalten

- **Ein wiederverwendbarer ABI-Owner** — `abi.ts` besitzt die Win32-Konstanten und x64-Layout-Werte, die beide Prozesspfade konsumieren. `ffi.ts` lädt `kernel32.dll` und `advapi32.dll` lazy, verifiziert `STARTUPINFOW` und `PROCESS_INFORMATION`, exponiert getypte Operationen und Fehlerformatierung und lässt die Sandbox-Policy ihre übrigen APIs über dieselben geladenen Bibliotheken binden.
- **Restricted-Token-Erzeugung** — `RestrictedProcessSpawnOptions` erfordert den Primary Token der Sandbox und verwendet `CreateProcessAsUserW`. Die Piped- und Inherited-Stdio-Pfade teilen Command-Line-Quoting, cwd, die Restricted-Token-Null-Environment-Policy, geprüfte Rückgabewerte und Handle-Cleanup.
- **Piped-Process-Primitiv** — `spawnPipedProcess()` erzeugt anonyme stdin/stdout/stderr-Pipes, schließt stdin sofort, gibt die beiden Read-Enden zurück und überlässt das Prozess-Warten und Pipe-Draining dem Caller. Jeder Teilfehler schließt die Handles, die die Operation bereits besitzt, und jeder Koffi-Out-Parameter oder Struct-Allocation wird nach seiner Win32-Lifetime freigegeben.
- **Inherited-Stdio-Job-Primitiv** — `spawnInheritedJobProcess()` erzeugt einen Kill-on-Close-Job, markiert die aktuellen Stdio-Handles vorübergehend als vererbbar, erzeugt das restricted Child suspended, weist es dem Job zu und setzt danach seinen initialen Thread fort. Ziel-Code kann vor der Job-Zuweisung nicht laufen; kontrollierte Zuweisungs- oder Resume-Fehler terminieren das suspended Child oder schließen den zugewiesenen Job, bevor jedes besessene Handle freigegeben wird.
- **Ordinary-Job-Runner-Primitiv** — `CurrentTokenProcessSpawnOptions` erfordert einen aufgelösten `applicationName`, die vollständige Ziel-Environment und drei dem Ziel-stdin, -stdout und -stderr gewidmete Runner-CRT-Deskriptoren. `spawnCurrentTokenJobProcess()` mappt diese Deskriptoren über Nodes exportiertes `uv_get_osfhandle()` auf OS-Handles, weist ungültige Ergebnisse zurück, markiert die Handles vorübergehend als vererbbar und reicht sie über `STARTF_USESTDHANDLES` durch. Es sendet einen sortierten UTF-16LE-Environment-Block mit `CREATE_UNICODE_ENVIRONMENT`, erzeugt das Ziel suspended über `CreateProcessW`, weist es einem unbenannten Kill-on-Close-Job zu und setzt es erst nach der Zuweisung fort. Der ursprüngliche Command-Line-argv-Eintrag bleibt unverändert, und der Runner kann seine Carrier-Deskriptoren schließen, ohne Nodes eigene Standard-Streams anzufassen.
- **Ordinary-Settlement-Operationen** — `pollProcessExit()` publiziert direkte Exits separat, während `isJobEmpty()` `QueryInformationJobObject(JobObjectBasicAccountingInformation)` liest, bis `ActiveProcesses` null erreicht. Geprüfte Job-Termination und Handle-Schließung halten den Runner als einzigen nativen Owner.
- **Explizite Settlement-Ownership** — `waitForProcessExit()` wartet auf und schließt ein Sandbox-Process-Handle; Ordinary-Runner-Process-Polling, Job-Accounting und geprüfte Job-Termination/-Schließung bleiben separate Operationen. `drainPipe()` verwendet während des Drainens einen nativen Count-Slot wieder, gibt ihn frei und schließt das Pipe-Read-Handle. Jeder Caller besitzt seine Result-Composition und zurückgegebenen Handles.

Die Windows-ACL-Sandbox fügt über diesen Primitiven SID-, DACL-, Grant-, Workspace- und Public-Child-Policy hinzu.

<a id="header-verification"></a>
## Header-Verifikation

Die Process-, Stdio- und Job-Konstanten sowie ausgewählte Strukturgrößen und -Offsets werden von [`verify/abi-probe.cpp`](verify/abi-probe.cpp) gegen die MinGW-Windows-Header geprüft:

```sh
g++ -std=c++20 -municode -O2 -o abi-probe.exe verify/abi-probe.cpp && ./abi-probe.exe
```

Die Koffi-Definitionen von `STARTUPINFOW` und `PROCESS_INFORMATION` asserten beim Modul-Load zusätzlich ihre 64-Bit-Größen. Die Probe fixiert außerdem Pointer- und Handle-Breiten, das Unicode-Environment-Flag sowie die Größe des Basic-Job-Accounting-Records und den `ActiveProcesses`-Offset, die zur Quiescence-Bestimmung verwendet werden; sie bleibt die Evidenz für die übrigen aufgezeichneten Offsets und Konstanten.

<a id="model-experience"></a>
## Model Experience

### Prozess-Primitive

#### Was das Modell sieht

Nichts direkt. Das Paket exponiert `Win32ProcessBindings`, `CurrentTokenProcessBindings` und Prozess-Primitive an Sandbox und Ordinary Runner, die alle modellsichtbaren Tools, Ausgaben und Diagnosen besitzen; dieses Paket steuert weder Prompt-Text noch Tool-Schema bei.

#### Token-Effekt

Keiner direkt. Consumer entscheiden, ob Prozessausgabe in ein Tool-Result oder einen späteren Model-Request einfließt.

#### KV-Cache-Effekt

Das Paket steuert keinen stabilen Request-Prefix bei und invalidiert daher keine Model-KV-Caches.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>

- **Nur Windows-natives Laden** — das Importieren der generischen Typen ist portabel, aber das Auflösen der Binding-Tabelle lädt Windows-DLLs und schlägt auf anderen Hosts fehl. Cross-Platform-Tests injizieren stattdessen eine Binding-Tabelle, statt native APIs zu laden.
- **Kein public Process-Service** — das Paket wrapped seine Primitive bewusst nicht in Cordis- oder Node-Streams. Ein Consumer muss seine Policy, Async-Scheduling, Output-Limits, Cancellation und die finale Handle-Schließung selbst besitzen.
- **Restricted-Token-Null-Environment** — die `CreateProcessAsUserW`-Sandbox-Primitive übergeben einen Null-Environment-Block und etablieren Änderungen zuerst über `SetEnvironmentVariableW`, weil ein expliziter Block über Koffi mit `ERROR_INVALID_PARAMETER` fehlschlägt. Der gewöhnliche `CreateProcessW`-Runner erfordert dagegen eine vollständige Ziel-Environment und übergibt einen sortierten, doppelt-NUL-terminierten UTF-16LE-Block, einschließlich `=X:`-Drive-Einträgen, ohne die eigene Environment zu mutieren.
- **Keine standalone Process-API** — das Paket exponiert die Operationen, die die aktuellen Sandbox- und Ordinary-Runner-Consumer brauchen, besitzt aber weder Node-Streams, public Handles, Output-Policy, Cancellation noch durable State.
- **Create-to-Assignment-Unterbrechung** — das Ziel startet suspended und kann vor der Job-Zuweisung nicht ausführen, aber eine externe Termination des Runners im schmalen Intervall zwischen Prozesserzeugung und Zuweisung kann das suspended Ziel zurücklassen. Das Paket erhebt keinen Anspruch auf atomare Job-Attachment.
- **Header-Evidenz ist architekturspezifisch** — die committed ABI-Probe und Layout-Konstanten decken die aktuellen 64-Bit-Windows-Ziele des Repositorys ab. Eine neue Pointer-Breite oder ein inkompatibles Windows-ABI erfordert ein Update der Probe, bevor Support behauptet wird.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Operationen besitzen nur call-lokale native Handles.
