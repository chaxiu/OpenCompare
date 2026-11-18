# 修好 xlsx 在出厂构建里打不开（渲染层 Buffer/process 未定义）

## 范围

- 现象（P0，可复现）：electron-vite build 产物在真实窗口（`contextIsolation:true / nodeIntegration:false / sandbox:true`）打开任意 .xlsx 对，顶栏 alert 原文 `Buffer is not defined`，不建 tab、不出 panel；补 Buffer shim 后紧随 `process is not defined`。逻辑层（注入 shim 旁证）四态、合并锚点、隐藏行列、多 sheet 配对均正确。
- 位置：`src/core/xlsx/limits.ts`（约 406/413/453 行的 `Buffer.from(u8).toString('utf8')`）与 `src/core/xlsx/parse.ts`（约 133 行 `process.memoryUsage().rss`）；出厂 bundle 栈为 `readXlsxZipDirectory → inspectXlsxContainer → parseXlsxTable → parseWorkbookSide`。
- 修法取最小：`Buffer.from(u8).toString('utf8')` → `new TextDecoder('utf-8').decode(u8)` 或等价；rss 探测改为渲染层可用实现（拿不到就降级为「不探测」并保留其余阈值），只有在最小改法仍跑不通时才把 xlsx 解析整体下沉 main 经既有 IPC 暴露。
- 同批加可回归守卫：在既有门文件（不新开文件）扩展一条静态检查，扫描 `src/core/xlsx/**` 及被 renderer 直接 import 的 core 模块，出现 `Buffer` / `process.` 等 Node 全局即 fail 并报文件行号。
- 只读证据：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/.munk/runs/trun_aa6693d8bd259898/digest.md`、同目录 `xlsx-l3/worker-ab.json`、`xlsx-l3/shots/A1-xlsx-shipped-error.png`。

## 验收

- ac-renderer-no-node-globals: `pnpm build` 后的真实窗口打开任一 .xlsx 对不再出现 `Buffer is not defined` / `process is not defined`，能建 tab 并出 panel（给 build 产物 sha256 + 冷启动实测片段）。
- ac-static-guard: 新增守卫在故意引入 Node 全局的样例改动上必 fail、当前树必 pass，且进 `.munk/code-gates.json` 既有门文件而不是另开一个门文件。
- ac-parity: xlsx 现有六类单测与全量 `code_gates` 自绿，同一夹具的四态计数与修复前逻辑层实测一致（Data 24/1/1/5、Notes 7/0/0/1、Sheet1 296/0/0/3、Merge 3/0/0/1、Hidden 4/0/0/2）。
- ac-limits-intact: 超限 / zip bomb 仍以 `XLSX_LIMIT_EXCEEDED` 拒绝、文案含「文件超出对比上限」、不部分渲染、不写会话状态；阈值不变。

## 非目标

- 不改 xlsx 验收口径与四态语义；不做公式求值、样式/批注 diff、合并区逐格展开。
- 不动 UI 布局、多 sheet 配对规则与隐藏行列开关口径；不引入新依赖（SheetJS 仍走 `vendor/xlsx-0.20.3.tgz`）。
- 不碰版本号、CHANGELOG、release notes、`release.yml`（发版收尾另单）。

## 实现约束

- 只用渲染层可用 API（TextDecoder/TextEncoder、Worker）；禁止引入 nodePolyfills 之类把 Node 全局塞回 renderer 的折中。
- 不缩规模、不改全局 testTimeout，规模用例显式 per-test 30_000。
- main 有未发布 commit 时按 AGENTS 逐条写「未发布：`<sha>` `<标题>` `<原因>`」。

## 本单执行约束（不 fold）

- 只改 xlsx 域与既有门文件；预算 ≤90 分钟 / ≤8M token，上下文吃紧先落盘分两次交付。
- 不推 tag、不 dispatch release、不改已公开 Release 与资产。
- 证据：门 attempt 取自 code_gates evidence 的 `latestAttemptId`；附 build 产物路径 + sha256 与真实窗口冷启动 .xlsx 的截图或 CDP 片段。
