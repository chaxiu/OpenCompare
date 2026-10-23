# OpenCompare

English | [简体中文](./README.zh-CN.md)

> ✅ **Release status: v0.2.6 is published; the newest public release is [v0.2.6](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.6).** v0.2.6 fixes Windows absolute paths being joined onto cwd / baseDir at all four entry points (CLI flags, single-instance takeover, manual path entry, `opencompare://` links); drive letters, drive roots and UNC paths are resolved verbatim, see `docs/release-notes/v0.2.6.md`. macOS installers (`.dmg` / `.zip`) are produced with **Developer ID signing + Apple notarization** and published by the tag-triggered GitHub Actions workflow as the single public release per version. Notarization uses **App Store Connect API Key** mode; the 6 credentials (`CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_TEAM_ID` / `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`) are entered by humans as GitHub Secrets (CI secrets only, never committed); if any is missing the macOS package step fails closed (`fail-closed`) and never emits an unsigned bare bundle. Signing and notarization run in CI at release time; the actual result is the tag-triggered CI run. Credential checklist: `docs/release-signing.md`.

OpenCompare is a modern cross-platform desktop diff and three-way merge tool for **Beyond Compare 5 Pro** workflows. It is built with Electron + React 19 + TypeScript, and the same codebase builds both the desktop app and a browser preview. The four most common comparison workflows ship as built-in samples that run out of the box, and every view can also open and save real local files.

## Releases

| Version | Status | Notes |
| --- | --- | --- |
| [v0.2.6](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.6) | Published (newest public release) | Windows absolute-path fix at the four entry points (drive letters / drive roots / UNC), see [release notes](docs/release-notes/v0.2.6.md) |
| [v0.2.5](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.5) | Published (previous) | Multi-round memory convergence, zero-noise cancellation, symlink "no-follow" counting, see [release notes](docs/release-notes/v0.2.5.md) |
| [v0.2.4](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.4) | Published | Carries the unpublished v0.2.3 content plus directory scan batching, progress and cancellation, and windowed directory tree fixes, see [release notes](docs/release-notes/v0.2.4.md) |
| v0.2.3 | Never published, merged into v0.2.4 | Never tagged and never released publicly; every user-visible change shipped in v0.2.4 |
| [v0.2.2](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.2) | Published | Large-directory EMFILE fix |

Download v0.2.6: [release page](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.6) · macOS [dmg](https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/OpenCompare-0.2.6-arm64.dmg) / [zip](https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/OpenCompare-0.2.6-arm64-mac.zip) · Windows [OpenCompare-Setup-0.2.6.exe](https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/OpenCompare-Setup-0.2.6.exe) · Linux [AppImage](https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/OpenCompare-0.2.6.AppImage) / [deb](https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/opencompare_0.2.6_amd64.deb)

## Features

- **Directory comparison and incremental sync**: compare two nested directory trees and classify every node as `same / added / removed / modified` by size / modification time / content hash; preview incremental or mirror sync as a dry run before writing, and refresh the comparison automatically after syncing.
- **Template relocation across arbitrary depth**: match files scattered at random directory depths against a template tree and relocate them; afterwards verify the written slots (matched / missing / conflicting).
- **Snapshot protocol (`.ocsnap.json`)**: export a real directory as a normalized snapshot document with metadata and SHA-256, then import it as either side and compare again; a "local directory ↔ remote-server snapshot" sample is built in.
- **Side-by-side code diff and 3-way merge**: line-level and intra-line character-level highlighting, synchronized scrolling, per-hunk overwrite and reset; the 3-way merge (base · ours · theirs) splits conflicts with diff3, lets you pick per block, and copies or saves the merged result once every block is resolved.
- **CSV alignment on a primary key**: align CSV / TSV rows by a user-selected key column, tolerating out-of-order rows, shifted columns and extra columns on one side; virtual scrolling handles thousands of rows, differing cells are highlighted `left → right`, and rows can be filtered by state.
- **JSON / YAML semantic comparison**: compare parsed documents by JSON Pointer node path, ignoring key order, comments and indentation; distinguish `added / removed / modified / type-changed`.
- **Real local file I/O**: the code / CSV / JSON·YAML views all open local files from their toolbar and recompute immediately; 3-way merge output can be saved to a local file.

Platform capabilities sit behind `PlatformPort`: the Electron runtime uses native dialogs and the real filesystem, while the browser preview uses an in-memory filesystem and downloads on save. The renderer never imports Electron APIs directly.

## Install and first launch

- **macOS arm64**: download `OpenCompare-0.2.6-arm64.dmg`, open it, drag OpenCompare into Applications, then launch it from Applications.
- **Windows**: run `OpenCompare-Setup-0.2.6.exe`, finish the installer wizard, then launch OpenCompare from the Start menu.
- **Linux**: `chmod +x OpenCompare-0.2.6.AppImage` and run the `.AppImage`; or install the `.deb` with `sudo apt install ./opencompare_0.2.6_amd64.deb`.

**First launch**: the app opens into the workbench, where you can run the built-in samples for every comparison type or pick two local paths to start a comparison.

## Supported platforms

| Platform | Artifacts | Notes |
| --- | --- | --- |
| macOS arm64 | `.dmg` / `.zip` | `.dmg` is Developer ID signed and Apple notarized |
| Windows | NSIS `.exe` | `OpenCompare-Setup-0.2.6.exe` |
| Linux amd64 | `.AppImage` / `.deb` | AppImage runs without installation; deb goes through the system package manager |

Only the artifacts listed above are published.

## Memory profile

Every number below comes from archived evidence; nothing here was re-sampled for this document.

- **Cold run** (first round on a new root: 76,604 files / 11,105,870,346 B actually hashed): 21.6–22.5 s wall clock, 694–706 MiB renderer ready peak.
- **Warm run** (same roots again, `hashedFiles=0`): 8.5–10.0 s wall clock, 1.68–1.81 GiB renderer ready peak.
- **+20 s settle**: after a warm run renderer RSS falls back to 1.24–1.28 GiB.
- **Packaged-app L3 first run** (3 sessions, 1.3M-scale files, concurrent warm rounds; scheduled separately by the product owner, evidence archived outside this repository): 1.9–2.0 GiB renderer ready peak, 1.6–1.9 GiB settle, about 2.15–2.5 GiB app total RSS peak.

Methodology and per-round numbers: [docs/perf/upsert-memory-diagnosis-2026-10-23.md](docs/perf/upsert-memory-diagnosis-2026-10-23.md) and [docs/perf/large-directory-memory.md](docs/perf/large-directory-memory.md). These figures describe measured values and methodology only; they are not a product memory target and imply no fix schedule.

## Environment requirements

- Node.js >= 20.19
- pnpm 10 (`packageManager` is pinned to `pnpm@10.18.3`)

## Local development

```bash
pnpm install

pnpm dev        # Electron desktop window
pnpm dev:web    # browser preview (in-memory PlatformPort, no Electron)
```

## Quality gates

```bash
pnpm lint       # ESLint (flat config)
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest (core algorithms have no Electron / DOM dependency and run directly)
pnpm build      # electron-vite builds main / preload / renderer
pnpm build:web  # browser static bundle
```

## Build and packaging

```bash
pnpm build            # build the three process bundles into out/
pnpm dist             # package for the current platform
pnpm dist:mac         # macOS: dmg / zip
pnpm dist:win         # Windows: nsis
pnpm dist:linux       # Linux: AppImage / deb
```

Packaging configuration lives in `electron-builder.yml` at the repository root (macOS / Windows / Linux targets). The macOS target uses Developer ID signing (certificate injected through `CSC_LINK` / `CSC_KEY_PASSWORD`, identity pinned to `Tao Zhu (3X4J53U6RY)`; the config omits the `Developer ID Application:` prefix) and App Store Connect API Key notarization (`APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`; `APPLE_TEAM_ID` is `3X4J53U6RY`). All credentials are entered by humans into GitHub Secrets and never committed; the `APPLE_API_KEY` `.p8` base64 is decoded only in CI into a `$RUNNER_TEMP` file with mode `600` and removed after packaging. If any credential is missing the macOS packaging step **fails closed** and never emits an unsigned bare bundle. Local runs package the current platform only; multi-platform artifacts come from CI. See [`docs/release-signing.md`](docs/release-signing.md) for the credential checklist.

## Release process

Pushing a `v*` tag triggers GitHub Actions (`.github/workflows/release.yml`). If the tag is pushed but the Release does not finish, re-run the same workflow through `workflow_dispatch` from `main`, entering the existing `tag` (defaults to `v0.2.6`); the build checks out `refs/tags/<tag>` uniformly and never moves the tag or bumps the version.

1. First run the gates on an Ubuntu runner (`install → lint → typecheck → test → build`), plus a read-only ancestry gate before install/tests (`v0.1.2` must be a strict ancestor of `HEAD`, or tag-reachable commits must be patch-equivalent one by one) and a semantic-version check between `package.json#version` and the tag; any failure aborts the release.
2. After the gates pass, build the platform artifacts on the macOS / Windows / Linux runners; the macOS step requires all 6 signing / notarization secrets and fails closed if any is missing.
3. Each platform asserts that artifact names and the `version` / `files[].url` entries in `latest*.yml` match the tag version; locally you can run `pnpm release:metadata --dir release` first to check that every `latest*.yml` `files[].url` hits an asset name in `release/`, that the Windows installer uses the hyphenated form, and that the old misplaced name has zero hits, then upload everything to the single Release for that tag.
4. After packaging, macOS runs `codesign --verify --deep --strict`, `xcrun stapler validate` and `spctl -a -vv` against the real `.app` and asserts the icon, bundle identity and version; any failure aborts and uploads nothing. After `finalize`, assert that the tag has exactly one public (non-draft, non-prerelease) Release with assets covering all three platforms and `latest*.yml`.

## Project structure

```
src/main/       Electron main process: window lifecycle, IPC handlers, real filesystem access
src/preload/    contextBridge security bridge exposing only whitelisted IPC channels
src/core/       pure algorithms and domain models (diff / merge / CSV alignment / directory compare / snapshots), zero Electron / DOM dependency
src/renderer/   React 19 UI: workbench, four scenario views and base components
src/shared/     cross-process types, PlatformPort contract, IPC channel whitelist and built-in samples
```

## Known issues

- **Windows absolute paths at the four entry points (Issue #3)**: in v0.2.5 and earlier, passing a `C:\...` absolute path on Windows through CLI cold start (`--left` / `--right`), single-instance takeover (launching again while the app is running), manual path entry in a new comparison, or an `opencompare://` link joined the path onto cwd / baseDir (the Issue reported `C:\path\to\file1` becoming `C:\path\to\/C:\path\to\/file2`, swallowing the file name). **Fixed in v0.2.6**: all four entry points resolve absolute paths verbatim, including drive letters, drive roots and UNC paths; `..` never crosses a drive root or share root. Regression coverage comes from the six drive-letter / drive-root / UNC cases in [`src/shared/compareRequest.test.ts`](src/shared/compareRequest.test.ts); windows-latest run [`39890047849`](https://github.com/chaxiu/OpenCompare/actions/runs/39890047849) passed 46 tests; see [Issue #3](https://github.com/chaxiu/OpenCompare/issues/3).
- **Dangling symlinks / unreadable entries failed the whole directory comparison**: in v0.2.2 and earlier, a real project directory containing a dangling symlink or an unreadable entry made listing, scanning, comparison and snapshot building fail as a whole. The current version is fixed: a dangling link participates in the comparison as an ordinary link entry; only genuinely unreadable entries or directories (EACCES / ELOOP) are skipped and counted per side as "skipped", and the comparison completes.
- **Symlink policy: no-follow**: directory scanning never enters a link target directory; the link itself participates as a leaf entry in `same / added / removed / modified`; dangling links also participate, and only unreadable entries are counted per side as skipped. See [`docs/symlink-no-follow.md`](docs/symlink-no-follow.md) for counts, drilling and snapshot impact.
- **Large-directory comparison could exhaust file handles (EMFILE)**: in v0.2.1 and earlier, dropping a real folder with thousands of files opened every file at once while reading directory contents, which could fail with `platform:read-text-file EMFILE` and abort the comparison. The current version is fixed: directory content reads and entry metadata queries use bounded concurrency of 8 by default, and handle exhaustion surfaces as a readable "file handles exhausted (EMFILE)" error in the workbench instead of crashing the window.
- **Memory growth across repeated large-directory comparisons in one process**: in v0.2.4 and earlier, repeated comparisons in one process grew main-process memory from 849 MB to 1,510 MB with a high peak. **Fixed in v0.2.5**: the summary cache became a bounded LRU and releases a session's entries explicitly when the session closes or is replaced. In a real DawnChat ↔ ZenMind 3-round same-process run, the renderer peak dropped from the pre-fix baseline `1,960,394,752` B to `1,257,750,528` B, and the third-round delta `71,286,784` B stayed within threshold; numbers and verdict are in [`docs/perf/large-directory-memory.md`](docs/perf/large-directory-memory.md) and [`docs/perf/evidence/dawnchat-zenmind-20261022-post-fix-3rounds.json`](docs/perf/evidence/dawnchat-zenmind-20261022-post-fix-3rounds.json).
- **`ECANCELED` stderr noise when cancelling**: in v0.2.4 and earlier, cancelling a directory comparison or sync printed `ECANCELED`-related lines to main-process stderr. **Fixed in v0.2.5**: cancellation is a structured return value that does not cross the IPC handler boundary; one cancellation produced zero `Error occurred in handler`, zero `OperationCancelledError` and zero `ECANCELED` in measured stderr, asserted continuously by [`pnpm test:cancel`](src/cancel-gate.test.ts) (the `cancel-gate` gate).

## Kill Paid Apps 001 alternative

OpenCompare is a free, MIT-licensed alternative to Beyond Compare 5 Pro, tracked as alternative project 001 in the [Kill Paid Apps](https://github.com/munk-sh/kill-paid-apps) collection.

## License

[MIT](./LICENSE)
