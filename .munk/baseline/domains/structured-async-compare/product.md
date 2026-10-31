# Domain: structured-async-compare

结构化对比的 **renderer 后台执行层**：把 JSON / YAML 语义对比的整条计算链（parse → by-node-path diff → 非 `same` 条目的左右原文行列定位）从 renderer 主线程搬到 renderer Worker，并给 `StructuredView` 接上「对比中」加载态、代次取代、取消与卸载终止语义。本域只拥有**执行与调度**这一层：语义规则、状态 / 计数口径、JSON Pointer 格式归 `structured` 域（`src/core/structured/`，本域零改动）；`structured` 域的定位层（`createStructuredLocator`）在这里被复用，但差异行点选跳转 / 原文反选 / 双栏同步滚动 / 原文窗口化不属本域。

## 范围

- **后台对比客户端（`src/renderer/src/structured/compareClient.ts`）**：一次只有一个在途对比。
  - `compare({ leftText, rightText, format })` 每次递增单调 id 并**取代**在途请求（被取代者以 `OperationCancelledError` 结束，迟到响应按 id 丢弃）。
  - `cancel()` 取消在途请求但不销毁 worker；`dispose()` 终止 worker 并把客户端置为终态（幂等，之后 `compare` 立即以取消结束、不再 `postMessage`、迟到消息忽略）。
  - 取消是失败不是空结果；被取代 / 被取消的 promise 内部自带 rejection 消费，调用方即使忽略也不产生 unhandled rejection。
- **后台 job（`src/renderer/src/structured/compareJob.ts`）**：纯组合函数，只调用既有 `diffStructured` 与 `createStructuredLocator`，零语义复制、零 DOM / Electron / React 依赖，可在 Node vitest 直接 import。
  - 顺序固定：先 `diffStructured`（保证解析错误带 `left side:` / `right side:` 前缀）再建两侧 locator。
  - 产出 `StructuredCompareOutcome = { diff, ranges }`；`ranges` 的键是 `entry.path`，**只含 `status !== 'same'` 的条目**，`same` 不带区间。
- **worker 壳（`src/renderer/src/structured/compareWorker.ts`）**：仅 `onmessage` → job → `postMessage` 的传输层；错误跨边界只保留 `name` + `message`，客户端侧对 `StructuredParseError` 重建实例（`instanceof` 仍成立、文案逐字一致），非解析错误保留原 `name` / `message`。Vite 打成经典 worker（不依赖运行时 ESM 模块加载），`electron-vite` 与 web 构建均产出 `compareWorker-*.js` 独立 chunk。
- **无 Worker 环境回退**：`typeof Worker === 'undefined'`（jsdom / Node）或注入工厂返回 `null` 时，走同一 job 的**异步回退**（至少让出一个宏任务），`compare` 同步返回 pending Promise（调用方得先渲染加载态），不抛 `Worker is not defined`；回退路径同样受 `cancel` / `dispose` 约束，结束后不再落结果。
- **worker 注入缝**：`createStructuredCompareClient({ createWorker })`，测试用假 worker 断言协议（单调 id + `{ leftText, rightText, format }`、按 id 匹配、未知 / 乱序 id 忽略、错误重建）。
- **视图接线（`StructuredView.tsx`）**：样本、目录下钻 pair、打开本地文件、切格式全部经后台客户端；等待期展示中英双语「对比中」加载态（`files.structured.comparing`，zh `对比中` / en `Comparing`），期间状态过滤与格式控件、其它会话照常可操作；结果落地后计数、节点路径、左右原文与同步实现一致；解析失败仍走既有 `StateView` 错误态且描述文案等于同步 `diffStructured` 的 message；视图卸载（切会话 / 关 tab）时 `dispose`，在途任务终止且迟到结果不产生状态更新。
  - 注入缝：`createClient?: () => StructuredCompareClient` prop，视图按实例创建客户端、卸载即 `dispose`；渲染期不再同步调用 `diffStructured`。结果与当前 `source` + `format` 绑定，输入落后于当前选择即视为加载中。

## 验收

- **ac-job-parity-diff**：对内置样本 JSON / YAML 两对、下钻 pair、以及 `src/core/structured/__fixtures__/locate/` 四份真实文件，后台 job 返回的 `diff` 与同步 `diffStructured(left,right,format)` 深相等：entries 顺序、`path`、`status`、`left` / `right` / `leftType` / `rightType` 与 `counts` 全部一致。
- **ac-job-parity-ranges**：同一组输入下，`ranges[path]` 的 `.left` / `.right` 与 `createStructuredLocator(对应侧文本, format).locate(path)` 深相等（含单侧缺失时 `exact:false` 的祖先回退区间与回退后的 `path`）。
- **ac-ranges-changes-only**：`ranges` 的键集合恰等于 `diff.entries` 中 `status !== 'same'` 的 `path` 集合；`same` 条目不带区间，结果体积不随相同节点数膨胀。
- **ac-generation-supersede**：先发起 A（挂起），再发起 B；A 的 promise 以 `OperationCancelledError` 结束；A 的迟到响应到达后被丢弃；最终客户端只返回 B 的结果，视图只展示 B 的计数与路径。
- **ac-cancel**：在途 `compare` 后调用 `cancel()` → 该 promise 以 `OperationCancelledError` 结束，迟到响应不改变任何状态；随后再次 `compare` 能正常拿到正确结果；全过程无 unhandled rejection。
- **ac-dispose**：`dispose()` 后注入 worker 的 `terminate()` 恰好被调用一次、在途 promise 以取消结束、之后不再 `postMessage`、迟到消息被忽略；重复 `dispose()` 幂等；回退路径 `dispose()` 后结果不再落地；`dispose()` 后再 `compare` 以取消结束而非同步抛错。
- **ac-fallback-no-worker**：在 `typeof Worker === 'undefined'` 且不注入 worker 时，客户端自动走异步回退并返回与 ac-job-parity-diff 相同的结果，不抛 `Worker is not defined`；`compare` 返回 pending Promise（同步返回后立即检查尚未 resolve），调用方得以先渲染加载态。
- **ac-worker-protocol**：用假 worker 断言协议——请求携带单调递增 id 与 `{ leftText, rightText, format }`；响应按 id 匹配到对应 promise；未知 / 乱序 id 的响应被忽略；错误响应重建后 `name === 'StructuredParseError'` 且 `message` 与同步 `diffStructured` 抛出的文案逐字一致（含 `left side:` / `right side:` 前缀）；非解析错误保留 `name` 与 `message`。
- **ac-parse-error-parity**：视图面对不可解析的一侧展示既有错误态，错误描述文本等于同步 `diffStructured` 的 message；左右原文与其它会话仍可用。
- **ac-loading-interactive**：注入挂起客户端渲染 `StructuredView`，首帧出现「对比中」加载态（zh / en 两套文案）且不出现计数与变更行；此时切换状态过滤与格式控件成功（选中态变化、不抛错、不等待对比完成）；让挂起请求以样本结果落地后，计数与节点路径按结果渲染。
- **ac-view-unmount**：渲染后卸载（含切会话场景）→ 注入客户端 `dispose()` 被调用一次；挂起请求之后落地不产生状态更新噪声或未处理 rejection。
- **ac-scale-5mb**：确定性生成两份 ≥5 MB（`Buffer.byteLength >= 5 * 1024 * 1024`）、≥8 层嵌套、两侧键序打乱且含 `added` / `removed` / `modified` / `typeChanged` 的真实文件，落盘后经 `node:fs` 读回；后台 job 在单测超时内完成且不抛错，`diff` 与同步 `diffStructured` 深相等（`counts` 与 entries 路径序列逐项一致），`ranges` 与同步 locator 一致。
- **ac-existing-sync-api**：`diffStructured` / `filterStructuredChanges` / `parseStructured` / `locateStructuredPath` 签名与行为零改动，`diff.test.ts` / `locate.test.ts` 未删改，`pnpm test` 全绿。
- **ac-existing-view-tests**：`StructuredView.test.tsx` 既有覆盖点（样本列表、计数、过滤、格式切换、下钻、本地文件打开、错误态、i18n）不减少，最终 DOM 断言与现状等价——只允许改为等待异步结果，不允许删断言或放宽到「存在即可」。
- **ac-gates-green**：`install` / `lint` / `typecheck` / `build` / `build-web` / `test` 六条既有门禁全绿，不新增 gate id。

## 非目标

- 不做差异行点选跳转 / 高亮、原文反选、双栏同步滚动、过滤与切 tab 的选中项 / 滚动位置保持（下游「定位与同步滚动」子项）。
- 不做原文与变更列表的窗口化 / 渲染行数有界（同属下游子项）；本域只保证解析、差异、定位不占主线程，5 MB 的可交互性在对比层与挂起客户端上断言，不以「整页渲染 5 MB 后仍流畅」为验收。
- 不做行 → 节点反向索引；`ranges` 只按变更条目的路径正向产出。
- 不改 `diffStructured` / `parseStructured` / `locateStructuredPath` 的签名、状态与计数口径、JSON Pointer 格式；不改 `src/core/structured/` 的语义规则。
- 不改主进程 IPC / 扫描 / 哈希；大文件仍走既有 `readTextFile` 整串读取；不新增 npm 依赖、网络依赖、UI 库或第二套虚拟化体系。
- 不做 per-session 结果缓存、worker 池、多请求并行、SharedArrayBuffer / 传输优化；一次只有一个在途对比。
- 不新增 `.munk/code-gates.json` 的结构化语义门（另一子项）；不动扩展名白名单、发布口径、视觉 token 与色板。
- 不做 CRLF/LF 与编码归一化（I#9 挂账），不处理 UTF-8 BOM；不开浏览器 / 真机 / 桌面点选工单。

## 实现约束

- **结果契约（下游子项依赖，不得改名）**：
  ```ts
  interface StructuredCompareOutcome {
    readonly diff: StructuredDiffResult
    readonly ranges: Readonly<Record<string, { readonly left: SourceRange; readonly right: SourceRange }>>
  }
  interface StructuredCompareClient {
    compare(request: {
      readonly leftText: string
      readonly rightText: string
      readonly format: StructuredFormat
    }): Promise<StructuredCompareOutcome>
    cancel(): void
    dispose(): void
  }
  createStructuredCompareClient(options?: {
    createWorker?: () => StructuredCompareWorkerLike | null
  }): StructuredCompareClient
  ```
  `ranges` 的键是 `entry.path`，只含非 `same` 条目。
- **纯函数复用，零语义复制**：后台 job 只组合既有 `diffStructured` 与 `createStructuredLocator`；`src/core/structured/` 不改。job 必须能在 Node 直接 import 执行（零 DOM / Electron / React），worker 壳只做 `onmessage` / `postMessage`。
- **错误顺序**：先 `diffStructured` 再建 locator，保证解析错误带 `left side:` / `right side:` 前缀；跨 worker 边界保留 `name` 与 `message`，客户端重建 `StructuredParseError` 实例。
- **取消语义复用既有设施**：`OperationCancelledError` / `isOperationCancelled`（`@core/io`）；取消是失败不是空结果，被取代与被取消的 promise 都必须被调用方消费，不得产生 unhandled rejection。
- **回退**：`typeof Worker === 'undefined'` 或注入返回 `null` 时走异步回退（同一 job，至少让出一个宏任务），不得抛 `Worker is not defined`。
- **生产打包兼容**：renderer 生产包经 `loadFile` 以 `file://` 加载且 `sandbox: true`；worker 必须由 Vite 预打包为经典 worker（不依赖运行时 ESM 模块加载或仅 dev server 可用的形式），`pnpm build` 与 `pnpm build:web` 必须同时通过。
- **视图注入**：`StructuredView` 通过可注入的客户端工厂取得实例（prop 或模块级默认），测试可注入挂起 / 假实现；视图渲染期不再同步调用 `diffStructured`。客户端按视图实例创建，卸载即 `dispose`。
- **i18n**：新增「对比中」等文案走 `src/renderer/src/i18n/messages/{zh,en}/files.ts`，中英双语，不硬编码中文。
- **测试落位**：job 等价比对与 5 MB 用例放 `src/renderer/src/structured/compareJob.test.ts`；代次 / 取消 / dispose / 协议 / 回退放 `compareClient.test.ts`；加载态 / 可交互 / 错误态 / 卸载放 `StructuredView.async.test.tsx`。5 MB 样本在测试内确定性生成到 `os.tmpdir()` 后读回，不把 MB 级 fixture 提交进仓；可为该用例显式放宽单测超时（≤ 60s），不得靠缩小样本规避 ≥5 MB。

## 最近交付证明

- WI：`wi_ws_03095d37d1065733`（大文件后台对比与定位 / `structured-async-compare`，前序 `structured-locate-core` 之后）
- 日期：2026-10-31
- 结果：code_gates passed（9 gates，attempt 001，`needSelfTest: false`）——`install` / `lint` / `typecheck` / `build` / `build-web` / `test` / `test:compare-request` / `test:cancel` / `test:memory` 全绿；`pnpm test` 84 files / 1299 passed / 1 skipped（前序 81 files / 1277）。
- 覆盖摘要：
  - **job**（`compareJob.ts`，纯组合）：`diffStructured` → 取 `status !== 'same'` 条目 → 两侧 `createStructuredLocator(...).locate(path)`，`ranges` 键集严格等于变更路径集合。`compareJob.test.ts` 8 例：内置 JSON/YAML 样本 + 下钻 pair + `__fixtures__/locate/` 真实文件四份逐一与同步 `diffStructured` 深相等、`ranges` 与同步 locator 深相等、`same` 不带区间、解析错误文案与同步实现逐字一致。
  - **5 MB 规模**：`buildDocument` 确定性生成两份 ≥5 MB / ≥8 层嵌套 / 两侧键序打乱且覆盖 `added` / `removed` / `modified` / `typeChanged` 的 JSON，写 `os.tmpdir()` 后经 `node:fs` 读回；该例实测 704 ms（超时放宽至 60 s），`diff` 与同步引擎深相等、路径序列与 `counts` 逐项一致、`ranges` 与同步 locator 一致。
  - **客户端**（`compareClient.ts`）：单调 id + 代次取代、`cancel` 保留 worker 可复用、`dispose` 幂等且 `terminate()` 恰一次、迟到响应按 id 丢弃、错误跨边界重建 `StructuredParseError`、无 `Worker` 时宏任务回退（同步返回 pending）。`compareClient.test.ts` 10 例覆盖协议 / 代次 / 取消 / dispose / 回退。
  - **视图**（`StructuredView.tsx`）：`useMemo` 同步 `diffStructured` 移除，改为 `createClient` 注入 + effect 异步 compare；`settled` 与 `source`/`format` 绑定，输入落后即渲染 `files.structured.comparing` 加载态（zh `对比中` / en `Comparing`），加载期过滤 / 格式控件仍可交互；卸载 effect 调 `dispose`，`isOperationCancelled` 不落错误态。`StructuredView.async.test.tsx` 4 例覆盖双语加载态、可交互、错误态文案、卸载 dispose；`StructuredView.test.tsx` 15 例仅把同步断言改为 `findBy*` / 先等结果，断言未减。
  - **打包**：`build` 产出 `out/renderer/assets/compareWorker-_pG9-55D.js`（241.41 kB），`build:web` 产出 `dist/web/assets/compareWorker-DJK6YExf.js`（113.78 kB），均为 Vite 预打包经典 worker chunk，`file://` + `sandbox: true` 下可用。
- 证据：`.munk/runs/run_ws_04d87f5bd4a6f6ca/code-gates/attempts/001/{install,lint,typecheck,build,build-web,test,test-compare-request,cancel-gate,memory-gate}.log` 与同名 `.result.json`；diff 范围 = 新增 `src/renderer/src/structured/{compareJob,compareClient,compareWorker}.ts` + 对应两个测试 + `StructuredView.async.test.tsx`，改 `StructuredView.tsx` / `StructuredView.test.tsx` / zh+en `files.ts` / `mainScan.test.ts`（各 1 行 key 存在性）。
- 注：本 WI change pack 仅含 `prd.md`（无 `tests/cases/**` / `tech.md` / `ux/**`），无 change-pack 用例可 copy、无 tech/ux 手合；验收口径已按 `prd.md` 的 15 条 AC **定义**整段折入上方「验收」，人工验收步骤落本域 `qa/structured-background-compare-contract.md`。
- 后续注意：① `StructuredCompareOutcome` / `StructuredCompareClient` / `createStructuredCompareClient` 的名称与 `ranges` 键口径是下游「定位与同步滚动」的依赖，**改名前先改本域契约**。② `StructuredView` 的既有测试现在必须在结果落地后断言（`findBy*`），新增用例请沿用异步等待，不要退回同步 `getByText`。③ `ranges` 只覆盖非 `same` 条目——后续做行内高亮 / 原文反选时，`same` 行不会拿到区间，需要位置时另行取 locator，别在本域偷偷扩键集。④ 视图层把「结果与 `source`+`format` 身份绑定」作为加载态判据，替换数据源时若复用同一个对象引用会误判为已落地。
