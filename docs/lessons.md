# 教训与口径沿革

本文件承接产品约定 `AGENTS.md` 精简时移出的历史结论、一次性事故与已闭环版本实测口径。

写作口径：只搬结论与证据指针，不重写判定；数字、阈值、commit / run 标识、`blocked` / `pass` 定性逐字对齐来源。本文件不做重测，也不新增未实测数字。证据路径按仓库既有写法给出相对产品仓根，原样可查。

## 1. 已闭环版本实测口径

### 1.1 v0.2.7 四条负载腿与适用性

四条负载腿原名与判定（v0.2.7 公开包 L1）：

- `180 s` 冷跑负载腿 **blocked**：整轮约 1.07 s 即结束，无法维持 180 s 持续负载，本轮未取得该腿结论。
- `60 s` 负载腿 **blocked**：同一数据面缩水，整轮约 1.07 s 即结束，本轮未取得该腿结论。
- `3 s 采样` 腿 **blocked**：3 s 采样 0 条（整轮约 1.07 s 即结束），补充 60 ms 采样 15 条作为替代观测。
- `15 s` 取消点腿 **blocked**：15 s 取消点不存在，实际取消点 283 ms → `116 ms` 回可操作态。

blocked 原因同一：`ZenMind/node_modules` 缺失，目标侧缩水到 `9,674` 文件（基线 `745,652`；同一缩水事实在 `docs/release-evidence/v0.2.7.md` §7 记作「目标侧约 9,682 文件」，为同一事实的两种取数，不构成口径冲突），整轮约 1.07 s 即结束，负载面不成立。该记录是当时数据面缩水的如实结果，作为历史事实保留，不声称已修复，也不篡改。

同管线对照复测（v0.2.7 §8，证据 run `trun_4ba3dfc950d639e7`）：301,311 / 301,300 条目，冷跑 8.6 s、热跑 8.1 s（**无缓存**），3 个采样点 0 回退，取消 `116 ms`，峰值 976 MiB / 1,439 MiB。

适用性（2026-10-27 公司裁决，v0.2.7 §9）：

- **冷跑在 180 s 内完成**。
- **取消在进度出现后的任意时点可点且回退干净（无半棵树 / 无残留四态 / 异常计数 0）**。
- 要恢复「扫描/哈希持续 ≥180 s」或「15 s 定时取消点」，须另指**专用大磁盘机器（≥60 GB/侧）**，属**公司负责人裁定的口径变更**，不由单个版本自行恢复。
- 历史 blocked 记录保持 blocked；**不据此否定 v0.2.8 收口口径**。

来源：`docs/release-evidence/v0.2.7.md` §7–§10。

### 1.2 v0.2.8 负载面复验与 mtime 适用边界

证据 run `trun_ecbdd72beef29b0a`（`digest.md` 与 `evidence/60-summary.json`）。v0.2.7 已实测同一管线，本场为对照复测。

- 规模：`358,155` / `358,208` 条目（35.8 万条目 / 侧）；元数据扫描管线 32.6 万文件 / 侧。
- 冷跑 `8,262 ms`；热跑 `7,898 ms`（**无缓存**）。
- 3 条采样 0 回退；取消 `116 ms`、零残留。
- 内存峰值：renderer `855.5 MiB` / app `1,310.4 MiB`。

适用边界（原样保留，不得省略）：codeload tarball 让两侧同名文件 mtime 必不同，size/mtime 快路径把每对直接判 modified；**该对照只测元数据扫描管线（32.6 万文件 / 侧），不是 hash 管线**。hash 管线证据引用 `trun_4ba3dfc950d639e7` 与历史真实两目录实测。

判定口径与 1.1 逐字同文（冷跑 180 s 内完成、取消任意时点可点且回退干净）；本场冷跑 `8,262 ms`、取消 `116 ms` 零残留，均满足该口径，**不再逐版记 blocked**。需要恢复 ≥180 s 持续扫描 / 哈希或 15 s 定时取消点时，仍按 1.1 的专用大磁盘机器条件由公司负责人裁定。

来源：`docs/release-evidence/v0.2.8.md` §8–§10。

### 1.3 v0.2.9 导出链路 358k 四条腿与 MiB 白名单沿革

v0.2.9 在 358,249 条目真实对照对（两侧 `358,155` / `358,208`）上跑完四条规模敏感腿并全部通过；被测 commit `a1e91cb3`、版本 v0.2.9。

- **建会话**：ready `6,907 ms`。
- **导出**：耗时 `289 ms`，产物 `9,999,926 B`、数据行 `68,865`；报告内截断原文为 `Showing 68865 of 358249 (truncated)`，M = `358,249`，与原始条目数自洽。
- **内存**：app 总峰值 `1,325 MiB`、renderer 峰值 `764.9 MiB`，未触既有内存护栏，无 OOM，进程 pid 全程不变。
- **进度期间取消**：命中耗时 `38 ms`，回可操作 `120 ms`，新文件 0 / `.tmp` 0，产物 sha 与 mtime 均未变化。
- **四态计数**：相同 / 新增 / 删除 / 修改为 `35 / 80 / 41 / 326,099`，报告与界面逐项相等。

证据路径：`projects/ops_df43e423451170fd/.munk/runs/trun_100be579fd6a9610/evidence/stages.md`。

MiB / GiB 白名单沿革（带单位内存数字只允许出现在发布说明的白名单内）：

- v0.2.9 发布说明只允许 `1,325 MiB`、`764.9 MiB`。
- v0.2.10 发布说明只允许 `451.6 MiB`、`909.0 MiB`、`2.25 GiB`、`2.5 GiB`、`9.29 GiB`、`9.62 GiB`（按文档出现顺序）。
- 断言位置：`src/main/release-packaging.test.ts`；白名单外任何带单位数字即红，顺序变化同样红。

来源：`docs/release-notes/v0.2.9.md`「风险与验证规模」、`docs/release-evidence/v0.2.9.md` §8、`src/main/release-packaging.test.ts`。

## 2. v0.2.5 同会话 upsert / 多会话 ready 峰值诊断过程与 a 支结论

诊断文档：`docs/perf/upsert-memory-diagnosis-2026-10-23.md`（只读诊断，被测公开包 v0.2.6，tag `v0.2.6` → commit `30967cd1e8fd521fa517588b2a7ac503305797e5`）。

历史对照（v0.2.5 公开包，本项未重跑）：upsert ready 峰值 `1,742 MiB`、3 会话 ready `1,659 MiB`。

v0.2.6 实测：

- 组①（同会话 upsert 5 轮）：ready 峰值 `1,726` MiB（1 s 侧车）/ `1,723` MiB（无侧车对照）。
- 组②（3 会话并发）：第 3 个 tab ready 峰值 `1,716` MiB。
- 组① 第 3–5 轮与组② 均越过 renderer 1536 MiB 阈值；两套数据都在 v0.2.5 水平附近（约 -1%～+4% 波动），即 v0.2.6 未消除该峰值。

根因（候选 1，主因）：React fiber ref / 虚拟列表闭包持有历史对比 → 多份并存。第 2 轮 ready 快照有 2 份 comparison / 4 个 row model；5 轮后 settle 快照仍有 3 份 comparison / 4 个 row model，每棵结果树约 299.0 MiB reachable，旧项经 `<div>` 的 `__reactFiber$` → `FiberNode` → `ref` 闭包 → Context(`internal:previous`) 与 `@tanstack/react-virtual` 的 `getScrollElement` 闭包持有。

有界性：`+20 s` 静置全部低于 `1300 MiB`（组① ≤1274.8 MiB、组② 1258.3 MiB），app 总 RSS 低于 `2560 MiB`（≤2173.6 MiB），无崩溃 / OOM；热跑 `8.5–10.0 s`，未退回 ~20 s（`hashedFiles=0`，不重新哈希）。

§10 推荐 **a** 支（本诊断项不修）：修渲染侧持有 / 释放 + 把 upsert 与 3 会话纳入门禁；只动 renderer 引用释放，不改缓存容量与淘汰（缓存 30.5 / 59.6 MiB、evictions=0，不是峰值来源），代价 0.5–1 人日。验收断言：第 2 轮 ready 的 comparison 数 =1、row model 数 =2；5 轮后 settle 的 comparison 数 =1，live 回到约 345 MB，峰值 ≤1536 MiB。若实施后峰值仍 >1536 MiB 且无崩溃，退化为 b 支（只补门禁与文档，保留峰值与静置 3 份）。c 支（不复现）不适用。

来源：`docs/perf/upsert-memory-diagnosis-2026-10-23.md`（结论先行 / §10 / 附录 C）。

## 3. v0.2.5 → v0.2.6 Windows 四入口失效事故与修复口径

事故形态：v0.2.5 及更早的公开版在 Windows 上，四条入口把绝对路径错误拼接到当前工作目录 / baseDir，整条入口链失效：

- CLI 冷启动（`--left` / `--right`）
- 二次实例接管（应用已运行时再次启动）
- 手输路径（新建对比手工输入）
- `opencompare://` 链接（`opencompare://compare`）

修复口径（v0.2.6）：

- `compareRequest` 解析认盘符与 UNC：`C:\Users\…` 这类盘符绝对路径按原样解析、盘符大小写保持原样；盘根（`C:\`）保持盘根语义、`..` 不越过盘根；UNC（`\\server\share\…`）按共享根解析、`..` 不越过共享根，规范形式为 `//server/share/…`。
- 输出口径：解析成功统一以 `/` 输出（例如 `C:/Users/…`、`//server/share/b.txt`）；`win32` 上的错误回显仍用 `\`。
- 补六例 Windows 绝对路径回归（盘符 / 盘根 / UNC）；`code_gates` 增 `windows-latest` 跑 `pnpm test src/shared/compareRequest.test.ts`（`.github/workflows/windows.yml`）。修复期 job run `39888946270` 结论 `success`；发布取证 `windows.yml` run `39890047849` 为 `Tests 46 passed`。
- 合并提交 `0cc0914f3aebea9649d76be80fd3592a95bcdd87`（修复提交 `54029c8`）。

优先级判定（原文保留）：已公开版整条入口链失效（CLI / 二次实例 / 手输路径 / URL 四入口）优先于门面装修与 UI i18n，先发补丁修好并回归。

来源：`docs/release-notes/v0.2.6.md`、`docs/release-evidence/v0.2.6.md` §4、`CHANGELOG.md`「v0.2.6」、产品约定 `AGENTS.md` 当前生效验收口径。

## 4. AppImage 尾部 blockmap 大端判定与 `scripts/release-metadata.mjs` parity

- electron-builder 把 AppImage 的 `blockMapSize` 写在文件**尾部 4 字节 uint32**，字节序按平台不同；因此 **LE 与 BE 两种解码都是合法候选**，门禁不能只认一种。
- v0.2.5 的 CI 尾部为 `00 01 EF A4`：BE 解码 126884（正是 `latest-linux.yml` 声明值），LE 解码 2767126784。旧的 LE-only 门禁会把它误判为红。
- fail-closed：`blockMapSize` 缺失、两种解码都超过文件大小、两个候选值都与声明值不等，三种情况一律红（`::error::`），不得静默放行。
- 不要求也不产出独立 `*.AppImage.blockmap` 资产；门禁脚本不得出现 `AppImage.blockmap`。
- parity：`scripts/release-metadata.mjs` 的 `extractAppImageEntries`（`files[]` 从 `- url:` 起、`blockMapSize` 在后续缩进行）与尾部 4 字节判定，必须与 workflow 门禁**同批改**；本地 `pnpm release:metadata` 与 CI 走同一规则，否则本地绿 / CI 红或反之。

断言位置：`src/main/release-packaging.test.ts`（AppImage gate 用例：v0.2.5 fixture 走 BE 通过、LE-only 负控失败、两解码都超文件大小 fail-closed、缺 `blockMapSize` fail-closed、多份 / 缺失镜像 fail-closed）；`scripts/release-metadata.mjs`（`extractAppImageEntries` 与尾部 4 字节注释）。

## 5. README 第 8 节标题即 `release-packaging.test.ts` 的 `readmeSection` 截取边界

- 产品约定称的「第 8 节」就是两版 README 的 docs 索引节：英文 `## Evidence and docs` / 中文 `## 证据与文档`。
- 该标题本身就是 `readmeSection(markdown, heading, next)` 的**截取边界**：实现为 `indexOf(heading)` 与 `indexOf(next, start)`，任一为 `-1` 时返回空串，其后的 `toContain` 断言会**静默失守**（空串对空断言恒真）。
- 因此改标题（或改下一节标题）必须**同批改测试参数**：`heading` 与 `next` 两个入参一起改，不能只改 README。
- 旧 slug 的合法残留面仅 `CHANGELOG.md` + `docs/release-notes/`（历史记录不改）；两版 README、`docs/`、`src` 测试与 `.github` 一律直链新 slug。不要写「全仓零命中」断言。

位置：`src/main/release-packaging.test.ts` 的 `readmeSection` 与 `bilingual README parity` 组。

## 6. v0.2.10 空 tag 事实

`v0.2.10` 是空 tag，四项事实固定：

- CI 红。
- 零 Release。
- 零资产。
- 同样**永不重写 / 不强推 / 不删除**。

对外不提：对外回帖与发布说明只按 v0.2.11 承接 v0.2.10 的两项补发内容（差异指示条、大行数双栏窗口渲染），不对外陈述 v0.2.10 的失败过程。发版失败就发补丁版，不靠重发同一 tag 修。

来源：`CHANGELOG.md`、`docs/release-notes/v0.2.10.md`、`docs/release-notes/v0.2.11.md`、产品约定 `AGENTS.md` 发布纪律。

## 7. I#5 十一条分组结论与逐条定性

分组照原文搬，编号对齐 Issue 原清单；**本节不承诺任何版本与时间**。

第 9 条（缺陷）：**已修复**，随 v0.2.9 公开发布（2026-10-28）。换文件、切换路径、或从目录对比下钻返回后，标签页标题与路径副标题立即跟随当前会话；同名但不在同一目录的文件对显示各自完整路径。可复核证据：358,249 条目真实对照对、四态 `35 / 80 / 41 / 326,099`、导出 `289 ms` / `9,999,926 B` / `68,865` 行、被测 commit `a1e91cb3`（详见 1.3）。

纳入评估 8 条（编号即 Issue 原清单编号）：

- 第 1 条：打开文件不再按扩展名白名单拒绝（改为文本探测，未知扩展名可按文本打开）
- 第 2 条：亮色 / 跟随系统主题
- 第 3 条：重新加载当前 diff
- 第 5 条：忽略空白字符差异（尾随空格、缩进、空行）
- 第 6 条：交换左右面板
- 第 7 条：文件 / 文件夹对话框记住上次目录
- 第 8 条：diff 语义配色可定制（拆分口径见下）
- 第 11 条：语法高亮（需与 diff 语义色共存）

不纳入 2 条（编号同上）：

- 第 4 条：Minimap —— 原「不纳入」理由（diff 视口要多渲染一层缩略图，与窗口化渲染和大文件性能目标冲突）建立在被用户当场纠正的形态假设上；2026-10-28 负责人裁定**改判**为「diff 行级差异指示条」：只做四态聚合绘制与点选跳转，不做文本缩略渲染，随 v0.2.11 发布。
- 第 10 条：十六进制比较 —— 属二进制 / 反汇编类对比，不在本产品范围。

第 8 条拆分口径：配色部分由「随亮 / 暗主题成套切换」吸收，**不另开逐项前景 / 背景色配置**；**字体 / 字号自定义不纳入**。

证据路径：`projects/ops_df43e423451170fd/.munk/runs/trun_471dcb47151a4920/issue-5-body.md`（分组原文逐条）、`projects/ops_df43e423451170fd/cases/2026-10-28/issue-5-followup-minimap.md`（minimap 改判与后续回帖边界）。

## 8. 七条常驻 ops task 花名册

按「验收 / 发版 / 对外收口 / 巡检」四类共 7 条（验收 4 条 + 发版 1 条 + 对外收口 1 条 + 巡检 1 条）。id 用 `GET /tasks` 查，本文件不写死任何常驻任务 id。

| 类别 | 任务 | 职责 | 触发口径 |
| --- | --- | --- | --- |
| 验收 | 公开下载包用户可得性与 3 轮反复用复验 | 从公开下载页取 brief 指定版本装进干净环境，跑真实两目录 3 轮对比（含一轮中途取消），证明用户拿得到、反复用不退化 | 常驻，每日 05:30（`30 5 * * *`）；版本 / dmg URL / sha256 / 字节数全部走 brief |
| 验收 | 渲染层实机验收（浏览器 / CDP 驱动） | 用 CDP 驱动真实窗口验渲染层主链路：工作台、目录对比与下钻往返、粘贴路径建会话、多会话切换、导出 HTML 报告 | 常驻，每日 08:00（`0 8 * * *`）；一场 2–3 条、30 分钟墙钟 |
| 验收 | 桌面系统窗口验收（原生面板 / 启动参数 / 打包壳） | 只覆盖 CDP 驱动不了的系统窗口与原生通道：原生 NSSavePanel 落盘、打包态 argv / `opencompare://` / 二次实例、`.app` 品牌与菜单、系统文件选择器 | `computer` 场，仅 03:00–06:00 由负责人手动触发；单场 2 条、30 分钟 |
| 验收 | 公开包 L1 四条负载腿补测（真实大仓双 tag） | 只跑 L2 负载腿（180 s / 60 s / 3 s 采样 / 15 s 取消点），不做下载 sha 与三轮四态复验 | 条件触发：diff 触及扫描 / 哈希 / 缓存 / IPC / 树渲染 / 取消路径，或 `x.y.0` 里程碑；由负责人单独 brief 手动触发，不逐版补测 |
| 发版 | 每日 07:00 批次发版 | 唯一发版通道：先判 `last..main` 有无当日迭代，再定发布点、查版本前置、构建、推 tag（推前等人放行） | 常驻，每日 07:00（`0 7 * * *`）；急修仅限崩溃 / 数据损坏 / 公开版主链路不可用 / 安全四类 |
| 对外收口 | 版本发布对外回帖与 Issue 收口 | 只对 brief 点名的 Issue 用 `munk-agent` 身份回帖并按指示关闭，复核评论作者 | 常驻，每日 10:00（`0 10 * * *`），只做 brief 点名的那一版 / 那几条 Issue |
| 巡检 | GitHub 高频应急哨兵（Issue / PR / Actions 异常） | 分诊、回执、建档、游标；带 guard 指纹与 `seen.txt` 去重 | 常驻，每 5 分钟（`*/5 * * * *`）+ sentinel guard；`exit=0` 有新事件、`exit=1` 无、`exit=2` 自错 |

维护口径：

- 说明书只放**下一版仍成立**的内容；版本号 / sha / URL / 证据目录走 `brief`，digest 首段原样抄 brief 全文。
- 一次性 task 退役走**归档，不删除**。
- 同一 cron 不得两条并存。
- 对外承诺必须与运营任务的 `scheduleEnabled` / cron 一致。

来源：产品目录 `projects/ops_df43e423451170fd/tasks/*.md` 的 `title` 与职责、产品约定 `AGENTS.md` 对外与运营。
