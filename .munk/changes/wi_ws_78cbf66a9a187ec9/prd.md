# 缺失侧祖先回退：弱化高亮 + 落位 + 文案并存

基线：本 worktree 的 `main` HEAD（`0b89f38`，已含 `4f19ff0` 定位引擎）。只补一处消费断链：点选差异行时，节点在某一侧不存在（`SourceRange.exact === false`）时该侧被 `highlightFor` 直接丢弃，既无高亮也无弱化回应。

## 范围

- **core 判定**：在 `src/core/structured/` 内提供 non-exact 回退的纯函数三态判定（exact / 根祖先 / 无祖先）+ 单测，覆盖「根祖先」与「无祖先」两个边界。优先不改 `locate.ts` 的返回；确有必要只允许新增**可选**增量字段（向后兼容，精确命中行为与既有断言不变）。
- **消费点 `src/renderer/src/views/StructuredView.tsx`**：`highlightFor(side)` 不再对 `!exact` 返回 `null`，改为下发带「祖先弱化」形态的范围；`jumpTo` 保持两侧各自按 `range.startLine` 绝对落位（clamp 不变），仅补「该侧无可用祖先 → 不写 scrollTop、不 rememberScroll」分支；`missingOn` / `missingMarker` 的判定与文案保持独立于弱化高亮。
- **渲染 `src/renderer/src/views/StructuredPanes.tsx`**：`StructuredHighlight` 增加最小的形态维度（如 `tone: 'exact' | 'ancestor'`）；祖先行用独立钩子 `data-highlight-tone="ancestor"` 标记，精确行继续只带 `data-highlight-status`（两者互斥）；祖先行的弱化 class 只组合既有四态 soft token。
- **`src/renderer/src/views/structuredStatus.ts`**：如需弱化 class 常量，只在该文件内组合既有 `HIGHLIGHT_CLASSES`，不改 token 定义。
- **测试**：`src/renderer/src/views/StructuredView.locate.test.tsx`、`src/core/structured/locate.test.ts`（或新增 core 纯函数测试文件）。

## 验收

- ac-core-classify-exact: 对 locator 返回的精确命中范围，core 判定为 exact，不产生祖先 / 无祖先标记，行为与现状一致。
- ac-core-root-ancestor: 目标指针在该侧完全不存在但该侧有文档根时（如 `{"a":1}` 查 `/x/y`，或 PAIR 左侧查 `/a/c` 回退到 `/a`），core 判定为「祖先」并给出可直接用于滚动的范围，`startLine` 等于实际命中祖先的首行（`/a` → 2）。
- ac-core-no-ancestor: 该侧文档没有根时（如 YAML 仅含注释的文档查任意路径），core 判定为「无祖先」，范围不可用，且不抛异常。
- ac-core-exact-untouched: `locate.ts` 既有精确命中、single-side 回退与 root pointer 断言全部保留；`SourceRange` 若新增字段必须为可选，既有 `toMatchObject` / 字段断言不改写。
- ac-view-ancestor-scroll: 点选 PAIR 的 `/a/c` 后，左侧（缺失侧）`scrollTop` 等于 `(2-1) * SOURCE_ROW_HEIGHT`，右侧仍为 `(4-1) * SOURCE_ROW_HEIGHT`，即两侧各按自身范围首行绝对落位。
- ac-view-ancestor-weak-highlight: 同一场景左侧祖先范围内行（lines 2–4）带 `data-highlight-tone="ancestor"` 且不带 `data-highlight-status`；其行内 `bg-diff-*` 类恰好一个且等于该 change status 的既有 soft token（added → `bg-diff-added-soft`），且 className 与精确行不同（体现弱化）。
- ac-view-missing-text-coexists: 同一场景仍渲染 `[data-missing-marker="left"]`，文案为「此侧不存在」；弱化高亮不替代、不删除该文案，也不出现「已定位」类替代文案。
- ac-view-no-ancestor-no-scroll: 一侧文档无根（如仅注释的 YAML）且选中的 change 只存在于另一侧时，该侧 `scrollTop` 保持选中前的值不变，无任何 `data-highlight-tone` 行，「此侧不存在」文案仍在，不抛异常。
- ac-view-exact-unchanged: 精确命中路径（如 `/a/b`）每行仍只带 `data-highlight-status` 且无 `data-highlight-tone`，行 class 仍为该 status 的唯一 `bg-diff-*` soft token，落位偏移与现状一致。
- ac-reverse-exact-only: 点击缺失侧祖先范围内的行（左侧 line 2）不会选中 `/a/c`；点击拥有侧精确行（右侧 line 5）仍选中 `/a/c`。
- ac-existing-assertions-kept: `StructuredView.locate.test.tsx` 既有用例除标题 `marks the missing side with the fallback ancestor line and no highlight` 外全部保留且断言零放宽；该用例允许改写标题与「无高亮」断言为断言弱化高亮存在，但必须保留左侧 `(2-1)*SOURCE_ROW_HEIGHT` 落位与「此侧不存在」文案断言。
- ac-token-source-unchanged: `src/renderer/src/assets/main.css` 无 `@theme` token 新增或改动，祖先弱化不引入新的 `bg-diff-*` 颜色变量。

## 非目标

- 不改 `src/core/structured/diff.ts` / `parse.ts` 的对比语义、四态判定与 `diffSemantics` / `STATUS_TONES` / `HIGHLIGHT_STATUSES` 口径。
- 不改 `main.css` 的 `@theme` 语义色 / 尺寸 token，不新增配色体系或颜色变量。
- 不改 `locate.ts` 精确命中返回语义；不改变 `path` / `exact` 既有含义。
- 不让 `locateLine.findChangeAtLine`（反查）认 non-exact 范围，不扩大其命中面。
- 不把落位改成比例复制或「尽量带入视口」，继续 `startLine` 首行绝对落位。
- 不改快照格式、目录对比、导出格式、版本号与发布通道；不新增运行时 / 网络依赖。
- 不做浏览器 / 真机 / 桌面点选验收（属 product-qa），不做与弱化高亮无关的重构、命名整理或样式统一。
- 不清理、不 `git restore` / `reset` / `checkout` 主检出中与本集无关的既有暂存状态（只在交付说明报告）。

## 实现约束

- 弱化唯一来源：复用 `HIGHLIGHT_CLASSES` 的 added / removed / modified / conflict 四态 soft token；`data-highlight-status` 只出现在精确行，祖先行只用 `data-highlight-tone="ancestor"`，避免污染既有四态断言（既有用例用 `[data-highlight-status]` 计数）。
- 无祖先判定落在 core 纯函数（Node 环境可直接单测，零 DOM / Electron 依赖）；视图只消费该判定结果。
- 祖先落位沿用 `(range.startLine - 1) * SOURCE_ROW_HEIGHT` 与现有 clamp；「无祖先」时该侧完全不写 `scrollTop` / `rememberScroll`。
- 测试只允许改写 `marks the missing side with the fallback ancestor line and no highlight` 一条；其余既有用例（精确高亮、同步滚动、过滤保位、切 tab 保位、窗口化上限、token 映射）零放宽。
- 交付说明逐条列改动文件、新断言位置，以及同一 non-exact 用例改动前后的行为对比。
- `pnpm test` 与 `.munk/code-gates.json` 全绿；本项不做 UI self-test（`needSelfTest=false`）。
