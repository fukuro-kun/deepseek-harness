# Agent Note: Agent Teams unter experimentellen Paketnamen veröffentlichen
[English](2026-08-18-experimental-agent-teams-packages.md) | [中文](2026-08-18-experimental-agent-teams-packages.zh.md) | Deutsch

Status: implemented


## Problem

Agent Teams braucht das echte Session-Log, den Subagent-Lebenszyklus, Tools, Beispiele, Snapshots und Repository-Checks, während sich seine Service- und Tool-Verträge weiter ändern. Benutzer müssen außerdem die vollständige Team-Komposition von npm installieren können, ohne einen Source-Checkout zu bauen.

Die Pakete in Produktrollen-Gruppen zu verschieben würde ihre experimentellen Namen entfernen und Stable-Package-Ownership implizieren. Jedes Paket unter `packages/experimental/` zu veröffentlichen würde dagegen unbeteiligte interne Prototypen exponieren. Die Release-Policy braucht eine explizite Agent-Teams-Ausnahme bei Beibehaltung des Private-Defaults.

## Entscheidung

`packages/experimental/agent-team`, `packages/experimental/tool-agent-team`, `packages/experimental/agent-team-profile`, `packages/experimental/client-ui-agent-team` und `packages/experimental/agent-team-web-profile` sind öffentliche Workspace-Pakete. Sie behalten ihre bestehenden `@deepseek-ai/dsh-experimental-*`-Namen und treten der dsh-Release-Familie bei. Die [experimental package rules](../../../../packages/experimental/AGENTS.md) besitzen den Private-Default, diese Ausnahme und spätere Beförderung.

Das dsh-Pack- und Publish-Set und der lokale Baseline-Publisher enthalten genau diese fünf experimental-Paketverzeichnisse. Workspace-Constraints verlangen, dass sie `private` weglassen, `publishConfig.access` auf `public` setzen und das experimentelle npm-Präfix behalten. Jedes andere experimental-Paket bleibt privat und standardmäßig von der Veröffentlichung ausgeschlossen. Release-Pakete und Apps außerhalb der experimental-Gruppe sowie die Python-Runtime können experimental-Pakete nicht in `dependencies`, `optionalDependencies` oder `peerDependencies` benennen; experimental-Pakete dürfen von Release-Paketen und voneinander abhängen.

Die generische caller-reserved continuable child identity und der selektive Direct-Child-Drain bleiben im stabilen Subagent-Service. Sie besitzen Subagent-Identität und Activation-Lebenszyklus, ohne Agent Teams zu importieren oder zu benennen; der experimentelle Team-Service konsumiert sie in der erlaubten Richtung.

Das veröffentlichte Host-seitige Agent-Teams-Profil-Bundle hängt von den Team-Paketen ab und wird nach `dsh-base` angewendet. Es fügt die Team-Zeilen ein und deaktiviert die globalen Continuable-Child-Controls, deren modellsichtbare Namen sich mit den Team-Tools überschneiden. Das separate veröffentlichte Web-Profil wird nach `dsh-web-app` und dem Host-Profil angewendet; es fügt die Team-UI ein, die den vom Team-Paket generierten Remote-Beitrag mountet. Beide Ebenen bleiben opt-in und lassen die ausgelieferten Dependency-Graphen von Base, CLI, Web und Python-Runtime unverändert.

Die Profil-Installation löst jedes veröffentlichte Bundle und seine Dependencies über den Paketmanager des Profils auf. Der generische Profil-Launcher wendet dann die ausgewählten Ebenen an, ohne sie einem ausgelieferten Profil hinzuzufügen oder die Auflösung eines anderen Profils zu ändern.

Der experimentelle Status ändert Kompatibilitäts- und Support-Erwartungen, nicht die Veröffentlichung dieser fünf Pakete. Sie behalten die gewöhnlichen Dokumentations-, Invariant-, Lifecycle-, Sicherheits-, Unit-, Real-Composition- und Snapshot-Anforderungen des Repositories. Beförderung erfordert weiterhin Review der öffentlichen Verträge, Einschränkungen, Test-Evidenz, Runtime-Dependents und einen benannten Eigentümer, der Stable-Package-Verpflichtungen annimmt.

## Alternatives considered

**Agent Teams in Produktrollen-Gruppen verschieben.** Dies würde die gewünschten experimentellen npm-Namen entfernen und Stable-Package-Ownership implizieren, bevor die Verträge stabilisiert sind.

**Agent Teams privat und nur per Source-Checkout halten.** Dies erhält die einfachste experimentelle Policy, verhindert aber, dass Benutzer die vollständige opt-in-Komposition von npm installieren.

**Jedes experimental-Paket veröffentlichen.** Unbeteiligte Prototypen bleiben nur intern und haben keinen öffentlichen Paketvertrag akzeptiert.

**Die Subagent-Voraussetzungen in das experimental-Verzeichnis verschieben.** Child-Identity-Zuteilung und Activation-Teardown gehören dem Subagent-Eigentümer und enthalten keinen Team-spezifischen Vertrag. Sie zu verschieben oder zu duplizieren würde die Dependency invertieren oder einen Lebenszyklus über Pakete spalten.

## Konsequenzen

Agent Teams erscheint als fünf installierbare Tarballs in der dsh-Release-Familie, ohne Paketnamen zu ändern oder Team in einem ausgelieferten Profil zu aktivieren. Öffentliche Verfügbarkeit macht die Pakete nicht standardmäßig stabil oder unterstützt, und stabile Release-Pakete können keine Runtime-Dependencies auf sie nehmen.

Die Release-Familie trägt explizit benannte experimentelle Ausnahmen. Beförderung erzeugt weiterhin Pfad- und npm-Namens-Änderungen, wie die experimental-Paketregeln festlegen.
