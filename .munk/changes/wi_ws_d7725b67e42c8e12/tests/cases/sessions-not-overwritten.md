covers: ac-sessions-not-overwritten
标题: 连续打开不同文件对 / 目录对会新增独立会话标签，不覆盖先前会话
步骤: 1) 冷启动用「打开文件」建立第一对真实文件会话；2) 再用「打开文件」打开另一对不同真实文件（或同类型不同内容对）；3) 用「打开文件夹」再打开一对真实目录；4) 点击会话标签在各会话间来回切换并观察工作区与状态栏
期望: 每对文件 / 目录产生独立会话标签，先前会话不被覆盖（标签数量随打开次数递增，旧会话仍可点击进入并显示其原内容）；切换标签时工作区内容与底部状态栏对应切换、不残留上一会话数据；重复打开同一对路径可复用同一标签而非无限堆积。

## 最近执行

- workItemId: wi_ws_d7725b67e42c8e12
- at: 2026-10-19
- status: pass
- note: web-isolated 真机浏览器：①「打开文件」ts 对 → tab 数 1（left-a.ts ↔ right-a.ts，footer 行数 2/3）；②再「打开文件」json 对 → tab 数 2，tab#1 仍在（aria-selected=false）、tab#2「left-c.json ↔ right-c.json」激活，json 视图「JSON 原文 · 语义归一化对比」；③点 tab#1 → footer 回到 /memory/left-a.ts ↔ /memory/right-a.ts 行数 2/3 与双栏 Diff；再点 tab#2 → 回到 json 路径 1/1，无上一会话数据残留；④重复打开同一 ts 对 → tab 数仍为 2（复用同一标签，不无限堆积）；⑤点「打开文件夹」→ 新增第 3 个独立标签且既有文件会话仍在并可点击（各自显示自己的 footer/视图），console 0 error。残留口径：web 运行时无原生目录对话框（web-platform.ts:213 `selectDirectory: async () => ROOT`），⑤落成的是 /memory ↔ /memory 自比较会话（footer 差异 0），「打开一对真实目录」在本 web 通道不可表征，多会话不覆盖语义已由该目录会话 + 组件测试（opens two real folders and labels the session with both roots；adds an independent tab for every opened pair）共同覆盖。
