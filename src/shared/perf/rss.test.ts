import { describe, expect, it } from 'vitest'
import { aggregateProcessRss } from './rss'

describe('aggregateProcessRss', () => {
  it('sums every process, takes the largest Tab and the Browser process', () => {
    const reading = aggregateProcessRss([
      { pid: 10, type: 'Browser', workingSetSize: 100_000 },
      { pid: 11, type: 'Tab', workingSetSize: 200_000 },
      { pid: 12, type: 'Tab', workingSetSize: 150_000 },
      { pid: 13, type: 'Utility', workingSetSize: 50_000 },
      { pid: 14, type: 'GPU', workingSetSize: 25_000 }
    ])

    expect(reading.rss.main).toBe(100_000 * 1024)
    expect(reading.rss.renderer).toBe(200_000 * 1024)
    expect(reading.rss.appTotal).toBe((100_000 + 200_000 + 150_000 + 50_000 + 25_000) * 1024)
    expect(reading.pids).toEqual({ renderer: 11, main: 10 })
  })

  it('reports zero renderer when no Tab process is listed', () => {
    const reading = aggregateProcessRss([
      { pid: 10, type: 'Browser', workingSetSize: 1000 },
      { pid: 11, type: 'Utility', workingSetSize: 500 }
    ])
    expect(reading.rss.renderer).toBe(0)
    expect(reading.pids.renderer).toBeNull()
  })

  it('ignores non-finite and negative working sets instead of corrupting totals', () => {
    const reading = aggregateProcessRss([
      { pid: 10, type: 'Browser', workingSetSize: 1000 },
      { pid: 11, type: 'Tab', workingSetSize: Number.NaN },
      { pid: 12, type: 'Tab', workingSetSize: -5 },
      { pid: 13, type: 'Utility', workingSetSize: Number.POSITIVE_INFINITY }
    ])
    expect(reading.rss.appTotal).toBe(1024 * 1000)
    expect(reading.rss.renderer).toBe(0)
  })
})
