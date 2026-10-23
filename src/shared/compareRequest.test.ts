import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  parseCompareArgv,
  parseCompareUrl,
  parseManualPaths,
  resolveCompareRequest,
  toDisplayPath
} from './compareRequest'
import type { CompareErrorCode, PathProbe } from './compareRequest'
import type { PathProbeKind } from './platform/types'

const ERROR_CODES: readonly CompareErrorCode[] = [
  'MISSING_SIDE',
  'DUPLICATE_SIDE',
  'EMPTY_PATH',
  'UNKNOWN_SCHEME',
  'UNKNOWN_ACTION',
  'NOT_FOUND',
  'TYPE_MISMATCH',
  'UNSUPPORTED_FILE_TYPE',
  'ACCESS_DENIED'
]

function staticProbe(kinds: Record<string, PathProbeKind>): {
  readonly probe: PathProbe
  readonly calls: string[]
} {
  const calls: string[] = []
  return {
    calls,
    probe: {
      statPath: async (path) => {
        calls.push(path)
        return kinds[path] ?? 'missing'
      }
    }
  }
}

describe('opencompare://compare URL', () => {
  it('percent-decodes both sides and keeps spaces and Chinese intact', () => {
    const parsed = parseCompareUrl(
      'opencompare://compare?left=%2Ftmp%2F%E4%B8%AD%E6%96%87%20a.txt&right=%2Ftmp%2F%E4%B8%AD%E6%96%87%20b.txt'
    )

    expect(parsed).toEqual({
      ok: true,
      paths: { left: '/tmp/中文 a.txt', right: '/tmp/中文 b.txt' }
    })
  })

  it('turns + into a space and decodes emoji without throwing', () => {
    const parsed = parseCompareUrl(
      'opencompare://compare?left=%2Ftmp%2Fa+b%F0%9F%98%80.txt&right=%2Ftmp%2Fc+d.txt'
    )

    expect(parsed).toEqual({
      ok: true,
      paths: { left: '/tmp/a b😀.txt', right: '/tmp/c d.txt' }
    })
  })

  it('rejects a missing right side and names the side', () => {
    const parsed = parseCompareUrl('opencompare://compare?left=%2Ftmp%2Fa.txt')

    expect(parsed.ok).toBe(false)
    if (parsed.ok) throw new Error('expected failure')
    expect(parsed.error.code).toBe('MISSING_SIDE')
    expect(parsed.error.message).toContain('右侧')
  })

  it('rejects a missing left side symmetrically', () => {
    const parsed = parseCompareUrl('opencompare://compare?right=%2Ftmp%2Fb.txt')

    expect(parsed.ok).toBe(false)
    if (parsed.ok) throw new Error('expected failure')
    expect(parsed.error.code).toBe('MISSING_SIDE')
    expect(parsed.error.message).toContain('左侧')
  })

  it('rejects a duplicated side before decoding it', () => {
    const parsed = parseCompareUrl('opencompare://compare?left=a&left=b&right=c')

    expect(parsed.ok).toBe(false)
    if (parsed.ok) throw new Error('expected failure')
    expect(parsed.error.code).toBe('DUPLICATE_SIDE')
    expect(parsed.error.message).toContain('左侧')
  })

  it('distinguishes an unknown scheme from an unknown action', () => {
    const wrongScheme = parseCompareUrl('https://example.com/compare?left=/tmp/a&right=/tmp/b')
    const wrongAction = parseCompareUrl('opencompare://merge?left=/tmp/a&right=/tmp/b')

    expect(wrongScheme.ok).toBe(false)
    if (!wrongScheme.ok) expect(wrongScheme.error.code).toBe('UNKNOWN_SCHEME')
    expect(wrongAction.ok).toBe(false)
    if (!wrongAction.ok) expect(wrongAction.error.code).toBe('UNKNOWN_ACTION')
  })

  it('normalises the decoded values with the explicit context', () => {
    const parsed = parseCompareUrl(
      'opencompare://compare?left=~%2F%E9%A1%B9%E7%9B%AE%2Fa.txt&right=.%2Fb.txt',
      { homeDir: '/Users/demo', baseDir: '/work/项目' }
    )

    expect(parsed).toEqual({
      ok: true,
      paths: { left: '/Users/demo/项目/a.txt', right: '/work/项目/b.txt' }
    })
  })
})

describe('launch arguments', () => {
  it('parses --left/--right and their = forms identically', () => {
    const separate = parseCompareArgv(['--left', '/tmp/a b.txt', '--right', '/tmp/中文.txt'])
    const equals = parseCompareArgv(['--left=/tmp/a b.txt', '--right=/tmp/中文.txt'])

    expect(separate).toEqual(equals)
    expect(separate).toEqual({
      ok: true,
      paths: { left: '/tmp/a b.txt', right: '/tmp/中文.txt' }
    })
  })

  it('ignores the executable and unrelated Chromium/Electron switches', () => {
    const parsed = parseCompareArgv([
      '/Applications/OpenCompare.app/Contents/MacOS/OpenCompare',
      '--inspect=5858',
      '--no-sandbox',
      '--left=/tmp/a%.txt',
      '--right=/tmp/中文.txt'
    ])

    expect(parsed).toEqual({
      ok: true,
      paths: { left: '/tmp/a%.txt', right: '/tmp/中文.txt' }
    })
  })

  it('uses exactly two bare positionals as the pair', () => {
    expect(parseCompareArgv(['/tmp/a.txt', '/tmp/b.txt'])).toEqual({
      ok: true,
      paths: { left: '/tmp/a.txt', right: '/tmp/b.txt' }
    })

    const single = parseCompareArgv(['/tmp/a.txt'])
    expect(single.ok).toBe(false)
    if (!single.ok) expect(single.error.code).toBe('MISSING_SIDE')
  })

  it('tolerates the executable path in a bare pair', () => {
    expect(parseCompareArgv(['/usr/local/bin/electron', '/tmp/a.txt', '/tmp/b.txt'])).toEqual({
      ok: true,
      paths: { left: '/tmp/a.txt', right: '/tmp/b.txt' }
    })
  })

  it('rejects duplicated and empty side flags', () => {
    const duplicated = parseCompareArgv(['--left', 'a', '--left', 'b', '--right', 'c'])
    expect(duplicated.ok).toBe(false)
    if (!duplicated.ok) {
      expect(duplicated.error.code).toBe('DUPLICATE_SIDE')
      expect(duplicated.error.message).toContain('左侧')
    }

    const empty = parseCompareArgv(['--left=', '--right=b'])
    expect(empty.ok).toBe(false)
    if (!empty.ok) {
      expect(empty.error.code).toBe('EMPTY_PATH')
      expect(empty.error.message).toContain('左侧')
    }
  })

  it('never throws on malformed argument lists', () => {
    const malformed = [null, undefined, 42, ['--left', null, '--right', 7]] as unknown as string[][]

    for (const argv of malformed) {
      expect(() => parseCompareArgv(argv)).not.toThrow()
    }
  })
})

describe('manual paths', () => {
  it('strips paired ASCII and curly quotes', () => {
    expect(parseManualPaths('"/tmp/dir with space"', "'/tmp/中文'")).toEqual({
      ok: true,
      paths: { left: '/tmp/dir with space', right: '/tmp/中文' }
    })
    expect(parseManualPaths('“/tmp/中文”', '‘/tmp/另一个’')).toEqual({
      ok: true,
      paths: { left: '/tmp/中文', right: '/tmp/另一个' }
    })
  })

  it('keeps inner and unpaired quotes', () => {
    expect(parseManualPaths('"/tmp/a"b.txt"', '/tmp/a"')).toEqual({
      ok: true,
      paths: { left: '/tmp/a"b.txt', right: '/tmp/a"' }
    })
  })

  it('trims outer whitespace but keeps inner runs', () => {
    expect(parseManualPaths('  /tmp/a.txt  ', '\t/tmp/b  c.txt\n')).toEqual({
      ok: true,
      paths: { left: '/tmp/a.txt', right: '/tmp/b  c.txt' }
    })
  })

  it('reports EMPTY_PATH for blank sides, left first', () => {
    const leftBlank = parseManualPaths('   ', '/tmp/b.txt')
    expect(leftBlank.ok).toBe(false)
    if (!leftBlank.ok) {
      expect(leftBlank.error.code).toBe('EMPTY_PATH')
      expect(leftBlank.error.message).toContain('左侧')
    }

    const rightBlank = parseManualPaths('/tmp/a.txt', ' \t\n ')
    expect(rightBlank.ok).toBe(false)
    if (!rightBlank.ok) {
      expect(rightBlank.error.code).toBe('EMPTY_PATH')
      expect(rightBlank.error.message).toContain('右侧')
    }
  })

  it('expands ~ and ~/… but not ~user', () => {
    const context = { homeDir: '/Users/demo' }

    expect(parseManualPaths('~/项目/a.txt', '~', context)).toEqual({
      ok: true,
      paths: { left: '/Users/demo/项目/a.txt', right: '/Users/demo' }
    })
    expect(parseManualPaths('~other/x', '/tmp/y', context)).toEqual({
      ok: true,
      paths: { left: '~other/x', right: '/tmp/y' }
    })
  })

  it('resolves relative paths against baseDir and folds segments', () => {
    const context = { baseDir: '/work/项目' }

    expect(parseManualPaths('./a.txt', '../b/c.txt', context)).toEqual({
      ok: true,
      paths: { left: '/work/项目/a.txt', right: '/work/b/c.txt' }
    })
    expect(parseManualPaths('a/../b', '/absolute/./c/', context)).toEqual({
      ok: true,
      paths: { left: '/work/项目/b', right: '/absolute/c' }
    })
  })

  it('drops trailing separators, keeps root, case and Unicode code points', () => {
    const decomposed = '/tmp/e\u0301.txt'

    expect(parseManualPaths('/tmp/dir/', '/', {})).toEqual({
      ok: true,
      paths: { left: '/tmp/dir', right: '/' }
    })
    expect(parseManualPaths('/Tmp/MixedCase', decomposed)).toEqual({
      ok: true,
      paths: { left: '/Tmp/MixedCase', right: decomposed }
    })
  })

  it('never throws on non-string input', () => {
    expect(() => parseManualPaths(null as unknown as string, undefined as unknown as string)).not.toThrow()
  })
})

describe('resolveCompareRequest', () => {
  it('accepts a supported file pair and probes each side once', async () => {
    const { probe, calls } = staticProbe({ '/tmp/a.txt': 'file', '/tmp/b.json': 'file' })

    const result = await resolveCompareRequest(
      { left: '/tmp/a.txt', right: '/tmp/b.json' },
      { probe }
    )

    expect(result).toEqual({
      ok: true,
      request: { left: '/tmp/a.txt', right: '/tmp/b.json', kind: 'file' }
    })
    expect(calls).toEqual(['/tmp/a.txt', '/tmp/b.json'])
  })

  it('accepts extension-less files', async () => {
    const { probe } = staticProbe({ '/tmp/Makefile': 'file', '/tmp/README': 'file' })

    const result = await resolveCompareRequest(
      { left: '/tmp/Makefile', right: '/tmp/README' },
      { probe }
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.request.kind).toBe('file')
  })

  it('accepts a directory pair and probes each side once', async () => {
    const { probe, calls } = staticProbe({ '/tmp/left': 'directory', '/tmp/right': 'directory' })

    const result = await resolveCompareRequest(
      { left: '/tmp/left', right: '/tmp/right' },
      { probe }
    )

    expect(result).toEqual({
      ok: true,
      request: { left: '/tmp/left', right: '/tmp/right', kind: 'directory' }
    })
    expect(calls).toHaveLength(2)
  })

  it('reports NOT_FOUND with the side and its path', async () => {
    const { probe } = staticProbe({ '/tmp/a.txt': 'file' })

    const result = await resolveCompareRequest(
      { left: '/tmp/a.txt', right: '/tmp/missing.txt' },
      { probe }
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error.code).toBe('NOT_FOUND')
    expect(result.error.message).toContain('右侧')
    expect(result.error.message).toContain('/tmp/missing.txt')

    const leftMissing = staticProbe({ '/tmp/b.txt': 'file' })
    const symmetric = await resolveCompareRequest(
      { left: '/tmp/missing.txt', right: '/tmp/b.txt' },
      { probe: leftMissing.probe }
    )
    expect(symmetric.ok).toBe(false)
    if (!symmetric.ok) {
      expect(symmetric.error.code).toBe('NOT_FOUND')
      expect(symmetric.error.message).toContain('左侧')
    }
  })

  it('rejects a file/directory pair with TYPE_MISMATCH naming both sides', async () => {
    const { probe } = staticProbe({ '/tmp/a.txt': 'file', '/tmp/folder': 'directory' })

    const result = await resolveCompareRequest(
      { left: '/tmp/a.txt', right: '/tmp/folder' },
      { probe }
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error.code).toBe('TYPE_MISMATCH')
    expect(result.error.message).toContain('/tmp/a.txt')
    expect(result.error.message).toContain('/tmp/folder')
  })

  it('rejects unsupported file families and lists the supported ones', async () => {
    const { probe } = staticProbe({ '/tmp/a.bin': 'file', '/tmp/b.exe': 'file' })

    const result = await resolveCompareRequest({ left: '/tmp/a.bin', right: '/tmp/b.exe' }, { probe })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error.code).toBe('UNSUPPORTED_FILE_TYPE')
    expect(result.error.message).toContain('代码/文本')
    expect(result.error.message).toContain('CSV/TSV')
    expect(result.error.message).toContain('JSON/YAML')
  })

  it('matches extensions case-insensitively', async () => {
    const { probe } = staticProbe({ '/tmp/A.TXT': 'file', '/tmp/B.Json': 'file' })

    const result = await resolveCompareRequest({ left: '/tmp/A.TXT', right: '/tmp/B.Json' }, { probe })

    expect(result.ok).toBe(true)
  })

  it('maps probe failures to ACCESS_DENIED without leaking the exception', async () => {
    const denied: PathProbe = {
      statPath: async () => {
        throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
      }
    }

    const result = await resolveCompareRequest(
      { left: '/tmp/a.txt', right: '/tmp/b.txt' },
      { probe: denied }
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error.code).toBe('ACCESS_DENIED')
    expect(result.error.message).toContain('左侧')
    expect(result.error.message).not.toContain('EACCES')
  })

  it('returns EMPTY_PATH before probing, left side first', async () => {
    const { probe, calls } = staticProbe({})

    const leftEmpty = await resolveCompareRequest({ left: '  ', right: '/tmp/b' }, { probe })
    expect(leftEmpty.ok).toBe(false)
    if (!leftEmpty.ok) {
      expect(leftEmpty.error.code).toBe('EMPTY_PATH')
      expect(leftEmpty.error.message).toContain('左侧')
    }

    const rightEmpty = await resolveCompareRequest({ left: '/tmp/a', right: '""' }, { probe })
    expect(rightEmpty.ok).toBe(false)
    if (!rightEmpty.ok) {
      expect(rightEmpty.error.code).toBe('EMPTY_PATH')
      expect(rightEmpty.error.message).toContain('右侧')
    }
    expect(calls).toHaveLength(0)
  })

  it('follows the frozen precedence NOT_FOUND → TYPE_MISMATCH → UNSUPPORTED', async () => {
    const missingRight = staticProbe({ '/tmp/a.bin': 'file' })
    const notFound = await resolveCompareRequest(
      { left: '/tmp/a.bin', right: '/tmp/missing' },
      { probe: missingRight.probe }
    )
    expect(notFound.ok).toBe(false)
    if (!notFound.ok) expect(notFound.error.code).toBe('NOT_FOUND')

    const mismatched = staticProbe({ '/tmp/a.bin': 'file', '/tmp/folder': 'directory' })
    const mismatch = await resolveCompareRequest(
      { left: '/tmp/a.bin', right: '/tmp/folder' },
      { probe: mismatched.probe }
    )
    expect(mismatch.ok).toBe(false)
    if (!mismatch.ok) expect(mismatch.error.code).toBe('TYPE_MISMATCH')
  })

  it('normalises relative paths with the resolve context', async () => {
    const { probe } = staticProbe({ '/work/项目/a.txt': 'file', '/work/b.txt': 'file' })

    const result = await resolveCompareRequest(
      { left: './a.txt', right: '../b.txt' },
      { probe, baseDir: '/work/项目' }
    )

    expect(result).toEqual({
      ok: true,
      request: { left: '/work/项目/a.txt', right: '/work/b.txt', kind: 'file' }
    })
  })

  it('always returns a non-empty Chinese message with a known code', async () => {
    const inputs: Array<{ left: string; right: string }> = [
      { left: '', right: '' },
      { left: '/nope', right: '/nope2' }
    ]

    for (const input of inputs) {
      const result = await resolveCompareRequest(input, { probe: staticProbe({}).probe })
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(ERROR_CODES).toContain(result.error.code)
      expect(result.error.message.length).toBeGreaterThan(0)
      expect(result.error.message).toMatch(/[\u4e00-\u9fff]/)
    }
  })
})

describe('Windows absolute paths', () => {
  it('treats drive-letter paths as absolute and rewrites separators', () => {
    // ac-win-drive-absolute
    expect(
      parseManualPaths('C:\\path\\to\\file1', 'C:\\path\\to\\file2', { baseDir: 'C:\\path\\to' })
    ).toEqual({
      ok: true,
      paths: { left: 'C:/path/to/file1', right: 'C:/path/to/file2' }
    })
  })

  it('keeps a lowercase drive letter and accepts the forward-slash form', () => {
    // ac-win-lowercase-drive
    expect(parseManualPaths('c:/path/to/file2', 'C:\\a', { baseDir: 'C:\\path\\to' })).toEqual({
      ok: true,
      paths: { left: 'c:/path/to/file2', right: 'C:/a' }
    })
  })

  it('keeps a drive root and never folds .. above it', () => {
    // ac-win-drive-root
    expect(parseManualPaths('C:\\', 'C:\\a', { baseDir: 'C:\\path\\to' })).toEqual({
      ok: true,
      paths: { left: 'C:/', right: 'C:/a' }
    })
    expect(parseManualPaths('..\\..\\x', 'C:\\a', { baseDir: 'C:\\' })).toEqual({
      ok: true,
      paths: { left: 'C:/x', right: 'C:/a' }
    })
  })

  it('treats UNC paths as absolute and never folds above the share root', () => {
    // ac-unc-absolute
    expect(
      parseManualPaths('\\\\server\\share\\dir\\a.txt', '\\\\server\\share\\dir\\b.txt', {
        baseDir: 'C:\\path\\to'
      })
    ).toEqual({
      ok: true,
      paths: { left: '//server/share/dir/a.txt', right: '//server/share/dir/b.txt' }
    })
    expect(parseManualPaths('\\\\server\\share\\..\\c.txt', '\\\\server\\share\\d.txt')).toEqual({
      ok: true,
      paths: { left: '//server/share/c.txt', right: '//server/share/d.txt' }
    })
  })

  it('normalises a Windows flag pair from argv', () => {
    // ac-argv-windows-pair
    expect(
      parseCompareArgv(['--left', 'C:\\a', '--right', 'C:\\b'], { baseDir: 'C:\\path\\to' })
    ).toEqual({ ok: true, paths: { left: 'C:/a', right: 'C:/b' } })
  })

  it('resolves a relative Windows path against a Windows baseDir', () => {
    // ac-cwd-windows-mixed
    const parsed = parseManualPaths('C:\\path\\to\\file1', 'sub\\file2', {
      baseDir: 'C:\\path\\to'
    })

    expect(parsed).toEqual({
      ok: true,
      paths: { left: 'C:/path/to/file1', right: 'C:/path/to/sub/file2' }
    })
    if (parsed.ok) {
      expect(parsed.paths.left).not.toBe('C:/path/to/C:/path/to/file1')
      expect(parsed.paths.right).not.toBe('C:/path/to/C:/path/to/sub/file2')
    }
  })

  it('normalises Windows paths handed over through the URL entry point', () => {
    // ac-url-windows-encoded
    expect(
      parseCompareUrl(
        'opencompare://compare?left=C%3A%5Cpath%5Cto%5Ca.txt&right=%5C%5Cserver%5Cshare%5Cb.txt',
        { baseDir: 'C:\\cwd' }
      )
    ).toEqual({ ok: true, paths: { left: 'C:/path/to/a.txt', right: '//server/share/b.txt' } })
  })

  it('emits the canonical / form for every accepted Windows input', () => {
    // ac-canonical-output-slash
    const results = [
      parseManualPaths('C:\\path\\to\\file1', 'c:/path/to/file2', { baseDir: 'C:\\path\\to' }),
      parseManualPaths('\\\\server\\share\\dir\\a.txt', 'C:\\', { baseDir: 'C:\\' }),
      parseCompareArgv(['--left', 'C:\\a\\..\\b', '--right', '\\\\server\\share\\c']),
      parseCompareUrl('opencompare://compare?left=C%3A%5Ca&right=%5C%5Cserver%5Cshare%5Cb')
    ]

    for (const result of results) {
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      expect(result.paths.left).not.toContain('\\')
      expect(result.paths.right).not.toContain('\\')
    }
  })

  it('folds .. on both Windows and POSIX roots', () => {
    // ac-fold-dotdot
    expect(parseManualPaths('C:/a/../b', '/a/../../b', { baseDir: 'C:\\cwd' })).toEqual({
      ok: true,
      paths: { left: 'C:/b', right: '/b' }
    })
  })

  it('renders the canonical form with the platform separator on request', () => {
    // ac-display-per-platform
    expect(toDisplayPath('C:/path/to/file1', 'win32')).toBe('C:\\path\\to\\file1')
    expect(toDisplayPath('//server/share/dir/a.txt', 'win32')).toBe(
      '\\\\server\\share\\dir\\a.txt'
    )
    expect(toDisplayPath('C:/', 'win32')).toBe('C:\\')
    expect(toDisplayPath('C:/a', 'darwin')).toBe('C:/a')
    expect(toDisplayPath('C:/a', 'linux')).toBe('C:/a')
  })

  it('echoes error paths with the separator of the caller platform', async () => {
    // ac-error-echo-platform
    const windows = await resolveCompareRequest(
      { left: 'C:\\missing', right: 'C:\\b' },
      { probe: staticProbe({}).probe, baseDir: 'C:\\', platform: 'win32' }
    )

    expect(windows.ok).toBe(false)
    if (!windows.ok) {
      expect(windows.error.code).toBe('NOT_FOUND')
      expect(windows.error.message).toContain('C:\\missing')
    }

    const canonical = await resolveCompareRequest(
      { left: 'C:\\missing', right: 'C:\\b' },
      { probe: staticProbe({}).probe, baseDir: 'C:\\' }
    )

    expect(canonical.ok).toBe(false)
    if (!canonical.ok) {
      expect(canonical.error.code).toBe('NOT_FOUND')
      expect(canonical.error.message).toContain('C:/missing')
      expect(canonical.error.message).not.toContain('C:\\missing')
    }
  })

  it('shares one normalizer across the manual and argv entry points', () => {
    // ac-single-normalizer
    const context = { baseDir: 'C:\\path\\to' }

    expect(parseManualPaths('C:\\a', 'C:\\b', context)).toEqual(
      parseCompareArgv(['--left', 'C:\\a', '--right', 'C:\\b'], context)
    )

    for (const name of ['../main/launch.ts', '../renderer/src/workbench/NewCompareDialog.tsx']) {
      const source = readFileSync(new URL(name, import.meta.url), 'utf8')
      expect(source).toMatch(/from '(?:@shared\/compareRequest|\.\.\/shared\/compareRequest)'/)
      // No self-written separator rewriting or second normalizer: both entry
      // points hand the raw strings to this module only.
      expect(source).not.toContain('\\')
    }
  })
})

describe('shared purity', () => {
  it('does not import Electron, React, Node or DOM modules', () => {
    const sources = ['./compareRequest.ts', './fileExtensions.ts'].map((name) =>
      readFileSync(new URL(name, import.meta.url), 'utf8')
    )
    const forbidden = [/^electron/, /^react/, /^node:/, /^fs$/, /^path$/, /^os$/]
    const specifiers = sources.flatMap((source) =>
      [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
    )

    expect(specifiers.length).toBeGreaterThan(0)
    for (const specifier of specifiers) {
      expect(forbidden.some((pattern) => pattern.test(specifier))).toBe(false)
    }
  })
})
