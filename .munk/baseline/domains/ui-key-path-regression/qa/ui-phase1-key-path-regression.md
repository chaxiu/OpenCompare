# UI 第一期关键路径回归断言收口（八类路径盘面 + 一条补空位断言）

- WI：`wi_ws_eaef969c068096a3`（`key: ui-phase1-key-path-regression`）
- 域：`ui-key-path-regression`（新建；断言盘面与补空位判定层，不是功能实现轮）
- 来源：`.munk/changes/wi_ws_eaef969c068096a3/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**`、无 `tech.md` / `ux/**`；本文件为 AC 逐条落档，不是 change-pack 用例 copy）
- 交付：`src/renderer/src/components/DiffPane.test.tsx` +28/−0，`deliveryIntent: local merge`，`needSelfTest=false`

## 八类路径 → 用例清单

| # | 关键路径 | 最终树中的断言 |
| --- | --- | --- |
| 1 | 双栏 diff 同步滚动 | `components/DiffPane.test.tsx` ›「mirrors scrollTop 1:1 through CodeView above the window threshold」（窗口化路径）+ **本项新增**「mirrors scrollTop 1:1 on the full-render path below the window threshold」（整表路径） |
| 2 | 指示条点选跳转 | `views/CodeView.ruler.test.tsx` ›「scrolls both panes to the clicked block and keeps counts and badges in sync」；`views/CodeView.rulerTrack.test.tsx` › 10 条（含「selects the ratio-resolved block when the track itself is clicked」「follows a track click into the rendered window without any scroll event」）；`core/text/ruler.hit.test.ts` › 5 条命中边界 |
| 3 | 350k 行模型有界 + 总高 | `components/DiffPane.test.tsx` ›「bounds the rendered rows of a 350k-row pane and keeps both columns equal」「keeps the content height strictly at rows × DIFF_ROW_HEIGHT in both columns」 |
| 4 | 目录下钻返回不丢状态 | `views/DirectoryView.test.tsx` ›「restores filter, collapse, selection and scroll after a drilldown remount」（`createRealDirectoryFixture` 真实临时目录） |
| 5 | 三向合并逐块点选 | `views/CodeView.test.tsx` ›「counts conflicts, resolves block by block and unlocks export」 |
| 6 | CSV 主键对账 | `views/CsvView.test.tsx` ›「aligns the shuffled sample by order_id and reports runtime counts」「switches primary keys and recomputes the alignment」「labels duplicate keys with the localized count and per-key detail」「opens a local CSV file on one side and re-aligns it by the shared key」；`core/csv/align.test.ts` |
| 7 | JSON / YAML 语义视图 | `views/StructuredView.test.tsx` ›「switches between the JSON and YAML sample pairs」「lists path-level changes with old and new values」「shows a readable error state for an unparseable side」「opens a local JSON file on one side and recomputes the semantic diff」；`core/structured/*.test.ts` |
| 8 | 1024 / 1440 / 1920 三档不重叠不裁切 | `workbench/shellLayout.test.ts` ›「maps the three reference widths onto compact / regular / wide」（`TIER_WIDTHS = 1024/1440/1920`）+ 工具栏预算；`workbench/shellLayout.dom.test.tsx` ›「keeps every toolbar row on one line」「renders every entry once with the presentation the table declares」 |

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-gates-green | `.munk/runs/run_ws_0f8fb19e0b1381f5/code-gates/attempts/001`：9 门全 `passed`、exit 0；`test` 门 80 files / 1244 passed + 1 skipped（1245）/ 27.44s，无新增 skip | 满足 |
| ac-coverage-map | 上表八类各至少一条，全部在最终树中真实存在且随 `pnpm test` 通过；唯一缺口（第 1 条整表路径）已补；无同一行为重复堆叠 | 满足 |
| ac-sync-small-path | 新增用例：900 行内存 pair，两 pane 各 900 个 `[data-diff-row]`（行数相等），`contentOf(...).dataset.diffContentHeight` 两侧均 `undefined`（整表渲染）；`scrollTo(left, 123 × 20)` → 右 `scrollTop = 2460`；`scrollTo(right, 42 × 20)` → 左 `scrollTop = 840` | 满足 |
| ac-350k-contract-intact | 既有两条 350k 用例零改动：渲染行数 `50`（30 视口 + 2×10 overscan）、`7000000px` / `data-diff-content-height = '7000000'`（350,000 × 20）、两栏总高相等；本项新增 0 条同类断言 | 满足 |
| ac-three-tier-intact | `TIER_WIDTHS` 仍为 1024 / 1440 / 1920，`shellLayout.test.ts` 与 `shellLayout.dom.test.tsx` 零改动；「单行 toolbar」「入口逐个渲染一次」用例在 `test.log` 三档（compact / regular / wide）各 8 tests 全绿 | 满足 |
| ac-real-fixture-key-path | `DirectoryView.test.tsx:322` 仍在 `beforeAll` 里 `expect(fixture.comparison.counts).toEqual(REAL_FIXTURE_COUNTS)`；fixture 走 `mkdtemp` + 26,000 真实文件 + `compareDirectories`；下钻用例断言 filter / 折叠 / 选中行 / 双栏滚动重挂载后一致 | 满足 |
| ac-no-long-gate | `.munk/code-gates.json`、`vitest.config.mts`、`package.json` 零 diff；新增用例只用 900 行内存 pair；`pnpm test` 80 files（与上一轮同）/ 27.44s，无数量级增长 | 满足 |
| ac-scope-guard | `git diff --name-status` 仅 `M src/renderer/src/components/DiffPane.test.tsx`（+28/−0）；`src/core/**`、`src/main/**`、`src/preload/**`、`src/shared/**` 及 `src/renderer/src/**` 的非测试文件零 diff；无真回归需定点修复 | 满足 |
| ac-structural-handback | 盘点未发现结构性问题；无「问题 → 证据 → 另开项」条目需写 | 满足（无条目） |

## 可复跑命令

```
# 八类路径落点抽样（文件存在性 + 用例标题）
rg -n "mirrors scrollTop 1:1" src/renderer/src/components/DiffPane.test.tsx
rg -n "restores filter, collapse, selection and scroll after a drilldown remount" src/renderer/src/views/DirectoryView.test.tsx
rg -n "counts conflicts, resolves block by block and unlocks export" src/renderer/src/views/CodeView.test.tsx
rg -n "maps the three reference widths onto compact / regular / wide" src/renderer/src/workbench/shellLayout.test.ts

# 真实磁盘 fixture 与计数断言（应为 26,000 文件 + REAL_FIXTURE_COUNTS）
rg -n "mkdtemp|REAL_FIXTURE_COUNTS" src/renderer/test-support/directoryFixture.ts src/renderer/src/views/DirectoryView.test.tsx

# 生产代码零 diff（应只有测试文件一行）
git diff --name-status
git diff --numstat

# 门禁文件零 diff
git status --porcelain .munk/code-gates.json vitest.config.mts package.json
```

## 关键事实核对（anti-drift）

- **被推翻的假设**：八类关键路径并非都已覆盖——同步滚动只测了窗口化分支（>1,000 行）；整表渲染分支（<1,000 行，无 `data-diff-content-height`）此前无任何同步断言。改 `DiffPane` 的窗口阈值或 overscan 时，两条用例必须同时看。
- 新增用例测的是**另一条渲染分支**，不是同一契约重复：窗口化用例断言虚拟内容盒与 `data-diff-window-start`，整表用例断言内容盒无 `data-diff-content-height` 且全量 900 行在 DOM 里。
- 第 4 条的重量来自真实磁盘 fixture（`DirectoryView.test.tsx` 18s）；不要再加第二套磁盘树，也不要把它挪出 `beforeAll`（`REAL_FIXTURE_COUNTS` 断言即在该处）。
- 三档宽度在 jsdom 只验「表预算 + 静态类」，真实窗口重叠 / 裁切归 product-qa 的 L3；本域不补像素断言。
- `ac-scope-guard` 是本域硬口径：生产代码零 diff；真回归才允许点名文件定点修，且必须附「先红后绿」证据。
