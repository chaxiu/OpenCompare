# 目录同步预览：勾选状态与「本次将执行」摘要同源（修法①）

## Scope

修复目录同步预览弹窗里「摘要计数 / Apply 可执行态 / 无执行项原因句」与删除勾选状态不同源的真缺陷（公司裁定必改，非 known issue）。

实测证据（`projects/ops_df43e423451170fd/.munk/runs/trun_74c77c28f3471322/evidence/leg3/checkbox.json`）：勾选 1 个待删除项后 Apply 变为可点（`applyDisabledAfterCheck=false`），同屏摘要仍是 `This run: 0 copy · 0 overwrite · 0 delete · 0 link time aligned`，随后 Apply 实际删了 1 项；组头 `Files to delete (mirror) 1 item` 与摘要 `0 delete` 并存。

采用**修法①**（已拍板）：预览摘要按当前勾选实时统计，勾选后 delete 计数 = 已勾选数，取消回落到 0；不再显示与勾选无关的常量。**不采用修法②，禁止两种语义并存。**

落地范围（三个文件域，均沿用既有模式，不新建组件/模块）：

- `src/renderer/src/workbench/directoryOps.ts`：把「本次将执行」四类计数（copy / update / delete / 对齐链接）与「可执行条目数」收敛到**一个纯函数**，与现有 `canApplySyncPreview` 同域；后者保留导出并委托给它（`sync-real-gate` 已 import，签名不破坏）。
- `src/renderer/src/views/DirectorySyncDialog.tsx`：摘要、Apply `disabled`、`noExecutable` 原因句三处全部读同一函数结果；删除分组标题在计划总数之外暴露已勾选数（如「待删除（镜像）1 项 · 已选 1」），新增 / 覆盖两组沿用计划数。
- `src/renderer/src/i18n/messages/{zh,en}/directory.ts`：新增「已勾选数」所需字典键（zh / en 同批）。
- `src/sync-real-gate.test.ts` 与 `src/renderer/src/views/directorySyncDialog.test.tsx`：把口径钉成断言（不得只改文案）。

现状事实（Intake 已核对，供 Coding 定位，不作为新增需求）：摘要目前用 `deletePaths.length` 拼串、`executable` 走 `canApplySyncPreview`、`guidance` 走 `syncPreviewGuidance`、总条目在组件内 `plan.totalCount + alignments.length` 内联计算 —— 四处各自推导，且删除组头只显示 `plan.delete.count`，是本次要收敛的根因面。

## Acceptance Criteria

- ac-single-predicate: `src/renderer/src/workbench/directoryOps.ts` 导出单一纯函数，输入 `SyncPreview` + 当前 `deletePaths`，输出 copy / update / delete / align 四类计数与 `executable`；`canApplySyncPreview(preview, deletePaths)` 仍导出且返回值与该函数输出的 `executable` 完全一致（同一输入下逐例相等）。
- ac-summary-reads-same-result: 摘要四类计数、Apply `disabled`、`noExecutable` 原因句在同一个 preview + 同一 `deletePaths` 下与上述纯函数输出逐项一致；组件内不再存在独立的 `plan.copy.count` / `deletePaths.length` / `totalCount + alignments.length` 拼装或第二份可执行判定。
- ac-summary-delete-follows-selection: mirror 预览（`plan.delete.count = 1`、无 copy/update、无待对齐链接）默认摘要含 `delete = 0`；勾选该唯一待删项后**同一视图**摘要 `delete = 1`；取消勾选后回落 `delete = 0`；三态下 copy / update / align 计数恒为 0。
- ac-apply-state-sync: 同一 preview 下，未勾选时 Apply 按钮 `disabled` 且「无执行项」原因句可见；勾选 1 项后 Apply 可点且原因句消失；取消后回到 `disabled` + 原因句可见。摘要文本与按钮可用态在每次切换后同屏一致（不得出现「Apply 可点 + delete 0」或「Apply 禁用 + delete > 0」组合）。
- ac-group-header-checked: mirror 删除分组标题同时给出计划总数与已勾选数（zh 形如「待删除（镜像）1 项 · 已选 0」/「… · 已选 1」，en 形如「Files to delete (mirror) 1 item · 0 selected」/「… · 1 selected」），未勾选显示 0 已选；新增与覆盖分组标题仍为计划数（不受勾选影响）。
- ac-real-disk-four-state: `src/sync-real-gate.test.ts` 新增真实磁盘用例，按默认未勾 / 勾选 1 / 取消 / 执行成功后四态，断言「勾选态 → 纯函数 delete 计数」= 「执行后 `applySyncPreview` 返回的 `deleted`」= 「真实磁盘上消失的条目数」；默认与取消态执行时落盘删除数为 0。
- ac-completion-counts: 执行成功后 `SyncApplyResult` 的 `copied` / `updated` / `deleted` / `alignedLinks` 等于本次实际执行值，并与执行前勾选态纯函数输出的 copy / update / delete / align 逐项相等；成功后预览关闭，界面不残留旧摘要文本。
- ac-renderer-summary-tracks-selection: `src/renderer/src/views/directorySyncDialog.test.tsx` 内扩展断言：渲染后点击复选框，摘要文本随勾选变化（0 → 1 → 0），且与 Apply `disabled` 状态同步变化；勾选态下删除组头「已选」计数同步为 1。
- ac-i18n-keys-complete: zh 与 en 两套 directory 字典同时提供新增键，渲染时无缺失键 / 无 fallback 文案，删除组头在两种语言下都能读出计划总数与已选数。

## Non-Goals

- 不改四态（same / added / removed / modified 及既有分类）口径与分类定义。
- 不改三组清单（copy / update / delete）的 plan 语义、条目来源与字节口径；不改 `plan.totalCount` / `totalBytes` 的定义。
- 不改快照 / 导出（`.ocsnap`）格式与报告导出内容。
- 不改链接保真与链接时间对齐逻辑（`collectLinkAlignments` / `alignSymbolicLinkTimes` / 写路径形态分派），对齐链接计数仍来自 preview 的 `linkAlignments`。
- 不加任何依赖；不动版本单点文件（`package.json#version` / `CHANGELOG` / `README` / `release.yml` / release notes）。
- 不新增对话框结构、不复用出第二套摘要或第二个可执行判定；不顺手做视觉/交互改版。
- 不采用修法②（保留常量摘要、另加提示），不保留两种语义并存。

## Implementation Constraints

- 修法已由公司拍板为①：摘要按当前勾选实时统计，delete 计数 = 已勾选数，取消回落 0；禁止再展示与勾选无关的常量删除计数。
- 单一判定纯函数必须落在 `src/renderer/src/workbench/directoryOps.ts`（与 `canApplySyncPreview` 同域，renderer 侧，无 Electron / DOM 依赖）；`canApplySyncPreview` 保留导出语义（本仓 `src/sync-real-gate.test.ts`、`src/renderer/src/views/directoryCopy.ts` 已引用）。
- UI 与门禁共用同一实现（`docs/lessons.md` §9）：只测内层函数不算覆盖，断言须经过对话框真实渲染与真实磁盘执行路径。
- 复用既有 `Dialog` / `GroupHeader` / `ItemRow` 与 i18n `countKey` 机制，不新建组件、不改 `@theme` token。
- 新增/扩展用例的断言消息保留可检索前缀（建议 `sync dialog:` / `sync summary:` 或既有 `symlink metadata:` 风格），便于门禁失败定位。
- 合入 main 前 `/.munk/code-gates.json` 全量 11 门全绿（含 `sync-real-gate`）。
