# 修复发布核验四态图例选择器失配

## 范围

v0.2.21（发布点 `32e9369`）draft 验证 run `41937227156` aggregate 14/15，唯一失败 `linux-directory-compare`：脚本在 `footer[data-shell-level="status"]` 内找四态图例，而图例已随「四态图例只留过滤行」渲染到 `DirectoryView` 的 `[data-shell-level="view-toolbar"]`，实测 `counts=null` / `读不到四态计数`（证据：`release-v0.2.21-evidence/draft-linux-directory-compare.log`）。产品 UI 无回归，本次只修发布核验脚本的选择器与失败语义，并补上能以真实 DOM 拦住的回归门。

改动边界锁定在：

- `scripts/verify-release.mjs`：四态读取、`linux-directory-compare` 与 local 三轮四态的失败判定。
- 新增可复用的四态读取纯函数/表达式模块（`scripts/four-state-legend.mjs` + `.d.mts`），供脚本与测试共用。
- `src/verify-release-gate.test.ts`：FakeHost 只保留编排层夹具，并补读取失败原因的 fail-closed 用例。
- 真实 jsdom 渲染用例（复用 `src/renderer/src/workbench/directoryStatusLegend.test.tsx` 的真实 `Workbench` 路径，或同构新增 DOM 测试文件），以及单源回归断言。
- `scripts/` 与测试中其它仍按 footer 状态栏定位四态图例的残留（本仓当前只有 `scripts/verify-release.mjs:149-162` 与 `src/verify-release-gate.test.ts:178`；`scripts/capture-visual-baseline.mjs` 只量高度、不读四态图例，确认不涉及）。

## 验收标准

- ac-legend-semantic-read: 四态计数按图例自身语义定位（`[data-shell-legend]`），不再硬编码 `footer[data-shell-level="status"]` 或任何单一容器路径；返回对象键顺序与取值口径仍为 `{ same, added, removed, modified }`，每个数取自对应 `[data-legend-status="<status>"]` 单元的计数文本。
- ac-legend-exactly-one: 应用外壳内 `[data-shell-legend]` 恰好 1 个时读数成功；0 个返回 `legend-missing`，多于 1 个返回 `legend-duplicate`（含实际个数），两种原因均可区分并让 step 判定 fail。
- ac-count-finite: 任一状态的计数文本不是有限数字时返回 `count-non-finite`（含 status 与原始文本），step 判定 fail；不得返回 `null` 后被当作 0，也不得出现「读不到就跳过」分支。
- ac-real-dom: jsdom 渲染真实 `DirectoryView`（经真实 `Workbench` + web `PlatformPort`，不使用 FakeHost 假造 `fourState`）后，调用同一读取模块得到的四态与页面 `[data-legend-status]` 渲染值逐项相等，且等于该目录对的真实四态。
- ac-negative-dom: 对真实 DOM 的三种反向夹具——图例缺失、图例重复、计数非数字——读取模块分别返回上述可区分失败原因，且门禁判定为 fail。
- ac-single-source: 真实应用外壳回归断言要求 `[data-shell-legend]` 只出现一次并带该标记；失败信息明确写出「同时改 scripts/verify-release.mjs 的选择器」；测试同时校验 `FOUR_STATE_EXPRESSION` 与共享选择器常量为同一单源。
- ac-residuals: `scripts/` 与测试中不再存在「在 footer 状态栏按 4 格图例启发式找四态」的残留；status bar 不出现图例的既有否定断言继续保留（防止把图例挪回状态栏）。
- ac-registry-unchanged: CI 检查注册表仍为 15 项、step id 仍为 `linux-directory-compare`、local 仍为 3 项；失败阈值语义不变，未删除检查、未把断言降级为 warning。
- ac-local-rounds: `judgeLocalRounds` 能消费新的读取结果形态：读取失败按原因记为该轮问题，三轮回合、和值与总行数、跨轮一致性的判定口径保持不变；不再对 `null` 计数做算术。
- ac-gates-green: `lint`、`typecheck`、`test`、`verify-release-gate`、`test-debt-gate` 全绿；新增/改动的断言逐条给出「原断言 → 更强断言」映射并报告测试文件行数净变化。
- ac-main-effective: 说明并保持发布口径——同一 tag 重跑 post-release-verify 时脚本取自默认分支 `main`，因此本修复合入 `main` 即对同 tag 的 draft 复验生效，无需移动 tag、重建 Release 或资产。

## 非目标

- 不改产品 UI；不把图例挪回状态栏；不改 `DirectoryView.tsx` / `StatusBar.tsx` / `CompositionLegend` 的渲染与样式。
- 不改版本号与 `CHANGELOG`、`docs/release-notes`、`docs/release-evidence` 或任何发布证据。
- 不动 tag、GitHub Release、资产；不改 `.github/workflows` 的 release workflow 与 `post-release-verify.yml`。
- 不删检查、不放宽阈值、不接受「读不到就跳过/当 0」；不做无关重构。
- 不为通过 test-debt 而删除既有测试或下调 case floor。

## 实现约束

- 读取模块建议为 `scripts/four-state-legend.mjs`：导出共享选择器常量、`readFourStateLegend(document)`（返回 `{ ok: true, counts }` 或 `{ ok: false, reason, detail }`）以及 `FOUR_STATE_EXPRESSION`；表达式必须由同一函数体序列化生成（如 `(${readFourStateLegend.toString()})(document)`），确保 CDP 端与 jsdom 端无第二份逻辑。函数内不依赖模块作用域的其它常量/导入，保证可序列化。
- 新增 `scripts/four-state-legend.d.mts` 类型声明，供 `src/verify-release-gate.test.ts` 与 TS 检查使用；沿用现有 `scripts/verify-release.d.mts` 模式。
- `scripts/verify-release.mjs` 的 `runLinuxDirectoryCompare`（约 2404-2444 行）与 `runLocalRounds`（约 2760-2827 行）改为消费 `{ ok, counts, reason, detail }`；step `actual` 必须携带可区分原因。`judgeLocalRounds`（约 481-517 行）同步处理新形态。
- `src/verify-release-gate.test.ts` 的 FakeHost 目前用 `expression.includes('footer[data-shell-level="status"]')` 识别读取表达式（约 178 行），必须改为共享选择器/表达式；FakeHost 仍只用于脚本编排，不得再作为四态 DOM 语义的唯一证据。
- 真实 DOM 测试用 jsdom + `// @vitest-environment jsdom`，复用 `directoryStatusLegend.test.tsx` 的 `renderWithI18n(<Workbench platform={createWebPlatformPort()} />)` + 打开目录对路径；断言读取值与 `[data-legend-status]` 渲染值一致。现有 `directoryStatusLegend.test.tsx:121-125` 已断言唯一性与位置，需补上带「同时改 scripts/verify-release.mjs 的选择器」的失败信息，并改用共享选择器。
- test-debt 门约束：`repoTestLines` 当前 ceiling 为 50019 且只能收紧；新增测试行数会抬高该值，需按既有机制在 `.munk/baseline/test-debt.json` 增加 `growth` 声明（`from` 等于上一提交 ceiling、`to` 等于新 ceiling、`addedCases > 0`、写明 reason，单次允许 ≤400 行），并在报告中给出测试文件行数净变化。`repoTestCases` floor 只增不减。
- test-debt 的版本字面量门禁止在 `.ts/.tsx`（含 `src`、`scripts`、`docs`）中出现当前 `package.json` 版本号；测试代码/注释不得写 `0.2.21` / `v0.2.21`，需要描述时用「本次发布」或从 `package.json` 读取。
- 图例真实标记已存在：`StatusBar.tsx` 的 `CompositionLegend` 输出 `data-shell-legend` 与 `data-legend-status`，`DirectoryView.tsx` 在 view-toolbar 内渲染它；本次不改这些渲染代码。
- 发布口径：同一 tag 重跑 post-release-verify 时脚本取自默认分支 `main`，合入 `main` 即生效；不重打 tag、不重建 Release/资产。
