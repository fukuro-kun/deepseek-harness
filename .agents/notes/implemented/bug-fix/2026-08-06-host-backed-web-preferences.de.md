# Agent Note: Persist Web user preferences through Host settings

Status: implemented

[English](2026-08-06-host-backed-web-preferences.md) | [中文](2026-08-06-host-backed-web-preferences.zh.md) | Deutsch

## Problem

Die Web-Preferences Appearance, Language und Busy-Enter lagen im Browser-`localStorage`. Browser-Storage ist an einen Origin gebunden, sodass ein erneutes Öffnen von `dsh web` auf einem anderen Port eine andere Partition wählte und die Auswahl verlor, obwohl beide Prozesse dasselbe DSH-Home nutzten. Dies sind benutzereigene Produkt-Preferences; Session-Auswahl, Drafts, Disclosure-State und anderer transienter Browser-State bleiben seitenlokal.

Die erste Theme-Implementierung verschob nur Appearance in die Host-Settings, awaitete aber ihre initiale RPC, bevor sie `ThemeRuntime` bereitstellte. Ein langsamer oder nicht verfügbarer Settings-Request suspendierte daher die assemblierte Seite. Sie abonnierte außerdem erst nach dem Read, konnte eine Invalidation in diesem Fenster verpassen, trug bei Writes keine Namespace-Revisions und ließ gequeuete Writes eines disposten Plugins den Host erreichen.

## Decision

Die zuständigen Host-Hälften registrieren drei Schemas: optionales `locale.preference` (`zh` oder `en`; Abwesenheit delegiert an den Browser), `ui-theme.preference` (`light`, `dark` oder `system`, Default `system`) und `ui-conversation.busyEnter` (`queue` oder `steer`, Default `queue`). Der lokale Settings-Provider speichert explizite Wahlen in `$DSH_HOME/settings.yaml`, was unter dem Default-Home zu `~/.dsh/settings.yaml` auflöst. Der API-Proxy serviert jeden registrierten Namespace hinter der Browser-Authentifizierung von Connection; Feldrollen redacten weiterhin Secrets.

`dsh-client-ui-settings` besitzt einen browserweiten Settings-Describe-Mirror und stellt `ctx.settingsScope.bind(spec)` als per-Namespace-Selektor darüber bereit. Der Mirror installiert `settings/document-updated`- und `connection/reset`-Listener, bevor er seinen Background-Read startet, sodass kein Settings-Transport die Plugin-Aktivierung blockieren kann und keine Invalidation in eine Read-vor-Subscribe-Lücke fallen kann. Jeder gebundene Scope publiziert einen Snapshot-Store (Status, Sektionswert, Revision, Schreibbarkeit, Host-/Memory-Modus), den der Domain-Service abonniert, ohne einen eigenen Wire-Read oder Listener hinzuzufügen. Der Default-Decoder validiert jede eingehende Sektion gegen das eigene serialisierte Wire-Schema des Namespaces, rehydriert über den kolocalisierten `ctx.settingsSchema`-Service, sodass Domains keine handgeschriebenen Wire-Guards tragen. Domain-Services nehmen den Scope als gewöhnlichen Konstruktor-Kollaborateur entgegen, publizieren ihre provisorischen Defaults sofort — browserabgeleitete Locale, System-Theme und Queue — und übernehmen dann eine akzeptierte Host-Sektion, ohne sie zurückzuschreiben; ein ohne Scope konstruierter Service (Standalone-Dictionary oder Policy-Fixtures) bleibt schlicht prozesslokal. Der geteilte Read- und Invalidation-Lebenszyklus ist durch die spätere [Settings-Describe-Mirror-Entscheidung](../../archived/architecture/2026-08-17-settings-describe-mirror.md) spezifiziert.

Benutzeränderungen aktualisieren den Live-Service synchron und queuen eine `settings.mutate`-Pfadoperation über `scope.set`. Der Scope serialisiert Gesten, sendet die zuletzt bekannte Namespace-Revision als `expectedRevision`, zeichnet jede erfolgreiche Revision auf und lässt nur das Settlement des neuesten Writes den Live-State erneut publizieren. Ein abgelehnter oder fehlgeschlagener neuester Write lädt den Host-State neu. Disposal lehnt neue Arbeit ab, überspringt gequeuete Operationen, unterdrückt die Publikation durch die in-flight Operation und wartet auf deren Settlement, bevor das Plugin Quiescence erreicht.

Der Client hält Host-Persistenz auf Nicht-Loopback-Seiten deaktiviert, sodass deren Preferences prozesslokal bleiben, obwohl Connection die vollständige API authentifiziert. Dynamische Drittanbieter-Theme-Ids bleiben prozessinterne Erweiterungen außerhalb des eingebauten Host-Schemas; das Entfernen einer setzt die Live-Registry zurück, ohne die letzte durable eingebaute Preference zu ersetzen.

## Alternatives considered

**`localStorage` behalten und Werte zwischen Ports kopieren.** Ein Origin kann den Storage eines anderen Origins nicht enumerieren, und ein Host-Relay würde den Settings-Service um ein browserspezifisches Format herum neu bauen.

**Host-Settings nach `localStorage` spiegeln.** Eine zweite Autorität erfordert Boot- und Invalidation-Konfliktregeln bei Beibehaltung der Partition, die den Defekt verursachte. Das Host-Dokument ist die einzige durable Quelle.

**Den initialen Read awaiten, um ein provisorisches Render zu vermeiden.** Konfigurationsverfügbarkeit ist keine Voraussetzung zum Zeichnen der Seite. Ein Background-Read kann eine Live-Konvergenz verursachen, isoliert aber Fehler und bewahrt die bestehenden Browser-/System-/Default-Fallbacks.

**Jeder Domain einen eigenen Settings-Controller geben.** Die Concurrency-, Revision-, Failure-, Invalidation- und Disposal-Regeln sind identisch; sie zu kopieren erzeugte bereits Lifecycle-Drift in der Theme-Implementierung. Domain-eigene Schemas halten Produktpolitik aus der geteilten Runtime heraus.

**Ein per-Feld-Preference-Controller mit gepaarten Sync-/Persist-Callbacks.** Der erste geteilte Lebenszyklus synchronisierte ein skalares Feld über einen Domain-`sync`-Callback, während der Service über einen injizierten `persist`-Callback zurückschrieb. Die wechselseitigen Callbacks erzwangen zweiphasige Konstruktion — ein defaulted No-op-Writer, später per `bindPersistence` ersetzt —, jedes zusätzliche Feld eines Namespaces hätte einen eigenen Controller und einen Ganzdokument-Read getragen, und jede Domain deklarierte erneut einen handgeschriebenen Guard, den das registrierte Wire-Schema bereits ausdrückt. Der Namespace-Scope publiziert einen Snapshot, den der Service abonniert, und akzeptiert Writes direkt, sodass das Callback-Paar und die zweite Konstruktionsphase nicht existieren.

**Jeden `localStorage`-Eintrag in Settings verschieben.** Aktuelle Session, Drafts, Panel-Disclosure, Trajectory-Anzeigezustand und ähnliche Einträge sind Browser-Instanz-State statt Benutzerkonfiguration. Sie hochzustufen würde transienten Navigationszustand ohne Produktvertrag über Tabs und Ports synchronisieren.

## Consequences

Appearance-, Language- und Busy-Enter-Wahlen folgen dem DSH-Benutzer-Home über Reloads, Ports und Loopback-Origins. Direkte Edits an `settings.yaml` konvergieren über den bestehenden Invalidation-Stream, während die Legacy-Einträge `dsh.theme`, `dsh.locale` und `dsh.conversation.busyEnter` weder gelesen noch geschrieben werden.

Der Boot kann kurz den Domain-Default zeigen, bevor der Background-Read settlet. Ein transienter Read-Fehler behält diesen Default oder den letzten guten In-Process-Wert; Reconnect retried. Eine Write-Ablehnung kann nach der sofortigen lokalen Änderung sichtbar die durable Preference wiederherstellen.

Fokussierte Unit-Coverage pinnt Schema-Registrierung, Listener-vor-Read-Reihenfolge, nichtblockierende Aktivierung, schema-validierte Sektionsannahme, revisionierte geordnete Writes, Stale-Response-Containment, Failure-Recovery, Disposal-Quiescence und den Remote-Memory-Modus. Der namespace-granulare Scope trägt auch Mehrfeld-Sektionen, sodass spätere Konfigurationsoberflächen denselben Lebenszyklus mitnutzen können statt Describe-/Mutate-Synchronisation von Hand zu bauen. Das schlüssellose Web-Settings-Szenario schreibt alle drei Preferences über die UI, verifiziert das YAML-Dokument und den leeren Legacy-Storage, lädt neu und bootet einen weiteren Host auf einem anderen Port gegen dasselbe DSH-Home.
