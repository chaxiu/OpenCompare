# structured-background-compare-contract

covers: ac-loading-interactive, ac-parse-error-parity, ac-view-unmount, ac-scale-5mb, ac-job-parity-diff, ac-job-parity-ranges, ac-generation-supersede, ac-cancel, ac-dispose, ac-fallback-no-worker, ac-worker-protocol
标题: 结构化对比在 renderer 后台执行；等待期显示双语「对比中」且过滤/格式可操作；切会话即终止、解析错误文案与同步实现一致
步骤: 自动化：`pnpm test src/renderer/src/structured src/renderer/src/views/StructuredView`（`compareJob.test.ts` / `compareClient.test.ts` / `StructuredView.async.test.tsx` / `StructuredView.test.tsx` 全绿，5 MB 用例实测 704 ms）→ 实机 Electron（`pnpm dev`）：打开「结构化对比」内置 JSON 样本，观察首帧是否先出现「对比中」再出现计数 → 在加载态立即点「新增」「类型变更」并切 JSON↔YAML → 用顶栏打开一对本地 ≥5 MB、≥8 层嵌套、键序打乱的 `.json` 文件，等待结果时操作状态栏与其它 tab → 期间切到另一个会话再切回 → 再打开一个非法 JSON 作为右侧 → 切到英文界面重复首帧观察
期望: 首帧先渲染「对比中」（中文 `对比中` / 英文 `Comparing`），此时不出现计数条与变更行，也不出现同步执行的卡顿；等待期点状态过滤与格式切换立即生效且不抛错、不等待对比完成，其它会话可正常操作；结果落地后计数、节点路径、左右原文与改动前的同步实现逐项一致（含 5 MB 文件）；切走会话 / 关 tab 后返回，旧结果不会覆盖新会话，控制台无未处理 rejection、无 React 状态更新告警；非法一侧展示既有错误态，描述文本与同步 `diffStructured` 的 message 逐字一致（带 `left side:` / `right side:` 前缀），左右原文与其它会话仍可用；全程不新增文件读取 / 扫描 / 哈希，无 `Worker is not defined`，生产包（`pnpm build` / `pnpm build:web`）均产出 `compareWorker-*.js`
