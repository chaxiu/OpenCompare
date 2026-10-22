# Changelog

OpenCompare 的版本变更记录。格式遵循 [Keep a Changelog](https://keepachangelog.com/)，版本号遵循 [语义化版本](https://semver.org/)。

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
