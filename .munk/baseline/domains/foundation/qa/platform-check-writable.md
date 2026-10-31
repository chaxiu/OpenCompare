covers: ac-check-writable-seam
标题: `PlatformPort.checkWritable` 只问不写——可写目录 resolve 且条目不变，只读 / 缺失路径给出中文可读拒绝
步骤: ① 契约与白名单：`src/shared/platform/types.ts` 声明 `checkWritable(path): Promise<void>`；`PLATFORM_CHANNELS.checkWritable = 'platform:check-writable'` 为唯一通道来源，`src/preload/index.ts` 仅白名单转发并由 `src/preload/index.test.ts` 的表面清单断言该键;② Electron：经真实 `ipcMain.handle` 注册后调用 `checkWritable`——对可写临时目录（`mkdtemp`）resolve 且 `readdir` 结果与调用前逐项相等，对 `chmod 0555` 的只读目录 reject（消息含路径与 `EACCES` / `EPERM` / `EROFS` 中对应项、不含 `Error invoking remote method`），对不存在路径 reject;③ Web 内存实现：对既有可写节点 resolve 且内存树节点数与名称集合不变，对缺失路径 reject 中文句子，对 `/samples/**` 拒绝;④ 端到端：`sync-real-gate.test.ts` 的只读目标根用例经该能力拒绝整个预检，记录式 `PlatformPort` 断言 `writeTextFile` 调用 0 次、目标目录条目集合不变。
期望: 两套实现同签名同语义，只回答「这个路径能否写入」而不创建 / 截断 / 删除任何条目；拒绝消息为中文句子（含路径与 OS code，有则给），不含 `Error invoking remote method`；通道名只出现在 `PLATFORM_CHANNELS`，preload 只白名单转发，renderer 不直接 import Electron / `node:fs`；实现内不存在「写临时文件再删除」的探测路径，同步预检的零落盘合同因此成立。

## 最近执行

- workItemId: wi_ws_77594c69557dbc7f
- at: 2026-10-31
- status: pass
- note: `needSelfTest=false`；11 gates attempt 001 全绿（`.munk/runs/run_ws_7e10c6ecc83eea17/code-gates/attempts/001`）。Electron handler 用 `access(target, constants.W_OK)` + 既有 `readableFileFailure('写入', …)`，经 `sync-real-gate.test.ts` 的真实 IPC handler map 在真实临时目录上被执行（只读根因 `chmod` 真被拒、root 身份仅跳过该条）；Web 内存实现 `assertWritable(path)` + 节点存在校验，正向 resolve 由渲染层用例 `workbench/directorySyncRefresh.test.tsx` 经 `createWebPlatformPort` 间接覆盖；`preload/index.test.ts` 表面清单与 `src/sync-real-gate.test.ts` 的同步 `PlatformPort` 桩同步新增该方法。**缺口（如实登记）**：Web 实现的负向分支（缺失路径 / `/samples/**`）没有独立单测，`electron-platform.test.ts` 也没有针对 `platform:check-writable` 的直接用例——两者靠上述间接证据与 `assertWritable` / `access` 的既有语义保证，后续补该能力测试时优先补这两条。
