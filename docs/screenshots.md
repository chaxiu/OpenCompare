# README screenshots

Both images under `docs/assets/` come from the built application — `out/main` +
`out/renderer`, the same build a release ships — driving real temporary directory
trees and a real file pair. No built-in sample, old image or composed artwork is
used.

## Captured commit

- commit: `451bf573c6236461d092f5e27a526d1163a1f319`
- both images were rebuilt on a clean working tree at exactly that commit
  (the tracked tree was clean — `git status --porcelain` showed only untracked
  `.munk/` workspace metadata — and `HEAD` equalled this commit before the
  build), running `pnpm build` and then the capture script below in that order,
  so the recorded commit is the build the images actually came from.

## Images

| Image | Real session |
| --- | --- |
| `docs/assets/opencompare-workbench.png` | Two real neighbouring directory trees (`left` / `right`) opened through the launch intake: the four states, their counts and both panes. |
| `docs/assets/opencompare-file-diff.png` | A real `src/session.ts` pair opened as a file session: side-by-side character diff with the indicator bar (`data-diff-ruler`) on the right. |

## Rebuild evidence

The rebuild on the clean tree above printed
`wrote docs/assets/opencompare-workbench.png (271534 bytes)` and
`wrote docs/assets/opencompare-file-diff.png (316500 bytes)`. Both rebuilt files
differ from the previously committed images (`git diff` reports binary changes
for both), so the rebuilt PNGs replaced the old ones — the rebuild followed the
visual foundation change (single token source, 32px buttons, square toggles,
20px chips and 30px tabs).

| Image | Previous sha256 | Rebuilt sha256 (committed) |
| --- | --- | --- |
| `docs/assets/opencompare-workbench.png` | `222ad507711567da3180cc86adc4fcb202dc9cc127a304da89e347cee69d9a8b` | `3965477a752c47076e44c722762505b6c5f841d97b3b80ef3edd9914386dfd22` |
| `docs/assets/opencompare-file-diff.png` | `95433431a826d80c43ded362c4d2edb0e704e38affce6655249479567b138dfb` | `a99c6082cc19dc2c0140d97d6ac32e7e78d34a646bb4f230ed87ffb3ed7bef84` |

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
