# diff-ruler-evidence-anchors

covers: ac-evidence-anchors
标题: 指示条的证据选取器锚点稳定（轨道 / 标记 / 视口窗的 data-* 与可访问名称）
步骤: 自动化：`pnpm test -- DiffRuler.scale` 中 anchors 两例全绿 → 实机 / 开发者工具：在双栏 Diff 中打开检查器，选中指示条轨道与任意标记、视口窗，分别读取属性；再把界面语言切到 en 重读一遍
期望: 轨道节点带 `data-diff-ruler="true"`、`role="listbox"`，可访问名称为 zh「差异指示条」/ en「Difference ruler」；每个标记 `role="option"`、`data-diff-status` 为 added / removed / modified 之一、`data-start-row` 与 `data-end-row` 为数字且 start ≤ end，可访问名称匹配 zh「新增/删除/修改 · 第 x–y 行」与 en「Added/Removed/Modified · lines x–y」；视口窗元素带可解析为数字的 `data-window-top` / `data-window-height`；这些锚点在滚动、点选、覆写、下钻、切 tab 后都不变（属性名即为 product-qa 选取器契约，不得改名）
