---

English | [中文](README.zh.md) | [Deutsch](README.de.md)
description: "Shared React UI atoms for the dsh web client: controls, icons, markdown and math rendering, and the terminal/read/diff/search/web output cards (zero cordis)."

English | [中文](README.zh.md) | [Deutsch](README.de.md)
kind: "package-library"

English | [中文](README.zh.md) | [Deutsch](README.de.md)
---

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
# @deepseek-ai/dsh-client-ui-primitives

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
English | [中文](README.zh.md)

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Summary

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
Use `dsh-client-ui-primitives` to build web-client controls and render agent output with shared React UI. It includes standard controls, icons, anchored overlays, and renderers for Markdown with TeX, terminal output, file reads, diffs, search, web retrieval, and JSON. The renderers handle untrusted model output by dropping raw HTML, restricting links, and parsing ANSI escape sequences. The components import no Cordis runtime; callers supply localized labels, and theme-facing colors use `--dsw-*` design tokens.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Table of Contents

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Use this package](#use-this-package)

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Understand the implementation](#understand-the-implementation)

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Further Exploration](#further-exploration)

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Model Experience](#model-experience)

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Dev Note](#dev-note)

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
-----

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<a id="use-this-package"></a>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Use this package

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
This package is a Web-shell build input. Its static ESM retains third-party imports and styles for Vite; independent consumers supply its development dependencies ([dependency rules](../AGENTS.md#dependency-declaration)).

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
Compose feature UI from these atoms whenever the web client needs a standard control or an agent-output renderer. They render through React only and take `--dsw-*` design tokens from the theme, so they fit any plugin without importing the theme or the slot system.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<a id="component-catalog"></a>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Component catalog

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
Check this table before writing a control in a feature package. A plugin cannot import another plugin's component, so this package is the only place a control can be shared: reuse what fits, and lift a deliberate visual difference into a prop rather than starting a second copy.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
| Export | What it is |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
|---|---|

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `Button` | Clickable action; `variant` selects `primary`, `ghost`, `outline`, or `toolbar`. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `Switch` | Two-state toggle, 36×20. `label` is required, so the control cannot ship unnamed. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `Input` | Single-line text entry for search boxes and inline forms. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `Menu` | Dropdown of items, separators, and group labels, with nested submenus. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `Pill` | Selectable capsule button for view switchers and filters; takes `active` and `onClick`. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `Tag` | Read-only capsule badge; `tone` selects one of eight palettes. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `StateDot` | Status mark: `done`, `warning`, `ongoing`, `error`, or `idle`. `aria-hidden`, so the render site owns the name. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `ConnectionIndicator` | Inline connection-recovery control across outage, retry, and recovered states. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `DisclosureRow` | 24px compact disclosure that lays title and content side by side. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `Modal` | Centered dialog over a page mask. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `RiskConfirmation` | Sensitive action gated behind an explicit checkbox. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `OnboardingSurface` | First-run stage that holds the application root inert. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `Tooltip` | Hover text on a cloned anchor, placed right, bottom, or top. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `HoverCard` | Hover preview the pointer can rest on and select from; optional copy button. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `Toast` | Transient top-center banner held for the owner's `holdMs`. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `JsonTree`, `JsonBlock` | Read-only JSON inspection. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `MarkdownText`, `CodeBlock` | Untrusted GFM with TeX math, and highlighted code. `CodeBlock` accepts opt-in `lineNumbers`; copied source excludes the gutter, and `contentRef` exposes its stable source wrapper to an owner that uses it as a scrollport. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `TerminalBlock`, `ReadBlock`, `DiffBlock`, `SearchBlock`, `WebBlock` | The agent-output card matching each tool-result intent. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `icons/*`, `FishLogo`, `BrandWordmark`, `ReferenceIcon`, `LinkIcon` | Glyphs and brand marks. Use `LinkIcon` for 14px clickable-link categories. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| `FileTypeIcon`, `classifyFileType`, `fileExtension` | A category-colored 28px file or folder glyph and the shared case-insensitive filename mapping behind it. Code and configuration files use detailed full-color technology glyphs; use `LinkIcon` for link-leading glyphs and image previews for image content. |

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
Three pairs are easy to confuse:

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **`Tag` against `Pill`.** Reach for `Tag` for a read-only badge at the 11px capsule size, and for `Pill` when the capsule is selectable (`active` and `onClick`, as view switchers and filters use) or when it must sit on a 24px text line — `TerminalBlock` renders its exit status as a static `Pill` for exactly that reason. Size decides as much as interactivity here; the two are not interchangeable.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **`DisclosureRow` against a card.** The row lays its title and content side by side at a fixed 24px. A card that stacks a name over a description is a different layout, and belongs in the feature package — `ui-settings-plugins`' `PluginCard` is the precedent and records why.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **`FoldToggle` against the exported surface.** It is package-internal and not exported; the output cards use it for their head-tail fold.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
Writing your own component in your own package is fine when the need is genuinely specific. What is not fine is copying a control that already exists here — and once a second package needs the same control, it belongs in this package ([decision](../../../.agents/notes/implemented/architecture/2026-09-05-shared-client-control-primitives.md)).

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Controls and icons

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
The catalog above lists what each export is for; this section covers the behavior that props alone do not show. The `ic_ds_*` icon set and `FishLogo`/`BrandWordmark` marks fill brand and inline-icon slots. `FileTypeIcon` renders the traditional 28px Excel, folder, HTML, image, Markdown, generic, PDF, PPT, video, and Word glyphs, and uses the full-color square technology artwork for recognized code and configuration files. `classifyFileType` applies exact filename, prefix, suffix, optional project-context, and extension rules in that order; React names win over TypeScript/JavaScript, Angular suffixes win over their base extension, and a Dart file becomes Flutter only when the supplied project files contain a `pubspec.yaml` with `flutter:`. Markdown and SVG remain traditional Markdown and image files. Office mappings include XLSM/Numbers as Excel, KEY as slides, and RTF/ODT/Pages as documents. `fileExtension` exposes the same basename and final-dot parsing for adjacent metadata labels. Traditional glyphs use a solid category-colored sheet with a white mark and translucent white corner; the generic file uses a grey sheet and darker grey corner. Callers may override the sheet color through `--dsh-file-type-icon-color`. The full-color technology artwork is the deliberate exception and retains its embedded palette. All glyphs are decorative and carry no label. `LinkIcon` remains the smaller leading glyph for clickable artifact links — globe, folder, code, image, document, or plain paper — while `classifyLinkPath` folds the shared file types into that existing six-category vocabulary. `ConnectionIndicator` renders a warning-colored disconnected action, a connecting label whose one-to-three dots advance every 500ms independently of retry timing, or a success-colored recovered status. Hover or keyboard focus shows only the reconnect action label, including while the connecting dots animate. Every state reserves the widest supplied label and uses fixed icon and text columns, so copy changes do not move or resize the control. Its owner supplies visibility, the recovery hold, localized labels, and the immediate-reconnect callback; the primitive uses no native title tooltip. `useAnchoredPosition` and `useAnchoredMaxHeight` keep floating panels and bottom-anchored overlays clamped to the viewport and following their anchor. `HoverCard` keeps its portaled preview reachable across the anchor gap and can expose a copy button through the `copyText` prop. `Toast` holds for the window its owner names through `holdMs`, because how long a banner has to stay depends on how much there is to read; the same value drives its unmount timer and the stylesheet's fade delay, so the two cannot disagree. `rankByName` is the `/` menu's shared candidate ranker for the command and skill sources: the query must be a case-insensitive ordered subsequence of the name; prefix hits rank first, then alignment score, then source order. `Menu.autoFocus` focuses its first enabled item, supports Arrow Up/Down and Home/End navigation, and focuses the first button in the anchor on Escape; it is opt-in for action menus.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Rendering agent output

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
`MarkdownText` renders untrusted GFM and TeX math, blocks unsafe links and images, and can turn resolved file mentions into explicit controls. When the owner passes a `pathImages` vocabulary, image destinations that are local media paths rewrite to displayable URLs on settled renders only (the same streaming gate as file mentions); without a vocabulary, local destinations remain inert alt text. A load or decode failure replaces the image with its authored alt text, or the original destination when alt is empty. Changing the image source permits a fresh load. While a reply streams, it freezes completed blocks, advances a top-level open fence by completed lines, and highlights that fence from saved Shiki grammar state. Completed token lines enter fixed-size React groups, so later chunks reconcile only the growing group; an unchanged fence retains that DOM when the final full parse resolves cross-document syntax. `TerminalBlock`, `ReadBlock`, `DiffBlock`, `SearchBlock`, and `WebBlock` render the matching tool-result intent with copy controls, overflow handling, and ANSI processing where applicable. `JsonTree` and `JsonBlock` inspect JSON values read-only, while `projectUserText` projects sent user text into inline plain runs and reference chips for the message bubble and queue rows.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Localizing copy

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
The atoms cannot read the application locale, so every piece of user-facing copy arrives through required label props. `HoverCard`, `TerminalBlock`, `JsonTree`, `CodeBlock`, `MarkdownText`, `JsonBlock`, `ConnectionIndicator`, `Modal`, `DiffBlock`, `ReadBlock`, `SearchBlock`, and `WebBlock` accept complete localized labels. The package owns no language fallback; omission fails typechecking, and each feature maps its typed `t` seat into the primitive's label interface.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
-----

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<a id="understand-the-implementation"></a>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Understand the implementation

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<details>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
<summary>Implementation internals — click to expand</summary>

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
The package is one separation: presentational React atoms with zero Cordis and zero slot knowledge, styled only through `--dsw-*` tokens, while every feature-specific concern (locale, session data, composition) stays in the composing plugin.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Source map

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
| File | Role |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
|---|---|

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/index.ts`](src/index.ts) | Public atom exports |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/markdown/`](src/markdown/) | Markdown and math pipeline: micromark parsing, KaTeX typesetting, incremental streaming renderer, `CodeBlock`/`JsonBlock` |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/TerminalBlock.tsx`](src/TerminalBlock.tsx) | ANSI escape parsing (`anser`) and terminal card rendering |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/ReadBlock.tsx`](src/ReadBlock.tsx) / [`src/DiffBlock.tsx`](src/DiffBlock.tsx) | Read and diff cards |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/SearchBlock.tsx`](src/SearchBlock.tsx) / [`src/WebBlock.tsx`](src/WebBlock.tsx) | Search and web-retrieval cards |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/icons/`](src/icons/) | `ic_ds_*` glyph components and brand marks |

English | [中文](README.zh.md) | [Deutsch](README.de.md)
| [`src/useAnchoredPosition.ts`](src/useAnchoredPosition.ts) / [`src/useAnchoredMaxHeight.ts`](src/useAnchoredMaxHeight.ts) | Floating-panel and overlay geometry hooks |

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Streaming markdown

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
While a reply streams, `MarkdownText` parses incrementally: all but the trailing two blocks freeze as cached React elements and only the source tail re-parses per chunk, so per-chunk work tracks the tail instead of the whole reply. A final unclosed top-level fence keeps its parsed code node and sends only the last completed line plus the current partial line through the same GFM grammar; a closing fence or ambiguous parse returns to the ordinary tail path. Highlighting likewise resumes from saved Shiki grammar state and publishes only newly completed lines plus the mutable tail. `CodeBlock` seals completed lines into fixed-size React groups, reuses earlier groups, and retains the whole highlighted tree across settlement when code and language are unchanged. The settled full parse still resolves references that crossed the freeze boundary.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Geometry and overflow

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
The output cards share one geometry model: `white-space: pre` with horizontal scrolling so column-aligned content keeps its alignment, and a head-plus-tail slice behind an expand button past `maxLines` (default 16) so a long body never stretches the card. `TerminalBlock` parses ANSI into React spans with a per-line column buffer for cursor movement, honoring erase-in-line, tab stops, and character width.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
</details>

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
-----

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<a id="further-exploration"></a>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Further Exploration

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
These pages place the atoms in the client stack and the design system.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [ui-renderer](../ui-renderer/README.md) — the React renderer that mounts the assembled application and binds slot data.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [ui-tool](../ui-tool/README.md) — the tool-call presentation layer that composes these output cards.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [ui-conversation](../ui-conversation/README.md) — the chat surface that renders markdown replies and tool cards.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [ui-theme](../ui-theme/README.md) — the `--dsw-*` token system these atoms style through.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- [Web styling](../../../docs/web-styling.md) — the authoritative styling rules for web client components.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
-----

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<a id="model-experience"></a>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Model Experience

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
None, as the package is a browser-side UI plugin layer that registers nothing model-facing.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
#### KV Cache effect

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
None; this package neither assembles nor sends a provider request.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
## Known Limitations and Deferred Work

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<a id="known-limitations-and-deferred-work"></a>

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
These limits define how the atoms behave at the edges; they are current package constraints, not a component roadmap.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **Streaming defers cross-boundary reference resolution** — a reference-style link or footnote whose definition sits on the other side of the incremental freeze boundary renders as literal text while the reply streams; the settled full parse at finalize resolves it.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **A long highlighted fence retains its complete token DOM** — streaming avoids re-parsing, re-tokenizing, and reconciling the completed prefix, but it does not discard old colors or virtualize token spans. Final DOM cardinality therefore still follows the fence's token count; nested/container fences and a pathological single long line remain on the general tail path.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **Glyph-level icons are redrawn approximations** — the fish logo and the sparkle mark come from font glyphs whose vector geometry is not exportable from the local design data; hand-authored recreations stand in until an exact export path exists.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **`Pill` and `Input` have no design source** — both atoms are self-defined; the sidebar search field and view-tab strip that resemble them are consumer-owned compositions, not these atoms.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **No `Active` `StateDot` variant** — the supported states are done, warning, ongoing, error, and idle.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **User-facing copy is required at the render site** — the atoms are zero-Cordis and cannot reach `ctx.locale`; each feature must supply complete localized labels through the primitive's typed props ([decision](../../../.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.md)).

English | [中文](README.zh.md) | [Deutsch](README.de.md)
- **`TerminalBlock` is not a terminal emulator** — it renders settled or still-running command output, not an interactive session: SGR colors, carriage return, backspace, erase-in-line, tab stops, and character width are honored; absolute cursor positioning, screen clearing, and alternate-screen sequences are stripped.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<a id="dev-note"></a>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
### Dev Note

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
<details>

English | [中文](README.zh.md) | [Deutsch](README.de.md)
<summary>Working context for maintainers — click to expand</summary>

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
None.

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
</details>

English | [中文](README.zh.md) | [Deutsch](README.de.md)


English | [中文](README.zh.md) | [Deutsch](README.de.md)
**Runtime invariant:** No companion is published. Pure props-in React atoms with no Cordis API — no events, no services, no mutable cross-plugin state; rendering contracts are asserted directly by this package's component specs.

English | [中文](README.zh.md) | [Deutsch](README.de.md)
