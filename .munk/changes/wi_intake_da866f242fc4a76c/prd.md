# 把 release-evidence 历史台账表驱动化并把 sha256 移出 TS

## 范围

基线 `HEAD 15a6313`（本 worktree 干净）。本项是 **test-only 清债**，不改任何产品行为，只处理 `src/main/release-evidence.test.ts` 中手抄的历史台账。

| 指标 | 基线实测（15a6313） |
| --- | --- |
| `src/main/release-evidence.test.ts` 行数 | 711 |
| 顶层 `describe` | 7 |
| `it()` 用例 | 34 |
| 64 位 sha256 字面量 | 27（27 处，27 个唯一值） |
| `toContain` | 53 |
| `readFileSync` | 2 |
| 全仓测试文件 / 行数 | 115 / 48,120 |
| 全仓非测试 `ts/tsx/mjs/mts` 文件 / 行数 | 145 / 32,104 |

现状问题：v0.2.2 / v0.2.4 / v0.2.5 / v0.2.7 的「版本 - 资产名 - 字节数 - sha256」被手抄进 TS，且大量历史正文按逐句 `toContain` 断言；新增/修订证据必须改测试代码。

本项做两件事：

1. 新增 `docs/release-evidence-ledger.json`（位于 `docs/release-evidence/` 目录旁，不放进 `.munk/`，也不放进任何测试文件），把本测试文件当前涉及的历史台账落成数据：
   - 版本 5 个：`v0.2.1`（`blocked`，0 资产）、`v0.2.2`（`verified`，11 资产）、`v0.2.4`（`verified`，11 资产）、`v0.2.5`（`verified`，11 资产）、`v0.2.7`（`verified`，11 资产）；
   - 资产行合计 **44**，每行含 `name` / `bytes` / `sha256`；
   - 非资产 digest 合计 **3** 条（`extraDigests`）：`v0.2.2` 的包内图标 digest 与 `CandidateCDHashFull`，`v0.2.5` 的 `CandidateCDHashFull`；
   - 台账唯一 digest 合计 **47**（13 + 11 + 12 + 11），覆盖基线 27 个字面量的全部并新增 20 个证据 digest。
2. 把 `src/main/release-evidence.test.ts` 改成「解析台账数据 + 解析证据文档 + 表驱动逐行比对」，历史正文逐句断言退役为结构 / 表格 / 链接 / 集合闭合不变量；全部测试断言仍留在**这一个测试文件内**，不新增测试文件、不把断言挪到 `.munk/` 或其它目录。

## Acceptance Criteria

- ac-ledger-file: `docs/release-evidence-ledger.json` 存在、可被 `JSON.parse`，顶层含 `versions` 数组；版本集合恰好为 `v0.2.1` / `v0.2.2` / `v0.2.4` / `v0.2.5` / `v0.2.7` 且无重复。
- ac-ledger-shape: 每个版本节点含 `version` / `status` / `assets` / `extraDigests`；`v0.2.1` 的 `assets` 长度为 0，其余 4 个版本各 11 行（合计 44）；`extraDigests` 合计 3 条；每条资产 `name` 非空且同版本内唯一、`bytes` 为正整数、`sha256` 匹配 `^[0-9a-f]{64}$`；每条 `extraDigests` 含非空 `label` 与合法 `sha256`。
- ac-ledger-vs-doc: 测试必须按台账逐版本读取对应 `docs/release-evidence/<version>.md`，解析状态行与资产表（覆盖 3 列表、4 列表与 TSV 三种既有格式），断言解析出的 `status` 与台账一致；对 4 个 `verified` 版本断言解析资产行数与台账相等，并逐行双向比对 `name` / `bytes` / `sha256`（文档有而台账无、台账有而文档无、同一名字字节或 digest 不同，均失败，错误信息点名版本与资产名）。
- ac-digest-closure: 对每个版本，证据文档全文的 64 位小写 hex 集合必须恰好等于「台账资产 `sha256` ∪ `extraDigests.sha256`」集合；出现台账外 digest 或台账值在文档中缺失即失败。该断言替代基线逐条 digest `toContain`，且覆盖 47 个唯一 digest。
- ac-blocked-zero-digest: `v0.2.1` 解析为 `blocked`、资产行 0、全文 64 位 hex 为 0；其 `## 3. 缺失项` 表（结论列仅允许「缺失 / 不可核验」）、`## 4.` / `## 5.` / `## 6.` 结构段落仍被断言存在。
- ac-ts-zero-sha: `rg -o '[0-9a-f]{64}' src/main/release-evidence.test.ts | wc -l` 输出为 `0`；TS 测试源码中不得再出现任何 64 位 sha256 字面量。
- ac-ts-line-budget: `wc -l < src/main/release-evidence.test.ts` ≤ 400。
- ac-ts-tocontain-budget: `rg -o 'toContain' src/main/release-evidence.test.ts | wc -l` ≤ 15；留存项只能是版本/链接/路径/章节存在性等结构断言，不得是历史正文逐句措辞断言；交付时逐条列出留存理由。
- ac-cases-no-drop: 该文件实际执行的用例数 ≥ 33（基线 34，允许降幅 ≤5%）；`pnpm test` 全仓通过用例数不得低于改动前实测基线；禁止 `it.skip` / `describe.skip` / `it.only` / `it.todo` / 注释掉断言。
- ac-inspector-negative-fixtures: 基线纯函数负例语义不得丢失——空/缺失记录、非法 `status`、`verified` 缺少必需 marker 对、`verified` 少于两个不同 digest、`blocked` 携带通过标记、`blocked` 携带产物 digest、`v0.2.5` 缺一套产物 marker、`v0.2.5` digest 与台账不符、`v0.2.5` 少于 11 行、`v0.2.5` 残留 `pending`，每一条都有对应用例；期望值一律来自台账，不得回写 digest 字面量。
- ac-mutation-red: 篡改 `docs/release-evidence-ledger.json` 中任一资产 `sha256` 或任一 `extraDigests.sha256` 后，`pnpm test src/main/release-evidence.test.ts` 必须变红并指出版本/资产；交付须给出至少一次资产行篡改与一次 extra digest 篡改的命令与真实输出，并在验证后还原数据文件。
- ac-replacement-mapping: 交付必须给出「被删除的文本断言 → 替代断言（文件/用例/断言形态）→ 为何更强或等价」的逐条映射；基线 53 处 `toContain` 中降为 ≤15 的每一处、以及所有被移除的历史措辞/重复 digest 断言都必须在表中出现。无法给出替代断言的文本断言不得删除。
- ac-no-assertion-relocation: 变更集只允许 `src/main/release-evidence.test.ts` 与新增 `docs/release-evidence-ledger.json`（以及交付说明文件）；不得新增 `.test.ts`、`.test-helpers.ts` 或把断言移入 `.munk/`、`docs/`、`scripts/`。测试文件不得变成只读数据、把校验责任丢给别的套件。
- ac-no-overlap-b: `src/verify-release-gate.test.ts` 与 `scripts/verify-release.mjs` 必须相对基线 0 改动（并行项 B 的文件）。
- ac-version-frozen: `package.json#version` 保持 `0.2.16`；`docs/release-notes/**`、`CHANGELOG.md`、`.github/workflows/release.yml` 相对基线 0 改动；不推 tag、不 dispatch、不改任何已公开 Release 或资产。
- ac-gates-unchanged-and-green: `.munk/code-gates.json` 保持 0 改动；在自身 worktree 依次跑通该文件列出的全部门禁（`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics` / `sync-real-gate` / `template-*` / `verify-release-gate`），交付附命令与结论；任何门未绿不得改门、删断言或跳过。
- ac-delivery-metrics: 交付必须给出改动前后实测数字，不允许估计值：测试文件行数、64 位 sha256 字面量数、`toContain` 数、`readFileSync` 数、该文件执行用例数、全仓测试文件/行数、全仓非测试源码文件/行数，以及篡改注入的失败输出；文案不得写「测试代码量已解决」。
- ac-deadline-honesty: 若北京时间 20:00 前仍无法全绿，照常停下交付，写明失败门、真实输出与缺口；不得降门、删断言、跳过用例或把红写成绿。

## 非目标

- 不改任何产品行为、不改 `src/main/` 非测试源码、`src/preload/**`、`src/renderer/**`、`src/core/**`、`src/shared/**`。
- 不 bump 版本、不改 `docs/release-notes/**`、`CHANGELOG.md`、`.github/workflows/release.yml`、`electron-builder.yml`。
- 不推 tag、不 dispatch release workflow、不重新打包/公证、不改写已公开 Release 或资产。
- 不改 `src/verify-release-gate.test.ts`、`scripts/verify-release.mjs`（并行项 B）。
- 不把台账扩到本文件未涉及的其它 evidence 版本（`src/main/release-packaging.test.ts` 已有全目录表驱动层），不重复建第二套全量台账。
- 不改 `package.json` 依赖、不加 coverage 工具、不加脚本、不改 `vitest.config.mts`、不改 `.munk/code-gates.json`。
- 不靠删覆盖、跳过用例、合并断言或把断言搬到别的文件来达成行数/`toContain` 目标。
- 不修改 `docs/release-evidence/*.md` 既有正文（数据只能新增旁挂 JSON）。

## Implementation Constraints

- 台账路径固定为 `docs/release-evidence-ledger.json`（与 `docs/release-evidence/` 同级，避免污染既有证据目录，也避开 `.munk/`）。
- 台账 schema 固定为：
  ```json
  {
    "versions": [
      {
        "version": "v0.2.x",
        "status": "verified | blocked",
        "assets": [{ "name": "…", "bytes": 123, "sha256": "…" }],
        "extraDigests": [{ "label": "…", "sha256": "…" }]
      }
    ]
  }
  ```
- 所有期望 digest 只能来自该 JSON；测试文件内的常量只允许放非 digest 的结构性字符串（章节标题、命令名、job 名、资产族正则等）。
- 表驱动优先用 `describe.each` / `it.each` 展开版本与资产，保证「台账增行 = 用例自动增加」，但用例下限按 ac-cases-no-drop 计。
- 纯函数 inspector 与负例夹具保留在同一文件；期望值通过参数注入台账，不复制 digest。
- 断言强度口径：逐行 `name + bytes + sha256` 全等与全量 digest 集合闭合，强于基线的「文档包含某 digest」；结构段落存在性与表格解析强于逐句措辞 `toContain`。做不到更强时保留原断言，不得删除。
- 20:00 是硬时限；超时按 ac-deadline-honesty 交付，不降门。
