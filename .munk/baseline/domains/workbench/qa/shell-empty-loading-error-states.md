covers: ac-three-states
标题: 主屏空态、加载态、错误态三种状态都可见
步骤: 1) 打开工作台（无会话）观察空态；2) 点顶栏齿轮「设置」→「示例与调试」→ 任一场景入口观察加载态；3) `showDebugSamples` 为真时点设置里的失败项（`[data-sample-failure]`）观察错误态并点击重试
期望: 空态以真实文件 / 文件夹 / 拖拽叙事为主，action 区恰 3 个真实 CTA（新建对比 / 打开文件 / 打开文件夹）且 hint 指路「设置 → 示例与调试」，不含任何 demo 按钮；加载态显示载入中的可见反馈；错误态文案可读且提供「重试」按钮

## 最近执行

- workItemId: wi_ws_8959816f18ce7acf
- at: 2026-10-31
- status: pass
- note: 本用例的入口路径已被「顶栏 / 工作流 / 空态去 demo」项改写（原顶栏 `Load Sample Fixtures` / 样本下拉已删除）。本轮 `needSelfTest=false`，以 `code_gates`（10 门，`.munk/runs/run_ws_1828c869e01e6829/code-gates/attempts/001`）为门槛：顶栏无 `data-shell-entry="samples"` / `"samples-menu"`、无品牌副标题，空态 3 个真实 CTA 与 hint 指路设置分区由 `App.test.tsx` / `App.i18n.test.tsx` 断言；设置 5 个场景入口（`[data-sample-entry]`）与调试失败项（`[data-sample-failure]`）由 `App.settings.test.tsx` 的 `settings sample section` 三条用例断言。真实浏览器 / 桌面点选复核仍待运营 QA 在 `pnpm dev` / `pnpm dev:web` 各走一遍。 历史（上一轮）：workItemId `wi_ws_7d6e8664e391fe1f` / at 2026-10-18 / status pass；note: Web 实测通过：空态显示「尚未载入样本」+四场景引导文案+内联 Load Sample Fixtures 入口+hint「目录 · 代码 · CSV 主键 · JSON / YAML」；点击顶栏 Load Sample Fixtures 捕获到「正在载入样本」加载态（~420ms 内，经 action-diff 捕获）后转 ready；样本下拉选「演示：样本读取失败」出现错误态：标题「样本库读取失败」+可读错误文案「无法读取内置样本库：/samples/csv/orders.left.csv 不存在。」+「重试」按钮，点击重试后错误清除并恢复 ready。
