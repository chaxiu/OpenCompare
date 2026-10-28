# DiffRuler 358k 用例 CI 超时修复（只动测试）

## 范围

唯一允许改动的文件：`src/renderer/src/components/DiffRuler.scale.test.tsx`。

1. 给 describe `diff ruler at 358k rows` 中的用例
   `it('covers every non-same row with a same-status marker in one synchronised pass', ...)`
   （当前第 269 行）增加 per-test 超时第三参数 `30_000`（毫秒），即
   `}, 30_000)`；与仓库既有写法一致（`src/renderer/src/components/TreeView.test.tsx:373` 已用 `}, 30_000)`）。
2. 在该用例上方或下方加一段注释，写明引入显式超时的实测依据：
   - CI attempt1 该用例实测 6,816ms，在默认 5000ms 下报 `Error: Test timed out in 5000ms.`
   - 本机同版本干净树全量 `pnpm test` 为 69 files / 1104 passed / 27.42s
   - 30s 相对 6.8s 约 4.4x 余量；358,000 规模与断言覆盖不变
3. 交付前实测并记录：
   - `pnpm test src/renderer/src/components/DiffRuler.scale.test.tsx`：带 test 数、目标用例耗时
   - `pnpm test` 全量：files / passed / 耗时
   - 9 道 `code_gates` 全绿

本项是纯测试稳定性修复，**不改任何产品行为与测试覆盖**。

## 验收

- ac-target-explicit-timeout: `DiffRuler.scale.test.tsx` 中描述串为 `covers every non-same row with a same-status marker in one synchronised pass` 的 `it(...)` 第三个参数为 `30_000`（正则/AST 可断言：该 `it(` 调用的闭合为 `}, 30_000)`，且该描述串在全文件唯一）。
- ac-comment-cites-evidence: 该用例附近注释同时包含字面量 `6,816`（CI attempt1 实测毫秒）与 `27.42`（本机全量秒），并说明「显式 30s / 358k 规模与覆盖不变」。
- ac-no-global-timeout-config: `vitest.config.mts` 保持零 diff，其 `test` 配置块内不存在 `testTimeout` 与 `hookTimeout` 键（`grep -c "testTimeout\|hookTimeout" vitest.config.mts` == 0），默认 5000ms 全局口径不变。
- ac-scale-constant-kept: 文件内 `const ROW_COUNT = 358_000` 逐字保留，全文件 `358_000` 出现次数不减少。
- ac-test-count-kept: 全文件 `it(` 顶层用例数仍为 8，`describe(` 数仍为 4；`diff ruler at 358k rows` 下用例数仍为 5。
- ac-assertion-count-kept: 目标用例体（从该 `it(` 到其闭合 `}, 30_000)`）内 `expect(` 出现次数仍为 3（`toBeDefined` / `toBeLessThanOrEqual` / `toBeGreaterThanOrEqual` 各一）；全文件 `expect(` 出现次数仍为 57。
- ac-no-skip-or-relax: 文件内不存在 `it.skip` / `describe.skip` / `it.todo` / `xit` / `xdescribe`（grep 计数为 0），且目标用例仍对每个非 `same` 行逐行断言游标覆盖，未改为抽样或宽松匹配。
- ac-single-file-green: `pnpm test src/renderer/src/components/DiffRuler.scale.test.tsx` 退出码 0，`Tests  8 passed (8)`，交付说明记录目标用例实测耗时。
- ac-full-suite-green: 全量 `pnpm test` 退出码 0，`69 passed (69)` files / `1104 passed`，交付说明记录总耗时。
- ac-gates-green: `.munk/code-gates.json` 的 9 道 gate（install / lint / typecheck / build / build:web / test / test-compare-request / cancel-gate / memory-gate）全部退出码 0。
- ac-single-file-diff: `git diff --name-only` 在本项提交中恰为 `src/renderer/src/components/DiffRuler.scale.test.tsx` 一个文件（不夹带 `vitest.config.mts`、`package.json`、产品代码或其它测试）。

## 非目标

- 不改 `vitest.config.mts` 的全局 `testTimeout` / `hookTimeout`，不上调全部测试的默认超时。
- 不改产品代码：`DiffRuler.tsx`、`CodeView.tsx`、`src/core/**`（含 `ruler.ts`、`diff.ts`）零 diff。
- 不删用例、不加 `skip` / `todo`、不缩小 `ROW_COUNT`、不减少或放宽断言、不把语义断言降级为 `toBeTruthy()`。
- 不改其它测试文件（含 `TreeView.test.tsx` 既有 30s 用法）。
- 不重写 sweep 构造 / 不优化 `buildRulerBands`（备选路径仅在其能证明单次遍历显著下降且断言覆盖不变时才允许，本项默认不做）。
- 不做版本收敛：不改 `package.json#version`、`CHANGELOG.md`、`docs/release-notes/**`、`.github/workflows/release.yml`、`docs/release-process.md`、`docs/release-signing.md`、`src/main/release-packaging.test.ts`（属同集另一子项）。
- 不动 `README.md` / `README.zh-CN.md` / `docs/release-evidence/**` / `AGENTS.md`；不新增 AGENTS.md「358k 性能口径」章节。
- 不推 tag、不 dispatch release workflow、不创建或修改 GitHub Release 与资产、不改发布通道。
- 不继承、不提交主工作区的 60 项暂存回退改动。

## 实现约束

- 开工三查（硬门）：`git rev-parse HEAD` == `b516d45509071ff34c021fa31d1720da2ef22f7a`；`package.json#version` == `"0.2.10"`；`src/renderer/src/components/DiffRuler.scale.test.tsx` 与 `docs/release-notes/v0.2.10.md` 均存在。若工作区是 0.2.9 树，停止并上报。
- 首选做法固定为「第三参数 `30_000`」：仓库已有 `}, 30_000)` 先例，改动面最小、可审。
- 数值写成 `30_000`（数字分隔符下划线风格，与 `358_000` 一致）。
- 本项独立 commit，提交说明写明：只动一个测试文件、未改全局超时、未改产品代码、未放宽断言；并附带单文件与全量实测耗时 / 通过数。
- 与本集版本收敛子项无共享文件、无依赖；两项各自 gate 独立绿。
