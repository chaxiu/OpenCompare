# 刷新 v1「改后」视觉证据并重钉 after 绑定

## 范围

结案前发现验收②的「改后」证据已过期：`docs/visual/v1/after/` 四张图与
`docs/visual/v1/measurements.md` 的 after 绑定仍停在 `3b8cfe3`，但此后 main 的渲染层已被
`11cbdaa`（工具栏溢出 / light 对比度）与 `0ce2879`（工具栏 band 36/72 +「更多」菜单）改动
（`src/renderer` 16 文件、+741/−61）。旧截图顶部控件带仍是 44px 时代的形态，不能作为验收②证据。

本项只做证据刷新，让「改后」证据与 v0.2.21 发布树同源：

1. 在 main 当前树（`37d481b` = `origin/main`）执行 `pnpm build`，再执行
   `node scripts/capture-visual-baseline.mjs --out=after`，重出四张图并覆盖写入
   `docs/visual/v1/after/{directory-dark,directory-light,file-dark,file-light}.png`。
2. 在真实构建窗口读取顶部控件带各级 `getBoundingClientRect()`（`app` / `sessions` /
   `view-toolbar` / `panels` header / Ready-state band total / `status`），把 `0ce2879` 后的
   真实值更新进 `measurements.md` 的「Top control band」表；只有实测变化的数字才改。
3. 把 `measurements.md` 中 `## after/` 绑定 commit 改为本次截图所用构建的 commit sha
   （截图时分支 HEAD，预期 `37d481b`），并把四张 PNG 的实测字节数填入 Bytes 列。
4. 若截图暴露新的视觉缺陷，本项不修，写入交付说明交回产品负责人。

## 验收

- ac-after-shots-refreshed: 四张 `docs/visual/v1/after/{directory-dark,directory-light,file-dark,file-light}.png` 均由 main 当前树先 `pnpm build`、再 `node scripts/capture-visual-baseline.mjs --out=after` 重新生成并覆盖，文件 mtime/内容来自本次构建而非旧提交。
- ac-after-shot-pixels: 四张 PNG 实测像素尺寸均为 2560×1584（1280×792 逻辑视口 ×2），目录视图 × 文件视图 × 深色/浅色两套主题齐全。
- ac-after-bytes-match: `measurements.md` after 表 Bytes 列四个数值与四张 PNG 的 `wc -c` 实测字节数逐张相等，且不等于旧表中的 236587/239477/296666/295538（除非字节恰好相同，须有实测命令输出佐证）。
- ac-after-binding-commit: `measurements.md` 中 `## after/` 的绑定 commit 等于本次截图时分支 HEAD 的完整 sha（预期 `37d481b21bd3b22395e0b2c555b297b3dd89a6d8`），且该文件全文不再出现 `3b8cfe3`。
- ac-top-band-measured: Top control band 表中 `app` / `sessions` / `view-toolbar` / `panels` header / `status` 五级数值均取自真实构建窗口的 `getBoundingClientRect()` 实测（截图脚本打印的 metrics），Ready-state band total 等于实测 `app + sessions + view-toolbar + panelHeader` 之和且 ≤120。
- ac-view-toolbar-36: 1280×792 就绪态下 `view-toolbar` 实测为 36px；若窄档实测到 72px 则按实测值记录并注明档位，不得凭常量臆写。
- ac-unchanged-values-preserved: 旧表中与本次实测相同的行逐字保留（数值与描述不变），只有实测发生变化的数字被修改。
- ac-real-inputs: 截图输入为真实 `/tmp` 临时目录对与真实 `src/session.ts` 文件对照，经应用真实启动入口打开，不使用 `src/shared/fixtures/**` 摆拍。
- ac-before-untouched: `docs/visual/v1/before/` 四张 PNG 的字节数与 sha256 与改动前完全一致，未被重拍或改写。
- ac-whitelist-diff: 最终 `git diff --stat`（相对本项起点 `37d481b`）只含 `docs/visual/v1/after/` 四张 PNG、`docs/visual/v1/measurements.md`、`.munk/changes/wi_intake_2ad3d38cc7b3f12e/prd.md` 与本项交付账本；不含 `src/**`、`scripts/**`、`package.json`、`README*`、`docs/release-notes/**`、`CHANGELOG*`、`.github/workflows/release.yml`、`docs/assets/**`。
- ac-gates-green: `.munk/code-gates.json` 的 29 门全部通过（install 起至 test-debt-gate 止），证据落盘且路径可复核。
- ac-delivery-receipt: 交付回执逐项点名本次构建/截图 commit sha、四张 PNG 的字节数、`code_gates` 证据路径，数值均为可复核实测。
- ac-new-defect-reported: 若截图暴露新的视觉缺陷，本项不做任何修复改动，只在交付说明中列明现象、截图文件与建议，交回产品负责人。

## 非目标

- 不修任何视觉缺陷、不改样式、不调 token、不改渲染/布局/交互行为；截图必须来自真实构建窗口原样呈现。
- 不改 `docs/visual/v1/before/`（任何一张都不得重拍或改动字节），不改 `baseline-facts.json`、`functional-parity.md`。
- 不重拍 README 截图，不改 `docs/screenshots.md`，不改 `docs/assets/**`。
- 不改 `src/**`、`scripts/**`、`package.json`、README、`docs/release-notes/**`、`CHANGELOG`、release workflow。
- 不动版本号、不打 tag、不 dispatch workflow、不改已公开 Release；本项只需在发布点前合入。
- 不新增依赖（截图脚本已有 electron 即可），不新增证据目录或证据格式。

## 实现约束

- 构建/截图时序：在 main 当前树（`37d481b`，工作区干净）先 `pnpm build`，再 `node scripts/capture-visual-baseline.mjs --out=after`；**先截图、后写文档提交**，绑定 commit 取截图时的 `git rev-parse HEAD`，不要用包含文档改动的后续提交 sha。
- 数值来源：顶部控件带与视图度量一律转录截图脚本在真实窗口内 `MEASURE_EXPRESSION` 的 `getBoundingClientRect()` 输出（脚本会打印 `measured <file> {...}`），禁止按 `SHELL_LEVELS` 常量手算或照抄旧文档。
- 体积来源：四张 PNG 字节数用 `wc -c docs/visual/v1/after/*.png` 实测后填表。
- 门禁证据：`code_gates` 29 门全量跑，逐门留 exit code 与日志路径，交付回执给出可复核路径。
- 发布边界：本项产出仅证据文件；合入须早于今晚 23:00 `v0.2.21` tag 推送点。
