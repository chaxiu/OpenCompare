covers: ac-binary-png-byte-exact, ac-binary-random-byte-exact, ac-binary-update-path-exact, ac-empty-file-stays-empty, ac-mtime-preserved-binary, ac-text-unchanged, ac-rollback-binary-restore, ac-delete-rollback-binary-restore
标题: 目录同步（copy 与 update）把二进制 / 非 UTF-8 / 空文件按原始字节搬运，回滚同样字节保真
步骤: 用 `mkdtemp` 建一对真实临时目录，源侧写入 PNG（`0x89 0x50 4E 47` 签名 + 二进制 IDAT 段）、含 `0x00` 与非 UTF-8 序列（`0x80` / `0xff` / 孤立 `0xC3`）的随机字节、0 字节空文件，以及一个内容不同的同名 PNG 作为 update 项 → Dry-run 预览左→右 → 确认执行（或直接 `applySyncPreview`）→ 用 `readFile` 原始字节逐条断言目标文件 → 对同一对目录再 Dry-run 一次 → 另建 fixture：覆盖一个二进制文件后注入「写入已落盘即抛错（`EACCES`）」并断言回滚 → 再对已勾选的二进制删除项注入同样失败并断言回滚
期望: 每个 copy / update 项的目标文件字节数与 sha256 均与源完全相等（PNG 不出现替换字符、字节数不变），0 字节文件仍为 0 字节且 sha256 等于空内容哈希；目标 mtime（`Math.floor(mtimeMs)`）与源相等；UTF-8 文本行为与四态计数不变；二次 Dry-run 三组全 0；覆盖 / 删除回滚后目标文件的**原始字节**、sha256 与 mtime 逐项等于执行前（不得出现字节数变化或替换字符），目标树无 `*.tmp` 残留

## 最近执行

- workItemId: wi_intake_654321843130fa1f
- at: 2026-11-01
- status: pass
- note: 真实磁盘证据在 `sync-real-gate`（`src/sync-real-gate.test.ts`，`describe('real-disk sync binary fidelity')` 3 条，真实临时目录 + 真实 IPC handler，不 mock 文件系统）：`copies and overwrites binary bodies byte for byte, empty files included` 断言 `assets/logo.png` / `assets/random.bin` / `assets/empty.bin` / `assets/updated.png` 四条路径的 `binary fidelity: <path> size|sha256|mtime` 标识断言、空文件二次同步仍 0 且三组计数全 0；`rolls a binary overwrite back to the exact previous bytes and mtime on failure` 与 `rolls a checked binary deletion back to the exact previous bytes and mtime` 覆盖覆盖 / 删除两条回滚路径。纹理：`SyncIo` 由文本缝改为 `readFileBytes` / `writeFileBytes`，`FileBackup.content` 由 `string` 改为 `Uint8Array`，`copyScannedTree` 同步改字节路径；主进程 `writeFileAtomically` 接受 `string | Uint8Array` 且只对字符串做 UTF-8 编码。核心层 `src/core/directory/sync.test.ts` 的假 IO 改为「文本假树 + 编解码适配」，既有失败安全用例原样通过。
