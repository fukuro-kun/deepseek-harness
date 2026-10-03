# Agent Note: Invariant-Companions ohne unabhängige Beobachtungen weglassen

Status: implemented

[English](2026-08-28-omit-unneeded-invariant-companions.md) | [中文](2026-08-28-omit-unneeded-invariant-companions.zh.md) | Deutsch

## Problem

Die Package-Invariant-Regel verlangte, dass jedes Workspace-Package `./invariant` publiziert, einschließlich Packages ohne zu prüfende Runtime-Beziehung. Der aktuelle Workspace hatte 209 erklärt-leere Companions, jede mit Source-Datei, Public-Export, Publication-Eintrag, Invariant-only-Dependencies oder TypeScript-Referenzen, Build-Verdrahtung und Registrierungstests. Diese Machinerie drückte ein negatives Fazit aus, ohne eine Runtime-Assertion hinzuzufügen.

Der `dsh-host-webserver`-Companion exponierte dasselbe Problem in ausführbarer Form. Er registrierte und disposte synthetische Reserved-Routes auf Plugin-Lifecycle-Events und rief dann dieselben Service-Operationen erneut auf, um Residuen zu erkennen. Der Probe hatte keine unabhängig erzeugte Beobachtung: Er mutierte und inspizierte dieselbe Route-Tabelle durch die Implementierung, die er zu verifizieren vorgab, während echte Route- und HMR-Tests Duplicate-Rejection und Disposer-Symmetrie bereits abdeckten.

## Entscheidung

### Unabhängige Beobachtungen rechtfertigen Publication

Ein Package publiziert `./invariant` nur, wenn es Beobachtungen vergleichen kann, die unabhängig divergieren können. Qualifizierende Beziehungen umfassen Cross-Event-Lifecycle-, Ordering-, Identity- oder Pairing-Protokolle; Events, die mit authoritativem mutablen State verglichen werden; Output, der aus mehreren Producern oder Adaptern assembliert wird; und durable Daten, die später von einer anderen Operation gefoldet oder konsumiert werden.

Service- oder Method-Präsenz, Plugin-Metadaten oder -Effects, feste reine Beispiele und Probes, die dieselbe Mutation aufrufen, die sie zu verifizieren vorgeben, bleiben Type-, Load-, Unit- oder Integration-Test-Concern. Parser- und Config-Input, Modell- oder Tool-JSON, durable Dateien, Worker- und Prozess-Messages und Wire-Input bleiben an ihrer besitzenden Input-Operation validiert.

Der `dsh-time-context`-Companion bleibt publiziert. Sein Check vergleicht die Plugin-produzierte Context-Message mit unabhängig besessener Current-Turn-User-Message-Provenance und durabler Event-Zeit, sodass Attribution, Turn-Position und Elapsed-Time-Relationen divergieren können, selbst wenn der Formatter selbst korrekt ist.

### Weglassen ist im Package-README explizit

Ein Package ohne qualifizierende Beziehung lässt `src/invariant.ts`, den `./invariant`-Export, die `lib/invariant.js`-Publication, Invariant-only-Dependencies und TypeScript-Referenzen, Build-Einträge und Companion-only-Tests weg. Seine englischen und chinesischen Package-READMEs geben an, dass kein Companion publiziert wird, und nennen den Package-spezifischen Grund. Leere Installer werden abgelehnt, weil Source-Abwesenheit plus die README-Erklärung die Entscheidung jetzt direkt ausdrücken.

`verify-package-invariants` scannt jedes Package. Es verlangt einen Package-spezifischen Weglassungs-Grund im englischen README, lehnt partielle Export-, Publication- oder Companion-Build-Verdrahtung ab, lehnt leere Installer ab und wendet die Registrierungs-, Loader-Namespace-, Reporter-Use-, Dependency-, Referenz- und Build-Checks auf jeden publizierten Companion an. Der Vitest-Host mountet den Companion des aktuellen Packages nur, wenn einer existiert, während Topology- und Built-Artifact-Checks die publizierte Menge aufzählen.

### Audit-Ergebnis

Das Repository-weite Audit entfernte die 209 erklärt-leeren Companions und den synthetischen `dsh-host-webserver`-Companion und hinterließ 39 Checks mit unabhängigen Beobachtungen. Die behaltene Menge umfasst Cross-Event-Protokolle wie Session-, Command-, Approval-, Workflow- und Hook-Lifecycles; Event-to-State-Checks wie Settings, Storage-Domain, Workspace, Client-Modules und Slots; Multi-Producer-Assembly wie System-Prompt und Time-Context; und durable Daten, die von Projections oder Policy-State konsumiert werden, wie Todo, Plan-Mode und Sandbox-Mode.

Bestehende Package-Behavior-Tests bleiben für weggelassene Beziehungen verantwortlich, einschließlich Webserver-Route-Registrierung und HMR-Disposal. Produktverhalten und Root-Package-Entrypoints ändern sich nicht; die weggelassenen `./invariant`-Subpaths werden unter der Pre-Release-Kompatibilitätshaltung des Repository entfernt.

## Erwogene Alternativen

- **Erklärt-leere Companions behalten.** Abgelehnt, weil eine Source-Datei, ein Public-Subpath, Dependency-Kanten, Build-Output und Tests eine unverhältnismäßige Machinerie sind, um zu sagen, dass kein Check existiert; das Package-README hält dieses Fazit direkt fest.
- **Den Webserver-Probe als Teardown-Sentinel behalten.** Abgelehnt, weil er eine Reserved-Route auf unverbundenen Lifecycle-Events mutiert und nur die Service-Methode verifiziert, die er aufruft. Echte Routing- und HMR-Tests üben das Verhalten ohne produktive diagnostische Effects.
- **Jeden Producer-Format-Parser als Selbst-Validierung behandeln.** Abgelehnt, weil ein Parser unabhängige Provenance, Timing oder durable History vergleichen kann, selbst wenn ein Producer den Text besitzt. `dsh-time-context` qualifiziert sich, weil seine Message gegen Current-Turn-User-Messages und durable Event-Zeit gecheckt wird; ein Same-Writer-Payload-Roundtrip allein würde nicht qualifizieren.
- **Jedes Package mit mutablendem privatem State zum Publizieren eines Companions verpflichten.** Abgelehnt, weil privater State ohne unabhängiges Event oder zweite Datenquelle nicht gecheckt werden kann, ohne die Implementierung zu duplizieren oder neue API nur für Diagnostik zu exponieren.

## Konsequenzen

- Packages mit bedeutsamen Checks behalten unabhängig ladbare, filterbare, Package-attribuierte Companions.
- Packages ohne Checks haben keine Invariant-Source, keinen Public-Subpath, kein Build-Artefakt und keine Invariant-only-Dependency-Last, und ihre READMEs bewahren den Grund.
- Das Hinzufügen einer mutablen Beziehung oder eines konsumierten Event-Protokolls erfordert, das Weglassen erneut zu prüfen, das README zu aktualisieren und einen fokussierten Companion mit einem negativen Test hinzuzufügen.
- Die Invariant-Service-Konfiguration, Ownership-Uniqueness, Child-Fiber-Lifecycle, Filtering-, Rollback-, Disposal- und HMR-Contracts bleiben unverändert.
- Die frühere [Meaningful-Runtime-Contract-Entscheidung](../architecture/2026-07-19-package-invariant-runtime-contracts.md) bleibt maßgeblich für semantische Check-Qualität; diese Entscheidung supersedet ihre erschöpfende Publication und die erklärt-leere Form.
