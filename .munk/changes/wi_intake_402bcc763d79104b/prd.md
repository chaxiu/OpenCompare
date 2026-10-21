# 「新建对比」弹窗遮挡目录对比进度条与取消按钮（D1）

缺陷来源：product-qa `trun_c0949d56cd94be47`，被测 main `0856b470`（digest §2 D1）。
证据：`projects/ops_df43e423451170fd/.munk/runs/trun_c0949d56cd94be47/digest.md`、同目录 `evidence/cdp/09-C-cancel.json`（真实坐标点击「取消」的 hitChain 落点是弹窗 `DIV`）、`evidence/cdp/C-02-progress.png`（进度条渲染但被遮罩压暗）。

## 范围

修复主入口「顶栏 新建对比 → 粘贴左右路径 → 建立对比」发起大目录对比时，`NewCompareDialog` 在整段扫描期不关闭、其 `Dialog` 遮罩（`fixed inset-0 z-40`）压住 shell 上的目录对比进度条，导致「取消」真实点击不可达、弹窗零进度反馈（唯一按钮 disabled），用户体感为卡死。

根因（实测已确认，供 Coding 定位）：`src/renderer/src/workbench/NewCompareDialog.tsx` 的 `submit()` 在 `await openRequest(...)` 返回之后才 `onClose()`，而 `openRequest` → `runSidesCompare()` 要等整次扫描/哈希结束才 resolve；遮罩在此期间一直存在。进度条本身由 shell 渲染（`Workbench.tsx` 的 `role="status" aria-label="目录对比进度"` + 「取消」按钮），机制正确，只是被覆盖。

修复目标行为：**任何长耗时的目录对比一旦进入扫描/校验阶段，页面上就不应再存在「新建对比」模态遮罩；进度文案与取消按钮真实可点。**

## 验收

- ac-dialog-cleared-when-scan-starts: 在「新建对比」中键入一对真实目录路径并点击「建立对比」，当首个 `listDirectories` 批次被测试 gate 挂住（扫描进行中）时，`screen.queryByRole('dialog', { name: '新建对比' })` 为 `null`，且 `document.querySelectorAll('[aria-modal="true"]').length === 0`。
- ac-progress-visible-unobstructed: 同一扫描期间存在 `role="status"` 名为「目录对比进度」的元素，文案含「正在扫描目录」或「正在校验内容」以及「已扫描 N 个文件」，且该元素 `closest('[aria-modal="true"]')` 为 `null`（不在任何模态内）。
- ac-cancel-clickable-during-scan: 同一扫描期间进度条内「取消」按钮存在、`disabled === false`，且此时文档中 `[aria-modal="true"]` 元素数为 0（无覆盖层）；`fireEvent.click` 该按钮后 `platform.cancelOperation` 恰好被调用一次，参数等于正在进行的 operation id（与 `digestFiles` 收到的 id 一致），进度条进入 `cancelling` 态（「取消」变为 disabled）直到操作结束。
- ac-cancel-keeps-workbench: 从弹窗发起、扫描中取消后约 1s 内进度条消失；出现 `role="alert"` 且文本严格等于「已取消本次目录对比，工作台保持取消前的状态。」；取消前后会话页签文本数组、`contentinfo` 文本、`main` 的 `innerHTML` 全等；未新增任何目录会话页签，无残留半棵树。
- ac-invalid-path-stays-inline: 提交不存在的右路径时不关闭弹窗——`role="alert"` 出现在「新建对比」弹窗内部且包含该路径文本，弹窗仍在，`queryByRole('tablist', { name: '会话' })` 为 `null`（不建 tab）；未进入扫描（`listDirectories` 未被调用）。
- ac-picker-entry-also-unobstructed: 经弹窗内「打开文件夹」选择两个真实目录后，在扫描批次被 gate 挂住期间同样满足「无 `aria-modal` 元素 + 进度条存在 + 进度条内「取消」可点击」，即修复覆盖弹窗内的选择器发起路径，而非只修键入路径。
- ac-picker-cancel-keeps-dialog: 弹窗内「打开文件夹」的用户在系统选择器取消（返回 `null`）时，「新建对比」弹窗仍然打开、不建会话、不进入扫描（关闭时机改动不得让弹窗在「还没确定一对路径」时消失）。

## 非目标

- 不修 D2（`TreeView` 容器 `rows.length * 24px` 超过浏览器 2^24 布局上限、尾部行不可达）；那是另一个独立缺陷，本项不碰 `TreeView`。
- 不改主进程扫描 / 哈希 / `digestFiles` / `cancelOperation` 的语义，不改四态（相同/新增/删除/修改）判定，不改取消后 abort → `cancelOperation` 的顺序与容错。
- 不改快照导出与发布模型，不改 `directoryOps` / `core/directory` 任何算法。
- 不为验收调整样本口径、fixture、`DIRECTORY_SAMPLE_PATHS`、虚拟滚动阈值或进度上报频率。
- 不在弹窗内新增进度条/进度文案（不把进度搬进弹窗），不重排 shell 进度条的版式与文案层级。
- 不改拖拽、argv、`opencompare://` 入口的行为与报错路径（这些入口本就没有弹窗）。
- 不改 `Dialog` 组件的通用视觉（遮罩色、圆角、宽度）；除非为满足 `ac-dialog-cleared-when-scan-starts` 必需，否则不动 `z-index` 体系。
- 不顺手做弹窗的其它体验优化（校验规则、占位文案、快捷键、Enter 行为均保持现状）。

## 实现约束

- 已确认的推荐做法（最小改面，两种落地均可，只要 AC 全绿）：把「关闭新建对比弹窗」的时机提前到**目录对比真正开始**的那一刻，即在 `Workbench.tsx` 的 `runSidesCompare()` 进入扫描前清掉 `compareDialogOpen`（一处状态调用即可覆盖键入路径与弹窗内选择器路径，且天然保留「选择器被取消时弹窗不关」）；`NewCompareDialog.submit()` 中 `await openRequest(...)` 之后的 `onClose()` 可保留为幂等兜底。**不要**把 `Dialog` 遮罩整体抬到进度条之上、也不要改成非模态（AC 要求扫描期无 `aria-modal` 元素）。
- 关闭时机必须晚于路径校验与 `resolveCompareRequest` 探测：非法/不存在/类型不一致/不支持的路径仍只在弹窗内报错且不建 tab（`ac-invalid-path-stays-inline`、`ac-picker-cancel-keeps-dialog` 两道回归闸）。
- 弹窗关闭后由 `openRequest` 回调上报的**构建期**错误（非路径类，如读取失败）允许落到 shell 通知条，不再要求留在弹窗内；这条是关闭时机的自然结果，不要为此重新打开弹窗。
- 测试落点：`src/renderer/src/App.test.tsx`（jsdom）的 `new compare dialog` 与目录进度两处 describe；断言用 DOM 层级（`[aria-modal="true"]` 计数、`closest()`、按钮 `disabled`、click 后 `cancelOperation` 调用）表达「无覆盖层」，本项不要求 jsdom 做真实坐标 hit-test；真实坐标命中留给交付后的 QA 复测。
- 复用现有 gate：`pnpm lint` / `pnpm typecheck` / `pnpm test`（`pnpm build`、`pnpm build:web` 照常跑），不新增测试框架或依赖。
- 视觉：进度条与按钮沿用现有 token 与 `ToolbarButton`，不新增颜色/尺寸常量。
