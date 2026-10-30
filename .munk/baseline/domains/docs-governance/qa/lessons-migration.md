# 教训与口径沿革迁移到 docs/lessons.md（纯文档迁移）

- WI：`wi_ws_080b8b27f763d761`（`key: lessons-migration`）
- 域：`docs-governance`（新建；文档归属与写作口径层，不是发版轮、不是实现轮）
- 来源：`.munk/changes/wi_ws_080b8b27f763d761/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**`、无 `tech.md` / `ux/**`）
- 交付：`docs/lessons.md`（新增，185 行）+ `README.md` / `README.zh-CN.md` 各 +2 行，`deliveryIntent: local merge`，`needSelfTest=false`

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-lessons-created | `docs/lessons.md` 185 行、UTF-8 中文；`grep -n '^## '` 得 8 个二级节（`## 1.`–`## 8.`），第 1 节含 `### 1.1` / `### 1.2` / `### 1.3` 三个子节 | 满足 |
| ac-v027-legs | 1.1 节四条腿原名 + `blocked` 判定齐备（`180 s` 冷跑 / `60 s` / `3 s 采样` / `15 s` 取消点），blocked 原因含 `9,674` 文件与基线 `745,652`，并写「不据此否定 v0.2.8 收口口径」 | 满足 |
| ac-v028-boundary | 1.2 节含 `358,155` / `358,208`、`32.6 万文件 / 侧`、冷跑 `8,262 ms`、热跑 `7,898 ms`、取消 `116 ms` 零残留、`855.5 MiB` / `1,310.4 MiB`；mtime 适用边界整段原样保留（「只测元数据扫描管线…不是 hash 管线」） | 满足 |
| ac-v029-export | 1.3 节含 `6,907 ms`、`289 ms` / `9,999,926 B` / `68,865` 行、`1,325 MiB` / `764.9 MiB`、`38 ms` / `120 ms` / 0 文件 0 `.tmp`、四态 `35 / 80 / 41 / 326,099`、`Showing 68865 of 358249 (truncated)` 与 M = `358,249`、commit `a1e91cb3`、证据路径 `projects/ops_df43e423451170fd/.munk/runs/trun_100be579fd6a9610/evidence/stages.md` | 满足 |
| ac-mib-whitelist | 1.3 节「MiB / GiB 白名单沿革」写明 v0.2.9 两项、v0.2.10 六项（按文档顺序）与断言位置 `src/main/release-packaging.test.ts`（白名单外/顺序变化即红） | 满足 |
| ac-upsert-diagnosis | 第 2 节含 `1,742 MiB` / `1,659 MiB`、组① `1,726` / `1,723` MiB、组② `1,716 MiB`、根因「React fiber ref / 虚拟列表闭包持有历史对比」、`+20 s` 静置 `<1300 MiB`、app 总 RSS `<2560 MiB`、热跑 `8.5–10.0 s`、§10 推荐 **a** 支、`docs/perf/upsert-memory-diagnosis-2026-10-23.md` 路径 | 满足 |
| ac-windows-entries | 第 3 节四入口（CLI 冷启动 / 二次实例 / 手输路径 / `opencompare://`）、`compareRequest` 认盘符与 UNC、六例回归、`code_gates` 增 `windows-latest`、优先级判定原文齐备 | 满足 |
| ac-appimage-blockmap | 第 4 节尾部 4 字节 uint32、LE/BE 双候选合法、三种 fail-closed、不产出 `*.AppImage.blockmap`、与 `scripts/release-metadata.mjs`（`extractAppImageEntries`）同批改 parity | 满足 |
| ac-readme-boundary | 第 5 节 docs 索引节标题即 `readmeSection(markdown, heading, next)` 截取边界、返回空串致断言静默失守、改标题须同批改两入参、旧 slug 合法残留面仅 `CHANGELOG.md` + `docs/release-notes/`、明写不要做全仓零命中断言 | 满足 |
| ac-v0210-empty-tag | 第 6 节四项事实（CI 红 / 零 Release / 零资产 / 永不重写·强推·删除）+ 对外不提 + 失败发补丁版 | 满足 |
| ac-issue5-grouping | 第 7 节：第 9 条已修复（358k 证据 + `a1e91cb3`）；纳入 8 条（1/2/3/5/6/7/8/11）与不纳入 2 条（4/10）分组照抄；第 4 条改判为「diff 行级差异指示条」并写明只做四态聚合绘制与点选跳转、不做文本缩略渲染、随 v0.2.11 发布；第 8 条拆分口径（配色随主题成套；字体/字号不纳入）；全节标注「不承诺任何版本与时间」 | 满足 |
| ac-ops-roster | 第 8 节 7 行表（验收 4 + 发版 1 + 对外收口 1 + 巡检 1），每条职责与触发口径（含 cron 与 guard 口径）；不写死任务 id，统一「id 用 `GET /tasks` 查」；维护口径四条（说明书只放下一版仍成立内容 / brief 承载版本 sha URL / 退役归档不删除 / 同一 cron 不并存） | 满足 |
| ac-evidence-paths-intact | 文中 `docs/release-evidence/v0.2.7.md`、`v0.2.8.md`、`v0.2.9.md`、`docs/release-notes/v0.2.9.md`、`docs/perf/upsert-memory-diagnosis-2026-10-23.md`、`scripts/release-metadata.mjs`、`src/main/release-packaging.test.ts` 均可 `ls` 命中；产品目录 run 路径按既有写法原样保留未缩写 | 满足 |
| ac-no-number-drift | 1.1 节对 `9,674` 与 `docs/release-evidence/v0.2.7.md` §7 的 `9,682` 两种取数如实并列并注明「同一事实的两种取数，不构成口径冲突」；历史 blocked 记录全部保持 blocked，未按 v0.2.8/v0.2.9 复验结论重述 | 满足 |
| ac-readme-links | `README.md:72` 与 `README.zh-CN.md:72` 各 1 个 `docs/lessons.md` 链接，英文为纯拉丁链接文字；英文版汉字仅第 3 行语言切换 `简体中文`（4 字）；两版 `MiB` / `GiB` 零命中；H2 各 9 节且顺序不变；英文词数 357（prd 口径：去代码块/链接/https/行内代码/HTML 后 `[A-Za-z][A-Za-z0-9'’-]*` 计数，≤ 700） | 满足 |
| ac-gates-green | `.munk/runs/run_ws_e343d77aee09a13b/code-gates/attempts/001`：9 道 gate 全 `passed` / exit 0（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）；`test` 门 69 files / 1104 passed + 1 skipped（1105）/ 27.88s，含 `release-packaging.test.ts` 的双语镜像与 docs 索引导航断言 | 满足 |
| ac-diff-scope | `git status --porcelain` 产品面仅 `M README.md`、`M README.zh-CN.md`、`?? docs/lessons.md`；`src/`、`package.json`、`CHANGELOG.md`、`.github/workflows/release.yml`、`docs/release-notes/**`、`docs/release-evidence/**` 零 diff | 满足 |
| ac-single-commit-clean | 产品面单提交（fold 前工作区仅上述三项；`.munk/**` fold 为 Delivery 独立提交）；交付时无残留脏文件 | 满足 |
| ac-agents-measured | 产品目录 `AGENTS.md`：`wc -l` = **68**；去标点 CJK 汉字数 = **2,245**（`python3` 遍历 `[\u4e00-\u9fff]`），统计命令见下 | 满足 |

统计命令（本项实测）：

```
wc -l "/Users/zhutao/Library/Application Support/Munk AI/munk-auto/products/codebase_b2d550b56d98d0c5/AGENTS.md"
python3 -c "import re,sys;t=open(sys.argv[1],encoding='utf-8').read();print(len(re.findall(r'[\u4e00-\u9fff]',t)))" "<产品目录>/AGENTS.md"
```

## 关键事实核对（anti-drift）

- **产品侧 AGENTS.md 尚未真正精简**：实测 68 行 / 2,245 汉字，与 prd 给的对照基线完全一致 → 说明这一轮只是先把承接落点（`docs/lessons.md`）建好，产品约定本体仍是原样。交付说明里报的是本机重测值，不是抄 prd 的数。
- **仓根 `AGENTS.md` 已是精简版（46 行，主分支既有，本项零 diff）**，但它不指向 `docs/lessons.md`——prd 非目标明确「不重写产品 AGENTS.md」，故本项不补该入口；后续若要让 agent 发现这份沿革，需另开工作项。
- **README 的截取边界是隐藏陷阱**：本项只在 docs 索引节追加一行、不动 `## Evidence and docs` / `## 证据与文档` 标题，因此 `readmeSection` 的 `heading` / `next` 参数无需同批改；一旦动标题就会返回空串让断言静默失守（见第 5 节）。
- **带单位数字只留在本文件**：两版 README 仍零 `MiB` / `GiB`，六项 v0.2.10 白名单与两项 v0.2.9 白名单全部落在 `docs/lessons.md` 里，`release-packaging.test.ts` 的断言不受影响。
- **11 条 Issue 定性不承诺版本时间**：第 7 节把原文分组照抄（纳入 8 / 不纳入 2 / 已修复 1），只给第 9 条与第 4 条补已经发生的事实，不给其余条目排期。

## 最近执行

- workItemId: wi_ws_080b8b27f763d761
- at: 2026-10-30
- status: pass
- note: 19 条 AC 全部满足，无偏差。本轮 `needSelfTest=false`，跳过 UI 自测，以 Host `code_gates` 为交付门槛（9 gates，attempt 001，`.munk/runs/run_ws_e343d77aee09a13b/code-gates/attempts/001`，全 exit 0；`pnpm test` 69 files / 1104 passed + 1 skipped / 1105 / 27.88s）。不新增自检脚本，AC 复核用 grep / python3 一次性命令（两版 H2 计数、英文词数 357、汉字仅语言切换行、`MiB|GiB` 零命中、8 个二级节、关键数字与证据路径逐条命中）。边界：不做发版动作（不推 tag / 不改 Release）、不重测任何负载腿、不复制 run 目录或截图进仓。
