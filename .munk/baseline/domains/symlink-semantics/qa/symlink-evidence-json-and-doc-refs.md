# symlink-evidence-json-and-doc-refs

covers: ac-symlink-evidence-json-valid, ac-doc-refs-resolve
标题: 符号链接 footer 证据收口：两份 `symlink-footer-*.json` 去掉标记前缀成为合法 JSON（数字不动），harness 的 `OPENCOMPARE_EVIDENCE_OUT` 只落纯 JSON、标记行只走 stdout，`docs/symlink-no-follow.md` 的 `.raw.log` 引用改为可解析的真实路径
步骤: `node -e "const {readFileSync}=require('fs'); for (const f of ['docs/evidence/symlink-footer-old.json','docs/evidence/symlink-footer-new.json']) console.log(f, JSON.parse(readFileSync(f,'utf8')).fileCount)"`；读 `scripts/symlink-evidence-format.ts` 与 `scripts/measure-symlink-footer.evidence.test.ts` 的写出分支；读 `src/main/symlink-evidence.test.ts`；读 `docs/symlink-no-follow.md` 第 6 节并按反引号提取所有 `docs/...` 引用后逐个 `existsSync`；`grep -c '\.raw\.log' docs/symlink-no-follow.md`；`pnpm test`
期望: ① 两份 JSON 均 `JSON.parse` 成功，`fileCount` 分别为 `1338294` / `752479`，四态之和等于 `fileCount`，内容数字、`skipped` 与 `linkCensus` 未被改写。② `formatSymlinkEvidence(report)` 同时产出纯 JSON（`json`）与 `OPENCOMPARE_SYMLINK_EVIDENCE <同一 payload>`（`handoff`）；harness 总把 `handoff` 写 stdout，`OPENCOMPARE_EVIDENCE_OUT` 存在时只写 `json`，下次测量不会再写出带前缀的非法 JSON。③ 入库文件与 `formatSymlinkEvidence(report).json` 逐字节一致（防手改漂移）。④ `docs/symlink-no-follow.md` 全文 `.raw.log` 0 命中；其中每个 `docs/...` 引用在磁盘上存在（测试遍历 `existsSync` 断言），第 6 节对原始输出的描述是 stdout 标记行 + 两份 JSON，而不是不存在的 `.raw.log`。⑤ `pnpm test` 全绿；不重跑真实目录测量、不改 1,338,294 / 752,479 与差额归因、不改扫描 / 快照 / 渲染代码。

## 最近执行

- workItemId: wi_ws_78db9f76d9541e6e
- at: 2026-10-22
- status: pass
- note: 本轮 `needSelfTest=false`，跳过 UI 自测，以 code_gates 为交付门槛（Host 记录 install / lint / typecheck / build / build-web / test 全部退出码 0）。静态核对：`JSON.parse` 两份证据文件得到 `fileCount` 1338294 / 752479；`docs/symlink-no-follow.md` 的 `docs/...` 引用集合为 2 条且全部存在，`.raw.log` 0 命中；`scripts/measure-symlink-footer.evidence.test.ts` 的写出路径已改为 `if (out !== undefined) await writeFile(out, json, 'utf8'); process.stdout.write(handoff)`；新增 `src/main/symlink-evidence.test.ts` 4 条覆盖可解析、逐字节一致、OUT 纯 JSON / stdout 带标记、文档引用可解析。未重跑真实目录测量，未新增 `.raw.log` 文件。
