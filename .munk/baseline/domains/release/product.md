# Domain: release

打包分发与 GitHub 开源发布：electron-builder 跨平台打包目标、`v*` tag 触发的门禁前置 CI、GitHub Release 公开可见，以及仓库门面（README / LICENSE）与发布配置断言单测。本域不含应用业务功能与视觉基线。

## 范围

- **打包配置**：`electron-builder.yml` 声明 macOS（dmg / zip）、Windows（nsis）、Linux（AppImage / deb）三平台目标；`package.json` 提供 `dist` / `dist:mac` / `dist:win` / `dist:linux` scripts，`electron-builder` 为 devDependency。
- **发布元数据（Linux `.deb` 前置）**：`package.json` 的 `author`（对象且含非空 `email`）、`license`、`homepage`；`electron-builder.yml` `linux.maintainer` 显式含 email。
- **发布目标**：`electron-builder.yml` 声明 `publish: { provider: github, releaseType: release }`，使 `--publish always` 产出公开（非 Draft）Release。
- **发布工作流**：`.github/workflows/release.yml` 监听 `v*` tag，门禁 job（install `--frozen-lockfile` / lint / typecheck / test / build）先行，mac/win/linux 三平台矩阵 `electron-builder --<target> --publish always`；收尾步骤 `gh release edit "${GITHUB_REF_NAME}" --draft=false --latest` 兜底把已存在的同 tag 草稿 Release 提升为公开。
- **仓库门面**：根目录 `README.md`（定位、核心能力、本地开发与构建打包）与 `LICENSE`（MIT 全文）。
- **发布配置断言单测**：Node 环境下读取仓库根配置做断言（`src/main/release-packaging.test.ts`，`node:fs` + `node:path`，不 import Electron），让缺失字段在 `pnpm test` 失败而非 tag 触发的 CI 才暴露。

## 验收

- **ac-pkg-metadata**：`package.json` 的 `author` 为对象且含非空 `email`，`license` 为 `MIT`，`homepage` 指向 `https://github.com/chaxiu/OpenCompare`。
- **ac-deb-maintainer**：`electron-builder.yml` 的 `linux.maintainer` 显式设置且含 email；electron-builder 不再因缺少 author email / maintainer 而在构建 `.deb` 时报错。
- **ac-linux-targets-kept**：`linux.target` 仍为 `AppImage` 与 `deb` 两项（未通过删除 `deb` 规避失败）。
- **ac-publish-release**：`electron-builder.yml` 声明 `publish.provider: github` 与 `releaseType: release`；据此（或 release.yml 的等价公开收尾步骤）打 `v*` tag 后产出的 Release 不再停留在 Draft。
- **ac-release-workflow**：`.github/workflows/release.yml` 仍为 `v*` tag 触发、`gates` 先行、mac/win/linux 矩阵 `--publish always`，且发布路径可保证 Release 对仓库外可见。
- **ac-config-tests**：release 配置断言单测覆盖元数据 / 打包目标 / 发布配置三组，且由 `pnpm test` 执行并通过。
- **ac-builder**：`electron-builder` 已配置并可解析出 macOS / Windows / Linux 目标（配置存在于 `package.json` 或 `electron-builder.yml`）。
- **ac-readme**：根目录 `README.md` 覆盖定位、核心能力清单与本地开发 / 构建打包说明。
- **ac-license**：根目录 `LICENSE` 为 MIT 许可全文。
- **ac-no-regression**：内置样本主链路无回归，`code-gates.json`（install / lint / typecheck / build / build:web / test）全绿。

## 非目标

- 不做代码签名 / 公证（codesign / notarize）、自动更新（auto-update）与发布密钥托管。
- 不重新打 tag、不在工作项内重跑 CI、不手工公开历史草稿 Release（现状与后续 tag 由负责人操作）。
- 不引入新发布渠道（npm / Homebrew / Snap 等），不改依赖版本与 `electron-vite` 构建脚本。
- 不重写 `README` / `AGENTS.md`、不新增文档体系或设计语言；不在本地做多平台交叉编译。
- 不顺手重构 CI（不加缓存策略、不拆并行 job、不改 Node 版本）。

## 实现约束

- 沿用现有 `electron-builder.yml` 配置模式，仅新增必需字段，不重排既有配置。
- 配置断言单测须落在 `vitest.config.mts` 的 `include` 路径（`src/**/*.test.ts`）内、Node 环境运行，可直接读仓库根配置；不得引入 Electron / DOM 依赖，`src/core/` 保持纯净。
- 包管理固定 `pnpm@10.18.3`；`.deb` 仅由 CI 的 Linux runner 构建，本地不参与多平台编译。
- 提交前跑 `pnpm lint && pnpm typecheck && pnpm test` 自检；门禁命令须为单条 argv。

## 最近交付证明

- WI：`wi_intake_78e621763063e2ae`（修复 Release CI：补齐 Linux `.deb` 打包元数据并使 GitHub Release 直接公开）
- 日期：2026-10-19
- 结果：code_gates passed（6 门禁 attempt 001 全绿；本项跳过 UI 自测）。
- 覆盖摘要：`package.json` 新增 `author{name,email}` / `license: MIT` / `homepage`（解除 `.deb` 的 “Please specify author 'email'” 中断）；`electron-builder.yml` `linux.maintainer` 显式含 email、`linux.target` 保留 `AppImage`+`deb`、新增 `publish{provider: github, releaseType: release}`（不再产出 Draft）；`.github/workflows/release.yml` 保留 `v*` tag 触发 + 门禁前置 + 三平台矩阵 `--publish always`，新增 `finalize` job 执行 `gh release edit "${GITHUB_REF_NAME}" --draft=false --latest` 兜底提升已存在的同 tag 草稿；新增 `src/main/release-packaging.test.ts`（7 用例，Node + `yaml` 解析，覆盖元数据 / maintainer / targets / publish / workflow 断言），`pnpm test` 21 文件 162 用例全绿。
- 注：本域本轮由既有 `foundation` 非目标声明（“GitHub Release 属 `release` 域”）新建；同时补折上一波（`wi_intake_e60068db55d0fef9`）遗留的 release 域用例 `qa/release-workflow.md`、`qa/electron-builder-targets.md`、`qa/license.md`、`qa/readme.md`。
