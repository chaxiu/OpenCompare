import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { diffStructured } from './diff'
import { createStructuredLocator, locateStructuredPath } from './locate'
import type { SourceRange } from './locate'
import { StructuredParseError, parseStructured } from './parse'
import type { StructuredFormat } from './parse'

const FIXTURES = fileURLToPath(new URL('./__fixtures__/locate/', import.meta.url))

function fixture(name: string): string {
  return readFileSync(`${FIXTURES}${name}`, 'utf8')
}

function lineStarts(text: string): number[] {
  const starts = [0]
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1)
  }
  return starts
}

function offsetAt(starts: readonly number[], line: number, column: number): number {
  return starts[line - 1] + column - 1
}

/** Slices the original text using only the reported line / column numbers. */
function sliceOf(text: string, range: SourceRange): string {
  const starts = lineStarts(text)
  return text.slice(
    offsetAt(starts, range.startLine, range.startColumn),
    offsetAt(starts, range.endLine, range.endColumn) + 1
  )
}

function lineOf(text: string, needle: string): number {
  const index = text.split('\n').findIndex((line) => line.includes(needle))
  if (index < 0) throw new Error(`fixture line not found: ${needle}`)
  return index + 1
}

function isPointerPrefix(prefix: string, path: string): boolean {
  return prefix === '' || path === prefix || path.startsWith(`${prefix}/`)
}

describe('pointer unescaping', () => {
  it('maps escaped segments to their values in the source text', () => {
    const text = '{"a/b":1,"m~n":2,"~0":3,"~1":4}'

    for (const [path, value] of [
      ['/a~1b', '1'],
      ['/m~0n', '2'],
      ['/~00', '3'],
      ['/~01', '4']
    ] as const) {
      const hit = locateStructuredPath(text, 'json', path)
      expect(hit.exact).toBe(true)
      expect(hit.path).toBe(path)
      expect(sliceOf(text, hit)).toBe(value)
    }
  })
})

describe('JSON object members', () => {
  const text = [
    '// config',
    '{',
    '  "service": {',
    '    // name of the thing',
    '    "name": "opencompare",',
    '    "port": 8080',
    '  }',
    '}'
  ].join('\n')

  it('returns the value token, never the key token', () => {
    const hit = locateStructuredPath(text, 'json', '/service/name')

    expect(hit).toMatchObject({ exact: true, path: '/service/name' })
    expect(sliceOf(text, hit)).toBe('"opencompare"')
    expect(hit.startLine).toBe(5)
    expect(hit.startColumn).toBe(13)
    expect(hit.endLine).toBe(5)
    expect(hit.endColumn).toBe(25)
  })

  it('reports the value of a nested scalar member', () => {
    const hit = locateStructuredPath(text, 'json', '/service/port')
    expect(sliceOf(text, hit)).toBe('8080')
    expect(hit.startLine).toBe(6)
  })
})

describe('JSON container ranges', () => {
  const text = '{\n  "obj": {\n    "a": 1\n  },\n  "arr": [\n    1,\n    2\n  ]\n}'

  it('spans an object from its opening to its closing brace', () => {
    const hit = locateStructuredPath(text, 'json', '/obj')
    const slice = sliceOf(text, hit)

    expect(slice.startsWith('{')).toBe(true)
    expect(slice.endsWith('}')).toBe(true)
    expect(hit.startLine).toBe(2)
    expect(hit.endLine).toBe(4)
  })

  it('spans an array from its opening to its closing bracket', () => {
    const hit = locateStructuredPath(text, 'json', '/arr')
    const slice = sliceOf(text, hit)

    expect(slice.startsWith('[')).toBe(true)
    expect(slice.endsWith(']')).toBe(true)
    expect(hit.startLine).toBeLessThan(hit.endLine)
  })
})

describe('array indexes', () => {
  const text = '{"items":[10,20,30]}'

  it('selects the indexed element', () => {
    const hit = locateStructuredPath(text, 'json', '/items/1')
    expect(hit.exact).toBe(true)
    expect(sliceOf(text, hit)).toBe('20')
  })

  it('rejects non-canonical and out-of-range indexes by falling back to the array', () => {
    for (const path of ['/items/02', '/items/3']) {
      const hit = locateStructuredPath(text, 'json', path)
      expect(hit.exact).toBe(false)
      expect(hit.path).toBe('/items')
      expect(sliceOf(text, hit)).toBe('[10,20,30]')
    }
  })
})

describe('single-side nodes', () => {
  const leftText = '{\n  "a": {\n    "b": {\n      "x": 1\n    }\n  }\n}'
  const rightText = '{\n  "a": {\n    "b": {\n      "x": 1,\n      "c": "new"\n    }\n  }\n}'

  it('falls back to the deepest existing ancestor on the missing side', () => {
    const left = createStructuredLocator(leftText, 'json')
    const right = createStructuredLocator(rightText, 'json')

    const missing = left.locate('/a/b/c')
    expect(missing.exact).toBe(false)
    expect(missing.path).toBe('/a/b')
    expect(sliceOf(leftText, missing)).toBe('{\n      "x": 1\n    }')

    const present = right.locate('/a/b/c')
    expect(present.exact).toBe(true)
    expect(present.path).toBe('/a/b/c')
    expect(sliceOf(rightText, present)).toBe('"new"')
  })

  it('falls back to the document root when no ancestor exists', () => {
    const text = '{"a": 1}'
    const hit = locateStructuredPath(text, 'json', '/x/y')

    expect(hit).toMatchObject({ path: '', exact: false })
    expect(sliceOf(text, hit)).toBe('{"a": 1}')
  })

  it('treats a pointer without a leading slash as malformed', () => {
    const text = '{"a": 1}'
    const hit = locateStructuredPath(text, 'json', 'a')

    expect(hit).toMatchObject({ path: '', exact: false })
    expect(sliceOf(text, hit)).toBe('{"a": 1}')
  })
})

describe('root pointer', () => {
  it('spans the document value without leading comments, trailing comments or newline', () => {
    const text = '// head\n{\n  "a": 1\n}\n// tail\n\n'
    const hit = locateStructuredPath(text, 'json', '')

    expect(hit).toMatchObject({
      path: '',
      exact: true,
      startLine: 2,
      startColumn: 1,
      endLine: 4,
      endColumn: 1
    })
    expect(sliceOf(text, hit)).toBe('{\n  "a": 1\n}')
  })

  it('does not throw for a YAML document that only holds comments', () => {
    expect(() => createStructuredLocator('# only a comment\n', 'yaml')).not.toThrow()
  })
})

describe('YAML block mappings', () => {
  const text = fixture('yaml-left.yaml')
  const locator = createStructuredLocator(text, 'yaml')
  const levels = [
    ['/service', '"name": opencompare'],
    ['/service/features', 'limits:'],
    ['/service/features/limits', 'maxBytes:'],
    ['/service/features/limits/levels', 'tier:'],
    ['/service/features/limits/levels/tier', 'profile:'],
    ['/service/features/limits/levels/tier/profile', 'name: balanced'],
    ['/service/features/limits/levels/tier/profile/weights', '- 1'],
    ['/service/features/limits/levels/tier/profile/weights/2', '- 3']
  ] as const
  const lines = text.split('\n')

  function isNoiseLine(line: number): boolean {
    const trimmed = lines[line - 1].trim()
    return trimmed === '' || trimmed.startsWith('#')
  }

  it('reports real file lines for every level of an eight-deep block mapping', () => {
    for (const [path, needle] of levels) {
      const hit = locator.locate(path)
      expect(hit.exact).toBe(true)
      expect(hit.path).toBe(path)
      expect(hit.startLine).toBe(lineOf(text, needle))
      expect(isNoiseLine(hit.startLine)).toBe(false)
      expect(isNoiseLine(hit.endLine)).toBe(false)
    }
  })

  it('starts a block sequence at its first dash and ends at the last value character', () => {
    const hit = locator.locate('/service/features/limits/levels/tier/profile/weights')

    expect(hit.startLine).toBe(lineOf(text, '- 1'))
    expect(hit.endLine).toBe(lineOf(text, '- 3'))
    expect(sliceOf(text, hit)).toBe('- 1\n              - 2\n              - 3')
  })

  it('spans the document root without leading comments or trailing newline', () => {
    const hit = locator.locate('')

    expect(hit.exact).toBe(true)
    expect(hit.startLine).toBe(lineOf(text, 'service:'))
    expect(hit.endLine).toBe(lineOf(text, 'enabled: false'))
    expect(isNoiseLine(hit.startLine)).toBe(false)
    expect(isNoiseLine(hit.endLine)).toBe(false)
    expect(sliceOf(text, hit).startsWith('service:')).toBe(true)
  })
})

describe('YAML keys and block scalars', () => {
  const text = fixture('yaml-left.yaml')

  it('matches quoted keys by their unescaped value', () => {
    const name = locateStructuredPath(text, 'yaml', '/service/name')
    const version = locateStructuredPath(text, 'yaml', '/service/version')

    expect(name.exact).toBe(true)
    expect(sliceOf(text, name)).toBe('opencompare')
    expect(version.exact).toBe(true)
    expect(sliceOf(text, version)).toBe('2')
  })

  it('matches keys containing a colon or a space', () => {
    const yaml = 'map:\n  "a: b": 1\n  \'x y\': 2\n'

    for (const [path, value] of [
      ['/map/a: b', '1'],
      ['/map/x y', '2']
    ] as const) {
      const hit = locateStructuredPath(yaml, 'yaml', path)
      expect(hit.exact).toBe(true)
      expect(sliceOf(yaml, hit)).toBe(value)
    }
  })

  it('spans a literal block scalar from the indicator to its last content line', () => {
    const hit = locateStructuredPath(
      text,
      'yaml',
      '/service/features/limits/levels/tier/profile/banner'
    )
    const slice = sliceOf(text, hit)

    expect(hit.exact).toBe(true)
    expect(slice.split('\n')[0].trim()).toBe('|')
    expect(slice.trimEnd().endsWith('line two')).toBe(true)
    expect(slice).not.toContain('telemetry')
    expect(hit.startLine).toBe(lineOf(text, 'banner: |'))
    expect(hit.endLine).toBe(lineOf(text, 'line two'))
  })
})

describe('format noise independence', () => {
  const compact = '{"service":{"name":"opencompare","port":8080}}'
  const noisy = '{\n  // config\n  "service": {\n    "port": 8080,\n    "name": "opencompare",\n  },\n}\n'

  it('locates the same path in each text using that text’s own coordinates', () => {
    const compactHit = locateStructuredPath(compact, 'json', '/service/name')
    const noisyHit = locateStructuredPath(noisy, 'json', '/service/name')

    expect(sliceOf(compact, compactHit)).toBe('"opencompare"')
    expect(compactHit.startLine).toBe(1)
    expect(sliceOf(noisy, noisyHit)).toBe('"opencompare"')
    expect(noisyHit.startLine).toBe(5)
  })

  it('is unaffected by shuffled object key order', () => {
    const text = '{\n  "b": 1,\n  "a": {\n    "y": 2,\n    "x": 3\n  }\n}'
    const hit = locateStructuredPath(text, 'json', '/a/x')

    expect(hit.exact).toBe(true)
    expect(sliceOf(text, hit)).toBe('3')
  })
})

describe('parse parity with parseStructured', () => {
  it('accepts JSONC comments and trailing commas like parseStructured', () => {
    const text = '{\n  // note\n  "a": [1, 2,],\n}\n'

    expect(() => parseStructured(text, 'json')).not.toThrow()
    expect(() => createStructuredLocator(text, 'json')).not.toThrow()
    expect(sliceOf(text, locateStructuredPath(text, 'json', '/a/1'))).toBe('2')
  })

  it('accepts YAML comments and quoted keys like parseStructured', () => {
    const text = '# note\n"a: b": 1\n\n\'x y\': 2\n'

    expect(() => parseStructured(text, 'yaml')).not.toThrow()
    expect(() => createStructuredLocator(text, 'yaml')).not.toThrow()
    expect(sliceOf(text, locateStructuredPath(text, 'yaml', '/x y'))).toBe('2')
  })

  it('throws StructuredParseError for every sample parseStructured rejects', () => {
    const samples: ReadonlyArray<readonly [string, StructuredFormat]> = [
      ['{\n  "a" 1\n}', 'json'],
      ['a: 1\n b: 2\n', 'yaml'],
      ['a: 1\na: 2\n', 'yaml'],
      ['   \n', 'json']
    ]

    for (const [text, format] of samples) {
      expect(() => parseStructured(text, format)).toThrow(StructuredParseError)
      expect(() => createStructuredLocator(text, format)).toThrow(StructuredParseError)
    }
  })
})

function expectDiffPathsToResolve(leftText: string, rightText: string, format: StructuredFormat): void {
  const left = createStructuredLocator(leftText, format)
  const right = createStructuredLocator(rightText, format)
  const result = diffStructured(leftText, rightText, format)

  expect(result.entries.length).toBeGreaterThan(0)
  for (const entry of result.entries) {
    if (entry.left !== undefined) {
      const hit = left.locate(entry.path)
      expect(hit.exact, entry.path).toBe(true)
      expect(hit.path).toBe(entry.path)
    } else {
      const hit = left.locate(entry.path)
      expect(hit.exact, entry.path).toBe(false)
      expect(isPointerPrefix(hit.path, entry.path), `${hit.path} ⊄ ${entry.path}`).toBe(true)
    }
    if (entry.right !== undefined) {
      const hit = right.locate(entry.path)
      expect(hit.exact, entry.path).toBe(true)
      expect(hit.path).toBe(entry.path)
    } else {
      const hit = right.locate(entry.path)
      expect(hit.exact, entry.path).toBe(false)
      expect(isPointerPrefix(hit.path, entry.path), `${hit.path} ⊄ ${entry.path}`).toBe(true)
    }
  }
}

describe('diff paths resolve on real fixtures', () => {
  it('resolves every JSON diff entry on the side that owns it', () => {
    expectDiffPathsToResolve(fixture('json-left.json'), fixture('json-right.json'), 'json')
  })

  it('resolves every YAML diff entry on the side that owns it', () => {
    expectDiffPathsToResolve(fixture('yaml-left.yaml'), fixture('yaml-right.yaml'), 'yaml')
  })
})

describe('real fixtures', () => {
  const jsonLeft = fixture('json-left.json')
  const jsonRight = fixture('json-right.json')
  const yamlLeft = fixture('yaml-left.yaml')
  const yamlRight = fixture('yaml-right.yaml')

  it('locates JSON values at their real file lines', () => {
    const name = locateStructuredPath(jsonLeft, 'json', '/service/name')
    expect(sliceOf(jsonLeft, name)).toBe('"opencompare"')
    expect(name.startLine).toBe(lineOf(jsonLeft, '"name": "opencompare"'))

    const deep = locateStructuredPath(
      jsonLeft,
      'json',
      '/service/features/limits/levels/tier/profile/weights/2'
    )
    expect(deep.exact).toBe(true)
    expect(sliceOf(jsonLeft, deep)).toBe('3')
    expect(deep.startLine).toBe(lineOf(jsonLeft, 'weights'))
  })

  it('falls back to the parent for a JSON node that only the right side has', () => {
    const path = '/service/features/limits/levels/tier/profile/onlyRight'
    const missing = locateStructuredPath(jsonLeft, 'json', path)
    const present = locateStructuredPath(jsonRight, 'json', path)

    expect(missing.exact).toBe(false)
    expect(missing.path).toBe('/service/features/limits/levels/tier/profile')
    expect(present.exact).toBe(true)
    expect(present.path).toBe(path)
  })

  it('locates YAML values and block scalar content at their real file lines', () => {
    const onlyLeft = locateStructuredPath(
      yamlLeft,
      'yaml',
      '/service/features/limits/levels/tier/profile/onlyLeft'
    )
    expect(onlyLeft.exact).toBe(true)
    expect(sliceOf(yamlLeft, onlyLeft)).toBe('removed-on-right')

    const missing = locateStructuredPath(
      yamlRight,
      'yaml',
      '/service/features/limits/levels/tier/profile/onlyLeft'
    )
    expect(missing.exact).toBe(false)
    expect(missing.path).toBe('/service/features/limits/levels/tier/profile')

    const deep = locateStructuredPath(
      yamlRight,
      'yaml',
      '/service/features/limits/levels/tier/profile/onlyRight/deep'
    )
    expect(deep.exact).toBe(true)
    expect(sliceOf(yamlRight, deep)).toBe('added-on-right')
    expect(deep.startLine).toBe(lineOf(yamlRight, 'deep: added-on-right'))
  })
})

describe('locator reuse', () => {
  it('keeps a single locator stable across 100 alternating queries', () => {
    const locator = createStructuredLocator(fixture('yaml-left.yaml'), 'yaml')
    const paths = [
      '',
      '/service',
      '/service/features/limits/levels/tier/profile/weights/1',
      '/service/features/limits/levels/tier/profile/banner',
      '/service/features/limits/levels/tier/profile/onlyLeft',
      '/telemetry/enabled'
    ]
    const baseline = paths.map((path) => locator.locate(path))

    for (let round = 0; round < 100; round += 1) {
      for (let index = paths.length - 1; index >= 0; index -= 1) {
        expect(locator.locate(paths[index])).toEqual(baseline[index])
      }
    }
  })
})