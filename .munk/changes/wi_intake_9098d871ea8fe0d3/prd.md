# 首页最近对比溢出与引导文案收口

## 目标

修两处人报的首屏 UX 缺陷（单写项，不扩面）：
1) 「最近对比」无高度上限，20 条时把首屏标题与主 CTA 挤出可视区；且外层 StateView 用 items-center + overflow-auto 居中滚动，超高时顶部不可达。改法：StateView 滚动容器改 items-start、内容块加 my-auto（短内容仍居中，长内容顶部对齐可滚，loading/error 两态行为不变）；HistoryHome 首页最多显示 5 条，列表容器高度 token 化（进 @theme，禁裸尺寸字面量）且 overflow-y-auto；头部右侧加「全部 N」按钮，点开复用现有 Dialog（Dialog.tsx 的 max-h-full + min-h-0 flex-1 overflow-auto）展示全部（store 上限 20），行渲染组件与既有排序/删除行为不变。
2) 首屏引导文案过长：shell.empty.description 现为五分句实现细节，砍成一句「拖入左右两侧的文件或文件夹，或点「新建对比」手动填路径。」（en 同步），删除「不弹系统对话框」「依次选择两侧」等机制描述；shell.empty.title 保留。
边界：只改首屏相关文件（StateView.tsx / historyHome.tsx / Workbench.tsx 中 HistoryHome 挂载与 i18n messages zh/en）与随之必要的测试；不改对比语义、四态计数、导出、历史存储格式与上限、发布通道；不引入新依赖、不换 Dialog 组件；不得为过测试放宽既有断言（该断言的语义变了就显式改断言并在交付说明里写清原因）。

## 验收

- ac-1: 首页「最近对比」最多渲染 5 条，倒序与行内容与现状逐位一致；容器高度走 @theme 新增 token（无裸 px/rem 字面量），列表自身可滚；store 上限 20 与删除行为不变。
- ac-2: 构造 20 条记录 + 最长文案的最小窗口下，标题、描述、主 CTA 均可见或可滚达；不再出现「顶部被裁且滚不到」；loading 与 error 两态渲染回归不破（附三态证据）。
- ac-3: 头部「全部 N」按钮打开 Dialog 展示全部条目（最多 20），弹窗体可滚、Esc 关闭、关闭后焦点回按钮；中英文 key 同步新增/修改，无硬编码文案。
- ac-4: shell.empty.description 中英各一句（zh：「拖入左右两侧的文件或文件夹，或点「新建对比」手动填路径。」），不含「不弹系统对话框」等机制描述；shell.empty.title 不变。
- ac-5: 相关测试按新语义更新并全绿：historySafety.dom.test.tsx 首页行数断言为 5 且弹窗内 20、historyHome.test.tsx 顺序/样式断言、App.smoke.test.tsx 与 App.i18n.test.tsx 文案；新增结构断言覆盖 token 化高度与弹窗滚动体。
- ac-6: worktree 内 code_gates 绿；code / fold / prd 分属独立 commit；交付说明给出「改前改后」同窗口截图与三态回归说明，并标注视觉与可用性最终判定待人现场确认（产品自产截图不单独作为通过证据）。
