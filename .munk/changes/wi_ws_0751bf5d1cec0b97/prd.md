# 最终构建的双语 README 截图、provenance 与零变更复验

## 范围

本项是「语法高亮 V1 单闭环」的收尾波：语法引擎、渲染接线与大文件阈值均已合入 `main`（当前 HEAD `59485c0`，`src/renderer` 相对上一轮 captured commit `3e0744a` 零差异）。本项只做三件事，不改任何产品行为：

1. **从最终合入构建重拍四张 README 截图**：在干净的、已包含语法高亮 + 大文件回落的最终 renderer 构建上运行一次 `pnpm screenshots`，重新生成 `docs/assets/opencompare-workbench.{en,zh}.png` 与 `docs/assets/opencompare-file-diff.{en,zh}.png`，尺寸仍为 2560×1584。
2. **按语言重钉 provenance**：更新 `docs/screenshots.md`，四张图登记同一个 captured commit（须为最终合入提交，且 `captured commit..HEAD` 的 `src/renderer` 零差异），并逐语言、逐图登记 settings 注入方式（路径 / key / value / `<html lang>`）、实际字节数与 sha256。
3. **零变更复验并留在门禁**：复验四态计数、忽略换行 / 编码 / 空白开关、复制文本、导出文本在语法着色开启前后逐位一致，把断言落进 `.munk/code-gates.json` 已登记的 gate 中；同时确认版本语义单点文件零改动。

README 图片引用按语言隔离保持不变：`README.md` 只引英文 UI 图，`README.zh-CN.md` 只引中文 UI 图。

## 验收

### 截图与 provenance

- ac-four-shots-final-build: 四张 PNG 全部由同一次 `pnpm screenshots`（`electron-vite build` + `node scripts/capture-readme-screenshots.mjs`）在 captured commit 的干净工作树上重新写出；脚本日志逐张报告 4 个输出文件、字节数与语言注入路径；四张文件 mtime 均晚于本次运行开始时间（证明是重拍而非沿用旧图）。
- ac-png-dimensions: 四张 PNG 均为 2560×1584（PNG IHDR width/height），且均被 git 跟踪、未被 `.gitignore` 忽略。
- ac-single-captured-commit: `docs/screenshots.md` 中只出现一个 40 位十六进制 captured commit；该 commit 可被 `git cat-file -e` 解析、是 HEAD 的祖先，且 `git diff --quiet <commit>..HEAD -- src/renderer ':(exclude,glob)src/renderer/**/*.test.ts' ':(exclude,glob)src/renderer/**/*.test.tsx'` 为 0（沿用既有 `release-artifacts-and-brand` 守卫口径，不额外放宽）。
- ac-captured-commit-is-final: captured commit 是 `59485c0` 或其后代，即包含语法高亮渲染与大文件回落的最终合入状态；不得回钉到 `3e0744a` 等未含第二波的旧提交。
- ac-provenance-per-language: `docs/screenshots.md` 的 en / zh 两段各自登记 settings 文件路径、key `language`、value `"en"` / `"zh"`、期望 `<html lang>` `en` / `zh-CN`；每张图的登记字节数与 sha256 与该文件实际内容完全一致（由脚本/命令实测写入，禁止手抄）。
- ac-provenance-honest-src: `docs/screenshots.md` 不再声称「`src/renderer` 和其余 `src/**` 都零差异」；如实表述为 `src/renderer` 相对 captured commit 零差异（`src/core` 的第二波改动允许存在）。

### README 语言隔离

- ac-readme-en-only: `README.md` 中所有 `docs/assets/*.png` 引用恰好是 `opencompare-workbench.en.png` 与 `opencompare-file-diff.en.png` 两张，无 zh 图；alt 文本不含 CJK 字符。
- ac-readme-zh-only: `README.zh-CN.md` 中所有 `docs/assets/*.png` 引用恰好是 `opencompare-workbench.zh.png` 与 `opencompare-file-diff.zh.png` 两张，无 en 图；alt 文本含 CJK 字符。
- ac-languages-differ: 同一场景的 en / zh 两张 PNG 字节内容不同（不能靠同一张图改名充数）；两 README 之间的互链（`./README.zh-CN.md` / `./README.md`）保持存在。

### 零变更复验

- ac-counts-parity: 同一内容分别以着色路径（`.ts`）与纯文本路径（`.txt`）渲染时，`[data-code-diff-count]`、块计数 `x/y`、每行状态与行号完全一致；忽略换行 / 编码 / 空白开关的四种组合下同样一致。
- ac-switch-parity: 逐个切换忽略换行 / 编码 / 空白开关后，着色与否不改变四态计数、块边界、行状态与行号；开关默认值与禁用条件不变。
- ac-copy-export-parity: 合并视图「复制」写入剪贴板的文本与「导出」写入 `platform.saveFile` 的 content 与改动前逐字节一致（同一 `renderMergeText(render)` 结果，不受着色影响）；未解决冲突时复制 / 导出仍禁用，既有行为不变。
- ac-regression-in-gates: 上述零变更断言由 `.munk/code-gates.json` 中已登记的可执行 gate 覆盖（可扩展现有 `syntax-view` / `code-pair-actions` gate 的测试文件，或新增 `zero-change-regression` gate 并同步 `src/munk-gates.test.ts` 的 `EXPECTED_GATES`）；只在本地手跑一次不算交付。

### 版本纪律

- ac-version-anchors-untouched: `package.json#version` 仍为 `0.2.22`，`CHANGELOG.md`、`README.md` 第 5 行、`.github/workflows/release.yml` 的 dispatch 默认 tag（`v0.2.22`）、`docs/release-notes/**` 均零改动。
- ac-gates-green: 默认 `.munk/code-gates.json` 全量 gate 绿（含 `lint` / `typecheck` / `build` / `build-web` / `test` / `syntax-core` / `syntax-view` / `syntax-perf` / `release-artifacts-and-brand` 所在的 `test` 覆盖）。

## 非目标

- 不改 `src/core/**`、`src/renderer/**`、`src/main/**` 的任何产品行为；不动语法四色、阈值、缓存、diff 语义、合并 / 结构化 / CSV / 目录视图。
- 不新增截图场景、不改 2560×1584 尺寸、不改主题（仍为默认 dark）、不重写 README 正文，只允许必要的图片引用 / alt 文本调整。
- 不做版本收敛：不升版本号、不改 CHANGELOG、不改 README 版本行、不改 release.yml 默认 tag、不改 `docs/release-notes/**`。
- 不修改既有守卫测试的判定口径（不删除断言、不放宽 `src/renderer` 零差异范围）。
- 不做人工 GUI 验收；截图由脚本化 Electron 捕获完成，验收由自动化 gate 断言。

## 实现约束

- **捕获方式**：必须在 worktree 根运行 `pnpm screenshots`（其内部 `electron-vite build` + `node scripts/capture-readme-screenshots.mjs`），脚本通过 Chromium `--user-data-dir` + `settings.json` 注入 `{ language }`，以 `document.documentElement.lang` 作为就绪与截图前复检条件。语言注入路径 / key / value / htmlLang 已写在 `docs/screenshots.md` 并由 `src/main/__fixtures__/release-artifacts-and-brand.json` 的 `screenshots.languages` 锁定；若脚本不变，这些登记保持原值。
- **提交顺序**：捕获前工作树必须干净且 `src/**` 无未提交改动（当前 HEAD `59485c0` 已包含全部渲染 / core 改动）。先捕获，再更新 PNG 与 `docs/screenshots.md`，最后提交；captured commit 记录捕获时的 HEAD，不得先改 docs 再假装在该提交上捕获。
- **字节与 sha256 只能实测**：捕获后用 `wc -c` / `shasum -a 256`（或脚本输出）取真实值写入；若重拍后字节与 sha256 与旧值相同，保留相同数值但 captured commit 仍必须更新到最终提交；若不同，同时更新字节数与 sha256。
- **守卫锚点**：既有守卫在 `src/main/release-artifacts-and-brand.test.ts`（`describe` 为 README screenshots 段），依赖 fixture 中的 `commitPattern` / `rendererDir` / `settingsPath` / `settingsKey` / `settingsValue` / `htmlLang` / `width` / `height` / `minBytes` 与 `docs/screenshots.md` 的 Reproduce / clean-tree tokens；改写 docs 时不得删除这些被断言的字面 token。
- **零变更断言锚点**：现有 `src/renderer/src/views/CodeView.syntax.test.tsx` 已含计数 / 行 tone 的 feature-parity 快照，并由 `syntax-view` gate 执行；复制 / 导出逐字节断言优先扩展该文件或同域测试，使其自动落进已登记 gate。若选择新增 gate，必须同步 `src/munk-gates.test.ts` 的 `EXPECTED_GATES`（该测试会钉死 gate 清单）。
- **证据路径**：捕获日志、`docs/screenshots.md` 与四张 PNG 的绝对路径按运行时 worktree 根 `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_ws_0751bf5d1cec0b97/` 书写，并标注产品仓根 `docs/assets/` 映射。
- **环境风险**：`pnpm screenshots` 需要可用的 macOS Electron 图形会话与 DevTools 端口；若捕获脚本因环境（无显示 / 端口占用）失败，如实记录失败证据并上报为卡点，不得用旧图或手改 sha256 冒充重拍。
