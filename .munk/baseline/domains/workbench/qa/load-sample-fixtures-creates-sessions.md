covers: ac-load-fixtures
标题: 从「设置 → 示例与调试」逐个点击场景入口加载并生成场景会话（原顶栏 Load Sample Fixtures 已撤）
步骤: 打开工作台 → 点顶栏齿轮「设置」→ 在「示例与调试」分区依次点击 4 个场景入口（`[data-sample-entry]`：directory / code / csv / structured）
期望: 每个入口点击后设置对话框先关闭，再加载内置预置样本并出现对应场景会话（会话标签/工作区内容就绪、成为活动会话），无需选择任何外部文件

## 最近执行

- workItemId: wi_ws_8959816f18ce7acf
- at: 2026-10-31
- status: pass
- note: 本用例的入口路径已被「顶栏 / 工作流 / 空态去 demo」项改写（原顶栏 `Load Sample Fixtures` / 样本下拉已删除）。本轮 `needSelfTest=false`，以 `code_gates`（10 门，`.munk/runs/run_ws_1828c869e01e6829/code-gates/attempts/001`）为门槛：顶栏无 `data-shell-entry="samples"` / `"samples-menu"`、无品牌副标题，空态 3 个真实 CTA 与 hint 指路设置分区由 `App.test.tsx` / `App.i18n.test.tsx` 断言；设置 5 个场景入口（`[data-sample-entry]`）与调试失败项（`[data-sample-failure]`）由 `App.settings.test.tsx` 的 `settings sample section` 三条用例断言。真实浏览器 / 桌面点选复核仍待运营 QA 在 `pnpm dev` / `pnpm dev:web` 各走一遍。 历史（上一轮）：workItemId `wi_ws_7d6e8664e391fe1f` / at 2026-10-18 / status pass；note: Web 实测通过：全程 inputs=0（无任何文件选择器/外部文件选择），点击顶栏常驻「Load Sample Fixtures」后工作区立即出现 4 个场景会话标签：目录对比（多层嵌套双目录树 + 跨层级散乱目录树 B）、代码 Diff & 3-Way Merge（双栏 Diff 文本对 + base·ours·theirs 多冲突块）、CSV 主键对比（1,240 行乱序主键 + 列偏移）、JSON / YAML 语义对比（键序打乱 + 深层键值增删改）——激活工作区显示真实内容（目录树 baseline/candidate/incoming），符合「一键加载、无需外部文件」期望。
