# Changelog

OpenCompare 的版本变更记录。格式遵循 [Keep a Changelog](https://keepachangelog.com/)，版本号遵循 [语义化版本](https://semver.org/)。

## v0.2.13

本版是两项已合入主干的收口：结构化语义对比的定位同步补齐单侧新增 / 删除时的祖先回退，结构化语义门的默认矩阵从 9 门扩到 10 门。对比与合并算法、目录扫描、快照格式与发布通道都没有改动。

### 改进

- **P1 语义定位收尾**：单侧新增 / 删除时，缺失的一侧落到最近的共同祖先行并叠加 `opacity-60` 弱化高亮；存在精确对应行时仍然精确落位、不回退。
- **结构化语义门**：默认门数 9→10，结构化 / 语义（`structured` / `semantic`）对比纳入同一套门禁口径。

### 不做的事

- 不改对比与合并算法：四态语义、行级差异结果与三向合并行为保持原状。
- 不改目录扫描、快照格式与发布通道。

### 升级方式

建议从 v0.2.12 升级。本次不变更数据格式，已有会话与设置照常可用。

## v0.2.12

本版是 UI 第一期的发布收敛：窗口壳层按单一尺寸表重排为五级，图标改为仓库内自带的单一出口并移除 `lucide-react`，主题支持亮 / 暗 / 跟随系统三态，会话 tab 标题按长路径截断，README 双语换成真实构建截图。对比与合并算法、目录扫描、快照格式与发布通道均未改动。

### 改进

- **壳层五级重排**：窗口壳层按单一尺寸表与三档宽度重排为五级，20 条入口清单逐条核对后零丢失。
- **图标单一出口**：`ICON_PATHS` / `SHELL_ENTRY_ICONS` / `UI_ICON_ACTIONS` 收敛为一张映射表，图标在仓库内自带；`lucide-react` 已移除。
- **亮 / 暗 / 跟随系统三态主题**：同一组 `--color-*` token 驱动三态，设置里的主题分区即时生效，`UserSettings` 持久化且损坏时回退默认。
- **会话 tab 标题截断**：标题与副标题按同一张三档预算表裁剪，长路径不再挤压相邻 tab。
- **README 双语截图**：两版 README 换成真实构建截图（工作台与文件对比各一张）。
- **窄窗口工具栏兜底**：目录工作台窄窗口（≤1024）首行工具栏改为行容器横向滚动兜底，宽档像素不变。

### 文档

- `docs/ui-phase1-reference-audit.md` 与 `docs/lessons.md` 随同一批改动收尾，设计基线文档同步更新。

### 升级方式

建议从 v0.2.11 升级。本次不变更数据格式，已有会话与设置照常可用。

## v0.2.11

本版是 v0.2.10 两项补发内容加一次测试稳定性修复：双栏文本 / 代码对比的侧边新增一条常驻的竖向行级四态差异指示条，用来先看清整份文件的差异分布，再直达目标差异行；大行数双栏对比改为可视窗口渲染，只渲染视口内的行元素；另外给 358,000 行同步遍历用例补上显式 `30_000` per-test 超时，消掉 CI 慢 runner 上的 5s 超时红灯。对比与合并算法、目录扫描与快照格式均未改动。

### 新增

- **双栏 diff 侧边常驻竖向四态差异指示条**：指示条按本次对比已算出的行级 `same` / `added` / `removed` / `modified` 四态聚合，把有差异的行（新增 / 删除 / 修改）在窄条上按对应状态标出，相同行不着色；只做位置与状态映射，不渲染任何行内文字。
- **随滚动同步**：滚动任一栏时，指示条上的视口窗跟随移动，标出的差异位置与对应行号不变。
- **点选跳转**：点选指示条上的任一标记，两栏一起滚动到该差异块的首行，工具栏的差异计数与标记同步；也支持键盘方向键在差异块之间循环、回车重新定位。

### 修复

- **CI 测试稳定性：358,000 行同步遍历用例补显式 `30_000` per-test 超时**：`src/renderer/src/components/DiffRuler.scale.test.tsx` 的逐行覆盖用例此前走 vitest 默认 5000ms 超时，CI attempt1 实测 6,816ms 撞上限被判超时；同版本本机全量 `pnpm test` 为 27.42s / 69 files / 1104 passed。现改为显式 `30_000` per-test 超时，相对 6,816ms 约 4.4x 余量；358,000 行规模与全部断言不变，全局 `testTimeout`、产品代码与产品行为均未改动。

### 不做的事

- 不做文本缩略图 / minimap 渲染：指示条只画状态标记与视口窗，不渲染文本缩略。
- 不新增扫描或哈希：指示条复用本次对比已算出的行级差异结果，不额外读取文件、不重新扫描目录、不计算哈希。
- 不改对比与合并算法：四态语义、行级差异结果与三向合并行为保持原状。

### 升级方式

建议从 v0.2.9 升级。下载 v0.2.11 对应平台的新安装包覆盖安装（macOS `.dmg` / `.zip`，Windows `OpenCompare-Setup-0.2.11.exe`，Linux `.AppImage` / `.deb`）。签名与公证口径不变：macOS 包经 Developer ID 签名 + Apple 公证，凭据缺失时 fail-closed。

## v0.2.9

本版是三项面向用户的收口与一项报告口径重述：目录对比 HTML 报告改为异步分块导出并支持进度 / 取消，会话标签页标题与副标题随会话事实实时派生，保存落盘改为原子写入并给出可读的写入错误；报告的行数与字节上限沿用 v0.2.8 的既有口径。对比算法、目录扫描与快照格式均未改动。

### 新增

- **目录对比 HTML 报告改为异步导出，显示进度并可取消**：导出分块生成，界面显示「正在导出 x / y 行」的进度，可随时取消；取消不弹保存框、不写文件，已保存 / 已取消 / 失败三种结果各自明确提示。报告本身仍沿用自包含单文件口径：内联 CSS、无 JS、无外链 CSS / 字体 / 图片与 http(s) 资源，`file://` 直接打开即可阅读；左右路径默认相对化并默认开启「隐藏本机路径」；保留四态计数与应用版本，`<html lang>` 跟随当前界面语言。

### 修复

- **会话标签页标题与副标题随会话事实实时派生**：换路径、换文件或从目录下钻返回后，标签页标题与路径副标题立即跟随当前会话，不再滞留创建时的文案；同名不同目录的文件对显示各自完整路径。
- **保存落盘原子化并给出可读写入错误**：保存先写同目录临时文件再 rename，失败时清理临时文件，不再留下半截文件；写入失败时给出可读原因（磁盘空间不足 / 只读 / 目标是目录）。

### 报告上限与截断口径（沿用 v0.2.8）

- 单份报告行数上限 200,000、字节上限 10 MB，均为 v0.2.8 起的既有口径，本版沿用不变；发生截断时报告内写明「已展示 N / 原始 M（已截断）」，并提示完整清单请在本机查看。

### 升级方式

建议 v0.2.8 及更早的用户升级到 v0.2.9。下载 v0.2.9 对应平台的新安装包覆盖安装（macOS `.dmg` / `.zip`，Windows `OpenCompare-Setup-0.2.9.exe`，Linux `.AppImage` / `.deb`）。签名与公证口径不变：macOS 包经 Developer ID 签名 + Apple 公证，凭据缺失时 fail-closed。

## v0.2.8

本版是面向用户的两项变化：目录对比结果可导出为自包含单文件 HTML 报告，对外品牌与入口更名为 Open Rebuilds。对比算法、目录扫描、快照格式与发布模型均未改动。

### 新增

- **目录对比结果导出为自包含单文件 HTML 报告**：目录视图工具栏提供常驻导出入口，经系统保存框落盘；产物内联 CSS、无 JS、无外链 CSS / 字体 / 图片与 http(s) 资源，直接用 `file://` 打开即可阅读。左右路径默认相对化到公共祖先，并默认开启「隐藏本机路径」开关；报告顶部固定一行「由本机生成，分享前自查路径」。报告保留四态计数与应用版本（与界面同源），`<html lang>` 跟随当前界面语言；行数上限 200,000、字节上限 10 MB，截断时报告内写明「已展示 N / 原始 M（已截断）」。

### 改进

- **对外品牌与入口更名为 Open Rebuilds**：README 两版入口章节与链接同步更名为 Open Rebuilds（https://github.com/munk-sh/open-rebuilds）。安装包品牌、`appId`、`productName`、快照格式与发布通道不变，本次不改安装包名称。

### 升级方式

建议 v0.2.7 及更早的用户升级到 v0.2.8。下载 v0.2.8 对应平台的新安装包覆盖安装（macOS `.dmg` / `.zip`，Windows `OpenCompare-Setup-0.2.8.exe`，Linux `.AppImage` / `.deb`）。签名与公证口径不变：macOS 包经 Developer ID 签名 + Apple 公证，凭据缺失时 fail-closed。

## v0.2.7

本版是面向用户的两项变化：桌面端界面支持中英双语，README 精简为 9 节双语门面。对比算法、目录扫描、快照格式与发布模型均未改动。

### 新增

- **桌面端 UI 中英双语**：首次启动按系统语言决定界面语言（`zh*` 区域显示中文，其余区域包括无法识别的情况显示英文）；可在设置内切换语言并持久化，切换后整窗即时生效，不丢当前会话状态、不重新扫描目录、无需重启应用。

### 改进

- **README 精简为 9 节双语门面**：发布流程、macOS 签名与公证细节、内存实测数字移入 `docs/` 下的专文，README 只保留下载安装、核心能力、快速上手、环境要求、项目结构、已知问题、证据与文档、Kill Paid Apps 001 平替与许可 9 节；中英两版保持同构镜像，Known issues 只保留尚未修复的问题。

### 升级方式

下载 v0.2.7 对应平台的新安装包覆盖安装（macOS `.dmg` / `.zip`，Windows `OpenCompare-Setup-0.2.7.exe`，Linux `.AppImage` / `.deb`）。签名与公证口径不变：macOS 包经 Developer ID 签名 + Apple 公证，凭据缺失时 fail-closed。

## v0.2.6

本版修复 Windows 绝对路径在四个入口被拼到当前工作目录 / baseDir 的问题：CLI 参数、单实例接管、手工输入与 `opencompare://` 链接。不新增功能，macOS / Linux 行为不变。

### 修复

- **Windows 绝对路径四入口不再被拼到 cwd / baseDir**：`C:\…` 盘符路径、盘根（`C:\`）与 UNC（`\\server\share`）输入在 CLI 参数、单实例接管、手工输入、`opencompare://` 四个入口都按绝对路径解析，不再被拼到当前工作目录或 baseDir；`..` 不越过盘根 / 共享根，成功结果统一以 `/` 输出，`win32` 错误回显保留 `\`。
- 修复已合入 `main`：合并提交 `0cc0914f3aebea9649d76be80fd3592a95bcdd87`（修复提交 `54029c8`）；GitHub Actions `windows-latest` job run `39888946270` 对同一 sha 的结论为 `success`。

### 升级方式

下载 v0.2.6 对应平台的新安装包覆盖安装（macOS `.dmg` / `.zip`，Windows `OpenCompare-Setup-0.2.6.exe`，Linux `.AppImage` / `.deb`）。签名与公证口径不变：macOS 包经 Developer ID 签名 + Apple 公证，凭据缺失时 fail-closed。

## v0.2.5

本版收口大目录反复对比的三处退化：同进程多轮内存收敛、取消不再产生日志噪声、符号链接计数口径写死为「不跟随」。不新增功能。

### 修复

- **同进程连续多轮大目录对比内存收敛**：摘要缓存改为有上限的 LRU（按条目数与估算字节双重限流），关闭或替换目录会话时显式淘汰该会话根下的条目；真实 DawnChat ↔ ZenMind（约 75 万文件）同进程连续 3 轮实测，renderer 峰值由修复前基线 `1,960,394,752` B 降到 `1,257,750,528` B，第 3 轮相对第 2 轮的增量降到 `71,286,784` B，进入增量阈值内。证据见 `docs/perf/large-directory-memory.md` 与 `docs/perf/evidence/dawnchat-zenmind-20261022-post-fix-3rounds.json`。
- **取消改为结构化结果，stderr 零日志噪声**：取消不再以 rejected Promise 穿越 IPC handler 边界，改为结构化返回值并保留取消前会话；一次取消的主进程 stderr 实测零 `Error occurred in handler`、零 `OperationCancelledError`、零 `ECANCELED`，不提交半棵树、不写半份缓存。`pnpm test:cancel`（`cancel-gate`）持续断言该口径。
- **符号链接计数口径：不跟随符号链接**：目录扫描不进入链接指向的目录，链接自身各计 1 条并参与 `same / added / removed / modified`，链接目标子树不产生条目。真实两目录 footer 条目总数由跟随口径的 1,338,294 降到 752,479；跳过项只统计真正不可读的条目并按「已跳过：左 X / 右 Y」分列展示（实测左 0 / 右 0），四态计数之和与 `fileCount` 相等。口径与取证见 `docs/symlink-no-follow.md`。

### 升级方式

下载 v0.2.5 对应平台的新安装包覆盖安装（macOS `.dmg` / `.zip`，Windows `OpenCompare-Setup-0.2.5.exe`，Linux `.AppImage` / `.deb`）。签名与公证口径不变：macOS 包经 Developer ID 签名 + Apple 公证，凭据缺失时 fail-closed。

## v0.2.4

本版包含 v0.2.3 已合入但未发布的改动：悬空链接容错、摘要缓存改进。v0.2.3 从未打 tag、从未公开 Release，其用户可见内容并入本版。同批合入目录对比的批量分页扫描、进度与取消、窗口化目录树与相位计数修复。不新增、不改动其它功能。

### 修复

- **悬空符号链接 / 不可读项不再中断目录对比**：目录列举、扫描、对比与快照构建遇到悬空符号链接或不可读项时跳过并计数，工作台就地以 info 提示「已跳过 N 个不可读项/悬空链接」，不再让整次对比失败。
- **内容摘要改由主进程流式哈希**：摘要改为 SHA-256 流式字节哈希，不再逐文件把正文拉回渲染进程；DawnChat ↔ ZenMind 实测 134 万文件的目录对比，原实现需读 10.67 GiB。
- **目录扫描改批量分页 + 有界并发**：一次 IPC 批量列举多个目录，条目元数据查询共用一份有界并发预算，批量目录数不再放大在飞句柄数。
- **扫描 / 校验内容显示进度并可取消**：目录对比全程显示扫描目录与校验内容的计数，可随时取消，取消后不提交半成品会话、工作台保持取消前状态。
- **目录结果树窗口化**：只渲染可视窗口内的行，150 万行规模的目录树尾部依然可达，不再因一次性渲染整棵树而失去响应。
- **「新建对比」弹窗不再遮挡进度**：从主入口弹窗发起对比时先关闭弹窗，进度条与取消按钮全程可见、可点。
- **相位计数不再归零**：扫描目录段报已扫描、校验内容段报已校验，各段内计数单调，阶段切换不归零倒退。

### 改进

- **摘要缓存改进**：内容摘要直写缓存，对比只保留摘要，不再保留每份文件的正文。

### 升级方式

下载 v0.2.4 对应平台的新安装包覆盖安装（macOS `.dmg` / `.zip`，Windows `Setup.exe`，Linux `.AppImage` / `.deb`）。签名与公证口径不变：macOS 包经 Developer ID 签名 + Apple 公证，凭据缺失时 fail-closed。

## v0.2.2

本版承接 EMFILE 修复：大目录对比与快照读取不再一次性打开全部文件句柄，句柄耗尽时给出可读提示而不是崩溃。不新增、不改动任何功能。

### 修复

- **大目录对比不再崩溃**：目录对比内容读取、快照内容读取与目录条目遍历改为默认 **8 路有界并发**，含数千个文件的真实文件夹对比不再一次性打开全部文件。
- **文件句柄耗尽给可读提示**：系统返回 `EMFILE` / `ENFILE` 时，工作台就地展示「文件句柄耗尽（EMFILE / ENFILE）」的可读提示，不再崩溃窗口。
- 对应问题：[GitHub Issue #2](https://github.com/chaxiu/OpenCompare/issues/2)。

### 升级方式

下载 v0.2.2 对应平台的新安装包覆盖安装（macOS `.dmg` / `.zip`，Windows `Setup.exe`，Linux `.AppImage` / `.deb`）。签名与公证口径不变：macOS 包经 Developer ID 签名 + Apple 公证，凭据缺失时 fail-closed。

## v0.2.1

本版是 v0.2.0 的首发替代：`v0.2.0` tag 从未公开发布，其 tag 树内的发布门测试为旧版（依赖本机 git 状态），无法通过 tag 触发的 gates；因此以修正后的发布门测试首发 v0.2.1。用户可见变化与 v0.2.0 完全相同，不新增、不改动任何功能。

### 说明

- `v0.2.0` 从未公开发布：发布通道拒绝把既有 tag 指向不同 commit，产品也不重写公开 tag，故该版本保留为历史、永不发布。
- 本版用户可见变化与 v0.2.0 相同（新建对比、路径直传、启动参数与 `opencompare://`、原位写回、品牌图标）。
- 发布门测试改为不依赖本机 git 状态：只用临时目录 fixture，不读仓库 `.git`、不依赖真实 tag 与全局 git 配置。

### 新增

- **顶栏常驻「新建对比」**：空态与已有会话时入口都在，打开文件 / 打开文件夹 / 直接粘贴或输入左右两个真实路径三合一；`Cmd/Ctrl+N` 唤起，`Enter` 提交、`Esc` 关闭。
- **免弹窗路径直传**：左右路径支持含空格、中文、Unicode、引号包裹、`~` 展开与相对路径；校验失败就地提示，不建空会话、不替换现有会话。
- **启动参数与 URL scheme 注入**：`--left <path> --right <path>`（含 `=` 形式）与 `opencompare://compare?left=…&right=…` 都能直达对比；单实例锁保证第二次启动 / 再点链接时聚焦已有窗口并接管请求。
- **文件会话原位写回**：代码 / CSV / JSON·YAML 文件会话的「保存左/右文件」直接写回已加载的真实路径，不再弹系统保存对话框；合并结果与快照导出仍走系统保存对话框。
- **自有品牌图标**：窗口、macOS dock、安装包（dmg / zip / exe / AppImage / deb）与「关于」面板使用同一套 OpenCompare 品牌图标、应用名与版本号，不再回落到 Electron 默认品牌。

### 升级方式

下载 v0.2.1 对应平台的新安装包覆盖安装（macOS `.dmg` / `.zip`，Windows `Setup.exe`，Linux `.AppImage` / `.deb`）。签名与公证口径不变：macOS 包经 Developer ID 签名 + Apple 公证，凭据缺失时 fail-closed。

## v0.2.0

本版聚焦「打开对比更快、写回更直接、品牌更完整」：不用系统文件弹窗即可用左右真实路径建立对比，并支持启动参数与 `opencompare://compare` 直接注入；文件会话可原位写回；应用图标与关于面板统一为 OpenCompare 自有品牌。

### 新增

- **顶栏常驻「新建对比」**：空态与已有会话时入口都在，打开文件 / 打开文件夹 / 直接粘贴或输入左右两个真实路径三合一；`Cmd/Ctrl+N` 唤起，`Enter` 提交、`Esc` 关闭。
- **免弹窗路径直传**：左右路径支持含空格、中文、Unicode、引号包裹、`~` 展开与相对路径；校验失败就地提示，不建空会话、不替换现有会话。
- **启动参数与 URL scheme 注入**：`--left <path> --right <path>`（含 `=` 形式）与 `opencompare://compare?left=…&right=…` 都能直达对比；单实例锁保证第二次启动 / 再点链接时聚焦已有窗口并接管请求。
- **文件会话原位写回**：代码 / CSV / JSON·YAML 文件会话的「保存左/右文件」直接写回已加载的真实路径，不再弹系统保存对话框；合并结果与快照导出仍走系统保存对话框。
- **自有品牌图标**：窗口、macOS dock、安装包（dmg / zip / exe / AppImage / deb）与「关于」面板使用同一套 OpenCompare 品牌图标、应用名与版本号，不再回落到 Electron 默认品牌。

### 升级方式

下载 v0.2.0 对应平台的新安装包覆盖安装（macOS `.dmg` / `.zip`，Windows `Setup.exe`，Linux `.AppImage` / `.deb`）。签名与公证口径不变：macOS 包经 Developer ID 签名 + Apple 公证，凭据缺失时 fail-closed。

### v0.1.2 漂移记录（只读事实，不改写历史）

- annotated tag `v0.1.2` 的 tag 对象为 `c4a6a95`，指向 commit `7ea2cc6`。
- `v0.1.2` 是 `main` / `origin/main` 的祖先（`main..v0.1.2` 为 0 个提交），不存在 tag 游离历史；漂移的实质是 tag 之后的修复没有进入已发布资产。
- 规划基线时 `main` 领先 `v0.1.2` 13 个提交（含签名 / 打包修复），这些提交未进入已发布的 v0.1.2 资产；13 只是规划基线快照，实际领先数以打 tag 时的 `main` 为准。
- 远端 `v0.1.2` Release 为公开、非预发布，共 11 个资产：`latest-linux.yml`、`latest-mac.yml`、`latest.yml`、`OpenCompare-0.1.2-arm64-mac.zip(.blockmap)`、`OpenCompare-0.1.2-arm64.dmg(.blockmap)`、`OpenCompare-0.1.2.AppImage`、`OpenCompare.Setup.0.1.2.exe(.blockmap)`、`opencompare_0.1.2_amd64.deb`。
- **不删除、不移动、不重打、不替换** `v0.1.2` 的 tag 与资产；tag 之后的修复由 v0.2.0 承接。后续如需修订只能发布更高版本，不改写历史。

## v0.1.2

首个按正式版路径发布的版本。macOS 构建经 **Developer ID 签名 + Apple 公证** 流程产出，由 CI 发布为每个 tag 唯一的公开 Release。

### 签名与公证

- macOS 产物启用 **Developer ID Application 签名**（`hardenedRuntime: true` + `build/entitlements.mac.plist`）与 **Apple 公证**，签名身份钉住 `Tao Zhu (3X4J53U6RY)`（`mac.identity` 不带 `Developer ID Application:` 前缀），`appId` 保持 `com.opencompare.app`。
- 公证走 **App Store Connect API Key 模式**：`CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_TEAM_ID`、`APPLE_API_KEY`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER` 共 **6 项 GitHub Secrets**，任一缺失即 fail-closed，绝不产出、上传或公开未签名裸包。
- `APPLE_API_KEY` 的 `.p8` base64 只在打包前于 `$RUNNER_TEMP` 解码为权限 `600` 的仓库外临时文件（`notarytool --key` 需要文件路径），打包后清理，日志不打印密钥内容。

### 可复现打包与唯一公开 Release

- 打包在 CI 由锁定输入驱动（`pnpm install --frozen-lockfile` + 固定 pnpm / node 与 Action 版本），各平台仅本地打包（`--publish never`）。
- `gates` job 在矩阵启动前单点预建该 tag 的 Release（`--draft`），三平台产物经 `gh release upload --clobber` 汇聚上传到同一 Release，`finalize` 再公开。
- 每个 tag 断言恰好一个公开（非 Draft）Release，产物名与版本由 tag 单点推导。

### 版本 / tag 对齐闸

- 门禁先断言 tag 语义版本（去 `v` 前缀）等于 `package.json#version`，不一致即中止发布。
- 打包后断言各平台产物旁 `latest*.yml` 的 `version` 等于 tag。
</content>
