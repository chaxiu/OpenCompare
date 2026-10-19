covers: ac-open-two-files
标题: 空首屏「打开文件」经系统选择器依次选两个真实文件后直接进入文件对比会话
步骤: 1) 在磁盘准备两个内容不同的真实文件（例如 left.ts 与 right.ts，或 left.csv 与 right.csv，或 left.json 与 right.json）；2) 冷启动进入空首屏，点击主 CTA「打开文件」；3) 在系统文件选择器中先选左侧文件、再选右侧文件；4) 观察会话标签、工作区内容与底部状态栏
期望: 两次选择后不经任何样本即建立并进入文件对比会话：出现新会话标签，subtitle 展示这两个真实绝对路径；工作区按文件类型进入对应视图（代码 / 文本 → 双栏字符级 Diff；CSV / TSV → 表格对齐；JSON / YAML → 结构化视图）；底部状态栏会话标识与统计随新会话刷新，无残留空态；全程未加载内置样本（会话标签中无 3-Way Merge 等样本场景）。

## 最近执行

- workItemId: wi_ws_d7725b67e42c8e12
- at: 2026-10-19
- status: pass
- note: web-isolated 真机浏览器（未加载任何样本）：「打开文件」依次选左右两个真实文件后直接建会话。TS 对：tab「left-a.ts ↔ right-a.ts」，subtitle「/memory/left-a.ts ↔ /memory/right-a.ts · 代码 / 文本」，视图「本地文件 · 双栏字符级 Diff」，footer「会话 file:/memory/left-a.ts ↔ /memory/right-a.ts」+ 行数（左）2/（右）3；CSV 对：表格「对齐 3 行 · 主键 id」+ footer 1相同/1新增/0删除/1修改；JSON 对：语义归一化视图 /a 相同、/b/c 2→3 修改。空态标题消失、无 alert、无 3-Way Merge 等样本场景。web 运行时「真实绝对路径」即 /memory/<filename> 虚拟路径（PlatformPort web 实现把所选文件体物化到内存 FS）。
