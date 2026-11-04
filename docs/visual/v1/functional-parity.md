# Functional parity after the shell tightening

This item only changes layout, reachability and presentation. Every action keeps its
result, its callback and its counts. The reference facts live in
`docs/visual/v1/baseline-facts.json` and are recomputed by
`scripts/visual-baseline-facts.test.mjs`, which reads that file and re-derives the same
values from the real comparison / report code — the table below is a reading of that
gate, not a copy of a design note.

## Four-state counts

| State | Baseline fact | Recomputed | Equal |
| --- | --- | --- | --- |
| same | 6 | 6 | yes |
| added | 4 | 4 | yes |
| removed | 4 | 4 | yes |
| modified | 5 | 5 | yes |

The five-value `DiffStatus` domain is unchanged; the interface still presents the four
visible states. The status-bar legend is removed, but the filter row still renders the
same counts once.

## Ignore switches

| Switch | Baseline fact | Recomputed | Equal |
| --- | --- | --- | --- |
| `ignoreWhitespace` | false | false | yes |
| `ignoreNewline` | true | true | yes |
| `ignoreEncoding` | true | true | yes |

The switches moved from the inline code toolbar into the "more" menu. Their defaults,
toggle behaviour and comparison results are unchanged.

## Directory HTML report

| Fact | Baseline fact | Recomputed | Equal |
| --- | --- | --- | --- |
| bytes | 5367 | 5367 | yes |
| sha256 | `8fc99d02f65f815f4a5858839a8c77f2ec01c86221d65be5ac268c9135887792` | `8fc99d02f65f815f4a5858839a8c77f2ec01c86221d65be5ac268c9135887792` | yes |

**Provenance.** The pre-token fact `8cfacec99138c21ef24b5eead14d4171ec4f4d657e815f1b8ba888bfc830a69b`
was captured at commit `11170a5` with app version `0.2.20`; the recomputed hash above is the same
generator with app version `0.2.21`. The two differ only in the `APP_VERSION` string and are both
`5367` bytes (`baseline-facts.json` → `directoryHtml.preToken` / `directoryHtml.refreshed`).

Export HTML moved into the directory "more" menu; the generated file is byte-identical.
The hidden-local-paths switch is a menu item and keeps the same persisted state.

## Discovery and demo entries

- First screen and the workflow toolbars render **0** built-in sample entries
  (`DirectoryView.test.tsx` / `shellLayout.dom.test.tsx` assert the absence; samples are
  only reachable from the settings debug section).
- Every declared toolbar entry is either rendered inline or inside the "more" menu; the
  menu closes on Escape and on an outside click.
- The single solid primary action per view still calls the original preview / apply
  callback, with the same preview result and counts.

## Gates

`pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm build:web`, `pnpm test` and
`node scripts/test-debt-gate.mjs` cover this record; the test-debt baseline declares the
new assertion growth.
