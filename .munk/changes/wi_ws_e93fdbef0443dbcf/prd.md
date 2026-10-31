# scene 由打开对象决定，移除分段控件

## 范围

1. **顶栏去 scene 分段控件**：`Workbench.tsx` 删除以 `shell.viewSwitcher.label` 为可访问名的 `SegmentedControl`（目录 / 代码 / CSV / JSON-YAML 四段）与仅供它使用的 `selectScene`。切换会话改由 `SessionTabs` 承担；`VIEW_OPTIONS` 不再服务视图切换，收窄为「`session.scene` → 类型图标」的单一映射（供 SessionTabs 用）。
2. **壳层预算重算**：`shellLayout.ts` 的 `APP_ROW.controls` 删除 `view-switch`（444px）控件，仅保留 `brand`；`measureToolbar(tier, 'app')` 的三档预算按表自动重算，仍必须 `fits === true`。
3. **i18n 同批收敛**：中英词典删除 `shell.viewSwitcher.label`；`shell.view.directory|code|csv|structured` 四键保留（设置「示例与调试」入口标签与 tab 类型归属仍用），不为凑对新增同义键。`messages.test.ts` 的中英键集合、占位符、英文 glossary 约束保持绿。
4. **scene 归属只由打开对象决定（不改算法）**：打开文件夹 → `createDirectorySession` 落 `directory`；打开真实文件对 → `openFilePairSession` 经既有 `classifyFile` 落 `code` / `csv` / `structured`，混合族与不支持扩展名的拒绝语义不变；目录下钻 → `createDrilldownSession` 生成子会话并带 `parentDirectoryId`。`SessionTabs` 按 `session.scene` 展示类型归属图标。
5. **断言同批重定标并补行为断言**：
   - 新增纯函数 / L2 断言：`classifyFile` → 类型族映射；`openFilePairSession` 三种落位 + 混合族 / 不支持类型拒绝（用 stub `PlatformPort`）；`createDrilldownSession` 的 `scene` / `parentDirectoryId` / id 前缀；`createDirectorySession` 的 `scene`。
   - 新增 jsdom 断言：工作台（空态与 ready）顶栏内无任何 `role="tablist"`；`SessionTabs` 每个 `[data-session-tab]` 内 `svg[data-icon]` 与 `session.scene` 固定图标一致；设置起 4 场景后点击会话 tab 能驱动到对应视图。
   - 重定标受影响用例：`App.test.tsx`（`getByRole('tablist', {name:'视图切换'})` 正向断言、`activeScene()` helper）、`App.i18n.test.tsx`（英文 `Switch view` 四标签断言）、`App.settings.test.tsx`（切语言后视图切换标签顺序断言）、`App.smoke.test.tsx`（`viewSwitcher()` / `selectView()` helper）改为负向缺席断言 + 会话 tab 驱动；每条改动在交付说明写明原因。
6. **文档口径同步**：`docs/ui-phase1-reference-audit.md` 的 `app` 行描述去掉「视图切换」，改为「品牌与全局动作」。

## 验收

- ac-no-view-switcher-dom: 渲染 `Workbench`（空态与有会话两态）后，`queryByRole('tablist', { name: '视图切换' })` 与英文 `Switch view` 均为 `null`，且 `[data-shell-level="app"]` 内 `[role="tablist"]` 数量为 0。
- ac-no-view-switcher-key: zh / en 词典均不含 `shell.viewSwitcher.label`，两语言键集合仍完全相等；`shell.view.directory` / `code` / `csv` / `structured` 四键在中英同时存在且值非空。
- ac-app-header-actions-unchanged: ready 态 `[data-shell-level="app"]` 内 `[data-shell-entry]` 集合为 `new-compare` / `open-file` / `open-folder` / `settings`；空态为 `new-compare` / `settings`（既有可见性语义不变，本次不多不少）。
- ac-open-directory-scene: `createDirectorySession(comparison, sides).scene === 'directory'`，且不因顶栏控件删除而改变会话 title / subtitle 生成来源。
- ac-open-file-pair-scene-by-kind: `openFilePairSession` 对两个 `.ts` 路径产出 `scene === 'code'`；对两个 `.csv` 产出 `scene === 'csv'` 且 `adhoc.tables` 两侧均有解析结果；对两个 `.json` 产出 `scene === 'structured'` 且 `adhoc.format === 'json'`。
- ac-open-file-pair-rejects: `.json` ↔ `.yaml` 抛 `FilePairError`，`code === 'mixed-family'`；不支持扩展名（如 `.bin`）抛 `code === 'unsupported-type'`；两次拒绝都不产生 / 不替换任何会话。
- ac-drilldown-child-session: `createDrilldownSession(parentId, node, target, …)` 返回会话 `scene === target.kind`、`parentDirectoryId === parentId`、`id` 以 `file:${parentId}::` 开头。
- ac-tab-shows-scene-type: 同屏 4 个会话（directory / code / csv / structured）时，每个 `[data-session-tab]` 内唯一的 `svg[data-icon]` 依次为 `folder-tree` / `file-code-corner` / `table-2` / `braces`；切换活动会话后图标不随活动态变化。
- ac-app-row-budget-recomputed: `APP_ROW`（`TOOLBAR_ROWS` 中 `id === 'app-actions'` 的行）`controls` 的 id 集合为 `['brand']`（不含 `view-switch`）；compact / regular / wide 三档 `measureToolbar(tier, 'app')` 的 `required` 均比改动前基线 734 / 948 / 948 精确少 444px，且 `fits === true`。
- ac-session-tab-drives-view: 经设置起 directory / code / csv / structured 四个会话后，点击 code 会话 tab 出现代码模式 `tablist`，点击 csv 会话 tab 出现 CSV 过滤 `tablist`，点击 structured 会话 tab 出现结构化格式 `tablist`，点击 directory 会话 tab 出现目录过滤 `tablist`（替代原「视图切换」驱动的走查）。
- ac-gates-green: 10 道 `code_gates`（install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate / structured-semantics）全绿，且未删 / 跳 / 弱化与本变更无关的断言。

## 非目标

- 不删除、不改写 `SegmentedControl` 组件本身（设置语言、代码模式、CSV 过滤等仍在用）。
- 不改 `classifyFile` / `openFilePairSession` / `createDirectorySession` / `createDrilldownSession` 的算法与拒绝语义，不新增内容嗅探、不改 `src/shared/fileExtensions`。
- 不改 `SessionTabs` 的布局、宽度档预算、tab 文案、关闭与未保存提示语义；只换类型图标来源。
- 不改顶栏其余入口、空态 CTA / hint、设置「示例与调试」分区与 5 个入口、`src/shared/fixtures/**` 样本数据与 `SceneId`。
- 不碰版本单点文件（`package.json#version`、`CHANGELOG.md`、`docs/release-notes/**`、`README*`、`.github/workflows/release.yml`、`docs/release-signing.md`、`release-packaging.test`）。
- 不新增或调整 `code_gates` 条目（`.munk/code-gates.json` 保持 10 门）。
- 不做浏览器 / 真机 / 桌面点选；`needSelfTest` 固定 false。

## 实现约束

- 沿现有结构收窄即可：`SESSION`/`VIEW_OPTIONS` 收窄为 `Record<SceneId, IconName>` 之类的单表，Workbench 与 `SessionTabs` 共用同一份 scene→图标映射；`SettingsDialog` 现有的 `icon` 字段可保留，不要新造第二套映射或新增同义 i18n 键。
- 删掉 `shell.viewSwitcher.label` 后，`shellScan.test.ts` 的显式文件清单（`Workbench.tsx` 在内）必须仍零硬编码中文；不得把可见文案塞回组件。
- 测试 helper：经设置入口批量起 4 个场景时，先等 4 个会话 tab 全部就位再点击（前序交付已踩过慢 worker 下 structured 会话未落地的竞态）；点击会话 tab 用 `[data-session-tab]` / 会话 tablist 定位，不要依赖已删除的 `shell.viewSwitcher.label`。
- `openFilePairSession` 的 L2 用例使用内存 / stub `PlatformPort`（仅需 `readTextFile`），不放浏览器或 E2E。
- 断言改动只针对本变更涉及的面；交付说明记录改动前后 `it` / `expect` 计数与逐处原因。
