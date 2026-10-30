# v0.2.12 CHANGELOG 补记窄窗口工具栏修复（发布面单点补齐）

- WI：`wi_ws_3b26c401a6159e00`
- 域：`release`（发布面单点补齐轮：只补 CHANGELOG 一条，不动 notes / 版本 / 发布通道）
- 来源：`.munk/changes/wi_ws_3b26c401a6159e00/prd.md`（本 WI change pack **只有 `prd.md`**，无 `tests/cases/**` / `tech.md` / `ux/**`，故无 change-pack 用例可 copy、无 tech / ux 手合；本文件是 Delivery 按 prd AC 逐条落档的验收记录）
- 交付方式：`deliveryIntent: local merge`，`needSelfTest=false`（UI 自测跳过，以 Host `code_gates` 为交付门槛）

## 最近执行

- workItemId: wi_ws_3b26c401a6159e00
- at: 2026-10-30
- status: pass
- note: 10 条 prd AC 全部满足，无偏差。`needSelfTest=false`，跳过 UI 自测；Host `code_gates` 9 gates attempt 001 全 exit 0（`.munk/runs/run_ws_c2e6e71c9c8ac033/code-gates/attempts/001`，`pnpm test` 80 files / 1248 passed + 1 skipped / 1249）。测试零改动：`src/main/release-packaging.test.ts` 用 `currentTag` 动态切片，新增一行自动通过。边界：不打 tag / 不 push tag / 不 dispatch / 不 publish / 不建 Release 与证据文件；v0.2.12 发布后的 README 第 5 行 + `latestPublishedTag` 前移仍是独立动作。

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-head-is-main-tip | `git rev-parse HEAD` == `refs/heads/main` == `6cbea1c6aadcd147ba83bf99c09bed35c47db81c`（含 merge `6cbea1c`）；`package.json#version === "0.2.12"` | 满足 |
| ac-improvement-line-appended | `CHANGELOG.md` 的 `## v0.2.12` → `## v0.2.11` 切片中 `### 改进` 列表条目数 5 → **6**，新增条为列表最后一条，其后紧接 `### 文档` 标题 | 满足 |
| ac-line-text-exact | 新增行逐字 `- **窄窗口工具栏兜底**：目录工作台窄窗口（≤1024）首行工具栏改为行容器横向滚动兜底，宽档像素不变。` | 满足 |
| ac-no-version-literal | 新增行匹配 `/v?0\.2\.12/` 为空；`git diff CHANGELOG.md` 新增行内零版本字面量 | 满足 |
| ac-notes-parity | 新增条与 `docs/release-notes/v0.2.12.md:10`（`- **窄窗口工具栏**：目录工作台窄窗口（≤1024）首行工具栏溢出修复。`）同源：两者均含「窄窗口工具栏」+「≤1024」+「溢出/兜底」语义；未引入 notes 之外的新事实（无版本号、无算法 / 发布通道改动） | 满足 |
| ac-history-verbatim | `git diff CHANGELOG.md` 为 `+1 / -0`；`## v0.2.11` 及更早条目逐字未动 | 满足 |
| ac-release-surface-untouched | `git diff --name-only`（交付提交前工作区）恰为 `CHANGELOG.md`＋`.munk/**`；`package.json#version`、`docs/release-notes/**`、`README.md` / `README.zh-CN.md`、`.github/workflows/release.yml`、`docs/release-evidence/**`、`docs/release-signing.md`、`docs/assets/*.png`、`docs/screenshots.md` 零 diff | 满足 |
| ac-gates-green | `.munk/runs/run_ws_c2e6e71c9c8ac033/code-gates/attempts/001`：install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate 全 exit 0；`pnpm test` 1248 passed + 1 skipped（1249） | 满足 |
| ac-tests-not-weakened | `src/main/release-packaging.test.ts` 零 diff（`pnpm test` 1248 passed，较基线 1245 的净增 3 例来自上游 `wi_ws_b32f99362fb6b51b` 的工具栏修复轮，与本项无关）；无 `.skip` / `.todo` 新增 | 满足 |
| ac-delivery-clean | 交付提交经 `munk_git_commit` 后工作区干净，经 `munk_local_merge` 合入 main；未打 tag、未 push tag、未发版、未 dispatch workflow | 满足 |

## 交付说明

**改动文件（产品面）**：`CHANGELOG.md` 单文件 `+1 / -0`。

**关键判断**：
1. 本项是上一轮 `wi_ws_0a26040fef375884` 明确留下的「待跟进」项——当时只补了 notes、CHANGELOG 暂不镜像（「修复 commit 落地时再决定是否同批补 CHANGELOG」）。本轮修复已由 `wi_ws_b32f99362fb6b51b` 合入 `main`（merge `6cbea1c`，`workbench` 域 `view-toolbar` 横向滚动兜底），故 notes 的前瞻表述已有事实支撑，CHANGELOG 镜像可落。
2. 测试**零改动**：`release-packaging.test.ts` 的 current-changelog 断言已按 `currentTag` 动态切片，追加一行不触发重定标（`pnpm test` 1248 passed 复验）。
3. 条目措辞严格来自 prd，不写版本字面量、不写 `1146` / `960–1146` 等实测数字（数字只留在 notes 的 L3 记录与 qa 档案里）。

**未纳入项**：不改 notes / 两版 README / `release.yml` / `docs/release-signing.md` / `docs/release-evidence/**` / `docs/assets/*.png` / `docs/screenshots.md` / `package.json` / 任何 `src/**`；不重做工具栏兜底；不打 tag / 不 push tag / 不 publish / 不 dispatch；不做视觉 / 交互自测；v0.2.12 发布后的收尾（README 第 5 行 + `latestPublishedTag` 前移 + 证据归档）是独立动作。
