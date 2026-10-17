covers: ac-three-states
标题: 主屏空态、加载态、错误态三种状态都可见
步骤: 1) 打开工作台（尚未载入样本）观察空态；2) 点击顶栏「Load Sample Fixtures」观察加载态；3) 通过样本下拉进入演示失败分支观察错误态并点击重试
期望: 空态显示引导加载样本文案（含 Load Sample Fixtures 入口）；加载态显示载入中的可见反馈；错误态文案可读且提供「重试」按钮

## 最近执行

- workItemId: wi_ws_7d6e8664e391fe1f
- at: 2026-10-18
- status: pass
- note: Web 实测通过：空态显示「尚未载入样本」+四场景引导文案+内联 Load Sample Fixtures 入口+hint「目录 · 代码 · CSV 主键 · JSON / YAML」；点击顶栏 Load Sample Fixtures 捕获到「正在载入样本」加载态（~420ms 内，经 action-diff 捕获）后转 ready；样本下拉选「演示：样本读取失败」出现错误态：标题「样本库读取失败」+可读错误文案「无法读取内置样本库：/samples/csv/orders.left.csv 不存在。」+「重试」按钮，点击重试后错误清除并恢复 ready。
