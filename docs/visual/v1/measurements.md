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

## Later tables

Top control band, control-shape count, hue count, tree row 28, code row 22, code font 12
and the 2px ruler track / viewport rectangle are registered by the next sub-item
(`wi_ws_5315d151d872f78c`) in the `after/` section; this file only fixes the four
before-shots and their logical size.
