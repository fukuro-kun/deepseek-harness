# Agent Note: Shell tool workdir validation
English | [中文](2026-09-28-shell-tool-workdir-validation.zh.md) | [Deutsch](2026-09-28-shell-tool-workdir-validation.de.md)

Status: implemented


## Problem

`dsh-tool-bash` and `dsh-tool-pwsh` passed a model-supplied `workdir` to `spawn` unchecked. A leading `~` never expanded — no shell runs first — so `~/git/…` resolved to a nonexistent path under the session cwd. Node then reported the bad cwd as `spawn <argv0> ENOENT`, naming the executable — under confinement, `bwrap` — rather than the directory. Sessions burned turns retrying a diagnosis the error never supported.

## Decision

Both tools expand a leading `~` against the user's home directory, resolve a relative `workdir` against the session cwd as before, and reject an explicit workdir that is not an existing searchable directory with `invalid workdir: "<path>" is not an accessible directory` before anything spawns. The schema description states the `~` expansion so the model can rely on it.

## Alternatives considered

**Expand `~` only.** The remaining relative-path typo class still produced the misleading `ENOENT`, so expansion alone keeps the worse half of the failure.

**Leave validation to the executor.** `LocalBashExecutor` already probes the spawn cwd for its own failure classification, but that runs after policy resolution and confines argv; the error still blames the executable. Rejecting at resolution time names the directory directly.

## Consequences

Invalid directories fail fast with the path in the message; `~` and `~/…` work as the shell habit suggests. An unchanged case remains: with no explicit `workdir`, the session-derived cwd still bypasses this check because it originates from session state, not model input.
