# 模板归位计划 / 执行 / 复核纯核与 mtime 原子写

## 范围

在 `@core/directory` 内把现有 `matchTemplate` 的结果归一成一份**可渲染、可执行、可复核**的模板归位计划，作为后续真实入口 UI 的唯一数据源：

- **计划（plan）**：把匹配结果展开为「模板槽位相对路径 → 源相对路径 / 目标绝对路径」的逐条清单，保留 `matched` / `missing` / `conflict` / `unused` 四类结果与分区计数；每条带源内容 sha256、源 `modifiedMs`、是否覆盖输出根既有文件、是否默认勾选。
- **默认勾选口径**：`matched` 且目标位置无既有文件 → 默认勾选；`conflict`（内容不一致或同名多候选）→ 默认不勾；将覆盖输出根既有文件的条目 → 默认不勾；`missing` / `unused` 永不进可执行清单。
- **显式选择解析**：把「勾选的相对路径 + 冲突候选选择」解析成**唯一**可执行清单，计数、可执行数、Apply 写入集合都读同一份解析结果。
- **执行**：只写已选条目，按模板 A 的相对结构建必要父目录（不为模板空目录建空目录），每条落盘时带源 `modifiedMs`，并把源 sha256 一并绑定到写入记录。
- **复核**：逐条比对磁盘上的存在性、重算 sha256、`mtimeSec`（秒口径），与源不一致时给出可区分的失败原因。
- **Electron 写路径**：`writeTextFile` 保持原子写（同目录临时文件 + rename）并在失败时清理临时文件，`modifiedMs` 透传到落盘文件；本子项只做回归钉住，不改写既有实现。

保持纯函数 + 注入 IO（`readTextFile` / `writeTextFile` / `ensureDirectory` / `listDirectory`），Node 环境可直接单测，不新增磁盘抽象、不新增依赖。

## 验收

- ac-four-outcomes-one-to-one: 计划把匹配结果的每个模板槽位恰好展开为一条条目并归入 `matched` / `missing` / `conflict` / `unused` 之一；分区计数与各自条目数组长度相等，槽位总数等 模板文件数，条目 `targetPath` 等 `joinRelativePath(targetRoot, relativePath)`。
- ac-default-unchecked: `matched` 且目标位置无既有文件默认勾选；`conflict` 默认不勾；目标相对路径已在注入的输出根既有文件清单中时默认不勾；`missing` / `unused` 默认不勾且永不出现在可执行清单中。
- ac-resolve-unique-manifest: 解析函数只把「已勾选的 matched」与「已勾选且候选在其候选集内的 conflict」放进可执行清单；未勾选、conflict 未选候选、选了候选集之外的路径、`missing` / `unused` 一律不进入；同一相对路径重复勾选只产生一条；同一源文件被两个槽位选中时仅 `relativePath` 排序第一条进入、其余计入拒绝数；输出顺序按 `relativePath` 稳定排序。
- ac-counts-same-source: 计划分区计数、可执行数与执行实际写入数来自同一次解析结果——可执行清单长度等 写入记录长度等 执行返回的 `written`，未勾选条目的目标路径不出现任何写入调用。
- ac-mtime-sec-preserved: 每条落盘调用都以源 `modifiedMs` 作为第三参传入；复核以秒口径比较（向下取整），源与目标的 `mtimeSec` 相等即通过，不因同一秒内的亚秒差异误判；预先构造的 mtime 差异大于一秒时被报告为 `mtime` 不一致。
- ac-sha256-reverified: 复核逐条重读目标文件并按同一 `sha256Hex` 口径重算，与计划源 sha256 一致才计为通过；篡改某个已写文件内容后该条报 `hash` 不一致且 `verified` 数下降；删除某个已写文件后该条报 `missing`。
- ac-overwrite-not-silent: 计划条目对「目标已存在文件」与「目标位置被目录占用」分别给出可区分标记，被目录占用的条目即使被勾选也不进入可执行清单（计入拒绝数），不静默覆盖或抛裸错误。
- ac-source-drift-guard: 计划完成后源内容发生变化（执行期重读的 sha256 与计划不一致）时，该条目零写入并计入失败条目，其余已选条目照常执行，返回结果可区分成功与失败条目。
- ac-cancel-zero-write: 执行前 `signal` 已 abort 时抛 `OperationCancelledError` 且 `writeTextFile` / `ensureDirectory` 调用数为 0（磁盘无任何新文件、无新目录）；执行中途 abort 时停止后续条目，正在写的条目不留半成品、不残留 `.tmp`。
- ac-atomic-write-kept: Electron `writeTextFile` 仍是「同目录临时文件 + rename」原子写，成功与失败路径都不在目标目录残留 `*.tmp`（既有 `electron-platform.test.ts` 断言保持绿）；本子项不改写该实现，除非为透传 `modifiedMs` 所必需。
- ac-no-regression: `matchTemplate` / `matchTemplateSlots` / `extractTemplateMatches` 既有导出与语义保留，`src/core/directory/template.test.ts`、`sync.test.ts`、`electron-platform.test.ts` 全部保持绿，`pnpm lint` / `pnpm typecheck` / `pnpm test` 通过。

## 非目标

- 不做真实入口 UI（B 根 / 输出根选择器、拖拽、键入路径）、不做 Dry-run 清单渲染与勾选交互、不做冲突候选控件——由后续子项接线，本子项只交付纯核契约。
- 不做 i18n 文案、设置页「示例 / 调试」分区、样本入口归位。
- 不做 1,000+ 条目窗口化与性能调优（纯核需保持线性，但不新增渲染层工作）。
- 不新增 / 修改 `.munk/code-gates.json` 门禁条目与专项 e2e 证据（由 WorkSet 收口子项负责）。
- 不改目录对比四态口径、快照格式、HTML 报告 / 导出、同步镜像与回滚逻辑、发布通道。
- 不做路径占位符模板、正则 / 脚本模板引擎、双向同步、冲突合并、实时监听、远端。
- 不做已写条目的回滚撤销（取消 / 失败只保证未选条目零写入、当前条目无半成品）。
- 不新增 npm 依赖，不在 `PlatformPort` 之外新造第二套磁盘抽象或新增平台方法。
- 不改 matcher 的「文件名 + 文本 sha256」匹配口径，不引入二进制模板支持。

## 实现约束

- 纯核放在 `src/core/directory/`（`template.ts` 及必要相邻纯模块），禁止 `electron` / `react` / DOM / `node:fs` 导入；IO 一律注入回调。
- 复用既有 `joinRelativePath`（`./sync`）、`sha256Hex`（`./hash`）、`OperationCancelledError`（`../io`）与 `ScannedNode.modifiedMs`，不复制第二份实现。
- **同源判定**：必须只暴露一个解析函数产出可执行清单，计划分区计数、可执行条数、执行写入集合与后续 UI 计数共用它；不得在计划、界面、执行器各留一份内联判定（AGENTS.md §9）。
- 覆盖检测的数据来源是调用方注入的「输出根既有文件相对路径清单」，计划构建本身不做磁盘访问，从而保证 Node 下可直接单测。
- mtime 读取走既有 `PlatformPort.listDirectory` 返回的 `modifiedMs`（或注入的等价回调），不新增 `statMtime` 类平台方法。
- `TemplateMatch` 允许新增 `modifiedMs` 等字段以携带源时间，但不得改变既有字段语义；`extractTemplateMatches` 现有行为与测试保持在绿。
- Electron `writeTextFile` 已是原子写（`writeFileAtomically` + `backfillModifiedMs`）：不改架构、不改错误映射，仅保证新纯核调用它时传 `modifiedMs`；如需补断言，只做增量。
- 文本口径：计划与复核沿用 matcher 的文本 sha256；二进制字节保真不在本子项扩展。
- 断言写进 `src/core/directory/template.test.ts`（可新增相邻测试文件），用注入的 fake FS 覆盖默认不勾、同源计数、sha256 / mtimeSec 复核、取消零写入、源漂移跳过。
