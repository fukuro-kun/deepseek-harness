---
description: "Fertige dsh-Profile-Bundles für die geteilte Core-, Browser-GUI-, One-Shot-Task-, ACP- und SDK-Anwendungsoberflächen."
kind: "package-group"
---

# bundle/ — Profile-Plugin-Bundles
[English](README.md) | [中文](README.zh.md) | Deutsch


## Übersicht

Diese Gruppe bildet die installierbaren Patch-Schichten ab, die `dsh --profile` verwendet. Jedes Paket deklariert `dsh.bundle.patch`; der Launcher stapelt diese Patch-Dokumente, um ein benanntes Profile zu assemblieren. Die Profiles `web`, `headless`, `acp` und `sdk` bauen auf `dsh-base`, während `sdk-minimal` seinen vollständigen Baum in einem Bundle liefert. Domänenpakete können zusätzliche Schichten außerhalb dieses Verzeichnisses deklarieren.

## Inhalt

- [Pakete](#packages)
- [Verwandte Dokumentation](#related-documentation)
- [Dev-Notiz](#dev-note)

<a id="packages"></a>
## Pakete

| Paket | Rolle | ctx-Key |
|---|---|---|
| [`base`](base/README.de.md) | Geteilter Kern für base-gestützte Profiles | — (nur Patch) |
| [`acp-app`](acp-app/README.de.md) | Reine Automatisierungs-ACP-Stdio-Anwendung über base | mountet die ACP-Bridge |
| [`web-app`](web-app/README.de.md) | Browser-Anwendungsschicht über base | mountet Web-Zeilen |
| [`headless`](headless/README.de.md) | One-Shot-Kommandozeilen-Task-Anwendung über base | `headless-runner` |
| [`sdk-app`](sdk-app/README.de.md) | SDK-JSON-RPC-Stdio-Anwendung über base | mountet den SDK-Server |
| [`sdk-minimal`](sdk-minimal/README.de.md) | Eigenständige minimale SDK-Anwendung ohne base oder Web | — (vollständiger Patch-Baum) |

In-Box-Bundles werden aus der dsh-Installation aufgelöst; Out-of-Tree-Bundles installieren sich über `dsh plugin --profile <name> add <package>` in ein Profile.

<a id="related-documentation"></a>
## Verwandte Dokumentation

- [dsh-App](../../apps/cli/README.de.md) — der `dsh`-Befehl, der ein Profile startet.
- [app-boot](../boot/app-boot/README.de.md) — wie Profiles aufgelöst, geschichtet und angepasst werden.
- [Profile-Plugin-Bundles-Note](../../.agents/notes/implemented/architecture/2026-08-05-profile-plugin-bundles.de.md) — das Profile- und Bundle-Kompositionsdesign.
- [Generierter Kompositionsgraph](../../apps/cli/composition.md) — die exakte Komposition, die jedes ausgelieferte Profile verwendet.

<a id="dev-note"></a>
## Dev-Notiz

Keine.
