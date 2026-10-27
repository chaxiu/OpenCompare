# v0.2.8 发布面、证据归档与口径改写

## 范围

本 Phase 只做 v0.2.8 的发布面收尾与发布证据口径改写，一次提交交付，零产品代码改动：

1. `README.md` / `README.zh-CN.md` 各只改第 5 行「最新公开版本 / Latest public release」，`v0.2.7` → `v0.2.8`（链接与版本号两处同步）。
2. 新建 `docs/release-evidence/v0.2.8.md`：发布点、11 件资产、dmg 实测、L1 公开包复验、负载面对照复测、tarball mtime 边界、新判定口径。
3. `docs/release-evidence/v0.2.7.md` 原文逐字保留，追加对照复验小节、机制更正句与新判定口径；原 §8「已知遗留」并入新的末节，不留重复编号。
4. `docs/release-signing.md` 只前移当前状态锚点、第三节标题与 v0.2.8 条目；v0.2.7 降为历史条目并删除「四条负载腿标 blocked」复述。
5. `src/main/release-packaging.test.ts` 成组翻面锚点至 v0.2.8，把 v0.2.7 证据断言整体改写成显式历史块并保留全部 11 项 sha256 钉板。

数据源唯一为 `.munk/work-set/overview.md` 第 3 节事实钉板。所有数字只从该节取；外部 run 证据目录（`projects/ops_df43e423451170fd/...`）在本环境不可读，禁止尝试读取、禁止重新 `gh release view` / 下载资产 / 打包 / 公证 / 采样。

## 验收

- ac-readme-en-line5: `README.md` 第 5 行为 `> Latest public release: [v0.2.8](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.8) — Developer ID signed and Apple-notarized macOS build.`，`git diff --unified=0 README.md` 恰好一个 `+1/−1` hunk 且该 hunk 只含这一个内容替换。
- ac-readme-zh-line5: `README.zh-CN.md` 第 5 行为 `> 最新公开版本：[v0.2.8](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.8) — macOS 安装包经 Developer ID 签名与 Apple 公证。`，`git diff --unified=0 README.zh-CN.md` 恰好一个 `+1/−1` hunk。
- ac-readme-rest-untouched: 两版 README 除第 5 行外 `git diff --unified=0` 零 hunk；第 3 行互链、9 个 H2、两枚徽章、截图引用与「除第 5 行外无 `vX.Y.Z`」断言保持成立。
- ac-evidence-v028-exists: `docs/release-evidence/v0.2.8.md` 存在且非空，`status: verified` 恰好 1 处，全文无 `TODO`/`TBD`/`FIXME`/`待回填`/尖括号占位/第二个 `status:`。
- ac-evidence-v028-release-point: 该文件含 tag `v0.2.8`、commit `356ad044faf3b9b246f89990aaa72033fc2203a5`、CI run `40427569024`、公开地址 `https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.8`，以及「不重指、不重打」的 tag 约束表述。
- ac-evidence-v028-jobs: 该文件含五行 job 结论表（`Quality gates` / `Package win` / `Package linux` / `Package mac` / `Publish the GitHub Release`），每行均含 `success`。
- ac-evidence-v028-assets: 该文件含 11 件资产名称与公开 URL（`releases/download/v0.2.8/<name>`）；仅 dmg 行写 `113,437,237` B 与 `2917a65b93368b717d610770c6ef19ef7557b1bd953c9e2161fa5a7c03729458`，其余 10 行的摘要列写「见发布期证据」。
- ac-evidence-v028-no-invented: 该文件不出现 Release id 数字、`published_at` 时间戳、公证原始输出标记（`valid on disk` / `stapler` / `spctl` / `accepted` / `Notarized Developer ID`）、其余 10 件资产的字节数或 sha256、tag 对象 SHA。
- ac-evidence-v028-l1: 该文件 §7 段含 `trun_e9d687a57b51de6f` 与「零失败」，且不复述未提供的逐项数字。
- ac-evidence-v028-load: 该文件负载面段含 `8,262 ms`、`7,898 ms`、`35.8 万`、`32.6 万`、3 条采样 0 回退、取消 `116 ms` 零残留、`855.5 MiB`、`1,310.4 MiB`、`trun_ecbdd72beef29b0a`，并明确写「v0.2.7 已实测同一管线，本场为对照复测」与 tarball mtime 边界（size/mtime 快路径判 modified、测的是元数据扫描管线而非 hash 管线、hash 管线引用 `trun_4ba3dfc950d639e7`）。
- ac-evidence-v028-no-pass-word: 该文件 §7 至文末（含 §7/§8/§9/§10）不出现字面「通过」「已通过」，改用「零失败」「满足判定口径」。
- ac-evidence-v027-preserved: `docs/release-evidence/v0.2.7.md` 原 §1–§7 逐字保留：11 项资产 sha256、五行 job、`ZenMind`、`Δ3=2.06 MB`、`blocked` ≥4 处、`116 ms`、`3,043 / 5,262 / 46,827 / 1,377`、`51,247 / 9,682 / 53,466` 均仍在。
- ac-evidence-v027-appendix: 该文件追加复验段含 `trun_4ba3dfc950d639e7`、`301,311`/`301,300`、`8.6 s`/`8.1 s`、0 回退、`116 ms`、`976 MiB`/`1,439 MiB`，并含机制更正句（size/mtime 快路径已判 modified，并未迫使走完读取+对比 hash 路径）与「原 blocked 结论是历史事实，不据此改写」；末节编号连续无重复。
- ac-verdict-caliber: 两份证据文件均逐字包含两个可执行口径与恢复条件：冷跑在 180 s 内完成；取消在进度出现后的任意时点可点且回退干净（无半棵树 / 无残留四态 / 异常计数 0）；恢复「≥180 s 持续扫描/哈希」或「15 s 定时取消点」须另指专用大磁盘机器（≥60 GB/侧），属公司负责人裁定的口径变更；并写明不再逐版记 blocked。
- ac-signing-anchor: `docs/release-signing.md` 第 5 行锚点为 `当前状态：v0.2.8 已发布` 并链接 `releases/tag/v0.2.8` 与 `docs/release-evidence/v0.2.8.md`；第三节标题为 `正式版发布姿态（v0.2.8）`；新增 v0.2.8 条目含 11 件资产、CI run `40427569024` 五 job 全 success、证据文件链接且不写 `blocked`；v0.2.7 条目降历史且不含「四条负载腿标 blocked」复述；`本版发布说明见 docs/release-notes/v0.2.8.md`；第四节含「tag 之后的修复由 v0.2.8 承接」；第五节含「v0.2.8 已发布」。
- ac-signing-untouched: `docs/release-signing.md` 的 6 项 Secret 表、v0.1.2 漂移原文、祖先门语义段、第六节硬校验逐字保留（`git diff` 不触及）；`docs/release-notes/**`、`docs/release-process.md`、`CHANGELOG.md`、`package.json` 零 diff。
- ac-test-anchors-flipped: `src/main/release-packaging.test.ts` 中 `latestPublishedTag = 'v0.2.8'`、`previousPublishedTag = 'v0.2.6'`、`publishedTags` 以显式字面量含 `'v0.2.7'`；版本门改为 `expect(latestPublishedTag).toBe(currentTag)`，删除 `not.toBe` 与 `isTagBefore(latestPublishedTag, currentTag)`，保留 `isTagBefore(previousPublishedTag, latestPublishedTag)` 与 `isTagBefore(previousPublishedTag, currentTag)`。
- ac-test-v027-history: v0.2.7 历史证据块保留 11 项资产 sha256、五 job、Release id `422765578`、`published_at`、`blocked` ≥4、`ZenMind`、`2.06`、`116 ms`；v0.2.1/v0.2.2/v0.2.4/v0.2.5/v0.2.6 历史块零 diff；`it(` 条数不减少，无 `toBeTruthy()` 降级、无 `skip`、无注释掉断言、无放宽正则。
- ac-test-v028-assertions: 新增/改写后的 v0.2.8 断言覆盖 `status: verified` 恰 1 处、commit `356ad044…`、CI run `40427569024`、五 job 行 success、11 个资产名与公开 URL、dmg `113,437,237` 与 `2917a65b…`、L1 零失败、`trun_ecbdd72beef29b0a`/`trun_4ba3dfc950d639e7`、对照复测声明、mtime 边界、两个可执行口径；且不要求 v0.2.8 出现 Release id / `published_at` / 公证原文 / 11 项 sha256。
- ac-test-slice-boundaries: 证据 L1「不宣称通过」断言切片按 `## 7.`→`## 8.`（追加段不被误判）；CHANGELOG 当前段为 `## v0.2.8`..`## v0.2.7`，幽灵版本切片终点与 v0.2.7 历史起点为字面量 `## v0.2.7`，标题集合期望 `['v0.2.8']`，排序链插入 v0.2.7 并保留 v0.2.6→v0.2.5→v0.2.4→v0.2.2→v0.2.0→v0.1.2。
- ac-gates-green: 默认 9 道 `code_gates`（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）全部退出码 0；`pnpm test` 覆盖 `release-packaging.test.ts` 与 `release-evidence.test.ts`。
- ac-change-surface: `git diff --name-only` 恰为 6 个文件：`README.md`、`README.zh-CN.md`、`docs/release-evidence/v0.2.8.md`、`docs/release-evidence/v0.2.7.md`、`docs/release-signing.md`、`src/main/release-packaging.test.ts`；不含任何其他 `src/**`、`package.json`、`CHANGELOG.md`、`.github/workflows/**`、`electron-builder.yml`、`.munk/code-gates.json`。
- ac-delivery-notes: 交付说明写明被测 commit `356ad044faf3b9b246f89990aaa72033fc2203a5`、逐文件 `git diff --name-only` 与 `--numstat`、9 道门退出码、`pnpm test` 汇总，以及「未打 tag / 未 push / 未 publish / 未重跑公证 / 未重采样 / 未改 Release 资产」零副作用声明。

## 非目标

- 不改 `src/` 业务代码（preload / renderer / `src/core/` / `src/shared/`）；`src/` 下只允许改 `src/main/release-packaging.test.ts`。
- 不改 `src/main/release-evidence.test.ts`（其 v0.2.7 显式路径块继续守卫）。
- 不改对比语义、cache / 树渲染 / 扫描实现，不动 `docs/perf/**` 历史数字。
- 不 bump `package.json#version`（已是 `0.2.8`）；不改 `CHANGELOG.md`、`docs/release-notes/**`、`docs/release-process.md`、`.github/workflows/**`、`electron-builder.yml`、`.munk/code-gates.json`。
- 不改 README 第 5 行以外的任何一行（第 3 行互链、9 节 H2 镜像、徽章、正文零 diff）。
- 不动任何已发布 tag / Release / 资产；不 push、不 publish、不 dispatch、不重跑公证、不下载或替换资产。
- 不跑 `perf:gate` / `perf:dir` / 任何真实 Electron 采样；不逐版补测 L2 负载腿。
- 不新增 / 删除门禁类别；不新增发布公告、版本表或版本直链。
- 不改 `.munk/baseline/domains/release/product.md`（旧 `ac-evidence-l1-blocked` 口径由 Product Ops 另行同步）。
- 不顺手润色、不做无关格式化、不重构测试文件结构。

## 实现约束

- 事实数据源唯一：`.munk/work-set/overview.md` 第 3 节。外部 run 证据目录不可读，不得读取、不得重新取数、不得从缺省模式推导未给出的字节数或 sha256。
- 未提供字段（Release id、`published_at`、tag 对象 SHA、其余 10 件资产字节与 sha256、公证原始输出）在 v0.2.8 证据中只写「以发布期证据 `trun_77eb52ceff8c28c5` 为准」，不写数字也不写通过标记。
- v0.2.8 证据节序沿用 v0.2.7：① tag 与构建检出 ② 公开 Release ③ CI run 与五 job ④ 11 件资产表 ⑤ 唯一性与 latest 门 ⑥ macOS 签名/公证 ⑦ L1 复验 ⑧ 负载面复验 ⑨ 判定口径 ⑩ 已知遗留/边界；具体节号编排由 Coding 定稿，但须满足上文断言面。
- 测试手术只允许锚点前移引发的机械改写：常量、相等/不相等翻转、显式历史块拆分、切片边界改字面量、断言事实集收窄到已给事实。
- 判定口径两处写同文，逐字一致（180 s / 取消任意时点 / ≥60 GB 恢复条件 / 公司负责人裁定 / 不再逐版记 blocked / 保留 v0.2.7 历史 blocked 不改写）。
- 所有命令按 argv 单条执行；9 道门退出码如实在交付说明记录，禁止绕行或注释换绿。
