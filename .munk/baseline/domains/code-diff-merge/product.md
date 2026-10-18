# Domain: code-diff-merge

代码 / 文本场景的差异对比与三向合并工作流（`CodeView` 的 `diff` 与 `merge` 模式）：行级 + 行内字符级 Diff、行号对齐与同步滚动、差异块导航 / 单块覆写，以及基于 `node-diff3` 的三向冲突块点选采纳 / 实时预览 / 导出。业务算法（纯函数）落 `src/core/`，零 Electron/DOM。目录 / CSV / JSON·YAML 场景不属本域。

## 范围

- **双栏代码 Diff（`CodeView` 的 `diff` 模式）**：`diff`(jsdiff) 行级差异块（same / added / removed / modified），颜色走既有差异语义 token（`--color-diff-*` + `DiffBadge`/`diffSemantics`）；配对 modified 行的二级行内字符级高亮（仅变化片段着色）；左/右真实行号槽 + 单侧多出/缺少行的填充占位对齐；按行号映射的双向同步滚动（垂直 + 水平）；差异块上一个/下一个循环导航（当前块高亮 + 两侧滚入可见 + 序号/总数）；单块「→ 覆写到右」/「← 覆写到左」即时重算差异与一次撤销/重置回样本原文。
- **三向合并（`CodeView` 的 `merge` 模式，base / ours / theirs）**：`node-diff3` 的 `diff3MergeRegions`（按 `\n` 切分行数组调用）识别稳定区与冲突区，区分「仅一侧变更（自动采纳）」与「双侧冲突块」；冲突剩余计数实时递减至清零完成态；上下冲突跳转定位并高亮；逐块 `Accept Ours` / `Accept Theirs` / `Accept Both` / `Accept Base` 采纳与改选（显示采纳来源）；独立合并结果预览区随选择即时更新（未解决块以冲突标记呈现）；冲突清零后导出合并文本 + 复制到剪贴板。
- **算法落位与测试**：行级 + 行内 Diff 计算、diff3 区域计算、已解决选择 → 合并文本拼接均为 `src/core/` 纯函数，可由 vitest 在 Node 直接单测；行内字符级 diff 对超长行（>2000 字符）退化整行标记保护。
- **本地文件入口（`CodeView` 顶栏）**：经 `PlatformPort.selectFile` 分别打开左 / 右本地文本文件即时刷新双栏 Diff；三向合并可分别打开 base / ours / theirs 本地文件并重建合并模型与冲突列表（清空旧采纳状态）；冲突全部解决后经 `PlatformPort.saveFile` 把合并结果保存到本地（`defaultPath` 预填，未解决时动作禁用）。

## 验收

- **ac-diff-inline-char**：双栏 Diff 对修改行给出行内字符级高亮（仅变化片段着色），行级状态与差异语义色一致。
- **ac-diff-line-align**：左右行号槽显示各自真实行号，单侧多出的行在对侧以填充占位对齐，差异块左右视觉齐平。
- **ac-diff-sync-scroll**：拖动任一栏滚动，另一栏按行号映射同步滚动，无抖动/互踢。
- **ac-diff-block-nav**：差异块上一个/下一个可循环定位每个差异块，当前块高亮且两侧滚动到可见。
- **ac-diff-block-overwrite**：单块「覆写到左/右」把该块写入对侧并即时重算差异，且可撤销/重置回样本原文。
- **ac-merge-regions**：三向合并按行识别稳定区与冲突块，初始冲突块数量与样本场景（3 块）一致。
- **ac-merge-count-nav**：冲突剩余计数随逐块解决实时递减并可清零；上下冲突跳转定位并高亮目标冲突块。
- **ac-merge-accept**：每个冲突块可一键 `Accept Ours` / `Accept Theirs` / `Accept Both` / `Accept Base`，解决后显示采纳来源且可改选。
- **ac-merge-preview**：合并结果预览随每次选择实时更新，未解决块以冲突标记呈现而非静默丢弃。
- **ac-merge-export**：全部冲突清零后可导出合并文本（导出/复制成功），内容为按选择拼接的正确结果且无残留冲突标记。
- **ac-code-statusbar-runtime**：代码会话状态栏冲突计数来自运行时计算，随解决递减，不再读样本 answer key。
- **ac-code-diff-open**：`CodeView` 双栏 Diff 顶栏可分别打开左 / 右本地文本文件，打开后对比区立即按新内容刷新（差异块计数随之更新）；取消时不改变现有对比且不报错。
- **ac-code-merge-open**：`CodeView` 三向合并模式可分别打开 base / ours / theirs 本地文件并重建合并模型与冲突列表（冲突计数/列表随之更新、旧分块采纳状态清空、导航回到首块）；取消时不改变现有合并状态。
- **ac-code-merge-save**：三向合并冲突全部解决后，可经 `saveFile` 把合并结果保存到本地文件（未解决时该动作不可用）；保存内容为按各块选择拼接的结果且不含冲突标记，保存后给出成功提示，取消不误报成功。
- **ac-tests**：`src/core/` 有 vitest 覆盖行级/行内字符级区间、差异块划分、diff3 区域划分与采纳拼接结果；`pnpm test` 绿。
- **ac-gates-green**：`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 六条门禁全绿。

## 非目标

- 不做目录树对比/下钻、CSV 主键对齐、JSON/YAML 语义 diff、增量同步与模板归位——各属后续子项；本域只动代码/文本场景。
- 不替换目录 / CSV / JSON·YAML 三类会话的 answer-key 统计，只改代码会话的冲突计数。
- 不引入 CodeMirror / Monaco 等重型编辑器或第二套 UI 库；沿用既有组件与自建行渲染。
- 不做语法高亮、浅色主题、快捷键/命令面板、分栏拖拽（`SplitPane` 已具备）。
- 文件对话框能力由 `PlatformPort.selectFile` / `saveFile`（`foundation` 域）提供，本域只做视图入口接线；不做最近文件列表、多文件选择、目录批量 IO 等顺手扩展。
- 不做十六进制/二进制对比、`.xlsx` 解析、FTP/SFTP。

## 实现约束

- 技术栈已冻结：Electron + electron-vite + React 19 + TS + Tailwind v4 + Lucide React；Diff 用 `diff`(jsdiff)，3-way 用 `node-diff3`，不得替换。
- 分层硬约束：`src/core/` 零 Electron/DOM（ESLint 已强制）；renderer 绝不直接 import Electron API，平台能力只经 `PlatformPort`。
- 视觉：token 唯一来源 `src/renderer/src/assets/main.css`；差异色一律 `--color-diff-*` 与既有 `DiffBadge`/`diffSemantics` 词汇（same/added/removed/modified/conflict），组件内不写死颜色尺寸。
- 交互文案与视图沿用中文（「双栏 Diff / 三向合并」）。
- 长行保护：行内字符级 diff 超过阈值（单行 >2000 字符）退化为整行高亮。
- 保持既有测试绿：`App.test.tsx`、`src/shared/fixtures/fixtures.test.ts`（样本 answer key 不改）、`web-platform.test.ts`。

## 最近交付证明

- WI：`wi_intake_e60068db55d0fef9`（真实文件 IO 闭环 + GitHub 开源发布基线，`kind: feature`）
- 日期：2026-10-19
- 结果：self_test passed。
- 覆盖摘要：`CodeView.tsx` 顶栏接入 `PlatformPort.selectFile` / `saveFile` —— 双栏 Diff 可分别打开左/右本地文本文件并即时重算差异块；三向合并可分别打开 base/ours/theirs 本地文件并重建合并模型（旧采纳状态清空、导航回首块）；冲突清零后「导出合并文本」经 `saveFile`（`defaultPath=merged.txt`）保存，未清零时禁用；每次打开/保存给出「已打开/已保存 <路径>」提示，取消不改变状态、不误报。`CodeView.test.tsx` 随入口同步扩展，`pnpm test` 20 files / 155 tests 全绿，样本兜底路径与四项核心算法未改。三条验收均有对应折叠用例（qa/）。
- 注：本 WI change pack 未提供 `tech.md` / `ux/**`，本轮 tech/ux 折叠跳过（沿用既有 tech overview 与 design 基线）。
