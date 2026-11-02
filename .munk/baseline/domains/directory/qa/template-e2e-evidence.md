covers: ac-e2e-scale, ac-e2e-classes, ac-e2e-chain, ac-e2e-rescan, ac-e2e-readonly, ac-e2e-occupied, ac-e2e-evidence-manifest, ac-e2e-committed-evidence, ac-gate-default-unchecked, ac-gate-default-unchecked-rescan, ac-gate-single-source, ac-gate-single-source-apply, ac-gate-sha-mtime, ac-gate-sha-mtime-tamper, ac-gate-cancel-zero-write, ac-gate-cancel-preabort, ac-gates-independently-runnable, ac-no-sample-evidence, ac-template-e2e-no-regression, ac-no-prod-semantics-change, ac-manifest-sixteen-gates, ac-manifest-commands-intact-sixteen, ac-gate-append-only, ac-manifest-coverage-map, ac-manifest-pin-test, ac-placed-same-content, ac-placed-conflict-candidate, ac-replan-idempotent, ac-preview-zero-write, ac-placed-row-presentation, ac-counts-single-source
标题: 模板归位真实外部目录 e2e、逐条 sha256 / mtimeSec 证据与五条模板门禁
步骤: ① 夹具：在真实 `mkdtemp` 根下建模板 A（1024 个文件槽位，最深 5 段，含中文 + 空格目录）、散乱树 B（1045 个真实文件，含同名不同内容、同名多候选、43 个未使用文件）与输出根（既有 1 个文件 + 1 个占用目录），并用用例内断言读盘核对下限。② dry-run：`previewTemplate` 扫描三方，断言 `planCounts`、两类 conflict 原因与候选数、overwrite / occupiedByDirectory、unused。③ 显式勾选：默认勾选 matched 行 + 显式勾选 1 条 overwrite 行 + 显式勾选并选候选的 1 条 content-mismatch 冲突行 + 勾选 occupied 行（被拒）；`resolveTemplatePlan` 是唯一可执行清单。④ apply：只写 executable 行，逐条读盘重算 sha256 与 `Math.floor(mtimeMs / 1000)` 与源比对，未勾选 / 占用行零写入，输出根无 `*.tmp` / 零字节文件。⑤ rescan：同一 A / B / 输出根重新 `previewTemplate`，期间写入增量为 0，已写槽位 `outcome === 'placed'`、`overwrite === false` 且默认不勾（pending / rejected 均为 0），计数与磁盘现状一致。⑥ 失败路径：`chmod 0o555` 输出根后对同一 resolved plan apply（`TemplateApplyError` + OS 码、零写入、树不变），`finally` 恢复 `0o755` 后重试成功；另起小夹具覆盖「目标被目录占用」与「文件占住父目录 → 逐条 write-failed」。⑦ 证据：e2e 写出 `manifest.json`（真实根、计数、选择、逐条 sha256/mtimeSec、断言名），并静态校验本提交清单与本文档自洽。
期望: ① 槽位 ≥1000、B 文件 ≥1000、最深 ≥4 段、中文 + 空格路径存在、三根互不相同的真实绝对路径。② matched=1002 / placed=0 / missing=20 / conflict=2 / unused=43（首次计划不含已落位行），content-mismatch 恰 1 候选、ambiguous ≥2 候选、overwrite 行与 occupied 行均存在。③ 写入 = executable = 1002 行，failed=0，verified=1002，逐条 target sha256 = source sha256、target mtimeSec = source 秒值；未勾选与占用行零写入，无 `*.tmp`。④ rescan 零写入、已写槽位 `placed` 且未勾、`placed` 数 = 首次写入数、pending / rejected 均为 0。⑤ 只读拒绝发生在第一次写入前（写 / 建目录调用 0 次、树不变、无 `*.tmp`），恢复权限后同一 plan 重试 1002 行全部通过；占用行进 rejected 且零写入，父目录被文件占住的行 `failedCount=1 / reason=write-failed`、目标不存在、阻塞文件不变。⑥ manifest 1002 行全部 ok、断言名齐全、文本不含样本挂载点，提交清单 sha256 与本文档记录一致。

## 真实根路径（本次运行的真实 mkdtemp 绝对路径）

- templateRoot: `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-template-e2e-lbOw4E/模板 A`
- incomingRoot: `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-template-e2e-lbOw4E/散乱 树 B`
- outputRoot: `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-template-e2e-lbOw4E/输出 根`

## 运行命令

- 生成/manifest 写出：`OPENCOMPARE_TEMPLATE_E2E_EVIDENCE_DIR=.munk/baseline/domains/directory/qa pnpm test src/template-e2e-real-directory.test.ts`（默认 `pnpm test` 只写 `<tmpdir>/opencompare-template-e2e-evidence/`，不写仓库）
- `template-default-unchecked`: `pnpm test src/template-gate-default-unchecked.test.ts`
- `template-single-source`: `pnpm test src/template-gate-single-source.test.ts`
- `template-sha-mtime`: `pnpm test src/template-gate-sha-mtime.test.ts`
- `template-cancel-zero-write`: `pnpm test src/template-gate-cancel-zero-write.test.ts`
- `template-e2e-real`: `pnpm test src/template-e2e-real-directory.test.ts`

## 计数

- planCounts: matched=1002 / placed=0 / missing=20 / conflict=2 / unused=43
- 模板 A 槽位：1024（matched + placed + missing + conflict）；模板 A 真实文件数 = 槽位数
- 散乱树 B 文件：1045（真实扫描，含同名不同内容 / 同名多候选候选各 1 / 2 个，以及 43 个未使用文件 = 40 个散落 + 1 个 mismatch 候选 + 2 个 ambiguous 候选）
- 写入并逐条复核：1002 行，全部 ok=true
- 选择：checked=1003，rejected=1（occupied 行被拒，零写入）
- conflictChoices: {"冲突 区/同名 不同内容.txt": "/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-template-e2e-lbOw4E/散乱 树 B/conflict/同名 不同内容.txt"}

## 五类特殊行逐条

- 输出根既有文件 → matched overwrite 行: `src/overwrite/覆盖 已有.txt` → 已写入，sourceSha256 = targetSha256，sourceMtimeSec = targetMtimeSec = 1700001000，ok=true
- 同名不同内容 → conflict (content-mismatch, 1 个候选): `冲突 区/同名 不同内容.txt` → 已写入，sourceSha256 = targetSha256，sourceMtimeSec = targetMtimeSec = 1700001002，ok=true
- 同名多候选 → conflict (ambiguous, 2 个候选): `冲突 区/同名 多候选.txt` → dry-run 计划行（未写入，符合默认不勾 / 拒绝口径）
- 缺失槽位 → missing: `缺 失/gap-0000.txt` → dry-run 计划行（未写入，符合默认不勾 / 拒绝口径）
- 输出根既有目录占用 → occupiedByDirectory: `src/占位/占用 槽位.txt` → dry-run 计划行（未写入，符合默认不勾 / 拒绝口径）
- B 未使用文件示例: `散 落/unused-0000.txt`（unused 共 43 个：1 个 content-mismatch 候选 + 2 个 ambiguous 候选 + 40 个散落文件）

## 规模与路径断言

- 最深相对路径（已写入行）: `资料 夹/第一层/第二层/深层 目录/clean-0000.txt`（5 段）
- 中文 + 空格路径示例: `notes/今天 记录/clean-0003.txt`

## 门禁 id 与命令

- `template-default-unchecked` → `pnpm test src/template-gate-default-unchecked.test.ts`
- `template-single-source` → `pnpm test src/template-gate-single-source.test.ts`
- `template-sha-mtime` → `pnpm test src/template-gate-sha-mtime.test.ts`
- `template-cancel-zero-write` → `pnpm test src/template-gate-cancel-zero-write.test.ts`
- `template-e2e-real` → `pnpm test src/template-e2e-real-directory.test.ts`

## 断言名（manifest.assertionNames，与本文件 it 名逐字一致）

- `builds a real fixture with >=1000 slots, >=1000 sources and >=4 levels`
- `classifies every designed outcome with exact counts and both conflict reasons`
- `runs dry-run -> explicit selection -> apply -> per-row sha256 / mtimeSec re-check`
- `rescans the same roots after apply with zero writes and consistent counts`
- `refuses a read-only root before writing and retries the same plan`
- `rejects a directory-occupied slot and keeps a parent-file write failure local`
- `writes a per-row manifest with the real roots and every assertion name`
- `pins the committed manifest and evidence note as self-consistent`

## manifest

- 文件：`template-e2e-manifest.json`（本目录）
- 行数：1002（>= 1000，全部 ok=true）
- sha256: ebde3260999ae07cf1ea265d0ba447d37e49f0220cb7bff22aa050aaa47c9be8
- 内容：真实 templateRoot / incomingRoot / outputRoot、planCounts、selection、按 slot 稳定排序的 rows（slot / sourcePath / targetPath / sourceSha256 / sourceMtimeSec / targetSha256 / targetMtimeSec / ok）、assertionNames；序列化文本不含样本挂载点

## 最近执行

- workItemId: wi_intake_7ad584089999fec5
- at: 2026-11-02
- status: pass
- note: 模板归位幂等（已落位分区）：e2e 1 file / 8 tests 通过，rescan 断言改为 `placed` + 零写入 + pending 0；manifest 按新 `planCounts`（含 `placed=0`）重新生成，1002 行逐条 sha256 + mtimeSec 复核仍全部 ok。只读根按既有 skipIf 口径在 root 身份下跳过。
