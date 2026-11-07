# v0.2.24 README 最新公开发布指针对齐

v0.2.24 已公开发布（`https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.24`，tag 指向 `4191a8fb21547fd990af054f9f8b256634e9aff4`，非 draft）。本项是 v0.2.24 收口的最后一个文档指针项：只把两版 README 第 5 行的「最新公开版本」指针从 `v0.2.23` 改指 `v0.2.24`，使文档与已公开版本一致。

## 范围

1. `README.md` 第 5 行改为逐字：
   `> Latest public release: [v0.2.24](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.24) — Developer ID signed and Apple-notarized macOS build.`
2. `README.zh-CN.md` 第 5 行改为逐字：
   `> 最新公开版本：[v0.2.24](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.24) — macOS 安装包经 Developer ID 签名与 Apple 公证。`
3. `src/main/__fixtures__/release-announced-tag.json` 的 `tag` 由 `v0.2.23` 同步为 `v0.2.24`（**同一个指针的机器可读副本**，非新增范围，理由见「实现约束」）。

两版 README 除第 5 行外一字不动；其它文件除上述三项外零 diff。

## 验收

- ac-en-line5: `README.md` 第 5 行逐字等于 `> Latest public release: [v0.2.24](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.24) — Developer ID signed and Apple-notarized macOS build.`
- ac-zh-line5: `README.zh-CN.md` 第 5 行逐字等于 `> 最新公开版本：[v0.2.24](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.24) — macOS 安装包经 Developer ID 签名与 Apple 公证。`
- ac-single-link-v024: 两版第 5 行中 `releases/tag/` 各自出现次数恰为 1，链接文字与链接 URL 均为 `v0.2.24`，且该行不出现 `v0.2.23`。
- ac-announced-tag-synced: `src/main/__fixtures__/release-announced-tag.json` 顶层 `tag` 为 `v0.2.24`；`pnpm test src/main/release-version-gate.test.ts` 的 `accepts the real repository facts end to end` 与 `points both readme line-5 links at the announced tag` 两个用例通过（`publishedTag` 派生为 `v0.2.24`，`judgePublishedAnchor` 无 `published-anchor-mismatch` / `published-tag-missing`）。
- ac-readme-structure-unchanged: 两版 `^## ` H2 计数仍各为 9，且中英顺序一一对位；第 3 行语言互链仍为 `English | [简体中文](./README.zh-CN.md)` 与 `[English](./README.md) | 简体中文`；英文 README 有效词数 ≤700（当前 558）；`pnpm test src/main/release-artifacts-and-brand.test.ts` 通过。
- ac-no-stale-latest-pointer: 在 `README.md` / `README.zh-CN.md` 之外，全仓非历史文档（排除 `CHANGELOG.md`、`docs/release-notes/**`、`docs/release-evidence/**`、`docs/release-evidence-ledger.json`、`src/main/__fixtures__/release-packaging.json` 这一「已公开资产历史台账」、`.munk/**`）不再存在 `Latest public release` / `最新公开版本` 形式且指向 `v0.2.23` 的静态指针（`grep -rn 'Latest public release\|最新公开版本'` 无 `v0.2.23` 命中）。
- ac-gates-green: `pnpm test` 全绿（含 `release-version-gate`、`release-artifacts-and-brand`、`release-evidence`、`release-packaging` 四个套件），`pnpm lint` 与 `pnpm typecheck` 通过；`node scripts/test-debt-gate.mjs` 通过（零新增测试行）。
- ac-no-release-or-version-change: `package.json#version` 仍为 `0.2.24`；`git tag --list` 与基线一致（无新 tag）；未执行 `gh release create/edit/upload/delete`、未 `git push` tag、未 `workflow_dispatch`；`CHANGELOG.md`、`docs/release-notes/**`、`docs/release-evidence/**`、`docs/release-evidence-ledger.json`、`src/main/__fixtures__/release-packaging.json`、`.github/workflows/release.yml`、`docs/screenshots.md` 与 `scripts/**` 相对基线零 diff。

## 非目标

- 不新增版本表、不改截图引用与 `docs/screenshots.md`、不改 README 其它章节/正文措辞。
- 不改 `package.json#version`、`CHANGELOG.md`、`docs/release-notes/**`、`.github/workflows/release.yml`、已公开 Release / tag / 资产。
- 不新建 `docs/release-evidence/v0.2.24.md`，不追写 v0.2.24 台账，不动 `release-packaging.json` 的 `evidence.currentVersion`（仍为最近一次已收官台账 `v0.2.23`）。
- 不改任何 `src/**` 产品代码与测试文件（含 `release-doc-fixtures.test-helpers.ts` 与门实现）；不新增测试行。
- 不重跑发版、不碰 Issue、不对外发帖。

## 实现约束

- **announced tag 夹具为何必须同批前进（非范围扩张）**：现有门禁 `src/main/release-doc-fixtures.test-helpers.ts` 的 `publishedTag = max(ledger/evidence 中 status=verified 的 tag, release-announced-tag.json)`；当前 verified 最大为 `v0.2.23`，若只把 README 改成 `v0.2.24` 而夹具仍为 `v0.2.23`，`judgePublishedAnchor` 会 fail-closed（`published-anchor-mismatch`）。`.munk/baseline/domains/release-version-anchor/product.md` 已明确「后续再公开新版本时 README 与夹具必须同批前进」。因此本项把夹具 `tag` 从 `v0.2.23` 改为 `v0.2.24`，只改这一个字符串值，不改测试代码或判定口径。
- **写锚点（先读再改，保持行结构）**：`README.md:5`、`README.zh-CN.md:5`、`src/main/__fixtures__/release-announced-tag.json`（两行 JSON 对象）。
- **不要顺手改的东西**：`release-packaging.json#evidence.currentVersion` 仍是 `v0.2.23` 的资产台账；本项不引入 `v0.2.24` 证据文件，故不得把它前移（否则 `release-evidence.test.ts` 的 current release 逐行比对会红）。历史版本段（旧 `## vX`、旧 notes、旧证据、旧台账行）逐字节保留。
- **不要改测试口径**：`judgePublishedAnchor`、`judgeReleaseHistory`、`NOTES_H2_PAIRS` 等判定与 `scripts/test-debt-gate.mjs` 的 baseline 均不动；`v0.2.24` 作为 pending 当前版本无需证据文件，符合 `judgeReleaseHistory`。
- **验证命令**：`pnpm test src/main/release-version-gate.test.ts src/main/release-artifacts-and-brand.test.ts src/main/release-evidence.test.ts src/main/release-packaging.test.ts`，再跑 `pnpm test`、`pnpm lint`、`pnpm typecheck`、`node scripts/test-debt-gate.mjs`。
- **交付**：正常走 code_gates 与 delivery，合入 `main`；不推 tag、不 dispatch workflow、不改已公开 Release。
