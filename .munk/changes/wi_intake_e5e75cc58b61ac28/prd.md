# v0.2.26 版本收敛与双语发布说明

## 范围

- `package.json#version` 0.2.25 → 0.2.26（版本号唯一来源，只在 worktree 改）。
- `CHANGELOG.md` 新增 v0.2.26 段，条目取自 `git log --oneline v0.2.25..HEAD`（当前 12 条），逐条映射到发布说明小节或显式标 internal。
- 新建 `docs/release-notes/v0.2.26.md`（英文全文）与 `docs/release-notes/v0.2.26.zh-CN.md`（中文全文），两文件均非空；正文只写用户可见事实。
- 唯一用户可见改动：`6e59cfa` 首页「最近对比」最多 5 条 + 「全部 N」Dialog 展示 20 条 + 空态引导单句文案（zh/en）。
- 其余 11 条标 internal 并在交付说明逐条列出 sha+标题：`d4ed4f8`（merge）、`9085fe4`（test-debt 天花板）、`931ee55`（截图 provenance 重钉）、`fdfc189`（merge）、`005ab0e`（change-pack）、`dde84ed`（baseline 域记录）、`47971f2`（README 指针到 v0.2.25）、`5dfa7d6`（merge）、`387a1de`（change-pack）、`be16be1`（baseline）、`9d2080d`（门禁信号退出分类）。
- `release.yml` 的 dispatch 默认 tag 改为 `v0.2.26`（与 `package.json#version` 对齐）。
- `AGENTS.md` `## 近期结论` 以新增行方式补 2–3 条：① 外部目录（含 ops 项目）一律用工具 `workdir` 或绝对路径访问，禁在 bash 里 `cd` 进外部目录（会逐条触发 external_directory 审批）；② 天花板不足走 baseline growth 机制（`ceilings` 抬到实测值 + `growth` 条目 from=上一版基线、addedCases=真实新增用例数、reason 点名文件与行为），禁压断言 / 删用例换绿；③ 维护态发版必须人给日期 + 一次人工过首页，缺人工过首页不得宣称可发布。
- 覆盖率基线：先读 `.munk/baseline/coverage.json#measuredAt.commit`，确认 `v0.2.25` 是其祖先；不满足才按 coverage-gate 预检「一次测量多次复用」规则在 worktree 重采样并记录复用键与来源 run id。

## 验收

- ac-version: `node -p "require('./package.json').version"` 输出 `0.2.26`，且仓库仍无 `v0.2.26` tag。
- ac-notes-both: `docs/release-notes/v0.2.26.md` 与 `docs/release-notes/v0.2.26.zh-CN.md` 均存在且非空，中英各含「最近对比最多 5 条 / 全部 N 弹窗 20 条 / 空态单句」对应表述。
- ac-commit-map: 交付说明逐条列出 `v0.2.25..HEAD` 12 条提交，每条标 notes 小节或 internal，无遗漏、无凭记忆。
- ac-release-yml: `release.yml` dispatch 默认 tag 为 `v0.2.26`，且 `release-packaging.test` 通过（两文件路径、缺一 fail-closed、中文折叠标记三断言仍在）。
- ac-agents: `git diff` 显示 `AGENTS.md` 仅新增行，`## 近期结论` 标题与既有 5 条逐字未变，新增条目 ≥2。
- ac-coverage: `coverage.json#measuredAt.commit` 以 `v0.2.25` 为祖先；若本轮重采样，交付说明写明复用键与来源 run id。
- ac-gates: `.munk/code-gates.json` 全量门绿；`src/**` 零 diff（纯发布工程改动）。
- ac-evidence: delivery 说明写明将进 v0.2.26 的用户可见内容与「未发布」状态，可直接用于发布 brief。

## 非目标

- 不改任何 `src/**` 功能代码，不动四态计数 / 忽略开关 / 对比语义 / 发布通道。
- 不推 tag、不 dispatch `release.yml`、不建 / 改 / 删已公开 Release 与资产。
- 不改 `README.md` / `README.zh-CN.md` 第 5 行（继续指向已发布 v0.2.25，指针随发版后单独收口）。
- 不改 `docs/screenshots.md`（本轮无渲染层改动）。
- 不为凑发版临时补测覆盖率、不放宽任何门禁阈值。

## 实现约束

- 语义单点文件（`package.json#version`、`CHANGELOG`、`release.yml` 默认 tag、当前版 notes）只在本 worktree 改，过门后经 delivery 合入；不得在 main 工作区手改。
- `docs/release-notes/v<version>.md` 与 `v<version>.zh-CN.md` 缺一或为空即 fail-closed，发布正文由 `release.yml` 组装英文全文 + 中文折叠块。
- `AGENTS.md` 只许追加行，禁止重排或重写既有条目与 `## 近期结论` 标题；文件仍 ≤100 行。
- 门禁默认 `.munk/code-gates.json`，不新增门文件；新增门优先扩展现有文件。

## 本单执行约束（不 fold）

- 预算 ≤8M tokens / ≤90 min 墙钟；到 5M 或 60 min 先 WIP commit 并回执进度。
- 授权路径：本 worktree 内上述列名文件（`package.json`、`CHANGELOG.md`、`docs/release-notes/v0.2.26*.md`、`release.yml`、`AGENTS.md`、必要时 `.munk/baseline/coverage.json`）；禁碰主检出 `codebases/projects/open-compare`。
- 停止线：门禁红且非环境类失败即停手回执，禁自行改门或改断言；禁推 tag、禁 dispatch 发版流水线。
- 交付证据：门禁证据与上述 ac 逐条对应，写进 delivery 说明；带 sha 与命令输出摘要，不复述大段日志。
