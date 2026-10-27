# 会话文案单一真源：新建/换路径/下钻后 tab 实时跟随

## 范围

修复「对比会话 tab 标题 / 路径副标题滞留创建时旧文案」。tab 文案在渲染期由会话当前真实左右路径派生，任何换路径动作都先落到会话事实，再驱动 tab 与面板同帧一致。

覆盖入口（全部必须跟随）：

1. 新建对比（文件对 / 目录对），含两侧同名文件位于不同目录。
2. 目录会话内换左 / 右目录（`pickDirectory`）。
3. 文件会话内「打开左 / 右文件」——代码、CSV/TSV、JSON/YAML 三个视图。
4. 目录会话下钻打开文件对，以及从下钻视图返回目录视图。
5. 同 id 原位刷新（sync 后重新对比）。
6. 多 tab 并存切换。

涉及落点（现状已核实）：`src/renderer/src/workbench/sessionDisplay.ts`（目录会话直接读冻结的 `session.title/subtitle`）、`directoryCompare.ts`（创建时把文案写死进会话）、`Workbench.tsx`（`upsertSession`/`replaceSession`/`closeSession` 用渲染闭包 `sessions` 整体覆盖；视图内换文件未回写会话）、`CodeView.tsx`/`CsvView.tsx`/`StructuredView.tsx`（换文件只改视图局部 state）。

## 验收

- ac-directory-tab-follows-new-roots: 先用目录路径 A 建会话，再用目录路径 B 新建对比后，激活 tab 的标题为 B 的左右目录名、副标题为 B 的左右根路径；A tab 仍显示 A 的目录名与根路径，两 tab 不互相污染。
- ac-file-pair-title-derived: 用两侧同名但位于不同目录的文件（如 `.../a/report.md` ↔ `.../b/report.md`）新建对比，tab 标题为该文件名，副标题同时包含两侧完整路径；再开另一对同名不同目录文件，两个 tab 各自显示自己的路径。
- ac-side-swap-follows: 目录会话内换一侧目录成功后，可见 tab 的副标题为新一侧根路径 + 未改侧原路径，不残留被替换的旧侧路径。
- ac-code-view-open-writes-session: 代码会话内「打开左文件」为新路径后，tab 标题与副标题立即显示新路径；会话事实（`adhoc.pair.left.path` 与代码工作副本路径）均为新路径且正文为新文件内容；切到其它 tab 再切回，面板路径与内容仍是新文件。
- ac-csv-view-open-writes-session: CSV/TSV 会话内打开一侧文件后，tab 副标题与面板同时显示新路径（含按新正文重算的行数），切 tab 往返不回到旧文件。
- ac-structured-view-open-writes-session: JSON/YAML 会话内打开一侧文件后，tab 副标题与面板同时显示新路径与格式，切 tab 往返不回到旧文件。
- ac-stats-follow-new-pair: 视图内换文件后状态栏/会话统计按新正文重算，不残留旧文件的行数。
- ac-drilldown-tab-paths: 目录会话下钻打开文件对后，下钻 tab 标题为该文件名、副标题为两侧真实路径；返回目录视图后目录 tab 副标题恢复其根路径，下钻文案不残留到目录 tab。
- ac-missing-side-kept: 一侧缺失的下钻会话，副标题仍走既有缺失侧字典文案（相对路径 + 缺失标记），标题只显示文件名、不出现内部 `::opencompare-missing-*` 后缀。
- ac-async-commit-no-clobber: 一次读盘打开文件对尚未返回期间另一会话完成提交，收尾后两个会话都存在且文案各自正确，不出现旧快照覆盖导致会话丢失或文案回退。
- ac-inplace-refresh-sync: 同 id 原位刷新（sync 后重新对比）后 tab 保持原 id 与位置，标题/副标题为新对比结果的左右根路径，视图显示新对比树而非旧树。
- ac-sample-labels-unchanged: 四个内置样本 tab 仍按 session id 走字典文案，中英文切换时标题/副标题随字典变化，不受派生逻辑影响。
- ac-multi-tab-isolation: 文件会话、目录会话、下钻会话并存时连续切换 tab，每个 tab 的标题与副标题只属于自己；关闭相邻 tab 后剩余文案不变。
- ac-vitest-regression: 上述场景全部落成 vitest 断言（先红后绿，复用既有 App/纯函数夹具），仓库 `code_gates` 全绿。

## 非目标

- 不改对比 / 合并算法、四态语义、差异语义色、目录树交互与状态栏版式。
- 不改快照格式、目录报告内容、发布通道；不碰 `package.json#version`、`CHANGELOG`、`README*`、`docs/release-notes/**`。
- 不做 Issue #5 其余条目（扩展名白名单、主题、重载、minimap、忽略空白、交换左右、记住上次目录、着色定制、十六进制、语法高亮）。
- 不新增 UI 面板 / 弹窗 / 工具栏按钮；不改 `SessionTabs` 版式与窄屏副标题的 `hidden lg:inline` 响应式行为。
- 不改变「目录换侧是追加新 tab 还是原位替换」的既有产品语义——本项只要求文案不残留、不串台。
- 不新增测试基建或测试目录，不引入新依赖，不放宽 ESLint / tsconfig 规则。

## 实现约束

- 会话只存事实（目录会话：`directory.leftRoot/rightRoot/leftName/rightName` 与 `sides`；文件会话：`adhoc.pair` 左右 path/text、`delimiter`/`format`/`tables`、`codeBuffer`）；tab 标题与副标题在渲染期由这些事实派生。`title`/`subtitle` 字段可保留作兼容，但不得再作为 tab 文案的唯一来源。
- 派生规则保持现有可读形态：文件对两侧同名 → 标题为该文件名，否则 `左名 ↔ 右名`；目录会话标题为 `左目录名 ↔ 右目录名`，副标题为 `左根 ↔ 右根`；缺失侧继续走 `missingSidePath` 与既有 missing 字典 key。
- 内置样本仍按 session id 走字典 key；i18n 通路、`renderSessionText` 的纯函数形态不变。
- `describeSession` 保持纯函数、每次渲染现算，不得深拷贝目录树或文件正文。
- 任何改变左右路径的动作都必须落到会话事实，不得停在视图局部 state；不得用「另开一个同名 tab」掩盖换路径。
- 会话列表的所有写入统一走函数式 `setSessions`；异步流程（读文件、目录扫描、比较）结束后不得用闭包里的旧 `sessions` 快照整体覆盖期间的更新。
- 同 id 原位替换后视图与 tab 必须同帧一致（重挂 key 或受控同步，二选一，由实现决定）。
- 视图内打开文件后的回写与 `codeBuffer` 走同一提交路径，避免路径/正文出现两套真源；回写不得在每次按键编辑时额外深拷贝正文。
- 回归测试复用 `src/renderer/src/App.test.tsx` 的 `scriptedPort` / `dropPaths` 与 `sessionDisplay.test.ts`、`sessionStore.test.ts`、`directoryCompare.test.ts` 现有夹具，不新建测试基建。
