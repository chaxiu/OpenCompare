covers: ac-idempotent-dryrun-after-delete
标题: 删除组全选执行后 Dry-run 三组全空（含 copy+update 已落、删除待勾的中间态），重复一整轮仍全空
步骤: 真实临时目录 + 生产 `PlatformPort` 建一对目录（左源 / 右目标，目标侧多出待删文件，源侧多出待拷文件，另有一个待覆盖文件）→ ① 干跑断言 copy / update / delete 计数与删除默认未勾 → ② 只执行 copy + update → 再干跑（断言 copy 0 / update 0 / delete K 仍列出且默认未勾）→ ③ 删除组全选执行后干跑（三组全 0）→ ④ 对同一对目录重复一轮 ①②③，末次干跑仍三组全 0
期望: ① 计划精确为 copy 1 / update 0..N / delete K 且删除项初始全部未勾；② 执行只落 copy + update 时 `deleted === 0`，待删项仍在磁盘上并在下一次干跑中继续列出、仍默认未勾；③ 全选删除执行后 `copy.count === 0 && update.count === 0 && delete.count === 0`（不因 mtime 精度、路径分隔符或中文 / 空格路径产生幽灵条目）；④ 第二轮重复同样结果，末次干跑仍三组全空。失败信息使用独立标识 `idempotent dry-run`

## 最近执行

- workItemId: wi_intake_654321843130fa1f
- at: 2026-11-01
- status: pass
- note: `src/sync-real-gate.test.ts` 的 `describe('real-disk sync idempotent dry-run')` 1 条真实磁盘用例（`lists only the pending deletion after applying, and nothing once it is deleted`）按两轮循环断言 `idempotent dry-run: round <n> first|pending copy|update|delete` 与 `applied copy` / `applied default delete`，末次干跑三组全 0。该 AC 是 prd「同一对目录重复执行幂等」的唯一直接证据（四态来自对比树、Dry-run 空来自同步规划，两条代码路径不能互相替代）。本轮 `applySyncPreview` 新增写入后校验与链接 mtime 对齐均不进 plan，故幂等口径不受影响。
