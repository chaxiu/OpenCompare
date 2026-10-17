# 工程脚手架与 Electron + React 19 + TS 工具链初始化

## 范围

从空仓（当前仅有 `.munk/` 与初始化 git 提交，无 `package.json` / `src`）初始化 OpenCompare 跨平台桌面应用工程，并把「本栈官方 Skill + 薄 `AGENTS.md` + 单命令质量门禁」一次配齐：

1. **安装本栈官方 Skill 与 `AGENTS.md` 路由**
   - 对照本项技术栈，用 `npx skills add <owner/repo>`（禁止 `-g`/`--global`、禁止 `git clone` / `curl | sh` 主路径）把 Electron / Vite / React / TypeScript / Tailwind 等官方或主流 Skill 装到本 worktree 的 `.agents/skills/<name>/SKILL.md`。
   - 写薄 `AGENTS.md`（非空）：写明本产品技术栈、核心库、目录约定与 `.agents/skills/<name>` 路由表，不拷贝 Munk Host 的 `AGENTS.md`。
2. **初始化应用工程**（空仓 → 需创建）
   - 用 electron-vite 标准结构在 worktree 根 `.` 建工程：`src/main/`（Electron 主进程）、`src/preload/`（安全桥接）、`src/renderer/`（React 19 UI）、`src/core/`（纯算法层，零 Electron/DOM 依赖）、`src/shared/`。
   - 落地最小可运行壳：Electron 主进程创建主窗口并加载 renderer；renderer 渲染一个占位根组件（仅验证挂载，不含业务 UI）。
3. **打通双模运行架构（PlatformPort 抽象）**
   - 定义 `PlatformPort` 接口（文件系统读写 / 目录选择等边界的抽象），提供两套实现骨架：Electron IPC 实现（主进程 + preload 暴露）与 Web/内存实现；renderer 仅依赖 `PlatformPort`，不直接 import Electron API。
   - 保证同一 renderer 在「Electron 原生窗口」与「Web 渲染模式」下都能构建并拉起基础壳。
4. **预装核心依赖**
   - 运行时：`diff`(jsdiff)、`node-diff3`、`papaparse`、`@tanstack/react-virtual`、`yaml`、`jsonc-parser`、`lucide-react`。
   - 开发/测试：`vitest`、`@testing-library/react`、`eslint`（含 TS/React 规则）、`typescript`。
   - 依赖只需装好并可被 import/类型解析，本项不实现其业务逻辑。
5. **配齐单命令质量门禁**
   - 从 `.munk/code-gates.example.json` 改编生成 `.munk/code-gates.json`，拆成独立 `install` / `lint` / `typecheck` / `build` / `test` 条目，每条 `command` 必须是**单条 argv**（禁止 `&&` / `||` / `|` / `;` / 重定向）。
   - 提供至少一个最小 vitest 用例（如 `src/core/` 纯函数冒烟测试），使 `test` 门禁真实可跑。

## 验收

- ac-skills-agents: 本 worktree 存在非空 `AGENTS.md`，其路由表指向 `.agents/skills/` 下与本栈技术栈对应的官方/主流 Skill；未用无关 Skill 凑数。
- ac-scaffold: 根目录存在 electron-vite 结构的工程（`package.json` + `src/main`、`src/preload`、`src/renderer`、`src/core`、`src/shared`），`install` 门禁可成功完成依赖安装。
- ac-deps: `diff` / `node-diff3` / `papaparse` / `@tanstack/react-virtual` / `yaml` / `jsonc-parser` / `lucide-react` / `vitest` 均已在 `package.json` 声明且可被 typecheck 解析。
- ac-platformport: 定义 `PlatformPort` 抽象并给出 Electron 与 Web 两套实现，renderer 不直接依赖 Electron API。
- ac-gates: `.munk/code-gates.json` 存在，含相互独立的 `install` / `lint` / `typecheck` / `build` / `test` 门禁，且每条命令为单条 argv。
- ac-desktop-build: `build` 门禁成功产出 Electron 桌面端产物；`electron-vite` 主进程 + renderer 均可构建，能拉起基础壳窗口。
- ac-web-render: renderer 可在 Web/内存模式下构建并拉起基础壳（不依赖 Electron 原生能力）。
- ac-gates-green: 全部门禁（lint / typecheck / build / test）在干净安装后全绿通过。

## 非目标

- **不做任何业务功能**：目录树对比、代码/文本 Diff、3-way Merge、CSV 主键对齐、JSON/YAML 语义对比、增量同步、模板归位提取器一律不在本项；本项只交「能装、能构建、能拉起壳」的工程底座。
- **不做视觉基线 / 设计系统**：token、基础组件库、真实主界面属于后续 `ui-baseline` / Design 项，本项 renderer 只放占位根组件。
- **不做样本库内容**：`src/shared/fixtures/` 下标准测试样本属于后续子项，本项只保证目录约定存在（如需可留空占位）。
- **不做打包分发**：安装包、代码签名、公证、自动更新、CI 发布均不做。
- **不做远端能力**：FTP / SFTP 远端对比按总 PRD 红线排后，本项不引入相关依赖。
- **不做快捷键、分栏拖拽、主题切换等交互细节**。
- **不引入与本栈冲突的框架**（如 Tauri / 原生 Rust 编译链），不安装 `ui-baseline` 视觉类 Skill 充当技术栈 Skill。

## 实现约束

- **技术栈已由上游 tech-research 冻结，不得擅自替换**：Electron `^37.10.3`（本机 `~/Library/Caches/electron` 已命中缓存，复用可避免原生冷编译卡死）+ `electron-vite` + React 19 + TypeScript（~5.8/6.0）+ Tailwind CSS v4 + Lucide React；算法/组件依赖见「范围」第 4 条。
- 本机环境：macOS arm64 / Node v24.4.1 / pnpm 10.18.3；门禁命令统一用 `pnpm`。
- 保持 `kind: "feature"`；本项为 `repo-bootstrap`，Coding 阶段执行，禁止嵌套第二个 `.git`。
- 分层硬约束：`src/core/` 必须零 Electron / DOM 依赖，才能被 vitest 在 Node 环境直接单测。
- Skill 安装禁止全局写入（不写 `~/.agents`），只用 worktree 内 `.agents/skills/`。
- 门禁每条命令必须可被 Host 作为单条 argv 执行，不得用 shell 链接符拼接。
