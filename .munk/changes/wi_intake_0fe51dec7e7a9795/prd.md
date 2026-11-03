# README 截图 provenance 修复：在最新 main 干净树重拍并钉成回归断言

## Scope

结案提案唯一驳回项：`docs/screenshots.md` 记录的 captured commit `dc781cd` 之后，main 又合入了状态栏换行的布局修复（`ef1a9f0` / `173e69b`），两张 README 截图因此不是取自最终合入构建。本项在最新 main 上重做构建与真实窗口采集，刷新截图与 provenance 记录，并把「captured commit 到 HEAD 之间 `src/renderer/**` 零 diff」写成可回归失败的断言。

范围（只做这些）：

1. 在干净工作树、HEAD = 开工时最新 main（当前 `e079a5e`，若开工时 main 已前进则用当时 HEAD）上执行 `pnpm build`，再执行 `node scripts/capture-readme-screenshots.mjs`，以真实临时目录树 + 真实文件对重拍两张图（工作台目录对比、文件字符 diff）。
2. 按实测结果在 A / B 中二选一落文档（不得混写）：
   - A：重建 PNG 与仓内现图 sha256 不同 → 用本次构建产物替换 `docs/assets/opencompare-workbench.png` 与 `docs/assets/opencompare-file-diff.png`；`docs/screenshots.md` 记录本次构建所用 commit，并写明「HEAD 干净树重建、像素已变」。
   - B：重建 PNG 与仓内现图逐字节相同 → 不替换图片（工作树保持无图片 diff）；`docs/screenshots.md` 的 captured commit 同样改为本次构建所用 commit，并附「重建 sha256 对照」作为等价证据（两张图的重建 sha256 = 仓内 sha256、构建命令、commit）。
3. 在既有截图域 `src/main/release-artifacts-and-brand.test.ts` → `describe('readme screenshots and capture provenance')`（fixture 行 `src/main/__fixtures__/release-artifacts-and-brand.json` 的 `.screenshots`，id `readme-screenshots`）内扩断言：PNG 签名 / 宽高 2560×1584 / 体积 / 两版 README 引用 / gitignore（未被忽略且被 git 跟踪）+ provenance（commit 可解析、是 HEAD 祖先、到 HEAD 的 `src/renderer` 全目录零 diff）。
4. 反向自测并留证：把 `docs/screenshots.md` 的 captured commit 人为改回 `dc781cd` 时新断言必须 fail 并报出实际变更文件清单；改回后正常树 pass。

不做（Non-Goals 见下）：不改 `src/renderer` 视觉代码，不改 README 结构/引用，不新增测试文件或门禁，不改版本 / CHANGELOG / release notes，不动已公开 tag / Release / 资产。

## Acceptance Criteria

- ac-capture-clean-head: 构建与采集在干净树上完成——采集开始前 `git status --porcelain` 输出为空，且 HEAD 等于开工时的 main HEAD（当前 `e079a5e`），执行顺序为 `pnpm build` → `node scripts/capture-readme-screenshots.mjs`；`docs/screenshots.md` 明确写出该 commit 与「在该 commit 的干净工作树上重建」的措辞。
- ac-capture-real-source: 两张图由 `scripts/capture-readme-screenshots.mjs` 以真实临时目录树（`/tmp/oc-readme-*`）与真实文件对、通过 `out/main` + `out/renderer` 真实 Electron 窗口 + DevTools 协议采集产出；脚本运行输出包含两行 `wrote docs/assets/<file> (N bytes)`，且采集过程中未读取 `src/shared/fixtures/**`、未使用旧图或拼接图。真实窗口起不来时不得出图，须上报。
- ac-png-branch-decided: 恰好落地 A 或 B 之一，并在 `docs/screenshots.md` 写明依据：A 时记录「重建 sha256 与旧图不同 → 已替换」及两张图的旧/新 sha256；B 时记录「重建 sha256 与仓内一致 → 保留现图」及两张图「重建 sha256 = 仓内 sha256」对照、构建命令与 commit。文档中不得同时出现两种口径。
- ac-png-format: 两张 PNG 均为有效 PNG（前 4 字节 `89 50 4E 47`）、尺寸 2560×1584、体积 > 10240 字节。
- ac-readme-unchanged: `README.md` 与 `README.zh-CN.md` 对两张图的引用仍在（markdown link target 覆盖两个资产路径），两文件的 9 个二级标题集合不变，第 5 行版本行文本不变，且 `git diff --exit-code -- README.md README.zh-CN.md` 为空（README 零 diff）。
- ac-provenance-resolvable: `docs/screenshots.md` 中 captured commit 为 40 位小写 hex，`git cat-file -e <sha>^{commit}` 退出码 0，`git merge-base --is-ancestor <sha> HEAD` 退出码 0（不可解析或非祖先即 fail）。
- ac-provenance-renderer-zero-diff: 断言以全目录 diff 判定——`git diff --quiet <captured>..HEAD -- src/renderer` 退出码为 0；非 0 时 fail，失败文案包含实际变更文件清单（`git diff --name-only <captured>..HEAD -- src/renderer` 的输出）与「请重跑 `pnpm screenshots` 并更新 docs/screenshots.md」。断言不得硬编码文件名或只比对部分文件：在 `dc781cd` 作 captured commit 时必须报出全部 8 个变更文件（`src/renderer/src/App.theme.test.tsx`、`src/renderer/src/components/SessionTabs.test.tsx`、`src/renderer/src/components/StatusBar.tsx`、`src/renderer/src/workbench/directoryStatusLegend.test.tsx`、`src/renderer/src/workbench/shellLayout.dom.test.tsx`、`src/renderer/src/workbench/shellLayout.test.ts`、`src/renderer/src/workbench/shellLayout.ts`、`src/renderer/src/workbench/useWidthTier.ts`）。
- ac-png-gate-extended: 上述 PNG（签名/宽高/体积/gitignore/被跟踪）与 provenance 断言都落在既有文件 `src/main/release-artifacts-and-brand.test.ts` 的截图 describe 内，期望值放在既有 fixture `src/main/__fixtures__/release-artifacts-and-brand.json` 的 `.screenshots` 行；不新建测试文件、不新增 npm 依赖、不联网。
- ac-negative-selftest: 提供反向自测证据（命令 + 输出）：把 `docs/screenshots.md` 的 captured commit 人为改回 `dc781cd` 后运行该测试文件必须 fail，失败输出包含上述 8 个文件与重跑提示；恢复为本次构建 commit 后同一命令 pass。证据写入 delivery 说明。
- ac-scope-diff: 提交内容只允许落在 `docs/assets/opencompare-workbench.png`、`docs/assets/opencompare-file-diff.png`（仅 A 分支）、`docs/screenshots.md`、`src/main/release-artifacts-and-brand.test.ts`、`src/main/__fixtures__/release-artifacts-and-brand.json`；`git diff --name-only e079a5e..HEAD -- src/renderer` 为空；`package.json` 版本、`CHANGELOG*`、`docs/release-notes*` 无非预期改动。
- ac-gates-green: 全量 `.munk/code-gates.json` 门禁全绿（含 `install` / `lint` / `typecheck` / `build` / `build:web` / `test` / `test-debt-gate` 等），未删除、未放宽、未跳过任何既有门；提交时工作树干净。

## Non-Goals

- 不改 `src/renderer` 任何视觉/布局代码（状态栏换行的实现已完成，本项只重拍）。
- 不改 README 结构、标题、版本行、图片引用方式；不重排文档。
- 不 bump 版本号、不改 CHANGELOG / release notes / electron-builder 配置。
- 不动已公开的 git tag、GitHub Release 与已上传资产；不重发 v0.2.19。
- 不新增 npm 依赖、不联网、不新增测试文件、不新增/删除 code gate。
- 不用内置样本、旧图、手绘或拼接图充新图；真实窗口起不来不降级。

## 实现约束

**文件锚点（已核）**

- 采集脚本：`scripts/capture-readme-screenshots.mjs`（真实 `/tmp/oc-readme-*` 树 + 真实 `src/session.ts` 文件对；`out/main/index.js` / `out/preload/index.js` / `out/renderer/index.html` 必须存在，否则脚本自身报错）。
- provenance 文档：`docs/screenshots.md`（当前 commit 行格式 `- commit: \`<40hex>\``，已有 Reproduce 段落）。
- 断言落点：`src/main/release-artifacts-and-brand.test.ts` 第 220 行起的 `describe('readme screenshots and capture provenance')`（**注意：不是 `release-packaging.test.ts`**；本仓该域实际位于 `release-artifacts-and-brand.test.ts`，fixture 行 id 为 `readme-screenshots`）。期望值走 `src/main/__fixtures__/release-artifacts-and-brand.json` 的 `.screenshots`（现有字段 `readmes/assets/record/commitPattern/reproduce`，可加 `width`/`height`/`minBytes`）。fixture 行 id 已在 `fixtureRowIds` 与 `useRow()` 台账中登记，新增字段不需要新行；若新增行须同步该台账。
- 测试助手：`src/main/release-doc-fixtures.test-helpers.ts` 的 `repoRoot`；文件内已 import `spawnSync`、`createHash`、`statSync`，可直接用 `spawnSync('git', [...], { cwd: repoRoot })`。
- `pnpm screenshots` == `electron-vite build && node scripts/capture-readme-screenshots.mjs`，与 `pnpm build && node …` 等价（`build` 即 `electron-vite build`），文档可任写其一但必须与实际执行一致。

**执行顺序（硬）**

1. 先确认 `git status --porcelain` 为空、`git rev-parse HEAD` 为开工时 main HEAD，记录该 sha。
2. `pnpm build` → `node scripts/capture-readme-screenshots.mjs`（**必须在任何文档/测试编辑之前**，否则是脏树构建）。
3. 记录两张重建 PNG 的 sha256 与旧图 sha256（旧图当前：workbench `1e972fbf354ac998e56f71500e206acd72f8724d9bb50dfac7441ed71e9dc596`，file-diff `8d3d9993ddf78ec5dd1241cf32b0b95770fb5d2caf2c934a377f05a474c07bfe`），据此选 A 或 B。
4. 改 `docs/screenshots.md`（commit + 采集步骤 + A/B 依据）。
5. 扩 fixture 与测试断言。
6. 反向自测（改回 `dc781cd` → 红；恢复 → 绿），保留命令与输出。
7. 全量门禁；干净树提交。

**断言实现要点**

- commit 解析与祖先检查：`git cat-file -e <sha>^{commit}`、`git merge-base --is-ancestor <sha> HEAD`（均用 `spawnSync`，断言 `status === 0`，失败文案带命令）。
- 渲染层零 diff：`spawnSync('git', ['diff', '--quiet', `${sha}..HEAD`, '--', 'src/renderer'])`，`status !== 0` 时再跑 `git diff --name-only <sha>..HEAD -- src/renderer` 把文件列表拼进失败消息，并附「请重跑 `pnpm screenshots` 并更新 docs/screenshots.md」。目录全量 diff，禁止硬编码文件名或 `it.each` 限定文件集。
- gitignore/跟踪：`git check-ignore --quiet -- <asset>` 期望 `status === 1`，`git ls-files --error-unmatch -- <asset>` 期望 `status === 0`。
- README 引用继续走既有 `parseMarkdown(readText(readme)).links`；宽高用 `bytes.readUInt32BE(16/20)`（同 brandAssets 断言写法）。

**证据要求**

- delivery 说明必须包含：构建/采集命令与运行输出、HEAD sha、两张图旧/新 sha256、A/B 选择依据、反向自测的红/绿命令与输出片段、全量门禁结果。
- 已知红样例基准（本场实测）：`git diff --stat dc781cd..e079a5e -- src/renderer` = 8 files changed, 407 insertions(+), 20 deletions(-)；逐文件：`StatusBar.tsx` 22、`shellLayout.ts` 83、`useWidthTier.ts` 22、`shellLayout.dom.test.tsx` 137、`shellLayout.test.ts` 117、`directoryStatusLegend.test.tsx` 29、`App.theme.test.tsx` 12、`SessionTabs.test.tsx` 5（含 +/− 合计为文件行数）。若断言在 `dc781cd` 下漏报其中任一文件，视为未完成。
- 版本收敛等非 `src/renderer` 提交不算过期——这正是只对 `src/renderer` 取 diff、而非要求 commit == HEAD 的原因。
