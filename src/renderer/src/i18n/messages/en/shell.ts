import { shell as zhShell } from '../zh/shell'

/** Mirrors `zh/shell.ts` key for key. */
export const shell: Record<keyof typeof zhShell, string> = {
  'shell.app.ready': 'Ready',
  'shell.settings.open': 'Open settings',
  'shell.notification.dismiss': 'Dismiss notification',
  'shell.loading.preparing': 'Preparing…',
  'shell.viewSwitcher.label': 'Switch view',
  'shell.view.directory': 'Directory',
  'shell.view.code': 'Code diff & 3-way',
  'shell.view.csv': 'CSV key comparison',
  'shell.view.structured': 'JSON / YAML',
  'shell.toolbar.newCompare': 'New comparison',
  'shell.toolbar.newCompareTitle':
    'Enter or paste two real paths to compare without a system dialog (Cmd/Ctrl+N)',
  'shell.toolbar.openFile': 'Open file',
  'shell.toolbar.openFileTitle': 'Choose the left and right files in order',
  'shell.toolbar.openFolder': 'Open folder',
  'shell.toolbar.openFolderTitle': 'Choose the left and right folders in order',
  'shell.empty.title': 'Open real files or folders to start comparing',
  'shell.empty.description':
    'Type or paste two real paths in "New comparison" without any system dialog, pick both sides through the system pickers, or drop two real paths onto the window.',
  'shell.empty.hint':
    'Drop two paths of the same kind (two files or two folders) to start right away. Want to see the built-in samples? Open Settings → Samples & debugging; they never get in the way of real comparisons.',
  'shell.loading.title': 'Loading demo samples…',
  'shell.loading.description':
    'Reading the built-in sample library, scanning the sample directories, comparing by size / modification time / content hash and parsing the CSV / TSV tables.',
  'shell.error.title': 'Could not read the sample library',
  'shell.error.sampleRead':
    'Could not read the built-in sample library: /samples/csv/orders.left.csv is missing.',
  'shell.error.unknown': 'An unknown error occurred while reading the built-in samples.',
  'shell.error.hint': 'The sample library ships with the app, so you can retry right away.',
  'shell.notice.skipped': 'Skipped: {left} on the left / {right} on the right',
  'shell.notice.cancelled':
    'This directory comparison was cancelled; the workbench keeps its pre-cancel state.',
  'shell.notice.dropUnresolved':
    'Could not resolve a real path from the dropped item. Use "Open file" or "Open folder" instead.',
  'shell.notice.dropSingle':
    'Using {path} as the left baseline. Now choose the matching {kind} on the right.',
  'shell.notice.dropMany':
    'Only two paths of the same kind can be dropped at once (two files or two folders); {count} were dropped.',
  'shell.notice.dropMixed':
    'One dropped item is a file and the other is a folder, so they cannot be compared. Drop two paths of the same kind.',
  'shell.notice.symlinkDirectory':
    '"{name}" is a symbolic link to a folder and is not followed, so its contents are not opened.',
  'shell.notice.unsupportedDrilldown':
    'Cannot open {name} in a file comparison yet (only code / text · CSV / TSV · JSON / YAML).',
  'shell.notice.exported.one': 'Exported to {path} ({count} file).',
  'shell.notice.exported.other': 'Exported to {path} ({count} files).',
  'shell.notice.exportedWithSkipped.one':
    'Exported to {path} ({count} file, {skipped} unreadable entries skipped).',
  'shell.notice.exportedWithSkipped.other':
    'Exported to {path} ({count} files, {skipped} unreadable entries skipped).',
  'shell.notice.snapshotMounted': 'Mounted snapshot {name} on the {side} side.',
  'shell.notice.syncComplete':
    'Sync complete: {copied} copied · {updated} overwritten · {deleted} deleted.',
  'shell.notice.templateComplete':
    'Template placement complete: {extracted} files written; verification matched {matched} · missing {missing} · conflicts {conflicts}.',
  'shell.side.left': 'left',
  'shell.side.right': 'right',
  'shell.notice.returnUnavailable':
    'The source directory session is no longer available, and there is no other directory comparison to return to.',
  'shell.notice.returnFallback':
    'The source directory session is no longer available; returned to {title} instead.',
  'shell.notice.returnTitle': 'Return to the directory comparison this drilldown came from',
  'shell.notice.returnAction': 'Back to directory view',
  'shell.notice.sourceDirectory': 'From directory comparison: {title}',
  'shell.progress.label': 'Directory comparison progress',
  'shell.progress.scanning': 'Scanning directories',
  'shell.progress.digesting': 'Verifying content',
  'shell.progress.scanned.one': '{count} file scanned',
  'shell.progress.scanned.other': '{count} files scanned',
  'shell.progress.verified.one': '{count} file verified',
  'shell.progress.verified.other': '{count} files verified',
  'shell.progress.cumulative.one': '{count} file so far',
  'shell.progress.cumulative.other': '{count} files so far',
  'shell.progress.processed': '{size} processed',
  'shell.progress.cancel': 'Cancel',
  'shell.progress.cancelTitle':
    'Stop this directory comparison and keep the current workbench state',
  'shell.picker.leftFile': 'Choose the left file',
  'shell.picker.rightFile': 'Choose the right file',
  'shell.picker.exportSnapshot': 'Export directory snapshot',
  'shell.filter.snapshot': 'OpenCompare snapshot',
  'shell.closeUnsaved.title': 'Close a session with unsaved changes?',
  'shell.closeUnsaved.description':
    '"{title}" has unsaved changes. Closing it discards those changes.',
  'shell.closeUnsaved.continue': 'Continue editing',
  'shell.closeUnsaved.discard': 'Discard and close',
  'shell.closeUnsaved.body':
    'To keep your changes, choose "Continue editing" first and save the left / right file to disk from that session before closing it.',
  'shell.status.session': 'Session',
  'shell.status.platform': 'Platform',
  'shell.session.sample.directory.title': 'Directory comparison',
  'shell.session.sample.directory.subtitle':
    'Nested directory trees with a scattered cross-level tree B',
  'shell.session.sample.code.title': 'Code diff & 3-way merge',
  'shell.session.sample.code.subtitle':
    'Two-column diff pair with base · ours · theirs conflict blocks',
  'shell.session.sample.csv.title': 'CSV key comparison',
  'shell.session.sample.csv.subtitle':
    '{rows} shuffled keys with column offsets in CSV / TSV',
  'shell.session.sample.structured.title': 'JSON / YAML semantic comparison',
  'shell.session.sample.structured.subtitle':
    'Shuffled keys with deep additions, removals, edits and type changes',
  'shell.session.missing.left': '{path} (missing on the left)',
  'shell.session.missing.right': '{path} (missing on the right)',
  'shell.file.error.unsupported':
    'Cannot compare {name} yet (only code / text · CSV / TSV · JSON / YAML are supported).',
  'shell.file.error.mixed':
    'The two files have different types ({left} is {leftKind}, {right} is {rightKind}). Choose files of the same type.',
  'shell.snapshot.error.invalid-json':
    'Snapshot import failed: the selected file is not valid JSON.',
  'shell.snapshot.error.invalid-schema':
    'Snapshot import failed: schema is not opencompare.snapshot/v1.',
  'shell.snapshot.error.invalid-metadata':
    'Snapshot import failed: the name / exportedAt metadata is missing or invalid.',
  'shell.snapshot.error.invalid-entry':
    'Snapshot import failed: an entry is missing a required field or has the wrong type.',
  'shell.snapshot.error.invalid-path': 'Snapshot import failed: invalid path.',
  'shell.snapshot.error.invalid-pathWithPath': 'Snapshot import failed: invalid path ({path}).',
  'shell.snapshot.error.duplicate-path': 'Snapshot import failed: duplicate path ({path}).',
  'shell.snapshot.error.invalid-hash': 'Snapshot import failed: invalid sha256 ({path}).',
  'shell.snapshot.error.content-not-inlined':
    'This snapshot did not inline the content of {path}, so it cannot be drilled into offline; the file was not inlined on export.',
  'shell.snapshot.error.content-missing': 'The snapshot has no file at {path}.',
  'shell.stat.sourceFiles': 'Source files',
  'shell.stat.targetFiles': 'Target files',
  'shell.stat.differences': 'Differences',
  'shell.stat.scatteredTree': 'Scattered tree B',
  'shell.stat.linesLeft': 'Lines (left)',
  'shell.stat.linesRight': 'Lines (right)',
  'shell.stat.conflicts': 'Conflict blocks',
  'shell.stat.keyColumns': 'Key columns',
  'shell.stat.jsonNodesLeft': 'JSON nodes (left)',
  'shell.stat.jsonNodesRight': 'JSON nodes (right)',
  'shell.stat.sampleFiles': 'Sample files',
  'shell.compare.title': 'New comparison',
  'shell.compare.description':
    'Type or paste two real paths and press Enter to compare; the system pickers keep working too.',
  'shell.compare.leftPath': 'Left path',
  'shell.compare.rightPath': 'Right path',
  'shell.compare.leftPlaceholder': '/Users/you/left a.txt or ~/project/a.txt',
  'shell.compare.rightPlaceholder': '/Users/you/right b.txt or a.txt',
  'shell.compare.hint': 'Enter to compare · Esc to close',
  'shell.compare.pickFiles': 'Open file',
  'shell.compare.pickFilesTitle': 'Choose the left and right files in order',
  'shell.compare.pickFolders': 'Open folder',
  'shell.compare.pickFoldersTitle': 'Choose the left and right folders in order',
  'shell.compare.submit': 'Compare',
  'shell.compare.error.EMPTY_PATH': 'The {side} path is empty. Enter a valid path.',
  'shell.compare.error.MISSING_SIDE':
    'The {side} path is missing. Provide both a left and a right path.',
  'shell.compare.error.DUPLICATE_SIDE':
    'Both sides point to the same path: {path}. Choose two different paths.',
  'shell.compare.error.UNKNOWN_SCHEME':
    'Unsupported link scheme. Use opencompare://compare?left=…&right=… only.',
  'shell.compare.error.UNKNOWN_ACTION':
    'Unknown link action "{action}". Only compare is supported.',
  'shell.compare.error.NOT_FOUND': 'The {side} path does not exist: {path}',
  'shell.compare.error.TYPE_MISMATCH':
    'The two sides differ in type: the left side is {leftKind} ({left}) and the right side is {rightKind} ({right}).',
  'shell.compare.error.UNSUPPORTED_FILE_TYPE':
    'Unsupported file type: {side} "{path}". Supported files are code/text, CSV/TSV and JSON/YAML.',
  'shell.compare.error.ACCESS_DENIED':
    'Cannot access the {side} path: {path} (permission denied or unreadable).'
}
