# 新增「风险与验证规模」小节

## 范围

编辑两个文件：

- `docs/release-notes/v0.2.9.md`：在 `## 本次变化` 下最后一个 `###` 小节之后、`## 升级方式` 之前，插入一个新的二级小节 `## 风险与验证规模`，如实披露 v0.2.9 已实测的验证规模与对外口径边界。
- `src/main/release-packaging.test.ts`：只做最小放宽——把第 1528 行 `expect(releaseNotes).not.toMatch(/\b\d+(?:[.,]\d+)?\s*(?:GiB|MiB|GB)\b/)` 改为白名单断言，发布说明中 `GiB` / `MiB` / `GB` 数字集合按出现顺序恰为 `['1,325 MiB', '764.9 MiB']`；`MB` 集合仍保持 `['10 MB']`；注释写明这是 v0.2.9 已实测内存值的白名单、其余仍 fail-closed。不动其它测试。

- 小节正文必须写出实测事实：358,249 条目的真实对照对（两侧 358,155 / 358,208）、建会话 ready 6,907 ms、导出 289 ms、产物 9,999,926 B / 数据行 68,865、截断原文「Showing 68865 of 358249 (truncated)」且 M = 358,249 自洽、app 峰值 1,325 MiB、renderer 峰值 764.9 MiB、进度期间取消命中 38 ms 且零残留、四态 35 / 80 / 41 / 326,099 与界面逐项相等，并给出证据路径 `projects/ops_df43e423451170fd/.munk/runs/trun_100be579fd6a9610/evidence/stages.md` 与 commit `a1e91cb3`。
- 小节正文必须如实写明：真实原生 NSSavePanel 导出落盘一次 + 取消一次仍待 computer 场；该结论落入 `qa-checklist.md` 之前不得对外宣称已完成全链路验证。
- 不得出现「验证规模 234k」「358k 待验」「30 万可放心用」；内存护栏写成「未触既有内存护栏」，不写护栏的具体 MB / MiB 数字。
- 只做「风险与验证规模」的陈述，不改写 `## 本次变化` 各小节与 `## 升级方式` 的事实与措辞，不新增营销承诺。
- 单条 commit 交付，commit message 说明改动位置（「本次变化」与「升级方式」之间新增「风险与验证规模」）。

## 验收

- ac-section-present: `docs/release-notes/v0.2.9.md` 中存在恰好一个以 `## 风险与验证规模` 开头的二级标题行，且该小节正文非空（去空行后行数 ≥ 2）。
- ac-section-position: 文件中 `## 风险与验证规模` 的出现偏移严格大于 `## 本次变化` 之后最后一个 `### ` 标题的偏移，且严格小于 `## 升级方式` 的偏移；该文件二级标题顺序为 `## 本次变化` → `## 风险与验证规模` → `## 升级方式`，无其它新增二级标题。
- ac-literal-scale: 该小节正文含实测字面口径 `358,249`、`358,155 / 358,208`、`6,907 ms`、`289 ms`、`9,999,926 B`、`68,865`、`Showing 68865 of 358249 (truncated)`、`M = 358,249`、`1,325 MiB`、`764.9 MiB`、`38 ms`、`35 / 80 / 41 / 326,099`，以及证据路径 `projects/ops_df43e423451170fd/.munk/runs/trun_100be579fd6a9610/evidence/stages.md` 与 commit `a1e91cb3`（不得改写数字或拆分成「23.4 万」「358000」等变体）。
- ac-no-public-claim: 该小节含仍未闭环陈述：真实原生 NSSavePanel 导出落盘一次与取消一次仍待 computer 场，并在结论落入 `qa-checklist.md` 之前不得对外宣称已完成全链路验证；文件内不得出现「30 万可放心用」等肯定式兜底宣称，也不得出现「验证规模 234k」/「358k 待验」旧口径。
- ac-untouched-sections: 该文件 H1 行、`## 本次变化` 下全部既有 `###` 小节正文、`## 升级方式` 及其后全部正文与改动前（`git show a1e91cb:docs/release-notes/v0.2.9.md`）逐字相同；该文件 diff 只包含新增的该 H2 小节及其前后空行。
- ac-no-banned-tokens: 该文件不含 `待验证` / `预计通过` / `应该通过` / `TODO` / `TBD` / `FIXME`，不含 64 位十六进制串，不含「验证规模 234k」/「358k 待验」/「30 万可放心用」；`GiB` / `MiB` / `GB` 数字集合按出现顺序恰为 `['1,325 MiB', '764.9 MiB']`（不得出现 2,560 MiB 等护栏数字），`MB` 数字集合仍恰为 `['10 MB']`；不含任何 `releases/tag/` 链接。
- ac-scope-two-files: `git diff --name-only`（除 `.munk/changes/**` 外）恰为 `docs/release-notes/v0.2.9.md` 与 `src/main/release-packaging.test.ts`；`package.json`、`CHANGELOG.md`、`README.md`、`README.zh-CN.md`、`docs/release-signing.md`、`docs/release-process.md`、`docs/release-evidence/**`、`src/**`（除 `src/main/release-packaging.test.ts` 外）、`.github/workflows/**` 零 diff。
- ac-no-release-side-effects: `package.json#version` 仍为 `0.2.9`；`git tag --list` 与改动前一致（未新建 / 移动 tag）；未执行 push、publish、`gh release` 写操作或 workflow dispatch。
- ac-gates-green: Host `code_gates` 全部 gate 退出码 0（默认 `install` / `lint` / `typecheck` / `build` / `build:web` / `test` 六项，以及 `code-gates.json` 其余 gate）；`pnpm test` 中 `src/main/release-packaging.test.ts` 除上述单条白名单断言按裁决放宽外，其余发布说明断言未做任何改动即通过。

## 非目标

- 不改 `CHANGELOG.md` 的 v0.2.9 段，不在 CHANGELOG 里加同名小节。
- 不改 `README.md` / `README.zh-CN.md` 的发布状态行与版本表。
- 不改 `docs/release-signing.md`、`docs/release-process.md`、`docs/release-evidence/**`。
- 不改 `package.json#version`（仍为 0.2.9）；除 `src/main/release-packaging.test.ts` 中上述单条白名单断言外不改任何其它测试；不改 `.munk/code-gates.json`。
- 不新建 / 追加 `docs/release-notes/v0.2.10.md` 等其它发布说明，不改任何历史发布说明。
- 不建 tag、不 push、不 publish、不 dispatch workflow、不改已公开 Release 与资产、不构建或上传安装包。
- 不补充任何超出裁决给定实测数据的数字、比例、时间线或结论（例如「已覆盖全场景」「性能已达标」），不新增「全链路已验证」类正面口径。
- 不重写 `## 本次变化` 与 `## 升级方式`，不做排版重构、不调整其它小节顺序、不改小节标题。

## 实现约束

- 禁用词陷阱：`待验证` 是现有测试的负向断言字面量，本文件**不得**出现；旧口径「验证规模 234k；358k 待验」已作废，不得再写。
- 单位陷阱：`src/main/release-packaging.test.ts` 断言该文件 `MB` 数字集合恰为 `['10 MB']`，`GiB` / `MiB` / `GB` 数字集合按出现顺序恰为 `['1,325 MiB', '764.9 MiB']`；因此新小节只能出现这两个带单位的内存数字，护栏只写「未触既有内存护栏」。
- 上限段陷阱：测试会对「含 `200,000` 或 `10 MB` 的段落」断言同时含 `沿用` 与 `v0.2.8`，新小节不要复述行数 / 字节上限，避免误伤。
- 链接陷阱：全仓有「只允许链接已发布 tag 或当前 tag」的断言，新小节不写任何 `releases/tag/` 链接。
- 排版沿用本文件既有风格：中文全角标点、`- **标题**：说明` 或短段落均可，但实测数字必须原样出现（含 `1,325 MiB` 在 `764.9 MiB` 之前），且「仍未闭环……不得对外宣称已完成全链路验证」的限制语义不得弱化或省略。
- 位置以文件字节序判定：`## 风险与验证规模` 必须落在 `## 本次变化` 最后一个 `###` 之后、`## 升级方式` 之前，前后各留一个空行。
- 交付说明写清被测 commit SHA、`git diff --name-only` / `--numstat`、各 gate 退出码与 `pnpm test` 汇总。
