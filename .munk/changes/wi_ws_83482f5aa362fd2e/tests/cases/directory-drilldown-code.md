covers: ac-drilldown-code
标题: 双击差异代码/文本文件下钻打开文件级双栏对比并携带左右内容（含左/右独有空侧）
步骤: 目录对比会话中双击一个 modified 的代码/文本文件（如 `src/core/engine.ts`）→ 观察新会话与左右内容；返回目录会话后再分别双击一个左独有文件与一个右独有文件
期望: 双击差异代码/文本文件后切换到对应文件级对比视图（会话标识为单位文件、显示「来自目录对比下钻」并携带该文件左右路径），左右两栏分别显示各自文件内容；左独有文件右侧为空、右独有文件左侧为空；非代码/文本·CSV/JSON/YAML 类型的文件给出「暂不支持下钻」的可读提示而非静默或报错

## 最近执行

- workItemId: wi_ws_83482f5aa362fd2e
- at: 2026-10-18
- status: pass
- note: 设备侧限：web 交互 harness 的动作词表无 double_click（仅 click/long_press/input/edit_text/scroll/swipe/pull_to_refresh/wait/back/home，见 device_tool_models.SessionActionInput），而目录树下钻为 TreeView.tsx:67 onDoubleClick 触发，故无法在 harness 上双击执行。AC 由本 worktree 的自动用例实跑覆盖（pnpm test 绿）：src/renderer/src/App.test.tsx 'filters the directory comparison and drills a file into its file view'（双击 engine.ts → 出现 file:src/core/engine.ts 与「来自目录对比下钻」）与 'explains why a non-text file cannot be drilled into'（双击 logo.png → role=alert 含「暂不支持」，目录会话保持）；左/右独有空侧由 Workbench.openFile 的 leftPath/rightPath 条件读取（缺侧补 ''）保证。设备侧另确认 5199 目录视图底部「双击文件可下钻…左独有文件右侧为空、右独有文件左侧为空」提示存在。
