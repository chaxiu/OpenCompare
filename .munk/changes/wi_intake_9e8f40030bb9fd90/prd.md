# Settings 主题切换真伪判定与回归断言（v0.2.24 窗口验收 E1）

## Scope

判定 2026-11-05 `release-v0.2.24-window` E1「Settings 点 Light / Dark 后运行中窗口不变」是产品缺陷还是驱动误判，并把判定结论固化成 main 上可复查的证据 + 可复用判定脚本/断言。**不改产品行为。**

### 已完成的真伪判定（Intake 结论：产品正常，旧驱动结果不可归因）

同一运行实例（`ready.json` 21:11 启动，端口 9601）内有两轮 E1：

| 时间 | 驱动版本特征 | 结果 |
| --- | --- | --- |
| 21:15 | 无 `hitTarget` / `attempts` 字段，未记录 `elementFromPoint` | `appliedMsInPage: null`，三次点击均无 `data-theme` 变更 |
| 21:32 | 记录 `hitTarget: true`、`attempts: 1`、`before` 实际主题 | Light **75.8 ms**、Dark **79.1 ms**、Light **78.9 ms** 生效；`bodyBg` 在白/黑间切换 |

结论：产品链路本身正常。旧结果缺少命中证据，不能归因于产品；21:15 的两张截图 `e1-light.png` / `e1-dark.png` 实际捕获的是另一个前台应用（缩略核对可见 Munk 编辑器窗口），**其色带数值不能作为主题证据**；21:32 的 `e1-light-final.png` 才真正拍到 OpenCompare 窗口（白色标题栏 + Settings 内 Light 选中）。决定性的 DOM 证据来自 CDP 计算样式，不受截图遮挡影响。

证据绝对路径：

- `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/cases/2026-11-05/release-v0.2.24-window/evidence/live.jsonl`
- `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/cases/2026-11-05/release-v0.2.24-window/evidence/e1-raw.json`
- `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/cases/2026-11-05/release-v0.2.24-window/evidence/driver/window.mjs`
- `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/cases/2026-11-05/release-v0.2.24-window/evidence/e1-light-final.png`
- `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/cases/2026-11-05/release-v0.2.24-window/evidence/e1-light.png`（截图伪证，见上）
- `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/products/codebase_b2d550b56d98d0c5/projects/ops_df43e423451170fd/cases/2026-11-05/release-v0.2.24-window/evidence/e1-dark.png`（同上）

### 主题链路（按设计点击 Light 应发生什么）

1. `src/renderer/src/workbench/SettingsDialog.tsx`：主题 `SegmentedControl` 的 `onChange` → `chooseTheme(next)`。
2. `chooseTheme` 先 `setTheme(next)`（React state，同一渲染批次内生效），再把 `{ language, theme: next }` 写入平台设置槽（失败只提示、不回滚）。
3. `src/renderer/src/theme/ThemeProvider.tsx`：`useLayoutEffect` 调 `applyTheme(resolvedTheme)` → `documentElement.dataset.theme = 'light' | 'dark'` + `style.colorScheme`；同一组件的第二个 `useLayoutEffect` 调 `platform.setNativeTheme(mode)`（推模式，不推解析值）。
4. `src/preload/index.ts` → `platform:set-native-theme` → `src/main/platform/electron-platform.ts`：`isTheme` 校验后 `nativeTheme.themeSource = mode`，再 `onNativeThemeChanged()` → `src/main/index.ts` 的 `applyWindowBackdrop()` → 每个窗口 `setBackgroundColor(#ffffff / #0b0e12)`。
5. **不需要重启，也不需要主进程回环**：DOM 与原生外壳都在渲染进程点击后的同一批次/同一 IPC 往返内完成；窗口不 remount，会话/滚动保留。

### 当前单测覆盖（已存在，无需重复造）

- `src/renderer/src/theme/theme.test.ts`：`resolveTheme` / `applyTheme` / `loadInitialTheme`。
- `src/renderer/src/theme/ThemeProvider.native.test.tsx`：挂载与每次切换都推 `setNativeTheme`，失败吞掉仍切换，无平台/无方法可用。
- `src/renderer/src/App.theme.test.tsx`：真实 Settings 对话框的三个主题 tab、文案/`aria-selected`、同一点击即写 DOM + `color-scheme`、system 跟随/解绑、持久化 + 重启恢复、语言+主题不丢字段、写失败不回滚。
- `src/main/platform/electron-platform.test.ts`、`src/main/native-theme-wiring.test.ts`：IPC 校验后设置 `nativeTheme.themeSource`、调用回调；`index.ts` 启动先读持久化、只挂一个 `updated` 监听。
- `src/core/theme/contrast.test.ts`：既有 WCAG 对比度门（本轮不碰）。

**缺口**：没有一条断言把「真实 Settings 控件 → App 级 `setNativeTheme`」串起来，也没有覆盖任务要求的 light→dark→light 连续切换；此外没有可复用的「命中 vs 产品不切换」判定脚本。

## Acceptance Criteria

- ac-evidence-verdict-recorded: `docs/evidence/theme-switch-verdict.md` 存在，写明结论「产品正常 / 旧驱动伪失败」、21:15 与 21:32 两次 E1 的差异、75.8 / 79.1 / 78.9 ms 三个实测值、上述绝对证据路径、以及 21:15 两张截图是其他前台应用的伪证。
- ac-theme-tab-contract: jsdom 中挂载真实 `App` 并打开 Settings 后，`getByRole('tablist', { name: 'Theme' })` 存在且含 3 个 `role="tab"`；点击 `Light` 后同步（同一次 `act` 内，无需 `waitFor`）`documentElement.dataset.theme === 'light'` 且 `colorScheme === 'light'`。
- ac-light-dark-light-sequence: 同一对话框内依次点击 Light → Dark → Light，三次 `dataset.theme` 分别为 `light` / `dark` / `light`，`colorScheme` 同步；写设置队列依次为 `{ language, theme: 'light' }`、`{ language, theme: 'dark' }`、`{ language, theme: 'light' }`。
- ac-native-mode-push: 上述三次点击后 `platform.setNativeTheme` 的最后三次调用（忽略挂载那次）依次为 `'light'`、`'dark'`、`'light'`，且不推解析后的 `system` 结果；调用失败不影响 DOM 切换。
- ac-persist-and-restart: 切换 Light 后持久化记录为 `theme: 'light'`，卸载并以同一存储重挂载 `App` 后 `dataset.theme === 'light'`（DOM 与持久化值一致）。
- ac-probe-classifies-hit-vs-product: `scripts/theme-click-probe.mjs` 导出纯函数 `judgeThemeProbe`，对 `{ hit, cdpMutated, domClickMutated }` 返回 `ok-cdp` / `driver-miss` / `product-no-switch`；`scripts/theme-click-probe.test.mjs` 覆盖三个分支与退出码映射（0/1/2），并断言脚本 `--help` 以 0 退出且不依赖第三方包。
- ac-probe-control-facts: 探针输出的每个主题 tab 记录 `role`、所在 `tablist` 的 `aria-label`、`aria-selected`、`rect`，以及 `elementFromPoint` 命中元素的 `tagName/role/text/insideTarget`；判定为 `driver-miss` 时输出「坐标击中的实际元素」，判定为 `product-no-switch` 时输出页面内 `.click()` 仍无 `data-theme` 变更的事实。
- ac-no-product-change: 改动仅限新增 `scripts/theme-click-probe.mjs`、`scripts/theme-click-probe.test.mjs`、`src/settings-theme-gate.test.tsx`、`docs/evidence/theme-switch-verdict.md`（必要时 `src/settings-theme-gate.test.tsx` 触发的 `.munk/baseline/test-debt.json` growth 记录）；`src/renderer/src/**`、`src/main/**`、`src/shared/**`、`src/core/theme/**` 零改动，不新增色相、不改四态色/主题 token 语义、不放宽 WCAG 门。
- ac-code-gates-green: `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 以及与 test-debt 相关的门全部通过；新测试文件若使 `repoTestLines` 越界，只允许按 `scripts/test-debt-gate.mjs` 的 growth 机制登记（`from` = 当前提交基线，`to` = 实测值，理由写清）。

## Non-Goals

- 不改发布通道 / tag / Release 资产，不动 `release-*` 门禁。
- 不新建第二场窗口验收会话；本轮 E2/E3 未验项随下版补，探针脚本只作为下轮可复用工具，不在本 WorkItem 里跑 GUI。
- 不改 diff 语义、四态计数、忽略开关；不做整体 UI 重构。
- 不为了「让报告好看」修改产品代码或截图；不重拍 `docs/screenshots.md`（本轮不触碰 `src/renderer` 视觉源）。
- 不新增主题（不加色相/模式），不改 `--color-*` 语义。

## Implementation Constraints

- 复用现有测试夹具风格：jsdom 测试放 `src/settings-theme-gate.test.tsx`（仓库既有 `src/*-gate.test.*` 约定），`// @vitest-environment jsdom`；用 `createWebPlatformPort()` + 覆盖 `writeUserSettings` / `setNativeTheme`，通过 `[data-shell-entry="settings"]` 打开真实 Settings，用 `getByRole('tablist', { name: 'Theme' })` 定位控件，禁止用文本坐标或 `querySelectorAll('button')` 兜底。
- 该新测试文件会抬高 `repoTestLines` 天花板：只能按 `scripts/test-debt-gate.mjs` 的 growth 机制更新 `.munk/baseline/test-debt.json`（新增 `growth` 条目，`metric: "repoTestLines"`，`from` 取 HEAD 中基线 51955，`to` 取实测值，`addedCases` 写新增用例数，`reason` 写「settings theme click chain: real dialog → DOM/native/persist/restart」，且增幅 ≤ 400 行）。不得删除或弱化既有断言来腾行数。
- `scripts/theme-click-probe.mjs`：仅用 Node 内置 `fetch` + 全局 `WebSocket`（与 `qa-driver/lib.mjs` 同思路），不得新增依赖；顶层用 `import.meta.url === pathToFileURL(process.argv[1]).href` 守卫，保证被测试 import 时不执行 CLI；支持 `--port`（默认 9601）、`--label`（默认 `Light`）、`--expect`（默认 `light`）、`--timeout`（默认 2000）、`--help`。判定顺序：先看 `elementFromPoint` 是否命中 tab（否则 `driver-miss`），再用 CDP 坐标点击并观察 `MutationObserver`，未变更则页面内 `el.click()` 复测；仍不变更才是 `product-no-switch`。
- 证据文档用中文，数字与绝对路径必须与 `live.jsonl` / `e1-raw.json` 一致；不得把 21:15 的截图色带写成产品证据。文档中给出探针的重跑命令：`node scripts/theme-click-probe.mjs --port <remote-debugging-port>`。
- 本轮不改 `docs/screenshots.md` 的 captured commit：没有 `src/renderer` 视觉源变更，不需要 `pnpm screenshots`。
