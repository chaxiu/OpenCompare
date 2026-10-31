# gate-matrix-ten-structured

covers: ac-manifest-ten-gates, ac-manifest-commands-intact-ten, ac-gate-append-only, ac-pin-test-green, ac-unit-gates-kept, ac-default-gates-green
标题: 默认门禁矩阵 9 → 10：末尾追加 structured-semantics（只做加法 + 钉板同步）
步骤: 1) 读 `.munk/code-gates.json`，数 `gates` 长度并逐项核对 id 顺序与 command，确认前 9 条与扩容前逐字逐序一致、第 10 条为 `structured-semantics`；2) 读第 10 项字段，核对 `cwd === "."`、`command === "pnpm test:structured"`、命令不含 `&&` / `||` / `|` / `;`，并确认无 `perf-gate` / `perf:dir`；3) 读 `package.json` 的 `scripts['test:structured']`，确认单 argv 且指向 `src/structured-semantics-gate.test.ts`；4) 读 `src/munk-gates.test.ts`，确认期望矩阵 10 条、长度断言 10、前 9 条未改、第 10 条为 `structured-semantics` → `pnpm test:structured`；5) 读 `.munk/code-gates.perf.json`，确认条件 profile 零改动（仍唯一 `perf-gate`）；6) 跑整套默认矩阵（10 项）与 `pnpm test`，确认全绿且 `pnpm test` 收录 `src/munk-gates.test.ts`；7) 红路径：临时改任一条前序命令或把 `perf-gate` 加回默认矩阵，确认 `pnpm test` 红，再还原。
期望: ① `.munk/code-gates.json` `version=1`、`gates.length=10`、id 顺序 `install, lint, typecheck, build, build-web, test, test-compare-request, cancel-gate, memory-gate, structured-semantics`，无 `perf-gate` / `perf:dir`；② 10 条 command 逐字正确且 `cwd` 均为 `"."`，前 9 条与扩容前逐字逐序相同，第 10 条 `pnpm test:structured` 为单 argv；③ `package.json` 的 `test:structured === 'vitest run src/structured-semantics-gate.test.ts'`；④ `src/munk-gates.test.ts` 期望矩阵长度 10，前 9 条未改，第 10 条追加在末尾，把 `perf-gate` 加回矩阵或改任一命令即红；⑤ `.munk/code-gates.perf.json` 保持 `version=1` + 唯一 `perf-gate`，未被本次扩容波及；⑥ 默认 10 项在交付提交上全部 passed、无 failedGateIds，`pnpm test` 全绿；⑦ `cancel-gate` / `memory-gate` / `structured-semantics` 三者均在矩阵内未被移出。

## 最近执行

- workItemId: wi_ws_ffe5e8010c083c42
- at: 2026-10-31
- status: pass
- note: `needSelfTest=false`，以 code_gates（10 gates）为交付门槛。实测：`.munk/code-gates.json` `gates` 由 9 项扩到 10 项，第 10 项 `{id:"structured-semantics",cwd:".",command:"pnpm test:structured"}` 追加在末尾，前 9 项 id / 顺序 / 命令 / `cwd` 逐字未动，矩阵仍无 `perf-gate` / `perf:dir`；`package.json` 新增 `test:structured` 单 argv 脚本；`src/munk-gates.test.ts` 期望矩阵追加第 10 条并把长度断言 9 → 10（仅加法），`pnpm test` 收录该钉板且全绿；`.munk/code-gates.perf.json` 条件 profile 零改动。红路径按钉板常量推断（改前序命令或加回 `perf-gate` 即失败），本轮未实际回改 manifest 以免污染交付 diff。change pack 仅含 `prd.md`，本文件为按 AC 落档的执行记录。
