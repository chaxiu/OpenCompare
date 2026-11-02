# 修复 v0.2.16 双语 Release notes 语言切换链接 404，并为 Release body 补 fail-closed 链接门禁

## 范围

已公开的 v0.2.15 Release 正文顶部 `English | [简体中文](./v0.2.15.zh-CN.md)` 被 GitHub 解析成
`https://github.com/chaxiu/OpenCompare/blob/v0.2.15/v0.2.15.zh-CN.md` → 404；中文段首行
`[English](./v0.2.15.md)` 同样 404。根因是 release notes 源文件第 3 行的**跨文件相对链接**：
相对路径在仓库文件视图里有效，被拼进 Release 正文后以 tag 页面为 base 解析，指到仓库根而非
`docs/release-notes/`。`release.yml` 的组装与「双语 + 折叠段」校验本身正确，只是从不校验链接可达性。

本工作项在 v0.2.16 发版前收口，共三处改动：

1. **当前版 notes 第 3 行改为 tag 固定绝对 URL**（`docs/release-notes/v0.2.16.md`、
   `docs/release-notes/v0.2.16.zh-CN.md` 各一行），除该链接外不动正文与版本号。
2. **`release.yml` 发布后 body 校验补 fail-closed 链接断言**：从 `gh release view <tag> --json body`
   取真实正文，抽出全部 markdown 链接，出现相对路径即 job fail；并要求正文含两条指向本 tag 的
   绝对语言切换 URL，缺一 fail。只加校验，不动双语组装逻辑。
3. **`src/main/release-packaging.test.ts` 同批钉住回归**：按 `package.json#version` 派生 tag，
   断言两份当前版 notes 第 3 行是 tag 固定的绝对 URL、且 `release.yml` 含上述链接断言（含
   缺一 fail-closed 分支），并用「模拟 Release 组装 body」实跑该断言脚本证明其通过。

交付证据：模拟组装 body 的抽链接结果（逐条列出、相对链接 0 条、两条绝对链接形态正确）、断言
代码路径，以及发版后 `gh release view v0.2.16 --json body` 的人工复核命令与判据。

## 验收

- ac-notes-en-switch-absolute: 取 `version = package.json#version`、`tag = v<version>`；`docs/release-notes/<tag>.md` 第 3 行恰为 `English | [简体中文](https://github.com/chaxiu/OpenCompare/blob/<tag>/docs/release-notes/<tag>.zh-CN.md)`，且该行不含 `](./` 也不含 `](<tag>`。
- ac-notes-zh-switch-absolute: `docs/release-notes/<tag>.zh-CN.md` 第 3 行恰为 `[English](https://github.com/chaxiu/OpenCompare/blob/<tag>/docs/release-notes/<tag>.md) | 简体中文`，且该行不含 `](./` 也不含 `](<tag>`。
- ac-notes-only-line3-touched: 相对改动前，两份当前版 notes 各自唯一变更的行就是第 3 行（`git diff --unified=0` 每个文件仅一个 hunk、仅 `-`/`+` 各一行且行号 3），标题版本号与其余正文零改动。
- ac-workflow-extract-links: `release.yml` finalize 中新增一个只读步骤，其 `run` 含 `gh release view "${RELEASE_TAG}"` 与 `--json body`，从正文中抽出所有 markdown 链接目标并逐条打印。
- ac-workflow-relative-fail: 该步骤在链接目标以 `./`、`../` 开头或形如 `v<MAJOR.MINOR.PATCH>`（版本号部分匹配 `^v[0-9]+\.[0-9]+\.[0-9]+`）时以非零退出并输出 `::error::`；用仅在语言切换行改成 `](./v<version>.zh-CN.md)` 的 body 实跑该步骤时退出码非零且输出含相对链接报错。
- ac-workflow-absolute-required: 同一脚本要求正文同时含 `https://github.com/chaxiu/OpenCompare/blob/<tag>/docs/release-notes/<tag>.md` 与 `.../<tag>.zh-CN.md` 两条绝对 URL；缺任一条（含两条都缺）时非零退出并输出 `::error::`，两条齐备时退出 0 并打印通过行。
- ac-workflow-read-only: 新增步骤只读：`run` 中不出现 `gh release upload|edit|create|delete`，也不出现 `--method POST|PATCH|PUT|DELETE`；且新增步骤位于 `Make the tag's release public` 之后（发版后读真实 body）。
- ac-simulated-body-passes: 测试按 `release.yml` 组装顺序（英文 notes → `---` → `<details><summary>简体中文</summary>` → 中文 notes → `</details>` → `**Full Changelog**` 行）用仓库内两份当前版 notes 拼出模拟 body，抽出的链接恰为 2 条、均为上述 tag 固定绝对 URL、相对链接 0 条，且实跑新增 gate 脚本（临时目录 + 桩 `gh`，无网络）退出 0。
- ac-test-derived-not-pinned: 上述测试断言全部由 `package.json#version` 派生（沿用既有 `currentTag`），新增测试块内不出现硬编码的 `v0.2.15`/`v0.2.16` 字面量，也不读取仓库根 `.git` 或真实 Release。
- ac-gates-green: 在 worktree 内按 `.munk/code-gates.json` 实读的 16 个门全量通过（含 `test`、`lint`、`typecheck`、`build`、`build-web` 与 11 个既有专项门），不放宽任何门禁。

## 非目标

- 不改 v0.2.15 的 tag、Release 正文、资产，也不改仓内 `docs/release-notes/v0.2.15*.md`。
- 不 bump 版本、不改 `CHANGELOG.md` 语义、不改发布资产口径与 `electron-builder.yml`。
- 不改 `release.yml` 的双语组装逻辑、折叠段结构与既有断言口径，只新增链接校验步骤。
- 不 push tag、不 dispatch workflow、不创建/编辑 Release，不跑 L3，不改产品 UI / 同步 / 对比代码。
- 不为凑绿放宽或跳过任何门禁；过不了门就如实停手并报 owner。

## 实现约束

- 所有改动只在 worktree 内进行；主检出目录有已暂存回退，不手改、不 commit 它；最终经 delivery 合入 main。
- 时间窗：2026-11-02 22:30 前必须收口（当晚 23:00 发版）。
- `release.yml` 由 tag commit 取用，因此链接断言步骤必须与 notes 修正在**同一个进入 v0.2.16 tag 的提交**上；发版前不得只合其中一半。
- 新增步骤位于 `finalize` job，该 job 无 checkout：脚本只允许 bash + 内联 `node -e`（不 `require('yaml')`、不引用仓库模块）。仓库级链接断言放进 `src/main/release-packaging.test.ts`（`test` 门已覆盖），不新增门禁条目。
- 链接抽取必须与断言共用一份实现：测试直接抽取该 workflow 步骤的 `run` 原文在临时目录实跑（沿用既有的桩 `gh` + `FAKE_RELEASE_BODY` 模式），禁止测试里另写一份判定逻辑。
- 绝对 URL 的主机与仓库路径固定为 `https://github.com/chaxiu/OpenCompare`（与 `package.json#homepage` 一致），tag 段用 `v<version>` 派生。
- 发版后人工复核判据（写入交付说明）：`gh release view v0.2.16 --json body --jq '.body'` 中语言切换链接为两条 `…/blob/v0.2.16/docs/release-notes/…` 绝对 URL，正文无 `](./`，且 `curl -sI` 两条 URL 均返回 200/302 而非 404。
