# OpenCompare — Agent Guide

OpenCompare 是对标 Beyond Compare 5 Pro 的现代跨平台桌面对比与三向合并工具（本仓 `package.json` 根）。

## 技术栈

- 桌面容器与构建：Electron `^37.10.3` + electron-vite（main / preload / renderer 三段构建）
- UI：React 19 + TypeScript + Tailwind CSS v4（`@tailwindcss/vite`）+ Lucide React
- 算法库：`diff`(jsdiff)、`node-diff3`、`papaparse`、`@tanstack/react-virtual`、`yaml`、`jsonc-parser`
- 质量门禁：ESLint（flat config）、`tsc --noEmit`、vitest；包管理 `pnpm` 10

## 目录约定

- `src/main/`：Electron 主进程（窗口生命周期、IPC handler、真实文件系统访问）
- `src/preload/`：`contextBridge` 安全桥接，仅白名单 channel
- `src/renderer/`：React 19 UI（Vite root 为 `src/renderer`，入口 `index.html`）
- `src/core/`：纯算法与领域模型，零 Electron/DOM 依赖，必须能在 Node 环境被 vitest 直接单测
- `src/shared/`：跨进程共享类型；`src/shared/platform/` 定义 `PlatformPort`，`src/shared/fixtures/` 存放内置样本
- 路径别名：`@shared/*` → `src/shared/*`，`@core/*` → `src/core/*`，`@renderer/*` → `src/renderer/src/*`

## 硬约束

- renderer 绝不直接 `import` Electron API；所有平台能力一律经 `PlatformPort`（Electron IPC 实现 / Web 内存实现）。
- `src/core/` 禁止 electron / react / DOM 依赖，ESLint `no-restricted-imports` 已强制。

## 常用命令

`pnpm dev`（Electron 窗口）· `pnpm dev:web`（浏览器 Web 渲染模式）· `pnpm build` · `pnpm build:web` · `pnpm preview:web` · `pnpm typecheck` · `pnpm lint` · `pnpm test`

## 视觉基线（改界面前先读）

- Token 唯一来源：`src/renderer/src/assets/main.css`（`@theme`：表面/文字/边框/主色/危险 + **差异语义色** same·added·removed·modified·conflict、字号、圆角、高度、动效、`@utility transition-ui` / `transition-fast` / `focus-ring` / `tabular`）。
- 基础组件目录：`src/renderer/src/components/`（Button、SegmentedControl、DropdownMenu、Panel、SplitPane、SessionTabs、StateView、StatusBar、DiffBadge、TreeView、CodeBlock、diffSemantics）。
- 主屏：`src/renderer/src/workbench/Workbench.tsx`；场景视图 `src/renderer/src/views/`；内置样本 `src/shared/fixtures/`。
- 组件只引用 token，不写死颜色/尺寸；差异语义色一律走 `--color-diff-*`。

## Skill 路由

| 场景 | Skill |
| --- | --- |
| Electron 主进程 / preload / IPC / 安全配置 | `.agents/skills/electron-dev/SKILL.md` |
| Vite / electron-vite 构建与插件 | `.agents/skills/vite/SKILL.md` |
| React 19 组件与 hooks 模式 | `.agents/skills/vercel-react-best-practices/SKILL.md` |
| TypeScript 类型设计 | `.agents/skills/typescript-advanced/SKILL.md` |
| Tailwind CSS v4 工具类与配置 | `.agents/skills/tailwind-4-docs/SKILL.md` |
| vitest 单测编写 | `.agents/skills/vitest/SKILL.md` |
