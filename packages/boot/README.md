---

English | [中文](README.zh.md) | [Deutsch](README.de.md)
description: "The boot package group: how dsh app bins start — environment loading, profile and patch layers, clear startup failures, and app-owned command lines."

English | [中文](README.zh.md) | [Deutsch](README.de.md)
kind: "package-group"

English | [中文](README.zh.md) | [Deutsch](README.de.md)
---

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
# boot/ — shared app-bin boot glue

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
English | [中文](README.zh.md)

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Summary

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
The boot group provides what every dsh app bin needs to start: `app-boot` turns a `cordis.yml` plus your environment and patch layers into a running app with clear failure messages, and `cmdline` lets the app own its command-line flags and `--help`. With these packages you can run `dsh` or write a new application or test fixture that boots the same way. Both are libraries imported by `apps/cli` and test-only Loader fixtures, never plugins a composition loads. This page maps the group; each package README owns its per-package contract.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Table of Contents

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Packages](#packages)

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Related documentation](#related-documentation)

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Dev Note](#dev-note)

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<a id="packages"></a>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Packages

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
| Package | Role | ctx key |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
|---|---|---|

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`app-boot`](app-boot/README.md) | Boots a dsh app from a `cordis.yml`: loads `.env`, applies profile and patch layers, and reports startup failures clearly | (library for the bins) |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`cmdline`](cmdline/README.md) | Lets the app own its flags, `--help`, and exit code; passes everything after the launcher's flags through verbatim | `cmdlineArgs`, `appExit` |

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<a id="related-documentation"></a>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Related documentation

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [dsh app](../../apps/cli/README.md) — the `dsh` bin that consumes these helpers for its boot sequence.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Profile bundles](../bundle/README.md) — installable patch layers that `dsh --profile` compositions mount.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [dsh-home-paths](../util/home-paths/README.md) — the harness-home resolver both packages build on.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [dsh-cmdline](cmdline/README.md) — how an app owns its flag family instead of the launcher.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<a id="dev-note"></a>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Dev Note

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
None.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
