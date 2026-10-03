# Agent Note: Scope kill racing the one-shot bootstrap
English | [中文](2026-09-28-scope-kill-before-bootstrap.zh.md) | [Deutsch](2026-09-28-scope-kill-before-bootstrap.de.md)

Status: implemented


## Problem

A termination racing the Linux scope's bootstrap window produced two failures in `dsh-subprocess-local`. First, a launcher exit with `launch-request.json` still staged always rejected the direct result with `subprocess scope exited before its bootstrap consumed the launch request` — even when the exit was the owner's own requested kill, so timeouts and aborts surfaced a phantom startup failure instead of `SIGTERM`. Second, the scope unit could register with the manager *after* the launcher died; `--collect` rides on `systemd-run`'s lifetime, so nothing deactivated it, range observation polled an empty `active` scope forever, and abandoned scopes accumulated on the host.

## Decision

`SystemdScopeOwner` records whether termination was requested through `signal()` or `terminateForHostExit()`. `directOutcome` and the terminal `resolveOutcome` keep rejecting an unconsumed-request exit as a startup failure only when no kill was requested; a requested kill reports the real outcome. The state query stops a unit that registers while establishment is still pending and the launcher is already dead, and `cleanup()` best-effort-stops a never-established unit once the launcher is gone, so a post-death registration cannot leak an empty `active` scope.

## Alternatives considered

**Report the kill unconditionally on signaled exit.** An external `SIGKILL` on the launcher would then look identical to a requested termination and silently retire the startup-failure diagnosis for exits nobody ordered; gating on the owner's own request keeps that conservative path.

**Let `--collect` reap late registrations.** `systemd-run` is the collector and it is already dead in this window — the mechanism cannot fire, which is exactly why the scopes leaked.

## Consequences

Timeout, abort, and background-kill paths settle with their true signal outcome; kills landing inside the bootstrap window (≈hundreds of ms for a source-mode runner) no longer leak empty scopes. Externally killed launchers with unconsumed requests still reject as before, preserving the launch-failure signal.
