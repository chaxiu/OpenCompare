# 将 README「最新公开发布」指针从 v0.2.21 同步到 v0.2.23

## 范围

- v0.2.23 已于 `2026-11-05T07:23:52Z` 公开（GitHub Release 非 draft / 非 prerelease，12 件资产），tag `v0.2.23` 指向发布点 `d738254`；当前两版 README 第 5 行仍指 `v0.2.21`，需同步。
- `README.md` 第 5 行：链接文字与 URL 同时 `v0.2.21` → `v0.2.23`，句子其余部分逐字不变。
- `README.zh-CN.md` 第 5 行：同批镜像同步，与英文版一一对应。
- 守卫基线同步：`src/main/release-doc-fixtures.test-helpers.ts` 的 `publishedTag` 由 `docs/release-evidence/*.md` 与 `docs/release-evidence-ledger.json` 的 verified 行派生，当前最大值仍是 `v0.2.21`；而 v0.2.23 的发布证据回写不在本项范围。因此把「已公开 tag」固化为显式常量（`announcedPublicTag = 'v0.2.23'`），与 evidence 派生值取 `compareTags` 最大值作为 `publishedTag`；`judgePublishedAnchor` 的严格相等判定与 `src/main/release-gate.ts` 一行不改。
- 正文其它指针核对：两版 README 仅第 5 行为写死版本的「最新」指针，第 7 行 `shields.io/github/v/release/...` badge 是动态取最新 Release，不含写死版本；正文无其它 `latest / 最新版本` 版本指针，故无额外改动。

## 验收

- ac-readme-en-line5: `README.md` 第 5 行逐字为 `> Latest public release: [v0.2.23](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.23) — Developer ID signed and Apple-notarized macOS build.`（链接文字与 URL 同为 v0.2.23，该行不含 `v0.2.21`）。
- ac-readme-zh-line5: `README.zh-CN.md` 第 5 行逐字为 `> 最新公开版本：[v0.2.23](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.23) — macOS 安装包经 Developer ID 签名与 Apple 公证。`（链接文字与 URL 同为 v0.2.23，该行不含 `v0.2.21`）。
- ac-readme-diff-scope: `git diff -- README.md README.zh-CN.md` 恰为两个文件、各 1 处 hunk、各改 1 行（第 5 行）；第 3 行互链、第 7 行 badge、9 个 H2 标题、截图引用与其余正文逐字不变。
- ac-no-residual-pointer: 在排除历史记录（`CHANGELOG.md`、`docs/release-notes/**`、`docs/release-evidence/**`、`docs/visual/v1/functional-parity.md`）后的仓库文档中，`grep -n 'Latest public release\|最新公开版本'` 不再出现 `v0.2.21`，也不存在其它把「latest / 最新版本」写成 v0.2.21 的静态指针。
- ac-published-baseline: `releaseFacts.publishedTag` 解析为 `v0.2.23`；`src/main/release-gate.ts` 的 `judgePublishedAnchor` 未改，仍要求两版 README 第 5 行逐字等于 `publishedTag`（无 allowlist / 通配 / 降级分支）；`pnpm exec vitest run src/main/release-version-gate.test.ts` 通过。
- ac-gates-green: 按 `.munk/code-gates.json` 执行全部 gate 通过（含 `test` = `pnpm test`），交付报告结论取自该 attempt 的 `latestAttemptId`，不以本机单测快跑替代。
- ac-no-release-side-effects: `package.json#version` 仍为 `0.2.23`；`CHANGELOG.md`、`.github/workflows/release.yml`、`docs/release-process.md`、`docs/release-notes/**`、`docs/release-evidence/**`、`docs/release-evidence-ledger.json`、`src/main/__fixtures__/release-packaging.json` 零 diff；未创建 / 移动 / 推送 tag，未 `gh release edit/upload/delete`，未改远端 Release 正文与资产。

## 非目标

- 不做 v0.2.23 的发布证据回写（`docs/release-evidence/v0.2.23.md` 与 `release-packaging.json#evidence.ledger` 行留给独立收尾项）；本项只把「已公开」事实固化为断言基线常量。
- 不改 `package.json#version`、构建 / 发布默认 tag、CHANGELOG、发布说明、历史证据与台账。
- 不改 tag、Release、资产，不 dispatch workflow，不推远端。
- 不做其它文案、截图、截图 provenance、视觉基线 / 目录报告基线改动。
- 不修改 `judgePublishedAnchor` 或其它 `release-gate.ts` 判定，不放宽、不跳过任何门禁。

## 实现约束

- 文件锚点：`README.md:5`、`README.zh-CN.md:5`、`src/main/release-doc-fixtures.test-helpers.ts`（`publishedTag` 派生处，约 186-192 行）。
- 基线同步只允许新增一个显式常量（`announcedPublicTag = 'v0.2.23'`）并与其他候选 tag 用既有 `compareTags` 取最大；必须保留严格相等断言，不引入 allowlist、通配或「只要 README 是 semver 即通过」之类的弱化。
- 已核实 `pnpm exec vitest` 在本 worktree 需要先安装依赖；code_gates 会在安装后执行，勿以手工跳过替代。
- 风险 / 后续：v0.2.23 证据回写落地后，该常量应退化为 evidence 派生值的冗余项；若后续再公开新版本，README 与常量必须同批前进，否则 `test` gate 仍会红（fail-closed）。
