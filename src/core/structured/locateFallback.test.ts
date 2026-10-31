import { describe, expect, it } from 'vitest'
import { createStructuredLocator, locateStructuredPath } from './locate'
import { classifySourceRange } from './locateFallback'

describe('source range classification', () => {
  it('classifies a real hit as exact', () => {
    const text = '// head\n{\n  "service": {\n    "name": "opencompare"\n  }\n}\n'

    for (const path of ['', '/service', '/service/name']) {
      const hit = locateStructuredPath(text, 'json', path)
      expect(hit.exact, path).toBe(true)
      expect(classifySourceRange(hit), path).toBe('exact')
    }
  })

  it('classifies a fallback to the document root as an ancestor at the root’s first line', () => {
    const text = '// head\n{\n  "a": 1\n}\n'
    const hit = locateStructuredPath(text, 'json', '/x/y')

    expect(hit.exact).toBe(false)
    expect(hit.path).toBe('')
    expect(classifySourceRange(hit)).toBe('ancestor')
    expect(hit.startLine).toBe(2)

    const compact = locateStructuredPath('{"a":1}', 'json', '/x/y')
    expect(compact).toMatchObject({ path: '', exact: false, startLine: 1 })
    expect(classifySourceRange(compact)).toBe('ancestor')
  })

  it('classifies a deeper ancestor fallback with the ancestor’s own first line', () => {
    const text = ['{', '  "a": {', '    "b": 1', '  },', '  "same": 1', '}'].join('\n')
    const hit = createStructuredLocator(text, 'json').locate('/a/c')

    expect(hit.exact).toBe(false)
    expect(hit.path).toBe('/a')
    expect(classifySourceRange(hit)).toBe('ancestor')
    expect(hit.startLine).toBe(2)
  })

  it('keeps a one-character document root usable although its span is 1:1', () => {
    const hit = locateStructuredPath('1', 'json', '/x')

    expect(hit.exact).toBe(false)
    expect(hit).toMatchObject({ startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 })
    expect(classifySourceRange(hit)).toBe('ancestor')
  })
})

describe('side without a document root', () => {
  const text = '# only a comment\n'
  const locator = createStructuredLocator(text, 'yaml')

  it('classifies any path as none and never throws', () => {
    for (const path of ['/a', '/a/b', '/0']) {
      const hit = locator.locate(path)
      expect(hit.exact, path).toBe(false)
      expect(classifySourceRange(hit), path).toBe('none')
    }
  })

  it('keeps the placeholder root range unusable even though it reports exact', () => {
    const hit = locator.locate('')

    expect(hit.exact).toBe(true)
    expect(hit.hasSpan).toBe(false)
    expect(classifySourceRange(hit)).toBe('none')
  })
})
