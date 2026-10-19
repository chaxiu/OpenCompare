covers: ac-drop-single-path
标题: 拖入单个真实路径时作为左侧基准填入并提示选择右侧对应项
步骤: 1) 空首屏状态下，从访达/资源管理器拖入一个真实文件到窗口释放；2) 观察提示与屏幕状态；3) 再点击「打开文件」（应先复用已拖入的左侧文件，只弹出右侧选择器）；4) 另起一窗拖入一个真实目录，重复观察
期望: 单路径拖入不建会话，而是把该路径作为左侧基准填入，并给出明确提示（如「已把 <路径> 作为左侧基准，请继续选择右侧对应的文件 / 文件夹」），提示为 info 语气而非报错；不静默失败、不自动配对猜测；拖文件时应的是对应「文件」、拖目录时应的是对应「文件夹」；随后点击打开时复用它作为左栏、只询问右栏即可完成建会话。

## 最近执行

- workItemId: wi_ws_d7725b67e42c8e12
- at: 2026-10-19
- status: pass
- note: web-isolated 真机浏览器：空态拖入单个真实文件 → 不建会话（无会话 tab，footer「会话 —」，空态标题仍在），role=alert 原文「已把 /memory/left-a.ts 作为左侧基准，请继续选择右侧对应的文件。」，颜色 rgb(63,185,80) / class text-diff-added = green info 语气；不静默失败、不自动配对。随后点「打开文件」：DOM 中恰好 1 个 input[type=file]（title=「选择右侧文件」），无「选择左侧文件」请求 → 复用拖入的左基准；喂入右侧文件后直接成会话 tab「left-a.ts ↔ right-a.ts」、subtitle「/memory/left-a.ts ↔ /memory/right-a.ts · 代码 / 文本」。残留口径：浏览器 DataTransfer 无法携带真实目录（无 FileSystemDirectoryEntry 构造器），故「拖目录时提示对应文件夹」子句在本 web 通道不可表示，未虚构。
