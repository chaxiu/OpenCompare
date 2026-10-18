# 双目录树只读高速对比、差异状态过滤与双击文件下钻

## 范围

在已交付的 `workbench` 域（视觉基线 + 多会话壳层 + 样本底座）之上，把「目录对比」从样本 answer key 占位升级为**真实计算的只读双目录对比**，并打通到文件级视图的下钻。三块交付：

1. **目录对比引擎（`src/core/`，纯算法）**
   - 经 `PlatformPort` 递归扫描左右两棵树，按**相对路径**配对（不做跨层级模板匹配）。
   - 每个文件产出四类状态：`same`（相同）/ `added`（右独有）/ `removed`（左独有）/ `modified`（两侧都有但内容不同）；目录状态由其后代聚合。
   - **高速/增量策略**：先比文件大小、再比修改时间；两者都不足以判定差异时才读取内容做 **SHA-256** 内容哈希确认（覆盖「大小相同但内容不同」）。已比对过的条目按（路径 / 大小 / 修改时间）缓存，重复比对不重复读内容与哈希。
   - 输出：带状态的左右树 + 按状态的文件计数，供 UI 与过滤使用。
2. **双栏目录对比视图（替换现有 `DirectoryView` 占位）**
   - 左右双栏树、目录展开/折叠、逐行差异语义徽章（复用 `DiffBadge` / `--color-diff-*`）、目录行显示其后代差异聚合计数。
   - 一键过滤：`全部 / 仅差异 / 左独有 / 右独有 / 相同`；过滤后仅保留匹配条目及其祖先目录。
   - 统计（状态栏 / 图例）来自运行时计算结果，不再取样本 answer key。
3. **取数与下钻**
   - 本地真实目录选择：左右各通过 `PlatformPort.selectDirectory` 选一个目录并触发对比（Electron 原生对话框；Web 模式降级）。
   - 内置样本目录加载：一键把内置样本目录加载为左右两侧完成对比，无需外部文件；`pnpm dev` 与 `pnpm dev:web` 均可用。
   - 双击树中的差异文件（`added` / `removed` / `modified`）→ 按其类型把左右文件内容带入对应文件级视图并切换会话：代码/文本 → 代码双栏 Diff 视图；CSV/TSV → CSV 视图；JSON/YAML → 结构化视图。左独有右侧为空、右独有左侧为空。

## 验收

- ac-engine-classify: 双目录对比引擎按相对路径配对，对每个文件正确产出 相同 / 右独有 / 左独有 / 修改 四类状态，并靠 SHA-256 内容哈希判定「大小相同但内容不同」的修改（vitest 可单测）。
- ac-engine-incremental: 大小与修改时间都相同的文件对不读内容即判为相同；重复比对同一目录树时，已比对条目不重复读取内容 / 计算哈希（vitest 用计数桩可验证）。
- ac-tree-ui: 目录对比视图呈现左右双栏树，目录可展开/折叠，每行显示差异语义徽章，目录行显示其后代差异聚合计数。
- ac-filter: 过滤控件含 `全部 / 仅差异 / 左独有 / 右独有 / 相同`；切换后树中只保留匹配条目及其祖先目录，统计随之更新。
- ac-runtime-stats: 目录对比会话的统计（状态栏 / 图例 / 徽章）来自运行时计算结果，不再来自样本 answer key。
- ac-local-directory: Electron（`pnpm dev`）下可为左/右各选一个真实本地目录并触发对比；Web 模式下该动作有可理解的降级（不假装能选真实目录）。
- ac-sample-directory: 一键把内置样本目录加载为左右两侧并完成对比，无需外部文件；`pnpm dev` 与 `pnpm dev:web` 均可复现。
- ac-drilldown-code: 双击树中的差异代码/文本文件，下钻打开文件级对比视图并携带左右文件内容（左独有→右侧空，右独有→左侧空）。
- ac-drilldown-typed: 双击差异 CSV/TSV 文件下钻到 CSV 视图、双击差异 JSON/YAML 下钻到结构化视图，均携带左右内容并正确解析。
- ac-gates-green: `install` / `lint` / `typecheck` / `build` / `build-web` / `test` 六条门禁全绿，且新增 vitest 覆盖引擎四类状态、增量短路与过滤谓词。

## 非目标

- **不做文件级差异算法本体**：行级 / 行内字符级 inline diff、3-way merge 冲突求解与点选合并、CSV 主键列对齐、JSON/YAML 语义归一化 diff 一律不在本项。下钻只把内容带进对应视图并只读呈现，视图增强留给对应子项。
- **不做任何写操作 / 同步**：不做写回、复制、镜像同步、Dry-run 变更清单、删除。
- **不做跨层级散乱目录树 B 的模板归位 / 提取（P1-3）**；本项目录视图不再承载散乱树 B 的展示职责（样本数据保留，供后续子项）。
- **不做 Hex 二进制对比、`.xlsx` 解析、远端 FTP / SFTP**。
- **不做文件监听 / 自动刷新 / 增量重扫调度**：对比为按需触发，不做 watcher。
- **不做符号链接跟随、权限 / 属主 / 模式位对比、忽略规则（.gitignore / glob 过滤）**。
- **不做三向或超过两个目录的对比**；不做目录级写操作与合并。
- 不做快捷键绑定、命令面板、主题切换与浅色皮肤。
- 不做组件大全、HTML 设计稿；不改 `.munk/baseline/**`（由 Delivery 折入）。
- 不做打包分发、代码签名、公证、自动更新、CI 发布。

## 实现约束

- **技术栈已由上游 tech-research 冻结，不得替换**：Electron `^37.10.3` + electron-vite + React 19 + TS + Tailwind CSS v4 + Lucide React；**不引入第二套 UI 库 / 样式方案**。token 唯一来源 `src/renderer/src/assets/main.css`，差异语义色一律走 `--color-diff-*`，组件不写死颜色 / 尺寸。
- **分层硬约束**：目录对比引擎放 `src/core/`，零 Electron / DOM 依赖，必须能被 vitest 在 Node 环境直接单测；renderer 只经 `PlatformPort`（`@shared/platform/types`）取文件系统数据，绝不直接 import Electron API。可扩展 `PlatformPort`（保持现有契约语义不破坏），任何新增能力要同时给 Electron IPC 与 Web 内存两套实现。
- 目录扫描 / 读取走 `PlatformPort.selectDirectory` / `listDirectory` / `readTextFile`。**SHA-256 必须用可在 Node、浏览器与 Electron renderer 三端运行的实现**：renderer 侧不得引入 `node:*`，也不要依赖难以单测的异步 Web Crypto；核心比对保持同步纯函数。
- 差异语义复用现有 `DiffStatus`（`same` / `added` / `removed` / `modified`）与 `DiffBadge` / `diffSemantics`，不新造状态枚举。
- **下钻复用现有** `CodeView` / `CsvView` / `StructuredView`（可为接受 ad-hoc 左右内容做小改），不要新写第四个文件查看器；工作台会话模型需支持「非样本来源」的会话。
- 目录视图的数据源必须换成运行时计算结果：`DirectoryNode.status`（样本 answer key）不再作为目录视图输入，仅 `src/shared/fixtures/` 的校验用例继续使用。
- 内置样本目录经 `PlatformPort` 可读（Web 内存实现已把 `src/shared/fixtures/` 挂在 `/samples`）；Electron 下需有等价的可读路径，保证两端一键加载样本目录。Web 内存实现的 `modifiedMs` 为 0，mtime 短路在样本目录上不生效，由内容哈希兜底即可。
- ui-baseline 交接的两处占位需在本项处理：目录场景统计 / 徽章改真算；`loadSampleSessions` 的 420ms 加载下限与「演示：样本读取失败」自检入口保持可用，不与真实目录对比逻辑耦合。
- 写 UI 前先读 `.agents/skills/tailwind-4-docs/SKILL.md` 与 `.agents/skills/vercel-react-best-practices/SKILL.md`；写测试读 `.agents/skills/vitest/SKILL.md`；涉及主进程 / IPC 读 `.agents/skills/electron-dev/SKILL.md`。
- 现有 `src/renderer/src/App.test.tsx` 断言目录场景与样本加载，需随改造同步更新并保持绿。
- 本项 `kind: feature`：只交「目录对比引擎 + 双栏目录视图 + 取数与下钻」，文件级 diff 算法与写操作留给后续子项。
