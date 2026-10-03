# Agent Note: isolate bwrap from the host PID namespace

Status: implemented

[English](2026-08-06-bwrap-private-pid-namespace.md) | [中文](2026-08-06-bwrap-private-pid-namespace.zh.md) | Deutsch

## Problem

Das bwrap-Backend mountete ein frisches `/proc`, behielt aber den Host-PID-Namespace. Ein eingeschlossenes Kommando konnte daher Host-Prozesse sehen und procfs-Magic-Links wie `/proc/<pid>/root`, `/proc/<pid>/fd` oder `/proc/<pid>/cwd` in die Mount-Sicht eines Host-Prozesses folgen. Wenn Zugriffskontrollen das Folgen einer dieser Links erlaubten, entkam der Pfad dem Read-only-Host-Root-Bind des Profils und der `workspace-write`-Allowlist. Host-ptrace-Restriktionen blockierten den Pfad manchmal, aber diese deploymentabhängigen Berechtigungen waren keine Confinement-Grenze.

Die ursprüngliche [Sandbox-Entscheidung](../feature/2026-07-06-sandbox.de.md) ließ die Prozesssichtbarkeit bewusst unverändert, weil `SandboxMode` Dateieffekte verspricht statt allgemeiner Prozessisolation. Procfs-Magic-Links machen Host-Prozesssichtbarkeit für bwrap zu einem Teil der Dateieffekt-Grenze, sodass diese Wahl die versprochenen Modi nicht bewahren kann.

## Decision

Jedes bwrap-Profil nutzt `--unshare-pid` und mountet `/proc` für diesen privaten Namespace. Das eingeschlossene Kommando kann seine Descendants beobachten und steuern, während Host-Prozesse und ihre procfs-Magic-Links abwesend sind. Bubblewrap stellt den PID-1-Prozess des Namespaces bereit, um Descendants zu reapen.

Die funktionale bwrap-Probe nutzt denselben Profile-Builder wie echte Wraps. Ein Host, der den PID-Namespace nicht erzeugen kann, lehnt bwrap daher während der Auswahl ab und fällt auf Landlock zurück, statt eine schwächere Probe zu akzeptieren und später zu failen.

Dies ist eine bwrap-Backend-Invariante, kein neues `SandboxMode`-Versprechen. Landlock und Seatbelt lassen die Prozesssichtbarkeit weiterhin unverändert, und kein Backend beschränkt Netzwerkzugriff.

## Alternatives considered

- **Ausgewählte procfs-Links maskieren bei Beibehaltung der Host-Prozesssichtbarkeit.** Per-Prozess-Einträge sind dynamisch, und nur `root` abzudecken ließe äquivalente Übergänge über `fd`, `cwd`, `exe` und künftige Magic-Links offen. Eine Blocklist kann die Grenze nicht etablieren.
- **Auf ptrace- und procfs-Ownership-Checks verlassen.** Ihr Verhalten hängt von Kernel-Einstellungen, Container-Konfiguration, Prozess-Credentials und Dumpability ab. Same-User-Prozesse können erreichbar sein, daher sind diese Checks Defense-in-Depth statt der Autorität des Profils.
- **`/proc` ganz entfernen.** Gewöhnliches Prozess-Tooling und Descendant-Management erwarten procfs. Ein privater PID-Namespace mit passendem procfs bewahrt diese Mechanik, ohne Host-Prozesse zu exponieren.

## Verification

Profil-Unit-Tests pinnen PID-Unsharing in beiden Confinement-Modi. Real-bwrap-Tests verifizieren, dass beide Modi eine von der des Harness verschiedene PID-Namespace-Identität melden, einen Write durch `/proc/1/root` ablehnen, das Host-Ziel abwesend lassen und dem Kommando weiterhin erlauben, seinen eigenen Descendant zu beobachten, zu terminieren und darauf zu warten.

## Consequences

- bwrap-eingeschlossene Kommandos inspizieren oder signalisieren keine Host-Prozesse mehr, einschließlich Same-User-Prozessen.
- `read-only` und `workspace-write` hängen nicht mehr von der Host-procfs-Zugriffspolicy ab, um Mount-Profil-Escapes zu verhindern.
- Hosts ohne nutzbare PID-Namespaces wählen über die bestehende Fail-closed-Leiter das nächste unterstützte Linux-Backend.
- Die geänderte Garantie ist Kernel-Confinement statt modellsichtbarer Output, Protokoll oder Transcript-Text; daher ist das Real-Backend-e2e der assemblierte Akzeptanzpfad, und keine Snapshots ändern sich.
