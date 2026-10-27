# 跨场景 App 级回归矩阵与六门禁

## 范围

在既有 App 级测试基建（`src/renderer/src/App.test.tsx` 的 `scriptedPort` / `dropPaths` / 「打开文件」「打开文件夹」/ 新建对比对话框 / `sessionTabs`）上补齐跨场景回归矩阵，逐项断言 tablist 内每个 tab 的**标题与副标题**：

1. **路径 A→B 重建（同名文件不同目录）**：用「新建对比」对话框先以文件对 A（两侧同名文件位于不同目录）建会话，再以文件对 B（同样同名、目录不同）建会话；两个 tab 并存，B tab 的标题为文件名、副标题为 B 的两侧完整路径且不含 A 任一侧路径，A tab 保持 A 自己的两侧路径。
2. **视图内打开左右文件后 tab 更新**：文件会话内依次在视图「打开左文件」「打开右文件」，会话保持单个 tab；tab 标题按同名/异名规则跟随新两侧文件名，副标题为两侧新路径且不含任一侧旧路径；切到其它 tab 再切回仍为新路径。
3. **目录会话下钻文件级再返回**：目录会话下钻文件得到文件 tab，标题为该文件名、副标题为两侧真实路径；点「返回上级目录视图」后目录 tab 标题/副标题恢复两侧目录名与根路径、不残留文件名，下钻 tab 自身文案不变。
4. **目录 / 文件 / 下钻多 tab 混合切换与关闭邻居**：三类会话并存时连续切换，每个 tab 的标题与副标题只属于自己、不含其它会话路径；关闭非活动邻居 tab 后，剩余每个 tab 的标题与副标题与关闭前逐项相同，活动 tab 不变。

矩阵暴露的残留缺陷在本项内修到代码闭环；不放宽既有实现或断言来消除失败。六项门禁（install / lint / typecheck / build / build:web / test）全绿。

## 验收

- ac-matrix-per-tab-title-subtitle: 矩阵的每条 tab 断言都分别读取 tablist 中该 tab 的标题元素与副标题元素做逐项相等比较；不得只用整个 tab 的合并 `textContent` 包含判断，也不得用跨会话 `getAllByText` 代替 tablist 内断言。
- ac-rebuild-a-to-b-same-name: 经「新建对比」对话框依次提交文件对 A（`/memory/one/report.md` ↔ `/memory/two/report.md`）与文件对 B（`/memory/three/report.md` ↔ `/memory/four/report.md`）后，tablist 恰有 2 个 tab；B tab 标题为 `report.md`、副标题同时包含 B 两侧完整路径且不包含 `/memory/one/report.md` 或 `/memory/two/report.md`；A tab 标题仍为 `report.md`、副标题含 A 两侧路径且不含 B 任一侧路径；B 为 `aria-selected="true"`。
- ac-view-open-both-sides: 文件会话内在视图依次「打开左文件」与「打开右文件」为新路径后，tablist 仍只有原会话一个 tab（session 身份不变、无新增同名 tab）；该 tab 标题为两侧新文件名（同名 → 文件名；异名 → `左名 ↔ 右名`），副标题同时含两侧新路径且不含任一侧旧路径；切到另一 tab 再切回，标题与副标题仍为新路径。
- ac-drilldown-tab-then-return: 目录会话下钻 `engine.ts` 后，下钻 tab 标题为 `engine.ts`、副标题含 `<left root>/src/core/engine.ts` 与 `<right root>/src/core/engine.ts`；点「返回上级目录视图」后目录 tab 的标题为两侧目录名（`baseline ↔ candidate`）、副标题为两侧根路径且不含 `engine.ts`，下钻 tab 的标题与副标题保持不变。
- ac-mixed-tab-switch-isolation: 文件、目录、下钻三个 tab 并存时，依次点击每个 tab（含一轮往返），每次点击后 tablist 中每个 tab 的标题与副标题都与各自会话事实一致，且任一 tab 的标题+副标题不包含其它会话的路径片段。
- ac-close-neighbour-labels-stable: 在三个 tab 并存且当前活动为中间 tab 时关闭一个非活动邻居，tablist 剩余 tab 数与预期一致；剩余每个 tab 的标题与副标题字符串与关闭前逐项相等，活动 tab 的 `aria-selected` 不变、可见面板内容不变。
- ac-matrix-no-weakened-assertions: 新增矩阵全部落在既有测试文件与既有夹具（`scriptedPort` / `dropPaths` / 打开文件 / 文件夹 / 新建对比 / `sessionTabs`）内，不新增测试文件、测试目录或依赖，不引入 `it.skip` / `it.only` / 缩短超时 / `try-catch` 吞断言；若矩阵暴露残留缺陷，产品侧修到通过，断言路径与期望值保持本 prd 定义的严格口径。
- ac-six-gates-green: `install` / `lint` / `typecheck` / `build` / `build:web` / `test` 六项门禁全部成功，`pnpm test` 包含上述矩阵用例且无新增跳过项。

## 非目标

- 不改对比 / 合并算法、四态语义、差异语义色、快照格式、目录报告与发布通道；不碰 `package.json#version`、`CHANGELOG`、`README*`、`docs/release-notes/**`。
- 不改产品范围与 UI 版式：不新增面板 / 弹窗 / 工具栏按钮，不动 `SessionTabs` 结构与窄屏副标题的响应式行为。
- 不重做或重写上一 WI 的 `describeSession` / `replaceFilePairSide` / 函数式 `setSessions` 方案，除非矩阵暴露其残留缺陷并需要最小修正。
- 不做浏览器 / 真机 / 桌面点选验收，不提交 UI 自测；不新增 E2E 框架。
- 不顺手修与本矩阵场景无关的既有 flaky 测试、覆盖率目标或测试重构。
- 不改变「目录换侧是追加新 tab 还是原位替换」等既有产品语义。

## 实现约束

- 断言口径：`SessionTabs` 每个 tab 内标题为第一个 `font-medium` span、副标题为紧随其后的 `text-2xs` span；矩阵应在测试文件内加一个局部 helper 分别返回 `{ title, subtitle }`，供每条用例逐项比对。
- 复用既有夹具与场景常量（`DIRECTORY_SAMPLE_PATHS`、`LEFT_ENGINE` / `RIGHT_ENGINE`、`createWebPlatformPort`、`scriptedPort`、`dropPaths`、`sessionTabs` 区域现有 helper），不复制新的测试基建。
- 先红后绿：矩阵断言先对当前实现运行确认其能捕获「冻结旧文案 / 视图局部 state」回归（若当前全绿，需临时把对应派生或回写回退到旧行为证明相应断言确实失败，再还原）；若暴露残留缺陷，先保留失败断言再修实现，不允许反向放宽断言或改期望路径来通过。
- 新路径文件在 `createWebPlatformPort` 内存盘中先用 `writeTextFile` 写入正文；目录类场景继续用 `@shared/fixtures` 的 `DIRECTORY_SAMPLE_PATHS`，不造第二套目录样本。
- 新增断言都使用既有 `waitFor` / `findByRole` 等待异步读盘完成，不靠固定延时；不改变既有用例的语义与顺序。
