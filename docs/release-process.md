# 发布流程

本文是 OpenCompare 的发布流程说明。日常发布只需要推送符合 `v*` 的 tag，门禁、三平台构建、硬校验与上传全部由 `.github/workflows/release.yml` 完成。

## 触发方式

- 推送 `v*` tag 即触发 GitHub Actions；构建统一 checkout `refs/tags/<tag>`，不改 tag、不升版本。
- 若 tag 已推送但 Release 未完成，可从 `main` 手动触发同一工作流的 `workflow_dispatch`，输入已存在的 `tag`。该输入的 `tag` 默认值为 `default: 'v0.2.6'`（与 `package.json#version` 同源，即 `v${pkg.version}`），补发时不要指向新版本。

## 门禁与祖先校验

1. 先在 Ubuntu runner 上跑门禁 `install → lint → typecheck → test → build`，任一失败即中止发布。
2. 安装 / 测试前先跑只读祖先门：`v0.1.2` 必须是 `HEAD` 的严格祖先，或仅 tag 可达的提交逐条补丁等价。
3. 校验 `package.json#version` 与 tag 的语义版本一致。

## 三平台构建

门禁通过后，在 macOS / Windows / Linux 三个 runner 上分别构建平台产物：

- **macOS**：`.dmg` / `.zip`。要求 Developer ID 签名与 Apple 公证凭据齐备，任一缺失即 fail-closed，不产出、不上传未签名裸包；凭据清单见 [`docs/release-signing.md`](release-signing.md)。
- **Windows**：NSIS `.exe` 安装包。
- **Linux**：`.AppImage` / `.deb`。

每个平台都会断言产物文件名与 `latest*.yml` 内的 `version` / `files[].url` 等于 tag 版本。本地可先跑 `pnpm release:metadata --dir release`，校验每份 `latest*.yml` 的 `files[].url` 命中 `release/` 资产名、Windows 安装包为连字符形态，再汇聚上传到该 tag 的唯一 Release。

## 打包后硬校验

macOS 对实际 `.app` 执行：

- `codesign --verify --deep --strict`
- `xcrun stapler validate`
- `spctl -a -vv`

同时断言图标、bundle 身份与版本，任一失败即终止且不上传。

## 唯一公开 Release

`finalize` 后断言该 tag 恰好一个公开（非 Draft、非预发布）Release，资产覆盖三平台与 `latest*.yml`，并且该 Release 是仓库最新的公开版本。每个版本只有一个公开 Release。

## Release-time performance evidence

打包 app 的 L3 首跑证据（原始证据归档在仓库外 / archived outside the repository，未在本仓库重新采样）：

- 3 会话并发、`1.3M` 级文件：renderer ready 峰值 `1.9–2.0 GiB`，静置 `1.6–1.9 GiB`，app 总 RSS 峰值约 `2.15–2.5 GiB`。

以上只陈述归档实测值，不设产品内存目标，也不承诺修复时间表。
