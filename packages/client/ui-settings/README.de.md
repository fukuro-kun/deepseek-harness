---
description: "Basis-Plugin der Settings-Domain: der Settings-Namespace-Scope-Service, der Schema-Service und der kanonische Settings-Slot-Typ-Contract für den dsh-Web-Client."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings

[English](README.md) | [中文](README.zh.md) | Deutsch

## Zusammenfassung

Dieses Paket lässt Web-Client-Features editierbare Preferences exponieren, die vom Host-Settings-Dokument getragen werden, ohne eigenes Transport- oder Schema-Handling zu implementieren. Jedes Feature erhält namespace-scoped Reads und Writes, atomare Multi-Field-Updates, Schema-Validierung und Schutz vor dem stillen Überschreiben konkurrierender Änderungen. Es stellt außerdem die Standard-Extension-Points für Settings-Chrome, Seiten, Header-Aktionen, Plugin-Tabs und Onboarding bereit, rendert aber selbst keine Oberfläche. Jedes preference-besitzende Feature kann es nutzen, ohne von einem Presentation-Paket abzuhängen; die Settings-Shell liefert ein separates Paket.

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

Feature-Plugins nutzen dieses Paket, um ihre Preferences zu speichern und zu bearbeiten, ohne Transport- oder Schema-Handling neu zu implementieren. Einmal pro Composition mounten; es injiziert den `remote`-Service mit seinem `settings`-Namespace und besitzt den einzigen `settings.describe`-Reader im Browser.

### Einen Namespace binden

Ein Feature ruft `ctx.settingsScope.bind(spec)` mit einer per-Namespace-Spec auf und erhält einen aus dem geteilten Dokument-Mirror abgeleiteten Scope. Der Scope-Snapshot trägt die aufgelöste Section, die Composition-`base`, das rohe `user`, die Revision, die Schreibbarkeit und den Host/Memory-Modus; ein Feld gilt als überschrieben, sobald es in `user` vorhanden ist, selbst wenn sein Wert `base` entspricht, und `unset` löscht diese Überschreibung. Writes laufen über den Scope: `set` und `unset` reichen eine Operation ein, während `mutate` mehrere geordnete Operationen atomar einreicht. Jeder Write wird durch die Namespace-Revision als `expectedRevision` abgesichert, sodass ein konkurrierender Write von einer anderen Oberfläche abgelehnt statt still überschrieben wird. Ein staged Editor kann die Revision, bei der sein Draft begann, als feste Absicherung übergeben; andernfalls verwendet der Scope die zuletzt gequeuete oder gespiegelte Revision.

### Die Settings-Slots füllen

Eine Settings-Oberfläche registriert sich in die Slot-Typen, die dieses Paket deklariert. Die Shell (`sidebar.settings`-Occupant, Navigation, Chrome) lebt in ui-settings-general; Feature-Seiten registrieren `settings.section`-Beiträge; die Plugins-Section hostet `settings.plugins.tab`-Seiten; Onboarding-Schritte registrieren `settings.onboarding`. Namespace-übergreifende Oberflächen (Schema-Introspektion, das Directory der ausgelieferten Namespaces, `hasDocument`) lesen denselben Mirror über `ctx.settingsScope.describe()`.

### Beobachtbarer Erfolg und Fehler

Ein gebundener Scope spiegelt die aktuelle Dokument-Revision sofort; ein committeter Write faltet seine Antwort ohne erneutes Lesen zurück in den Mirror. Ein abgelehnter oder fehlgeschlagener neuester Write löst einen Mirror-Recovery-Read aus; ein überholter Write überlässt die Recovery seinem Nachfolger. Ohne `decode` in der Spec publiziert eine Section, die kein plain Object ist oder die Schema-Rehydration nicht besteht, keinen Wert — eine Zeile rendert dann ihren eigenen Absent-State statt eines halb dekodierten.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Implementierungsinterna — zum Aufklappen klicken</summary>

Das Paket realisiert eine Ownership-Regel: Der Browser hält einen geteilten Mirror des Settings-Dokuments, und jede abgeleitete Oberfläche liest diese eine Quelle, sodass jeder Zeitpunkt dieselbe Dokument-Revision zeigt.

### Der Describe-Mirror

Das Plugin injiziert `remote` mit seinem `settings`-Namespace, löst die Host-Persistence einmal aus den festen `remote.$host`-Fakten auf und besitzt den einen `settings.describe`-Reader im Browser: einen geteilten Mirror, der bei jedem weitergeleiteten `settings/document-updated`-Event und bei `connection/reset` aktualisiert wird (die erste Connection eingeschlossen, was das Fenster schließt, in dem ein Commit zwischen dem eager Read und der SSE-Subscription landet). Namespace-übergreifende Oberflächen lesen ihn über `ctx.settingsScope.describe()`, eine Read/Fold-Face (`getSnapshot`/`subscribe`/`ensure` plus `acceptView`, das eine Write-Antwort einfaltet).

### Scope-Ableitung

`ctx.settingsScope.bind(spec)` liefert auf dem Context des Callers einen per-Namespace-Scope, der aus dem Mirror abgeleitet wird: Der Disposer des Scopes gehört der aufrufenden Fiber, das Binden fügt keinen Wire-Read hinzu, und die Aktivierung einer Zeile blockiert nie auf dem Settings-Transport. Writes bleiben pro Scope: `set` und `unset` sind Einzeloperationsformen von `mutate`, das mehrere geordnete Feldoperationen kopiert und hinter einer Namespace-Revision als `expectedRevision` einreiht. Eine committete Mutation faltet ihre Antwort ein, eine abgelehnte oder fehlgeschlagene neueste Mutation löst einen Recovery-Read aus, und eine überholte überlässt die Recovery ihrem Nachfolger. Die Cold-Boot-Read-Anzahl wird durch `../../../apps/web/tests/startup-rpc-budget.e2e.ts` festgepinnt; ein neuer direkter `settings.describe`-Caller im Client-Code ist eine Regression dagegen.

### Schema-Service

`ctx.settingsSchema` führt synchrone Schema-Rehydration, Validierung und immutable Path-Edits für Settings-Plugins durch. Ohne `decode` in der Spec publiziert eine Section, die kein plain Object ist, ihr rehydriertes Schema nicht besteht oder einen Schema-Envelope trägt, den dieser Client nicht rehydrieren kann, überhaupt keinen Wert.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Lektüre

Diese Seiten decken die Settings-Oberflächenfamilie und den durable Seam dahinter ab.

- [ui-settings-general](../ui-settings-general/README.de.md) — die Settings-Shell: Trigger-Chrome, Navigation, General-Section, Onboarding-Projektion.
- [ui-settings-plugins](../ui-settings-plugins/README.de.md) — die Plugins-Section und ihre konfigurierbaren Host-Plane-Cards.
- [ui-settings-models](../ui-settings-models/README.de.md) — die Models-Seite und das DeepSeek-Onboarding über dieser Basis.
- [settings](../../settings/README.de.md) — der durable User-Settings-Seam und sein File-Provider.
- [ui-sidebar](../ui-sidebar/README.de.md) — die Sidebar-Shell, deren unterer Sitz den Settings-Trigger hostet.

-----

<a id="model-experience"></a>
## Model Experience

Keine, da das Paket eine browserseitige UI-Plugin-Schicht ist, die nichts Modellzugewandtes registriert.

#### KV-Cache-Effekt

Keiner; dieses Paket assembliert oder sendet keinen Provider-Request.

## Bekannte Einschränkungen und zurückgestellte Arbeit

<a id="known-limitations-and-deferred-work"></a>


Diese Grenzen definieren, wohin der Settings-Transport nicht reicht; sie sind aktuelle Paket-Constraints.

- **Non-Loopback-Seiten erhalten keine durable Settings** — dieser Client hält Host-Persistence dort deaktiviert, sodass ein Scope `unavailable` startet und nie über die Wire geht; jede Zeile, die er trägt, ist dort inert, obwohl die Connection-Authentifizierung die API abdeckt.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Aufklappen klicken</summary>

Keiner.

</details>

**Runtime-Invariante:** Es wird kein Companion veröffentlicht. Eine Presentation-Shell, die den `settings.section`-Ledger in Navigation projiziert — sie emittiert keine Cordis-Events und besitzt keine pluginübergreifende mutable Relation; Slot-Deklarations-/Registrierungskonflikte schlagen bereits laut im Slot-Core zur Ladezeit fehl.
