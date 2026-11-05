# README screenshots

Two scenarios, one shot per scenario per language. All four images come from the
built application — `out/main` + `out/renderer`, the same build a release ships —
driving real temporary directory trees and a real file pair. No built-in sample,
old image or composed artwork is used.

## Captured commit

- commit: `dd3296a682ed80c064369586707f05c5936af1f0`
- all four images were captured from a `pnpm build` made on a clean working tree
  at exactly that commit (`HEAD` equalled this commit and `git status
  --porcelain` reported nothing under `src/**` before the build), then
  `node scripts/capture-readme-screenshots.mjs` ran once and wrote all four PNGs.
  This recorded commit is the build the images came from; `src/renderer` has a
  zero diff from it to `HEAD`. The `src/core` large-file threshold follow-up is
  allowed to differ — only the renderer (the part that decides pixels) is pinned.

## Language pinning

The language is pinned by the persisted settings file, never by the host locale.
Electron's `userData` does not follow `HOME` on macOS, so every launch gets a
temporary profile through Chromium's `--user-data-dir` switch
(`/tmp/opencompare-readme-capture/userdata/<language>/`); before each launch the
script writes:

| Language | Settings file | Key | Value | Expected `<html lang>` |
| --- | --- | --- | --- | --- |
| `en` | `/tmp/opencompare-readme-capture/userdata/en/settings.json` | `language` | `"en"` | `en` |
| `zh` | `/tmp/opencompare-readme-capture/userdata/zh/settings.json` | `language` | `"zh"` | `zh-CN` |

The record carries only `language`, so the theme stays the default `dark`. A
launch is not ready until `document.documentElement.lang` equals the expected
tag, and the script re-checks it right before each screenshot. `LANG` / `LC_ALL`
/ the system locale never participate: runs under `LANG=zh_CN.UTF-8` and
`LANG=en_US.UTF-8` produced the same four sha256 values.

## English (`en`)

Used only by `README.md`.

| Image | Session | Bytes | sha256 |
| --- | --- | --- | --- |
| `docs/assets/opencompare-workbench.en.png` | Two real neighbouring directory trees (`left` / `right`) opened through the launch intake: the four states, their counts and both panes. | 251392 bytes | `dc9dc1ac704dbda7bfc6b4fd295342673befd69aecae19f55d7cf92fbf229fc8` |
| `docs/assets/opencompare-file-diff.en.png` | A real `src/session.ts` pair opened as a file session: side-by-side character diff with syntax-coloured foreground, the visible swap entry in the code toolbar and the indicator bar (`data-diff-ruler`) on the right. | 318864 bytes | `a1c260c557a65d68d1f3e343094f61ef3258710b0d3935061b4f919bfe49bb6a` |

Visual review of both PNGs: the workbench chrome, tabs, filter segments, tree
status labels, tooltips and the status bar are entirely English; the type scale
matches the shipped baseline; the right-hand `data-diff-ruler` ticks and the
bottom status bar are fully inside the 2560×1584 frame; the same / added /
removed / modified badges and inline diff highlights are distinguishable.

## 中文（`zh`）

只被 `README.zh-CN.md` 引用。

| Image | Session | Bytes | sha256 |
| --- | --- | --- | --- |
| `docs/assets/opencompare-workbench.zh.png` | 两棵真实相邻目录树（`left` / `right`）经启动接入打开：四态、计数与左右双栏。 | 240835 bytes | `dca3344139d5d4edcf4f1d4bb1b1aad8cc889cfedd6201ee1dc24f115479b8c8` |
| `docs/assets/opencompare-file-diff.zh.png` | 真实 `src/session.ts` 文件对打开为文件会话：并排字符级 diff，前景带语法着色，代码工具栏内可见交换入口，右侧为指示条（`data-diff-ruler`）。 | 319308 bytes | `394d282ae986befede8f60dea8b85622c3a1eb4e64081b4ee266eaa18112e3d1` |

逐张视觉复核：工作台外壳、标签页、筛选段、目录行状态文案、提示与底部状态栏
全为中文；字号与既有基线一致；右侧 `data-diff-ruler` 指示条与底部状态栏完整
未被裁切；same / added / removed / modified 四态徽标与行内高亮清晰可辨。

The guard in `src/main/release-artifacts-and-brand.test.ts` checks each README
against exactly its own two assets, the four PNGs' recorded sha256 / byte counts,
and one shared captured commit that resolves, is an ancestor of `HEAD`, leaves
`src/renderer` with a zero diff, and produces different bytes for the two
languages of the same scene.

## Reproduce

```bash
pnpm build
node scripts/capture-readme-screenshots.mjs
```

`pnpm screenshots` is the copyable one-liner (it runs the build first). On Node
below 22 the script re-runs itself with Electron's bundled Node, which has the
global `WebSocket` the DevTools protocol needs. The script creates its own
temporary trees under `/tmp/opencompare-readme-capture`, starts the built app
once per shot with the comparison as launch arguments, waits for the session to
settle with no element in hover state, captures the window content through the
DevTools protocol and writes all four PNGs in one run. It never imports or reads
`src/shared/fixtures/**`.
