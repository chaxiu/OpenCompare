covers: ac-drop-no-navigate
标题: 拖入路径不会导致窗口导航 / 重载，应用停留在当前会话
步骤: 1) 冷启动建立（或先不建）一个真实对比会话，记下当前会话标签与工作区内容；2) 从访达/资源管理器把真实文件 / 目录拖到窗口内释放（含拖到窗口空白处与顶栏区域）；3) 观察窗口是否仍停在 OpenCompare 工作台，而未被替换为被拖文件的系统预览 / 浏览器导航；4) 核对当前会话与视图
期望: 拖拽释放后应用不导航、不重载，仍停留在当前工作台，当前会话标签与工作区内容保持不变；拖拽浏览器默认行为（导航到被拖文件）被阻断；拖入分隔条等内部拖拽场景不受影响（仅文件拖拽被拦截）。

## 最近执行

- workItemId: wi_ws_d7725b67e42c8e12
- at: 2026-10-19
- status: pass
- note: web-isolated 真机浏览器：先建真实会话（tab「left-a.ts ↔ right-a.ts」，footer 会话 file:/memory/left-a.ts ↔ /memory/right-a.ts + 行数 2/3，URL http://127.0.0.1:4193/）。分别拖到 main 工作区空白、header 顶栏、window、会话内 role=separator「调整分栏宽度」：四者 prevented 均 = true（拖拽默认导航被阻断）；URL 恒为 http://127.0.0.1:4193/ 未变；页面 load 事件总数 4 = 4 次显式冷启动 goto（拖放各步 loadsDelta=0），framenavigated 同理，performance navigation entries 未新增，非静态网络请求 0；会话 tab/subtitle/footer 与工作区内容保持不变，console error/warning/pageerror 全 0。残留口径：分隔条自身拖拽改宽（内部拖拽）未单独演练，仅验证文件拖放到分隔条上被拦截且不影响会话。
