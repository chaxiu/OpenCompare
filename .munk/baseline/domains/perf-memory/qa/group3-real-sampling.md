# group3-real-sampling

covers: ac-group3-single-sampling, ac-group3-rounds-under-cap, ac-delivery-report
标题: 真实规模 DawnChat↔ZenMind 3 tab + 热 upsert 的单次采样与基线对照（WI wi_intake_aea03632d00a47e8）
步骤: 1) 在最终提交（`git status` 干净）上执行一次 `pnpm perf:dir --mode retained --left /Users/zhutao/Cursor/DawnChat --left /Users/zhutao/Cursor/ZenMind --left <links>/left --right /Users/zhutao/Cursor/ZenMind --right /Users/zhutao/Cursor/DawnChat --right /Users/zhutao/Cursor/ZenMind --hot-rounds 5 --settle 20000 --profile real --interval 1000 --out <仓库外路径>`（或 `pnpm perf:gate` 的 retained 场景，命令/档位须在交付写明）；2) 记录被测 commit、命令、档位与环境；3) 逐轮抄出 `rounds[].roundPeak` / `rounds[].counts.hashedFiles` / `rounds[].tabs` / `settle` / `settleStages` / `reclaim` / `peaks.appTotal` / `rendererPid`；4) 与基线对照：ready 峰值 2026.6 / 1920.9 / 2049.5 / 1896.8 / 2000.2 MiB，+20 s 静置 1600.8 / 1920.5 / 1592.3 / 1890.4 / 1595.0 MiB，app 总峰值 2515.7 MiB；5) 只采一次；若红，如实交付红，不重跑试绿。
期望: ① 5 轮热 upsert 每轮 `tabs=3`、`hashedFiles=0`、`cache.misses` / `entries` 不随轮次增长、四态仍 same 38542 / added 701232 / deleted 6827 / modified 5878、renderer PID 不因轮次更换；② 每轮 ready 峰值 ≤ 1,610,612,736 B（峰值窗口含 ready 后 +5 s）、+20 s 静置 ≤ 1,363,148,800 B、app 总 RSS ≤ 2,684,354,560 B，任一轮越线即失败；③ 交付写清被测 commit、单次采样命令与档位、仓库外证据绝对路径与逐轮数字，并注明打包 app 的 CDP L3 由负责人另排；④ 不重跑第二次采样。

## 最近执行

- workItemId: wi_intake_aea03632d00a47e8
- at: 2026-10-23
- status: na
- note: 本轮 `needSelfTest=false`，交付门槛只有 code_gates；其中 `perf:gate` 跑的是 `gate` 档合成数据集（12,050 文件 / 122,880,000 B，三份证据峰值 ~200 MB），**不构成真实规模 1536 / 1300 / 2.5 GiB 口径的达标证明**。真实 DawnChat↔ZenMind 的 `retained` + 5 轮热 upsert 单次采样本轮未执行，`ac-group3-single-sampling` / `ac-group3-rounds-under-cap` / `ac-delivery-report` 的逐轮数字与基线对照仍缺，需产品负责人在 Ops 按「只采一次、失败也如实交付、不重跑试绿」补；注意 `--hot-rounds` 默认 2，必须显式传 5。
