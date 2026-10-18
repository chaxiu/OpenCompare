# structured-open-local-file

covers: ac-structured-open
标题: StructuredView 可分别打开左/右本地 JSON/YAML 并重算语义差异，非法输入显示错误态
步骤: 进入「结构化对比」→ 点顶栏「打开左文件」「打开右文件」各选一个本地 .json / .yaml 文件 → 再选一个非 JSON/YAML 或内容非法的文件（如截断的 JSON）
期望: 打开合法 JSON/YAML 后按扩展名选定格式并重算语义差异，变更/节点计数随之更新并出现「已打开 <路径>」提示；打开非 JSON/YAML 或解析失败时展示可读错误态（「结构化解析失败」+ 说明），应用不崩溃、不白屏，左/右原文与其它会话仍可用

## 最近执行

- workItemId: wi_intake_e60068db55d0fef9
- at: 2026-10-19
- status: pass
- note: Web 实测：初始样本结构计数 新增4/删除0/修改5/类型变更1/相同5、共15节点；打开 struct-left.json 后左标题 /memory/struct-left.json、计数重算 3/3/0/0/0（6 节点）、notice「已打开 /memory/struct-left.json」；打开 struct-right.json 后右标题更新、计数 2/0/1/0/3；打开 struct-bad.json（截断 JSON）显示 danger 错误态「结构化解析失败」+「left side: JSON parse error at line 3, column 1: ValueExpected」+ hint，左/右原文与会话 tab 仍在；切走再切回结构化视图计数恢复为样本 15 节点，无崩溃/白屏。控制台 0 error。
