# JSON / YAML 结构化语义归一化对比与节点路径变更视图

## 范围

本项交付 OpenCompare 的 P1-1「JSON / YAML 结构化语义对比」闭环。当前仓库已有：工作台壳层与 token/组件基线（`src/renderer/src/components/**`）、四大场景样本底座（`src/shared/fixtures`，场景 D 为乱序深层 JSON/YAML 左右样本）、以及只读原文并列的占位视图 `src/renderer/src/views/StructuredView.tsx`（按钮上已注明「语义归一化对比留给后续子项」）。本项把占位换成真正的语义归一化对比。

1. **结构化语义归一化对比引擎（新增 `src/core/structured/`，纯算法，零 Electron / DOM）**
   - 输入 JSON / YAML 原文，解析为语义树：对象按**键名无序**（键序打乱视为相同）、数组按**索引有序**、注释 / 缩进 / 空白 / 尾逗号 / 引号风格等格式噪音一律丢弃。
   - 按**节点路径**（JSON Pointer，如 `/service/features/limits/maxFiles`，数组用索引段）递归比对，产出扁平的节点变更序列，每项含：路径、状态、原值 / 新值（可在 UI 直接渲染的标量表示）。
   - 状态分类：`added` / `removed` / `modified`（数值或字符串等值变更）/ `typeChanged`（类型变更：number↔string、对象↔标量、标量↔数组、数组↔对象等）/ `same`。**类型变更必须与普通值修改分列不同状态**。
   - 运行时汇总各状态计数（新增 / 删除 / 修改 / 类型变更 / 相同），供视图展示；JSON 与 YAML 各自独立对比，不做跨格式比对。
2. **节点路径变更视图（改造 `src/renderer/src/views/StructuredView.tsx`）**
   - 一键状态过滤：`全部 / 新增 / 删除 / 修改 / 类型变更 / 相同`，即时生效；过滤只影响变更列表，计数恒为当前对比结果的运行时全集。
   - 变更列表按节点路径逐行展示状态、路径与原值 → 新值；状态色一律用差异语义 token（`--color-diff-*`）。
   - JSON / YAML 格式切换（内置场景，沿用现有 `SegmentedControl` 交互）；与左右原文对照（原文仍需可见）。
   - 同时服务两类数据源：内置样本场景（`STRUCTURED_SCENE` 的 json/yaml 两对）与目录树双击下钻传入的 ad-hoc `pair`（含 `format`，此时格式固定、不做切换）。两者的对比引擎与列表渲染是同一套。
   - 解析失败（非法 JSON/YAML）给出可读错误态，不崩溃、不白屏。

## 验收

- ac-key-order-noise: 两份语义相同但对象键序打乱、嵌套深度相同的 JSON 与 YAML 各一组输入，对比结果中**所有节点状态均为「相同」**，新增 / 删除 / 修改 / 类型变更计数均为 0。
- ac-format-noise: 仅注释、缩进、空行、尾逗号、键内引号风格不同的两份 JSON/YAML，不产生任何差异项。
- ac-path-changes: 深层嵌套键值的值变更、键新增与键删除，按 JSON Pointer 节点路径逐条列出，并同时给出原值 → 新值（示例数据可核：`/service/features/limits/maxBytes` 为新增、`/telemetry/enabled` 为修改、`/service/version` 为类型变更）。
- ac-type-change: 类型变更（`2` → `"2.0.0"`、标量 → 对象、对象 → 数组）被单独归类为「类型变更」，与普通数值 / 字符串修改在列表与计数中分开呈现。
- ac-filter: 状态过滤（全部 / 新增 / 删除 / 修改 / 类型变更 / 相同）一键切换后列表内容立即收窄到对应状态；切回「全部」恢复完整列表。
- ac-counts: 计数按运行时对比结果统计（不读样本答案键），新增 + 删除 + 修改 + 类型变更 + 相同 = 参与对比的节点条目总数，且过滤操作不改变计数。
- ac-format-switch-and-drilldown: 内置场景可在 JSON 与 YAML 之间切换并各自展示对应对比结果；从目录对比下钻的 `.json/.yaml` 会话以既定格式直接展示语义对比结果（不显示格式切换）。
- ac-raw-pair-visible: 对比列表与左右原文对照可同屏查看（左右原文仍在视图中可见）。
- ac-parse-error: 非法 JSON 或非法 YAML 输入展示可读错误提示，应用不崩溃，其他会话仍可用。
- ac-core-tests: `src/core/structured/` 有 vitest 用例覆盖键序归一化、格式噪音忽略、深层路径增删改、类型变更与计数；`pnpm test` 全绿。
- ac-gates-green: `install` / `lint` / `typecheck` / `build` / `build-web` / `test` 六条门禁全绿。

## 非目标

- **不做结构化编辑 / 合并**：不做一键采纳、左右覆写、写回文件、导出对比报告。
- **不做跨格式比对**：JSON 只对 JSON、YAML 只对 YAML；不做 JSON ↔ YAML 转换后对比。
- **不做数组智能对齐**：数组按索引比对，不做 LCS / 按元素内容重新对齐数组项。
- **不做 YAML 高级语义**：不实现锚点 / 别名 / 合并键（`<<`）/ 多文档流的额外展开规则，一律按 `yaml` 库默认解析行为；解析失败即走错误态。
- **不做 JSON Schema 校验、不做 JSON5 / JSONC 之外的方言扩展**（`.jsonc/.json5` 下钻仍按 jsonc-parser 默认容错解析，不新增方言规则）。
- **不改样本底座**：`src/shared/fixtures/**` 的样本文本、类型与 `composition` 答案键保持前序冻结状态，不为了让运行时计数等于答案键而调整样本。
- **不做三向结构化合并**、不做十六进制对比、不做 `.xlsx`、不做远端 FTP/SFTP 对比。
- **不做新的视觉设计 / 主题切换 / 快捷键与命令面板**；沿用现有 token 与组件。
- 不改 `.munk/baseline/**`；不写 `tech.md`。

## 实现约束

- **依赖已冻结，不新增 npm 包**：用已装的 `jsonc-parser`（^3.3.1）解析 JSON/JSONC、`yaml`（^2.9.1）解析 YAML；不引入第二套解析器或 UI 库。
- **分层硬约束**：新增 `src/core/structured/` 零 Electron / DOM / React 依赖，可被 vitest 在 Node 环境直接单测；renderer 只 import `@core/*` 与 `@shared/*`，绝不 import Electron API。
- **保持现有接线契约**：`StructuredView` 现有 props（`fixture?` / `pair?` / `format?`）与 `Workbench.tsx` 的调用方式、`ADHOC`/`session.adhoc.format` 语义不破坏；本项以 `StructuredView.tsx` 与 `src/core/structured/` 为主改面，`Workbench.tsx` 只做必要的最小改动。
- **节点路径表示**：统一用 JSON Pointer（`/a/b/0`）；UI 可按需加显示前缀，但引擎输出以 JSON Pointer 为准。
- **新增 / 删除的容器只记一条路径**（其子孙不重复展开计数）；`modified` / `typeChanged` 只记在叶值上。
- **复用现有视觉资产**：过滤用 `SegmentedControl`，面板块用 `Panel`，原文用 `CodeBlock`，状态色用 `DiffBadge` / `diffSemantics` 与 `--color-diff-*` token，错误态用 `StateView`；组件内不写死颜色 / 尺寸。
- 写 UI 读 `.agents/skills/tailwind-4-docs/SKILL.md` 与 `.agents/skills/vercel-react-best-practices/SKILL.md`；写测试读 `.agents/skills/vitest/SKILL.md`。
- 视图组件测试可参考既有 `src/renderer/src/views/CodeView.test.tsx` 的 vitest + jsdom + Testing Library 写法。
- `kind: feature`；本项无 Design / Architect 前置，实现细节按本 prd 与既有仓库模式自行收敛。
