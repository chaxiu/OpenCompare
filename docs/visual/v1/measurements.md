# Visual V1 measurements

Logical viewport for every visual baseline and after-shot: **1280 × 792** CSS pixels at
`deviceScaleFactor: 2`, so each PNG is **2560 × 1584** physical pixels. Values are
measured from the real built window through the DevTools protocol, never copied from a
design draft.

## `before/` — captured before the token change

| File | Logical viewport | Pixel size | Session |
| --- | --- | --- | --- |
| `docs/visual/v1/before/directory-dark.png` | 1280×792 | 2560×1584 | Real directory pair, dark theme |
| `docs/visual/v1/before/directory-light.png` | 1280×792 | 2560×1584 | Real directory pair, light theme |
| `docs/visual/v1/before/file-dark.png` | 1280×792 | 2560×1584 | Real file pair, dark theme |
| `docs/visual/v1/before/file-light.png` | 1280×792 | 2560×1584 | Real file pair, light theme |

Capture path: `pnpm build` then `node scripts/capture-visual-baseline.mjs`. The script
creates real temporary directory trees / a real `src/session.ts` pair under `/tmp`, opens
them through the app's launch intake, sets `document.documentElement.dataset.theme`, and
captures the window content through the DevTools protocol.

## `after/` — captured on commit `3b8cfe31af47208a048f3b7918d1b5df31ff5c54`

Capture path: `pnpm build` then `node scripts/capture-visual-baseline.mjs --out=after`.
`before/` is untouched.

| File | Logical viewport | Pixel size | Bytes | Session |
| --- | --- | --- | --- | --- |
| `docs/visual/v1/after/directory-dark.png` | 1280×792 | 2560×1584 | 236587 | Real directory pair, dark theme |
| `docs/visual/v1/after/directory-light.png` | 1280×792 | 2560×1584 | 239477 | Real directory pair, light theme |
| `docs/visual/v1/after/file-dark.png` | 1280×792 | 2560×1584 | 296666 | Real file pair, dark theme |
| `docs/visual/v1/after/file-light.png` | 1280×792 | 2560×1584 | 295538 | Real file pair, light theme |

## Top control band (measured in the built window)

Read from `getBoundingClientRect()` of the real `[data-shell-level]` elements at
1280×792, identical in the dark and light captures.

| Level | Measured height |
| --- | --- |
| `app` | 32px |
| `sessions` | 28px |
| `view-toolbar` | 36px |
| `panels` header (`[data-panel-header]`) | 24px |
| **Ready-state band total** | **120px** |
| `status` | 24px (single row) |

The `view-toolbar` band is `h-8` + `py-0.5`; the level band carries no extra border, so
the border-box measurement is exactly 36px. The `panels` level itself is the scrollable
work area; its header row is the 24px value in the table.

## View metrics (measured in the built window)

| Metric | Measured | Source |
| --- | --- | --- |
| Directory tree row | 28px | `DIRECTORY_ROW_HEIGHT` (`src/core/directory/rows.ts`) |
| Code diff row | 22px | `DIFF_ROW_HEIGHT` (`src/renderer/src/components/DiffPane.tsx`) |
| Diff body font | 12px | `text-xs` on the diff content |
| Line-number gutter font | 12px | same `text-xs` scale as the body |
| Ruler track width | 2px | `[data-ruler-track]` |
| Ruler ↔ scrollbar gap | 6px | `pr-1.5` on the ruler root |
| Control shapes | 3 (rect / round dot / thin bar) | three radius steps (4/6/8) in `main.css` |
| Interface hues | 4 (blue / green / red / amber; neutral grey excluded) | token contrast / hue test |

The ruler carries the current viewport rectangle, one marker per diff block and a hover
title with the block's line range. Word-level differences use a soft tint plus a 1px
underline in both themes.

## Automated checks

`pnpm test` re-reads these contracts from the same sources: `shellLayout.test.ts` /
`shellLayout.dom.test.tsx` (band and status bar), `TreeView.test.tsx` (28px rows),
`DiffPane.test.tsx` (22px rows, 12px gutter, soft inline diff), `CodeView.rulerTrack.test.tsx`
(2px track, viewport rectangle, 6px gap) and `src/core/theme/tokens.test.ts` (three radius
steps, four hues).
