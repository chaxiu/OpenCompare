# v0.2.10 发布说明如实口径（点选跳转降级为「设计行为 + 未实测」+ 已实测 / 未实测分列）

- WI：`wi_ws_bb1f14b4d0cac014`（`key: v0210-notes-verified-vs-unverified-split`）
- 域：`release`（发布说明文案项；不是版本收敛轮、不是发布收尾轮、也不是 B / C 的修复轮）
- 来源：`.munk/changes/wi_ws_bb1f14b4d0cac014/prd.md`（本 WI change pack 只有 `prd.md`，无 `tests/cases/**` / `tech.md` / `ux/**`）
- 提交：本 worktree 单提交（父基线 `92b4e23662c090eb43176b8cff0aadaad1c0bbb1`）

## 验收逐条

| AC | 落点 / 证据 | 结果 |
| --- | --- | --- |
| ac-scope-single-file | `git diff --name-only` = `docs/release-notes/v0.2.10.md`（唯一改动文件；`git status --porcelain` 另有 `.munk/changes/wi_ws_bb1f14b4d0cac014/` 未跟踪的 change pack 与本基线折叠）；`package.json#version` 仍 `0.2.10`；`CHANGELOG.md` / `README.md` / `README.zh-CN.md` / `docs/release-evidence/**` / 全部 `src/**` 零 diff | 满足 |
| ac-no-absolute-click-claim | 开头概述由「再直接跳到要看的那一行」改为「指示条用竖向分布标出差异大致落在整份文件的哪些位置，作为定位时的参照」（零可用性承诺）；「点选跳转（设计行为，大行数下未实测）」条目正文含「按设计……会选中」「只是本版的设计行为」「尚未实测」，并明写「本文件不把它们写成已可用的能力」 | 满足 |
| ac-no-verified-350k-claim | `350k` / `358k` 零命中；`350,000` 两处都与「行文本模型（源码拼接）」同句；不与「目录」「条目」同句（未实测句只写「同规模文本」「目录对比在条目规模上的表现」，且该句无数字） | 满足 |
| ac-verified-vs-unverified-split | `## 风险与验证规模` 拆为三段独立句：① 改动面（渲染层，不触碰算法）② 已实测：「已实测的范围只有一项：在两侧各 350,000 行文本模型（源码拼接）的双栏对比上，可以打开双栏视图，且滚动任一栏时视口窗同步、标记位置不变。」③ 未实测：「同规模文本下的点选命中与键盘跳转是否可靠、目录对比在条目规模上的表现、以及长文件对比下指示条的内存占用，都还没有实机结论。」（该句零数字，显式写「本文件不为它们写任何数值」）+ 承接段「L1 前待实机」 | 满足 |
| ac-no-unmeasured-figures | `grep -nE "[0-9]+([.,][0-9]+)?[[:space:]]*(GiB\|MiB\|GB\|MB)"` 零命中；无耗时秒数；`[0-9a-f]{40,64}` 零命中；`TODO` / `TBD` / `FIXME` / `待验证` / `预计通过` / `应该通过` 零命中；全文数字仅版本号（`v0.2.10` / `v0.2.9` / `0.2.10`）与 `350,000` | 满足 |
| ac-release-gate-stays-green | `pnpm test src/main/release-packaging.test.ts` → `Test Files 1 passed (1) / Tests 199 passed (199)`；`src/main/release-packaging.test.ts` **零 diff**（未为通过而改测试）；白名单词元 `指示条` / `四态` / `same` / `added` / `removed` / `modified` / `滚动` / `点选` / `跳转` / `minimap` / `不新增扫描` / `不改对比与合并算法` / `升级方式` 全部在位；`200,000` / `10 MB` / `本版新增` 零命中；「L1 前待实机」段落存在且同时含 `product-qa` 与 `run id 待该场次回填` | 满足 |
| ac-structure-intact | H1 `# OpenCompare v0.2.10 发布说明`；`## 本次变化` / `## 不做的事` / `## 风险与验证规模` / `## 升级方式` 四小节齐全且顺序未变；`## 升级方式` 仍从 `v0.2.9` 升级并列出 macOS（`.dmg` / `.zip`）、Windows（`OpenCompare-Setup-0.2.10.exe`）、Linux（`.AppImage` / `.deb`）与签名 / 公证口径 | 满足 |
| 范围守门 | 未改点选命中实现、未做窗口化（B / C 子项）、未启动 product-qa CDP 场、未写具体 run id、未动四态语义 / 快照格式 / 发布通道、未建 tag / 未 push、未动 `docs/release-notes/` 其它版本与 `.munk/code-gates.json` | 满足 |

## 最近执行

- workItemId: wi_ws_bb1f14b4d0cac014
- at: 2026-10-28
- status: pass
- note: 本轮 `needSelfTest=false`，跳过 UI 自测，以 Host `code_gates` 为交付门槛（9 gates，attempt 001，`.munk/runs/run_ws_3ffd64485f8ae3fb/code-gates/attempts/001`，install / lint / typecheck / build / build-web / test / test-compare-request / cancel-gate / memory-gate 全 exit 0；`pnpm test` 66 files / 1074 passed + 1 skipped / 1075，`release-packaging.test.ts` 199 tests）。静态核对：`git diff --name-only` 恰为 `docs/release-notes/v0.2.10.md`，`src/main/release-packaging.test.ts` 与 `package.json` / `CHANGELOG.md` / 两版 README / `docs/release-evidence/**` 零 diff；单位 / 禁用词 / 十六进制串 grep 全零命中。口径：已实测只保留 350,000 行文本模型（源码拼接）下的打开 + 滚动同步，点选命中 / 键盘跳转落点 / 目录条目规模 / 长文件内存占用统一记为未实测且不写数值，`L1 前待实机` 与 `run id 待该场次回填` 承接保留。边界：本项只改文案，不产生新证据、不跑实机；点选命中的真实修复与复验仍属后续 B / C 子项与 product-qa 单场 CDP。
