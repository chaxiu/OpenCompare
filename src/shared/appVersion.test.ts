import { describe, expect, it } from 'vitest'
import pkg from '../../package.json'
import { APP_VERSION } from './appVersion'

describe('APP_VERSION', () => {
  it('is the root package.json version', () => {
    expect(APP_VERSION).toBe(pkg.version)
  })

  it('is a plain semver string', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
  })
})
