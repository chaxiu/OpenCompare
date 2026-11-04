# Tech overview

Thin technical baseline (SSOT). 域语义与 AC 见 `.munk/baseline/domains/**`，ADR 见 `.munk/baseline/tech/decisions/**`。

## 目录与边界

- `src/main/`：Electron 主进程（窗口、IPC、真实文件系统、perf 采样与证据落盘）。
- `src/preload/`：`contextBridge` 白名单桥。
- `src/renderer/`：React 19 UI；所有平台能力经 `PlatformPort`，不直接 import Electron。`PlatformPort` 含只读批量 `realpath(paths)`（channel `platform:realpath`；electron 失败逐项回退输入、`/samples` 原样、web 恒等），用于别名根摘要缓存键归一。
- **i18n 分层**：词典与语言上下文在 `src/renderer/src/i18n/`（`messages/{zh,en}` 五表面成对、`messages/index.ts` 唯一聚合、`I18nProvider` / `useI18n` 无 Provider 回落 zh、`resolveLanguage.ts` 的纯函数 + 只读 loader、`testing.tsx` 的 `renderWithI18n`）；源码中文扫描器在 `src/shared/i18n/`（Node 侧、显式路径清单）。持久化只走 `PlatformPort.readUserSettings` / `writeUserSettings` / `systemLocale`（Electron `userData` 单 JSON 原子写，Web 单键 `opencompare.userSettings` + 内存回退）；renderer 不引入 i18n 框架、不直连存储。生产入口 `App.tsx` 用 `loadInitialLanguage(platform)` 解析后以 `I18nProvider initialLanguage` 挂载一次 `Workbench`（解析期只渲染无文字品牌帧；语言值不作 React `key`；`?perf=1` 分支不读设置）。**设置记录是 `{ language, theme }` 两个字段、整条覆盖写**（`src/shared/platform/settings.ts` 唯一解析：缺 `language` 读作无记录，缺 / 未知 `theme` 回退 `dark`；写入必须给全量记录，否则会丢另一字段）；启动期 `App` 并行 `loadInitialLanguage` + `loadInitialTheme`（故 `readUserSettings` 被读两次），随后在 `I18nProvider` 内再挂一层 `ThemeProvider`（`src/renderer/src/theme/`：`resolveTheme` / `applyTheme` 写 `<html data-theme>` + `color-scheme`，`system` 模式才订阅 `matchMedia`，`Workbench` 不挂主题 `key`、切主题零 IO 零重挂）。壳层可见文案与差异语义 / 文件类型名一律渲染期取键；会话显示由纯函数 `src/renderer/src/workbench/sessionDisplay.ts` 按会话身份产出词典键 + 用户数据片段，统计为稳定角色 key，`SessionStat.label` 不再参与渲染或分支判断。
- `src/core/`：纯算法与领域模型，零 Electron / DOM，可被 vitest 直接单测。
- **渲染侧图标单一来源**：`src/renderer/src/assets/icons/` 存 32 个 vendored Lucide SVG（`?raw` 导入）+ 纯数据表 `index.ts`（`ICON_PATHS` / `ICON_NAMES` / `ICON_SIZES` / `LUCIDE_VERSION` / `strokeWidthFor` / `SHELL_ENTRY_ICONS` / `UI_ICON_ACTIONS`，零 DOM 零 Electron，node 侧 vitest 直读）；`components/Icon.tsx` 是渲染侧唯一 `<svg>` 出口（几何 + 三档 16/20/24 与光学描边由它决定）。`lucide-react` 已从 `dependencies` 与锁文件移除，ESLint renderer 段拦 `lucide-react` 及其它图标集；新增图标须「拷 SVG + 进表 + 被映射引用」三步同批。域语义见 `.munk/baseline/domains/icon-system/product.md`。
- `src/shared/`：跨进程类型、`PlatformPort`、fixtures、perf 契约。
- **文件家族单一判定**：`src/shared/fileExtensions.ts` 的 `extensionFamily(name)`（仅扩展名，未知 → `null`）与 `resolveFileFamily(name, content)` 是唯一「扩展名 + 内容 → 家族」入口（`SUPPORTED_FILE_EXTENSIONS` / `isSupportedComparisonFile` 已删除）；`src/core/text/probe.ts` 的 `isTextProbe` 是唯一二进制结论（编码已知且解码文本无 `U+0000`）；`renderer/src/workbench/fileKinds.ts` 只做家族 → 视图映射（`classifyFamily` / `classifyFile` / `contentFamily`）。请求校验（`resolveCompareRequest` / `resolveMergeRequest`）零读取、不按扩展名拒绝；判定只在打开链路（`openFilePairSession` / `openDrilldownSession` / `buildMergeSession`）的每侧一次 probe 里发生，未知扩展名文本进 `code`，二进制抛 `UNSUPPORTED_FILE_TYPE`。取舍见 `tech/decisions/adr-0003-content-family-at-open.md`。

## 会话与视图生命周期（渲染侧）

- 会话列表语义单点在 `src/renderer/src/workbench/sessionStore.ts`：`upsertSessions`（同 id 原位替换、新 id 追加）/ `replaceSessions`（沿用调用方 id）/ `closeSessions` / `commitSessionTree`（upsert 或原位替换 + 被替换会话按根释放；`commitUpsert` 为薄封装）。`Workbench` 与 perf harness 共用，禁止各自演化。
- **每一个**打开的目录 tab 都持自己的完整 `DirectoryComparison`；提交新 tab 或重新比较都不会摘掉其它 tab 的树。切 tab 只改 `activeId`：0 次目录扫描、0 次 digest，四态 / 过滤 / 折叠 / 选中 / 滚动立即完整（状态由 shell 按 session id 持有）。2026-10-23 公司裁决撤掉了「非活动 tab 只留摘要 + 激活重建」——真实规模下一次激活重建要付完整扫描（≈8–10 s），违反切 tab 即时性；代价是 3 tab 常驻 3 棵完整树（`holds.comparisons = tabs`），瞬峰与静置硬线继续由 `perf:gate` 守。
- 目录视图的 `key = 会话 id + comparison 修订号`（`directoryViewKey` / `directoryComparisonKey`，`WeakMap` 登记、不延长寿命）。同 tab 重新对比、`replaceSession`、切 tab 都在**提交阶段**换 key → 旧 `DirectoryView` / `TreeView` / `useVirtualizer` 子树卸载，旧 comparison 与旧 row model 不再经 fiber props / `ref` 回调 / 虚拟列表闭包可达。释放不靠 `useEffect` 延迟清理或 GC 时机。
- 过滤 / 折叠 / 选中 / 滚动位置仍由 shell（`directoryStates` / `directoryScroll`）持有并在重挂后恢复；视图重挂只重置 `DirectoryView` 局部 `direction` / `mode`（与下钻返回重挂一致）。
- 摘要缓存仍是 renderer 单例（`Workbench` 的 `useRef`），双上限（200,000 条 / 128 MiB 估算）与 LRU / 按根释放不变；键经 `comparisonCache.aliasRoot` / `canonicalPath` 按 realpath **只归一键空间**（`workbench/rootAliases.aliasSideRoots` 在 `compareSides` / `directoryOps.compareRoots` 比较前登记），会话 id / 标题 / 显示路径 / 证据 roots 仍用用户输入，别名不折叠 tab。释放只影响是否重哈希，不影响四态。

## 性能测量与门禁（`pnpm perf:dir` / `pnpm perf:gate`）

- harness 渲染真实 `SessionTabs` + `DirectoryView`，会话列表走 `sessionStore`；`--mode upsert`（同 session id、tab 恒 1）/ `--mode multisession`（逐轮追加、tab 1→2→3）/ `--mode retained`（建 3 tab 并保留 → `--hot-rounds` 轮活动 tab 热 upsert（默认 2）→ 关活动 tab 并落到相邻已驻留 tab），可重复 `--left/--right` 配对，`--settle <ms>`（默认 20 s、上限 60 s）。**不存在轮前释放路径**；`--hot-rounds` 仅 `retained` 可用。
- 采样：`startup` / `boundary` / `pre-round` / `post-round`（新树已上屏）/ `periodic` / `settle`；`retained` 另有具名静置阶段 `settleStages[{label: after-3-tabs | after-hot-upserts, rss, at, tabs}]` 与关 tab 后的 `reclaim{tabs,rss,at}`。`peaks` 排除 settle，静置单独成列。
- 结构断言：perf 模式在 app ready 前装 `--js-flags=--expose-gc`（普通启动不加）；每轮与 settle 后强制 GC 两次，`shared/perf/liveness.ts` 的 `WeakRef` 登记表数 `comparisons` / `rowModels`，`holds[]` 随证据落盘；`gc=false` 判 `hold-unmeasured` 红。`holds.comparisons` 要求 **= 该场景的 tab 数**（upsert 1、multisession 1/2/3、retained 1/2/3/3/3 且 settle 阶段 3、reclaim 2），`tabs` 按同一份 `expectedHoldTabs` 判定。
- 判定单点：`src/shared/perf/verdict.ts` + `perf/profiles.json`（六项数值未改）。`settleRendererBytes`（real 1,363,148,800 B / gate 1,073,741,824 B）与 `renderer-round-peak` / `renderer-settle` / `settle-missing` / `hold-*` 继续有效；多 tab 场景（multisession / retained）的瞬时 ready 峰值降级为护栏 `TRANSIENT_PEAK_GUARDRAIL_BYTES = 2_415_919_104`（超 profile 目标只进 `notices[]`），`settle` / `settleStages` / `appTotal` / `reclaim`（`RECLAIM_RENDERER_BYTES = 1_153_433_600`，关 1 tab）/ 热轮 `hashedFiles=0` / 静置抬升 ≤100 MiB / `renderer-restart` 仍为硬线；`upsert` 的 profile 峰值硬线不变，`round-delta` 仅对 `upsert` 生效。
- 证据：`schema: opencompare.perf.directory/v1` 加法扩展（`mode` / `pairs` / `hotRounds` / `rounds[].tabs` / `rounds[].roundPeak` / `rounds[].rendererPid` / `settle` / `settleStages` / `reclaim` / `holds` / `verdict.notices`），原子写、< 5 MB。
- 条件门禁（`.munk/code-gates.perf.json`，不进默认矩阵）：`pnpm perf:gate` 单次生成数据集（含第三对根 `links/left` 目录符号链接）并跑三次 harness（upsert 5 轮 + multisession 3 会话 + retained 3 tab/2 热轮，`--settle 5000`，`RUN_TIMEOUT_MS=300_000`），断言峰值（多 tab 用 2.25 GiB 护栏）/ settle / settleStages / reclaim / appTotal / holds / tabs / 热轮 `hashedFiles=0` / 别名轮 `hashedFiles=0`；`pnpm test:memory` 继续守缓存双上限 / 跨轮不增长 / 释放 / 结果不变。仅在 diff 触及扫描 / 哈希 / 缓存 / IPC / 树渲染 / 取消路径时调用，或作为里程碑 `x.y.0` 的独立验收任务跑一次。

## 质量门禁

默认矩阵 26 项：`pnpm install` / `lint` / `typecheck` / `build` / `build:web` / `test` /
`test-compare-request` / `cancel-gate` / `memory-gate` / `structured-semantics` / `sync-real-gate` /
`diff-normalize` / `diff-normalize-real` / `spike-launch-gate` / `spike-process-tree-gate` /
`template-default-unchecked` / `template-single-source` / `template-sha-mtime` /
`template-cancel-zero-write` / `template-e2e-real` / `template-case-collision` /
`template-path-contained` / `template-move-actions` / `template-move-verify` / `verify-release-gate` /
`test-debt-gate`（见 `.munk/code-gates.json`），全部为纯单测或构建门禁
（`sync-real-gate` 与 `template-e2e-real` 只写 `mkdtemp` 系统临时目录并自带清理，后者约 1.8 s；两条模板安全门禁为纯函数 / 构造数据，毫秒级；两条模板移动门禁为纯函数 + 真实小夹具，11 ms / 89 ms；`verify-release-gate` 用注入 fixture 跑发布验收驱动，不连网、不启 Electron、不访问本机 6.4 GiB 夹具；`test-debt-gate` 只读 `.munk/baseline/test-debt.json` 的棘轮快照，`vitest list` 只收集不执行，单次约 1 s）；矩阵扩容只做末尾追加，前序条目逐字逐序不变
（`src/munk-gates.test.ts` 钉板同步长度断言）。门禁文件之间不共享 `beforeAll` 夹具、可各自单独冷启动通过，
且不得引用内置样本（`@shared/fixtures` / `DIRECTORY_SAMPLE_PATHS` / 样本挂载路径），由钉板静态扫描钉住。重采样 `pnpm perf:gate` **不在默认矩阵**，只作为条件 profile 放在
`.munk/code-gates.perf.json`（Host 不自动执行）：仅在 diff 触及扫描 / 哈希 / 缓存 / IPC / 树渲染
/ 取消路径时调用，或作为里程碑 `x.y.0` 的独立验收任务跑一次；同一 commit 只采样一次，重跑须在
digest 写明上一轮作废原因与两轮差异。`perf-gate` 真实启动 Electron，无 GUI 会话或超时会红。

## 发布验收与公开顺序

- `scripts/verify-release.mjs` 是发布验收唯一实现：`--layer=ci` 固定 15 项注册表、期望集合 `expectedCheckIds` 单点、终局判定 `judgeReleaseGate` 单点。`--release-state=published|draft` 只切换**传输**（`published` 走 `releases/tags/{tag}` + `gh release download`；`draft` 走 `releases/{id}` + `releases/{id}/assets --paginate` + `releases/assets/{id}` 二进制直写 `.part` → rename），draft 状态判定只在 `judgeReleaseState`，两条传输共用同一段字节数 / sha256 校验循环；不改判定、不改 `expected=15`。
- **构建期 sha256 基线（digest 不再自证）**：`release.yml#release` 在 `gh release upload` **之前**用与上传同一份 glob 与唯一映射 `uploadAssetName`（空格→点）产出清单 `{version:1, tag, target, files:[{name, sha256, bytes}]}`，`upload-artifact@v4` 归档为 `sha256-manifest-${tag}-${target}`（不成为 Release 资产、不进上传参数）。draft 15/15 与 public L1 两处 `gh run download --pattern 'sha256-manifest-*'` 取回合并，用唯一纯函数 `judgeBuildSha256` 逐资产断言 GitHub digest（剥 `sha256:`）== 构建期 sha256，折进 `identity-asset-bytes-sha256`（仍 15 项）；public L1 只经 `verify-release.mjs --public-l1` 比较，YAML 内无比较规则。缺清单 / 不等 / 缺项 / 孤儿键 / 空 digest / 合并重复键冲突一律点名词 + 两个值并非零退出；published 手工复验无清单时标 `buildSha256.status='not-provided'`（可见、非静默）。
- `.github/workflows/release.yml#finalize` 顺序固定为 `Resolve the tag's release state` → `Dispatch the post-release verification`（`-f mode=… -f release_run_id=$GITHUB_RUN_ID`）→ `Find … run` → `Assert … aggregate passed`（aggregate `success` + artifact 存在）→ `Make the tag's release public`（全仓唯一 `--draft=false --latest`）→ 既有公开只读断言 → `Run the public L1 checks after publishing`；任一更早失败都保持 `draft=true`，不公开不回滚。finalize 首部新增 `checkout` + `setup-node` 只为执行 `verify-release.mjs`，不改变 publish 与 15/15 门的相对次序。
- `post-release-verify.yml` 的 `permissions` 为 `contents: write` + `actions: read`（后者只用于 `gh run download` 取回 release run 的清单），工作流零写（`gh` 只做 GET / download）；`workflow_dispatch` 的 `release_run_id` 可缺省，`mode=published` 保留已公开 tag 的公开复验，publish 步骤对公开 Release 幂等。
