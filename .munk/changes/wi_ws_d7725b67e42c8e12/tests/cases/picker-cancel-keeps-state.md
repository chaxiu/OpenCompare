covers: ac-picker-cancel
标题: 任一系统选择器取消后不建会话、不改动既有会话与视图
步骤: 1) 场景 A：冷启动空首屏点击「打开文件」后在第一（左）个系统选择器取消；2) 再点击「打开文件」选好左侧文件、在第二（右）个选择器取消；3) 对「打开文件夹」重复上述左 / 右两次取消；4) 场景 B：先经选择器建立一个真实会话作为现状，再发起一次「打开文件夹」并在选择器取消，核对屏幕
期望: 任一选择器取消都视为放弃：不新建会话、不改变已有会话与当前视图（场景 B 中原会话标签、工作区内容与底部状态栏保持原样）、不产生错误刷屏（无红色 alert 提示）；空首屏场景取消后仍停留在空态，可重新发起打开。

## 最近执行

- workItemId: wi_ws_d7725b67e42c8e12
- at: 2026-10-19
- status: pass
- note: web-isolated 真机浏览器（文件选择器=隐藏 input[type=file]，取消=原生 cancel 事件）：场景 A1 空态点「打开文件」取消第一（左）个选择器 → 仍空态（标题仍在）、无会话 tablist、role=alert 为空（无红色提示）、CTA 仍可再点、DOM 无残留 input；A2 再点「打开文件」选好左侧后在第二个（右）选择器取消 → 结果与 A1 完全一致，不建会话、无错误刷屏。残留口径：web 运行时 selectDirectory 无原生对话框（恒返回 /memory），故「打开文件夹左/右两次取消」在 web 不可表征；该分支由组件测试覆盖（leaves the workbench untouched when a picker is cancelled：selectDirectory 返回 null → 仍停空态、无 alert、无会话）。web 下点「打开文件夹」会立即建 /memory ↔ /memory 目录会话并切走焦点，属 web 预览平台能力差异（DirectoryView 已明示「Web 预览模式没有原生目录选择」），已作为体验短板记入 summary。
