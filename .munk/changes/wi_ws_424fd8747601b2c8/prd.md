# 文件对打开链路接入探测事实 + 状态栏左右原始值

## 范围

本项是 I#9「文本比较：换行符与编码归一」的接入层：把前序 `probe-core` 已交付的 `PlatformPort.probeTextFile` 探测通道接进**代码文件对**的打开链路，让会话固化左右两侧的原始探测事实，并在代码双栏 Diff 的状态栏分别呈现左侧 / 右侧的原始换行与原始编码。本项不含归一函数、不含「忽略换行 / 忽略编码」开关、不改比较判定。

1. **会话事实**（`src/renderer/src/workbench/session.ts`）
   - `WorkbenchSession` 新增代码文件对的固化探测事实：左右各一份 `{ path, encoding, newline, bytes, sha256 }`，**不复制正文**（正文已在 `pair` / codeBuffer 里，避免 5 MB 级文件重复驻留）。
   - 事实只在「该侧换成新文件」时更新；编辑工作副本、保存写回、归一结果、tab / 会话 / 下钻切换都不得改写。
2. **打开链路接入**（`directoryCompare.ts` / `Workbench.tsx` / `CodeView.tsx` / `fileIO.ts`）
   - 文件对唯一入口 `openFilePairSession` 改为用 `probeTextFile` 一次取得解码文本 + 原始事实；选择器、拖放、手工路径对话框、启动注入请求共用这一条路径。
   - 真实目录树下钻：按该侧真实路径探测；缺失侧不探测。
   - 快照侧下钻：沿用现有 `findSnapshotMount` / `readSnapshotContent` 解析，内联文本按内存 UTF-8 文本走同一探测纯函数；**绝不**用 `/snapshots/...` 虚拟路径调用 `probeTextFile`。
   - 内置样本：示例代码场景的左右正文与样本目录下钻的内存文本，同样按内存 UTF-8 文本确定性标注。
   - Diff 视图内「打开左 / 右文件」换开一侧时，只用该新文件的探测事实替换该侧。
3. **状态栏呈现**（`Workbench.tsx` / `StatusBar.tsx` / 词典）
   - 代码双栏 Diff 在状态栏 `status` 层新增四个条目：左换行、左编码、右换行、右编码；标签走中英词典，值使用固定技术字面量（`CRLF/LF/CR/Mixed/None`、`UTF-8/UTF-8 BOM/UTF-16LE/UTF-16BE/GBK/Unknown`），不翻译。
   - 缺失侧显示占位 `—`，不伪造编码。
   - 三向合并无左右语义，不渲染左右条目（不编造值）；切回双栏 Diff 恢复同一组值。
   - 不新增顶栏动作、不改 `SHELL_ENTRIES` 集合（仍 18 条）。
4. **回归与证据**
   - 目录对比四态、快照序列化、三向合并、`readTextFile` / `splitLines` 语义零变化。
   - 纯选择器单测 + jsdom 状态栏断言 + node 真实临时文件会话断言；`test-debt` 只通过 `growth[]` 声明增行。

## 验收

- ac-open-pair-probe-facts: 用 4 组真实临时文件（UTF-8 + CRLF、UTF-8 BOM + LF、UTF-16LE + CRLF、GBK + LF）调用 `openFilePairSession` 打开一对文件时，会话左右探测事实的 `path/encoding/newline/bytes/sha256` 逐字段等于对同一路径调用 `platform.probeTextFile` 的结果，且 `pair.left.text` / `pair.right.text` 等于探测返回的解码文本（BOM 已剥离、GBK 已解码）。
- ac-open-single-read-path: 选择器、拖放、手工路径对话框、启动注入请求四条入口打开同一对路径后，得到的探测事实与状态栏四值完全一致；实现里不存在第二条读盘 / 探测路径（四条入口都落到 `openFilePairSession`）。
- ac-drilldown-real-probe: 从真实目录树双击下钻代码文件后，会话左右事实等于对应左右真实路径的 `probeTextFile` 结果；左右值相互独立，不随目录节点四态变化。
- ac-drilldown-snapshot-probe: 从快照侧下钻内联代码文件后，左右中属于快照的一侧按内存 UTF-8 文本标注（编码 `UTF-8`，换行取内联文本实际终止符）；探测过程不对 `/snapshots/...` 虚拟路径调用 `probeTextFile`，也不出现 `Unknown` 或猜测值。
- ac-sample-memory-probe: 内置代码样本的左右正文按内存 UTF-8 文本探测：编码为 `UTF-8`，换行等于对该正文调用 `detectNewline` 的结果；该事实在会话构建时计算一次，渲染期不再重算。
- ac-status-four-entries: 代码双栏 Diff 状态栏按固定顺序出现四个条目「左换行 → 左编码 → 右换行 → 右编码」，值分别为该侧固化事实的 `newline` / `encoding` 字面量；条目位于 `data-shell-level="status"` 内。
- ac-status-missing-side: 下钻对某一侧不存在时，该侧两个条目显示 `—`，另一侧显示真实探测值；不会把空正文伪造成 `UTF-8` / `None`。
- ac-status-side-reopen: 在 Diff 视图换开左文件后，左换行 / 左编码变为新文件探测值，右换行 / 右编码逐字不变；换开右文件时对称成立。
- ac-status-edit-invariant: 在 Diff 视图执行逐块覆盖、编辑工作副本、重置、保存写回后，状态栏四个值文本与编辑前逐字相等；把工作副本改成任意内容也不改变读数（读数不从 `codeBuffer` / `pair` 正文反推）。
- ac-status-switch-invariant: 切换 tab、切换会话、下钻返回后重新下钻同一文件、样本在 Diff / 合并模式间往返后，同一文件对的四个值不变；这些操作不新增 `probeTextFile` 调用（首次打开后探测次数不再增长）。
- ac-status-values-literal: zh 与 en 两种语言下四个标签取自词典，值始终是固定技术字面量（如 `CRLF`、`UTF-8`、`—`），切换语言不改变值文本。
- ac-merge-no-fabrication: 三向合并模式不渲染左右换行 / 编码条目（无左右语义），也不出现编造值；切到双栏 Diff 后条目出现且值等于该会话 diff 文本的探测事实。
- ac-status-layer-only: 新增内容只属于 `status` 层：`SHELL_ENTRIES` 仍为 18 条、app 顶栏动作集合不变、不新增多余的 `view-toolbar` 行。
- ac-regress-directory-four-state: 目录对比四态（same / added / removed / modified）口径与既有目录对比测试零回归；本项不修改 `src/core/directory/**` 的判定逻辑。
- ac-regress-snapshot-format: 快照导入 / 导出 / 序列化格式不变，既有快照 round-trip 与 `serializeSnapshot` 测试零回归；会话探测事实不写入快照。
- ac-regress-merge: 三向合并既有全部断言零回归（`splitLines`、merge 模型与渲染不改）。
- ac-suite-green: `install` / `lint` / `typecheck` / `build` / `build-web` / `test` 及既有全部 code-gates 全绿；新增测试行数只通过 `test-debt` 的 `growth[]` 声明计入，不改 floor / 不放宽断言。

## 非目标

- 不做换行归一函数、不做「忽略换行 / 忽略编码」两个开关；本项不改变任何比较结果、差异行数或行内高亮（开关与归一属并行子项）。
- 不改 `splitLines`、三向合并、CSV 对齐、结构化语义比较。
- 不做转码写回 /「保存为原编码」；不改导出、报告、快照内容与格式。
- 不做目录层按编码判等，不改目录四态与目录会话统计口径。
- 不改 `readTextFile` / `readFileBytes` 语义；CSV / 结构化视图的选文件链路保持现状（不强行接入探测）。
- 不新增顶栏入口、不改 `SHELL_ENTRIES`、不新增全局快捷键、不新增首屏向导。
- 不做跨重启持久化；不做二进制 / 超大文件探测扩展；不引入网络、云服务或新依赖（运行时 `TextDecoder('gbk')` 已由前序验证）。
- 不在本项新增 `code-gates.json` 门禁条目（WorkSet 约定的单条可回归门由并行比较子项新增），可回归性由既有 `test` 门承担。
- 不 bump 版本、不改 README / CHANGELOG / release notes；`needSelfTest=false`。

## 实现约束

- **不要重复定义探测口径**：编码 / 换行联合类型与阈值只在 `src/core/text/probe.ts`；内存文本一律 `new TextEncoder().encode(text)` 后走同一 `probeTextBytes`，UI 与比较层不得另设 NUL 占比、GBK 区间或「猜测」逻辑。
- **探测事实不带正文**：会话只存 `path / encoding / newline / bytes / sha256`，避免与 `pair` 正文重复持有 5 MB 级内容；`sha256` 保留给后续「忽略编码关闭时按字节判等」子项使用。
- **一次读盘**：每侧打开只调用一次 `probeTextFile`；打开时把解码文本落到 `pair`，探测事实落到会话。切 tab、切模式、渲染状态栏都不得重新探测。
- **文件对唯一入口**：`openFilePairSession` 是代码文件对唯一的读盘 / 建会话函数；选择器、拖放、手工路径、启动注入请求不得各自读一遍文件。CSV / 结构化仍走既有 `readTextFile` 链路。
- **快照与缺失侧**：下钻探测必须先按 `findSnapshotMount` 判断挂载，快照侧读内联文本后走内存探测；`missingSidePath` 一类合成路径永不进入 `probeTextFile`，缺失侧事实为 `undefined`，状态栏渲染 `—`。
- **Diff / 合并可见性**：状态栏条目只在当前视图确实展示左右双栏 Diff 时渲染。`Workbench` 需按会话知道 `CodeView` 当前模式（可复用 `codeMerge` 的按会话存储方式，由 `CodeView` 上报模式），保证 tab 卸载重挂后不会出现「合并视图却显示左右值」的陈旧状态。
- **状态栏读数单源**：提供一个只接收「会话固化事实 + 是否双栏 Diff」的纯函数产出四个条目；不得把 `codeBuffer`、`pair.text`、`composition` 或归一结果作为输入，这样后续开关接入时结构上就无法改写这四个值。
- **样本事实在构建期算一次**：内置代码样本的左右事实在 `loadSampleSessions` 的 code 分支由 `CODE_SCENE.diff` 正文算一次；样本目录下钻复用目录侧解析结果，不得在渲染函数里重复编码。
- **文案**：新增状态栏标签键同时写入 `i18n/messages/zh/shell.ts` 与 `en/shell.ts`，键集保持中英对等；值不做本地化。
- **回归边界**：不修改 `src/core/directory/**`、`src/shared/snapshot*`、`src/core/text/{diff,lines,merge}.ts`；`readTextFile` / `readFileBytes` 的调用点除代码文件对入口外不动。
- **门禁与测试债**：新增测试会抬高行数 / 用例数，必须按既有机制在 `.munk/baseline/test-debt.json` 的 `growth[]` 声明 `metric / from / to / reason / addedCases`（前序 `probe-core` 已建立该通道），禁止直接改 `floors` / 手工放宽；`src/test/sharedHarness.tsx` 仍受 400 行硬预算约束，新夹具优先放进测试文件或复用既有 `TEXT_PROBE_CASES`。
- **证据形态**：真实临时文件由测试自身用 `Buffer` 写入（四个编码 × 换行组合），断言记录可复现的生成方式、字节数与指纹；jsdom 用可注入的 `probeTextFile` 返回固定事实验证状态栏，node 用 `ipcPort` + 真实磁盘验证会话事实，两者共同覆盖「真实路径打开与下钻显示正确左右原始值」。
- **已知口径冲突**：`workbench` 基线中旧的 `ac-statusbar-unchanged`（状态栏条目集合不变）与本项有意冲突，Delivery 应随本项更新该域口径，而不是靠隐藏条目规避。
