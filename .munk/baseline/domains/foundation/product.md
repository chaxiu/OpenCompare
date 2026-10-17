# Domain: foundation

工程底座：Electron + electron-vite + React 19 + TS 工具链初始化、平台抽象（PlatformPort）与质量门禁。本域不含任何业务功能。

## 范围

- 从空仓初始化 OpenCompare 跨平台桌面工程（`package.json` + `src/main` / `src/preload` / `src/renderer` / `src/core` / `src/shared`）。
- 安装本栈官方/主流 Skill 到 worktree `.agents/skills/`，并写薄 `AGENTS.md` 路由。
- 打通双模运行架构：`PlatformPort` 抽象 + Electron IPC 实现 + Web/内存实现，renderer 仅依赖 `PlatformPort`。
- 预装核心运行时依赖（diff / node-diff3 / papaparse / @tanstack/react-virtual / yaml / jsonc-parser / lucide-react）与开发测试依赖（vitest / @testing-library/react / eslint / typescript）。
- 配齐单命令质量门禁：`install` / `lint` / `typecheck` / `build` / `test`（各自单条 argv）。

## 验收

- **ac-skills-agents**：worktree 存在非空 `AGENTS.md`，路由表指向 `.agents/skills/` 下与本栈对应的官方/主流 Skill；未用无关 Skill 凑数。
- **ac-scaffold**：根目录存在 electron-vite 结构工程（`package.json` + `src/main`、`src/preload`、`src/renderer`、`src/core`、`src/shared`），`install` 门禁可成功完成依赖安装。
- **ac-deps**：`diff` / `node-diff3` / `papaparse` / `@tanstack/react-virtual` / `yaml` / `jsonc-parser` / `lucide-react` / `vitest` 均已在 `package.json` 声明且可被 typecheck 解析。
- **ac-platformport**：定义 `PlatformPort` 抽象并给出 Electron 与 Web 两套实现，renderer 不直接依赖 Electron API。
- **ac-gates**：`.munk/code-gates.json` 存在，含相互独立的 `install` / `lint` / `typecheck` / `build` / `test` 门禁，且每条命令为单条 argv。
- **ac-desktop-build**：`build` 门禁成功产出 Electron 桌面端产物；主进程 + renderer 均可构建，能拉起基础壳窗口。
- **ac-web-render**：renderer 可在 Web/内存模式下构建并拉起基础壳（不依赖 Electron 原生能力）。
- **ac-gates-green**：全部门禁（lint / typecheck / build / test）在干净安装后全绿通过。

## 非目标

- 不做任何业务功能（目录树对比、文本/代码 Diff、3-way Merge、CSV 主键对齐、JSON/YAML 语义对比、增量同步、模板提取）。
- 不做视觉基线 / 设计系统（token、基础组件、真实主界面属后续 `ui-baseline` / Design 项）。
- 不做样本库内容（`src/shared/fixtures/` 内容属后续子项）。
- 不做打包分发（安装包、签名、公证、自动更新、CI 发布）。
- 不做远端能力（FTP / SFTP）。
- 不做快捷键、分栏拖拽、主题切换等交互细节。

## 实现约束

- 技术栈由上游 tech-research 冻结，不得替换：Electron `^37.10.3` + electron-vite + React 19 + TypeScript + Tailwind CSS v4 + Lucide React。
- 本机环境：macOS arm64 / Node v24.4.1 / pnpm 10.18.3；门禁命令统一用 `pnpm`。
- 分层硬约束：`src/core/` 零 Electron / DOM 依赖，可被 vitest 在 Node 环境直接单测。
- Skill 安装禁止全局写入，只用 worktree 内 `.agents/skills/`。
- 门禁每条命令必须可被 Host 作为单条 argv 执行，不得用 shell 链接符拼接。

## 最近交付证明

- WI：`wi_ws_360b2db981f4e4ed`（repo-bootstrap / 工程脚手架与工具链初始化）
- 日期：2026-10-18
- 结果：code_gates passed（本轮跳过 UI 自测，按 needSelfTest=false 走 code_gates 门禁）。
- 覆盖摘要：新建 electron-vite 工程骨架（`src/main` / `src/preload` / `src/renderer` / `src/core` / `src/shared`）；落地 `PlatformPort` 抽象（`src/shared/platform/types.ts` + `channels.ts`）与 Electron IPC（`src/main/platform/electron-platform.ts`）及 Web 内存（`src/renderer/src/platform/web-platform.ts`）两套实现；写入薄 `AGENTS.md` 与 6 个 `.agents/skills/`（electron-dev / vite / vercel-react-best-practices / typescript-advanced / tailwind-4-docs / vitest）；`.munk/code-gates.json` 拆成独立 install / lint / typecheck / build / build-web / test 单 argv 门禁；含最小 vitest 用例（`src/core/text/lines.test.ts`、`src/shared/deps.test.ts`、`src/renderer/src/App.test.tsx`）。
- 注：本 WI change pack 未提供 `tests/cases/**`，QA 目录暂无折叠用例。
