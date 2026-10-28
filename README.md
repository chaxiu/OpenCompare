# OpenCompare

English | [简体中文](./README.zh-CN.md)

> Latest public release: [v0.2.9](https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.9) — Developer ID signed and Apple-notarized macOS build.

[![Latest release](https://img.shields.io/github/v/release/chaxiu/OpenCompare)](https://github.com/chaxiu/OpenCompare/releases) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

OpenCompare is a modern cross-platform desktop diff and three-way merge tool for Beyond Compare 5 Pro workflows: directory comparison and sync, code diff and merge, CSV key alignment, JSON / YAML semantic comparison, and directory snapshots. It is built with Electron + React 19 + TypeScript, and the same codebase runs as a desktop app and a browser preview.

![OpenCompare workbench comparing two directory trees](docs/assets/opencompare-workbench.png)

## Download and install

- **macOS arm64**: download the `.dmg` from [Releases](https://github.com/chaxiu/OpenCompare/releases), drag OpenCompare into Applications, then launch it.
- **Windows**: run the `.exe` installer, finish the wizard, then launch OpenCompare from the Start menu.
- **Linux**: `chmod +x` the `.AppImage` and run it; or install the `.deb` package with `sudo apt install ./opencompare_amd64.deb`.

Every published version is listed on the [Releases page](https://github.com/chaxiu/OpenCompare/releases).

## Features

- **Directory comparison and sync**: compare two nested trees, classify every node as same / added / removed / modified, and preview incremental or mirror sync before writing.
- **Code diff and 3-way merge**: line and intra-line highlighting, synchronized scrolling, per-hunk overwrite, and diff3 conflict blocks resolved one block at a time.
- **CSV key alignment**: align CSV / TSV rows by a chosen key column, tolerate shuffled rows and shifted columns, and filter rows by state.
- **JSON / YAML semantic comparison**: compare parsed documents by JSON Pointer path, ignoring key order, comments and indentation.
- **Snapshot protocol (`.ocsnap.json`)**: export a directory as a normalized document with metadata and SHA-256, import it on either side, and compare again.

## Quickstart

1. Open two paths with **New comparison**, or pick each side with **Open folder**; no sample is required.
2. Read the four states: same / added / removed / modified.
3. Double-click a file to drill down into its code, CSV or JSON view.
4. Preview a sync, then apply incremental or mirror changes.

## Requirements and development

- Node.js >= 20.19
- pnpm 10

```bash
pnpm install
pnpm dev        # Electron desktop window
pnpm dev:web    # browser preview
pnpm lint       # ESLint
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest
pnpm build      # desktop bundles
pnpm build:web  # browser bundle
```

## Project structure

```text
src/main/       Electron main process: window lifecycle, IPC handlers, filesystem access
src/preload/    contextBridge bridge with a whitelisted channel set
src/core/       pure algorithms and domain models, no Electron or DOM dependency
src/renderer/   React 19 UI: workbench, scenario views and base components
src/shared/     cross-process types, PlatformPort contract and built-in samples
```

## Known issues

None known right now. Report anything reproducible on the [issue tracker](https://github.com/chaxiu/OpenCompare/issues).

## Evidence and docs

[Release process](docs/release-process.md) · [release signing credentials](docs/release-signing.md) · [symlink policy](docs/symlink-no-follow.md) · [large-directory memory](docs/perf/large-directory-memory.md).

Performance & memory evidence: [read-only diagnosis](docs/perf/upsert-memory-diagnosis-2026-10-23.md) and [large-directory memory](docs/perf/large-directory-memory.md).

## Open Rebuilds 001

OpenCompare is a free MIT alternative to Beyond Compare 5 Pro, tracked as alternative 001 in [Open Rebuilds](https://github.com/munk-sh/open-rebuilds).

## License

MIT, see [LICENSE](./LICENSE).
