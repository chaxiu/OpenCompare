# 修正 V1 视觉证据记录：目录 HTML 导出 sha256 与 provenance 双源标注

## Scope

只修证据记录，不改产品行为、不重跑 L3、不重拍截图、不 bump 版本。当前 `main` = `a98f451`。

1. **① `docs/visual/v1/functional-parity.md`（第 34–42 行「Directory HTML report」表）**
   - 表中 `sha256` 行的 `Baseline fact` 与 `Recomputed` 两列都改成当前复算值
     `8fc99d02f65f815f4a5858839a8c77f2ec01c86221d65be5ac268c9135887792`。
   - `bytes` 行保持 `5367 | 5367 | yes`，两行的 `Equal` 仍为 `yes`。
   - 表格下方（现有 "Export HTML moved into…" 段落附近）补一句可核说明：
     > **Provenance.** The pre-token fact `8cfacec99138c21ef24b5eead14d4171ec4f4d657e815f1b8ba888bfc830a69b`
     > was captured at commit `11170a5` with app version `0.2.20`; the recomputed hash above is the same
     > generator with app version `0.2.21`. The two differ only in the `APP_VERSION` string and are both
     > `5367` bytes (`baseline-facts.json` → `directoryHtml.preToken` / `directoryHtml.refreshed`).

2. **② `docs/visual/v1/baseline-facts.json`：两处来源分别标注**
   - 顶层 `commit` / `capturedAt` 保持 `11170a5d300b5318c320913eaf6fea54ac510173` /
     `2026-11-04T17:06:57.558Z`（第二个用例据此断言"token 落地前"，不得改动）。
   - `fourStateCounts` / `ignoreSwitches` 不变。
   - `directoryHtml` 增加 `preToken` 与 `refreshed` 两段，各自带 `commit` / `appVersion` /
     `capturedAt` / `bytes` / `sha256`：

     ```json
     "directoryHtml": {
       "bytes": 5367,
       "sha256": "8fc99d02f65f815f4a5858839a8c77f2ec01c86221d65be5ac268c9135887792",
       "preToken": {
         "commit": "11170a5d300b5318c320913eaf6fea54ac510173",
         "appVersion": "0.2.20",
         "capturedAt": "2026-11-04T17:06:57.558Z",
         "bytes": 5367,
         "sha256": "8cfacec99138c21ef24b5eead14d4171ec4f4d657e815f1b8ba888bfc830a69b"
       },
       "refreshed": {
         "commit": "<写入时 HEAD，当前 main 为 a98f45123a5254ab217e966218cd33c41a38be8a>",
         "appVersion": "0.2.21",
         "capturedAt": "<ISO 时间>",
         "bytes": 5367,
         "sha256": "8fc99d02f65f815f4a5858839a8c77f2ec01c86221d65be5ac268c9135887792"
       }
     }
     ```

   - 顶层 `directoryHtml.sha256` / `.bytes` 是**当前复算值**，必须与 `refreshed` 逐位相同（由测试钉死，消除歧义）。
   - 保留 `directoryHtml{bytes,sha256}` 的扁平形状，避免推翻 `docs/ui-visual-direction.md` 的 `ac-baseline-facts` 口径。

3. **③ `scripts/visual-baseline-facts.test.mjs` 同步**
   - 用例一：保留 `commit` / `capturedAt` / `fourStateCounts` / `ignoreSwitches` 的既有断言；
     `directoryHtml` 改为断言 `refreshed.sha256` / `refreshed.bytes` 与当前代码复算**严格相等**（`toBe`，
     不许前缀/模糊匹配），并断言 `directoryHtml.sha256` / `.bytes` 等于 `refreshed` 同名字段。
   - 用例二（token 落地前）：`preToken.commit` 必须等于顶层 `commit`、存在于 `HEAD` 历史、
     `git show <commit>:src/renderer/src/assets/main.css` 仍不含 `#0b0e12` / `--height-control` /
     `--text-(xs|sm|base|lg):`（沿用现有证明）、该 commit 的 `package.json#version` 为 `0.2.20`，
     且 `preToken.sha256` / `preToken.bytes` 仍写在记录里（`8cfacec9…a69b` / `5367`）。
   - 用例二/新增断言（"仅差版本串"的可核证明）：把当前复算 HTML 中的当前 `APP_VERSION` 串整体替换为
     `preToken.appVersion`，其 `sha256` 与 `preToken.sha256` 严格相等、字节数仍为 `5367`。
     **依据（已核）**：`11170a5..a98f451` 间仓库报告的生成链路
     （`src/core/directory/report.ts`、`src/renderer/src/workbench/directoryReport.ts`、
     `src/renderer/src/i18n/**`、`src/shared/appVersion.ts`、`src/core/directory/compare.ts`）无改动，
     `package.json` 仅 `version` 0.2.20→0.2.21 与新增 `visual:baseline` script；`en/shell.ts` 改动不落在
     `directory.report.*` 键上。
   - WRITE 模式（`VISUAL_BASELINE_WRITE=1`）：重写文件时**不得丢掉** `preToken` 段与顶层 `commit`。
     把这部分抽成可断言的纯函数（如 `composeFacts(existing, computed)`），并加一条用例断言：
     即使传入的 `computed` 只含当前复算值，输出仍带有 `preToken`（含 commit / appVersion / sha256 / bytes）
     且顶层 `commit` 仍是 `11170a5…`；`refreshed.commit` 取写入时 `HEAD`。

## Acceptance Criteria

- ac-parity-sha-refreshed: `docs/visual/v1/functional-parity.md` 的「Directory HTML report」表中 `sha256` 行两列均为 `8fc99d02f65f815f4a5858839a8c77f2ec01c86221d65be5ac268c9135887792`，`bytes` 行仍为 `5367 | 5367 | yes`，两行 `Equal` 均为 `yes`。
- ac-parity-pre-token-note: 该表下方存在说明段，同时含 `11170a5`、`8cfacec99138c21ef24b5eead14d4171ec4f4d657e815f1b8ba888bfc830a69b`、`APP_VERSION`、`5367`，并指向 `directoryHtml.preToken` / `directoryHtml.refreshed`。
- ac-facts-two-sources: `docs/visual/v1/baseline-facts.json` 顶层 `commit` 仍为 `11170a5d300b5318c320913eaf6fea54ac510173`；`directoryHtml.preToken` = {commit 同上, appVersion `0.2.20`, bytes 5367, sha256 `8cfacec9…a69b`}；`directoryHtml.refreshed` = {commit 为 40 位 hex、appVersion `0.2.21`, bytes 5367, sha256 `8fc99d02…7792`}，且 `directoryHtml.bytes`/`.sha256` 与 `refreshed` 同名字段相等。
- ac-facts-refreshed-strict: 测试对 `refreshed.sha256` / `refreshed.bytes` 与当前代码实时复算结果使用严格相等断言（`toBe`），任一字符或字节漂移即红。
- ac-pre-token-verifiable: 测试断言 `preToken.commit` 等于顶层 `commit`、`git cat-file -e` 成功且是 `HEAD` 祖先、该 commit 的 `main.css` 不含 `#0b0e12` / `--height-control` / `--text-(xs|sm|base|lg):`、该 commit 的 `package.json#version` 为 `0.2.20`；并把当前复算 HTML 中的当前 `APP_VERSION` 替换为 `0.2.20` 后，`sha256` 与 `preToken.sha256` 严格相等且字节数 `5367`。
- ac-write-preserves-pre-token: 纯函数化的事实组装在"只给当前复算值"的输入下仍输出 `preToken` 段（commit `11170a5…` / appVersion `0.2.20` / sha256 `8cfacec9…a69b` / bytes 5367）与顶层 `commit` `11170a5…`；WRITE 模式重写 `baseline-facts.json` 后该段与顶层 `commit` 仍在。
- ac-gates-green: `pnpm test scripts/visual-baseline-facts.test.mjs`、`pnpm test`（全量）、`pnpm typecheck`、`pnpm lint` 与 `.munk/code-gates.json` 现有 29 个 gate 全部通过；`package.json` 依赖（`dependencies` / `devDependencies`）零变化。
- ac-diff-scope: `git diff --name-only` 的证据/产品文件仅 `docs/visual/v1/functional-parity.md`、`docs/visual/v1/baseline-facts.json`、`scripts/visual-baseline-facts.test.mjs`；除 Host 强制的 `.munk/changes/wi_intake_c1adfeb9948830ce/prd.md`（与仓库既有 397 个 `prd.md` 同构的流程记录）外无第 4 个文件。

## Non-Goals

- 不改 `src/` 任何文件（含 `src/renderer/src/workbench/directoryReport.ts`、`src/core/directory/report.ts`）。
- 不动 `docs/visual/v1/before/` 与 `docs/visual/v1/after/`（不重拍、不改字节）。
- 不改 `docs/visual/v1/measurements.md`、`docs/ui-visual-direction.md`、`.munk/baseline/**`。
- 不改 `package.json#version`、`CHANGELOG`、release notes、`.github/workflows/release.yml`、`docs/screenshots.md`。
- 不推 tag、不动已公开 Release 与资产、不重跑 L3、不重拍截图。
- 不改 `.munk/code-gates.json`（不新增/删除/放宽 gate）。
- 不为凑绿删除或放宽任何断言（尤其不得把 `refreshed` 的严格相等改成前缀/模糊匹配）。

## Implementation Constraints

- 文件锚点：
  - `docs/visual/v1/functional-parity.md` 第 34–42 行（表 + 其后两段说明），英文正文保持一致风格。
  - `docs/visual/v1/baseline-facts.json` 当前 18 行；`directoryHtml` 为第 14–17 行。
  - `scripts/visual-baseline-facts.test.mjs`：`computeFacts()`（返回 `commit: git rev-parse HEAD`）与
    `it('records and then re-verifies the pre-token baseline facts')` / `it('keeps the captured commit in history and before the token landing')`。
- 已核事实（可直接引用，无需再扫仓库）：
  - `11170a5` = 基线采集 commit（`package.json#version` 0.2.20，`main.css` 无 token）。
  - token 落地 commit = `451bf57`（`feat(visual): land the unique token source and control primitives`），`11170a5` 是它的祖先。
  - 当前 `main` = `a98f451`，`package.json#version` = 0.2.21，`APP_VERSION` 从 `package.json` 读取。
  - 当前复算 = 5367 字节 / `8fc99d02…7792`；pre-token 记录 = 5367 字节 / `8cfacec9…a69b`。
  - `11170a5..a98f451` 内报告生成链路文件零改动（见上），故"仅差 `APP_VERSION` 串"可严格成立。
- `computeFacts()` 现状把 `commit` 直接写成 `HEAD`——改造后顶层 `commit`/`capturedAt` 必须来自 pre-token 记录
  （常量或既有文件），`refreshed.commit` 才取写入时 `HEAD`，否则 WRITE 会覆盖 11170a5。
- 同一纯函数的两处调用方（UI 可达性/门禁用例口径）本项不涉及，无需新增门禁。
- 无需 Design / Architect：改动完全由本 PRD 的路径、键名与断言锁定。
