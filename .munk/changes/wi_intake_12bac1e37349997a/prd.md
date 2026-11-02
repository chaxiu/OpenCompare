# 修复模板放置的 P1⑥ 结案驳回点：大小写不敏感碰撞 + 路径越界防御

## 范围

只补 P1⑥ 结案被驳回的第 1、3 点，不重做已交付部分。基线为 `origin/main` HEAD `3dab29c`（v0.2.16）；
本机主检出是已知停驻态，所有判断以 git HEAD / origin-main 为准，不以主检出工作区文件为真相。

### A. 大小写不敏感碰撞（核心）

macOS 默认 APFS 不区分大小写。当前实现三处用精确字符串比较，导致同一个文件被当成不同文件：

1. `src/core/directory/template.ts` 的 `createTemplatePlan`：`existingFiles.has(relativePath)` /
   `existingDirectories.has(relativePath)` 精确比较。输出根已有 `logo.png`、槽位为 `Logo.png` 时
   `overwrite=false`、`defaultChecked=true`，Apply 直接覆盖既有文件且用户没有拒绝机会。
2. `src/core/directory/template.ts` 的 `matchTemplate`：名字索引按 `slot.name` 精确匹配。B 的
   `logo.png` 对模板 `Logo.png` 会落成 `missing + unused`，而不是冲突。
3. 写后复核链路（本轮补充口径）：`verifyTemplateExtraction` 按 `candidate.name === name` 精确
   查目录项；`matchTemplateSlots` 复用 `matchTemplate` 的精确名字索引。在 APFS 上把 `Logo.png`
   写入一个已有 `logo.png` 的输出根后，输出扫描回来是 `logo.png`，会被误报 verifiedMissing。

统一改为**先精确命中优先、再按大小写折叠（case-fold）唯一命中判定**：

- 名字匹配：精确大小写候选优先；无精确候选时，case-only 唯一候选且 hash 相同 → `matched`；
  hash 不同 → `conflict(reason=content-mismatch)`；多个 case 变体 → `conflict(reason=ambiguous)`。
  任何情况下不得再出现「仅大小写不同却静默 missing + unused」。
- 输出根判定：先精确命中；无精确命中时按 case-fold 唯一命中判定 `overwrite` / `occupiedByDirectory`
  / `placed`。case-only 目标内容不同 → `overwrite=true`、默认不勾、需显式勾选；内容相同 →
  `placed`（永不写）。多个 case 变体命中 → 不得任选其一，按 `overwrite=true`、默认不勾、绝不判
  `placed` 处理。
- 写后复核：`verifyTemplateExtraction` 的目录项查找、`matchTemplateSlots` 的名字匹配使用同一
  case-fold 口径。输出实际大小写与槽位不同但 hash 与 mtimeSec 均一致 → 判 `placed` / `verified`，
  不得判失败；hash 不同仍判 `hash`，mtime 不同仍判 `mtime`。

保持确定性与既有四态口径：`matched` / `missing` / `conflict` / `unused` 计数的既有含义不变（除
上述 case-only 归类），不改变槽位、目标路径或落盘路径的大小写（槽位仍按模板 A 原样拼目标路径）。

### B. 路径越界（安全项）

在计划生成与执行写入前增加显式校验，目标相对路径满足任一条件即拒绝：

- 空串；
- 绝对路径：POSIX `/` 开头、Windows 盘符 `C:\`、UNC `\\server\share`；
- 归一化（`\` → `/`）后任一段为 `..`；
- 解析后逃出 `outputRoot`。

拒绝必须给出稳定 reason `path-escape` 并计入非可执行，禁止静默跳过或照写。该校验是防御纵深：
扫描得到的 slot 相对路径由条目名逐级拼接，OS 目录列表不会返回 `.` / `..`，结构上不可达；但计划
与执行 API 是纯函数边界，仍必须拒绝非法输入。

### C. 测试与门禁

- `src/core/directory/template.test.ts` 补 case-only 夹具与断言（匹配、计划、写后复核三类）。
- 新增快且跨平台确定的纯函数门禁，不依赖宿主文件系统大小写敏感性。
- 新增真实 macOS APFS 大小写不敏感 e2e（可挂现有 `template-e2e-real-directory` 或新脚本），
  覆盖 Dry-run 默认不勾、未勾选零写入、显式勾选才覆盖、写后复核与源 sha256/mtime 口径不回退。

## 验收

### 名字匹配（matchTemplate）

- ac-name-casefold-match: 模板槽 `Logo.png`（内容 hash H）、B 散乱树 `logo.png`（同 hash H）→ `matched` 恰 1 条；该 B 文件不出现在 `unused`；`missing` 不含该槽。
- ac-name-casefold-mismatch: 同上但 B 的 `logo.png` hash ≠ H → `conflicts` 恰 1 条且 `reason=content-mismatch`、candidates 长度 1；`missing` 与 `unused` 均不含该槽/该文件。
- ac-name-exact-priority: B 同时存在 `Logo.png`（hash H）与 `logo.png`（hash ≠ H），槽为 `Logo.png` → 命中精确候选，`matched` 且 sourcePath 指向 `Logo.png`；若精确候选 hash ≠ H，则判 `content-mismatch`（即使 case 变体 hash 恰为 H），证明精确候选优先于 case-fold。
- ac-name-multi-variant-ambiguous: 槽 `Logo.png`，B 仅有 `logo.png` 与 `LOGO.PNG`（无精确候选）→ `conflicts` 恰 1 条、`reason=ambiguous`、candidates 长度 2；不判 `matched`，不判 `missing`。
- ac-match-counts-unchanged: 除 case-only 归类外，精确同名的多候选仍为 `ambiguous`、无同名仍为 `missing`；`templateFileCount = matched + placed + missing + conflicts` 恒成立；槽 `relativePath`/`targetPath` 的大小写与模板 A 完全一致。

### 计划判定（createTemplatePlan / previewTemplate）

- ac-plan-case-overwrite: 输出根已有 `logo.png`（hash ≠ 槽源 hash），槽 `Logo.png` 且已 matched → 该行 `outcome='matched'`、`overwrite=true`、`defaultChecked=false`；默认 resolve 的 `executableCount=0`，未勾选 Apply 对输出根零写入。
- ac-plan-case-placed: 输出根已有 `logo.png` 且 hash 与槽源相同 → 该行 `outcome='placed'`、`overwrite=false`、`defaultChecked=false`、永不出现在 `executable`（即使显式把槽路径放入 `checkedPaths`）。
- ac-plan-case-exact-priority: 输出根同时存在 `Logo.png` 与 `logo.png` 时，精确同名命中优先；无精确命中且 case-fold 唯一命中才允许判 `placed`；case-fold 命中多个 → `overwrite=true`、`defaultChecked=false`、绝不判 `placed`。
- ac-plan-case-dir: 输出根已有目录 `logo.png`，槽 `Logo.png` → `occupiedByDirectory=true`、`defaultChecked=false`；被勾选时 resolve 以 `target-occupied-by-directory` 拒绝且不产出 executable。
- ac-preview-hash-casefold: `previewTemplate` 对 case-only 命中的既有输出文件也读取并绑定 digest（键可为实际输出相对路径），使计划能判 `placed` / `overwrite`；不得因大小写不同而跳过哈希读取。

### 写后复核（matchTemplateSlots / verifyTemplateExtraction）

- ac-verify-casefold-ok: 写入行 `targetPath` 以 `Logo.png` 结尾，而输出目录实际条目为 `logo.png`，且内容 hash、mtimeSec 均一致 → 该行 `ok=true`，`verified` 计 1、`failed=0`；不得报 `missing` / `hash` / `mtime`。
- ac-matchslots-casefold: `matchTemplateSlots` 对输出扫描中 case-only 路径按同一口径匹配（hash 相同 → matched/placed），不因大小写差异报 missing。
- ac-verify-still-strict: 大小写不同且内容 hash 不同 → `ok=false`、`reason='hash'`；内容相同但 mtimeSec 不同 → `ok=false`、`reason='mtime'`。宽容仅限大小写，不放宽内容与时间判据。

### 路径越界

- ac-path-reject-list: 纯判定函数对 `../evil.txt`、`/etc/passwd`、`a/../../b`、`a\..\b`、`C:\Windows\x`、空串全部返回拒绝（稳定 reason/issue = `path-escape`）；对 `a/b.png`、`docs/规格 文档/clean.txt` 返回通过。
- ac-path-plan-non-executable: `createTemplatePlan` 对逃逸/非法相对路径的行一律 `defaultChecked=false`；即使该行 outcome 为 `matched` 也不得默认勾选。
- ac-path-resolve-reject: `resolveTemplatePlan` 对被勾选的越界行给出 `rejected` 条目 `reason='path-escape'`，`executable` 不含该行；正常 `a/b.png` 仍可 executable。
- ac-path-execute-refuses: `executeTemplatePlan` 对 executable 中被构造出来的越界路径零写入、记 `failed` 且 reason 为 `path-escape`，其余行继续执行；不得静默跳过或照写。
- ac-path-shared-predicate: 默认勾选/可执行判定与执行器/门禁共用同一导出的纯函数；库代码中不存在第二份内联的绝对路径、`..`、盘符判定实现（除该函数定义外无重复逻辑）。

### 测试与门禁

- ac-tests-case-only: `src/core/directory/template.test.ts` 覆盖：a) 输出根不同内容 → overwrite 且默认不勾；b) B 不同 hash → conflict；c) B 同 hash → matched；d) 多 case 变体 → ambiguous；e) 精确同名优先；并含写入后 `verifyTemplateExtraction` / `matchTemplateSlots` 的 case-only 断言。
- ac-gate-case-collision: `.munk/code-gates.json` 新增 `id=template-case-collision`，`command` 为 `pnpm test src/template-gate-case-collision.test.ts`；该文件只使用纯函数与内存/构造数据，不读写宿主真实目录、不调用 `realpath` 探针，在大小写敏感与不敏感平台结果一致。
- ac-gate-path-contained: `.munk/code-gates.json` 新增 `id=template-path-contained`，`command` 为 `pnpm test src/template-gate-path-contained.test.ts`；逐条断言 `ac-path-reject-list` 的拒绝与通过列表。
- ac-gates-count-preserved: `gates` 数组由 16 条变为 18 条；既有 16 条 `id` 与 `command` 逐字未变（`git diff` 仅追加两条）；`install`、`lint`、`typecheck`、`build`、`build-web`、`test` 与既有 10 条专项门全绿。
- ac-apfs-e2e: 真实 macOS APFS 大小写不敏感卷上（运行时用同名异大小写探针确认；探针为 false 时显式 skip 并打印原因，本机探针为 true 时必须实跑）构造：输出根预置 `logo.png`（旧内容），模板槽 `Logo.png`（新内容），B 提供同 hash 源。断言四段结果：① Dry-run 该行 `overwrite=true`、`defaultChecked=false`；② 未勾选 Apply 后输出树快照（相对路径/类型/大小/sha256/mtimeSec）逐条不变；③ 显式勾选后写入成功（输出中目标文件内容 sha256 = 源 sha256、mtimeSec = 源 mtimeSec），`verifyTemplateExtraction` 全 `ok`（大小写不同不误报）；④ 再次 `previewTemplate` 该行为 `placed` 且 `defaultChecked=false`。
- ac-delivery-evidence: `delivery-result.json` 点名：新门禁 id 与命令、测试文件与关键断言、APFS e2e 的「Dry-run / 零写入 / 显式覆盖 / 写后复核」四段实际结果、越界拒绝断言结果，以及 `git diff --stat` 证明只含本项文件。
- ac-no-public-release-touch: `package.json#version` 仍为 `0.2.16`；`CHANGELOG.md`、`docs/release-notes/**`、`README*`、`electron-builder.yml` 无改动；不 push tag、不 dispatch workflow、不改已公开的 v0.2.16 tag / Release / 资产。

## 非目标

- 不做 P1⑥ 的 Dry-run 动作列与「移动」，该部分留给下一项。
- 不改目录同步、目录对比四态、快照、导出格式。
- 不改既有幂等 / 冲突 / placed 语义的判定口径；除 case-only 归类外不新增行为变化。
- 不把内置样本入口加回首屏或工具栏。
- 不进 L3 / self-test，不做浏览器或桌面点击验收。
- 不 bump 版本、不改 CHANGELOG / Release notes / README、不推 tag、不 dispatch、不动已公开 v0.2.16 发布件。
- 不为凑绿放宽、删除或改写任一既有门禁。
- 中途若发现与既有幂等/冲突语义冲突，如实停手报 owner，不擅自改 goal 口径。

## 实现约束

- 大小写口径统一为一个纯折叠函数（如 `foldCase`，仅用于比较、绝不用于写盘），`matchTemplate`、`createTemplatePlan`、`previewTemplate`、`verifyTemplateExtraction`、`matchTemplateSlots` 必须复用，禁止各自内联。
- 路径校验放在 `src/core` 的纯函数中：只用字符串处理（`/` 与 `\` 归一、段拆解、盘符/UNC/绝对路径判断），不得依赖 `node:path`、Electron 或 DOM，保证 renderer 与 vitest 都能直接引用。
- 精确命中优先：任何 case-fold 回退都只在精确候选不存在时发生；排序与输出保持确定性（沿用现有 `localeCompare` 汇总排序）。
- 允许新增稳定的 rejection reason `path-escape`（`TemplateRejectionReason`）与执行失败 reason；不得删除或重命名既有 reason。
- 门禁文件必须是纯函数测试：不读真实输出根、不依赖宿主大小写敏感性；APFS e2e 与纯函数门禁分开。
- 不改槽位 / 目标路径的大小写，不改落盘文件名策略（槽位仍按模板 A 原样拼目标路径）。
- 所有改动只在 worktree 内；`git diff` 只含本项文件：`src/core/directory/template.ts`、`src/core/directory/template.test.ts`、`src/renderer/src/workbench/directoryOps.ts`、新增门禁与 e2e 测试文件、`.munk/code-gates.json`，以及必要的新 reason 文案/i18n 词条。完成后按常规 delivery 合入 local main。
