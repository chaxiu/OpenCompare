# 版本门 / 发布元数据测试下沉为 src 纯函数（表驱动 + 去文本断言）

## Scope

把 `src/main/release-version-gate.test.ts`（770 行 / 93 处 `toContain` / 5 处 `readFileSync`）与
`src/main/release-metadata.test.ts`（507 行 / 30 处 `toContain` / 3 处 `readFileSync`）里**写在断言里的判定逻辑**，
抽成 `src/main` 下的纯函数（零 fs / electron / react / DOM 依赖），测试改为表驱动用例只喂结构化数据；
删除对 `release.yml`、`docs/**`、README 原文的文本断言，改为「结构化事实 → 纯函数判定」或按映射表移除。

覆盖的判定（现状散落在文本断言里）：

- 版本号唯一来源：`package.json#version` 是 `v{version}` 的唯一来源，`CHANGELOG` 顶部条目、当前版本 notes 标题、
  README 第 5 行状态行、`release.yml` 的 `workflow_dispatch` 默认 tag、`docs/release-process.md` 的默认值全部与它同源。
- dispatch 默认 tag：工作流默认值与发布流程文档默认值一致且等于当前 tag。
- 两版 notes 存在性：`docs/release-notes/<tag>.md` 与 `<tag>.zh-CN.md` 成对存在，标题含 tag；证据文件存在。
- release notes 组装顺序：notes 内「标题 → 语言切换 → 正文」顺序，以及「CHANGELOG 顶部条目 / notes / evidence」的版本集合顺序。
- 缺一 fail-closed：上述任一缺失、任一字段不匹配都返回 `ok:false` 且带可定位的 issue（path + code），不放行。
- 发布元数据门：`latest*.yml` 的 `files[].url` 命中资产名、Windows 安装包为连字符形态、AppImage `blockMapSize`
  大端/小端 trailer 判定、缺 `latest*.yml`、空资产列表、不可读目录一律 fail-closed。

真实仓库事实只保留**一次**结构化装载（一个 test-support 装载器读取一次，产出结构化 facts），由同一条终检用例
断言 `ok:true` 且 issues 为空——保证不是「把仓库事实断言整车删掉」。

基线：`main=3467844`。本 WI 只改测试与新增纯函数文件，产品行为与版本单点文件零改动。

## Acceptance Criteria

- ac-files-lines: `wc -l` 统计两文件合计 ≤600（基线 1,277）。
- ac-tocontain-budget: 两文件 `grep -c toContain` 合计 ≤8（公司队列口径；基线 123 = 93 + 30）。
- ac-readfilesync-budget: 两文件 `grep -c readFileSync` 合计 ≤2（基线 8 = 5 + 3）。
- ac-pure-gate-modules: 新增/抽取的判定函数位于 `src/main` 的独立 `.ts` 模块，模块内 `readFileSync` / `node:fs` / `electron` / `react` / DOM 引用数为 0，且 `pnpm typecheck`、`pnpm lint` 通过。
- ac-pure-structured-input: 每个判定函数的入参都是类型化的普通对象（版本号、tag、refs、assets、是否存在、标题、默认值等），不接收文件路径、不自行读盘；测试用内联对象或 fixtures 构造输入。
- ac-table-driven-branches: 每个判定函数都至少有一组 `it.each` 表；表中同时含「通过」「缺文件」「字段不匹配」三类行，三类分支各 ≥1 条用例，且判定结果为结构化对象（`ok` + issue 列表），不用字符串包含断言。
- ac-version-source-verdict: 版本唯一来源判定对 `{pkgVersion, changelogTopTag, notesHeadingTag, readmeLine5Tag, workflowDispatchDefault, processDocDefault}` 全同源输入返回 `ok:true`；把 `pkgVersion` 之外的任一项改成其他 tag 返回 `ok:false` 且 issue 定位到该字段。
- ac-notes-fail-closed: 缺 `zh-CN` notes、缺英文 notes、缺 evidence 三种输入分别返回 `ok:false` 且 issue 指向缺失路径；两者齐全时返回 `ok:true`。
- ac-notes-order: 组装顺序输入乱序（标题不在首行 / 语言切换行位置错误 / CHANGELOG 顶部条目不是当前 tag）返回 `ok:false`；正确顺序返回 `ok:true`。
- ac-metadata-verdicts: 元数据判定对完整资产集返回 `ok:true`；url 不命中资产名、Windows 安装包为点号/空格形态、缺 `latest*.yml`、资产列表为空、AppImage blockMapSize 字节序不符分别返回 `ok:false` 并带具体条目。
- ac-injection-red: 注入实测必须把版本判定改成「放行」——故意让纯函数（或它消费的 fixture）放过一个不合规输入（缺中文版 notes / tag 不匹配 / 资产缺失任一），使对应表驱动用例因期望 `ok:false` 实收 `ok:true` 而变红；回执贴原始失败输出（含期望/实际），恢复后同套件转绿，`git status` 无残留改动。
- ac-case-count: 两套件 vitest 报告用例数 ≥57（基线 59，降幅 ≤5%）；`it.each` 的每一行按一条用例计。
- ac-coverage: 改前/改后用同一 coverage 命令与同一 include 集合测量并贴出 before/after；已存在模块（含 `scripts/release-metadata.mjs`）的 lines/branches 覆盖率不得下降，新增纯函数模块 lines ≥95% 且 branches ≥90%。
- ac-mapping-table: 回执给出被删文本断言逐条映射表（旧断言文件:行 + 原文片段 → 替代纯函数用例 / 结构化事实用例 / 移除理由），且没有把断言搬进 `release-doc-fixtures.test-helpers.ts` 等 test-support 文件绕行行数：helper 内 `expect(` 计数保持 0，helper 总行数不增加。
- ac-product-untouched: `git diff --exit-code` 对 `package.json`、`CHANGELOG.md`、`README.md`、`README.zh-CN.md`、`.github/workflows/release.yml`、`docs/release-notes/**`、`docs/release-evidence/**`、`docs/release-process.md`、`docs/release-signing.md`、`scripts/release-metadata.mjs` 无输出；`package.json#version` 仍为 `0.2.16`，README 两版第 5 行仍为 `v0.2.16`。
- ac-gates-green: 本 worktree 依序跑完 `.munk/code-gates.json` 全部 21 个 gate（install / lint / typecheck / build / build-web / test 及各专项）全部退出码 0，回执贴每个 gate 的结果。

## Non-Goals

- 不改任何产品逻辑、工作流、发布脚本、文档与版本号；不「顺手」修 release.yml 或 docs 的措辞。
- 不重构 `scripts/verify-release.mjs` 及其测试（`src/verify-release-gate.test.ts`），不把两层验证合并。
- 不改 `src/main/release-packaging.test.ts`、`release-evidence.test.ts`、`release-artifacts-and-brand.test.ts`。
- 不新增 UI、不接触设计 token / 视觉基线。
- 不新增运行期依赖；coverage 用已有 `@vitest/coverage-v8`。
- 不为 README / 签名文档等**非门禁散文**另造一套文本等价校验；这类断言按映射表标注移除理由即可。

## Implementation Constraints

- 纯函数放 `src/main/`（如 `release-gate.ts` / `release-metadata-gate.ts`，命名由实现定），导出类型化的 `judge*` 函数；不得 import `node:fs`、`electron`、`react`、DOM。
- 真实仓库事实只允许一个 test-support 装载器读取一次（可扩展现有 `release-doc-fixtures.test-helpers.ts` 或新增同类文件），该装载器只做读取/解析/导出结构化 facts，**不得含任何 `expect(`**。
- 元数据门与产品脚本的一致性用一条结构化对照用例：调用 `scripts/release-metadata.mjs` 已导出的纯函数与 `src/main` 判定函数吃同一份 fixture，断言两者结论一致；脚本本身零改动。
- 表驱动统一用 `it.each`，同一规则的三类分支写成同一张表的三行，避免复制粘贴的独立 `it`。
- 计数口径固定：`wc -l <file>`、`grep -c toContain <file>`、`grep -c readFileSync <file>`；覆盖率口径为
  `pnpm exec vitest run --coverage --coverage.reporter=text --coverage.include=<被测模块> src/main/release-version-gate.test.ts src/main/release-metadata.test.ts`
  （before 侧对已存在模块用同一 include；after 侧 include 增加新增纯函数文件），回执写全命令。
- 回执（delivery）必须包含：改前/改后行数、`toContain`、`readFileSync`、用例数、覆盖率、总测试行数（两文件 + helper），
  以及注入实测的原始失败输出与恢复证据。
