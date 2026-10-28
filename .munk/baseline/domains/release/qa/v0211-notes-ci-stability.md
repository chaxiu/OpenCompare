# v0.2.11 发布说明与 CHANGELOG 补入 CI 测试稳定性修复（纯文案补齐）

- WI：`wi_ws_6ece0152a47c9c1a`（`key: v0211-notes-ci-stability`）
- 域：`release`（发布说明 / CHANGELOG 文案项；不是版本收敛轮、不是发布收尾轮、不是实现轮）
- 来源：`.munk/changes/wi_ws_6ece0152a47c9c1a/prd.md` + `.munk/changes/wi_ws_6ece0152a47c9c1a/verify-release-notes.mjs`（本 WI change pack 无 `tests/cases/**`、无 `tech.md` / `ux/**`）
- 提交：产品面单提交 `42fb818`（父基线 `4f6dd95`，即 `wi_ws_aefe3a384e8119bb` 的 delivery merge）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-notes-ci-section | `docs/release-notes/v0.2.11.md` 第 23 行 `## CI 测试稳定性修复`；小节正文含 `30_000`、`6,816`、`27.42`、`358,000`、`69 files`、`1104` 六项，并写明「358,000 行同步遍历规模、用例数量与逐行覆盖断言全部保留」「本次只改测试文件的超时参数，产品代码…不受影响」「全局 `testTimeout` / `hookTimeout` 未改」「约 4.4x 余量」 | 满足 |
| ac-notes-unverified-claims | `CI 已通过` / `CI 通过` / `Release 已就绪` / `待验证` / `预计通过` / `应该通过` 零命中；`\b(?:TODO\|TBD\|FIXME)\b` 与 40–64 位 hex 零命中 | 满足 |
| ac-notes-length | 2778 字符（`[...text].length`），> 1000（v0.2.11 收敛轮的 2266 字符 + 新增小节） | 满足 |
| ac-notes-memory-whitelist | 单位匹配序列按文档顺序恰为 `451.6 MiB` / `909.0 MiB` / `2.25 GiB` / `2.5 GiB` / `9.29 GiB` / `9.62 GiB`（六项、各一次）；新增小节的 `6,816ms` / `27.42s` / `30s` / `4.4x` 不在 `GiB\|MiB\|GB\|MB` 白名单内 | 满足 |
| ac-notes-existing-whitelist | 13 项短语（`指示条` / `四态` / `same` / `added` / `removed` / `modified` / `滚动` / `点选` / `跳转` / `minimap` / `不新增扫描` / `不改对比与合并算法` / `升级方式`）与 `trun_08764efa44c39426`、`2bcdc53e` 全在位；H1 含 `v0.2.11`；`200,000` / `10 MB` / `本版新增` / `releases/tag/v0.2.10` / `Full Changelog` 零命中 | 满足 |
| ac-changelog-overview | `CHANGELOG.md` 的 `[## v0.2.11, ## v0.2.9)` 切片首段同时含 `指示条`、`窗口渲染`、`测试`、`30_000`（四类关键词齐备，覆盖 v0.2.10 两项补发 + 本次修复） | 满足 |
| ac-changelog-fix-entry | 同切片 `### 修复` 小节含 `30_000`、`6,816`、`27.42`、`358,000`、`规模与全部断言不变`，并写明「全局 `testTimeout`、产品代码与产品行为均未改动」 | 满足 |
| ac-changelog-kept-sections | 同切片 `### 新增` / `### 不做的事` / `### 升级方式` 与 11 项白名单词逐字保留（v0.2.10 子节原样并入） | 满足 |
| ac-changelog-no-units | 切片单位匹配为空数组；`200,000` / `10 MB` / `本版新增` 零命中；`TODO`/`TBD`/`FIXME` 与 40–64 位 hex 零命中 | 满足 |
| ac-changelog-single-heading | 切片内 `^## ` 集合恰为 `['v0.2.11']`；`## v0.2.10` 保持折叠（不以二级标题出现），`## v0.2.9` 起逐字未动 | 满足 |
| ac-version-triple | `package.json#version === "0.2.11"`；`release.yml` 第 17 行 `default: 'v0.2.11'`；notes H1 含 `v0.2.11` —— 三者一致（本项零 diff 只校验） | 满足 |
| ac-zero-diff | `git diff --name-only main...HEAD` 恰为 `CHANGELOG.md`、`docs/release-notes/v0.2.11.md`（+13/−1）；`package.json` / `.github/workflows/release.yml` / `docs/release-process.md` / `docs/release-signing.md` / `src/main/release-packaging.test.ts` / 两版 README / `docs/release-evidence/**` / `DiffRuler.scale.test.tsx` 零 diff；`latestPublishedTag = 'v0.2.9'` 未动 | 满足 |
| ac-narrow-test-green | `pnpm test src/main/release-packaging.test.ts` → 199 passed (199)、1 file passed、984ms、exit 0 | 满足 |
| ac-full-test-green | `pnpm test` → 69 files passed、1104 passed + 1 skipped（1105）、27.24s、exit 0 | 满足 |
| ac-gates-green | `.munk/runs/run_ws_5197fd73c56c4db0/code-gates/attempts/001`：9 道 gate 全 `passed` / exit 0（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate） | 满足 |
| ac-single-commit | 产品面单提交 `42fb818`（2 文件 +13/−1），提交信息含「Why the previous item missed it」段解释 `wi_ws_aefe3a384e8119bb` 的工作树当时未含 `30_000`（grep 0 命中）故其 prd 拒绝写未实测的 CI 数字，并逐条列出未纳入项（无 tag / dispatch / Release / 资产 / 凭据 / README 版本表 / 新证据 / CHANGELOG 内存数字 / 历史条目美化）。Delivery 的 `.munk/baseline/**` fold 为独立 `chore(baseline)` 提交，不属产品面 | 满足 |

## 关键事实核对（anti-drift）

- **上一轮假设被推翻**：`wi_ws_aefe3a384e8119bb` 交付时 `DiffRuler.scale.test.tsx` grep `30_000` / `30000` 均 0 命中，故按 `ac-notes-ci-fix` 的「无 `30_000`」分支处理并把「CI 测试稳定性修复未随本项落地」列入未纳入项。本轮该修复已由 `wi_ws_b21636d826817b53` 合入 `main`：`src/renderer/src/components/DiffRuler.scale.test.tsx` 第 270–271 行注释（`6,816ms` 撞 `5000ms`、本机全量 `27.42s` / `69 files` / `1104 passed`）+ 第 309 行 `}, 30_000)` 收尾。CI 数字因此首次有据可写。
- **只改测试超时、不改规模**：`DiffRuler.scale.test.tsx` 本轮零 diff（修复在 `main` 上已存在），本项只把既成事实写进对外文案；不重跑 358k 用例、不改 `vitest.config.mts`。
- **单位白名单的边界**：`ms` / `s` / `x` 度量不是 `GiB|MiB|GB|MB`，因此 notes 六项有序白名单与 CHANGELOG 切片的「零单位数字」均不受新文案影响——这是本轮最容易误判的一点。

## 最近执行

- workItemId: wi_ws_6ece0152a47c9c1a
- at: 2026-10-29
- status: pass
- note: 16 条 AC 全部满足，无偏差。本轮 `needSelfTest=false`，跳过 UI 自测，以 Host `code_gates` 为交付门槛（9 gates，attempt 001，`.munk/runs/run_ws_5197fd73c56c4db0/code-gates/attempts/001`，全 exit 0；`pnpm test` 69 files / 1104 passed + 1 skipped / 1105 / 27.24s；`pnpm test src/main/release-packaging.test.ts` 199 passed）。fail-closed 文档自检：`node .munk/changes/wi_ws_6ece0152a47c9c1a/verify-release-notes.mjs` → `verify-release-notes: all doc acceptance checks passed`（exit 0）。边界：本项只写文案，不做发版动作（不推 tag / 不 dispatch / 不改 Release 与资产）、不前移 `latestPublishedTag`、不新建 v0.2.11 证据；notes「升级方式」仍写「建议从 v0.2.9 升级」（latest 仍是 `v0.2.9`），发版与收尾（README 两版第 5 行 / signing 状态 / 证据归档）是独立动作。
