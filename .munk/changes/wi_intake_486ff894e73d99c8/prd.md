# 收敛 .munk/baseline/domains 全部 product.md 到 Host 硬闸内

## 范围

一次性把 `.munk/baseline/domains/**/*.md` 全部收敛到 Host 硬闸（每文件 ≤200 行、≤32768 B）以内，并完成一次 Delivery。纯文档改动，零源码改动，单 WI 一次做完。

开工复核（本机实测，行数按 `awk END{NR}` 计，字节按 `wc -c`）：

| 域 product.md | 行数 | 字节 | 超限原因 |
| --- | --- | --- | --- |
| release | 1601 | 550681 | 行数 + 字节 + 按轮次流水账 |
| directory | 687 | 294577 | 行数 + 字节 + 按轮次流水账 |
| workbench | 358 | 128456 | 行数 + 字节 |
| i18n | 356 | 119712 | 行数 + 字节 |
| directory-report | 202 | 40005 | 行数 + 字节 |
| release-verify | 146 | 42733 | 字节（超长单行） |
| perf-memory | 143 | 48322 | 字节 + 多余二级标题「历史交付证明」 |
| foundation | 135 | 46494 | 字节（超长单行） |
| quality-gates | 133 | 55801 | 字节（超长单行） |
| diff-ruler | 124 | 34499 | 字节（超长单行） |
| memory-bounded | 123 | 36506 | 字节 + 多余二级标题「历史交付证明」「已知偏差与处置」 |

超标合计 11 个 `product.md`。`qa/*.md` 全部已达标（最大 25 行 / 9052 B），本轮不改；未超标域的 `product.md` 不动（含 `app`、`code-diff-merge`、`code-diff-switches`、`compare-request`、`content-digest`、`csv-align`、`desktop-shell`、`diff-normalize`、`diff-virtualization`、`docs-governance`、`icon-system`、`io-concurrency`、`io-tolerance`、`launch`、`snapshot`、`structured*`、`symlink-semantics`、`test-*`、`text-probe`、`theme`、`ui-*` 等）。

每个超标 `product.md` 的收法：原位覆盖重写（禁止末尾追加），只保留 5 个二级标题 `## 范围` / `## 验收` / `## 非目标` / `## 实现约束` / `## 最近交付证明`；只保留当前生效契约，删除按轮次的 `### 日期/WI` 流水账、命令输出、源码行号、过期路径；「最近交付证明」只留最近一次。折完仍超限则拆更小子域（每个子域同样 5 节），不得把溢出内容挪进 `qa/` 或其他域。

## 验收

- ac-all-files-within-gate: `.munk/baseline/domains/` 下扫描到的所有 `.md`（含本轮未改域与 `qa/*.md`）编辑器行数 ≤200 且字节数 ≤32768。
- ac-only-five-h2: 11 个被改的 `product.md` 中，二级标题（`^## `）集合恰为 `## 范围`、`## 验收`、`## 非目标`、`## 实现约束`、`## 最近交付证明`，无第二个 `## ` 变体（例如不得残留 `## 历史交付证明`、`## 已知偏差与处置`）。
- ac-no-round-log-headings: 11 个被改的 `product.md` 中不存在以日期或 WI 编号命名的 `###` 流水账小标题（形如 `### 2026-…`、`### WI …`）。
- ac-latest-proof-single: 11 个被改的 `product.md` 的「最近交付证明」段只保留最近一次交付记录一条，且不含命令行输出块。
- ac-no-squashed-lines: 11 个被改的 `product.md` 中不存在长度 >1000 字符的单行（内容按条目分行保留，不得为压行数把段落塞进一行）。
- ac-content-preserved: 11 个被改的 `product.md` 的「验收」段保留该域当前生效的 `ac-*` 契约条目，且条目数量与改动前一致（仅允许合并不冲突的同义条目时数量减少，且每个域减少量 ≤3 条并在交付 summary 说明）。
- ac-untouched-paths: 11 个超标域以外的 `product.md` 与全部 `qa/*.md` 的 git diff 为空（零改动）。
- ac-no-source-change: 除 `.munk/baseline/domains/**` 与本 WI 的 `.munk/changes/**` 外无任何文件被改动（无源码、无 `.munk/baseline/INDEX.md` 手写、无 `code-gates*.json` 改动）。
- ac-split-on-need: 若某域折叠后仍超限，则该域被拆为多个子域目录，每个子域 `product.md` 同样只含上述 5 个二级标题，且无内容迁入 `qa/` 或其他已存域。
- ac-merge-submit-green: `munk_local_merge` 与 `munk_delivery_submit` 均返回成功，响应中无 `baseline_domain_doc_too_large`。

## 非目标

- 不改任何源码（`src/**`、`scripts/**`、配置、build）。不改行为、不加功能、不改 UI。
- 不新建任何测试类 WorkItem，不新增测试文件，不重跑 `.munk/code-gates.perf.json`；标准 `code_gates` 按流水线正常执行即可，禁止为过门改源码。
- 不按域拆成多个 WI（此项一次做完）。
- 不改 `qa/*.md`，不改未超标域，不手写膨胀 `INDEX.md`。
- 不把溢出内容搬进 `qa/`、其他域或其他目录藏起来（该目录全量扫描，等价于白搬）。
- 不追求文档「更漂亮」的重写：只做折叠/去流水账/拆行，不做语义扩写、不加新章节、不加新契约条目。

## 实现约束

- 开工先复核超标清单（行数按编辑器行数计，末尾换行不算；字节按 UTF-8 `wc -c`），与实际文件对齐后再动手，清单以实测为准。
- 逐文件 `read` 后用编辑/写入工具原位覆盖改；**禁止**用 bash 做整仓批量改写（`cat`/`sed`/`python`/`awk`/`perl` 等一律不行），`bash` 仅用于只读度量（行数/字节/标题）与规定的 `munk_*` 工具调用之外的只读核验。
- 硬闸含等号：≤200 行且 ≤32768 B。留余量，目标每文件 ≤180 行且 ≤30 KB，避免后续小改立刻再撞线。
- Host 在 `munk_local_merge` / `munk_git_push` / `munk_delivery_submit` 时全量扫描该目录（含未改域与 `qa/*.md`），任一文件超限即 400 `baseline_domain_doc_too_large`。
- 写回路径唯一：`munk_git_commit` → `munk_local_merge` → `munk_delivery_submit`；禁止 bash `git merge`/`push`/`rebase`，不开第二套路径。
- 若返回 `baseline_domain_doc_too_large`：只按 `details.violations` 的 `path`/`lines`/`bytes` 继续精简，重新 commit 后重试同一步，不动 violations 之外的文件。
- 删除内容前先确认「当前是否仍生效」：只有确认过期（路径已不存在、口径已被新轮次覆盖、命令输出为历史快照）才删；生效契约一律保留原文语义，只压缩措辞。
- `munk_delivery_submit` 的 summary 只写：收了哪些域、哪些拆分、后续规划不得再把发布日志追加进 `product.md`；不写 git 过程、不写命令输出。
