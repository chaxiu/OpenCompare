# README screenshots

Both images under `docs/assets/` come from the built application — `out/main` +
`out/renderer`, the same build a release ships — driving real temporary directory
trees and a real file pair. No built-in sample, old image or composed artwork is
used.

## Captured commit

- commit: `e079a5ef7c29d79fd6113005278f5e7853a7ace7`
- both images were rebuilt on a clean working tree at exactly that commit
  (`git status --porcelain` was empty and `HEAD` equalled this commit before the
  build), running `pnpm build` and then the capture script below in that order,
  so the recorded commit is the build the images actually came from.

## Images

| Image | Real session |
| --- | --- |
| `docs/assets/opencompare-workbench.png` | Two real neighbouring directory trees (`left` / `right`) opened through the launch intake: the four states, their counts and both panes. |
| `docs/assets/opencompare-file-diff.png` | A real `src/session.ts` pair opened as a file session: side-by-side character diff with the indicator bar (`data-diff-ruler`) on the right. |

## Rebuild evidence

The rebuild on the clean tree above printed
`wrote docs/assets/opencompare-workbench.png (291046 bytes)` and
`wrote docs/assets/opencompare-file-diff.png (324539 bytes)`. Both rebuilt files
differ from the previously committed images (`git diff` reports binary changes
for both), so the rebuilt PNGs replaced the old ones.

| Image | Previous sha256 | Rebuilt sha256 (committed) |
| --- | --- | --- |
| `docs/assets/opencompare-workbench.png` | `1e972fbf354ac998e56f71500e206acd72f8724d9bb50dfac7441ed71e9dc596` | `d569a3b36549dee78be67ecd660886be92d309bd7b81ce8f996fe1b9d9613994` |
| `docs/assets/opencompare-file-diff.png` | `8d3d9993ddf78ec5dd1241cf32b0b95770fb5d2caf2c934a377f05a474c07bfe` | `e05d68886efe0a55255cc767a2f9b15eb28632c5261a5e189b3af938e3b3b072` |

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
