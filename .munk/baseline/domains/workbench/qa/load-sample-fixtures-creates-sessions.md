covers: ac-load-fixtures
标题: 点击顶栏 Load Sample Fixtures 一键加载并生成场景会话
步骤: 打开工作台 → 点击顶栏常驻「Load Sample Fixtures」
期望: 一次性加载内置预置样本，工作台随即出现对应场景会话（会话标签/工作区内容就绪），无需选择任何外部文件

## 最近执行

- workItemId: wi_ws_7d6e8664e391fe1f
- at: 2026-10-18
- status: pass
- note: Web 实测通过：全程 inputs=0（无任何文件选择器/外部文件选择），点击顶栏常驻「Load Sample Fixtures」后工作区立即出现 4 个场景会话标签：目录对比（多层嵌套双目录树 + 跨层级散乱目录树 B）、代码 Diff & 3-Way Merge（双栏 Diff 文本对 + base·ours·theirs 多冲突块）、CSV 主键对比（1,240 行乱序主键 + 列偏移）、JSON / YAML 语义对比（键序打乱 + 深层键值增删改）——激活工作区显示真实内容（目录树 baseline/candidate/incoming），符合「一键加载、无需外部文件」期望。
