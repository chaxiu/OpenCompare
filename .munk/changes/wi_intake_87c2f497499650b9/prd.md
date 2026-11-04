# v0.2.20 版本收敛（发版语义单点，不改产品行为）

## 范围

把 main（a7c369a，= origin/main，last tag v0.2.19，区间 34 个 commit）收敛到可发版的 v0.2.20 版本锚点。Owner 已裁决：文件数限制为「收敛白名单」，不是硬 5 个；白名单内只允许版本字面量对齐与新增发版说明，不改任何语义、文案、行为。

允许改动集合：
1. `package.json#version` → `0.2.20`（仅 version 字段）。
2. 新建 `docs/release-notes/v0.2.20.md` 与 `docs/release-notes/v0.2.20.zh-CN.md`（非空、逐节镜像）。
3. `CHANGELOG.md` 顶部新增 v0.2.20 段（中文，沿用现有「概述 + 改进/修复 + 不做的事 + 升级方式」风格）。
4. `.github/workflows/release.yml` 的 `workflow_dispatch.inputs.tag.default` → `'v0.2.20'`（仅版本字面量）。
5. `docs/release-process.md` 的默认 tag 字面量 `default: 'v0.2.19'` → `'v0.2.20'`（仅版本号字面量，不改流程语义）。
6. 本 run 的映射证据 `.munk/runs/run_intake_87c2f497499650b9/commit-map.md`（34/34）。

## 版本单一来源全仓 grep 命中与逐条判定（`v0.2.19` / `0.2.19`）

`grep -rn "v0\.2\.19\|0\.2\.19"`（排除 `node_modules`、`.git`、`.munk/`）：

| 命中位置 | 内容 | 判定 | 处置 |
| --- | --- | --- | --- |
| `package.json:3` | `"version": "0.2.19"` | 下一版默认值（单一来源） | 改 `0.2.20` |
| `.github/workflows/release.yml:17` | `default: 'v0.2.19'` | 下一版默认值 | 改 `'v0.2.20'` |
| `docs/release-process.md:8` | `default: 'v0.2.19'` | 下一版默认值（`judgeVersionSources` 读取） | 改 `'v0.2.20'` |
| `CHANGELOG.md:5` | `## v0.2.19` | 历史版本段 | 保留；其上新增 `## v0.2.20` |
| `docs/release-notes/v0.2.19.md` 及 `.zh-CN.md` | 历史发布说明 | 历史记录 | 保留，不改 |
| `docs/release-evidence/v0.2.19.md` | 已公开发布证据 | 已公开事实 | 保留，不改 |
| `README.md:5` / `README.zh-CN.md:5` | `最新公开版本：v0.2.19` | 已公开版本指针（`publishedTag` 派生） | **不得改** |
| `src/main/__fixtures__/release-packaging.json:999-1000` | `evidence-v0.2.19` 账本行 | 历史证据夹具（且 `src/**` 禁改） | 保留，不改 |

结论：仅 package.json、release.yml、docs/release-process.md 三处版本字面量需要前进；README 第 5 行只指已发布版本，保持 v0.2.19。

## notes 语义分组（34/34 全覆盖，以实际 diff 为准）

用户可见小节：
- 对比历史（I#8 六项）：历史纯模型 + PlatformPort 持久化通道（`050ab49`）、新建页最近历史（`e6977e2`）、一键重开恢复路径与开关（`050ab49`/`e6977e2`）、坏路径预检提示且不建半棵树（`aa1e566`）、错误行持久化（`aa1e566`）、清单上限 20 与清空（`aa1e566`）。
- 状态栏换行修复：窄窗口换行不裁切图例与计数（`ef1a9f0`）、高度取自行模型（`173e69b`）。
- 三向合并：真实合并会话入口（`23aaade`）、重开保持左右切换与重启覆盖（`b9e3666`）。
- 发布/验证面：`src/core` 覆盖率地板进 release CI 硬门（`352d6f9`）、README 截图在干净 main 重建并重钉 provenance（`cc2f668`/`2099dca`/`064f276`/`7e6e66c`/`cbdad14`/`001ded0`）。

internal（不写进用户可见小节，只在 commit-map 标注）：
- 14 个 `munk delivery:` / `merge:` 合并提交：`dc781cd`、`63976dc`、`7a5ce08`、`3bb77e9`、`539e06c`、`cb691c5`、`e079a5e`、`05cf7b5`、`2be0212`、`329ca1f`、`8f043f9`、`9a56705`、`27d3bce`、`a7c369a`。
- 5 个 `docs(baseline):` 域折叠提交：`cf0e31a`、`af7680e`、`c1dcdf0`、`4ea05a4`、`3924507`。
- 1 个 spike 测试提交：`9f4e5f1`。

合计 14 + 20 = 34，覆盖率 34/34。

## 验收

- ac-pkg-version: `package.json#version` 恰为 `0.2.20`，且该文件除 version 外无其他改动。
- ac-notes-bilingual-exist: `docs/release-notes/v0.2.20.md` 与 `.zh-CN.md` 均存在且去除空白后非空。
- ac-notes-order-links: 两个 notes 第一行标题均含 `v0.2.20`；第三行分别为固定绝对切换链接；每个文件恰好 1 个 markdown 链接；第四行起为正文。
- ac-notes-h2-parity: 两个 notes 均含固定 6 个 H2 且顺序一一对应：What changed / Windows installer and portable zip / macOS signing and notarization / Not in this release / Risk and verification scope / Upgrade（中文镜像）。
- ac-notes-portable-section: 英/中 notes 均含 `Windows portable download` / `Windows 免安装包` 小节，含 `.zip`、`NSIS`、`no installation step` / `无安装步骤`，且恰好 2 句。
- ac-notes-34-mapping: v0.2.19..HEAD 的 34 条 commit 在 notes 有归属，或在 `.munk/runs/run_intake_87c2f497499650b9/commit-map.md` 标注 internal；覆盖率 34/34。
- ac-changelog-top: `CHANGELOG.md` 顶部首个版本段为 `## v0.2.20`，位于 `## v0.2.19` 之上；段内含概述、改进/修复、不做的事、升级方式。
- ac-workflow-default: `.github/workflows/release.yml` 的 workflow_dispatch 默认 tag 为 `'v0.2.20'`。
- ac-process-default: `docs/release-process.md` 的 `default: 'v0.2.20'` 与 `v${pkg.version}` 相等，且该文件无其他改动。
- ac-readme-untouched: `README.md` / `README.zh-CN.md` 第 5 行仍为 v0.2.19，与最新 verified 证据一致。
- ac-scope-whitelist: 收敛 commit 的改动仅落在上述白名单（5 处版本/说明文件 + commit-map），不含 `src/**`、UI/i18n/产品文案、依赖、门清单数值、已公开 Release/资产。
- ac-gates-green: `.munk/code-gates.json` 全量门禁自绿，含 release-gate 的 `tag-mismatch` 判定与 release-packaging 的中英 notes / fail-closed / `<details><summary>简体中文</summary>` 折叠断言。

## 非目标

- 不修 bug、不调 UI、不改对比/合并语义、不新增依赖、不碰门清单数值、不做视觉轮内容。
- 不推 tag、不 dispatch release workflow、不修改任何已公开 Release 与资产、不改 README 第 5 行。
- 不重写历史 notes/CHANGELOG/evidence，不删减区间内 commit 来赶窗口。

## 实现约束

### 技术锚点

- `package.json#version` 是 tag 唯一来源：`v${version}`；CHANGELOG 顶部、notes 标题、workflow 默认 tag、`docs/release-process.md` 默认 tag 必须相等（`judgeVersionSources`）。
- release workflow 从 `docs/release-notes/v${version}.md` + `.zh-CN.md` 组装 body：任一缺失/空白 fail-closed；中文包在 `<details><summary>简体中文</summary>`。
- README 第 5 行由发布后收尾提交维护，本项不得改。

### 门禁兼容约束（不改 src 的前提）

`src/main/release-version-gate.test.ts` 的 `noteFacts` 硬编码了 v0.2.19 关键词，而 `src/**` 禁改。因此 v0.2.20 notes 的 `Not in this release` / `不做的事` 小节必须以事实陈述保留这些未变行为，CHANGELOG 的 `不做的事` 同理：

- 英文 notes 必须包含：`ignore whitespace`、`off by default`、`spaces`、`tabs`、`one comparison result`、`status bar`、`same session`、`scroll position and switches`、`keeps the previous result`、`swap`、`ruler and counts`、`restores`。
- 中文 notes 必须包含：`忽略空白差异`、`默认关闭`、`空格`、`制表符`、`同一份比较结果`、`状态栏`、`不新建会话`、`滚动位置与开关状态`、`保留上一次结果`、`交换`、`指示条与计数`、`复原`。
- CHANGELOG v0.2.20 段必须包含：`忽略空白差异`、`默认关闭`、`重载`、`交换`。

这是对 v0.2.19 未变行为的如实描述，不是改语义。

### 交付证据

- commit-map 路径：`.munk/runs/run_intake_87c2f497499650b9/commit-map.md`，逐行 `commit | subject | 归属（notes 小节 / internal）`。
- 回执需写：收敛 commit sha、两份 notes 路径、commit-map 路径、映射覆盖率 34/34。
