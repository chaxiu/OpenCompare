covers: ac-link-seam
标题: 链接读链 / 建链平台缝——读字面 target 不解析、建链原样落盘、Web 运行时按契约拒绝
步骤: `PlatformPort` 表面核对 `readSymbolicLink(path)` / `createSymbolicLink(target, path)` 与 `PLATFORM_CHANNELS` 的 `platform:read-symbolic-link` / `platform:create-symbolic-link` 单一来源 → 在真实临时目录（`mkdtemp`）经生产 IPC handler 建一个相对目标链接、一个悬空链接与一个指向目录的链接 → `readSymbolicLink` 逐条读回 → 对已存在路径再 `createSymbolicLink`（覆盖前由调用方 unlink，本缝只建不删）→ 断言只读 `/samples/**` 被拒、IPC 包装不外泄 → Web 内存 port 调两个方法期望 reject
期望: `readSymbolicLink` 返回的字符串与 `readlink` 逐字相等（相对路径保持相对、悬空链接照常返回、不 resolve 成绝对路径）；`createSymbolicLink` 以原样字符串建链，目标目录的子条目不被物化、被指向文件的字节与 mtime 不变；两项通道名只出现在 `PLATFORM_CHANNELS`，preload 仅白名单转发且桥接表面清单测试覆盖；Electron 失败消息为中文可读句子、含路径与 OS code、不含 `Error invoking remote method`；Web 内存实现同签名但直接拒绝（`Web 运行时没有符号链接：<path>` / `Web 运行时暂不支持创建符号链接`），不伪造链接节点、不引 `node:*`

## 最近执行

- workItemId: wi_intake_b95f668b89a1770d
- at: 2026-11-01
- status: pass
- note: 表面与转发证据：`src/preload/index.test.ts` 桥接表面清单新增 `readSymbolicLink` / `createSymbolicLink` 两项（通过）；`src/main/platform/electron-platform.test.ts` 的 `PlatformPort` 测试桩补两方法（通过，仅为表面/类型证据）。真实磁盘行为证据来自 `src/sync-real-gate.test.ts` 的 `real-disk sync symlink fidelity` 用例组（11 条，经真实 IPC handler 与生产 `PlatformPort` 覆盖链接复制 / 替换 / 删除 / 回滚 / 形态校验）。**缺口**：两个新方法尚无直接单测（`/samples/**` 建链被拒、悬空链接 `readlink` 返回字符串、Web 两方法拒绝分支），补测试时按 `domains/foundation` 的缺口登记优先补这三条。
