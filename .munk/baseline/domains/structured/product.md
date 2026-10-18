# Domain: structured

JSON / YAML 结构化语义归一化对比域（场景 D）：`src/core/structured/` 的纯算法引擎（解析即归一化 + 按 JSON Pointer 节点路径比对）与 `StructuredView` 的节点路径变更视图（状态过滤、运行时计数、左右原文对照、内置场景格式切换、目录下钻 ad-hoc 数据源、解析错误态）。目录对比 / 代码文本 Diff / 三向合并 / CSV 主键对齐不属本域。

## 范围

- **结构化语义归一化引擎（`src/core/structured/`，纯算法，零 Electron / DOM）**：输入 JSON / YAML 原文，解析为语义树——对象按**键名无序**（键序打乱视为相同）、数组按**索引有序**；**解析即归一化**，注释 / 缩进 / 空白 / 空行 / 尾逗号 / 引号风格等格式噪音自然丢弃。
  - 解析层 `parse.ts`：JSON 经 `jsonc-parser`（容忍注释与尾逗号），YAML 经 `yaml` 库默认解析；空文档与解析失败抛 `StructuredParseError`（含 side、行/列定位）。
  - 比对层 `diff.ts`：按**节点路径**（JSON Pointer，如 `/service/features/limits/maxBytes`，数组用索引段）递归比对，产出扁平节点变更序列 `StructuredChange[]`，每项含 `path` / `status` / 可渲染的标量原值→新值（`left` / `right`）与 `leftType` / `rightType`。
  - 状态分类 `added` / `removed` / `modified` / `typeChanged` / `same`；**类型变更（number↔string、对象↔标量、标量↔数组、数组↔对象等）单列 `typeChanged`，绝不折叠进 `modified`**。
  - 新增 / 删除的容器只记一条路径（子孙不展开计数）；`modified` / `typeChanged` 只记在叶值上。对象按排序键并集遍历，输出与输入键序无关。
  - 运行时汇总各状态计数 `counts`（不读样本 `composition` 答案键）；JSON 与 YAML 各自独立对比，不做跨格式比对。
- **节点路径变更视图（`StructuredView.tsx`）**：一键状态过滤 `全部 / 新增 / 删除 / 修改 / 类型变更 / 相同`（即时生效，仅收窄列表，计数恒为当前对比结果运行时全集）；变更列表逐行展示状态标签、JSON Pointer 路径与原值 → 新值（状态色走差异语义 token `--color-diff-*` / `DiffBadge`，`typeChanged` 用 conflict 色调区分于 `modified`）；同屏左右原文对照（`CodeBlock`）；内置场景 JSON / YAML 格式切换（`SegmentedControl`）。
- **两类数据源同一套引擎**：内置样本场景 `STRUCTURED_SCENE`（json/yaml 两对，可切换格式）与目录树双击下钻传入的 ad-hoc `pair`（含 `format`，格式固定、不显示格式切换控件）。
- **解析错误态**：非法 JSON / YAML 给出可读错误提示（`StateView` 危险态），不崩溃、不白屏，左右原文与其余会话仍可用。
- **本地结构化文件入口（`StructuredView` 顶栏）**：经 `PlatformPort.selectFile` 分别打开左 / 右本地 `.json` / `.yaml` 文件，按扩展名判定格式并重算语义差异；打开非 JSON/YAML 或解析失败时展示可读错误态而非崩溃。

## 验收

- **ac-key-order-noise**：两份语义相同但对象键序打乱、嵌套深度相同的 JSON 与 YAML 各一组输入，对比结果中**所有节点状态均为「相同」**，新增 / 删除 / 修改 / 类型变更计数均为 0。
- **ac-format-noise**：仅注释、缩进、空行、尾逗号、键内引号风格不同的两份 JSON/YAML，不产生任何差异项。
- **ac-path-changes**：深层嵌套键值变更、键新增与键删除按 JSON Pointer 节点路径逐条列出，并给出原值 → 新值（示例可核：`/service/features/limits/maxBytes` 为新增、`/telemetry/enabled` 为修改、`/service/version` 为类型变更）。
- **ac-type-change**：类型变更（`2` → `"2.0.0"`、标量 → 对象、对象 → 数组）单独归类为「类型变更」，与普通数值 / 字符串修改在列表与计数中分开呈现。
- **ac-filter**：状态过滤（全部 / 新增 / 删除 / 修改 / 类型变更 / 相同）一键切换后列表立即收窄到对应状态；切回「全部」恢复完整列表。
- **ac-counts**：计数按运行时对比结果统计（不读样本答案键），新增 + 删除 + 修改 + 类型变更 + 相同 = 参与对比的节点条目总数，且过滤操作不改变计数。
- **ac-format-switch-and-drilldown**：内置场景可在 JSON 与 YAML 之间切换并各自展示对应对比结果；从目录对比下钻的 `.json/.yaml` 会话以既定格式直接展示语义对比结果（不显示格式切换）。
- **ac-raw-pair-visible**：对比列表与左右原文对照可同屏查看（左右原文仍在视图中可见）。
- **ac-parse-error**：非法 JSON 或非法 YAML 输入展示可读错误提示，应用不崩溃，其他会话仍可用。
- **ac-structured-open**：`StructuredView` 顶栏可分别打开左 / 右本地 JSON / YAML 文件并重算语义差异（变更/节点计数随之更新）；打开非 JSON/YAML 或解析失败时显示错误态而非崩溃，左/右原文与其它会话仍可用；取消时不变更现有对比。
- **ac-core-tests**：`src/core/structured/` 有 vitest 用例覆盖键序归一化、格式噪音忽略、深层路径增删改、类型变更与计数；`pnpm test` 全绿。
- **ac-gates-green**：`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 六条门禁全绿。

## 非目标

- **不做结构化编辑 / 合并 / 写回**：不做一键采纳、左右覆写、写回文件、导出对比报告；文件对话框能力由 `PlatformPort.selectFile`（`foundation` 域）提供，本域只做 `StructuredView` 顶栏本地打开接线。
- **不做跨格式比对**：JSON 只对 JSON、YAML 只对 YAML；不做 JSON ↔ YAML 转换后对比。
- **不做数组智能对齐**：数组按索引比对，不做 LCS / 按元素内容重新对齐数组项。
- **不做 YAML 高级语义**：不实现锚点 / 别名 / 合并键（`<<`）/ 多文档流的额外展开规则，一律按 `yaml` 库默认解析行为；解析失败即走错误态。
- **不做 JSON Schema 校验、不做 JSON5 / JSONC 之外的方言扩展**（`.jsonc/.json5` 下钻仍按 `jsonc-parser` 默认容错解析，不新增方言规则）。
- **不改样本底座**：`src/shared/fixtures/**` 的样本文本、类型与 `composition` 答案键保持前序冻结状态，不为了让运行时计数等于答案键而调整样本。
- **不做三向结构化合并**、不做十六进制对比、不做 `.xlsx`、不做远端 FTP/SFTP 对比。
- **不做新的视觉设计 / 主题切换 / 快捷键与命令面板**；沿用现有 token 与组件。
- 不改 `.munk/baseline/**`（由 Delivery 折入）。

## 实现约束

- 技术栈已冻结，不新增 npm 包：用已装的 `jsonc-parser`（^3.3.1）解析 JSON/JSONC、`yaml`（^2.9.1）解析 YAML；不引入第二套解析器或 UI 库。
- 分层硬约束：`src/core/structured/` 零 Electron / DOM / React 依赖，可被 vitest 在 Node 环境直接单测；renderer 只 import `@core/*` 与 `@shared/*`，绝不 import Electron API。
- 保持现有接线契约：`StructuredView` 现有 props（`fixture?` / `pair?` / `format?`）与 `Workbench.tsx` 的调用方式、`ADHOC`/`session.adhoc.format` 语义不破坏；本项以 `StructuredView.tsx` 与 `src/core/structured/` 为主改面，`Workbench.tsx` 只做必要的最小改动。
- 节点路径表示：统一用 JSON Pointer（`/a/b/0`）；UI 可按需加显示前缀，但引擎输出以 JSON Pointer 为准。
- 复用现有视觉资产：过滤用 `SegmentedControl`，面板块用 `Panel`，原文用 `CodeBlock`，状态色用 `DiffBadge` / `diffSemantics` 与 `--color-diff-*` token，错误态用 `StateView`；组件内不写死颜色 / 尺寸。

## 最近交付证明

- WI：`wi_intake_e60068db55d0fef9`（真实文件 IO 闭环 + GitHub 开源发布基线，`kind: feature`）
- 日期：2026-10-19
- 结果：self_test passed。
- 覆盖摘要：`StructuredView.tsx` 顶栏新增「打开左文件 / 打开右文件」，经 `PlatformPort.selectFile` 选本地 `.json`/`.yaml` 后按扩展名判定格式并重算语义差异；打开截断/非法 JSON 时 `jsonc-parser` 抛错由现有错误态呈现（「结构化解析失败」+ side + 行/列 + hint），左右原文与会话不受影响，无崩溃/白屏；每次打开给出「已打开 <路径>」提示，取消不变更对比。语义引擎 `src/core/structured/` 未改，`StructuredView.test.tsx` 保持绿（`pnpm test` 20 files / 155 tests）。一条验收均有对应折叠用例（qa/）。
- 注：本 WI change pack 未提供 `tech.md` / `ux/**`，本轮 tech/ux 折叠跳过（沿用既有 tech overview 与 design 基线）。
