# v0.2.12 CHANGELOG 补记窄窗口工具栏修复（发布面单点补齐）

## 范围

- 只改 `CHANGELOG.md` 一个文件：在 `## v0.2.12` → `### 改进` 列表**末尾**追加且仅追加一条：
  `- **窄窗口工具栏兜底**：目录工作台窄窗口（≤1024）首行工具栏改为行容器横向滚动兜底，宽档像素不变。`
- 措辞与 `docs/release-notes/v0.2.12.md:10`（「**窄窗口工具栏**：目录工作台窄窗口（≤1024）首行工具栏溢出修复。」）同源，只做条目化改写，**不写版本字面量**。
- 开工自检：工作树基于 `refs/heads/main`，`git rev-parse HEAD` = main tip（含 merge `6cbea1c`）且 `package.json#version = "0.2.12"`；不符立即停手报 owner，不得在旧快照上落盘。
- 若 `src/main/release-packaging.test.ts` 的 current-changelog 断言因新增行变红，只能按「新增不删减」口径**补**断言（用 `currentTag` 动态切片），不得删 / 跳 / 弱化任何既有断言，不得为 0.2.12 写内联版本字面量。
- 交付：9 道 `code_gates` 全绿、`git status` 干净，经 delivery 合入 main。

## 验收

- ac-head-is-main-tip: 工作树 `git rev-parse HEAD` 等于 `refs/heads/main` tip（含 `6cbea1c`），且 `package.json#version` 为 `0.2.12`。
- ac-improvement-line-appended: `CHANGELOG.md` 中 `## v0.2.12` 到 `## v0.2.11` 的切片里，`### 改进` 列表条目数比改动前恰多 1 条，且新增条位于该列表最后一条（其后紧接 `### 文档` 标题）。
- ac-line-text-exact: 新增条目文本逐字等于 `- **窄窗口工具栏兜底**：目录工作台窄窗口（≤1024）首行工具栏改为行容器横向滚动兜底，宽档像素不变。`
- ac-no-version-literal: 新增条目不含 `0.2.12` / `v0.2.12` 等版本字面量（`git diff CHANGELOG.md` 新增行匹配 `/v?0\.2\.12/` 为空）。
- ac-notes-parity: 新增条目与 `docs/release-notes/v0.2.12.md` 的「窄窗口工具栏」条同源——两者都含「窄窗口工具栏」「≤1024」「溢出/兜底」语义，且不引入 release-notes 里没有的新事实（不改版本、不改对比算法、不改发布通道）。
- ac-history-verbatim: `## v0.2.11` 及更早的所有条目与改动前逐字一致，无删除、无改写、无重排（`git diff CHANGELOG.md` 只剩 1 行 `+`、0 行 `-`）。
- ac-release-surface-untouched: `git diff --name-only` 中除 `CHANGELOG.md` 与 `.munk/changes/**` 外无其它路径；`package.json#version`、`docs/release-notes/**`、`README.md` / `README.zh-CN.md`、`.github/workflows/release.yml`、`docs/release-evidence/**`、`docs/release-signing.md`、`docs/assets/*.png`、`docs/screenshots.md` 零 diff。
- ac-gates-green: `.munk/code-gates.json` 的 9 道 gate（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）全部通过，其中 `pnpm test` 覆盖 `src/main/release-packaging.test.ts`。
- ac-tests-not-weakened: `src/main/release-packaging.test.ts` 若被改动，diff 只含新增断言行，既有 `it` 用例与 `expect` 数量不减少、无 `.skip` / `.todo` 新增。
- ac-delivery-clean: 交付时 `git status --porcelain` 为空，改动已提交并经 delivery 合入 main；未打 tag、未 push tag、未发版、未 dispatch 任何 release workflow。

## 非目标

- 不重做工具栏横向滚动兜底，不改 `DirectoryView.tsx`、`main.css`、`shellLayout*` 或任何渲染层代码。
- 不修改 `docs/release-notes/**`（含 `v0.2.12.md`）、两版 README、`release.yml`、`docs/release-evidence/**`、`docs/release-signing.md`、`docs/assets/*.png`、`docs/screenshots.md`。
- 不新增、删除或重排任何历史 CHANGELOG 条目（含 v0.2.11 及更早）；不改 `## v0.2.12` 既有 5 条「改进」文案与「文档」「升级方式」小节。
- 不写 `tech.md`，不新建 WorkSet、不扩范围到算法 / 扫描 / 快照 / 主题 token / `SHELL_LEVELS` / `minWidth`。
- 不打 tag、不 push tag、不发版、不 dispatch release workflow；不跑浏览器 / 真机 / 截图。

## 实现约束

- 落点严格限定：`CHANGELOG.md` 的 `## v0.2.12` / `### 改进` 列表末尾；历史段落逐字保留、不重排（新增不删减）。
- 条目文案由本 prd 给定，逐字照抄，不自行改写措辞或补版本号。
- `release-packaging.test.ts` 现有 current-changelog 断言用 `currentTag` 动态切片，正常应自动通过；确需补断言时只允许追加。
- 发布面其余文件为硬禁碰清单；任何一项出现 diff 即视为验收失败。
