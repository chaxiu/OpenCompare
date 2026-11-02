# 可回归门 + 真实外部文件开 / 关两态证据

## Scope

把 I#9 已交付的「换行 / 编码探测 + 归一判定 + 双栏两开关 + 状态栏原始值」用**真实磁盘文件**钉成一条可回归门，并产出可复现的数字证据。本项只加门与证据，不重做判定。

1. **真实外部文件夹具（确定性、单次生成、用后清理）**
   - 在 OS 临时目录下用固定绝对根 `join(os.tmpdir(), 'opencompare-diff-normalize-evidence')` 重新生成（先 `rm -rf` 再建）两个规模组，每组同一份逻辑文本落成六种变体：
     - `utf8-lf`（UTF-8 无 BOM + LF）
     - `utf8-crlf`（UTF-8 无 BOM + CRLF）
     - `utf8bom-lf`（`EF BB BF` + UTF-8 + LF）
     - `utf16le-crlf`（`FF FE` + UTF-16LE + CRLF）
     - `gbk-lf`（GBK + LF，含 CJK 双字节字符）
     - `utf8-crlf-mutated`（`utf8-crlf` 的副本，改掉恰好一行里的一个字符，用于「真实差异必须报」）
   - `thousand` 组：每行短文本，**恰好 1000 个逻辑行**（1000 个终止符、无尾随空行），用于 DOM 级两态与状态栏断言。
   - `five-megabyte` 组：**UTF-8 侧 ≥ 5 × 1024 × 1024 字节**且 ≥ 1000 逻辑行（长行、CJK 密集），用于真实字节级探测 / 比较 / 耗时证据；**不渲染进 DOM**（窗口化大文件渲染已有 `DiffPane` 规模断言，避免把 5 MB 拖进 jsdom）。
   - 生成全部由测试内的确定性函数完成：禁用 `Math.random()` / 时间戳 / 网络；GBK 字节来自**固定的字符→GBK 字节表**（只用 ASCII + 表内 CJK 字符），不新增编码依赖（不引 `iconv-lite`）；写出后用 `decodeText` 回读校验 GBK 变体逐字等于源文本。
2. **新可回归门（`.munk/code-gates.json` 仅加一条）**
   - 新增 gate：`id: "diff-normalize-real"`、`cwd: "."`、单 argv `pnpm test src/diff-normalize-real-gate.test.tsx`，插在既有 `diff-normalize` 之后、其余条目不动（总数 23 → 24）。
   - 门文件 `src/diff-normalize-real-gate.test.tsx`（`// @vitest-environment jsdom`）读**真实磁盘字节**，经 `PlatformPort.probeTextFile` 注入端口走已发布的 `probeTextBytes`（与 Electron / Web 平台同一个纯函数，不复制探测实现），再把会话交给真实 `Workbench` / `CodeView` 渲染。
   - 门必须同时钉住四件事：**默认开启不报差异**、**关闭后报差异**、**重新开启回到不报**、**状态栏左右原始值与开关无关**。
3. **证据产物（真实运行产出，不手填）**
   - 门在 stdout 打印一行 `OPENCOMPARE_DIFF_NORMALIZE_EVIDENCE <JSON>`；设置 `OPENCOMPARE_EVIDENCE_OUT=<path>` 时把同一份 JSON 原样落盘（默认不写仓内文件）。
   - 提交 `docs/evidence/diff-normalize-real-files.json`（机器可读）与 `docs/evidence/diff-normalize-real-files.md`（人读摘要）：两组变体的**绝对路径、生成命令、字节数、sha256、行数、编码 / 换行标签**，以及每对比较的开 / 关两态 `differenceCount` / `blocks.length` / 非 same 行数 / 行内片段数、状态栏四个原始值、`thousand` 组点击 / 空格切换耗时、`five-megabyte` 组重算耗时与可操作性读数。
   - 门自身会回读该 JSON，校验确定性字段（变体 `bytes` / `sha256`、各状态 `differenceCount` / `blocks.length`）与本次运行一致；耗时字段不参与比对，避免机器差异导致假红。
4. **门清单钉同步**
   - 更新 `src/munk-gates.test.ts`：默认矩阵 23 → 24 条、`EXPECTED_GATES` 增加新门、`description` 增加一条覆盖说明；既有模板门 tail / 末两项 / 单 argv / 禁 perf 断言全部保留且继续通过。
5. **全量回归**
   - 跑完 `.munk/code-gates.json` 全部 24 条门（install / lint / typecheck / build / build-web / test / 既有 17 条 + 新门 + test-debt-gate），全绿。

## Acceptance Criteria

- ac-gate-single-entry: `.munk/code-gates.json` 恰好新增一条 gate `diff-normalize-real`，`cwd === "."`、命令逐字为 `pnpm test src/diff-normalize-real-gate.test.tsx` 且不含 `&&` / `||` / `|` / `;`；总条数为 24；其余 23 条的 id 与命令逐字不变（仅 `description` 追加说明）。
- ac-gate-manifest-pin: `src/munk-gates.test.ts` 的 `EXPECTED_GATES` 反映 24 条且含新门；原有「9 条模板门切片」「末两项 = `verify-release-gate` / `test-debt-gate`」「禁 `perf-gate` / `perf:dir`」断言全部保留并通过。
- ac-real-fixtures-on-disk: 门运行时两组共 6 个变体文件真实落盘（含 `.txt` 扩展名，走代码双栏）；每个文件用独立 `node:crypto` 对磁盘原始字节重算的 sha256 与探测结果 `sha256` 相等，`bytes` 等于 `statSync().size` 且大于 0。
- ac-fixture-labels: 六个变体的探测标签逐一对上：`utf8-lf` / `utf8-crlf` / `utf8bom-lf` → `UTF-8` / `UTF-8` / `UTF-8 BOM`；`utf16le-crlf` → `UTF-16LE`；`gbk-lf` → `GBK`；换行分别 `LF` / `CRLF` / `LF` / `CRLF` / `LF`；同组所有变体解码文本逐字相等。
- ac-thousand-scale: `thousand` 组每个文件恰有 1000 个逻辑行（`detectNewline` 的终止符计数为 1000，且解码文本不以空行结尾），并用于 DOM 两态与状态栏断言。
- ac-five-mb-scale: `five-megabyte` 组 `utf8-*` 变体文件字节数 ≥ `5 * 1024 * 1024`，且逻辑行数 ≥ 1000。
- ac-default-on-zero: 两组中每一对「同文本不同变体」在默认开关（`resolveComparisonSwitches({})`，两项均开）下 `differenceCount === 0`、`blocks.length === 0`、`identical === true`、无非 `same` 行。
- ac-strict-off-reports: 同两开为 `false` 后：`utf8-crlf` vs `utf8-lf`（仅换行不同）`blocks.length >= 1` 且 `differenceCount >= 1`、`normalization.encoding.byteDifference === false`；`utf8bom-lf` vs `utf8-lf`（仅编码不同）`blocks.length === 0`、`byteDifference === true`、`differenceCount === 1`；`utf16le-crlf` vs `gbk-lf`（换行 + 编码都不同）`differenceCount >= 1`。
- ac-toggle-roundtrip: 在真实 `thousand` 组配对上连续「默认 → 关闭两项 → 重新开启」，`[data-code-diff-count]` 依次为 `0` / 大于 0 / `0`，且每次读数恒等于同一次 `LineDiffComparison.differenceCount`；`blocks.length` 同步为 `0` / 大于 0 / `0`。
- ac-status-raw-invariant: 用真实 `thousand` 组「`utf8-crlf` ↔ `gbk-lf`」打开双栏后，状态栏四个值按序为 `['CRLF','UTF-8','LF','GBK']`；切换两个开关各两次后四个值文本逐字不变。
- ac-real-difference-visible: `utf8-crlf-mutated` vs `utf8-lf` 在默认开与两项关闭两种状态下 `differenceCount >= 1` 且存在非 `same` 行（真实字符差异任何组合都不得被归一吞掉）。
- ac-operability: 真实 `thousand` 组配对上两个开关均为可聚焦 `role="switch"`；单击与 `keydown` Space 各只翻转一次、`aria-checked` 与生效值一致；1000 行配对渲染出的两栏行数相等且 > 0（DOM 可操作性，非窗口点击）。
- ac-elapsed-recorded-budget: `five-megabyte` 组的探测、默认比较、关闭后重算耗时均以 `performance.now()` 计量并写入证据；关闭后重算耗时断言 `< 10_000 ms`（显式常量，与 vitest 超时分开）；`thousand` 组切换耗时也记录。
- ac-evidence-artifact: `docs/evidence/diff-normalize-real-files.json` 与 `.md` 已提交，含生成命令（`OPENCOMPARE_EVIDENCE_OUT=docs/evidence/diff-normalize-real-files.json pnpm test src/diff-normalize-real-gate.test.tsx`）、临时根绝对路径、每个变体的绝对路径 / 字节数 / sha256 / 行数 / 标签、两组各状态的 `differenceCount` / `blocks` / 非 same 行数 / 行内片段数、状态栏四值、切换与重算耗时；数字来自一次真实运行，非手填。
- ac-evidence-pinned: 门回读 `docs/evidence/diff-normalize-real-files.json`，断言其中的变体 `bytes` / `sha256` 与各状态 `differenceCount` / `blocks.length` 与本轮现场运行逐项相等（耗时与绝对路径不参与比对）。
- ac-no-prod-change: 若门未暴露实现缺陷，`src/core/text/**`、`src/renderer/src/views/CodeView.tsx`、`src/renderer/src/workbench/**`、`src/main/platform/**`、`src/preload/**`、`src/shared/**` 相对基线零 diff；`package.json` 无新增依赖；无网络请求或外部服务。
- ac-test-debt-declared: `.munk/baseline/test-debt.json` 仅通过 `growth[]` 声明 `repoTestLines` 从已提交 ceiling `43999` 升到实测值（增量 ≤ 400，`addedCases` 等于新增用例数）；`floors` 不下调、`literalWhitelist` 不放宽；`node scripts/test-debt-gate.mjs` 绿。
- ac-no-sha-literal: 新增 `.ts` / `.tsx`（门、夹具辅助、`munk-gates` 测试）中不出现任何 64 位小写 hex sha256 字面量（全部运行时计算），`test-debt-gate` 的 sha 字面量扫描零命中（既有两条标准向量除外）。
- ac-all-gates-green: `.munk/code-gates.json` 全部 24 条门通过（含 `install`、`lint`、`typecheck`、`build`、`build-web`、`test` 与新增门），`pnpm test` 全量零失败、无跳过新增用例。

## Non-Goals

- 不改任何比较 / 探测 / 归一 / 状态栏判定：不改 `src/core/text/{probe,normalize,diff,merge}.ts`、`probeStatus.ts`、`CodeView.tsx`、`Workbench.tsx`、`PlatformPort` 与 preload 白名单；若门真的暴露缺陷，只允许最小修复并在证据中记录缺陷、修复与受影响断言。
- 不新增第二条 gate、不拆门文件、不改既有 23 条门的 id / 命令 / cwd；不新增 `pnpm` script（复用 `pnpm test <file>`），不改 `vitest.config.mts`。
- 不新增依赖（尤其不引 `iconv-lite` 或任何 GBK 编码器）；不引入网络 / 云服务 / 外部二进制；不下载夹具。
- 不做真实窗口点击 / 截图 / 真机 / 浏览器验收（`needSelfTest=false`）；最终窗口可操作性归 Product Ops；本项只做 jsdom + 真实磁盘字节。
- 不把 5 MB 组渲染进 DOM，不改 `DiffPane` 的窗口化阈值或行高。
- 不改导出 / 报告 / 快照 / 目录四态 / 三向合并；不做转码写回。
- 不 bump 版本，不改 README / CHANGELOG / release notes / tag / Release。
- 不为凑绿放宽 lint / typecheck / 测试断言，不改 `scripts/test-debt-gate.mjs` 判定口径，不动 `src/test/sharedHarness.tsx` 的 400 行预算。

## Implementation Constraints

- **门文件规模**：新增测试行数受 `test-debt.json` 单次 `growth` ≤ 400 行限制。把夹具生成（六变体、GBK 表、写盘 / 清理、磁盘端口包装）放到非 `.test.*` 的辅助模块（如 `src/test/diffNormalizeRealFixture.ts`，不计入 `repoTestLines`），`src/diff-normalize-real-gate.test.tsx` 只留断言与 DOM 流程；不要动 `src/test/sharedHarness.tsx`。
- **真实字节口径**：夹具用 `writeFileSync` 写 `Uint8Array`（UTF-16LE 手写 code unit、UTF-8 BOM 手工前缀、GBK 走固定表），探测一律 `probeTextBytes(readFileSync(path))`；GBK 变体必须先用 `decodeText` 回读逐字等于源文本，表错立即红。运行时不支持 `TextDecoder('gbk')` 时直接失败（不得降级成 `Unknown` 蒙混）。
- **平台端口**：门内以 `createWebPlatformPort()` 为底，仅覆盖 `probeTextFile`（读真实字节 + `probeTextBytes`）、`readTextFile`、`statPath`（`fs.statSync` → `file` / `directory` / `missing`）；其余方法沿用基座，保证 `Workbench` 新建对比对话框能识别真实绝对路径。`probeTextFile` 的返回值形状必须与 `TextFileProbe` 一致（含 `path`）。
- **单一读数**：门内所有差异数字来自同一次 `diffLineTextsWithFacts` / `diffLineTexts` 调用的 `rows` / `blocks` / `normalization` / `differenceCount`；DOM 侧的 `[data-code-diff-count]` 必须与该值逐字相等，禁止另写一套计数（`docs/lessons.md` §9）。
- **DOM 契约**：只使用既有 `[data-code-switch="ignore-newline"|"ignore-encoding"]`、`[data-code-diff-count]`、`[data-code-diff-bytes]`、`[data-diff-row]`、`footer[data-shell-level="status"]` 与 `zh` 词典键（`shell.status.leftNewline` / `leftEncoding` / `rightNewline` / `rightEncoding`），不为本项在生产代码新增测试钩子。
- **5 MB 组只做核心级**：`five-megabyte` 组用 `diffLineTextsWithFacts` 直接比较并从 `rows` 统计非 same 行与行内片段数；不渲染 `Workbench`，避免 1000+ 长行的 jsdom 渲染进入门耗时。`thousand` 组才走 `Workbench` DOM 全链路。
- **阈值常量**：`FIVE_MIB = 5 * 1024 * 1024`、`THOUSAND_LINES = 1000`、`STRICT_RECOMPUTE_BUDGET_MS = 10_000`、`TEST_TIMEOUT_MS`（vitest 超时）各自命名并分开断言；不得用"实测通过"代替上限。
- **时间与清理**：`beforeAll` 建根、`afterAll` `rmSync(root, { recursive: true, force: true })`；不向仓库写临时文件，`OPENCOMPARE_EVIDENCE_OUT` 只在显式设置时写指定路径。
- **证据重生成**：先 `OPENCOMPARE_EVIDENCE_OUT=docs/evidence/diff-normalize-real-files.json pnpm test src/diff-normalize-real-gate.test.tsx` 产出 JSON，再据此写同目录 `.md` 摘要（绝对路径、命令、字节 / sha256 / 行数、两态数字、耗时），最后跑全量门；证据 JSON 的确定性字段必须与门内回读断言一致。
- **门清单顺序**：新门插在既有 `diff-normalize` 之后即可保持 `src/munk-gates.test.ts` 的模板门 tail 与末两项切片不变；仍须同步 `EXPECTED_GATES` 与「23 → 24」两处计数。`description` 只用一句话点明覆盖（默认开 / 关闭报差异 / 开启不报 / 状态栏原文不变）与新门文件，不删除既有覆盖说明。
- **测试债**：按 `test-debt.json` 的 `growth[]` 声明（`metric: repoTestLines`、`from` 必须等于合入后已提交的 `43999`、`to` 为实测值、`reason` 写明本项、`addedCases` 等于新增 `it` 数）；直接改 `floors` 或放宽 `literalWhitelist` 视为失败。
- **不新增 script**：门命令走 `pnpm test <file>`；`install` 仍是矩阵首条，不改包管理器版本与锁文件（除既有 install 行为外）。
- **文档边界**：只新增 `docs/evidence/diff-normalize-real-files.{json,md}`；不碰 README / CHANGELOG / release notes / `docs/lessons.md` / `AGENTS.md`。
