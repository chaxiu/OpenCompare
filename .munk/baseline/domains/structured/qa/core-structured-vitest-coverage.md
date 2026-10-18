covers: ac-core-tests
标题: src/core/structured/ 有 vitest 覆盖键序归一化、格式噪音忽略、深层路径增删改、类型变更与计数，pnpm test 全绿
步骤: 审阅 src/core/structured/diff.test.ts 与 parse 相关用例覆盖点（键序归一化、注释/缩进/尾逗号/引号噪音忽略、深层 JSON Pointer 增删改、类型变更与普通修改分列、运行时计数与过滤、非法输入报错）；运行 `pnpm test`
期望: 覆盖上述全部要点，且 `pnpm test` 全绿（既有 fixtures/其他 core 用例不回归，样本 answer key 未改）

## 最近执行

- workItemId: wi_ws_11cdd670ac9efc7c
- at: 2026-10-18
- status: pass
- note: diff.test.ts 覆盖键序归一化、JSON/YAML 格式噪音、深层 JSON Pointer 增删改、类型变更分列、运行时计数与过滤、非法输入报错；pnpm test 11 文件 / 70 用例全绿（src/core/structured 23/23）。
