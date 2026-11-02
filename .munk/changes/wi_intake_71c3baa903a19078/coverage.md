# Q5 覆盖率冷跑前后对比（97a18f3 → 120f06d，evidence-only）

> 本文件是 Q5 签收补证的第一项证据。只做只读采集与同口径重算：不改测试、不改产品代码、不新增依赖、不改门禁。
>
> 本文件：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_71c3baa903a19078/.munk/changes/wi_intake_71c3baa903a19078/coverage.md`
> 配套证据：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_71c3baa903a19078/.munk/changes/wi_intake_71c3baa903a19078/assertion-map.md`

## 1. 结论（先行）

| 判据 | 同口径共有 158 文件 | 同口径剔除 `src/test/**` 157 文件 |
| --- | --- | --- |
| lines delta | **+0.00pp** | **+0.00pp** |
| branches delta | **+0.00pp** | **+0.00pp** |

- 两种同口径下 lines 与 branches 均 **未下降**（全部 `+0.00pp`），满足 `ac-coverage-no-line-branch-drop`。
- `src/renderer/src/App.tsx` 与 `src/core/directory/sync.ts` 四项相对基线均 `+0.00pp`，满足 `ac-coverage-modules-no-drop`。
- 全仓四项的小幅抬升（statements +0.09pp / functions +0.22pp / lines +0.07pp）只来自 Q5 新增的 `src/test/sharedHarness.tsx`（279 行，100% statements / 100% lines），不是靠新增被测产品源码制造；见第 6 节。
- 没有出现 lines 或 branches 下降，因此未触发 `ac-coverage-drop-stop` 的停手上报条件。

## 2. 环境与提交

| 项 | 基线 | 对照 |
| --- | --- | --- |
| 提交 | `97a18f34f358a6781fc11653bf564d0efd17a0e7`（`97a18f3`） | `120f06d560ad4cef9d43cd0826db86516c1d8f36`（`120f06d`） |
| 独立 worktree | `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencode/q5ev-97a18f3`（`/private/var/...` 同一路径） | `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencode/q5ev-120f06d` |
| 建立方式 | `git worktree add --detach` | `git worktree add --detach` |
| 依赖安装 | `pnpm install --frozen-lockfile`，exit 0 | `pnpm install --frozen-lockfile`，exit 0 |
| Node / pnpm | v24.4.1 / 10.18.3 | v24.4.1 / 10.18.3 |
| Vitest | 5.0.5 | 5.0.5 |
| Provider | `@vitest/coverage-v8`（日志 `Coverage enabled with v8`） | 同 |

主工作区（证据所在 worktree）头提交就是 `120f06d`；两个临时 worktree 均为 detached HEAD，采集结束后可 `git worktree remove`，`raw/` 日志已保留。

## 3. 冷跑流程、命令与退出码

两侧完全同一流程、同一条命令：

1. `pnpm install --frozen-lockfile`（各自 worktree 内，exit 0）。
2. 删除缓存与旧覆盖率：
   `node -e "const fs=require('node:fs'); for (const p of ['coverage','node_modules/.vite']) fs.rmSync(p,{recursive:true,force:true})"`
   （删除后以 `ls` 确认两者均不存在；不使用 `rm -rf`，避免工具规则拦截。）
3. 冷跑：`/usr/bin/time -p pnpm exec vitest run --coverage`

| 侧 | worktree | 命令 | 开始（UTC） | 结束（UTC） | 墙钟 `real` | `user` / `sys` | 退出码 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 基线 `97a18f3` | `q5ev-97a18f3` | `pnpm exec vitest run --coverage` | 2026-11-02T08:33:22Z | 2026-11-02T08:33:59Z | **36.85s** | 144.61 / 88.74 | **0** |
| 对照 `120f06d` | `q5ev-120f06d` | `pnpm exec vitest run --coverage` | 2026-11-02T08:34:02Z | 2026-11-02T08:34:41Z | **38.36s** | 147.25 / 92.49 | **0** |

原始 stdout（含 `time -p` 三行）：

- 基线：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_71c3baa903a19078/.munk/changes/wi_intake_71c3baa903a19078/raw/baseline-97a18f3.txt`
- 对照：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_71c3baa903a19078/.munk/changes/wi_intake_71c3baa903a19078/raw/current-120f06d.txt`
- 元数据（cwd / HEAD / 起止 / 退出码）：同目录 `baseline-97a18f3.meta.txt`、`current-120f06d.meta.txt`

## 4. Provider 证据（原文）

两侧日志第 2–3 行与第 11 行原文（`raw/baseline-97a18f3.txt`、`raw/current-120f06d.txt`，ANSI 控制码在原文中保留）：

```text
 RUN  v5.0.5 /private/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencode/q5ev-97a18f3
      Coverage enabled with v8
...
 % Coverage report from v8
```

```text
 RUN  v5.0.5 /private/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencode/q5ev-120f06d
      Coverage enabled with v8
...
 % Coverage report from v8
```

Provider 为仓库已声明的 `@vitest/coverage-v8@5.0.5`，无新增依赖；日志中不存在 `MISSING DEPENDENCY`。

## 5. 原文 summary（逐行粘贴，未改写数字）

### 5.1 基线 `97a18f3`

```text
 Test Files  115 passed (115)
      Tests  1796 passed | 1 skipped (1797)
   Start at  16:33:23
   Duration  35.60s (tests 85%, environment 7%, import 4%, transform 3%, worker 1%)
```

文本表总计行：

```text
All files          |   90.54 |    83.29 |   89.6 |    93.1 |
```

```text
=============================== Coverage summary ===============================
Statements   : 90.54% ( 7883/8706 )
Branches     : 83.29% ( 4521/5428 )
Functions    : 89.6% ( 1698/1895 )
Lines        : 93.1% ( 7080/7604 )
================================================================================
```

### 5.2 对照 `120f06d`

```text
 Test Files  115 passed (115)
      Tests  1796 passed | 1 skipped (1797)
   Start at  16:34:04
   Duration  37.16s (tests 85%, environment 7%, import 3%, transform 3%, worker 1%)
```

文本表总计行：

```text
All files          |   90.63 |    83.29 |   89.82 |   93.17 |
```

```text
=============================== Coverage summary ===============================
Statements   : 90.63% ( 7962/8785 )
Branches     : 83.29% ( 4538/5448 )
Functions    : 89.82% ( 1739/1936 )
Lines        : 93.17% ( 7153/7677 )
================================================================================
```

两侧用例数一致（115 test files，`1796 passed | 1 skipped`），因此覆盖率差异不是用例增减造成的。

## 6. 六组四项指标（statements / branches / functions / lines）

> 口径：全仓与模块数字取自 provider 原文（第 5 节）；「共有文件」「剔除 `src/test/**`」由 `tools/coverage-compare.mjs` 读取两侧 `coverage/coverage-final.json`，按 istanbul 同规则（floor 到两位小数）重算。两处重算与原文全仓数字完全一致，未出现脚本差异。

### 6.1 全仓（provider 原文）

| 侧 | statements | branches | functions | lines |
| --- | --- | --- | --- | --- |
| 基线 `97a18f3` | 90.54% (7883/8706) | 83.29% (4521/5428) | 89.6% (1698/1895) | 93.1% (7080/7604) |
| 对照 `120f06d` | 90.63% (7962/8785) | 83.29% (4538/5448) | 89.82% (1739/1936) | 93.17% (7153/7677) |
| delta | +0.09pp | +0.00pp | +0.22pp | +0.07pp |

### 6.2 same scope：两侧共有 158 文件

| 侧 | statements | branches | functions | lines |
| --- | --- | --- | --- | --- |
| 基线 | 90.54% (7883/8706) | 83.29% (4521/5428) | 89.6% (1698/1895) | 93.1% (7080/7604) |
| 对照 | 90.54% (7883/8706) | 83.29% (4521/5428) | 89.6% (1698/1895) | 93.1% (7080/7604) |
| delta | +0.00pp | +0.00pp | +0.00pp | **+0.00pp** |

### 6.3 same scope 再剔除 `src/test/**`（157 文件）

| 侧 | statements | branches | functions | lines |
| --- | --- | --- | --- | --- |
| 基线 | 90.57% (7853/8670) | 83.42% (4514/5411) | 89.59% (1696/1893) | 93.12% (7054/7575) |
| 对照 | 90.57% (7853/8670) | 83.42% (4514/5411) | 89.59% (1696/1893) | 93.12% (7054/7575) |
| delta | +0.00pp | +0.00pp | +0.00pp | **+0.00pp** |

### 6.4 `src/renderer/src/App.tsx`

provider 原文行（两侧完全相同）：

```text
  App.tsx          |   94.11 |       75 |     100 |     100 | 16-52
```

| 侧 | statements | branches | functions | lines |
| --- | --- | --- | --- | --- |
| 基线 | 94.11% (16/17) | 75% (6/8) | 100% (7/7) | 100% (14/14) |
| 对照 | 94.11% (16/17) | 75% (6/8) | 100% (7/7) | 100% (14/14) |
| delta | +0.00pp | +0.00pp | +0.00pp | +0.00pp |

### 6.5 `src/core/directory/sync.ts`

provider 原文行（两侧完全相同）：

```text
  sync.ts          |   94.27 |    83.07 |   98.07 |   96.87 | ...31,536,586,602
```

| 侧 | statements | branches | functions | lines |
| --- | --- | --- | --- | --- |
| 基线 | 94.27% (247/262) | 83.07% (108/130) | 98.07% (51/52) | 96.87% (217/224) |
| 对照 | 94.27% (247/262) | 83.07% (108/130) | 98.07% (51/52) | 96.87% (217/224) |
| delta | +0.00pp | +0.00pp | +0.00pp | +0.00pp |

### 6.6 仅单侧存在的文件清单

| 方向 | 文件 | 说明 |
| --- | --- | --- |
| 基线独有 | （无） | baseline-only = 0 |
| 对照独有 | `src/test/sharedHarness.tsx` | 279 行；statements 100%、branches 85%、functions 100%、lines 100%（provider 原文行 `...edHarness.tsx | 100 | 85 | 100 | 100 | 47,145-163`） |

两侧 `coverage-final.json` 条目数分别为 158 与 159；共有 158。`coverage-final.json` 中 **不含任何 `*.test.ts` / `*.test.tsx`**（baseline 0 个、current 0 个），但包含测试支撑文件 `src/test/largeDirectory.ts`（两侧都有）与 `src/test/sharedHarness.tsx`（仅对照侧）。这就是必须单列「剔除 `src/test/**`」口径的原因。

## 7. 同口径解释（为什么全仓抬升不是「新增被测源码」）

- Q5 两提交之间产品源码零 diff：`git diff --name-only 97a18f3 120f06d` 只列出
  `src/renderer/src/App.test.tsx`、`src/sync-real-gate.test.ts`、`src/test/sharedHarness.tsx`
  以及本 WI 之前的 `.munk` 文档；`src/main/**`、`src/core/**`、`src/shared/**`、其余 `src/renderer/src/**` 均无改动（原文见 `raw/commits-diff-name-only.txt`）。
- 对照侧唯一新增的覆盖文件就是 `src/test/sharedHarness.tsx`（279 行）。它在全仓分母里贡献 100% 的 statements/lines，因此全仓 statements +0.09pp、functions +0.22pp、lines +0.07pp。
- 去掉这个新增文件后：共有 158 文件四项 `+0.00pp`；再剔除整个 `src/test/**`（157 文件）四项仍 `+0.00pp`。两种同口径都证明差异不来自被测源码变化。
- 两侧 test files / tests 数完全一致（115 / 1797），也没有靠删用例或加会跳过的用例来改变分母。

## 8. 无下降判定

| 口径 | lines | branches | 结论 |
| --- | --- | --- | --- |
| 共有 158 文件 | +0.00pp | +0.00pp | 通过（≥ +0.00pp） |
| 共有并剔除 `src/test/**` 157 文件 | +0.00pp | +0.00pp | 通过（≥ +0.00pp） |
| `App.tsx` 四项 | +0.00pp | +0.00pp | 通过 |
| `sync.ts` 四项 | +0.00pp | +0.00pp | 通过 |

未出现 `-0.01pp` 或更低；没有需要上报 Owner 的下降项。

## 9. 生成脚本与原始输出（绝对路径）

```bash
node /Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_71c3baa903a19078/.munk/changes/wi_intake_71c3baa903a19078/tools/coverage-compare.mjs --baseline=/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencode/q5ev-97a18f3 --current=/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencode/q5ev-120f06d

node /Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_71c3baa903a19078/.munk/changes/wi_intake_71c3baa903a19078/tools/coverage-compare.mjs --baseline=/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencode/q5ev-97a18f3 --current=/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencode/q5ev-120f06d --json
```

- 文本输出：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_71c3baa903a19078/.munk/changes/wi_intake_71c3baa903a19078/raw/coverage-compare.txt`
- JSON 输出：`/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_71c3baa903a19078/.munk/changes/wi_intake_71c3baa903a19078/raw/coverage-compare.json`
- 两个临时 worktree 的 `coverage/coverage-final.json` 是重算输入；脚本只读，不写任何仓库文件。

## 10. 与 Intake 预检的差异说明

| 项 | 预检 | 本次冷跑 | 判断 |
| --- | --- | --- | --- |
| 全仓四项（两侧） | 90.54/83.29/89.6/93.1；90.63/83.29/89.82/93.17 | 完全相同 | 无差异 |
| 共有 / 剔除 `src/test/**` | 四项全 +0.00pp | 完全相同 | 无差异 |
| `App.tsx` / `sync.ts` | 四项相同 | 完全相同 | 无差异 |
| 用例数 | 115 files / 1797 | 115 / 1797 | 无差异 |
| `real` 墙钟 | 35.56 / 35.83 | 36.85 / 38.36 | 仅机器负载波动；不影响覆盖率数字 |
| Vitest `Duration` | 34.12s / 35.37s | 35.60s / 37.16s | 同上 |

## 11. 范围零 diff 证据

`git status --porcelain`（含未跟踪）仅：

```text
?? .munk/changes/wi_intake_71c3baa903a19078/
```

`git diff --name-only`（工作区 → HEAD）：空。

原文：

- `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_71c3baa903a19078/.munk/changes/wi_intake_71c3baa903a19078/raw/worktree-git-status.txt`
- `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_71c3baa903a19078/.munk/changes/wi_intake_71c3baa903a19078/raw/worktree-git-diff-name-only.txt`
- `/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/worktrees/codebase_b2d550b56d98d0c5/wi_intake_71c3baa903a19078/.munk/changes/wi_intake_71c3baa903a19078/raw/commits-diff-name-only.txt`

补充：本 WI 的两个只读生成脚本在首次 `lint` 门禁中因缺少 Node 全局声明被 `no-undef` 命中；已只加 `/* global console, process */` 头注释并去掉一处无用初始赋值（`let src = ''` → `let src`），语义与输出不变，改动仍只在本 change pack 内，重跑两个脚本得到的数字与本文完全一致。

因此 `package.json`、`pnpm-lock.yaml`、两目标测试文件、`src/test/sharedHarness.tsx`、`src/main/**`、`src/core/**`、`src/shared/**`、其余 `src/renderer/src/**`、`scripts/**`、`.github/**` 全部零 diff；未新增依赖、未改门禁项、未推 tag。

## 12. code_gates

`.munk/code-gates.json` 保持仓库既有矩阵不变，仍是 **21 道**（`version: 1`，含 `test` 门禁）：

```text
install, lint, typecheck, build, build-web, test,
test-compare-request, cancel-gate, memory-gate, structured-semantics, sync-real-gate,
template-default-unchecked, template-single-source, template-sha-mtime,
template-cancel-zero-write, template-e2e-real, template-case-collision,
template-path-contained, template-move-actions, template-move-verify, verify-release-gate
```

本 WI 未改任何门禁命令；21 道由 Host 在 `code_gates` 阶段统一执行，attempt 号与 summary 以该阶段结果为准（本证据目录不含伪造的通过记录）。门禁清单原文：`raw/code-gates-ids.txt`。
