# Domain: ui-key-path-regression

UI 第一期关键路径回归断言收口域：在最终 UI 树（main tip `c09d81b`，`package.json#version = 0.2.11`）上把「八类关键路径 → 测试文件 › 用例名」的断言盘面固化成**只补空位**的清单，并只对确有缺口的路径补一条断言。本域管**断言盘面本身与「补空位」的判定纪律**，不拥有被测行为：双栏同步滚动 / 指示条跳转 / 窗口化行模型归 `code-diff-merge` 与 `diff-ruler`，目录下钻与树行模型归 `directory`，CSV 主键对账归 `csv-align`，JSON / YAML 语义视图归 `structured`，三档壳层布局归 `workbench`，门禁矩阵形状归 `quality-gates`。本域产出 = 盘面 + 一条补空位断言，生产代码零 diff。

## 范围

- **八类关键路径的既有断言盘面（已覆盖，不得重复补、不得改写放宽）**：

  | # | 关键路径 | 现有断言落点 |
  | --- | --- | --- |
  | 1 | 双栏 diff 同步滚动 | `components/DiffPane.test.tsx` ›「mirrors scrollTop 1:1 through CodeView above the window threshold」（窗口化路径，双向 1:1）；本域补全整表渲染路径（<1,000 行），见 `ac-sync-small-path` |
  | 2 | 指示条点选跳转到差异块首行 | `views/CodeView.ruler.test.tsx` ›「scrolls both panes to the clicked block and keeps counts and badges in sync」；`views/CodeView.rulerTrack.test.tsx` › 350k 轨道命中 / 命中后窗口渲染；`core/text/ruler.hit.test.ts` › 命中边界 |
  | 3 | 350k 行模型 DOM 有界 + 总高 = 对齐行数 × 20 + 两栏相等 | `components/DiffPane.test.tsx` ›「bounds the rendered rows of a 350k-row pane and keeps both columns equal」「keeps the content height strictly at rows × DIFF_ROW_HEIGHT in both columns」 |
  | 4 | 目录下钻返回不丢过滤 / 折叠 / 选中行 / 滚动 | `views/DirectoryView.test.tsx` ›「restores filter, collapse, selection and scroll after a drilldown remount」（跑在 `createRealDirectoryFixture` 的真实磁盘临时目录上）；`App.ruler.test.tsx` › 下钻 + 指示条跳转 + 返回同一棵树 |
  | 5 | 三向合并逐块点选 | `views/CodeView.test.tsx` ›「counts conflicts, resolves block by block and unlocks export」及运行时冲突计数用例 |
  | 6 | CSV 主键对账 | `views/CsvView.test.tsx`（按 key 对齐 / 切换主键 / 重复键徽标 / 本地文件入口）；`core/csv/align.test.ts` |
  | 7 | JSON / YAML 语义视图 | `views/StructuredView.test.tsx`（JSON↔YAML 切换 / 类型变更 / 解析错误 / 本地文件入口）；`core/structured/*.test.ts` |
  | 8 | 1024 / 1440 / 1920 三档宽度布局不重叠不裁切 | `workbench/shellLayout.test.ts`（三档宽度映射、app head 与各视图工具栏预算、入口三档呈现）；`workbench/shellLayout.dom.test.tsx`（每条 toolbar 行单行、每条入口逐个渲染一次） |

- **补空位的判定纪律**：先按盘面逐条核对既有断言，**只补空位**；不重写、不放宽、不为「统一风格」改写既有用例，不把同一契约再堆一条同类断言（同一行为只保留一条断言）。
- **唯一缺口（本域承接）**：第 1 条此前只覆盖窗口化路径（>1,000 行）。<1,000 行的整表渲染路径没有任何同步滚动断言——补一条 `CodeView` 双栏 1:1 同步断言，落在 `components/DiffPane.test.tsx` 既有 CodeView 段落，复用 `DIFF_ROW_HEIGHT` / `paneElements` / `contentOf` / `scrollTo` 既有 helper。
- **真实磁盘来源已满足，不新造目录树**：`src/renderer/test-support/directoryFixture.ts` 用 `mkdtemp` 建 26,000 个真实文件并跑 `compareDirectories`，`DirectoryView` 全套用例（含第 4 条）都跑在它上面。
- **只读可观测钩子**：断言只看 `data-diff-row`、`data-diff-window-start`、`data-diff-content-height`、`data-start-row`、`data-shell-entry`、`data-tab-part` 与行为结果（`scrollTop`、DOM 行数、行内文本、`style.height`、`aria-*`）；不读内部 state 或私有函数，不新增 DOM 钩子。
- **真回归才定点修**：若某条断言在最终树上失败，顺序固定为「先加失败断言证明 → 最小定点修复 → 复跑 `pnpm test` 与默认九门」；修复面只允许交付说明点名的文件，且不得触及 diff / merge / csv / structured 算法、目录行模型、`DiffPane` 窗口化公式、ruler 计算与壳层布局表。
- **结构性问题只记录**：发现结构性问题时只在交付说明写「问题 → 证据路径 → 建议另开定点项」，不重写整层、不顺手扩大改面。

## 验收

- **ac-gates-green**：最终树上 `pnpm test` 全绿；默认 `code_gates` 九门（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate）全部 passed，无新增 skip。
- **ac-coverage-map**：交付说明给出「八类关键路径 → 测试文件 › 用例名」清单，清单中每条用例在最终树中真实存在且通过；八类各至少一条；缺口已补；无同一行为重复堆叠（同一契约只保留一条断言）。
- **ac-sync-small-path**：新增一条断言——`CodeView` 渲染 <1,000 行的 pair 时，设置左 pane `scrollTop = N × 20` 并触发 `scroll` 后右 pane `scrollTop` 精确等于该值；反向同样成立；且两个 pane 的 `data-diff-content-height` 均不存在（走整表渲染，不是窗口化）；两 pane 渲染行数相等。
- **ac-350k-contract-intact**：既有 350k 用例保持原契约不变——渲染行数落在「视口行数 ~ 视口行数 + 2×overscan」上下界内、内容总高 `7000000px`（350,000 × 20）、两栏内容总高相等；本项新增 0 条同类断言。
- **ac-three-tier-intact**：既有三档断言仍绿且未被放宽——1024 / 1440 / 1920 每档 app head 与各视图工具栏预算不超过该档宽度、每条 toolbar 行只有一行（无换行）、18 条入口在三档各渲染且仅渲染一次（隐藏只允许丢标签文案，不允许丢入口）。
- **ac-real-fixture-key-path**：第 4 条「下钻返回」用例仍在 `createRealDirectoryFixture` 的真实磁盘临时目录上执行（`beforeAll` 里 `expect(comparison.counts).toEqual(REAL_FIXTURE_COUNTS)` 保留），并断言 filter / 折叠 / 选中行 / 双栏滚动四项在重挂载后与返回前一致；不得退化成只依赖内置样本的比较结果。
- **ac-no-long-gate**：`.munk/code-gates.json` 与 `vitest.config.mts` 零 diff；无新增 perf / evidence 配置与跑批脚本；`pnpm test` 用例集耗时没有量级增长（新增用例基于 ≤1,500 行内存 pair，不引入大磁盘 fixture）。
- **ac-scope-guard**：`git diff` 中生产代码（`src/core/**`、`src/renderer/src/**`、`src/main/**`、`src/preload/**`、`src/shared/**` 的非 `*.test.*` 文件）为空；若确有真回归，只允许改动交付说明点名的文件，且必须附「修复前该断言失败、修复后通过」的证据，改动不得触及 diff / merge / csv / structured 算法、目录行模型、`DiffPane` 窗口化公式、ruler 计算与壳层布局表。
- **ac-structural-handback**：若盘点发现结构性问题，只在交付说明写「问题 → 证据路径 → 建议另开定点项」，不重写整层、不顺手扩大改面。

## 非目标

- 不做浏览器 / 真机 / 桌面点选，不开 product-qa 场；L3 视觉走查不在本域。
- 不重跑 350k / 358k / L1 长跑规模腿，不写 perf 报告，不改既有 perf 结论。
- 不新增长跑门禁，不改 `.munk/code-gates.json`、`vitest.config.mts` 或 `package.json` 脚本。
- 不改算法与视图模型：diff / merge / csv / structured 引擎、目录扫描与行模型、`DiffPane` 窗口化、ruler 命中计算、`shellLayout` 尺寸表、图标命名表、主题 token 与 `{language, theme}` 设置契约。
- 不改任何 UI 功能、入口、样式、文案与 tab 截断预算；不新增组件或 DOM 钩子（除非现有钩子无法表达断言，且需在交付说明给理由）。
- 不重复补齐已有断言（尤其 350k、三档宽度、CSV、JSON / YAML、三向合并），不把已有断言改宽松或改写以「顺手统一风格」。
- 不为覆盖而覆盖：不引入快照测试、不引像素测量、不引新测试依赖。

## 实现约束

- **基线核验**：开工先核对 `DiffRuler.tsx`、`src/core/text/ruler.ts`、`DiffPane.tsx` 存在，缺失即视为基线不一致上报；不得重做指示条、不得在主检出上作业。
- **新增断言位置**：只加在 `components/DiffPane.test.tsx` 既有 `windowed diff scroll sync` 段落内，复用 `paneElements` / `contentOf` / `renderedRows` / `scrollTo` / `DIFF_ROW_HEIGHT`，不另建渲染脚手架、不新增 helper 文件。
- **jsdom 无布局**：三档宽度继续用「纯表预算 + 静态类证据」口径，不尝试测像素。
- **文本定位纪律**：tab / 会话文案若被断言触及，一律走 `aria-label` 或 `data-tab-part`（前序项已推翻按 CSS 类定位可见文本的写法）。
- **墙钟敏感**：新增用例只用内存 pair（≤1,500 行）或复用 `createRealDirectoryFixture`；不新增 26k 级目录树，不在默认 `pnpm test` 里跑构建产物。
- **单一契约**：同一行为只保留一条断言；发现既有断言与新增断言重叠时删新不删旧，或说明为何二者测的是不同路径（本域的例外仅「窗口化 vs 整表渲染」，是两条代码路径而非同一行为重复）。
- **交付说明必含**：八类路径 → 用例清单、新增断言清单与「为何它不是重复」的一句话、`pnpm test` 与九门结果、以及（若有）定点修复与结构性问题的记录。

## 最近交付证明

- WI：`wi_ws_eaef969c068096a3`（UI 第一期关键路径回归断言收口；`kind: test/verification`，`needSelfTest=false`）
- 日期：2026-10-30
- 结果：`code_gates` passed（9 gates，attempt 001 全 exit 0，`.munk/runs/run_ws_0f8fb19e0b1381f5/code-gates/attempts/001`）；`pnpm test` 80 files / 1244 passed + 1 skipped（1245）/ 27.44s（上一轮主题 WI 为 1243 passed，本轮 +1 test、文件数不变 80）；`DiffPane.test.tsx` 16 tests（原 15）。**新建本域**，未改历史域记录。
- 盘点结论：八类路径中七类断言已在最终树存在且绿（见「范围」表），**唯一缺口是第 1 条的整表渲染路径**（<1,000 行）。本项只补这一条，`git diff --numstat` = `28 0 src/renderer/src/components/DiffPane.test.tsx`，生产代码零 diff。
- 新增断言：`DiffPane.test.tsx` ›「mirrors scrollTop 1:1 on the full-render path below the window threshold」——900 行内存 pair 走整表渲染（两 pane 各 900 个 `data-diff-row`、`data-diff-content-height` 均 `undefined`、两栏行数相等），左→右 `123 × 20 = 2460`、右→左 `42 × 20 = 840` 精确 1:1。**不是重复**：既有用例锁的是窗口化路径（>1,000 行、虚拟内容盒），本条锁的是同一组件的另一条渲染分支（整表 DOM），分支间无共同断言。
- 证据：`code_gates` attempt 001 九门全绿（install / lint / typecheck / build / build:web / test / test-compare-request / cancel-gate / memory-gate）；`test.log` 含 `src/renderer/src/components/DiffPane.test.tsx (16 tests)`；`git status --short` 开工后仅 `M src/renderer/src/components/DiffPane.test.tsx`（另 `.munk/changes/<wi>` 未跟踪）。
- 注：本 WI change pack 只有 `prd.md`（无 `tests/cases/**`、无 `tech.md` / `ux/**`）——无 change-pack 用例可 copy、无 tech / ux 手合；验收逐条落档为 `qa/ui-phase1-key-path-regression.md`。
- 后续注意：① **「关键路径都有断言」这个假设被推翻**——同步滚动只有窗口化路径被测过，整表渲染分支从 v0.2.x 起一直裸奔；任何改动 `DiffPane` 渲染分支条件（阈值 / overscan / 内容盒）都要同时看这两条用例。② 第 4 条依赖 `createRealDirectoryFixture`（26k 真实文件、`mkdtemp`），是最重的单测来源（`DirectoryView.test.tsx` 18s）；后续不要为「更真实」再加一套磁盘 fixture，也不要把它从 `beforeAll` 挪进逐用例。③ 三档宽度在 jsdom 里只验「表预算 + 静态类」，真实窗口重叠 / 裁切仍归 product-qa 的 L3，不要用像素断言补。④ `ac-scope-guard` 是硬约束：本域以后任何「顺手修实现」都会破坏「生产代码零 diff」的口径，真回归必须走「先红后绿 + 点名文件」流程。
