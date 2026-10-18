# 文件夹增量复制同步（含 Dry-run 预览弹窗）与跨层级模板归位提取器

前序已交付「只读双目录对比」（`src/core/directory/compare.ts` + `DirectoryView.tsx`：相对路径配对、`same/added/removed/modified` 四类状态、大小/mtime 短路 + SHA-256 内容确认、增量缓存、五档过滤、下钻）。该域明确只读、无任何写操作。本项在**同一域内**追加两项高阶目录操作能力（overview P1-2 / P1-3），把目录域从只读升级为「先预览、后写入」。

## 范围

### 1. 文件夹单向增量复制 / 镜像同步（`src/core/directory/` 纯算法 + `DirectoryView` 交互）

- **同步计划生成器（`src/core/directory/`，纯函数）**：基于现有 `DirectoryComparison` 输出某方向（**左→右 / 右→左**）的变更清单：
  - `copy`（新增拷贝）：源侧有、目标侧不存在的文件。
  - `update`（覆盖修改）：两侧都存在且状态为 `modified` 的文件。
  - `delete`（删除）：仅**镜像模式**下，目标侧独有（源侧不存在）的文件；默认不勾选、可逐项取消。
  - `same` 文件不进清单。每一项带相对路径、源/目标绝对路径与字节数；计划带字节汇总（拷贝 N 文件 / X 字节、覆盖 M 文件 / Y 字节、删除 K 文件 / Z 字节）。
- **执行器**：按计划经 `PlatformPort` 写入目标侧，自动创建缺失的中间目录；同一方向重复执行后计划为空（幂等）。
- **Dry-run 预览确认弹窗**：执行前弹出弹窗，分组列出待新增拷贝、待覆盖修改（镜像模式另列待删除项），显示字节汇总与目标根路径；**取消不写任何文件**；确认后才执行。
- **执行后刷新**：写入完成后自动重跑 `compareDirectories`，目录树、徽章与状态栏统计随之刷新。
- 入口位于目录视图工具栏（方向 + 增量/镜像模式 + 「预览并同步」）。

### 2. 跨层级散乱目录树按模板归位 / 提取器

- **匹配器（`src/core/directory/`，纯函数）**：以模板树 A（当前目录会话左/源侧，或用户选定目录）的**相对路径槽位**为骨架，用「**文件名 + SHA-256 内容哈希**」从层级被打乱的树 B（内置 `/samples/directory/incoming` 或用户选定目录）中匹配文件，产出三类：
  - `matched`：A 槽位 ← B 文件（文件名一致且内容哈希一致）。
  - `missing`：A 槽位在 B 中无对应文件。
  - `conflict`：A 槽位同名候选存在但内容哈希不同，或同名候选多于一个（无法唯一归位）。
  - 另列出 B 中未被任何槽位消费的 `unused` 文件。
  - 匹配经哈希索引 + 文件名索引完成，**线性复杂度**，不做两两内容比对。
- **预览**：视图展示映射预览（已匹配的相对路径归位映射、缺失槽位、冲突项、B 未使用文件）；确认前不写任何文件。
- **提取归位**：确认后按模板 A 的相对路径结构写出所有 `matched` 文件（自动创建缺失父目录）到一个目标根；完成后用同一匹配器复核归位结果。

## 验收

- ac-sync-plan: 纯函数计划生成器按方向产出 `copy` / `update`（镜像模式另含 `delete`）变更清单，逐项带相对路径与字节数、并给出字节汇总；左→右 与 右→左 互为镜像（vitest 可单测）。
- ac-sync-plan-same-modified: 两侧相同的文件不进清单；`modified` 进 `update`；源侧独有的文件在目标侧进 `copy`（vitest 覆盖四类状态）。
- ac-sync-dryrun-dialog: 目录视图可发起左→右 / 右→左同步并弹出 Dry-run 预览弹窗，分组展示待新增拷贝 / 待覆盖修改（镜像模式含待删除）与字节汇总；取消后目标侧无任何写入。
- ac-sync-apply-refresh: 确认后经 `PlatformPort` 实际写入（缺失父目录自动创建），完成后自动重跑对比并刷新目录树与统计；再执行同一方向时计划为空（幂等）。
- ac-sync-mirror-delete: 镜像模式可把目标侧独有文件列为待删除项并可逐项取消；未勾选项不被删除。
- ac-sync-electron-local: Electron（`pnpm dev`）下对两个真实本地目录完成 dry-run → 确认 → 磁盘写入 → 重新对比闭环。
- ac-sync-web-sample: Web（`pnpm dev:web`）下用内置样本目录 / 内存可写区完成同一闭环；内置样本库保持只读、可重复一键加载（写操作不污染 `/samples`）。
- ac-template-match: 匹配器以文件名 + SHA-256 内容哈希把散乱树 B 的文件映射到模板 A 的相对路径槽位，正确产出 已匹配 / 缺失 / 冲突（同名不同内容或同名多候选），并列出 B 未使用文件（vitest 可单测）。
- ac-template-sample: 对模板 A（`/samples/directory/baseline`）与散乱树 B（`/samples/directory/incoming`）匹配，能把被打乱层级的多层文件归位到模板路径（如 `misc/deep/deeper/strings.ts` → `src/core/utils/strings.ts`、`misc/ui/SplitPane.tsx` → `src/ui/workbench/SplitPane.tsx`），缺失槽位正确报缺失。
- ac-template-preview: 视图展示归位映射预览（已匹配相对路径、缺失、冲突、B 未使用），确认前不写任何文件。
- ac-template-extract: 确认后按模板 A 的相对路径结构写出（自动创建缺失父目录），且用同一匹配器复核归位结果为全匹配、模板结构可从输出目录重建。
- ac-template-perf: 匹配基于哈希/文件名索引，1,000+ 文件的合成散乱树仍在线性时间内完成且不对同一文件重复读取内容 / 计算哈希（vitest 用计数桩断言）。
- ac-gates-green: `install` / `lint` / `typecheck` / `build` / `build-web` / `test` 六条门禁全绿，且新增 vitest 覆盖同步计划与模板匹配。

## 非目标

- 不做双向 / 三向同步、不做持续或定时自动同步、不做文件监听（watcher）与增量重扫调度。
- 不做冲突自动合并策略：同步按方向覆盖，不做内容级合并（3-way 归代码会话）。
- **不做二进制 / 非 UTF-8 字节级拷贝**（平台读写通道为文本）；不做权限 / 属主 / 模式位 / ACL / 符号链接复制；不做回收站、版本保留、保留策略等高级镜像选项。
- 不做模板归位的模糊 / 相似度匹配、重命名识别与内容 diff 匹配：仅精确文件名 + SHA-256 内容哈希；改名文件按「缺失 + B 未使用」处理。
- 不改既有的只读对比语义与四类状态枚举；不重写目录对比引擎、过滤与下钻。
- 不做文件级差异算法本体（行级 / 行内字符级 diff、3-way merge）、CSV 主键对齐、JSON/YAML 语义归一化 diff。
- 不做 Hex 二进制对比、`.xlsx` 解析、远端 FTP / SFTP。
- 不做三向或超过两个目录的对比；不做快捷键绑定、命令面板、主题切换；不做打包分发 / 签名 / 公证 / 自动更新 / CI 发布。
- 不改样本 answer key（`src/shared/fixtures/` 的 `status` 字段），不改 `.munk/baseline/**`（由 Delivery 折入）。

## 实现约束

- 技术栈已冻结，不得替换：Electron `^37.10.3` + electron-vite + React 19 + TS + Tailwind CSS v4 + Lucide React；不引入第二套 UI 库 / 样式方案。token 唯一来源 `src/renderer/src/assets/main.css`，差异语义色走 `--color-diff-*`，组件不写死颜色 / 尺寸。
- 两个新算法放 `src/core/directory/`（如 `sync.ts` / `template.ts`），零 Electron / DOM 依赖，纯函数或「纯函数 + 注入的 IO 回调」，必须能被 vitest 在 Node 环境直接单测；复用 `scanDirectory` / `compareDirectories` / `sha256Hex` / `ComparisonCache` / `DirectoryDiffNode`。
- 所有文件系统写操作经 `PlatformPort`（`@shared/platform/types`）；按需最小扩展契约（如 `ensureDirectory`，必要时 `copyFile`）并**同时给出 Electron IPC 与 Web 内存两套实现**，新 channel 登记到 `src/shared/platform/channels.ts` 白名单；renderer 绝不直接 import Electron API。
- **写入后必须使受影响路径的比对缓存失效**（清 `ComparisonCache.hashes` 对应条目），并让 Web 虚拟文件系统的写入更新其 size / mtime 元数据；否则「size 与 mtime 相同即判相同」的短路会让刷新读到旧结论（Web 侧 `modifiedMs` 恒为 0，尤其危险）。
- 目标 / 源若落在只读的 `/samples` 挂载上，先物化到可写区再执行（Web → `/memory/**`；Electron → 临时目录），保证样本库只读且可重复加载。
- Dry-run 弹窗与模板预览用现有基础组件组合（`Panel` / `Button` / `ToolbarButton` / `SegmentedControl` / `DropdownMenu` / `TreeView` / `DiffBadge`），需要弹层语义时用 `role="dialog"` + 焦点管理；不新造第四套视图或重型组件库。
- 匹配与计划生成必须避免 O(n²) 内容比对：哈希 / 文件名建索引后再匹配。
- 大目录操作不阻塞 UI：执行 / 匹配期间有忙碌态与错误提示（复用现有 `busy` / `notice`），失败要给出可理解信息且不静默半途写坏目标侧。
- UI 改造前读 `.agents/skills/tailwind-4-docs/SKILL.md` 与 `.agents/skills/vercel-react-best-practices/SKILL.md`；写测试读 `.agents/skills/vitest/SKILL.md`；改主进程 / IPC 读 `.agents/skills/electron-dev/SKILL.md`。
- 现有 `src/renderer/src/App.test.tsx` 与目录视图 / 下钻相关断言需随改造同步并保持绿。
- 本项 `kind: feature`：只交「Dry-run 增量/镜像同步」与「跨层级模板归位提取器」两块，不加任何未被验收覆盖的顺手优化。
