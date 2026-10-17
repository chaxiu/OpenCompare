import { describe, expect, it } from 'vitest'
import { splitLines } from './lines'

describe('splitLines', () => {
  it('splits LF text into lines', () => {
    expect(splitLines('alpha\nbeta')).toEqual(['alpha', 'beta'])
  })

  it('normalises CRLF and keeps a trailing empty line after a final newline', () => {
    expect(splitLines('alpha\r\nbeta\r\n')).toEqual(['alpha', 'beta', ''])
  })

  it('returns a single empty line for empty input', () => {
    expect(splitLines('')).toEqual([''])
  })
})
