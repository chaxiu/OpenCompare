# README screenshots

Both images under `docs/assets/` come from the built application — `out/main` +
`out/renderer`, the same build a release ships — driving real temporary directory
trees and a real file pair. No built-in sample, old image or composed artwork is
used.

## Captured commit

- commit: `e6977e268e4868027d83bcc9538ab364abc9a150`
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
`wrote docs/assets/opencompare-workbench.png (284137 bytes)` and
`wrote docs/assets/opencompare-file-diff.png (322235 bytes)`. Both rebuilt files
differ from the previously committed images (`git diff` reports binary changes
for both), so the rebuilt PNGs replaced the old ones.

| Image | Previous sha256 | Rebuilt sha256 (committed) |
| --- | --- | --- |
| `docs/assets/opencompare-workbench.png` | `8eaa4b8cec8e3762aed47f81d62991fe39630c1a8378a3eed46fae37a61a85a1` | `88849c0b2b93247d0af6b07834653def7f7e72f1fd64ae769a684ea989c104d5` |
| `docs/assets/opencompare-file-diff.png` | `c5f3c6af062bb1ea2b6f669d086cfc8e048a5d97f47c55ca17d049eda3768807` | `6ae7b6c47cb80cedd0eef03d1e5e6ced16d53dc9c7722c17c0a74179b5f0a84c` |

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
