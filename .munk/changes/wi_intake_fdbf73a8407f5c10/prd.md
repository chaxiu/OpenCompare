# 文本双栏对比：忽略空白差异、重载文件对、交换左右

## Scope

在现有双栏文本对比（`CodeView` 的 diff 模式，含目录树双击下钻出的文件视图）补齐三个高频动作。三者全部复用既有行模型（`diffLineTexts` 的 `rows` / `blocks`）、既有 `DiffPane` 与同步滚动、既有 `DiffRuler`，不重算目录、不新增窗口化特例、不新增 npm 依赖。

1. **忽略空白差异开关**（默认关）
   - 关闭时与当前行为逐位一致：严格逐字符比较（换行折叠仍由既有 `ignoreNewline` 开关决定，互不越权）。
   - 开启时只吞空白差异：比较时忽略 U+0020 空格与 U+0009 制表符（行尾空白、行内连续多余空白、制表符与空格互换都归入空白差异）；不改变换行与编码的既有归一/严格口径。
   - 行级状态、行内高亮、差异计数、差异指示条由同一次比较结果派生并同步更新。
   - 面板显示与状态栏仍使用左右各自从磁盘读取的原始文本与原始行数、换行/编码探针值，归一不得回写显示值。
   - 开关值属于会话状态：重载、交换左右、切走再切回同一会话后保持。
2. **重新加载当前文件对**（显式动作）
   - 只重读当前文件会话已记录的两侧路径（走既有 `PlatformPort` 读取/探针路径），不新建会话、不新建 tab、不重建行模型之外的东西。
   - 保留滚动位置（两侧 `scrollTop`）、当前目录过滤/折叠状态（若有父目录会话）与三个比较开关的值。
   - 任一侧文件已删除或不可读：就地显示中英双语可读提示，保留重载前全部结果（文本、行状态、差异计数、指示条），不空白、不崩溃、不提交半侧新结果。
3. **交换左右面板**（显式动作）
   - 对调左右面板内容与路径、状态栏左右原始行数与换行/编码探针、差异指示条与差异计数所依据的左右派生值。
   - 在目录下钻的文件视图里同样可用且可逆：连按两次回到原状；不触碰父目录会话、目录统计、快照内容与格式。
   - 只对调视图两侧与派生值，不复制文本、不改写文件、不写回磁盘。

## Acceptance Criteria

- ac-whitespace-default-off: 新打开/新挂载的文本对比中，忽略空白开关默认关闭（稳定选择器 `[data-code-switch="ignore-whitespace"]` 的 `aria-checked="false"`）；关闭状态下同一对输入的 `rows`（含 `leftSegments` / `rightSegments`）、`blocks`、`differenceCount` 与当前严格逐字符结果逐项相同。
- ac-whitespace-on-only-whitespace-equal: 开启后，一对仅含行尾空格、制表符与空格互换、行内连续多余空白的文件 `differenceCount === 0`，无任何非 `same` 行、无任何行内 changed 段、差异指示条无 marker；两侧面板文本仍逐字符保留原始空白（不 trim、不折叠显示）。
- ac-whitespace-on-real-diff-kept: 开启后，去除空格/制表符仍有非空白字符差异的行保持非 `same` 并参与计数；差异计数与关闭时对这些真实差异行的判定一致（空白差异不额外增加计数）。
- ac-whitespace-inline-only-real: 开启后，去除空格/制表符后两侧相等的行状态为 `same` 且不产生 changed 段；去除后不相等的行，其 changed 段中含至少一个非空白字符差异（changed 段文本去除空格/制表符后两侧不相等），纯空白差异本身不构成高亮依据。
- ac-whitespace-one-source: 开关切换后，差异计数、行状态/行内高亮与差异指示条来自同一次比较结果：计数为 0 时指示条无 marker 且无非 `same` 行；计数大于 0 时指示条出现 marker 且非 `same` 行数大于 0，不出现一处已更新、另一处滞留旧值的状态。
- ac-whitespace-status-raw: 切换忽略空白开关前后，状态栏左右行数与左右换行/编码探针值保持不变，且等于磁盘读取时的原始值；归一结果不得改写、回填或重算这些展示值。
- ac-switch-state-persists: 重载、交换左右、切到其他 tab 再切回同一会话后，三个比较开关（忽略换行、忽略编码、忽略空白）的 `aria-checked` 与操作前一致，不被重置为默认值。
- ac-reload-action-same-session: 触发显式重载后，会话 id、tab 数量与当前激活 tab 不变；两侧显示磁盘上的最新内容，两侧 `scrollTop`、父目录过滤/折叠状态（若有）与三个开关值保持操作前的值。
- ac-reload-no-directory-rescan: 重载不触发目录重扫：独立文件对会话不产生目录扫描/哈希调用；下钻文件会话的父目录 `DirectoryComparison`、目录统计与快照数据保持同一引用与同一数值。
- ac-reload-failure-keeps-result: 任一侧文件被删除或不可读时，就地渲染可读提示（同一提示键在 zh / en 两套字典均存在且非空，按当前语言显示），并保留重载前的两侧文本、行状态、差异计数与指示条 marker；界面不空白、不抛未捕获异常、不出现一侧新内容与一侧旧内容混排的半侧结果。
- ac-reload-readonly: 重载全程只调用既有读取/探针接口，不调用任何写文件接口；两侧磁盘文件字节不变。
- ac-swap-swaps-derived: 交换一次后，左右面板文本与路径标题、状态栏左右原始行数与换行/编码探针、差异行（`added` ↔ `removed` 镜像、左右文本对调）、差异计数与指示条 marker 区间同步对调。
- ac-swap-twice-restores: 连续交换两次后，左右路径、两侧原始文本、探针值、`rows` / `blocks`、差异计数与指示条 marker 序列与交换前逐项一致。
- ac-swap-drilldown-scoped: 在目录下钻文件视图交换后，父目录会话 id、目录统计、过滤/折叠状态、快照内容与格式均不变；返回目录视图得到与下钻前一致的目录结果，再次进入该文件对后可继续交换。
- ac-swap-no-write: 交换不调用写文件接口、不写回磁盘、不复制或改写文件内容；两侧磁盘文件字节保持不变。
- ac-i18n-parity: 新增用户可见文案在 `zh/files.ts` 与 `en/files.ts` 成套存在且非空（`Record<keyof typeof zhFiles, string>` 编译期约束保持），不存在仅中或仅英的键；切换语言后开关标签、重载/交换按钮、重载成功提示与重载失败提示随之切换。
- ac-gate-registration: 上述断言写入现有测试文件或数据驱动表（至少含 `CodeView.switches.test.tsx` 的 jsdom 覆盖，以及 `src/core/text` 的纯函数覆盖），并在 `.munk/code-gates.json` 中以扩展现有 gate 或单条数据驱动 gate 注册；不按验收点逐条新建测试文件，不为过关放宽/删除既有断言。
- ac-code-gates-green: `install` / `lint` / `typecheck` / `build` / `build-web` / `test` 及 `.munk/code-gates.json` 全部 gate 自绿，`test-debt-gate` 的既有行数/用例基线按现有机制收紧或登记增长，不降低门禁。

## Non-Goals

- 不改换行 / 编码归一与严格口径，不改 `describeNormalization` 现有语义、快照（`.ocsnap.json`）格式与导出格式。
- 不做语法高亮、未知扩展名探测、对比历史、转码写回；不新增 npm 依赖。
- 不为三项动作新增目录扫描、目录重算、窗口化分支或第二套行模型。
- 不改 CSV / 结构化视图与三向合并视图的交互（本项只覆盖文本双栏 diff 与目录下钻文件视图）。
- 不新增测试类 WorkItem，不为凑绿降低断言、跳过用例或放宽 `test-debt-gate` / 既有 gate 阈值。
- 不动已公开 tag / GitHub Release / 资产；本 worktree 不 push tag、不 dispatch、不改 Release。

## Implementation Constraints

- 空白语义落在 `src/core/text` 的纯函数中（零 DOM / Electron 依赖），由 `diffLineTexts` / `diffLineTextsWithFacts` 的既有 `ComparisonOptions` 扩展驱动；默认值只在纯函数一处定义，UI 不另写判定。
- 行内高亮使用同一次比较产生的 segments；面板文本、状态栏行数、探针值继续读取原始输入与既有 `probes`，不得把归一文本写回会话。
- 重载复用既有文件读取路径（`PlatformPort.probeTextFile` / 既有 `readSideFile*` 语义），先读两侧再原子提交；任一侧失败保留旧结果，不提交部分更新。
- 交换只交换会话/视图的左右侧与派生值（文本引用、路径、probes、stats），不复制文本、不触碰父目录 `DirectoryComparison`、不改快照；交换后重载必须按交换后的路径读取。
- 三项各自独立可回滚提交，不顺手重构无关组件；不新增依赖，不新增窗口化特例。
- 新增文案走 `src/renderer/src/i18n/messages/{zh,en}/files.ts`，zh 为键的源、en 必须一一对应；门禁与 product-qa 需要的稳定 `data-*` 选择器（如 `data-code-switch="ignore-whitespace"`、`data-code-action="reload"|"swap"`）保持稳定，后续不得重命名。
- 合入后由 product-qa 执行真实文件端到端复核；本工作项不跑 `self_test`。
- **L2 触发判定材料（交付说明必须逐条列出，不自作结论）**：实际触及路径需分别标注是否命中 IPC（重载的文件读取/探针调用）、窗口化（`@tanstack/react-virtual` / `WINDOW_THRESHOLD` 分支）、同步滚动（`syncScroll` / `scrollTop` 派生）、目录扫描/哈希（应为零）。由 Owner 按公司 2026-11-03 口径对最终合入 diff 重判是否安排 L2。

## Verification & Evidence

- 纯函数 / jsdom 证据：`pnpm test src/core/text/*.test.ts src/renderer/src/views/CodeView.switches.test.tsx`（具体命令以最终 gate 注册行为准）。
- 全量证据：`.munk/code-gates.json` 全量执行的命令与结果；日志落 `.munk/logs/`，交付记录写明每项 gate 的通过状态。
- 变更范围证据：`git diff --stat` 明确三项分别落点，且不含目录算法、快照/导出、发布脚本与已公开资产的改动。
- 真实文件端到端（删除/不可读、重载保留滚动与开关、下钻交换与回滚）留给合入后的 product-qa 任务，交付说明只给自动化证据与触及路径清单。
