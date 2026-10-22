# 取消结构化返回、零日志噪声与零残留

## 范围

本 Phase 只做「取消这一条路径的契约与证据」，把目录对比 / 哈希的取消从「handler reject 穿越 IPC」改成结构化结果，并把日志与残留变成可自动断言的门禁。

1. **PlatformPort / IPC 边界改成结构化取消结果**
   - `PlatformPort.digestFiles` 的取消不再以 rejected Promise 表达：成功仍返回 `readonly FileDigest[]`（输入顺序，逐项成功/失败不变），被取消时返回 `{ cancelled: true }`。两者构成判别联合，调用方用 `Array.isArray` 区分，不引入额外包装层。
   - Electron 实现（`src/main/platform/electron-platform.ts`）与 Web 实现（`src/renderer/src/platform/web-platform.ts`）给出同一形状；`src/shared/platform/types.ts`、`src/preload/index.ts` 的类型与白名单 cast 同步到该契约，不新增 IPC channel。
   - `platform:digest-files` handler 边界再加一层防御：任何漏出的取消异常都在 handler 内转成结构化结果，保证取消错误不穿越 `ipcMain.handle`。
   - `cancelOperation` 语义不变（未知 id / 重复调用幂等 resolve）。

2. **核心控制流不变，只在 renderer 适配层交汇**
   - `src/core/**` 继续用 `OperationCancelledError` / `AbortSignal` 做内部取消控制流，`compare.ts` 的扫描与哈希取消路径、`digestContentCandidates` 的分块写缓存时机、`scanDirectory` 的「不返回部分树」都保持既有实现语义。
   - renderer 适配层（`compareSides` / `directoryOps` / `loadSampleSessions` 等调用点）在收到 `{ cancelled: true }` 后于**渲染进程内**抛 `OperationCancelledError`，让上层既有 catch 分支照常工作；该异常绝不再跨 IPC。

3. **取消后的可观测状态**
   - 扫描阶段或哈希阶段取消一次后：主进程无 `Error occurred in handler` / `OperationCancelledError` / `ECANCELED` 字样；`activeDigestStreamCount()` 归零；主进程 digest 操作注册表归零；`ComparisonCache.hashes` 不含任何未完整结算块的条目；不返回 `DirectoryComparison`、不提交会话。
   - 界面照现有行为提示「已取消本次目录对比，工作台保持取消前的状态。」，会话列表、当前视图、状态栏保持取消前内容；进度条与 busy 清零、取消按钮恢复可点。**不改布局与文案结构**，只保证新契约下该行为仍成立。

4. **把取消证据写进 `code_gates`**
   - 新增一条独立门禁（单 argv，例如 `pnpm test:cancel`），用真实临时目录 + 真实文件 + 真实读流触发扫描阶段与哈希阶段各一次真实取消，捕获 stderr 并断言零指定字样，同时断言残留计数为 0。
   - 门禁自带「自证」用例：故意让一个测试 handler reject，dispatch shim 必须输出与 Electron 同形态的 `Error occurred in handler for '<channel>': …` 行，证明捕获链路有效，避免门禁空跑。

## 验收

- ac-digest-structured-cancel: 带 `operationId` 的 `digestFiles` 在读取中途被 `cancelOperation` 后 **resolve** 为 `{ cancelled: true }`（`Array.isArray(result) === false`），不 reject；未取消时仍 resolve 为与输入等长、顺序一致的 `FileDigest[]`。
- ac-digest-cancel-idempotent-scope: 取消后对同一 id 与未知 id 再次调用 `cancelOperation` 均 resolve 不抛；并发 A/B 两个摘要操作时取消 A 只让 A 返回结构化取消，B 随后正常返回正确槽位。
- ac-ipc-no-cancel-reject: 通过模拟 `ipcMain` 语义的 dispatch shim 调用已注册的 `platform:digest-files` handler，在哈希中途取消时 handler 的 Promise **fulfilled**，且 shim 捕获的 stderr 中 `Error occurred in handler`、`OperationCancelledError`、`ECANCELED` 出现次数均为 0。
- ac-scan-cancel-zero-noise: 扫描阶段取消一次（AbortSignal 中止在飞批量列目录）后，同一 stderr 断言零命中；且中止后不再发起新的 `listDirectories` 调用（调用计数停止增长）。
- ac-digest-cancel-zero-noise: 哈希阶段取消一次（真实文件、在飞读流被销毁）后，同一 stderr 断言零命中。
- ac-stream-residue-zero: 上述每次取消落定后 `activeDigestStreamCount() === 0`，且主进程 digest 操作注册表计数 `=== 0`（通过导出的只读计数访问器断言）。
- ac-cache-no-partial: 固定 `digestBatchSize` 且在第 2 块读取中途取消时，`ComparisonCache.hashes` 只包含第 1 块已完整结算的条目（逐条 `size`/`modifiedMs` 匹配，`hash` 等于该文件真实 sha256），被取消块的路径条目数为 0；不存在「有键无正确 hash」的半份条目。
- ac-no-half-tree-session: 取消后 `compareSides` 以取消结束、不产生 `DirectoryComparison`；`runSidesCompare` 返回 `false`，sessions 列表与取消前逐项相同（无新增 / 无替换），未扫描完成的树不被任何会话或缓存引用。
- ac-cancel-retry-clean: 同一真实目录对取消一次后立即重跑，得到的四态计数与 `skipped` 与取消前基线一致，且重跑期间没有因句柄残留产生 EMFILE。
- ac-renderer-cancel-notice: 扫描阶段与哈希阶段各取消一次，进度条消失、`directoryBusy` 解除、取消按钮恢复可点，notice 文本为「已取消本次目录对比，工作台保持取消前的状态。」，会话 tab、main 区域与状态栏与取消前一致。
- ac-normal-path-unchanged: 未取消的目录对比返回四态计数与 `skipped` 与改造前一致；`digestFiles` 成功路径逐项字段（`path` / `ok` / `sha256` / `bytes`）不变；`pnpm test` 全绿且快照/同步/模板套件零回归。
- ac-web-parity: Web 平台 `digestFiles` 被取消时同样返回 `{ cancelled: true }`，成功路径返回值与既有断言一致，与 Electron 实现形状相同（两平台可用同一判别逻辑）。
- ac-cancel-gate-registered: `.munk/code-gates.json` 新增 `cancel-gate` 条目（单 argv，如 `pnpm test:cancel`），`package.json` 有对应 script；该门禁失败时退出码非 0，正常跑完不依赖长 sleep 且只读真实临时目录；门禁含自证用例——故意 reject 的测试 handler 必须让 shim 输出 `Error occurred in handler`，随后真实取消用例断言零命中。

## 非目标

- 不改四态定义、对比 / 合并算法、`ComparisonCache` 键与失效语义；不改 `.ocsnap.json` 快照线格式。
- 不做符号链接「不跟随」口径改造（归 `symlink-policy`）。
- 不做内存上限、缓存淘汰、行模型瘦身与真实 3 轮内存取证（归 `memory-harness` / `memory-bounded`）。
- 不动 README「已知问题」、发布说明、版本号与 `release-packaging.test.ts` 的发布断言（归 `release-025`）；v0.2.4 及更早历史块原样保留。
- 不新增 IPC channel、不改 preload 白名单形状、不把取消注册表扩到 `listDirectories`（扫描侧仍由渲染进程 `AbortSignal` 终止，不引入主进程扫描登记）。
- 不改进度条布局 / 文案 / 组件，不新增 toast、弹窗或重试按钮；不做暂停、续传、断点恢复。
- 不做浏览器 / 真机 / 桌面点选验收；不跑 41G 真实目录全量对比。
- 不顺手重构 `src/core/**` 与无关 UI。

## 实现约束

- **契约形状固定**：成功 `readonly FileDigest[]`，取消 `{ readonly cancelled: true }`；判别用 `Array.isArray`，不新增 `{ files, cancelled }` 之类需要全局解包的包装对象。
- **异常只留在核心层**：`OperationCancelledError` 仅作为 `src/core/**` 的内部控制流；renderer 适配层收到结构化取消后在本进程内抛出同一类型，`src/core` 的取消 catch 分支与既有测试断言不改。IPC handler 边界必须再做一次防御性转换。
- **残留可观测**：主进程除既有 `activeDigestStreamCount()` 外，导出一个 digest 操作注册表计数访问器；门禁直接断言两者归零，不用「再跑一次没报错」间接推断。
- **stderr 断言必须真实捕获**：门禁在一个模拟 Electron handler 语义的 dispatch shim / 子进程上真实触发取消并捕获运行期 stderr（可用子进程或 `process.stderr` 写钩子），禁止用源码 grep 或「handler 没 throw」代替；shim 在 handler reject 时必须写出与 Electron 同形态的日志行，并有一处自证用例。
- **造时机不用大文件**：用受控 stream factory / gated stream / 受控批量列目录制造在飞状态，门禁运行时间有界，单次门禁短于 60s，不做长 sleep 轮询。
- **既有断言改判范围**：PlatformPort 层（`electron-platform.test.ts`、`web-platform.test.ts`、`preload/index.test.ts`、`App.test.tsx` 的平台 mock）中断言 `digestFiles` reject 的用例改为断言结构化取消；`src/core/directory/compare.test.ts` 中核心层 reject 断言保持不变。
- **门禁命令单 argv**：`.munk/code-gates.json` 现有六条 id（install / lint / typecheck / build / build:web / test）不动，只新增 `cancel-gate`。
- 遵循 `AGENTS.md` skill 路由：主进程 / preload / IPC 走 `electron-dev`，类型设计走 `typescript-advanced`，测试走 `vitest`。
