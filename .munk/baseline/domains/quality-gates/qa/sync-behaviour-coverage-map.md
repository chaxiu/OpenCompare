# sync-behaviour-coverage-map

covers: ac-manifest-coverage-map, ac-manifest-pin-test, ac-coverage-map-diff-scope, ac-manifest-eleven-gates, ac-manifest-commands-intact-eleven, ac-default-gates-green
标题: 默认矩阵 `description` 承载「行为 → 门禁 id / 测试文件」覆盖映射，并由 `src/munk-gates.test.ts` 静态钉住（矩阵形状与 `package.json` 零变更）
步骤: 1) 读 `.munk/code-gates.json`：核对 `version === 1`、`gates.length === 11`、id 顺序与 11 条 command / `cwd` 与既有逐字一致、不含 `perf-gate`；2) 在 `description` 中定位四条行为标记 `mirror delete opt-in` / `idempotent dry-run` / `mtime and relative structure preserved` / `link mtime alignment`、反引号门禁 id `sync-real-gate` / `test`、测试文件路径 `src/sync-real-gate.test.ts` / `src/renderer/src/views/directorySyncDialog.test.tsx`，确认文案为英文；3) 读 `src/munk-gates.test.ts` 的新增静态用例，确认它只读 manifest + `node:fs` `existsSync`（不写临时目录、不启 Electron、不联网），断言四条标记、两个门禁 id 存在且被 `description` 点名、两个文件路径被点名且在 `process.cwd()` 下真实存在；4) 跑 `pnpm test`，确认该钉板被既有 vitest include 收录且全绿，原有 11 项形状 / perf 断言不变；5) 红路径核对（可临时改后还原）：从 `description` 删掉任一标记或任一测试文件路径，`pnpm test` 应变红；6) 核对 `git diff --name-only` 仅含 `.munk/code-gates.json`、`src/munk-gates.test.ts` 与被索引的行为域测试文件及该 WI change pack；`package.json`、`.munk/code-gates.perf.json` 零 diff；7) 不跑 `pnpm perf:gate` / `perf:dir`，不打包、不做真机采样。
期望: ① 矩阵仍恰 11 项、id / 顺序 / command / `cwd` 逐字不变、无 `perf-gate`，`package.json`（含 scripts）与条件 profile 零改动；② `description` 含四条行为标记 + `sync-real-gate` / `test` 两个门禁 id + 两个测试文件路径，且保持英文（覆盖标记稳定、可搜索）；③ 钉板用例断言标记 / id / 路径出现与两个文件真实存在，映射漂移或测试文件缺失即红；④ 行为本体仍由 `domains/directory` 的真实磁盘 / jsdom 断言守护，本映射只证明「清单里有可点名落点」，不替代门禁内容；⑤ `pnpm test` 与 11 项默认矩阵全绿，无 skip / 删除 / 放松的既有断言。

## 最近执行

- workItemId: wi_intake_054f9f070b2632cd
- at: 2026-11-01
- status: pass
- note: `needSelfTest=false`，以 code_gates（11 gates）为交付门槛。实测 `.munk/code-gates.json` `gates` 仍 11 项、命令与 `cwd` 逐字未动，`description` 在原「single argv / install-build separate」口径后追加四条行为 → 门禁 id / 测试文件映射（第 1 / 4 条映射 `sync-real-gate` + `test`，第 2 / 3 条只映射 `sync-real-gate`）；`src/munk-gates.test.ts` 新增 `maps the four single-direction mirror sync behaviours onto real gate files`（标记 `toLowerCase().contains`、门禁 id 以反引号形式出现、两个文件路径出现并 `existsSync(resolve(process.cwd(), path))`），原矩阵形状与 perf 断言原样保留；`package.json` / `.munk/code-gates.perf.json` 零改动。`pnpm test` 96 files / 1455 passed + 1 skipped、28.98s；11 项门禁全部 passed。change pack 仅含 `prd.md`，本文件为按 AC 落档的执行记录。
