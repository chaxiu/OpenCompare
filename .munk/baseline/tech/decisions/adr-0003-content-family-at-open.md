# ADR-0003: 文件家族判定放在打开链路（每侧一次 probe），请求校验零读取

- 状态：accepted
- 日期：2026-11-05
- 来源：WI `wi_intake_48956cb4024b1418`（未知扩展名按内容判定文本并打开）

## 背景

未知扩展名此前在 `resolveCompareRequest` / `resolveMergeRequest` 里被 `isSupportedComparisonFile` 直接拒绝，因此 `.vue` / `.svelte` / `.dart` 等纯文本文件打不开。PRD 要求改成「扩展名未知时按内容判断，二进制仍拒绝」，并同时守住两条预算：已知扩展名不新增读取；未知扩展名每侧只读一次（正文与编码 / 换行 / 字节数 / sha256 来自同一份字节）。

校验层若要判定内容，就必须读文件，并把正文或 facts 跨 IPC 携带进 `CompareRequest`；而拖放 / 选择器 / 历史重开 / 目录下钻本来就在打开链路独立判定，校验层探测会变成第二份判定 + 二次整读。

## 决策

1. **判定收敛到单一纯函数**：`src/shared/fileExtensions.ts` 的 `extensionFamily(name)`（仅扩展名一步）与 `resolveFileFamily(name, content)`（唯一组合）；`src/core/text/probe.ts` 的 `isTextProbe`（编码已知且解码文本无 `U+0000`）是唯一二进制结论。删除 `SUPPORTED_FILE_EXTENSIONS` / `isSupportedComparisonFile`。
2. **校验层零读取**：`resolveCompareRequest` / `resolveMergeRequest` 只做路径规范化与 `statPath` 类型探测，不再按扩展名拒绝；`UNSUPPORTED_FILE_TYPE` 码保留，改由打开链路产出。
3. **判定只在打开链路发生**：`openFilePairSession` / `openDrilldownSession` / `buildMergeSession` 对每侧先看 `extensionFamily`；已知扩展名零新增读取，未知扩展名各调用一次 `probeTextFile`，该次 `text` 作正文、`facts` 进 `session.probes`；二进制在 mixed-family 之前带侧别拒绝（左侧优先）。
4. **家族语义不变**：未知扩展名文本一律进 `code`（不猜分隔符 / 格式），因此与 `.csv` / `.tsv` / `.json` / `.yaml` 组成一对仍是 `mixed-family`；无扩展名 / 点文件仍直接按文本打开。

## 备选与取舍

- **在校验阶段探测并携带正文 / facts**：`CompareRequest` 会变成正文容器，launch 载荷翻倍；且打开链路仍需独立判定（拖放 / 选择器 / 历史重开不走校验），形成第二份判定 + 双读。否。
- **扩扩展名白名单**：治标，且每来一种新格式就要改表；PRD 明确非目标。否。
- **按 magic / MIME 或采样窗口判定二进制**：引入新依赖与新阈值，违背「复用既有探测」与 ac-single-decision-source。否。
- **未知扩展名猜 CSV / JSON / YAML**：会把纯文本误渲染成表格 / 结构化视图，且无法确定性断言。否。

## 后果

- `classifyFile` 保持仅按扩展名（未知返回 `null`），快照内联策略与「换侧文件沿用当前家族」零变化；内容判定走新增的 `contentFamily`。
- 二进制拒绝从「校验失败」变成「打开失败」：对话框内以本地化 detail 文案呈现（含侧别 + 文件名），不再是结构化 `{ side, path }`；launch 路径同样走同一句文案。
- `FilePairErrorCode` 的 `'unsupported-type'` 字面量统一为 `'UNSUPPORTED_FILE_TYPE'`；`MergeSessionErrorCode` 增加该码。仓库不再有第二份扩展名白名单或二进制阈值。
- 已知扩展名的读取次数与现状逐项一致（code 对每侧一次 probe、CSV / 结构化对 `readTextFile`、合并 txt 走 `readTextFile`）；未知扩展名成功打开 = 每侧恰好一次 `probeTextFile`，可由 `probeCalls` 计数钉住。
