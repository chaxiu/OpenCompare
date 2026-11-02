# 真实外部文件：换行 / 编码归一 开 / 关两态证据

本文件由 `src/diff-normalize-real-gate.test.tsx` 的一次真实运行产出，数字来自同目录 `diff-normalize-real-files.json`，非手填。

## 生成命令

```bash
OPENCOMPARE_EVIDENCE_OUT=docs/evidence/diff-normalize-real-files.json pnpm test src/diff-normalize-real-gate.test.tsx
```

固定临时根（每次运行先删除再生成，结束后清理）：

`/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-diff-normalize-evidence`

阈值：`fiveMib = 5242880`、`thousandLines = 1000`、`strictRecomputeBudgetMs = 10000`。

## 千行组（DOM 两态 + 状态栏）

逻辑行数：1000；探测总耗时：11.00 ms。

| 变体 | 绝对路径 | 字节 | sha256 | 行数 | 编码 | 换行 |
| --- | --- | ---: | --- | ---: | --- | --- |
| `utf8-lf` | `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-diff-normalize-evidence/thousand/utf8-lf.txt` | 55890 | `22cdddce4f0efe34cd76da54bec636ded0713580451e44264f2e1ac6e05ddddd` | 1000 | UTF-8 | LF |
| `utf8-crlf` | `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-diff-normalize-evidence/thousand/utf8-crlf.txt` | 56890 | `bd2e2db8543e23c40a05f91daa69056c6d86ac7f0f3269e87aba0323f8875ebb` | 1000 | UTF-8 | CRLF |
| `utf8bom-lf` | `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-diff-normalize-evidence/thousand/utf8bom-lf.txt` | 55893 | `e9f775284b2701a4acd58841f178574cee14606d263c9a0ba85ea56cd1b20eff` | 1000 | UTF-8 BOM | LF |
| `utf16le-crlf` | `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-diff-normalize-evidence/thousand/utf16le-crlf.txt` | 45782 | `86631e07e54c12505fdbad66d7450901817d66803da7b45a8310275062ba3da7` | 1000 | UTF-16LE | CRLF |
| `gbk-lf` | `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-diff-normalize-evidence/thousand/gbk-lf.txt` | 38890 | `abd37c5db4ea99e7ad939fe74b82959ad5a0cd742f4c95eeaa7be4260d17add9` | 1000 | GBK | LF |
| `utf8-crlf-mutated` | `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-diff-normalize-evidence/thousand/utf8-crlf-mutated.txt` | 56890 | `65969b16897988a5962d2529e5a556b473561362bb3f207da54d463ca3c2c95d` | 1000 | UTF-8 | CRLF |

| 比较 | 状态 | differenceCount | blocks.length | 非 same 行数 | 行内片段数 | 耗时 (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `utf8-crlf` ↔ `utf8-lf` | 默认开启（两项均开） | 0 | 0 | 0 | 0 | 0.39 |
| `utf8-crlf` ↔ `utf8-lf` | 关闭两项（严格） | 1 | 1 | 1000 | 0 | 87.38 |
| `utf16le-crlf` ↔ `utf8-lf` | 默认开启（两项均开） | 0 | 0 | 0 | 0 | 0.34 |
| `utf16le-crlf` ↔ `utf8-lf` | 关闭两项（严格） | 1 | 1 | 1000 | 0 | 84.36 |
| `gbk-lf` ↔ `utf8-lf` | 默认开启（两项均开） | 0 | 0 | 0 | 0 | 0.27 |
| `gbk-lf` ↔ `utf8-lf` | 关闭两项（严格） | 1 | 0 | 0 | 0 | 0.31 |
| `utf8-crlf` ↔ `gbk-lf` | 默认开启（两项均开） | 0 | 0 | 0 | 0 | 0.27 |
| `utf8-crlf` ↔ `gbk-lf` | 关闭两项（严格） | 1 | 1 | 1000 | 0 | 85.66 |
| `utf8bom-lf` ↔ `utf8-lf` | 默认开启（两项均开） | 0 | 0 | 0 | 0 | 0.28 |
| `utf8bom-lf` ↔ `utf8-lf` | 关闭两项（严格） | 1 | 0 | 0 | 0 | 0.25 |
| `utf16le-crlf` ↔ `gbk-lf` | 默认开启（两项均开） | 0 | 0 | 0 | 0 | 0.28 |
| `utf16le-crlf` ↔ `gbk-lf` | 关闭两项（严格） | 1 | 1 | 1000 | 0 | 84.51 |
| `utf8-crlf-mutated` ↔ `utf8-lf` | 默认开启（两项均开） | 1 | 1 | 1 | 2 | 0.45 |
| `utf8-crlf-mutated` ↔ `utf8-lf` | 关闭两项（严格） | 1 | 1 | 1000 | 2 | 87.88 |

状态栏四值（左换行 / 左编码 / 右换行 / 右编码），开关切换前后逐字不变：

| 时机 | 四个原始值 |
| --- | --- |
| 默认开启 | ['CRLF', 'UTF-8', 'LF', 'GBK'] |
| 两个开关各点击两次后 | ['CRLF', 'UTF-8', 'LF', 'GBK'] |
| 再各按 Space 一次后 | ['CRLF', 'UTF-8', 'LF', 'GBK'] |

DOM 两态往返（`[data-code-diff-count]` / 块计数）：

- 默认开启：count = 0，blocks = 0
- 关闭两项后：count = 1，blocks = 1
- 重新开启：count = 0，blocks = 0
- Space 关闭：count = 1；Space 重开：count = 0

两栏渲染行数：左 1000 / 右 1000（相等且 > 0）。

切换耗时：单击 149.04 ms；Space 135.57 ms。

## 5 MB 组（核心级比较，不渲染进 jsdom）

逻辑行数：1200；探测总耗时：260.26 ms。

| 变体 | 绝对路径 | 字节 | sha256 | 行数 | 编码 | 换行 |
| --- | --- | ---: | --- | ---: | --- | --- |
| `utf8-lf` | `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-diff-normalize-evidence/five-megabyte/utf8-lf.txt` | 5478090 | `3ab8cf8148cdaa81c754a9cb7ee58fa97d11f33bcf6e23fcff4f3cac236f336a` | 1200 | UTF-8 | LF |
| `utf8-crlf` | `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-diff-normalize-evidence/five-megabyte/utf8-crlf.txt` | 5479290 | `fb84434d92b468a808a4ede1a219f2bc0b1dc1047c2da7285105eb8b01fd6928` | 1200 | UTF-8 | CRLF |
| `utf8bom-lf` | `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-diff-normalize-evidence/five-megabyte/utf8bom-lf.txt` | 5478093 | `991a06d1b2ce38b372f8f613c3f80cfa02364b1f12c5b979068dc3945c5011a0` | 1200 | UTF-8 BOM | LF |
| `utf16le-crlf` | `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-diff-normalize-evidence/five-megabyte/utf16le-crlf.txt` | 3662582 | `a8bdfb44ebfed926772ee30862f1ccc672d2f65f1dfd5f24ccb507c657241947` | 1200 | UTF-16LE | CRLF |
| `gbk-lf` | `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-diff-normalize-evidence/five-megabyte/gbk-lf.txt` | 3654090 | `171aaf13de4fdbf9b9c4aa3dc7d13312d8f5973c45b67058127ba67d1be6a2c1` | 1200 | GBK | LF |
| `utf8-crlf-mutated` | `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-diff-normalize-evidence/five-megabyte/utf8-crlf-mutated.txt` | 5479290 | `cb5e418d2df0bad851763513a3f4db9c48e63dfd600fee9d502b520599de9fed` | 1200 | UTF-8 | CRLF |

| 比较 | 状态 | differenceCount | blocks.length | 非 same 行数 | 行内片段数 | 耗时 (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `utf8-crlf` ↔ `utf8-lf` | 默认开启（两项均开） | 0 | 0 | 0 | 0 | 12.98 |
| `utf8-crlf` ↔ `utf8-lf` | 关闭两项（严格） | 1 | 1 | 1200 | 0 | 195.59 |
| `utf16le-crlf` ↔ `utf8-lf` | 默认开启（两项均开） | 0 | 0 | 0 | 0 | 12.12 |
| `utf16le-crlf` ↔ `utf8-lf` | 关闭两项（严格） | 1 | 1 | 1200 | 0 | 198.52 |
| `gbk-lf` ↔ `utf8-lf` | 默认开启（两项均开） | 0 | 0 | 0 | 0 | 11.83 |
| `gbk-lf` ↔ `utf8-lf` | 关闭两项（严格） | 1 | 0 | 0 | 0 | 10.65 |
| `utf8-crlf` ↔ `gbk-lf` | 默认开启（两项均开） | 0 | 0 | 0 | 0 | 11.93 |
| `utf8-crlf` ↔ `gbk-lf` | 关闭两项（严格） | 1 | 1 | 1200 | 0 | 195.05 |
| `utf8bom-lf` ↔ `utf8-lf` | 默认开启（两项均开） | 0 | 0 | 0 | 0 | 11.00 |
| `utf8bom-lf` ↔ `utf8-lf` | 关闭两项（严格） | 1 | 0 | 0 | 0 | 10.84 |
| `utf16le-crlf` ↔ `gbk-lf` | 默认开启（两项均开） | 0 | 0 | 0 | 0 | 11.63 |
| `utf16le-crlf` ↔ `gbk-lf` | 关闭两项（严格） | 1 | 1 | 1200 | 0 | 200.50 |
| `utf8-crlf-mutated` ↔ `utf8-lf` | 默认开启（两项均开） | 1 | 1 | 1 | 2 | 12.02 |
| `utf8-crlf-mutated` ↔ `utf8-lf` | 关闭两项（严格） | 1 | 1 | 1200 | 2 | 203.75 |

关闭后重算耗时上限（本组全部配对取最大值）：203.75 ms，低于预算 10000 ms。

可操作性读数：core-only rows: compared through diffLineTextsWithFacts, not rendered into jsdom。

## 结论

- 默认开启（忽略换行 + 忽略编码）下，同文本不同换行 / 不同编码的变体 `differenceCount` 与 `blocks.length` 均为 0，没有非 same 行。
- 关闭两项后：仅换行不同产生差异块；仅编码不同且解码文本一致时以 `byteDifference` 信号计入 `differenceCount = 1`；换行与编码都不同时产生差异块。
- 千行组通过真实 Workbench 连续「默认 → 关闭两项 → 重新开启」，界面计数回到 0；状态栏四个原始值全程逐字不变。
- `utf8-crlf-mutated` 与 `utf8-lf` 在两种开关状态下都报出真实字符差异，归一没有吞掉该字符。

