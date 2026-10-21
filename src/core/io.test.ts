import { describe, expect, it } from 'vitest'
import {
  DEFAULT_IO_CONCURRENCY,
  FileHandleExhaustedError,
  mapWithLimit,
  toReadableIoError
} from './io'

function codedError(code: string, message = `${code}: too many open files`): Error {
  return Object.assign(new Error(message), { code })
}

describe('bounded I/O concurrency', () => {
  it('keeps the default window inside the documented 8–16 range', () => {
    expect(DEFAULT_IO_CONCURRENCY).toBeGreaterThanOrEqual(8)
    expect(DEFAULT_IO_CONCURRENCY).toBeLessThanOrEqual(16)
  })

  it('bounds 5000 entries at the configured window and keeps input order', async () => {
    const items = Array.from({ length: 5000 }, (_, index) => index)
    let inFlight = 0
    let peak = 0

    const results = await mapWithLimit(items, { concurrency: 8 }, async (item) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      // Yield so concurrent workers overlap instead of finishing synchronously.
      await Promise.resolve()
      inFlight -= 1
      return item * 2
    })

    expect(peak).toBeLessThanOrEqual(8)
    expect(peak).toBeGreaterThan(1)
    expect(results).toHaveLength(5000)
    expect(results[0]).toBe(0)
    expect(results[4999]).toBe(9998)
    expect(results.every((value, index) => value === index * 2)).toBe(true)
  })

  it('honours an explicit lower window', async () => {
    let inFlight = 0
    let peak = 0

    const results = await mapWithLimit(
      Array.from({ length: 200 }, (_, index) => index),
      { concurrency: 2 },
      async (item) => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await Promise.resolve()
        inFlight -= 1
        return item
      }
    )

    expect(peak).toBeLessThanOrEqual(2)
    expect(results).toHaveLength(200)
  })

  it('stops starting work after the first failure and rejects with it', async () => {
    let started = 0
    const failure = codedError('EMFILE')

    await expect(
      mapWithLimit([1, 2, 3, 4, 5, 6], { concurrency: 2 }, async (item) => {
        started += 1
        if (item === 2) throw failure
        await Promise.resolve()
        return item
      })
    ).rejects.toBe(failure)

    // Only the two in-flight calls started; the remaining queue was not pulled.
    expect(started).toBe(2)
  })
})

describe('readable file-handle errors', () => {
  it('converts EMFILE and ENFILE into a readable error that keeps the code', () => {
    for (const code of ['EMFILE', 'ENFILE'] as const) {
      const converted = toReadableIoError(codedError(code))

      expect(converted).toBeInstanceOf(FileHandleExhaustedError)
      const error = converted as FileHandleExhaustedError
      expect(error.code).toBe(code)
      expect(error.message).toContain('文件句柄')
      expect(error.message).toContain(code)
    }
  })

  it('leaves unrelated failures untouched', () => {
    const denied = codedError('EACCES', 'EACCES: permission denied')
    expect(toReadableIoError(denied)).toBe(denied)
    expect(toReadableIoError('boom')).toBe('boom')
  })
})
