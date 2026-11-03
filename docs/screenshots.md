# README screenshots

Both images under `docs/assets/` come from the built application — `out/main` +
`out/renderer`, the same build a release ships — driving real temporary directory
trees and a real file pair. No built-in sample, old image or composed artwork is
used.

## Captured commit

- commit: `b9e3666cb95b23bc362f7ef41c6291bcf7d9fc29`
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
`wrote docs/assets/opencompare-workbench.png (287891 bytes)` and
`wrote docs/assets/opencompare-file-diff.png (324210 bytes)`. Both rebuilt files
differ from the previously committed images (`git diff` reports binary changes
for both), so the rebuilt PNGs replaced the old ones — the rebuild followed the
merge-history switch-fidelity change (reopened merge rows keep their switches
and restore them into the shell).

| Image | Previous sha256 | Rebuilt sha256 (committed) |
| --- | --- | --- |
| `docs/assets/opencompare-workbench.png` | `1ac905aefac3ade6c9e0ddeb154c3c60374ee24cf51aa5d4466d566183464326` | `379ae5af5ecac0d8cf5f47e5f77b0dd70984313dda91f72ff750fc73a6a57126` |
| `docs/assets/opencompare-file-diff.png` | `cc8506a15ac3cdff408968eacf0d882058cb4d70bbc7b0a1afc4ec5ecdc706f0` | `3b644340d00ab2ca86983937874e110c58c04eab08a360012ba6588977dbff03` |

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
