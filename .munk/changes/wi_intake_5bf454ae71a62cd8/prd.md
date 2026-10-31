# README 双语镜像：目录同步两条设计口径写进 Features / 核心能力

## Scope

纯文档改动，只落两处文件、各一处条目：

- `README.md` 的 `## Features` 第 1 条 `- **Directory comparison and sync**: …`，在该条**同一行**句尾补两句设计口径：
  1. 增量同步只做新增与覆盖、不删除；镜像同步额外列出 target-only 待删除项，删除项默认未勾选，只有用户显式勾选才执行。
  2. 应用外对目录的改动在下次对比时读取（按需对比），没有后台文件监听。
- `README.zh-CN.md` 的 `## 核心能力` 第 1 条 `- **目录对比与同步**：…`，逐句镜像同两条口径。

Quickstart / 快速上手 **不改**：两条口径已在 Features 条目内完整表达，不再重复。Known issues / 已知问题段**整体不动**（该段已含同义的两条「设计口径」说明，属既有门面，本次不增不删不改写）。

## Acceptance Criteria

- ac-en-sync-postures: `README.md` 的 `## Features` 首条内出现「增量同步只新增/覆盖、不删除」「镜像额外列出 target-only 待删除项，默认未勾选、显式勾选才执行」「应用外改动在下次对比时读取、无后台文件监听」三项断言（示例短语：`never deletes` / `unchecked by default` / `no background file watcher`）。
- ac-zh-sync-postures: `README.zh-CN.md` 的 `## 核心能力` 首条含「增量同步只做新增与覆盖、不删除」「镜像同步额外列出待删除项，默认不勾选、显式勾选后才执行」「应用外对目录的改动在下次对比时读取，没有后台文件监听」，与 ac-en-sync-postures 的三项逐句语义对应。
- ac-five-feature-items: 两版 Features / 核心能力段内以 `- ` 开头的条目仍恰好 5 条（口径扩展写在既有行内，不新增 bullet、不合并条目）。
- ac-nine-h2-sections: 两版 README 的 `## ` 标题仍恰好 9 个且顺序与现状逐一对应，无新增 / 删除 / 改标题。
- ac-quickstart-untouched: 两版 Quickstart / 快速上手段落与改动前逐字节相同（零 diff）。
- ac-known-issues-untouched: 两版 Known issues / 已知问题段落与改动前逐字节相同；`None known right now.` 与 `当前没有已知未修复问题。` 原句仍在，`release-packaging.test.ts` 的 known issues 断言不改不放松。
- ac-line5-untouched: 两版 README 第 5 行（最新公开版本 / Latest public release）逐字节不变；全文除该行外不出现 `\bv\d+\.\d+\.\d+\b`。
- ac-word-budget: `README.md` 按 `release-packaging.test.ts` 的 `wordCount` 规则统计正文词数 ≤ 700。
- ac-wording-clean: 两版 README 新增句不含「已知缺陷 / 未修复 / known bug / defect / roadmap / TODO / TBD / FIXME」，不含 `MiB` / `GiB` / `GB` 与既有禁入数字；英文版除语言切换行外仍无汉字（`\p{Script=Han}` 命中数 0）。
- ac-symlink-policy-untouched: 两版 README 的 `docs/symlink-no-follow.md` 链接与「不跟随符号链接」口径表述零 diff，`docs/symlink-no-follow.md` 本身零 diff。
- ac-release-files-untouched: `package.json`（含 `version` 与依赖）、`pnpm-lock.yaml`、`CHANGELOG.md`、`docs/release-notes/**`、`docs/release-evidence/**`、`docs/release-process.md` 相对 main 零 diff；`src/**` 零 diff。
- ac-gates-green: `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm build:web`、`pnpm test`（含 `src/main/release-packaging.test.ts` 的 9 节结构与 known issues 断言）全部通过。
- ac-delivery-note: 交付说明贴出两版 README 的实际改动行（`git diff` 中的 `README.md` 与 `README.zh-CN.md` 命中行原文），并列出上述门禁的执行结果。

## Non-Goals

- 不改 Quickstart / 快速上手（两条口径不在该节重复）。
- 不改 Known issues / 已知问题段、不改其门禁断言。
- 不改 README 第 5 行版本/发布状态，不动版本号、`CHANGELOG.md`、`docs/release-notes/**`、`docs/release-evidence/**`、`docs/release-process.md`。
- 不改任何 `src/**` 业务代码，不改 UI 文案与 i18n 词条，不改同步行为本身。
- 不新增依赖、不动包管理文件。
- 不动「不跟随符号链接」口径与 `docs/symlink-no-follow.md`。
- 不新增 H2、不重排 9 节、不换截图、不碰徽章。

## Implementation Constraints

- 只允许改 `README.md` 与 `README.zh-CN.md`；其余路径必须零 diff（`code_gates` 与交付说明都要能自证）。
- 口径扩展只能追加在既有条目**同一行**内：`release-packaging.test.ts` 以 `- ` 前缀行数断言恰好 5 条用户可见能力，换行拆条会直接红。
- 措辞只陈述行为，不出现「已知缺陷 / 未修复 / known bug」等定性词；不写版本号、不写日期、不写内存数字。
- 中文用「目标侧独有项」等与 Known issues 段既有措辞一致的词，保证两版逐句对应。
- 英文句子控制在长句可读范围内，保证 `wordCount` ≤ 700 仍有明显余量。
