# diff-ruler-scale-guards

covers: ac-scale-single-pass, ac-scale-marker-bound, ac-scale-row-coverage, ac-scale-no-reproject, ac-scale-zero-io, ac-scale-large-edges
标题: 358k 行对的指示条只做一次线性投影，标记数受轨道高度约束，滚动 / 点选 / 改窗口尺寸不再 diff 也不再读盘
步骤: 自动化：`pnpm test -- DiffRuler.scale` 全绿（该文件用透传 spy 计数 `buildRulerBands` / `diffLineTexts`，直接构造 358k 行 `DiffRow[]` + `DiffBlock[]` 渲染 `DiffRuler`）→ 实机：准备一对 ~358k 行的真实文本对照（或等量级生成文件），打开为双栏 Diff → 反复拖动滚动条从文件头到文件尾再回到中间 → 点选若干标记 → 拖拽窗口边缘 / 拖动分隔条改变轨道高度 → 再把一侧换成空文件、两侧改成完全相同、只留左侧独有行、只留右侧独有行、以及一行超长（接近行内高亮上限）的对照
期望: 指示条轨道在同一轨道高度下只投影一次、直接消费传入的行数组（不复制 / 不浅拷贝）；标记节点数 ≤ 3 × floor(轨道高 / 色带宽) 且远小于行数，每个标记都在轨道内（top ≥ 0、height ≥ 0、top + height ≤ 轨道高），指示条内没有逐行文本；每个非 same 行都被同状态标记覆盖（可采样核对若干块）；滚动、点选、改变轨道高度全程不重新 diff、不重新读文件、不弹系统文件对话框、不扫描目录、不重算摘要，轨道高度变化后标记按新高度重绘且不越界；空 / 全相同 / 仅左删 / 仅右增 / 超长单行五个边界都不报错，空与全相同零标记但指示条仍常驻且视口窗完整在轨道内，仅左删只出现删除色、仅右增只出现新增色；超过 300k 行时界面仍可正常滚动点选，无卡死或控制台报错
