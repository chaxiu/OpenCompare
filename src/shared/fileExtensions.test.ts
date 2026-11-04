import { describe, expect, it } from 'vitest'
import { extensionFamily, fileExtension, resolveFileFamily } from './fileExtensions'

describe('extensionFamily', () => {
  it('maps every known extension to its family', () => {
    expect(extensionFamily('engine.ts')).toBe('code')
    expect(extensionFamily('a.csv')).toBe('csv')
    expect(extensionFamily('a.tsv')).toBe('tsv')
    expect(extensionFamily('a.JSON')).toBe('json')
    expect(extensionFamily('a.yml')).toBe('yaml')
  })

  it('treats extension-less names and dotfiles as code', () => {
    for (const name of ['Makefile', '.gitignore', 'LICENSE']) {
      expect(extensionFamily(name)).toBe('code')
    }
    expect(fileExtension('.gitignore')).toBe('')
  })

  it('returns null for an unknown extension so content decides', () => {
    expect(extensionFamily('a.vue')).toBeNull()
    expect(extensionFamily('a.bin')).toBeNull()
  })
})

describe('resolveFileFamily', () => {
  it('opens unknown-extension text as plain code', () => {
    expect(resolveFileFamily('a.vue', 'text')).toBe('code')
    expect(resolveFileFamily('a.bin', 'text')).toBe('code')
  })

  it('rejects unknown-extension binary content', () => {
    expect(resolveFileFamily('a.vue', 'binary')).toBeNull()
  })

  it('ignores content once the extension is known', () => {
    expect(resolveFileFamily('a.ts', 'binary')).toBe('code')
    expect(resolveFileFamily('a.csv', 'binary')).toBe('csv')
  })
})
