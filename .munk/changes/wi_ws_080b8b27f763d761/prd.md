# 教训与口径沿革迁移到 docs/lessons.md

## 范围

纯文档迁移（UI 第一期的硬前置，单批一次交完）：

1. 新建 `docs/lessons.md`（中文），承接产品约定 AGENTS.md 本次精简移出的历史结论、一次性事故与已闭环版本实测口径，分八节：

   1. 已闭环版本实测口径
      - 1.1 v0.2.7 四条负载腿与适用性
      - 1.2 v0.2.8 负载面复验与 mtime 适用边界
      - 1.3 v0.2.9 导出链路 358k 四条腿与 MiB 白名单沿革
   2. v0.2.5 同会话 upsert / 多会话 ready 峰值诊断过程与 a 支结论
   3. v0.2.5 → v0.2.6 Windows 四入口失效事故与修复口径
   4. AppImage 尾部 blockmap 大端判定与 `scripts/release-metadata.mjs` parity
   5. README 第 8 节标题即 `release-packaging.test.ts` 的 `readmeSection` 截取边界
   6. v0.2.10 空 tag 事实
   7. I#5 十一条分组结论与逐条定性
   8. 七条常驻 ops task 花名册

2. 在 `README.md` 的 `## Evidence and docs` 与 `README.zh-CN.md` 的 `## 证据与文档` 各加一行（一个链接）指向 `docs/lessons.md`。

3. 交付说明给出产品目录 `AGENTS.md` 的 `wc -l` 行数与去标点 CJK 字符数实测值。

## 验收

- ac-lessons-created: `docs/lessons.md` 新建且非空，含 8 个二级小节（第 1 节含上述三个子节），节标题语义与「范围」列出的八类一一对应；文件为 UTF-8 中文正文。
- ac-v027-legs: 文中保留 v0.2.7 四条负载腿原名与判定——`180 s` 冷跑、`60 s`、`3 s 采样`、`15 s 取消`；写明当时为 blocked 及原因（ZenMind 侧缩水到 `9,674` 文件，基线 `745,652`），并写明「不据此否定 v0.2.8 收口口径」。
- ac-v028-boundary: 文中保留 v0.2.8 复验数字 `358,155` / `358,208` 条目、`32.6 万文件/侧`、冷跑 `8,262 ms`、热跑 `7,898 ms`、取消 `116 ms` 零残留、`855.5 MiB` / `1,310.4 MiB`；并原样写明适用边界：codeload tarball 让两侧同名文件 mtime 必不同 → size/mtime 快路径把每对判 modified，该对照只测**元数据扫描管线**、不是 hash 管线。
- ac-v029-export: 文中保留 v0.2.9 358k 四条腿：建会话 `6,907 ms`、导出 `289 ms` / `9,999,926 B` / `68,865` 行、内存 `1,325 MiB` / `764.9 MiB`、取消 `38 ms` 命中 / `120 ms` 回可操作 / 0 文件 0 `.tmp`、四态 `35 / 80 / 41 / 326,099`、截断原文 `Showing 68865 of 358249 (truncated)` 与 M = `358,249`，绑 commit `a1e91cb3`，并保留证据路径 `projects/ops_df43e423451170fd/.munk/runs/trun_100be579fd6a9610/evidence/stages.md`。
- ac-mib-whitelist: 文中写明 MiB/GiB 白名单沿革——v0.2.9 notes 只允许 `1,325 MiB`、`764.9 MiB`；v0.2.10 notes 只允许 `451.6 MiB`、`909.0 MiB`、`2.25 GiB`、`2.5 GiB`、`9.29 GiB`、`9.62 GiB`；并指明断言位置 `src/main/release-packaging.test.ts`（白名单外任何带单位数字即红）。
- ac-upsert-diagnosis: 文中保留 v0.2.5 历史峰值 `1,742 MiB` / `1,659 MiB`、v0.2.6 组① `1,726` / `1,723` MiB、组② `1,716` MiB、根因「React fiber ref / 虚拟列表闭包持有历史对比 → 多份并存」、`+20 s` 静置全部低于 `1300 MiB`、app 总 RSS 低于 `2560 MiB`、热跑 `8.5–10.0 s`，以及 §10 推荐 **a** 支结论，并保留 `docs/perf/upsert-memory-diagnosis-2026-10-23.md` 路径。
- ac-windows-entries: 文中保留 v0.2.5 → v0.2.6 四入口（CLI 冷启动 / 二次实例接管 / 手输路径 / `opencompare://`）失效事故与修复口径：`compareRequest` 解析认盘符与 UNC、补六例回归、`code_gates` 增 `windows-latest` 跑该测试；并保留优先级判定「已公开版整条入口链失效优先于门面装修与 UI i18n，先发补丁修好并回归」。
- ac-appimage-blockmap: 文中保留 AppImage 尾部 4 字节 uint32 判定、LE 与 BE 两种解码都是合法候选、`blockMapSize` 缺失或两种解码都超文件大小时 fail-closed、不要求也不产出独立 `*.AppImage.blockmap`，并写明与 `scripts/release-metadata.mjs`（`extractAppImageEntries` / 尾部 4 字节）parity 必须同批改。
- ac-readme-boundary: 文中保留：README 的 docs 索引节（英文 `## Evidence and docs` / 中文 `## 证据与文档`，产品约定称「第 8 节」）标题就是 `readmeSection(markdown, heading, next)` 的截取边界，改标题必须同批改测试参数（否则截取返回空串、断言静默失守）；旧 slug 合法残留面仅 `CHANGELOG.md` + `docs/release-notes/`，不要写全仓零命中断言。
- ac-v0210-empty-tag: 文中保留 v0.2.10 空 tag 四项事实——CI 红、零 Release、零资产、永不重写 / 强推 / 删除，并写明对外不提；失败就发补丁版。
- ac-issue5-grouping: 文中按原文分组逐条定性 11 条、编号对齐：第 9 条已修复（随 v0.2.9，含 358k 证据与 commit `a1e91cb3`）；纳入评估 8 条（1 / 2 / 3 / 5 / 6 / 7 / 8 / 11）与不纳入 2 条（4 / 10）分组照抄；写明第 4 条 minimap 改判为「diff 行级差异指示条」（只做四态聚合绘制与点选跳转，不做文本缩略渲染；v0.2.11 发布），第 8 条拆分为「配色随亮 / 暗主题成套切换、不另开逐项前景 / 背景色配置；字体 / 字号自定义不纳入」；全节标注「不承诺版本与时间」。
- ac-ops-roster: 文中按「验收 / 发版 / 对外收口 / 巡检」四类列清共 7 条（验收 4 条 + 发版 1 + 对外收口 1 + 巡检 1），每条写职责与触发口径；不写死任何 `task_*` id，统一注明「id 用 `GET /tasks` 查」；并写明说明书只放下一版仍成立的内容、版本 / sha / URL / 证据目录走 brief、一次性 task 退役走归档不删除、同一 cron 不得两条并存。
- ac-evidence-paths-intact: 文中出现的证据路径（`projects/ops_df43e423451170fd/.munk/runs/...`、`docs/perf/*`、`docs/release-evidence/*`、`docs/release-notes/*`、`src/main/release-packaging.test.ts`、`scripts/release-metadata.mjs`）原样保留、未被改写或缩写，逐个可在仓内或产品目录定位。
- ac-no-number-drift: 同一事实在两处出现时数字与判定一致；阈值、口径句、blocked / pass 定性不得被改写或按新结论重述（历史 blocked 记录保持 blocked）。
- ac-readme-links: 两版 README 的 docs 索引节各出现一个指向 `docs/lessons.md` 的 markdown 链接（英文版链接文字为纯拉丁字符）；英文版除语言切换行外仍无汉字；README 仍无 `MiB` / `GiB` 与既有禁入数字；H2 仍是那 9 节、顺序不变；英文正文词数仍 ≤ 700。
- ac-gates-green: 默认 `.munk/code-gates.json` 全部 gate 绿（含 `pnpm test` 的 `release-packaging.test.ts` 双语镜像、九节标题、docs 索引导航、禁数字/禁汉字断言）。
- ac-diff-scope: `git diff --name-status` 相对 main 只有三处：新增 `docs/lessons.md`、修改 `README.md`、修改 `README.zh-CN.md`；`src/`、`package.json`、`CHANGELOG.md`、`.github/workflows/release.yml`、`docs/release-notes/**`、`docs/release-evidence/**` 零 diff。
- ac-single-commit-clean: 单条 commit 经 delivery 合入 main；交付时工作区干净（`git status --porcelain` 为空）。
- ac-agents-measured: 交付说明给出产品目录 `AGENTS.md` 的实测 `wc -l` 行数与去标点 CJK 字符数（仅统计 U+4E00–U+9FFF），并写明统计命令；路径不可读时写「不可读」，不得估数。

## 非目标

- 不改 `src/` 任何文件、不改对比 / 合并 / 扫描算法与四态语义、不加测试、不新增门禁。
- 不动版本与发布单点文件：`package.json#version`、`CHANGELOG.md`、README 第 5 行、`release.yml` dispatch 默认 tag、当前版发布说明、既有 `docs/release-evidence/**`（只新建不覆盖）。
- 不重写产品 AGENTS.md（它由产品负责人自己精简；本项只承接移出物）。
- 不搬 `docs/perf/*` 与 `docs/release-evidence/*` 的既有正文（只做摘要 + 指针）；不复制 run 目录、不复制截图与 JSON 证据。
- 不做 README 结构重排、不换截图、不动 9 节顺序与图注。
- 不顺手改 README 已知问题、不补 v0.2.11 发布说明、不对外发文。
- 不做任何 UI 写项；本项合入 main 前 UI 工作项一律不开工（由 Host 串行保证）。

## 实现约束

- **单条 commit**，由 delivery 合入 main；不得在 main 工作区手改；`git status` 干净后交棒。
- 正文用中文；每条结论带「来源 + 证据指针」，证据路径按仓库既有写法（相对产品仓根），不改写。
- 不新增 H2 到两版 README，只在 docs 索引节追加一行；链接文字英文用 Latin（如 `Lessons and decision history`），中文用「教训与口径沿革」。
- 写作口径：只搬结论与指针，不重写判定；数字、阈值、commit / run 标识、blocked / pass 定性逐字对齐来源；不新增未实测数字。
- 禁止把带单位内存数字（MiB / GiB / GB）或既有禁入数字写进两版 README（`release-packaging.test.ts` 会红），这些只留在 `docs/lessons.md`。

### 内容来源（只读；按序优先仓内）

| 小节 | 主要来源 |
| --- | --- |
| 1.1 v0.2.7 | `docs/release-evidence/v0.2.7.md`（§7 四条腿 blocked）、`docs/release-evidence/v0.2.8.md`（§8–§10 判定与适用性） |
| 1.2 v0.2.8 | `docs/release-evidence/v0.2.8.md` §8 负载面对照复测、§9 判定口径、§10 遗留 |
| 1.3 v0.2.9 | `docs/release-notes/v0.2.9.md`「风险与验证规模」、`docs/release-evidence/v0.2.9.md` §8、`src/main/release-packaging.test.ts`（MiB 白名单断言） |
| 2 upsert 诊断 | `docs/perf/upsert-memory-diagnosis-2026-10-23.md` 全文（结论先行 / §10 推荐 / 附录 C） |
| 3 Windows 四入口 | `docs/release-evidence/v0.2.6.md`（Windows 入口门）、`docs/release-evidence/v0.2.5.md`、`CHANGELOG.md` |
| 4 AppImage blockmap | `src/main/release-packaging.test.ts`（AppImage gate 用例）、`scripts/release-metadata.mjs`（`extractAppImageEntries` / 尾部 4 字节 / LE·BE 注释） |
| 5 README 截取边界 | `src/main/release-packaging.test.ts`（`readmeSection` 与 `bilingual README parity`）、产品约定（旧 slug 残留面口径） |
| 6 v0.2.10 空 tag | `CHANGELOG.md`、`docs/release-notes/v0.2.10.md`、`docs/release-notes/v0.2.11.md`、产品 AGENTS.md §四 |
| 7 I#5 十一条 | **产品目录**：`projects/ops_df43e423451170fd/.munk/runs/trun_471dcb47151a4920/issue-5-body.md`（逐条分组原文）、`.../cases/2026-10-28/issue-5-followup-minimap.md`（minimap 改判）、产品 `notes/pending-run-issue5.json`（回帖 brief，含第 8 条拆分与改判正文） |
| 8 七条 ops task | **产品目录**：`projects/ops_df43e423451170fd/tasks/*.md`（7 个文件的 `title` 与职责），分类口径见产品 AGENTS.md §五 |

- 产品目录在本机同一路径：`/Users/zhutao/Library/Application Support/Munk AI/munk-auto/products/codebase_b2d550b56d98d0c5`（含空格，shell 需引号）；`projects/` 相对该目录。只读引用，不复制 run 目录进仓。
- 交付说明实测命令示例：`wc -l "<产品目录>/AGENTS.md"`；CJK 计数用 `python3 -c` 遍历 U+4E00–U+9FFF（去标点，只算汉字）。当前基线供对照：68 行 / 2,245 字（本次实测值，交付说明须自行重测并写自己的值）。
- 若第 7 / 8 节的产品目录路径不可读：该节写「不可读」并在交付说明列出缺项与路径，不得凭印象补写、不得编造编号或 task 名称；其余节仍须交付完整。
