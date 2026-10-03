# Agent Note: Client-Settings-, Locale- und Theme-Schichtung

Status: rejected — closed as a proposal: the shipped ui-settings, locale, and ui-theme packages and their READMEs own the design

[English](2026-07-25-client-settings-locale-theme.md) | [中文](2026-07-25-client-settings-locale-theme.zh.md) | Deutsch

## Problem

Das bestehende Settings des Browser-Clients ist direkt in der Sidebar geschrieben, und Sprache sowie Theme werden durch komponentenlokalen State angewendet, der das DOM unmittelbar mutiert. Dadurch kann Settings nicht von unabhängigen Plugins erweitert werden, Preference-State hat keinen stabilen plugin-übergreifenden Service-Vertrag, und die Theme-Registry trägt sowohl State- als auch Presentation-Verantwortung.

## Vorschlag

**Kollaborationsdoktrin (wie jedes spätere Modul Settings beitritt): Feature-Owner registrieren sich selbst.** Die Settings-Shell ist eine reine Kompositionsfläche: Sie deklariert nur Slots und rendert die Chrome-Struktur — null Copy, keine Locale-Abhängigkeit und weder Import noch Aufzählung irgendeines Features; damit ein Feature in Settings erscheint, registriert sich sein eigenes Plugin in den entsprechenden Slot — locale registriert die Language-Zeile, ui-theme registriert die Appearance-Zeile, ui-settings-models registriert das Models-Top-Level-Panel. Es wird kein separates `ui-settings-*`-Paket für „die Settings-Seite eines Features" erzeugt: Die Settings-Fläche gehört zum Feature-Paket selbst (wer das Theme-Feature liefert, liefert Themes Settings-Auswahl mit ui-theme mit). Inhalte, die zu keinem einzelnen Feature gehören (die Trigger-/Titel-/Close-Chrome-Copy, das General-Verzeichnis mit seinen Skeleton-Zeilen, das `settings`-Dictionary), besitzt `ui-settings-general` — der Owner der ownerlosen Copy, kein Feature-Satellitenpaket.

Die Sidebar deklariert den `sidebar.settings`-Single-Slot; `ui-settings` besetzt ihn und deklariert vier Slots: `settings.trigger` / `settings.header` / `settings.close` (Chrome-Inhaltsplätze, single) und `settings.section` (Top-Level-Seiten, list). Accessible Names resolve sich alle aus Slot-Inhalt: Der Accessible Name des Triggers ist sein Textinhalt, der Dialog verweist per aria-labelledby auf den Header-Content-Node, und Close ist ein visuell versteckter Textplatz. Jede Section wird von einem Feature-Plugin beigesteuert; die Shell liest nur Entry-Metadaten aus dem Slot-Ledger, um die Navigation zu bauen, und rendert die aktuelle Section via `only`. General wird von `ui-settings-general` registriert (order 0) und deklariert den `settings.general.item`-List-Slot, in den die Preference-Zeilen der Feature-Plugins nach order einrasten.

Der Settings-Einstieg ist die Settings-Zeile im Sidebar-Foot; ein Klick öffnet direkt ein zentriertes 1080×700-Overlay (schwarze 24%-Maske); der Close-Button, ein Klick auf die Maske und ESC schließen es. Es gibt keinerlei Zwischenmenüform.

`@deepseek-ai/dsh-client-locale` stellt `ctx.locale` bereit; `ui-theme` stellt `ctx.theme` bereit. Beide Services lesen über einen Getter, schreiben über einen Setter und publizieren immutable Snapshots über getypte Cordis-Change-Events; jeder Service persistiert seine eigene Preference (speichert nur die ID, fehlerhafte Werte fallen auf den Default zurück).

Die Apply-Schicht jeder Feature-Zeile abonniert ihr eigenes Change-Event (locale `locale/change`, ui-theme `theme/change`) und projiziert den Snapshot in den Slot-Store, der bei der Registrierung jener Zeile deklariert wurde. React-Komponenten lesen nur `useStore` und schreiben über die injizierten Setter-Callbacks, sie lesen nie ctx oder die Services.

Die Theme-Preference hat drei Zustände — `light`, `dark`, `system` — mit Default `system` (wenn keine persistierte Preference existiert oder der Wert fehlerhaft ist). Das Auflösen von system gehört zur Theme-Domäne: ThemeRuntime hält den `prefers-color-scheme`-matchMedia-Listener (Umgebungssensorik, keine DOM-Präsentation) und emittiert den Snapshot erneut, wenn die Preference system ist und sich das System-Farbschema ändert; der Snapshot trägt sowohl `preference` als auch die aufgelöste `active`-Definition.

Der Theme-Service berührt das DOM nie. `ui-layout` liest den Theme-Getter initial und abonniert dann `theme/change`; der von Layout besessene Presenter aktualisiert `body[data-ds-dark-theme]` und die Theme-Tokens gemäß `active`. Der Presenter kennt keinen system-Begriff — er konsumiert nur aufgelöste Ergebnisse.

### Erste-Phase-Registrierungsflächen

| Registrierungsfläche | Besitzendes Plugin | Erste-Phase-Inhalt |
|---|---|---|
| Chrome-Inhalt (trigger/header/close) | `ui-settings-general` | Settings-Einstiegszeilen-Icon und Copy, Panel-Titel, versteckter Close-Text |
| General-Section (order 0) | `ui-settings-general` | Permission- und Tool-Call-Skeletons (keine Schreiboperationen) plus die `settings.general.item`-Slot-Deklaration |
| Language-Zeile (item order 0) | `locale` | Selector-Dropdown; 中文/English schalten echt um |
| Appearance-Zeile (item order 10) | `ui-theme` | Light/Dark/System — drei Cubes schalten echt um (der selektierte Zustand spiegelt die Preference) |
| Models-Section (order 10) | `ui-settings-models` | Nur Navigationseintrag, mit leerem Inhaltsbereich; spätere Modellverwaltungs-Features landen in diesem Paket |
| Plugin | keines | In dieser Phase nicht gebaut, und die Navigation zeigt den Eintrag nicht (sobald ein späteres Plugin-Feature-Paket die Section registriert, erscheint sie automatisch) |

Die erste Phase lokalisiert nur die Copy innerhalb des Settings-Overlays; Dictionaries bleiben nahe bei ihren Ownern — das Chrome plus die General-Skeletons liegen im `settings`-Namespace von `ui-settings-general`, und Feature-Zeilen-Copy liegt in jedem Feature-Paket (`settings.locale`, `settings.theme`, `settings.models`).

### Slot-Topologie

```text
root
└─ sidebar
   └─ sidebar.settings                   single/root
      └─ ui-settings（壳，零文案）
         ├─ settings.trigger             single/root  ui-settings-general 注册
         ├─ settings.header              single/root  ui-settings-general 注册
         ├─ settings.close               single/root  ui-settings-general 注册
         └─ settings.section             list/root
            ├─ general (order 0)         ui-settings-general 注册
            │  └─ settings.general.item  list/root
            │     ├─ language (0)        locale 注册
            │     └─ appearance (10)     ui-theme 注册
            └─ models (order 10)         ui-settings-models 注册
```

Section- und Item-Contributions nutzen `ctx.slots.inject()` und hängen nicht von der Apply-Reihenfolge des Client-Manifests ab; lokalisierte Labels laufen über den Label-Thunk aus der [Full-Rollout-Note](../../archived/architecture/2026-07-30-client-locale-full-rollout.md). Die SlotMap-Typen verteilen die Homes: trigger/header/close/section haben ihr kanonisches Home im ui-settings-Vertrag (die Consumer, general und models, hängen beide von der Shell ab — kein Zyklus); das kanonische Home von `settings.general.item` ist das locale-Paket — es ist die niedrigste gemeinsame Dependency aller Item-Registranten (eine Settings-Zeile trägt immer Copy), während der Vertrag des Deklarierenden general von locale/ui-theme aus unerreichbar ist (er würde einen Zyklus bilden); ui-theme konsumiert ihn über einen Re-Export-Auslass.

### Slot-Deklarationen sind First-Class-injizierbare Warteobjekte

`SlotRegistry.inject()` wartet jetzt direkt auf den getypten Ledger-Key; es brückt Deklarationen nicht mehr in synthetische `slot:<name>`-Cordis-Services. Der Callback folgt Deklarationskollaps und Redeklaration, während sein Controller weiter dem beitragenden Plugin-Fiber gehört, und eine direkte Registrierung in einen undeklarierten Slot schlägt weiterhin laut fehl. Das entfernt die Stale-Disposer-Presence-Maschine und den tippfehleranfälligen parallelen Service-Namespace. Der vollständige Lebenszyklus- und Fehlervertrag liegt in der [Slot-Deklarations-Injections-Entscheidung](../../archived/architecture/2026-08-05-slot-declaration-injection.md).

### Service-Verträge

```ts
export type ThemePreference = 'light' | 'dark' | 'system'

export interface ThemeDefinition {
  id: string
  colorScheme: 'light' | 'dark'
  tokens: Record<string, string>
}

export interface ThemeSnapshot {
  preference: ThemePreference
  active: ThemeDefinition            // system 已解析为具体 light/dark 定义
  themes: readonly ThemeDefinition[]
  revision: number
}

export interface LocaleDefinition {
  id: 'zh' | 'en'
  label: string
}

export interface LocaleSnapshot {
  active: 'zh' | 'en'
  locales: readonly LocaleDefinition[]
  revision: number
}

export interface Events {
  /** @param snapshot - Current locale registry snapshot. @mode emit */
  'locale/change'(snapshot: LocaleSnapshot): void
  /** @param snapshot - Current theme registry snapshot. @mode emit */
  'theme/change'(snapshot: ThemeSnapshot): void
}
```

Locale liefert 中文 und English eingebaut mit; `setLocale`/`setTheme` sind die einzigen Schreibeinstiegspunkte, und eine unbekannte ID schlägt fehl.

## In Betracht gezogene Alternativen

**Die App-Shell Preferences zentral abonnieren und den Root-Slot-Tree neu rendern lassen.** Eine Sprach- oder Theme-Änderung muss nur die tatsächlichen Consumer aktualisieren; ein Ganzbaum-Refresh vergrößert den Wirkungsradius und verdrahtet Geschäfts-Preferences in die Shell.

**Der Theme-Service mutiert das DOM direkt.** Der Registry-Service hinge dann von der Präsentationsumgebung ab, mit unklarem Lebenszyklus und Global-Style-Eigentum; Layout besitzt bereits die Page-Root-Präsentationsgrenze.

**system im Layout-Presenter auflösen.** Der Presenter bräuchte ein eigenes matchMedia-Abonnement und würde die konkrete Definition aus der Themes-Liste pflücken, was die Präsentationsschicht zwingt, Preference-Semantik zu verstehen; das Auflösen auf Service-Seite gibt jedem Consumer denselben aufgelösten Snapshot.

**Settings importiert und enumeriert die Sections.** Eine Seite hinzuzufügen erforderte Änderungen am Shell-Plugin und bräche das Kompositionsmodell, bei dem jedes Feature einen Slot von seinem eigenen Plugin aus besetzt.

**Ein `ui-settings-*`-Satellitenpaket pro Feature für jede Section.** Es scheidet die Settings-Fläche vom Feature selbst: Theme-Verhalten zu ändern berührt zwei Pakete, die Paketzahl wächst linear mit den Settings-Einträgen, und die Satellitenpakete, die zurück auf die locale/theme-Services angewiesen sind, bilden eine Zwischenschicht, die nur der Paketspaltung wegen existiert. Unter Feature-Owner-Selbstregistrierung existiert diese Schicht nicht: Preference-Zeilen werden mit ihren Feature-Paketen ausgeliefert, und `ui-settings-general` nimmt nur die ownerlose Copy auf (das Chrome und die General-Skeletons), ohne die Settings-Fläche irgendeines Features zu tragen.

**Die Locale-/Theme-Snapshots direkt in React injizieren.** Inject-Ergebnisse werden nach Entry-Identität gecacht, sodass volatile Werte veralten; einen React-Hook pro Service von Hand zu bauen umginge zudem die einheitliche Bindung des Slot-Stores.

## Akzeptanzkriterien

- Die Settings-Shell hängt nur vom Slot-Ledger ab, nie von einer Feature-Implementierung; Generals Item-Liste hängt ebenfalls nur vom Ledger ab.
- Ein Settings-Eintrag hinzufügen = das Feature-Paket registriert ihn selbst (eine Section oder ein General-Item), bei null Shell-Änderungen.
- Locale- und Theme-Schreibzugriffe laufen nur über die Setter; laufende Synchronisation nur über die Change-Events.
- Der Store jeder Feature-Zeile initialisiert aus dem Getter und wird danach vom eigenen Change-Event mit lokalen Re-Renders aktualisiert.
- Layout wendet den Theme-Snapshot eigenständig an, und der Theme-Service greift nie auf das DOM zu; im Presenter erscheint kein system-Zweig.
- 中文/English und Light/Dark/System schalten um und werden nach einem Refresh wiederhergestellt; bei Preference auf system greift eine Änderung des System-Farbschemas sofort.
- Models hat nur einen Navigationseintrag und einen leeren Inhaltsbereich; die Permission- und Tool-Call-Skeletons führen keine Schreibvorgänge aus.
- Das Overlay schließt über den Close-Button, einen Mask-Klick und ESC.

## Risiken

Die Apply-Reihenfolge von Slot-Deklarationen und Contributions ist nicht festgelegt, daher muss jeder Section-/Item-Registrant `ctx.slots.inject()` verwenden statt eines Service- oder Local-Disposer-Presence-Signals. Service-Events können vor dem ersten Render einer Zeile feuern, daher müssen sowohl die Init eines Feature-Zeilen-Stores als auch der Inject-Attach auf den aktuellen Snapshot aus dem Getter ausgerichtet sein. Die duplizierten Merge-Kopien von `settings.general.item` (locale, ui-theme) müssen wortgleich zum ui-settings-kanonischen Home bleiben — jeder Drift heißt, alle drei gemeinsam zu ändern. Layout muss die globalen Attribute aufräumen, die es beim Unmount setzt, und ThemeRuntime muss seinen matchMedia-Listener beim Dispose entfernen, damit nach HMR nichts zurückbleibt.
