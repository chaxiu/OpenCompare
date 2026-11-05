# 收敛 v0.2.23 版本锚点并修补 syntax-perf 规模用例 CI 超时

## 范围

本 WorkItem 只在本 worktree 内完成两件事，并作为一个交付批次提交：

1. 把主干当前用户可见内容收敛到 **v0.2.23** 单一版本锚点：
   - `package.json#version` 改为 `0.2.23`（唯一版本来源）。
   - `docs/release-notes/` 以现有 v0.2.22 中英两份为底，改写为 `v0.2.23.md` / `v0.2.23.zh-CN.md`，两份均非空、英文全文 + 中文全文，覆盖本版四项用户可见改动：未知扩展名按内容判定、双语 README 截图、语法高亮（V1 扩展名映射 + token×diff 叠合）、大文件回落；删除 `v0.2.22.md` / `v0.2.22.zh-CN.md`，不新增 0.2.22 发布记录。
   - `CHANGELOG.md` 顶部的 `## v0.2.22` 段改写为 `## v0.2.23`，与两份 notes 同源对齐（同样覆盖上述四项），删除 0.2.22 版本记录；`## v0.2.21` 及更早段落不动。
   - `.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 改为 `v0.2.23`；「两份 notes 任一缺失/为空即 fail-closed + 中文 `<details>` 折叠 + Full Changelog」逻辑保持原样。
   - `docs/release-process.md` 中同步写死的默认 tag 文案改为 `v0.2.23`（该文档声明默认值与 `package.json#version` 同源，必须与 release.yml 一致）。
   - `README.md` / `README.zh-CN.md` 第 5 行「Latest public release / 最新公开版本」保持指向已发布的 **v0.2.21**，不随版本 bump 变动；两套 H2 章节（各 9 节）保持一一对应。当前 README 没有版本表 / 发布说明索引，因此该部分为核对项，不得凭空新增表格。
2. 修补 `src/syntax-perf-gate.test.tsx` 两个 262,144 字符规模用例的 CI 超时风险：
   - 「threshold-sized `.ts` 着色渲染」与「T+1 与纯文本路径对照渲染」两个用例补显式 per-test 超时 `30_000`（沿用仓库既有 `}, 30_000)` 写法）。
   - 保留 262,144 / 262,145 规模与全部断言，不改 vitest 全局 `testTimeout`、不缩规模、不以本机速度为证据。

## 验收

- ac-version-single-source: `package.json#version` 等于 `0.2.23`，且仓库内不存在其他仍把当前版本写死为 `0.2.22` 的生产/发布锚点。
- ac-notes-bilingual-nonempty: `docs/release-notes/v0.2.23.md` 与 `docs/release-notes/v0.2.23.zh-CN.md` 均存在且非空；两份都覆盖「未知扩展名按内容判定 / 双语 README 截图 / 语法高亮 / 大文件回落」四项，且英文文件顶部切换链接指向 `v0.2.23` 中文文件、中文文件反向指向 `v0.2.23` 英文文件。
- ac-notes-old-removed: `docs/release-notes/v0.2.22.md` 与 `docs/release-notes/v0.2.22.zh-CN.md` 均已删除。
- ac-changelog-aligned: `CHANGELOG.md` 首个版本小节标题为 `## v0.2.23`，不存在 `## v0.2.22` 标题；该节四项用户可见改动与两份 notes 同源一致，且 `## v0.2.21` 段落保持原样。
- ac-release-default-tag: `.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` 等于 `v0.2.23`；两份 notes 缺失/为空即失败的 fail-closed 分支、中文 `<details><summary>简体中文</summary>` 折叠和 `**Full Changelog**` 行仍然存在且未被改写。
- ac-release-packaging-test: `pnpm test src/main/release-packaging.test.ts` 通过；该套件由 `package.json#version` 派生的 `currentTag` 为 `v0.2.23`，测试/夹具中不存在残留的写死 `v0.2.22` tag 或 notes 文件名断言。
- ac-release-process-sync: `docs/release-process.md` 中写死的默认 tag 文案为 `v0.2.23`，与 `release.yml` 的默认值一致。
- ac-readme-line5-published: `README.md` 与 `README.zh-CN.md` 第 5 行仍只引用已发布的 `v0.2.21`，不出现 `v0.2.23`。
- ac-readme-h2-mirror: `README.md` 与 `README.zh-CN.md` 的 H2 标题数量同为 9 且按顺序一一对应（下载与安装 / 核心能力 / 快速上手 / 环境要求与开发 / 项目结构 / 已知问题 / 证据与文档 / Open Rebuilds 001 / 许可）。
- ac-syntax-perf-explicit-timeout: `src/syntax-perf-gate.test.tsx` 中两个 262,144 规模用例各自以 `}, 30_000)` 结束；`THRESHOLD` 仍为 `262_144`，两个用例的断言（含 `toBeNull` / `syntaxSpans === 0` / 渲染签名相等）与规模未删改。
- ac-gates-green: 默认 `.munk/code-gates.json` 全部 gate 通过（含 `syntax-perf`），交付报告中的门禁结论逐条取自 evidence 的 `latestAttemptId`，不得以本机手工快跑替代。

## 非目标

- 不推 tag、不 `workflow_dispatch`、不改已公开 Release 与资产、不改发布通道或签名口径。
- 不拆 0.2.22 / 0.2.23 两次发布，不保留 0.2.22 兜底记录，不留死版本号。
- 不改比较 / 合并语义、IPC、导出与快照格式、目录扫描口径。
- 不改语法高亮、未知扩展名判定、双语截图等已合入功能的实现或行为，只做版本文档与测试超时修补。
- 不新增版本表、发布说明索引或任何 README 新章节；不修改 `docs/visual/v1/baseline-facts.json` 等历史取证快照。
- 不放宽或缩减 `syntax-perf` 的规模与断言，不改 vitest 全局 `testTimeout`。
- 不在 `main` 主检或其他 worktree 动手；`docs/release-evidence-ledger.json` 与 `docs/release-evidence/*` 不因本次预发布而新增记录。

## 实现约束

（以下为已确认的文件锚点与做法，不是正式技术方案；`tech.md` 由 Architect 负责，本项不开启 Architect。）

- `package.json`：`"version": "0.2.22"` → `"0.2.23"`。
- `docs/release-notes/v0.2.22.md` / `v0.2.22.zh-CN.md`：以现有内容为底改写并改名到 `v0.2.23` 两份；保留「English | 简体中文」/「English | 简体中文」首行切换链接结构，仅把 tag 与文件名换成 `v0.2.23`；新增「语法高亮」与「大文件回落」小节；Windows 免安装包文件名由 `OpenCompare-0.2.22-win-x64.zip` 改为 `OpenCompare-0.2.23-win-x64.zip`；升级来源仍写 v0.2.21（0.2.22 从未公开）。
- 语法高亮事实（写 notes 用，勿改实现）：`src/core/syntax/language.ts` 的显式扩展名映射覆盖 ts/tsx/js/jsx/mjs/cjs、py、json/jsonc、yml/yaml、md、css、html/htm/xml、sh/bash；`src/core/syntax/view.ts` 的 `resolveSyntaxView` 是双栏唯一入口，返回 `null` 时按纯文本渲染；`src/core/syntax/overlay.ts` 负责 token 与 diff 段叠合，语法前景色与 diff 语义背景/下划线共存。
- 大文件回落事实：`SYNTAX_MAX_HIGHLIGHT_CHARS = 262_144`（按 CRLF→LF 折叠后的字符数），`length <= threshold` 着色、`length > threshold` 在进入缓存/分词前回落纯文本；两份 notes 只描述行为边界，不写性能或内存数字。
- `CHANGELOG.md`：仅重写顶部 `## v0.2.22` 段为 `## v0.2.23` 并补语法高亮/大文件回落条目；「修复」可如实记录两个规模用例补显式 `30_000` 超时（属验证稳定性，不包装成用户功能）；`## v0.2.21` 及以下不改。
- `.github/workflows/release.yml` 第 17 行 `default: 'v0.2.22'` → `default: 'v0.2.23'`；第 229–276 行的 notes fail-closed / `<details>` / Full Changelog 组装逻辑零改动。
- `docs/release-process.md` 第 8 行 `default: 'v0.2.22'` 文案 → `default: 'v0.2.23'`。
- `src/main/release-packaging.test.ts` 的 `currentTag` 来自 `src/main/release-doc-fixtures.test-helpers.ts` 的 `v${pkg.version}`，当前无写死 `v0.2.22`；改 `package.json#version` 后直接验证，若 grep 出现残留写死 tag/文件名再同批更新。`docs/release-evidence-ledger.json` 与 `src/main/__fixtures__/release-packaging.json` 不含 0.2.22 当前版本引用，不动。
- `README.md` / `README.zh-CN.md`：第 5 行与其余正文不动；Coding 只做第 5 行 v0.2.21 断言与两套 H2 对照核对。
- `src/syntax-perf-gate.test.tsx`：两个目标用例分别位于 `describe('large-file threshold rendering')` 下的 `it('highlights a threshold-sized .ts side', ...)`（约第 84 行）与 `it('renders one character over the threshold exactly like the .txt plain path', ...)`（约第 91 行）；只在两个回调结束处补 `}, 30_000)`，与仓库既有 `DiffRuler.scale.test.tsx` / `historySafety.dom.test.tsx` 写法一致；其余用例与文件内常量断言不动。
- 门禁执行以 `.munk/code-gates.json` 默认集合为准，逐条结论引用 evidence `latestAttemptId`；不得以「本机跑得快」或缩小规模替代。
- 本项为显式规格快速通道：不开启 PM / Design / Architect / Change Pack Review。
