# 补合 xlsx 的文档提交并恢复主干测试

## 范围

- 事实：`wi_intake_892f6a7dfaf916c2` 的 delivery 合进 main 的提交是 `3870893`（tree `01f3510`，只覆盖分支提交 `a407b6e`）；分支 `munk/wi_intake_892f6a7dfaf916c2` 上后续两个提交没有进 main：`2c815fd`（给该单 PRD 补 `## 测试豁免`）、`c48f8c0`（把 `docs/screenshots.md` 的 Captured commit 从 `dd3296a` 重钉到 `2c815fd` 并补重采说明）。
- 后果：main 上 `src/main/release-artifacts-and-brand.test.ts` 的 `keeps the renderer unchanged and the two languages visually distinct` 失败（记录 `dd3296a`，`src/renderer` 已随 xlsx 视图变更），`pnpm test` 红；本单上一轮「合入 main + 门绿」实际未达成。
- 要做：在 worktree 里把分支 `munk/wi_intake_892f6a7dfaf916c2` 的 tip（`c48f8c0`，含 `2c815fd`）合进来，或等值重写同样两处内容；截图 provenance 的 pinned commit 必须是合并后的 main 祖先，且 `src/renderer` 与它零 diff。
- 同批在合并后的树上用 capture 脚本真实重采一次四张 README 截图，核对 `docs/screenshots.md` 里每张图的 bytes 与 sha256 行；字节不一致就同批更新行与图片。

## 验收

- ac-main-green: 合入后 main 的 `pnpm test` 全绿，尤其 `readme screenshots and capture provenance > keeps the renderer unchanged and the two languages visually distinct` 通过；全量 `code_gates` 36 门绿且证据与合入 commit 同源（treeSha/headSha 对应最终提交，不引用其它树的 attempt）。
- ac-pin-ancestor: `docs/screenshots.md` 的 Captured commit 是 main 祖先（`git merge-base --is-ancestor <captured> HEAD` 退出码 0），且 `git diff <captured>..HEAD -- ':(glob)src/renderer/**' ':(exclude,glob)src/renderer/**/*.test.ts' ':(exclude,glob)src/renderer/**/*.test.tsx'` 输出为空。
- ac-capture-honest: 四张 PNG 的实际 bytes 与 sha256 与 `docs/screenshots.md` 对应行逐条一致；重采命令与尾部输出写进交付说明，不得写没有真实执行过的重采。
- ac-waiver: main 上 `.munk/changes/wi_intake_892f6a7dfaf916c2/prd.md` 含 `## 测试豁免` 小节（说明 `src/munk-gates.test.ts` 两条矩阵回声用例 thirty-five→thirty-six 改名、断言强度未削弱）。
- ac-scope: `src/core/csv/align.ts`、`src/core/xlsx/limits.ts`、两版 README 正文与链接、Issue 零改动；不推 tag、不 dispatch release、不改已公开 Release 与资产。

## 非目标

- 不改 xlsx 解析/对齐/四态/上限语义，不动 `src/renderer` 业务代码，不改任何测试断言、门禁清单或阈值，不新增门禁。
- 不重采新场景、不改 README 截图张数与中英配对规则、不做 UI 改造。
- 不做发布、不跑 L3、不在本单碰 Issue #1 回帖。

## 实现约束

- 只在 worktree 里改，主检出 `codebases/projects/open-compare` 只读；交付仍由 delivery 走 local_merge 推本地 main。
- 允许改动的文件：`docs/screenshots.md`、`docs/assets/**` 四张 README 截图（仅当重采字节不一致）、`.munk/changes/wi_intake_892f6a7dfaf916c2/prd.md`；其它文件改动须在交付说明里逐条给出为什么必要。
- 不得把 pinned commit 钉成合并后不在 main 上的提交；若选择重写而非合并分支，pinned commit 必须取已存在的 main 祖先（例如 `3870893`）并在该 renderer 上重采。
- capture 环境不可用（构建或窗口失败）时停下来报，不要写未发生的重采、不要用旧图冒充新采。

## 本单执行约束（不 fold）

- 预算 ≤8M token / ≤90 分钟；先落盘改动，再跑全量门；超预算先落盘再报。
- 交付须给：`git diff --stat`；全量 `code_gates` evidence attempt id + cwd + treeSha/headSha；`git diff <captured>..HEAD -- src/renderer` 空输出的命令与结果；四张 PNG 的 sha256 与 `docs/screenshots.md` 行对照；capture 命令与尾部输出；main 有未发布 commit 时逐条写「未发布：<sha> <标题> <原因>」。
- 不推 tag、不 dispatch `release.yml`、不改已公开 Release 与资产。
