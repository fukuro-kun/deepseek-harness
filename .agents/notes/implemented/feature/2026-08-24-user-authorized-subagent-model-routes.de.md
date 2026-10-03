# Agent Note: Nutzerautorisierte Subagent-Modellrouten
[English](2026-08-24-user-authorized-subagent-model-routes.md) | [中文](2026-08-24-user-authorized-subagent-model-routes.zh.md) | Deutsch

Status: implemented


## Problem

Die Registrierung eines LLM-Adapters macht seine Routen erreichbar, autorisiert einen Agent aber nicht, für ein Child jedes erreichbare Modell zu wählen. Eine einzelne aktivierte Präferenz über der Live-Adapter-Registry weitet sich stillschweigend aus, sobald ein weiterer Provider oder ein weiteres Modell erscheint. Das Produkt braucht eine explizite, stabile Autorisierungsentscheidung, ohne ein potenziell großes Modellverzeichnis in jeden Parent-Request zu rendern.

## Entscheidung

Die Host-eigene Settings-Section `subagent-model-selection` speichert einen expliziten `enabled`-Schalter und `allowedModels`, ein Array exakter `{ provider, model }`-Routen. Aktivieren erfordert mindestens eine Route; Deaktivieren darf die gewählten Routen zur späteren Wiederverwendung behalten. Die Plugins-Settings-Card liest das Live-Adapter-Verzeichnis über `session/modelCatalog`, lässt den Nutzer Schalter und Routen stagen und speichert beide Felder in einer revision-gefenzten Settings-Mutation. Sie speichert keine adaptereigenen Anzeigenamen, Beschreibungen oder Reasoning-Effort-Metadaten. Eine gespeicherte oder gestagte Route, die im aktuellen Verzeichnis fehlt, bleibt als nicht verfügbar sichtbar und ist entfernbar; ein providerlokaler Katalogfehler blockiert weder andere Provider noch löscht er gespeicherte Autorisierung oder eine ungespeicherte Auswahl. Ein Verbindungsreset verwirft den Entwurf, weil Namespace-Revisionen nur innerhalb eines Host-Prozesses vergleichbar sind.

Eine neu komponierte Top-Level-Session snapshotet die Routenliste in `subagent/model-selection-policy`, wenn die Einstellung aktiviert ist, bevor ihre modellwählbaren Definitionen einen Request erreichen können. Das Vorhandensein des Events bedeutet, dass Auswahl aktiviert war; das Event speichert den globalen Schalter nicht. Child-Sessions erben exakt diese Liste von ihrem Live-Parent, und resumed Sessions verwenden das aufgezeichnete Event statt der aktuellen Settings. Settings-Änderungen wirken daher nur auf später komponierte Top-Level-Sessions, während eine Legacy-Session ohne das Event deaktiviert bleibt — einschließlich einer explizit leeren wiederhergestellten Session.

Das feste `list_subagent_models`-Schema enumeriert die Policy nicht. Zur Call-Zeit sind Provider- und Modell-Listings die Schnittmenge aus der Session-Routenliste und dem live vom Adapter annoncierten Verzeichnis. Ein exakter Provider/Model-Lookup verlangt zuerst Autorisierung und löst dann die adaptereigenen Modellmetadaten und alle annoncierten Reasoning-Efforts auf. Der Delegation-Executor lehnt zusätzlich jede explizite Provider-, Modell- oder Effort-Auswahl unabhängig ab, deren effektive Provider/Model-Route außerhalb der Session-Liste liegt, bevor `resolveCallConfig()` Adapter-Verfügbarkeit und Effort-Unterstützung validiert. Ein Call ohne Auswahlfeld behält konfiguriertes oder geerbtes Routing, weil das Modell keine Routenwahl getroffen hat.

Modellauswahl hat keinen uneingeschränkten statischen Modus. Die defaultmäßig ausgeschaltete Host-Einstellung ist die einzige Autorität, und eine aktivierte Session trägt immer eine exakte Allowlist. Das primäre spawn tool liest diese Einstellung; das mitgelieferte fork tool exponiert weiterhin keine Routenauswahl, damit geerbte Konversationspräfixe für providerseitige KV-Cache-Wiederverwendung in Frage kommen.

## Erwogene Alternativen

**Die erlaubten Routen in der Delegation-Beschreibung rendern.** Abgelehnt, weil eine große oder sich ändernde Liste jeden Request vergrößern und ein frühes Prompt-Präfix invalidieren würde. On-demand-Discovery hält das feste Schema präfixstabil und loggt Verzeichnisinhalt nur, wenn er angefragt wird.

**Nur die Settings-UI oder das Discovery-Ergebnis filtern.** Abgelehnt, weil ein Modell eine Route raten oder aus einem früheren transcript behalten kann. Die Autorisierung wird im Executor durchgesetzt, der das Child startet.

**Aktivierung aus einem nichtleeren `allowedModels`-Array ableiten.** Abgelehnt, weil Deaktivieren dann entweder eine nützliche Auswahl verwerfen oder ein nichtleeres Array behalten müsste, dessen Bedeutung von der Schreibhistorie abhängt. Der explizite Schalter ist maßgeblich, und der Settings-Scope übermittelt beide Felder in einer Host-validierten Mutation, sodass kein Zwischenzustand persistiert wird.

**Reasoning-Effort-Allowlists pro Route speichern.** Abgelehnt, weil die Nutzerentscheidung die Child-Modelle betrifft, während Effort-ids und Kompatibilität zur exakten Adapter-Route gehören. Jeder adapterunterstützte Effort bleibt verfügbar, sobald die Route autorisiert ist.

**Bei jedem Discovery- oder Delegation-Call die aktuellen Settings lesen.** Abgelehnt, weil eine Settings-Änderung die modellsichtbaren Capabilities und die Ausführungsautorität einer laufenden Session stillschweigend ändern würde. Der durable Session-Snapshot hält Resume und Child-Vererbung deterministisch.

## Konsequenzen

- Neue Adapter-Registrierungen und neu annoncierte Modelle erweitern die Nutzerautorisierung nicht.
- Adapter-Entfernungen oder Katalogfehler können reduzieren, was Discovery aktuell listet, ohne die gespeicherte Routenentscheidung zu löschen; eine exakt autorisierte Route bleibt nutzbar, wenn ihr Adapter sie akzeptiert, selbst wenn der advisory Katalog sie auslässt.
- Die Allowlist selbst verbraucht keine Parent-Request-Tokens. Nur ein `list_subagent_models`-Ergebnis gelangt in den transcript.
- Das Policy-Event ist log-only und wird während der Agent-Komposition appended, bevor eines der beiden SDKs seine Run-Subscription beginnt. Mitgelieferte SDK-Profile aktivieren diese Web-eigene Präferenz nicht, sodass das Event weder die erwarteten Notifications noch die persisted-session-Ausgabe eines SDK ändert; Package-Restore-Tests besitzen stattdessen seine durable Projection, statt nur für sein Emittieren eine SDK-Komposition zu fingieren.
- Unit-Coverage pinnt Settings-Validierung, malformed durable Values, Session-Sampling und -Vererbung, Discovery-Schnittmenge, Executor-Verweigerung, Live-UI-Katalog-Invalidierung, Staged-Route-Retention, Connection-Generation-Invalidierung, gestagte Ganz-Array-Schreibzugriffe, Stale-Revision-Ablehnung und Retry nach Scoped-Installation-Fehlschlag. Das assemblierte Web-Szenario pinnt das echte Settings-Dokument und den Plugins-Card-Fluss.

## Verwandte Entscheidungen

Routenargumente, Adapter-Preflight, Discovery-Tool und die Fork-Cache-Beschränkung bleiben im Besitz von [modellgewählte Subagent-Routen](2026-08-18-model-selected-subagent-routes.de.md).
