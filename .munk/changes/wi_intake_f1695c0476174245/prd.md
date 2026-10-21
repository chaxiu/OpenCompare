# 目录对比跨相位进度归零修复

## 范围

修复 `src/core/directory/compare.ts` 的进度上报契约：`DirectoryProgress` 的 `files` / `bytes` 目前是**相位内**累计（digest 相位从 0 起算），`Workbench.tsx` 直接把它当整条流水线进度渲染，导致真实大目录（1,383,203 文件）从「扫描目录」切到「校验内容」时界面数字从 1,383,203 回落到首个 digest 块（实测 960）。

本项要做：

1. 进度事件同时表达**流水线累计值**与**相位内增量**：切换相位时累计文件数 / 字节数不清零、不回退；digest 相位以扫描末态为基数，只叠加本相位的真实增量。
2. 相位标识继续随事件传递（`'scan' | 'digest'`），工作台 `role=status` 进度条按相位分段文案：扫描相位显示「正在扫描目录 + 已扫描 N 个文件」，校验相位显示「正在校验内容 + 已校验 M 个文件」，并展示不回退的累计值。
3. `src/core/directory/compare.test.ts` 增加覆盖「多批扫描 → 多批 digest 切换」「相位切换不归零」「末态计数等于真实总量」「取消不提交半棵树 / 半份缓存」的 vitest 断言；`App.test.tsx` 进度条用例补「切换后不回退」断言。新增断言在旧实现下必须失败。
4. 保持 `pnpm lint` / `typecheck` / `build` / `build:web` / `test` 全绿。

## 验收

- ac-scan-totals-real: 扫描相位末态事件的 `files` / `bytes` 分别等于左右两侧真实文件总数与文件大小总和（以测试内 fake fs 的真实统计为准）。
- ac-progress-monotonic: 一次包含多批扫描与多批 digest 块结算的对比中，按时间顺序收集到的全部 `DirectoryProgress` 事件满足 `files` 与 `bytes` 均单调不减，扫描→校验切换处不例外。
- ac-digest-does-not-reset: 首个 digest 事件的 `files` ≥ 最后一个 scan 事件的 `files`，`bytes` ≥ 最后一个 scan 事件的 `bytes`；不得出现 digest 事件从 0 或从单个 digest 块大小起算。
- ac-phase-counters: 每个事件都携带 `phase`，且同时暴露「相位内增量」与「流水线累计」两组计数；digest 相位起点相位内文件数为 0，digest 末态相位内文件数等于真实待校验候选文件数，末态累计 `files` = 扫描末态 `files` + 相位内文件增量（同构于 `bytes`）。
- ac-ui-phase-copy: `role=status` 进度条在扫描相位文本含「正在扫描目录」与已扫描文件数，在校验相位文本含「正在校验内容」与已校验文件数（相位内增量），两相位都展示累计已处理字节。
- ac-ui-no-regress: 同一对比运行中，进度条从扫描相位切到校验相位后，其展示的累计文件数与累计已处理字节数不小于切换前最后展示值（旧实现下的「1,383,203 → 960」形态必须失败）。
- ac-cancel-no-partial-commit: 分别在扫描相位与校验相位取消后：不新增 / 不改动会话与主视图，取消提示与现有行为一致；被中断的 digest 块内文件不写入缓存，已结算块写入的缓存条目字段完整（size / modifiedMs / hash 齐全）。
- ac-no-timer-fabrication: digest 块未结算前不产生 digest 进度事件，对比结束后不再有事件（保持现有行为，不得用计时器插值补进度）。
- ac-gates-green: `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm build:web`、`pnpm test` 全部通过。

## 非目标

- 不改四态语义（same / added / removed / modified）与跳过项计数口径。
- 不改扫描、哈希、取消的主进程语义、`cancelOperation` 契约与 operationId 透传。
- 不改结果树窗口化（虚拟滚动）、会话发布模型与对比结果结构。
- 不新增依赖，不改 IPC 通道白名单，不新增跨进程事件通道。
- 不改其他视图（代码 / CSV / JSON-YAML）的进度与文案，不调整视觉风格、token 或布局结构。
- 不引入基于计时器的进度插值、百分比推算或预计剩余时间。
- 不做进度持久化 / 断点续跑 / 跨会话恢复。
- 不做实机、浏览器或桌面点选验收（由 product-qa 另排）。

## 实现约束

- 唯一受影响的上报点：`src/core/directory/compare.ts` 的 `DirectoryProgress`（scan 侧 `scanDirectory` + `createScanProgressMerger`，digest 侧 `digestContentCandidates`），两个调用方 `compareDirectories` 与 `snapshot.ts:compareDirectorySides` 需同步；渲染侧仅 `src/renderer/src/workbench/Workbench.tsx` 的进度状态与进度条文案。
- 语义约定：`files` / `bytes` 表示整条流水线累计（跨相位单调不减）；相位内增量用独立字段表达（建议 `phaseFiles` / `phaseBytes`），digest 相位基数取扫描末态累计值，不得在 digest 内重新从 0 计数。
- digest 相位基数须来自 `createScanProgressMerger` 已累计的扫描总量（两路 side 合并后的值），不要用 `ScannedTree` 二次遍历重算。
- 现有文案锚点保留：扫描「正在扫描目录 / 已扫描 N 个文件 / 已处理 X」，校验「正在校验内容」；`role=status`、`aria-label="目录对比进度"`、取消按钮与 `cancelling` 态不变。
- 测试落点：`src/core/directory/compare.test.ts`（核心契约，L1/L2）与 `src/renderer/src/App.test.tsx`（进度条按相位文案与不回退）；沿用现有 `createFakeFs` / `digestTree` / gate promise 手法，禁止依赖真实文件系统计时。
- 现有断言 `digestEvents(events).map(files) === [2,4,6]`（相位内）与 `{ phase:'digest', files:2, bytes:10 }` 属于旧「相位内计数」口径，随契约变更按新语义更新，但「每块一次事件、块未结算不报」的行为必须保留。
