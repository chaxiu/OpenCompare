covers: ac-sample-directory
标题: 一键把内置样本目录加载为左右两侧并完成对比，dev 与 dev:web 均可复现
步骤: 在 `pnpm dev:web` 与 `pnpm dev` 两种模式下分别打开工作台 → 点顶栏齿轮「设置」→「示例与调试」→ 点 `[data-sample-entry="directory"]` → 观察目录对比会话的双栏树与统计（原「加载样本目录」按钮与顶栏 Load Sample Fixtures 已删除）
期望: 无需任何外部文件，经 `PlatformPort` 读取内置样本目录并完成左右两侧递归扫描与对比；随即出现就绪的目录对比会话（左右双栏树、徽章、统计均有值），两个运行模式表现一致、可重复

## 最近执行

- workItemId: wi_ws_83482f5aa362fd2e
- at: 2026-10-18
- status: pass
- note: 在真实 web 交互会话 isess_471ed727efaa（surface=http://127.0.0.1:5199/，本 worktree 新构建）实测：点顶栏 Load Sample Fixtures 即出现就绪目录对比会话 session-directory（左 baseline/源目录、右 candidate/目标目录），左右双栏树、徽章、统计均有值；再点「加载样本目录」结果一致，可重复。无白屏/渲染报错。 入口变更（wi_ws_8959816f18ce7acf，2026-10-31）：目录工具栏「加载样本目录」与顶栏 Load Sample Fixtures 已随「去 demo」项删除，等价路径改为 设置 → 示例与调试 → 目录入口（`load({ scene: 'directory' })`，语义与产出不变），上方实测记录来自入口变更前。
