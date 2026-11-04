# README screenshots

Both images under `docs/assets/` come from the built application — `out/main` +
`out/renderer`, the same build a release ships — driving real temporary directory
trees and a real file pair. No built-in sample, old image or composed artwork is
used.

## Captured commit

- commit: `eb33ad18c17fb0126dfb2cc76cc3958fdcc14bc4`
- both images were rebuilt on a clean working tree at exactly that commit
  (the tracked tree was clean — `git status --porcelain` showed only the
  untracked `.munk/changes/` change pack — and `HEAD` equalled this commit
  before the build), running `pnpm build` and then the capture script below in
  that order, so the recorded commit is the build the images actually came from.

## Images

| Image | Real session |
| --- | --- |
| `docs/assets/opencompare-workbench.png` | Two real neighbouring directory trees (`left` / `right`) opened through the launch intake: the four states, their counts and both panes. |
| `docs/assets/opencompare-file-diff.png` | A real `src/session.ts` pair opened as a file session: side-by-side character diff with the indicator bar (`data-diff-ruler`) on the right. |

## Rebuild evidence

The rebuild on the clean tree above printed
`wrote docs/assets/opencompare-workbench.png (240092 bytes)` and
`wrote docs/assets/opencompare-file-diff.png (296806 bytes)`. Both rebuilt files
differ from the previously committed images (`git diff` reports binary changes
for both), so the rebuilt PNGs replaced the old ones — the rebuild followed the
directory toolbar band pinned to 36px single-row / 72px wrapped-row and the
dropdown menu that flips above or clamps inside the viewport.

| Image | Previous sha256 | Rebuilt sha256 (committed) |
| --- | --- | --- |
| `docs/assets/opencompare-workbench.png` | `94fec62e80d6aa504a951f5fdb419ea9da63a7a17540139c378f4480c0f126d0` | `5e7607c19a77819f19229fc9864a3f2a1497c6476528482fdc63fac3bbdc6566` |
| `docs/assets/opencompare-file-diff.png` | `3b1151c83a3bfe3fdf09590d2598b0eec186e5ee91f86bd90b22f1817d067cc7` | `863a4df80d518515c22a8f96496fd1753bb10d94d3a5506369a948dccb14d195` |

`src/main/release-artifacts-and-brand.test.ts` guards this record: the captured
commit must resolve, be an ancestor of `HEAD`, and leave `src/renderer` with a
zero diff between the captured commit and `HEAD`, so a later renderer change
cannot silently outdate these images.

## Reproduce

```bash
pnpm build
node scripts/capture-readme-screenshots.mjs
```

`pnpm build && node scripts/capture-readme-screenshots.mjs` (or
`pnpm screenshots`) is the copyable one-liner; on Node below 22 the script
re-runs itself with Electron's bundled Node, which has the global `WebSocket`
the DevTools protocol needs. The script creates its own
temporary trees under `/tmp`, starts the built app once per shot with the
comparison as launch arguments, waits for the session to settle, captures the
window content through the DevTools protocol and writes both PNGs. It never
imports or reads `src/shared/fixtures/**`.
