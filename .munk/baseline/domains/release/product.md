# Domain: release

打包分发与 GitHub 开源发布：electron-builder 跨平台打包目标、`v*` tag 触发的门禁前置 CI、GitHub Release 公开可见，以及仓库门面（README / LICENSE）与发布配置断言单测。本域不含应用业务功能与视觉基线。

## 范围

- **打包配置**：`electron-builder.yml` 声明 macOS（dmg / zip）、Windows（nsis）、Linux（AppImage / deb）三平台目标；`package.json` 提供 `dist` / `dist:mac` / `dist:win` / `dist:linux` scripts，`electron-builder` 为 devDependency。
- **发布元数据（Linux `.deb` 前置）**：`package.json` 的 `author`（对象且含非空 `email`）、`license`、`homepage`；`electron-builder.yml` `linux.maintainer` 显式含 email。
- **发布目标**：`electron-builder.yml` 声明 `publish: { provider: github, releaseType: release }`；实际发布改由 release.yml 单点预建 + `gh release upload` 完成（矩阵 `--publish never`），最终 Release 为公开（非 Draft）。
- **发布工作流**：`.github/workflows/release.yml` 监听 `v*` tag，门禁 job（install `--frozen-lockfile` / lint / typecheck / test / build）先行。门禁末尾**单点预建该 tag 的唯一 Release**（`gh release create ... --draft --generate-notes`，注入 `GH_TOKEN`/`GH_REPO` 并显式带 `--repo`；若已存在则清理同名重复只留一个），随后 mac/win/linux 三平台矩阵 `electron-builder --<target> --publish never` 仅本地打包到 `release/`，再用 `gh release upload "${GITHUB_REF_NAME}" <三端全部产物> --clobber --repo` 汇聚上传到该唯一 Release；`finalize` job `gh release edit "${GITHUB_REF_NAME}" --repo "${GITHUB_REPOSITORY}" --draft=false --latest` 正式公开。Release 唯一性以 tag 为准，杜绝并发建单竞态。
- **仓库门面**：根目录 `README.md`（定位、核心能力、本地开发与构建打包）与 `LICENSE`（MIT 全文）。
- **发布配置断言单测**：Node 环境下读取仓库根配置做断言（`src/main/release-packaging.test.ts`，`node:fs` + `node:path`，不 import Electron），让缺失字段在 `pnpm test` 失败而非 tag 触发的 CI 才暴露。

## 验收

- **ac-pkg-metadata**：`package.json` 的 `author` 为对象且含非空 `email`，`license` 为 `MIT`，`homepage` 指向 `https://github.com/chaxiu/OpenCompare`。
- **ac-deb-maintainer**：`electron-builder.yml` 的 `linux.maintainer` 显式设置且含 email；electron-builder 不再因缺少 author email / maintainer 而在构建 `.deb` 时报错。
- **ac-linux-targets-kept**：`linux.target` 仍为 `AppImage` 与 `deb` 两项（未通过删除 `deb` 规避失败）。
- **ac-publish-release**：`electron-builder.yml` 声明 `publish.provider: github` 与 `releaseType: release`；据此（或 release.yml 的预建唯一 Release + `gh release upload` + finalize 收尾步骤）打 `v*` tag 后产出的 Release 不再停留在 Draft。
- **ac-release-workflow**：`.github/workflows/release.yml` 仍为 `v*` tag 触发、`gates` 先行；发布路径可保证 Release 对仓库外可见，且每个 tag 恰好一个 Release。
- **ac-single-precreate**：`gates` Job 在矩阵启动前存在单点预建唯一 Release 的步骤，带 `GH_TOKEN` 与 `GH_REPO`，使用 `gh release create ... --draft --generate-notes`（不存在时才创建；存在重复同名 Release 时清理多余、只留一个）。
- **ac-no-concurrent-publish**：`release` 矩阵中 `electron-builder` 参数为 `--publish never`，不再有 `--publish always`；打包产物仅落到本地 `release/`。
- **ac-upload-clobber**：`release` 矩阵在打包后有 `gh release upload "${GITHUB_REF_NAME}" ... --clobber --repo "${GITHUB_REPOSITORY}"` 步骤，汇聚上传三端安装包与元数据（dmg/zip/exe/AppImage/deb/blockmap/latest*.yml），且能在 windows runner 的默认 shell 下正常运行。
- **ac-finalize-repo**：`finalize` Job 的 `gh release edit` 命令带 `--repo "${GITHUB_REPOSITORY}"`，并注入 `GH_REPO`，`--draft=false --latest` 保持；不存在 `fatal: not a git repository` 的前置依赖。
- **ac-unit-assertions**：`src/main/release-packaging.test.ts` 断言覆盖预建唯一 Release、`--publish never` + `gh release upload --clobber`、`finalize` 带 `--repo`；旧断言若与新流程冲突已随之更新。
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
- 不改 electron-builder 打包目标 / appId / 签名公证策略；不改触发条件（仍为 `v*` tag push）与 `permissions`；不做版本号自增、不改 `package.json` version；不新增 CI Job、不引入新的 Action / 第三方发布工具。

## 实现约束

- 沿用现有 `electron-builder.yml` 配置模式，仅新增必需字段，不重排既有配置。
- 配置断言单测须落在 `vitest.config.mts` 的 `include` 路径（`src/**/*.test.ts`）内、Node 环境运行，可直接读仓库根配置；不得引入 Electron / DOM 依赖，`src/core/` 保持纯净。
- 包管理固定 `pnpm@10.18.3`；`.deb` 仅由 CI 的 Linux runner 构建，本地不参与多平台编译。
- 提交前跑 `pnpm lint && pnpm typecheck && pnpm test` 自检；门禁命令须为单条 argv。
- 预建唯一 Release 放在 `gates` Job 末尾、`release` 矩阵之前；预建 / upload / finalize 统一使用 `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` 与 `GH_REPO: ${{ github.repository }}`，命令显式带 `--repo "${GITHUB_REPOSITORY}"`（不依赖隐式 git 仓库上下文，规避 `not a git repository`）。
- 汇聚上传须兼容 windows-latest 默认 shell（pwsh）：使用 `shopt -s nullglob` 时须设 `shell: bash`，或用 gh 自带 glob 展开；`--clobber` 允许重复上传覆盖以保证可重跑。

## 最近交付证明

- WI：`wi_intake_37aa5843386424aa`（修复 Release CI 并发建单竞态与 finalize Job 缺 repo 报错）
- 日期：2026-10-19
- 结果：code_gates passed（6 门禁全绿；本项跳过 UI 自测）。
- 覆盖摘要：`.github/workflows/release.yml` 在 `gates` 末尾新增单点预建步骤——`gh api` 列出该 tag 的同名 Release，无则 `gh release create "${GITHUB_REF_NAME}" --repo "${GITHUB_REPOSITORY}" --title --draft --generate-notes`，有则 DELETE 清理重复只留一个；`release` 矩阵由 `--publish always` 改为 `electron-builder --<target> --publish never` 仅本地打包到 `release/`，新增 `shell: bash` 的 `gh release upload "${GITHUB_REF_NAME}" <dmg/zip/exe/AppImage/deb/blockmap/latest*.yml> --clobber --repo` 汇聚三端资产（`shopt -s nullglob` 兼容 windows pwsh）；`finalize` Job 补 `GH_REPO` 并在 `gh release edit` 显式带 `--repo "${GITHUB_REPOSITORY}"`，`--draft=false --latest` 保持，消除 `fatal: not a git repository`。`src/main/release-packaging.test.ts` 更新/新增断言：预建唯一 Release、`--publish never` 且无 `--publish always`、`gh release upload --clobber`、`gh release edit ... --repo ... --draft=false --latest`。
- 注：本域上一轮为 `wi_intake_78e621763063e2ae`（.deb 元数据 + Release 直接公开）；本轮针对 Run #39183565396 暴露的并发建单与 finalize 缺 repo 两处缺陷，改为「单点预建唯一 Release + 各平台本地打包 + 汇聚 upload」模型，`electron-builder.yml` / 打包目标 / 触发条件均未改。
