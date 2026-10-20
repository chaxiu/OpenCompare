# Changelog

OpenCompare 的版本变更记录。格式遵循 [Keep a Changelog](https://keepachangelog.com/)，版本号遵循 [语义化版本](https://semver.org/)。

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
