# English-default README with Chinese mirror and English repo metadata

## 范围

1. **README 双语化**：`README.md` 改为英文默认正文；新建 `README.zh-CN.md` 中文版。两版顶部互链（`English | [简体中文](./README.zh-CN.md)` / `[English](./README.md) | 简体中文`），正文事实完全一致。
2. **写实既有事实（两版都写）**：
   - v0.2.6 修复 Windows 上四个入口（CLI 冷启动 `--left` / `--right`、二次实例接管、手工输入路径、`opencompare://` 链接）的绝对路径被拼到 cwd / baseDir 的问题；盘符、盘根、UNC 路径按原样解析。
   - 安装与首次启动步骤：macOS arm64 `.dmg` 拖入 Applications；Windows `OpenCompare-Setup-<version>.exe` 安装；Linux `.AppImage`（`chmod +x` 后运行）与 `.deb` 安装；首次启动进入工作台，可用内置样本或打开两个本地路径开始对比。
   - 支持平台：macOS arm64（Developer ID 签名 + Apple 公证的 `.dmg`）、Windows（NSIS `.exe`）、Linux（`.AppImage` + `.deb`，amd64）。
   - 已知问题段：保留并英文化 v0.2.6 四入口修复、悬空符号链接、EMFILE、同进程多轮内存、取消 `ECANCELED` 五类，版本归属不改。
3. **内存只引用已归档证据并标口径**：引用 `docs/perf/upsert-memory-diagnosis-2026-10-23.md` 与 `docs/perf/large-directory-memory.md`；写清冷跑（新根首轮哈希 76,604 文件 / 11,105,870,346 B，墙钟 21.6–22.5 s，ready 峰值 694–706 MiB）与热跑（`hashedFiles=0`，墙钟 8.5–10.0 s，ready 峰值 1.68–1.81 GiB，+20 s 静置 1.24–1.28 GiB）口径；另列打包 app L3 首跑口径（产品负责人另排、证据归档在仓库外）：3 会话 1.3M 级并发热轮 ready 峰值 1.9–2.0 GiB、静置 1.6–1.9 GiB、app 峰值约 2.15–2.5 GiB 区间。删除任何「必须压到 1536 MiB」的自设线表述，不承诺修复时间表。
4. **回链「Kill Paid Apps」**：两版都链接 001 号平替项目主页/仓库 `https://github.com/munk-sh/kill-paid-apps`，并注明 OpenCompare 是 Beyond Compare 5 Pro 的免费 MIT 平替。
5. **GitHub 仓库简介与 Topics 同步英文**：写清目标英文简介、Topics 列表与可直接执行的 `gh repo edit` 命令到 `docs/repo-metadata.md`；作为**独立最后一步**执行。若 `gh` 写操作被权限/放行卡住，如实记录原始报错并停止该步，不得为此卡住 README 文件本体交付。
6. **测试断言同步**：`src/main/release-packaging.test.ts` 中所有依赖 README 的断言按英文默认 + 中文镜像更新；版本与资产名继续从 `package.json#version` 派生，不新增版本字面量。

## 验收

- ac-readme-en-default: `README.md` 非空且首行为 `# OpenCompare`；除顶部语言切换行外全文不含汉字（`\p{Script=Han}` 匹配数为 0），且不含中文二级标题（`## 已知问题` / `## 核心能力` / `## 版本与下载` 均为 0 次）。
- ac-zh-mirror-exists: `README.zh-CN.md` 非空且首行为 `# OpenCompare`，含 `## 版本与下载`、`## 安装与首次启动`、`## 支持平台`、`## 已知问题`、`## 发布流程`、`## 项目结构` 六个二级标题。
- ac-crosslinks: `README.md` 前 10 行内出现 `[简体中文](./README.zh-CN.md)`，`README.zh-CN.md` 前 10 行内出现 `[English](./README.md)`；两个相对链接的目标文件都存在且非空。
- ac-five-line-status: 两版均保持第 1 行标题、第 3 行语言切换、第 5 行发布状态块；第 5 行（index 4）分别含 `Release status:`（英文）/ `当前发布状态：`（中文）、当前 tag、`releases/tag/<currentTag>`、`docs/release-notes/<currentTag>.md`、`Developer ID`、公证、`fail-closed`、`App Store Connect API Key` 与 6 个 secret 名（`CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_TEAM_ID` / `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`）。
- ac-v026-four-entries: 两版都含 `v0.2.6`、`opencompare://`、`--left`、`--right`、`UNC`，并链接 `docs/release-notes/v0.2.6.md`；四个入口各有可识别文案：CLI 冷启动（`CLI`）、单实例接管（英文 `single-instance` / 中文 `单实例`）、手工输入（英文 `manual` / 中文 `手工`）、协议链接（`opencompare://`）。
- ac-install-first-launch: 两版都含 macOS `.dmg` 拖入 Applications、Windows `OpenCompare-Setup-<version>.exe`、Linux `chmod +x` + `.AppImage` 与 `.deb` 安装命令/步骤，并含首次启动说明（英文 `First launch` / 中文 `首次启动`）与内置样本入口。
- ac-platforms: 两版都写明 macOS arm64（签名 + 公证）、Windows `.exe`、Linux `AppImage` + `deb`；不含 macOS Intel / Windows arm64 / Linux arm64 等未发布产物的宣称。
- ac-memory-sources: 两版都链接 `docs/perf/upsert-memory-diagnosis-2026-10-23.md` 与 `docs/perf/large-directory-memory.md`；都标出冷跑 / 热跑 / +20 s 静置 / L3 首跑四种口径。
- ac-memory-ranges: 两版都出现 `1.9-2.0 GiB`、`1.6-1.9 GiB`、`2.15-2.5 GiB` 三个区间（允许 en dash，测试先归一化），且与 L3 首跑口径绑定，不写成产品承诺。
- ac-memory-cold-warm: 两版都出现 `76,604`、`11,105,870,346`、`21.6`、`22.5`、`8.5`、`10.0`、`hashedFiles=0`，冷跑与热跑分列，峰值与静置分列。
- ac-no-1536-target: 两版正文均不出现 `1536`，且不出现「必须/需要/MUST/must ... 压到/降到/≤ 1536」类目标表述；内存描述只陈述实测值与口径。
- ac-no-timeline: 两版与 `docs/repo-metadata.md` 均不含 `TODO` / `TBD` / `FIXME` / `待补` / `预计` / `roadmap`，不承诺修复版本或日期。
- ac-known-issues: 两版已知问题段都保留 `v0.2.6` 四入口修复、`v0.2.2` 悬空符号链接、`v0.2.1` EMFILE、`v0.2.5` 内存收敛、`v0.2.5` 取消 `ECANCELED` 五条；每条版本归属与现有 CHANGELOG / release notes 一致。
- ac-kill-paid-apps: 两版都含 `https://github.com/munk-sh/kill-paid-apps`、`001`、`Beyond Compare 5 Pro`，且该 URL 为绝对链接。
- ac-parity: 两版都含 `v0.2.6`、`docs/release-notes/v0.2.6.md`、`opencompare://`、`UNC`、`docs/perf/upsert-memory-diagnosis-2026-10-23.md`、`https://github.com/munk-sh/kill-paid-apps`，以及由 `pkg.version` 派生的四件 v0.2.6 资产名（arm64 dmg / Setup exe / AppImage / amd64 deb）。
- ac-repo-metadata-doc: `docs/repo-metadata.md` 非空，含英文简介（≤350 字符）、1–20 个不重复的小写 kebab-case Topics、以及可直接执行的 `gh repo edit chaxiu/OpenCompare` 命令（`--description` + 每个 topic 一条 `--add-topic`）；文档不含 token / secret / `gho_` / `ghp_` 等凭据字样。
- ac-gh-last-step: `docs/repo-metadata.md` 明确标注执行顺序为「所有文件改动与门禁通过后的独立最后一步」，并要求失败时记录原始报错、不阻塞 README 交付。
- ac-tests-both-readmes: `src/main/release-packaging.test.ts` 同时读取并断言 `README.md` 与 `README.zh-CN.md`；`documentPaths()` 同时包含两版；共享事实两版都有断言，不允许只改英文而让中文断言悬空。
- ac-tests-version-derived: 更新后的 README 断言使用 `pkg.version` / `currentTag` / `latestPublishedTag` 派生版本与资产名；交付 diff 中新增的 README 相关代码不含新的 `0.2.6` / `v0.2.6` 字面量。
- ac-gates: `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm build:web`、`pnpm test` 全部通过。
- ac-release-files-untouched: `git diff --name-only` 只出现 `README.md`、`README.zh-CN.md`、`docs/repo-metadata.md`、`src/main/release-packaging.test.ts`（以及 `.munk/changes/**`）；`package.json#version`、`CHANGELOG.md`、`docs/release-notes/**`、`docs/release-evidence/**`、`docs/release-signing.md`、`electron-builder.yml`、`.github/**` 零改动；未打 tag、未创建/编辑 Release、未 push、未打包。
- ac-delivery-report: 交付说明列出改动文件、门禁结果、`git diff --name-only`、`gh repo edit` 的实际结果（成功则贴 `gh repo view --json description,repositoryTopics` 输出；失败则贴原始报错并注明 README 文件已交付），以及「未做任何内存 / 性能采样」的声明。

## 非目标

- 不改产品代码、UI、算法、IPC、`src/**`（唯一例外是 `src/main/release-packaging.test.ts` 的 README 断言）。
- 不做任何内存 / 性能诊断、优化、复测或采样；不新增 benchmark、不跑打包 app、不改阈值、不把 1536 MiB 写成产品目标。
- 不改 `package.json#version`、`CHANGELOG.md` 既有段、`docs/release-notes/**`、`docs/release-evidence/**`、`docs/release-signing.md`、`electron-builder.yml`、`.github/**`；不打 tag、不改 Release、不 push、不打包、不发版。
- 不改 `munk-sh/kill-paid-apps` 仓库；不新建项目主页或部署站点；只做 OpenCompare 侧回链。
- 不新增截图、徽章、图片资产、docs 站点、SEO 文案；不重排现有文档结构以外的无关内容。
- 不改 `AGENTS.md`、`docs/perf/**`、`docs/symlink-no-follow.md`、`docs/brand-assets.md` 等既有文档。
- 不宣称未验证事实：Windows / Linux 的内存实测、最低系统版本、遥测、自动更新渠道、修复时间表或未来版本计划。
- 不为了迁就测试而放宽或删除既有版本 / 发布一致性断言；测试只能按新语言结构调整，不能变恒绿。

## 实现约束

- **允许修改的文件**：`README.md`、`README.zh-CN.md`（新建）、`docs/repo-metadata.md`（新建）、`src/main/release-packaging.test.ts`。其余文件零改动。
- **README 两侧结构对齐**：两版保持同一节序与同一事实集合；标题可本地化，但版本表、安装步骤、支持平台、内存口径、已知问题、发布流程的条目一一对应。
- **第 5 行状态块**：两版都用「标题 / 空行 / 语言切换 / 空行 / 状态块」的开头，保留现有 `readme.split('\n')[4]` 断言可继续生效；若最终结构必须调整，则把测试改为按内容定位状态行，并对两版同时断言，禁止只改索引。
- **发布事实不缩水**：英文状态行与中文状态行都必须保留当前 tag、最新公开 Release 链接、release notes 链接、Developer ID 签名 + Apple 公证、`fail-closed`、`App Store Connect API Key` 与 6 个 secret 名（现有测试会断言）。
- **测试策略**：既有中文断言优先改指 `README.zh-CN.md`（保留原事实），再为 `README.md` 增加等价英文断言；`documentPaths()` 同时收录两版；版本 / 资产名一律走 `pkg.version` 与 `currentTag`，不新增版本字面量。
- **内存数字来源**：冷跑 / 热跑 / 静置数字只允许来自 `docs/perf/upsert-memory-diagnosis-2026-10-23.md` 与 `docs/perf/large-directory-memory.md`；L3 首跑只写「负责人另排、证据在仓库外」的区间，不编造逐轮数字、不重采样。
- **删除自设线**：两版正文不出现 `1536`，不写「必须压到 / 降到 1536 MiB」；如需说明采样口径，只描述实测峰值与静置，不设产品目标。
- **L3 口径标注**：`1.9-2.0 GiB` / `1.6-1.9 GiB` / `2.15-2.5 GiB` 必须明确标注为打包 app L3 首跑、3 会话 1.3M 级并发热轮口径，与仓库内 `perf:dir` 口径分开。
- **Kill Paid Apps**：只做外链，URL 固定 `https://github.com/munk-sh/kill-paid-apps`；说明 001 号平替关系，不改对方仓库。
- **gh 元数据最后一步**：先完成 README / 中文镜像 / 测试 / 门禁，再执行 `gh repo edit`；`gh` 已登录（`chaxiu`，scopes 含 `repo`），若写操作被拒或需要放行，记录原始 stderr 后停止该步，不得回滚或阻塞文件交付。
- **不落敏感信息**：`docs/repo-metadata.md` 只写命令与文案，不写 token、secret、`.p8` 内容或账号凭据。
