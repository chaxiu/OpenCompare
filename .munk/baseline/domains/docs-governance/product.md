# Domain: docs-governance

文档知识库与口径沿革域：定义「历史结论 / 一次性事故 / 已闭环实测口径」这类**不随版本失效、但也不该堆在产品约定里**的内容落在仓库哪一份文档、按什么口径写、与 README 的入口关系如何。本域管**文档归属、写作口径与迁移范围**，不管被记录的结论本身——负载腿数字与适用边界归 `perf-memory` / `release`，Windows 四入口修复归 `compare-request` 与其历史记录，MiB 白名单断言归 `release`，README 结构断言的实现归 `release`。本域是 `docs/lessons.md` 的唯一现行口径来源。

## 范围

- **`docs/lessons.md` 是历史结论与口径沿革的唯一落点**：中文正文，UTF-8，承接产品约定 `AGENTS.md` 精简时移出的历史结论、一次性事故与已闭环版本实测口径，分八节：
  1. 已闭环版本实测口径（1.1 v0.2.7 四条负载腿与适用性 / 1.2 v0.2.8 负载面复验与 mtime 适用边界 / 1.3 v0.2.9 导出链路 358k 四条腿与 MiB 白名单沿革）
  2. v0.2.5 同会话 upsert / 多会话 ready 峰值诊断过程与 a 支结论
  3. v0.2.5 → v0.2.6 Windows 四入口失效事故与修复口径
  4. AppImage 尾部 blockmap 大端判定与 `scripts/release-metadata.mjs` parity
  5. README 第 8 节标题即 `release-packaging.test.ts` 的 `readmeSection` 截取边界
  6. v0.2.10 空 tag 事实
  7. I#5 十一条分组结论与逐条定性
  8. 七条常驻 ops task 花名册
- **写作口径**：只搬结论与证据指针，不重写判定；数字、阈值、commit / run 标识、`blocked` / `pass` 定性逐字对齐来源；不新增未实测数字；每条带「来源 + 证据指针」，证据路径按仓库既有写法（相对产品仓根）原样给出、不改写或缩写。
- **历史不改写**：当时 `blocked` 的记录保持 `blocked`，不得按后来的复验结论重述；同一事实在两处出现时数字与判定必须一致，发现两种取数时如实并列（如 `9,674` 与 `9,682` 同源两取数）而不择一覆盖。
- **与 README 的关系**：两版 README 的 docs 索引节（英文 `## Evidence and docs` / 中文 `## 证据与文档`）各追加**一行一个链接**指向 `docs/lessons.md`；英文链接文字为纯拉丁字符（如 `Lessons and decision history`），中文为「教训与口径沿革」。不新增 H2、不重排 9 节顺序、不再往 README 塞数字。
- **带单位内存数字的去向**：`MiB` / `GiB` 等带单位数字只允许写进 `docs/lessons.md`，**禁止**写进两版 README（`release-packaging.test.ts` 的白名单断言会红）。
- **仓根 `AGENTS.md` 的沿革入口行**：`docs/lessons.md` 建好后必须可从仓根产品约定发现——`AGENTS.md` 增加**恰好一行**指向 `docs/lessons.md` 的入口（现为第 4 行「沿革与已闭环口径见 [`docs/lessons.md`](docs/lessons.md)：改壳层 / 图标 / 主题或发布口径前先读。」）。只加这一行：不重排小节、不扩写、不改既有小节，`wc -l` 46 → 47；后续改壳层 / 图标 / 主题 / 发布口径的批次以该行指示为先读沿革。审计类文档（如 `docs/ui-phase1-reference-audit.md`，归 `ui-reference-audit` 域）不占用这行、也不新增第二行入口。

## 验收

- **ac-lessons-created**：`docs/lessons.md` 新建且非空，含 8 个二级小节（第 1 节含上述三个子节），节标题语义与「范围」列出的八类一一对应；文件为 UTF-8 中文正文。
- **ac-v027-legs**：文中保留 v0.2.7 四条负载腿原名与判定——`180 s` 冷跑、`60 s`、`3 s 采样`、`15 s 取消`；写明当时为 blocked 及原因（ZenMind 侧缩水到 `9,674` 文件，基线 `745,652`），并写明「不据此否定 v0.2.8 收口口径」。
- **ac-v028-boundary**：文中保留 v0.2.8 复验数字 `358,155` / `358,208` 条目、`32.6 万文件/侧`、冷跑 `8,262 ms`、热跑 `7,898 ms`、取消 `116 ms` 零残留、`855.5 MiB` / `1,310.4 MiB`；并原样写明适用边界：codeload tarball 让两侧同名文件 mtime 必不同 → size/mtime 快路径把每对判 modified，该对照只测**元数据扫描管线**、不是 hash 管线。
- **ac-v029-export**：文中保留 v0.2.9 358k 四条腿：建会话 `6,907 ms`、导出 `289 ms` / `9,999,926 B` / `68,865` 行、内存 `1,325 MiB` / `764.9 MiB`、取消 `38 ms` 命中 / `120 ms` 回可操作 / 0 文件 0 `.tmp`、四态 `35 / 80 / 41 / 326,099`、截断原文 `Showing 68865 of 358249 (truncated)` 与 M = `358,249`，绑 commit `a1e91cb3`，并保留证据路径 `projects/ops_df43e423451170fd/.munk/runs/trun_100be579fd6a9610/evidence/stages.md`。
- **ac-mib-whitelist**：文中写明 MiB/GiB 白名单沿革——v0.2.9 notes 只允许 `1,325 MiB`、`764.9 MiB`；v0.2.10 notes 只允许 `451.6 MiB`、`909.0 MiB`、`2.25 GiB`、`2.5 GiB`、`9.29 GiB`、`9.62 GiB`；并指明断言位置 `src/main/release-packaging.test.ts`（白名单外任何带单位数字即红）。
- **ac-upsert-diagnosis**：文中保留 v0.2.5 历史峰值 `1,742 MiB` / `1,659 MiB`、v0.2.6 组① `1,726` / `1,723` MiB、组② `1,716` MiB、根因「React fiber ref / 虚拟列表闭包持有历史对比 → 多份并存」、`+20 s` 静置全部低于 `1300 MiB`、app 总 RSS 低于 `2560 MiB`、热跑 `8.5–10.0 s`，以及 §10 推荐 **a** 支结论，并保留 `docs/perf/upsert-memory-diagnosis-2026-10-23.md` 路径。
- **ac-windows-entries**：文中保留 v0.2.5 → v0.2.6 四入口（CLI 冷启动 / 二次实例接管 / 手输路径 / `opencompare://`）失效事故与修复口径：`compareRequest` 解析认盘符与 UNC、补六例回归、`code_gates` 增 `windows-latest` 跑该测试；并保留优先级判定「已公开版整条入口链失效优先于门面装修与 UI i18n，先发补丁修好并回归」。
- **ac-appimage-blockmap**：文中保留 AppImage 尾部 4 字节 uint32 判定、LE 与 BE 两种解码都是合法候选、`blockMapSize` 缺失或两种解码都超文件大小时 fail-closed、不要求也不产出独立 `*.AppImage.blockmap`，并写明与 `scripts/release-metadata.mjs`（`extractAppImageEntries` / 尾部 4 字节）parity 必须同批改。
- **ac-readme-boundary**：文中保留：README 的 docs 索引节（英文 `## Evidence and docs` / 中文 `## 证据与文档`，产品约定称「第 8 节」）标题就是 `readmeSection(markdown, heading, next)` 的截取边界，改标题必须同批改测试参数（否则截取返回空串、断言静默失守）；旧 slug 合法残留面仅 `CHANGELOG.md` + `docs/release-notes/`，不要写全仓零命中断言。
- **ac-v0210-empty-tag**：文中保留 v0.2.10 空 tag 四项事实——CI 红、零 Release、零资产、永不重写 / 强推 / 删除，并写明对外不提；失败就发补丁版。
- **ac-issue5-grouping**：文中按原文分组逐条定性 11 条、编号对齐：第 9 条已修复（随 v0.2.9，含 358k 证据与 commit `a1e91cb3`）；纳入评估 8 条（1 / 2 / 3 / 5 / 6 / 7 / 8 / 11）与不纳入 2 条（4 / 10）分组照抄；写明第 4 条 minimap 改判为「diff 行级差异指示条」（只做四态聚合绘制与点选跳转，不做文本缩略渲染；v0.2.11 发布），第 8 条拆分为「配色随亮 / 暗主题成套切换、不另开逐项前景 / 背景色配置；字体 / 字号自定义不纳入」；全节标注「不承诺版本与时间」。
- **ac-ops-roster**：文中按「验收 / 发版 / 对外收口 / 巡检」四类列清共 7 条（验收 4 条 + 发版 1 + 对外收口 1 + 巡检 1），每条写职责与触发口径；不写死任何 `task_*` id，统一注明「id 用 `GET /tasks` 查」；并写明说明书只放下一版仍成立的内容、版本 / sha / URL / 证据目录走 brief、一次性 task 退役走归档不删除、同一 cron 不得两条并存。
- **ac-evidence-paths-intact**：文中出现的证据路径（`projects/ops_df43e423451170fd/.munk/runs/...`、`docs/perf/*`、`docs/release-evidence/*`、`docs/release-notes/*`、`src/main/release-packaging.test.ts`、`scripts/release-metadata.mjs`）原样保留、未被改写或缩写，逐个可在仓内或产品目录定位。
- **ac-no-number-drift**：同一事实在两处出现时数字与判定一致；阈值、口径句、blocked / pass 定性不得被改写或按新结论重述（历史 blocked 记录保持 blocked）。
- **ac-readme-links**：两版 README 的 docs 索引节各出现一个指向 `docs/lessons.md` 的 markdown 链接（英文版链接文字为纯拉丁字符）；英文版除语言切换行外仍无汉字；README 仍无 `MiB` / `GiB` 与既有禁入数字；H2 仍是那 9 节、顺序不变；英文正文词数仍 ≤ 700。
- **ac-gates-green**：默认 `.munk/code-gates.json` 全部 gate 绿（含 `pnpm test` 的 `release-packaging.test.ts` 双语镜像、九节标题、docs 索引导航、禁数字/禁汉字断言）。
- **ac-diff-scope**：`git diff --name-status` 相对 main 只有三处：新增 `docs/lessons.md`、修改 `README.md`、修改 `README.zh-CN.md`；`src/`、`package.json`、`CHANGELOG.md`、`.github/workflows/release.yml`、`docs/release-notes/**`、`docs/release-evidence/**` 零 diff。
- **ac-single-commit-clean**：单条 commit 经 delivery 合入 main；交付时工作区干净（`git status --porcelain` 为空）。
- **ac-agents-measured**：交付说明给出产品目录 `AGENTS.md` 的实测 `wc -l` 行数与去标点 CJK 字符数（仅统计 U+4E00–U+9FFF），并写明统计命令；路径不可读时写「不可读」，不得估数。
- **ac-agents-lessons-entry**：仓根 `AGENTS.md` 相对基线只有一次 `+1 / −0` 改动，该行含 `docs/lessons.md` 链接文字；`wc -l AGENTS.md` = 基线 46 + 1 = 47；该行之外 `git diff -U0 AGENTS.md` 无任何其它 hunk（不重排、不扩写、不改既有小节）。

## 非目标

- 不改 `src/` 任何文件、不改对比 / 合并 / 扫描算法与四态语义、不加测试、不新增门禁。
- 不动版本与发布单点文件：`package.json#version`、`CHANGELOG.md`、README 第 5 行、`release.yml` dispatch 默认 tag、当前版发布说明、既有 `docs/release-evidence/**`（只新建不覆盖）。
- 不重写产品 AGENTS.md（由产品负责人自己精简；本项只承接移出物）。
- 不搬 `docs/perf/*` 与 `docs/release-evidence/*` 的既有正文（只做摘要 + 指针）；不复制 run 目录、不复制截图与 JSON 证据。
- 不做 README 结构重排、不换截图、不动 9 节顺序与图注。
- 不顺手改 README 已知问题、不补发布说明、不对外发文。

## 实现约束

- **单条 commit**，由 delivery 合入 main；不得在 main 工作区手改；`git status` 干净后交棒。
- 正文用中文；每条结论带「来源 + 证据指针」；证据路径按仓库既有写法（相对产品仓根），不改写。
- 不新增 H2 到两版 README，只在 docs 索引节追加一行；链接文字英文用 Latin，中文用中文短语。
- **禁止把带单位内存数字（MiB / GiB / GB）或既有禁入数字写进两版 README**（`release-packaging.test.ts` 会红），这些只留在 `docs/lessons.md`。
- README 的 docs 索引节标题是测试的截取边界：本项只追加行、**不改标题**；若确需改标题，必须在同一提交里同批改 `readmeSection` 的 `heading` 与 `next` 两个入参。
- 内容来源按 prd 的「内容来源」表逐节取（仓内文档优先）；产品目录路径不可读时该节写「不可读」并在交付说明列出缺项与路径，不得凭印象补写、不得编造编号或 task 名称。
- 域 fold 由 Delivery 承担：本域记录现行文档归属与写作口径，历史域记录（`release` / `perf-memory` / `compare-request` 各自的 AC 原文与当时证据）按当初事实保留，不改写。

## 最近交付证明

- WI：`wi_ws_0b248d40545e9eb4`（补上本域上一轮记下的缺口：仓根 `AGENTS.md` 加 **1 行** `docs/lessons.md` 入口；同一 WI 主体文档 `docs/ui-phase1-reference-audit.md` 归 `ui-reference-audit` 域，本域只承接入口行这个切片；`deliveryIntent: local merge`，`needSelfTest=false`）
- 日期：2026-10-30
- 结果：code_gates passed（9 gates，attempt 001 全 exit 0，`.munk/runs/run_ws_16f6f7ea75b767c6/code-gates/attempts/001`）；`pnpm test` 75 files / 1202 passed + 1 skipped（1203），29.82s。
- 改动面：`AGENTS.md` 仅 `+1 / −0`（新增第 4 行「沿革与已闭环口径见 [docs/lessons.md](docs/lessons.md)：改壳层 / 图标 / 主题或发布口径前先读。」），`wc -l` 46 → **47**；`git diff -U0 AGENTS.md` 无其它 hunk；`docs/lessons.md`、两版 README、`package.json`、`CHANGELOG.md`、`.github/**`、`docs/release-notes/**`、`docs/release-evidence/**` 零 diff。
- 验收落点：`ac-agents-lessons-entry` 满足（行数 47、单次 +1、行内含 `docs/lessons.md`）。上一轮记的第③条缺口（仓根 `AGENTS.md` 未指向沿革）**本轮已闭环**。
- 注：① 本 WI change pack 只有 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），本域无新增折叠用例；入口行 AC 的逐条实测记在 `ui-reference-audit` 域的 `qa/ui-phase1-reference-audit.md`。② 产品目录 `AGENTS.md` 的精简仍未做（不属本域非目标之内、也未由任何 WI 承接）——那才是「产品约定瘦身」的正项，行数仍是 68。③ 入口行落位选在第 4 行（沿革句紧跟首段定位句）而非新增小节，符合「只加一行、不重排」口径；后续再加 docs 入口不要再往这一行拼第二句。

### 上一轮

- WI：`wi_ws_080b8b27f763d761`（教训与口径沿革迁移到 `docs/lessons.md` + 两版 README docs 索引各加一行链接；纯文档、产品代码零 diff；`deliveryIntent: local merge`，`needSelfTest=false`）
- 日期：2026-10-30
- 结果：code_gates passed（9 gates，attempt 001，`.munk/runs/run_ws_e343d77aee09a13b/code-gates/attempts/001`，全 exit 0）。`pnpm test` 69 files / 1104 passed + 1 skipped（1105），27.88s——含 `release-packaging.test.ts` 的双语镜像、九节标题、docs 索引导航与禁单位数字断言。
- 改动面：恰为 `README.md`、`README.zh-CN.md`（各 +2 行，docs 索引节各一行链接）与新增 `docs/lessons.md`（185 行 / 8 个二级小节）；`src/`、`package.json`、`CHANGELOG.md`、`.github/workflows/release.yml`、`docs/release-notes/**`、`docs/release-evidence/**` 零 diff。
- 验收落点：两版 H2 仍各 9 节且顺序不变；英文版词数 357（≤ 700）；`MiB` / `GiB` 零命中；英文版汉字仅语言切换行 `简体中文`（4 字）；两版 `docs/lessons.md` 链接各 1 处。**新建本域**（无既有域承接「文档知识库归属」这一层）。
- 注：① 本 WI change pack 只有 `prd.md`（无 `tests/cases/**`、无 `tech.md` / `ux/**`）——无 change-pack 用例可 copy、无 tech / ux 手合；验收逐条落档为 `qa/lessons-migration.md`。② 产品目录 `AGENTS.md` 实测 68 行 / 2,245 个 CJK 汉字（`wc -l` + `python3` 按 U+4E00–U+9FFF 计数），与 prd 给的对照基线一致 → **产品侧 AGENTS.md 尚未真正精简**，本项只是先建好承接落点。③ 仓根 `AGENTS.md`（46 行，已在 main）未指向 `docs/lessons.md`——属非目标（不重写产品约定），但后续若要让 agent 找到这份沿革，应另开工作项补一行入口。
