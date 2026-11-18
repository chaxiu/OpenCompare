# 收敛 0.2.25 版本号与双语发布说明

## 范围

- 按 `v0.2.24..main` 实际提交清单逐条映射，把仓库收敛到可发版状态（release 任务当前判「缺收敛 commit」而空转）。
- 必改语义单点：`package.json#version` → `0.2.25`；新增 `docs/release-notes/v0.2.25.md`（英文全文）与 `docs/release-notes/v0.2.25.zh-CN.md`（中文全文），两文件都必须非空；`CHANGELOG` 顶部新增 0.2.25 节；`release.yml` dispatch 默认 tag → `v0.2.25`，并同批改 `release-packaging.test` 的期望与 `.munk/baseline/domains/release-version-anchor` 相关基线，使门自绿。
- 清单必须用脚本生成（`git log --oneline v0.2.24..HEAD`，35 个提交）并逐条映射到 notes 小节或显式标 internal，禁止凭记忆、禁止删条目凑窗口。其中用户可见项至少包含：`865b0bc` xlsx 取值层 + vendored SheetJS 0.20.3、`56d1ead` xlsx 解析上限与 zip bomb 拒绝、`a67d9f9` 工作台双簿四态（合并区锚点、隐藏行列开关、1900/1904 日期、多 sheet 逐表计数、超限拒绝）、`3b4391b` 修复沙箱渲染层打不开 xlsx（去 Buffer/process 全局）、`1f16d53` 修复二次启动带文件参数把应用目录当左路径；其余 `.munk` 基线 / change-pack / 证据类标 internal。
- 中文说明必须真实翻译正文（不是占位），Release 正文由 release.yml 组装英文 + 中文折叠块，缺一或为空即 fail-closed。

## 验收

- ac-version: `package.json#version` = `0.2.25`，且大于 last tag `v0.2.24`；`release.yml` dispatch 默认 tag = `v0.2.25`。
- ac-notes-bilingual: `docs/release-notes/v0.2.25.md` 与 `v0.2.25.zh-CN.md` 均存在、非空、小节对齐，xlsx 三条能力 + 两条修复都有条目，internal 提交不进入用户可见小节。
- ac-changelog: `CHANGELOG` 顶部 0.2.25 节与 notes 一致，历史节不改。
- ac-gates: 全量 `code_gates` 自绿（含 `release-packaging.test` 对双语文件路径、缺一 fail-closed、中文折叠标记的断言），基线按需同批刷新并说明。
- ac-no-publish: 不推 tag、不 dispatch release、不改已公开 Release 与资产；README 第 5 行保持指向已发布版本，不随 bump 变动。

## 非目标

- 不改任何产品代码与验收口径；不修 L3 遗留的两个小口径（左右独有 sheet 是否可点开、`node:zlib` externalize 告警），另项处理。
- 不动 `docs/release-evidence/**` 历史记录；不写 README 截图与双语正文改版。

## 实现约束

- 版本号唯一来源 `package.json#version`；notes 与 CHANGELOG 不得出现未发生的功能描述，不得把上一个已发布版本的内容重复计入。
- 只改语义单点文件与该批基线；不顺手重构。
- main 有未发布 commit 时按 AGENTS 逐条写「未发布：`<sha>` `<标题>` `<原因>`」。

## 本单执行约束（不 fold）

- 预算 ≤60 分钟；只动版本 / notes / CHANGELOG / release.yml / release-packaging.test / 相关基线。
- 不推 tag、不 dispatch release、不改已公开 Release。
- 证据：门 attempt 取自 code_gates evidence 的 `latestAttemptId`；附 `git log v0.2.24..HEAD` 清单与 notes 逐条映射表（可在 summary 里给映射结论）。
