covers: ac-drop-two-paths
标题: 拖入两个真实同类路径（两文件 / 两目录）落成与选择器打开同一会话模型
步骤: 1) 空首屏状态下，从访达/资源管理器同时拖入两个真实文件（例如 left.ts 与 right.ts）到窗口任意处释放；2) 观察建立的会话；3) 回到空态（或新开一窗），再同时拖入两个真实目录（例如 left/ 与 right/）释放；4) 分别核对两种落点
期望: 两文件拖入直接建立文件对比会话并进入对比视图，落点与「打开文件」选择器完全一致（同一 file 会话模型：subtitle 为两真实路径、按类型进入代码 / CSV / 结构化视图）；两目录拖入直接建立目录对比会话，落点与「打开文件夹」一致（目录树 + 真实路径 subtitle + 状态栏计数）；拖拽无需中间确认弹窗，直接进入会话。

## 最近执行

- workItemId: wi_ws_d7725b67e42c8e12
- at: 2026-10-19
- status: pass
- note: web-isolated 真机浏览器：拖入两个真实文件（left-a.ts + right-a.ts）到窗口任意处，prevented=true（浏览器默认被阻断），无任何中间确认弹窗，直接建会话 tab「left-a.ts ↔ right-a.ts」、subtitle「/memory/left-a.ts ↔ /memory/right-a.ts · 代码 / 文本」、视图「本地文件 · 双栏字符级 Diff」、footer「会话 file:/memory/left-a.ts ↔ /memory/right-a.ts」+ 行数 2/3；另页拖入 CSV 对落到「对齐 3 行 · 主键 id」表格 + 1相同/1新增/0删除/1修改。与「打开文件」选择器落点逐字段完全一致（同一 openFilePair 会话模型）。残留口径：浏览器 DataTransfer 无法携带真实目录（目录到达为 0 字节 File），故「两目录拖入落成目录会话」在本 web 通道不可表示（组件测试 App.test.tsx 用脚本化 PlatformPort 覆盖该分支）。
