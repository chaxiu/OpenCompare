# 修复 Release CI（Run #39181144035）：补齐 Linux .deb 打包元数据并使 GitHub Release 直接公开

## 范围

### A. 修复 Linux `.deb` 打包中断（`Please specify author 'email' in the application package.json`）

1. `package.json` 补齐发布元数据：
   - `"author": { "name": "OpenCompare Contributors", "email": "chaxiu@users.noreply.github.com" }`
   - `"license": "MIT"`
   - `"homepage": "https://github.com/chaxiu/OpenCompare"`
2. `electron-builder.yml` 的 `linux:` 下显式添加
   `maintainer: "OpenCompare Contributors <chaxiu@users.noreply.github.com>"`。
3. 保留 `linux.target` 的 `AppImage` + `deb` 两项——不得以删除 `deb` 目标的方式绕过失败。

### B. 修复 Release 停留在 Draft 未公开

1. `electron-builder.yml` 增加显式发布配置：
   `publish: { provider: github, releaseType: release }`（不再依赖 electron-builder 默认草稿行为）。
2. `.github/workflows/release.yml` 保持 `v*` tag 触发、门禁前置、三平台矩阵构建 `--publish always`；并保证三端产物上传完成后对应 Tag 的 Release 处于公开（非 Draft）状态——采用上述 `releaseType: release`，若该机制无法覆盖「已存在草稿 Release」的场景，则增加收尾步骤执行 `gh release edit "${GITHUB_REF_NAME}" --draft=false --latest`。二者至少一条路径可确保发布后 Release 对仓库外可见。

### C. release 域配置断言单测

新增 Node 环境下读取仓库根配置的断言单测（建议 `src/main/release/packaging.test.ts`，`node:fs` + `node:path`，不 import Electron），校验：

- `package.json` 的 `author` 为对象且 `email` 非空，`license === 'MIT'`，`homepage` 指向 `chaxiu/OpenCompare`；
- `electron-builder.yml` 的 `linux.maintainer` 非空，且 `linux.target` 仍同时包含 `AppImage` 与 `deb`；
- `electron-builder.yml` 的 `publish` 为 `provider: github` 且 `releaseType: release`（或 `.github/workflows/release.yml` 存在等价公开步骤）。

## 验收

- ac-pkg-metadata: `package.json` 的 `author` 为对象且含非空 `email`，`license` 为 `MIT`，`homepage` 指向 `https://github.com/chaxiu/OpenCompare`。
- ac-deb-maintainer: `electron-builder.yml` 的 `linux.maintainer` 显式设置且含 email；electron-builder 不再因缺少 author email / maintainer 而在构建 `.deb` 时报错。
- ac-linux-targets-kept: `linux.target` 仍为 `AppImage` 与 `deb` 两项（未通过删除 `deb` 规避失败）。
- ac-publish-release: `electron-builder.yml` 声明 `publish.provider: github` 与 `releaseType: release`；据此（或 release.yml 的等价公开收尾步骤）打 `v*` tag 后产出的 Release 不再停留在 Draft。
- ac-release-workflow: `.github/workflows/release.yml` 仍为 `v*` tag 触发、`gates` 先行、mac/win/linux 矩阵 `--publish always`；发布路径可保证 Release 对仓库外可见。
- ac-config-tests: 新增的 release 配置断言单测覆盖 A、B 两组配置项，且由 `pnpm test` 执行并通过。
- ac-no-regression: `pnpm install / lint / typecheck / build / build:web / test`（`code-gates.json`）全绿。

## 非目标

- 不重新打 tag、不在本工作项内重跑 CI、也不手工公开已存在的 `v0.1.0` 草稿 Release（该 Release 的现状与后续 tag 由负责人操作）。
- 不改应用代码、依赖版本、构建脚本（`electron-vite` 相关）与门禁内容。
- 不做代码签名 / 公证，不引入密钥托管与新发布渠道（npm / Homebrew / Snap 等）。
- 不重写 README / AGENTS.md，不新增文档体系或设计语言。
- 不顺手重构 CI（不加缓存策略、拆并行 job、改 Node 版本等）。

## 实现约束

- 沿用现有 `electron-builder.yml` 配置模式，仅新增必需字段，不重排既有配置。
- 单测须落在 `vitest.config.mts` 的 `include` 路径（`src/**/*.test.ts`）内，Node 环境，可直接读仓库根配置；不得引入 Electron/DOM 依赖，`src/core/` 保持纯净（配置断言测试放 `src/main/` 或按仓库既有习惯的等价位置）。
- 包管理固定 `pnpm@10.18.3`；`.deb` 仅由 CI 的 Linux runner 构建，本地不参与多平台编译。
- 提交前跑 `pnpm lint && pnpm typecheck && pnpm test` 自检。
