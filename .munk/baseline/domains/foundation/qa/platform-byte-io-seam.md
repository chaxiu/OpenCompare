covers: ac-byte-io-seam
标题: `PlatformPort` 原始字节读写与「链接自身 mtime」三条能力在两套实现上同签名，通道单一来源且 preload 白名单转发
步骤: ① 审阅 `src/shared/platform/types.ts` 的三条方法签名与 `PLATFORM_CHANNELS` 里的三个通道名（确认无第二处字面量）→ ② 经 `src/preload/index.ts` 的桥接表面清单断言新增三项 → ③ 在真实临时目录上经真实 IPC handler 走 `writeFileBytes` 写二进制（PNG / 含 `0x00` 与非 UTF-8 字节）后 `readFileBytes` 读回逐字节比较，并断言 mtime 整毫秒回填、目录无 `*.tmp` → ④ 建一个 symlink，记录 `lstat` 链接自身 mtime 与被指向文件 mtime，经 `setSymbolicLinkModifiedMs` 改链接时间后再断言两者 → ⑤ Web 内存实现上用同一签名读写文本节点，断言往返一致
期望: `PlatformPort` 暴露 `readFileBytes(path): Promise<Uint8Array>` / `writeFileBytes(path, content, modifiedMs?): Promise<void>` / `setSymbolicLinkModifiedMs(path, modifiedMs): Promise<void>`；`platform:read-file-bytes` / `platform:write-file-bytes` / `platform:set-symbolic-link-modified-ms` 只在 `PLATFORM_CHANNELS` 单一来源出现，preload 仅白名单转发且表面清单测试覆盖；Electron 侧字节读写逐字节保真（`/samples/**` 按 UTF-8 编码样本文本）、写盘复用原子写与整毫秒回填、失败为中文可读句子且不含 `Error invoking remote method`；`setSymbolicLinkModifiedMs` 只改链接自身秒级 mtime、被指向文件 mtime 不变、非有限数值 no-op；Web 内存实现文本往返一致、链接能力 no-op、不引 `node:*`

## 最近执行

- workItemId: wi_intake_654321843130fa1f
- at: 2026-11-01
- status: pass
- note: 通道与签名证据：`src/shared/platform/{channels,types}.ts` 新增三项，`src/preload/index.test.ts` 桥接表面清单 +3（`readFileBytes` / `writeFileBytes` / `setSymbolicLinkModifiedMs`），`src/main/platform/electron-platform.test.ts` 的测试 port 同步三条转发并把同步失败注入点从 `writeTextFile` 改为 `writeFileBytes`。行为证据：`sync-real-gate.test.ts` 经**真实 IPC handler** 走 `writeFileBytes` / `readFileBytes`（二进制逐字节与 sha256、空文件、回滚）与 `setSymbolicLinkModifiedMs`（`symlink metadata: <path> lstat mtime seconds` 且 link target 不变）。**尚未直接覆盖**：`writeFileBytes` 的非 `Uint8Array` 入参拒绝、Web 实现 `readFileBytes` / `writeFileBytes` 往返与 `setSymbolicLinkModifiedMs` no-op（见本域交付证明的缺口登记）。实现落位：`writeFileAtomically` 改为 `string | Uint8Array` + 抽出 `backfillModifiedMs` 由文本 / 字节两条 handler 共用；`setSymbolicLinkModifiedMs` 用 `lutimes`（非 `utimes`）。
