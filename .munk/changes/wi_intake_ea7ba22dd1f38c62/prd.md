# v0.2.15 发布契约收敛（main @0c4f51ec）

## 范围

把 main 基线 `0c4f51ec8a6a5cb0eb75ad6dc1e62615eb75cdb9` 收敛成今晚 23:00 批次可直接打 `v0.2.15` 的可发布态。**只改发布契约与测试锚点**：`package.json#version`、`CHANGELOG`、双语发布说明、签名/发布流程文档、`workflow_dispatch` 默认 tag，以及 `src/main/release-packaging.test.ts` 的版本耦合重定标。`src/**` 业务代码零 diff（该测试文件除外）。

已核对：main 上自 v0.2.14 以来只有三个已合入、覆盖用户可见内容的提交，发布说明只写这三条：

1. `3e9f31dc`（内含 `0fc771e`）目录同步按链接落盘——符号链接同步后仍是链接，不跟随、不写穿、不穿透删除。
2. `241fa736`（内含 `b05eef5`）两版 README 能力区补三条同步口径（增量只新增与覆盖不删除 / 镜像删除默认不勾且显式勾选才执行 / 应用外改动下次对比时读取且无后台文件监听）。
3. `0c4f51ec`（内含 `ba24866`）同步预览摘要与删除勾选同源。

## 验收

- ac-version-single-source: `package.json` 的 `version` 为 `0.2.15`，且该文件相对 `0c4f51ec` 只改动这一行字段，其余字节不变。
- ac-changelog-top-entry: `CHANGELOG.md` 在 `# Changelog` 与首个历史段 `## v0.2.14` 之间新增且仅新增一个 `## v0.2.15` 段。
- ac-changelog-history-bytes: `CHANGELOG.md` 自 `## v0.2.14` 起的全部历史内容与 `0c4f51ec` 逐字节一致（diff 不含历史行）。
- ac-notes-pair: `docs/release-notes/v0.2.15.md` 与 `docs/release-notes/v0.2.15.zh-CN.md` 均存在且非空；英文首行为 `# OpenCompare v0.2.15 release notes`，中文首行含 `v0.2.15`。
- ac-notes-mutual-links: 英文 notes 含 `./v0.2.15.zh-CN.md`，中文 notes 含 `./v0.2.15.md`，两者互链。
- ac-notes-sections: 英文按序含且仅含一次 `## What changed`、`## Not in this release`、`## Risk and verification scope`、`## Upgrade`；中文对应且按序含 `## 本次变化`、`## 不做的事`、`## 风险与验证规模`、`## 升级方式`。
- ac-notes-three-items: CHANGELOG 的 `## v0.2.15` 段与两份 notes 只覆盖上述三条用户可见内容，且每条含可核对的行为描述：链接条目覆盖「源侧独有链接同步后仍是链接（相对路径不被改写为绝对、悬空链接照链接落盘、指向目录的链接同样）」「目标侧同名普通文件被链接替换时只替换该条目、不写穿被指向的外部文件」「镜像删除勾选后只删链接本身、不穿透目标文件」「两侧仅链接时间不同时可在预览里按链接对齐」；预览条覆盖「默认不勾删除项时可执行数为 0 且应用按钮不可用，勾选后为 1 且可用，取消勾选回到 0」「删除组头同时显示计划数与已选数」「执行后提示的删除数与磁盘实际一致」；README 条覆盖三条同步口径原文口径。
- ac-notes-no-full-changelog: 两份 notes 均不含 `**Full Changelog**` 与 `releases/tag/`。
- ac-notes-upgrade-from: 英文 `## Upgrade` 段写明从 v0.2.14 升级，中文 `## 升级方式` 写「建议从 v0.2.14 升级」。
- ac-notes-no-unverified: CHANGELOG `## v0.2.15` 段与两份 notes 均不含 `200,000`、`10 MB`、40–64 位十六进制串、CI run id，也不含「已发布」「已修复」「已通过验收」「已通过 L1」「本版新增」「预计通过」「应该通过」。
- ac-signing-status-unchanged: `docs/release-signing.md` 顶部状态行仍为「当前状态：v0.2.14 已发布」，其 Release 链接、notes 与 evidence 路径仍指 v0.2.14。
- ac-signing-posture-current: `docs/release-signing.md` 第三节标题为「## 三、正式版发布姿态（v0.2.15）」，且全文含 `默认 \`v0.2.15\`` 与 `docs/release-notes/v0.2.15.md`。
- ac-signing-successor: `docs/release-signing.md` 中 v0.1.2 段的承接句为「tag 之后的修复由 v0.2.15 承接」。
- ac-release-yml-default: `.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 为 `'v0.2.15'`；该文件相对 `0c4f51ec` 只改动这一行，其余字节不变。
- ac-release-process-default: `docs/release-process.md` 的 default 摘录为 `default: 'v0.2.15'`，且与 `package.json#version` 同源表述不变。
- ac-test-published-anchor-strict: `release-packaging.test.ts` 中原 `expect(latestPublishedTag).toBe(currentTag)`（约 954 行）改写为等价新语义「已发布锚点严格早于当前版本」（`expect(isTagBefore(latestPublishedTag, currentTag)).toBe(true)` 或等价断言），不得恒真、不得删除；同类 `expect(latestPublished).toBe(current)`（约 1539 行）改为「v0.2.14 段在 `## v0.2.15` 之后」的严格顺序断言。
- ac-test-last-released-notes: 原 `expect(lastReleasedNotesPath).toBe(releaseNotesPath)`（约 958 / 1907 行）改写为 `lastReleasedNotesPath` 指向 `latestPublishedTag` 的 notes（即 `docs/release-notes/v0.2.14.md`）且该文件存在、首行含 `v0.2.14`，不得恒真、不得删除。
- ac-test-constants-pinned: `latestPublishedTag` 仍为 `'v0.2.14'`、`previousPublishedTag` 仍为 `'v0.2.8'`、`publishedTags` 历史字面量（v0.2.0/1/2/4/5/6/7/8/9/11/12 + latestPublishedTag）逐项不变。
- ac-test-v0214-boundary: 三处以 `## v0.2.12` 为 end 边界的「当前版」切片（约 1685 / 1765 / 1776 行）改为以 `## v0.2.14` 段为边界，原本挂在 current 上的 v0.2.14 内容断言（`P1`、`opacity-60`、`structured`、`semantic`、`9→10`、`ancestor`、`共同祖先`、`Upgrade`/`### 升级方式`）改为锚在 `## v0.2.14` 段与 `docs/release-notes/v0.2.14.md` 上，逐条保留不弱化。
- ac-test-history-anchors-kept: v0.2.12 / v0.2.11 / v0.2.9 等显式历史锚点断言全部保留；`## v0.2.15` 位于 `## v0.2.14` 之前，且 CHANGELOG 中不存在 `## v0.2.13` 段。
- ac-test-v0215-neutral-assertions: 新增中立断言——`docs/release-notes/v0.2.15.md` 存在且首行含 `v0.2.15`；`CHANGELOG` 顶部为 `## v0.2.15`；两版 README 第 5 行仍含 `v0.2.14`（且不含 `v0.2.15`）；`release.yml` 与 `docs/release-process.md` 默认 tag 为 `v0.2.15`。
- ac-src-diff-scope: 除 `src/main/release-packaging.test.ts` 外，`src/**` 零 diff。
- ac-readme-untouched: `README.md` 与 `README.zh-CN.md` 相对 `0c4f51ec` 逐字节一致，第 5 行仍指 v0.2.14。
- ac-evidence-history-untouched: `docs/release-evidence/**` 零 diff；`docs/release-notes/` 下除新增 v0.2.15 两份外，历史 notes 零 diff。
- ac-gates-green: 11 门 code_gates 全绿：install / lint / typecheck / build / build:web / test / test-compare-request / cancel-gate / memory-gate / structured-semantics / sync-real-gate。
- ac-no-side-effects: 不创建 tag、不 push 远端 tag、不 dispatch 发布、不改已公开 Release 与资产；交付时 `git status` 干净，改动只落在本 workitem worktree。
- ac-delivery-report: 交付说明给出改动文件清单、`git diff --stat`、每处锚点改写的前后语义对照与「断言未减」证据（逐条列出保留的原断言），以及未纳入项清单。

## 非目标

- 不改任何业务代码、对比/合并算法、目录扫描、快照格式、UI 与样式。
- 不改 README 第 5 行与 `latestPublishedTag`（v0.2.14 仍是「已发布」锚点，状态翻面留给 v0.2.15 真正发布后的收尾提交）。
- 不改 `docs/release-evidence/**`（v0.2.14.md 已归档），不补建 v0.2.15 证据。
- 不删不改任何历史 notes 与 CHANGELOG 历史条目。
- 不新增依赖，不改 `code-gates.json`。
- 不写 `tech.md`（技术方案由 Architect/Coding 自行落地）。
- 不做已发布的 v0.2.13 幽灵版本：延续现状，仍不产生 `## v0.2.13` 或 `docs/release-notes/v0.2.13.md`。
- 不在 notes / CHANGELOG 里写未验证的性能或内存数字、`200,000`、`10 MB`、commit sha、CI run id，也不写「已发布 / 已修复 / 已通过验收」。

## 实现约束

- 版本唯一源是 `package.json#version`；文档与 workflow 中出现的 `v0.2.15` 均由它派生，不新增第二个版本源。
- 版本号语义：`currentTag` 派生为 `v0.2.15`，`latestPublishedTag` 固定 `v0.2.14`，`previousPublishedTag` 固定 `v0.2.8`；任何断言都不得退化成恒真式（如 `expect(x).toBe(true)` 而 x 未参与）或删除。
- 锚点改写以「等价新语义 + 原断言逐条保留」为准，交付说明需逐条写前后语义。
- 发布说明结构照 v0.2.14：H1 / 概述段 / `## 本次变化` / `### 分项` / `## 不做的事` / `## 风险与验证规模` / `## 升级方式`，英文为正文、中文为对照，顶部互链，不写 Full Changelog 行。
- 只在 workitem worktree 内读写；主检出是脏树，不得触碰。
- 提交前跑完 11 门 code_gates，保留命令原始输出作为交付证据。
