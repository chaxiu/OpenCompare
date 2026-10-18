# 代码/文本双栏字符级 Diff 与三向冲突块点选合并（3-way Merge）

前序 `repo-bootstrap`（工程底座 + 门禁）与 `ui-baseline`（视觉基线 + 工作台壳层 + 样本底座）已合入 tip。当前 `src/renderer/src/views/CodeView.tsx` 只是占位：双栏/三栏各自渲染 `CodeBlock` 原文，无差异、无合并；代码会话状态栏的「冲突块 3」来自样本 answer key。本项把代码场景做成可用的对比与合并工作流。

## 范围

1. **双栏代码 Diff（`CodeView` 的 `diff` 模式）**
   - 用 `diff`(jsdiff) 对左右文本按行计算行级差异块，标注 `same / added / removed / modified`；颜色走既有差异语义 token（`--color-diff-*` + `DiffBadge`/`diffSemantics`）。
   - **行内字符级高亮**：对配对上的 modified 行再做二级字符级 diff，只给变化片段着色，非整行涂色。
   - **行号映射与对齐**：左/右行号槽显示各自真实行号；单侧多出/缺少的行在对侧以填充占位行对齐，使同一差异块左右视觉齐平。
   - **同步滚动**：拖任一侧垂直滚动，另一侧按行号映射同步滚动（含水平滚动同步）；同步不能抖动或互踢。
   - **差异块导航**：上一个/下一个差异块按钮循环定位，当前块高亮并让两侧同时滚动到可见；显示当前块序号/总数。
   - **单块左右覆写**：对选中差异块提供「→ 覆写到右」/「← 覆写到左」，把该块文本写入对侧文本并即时重算差异；提供一次撤销/重置回样本原文的能力。

2. **三向合并（`CodeView` 的 `merge` 模式，base / ours / theirs）**
   - 用 `node-diff3` 的 `diff3MergeRegions`（按 `\n` 切分的行数组调用，杜绝空白丢失）识别稳定区与冲突区，区分「仅一侧变更（可自动采纳的稳定区）」与「双侧冲突块」。
   - **冲突剩余计数**：显示仍有待决冲突数；每解决一块即时递减，清零时有明确完成态；代码会话底部状态栏的「冲突块」改为运行时计算（不再读样本 answer key 的 `conflict`）。
   - **上下冲突跳转**：上一个/下一个冲突定位并高亮当前冲突块。
   - **逐块一键点选采纳**：每个冲突块提供 `Accept Ours` / `Accept Theirs` / `Accept Both` / `Accept Base` 四个动作，选择后该块标记为已解决并显示采纳来源；可改选。
   - **实时合并结果预览**：独立预览区（底部或侧栏）随每次选择即时更新；未解决块在预览中以冲突标记/待定样式呈现，不静默丢弃。
   - **保存 / 导出合并文本**：冲突清零后可将合并结果导出为文本文件（并支持复制到剪贴板）；导出内容等于按选择拼接的正确结果，无残留冲突标记。

3. **算法落位与测试**
   - 行级+行内 Diff 计算、diff3 区域计算与「已解决选择 → 合并文本」的拼接均为纯函数，放 `src/core/`（零 Electron/DOM），可由 vitest 在 Node 直接单测；行内字符级 diff 对超长行有退化保护（避免卡死）。
   - 复核 `src/shared/fixtures/fixtures.test.ts` 对 3 冲突块的既有断言仍绿（样本 answer key 不改）。

## 验收

- ac-diff-inline-char: 双栏 Diff 对修改行给出行内字符级高亮（仅变化片段着色），行级状态与差异语义色一致。
- ac-diff-line-align: 左右行号槽显示各自真实行号，单侧多出的行在对侧以填充占位对齐，差异块左右视觉齐平。
- ac-diff-sync-scroll: 拖动任一栏滚动，另一栏按行号映射同步滚动，无抖动/互踢。
- ac-diff-block-nav: 差异块上一个/下一个可循环定位每个差异块，当前块高亮且两侧滚动到可见。
- ac-diff-block-overwrite: 单块「覆写到左/右」把该块写入对侧并即时重算差异，且可撤销/重置回样本原文。
- ac-merge-regions: 三向合并按行识别稳定区与冲突块，初始冲突块数量与样本场景（3 块）一致。
- ac-merge-count-nav: 冲突剩余计数随逐块解决实时递减并可清零；上下冲突跳转定位并高亮目标冲突块。
- ac-merge-accept: 每个冲突块可一键 `Accept Ours` / `Accept Theirs` / `Accept Both` / `Accept Base`，解决后显示采纳来源且可改选。
- ac-merge-preview: 合并结果预览随每次选择实时更新，未解决块以冲突标记呈现而非静默丢弃。
- ac-merge-export: 全部冲突清零后可导出合并文本（导出/复制成功），内容为按选择拼接的正确结果且无残留冲突标记。
- ac-code-statusbar-runtime: 代码会话状态栏冲突计数来自运行时计算，随解决递减，不再读样本 answer key。
- ac-tests: `src/core/` 有 vitest 覆盖行级/行内字符级区间、差异块划分、diff3 区域划分与采纳拼接结果；`pnpm test` 绿。
- ac-gates-green: `install` / `lint` / `typecheck` / `build` / `build-web` / `test` 六条门禁全绿。

## 非目标

- 不做目录树对比/下钻、CSV 主键对齐、JSON/YAML 语义 diff、增量同步与模板归位——各属后续子项；本项只动代码场景。
- 不替换目录 / CSV / JSON·YAML 三类会话的 answer-key 统计，只改代码会话的冲突计数。
- 不引入 CodeMirror / Monaco 等重型编辑器或第二套 UI 库；沿用既有组件与自建行渲染。
- 不做语法高亮（仅差异语义高亮）、不做浅色主题、不做快捷键/命令面板、不做分栏拖拽（`SplitPane` 已具备）。
- 不做真实文件选择对话框与「打开本地文件对比」流程；Diff/合并的输入仍是样本/内存文本。
- 不改 `.munk/baseline/**`、不改样本 answer key 数值、不改工程门禁与依赖清单（`diff`、`node-diff3` 已装）。
- 不做十六进制/二进制对比、`.xlsx` 解析、FTP/SFTP。

## 实现约束

- 技术栈已冻结：Electron + electron-vite + React 19 + TS + Tailwind v4 + Lucide React；Diff 用 `diff`(jsdiff)，3-way 用 `node-diff3`，不得替换。
- 分层硬约束：`src/core/` 零 Electron/DOM（ESLint 已强制）；renderer 绝不直接 import Electron API，平台能力只经 `PlatformPort`。
- 视觉：token 唯一来源 `src/renderer/src/assets/main.css`；差异色一律 `--color-diff-*` 与既有 `DiffBadge`/`diffSemantics` 词汇（same/added/removed/modified/conflict），组件内不写死颜色尺寸。
- 交互文案与视图沿用中文（如「双栏 Diff / 三向合并」）；`CodeView` 现有「只读呈现样本原文 · 合并算法留给后续子项」提示语随本项落地移除/改写。
- 长行保护：行内字符级 diff 超过阈值（如单行 >2000 字符）退化为整行高亮，避免渲染卡死。
- 写代码前读相关 Skill：`vitest`、`vercel-react-best-practices`、`tailwind-4-docs`；类型设计读 `typescript-advanced`。
- 保持既有测试绿：`src/renderer/src/App.test.tsx`、`src/shared/fixtures/fixtures.test.ts`、`src/renderer/src/platform/web-platform.test.ts`。
