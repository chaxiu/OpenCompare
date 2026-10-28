# diff-ruler-scale-test-shape-kept

covers: ac-scale-constant-kept, ac-test-count-kept, ac-assertion-count-kept, ac-no-skip-or-relax
标题: 显式超时只加第三参数：358k 规模常量、用例数、断言数与逐行覆盖全部原样保留，无 skip / 抽样
步骤: 自动化：对 `src/renderer/src/components/DiffRuler.scale.test.tsx` 做改动前后对比 → `grep -n "const ROW_COUNT = 358_000"` 逐字核对、统计全文件 `358_000` 出现次数不减少 → 统计 `it(` 与 `describe(` 数量及 `diff ruler at 358k rows` 下 `it(` 数量 → 统计目标用例体内 `expect(` 次数（应为 3：`toBeDefined` / `toBeLessThanOrEqual` / `toBeGreaterThanOrEqual` 各一）与全文件 `expect(` 次数（应为 57）→ `grep -cE "it\.skip|describe\.skip|it\.todo|xit|xdescribe"` 应为 0 → 人工阅读目标用例循环体，确认仍对每个非 `same` 行逐条断言 marker 覆盖
期望: `const ROW_COUNT = 358_000` 逐字保留，全文件 `358_000` 出现次数不减少；全文件 `it(` 仍为 8 个，`diff ruler at 358k rows` 下仍为 5 个，`describe(` 数为 3（prd 原文写「仍为 4」，实测改动前后均为 3，以实测为准且本项不改 describe 结构）；目标用例体内 `expect(` 仍为 3（`toBeDefined` / `toBeLessThanOrEqual` / `toBeGreaterThanOrEqual` 各一），全文件 `expect(` 仍为 57；文件内不存在 `it.skip` / `describe.skip` / `it.todo` / `xit` / `xdescribe`；目标用例仍逐个非 `same` 行断言游标覆盖（marker 的 `data-start-row <= i <= data-end-row` 且状态同 `rows[i].status`），未改为抽样、未放宽为 `toBeTruthy()`；除 `}, 30_000)` 与新增注释外用例体无其它改动

## 最近执行

- workItemId: wi_ws_b21636d826817b53
- at: 2026-10-29
- status: pass
- note: 实测（改动后）：`it(` 8 / `diff ruler at 358k rows` 下 5 / `describe(` 3 / `expect(` 57 / 目标用例体 `expect(` 3 / `358_000` 1 处（即 `const ROW_COUNT = 358_000`）/ skip 类 grep 计数 0。`git show HEAD:` 版本对照为 `describe(` 3、`expect(` 57 —— 与改动后一致，证明只动了超时参数与注释。**prd `ac-test-count-kept` 的「describe 数仍为 4」为基线假设错误，实测恒为 3。**
