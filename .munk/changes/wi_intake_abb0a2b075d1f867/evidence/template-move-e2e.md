# Template move e2e — APFS real-directory evidence

Command (single gate argv):

```
pnpm test src/template-e2e-real-directory.test.ts
```

Test: `runs the APFS move legs: default copy, explicit move, failed check keeps the source`
in `src/template-e2e-real-directory.test.ts`.

## Volume probe

`mkdtemp` root held `probe.txt`; `PROBE.TXT` resolved to the same file, so the scratch
volume is case-insensitive (APFS default). The three legs below ran on that volume.

## Real roots (this run)

| leg | root |
| --- | --- |
| copy | `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-template-move-copy-2E2e88` |
| move | `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-template-move-move-vro7CQ` |
| verify-fail | `/var/folders/hn/rqf4yrcj4yn53l0vghdcgjcr0000gn/T/opencompare-template-move-fail-T0ORru` |

Each root holds `模板 A` (template), `散乱 树 B` (scattered tree) and `输出 根` (output root).

## Leg 1 — default copy

- Source: `散乱 树 B/bucket-copy/clean.txt`
- Target: `输出 根/docs/clean.txt`
- Source sha256 / mtimeSec: `919098094a19ac9eea567e99d07c0116274a448b69f3f9f6d48e2ca2e6997cc9` / `1700000900`
- Target sha256 / mtimeSec: same as source.
- Source still exists after Apply: true.
- Row action: `copy`; `execution.movedCount === 0`; verification `sourceDeleted === false`.

## Leg 2 — explicit move

- Source: `散乱 树 B/bucket-move/move.txt`
- Target: `输出 根/docs/move.txt`
- Source sha256 / mtimeSec before Apply: `8a48fe678827a8b7af0bd645aa2da3ceb377d0cfea3fe0fb2119258bcf8ba7bf` / `1700000900`
- Target sha256 / mtimeSec: same as source (written first, checked, then source removed).
- Source removed after Apply: true.
- Rescan of the same roots: row outcome `placed`, `defaultChecked === false`, default `executableCount === 0`.

## Leg 3 — post-write check fails, source kept

- Source: `散乱 树 B/bucket-fail/fail.txt`
- Target: `输出 根/docs/fail.txt`
- Injected deviation: target mtime shifted 5 seconds after the write.
- Source sha256 / mtimeSec before and after: `549c58168195d7a39d91d4f813c282cac91afd4a0a3ac217eaa3790f9e5da5d4` / `1700000900` (unchanged).
- Failure reason: `move-target-mtime`; `deleteFile` was never called; target retained.
- Earlier legs were untouched: leg 1 target and source kept, leg 2 source still gone.

## Residue

- `.tmp` files under every output root and scattered tree: `0`.
- Intermediate entries: `0` (the only tree-B files left are the ones the plan did not move,
  e.g. the deliberate verify-fail source).
- Successful move sources remaining in tree B: `0`.
