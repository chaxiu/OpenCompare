# Domain: directory

只读双目录对比域：`src/core/` 纯算法目录对比引擎（相对路径配对、四类状态、大小/mtime 短路 + SHA-256 内容确认、增量缓存），双栏目录对比视图（展开/折叠、逐行差异徽章、目录后代聚合计数、五档状态过滤），以及取数与下钻（本地真实目录选择 / 内置样本目录一键加载；双击差异文件下钻到对应文件级视图）。本域只做目录级对比与只读呈现，不做文件级差异算法本体与任何写操作。

## 范围

- **目录对比引擎（`src/core/directory/`，纯算法，零 Electron/DOM）**：经 `PlatformPort` 递归扫描左右两棵树，按**相对路径**配对（不做跨层级模板匹配）；每文件产出 `same` / `added`（右独有）/ `removed`（左独有）/ `modified` 四类状态，目录状态由后代聚合。
- **高速 / 增量策略**：先比文件大小、再比修改时间；二者都不足以判定差异时才读取内容做 **SHA-256** 内容哈希确认（覆盖「大小相同但内容不同」）；已比对条目按（路径 / 大小 / 修改时间）缓存，重复比对不重复读内容与哈希。输出带状态的左右树 + 按状态文件计数。
- **双栏目录对比视图**：左右双栏树、目录展开/折叠、逐行差异语义徽章（复用 `DiffBadge` / `--color-diff-*`）、目录行显示其后代差异聚合计数；一键过滤 `全部 / 仅差异 / 左独有 / 右独有 / 相同`，过滤后仅保留匹配条目及其祖先目录。
- **取数与下钻**：本地真实目录选择（左/右各经 `PlatformPort.selectDirectory`，Electron 原生对话框、Web 模式降级提示）；内置样本目录一键加载（`pnpm dev` 与 `pnpm dev:web` 均可）；双击差异文件（`added`/`removed`/`modified`）按其类型把左右内容带入对应文件级视图并切换会话（代码/文本 → 代码双栏 Diff；CSV/TSV → CSV 视图；JSON/YAML → 结构化视图；左独有右侧空、右独有左侧空）。
- **运行时统计**：目录对比会话的统计（状态栏 / 图例 / 徽章）全部来自运行时引擎计算结果，不再读取样本 `DirectoryNode.status` answer key。

## 验收

- **ac-engine-classify**：双目录对比引擎按相对路径配对，对每个文件正确产出 相同 / 右独有 / 左独有 / 修改 四类状态，并靠 SHA-256 内容哈希判定「大小相同但内容不同」的修改（vitest 可单测）。
- **ac-engine-incremental**：大小与修改时间都相同的文件对不读内容即判为相同；重复比对同一目录树时，已比对条目不重复读取内容 / 计算哈希（vitest 用计数桩可验证）。
- **ac-tree-ui**：目录对比视图呈现左右双栏树，目录可展开/折叠，每行显示差异语义徽章，目录行显示其后代差异聚合计数。
- **ac-filter**：过滤控件含 `全部 / 仅差异 / 左独有 / 右独有 / 相同`；切换后树中只保留匹配条目及其祖先目录，统计随之更新。
- **ac-runtime-stats**：目录对比会话的统计（状态栏 / 图例 / 徽章）来自运行时计算结果，不再来自样本 answer key。
- **ac-local-directory**：Electron（`pnpm dev`）下可为左/右各选一个真实本地目录并触发对比；Web 模式下该动作有可理解的降级（不假装能选真实目录）。
- **ac-sample-directory**：一键把内置样本目录加载为左右两侧并完成对比，无需外部文件；`pnpm dev` 与 `pnpm dev:web` 均可复现。
- **ac-drilldown-code**：双击树中的差异代码/文本文件，下钻打开文件级对比视图并携带左右文件内容（左独有→右侧空，右独有→左侧空）。
- **ac-drilldown-typed**：双击差异 CSV/TSV 文件下钻到 CSV 视图、双击差异 JSON/YAML 下钻到结构化视图，均携带左右内容并正确解析。
- **ac-gates-green**：`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 六条门禁全绿，且新增 vitest 覆盖引擎四类状态、增量短路与过滤谓词。

## 非目标

- **不做文件级差异算法本体**：行级 / 行内字符级 inline diff、3-way merge 冲突求解与点选合并、CSV 主键列对齐、JSON/YAML 语义归一化 diff 一律不在本域。下钻只把内容带进对应视图并只读呈现，视图增强留给对应子项。
- **不做任何写操作 / 同步**：不做写回、复制、镜像同步、Dry-run 变更清单、删除。
- **不做跨层级散乱目录树 B 的模板归位 / 提取（P1-3）**；本域目录视图只承载同层相对路径配对的目录对比。
- 不做 Hex 二进制对比、`.xlsx` 解析、远端 FTP / SFTP。
- 不做文件监听 / 自动刷新 / 增量重扫调度：对比为按需触发，不做 watcher。
- 不做符号链接跟随、权限 / 属主 / 模式位对比、忽略规则（.gitignore / glob 过滤）。
- 不做三向或超过两个目录的对比；不做目录级写操作与合并。
- 不做快捷键绑定、命令面板、主题切换与浅色皮肤；不做打包分发、签名、公证、自动更新、CI 发布。
- 不改 `.munk/baseline/**`（由 Delivery 折入）。

## 实现约束

- 技术栈已由上游 tech-research 冻结，不得替换：Electron `^37.10.3` + electron-vite + React 19 + TS + Tailwind CSS v4 + Lucide React；不引入第二套 UI 库 / 样式方案。token 唯一来源 `src/renderer/src/assets/main.css`，差异语义色一律走 `--color-diff-*`，组件不写死颜色 / 尺寸。
- 分层硬约束：目录对比引擎放 `src/core/`，零 Electron / DOM 依赖，可被 vitest 在 Node 环境直接单测；renderer 只经 `PlatformPort`（`@shared/platform/types`）取文件系统数据，绝不直接 import Electron API。可扩展 `PlatformPort`（保持现有契约语义不破坏），新增能力同时给 Electron IPC 与 Web 内存两套实现。
- 目录扫描 / 读取走 `PlatformPort.selectDirectory` / `listDirectory` / `readTextFile`。**SHA-256 必须用可在 Node、浏览器与 Electron renderer 三端运行的实现**：renderer 侧不得引入 `node:*`，不依赖难以单测的异步 Web Crypto；核心比对保持同步纯函数。
- 差异语义复用现有 `DiffStatus`（`same`/`added`/`removed`/`modified`）与 `DiffBadge` / `diffSemantics`，不新造状态枚举。
- 下钻复用现有 `CodeView` / `CsvView` / `StructuredView`，不新写第四个文件查看器；工作台会话模型支持「非样本来源」的会话。
- 目录视图数据源必须换成运行时计算结果：`DirectoryNode.status`（样本 answer key）不再作为目录视图输入，仅 `src/shared/fixtures/` 的校验用例继续使用。
- 内置样本目录经 `PlatformPort` 可读（Web 内存实现把 `src/shared/fixtures/` 挂在 `/samples`）；Electron 下需有等价的可读路径。Web 内存实现 `modifiedMs` 为 0，mtime 短路在样本目录上不生效，由内容哈希兜底。

## 最近交付证明

- WI：`wi_ws_83482f5aa362fd2e`（目录对比引擎 + 双栏目录视图 + 取数与下钻，`kind: feature`）
- 日期：2026-10-18
- 结果：self_test passed。（Host code-gates attempts 001/002 六条门禁均 exitCode 0；`pnpm test` = 6 files / 30 tests 全绿）
- 覆盖摘要：新建纯算法引擎 `src/core/directory/`（`scanDirectory` / `compareScannedTrees` / `compareDirectories` / `planContentReads` / `ComparisonCache` / 同步 `sha256Hex`，大小·mtime 短路 + SHA-256 内容确认 + 按路径/大小/mtime 增量缓存；`compare.test.ts` 覆盖四类状态、增量短路、过滤谓词）；双栏目录视图重写 `views/DirectoryView`（左右双栏树、展开/折叠、逐行 `DiffBadge`、目录后代聚合计数、五档过滤 `SegmentedControl`、Web 模式目录选择降级提示），运行时编排 `workbench/directoryCompare.ts` 与 `workbench/fileKinds.ts`；取数接入 `PlatformPort.selectDirectory`（Electron 原生对话框 / Web 内存降级）与内置样本目录一键加载；下钻经 `Workbench.openFile` 把左右内容带入 `CodeView` / `CsvView` / `StructuredView` 并切换会话（左/右独有空侧补齐、非文本类型给出可读提示）；`App.test.tsx` 随改造同步更新保持绿。十条验收均有对应折叠用例（qa/）。
- 注：本轮 WI change pack 未提供 `tech.md` / `ux/**`，全局 tech / design 折叠跳过。
