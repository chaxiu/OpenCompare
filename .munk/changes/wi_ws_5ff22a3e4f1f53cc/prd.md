# 双栏 diff 常驻指示条与跳转接线

## 范围

本项把已交付的几何层 `src/core/text/ruler.ts`（`buildRulerBands` / `ratioToRow` / `rowToRatio` / `scrollOffsetForRow` / `nearestBlockIndex(AtRatio)` / `resolveJumpTarget(AtRatio)` / `computeViewportWindow`，导出名已冻结为契约）接成可见、可点、可键盘操作的常驻指示条。

落地内容：

1. **新组件**：在 `src/renderer/src/components/` 新增指示条组件（建议 `DiffRuler.tsx`），只负责绘制与事件：
   - 轨道常驻，按 `buildRulerBands` 输出绘制四态色带（`same` 不画；`conflict` 不属双栏 diff，不画）；
   - 当前差异块描边高亮（复用传入的 active block，不自建第二套选中态）；
   - 随滚动同步的视口窗（半透明覆盖层）；
   - 每个标记可点选，整条可聚焦并支持 `ArrowUp` / `ArrowDown` / `Enter`。
   - 组件不重新 diff、不读文件、不遍历行文本、不新增平台调用；几何全部来自 `@core/text/ruler`，不在组件里复算比例换算。
2. **接线**：在 `src/renderer/src/views/CodeView.tsx` 的 `CodeDiffView` 双栏分支接线，内置 code 样本（`fixture.diff`）与目录下钻 / 拖放 / 打开得到的 `pair` 共用同一个入口，因此两条路径都常驻。
   - 指示条作为双栏区域**外侧兄弟节点**（不放进 `SplitPane.panes`，不参与分隔比例计算）；
   - 点选 / 键盘选择复用现有 `active` 差异块状态：两栏 `scrollTop` 一起滚到该块 `startRow * DIFF_ROW_HEIGHT`，工具栏 `当前/总数` 与 `DiffBadge` 自然同步，不出现两套高亮；
   - 覆写 / 重置 / 打开左或右文件导致 `diff` 变化时，指示条在同一次提交内重投影（无异步、无骨架屏）。
3. **文案与无障碍**：`files.code.ruler.*` 等 key 同时补 zh / en 词典；轨道有本地化 `aria-label`，标记有可读名称（状态 + 行区间）。
4. **测试**：新增 jsdom 集成测试（建议 `src/renderer/src/views/CodeView.ruler.test.tsx`，沿用 `@testing-library/react` + `renderWithI18n`），钉住下方 AC；并在 `.munk/baseline/domains/diff-ruler/qa/` 补可执行 QA 用例（该域 `qa/` 目前为空）。

## 验收

- ac-ruler-persistent: 内置样本 diff 模式与 `pair` 下钻模式渲染后都立即存在指示条（`data-diff-ruler`），且它不在 `SplitPane` 的分隔节点序列里（`role="separator"` 数量与改动前一致，指示条不是 pane）；切到 merge 模式不渲染指示条；覆写 / 重置 / 打开文件后指示条仍在。
- ac-ruler-aggregation: 标记集合与行级状态逐行一致——每个非 `same` 行都被某条 `data-diff-status === 该行 status` 的标记覆盖（`data-start-row <= 行 < data-end-row` 的区间包含），`same` 行不产生标记；同一差异块内 added 与 removed 混合时两类标记并存、不被压成块级汇总状态；标记按 `data-start-row` 升序；给定足够轨道高度时标记行区间等于极大同态连续段。
- ac-ruler-window: 视口窗（`data-window-top` / `data-window-height`）由当前 `scrollTop`、视口高度、行高与轨道高度算出并两端钳制，满足 `top >= 0`、`height >= 0`、`top + height <= 轨道高度`；滚动左栏或右栏后视口窗跟随更新，且两栏 `scrollTop` 仍相等；滚动不改变标记数量与标记行区间（色带不重建）。
- ac-ruler-jump: 点击任一标记后左右两栏 `scrollTop` 都等于 `该块 startRow * 20` 且彼此相等；工具栏计数变为该块序号/总数、`DiffBadge` 显示该块状态、该块行显示 `border-accent` 高亮；连续点选不同标记可连续上下跳转；对已激活的标记再次点击仍重新定位到该块首行（即使中间已滚走）。
- ac-ruler-keyboard: 指示条可通过 Tab 聚焦并显示 focus ring，其 `aria-label` 随 zh / en 词典变化；聚焦时 `ArrowDown` / `ArrowUp` 按现有 `blocks` 顺序循环切换 active（首块 `ArrowUp` 到尾块，尾块 `ArrowDown` 回首块）并完成与点选相同的双栏定位，`Enter` 重新定位当前块；每个标记的可访问名称包含其状态与行区间文本，且触发点选与鼠标点击等效。
- ac-ruler-regression: 空 diff（两侧皆空）时指示条常驻、零标记、工具栏 `0/0` 且上一 / 下一按钮禁用；全相同时指示条常驻、零标记但视口窗仍随滚动移动；仅左删只有 removed 标记、仅右增只有 added 标记且行位置对应真实行；单行 / 无尾换行 / CRLF 输入不越界、不偏移；行内字符高亮、编辑 / 覆写 / 重置 / 保存行为与 `SplitPane` 拖拽交互保持原状；滚动与点选不新增 `diffLineTexts` 调用、不新增 `PlatformPort` 调用（含 `readTextFile` / `selectFile`）；zh 与 en 渲染均无硬编码中文残留。

## 非目标

- 不改 `src/core/text/ruler.ts` 的既有导出语义、`diffLineTexts` / `buildBlocks` / `merge` / `overwriteBlock`、`DiffRow` / `DiffBlock` / `DiffStatus` 类型与 `INLINE_CHAR_LIMIT`。
- 不改 `DiffPane.tsx` 的渲染路径与 props（行渲染、filler 行、`inlineSegments`、`DIFF_ROW_HEIGHT`）、不改 `SplitPane.tsx` 的拖拽 / 键盘 / 比例逻辑。
- 三栏 merge 视图不加指示条；目录树 / CSV / 结构化视图不改。
- 不做文本缩略图、逐行文本 / 行号列表 / 语法高亮绘制、不做逐行 DOM。
- 不做视口窗拖动（拖拽定位）与手势优先级；不新增全局快捷键。
- 不新增依赖、不新增 IPC / 平台通道、不做远端对比、不改窗口化与内存护栏口径。
- 不跑 `self_test` / 真实 358k 实机 / 浏览器点选（product-qa 承接）；不改 `code-gates.json`、不新增测试框架。
- 不碰版本号、`CHANGELOG`、`README*`、`docs/**`、发布脚本与发布单点文件。

## 实现约束

- 几何与命中一律消费 `@core/text/ruler` 现有导出，组件内不复制比例换算 / 最近块命中 / 视口窗公式；确需补充能力时只做最小纯函数追加并配单测，不改既有导出语义。
- 视觉只用 token：轨道 `--color-surface-sunken` / `--color-line-subtle`，标记 `--color-diff-added` / `--color-diff-removed` / `--color-diff-modified`（复用 `diffSemantics` 语义映射），当前块 `--color-accent`，视口窗半透明表面色；禁止写死色值与像素常量；窄条宽度 32–56px 区间内自定，高度铺满双栏区域。
- 指示条固定为 `SplitPane` 外侧兄弟节点；`SplitPane` 仍只接收两个 pane。
- 轨道 / 视口高度经元素 `clientHeight`（或等价可 stub 的 DOM 度量）读取；jsdom 无 `ResizeObserver`，使用它时必须做存在性降级，不得让未测量（高度为 0）导致标记消失——高度为 0 时仍按最少 1 桶投影绘制标记。测试可在 jsdom 中 stub `clientHeight` 并直接赋值 `scrollTop` 后 `fireEvent.scroll`。
- 滚动只更新视口窗几何（组件局部 state 或 ref/CSS 均可），不得在滚动中重建色带数组或触发 `diffLineTexts`；色带 `useMemo` 绑定 `diff`（+ 轨道几何）。
- 点选 / 键盘只改现有 `active` 块索引，不新增第二套选中状态；重复选择同一块需能再次定位（例如 jump 令牌）。
- 稳定测试锚点：轨道 `data-diff-ruler`，标记 `data-diff-status` / `data-start-row` / `data-end-row`，视口窗 `data-window-top` / `data-window-height`（数值取整即可断言）。
- i18n：新文案进 `src/renderer/src/i18n/messages/{zh,en}/files.ts`（key 以 `files.code.ruler.*` 开头），新组件加入 `src/renderer/src/views/filesScan.test.ts` 的 `FILES_COPY_FILES`，源码内不写硬编码中文。
- 集成测试用长样本对（行数 × 20 明显大于 stub 的 `clientHeight`）才能观察到视口窗位移；不得为测试改动生产代码分支。
- 交付时在 `.munk/baseline/domains/diff-ruler/` 补 `qa/` 用例（`covers:` 对应本 prd 的 ac id），并同步该域 `product.md` 的范围 / 验收，说明组件与接线已归入本域。
